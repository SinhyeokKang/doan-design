import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { query, type EffortLevel, type PermissionResult, type PermissionUpdate, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { openAcp } from "./acpRunner";
import { CodexDispatcher, RpcError } from "./dispatcher";
import { codexInitialize, codexThreadStart, type HandshakeReply, type HandshakeVerdict } from "./handshake";
import { afterTurnCleanup, listProcesses, OwnedGroup, ownProtocolProcess } from "./process";
import { readRegularFileNoFollowSync } from "../regularFile";
import { object } from "./sessions";
import { applyClaudeFastUnavailable, parseClaudeModels, parseCodexModels } from "./models";
import { allowedCommands, parseClaudeCommands, parseClaudeSkills, parseCodexSkills } from "./skills";
import { claudeBoundary } from "./commandRecords";
import { commandName, commandRequest } from "./providerCommands";
import { CodexStartupWatch, codexProfileServers } from "./mcpStartup";
import { connectorLabels } from "../mcpConnectors/presets";
import { backgroundTasks, claudeSessionLost, CLAUDE_QUESTION_TOOL, claudePermissionRequest, claudeQuestion, claudeQuestionResult, claudeModeReport, claudeUnansweredSupport, endPromptWait, endSteerWait, endTransport, initialTransport, normalizeClaude, promptTransport, steerTransport, storedAnswers, transportError, type ClaudeQuestion } from "./transport";
import { questionAnswer } from "./questionAnswer";
import { promptSuggestionText } from "./promptSuggestion";
import { claudePermission, codexDefaults, codexPluginNames, codexServerNames, codexWorkspace, type CodexDefaults, type CodexWorkspace } from "./permissionMode";
import { codexMechanism, codexProfileArgs, codexTurnPermission, fenceArgs, fencedCommand, sandboxRefused } from "../agentAuth/fence";
import type { OpenRunner, Prepared, ReadListing, ReadModels, Runner } from "./service";
import type { EventPayload, FailureCode, SkillSummary } from "./types";
// steerConsumed: the agent read a steered message, called in line with the run's events so the message
// takes its place in the thread there.
export interface SteerHooks { steerConsumed?: (messageId: string) => void }
// steer adds a message to the running turn turnId and resolves once the provider accepted it. Rejects: not_running
// (no such running turn), RpcError (Codex refused it), "RPC timeout" or "process_exited" (no answer).
export interface SteeringRunner extends Runner { steer(prompt: string, turnId: string, messageId: string): Promise<void> }
export const openRunner: OpenRunner = (input, emit, exited, registerStop) =>
  input.runtime === "claude" ? openClaude(input, emit, exited, registerStop) : input.runtime === "codex" ? openCodex(input, emit, exited, registerStop) : openAcp(input, emit, exited, registerStop);
// Opens the provider only to read its model list for this folder: no prompt; the caller owns the lease and the stop.
// A Claude read asks for Fast, so initialize names an account-wide Fast reason, not always sdk_opt_in_required.
export const listModels: ReadModels = async (input, exited, registerStop) => {
  const runner = await (input.runtime === "claude" ? openClaude : input.runtime === "codex" ? openCodexList : openAcp)(input.runtime === "claude" ? { ...input, fast: true } : input, () => {}, exited, registerStop);
  try { return await runner.models!(); } finally { await runner.close(); }
};
// The same prompt-free read for the folder's project skills, then the built-in commands Doan runs at the installed
// version (skills.ts allowedCommands). ACP command lists name no source or no skills, and come only with a session.
export const listSkills: ReadListing<SkillSummary[]> = async (input, exited, registerStop) => {
  if (input.runtime !== "claude" && input.runtime !== "codex") throw new Error("runtime_unsupported");
  const runner = await (input.runtime === "claude" ? openClaude : openCodexList)(input, () => {}, exited, registerStop);
  try { return await runner.skills!(); } finally { await runner.close(); }
};
// Fast for a Claude run: the flag-tier setting, since an SDK run is off with sdk_opt_in_required otherwise, even with
// fastMode in the project's .claude/settings.json. A run without Fast passes nothing.
export function claudeFastSettings(fast: boolean | undefined): { settings?: { fastMode: true } } {
  return fast ? { settings: { fastMode: true } } : {};
}
// The run's flag-tier settings: Fast, and for a fenced run Claude's own sandbox off (it cannot start inside the fence)
// and auto memory off, since a memory one turn wrote under projects/ would be read by every later turn in the profile.
function claudeRunSettings(fast: boolean | undefined, fence: Prepared["fence"]): { settings?: { fastMode?: true; sandbox?: { enabled: false }; autoMemoryEnabled?: false } } {
  const settings = { ...claudeFastSettings(fast).settings, ...fence ? { sandbox: { enabled: false as const }, autoMemoryEnabled: false as const } : {} };
  return Object.keys(settings).length ? { settings } : {};
}
// Fast for a Codex turn: a doan turn always names its tier, standard included, so a catalog default of Fast still runs
// standard when off; it holds for that turn only. A terminal session's turn names none, as with permission modes.
export function codexServiceTierForTurn(owner: "doan" | "legacy-external", fast: boolean): { serviceTierForTurn?: "priority" | "default" } {
  return owner === "doan" ? { serviceTierForTurn: fast ? "priority" : "default" } : {};
}
// Account and ownership answers say nothing about the protocol shape, so they never record an installed version.
const NOT_EVIDENCE: readonly FailureCode[] = ["not_logged_in", "rate_limited", "session_in_use"];
function codexFailure(error: unknown): HandshakeReply {
  return error instanceof RpcError && !NOT_EVIDENCE.includes(transportError(error.message)) ? { failed: "rpc" } : { failed: "lost" };
}
// One handshake step: judge the reply, then pass its result or rethrow its error unchanged.
async function judgedStep(request: Promise<unknown>, judge: (reply: HandshakeReply) => void): Promise<unknown> {
  let result: unknown;
  try { result = await request; } catch (error) { judge(codexFailure(error)); throw error; }
  judge({ result }); return result;
}
// Applies verdicts before the caller throws; an incompatible step is not cleared by a later one of the same handshake.
function verdicts(input: Prepared): (verdict: HandshakeVerdict) => void {
  let recorded = false;
  return verdict => {
    if (recorded || !verdict) return;
    if (verdict === "incompatible") { recorded = true; input.incompatible?.(); } else input.compatible?.();
  };
}
// A Claude turn's usage read keeps the CLI's input open, and the next send waits for that process (service.ts
// EXIT_WAIT_MS); this cap plus the finished turn's stop (endAfterTurn) stays inside that wait, so it never refuses as busy.
const TURN_USAGE_MS = 3000;
function timeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process_exited")), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
// The doan- servers in this Codex profile's config.toml, read every turn (a Connect may have added one). An unreadable,
// oversized, FIFO or linked file names none, so the turn does not wait and main never blocks on it.
function profileServers(configDir: string): string[] {
  try { return codexProfileServers(readRegularFileNoFollowSync(join(configDir, "config.toml"), 1024 * 1024).toString("utf8")); }
  catch { return []; }
}
// How long a compaction's send waits for the turn its {} reply opened; the server starts it at once.
const COMPACTION_START_MS = 10_000;
// One Codex send's start (runners.ts openCodex): stopped by a Stop that came before its turn existed, wake ends its wait.
interface Start { stopped: boolean; wake(): void }
function openCodexList(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  return openCodex(input, emit, exited, registerStop, true);
}
// list: model/list or skills/list after initialize instead of a thread, so reading a list starts no session.
async function openCodex(input: Prepared & SteerHooks, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void, list = false): Promise<SteeringRunner> {
  // Doan-account args select the dedicated credential store; they must precede the subcommand. A fenced server is
  // fixed to one mechanism for its life: the service starts another for a send that needs the other (codexRestart).
  const mechanism = input.fence ? codexMechanism(input.permissionMode ?? "default") : undefined;
  // A profile server without its listing would deny nothing, so it does not start.
  if (input.fence && mechanism === "codex-profile" && (!input.fence.denied || !input.fence.socket)) throw new Error("unknown");
  const launch = input.fence && mechanism === "fence" ? fencedCommand(input.command, [...input.args ?? [], "app-server"], fenceArgs("codex", input.fence.paths), input.fence.exec)
    : { command: input.command, args: [...input.args ?? [], ...input.fence ? codexProfileArgs(input.fence.paths, input.fence.denied ?? [], dirname(input.fence.socket ?? "")) : [], "app-server"] };
  const child = spawn(launch.command, launch.args, { cwd: input.cwd, env: input.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let startingTurn = false; const queued: unknown[] = [];
  // starting: the current send until turn/start answered; a Stop then marks that send, never the runner. latest: the
  // latest send; settled: resolves when its start is over. reloadOwed: a refused reload to resend. closing: close() ran.
  const startup = new CodexStartupWatch();
  let starting: Start | undefined, latest: Start | undefined, settled = Promise.resolve(), reloadOwed = false, closing = false;
  // Set while a compaction waits for the turn it opened (compactionTurn).
  let turnStarted: ((id: string | undefined) => void) | undefined;
  const startedTurn = (raw: unknown): string | undefined => object(raw) && raw.method === "turn/started" && object(raw.params) && raw.params.threadId === sessionId && object(raw.params.turn) && typeof raw.params.turn.id === "string" ? raw.params.turn.id : undefined;
  let sessionId = input.sessionId ?? "", activeTurn = "", localTurn = "", buffer = "", dead = false;
  let defaults: CodexDefaults | undefined, workspace: CodexWorkspace = {};
  const write = (value: unknown) => writeLine(JSON.stringify(value) + "\n");
  let protocolFailed = false;
  // A done turn reads the account's usage on this server, which lives between turns (ARCHITECTURE §7 'Agent usage').
  const dispatcher: CodexDispatcher = new CodexDispatcher(write, event => {
    emit(event);
    if (event.type === "turn.done") void input.usageAtTurnEnd?.(() => dispatcher.query("account/rateLimits/read", undefined)).catch(() => {});
    // A turn the usage limit stopped reads it too, for the reset the service schedules its message for.
    else if (event.type === "turn.failed" && event.code === "rate_limited") void input.usageAtTurnEnd?.(() => dispatcher.query("account/rateLimits/read", undefined), true).catch(() => {});
  }, () => failProtocol(), id => input.steerConsumed?.(id), stage => input.stage?.(stage), kind => input.boundary?.(kind));
  const failProtocol = () => {
    if (protocolFailed) return; protocolFailed = true;
    emit({ type: "turn.failed", code: "session_unavailable" }); dispatcher.close(); void group?.stop();
  };
  const decoder = new StringDecoder("utf8");
  child.stdout.on("data", (bytes: Buffer) => {
    buffer += decoder.write(bytes);
    if (buffer.length > 4 * 1024 * 1024) { failProtocol(); return; }
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      // Startup statuses name a thread but no turn, and the reply that names the thread can still be on its way here.
      try {
        const raw: unknown = JSON.parse(line); if (startup.receive(raw, sessionId)) continue;
        if (startingTurn && object(raw) && typeof raw.method === "string") {
          if (queued.length >= 4096) throw new Error("Protocol queue limit"); queued.push(raw);
          const started = turnStarted && startedTurn(raw); if (started) turnStarted?.(started);
        } else dispatcher.receive(raw);
      } catch { failProtocol(); }
    }
  });
  // Resolves once the server's turn has ended (dispatcher.end emits its turn.failed), after the bounded output drain.
  let transportGone!: () => void;
  const gone = new Promise<void>(resolve => { transportGone = resolve; });
  const transportDied = () => {
    if (dead) return; dead = true;
    dispatcher.end(); starting?.wake(); turnStarted?.(undefined); transportGone();
  };
  child.stderr.resume();
  const { group, ending, write: writeLine } = ownProtocolProcess(child, () => dispatcher.clearDeadlines(), transportDied, exited);
  if (group) registerStop(() => { dispatcher.close(); return group.stop(); });
  try {
    const resume = !!input.sessionId, judge = verdicts(input);
    const initialized = await judgedStep(dispatcher.request("initialize", { clientInfo: { name: "doan", version: "0.1.0" }, capabilities: { experimentalApi: true } }), reply => judge(codexInitialize(reply, resume)));
    // A new session refuses the handshake it just recorded as incompatible; a resume keeps accepting it unjudged.
    if (!resume && !object(initialized)) throw new Error("Malformed initialize result");
    write({ method: "initialized" });
    if (list) {
      // A list request runs after this try, so it names its failure as the handshake's catch below does.
      const listed = async <T>(read: () => Promise<T>): Promise<T> => {
        try { return await read(); } catch (error) { throw new Error(dead ? "process_exited" : transportError(error instanceof Error ? error.message : "")); }
      };
      return { sessionId: "", models: () => listed(async () => ({ models: parseCodexModels(await dispatcher.request("model/list", {})) })),
        // forceReload: a skill added since this app-server's cache was filled is listed (the person or an agent just made it).
        skills: () => listed(async () => [...parseCodexSkills(await dispatcher.request("skills/list", { cwds: [input.cwd], forceReload: true })), ...allowedCommands("codex", input.installed)]), send: async () => { throw new Error("session_unavailable"); }, steer: async () => { throw new Error("not_running"); }, answer: () => false, stop: async () => { await group?.stop(); }, close: async () => { dispatcher.close(); await group?.stop(); } };
    }
    const result = await judgedStep(dispatcher.request(resume ? "thread/resume" : "thread/start", resume ? { threadId: input.sessionId } : { cwd: input.cwd }), reply => { if (!resume) judge(codexThreadStart(reply)); });
    if (!object(result) || !object(result.thread) || typeof result.thread.id !== "string" || !result.thread.id) throw new Error("session_unavailable");
    sessionId = result.thread.id;
    if (input.sessionId && sessionId !== input.sessionId) throw new Error("session_unavailable");
    // Default is stated on every turn, since an override holds across turns and thread/resume; an ephemeral thread/start
    // reads its values, and a failed probe refuses the open. An external profile's run states nothing, keeping its override.
    if (input.owner) {
      const config = await dispatcher.request("config/read", { cwd: input.cwd }).catch((error: unknown) => { if (error instanceof RpcError) return null; throw error; });
      // The probe turns off every configured MCP server and plugin, and always the apps feature (config/read reports it only
      // when set), so it starts none; the approval and sandbox it reports are unchanged.
      const off = (names: string[]) => names.length ? Object.fromEntries(names.map(name => [name, { enabled: false }])) : undefined;
      const servers = off(codexServerNames(config)), plugins = off(codexPluginNames(config));
      const probe = await dispatcher.request("thread/start", { cwd: input.cwd, ephemeral: true, config: { ...(servers ? { mcp_servers: servers } : {}), ...(plugins ? { plugins } : {}), features: { apps: false } } }).catch((error: unknown) => { if (error instanceof RpcError) throw new Error("session_unavailable"); throw error; });
      const read = codexDefaults(probe); if (!read) throw new Error("session_unavailable");
      defaults = read;
      // Accept edits carries the configured network access and roots; without config/read it sends the narrower bare policy.
      workspace = codexWorkspace(config);
    }
    if (ending()) throw new Error("process_exited");
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- the child exit callback sets this while the thread opens
  } catch (error) { dispatcher.close(); void group?.stop(); throw new Error(dead || (error instanceof Error && error.message === "process_exited") ? "process_exited" : transportError(error instanceof Error ? error.message : "")); }
  // A turn before its servers are ready runs without their tools, so a doan run waits. A reload forgets statuses before it
  // is sent (new ones can follow its reply at once) and is awaited past a Stop to set reloadOwed. False: Stop ended it.
  const serversReady = async (phase: Start, reload: boolean, labels: Readonly<Record<string, string>>): Promise<boolean> => {
    if (!input.owner) return true;
    const names = profileServers(input.configDir);
    if (reload) {
      startup.forget(sessionId, names);
      let applied = true;
      try { await dispatcher.request("config/mcpServer/reload", {}); } catch (error) { if (!(error instanceof RpcError)) throw error; applied = false; }
      reloadOwed = !applied;
      if (dead || closing) throw new Error("process_exited");
      if (phase.stopped) return false;
      // A server that refused the reload keeps its servers and their settled statuses, so the turn need not wait.
      if (!applied) return true;
    }
    const wait = startup.wait(sessionId, names, labels, emit);
    phase.wake = wait.cancel;
    const started = await wait.started;
    if (dead || closing) throw new Error("process_exited");
    return started && !phase.stopped;
  };
  // The turn a compaction opened: its turn/started may be queued already, before the {} reply, or still to come. A Stop
  // keeps waiting, so the turn can be interrupted once it exists; past the bound, or once the server is gone, there is none.
  const compactionTurn = (): Promise<string | undefined> => {
    const early = queued.map(startedTurn).find(id => id !== undefined);
    if (early !== undefined) return Promise.resolve(early);
    return new Promise(resolve => {
      const timer = setTimeout(() => { if (!ending()) settle(undefined); }, COMPACTION_START_MS); timer.unref();
      const settle = (id: string | undefined) => { clearTimeout(timer); turnStarted = undefined; resolve(id); };
      turnStarted = settle;
    });
  };
  // A server that cannot interrupt its own turn is stopped instead.
  const interrupt = (turnId: string) => dispatcher.request("turn/interrupt", { threadId: sessionId, turnId }).then(() => {}, () => { void group?.stop(); });
  return {
    sessionId, ...(mechanism ? { mechanism } : {}),
    async send(prompt, turnId, _attachments, choice) {
      if (ending()) { emit({ type: "turn.failed", code: "process_exited" }); return; }
      const own: Start = { stopped: false, wake: () => {} }, previous = settled;
      let settle = () => {}; settled = new Promise<void>(resolve => { settle = resolve; });
      starting = own; latest = own;
      // The send's own end after a Stop; once a later send exists, that send's turn is the one being shown.
      const stopped = () => { if (latest === own) emit({ type: "interrupted", reason: "user" }); };
      try {
        // A stopped send before this one may still await its turn/start reply, which only it may answer.
        await previous;
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the child exit callback sets this while the previous send settles
        if (dead || closing) throw new Error("process_exited");
        if (own.stopped) { stopped(); return; }
        // The server was opened with the conversation's choice then; a send may have changed it since.
        const turn = choice ?? input, permission = defaults ? codexTurnPermission(turn.permissionMode ?? "default", defaults, workspace, mechanism) : {};
        const tier = codexServiceTierForTurn(input.owner ? "doan" : "legacy-external", turn.fast === true);
        activeTurn = turnId; localTurn = turnId;
        const labels = input.mcp?.labels() ?? connectorLabels([]);
        dispatcher.begin({ root: input.cwd, sessionId, turnId, labels });
        if (!await serversReady(own, choice?.reloadMcp === true || reloadOwed, labels)) { stopped(); return; }
        startingTurn = true;
        let result: unknown;
        // A command runs only as its own request (text "/compact" reaches the model, which claims it compacted); the
        // request keeps the thread's model and permission state.
        const command = commandRequest("codex", prompt);
        // Passed on every turn, as Claude and ACP must be, though Codex keeps a turn's model for the next.
        try {
          result = await (command.kind === "request" ? dispatcher.request(command.method, { threadId: sessionId, ...command.params })
            : dispatcher.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], ...(turn.model ? { model: turn.model } : {}), ...(turn.effort ? { effort: turn.effort } : {}), ...permission, ...tier }));
        } catch (error) { startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw); throw error; }
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the child exit callback sets this while turn/start is in flight
        if (dead) throw new Error("process_exited");
        // thread/compact/start answers {} and opens a turn of its own, named only by its turn/started.
        const native = command.kind === "request" && command.method === "thread/compact/start" ? await compactionTurn()
          : object(result) && object(result.turn) && typeof result.turn.id === "string" ? result.turn.id : undefined;
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the child exit callback sets this while turn/start is in flight
        if (dead) throw new Error("process_exited");
        if (native === undefined) {
          startingTurn = false;
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while turn/start is in flight
          if (command.kind === "request" && command.method === "thread/compact/start") { for (const raw of queued.splice(0)) dispatcher.receive(raw); if (own.stopped) { stopped(); return; } throw new Error("session_unavailable"); }
          failProtocol(); throw new Error("session_unavailable");
        }
        startingTurn = false;
        // Stopped while turn/start was unanswered: the native turn is interrupted, never adopted as this turn's.
        // A turn that already completed in the frames queued behind the reply has nothing left to interrupt.
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while turn/start is in flight
        if (own.stopped) {
          const frames = queued.splice(0);
          const over = frames.some(raw => object(raw) && raw.method === "turn/completed" && object(raw.params) && object(raw.params.turn) && raw.params.turn.id === native);
          for (const raw of frames) dispatcher.receive(raw);
          if (!over) await interrupt(native);
          stopped(); return;
        }
        activeTurn = native; dispatcher.started(activeTurn);
        for (const raw of queued.splice(0)) dispatcher.receive(raw);
      } finally { if (starting === own) starting = undefined; settle(); }
    },
    // Before turn/start answers there is no native id to expect (startingTurn); a steer then is refused, not held.
    // No model, effort or permission: a steered message runs in the running turn's.
    async steer(prompt, turnId, messageId) {
      // A server that is going ends its turn only after its output drains (up to 500 ms). Refused before that end, a Send
      // now would read a running turn and say its message stays queued, so the refusal waits for the end.
      if (ending() && !dead) await gone;
      if (ending() || startingTurn || turnId !== localTurn || activeTurn === localTurn) throw new Error("not_running");
      await dispatcher.steer({ threadId: sessionId, expectedTurnId: activeTurn, input: [{ type: "text", text: prompt }], clientUserMessageId: messageId }, messageId);
    },
    answer: (id, option) => !ending() && dispatcher.answer(id, option),
    // Only a native turn can be interrupted: interrupting the local id fails, and that failure stops the server group.
    // Before turn/start nothing was sent; while it is unanswered the send interrupts the native turn once it exists.
    async stop() {
      dispatcher.stop("user");
      if (starting) { starting.stopped = true; starting.wake(); return; }
      if (activeTurn && activeTurn !== localTurn) await interrupt(activeTurn);
    },
    async close() { closing = true; if (starting) { starting.stopped = true; starting.wake(); } dispatcher.stop("appQuit"); dispatcher.close(); await group?.stop(); },
  };
}
// After a success result leaves a steered message unread, the CLI echoes its uuid when it starts the follow-up turn. The
// wait is bounded so a missing echo cannot hold the turn: past it the turn ends done and the message is queued again.
export const STEER_READ_WAIT_MS = 30_000;
// Claude Code refuses to start under the organization pin when the repo's settings supply their own credential. The SDK
// keeps no stderr for a custom spawn, so the runner reads it.
const PIN_REFUSED = /managed settings require a first-party login/i;
async function openClaude(input: Prepared & SteerHooks, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<SteeringRunner> {
  // A doan Claude run is only ever pinned to its login's organization: without one, a repo's API key could replace the
  // login, so the connection must be signed in again instead of running unpinned.
  const organization = input.owner ? input.owner.workspaceId : undefined;
  if (organization === null || organization === "") throw new Error("not_logged_in");
  const sessionId = input.sessionId ?? randomUUID(); const controller = new AbortController();
  // A Claude run opens for one turn, so the connector names read here are current for it.
  const labels = input.mcp?.labels();
  let group: OwnedGroup | undefined, state = { ...initialTransport(), ...(input.fast ? { fastRequested: true as const } : {}) };
  const pending = new Map<string, { input: Record<string, unknown>; suggestions: PermissionUpdate[]; resolve(value: PermissionResult): void }>();
  // Apart from permissions, so answer() never allows a question with no answer and answerQuestion() never answers a
  // permission. unanswered: the turn's system/init advertised the skip mark; read long before anyone can answer.
  const questions = new Map<string, { input: Record<string, unknown>; read: ClaudeQuestion; resolve(value: PermissionResult): void }>();
  let unanswered = false;
  let finished = false, childExited = false, spawnFailed = false, exitCode: number | null = null, stderr = "", stderrDone: Promise<unknown> = Promise.resolve();
  // The turn's input stays open after its first message so steer can add more, and closes the moment the turn ends:
  // the CLI exits only once its stdin ends, and until then send and the next turn wait (POSTMORTEM 2026-10-28).
  const inbox: { message: SDKUserMessage; accepted(): void; refused(error: Error): void }[] = [];
  let pulled = false, inputClosed = false, turn = "", wake: (() => void) | undefined;
  // Armed by a success result that leaves a steered uuid unread, disarmed by any read and on every terminal path.
  let readWait: ReturnType<typeof setTimeout> | undefined, readExpired = false;
  // After a done turn's terminal the CLI may send one prompt_suggestion before it exits. suggestionEnded: the next send
  // asked to end the process, so later ones belong to no one. cleanupLater: asked during the usage read; decide on close.
  let doneTurn = false, suggestionSeen = false, suggestionEnded = false, cleanupLater = false;
  // Live background tasks: all of them decide how the process ends; the shown (not ambient) ones go on the done turn's
  // line (backgroundShown). termAsked: Doan sent SIGTERM, whose handling the CLI must be let finish.
  let background: string[] = [], shown: string[] = [], backgroundShown = false, termAsked = false;
  const term = () => { termAsked = true; return group?.stop(); };
  // A finished turn's process ended for the next send: killed at once when nothing but its suggestion is left, otherwise
  // through SIGTERM, whose handling stops background work in the CLI's own way (process.ts afterTurnCleanup).
  const cleanup = () => {
    const decision = afterTurnCleanup({ finished, inputClosed, background: background.length, doneTurn, promptRead: state.prompt === undefined });
    if (decision === "kill") void group?.kill(); else if (decision === "term") void term();
    return decision;
  };
  const endReadWait = () => { clearTimeout(readWait); readWait = undefined; };
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    pulled = true;
    for (;;) {
      while (!inbox.length && !inputClosed) await new Promise<void>(resolve => { wake = resolve; });
      const next = inputClosed ? undefined : inbox.shift();
      if (!next) return;
      next.accepted(); yield next.message;
    }
  }
  const enqueue = (message: SDKUserMessage) => new Promise<void>((accepted, refused) => { inbox.push({ message, accepted, refused }); wake?.(); });
  const closeInput = () => {
    if (inputClosed) return; inputClosed = true;
    for (const item of inbox.splice(0)) item.refused(new Error("not_running"));
    wake?.();
  };
  const q = query({ prompt: messages(), options: {
    cwd: input.cwd, env: input.env, pathToClaudeCodeExecutable: input.command, settingSources: ["user", "project", "local"], includePartialMessages: true,
    // Every Claude run asks for the next-message suggestion; whether one comes is the CLI's and the environment's call
    // (environment.ts promptSuggestionEnv). It arrives after the turn's result, so the loop below keeps reading.
    promptSuggestions: true,
    // A repo's settings env API key or apiKeyHelper would otherwise replace the doan login; pinning the login's organization
    // (SDK managedSettings forceLoginOrgUUID, code.claude.com/docs/en/managed-settings) makes Claude Code refuse such a run.
    ...(organization ? { managedSettings: { forceLoginOrgUUID: organization } } : {}),
    abortController: controller, ...(input.sessionId ? { resume: input.sessionId } : { sessionId }),
    // A resume without them starts on the default model, so every run passes the conversation's choice.
    ...(input.model ? { model: input.model } : {}), ...(input.effort ? { effort: input.effort as EffortLevel } : {}),
    // Every run with Fast asks for it, as each turn opens a new process; a run without it passes nothing.
    ...claudeRunSettings(input.fast, input.fence),
    // Default passes nothing, so the Doan profile's and the project's settings decide. A terminal session's run (no doan
    // owner) keeps the person's own profile settings, as Codex does.
    ...(input.owner ? claudePermission(input.permissionMode ?? "default") : {}),
    spawnClaudeCodeProcess(options) {
      const launch = fencedCommand(options.command, options.args, input.fence ? fenceArgs("claude", input.fence.paths) : undefined, input.fence?.exec);
      const child = spawn(launch.command, launch.args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      if (child.pid) {
        // A background command runs in a process group of its own that only the CLI's SIGTERM handling reaches, and
        // one that ignores SIGTERM outlives the CLI, so a stop also ends the groups the CLI's descendants started.
        const owned = new OwnedGroup(child.pid, undefined, undefined, exited, listProcesses); group = owned;
        registerStop(() => { controller.abort(); closeInput(); return owned.stop(); });
      }
      child.stderr.setEncoding("utf8"); child.stderr.on("data", (text: string) => { stderr = (stderr + text).slice(-8192); });
      stderrDone = new Promise(resolve => child.stderr.once("close", resolve));
      child.once("exit", code => { childExited = true; exitCode = code; group?.childExited(); }); child.once("error", () => { if (!child.pid) { spawnFailed = true; exited(); } else group?.childExited(); });
      return child;
    },
    canUseTool(tool, toolInput, options) {
      if (tool === CLAUDE_QUESTION_TOOL) return ask(toolInput, options.signal);
      if (options.signal.aborted) return Promise.resolve({ behavior: "deny", message: "Request expired." });
      const requestId = randomUUID(); const suggestions = options.suggestions ?? [];
      return new Promise<PermissionResult>(resolve => {
        pending.set(requestId, { input: toolInput, suggestions, resolve });
        expireOnAbort(options.signal, () => pending.delete(requestId) && resolveExpired(resolve, { type: "permission.resolved", requestId, optionId: "expired" }));
        emit(claudePermissionRequest(requestId, tool, toolInput, suggestions, input.cwd, labels));
      });
    },
  } });
  // A stopped or ended turn asks nothing more: nobody would see the card, and the service drops its events. A question
  // no card can show whole is denied with the way to ask instead, never sent as a permission whose Allow has no answer.
  function ask(toolInput: Record<string, unknown>, signal: AbortSignal): Promise<PermissionResult> {
    if (finished || state.stop || state.terminal || signal.aborted) return Promise.resolve({ behavior: "deny", message: "Request expired." });
    const read = claudeQuestion(toolInput);
    if (!read) return Promise.resolve({ behavior: "deny", message: "Doan could not show this question to the person. Ask it in your reply text instead, then end your turn so they can answer." });
    const requestId = randomUUID();
    return new Promise<PermissionResult>(resolve => {
      questions.set(requestId, { input: toolInput, read, resolve });
      expireOnAbort(signal, () => questions.delete(requestId) && resolveExpired(resolve, { type: "question.resolved", requestId, outcome: "expired" }));
      emit({ type: "question.request", requestId, questions: read.questions });
    });
  }
  // The CLI cancels a request it no longer waits for (control_cancel_request, or the SDK's cleanup aborts canUseTool's
  // signal); it then expires with Stop's record. One already answered or expired is out of its map.
  function expireOnAbort(signal: AbortSignal, expireOne: () => void) { signal.addEventListener("abort", expireOne, { once: true }); }
  function resolveExpired(resolve: (result: PermissionResult) => void, record: EventPayload) {
    resolve({ behavior: "deny", message: "Request expired." }); emit(record);
  }
  const expire = () => {
    for (const [requestId, request] of pending) { pending.delete(requestId); resolveExpired(request.resolve, { type: "permission.resolved", requestId, optionId: "expired" }); }
    for (const [requestId, request] of questions) { questions.delete(requestId); resolveExpired(request.resolve, { type: "question.resolved", requestId, outcome: "expired" }); }
  };
  let initialized: unknown;
  try { initialized = await timeout(q.initializationResult()); } catch (error) {
    controller.abort(); closeInput(); void term();
    if (input.owner) { await Promise.race([stderrDone, new Promise(resolve => setTimeout(resolve, 1000).unref())]); if (PIN_REFUSED.test(stderr)) throw new Error("credential_override"); }
    // A fenced start that could not run (sandbox-exec missing, or refusing with 65 or 71) is a process failure, never the
    // SDK's missing-CLI message. The CLI's own early exit keeps the SDK's error.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the child exit callback sets this while the SDK starts
    const refused = childExited && sandboxRefused({ exitCode, stderr });
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the spawn error and exit callbacks set these while the SDK starts
    if (input.fence && (spawnFailed || refused)) throw new Error("process_exited");
    throw error;
  }
  // The session the run is on: the one it opened, or the one the person's /clear moved it to.
  let current = sessionId;
  const runner: SteeringRunner = {
    sessionId,
    models: async () => ({ models: applyClaudeFastUnavailable(object(initialized) ? initialized.fast_mode_disabled_reason : undefined, parseClaudeModels(await timeout(q.supportedModels()))) }),
    // initialize's commands, not supportedCommands(): the latter adds MCP prompts once servers connect.
    skills: async () => {
      const commands = object(initialized) ? initialized.commands : undefined;
      return [...parseClaudeSkills(commands), ...parseClaudeCommands(commands, input.installed)];
    },
    async send(prompt, turnId) {
      if (finished) throw new Error("process_exited");
      // Only a send that is the person's /clear (an alias goes out as /clear) may move the run to another session, once the
      // clear's conversation_reset came; its new id is system/init's, never new_conversation_id.
      const clearing = commandName("claude", prompt) === "clear";
      // turnInit: the mode the turn's first top-level init reported; a later init is a steered message the CLI runs as its next
      // turn, and can report a setMode allowed there. latest: the mode the process reported last, init or status.
      let reset = false, turnInit: string | undefined, latest: string | undefined;
      // The group stops as on any terminal that leaves a steered uuid unread; the SDK error that follows is that stop's.
      const expireRead = () => {
        readWait = undefined;
        if (finished || state.terminal) return;
        // An unread prompt means the CLI never took this turn's message: the turn fails rather than ends done.
        const result = state.prompt !== undefined ? endPromptWait(state) : endSteerWait(state); state = result.state; readExpired = true;
        for (const event of result.events) emit(event);
        closeInput(); void term();
      };
      const consume = (async () => {
        try {
          for await (const raw of q) {
            if (readExpired) break;
            // Only after the turn's own done terminal: a frame before it, or after a failed or stopped turn, is not this
            // turn's suggestion. The first one decides; normalizeClaude drops it like any frame after the terminal.
            const after = state.terminal;
            const tasks = backgroundTasks(background, raw, true);
            if (tasks) {
              const had = background.length; background = tasks; shown = backgroundTasks(shown, raw) ?? [];
              if (after && doneTurn && shown.length && !backgroundShown) { backgroundShown = true; input.backgroundChanged?.(true); }
              // The finished turn's work is over, and the CLI calls the model for its notice right after this frame, which no one
              // asked for; the set is empty, so a kill orphans nothing. A stop Doan asked for already runs through SIGTERM.
              if (after && had && !tasks.length && !termAsked && !state.stop) { void group?.kill(); if (backgroundShown) input.backgroundChanged?.(false); }
            }
            if (after && doneTurn && !suggestionSeen && object(raw) && raw.type === "prompt_suggestion") {
              suggestionSeen = true;
              const text = promptSuggestionText(raw);
              if (text && !suggestionEnded) input.suggested?.(text);
            }
            const frame: unknown = raw;
            if (!after && object(frame) && !frame.parent_tool_use_id) {
              const boundary = claudeBoundary(frame); if (boundary) input.boundary?.(boundary);
              if (frame.type === "conversation_reset" && frame.trigger === "clear") reset = true;
              const init = frame.type === "system" && frame.subtype === "init";
              const moved = init || frame.type === "result" ? frame.session_id : undefined;
              if (typeof moved === "string" && moved !== current) {
                // Once, from the system/init that follows the clear's own reset; a result only confirms it.
                if (clearing && reset && init && current === sessionId) { current = moved; runner.sessionId = moved; input.sessionChanged?.(moved); }
                else {
                  // Doan never follows a session it did not ask for (PRODUCT 'Resume and permissions').
                  const lost = claudeSessionLost(state); state = lost.state;
                  for (const event of lost.events) emit(event);
                  closeInput(); void term(); break;
                }
              }
            }
            unanswered = claudeUnansweredSupport(raw) ?? unanswered;
            // The service decides what a reported mode changes (claudeRunMode.ts). An init tells the mode an Ask first
            // turn's settings run, so only that turn's inits count; a turn sent with Accept edits or Full access runs its own.
            const report = claudeModeReport(raw), sent = input.permissionMode ?? "default", init = turnInit, previous = latest;
            if (report) { latest = report.mode; if (report.source === "init") turnInit ??= report.mode; }
            if (report?.source === "init" && sent === "default") input.modeReported?.(report, init, previous);
            else if (report?.source === "status" && (sent === "default" || sent === "plan")) input.modeReported?.(report, init, previous);
            const prompted = state.prompt !== undefined;
            const result = normalizeClaude(state, raw, input.cwd, labels); state = result.state;
            for (const id of result.consumed ?? []) input.steerConsumed?.(id);
            // A read ends the wait a held success result armed; a result still holding re-arms it below.
            if (result.consumed?.length || (prompted && state.prompt === undefined)) endReadWait();
            if (result.awaitingRead && !readWait) readWait = setTimeout(expireRead, STEER_READ_WAIT_MS);
            for (const event of result.events) emit(event);
            if (result.stage) input.stage?.(result.stage);
            if (!state.terminal) continue;
            endReadWait();
            // Set by the frame that ended the turn, before anything awaits: the service may ask to end this process as soon
            // as it has the terminal event.
            if (!after) doneTurn = !state.steered?.length && state.prompt === undefined && result.events.some(event => event.type === "turn.done");
            // Reported with the turn's end, after its terminal event, so the service knows the turn as done.
            if (!after && doneTurn && shown.length && !backgroundShown) { backgroundShown = true; input.backgroundChanged?.(true); }
            // The CLI exits once its input closes, so a done turn's usage is read on this Query first (ARCHITECTURE §7 'Agent usage').
            // A turn the usage limit stopped is read as well: the service schedules its message for the reset it reports.
            const limitTurn = !after && result.events.some(event => event.type === "turn.failed" && event.code === "rate_limited");
            if (input.usageAtTurnEnd && (doneTurn || limitTurn) && !after) {
              await input.usageAtTurnEnd(() => timeout(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), TURN_USAGE_MS), limitTurn ? true : undefined).catch(() => {});
            }
            closeInput();
            // The next send asked during the usage read: the input is closed now, so the decision is made.
            if (cleanupLater) { cleanupLater = false; cleanup(); }
            // A failed or aborted result can leave a steered message or the prompt unread; it goes back to the draft or the turn
            // shows its failure, so the CLI must not run it in a turn nobody sees. The terminal event is out already.
            if (state.steered?.length || state.prompt !== undefined) { void term(); break; }
          }
          if (!state.terminal) emit({ type: "turn.failed", code: "process_exited" });
        } catch (error) {
          // SDK exit errors can precede group disappearance; neither cleanup nor provider errors prove process death.
          if (!readExpired && (!childExited || !object(error) || (error.errorClass !== "process_exited_nonzero" && error.errorClass !== "process_killed_by_signal"))) throw error;
          const result = endTransport(state); state = result.state;
          for (const event of result.events) emit(event);
        } finally { finished = true; endReadWait(); closeInput(); expire(); void group?.stop(); }
      })();
      // The SDK starts consuming input as part of its initialization handshake.
      if (!pulled) { controller.abort(); closeInput(); void term(); throw new Error("session_unavailable"); }
      turn = turnId;
      // The prompt carries a uuid the CLI echoes once it read it; registered before it is written (promptTransport).
      const promptId = randomUUID();
      state = promptTransport(state, promptId);
      void enqueue({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, session_id: current, uuid: promptId as NonNullable<SDKUserMessage["uuid"]> }).catch(() => {});
      await consume;
    },
    // Registered with the transport before it is written, so a result the CLI sends before reading it does not end the
    // turn. No priority: "next" behaves as none, "later" runs a separate turn and "now" drops the answer.
    async steer(prompt, turnId, messageId) {
      if (finished || inputClosed || state.terminal || !turn || turnId !== turn) throw new Error("not_running");
      state = steerTransport(state, messageId);
      await enqueue({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, session_id: current, uuid: messageId as NonNullable<SDKUserMessage["uuid"]> });
    },
    answer(id, option) {
      const request = pending.get(id); if (!request || !["allow", "deny", ...(request.suggestions.length ? ["always"] : [])].includes(option)) return false;
      pending.delete(id); request.resolve(option === "deny" ? { behavior: "deny", message: "Denied by the user." } : { behavior: "allow", updatedInput: request.input, ...(option === "always" ? { updatedPermissions: request.suggestions } : {}) });
      emit({ type: "permission.resolved", requestId: id, optionId: option }); return true;
    },
    // stale: no such question waits (answered, expired or never asked); bad_request: the answer does not fit it.
    answerQuestion(id, given) {
      const request = questions.get(id); if (!request) return "stale";
      const answer = questionAnswer(request.read.questions, given); if (!answer) return "bad_request";
      questions.delete(id); request.resolve(claudeQuestionResult(request.input, request.read, answer, unanswered));
      emit({ type: "question.resolved", requestId: id, outcome: answer.outcome, ...(answer.outcome === "answered" ? { answers: storedAnswers(request.read.questions, answer) } : {}) });
      return "ok";
    },
    // The next send (or a queue at the turn's end) asks to end this finished turn's process; during the usage read the
    // decision waits for the input to close. A turn still running is left alone: only its end can say what is left.
    endAfterTurn() {
      if (!state.terminal) return "none" as const;
      const decision = afterTurnCleanup({ finished, inputClosed, background: background.length, doneTurn, promptRead: state.prompt === undefined });
      if (decision === "none") return decision;
      suggestionEnded = true;
      if (decision === "later") { cleanupLater = true; return decision; }
      return cleanup();
    },
    async stop() { state = { ...state, stop: "user" }; endReadWait(); expire(); controller.abort(); closeInput(); await term(); },
    async close() { state = { ...state, stop: "appQuit" }; endReadWait(); expire(); controller.abort(); closeInput(); await term(); },
  };
  return runner;
}
