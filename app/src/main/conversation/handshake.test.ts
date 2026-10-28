import { describe, expect, it } from "vitest";
import { acpInitialize, acpSessionNew, codexInitialize, codexThreadStart, type HandshakeReply } from "./handshake";
import type { Provider } from "../agentAuth/types";

const rpc: HandshakeReply = { failed: "rpc" }, lost: HandshakeReply = { failed: "lost" };
const init = (extra: Record<string, unknown> = {}): HandshakeReply => ({ result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [{ id: "cursor_login" }], ...extra } });

describe("Codex handshake", () => {
  it("records a new session's initialize error or non-object result as incompatible", () => {
    expect(codexInitialize(rpc, false)).toBe("incompatible");
    for (const result of [null, "ok", [], 1]) expect(codexInitialize({ result }, false)).toBe("incompatible");
    // A passing initialize decides nothing yet for a new session: thread/start is still part of the handshake.
    expect(codexInitialize({ result: {} }, false)).toBeNull();
  });
  it("records a thread/start result without a thread ID as incompatible and a valid one as compatible", () => {
    for (const result of [null, {}, { thread: null }, { thread: {} }, { thread: { id: "" } }, { thread: { id: 7 } }]) expect(codexThreadStart({ result })).toBe("incompatible");
    expect(codexThreadStart({ result: { thread: { id: "019a-thread" } } })).toBe("compatible");
  });
  it("never records exits, timeouts, write failures, buffer limits or thread/start errors", () => {
    // Exits, RPC timeouts, write failures and buffer or queue limits all reach the runner as a lost reply.
    expect(codexInitialize(lost, false)).toBeNull(); expect(codexInitialize(lost, true)).toBeNull();
    expect(codexThreadStart(lost)).toBeNull();
    // A thread/start error is a login, rate limit or workspace answer, not a protocol shape.
    expect(codexThreadStart(rpc)).toBeNull();
  });
  it("records nothing incompatible for a resume and clears on its passing initialize", () => {
    expect(codexInitialize(rpc, true)).toBeNull();
    expect(codexInitialize({ result: null }, true)).toBeNull();
    expect(codexInitialize({ result: {} }, true)).toBe("compatible");
  });
});

describe("ACP handshake", () => {
  it.each(["cursor", "copilot"] as const)("records %s initialize results doan cannot read as incompatible", provider => {
    for (const result of [null, "ok", [], {}, { protocolVersion: 2 }, { protocolVersion: "1" }]) expect(acpInitialize(provider, { result }, undefined, false)).toBe("incompatible");
    expect(acpInitialize(provider, init(), undefined, false)).toBeNull();
  });
  it("records a missing required auth method as incompatible", () => {
    expect(acpInitialize("cursor", init(), "cursor_login", false)).toBeNull();
    expect(acpInitialize("cursor", init({ authMethods: [{ id: "other" }] }), "cursor_login", false)).toBe("incompatible");
    expect(acpInitialize("cursor", init({ authMethods: undefined }), "cursor_login", false)).toBe("incompatible");
  });
  it.each(["cursor", "copilot"] as const)("records a %s session/new result without a usable session ID as incompatible", provider => {
    for (const result of [null, {}, { sessionId: "" }, { sessionId: 3 }, { sessionId: "x".repeat(513) }]) expect(acpSessionNew(provider, { result })).toBe("incompatible");
    expect(acpSessionNew(provider, { result: { sessionId: "s-1" } })).toBe("compatible");
  });
  it("never records request errors, exits or timeouts", () => {
    for (const reply of [rpc, lost]) {
      expect(acpInitialize("cursor", reply, undefined, false)).toBeNull();
      expect(acpSessionNew("copilot", reply)).toBeNull();
    }
  });
  it("records nothing incompatible for a resume, including a server without loadSession, and clears on a passing initialize", () => {
    expect(acpInitialize("cursor", { result: null }, undefined, true)).toBeNull();
    expect(acpInitialize("cursor", init({ agentCapabilities: {} }), undefined, true)).toBeNull();
    expect(acpInitialize("cursor", init({ authMethods: [] }), "cursor_login", true)).toBeNull();
    expect(acpInitialize("cursor", init(), "cursor_login", true)).toBe("compatible");
  });
  it.each(["antigravity", "claude", "codex"] as Provider[])("records nothing for %s, whose ACP or SDK handshake doan does not judge", provider => {
    expect(acpInitialize(provider, { result: null }, undefined, false)).toBeNull();
    expect(acpInitialize(provider, init(), undefined, true)).toBeNull();
    expect(acpSessionNew(provider, { result: {} })).toBeNull();
    expect(acpSessionNew(provider, { result: { sessionId: "s-1" } })).toBeNull();
  });
});
