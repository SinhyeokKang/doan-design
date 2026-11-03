import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { query, type EffortLevel, type PermissionResult, type PermissionUpdate, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { openAcp } from "./acpRunner";
import { CodexDispatcher, RpcError } from "./dispatcher";
import { codexInitialize, codexThreadStart, type HandshakeReply, type HandshakeVerdict } from "./handshake";
import { OwnedGroup } from "./process";
import { object } from "./sessions";
import { parseClaudeModels, parseCodexModels } from "./models";
import { claudePermissionSummary, claudeReportedMode, endTransport, initialTransport, normalizeClaude, steerTransport, transportError } from "./transport";
import { claudePermission, codexDefaults, codexPermission, codexWorkspace, type CodexDefaults, type CodexWorkspace } from "./permissionMode";
import type { OpenRunner, Prepared, ReadModels, Runner } from "./service";
import type { EventPayload, FailureCode } from "./types";
// steerConsumed: the agent read a steered message, called in line with the run's events so the message
// takes its place in the thread there.
export interface SteerHooks { steerConsumed?: (messageId: string) => void }
// steer adds a message to the running turn turnId (the id send was given). It resolves once the provider accepted it
// and rejects otherwise: Error "not_running" when there is no such running turn here, RpcError with the server's
// message when Codex refuses it, and Error "RPC timeout" or "process_exited" when no answer came.
export interface SteeringRunner extends Runner { steer(prompt: string, turnId: string, messageId: string): Promise<void> }
export const openRunner: OpenRunner = (input, emit, exited, registerStop) =>
  input.runtime === "claude" ? openClaude(input, emit, exited, registerStop) : input.runtime === "codex" ? openCodex(input, emit, exited, registerStop) : openAcp(input, emit, exited, registerStop);
// Opens the provider only to read its model list for this folder: no prompt, no model request.
// The caller owns the lease and the stop (ConversationService.listModels).
export const listModels: ReadModels = async (input, exited, registerStop) => {
  const runner = await (input.runtime === "claude" ? openClaude : input.runtime === "codex" ? openCodexList : openAcp)(input, () => {}, exited, registerStop);
  try { return await runner.models!(); } finally { await runner.close(); }
};
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
function timeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process_exited")), 10000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function openCodexList(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  return openCodex(input, emit, exited, registerStop, true);
}
// list: model/list after initialize instead of a thread, so reading the list starts no session.
async function openCodex(input: Prepared & SteerHooks, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void, list = false): Promise<SteeringRunner> {
  // Doan-account args select the dedicated credential store; they must precede the subcommand.
  const child = spawn(input.command, [...input.args ?? [], "app-server"], { cwd: input.cwd, env: input.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let startingTurn = false; const queued: unknown[] = [];
  let group: OwnedGroup | undefined, sessionId = input.sessionId ?? "", activeTurn = "", localTurn = "", buffer = "", dead = false;
  let defaults: CodexDefaults | undefined, workspace: CodexWorkspace = {};
  const write = (value: unknown) => { if (dead || !child.stdin.writable) throw new Error("process_exited"); child.stdin.write(JSON.stringify(value) + "\n"); };
  let protocolFailed = false;
  const dispatcher = new CodexDispatcher(write, emit, () => failProtocol(), id => input.steerConsumed?.(id));
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
      try { const raw: unknown = JSON.parse(line); if (startingTurn && object(raw) && typeof raw.method === "string") { if (queued.length >= 4096) throw new Error("Protocol queue limit"); queued.push(raw); } else dispatcher.receive(raw); } catch { failProtocol(); }
    }
  });
  const transportDied = () => {
    if (dead) return; dead = true;
    // Transport loss ends the turn now; only group disappearance releases ownership.
    dispatcher.end(); void group?.stop();
  };
  child.stderr.resume(); child.stdin.on("error", transportDied); child.stdout.once("end", transportDied);
  child.once("exit", () => { transportDied(); group?.childExited(); });
  child.once("error", () => { transportDied(); if (!child.pid) exited(); else group?.childExited(); });
  if (child.pid) {
    const owned = new OwnedGroup(child.pid, undefined, undefined, exited); group = owned;
    registerStop(() => { dispatcher.close(); return owned.stop(); });
  }
  try {
    const resume = !!input.sessionId, judge = verdicts(input);
    const initialized = await judgedStep(dispatcher.request("initialize", { clientInfo: { name: "doan", version: "0.1.0" }, capabilities: { experimentalApi: true } }), reply => judge(codexInitialize(reply, resume)));
    // A new session refuses the handshake it just recorded as incompatible; a resume keeps accepting it unjudged.
    if (!resume && !object(initialized)) throw new Error("Malformed initialize result");
    write({ method: "initialized" });
    if (list) {
      const models = parseCodexModels(await dispatcher.request("model/list", {}));
      return { sessionId: "", models: async () => ({ models }), send: async () => { throw new Error("session_unavailable"); }, steer: async () => { throw new Error("not_running"); }, answer: () => false, stop: async () => { await group?.stop(); }, close: async () => { dispatcher.close(); await group?.stop(); } };
    }
    const result = await judgedStep(dispatcher.request(resume ? "thread/resume" : "thread/start", resume ? { threadId: input.sessionId } : { cwd: input.cwd }), reply => { if (!resume) judge(codexThreadStart(reply)); });
    if (!object(result) || !object(result.thread) || typeof result.thread.id !== "string" || !result.thread.id) throw new Error("session_unavailable");
    sessionId = result.thread.id;
    if (input.sessionId && sessionId !== input.sessionId) throw new Error("session_unavailable");
    // Default is stated on every turn, since an override holds across turns and thread/resume (0.163.0, P2). Its values
    // depend on config and project trust and config/read leaves them null when unset, so an ephemeral thread/start
    // (no rollout, no model request) reads them. A failed or incomplete probe refuses the open: sending nothing would
    // keep an earlier override (orch.md decision 6). A run on an external profile (a terminal session) takes no mode
    // and states nothing, so an override its thread carries from the terminal stays.
    if (input.owner) {
      const probe = await dispatcher.request("thread/start", { cwd: input.cwd, ephemeral: true }).catch((error: unknown) => { if (error instanceof RpcError) throw new Error("session_unavailable"); throw error; });
      const read = codexDefaults(probe); if (!read) throw new Error("session_unavailable");
      defaults = read;
      // Accept edits carries the configured network access and roots; without config/read it sends the narrower bare policy.
      workspace = codexWorkspace(await dispatcher.request("config/read", { cwd: input.cwd }).catch((error: unknown) => { if (error instanceof RpcError) return null; throw error; }));
    }
    if (dead) throw new Error("process_exited");
  } catch (error) { dispatcher.close(); void group?.stop(); throw new Error(dead ? "process_exited" : transportError(error instanceof Error ? error.message : "")); }
  return {
    sessionId,
    async send(prompt, turnId, _attachments, choice) {
      if (dead) { emit({ type: "turn.failed", code: "process_exited" }); return; }
      // The server was opened with the conversation's choice then; a send may have changed it since.
      const turn = choice ?? input, permission = defaults ? codexPermission(turn.permissionMode ?? "default", defaults, workspace) : {};
      activeTurn = turnId; localTurn = turnId; startingTurn = true;
      dispatcher.begin({ root: input.cwd, sessionId, turnId });
      let result: unknown;
      // Passed on every turn, as Claude and ACP must be, though Codex keeps a turn's model for the next (P1).
      try { result = await dispatcher.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], ...(turn.model ? { model: turn.model } : {}), ...(turn.effort ? { effort: turn.effort } : {}), ...permission }); } catch (error) { startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw); throw error; }
      if (dead) throw new Error("process_exited");
      if (!object(result) || !object(result.turn) || typeof result.turn.id !== "string") { failProtocol(); throw new Error("session_unavailable"); }
      activeTurn = result.turn.id; dispatcher.started(activeTurn);
      startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw);
    },
    // Before turn/start answers there is no native id to expect (startingTurn); a steer then is refused, not held.
    // No model, effort or permission: a steered message runs in the running turn's.
    async steer(prompt, turnId, messageId) {
      if (dead || startingTurn || turnId !== localTurn || activeTurn === localTurn) throw new Error("not_running");
      await dispatcher.steer({ threadId: sessionId, expectedTurnId: activeTurn, input: [{ type: "text", text: prompt }], clientUserMessageId: messageId }, messageId);
    },
    answer: (id, option) => dispatcher.answer(id, option),
    async stop() { dispatcher.stop("user"); if (activeTurn) await dispatcher.request("turn/interrupt", { threadId: sessionId, turnId: activeTurn }).catch(() => { void group?.stop(); }); },
    async close() { dispatcher.stop("appQuit"); dispatcher.close(); await group?.stop(); },
  };
}
// Claude Code refuses to start under the organization pin when the repo's settings supply their own credential
// (2.1.312: "managed settings require a first-party login"). The SDK keeps no stderr for a custom spawn, so the runner reads it.
const PIN_REFUSED = /managed settings require a first-party login/i;
async function openClaude(input: Prepared & SteerHooks, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<SteeringRunner> {
  // A doan Claude run is only ever pinned to its login's organization (user decision 2026-10-28): without one, a repo's
  // API key could replace the login, so the connection must be signed in again instead of running unpinned.
  const organization = input.owner ? input.owner.workspaceId : undefined;
  if (organization === null || organization === "") throw new Error("not_logged_in");
  const sessionId = input.sessionId ?? randomUUID(); const controller = new AbortController();
  let group: OwnedGroup | undefined, state = initialTransport();
  const pending = new Map<string, { input: Record<string, unknown>; suggestions: PermissionUpdate[]; resolve(value: PermissionResult): void }>();
  let finished = false, childExited = false, stderr = "", stderrDone: Promise<unknown> = Promise.resolve();
  // The turn's input stays open after its first message so steer can add more, and closes the moment the turn ends:
  // the CLI exits only once its stdin ends, and until then send and the next turn wait (POSTMORTEM 2026-10-28).
  const inbox: { message: SDKUserMessage; accepted(): void; refused(error: Error): void }[] = [];
  let pulled = false, inputClosed = false, turn = "", wake: (() => void) | undefined;
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
    // A repo's .claude/settings*.json env API key or apiKeyHelper would otherwise replace the doan login. Pinning the
    // login's organization as a per-run parent policy (SDK managedSettings, honoured for forceLoginOrgUUID per
    // code.claude.com/docs/en/managed-settings) makes Claude Code refuse such a run instead (B3 live check, 2.1.312).
    ...(organization ? { managedSettings: { forceLoginOrgUUID: organization } } : {}),
    abortController: controller, ...(input.sessionId ? { resume: input.sessionId } : { sessionId }),
    // A resume without them starts on the default model (P1), so every run passes the conversation's choice.
    ...(input.model ? { model: input.model } : {}), ...(input.effort ? { effort: input.effort as EffortLevel } : {}),
    // Default passes nothing, so the Doan profile's and the project's settings decide, as before this option existed.
    // A terminal session's run (no doan owner) keeps the person's own profile settings, as Codex does.
    ...(input.owner ? claudePermission(input.permissionMode ?? "default") : {}),
    spawnClaudeCodeProcess(options) {
      const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      if (child.pid) {
        const owned = new OwnedGroup(child.pid, undefined, undefined, exited); group = owned;
        registerStop(() => { controller.abort(); closeInput(); return owned.stop(); });
      }
      child.stderr.setEncoding("utf8"); child.stderr.on("data", (text: string) => { stderr = (stderr + text).slice(-8192); });
      stderrDone = new Promise(resolve => child.stderr.once("close", resolve));
      child.once("exit", () => { childExited = true; group?.childExited(); }); child.once("error", () => { if (!child.pid) exited(); else group?.childExited(); });
      return child;
    },
    canUseTool(tool, toolInput, options) {
      const requestId = randomUUID(); const suggestions = options.suggestions ?? [];
      return new Promise<PermissionResult>(resolve => {
        pending.set(requestId, { input: toolInput, suggestions, resolve });
        emit({ type: "permission.request", requestId, tool, summary: claudePermissionSummary(tool, toolInput, input.cwd), options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "deny", label: "Deny", kind: "deny" }, ...(suggestions.length ? [{ id: "always", label: "Allow with suggested permissions", kind: "allowAlways" as const }] : [])] });
      });
    },
  } });
  const expire = () => {
    for (const [requestId, request] of pending) { pending.delete(requestId); request.resolve({ behavior: "deny", message: "Request expired." }); emit({ type: "permission.resolved", requestId, optionId: "expired" }); }
  };
  try { await timeout(q.initializationResult()); } catch (error) {
    controller.abort(); closeInput(); void group?.stop();
    if (input.owner) { await Promise.race([stderrDone, new Promise(resolve => setTimeout(resolve, 1000).unref())]); if (PIN_REFUSED.test(stderr)) throw new Error("credential_override"); }
    throw error;
  }
  return {
    sessionId,
    models: async () => ({ models: parseClaudeModels(await timeout(q.supportedModels())) }),
    async send(prompt, turnId) {
      if (finished) throw new Error("process_exited");
      const consume = (async () => {
        try {
          for await (const raw of q) {
            // Only a turn sent with Plan follows a reported switch (the plan's approval); a suggestion's setMode on another
            // turn stays that process's.
            const reported = input.permissionMode === "plan" ? claudeReportedMode(raw) : undefined;
            if (reported && reported !== "plan") input.planApproved?.(reported);
            const result = normalizeClaude(state, raw, input.cwd); state = result.state;
            for (const id of result.consumed ?? []) input.steerConsumed?.(id);
            for (const event of result.events) emit(event);
            if (!state.terminal) continue;
            closeInput();
            // A failed or aborted result can end the turn with a steered message already written and unread; the item
            // goes back to the draft, so the CLI must not run it in a turn nobody sees. The terminal event is out already.
            if (state.steered?.length) { void group?.stop(); break; }
          }
          if (!state.terminal) emit({ type: "turn.failed", code: "process_exited" });
        } catch (error) {
          // SDK exit errors can precede group disappearance; neither cleanup nor provider errors prove process death.
          if (!childExited || !object(error) || (error.errorClass !== "process_exited_nonzero" && error.errorClass !== "process_killed_by_signal")) throw error;
          const result = endTransport(state); state = result.state;
          for (const event of result.events) emit(event);
        } finally { finished = true; closeInput(); expire(); void group?.stop(); }
      })();
      // The SDK starts consuming input as part of its initialization handshake.
      if (!pulled) { controller.abort(); closeInput(); void group?.stop(); throw new Error("session_unavailable"); }
      turn = turnId;
      void enqueue({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, session_id: sessionId }).catch(() => {});
      await consume;
    },
    // Registered with the transport before it is written, so a result the CLI sends before reading it does not end the
    // turn. No priority: "next" behaves as none, "later" runs a separate turn and "now" drops the answer
    // (PoC, Claude Code 2.1.317).
    async steer(prompt, turnId, messageId) {
      if (finished || inputClosed || state.terminal || !turn || turnId !== turn) throw new Error("not_running");
      state = steerTransport(state, messageId);
      await enqueue({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, session_id: sessionId, uuid: messageId as NonNullable<SDKUserMessage["uuid"]> });
    },
    answer(id, option) {
      const request = pending.get(id); if (!request || !["allow", "deny", ...(request.suggestions.length ? ["always"] : [])].includes(option)) return false;
      pending.delete(id); request.resolve(option === "deny" ? { behavior: "deny", message: "Denied by the user." } : { behavior: "allow", updatedInput: request.input, ...(option === "always" ? { updatedPermissions: request.suggestions } : {}) });
      emit({ type: "permission.resolved", requestId: id, optionId: option }); return true;
    },
    async stop() { state = { ...state, stop: "user" }; expire(); controller.abort(); closeInput(); await group?.stop(); },
    async close() { state = { ...state, stop: "appQuit" }; expire(); controller.abort(); closeInput(); await group?.stop(); },
  };
}
