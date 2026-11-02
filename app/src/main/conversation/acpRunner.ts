import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { signInLink } from "../agentAuth/antigravity";
import { ACP_PROTOCOL_VERSION, AcpConnection, acpEnded, acpPermission, acpPromptDone, acpPromptFailed, initialAcp, normalizeAcp, type AcpChoice, type AcpTransport } from "./acp";
import { acpInitialize, acpSessionNew, type HandshakeVerdict } from "./handshake";
import { OwnedGroup } from "./process";
import { object } from "./sessions";
import { acpOption, parseAcpModels, parseAcpModes, type ModelOption } from "./models";
import { acpModeFor, type AcpModes } from "./permissionMode";
import { imageType, MAX_IMAGE_BYTES } from "../attachments";
import type { Prepared, Runner } from "./service";
import type { AttachmentRecord, EventPayload } from "./types";
const OPEN_TIMEOUT_MS = 60_000;
// ACP stop reasons that mean the agent ran the prompt (protocol schema StopReason, minus "cancelled").
const RAN = new Set(["end_turn", "max_tokens", "max_turn_requests", "refusal"]);
const CANCEL_WAIT_MS = 5000;
// One server per turn: it is opened for a prompt, resumes the session with session/load and is stopped when the turn
// ends, so the account lease (and the plaintext working credential) never outlives a running turn.
export async function openAcp(input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void): Promise<Runner> {
  const child = spawn(input.command, input.args ?? [], { cwd: input.cwd, env: input.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let group: OwnedGroup | undefined, dead = false, failure = "", prompting = false, finished = false;
  let state: AcpTransport = initialAcp(randomUUID());
  const permissions = new Map<string, { rpc: string | number; choices: AcpChoice[] }>();
  let settle: (() => void) | undefined;
  const apply = (result: { state: AcpTransport; events: EventPayload[] }) => {
    state = result.state; for (const event of result.events) emit(event);
    if (state.terminal) { expire(); settle?.(); }
  };
  const expire = () => {
    for (const [requestId, pending] of permissions) {
      permissions.delete(requestId);
      try { acp.respond(pending.rpc, { outcome: { outcome: "cancelled" } }); } catch { /* the server is gone */ }
      emit({ type: "permission.resolved", requestId, optionId: "expired" });
    }
  };
  const acp = new AcpConnection(line => { if (dead || !child.stdin.writable) throw new Error("process_exited"); child.stdin.write(line); }, (params, rpc) => {
    const requestId = randomUUID();
    const request = prompting && !state.terminal && params.sessionId === sessionId ? acpPermission(params, requestId) : null;
    // Outside a running turn, or with no option doan can offer, the request is answered as cancelled (ACP's reply for a
    // turn that is no longer running) rather than left blocking the agent.
    if (!request) { try { acp.respond(rpc, { outcome: { outcome: "cancelled" } }); } catch { /* gone */ } return; }
    // The request's toolCall can name what the updates do not (Copilot's apply_patch path is only in rawInput.fileName).
    if (object(params.toolCall)) apply(normalizeAcp(state, { ...params.toolCall, sessionUpdate: "tool_call_update", status: "pending" }, input.cwd));
    permissions.set(requestId, { rpc, choices: request.choices }); emit(request.event);
  }, (method, params) => {
    if (method !== "session/update" || !prompting || params.sessionId !== sessionId || !object(params.update)) return;
    apply(normalizeAcp(state, params.update, input.cwd));
  }, detail => { failure = detail; void group?.stop(); });
  let sessionId = input.sessionId ?? "", models: ModelOption[] = [], modes: AcpModes | undefined, images = false;
  const decoder = new StringDecoder("utf8");
  child.stdout.on("data", (bytes: Buffer) => acp.receive(decoder.write(bytes)));
  // Antigravity asks for a browser sign-in when its stored token no longer works; a run never signs in.
  const errors = new StringDecoder("utf8"); let stderr = "";
  child.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + errors.write(bytes)).slice(-65536);
    let end: number;
    while ((end = stderr.indexOf("\n")) >= 0) {
      const line = stderr.slice(0, end); stderr = stderr.slice(end + 1);
      if (signInLink(line)) { failure = "Authentication required: the stored sign-in no longer works"; void group?.stop(); }
    }
  });
  const transportDied = () => {
    if (dead) return; dead = true; acp.close();
    if (prompting) apply(acpEnded(state));
    void group?.stop();
  };
  child.stdin.on("error", transportDied); child.stdout.once("end", transportDied);
  child.once("exit", () => { transportDied(); group?.childExited(); });
  child.once("error", () => { transportDied(); if (!child.pid) exited(); else group?.childExited(); });
  if (child.pid) {
    const owned = new OwnedGroup(child.pid, undefined, undefined, exited); group = owned;
    registerStop(() => { expire(); acp.close(); return owned.stop(); });
  }
  // A failed request answers nothing about the protocol shape here, so only replies are judged, before any refusal.
  const judge = (verdict: HandshakeVerdict) => { if (verdict === "incompatible") input.incompatible?.(); else if (verdict === "compatible") input.compatible?.(); };
  const opened = (async () => {
    const init = await acp.request("initialize", { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "doan", version: "0.1.0" } }, OPEN_TIMEOUT_MS);
    judge(acpInitialize(input.runtime, { result: init }, input.authenticate, !!input.sessionId));
    if (!object(init) || init.protocolVersion !== ACP_PROTOCOL_VERSION) throw new Error("runtime_unsupported");
    const capabilities = object(init.agentCapabilities) ? init.agentCapabilities : {};
    images = object(capabilities.promptCapabilities) && capabilities.promptCapabilities.image === true;
    if (input.sessionId && capabilities.loadSession !== true) throw new Error("session_unavailable");
    if (input.authenticate) {
      const methods = Array.isArray(init.authMethods) ? init.authMethods.filter(object).map(m => m.id) : [];
      if (!methods.includes(input.authenticate)) throw new Error("runtime_unsupported");
      await acp.request("authenticate", { methodId: input.authenticate }, OPEN_TIMEOUT_MS);
    }
    let current: unknown;
    if (input.sessionId) current = await acp.request("session/load", { sessionId: input.sessionId, cwd: input.cwd, mcpServers: [] }, OPEN_TIMEOUT_MS);
    else {
      const created = await acp.request("session/new", { cwd: input.cwd, mcpServers: [] }, OPEN_TIMEOUT_MS);
      judge(acpSessionNew(input.runtime, { result: created }));
      if (!object(created) || typeof created.sessionId !== "string" || !created.sessionId || created.sessionId.length > 512) throw new Error("session_unavailable");
      sessionId = created.sessionId; models = parseAcpModels(created); modes = parseAcpModes(created); current = created;
    }
    // session/load comes back on the default model (Antigravity, P1), so the choice is set again after every open,
    // unless the session already runs it: the setter is unverified for Copilot's only model.
    const running = object(current) && object(current.models) ? current.models.currentModelId : undefined;
    if (input.model && input.model !== running) await acp.request("session/set_config_option", { sessionId, configId: "model", value: input.model }, OPEN_TIMEOUT_MS);
    // A session keeps its last mode (and Copilot its allow_all) across session/load, so the chosen mode is set after
    // every open, Default included; a value the session already has is not set again. A mode this provider cannot
    // take sets Default instead, since leaving the session alone could keep a wider mode from an earlier turn.
    // Nothing when the server listed no mode the mapping table names (permission-mode design 'ACP').
    const acpModes = parseAcpModes(current), chosen = acpModeFor(input.runtime, input.permissionMode ?? "default", acpModes);
    for (const setting of chosen.length ? chosen : acpModeFor(input.runtime, "default", acpModes)) {
      if (setting.value !== acpCurrent(current, setting.configId)) await acp.request("session/set_config_option", { sessionId, configId: setting.configId, value: setting.value }, OPEN_TIMEOUT_MS);
    }
  })();
  try { await opened; if (dead) throw new Error("process_exited"); }
  catch (error) {
    acp.close(); void group?.stop();
    const detail = failure || (error instanceof Error ? error.message : "");
    throw new Error(dead && !failure ? "process_exited" : ["runtime_unsupported", "session_unavailable"].includes(detail) ? detail : transportCode(detail));
  }
  const stopTurn = async (reason: "user" | "appQuit") => {
    state = { ...state, stop: state.stop ?? reason }; expire();
    if (!prompting || finished) { await group?.stop(); return; }
    try { acp.notify("session/cancel", { sessionId }); } catch { /* gone */ }
    // The prompt answers "cancelled" once the agent stopped; a server that ignores cancel is stopped with its group.
    await Promise.race([new Promise<void>(resolve => { if (state.terminal) resolve(); else settle = resolve; }), new Promise(resolve => setTimeout(resolve, CANCEL_WAIT_MS).unref())]);
    await group?.stop();
  };
  return {
    sessionId,
    models: async () => ({ models, ...(modes ? { modes } : {}) }),
    async send(prompt, turnId, attachments = []) {
      if (dead || prompting || finished) throw new Error("process_exited");
      state = initialAcp(turnId); prompting = true;
      try {
        // Antigravity's view_file refuses paths outside the workspace (P2), so it also gets the images themselves.
        const blocks = input.runtime === "antigravity" && images ? (await Promise.all(attachments.map(imageBlock))).flat() : [];
        const result = await acp.request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }, ...blocks] }, null);
        apply(acpPromptDone(state, result));
        // A prompt the agent ran to a stop is the provider accepting the dedicated login (Copilot's status costs a
        // request). A cancel or a malformed answer can come before any model request, so it proves nothing.
        if (object(result) && typeof result.stopReason === "string" && RAN.has(result.stopReason)) input.confirm?.();
      } catch (error) {
        if (!state.terminal) apply(dead && !failure ? acpEnded(state) : acpPromptFailed(state, failure || (error instanceof Error ? error.message : "")));
      } finally { finished = true; expire(); void group?.stop(); }
    },
    answer(id, option) {
      const pending = permissions.get(id); const choice = pending?.choices.find(c => c.option.id === option);
      if (!pending || !choice || state.terminal) return false;
      try { acp.respond(pending.rpc, { outcome: { outcome: "selected", optionId: choice.optionId } }); } catch { return false; }
      permissions.delete(id); emit({ type: "permission.resolved", requestId: id, optionId: option }); return true;
    },
    stop: () => stopTurn("user"),
    close: () => stopTurn("appQuit"),
  };
}
// Only a file that still carries an image signature and is within the paste cap; anything else goes by path alone.
// Read asynchronously: up to ten 50 MB images would otherwise hold main.
async function imageBlock(attachment: AttachmentRecord): Promise<{ type: "image"; mimeType: string; data: string }[]> {
  if (attachment.kind !== "image") return [];
  const file = await open(attachment.path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW).catch(() => null);
  if (!file) return [];
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) return [];
    const bytes = Buffer.alloc(stat.size); if ((await file.read(bytes, 0, stat.size, 0)).bytesRead !== stat.size) return [];
    const mimeType = imageType(bytes.subarray(0, 16));
    return mimeType ? [{ type: "image", mimeType, data: bytes.toString("base64") }] : [];
  } catch { return []; } finally { await file.close(); }
}
// The value a session reply says an option has now: the mode from modes.currentModeId, or from the configOptions entry.
function acpCurrent(result: unknown, configId: "mode" | "allow_all"): unknown {
  const listed = acpOption(result, configId)?.currentValue;
  if (listed !== undefined || configId !== "mode") return listed;
  return object(result) && object(result.modes) ? result.modes.currentModeId : undefined;
}
function transportCode(detail: string): string {
  if (/authentication required|not logged in|unauthorized|sign in/i.test(detail)) return "not_logged_in";
  if (/session.*(not found|unavailable|exists)/i.test(detail)) return "session_unavailable";
  return /timed out/i.test(detail) ? "process_exited" : "session_unavailable";
}
