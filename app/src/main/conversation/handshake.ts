import { ACP_PROTOCOL_VERSION } from "./acp";
import { object } from "./sessions";
import type { Provider } from "../agentAuth/types";

// One handshake request as a runner saw it. rpc: the server answered with a JSON-RPC error. lost: no answer at all
// (exit, timeout, write failure, buffer or queue limit), which says nothing about the installed version.
export type HandshakeReply = { result: unknown } | { failed: "rpc" | "lost" };
// incompatible: record this installed version. compatible: clear its record. null: this step decides neither.
export type HandshakeVerdict = "incompatible" | "compatible" | null;
// Only a new session's handshake is evidence about the version: a resume can fail for one conversation (a rollout
// from a newer Codex after a downgrade), so it never records, and its passing initialize clears.
export function codexInitialize(reply: HandshakeReply, resume: boolean): HandshakeVerdict {
  if ("failed" in reply) return reply.failed === "rpc" && !resume ? "incompatible" : null;
  if (!object(reply.result)) return resume ? null : "incompatible";
  return resume ? "compatible" : null;
}
// A thread/start error is a login, rate-limit or account answer, not a protocol shape.
export function codexThreadStart(reply: HandshakeReply): HandshakeVerdict {
  if ("failed" in reply) return null;
  const result = reply.result;
  return object(result) && object(result.thread) && typeof result.thread.id === "string" && result.thread.id ? "compatible" : "incompatible";
}
// Antigravity's server is doan's sha-pinned download and Claude runs through the bundled SDK; neither is judged here.
function judged(provider: Provider): boolean { return provider === "cursor" || provider === "copilot"; }
export function acpInitialize(provider: Provider, reply: HandshakeReply, authenticate: string | undefined, resume: boolean): HandshakeVerdict {
  if (!judged(provider) || "failed" in reply) return null;
  const init = reply.result;
  const valid = object(init) && init.protocolVersion === ACP_PROTOCOL_VERSION &&
    (!authenticate || (Array.isArray(init.authMethods) && init.authMethods.some(m => object(m) && m.id === authenticate)));
  // A server without loadSession refuses one resume; it is not a protocol shape doan cannot read.
  if (resume) return valid && object(init.agentCapabilities) && init.agentCapabilities.loadSession === true ? "compatible" : null;
  return valid ? null : "incompatible";
}
export function acpSessionNew(provider: Provider, reply: HandshakeReply): HandshakeVerdict {
  if (!judged(provider) || "failed" in reply) return null;
  const created = reply.result;
  return object(created) && typeof created.sessionId === "string" && created.sessionId && created.sessionId.length <= 512 ? "compatible" : "incompatible";
}
