import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { query, type EffortLevel, type PermissionResult, type PermissionUpdate, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { openAcp } from "./acpRunner";
import { CodexDispatcher, RpcError } from "./dispatcher";
import { codexInitialize, codexThreadStart, type HandshakeReply, type HandshakeVerdict } from "./handshake";
import { OwnedGroup } from "./process";
import { object } from "./sessions";
import { parseClaudeModels, parseCodexModels, type ModelOption } from "./models";
import { endTransport, initialTransport, normalizeClaude, transportError } from "./transport";
import type { OpenRunner, Prepared, Runner } from "./service";
import type { EventPayload, FailureCode } from "./types";
export const openRunner: OpenRunner = (input, emit, exited, registerStop) =>
  input.runtime === "claude" ? openClaude(input, emit, exited, registerStop) : input.runtime === "codex" ? openCodex(input, emit, exited, registerStop) : openAcp(input, emit, exited, registerStop);
// Opens the provider only to read its model list for this folder: no prompt, no model request (PRODUCT §6 buzz-home
// P1). The lease is released once the process group is gone, or at once if nothing was spawned.
export async function listModels(input: Prepared): Promise<ModelOption[]> {
  let spawned = false, gone!: () => void;
  const exited = new Promise<void>(resolve => { gone = resolve; });
  try {
    const runner = await (input.runtime === "claude" ? openClaude : input.runtime === "codex" ? openCodexList : openAcp)(input, () => {}, gone, () => { spawned = true; });
    try { return await runner.models!(); } finally { await runner.close(); }
  } finally {
    if (spawned) await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 10_000).unref())]);
    await input.release?.();
  }
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
async function openCodex(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void, list = false): Promise<Runner> {
  // Doan-account args select the dedicated credential store; they must precede the subcommand.
  const child = spawn(input.command, [...input.args ?? [], "app-server"], { cwd: input.cwd, env: input.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let startingTurn = false; const queued: unknown[] = [];
  let group: OwnedGroup | undefined, sessionId = input.sessionId ?? "", activeTurn = "", buffer = "", dead = false;
  const write = (value: unknown) => { if (dead || !child.stdin.writable) throw new Error("process_exited"); child.stdin.write(JSON.stringify(value) + "\n"); };
  let protocolFailed = false;
  const dispatcher = new CodexDispatcher(write, emit, () => failProtocol());
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
      return { sessionId: "", models: async () => models, send: async () => { throw new Error("session_unavailable"); }, answer: () => false, stop: async () => { await group?.stop(); }, close: async () => { dispatcher.close(); await group?.stop(); } };
    }
    const result = await judgedStep(dispatcher.request(resume ? "thread/resume" : "thread/start", resume ? { threadId: input.sessionId } : { cwd: input.cwd }), reply => { if (!resume) judge(codexThreadStart(reply)); });
    if (!object(result) || !object(result.thread) || typeof result.thread.id !== "string" || !result.thread.id) throw new Error("session_unavailable");
    sessionId = result.thread.id;
    if (input.sessionId && sessionId !== input.sessionId) throw new Error("session_unavailable");
    if (dead) throw new Error("process_exited");
  } catch (error) { dispatcher.close(); void group?.stop(); throw new Error(dead ? "process_exited" : transportError(error instanceof Error ? error.message : "")); }
  return {
    sessionId,
    async send(prompt, turnId) {
      if (dead) { emit({ type: "turn.failed", code: "process_exited" }); return; }
      activeTurn = turnId; startingTurn = true;
      dispatcher.begin({ root: input.cwd, sessionId, turnId });
      let result: unknown;
      // Passed on every turn, as Claude and ACP must be, though Codex keeps a turn's model for the next (P1).
      try { result = await dispatcher.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], ...(input.model ? { model: input.model } : {}), ...(input.effort ? { effort: input.effort } : {}) }); } catch (error) { startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw); throw error; }
      if (dead) throw new Error("process_exited");
      if (!object(result) || !object(result.turn) || typeof result.turn.id !== "string") { failProtocol(); throw new Error("session_unavailable"); }
      activeTurn = result.turn.id; dispatcher.started(activeTurn);
      startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw);
    },
    answer: (id, option) => dispatcher.answer(id, option),
    async stop() { dispatcher.stop("user"); if (activeTurn) await dispatcher.request("turn/interrupt", { threadId: sessionId, turnId: activeTurn }).catch(() => { void group?.stop(); }); },
    async close() { dispatcher.stop("appQuit"); dispatcher.close(); await group?.stop(); },
  };
}
// Claude Code refuses to start under the organization pin when the repo's settings supply their own credential
// (2.1.312: "managed settings require a first-party login"). The SDK keeps no stderr for a custom spawn, so the runner reads it.
const PIN_REFUSED = /managed settings require a first-party login/i;
async function openClaude(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  // A doan Claude run is only ever pinned to its login's organization (user decision 2026-10-28): without one, a repo's
  // API key could replace the login, so the connection must be signed in again instead of running unpinned.
  const organization = input.owner ? input.owner.workspaceId : undefined;
  if (organization === null || organization === "") throw new Error("not_logged_in");
  const sessionId = input.sessionId ?? randomUUID(); const controller = new AbortController();
  let group: OwnedGroup | undefined, state = initialTransport(), deliver: ((message: SDKUserMessage | null) => void) | undefined;
  const pending = new Map<string, { input: Record<string, unknown>; suggestions: PermissionUpdate[]; resolve(value: PermissionResult): void }>();
  let finished = false, childExited = false, stderr = "", stderrDone: Promise<unknown> = Promise.resolve();
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    const message = await new Promise<SDKUserMessage | null>(resolve => { deliver = resolve; });
    if (message) yield message;
  }
  const q = query({ prompt: messages(), options: {
    cwd: input.cwd, env: input.env, pathToClaudeCodeExecutable: input.command, settingSources: ["user", "project", "local"], includePartialMessages: true,
    // A repo's .claude/settings*.json env API key or apiKeyHelper would otherwise replace the doan login. Pinning the
    // login's organization as a per-run parent policy (SDK managedSettings, honoured for forceLoginOrgUUID per
    // code.claude.com/docs/en/managed-settings) makes Claude Code refuse such a run instead (B3 live check, 2.1.312).
    ...(organization ? { managedSettings: { forceLoginOrgUUID: organization } } : {}),
    abortController: controller, ...(input.sessionId ? { resume: input.sessionId } : { sessionId }),
    // A resume without them starts on the default model (P1), so every run passes the conversation's choice.
    ...(input.model ? { model: input.model } : {}), ...(input.effort ? { effort: input.effort as EffortLevel } : {}),
    spawnClaudeCodeProcess(options) {
      const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      if (child.pid) {
        const owned = new OwnedGroup(child.pid, undefined, undefined, exited); group = owned;
        registerStop(() => { controller.abort(); deliver?.(null); return owned.stop(); });
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
        emit({ type: "permission.request", requestId, tool, summary: tool, options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "deny", label: "Deny", kind: "deny" }, ...(suggestions.length ? [{ id: "always", label: "Allow with suggested permissions", kind: "allowAlways" as const }] : [])] });
      });
    },
  } });
  const expire = () => {
    for (const [requestId, request] of pending) { pending.delete(requestId); request.resolve({ behavior: "deny", message: "Request expired." }); emit({ type: "permission.resolved", requestId, optionId: "expired" }); }
  };
  try { await timeout(q.initializationResult()); } catch (error) {
    controller.abort(); void group?.stop();
    if (input.owner) { await Promise.race([stderrDone, new Promise(resolve => setTimeout(resolve, 1000).unref())]); if (PIN_REFUSED.test(stderr)) throw new Error("credential_override"); }
    throw error;
  }
  return {
    sessionId,
    models: async () => parseClaudeModels(await timeout(q.supportedModels())),
    async send(prompt) {
      if (finished) throw new Error("process_exited");
      const consume = (async () => {
        try {
          for await (const raw of q) { const result = normalizeClaude(state, raw, input.cwd); state = result.state; for (const event of result.events) emit(event); }
          if (!state.terminal) emit({ type: "turn.failed", code: "process_exited" });
        } catch (error) {
          // SDK exit errors can precede group disappearance; neither cleanup nor provider errors prove process death.
          if (!childExited || !object(error) || (error.errorClass !== "process_exited_nonzero" && error.errorClass !== "process_killed_by_signal")) throw error;
          const result = endTransport(state); state = result.state;
          for (const event of result.events) emit(event);
        } finally { finished = true; expire(); void group?.stop(); }
      })();
      // The SDK starts consuming input as part of its initialization handshake.
      if (!deliver) { controller.abort(); void group?.stop(); throw new Error("session_unavailable"); }
      deliver({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, session_id: sessionId });
      await consume;
    },
    answer(id, option) {
      const request = pending.get(id); if (!request || !["allow", "deny", ...(request.suggestions.length ? ["always"] : [])].includes(option)) return false;
      pending.delete(id); request.resolve(option === "deny" ? { behavior: "deny", message: "Denied by the user." } : { behavior: "allow", updatedInput: request.input, ...(option === "always" ? { updatedPermissions: request.suggestions } : {}) });
      emit({ type: "permission.resolved", requestId: id, optionId: option }); return true;
    },
    async stop() { state = { ...state, stop: "user" }; expire(); controller.abort(); deliver?.(null); await group?.stop(); },
    async close() { state = { ...state, stop: "appQuit" }; expire(); controller.abort(); deliver?.(null); await group?.stop(); },
  };
}
