import { describe, expect, it } from "vitest";
import { judgeConnection } from "./connection";
import { initialAuthState, transition } from "./state";
import type { AccountConnection, AuthEvent, AuthState, ConversationOwner, SessionFacts } from "./types";

const connection = (over: Partial<AccountConnection> = {}): AccountConnection => ({
  provider: "claude", connectionId: "conn-1", profile: "claude-1",
  account: { id: "acct-1", workspace: "team-1", displayName: "Ada", email: "ada@example.com" }, ...over,
});
const owner: ConversationOwner = { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: "team-1", profile: "claude-1" };
const session: SessionFacts = { exists: true, occupancy: "free" };
function step(state: AuthState, event: AuthEvent): AuthState {
  const result = transition(state, event); if (!result.ok) throw new Error(result.reason); return result.state;
}
function connected(value = connection()): AuthState {
  return step(step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 }), { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: value } });
}

describe("conversation account judgment", () => {
  it("resumes only the same account, workspace, profile and an existing free session", () => {
    expect(judgeConnection(owner, connected(), session)).toEqual({ decision: "resume", rebind: false });
  });
  it("rebinds a same-account sign-in only after every identity check passes", () => {
    expect(judgeConnection(owner, connected(connection({ connectionId: "conn-2" })), session)).toEqual({ decision: "resume", rebind: true });
  });
  it("never resumes on a matching email alone", () => {
    const other = connection({ account: { id: "acct-2", workspace: "team-1", email: "ada@example.com" } });
    expect(judgeConnection(owner, connected(other), session)).toEqual({ decision: "reject", cause: "account_mismatch" });
    const anonymous = connection({ connectionId: "conn-2", account: { id: null, workspace: "team-1", email: "ada@example.com" } });
    expect(judgeConnection(owner, connected(anonymous), session)).toEqual({ decision: "reject", cause: "account_unverifiable" });
    expect(judgeConnection({ ...owner, accountId: null }, connected(connection({ connectionId: "conn-2" })), session)).toEqual({ decision: "reject", cause: "account_unverifiable" });
  });
  it("resumes a connection without a stable account ID only on the connection the conversation was bound to", () => {
    const anonymous = connection({ account: { id: null, workspace: "team-1", email: "ada@example.com" } });
    const nullOwner: ConversationOwner = { ...owner, accountId: null };
    expect(judgeConnection(nullOwner, connected(anonymous), session)).toEqual({ decision: "resume", rebind: false });
    // Any later stored sign-in, including the same account's reauth, is a new connection that cannot be proven the same.
    expect(judgeConnection(nullOwner, connected({ ...anonymous, connectionId: "conn-2" }), session)).toEqual({ decision: "reject", cause: "account_unverifiable" });
    expect(judgeConnection(nullOwner, connected(anonymous), { exists: false, occupancy: "free" })).toEqual({ decision: "reject", cause: "session_unavailable" });
    expect(judgeConnection({ ...nullOwner, profile: "claude-2" }, connected(anonymous), session)).toEqual({ decision: "reject", cause: "profile_mismatch" });
  });
  it("rejects another workspace, profile or provider", () => {
    expect(judgeConnection(owner, connected(connection({ account: { id: "acct-1", workspace: null } })), session)).toEqual({ decision: "reject", cause: "workspace_mismatch" });
    expect(judgeConnection(owner, connected(connection({ profile: "claude-2" })), session)).toEqual({ decision: "reject", cause: "profile_mismatch" });
    expect(judgeConnection({ ...owner, provider: "codex" }, connected(), session)).toEqual({ decision: "reject", cause: "provider_mismatch" });
  });
  it("routes legacy external conversations to their existing profile checks", () => {
    expect(judgeConnection({ kind: "legacy-external" }, connected(), session)).toEqual({ decision: "legacy" });
    expect(judgeConnection({ kind: "legacy-external" }, initialAuthState("claude", null), session)).toEqual({ decision: "legacy" });
  });
  it("asks for authentication when the account is gone or expired", () => {
    expect(judgeConnection(owner, initialAuthState("claude", null), session)).toEqual({ decision: "reauth", cause: "not_connected" });
    const expired = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "expired" } });
    expect(judgeConnection(owner, expired, session)).toEqual({ decision: "reauth", cause: "reauth_required" });
  });
  it("rejects while authentication is changing, unverified, failed sign-out or mismatched", () => {
    expect(judgeConnection(owner, step(connected(), { type: "signIn", attemptId: "a2", owner: 1 }), session)).toEqual({ decision: "reject", cause: "busy" });
    expect(judgeConnection(owner, step(connected(), { type: "signOut", attemptId: "o1", running: false }), session)).toEqual({ decision: "reject", cause: "busy" });
    expect(judgeConnection(owner, initialAuthState("claude", connection()), session)).toEqual({ decision: "reject", cause: "unverified" });
    const out = step(step(connected(), { type: "signOut", attemptId: "o1", running: false }), { type: "signedOut", attemptId: "o1", result: { status: "failed" } });
    expect(judgeConnection(owner, out, session)).toEqual({ decision: "reject", cause: "sign_out_failed" });
    const mismatch = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "connected", account: { id: "acct-9", workspace: "team-1" } } });
    expect(judgeConnection(owner, mismatch, session)).toEqual({ decision: "reject", cause: "account_mismatch" });
  });
  it("requires the real session and its occupancy, not just a matching account", () => {
    expect(judgeConnection(owner, connected(), { exists: false, occupancy: "free" })).toEqual({ decision: "reject", cause: "session_unavailable" });
    expect(judgeConnection(owner, connected(), { exists: true, occupancy: "occupied" })).toEqual({ decision: "reject", cause: "session_in_use" });
    expect(judgeConnection(owner, connected(), { exists: true, occupancy: "unknown" })).toEqual({ decision: "reject", cause: "session_unavailable" });
  });
});
