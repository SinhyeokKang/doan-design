import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { query, type PermissionResult, type PermissionUpdate, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { CodexDispatcher } from "./dispatcher";
import { OwnedGroup } from "./process";
import { object } from "./sessions";
import { endTransport, initialTransport, normalizeClaude, transportError } from "./transport";
import type { OpenRunner, Prepared, Runner } from "./service";
import type { EventPayload } from "./types";
export const openRunner: OpenRunner = (input, emit, exited, registerStop) => input.runtime === "claude" ? openClaude(input, emit, exited, registerStop) : openCodex(input, emit, exited, registerStop);
function timeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process_exited")), 10000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
async function openCodex(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  const child = spawn(input.command, ["app-server"], { cwd: input.cwd, env: input.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
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
    await dispatcher.request("initialize", { clientInfo: { name: "doan", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    write({ method: "initialized" });
    const result = await dispatcher.request(input.sessionId ? "thread/resume" : "thread/start", input.sessionId ? { threadId: input.sessionId } : { cwd: input.cwd });
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
      try { result = await dispatcher.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }] }); } catch (error) { startingTurn = false; for (const raw of queued.splice(0)) dispatcher.receive(raw); throw error; }
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
async function openClaude(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  const sessionId = input.sessionId ?? randomUUID(); const controller = new AbortController();
  let group: OwnedGroup | undefined, state = initialTransport(), deliver: ((message: SDKUserMessage | null) => void) | undefined;
  const pending = new Map<string, { input: Record<string, unknown>; suggestions: PermissionUpdate[]; resolve(value: PermissionResult): void }>();
  let finished = false, childExited = false;
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    const message = await new Promise<SDKUserMessage | null>(resolve => { deliver = resolve; });
    if (message) yield message;
  }
  const q = query({ prompt: messages(), options: {
    cwd: input.cwd, env: input.env, pathToClaudeCodeExecutable: input.command, settingSources: ["user", "project", "local"], includePartialMessages: true,
    abortController: controller, ...(input.sessionId ? { resume: input.sessionId } : { sessionId }),
    spawnClaudeCodeProcess(options) {
      const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      if (child.pid) {
        const owned = new OwnedGroup(child.pid, undefined, undefined, exited); group = owned;
        registerStop(() => { controller.abort(); deliver?.(null); return owned.stop(); });
      }
      child.stderr.resume(); child.once("exit", () => { childExited = true; group?.childExited(); }); child.once("error", () => { if (!child.pid) exited(); else group?.childExited(); });
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
  try { await timeout(q.initializationResult()); } catch (error) { controller.abort(); void group?.stop(); throw error; }
  return {
    sessionId,
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
