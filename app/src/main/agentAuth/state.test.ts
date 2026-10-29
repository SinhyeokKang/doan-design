import { describe, expect, it } from "vitest";
import { authStatus, initialAuthState, readiness, recordedFacts, transition } from "./state";
import { judgeConnection } from "./connection";
import { PROVIDERS, validProvider, type AccountConnection, type AuthEvent, type AuthState, type Provider, type ToolFacts } from "./types";
import type { Runtime } from "../conversation/types";

const connection = (over: Partial<AccountConnection> = {}): AccountConnection => ({
  provider: "claude", connectionId: "conn-1", profile: "claude-1",
  account: { id: "acct-1", workspace: "org-1", displayName: "Ada", email: "ada@example.com" }, ...over,
});
const tools: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const owner = { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: "org-1", profile: "claude-1" } as const;
const free = { exists: true, occupancy: "free" } as const;
function step(state: AuthState, event: AuthEvent): AuthState {
  const result = transition(state, event); if (!result.ok) throw new Error(result.reason); return result.state;
}
function connected(): AuthState {
  const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
  return step(signing, { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection() } });
}

describe("providers", () => {
  it("fixes the five app providers apart from the two external session runtimes", () => {
    expect(PROVIDERS).toEqual(["claude", "codex", "cursor", "antigravity", "copilot"]);
    expect(PROVIDERS.every(validProvider)).toBe(true);
    for (const value of ["gemini", "Claude", "", null, 1]) expect(validProvider(value)).toBe(false);
    const provider: Provider = "cursor";
    // @ts-expect-error A provider is not an external session runtime.
    const runtime: Runtime = provider;
    expect(runtime).toBe("cursor");
  });
});

describe("auth transitions", () => {
  it("starts disconnected, or connected but unverified from stored metadata", () => {
    expect(initialAuthState("claude", null)).toMatchObject({ phase: "disconnected", connection: null, attempt: null, generation: 0, verified: false });
    const stored = initialAuthState("claude", connection());
    expect(stored).toMatchObject({ phase: "connected", verified: false, expired: false });
    expect(readiness(stored, tools)).toEqual({ ready: false, cause: "unverified", action: "retry" });
    expect(() => initialAuthState("codex", connection())).toThrow("Invalid stored connection");
  });
  it("becomes connected only after storage is confirmed", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    expect(signing).toMatchObject({ phase: "signingIn", attempt: { id: "a1", kind: "signIn", owner: 1, cancelled: false } });
    expect(readiness(signing, tools)).toEqual({ ready: false, cause: "busy", action: "wait" });
    const failed = step(signing, { type: "signedIn", attemptId: "a1", result: { status: "failed", code: "storage_failed", detail: "keychain write failed" } });
    expect(failed).toMatchObject({ phase: "error", connection: null, attempt: null, error: { code: "storage_failed" }, generation: 0 });
    expect(readiness(failed, tools)).toEqual({ ready: false, cause: "not_connected", action: "signIn" });
    const done = connected();
    expect(done).toMatchObject({ phase: "connected", verified: true, attempt: null, error: null, generation: 1, connection: connection() });
    expect(readiness(done, tools)).toEqual({ ready: true });
  });
  it("ignores late results from cancelled, replaced and unknown attempts", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    const cancelled = step(signing, { type: "cancel", attemptId: "a1", owner: 1 });
    expect(cancelled).toMatchObject({ phase: "signingIn", attempt: { id: "a1", cancelled: true } });
    const late = transition(cancelled, { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection() } });
    expect(late).toEqual({ ok: false, reason: "stale", state: cancelled });
    expect(transition(cancelled, { type: "signedIn", attemptId: "other", result: { status: "stored", connection: connection() } })).toMatchObject({ ok: false, reason: "stale" });
    const settled = step(cancelled, { type: "settled", attemptId: "a1" });
    expect(settled).toMatchObject({ phase: "disconnected", attempt: null, connection: null });
    expect(transition(settled, { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection() } })).toMatchObject({ ok: false, reason: "stale" });
    expect(transition(signing, { type: "settled", attemptId: "a1" })).toMatchObject({ ok: false, reason: "invalid" });
    const checking = step(connected(), { type: "check", attemptId: "c1" });
    const replaced = step(checking, { type: "signIn", attemptId: "a2", owner: 1 });
    expect(transition(replaced, { type: "checked", attemptId: "c1", result: { status: "expired" } })).toMatchObject({ ok: false, reason: "stale" });
  });
  it("refuses new writes while an attempt runs or a cancelled one is still cleaning up", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    expect(transition(signing, { type: "signIn", attemptId: "a2", owner: 1 })).toMatchObject({ ok: false, reason: "busy" });
    expect(transition(signing, { type: "check", attemptId: "c1" })).toMatchObject({ ok: false, reason: "busy" });
    const cancelled = step(signing, { type: "cancel", attemptId: "a1", owner: 1 });
    expect(transition(cancelled, { type: "signIn", attemptId: "a2", owner: 1 })).toMatchObject({ ok: false, reason: "busy" });
    const out = step(connected(), { type: "signOut", attemptId: "o1", running: false });
    expect(transition(out, { type: "signIn", attemptId: "a2", owner: 1 })).toMatchObject({ ok: false, reason: "busy" });
    expect(transition(out, { type: "cancel", attemptId: "o1", owner: 1 })).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("lets only the owning window cancel and cancels when that window closes", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    expect(transition(signing, { type: "cancel", attemptId: "a1", owner: 2 })).toMatchObject({ ok: false, reason: "not_owner" });
    expect(transition(signing, { type: "ownerClosed", owner: 2 })).toEqual({ ok: true, outcome: "unchanged", state: signing });
    expect(step(signing, { type: "ownerClosed", owner: 1 })).toMatchObject({ attempt: { id: "a1", cancelled: true } });
  });
  it("keeps the connection and records a retryable error when a check fails", () => {
    const checking = step(connected(), { type: "check", attemptId: "c1" });
    expect(checking.phase).toBe("checking");
    const failed = step(checking, { type: "checked", attemptId: "c1", result: { status: "failed", code: "network", detail: "ENOTFOUND" } });
    expect(failed).toMatchObject({ phase: "connected", verified: true, connection: connection(), error: { code: "network" } });
    expect(readiness(failed, tools)).toEqual({ ready: true });
    const unverified = step(step(initialAuthState("claude", connection()), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "failed", code: "check_failed" } });
    expect(unverified).toMatchObject({ phase: "connected", verified: false, connection: connection(), error: { code: "check_failed" } });
    expect(readiness(unverified, tools)).toEqual({ ready: false, cause: "unverified", action: "retry" });
  });
  it("requires reauthentication on expiry or a vanished login without dropping the connection", () => {
    for (const result of [{ status: "expired" }, { status: "disconnected" }] as const) {
      const state = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result });
      expect(state).toMatchObject({ phase: "reauthRequired", expired: true, connection: connection(), generation: 1 });
      expect(readiness(state, tools)).toEqual({ ready: false, cause: "reauth_required", action: "reauth" });
    }
  });
  it("blocks runs instead of replacing the connection when a check sees another account", () => {
    const check = (account: AccountConnection["account"]) =>
      step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "connected", account } });
    const other = check({ id: "acct-2", workspace: "org-1", email: "ada@example.com" });
    expect(other).toMatchObject({ phase: "error", error: { code: "account_mismatch" }, connection: connection() });
    expect(readiness(other, tools)).toEqual({ ready: false, cause: "account_mismatch", action: "reauth" });
    expect(check({ id: "acct-1", workspace: "team-2" })).toMatchObject({ phase: "error", error: { code: "account_mismatch" } });
    expect(check({ id: "acct-1", workspace: "org-1", email: "renamed@example.com" })).toMatchObject({ phase: "connected", verified: true, error: null });
  });
  it("never promotes a login that was not stored", () => {
    const state = step(step(initialAuthState("claude", null), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "connected", account: connection().account } });
    expect(state).toMatchObject({ phase: "disconnected", connection: null, verified: false });
  });
  it("requires stopped runs for sign-out and keeps runs blocked when removal fails", () => {
    expect(transition(initialAuthState("claude", null), { type: "signOut", attemptId: "o1", running: false })).toMatchObject({ ok: false, reason: "not_connected" });
    expect(transition(connected(), { type: "signOut", attemptId: "o1", running: true })).toMatchObject({ ok: false, reason: "stop_required" });
    const out = step(connected(), { type: "signOut", attemptId: "o1", running: false });
    expect(out.phase).toBe("signingOut");
    expect(readiness(out, tools)).toEqual({ ready: false, cause: "busy", action: "wait" });
    const failed = step(out, { type: "signedOut", attemptId: "o1", result: { status: "failed", detail: "EACCES" } });
    expect(failed).toMatchObject({ phase: "error", connection: connection(), error: { code: "sign_out_failed" } });
    expect(readiness(failed, tools)).toEqual({ ready: false, cause: "sign_out_failed", action: "signOut" });
    expect(transition(failed, { type: "signIn", attemptId: "a2", owner: 1 })).toMatchObject({ ok: false, reason: "sign_out_failed" });
    const removed = step(step(failed, { type: "signOut", attemptId: "o2", running: false }), { type: "signedOut", attemptId: "o2", result: { status: "removed" } });
    expect(removed).toMatchObject({ phase: "disconnected", connection: null, error: null, verified: false, generation: 2 });
  });
  it("restores a persisted sign-out failure so runs stay blocked after a restart", () => {
    const failed = initialAuthState("claude", connection(), true);
    expect(failed).toMatchObject({ phase: "error", connection: connection(), verified: false, error: { code: "sign_out_failed" } });
    expect(readiness(failed, tools)).toEqual({ ready: false, cause: "sign_out_failed", action: "signOut" });
    expect(transition(failed, { type: "signIn", attemptId: "a1", owner: 1 })).toMatchObject({ ok: false, reason: "sign_out_failed" });
    expect(() => initialAuthState("claude", null, true)).toThrow("Invalid stored connection");
  });
  it("lets an explicit stop take the sign-out or replacement while runs are still stopping", () => {
    expect(step(connected(), { type: "signOut", attemptId: "o1", running: true, stop: true }).phase).toBe("signingOut");
    expect(transition(connected(), { type: "signOut", attemptId: "o1", running: true, stop: false })).toMatchObject({ ok: false, reason: "stop_required" });
  });
  it("unverifies a connection whose refreshed credential could not be written back, keeping a sign-out failure first", () => {
    const lost = step(connected(), { type: "writeBackFailed", detail: "key_unavailable" });
    expect(lost).toMatchObject({ phase: "connected", connection: connection(), verified: false, error: { code: "storage_failed", detail: "key_unavailable" } });
    expect(readiness(lost, tools)).toEqual({ ready: false, cause: "unverified", action: "retry" });
    const checking = step(connected(), { type: "check", attemptId: "c1" });
    expect(step(checking, { type: "writeBackFailed" })).toMatchObject({ attempt: { id: "c1" }, verified: false, error: { code: "storage_failed" } });
    const none = initialAuthState("claude", null);
    expect(transition(none, { type: "writeBackFailed" })).toEqual({ ok: true, outcome: "unchanged", state: none });
    const out = step(connected(), { type: "signOut", attemptId: "o1", running: false });
    const failed = step(out, { type: "signedOut", attemptId: "o1", result: { status: "failed" } });
    expect(step(failed, { type: "writeBackFailed" })).toMatchObject({ verified: false, error: { code: "sign_out_failed" } });
  });
  it("unverifies the previous connection until a check when a replacement sign-in fails or is cancelled", () => {
    // The replacement logs in to the same dedicated profile, so the previous login may already be overwritten.
    const signing = step(connected(), { type: "signIn", attemptId: "a2", owner: 1 });
    const failed = (["sign_in_failed", "storage_failed"] as const).map(code => step(signing, { type: "signedIn", attemptId: "a2", result: { status: "failed", code } }));
    const cancelled = step(step(signing, { type: "cancel", attemptId: "a2", owner: 1 }), { type: "settled", attemptId: "a2" });
    const closed = step(step(signing, { type: "ownerClosed", owner: 1 }), { type: "settled", attemptId: "a2" });
    for (const state of [...failed, cancelled, closed]) {
      expect(state).toMatchObject({ phase: "connected", connection: connection(), generation: 1, verified: false, attempt: null });
      expect(readiness(state, tools)).toEqual({ ready: false, cause: "unverified", action: "retry" });
      expect(judgeConnection(owner, state, free)).toEqual({ decision: "reject", cause: "unverified" });
      const check = (account: AccountConnection["account"]) =>
        step(step(state, { type: "check", attemptId: "c2" }), { type: "checked", attemptId: "c2", result: { status: "connected", account } });
      const same = check(connection().account);
      expect(same).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(readiness(same, tools)).toEqual({ ready: true });
      expect(judgeConnection(owner, same, free)).toEqual({ decision: "resume", rebind: false });
      const other = check({ id: "acct-2", workspace: "org-1" });
      expect(other).toMatchObject({ phase: "error", error: { code: "account_mismatch" } });
      expect(judgeConnection(owner, other, free)).toMatchObject({ decision: "reject" });
    }
    expect(failed.map(s => s.error)).toEqual([{ code: "sign_in_failed" }, { code: "storage_failed" }]);
  });
  it("keeps a verified connection as it was when a replacement that never touched its login fails or is cancelled", () => {
    const signing = step(connected(), { type: "signIn", attemptId: "a2", owner: 1 });
    const failed = step(signing, { type: "signedIn", attemptId: "a2", result: { status: "failed", code: "sign_in_failed" }, kept: true });
    const cancelled = step(step(signing, { type: "cancel", attemptId: "a2", owner: 1 }), { type: "settled", attemptId: "a2", kept: true });
    const closed = step(step(signing, { type: "ownerClosed", owner: 1 }), { type: "settled", attemptId: "a2", kept: true });
    for (const state of [failed, cancelled, closed]) {
      expect(state).toMatchObject({ phase: "connected", connection: connection(), generation: 1, verified: true, expired: false, attempt: null });
      expect(readiness(state, tools)).toEqual({ ready: true });
      expect(judgeConnection(owner, state, free)).toEqual({ decision: "resume", rebind: false });
    }
    expect([failed.error, cancelled.error]).toEqual([{ code: "sign_in_failed" }, null]);
    // Kept means unchanged, not verified: an unchecked or expired connection stays so.
    const unchecked = step(initialAuthState("claude", connection()), { type: "signIn", attemptId: "a2", owner: 1 });
    expect(step(step(unchecked, { type: "cancel", attemptId: "a2", owner: 1 }), { type: "settled", attemptId: "a2", kept: true })).toMatchObject({ verified: false });
    const expired = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "expired" } });
    const retried = step(step(expired, { type: "signIn", attemptId: "a2", owner: 1 }), { type: "signedIn", attemptId: "a2", result: { status: "failed", code: "network" }, kept: true });
    expect(retried).toMatchObject({ phase: "reauthRequired", expired: true });
  });
  it("shows the checked account for a connection without a stable account id", () => {
    // Codex: its status names no account (a Claude login without an organization would not be runnable).
    const anonymous = connection({ provider: "codex", account: { id: null, workspace: null, displayName: "Ada", email: "ada@example.com" } });
    const start = step(step(initialAuthState("codex", null), { type: "signIn", attemptId: "a1", owner: 1 }), { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: anonymous } });
    const checked = step(step(start, { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "connected", account: { id: null, workspace: null, email: "bea@example.com" } } });
    expect(checked).toMatchObject({ phase: "connected", verified: true, error: null, connection: { connectionId: "conn-1", profile: "claude-1" } });
    expect(readiness(checked, tools)).toEqual({ ready: true });
    expect(authStatus(checked, tools, 0).account).toEqual({ email: "bea@example.com" });
    // The bound connection still resumes (user decision 2026-10-28); email is shown, never compared.
    expect(judgeConnection({ ...owner, provider: "codex", accountId: null, workspaceId: null }, checked, free)).toEqual({ decision: "resume", rebind: false });
    expect(judgeConnection({ ...owner, provider: "codex", accountId: null, workspaceId: null, connectionId: "conn-0" }, checked, free)).toEqual({ decision: "reject", cause: "account_unverifiable" });
  });
  it("advances the generation on every stored credential change", () => {
    const first = connected();
    const replaced = step(step(first, { type: "signIn", attemptId: "a2", owner: 1 }), { type: "signedIn", attemptId: "a2", result: { status: "stored", connection: connection({ connectionId: "conn-2" }) } });
    expect(replaced).toMatchObject({ generation: 2, connection: { connectionId: "conn-2" } });
  });
  it("rejects a stored connection for another provider or malformed events", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    expect(transition(signing, { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection({ provider: "codex" }) } })).toMatchObject({ ok: false, reason: "invalid" });
    expect(transition(initialAuthState("claude", null), { type: "signIn", attemptId: "../x", owner: 1 })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("run confirmation", () => {
  const same = { id: "acct-1", workspace: "org-1" };
  it("verifies an unchecked connection only with the run's own connection and the same account", () => {
    const stored = initialAuthState("claude", connection());
    expect(step(stored, { type: "runConfirmed", connectionId: "conn-2", account: same })).toBe(stored);
    expect(step(stored, { type: "runConfirmed", connectionId: "conn-1", account: same })).toMatchObject({ verified: true, error: null });
  });
  // A login inside the dedicated HOME can replace the account the run writes back.
  it("marks a run that wrote back another account as an account mismatch, verified or not", () => {
    const other = { id: "acct-2", workspace: "org-1" };
    expect(step(initialAuthState("claude", connection()), { type: "runConfirmed", connectionId: "conn-1", account: other })).toMatchObject({ verified: false, phase: "error", error: { code: "account_mismatch" } });
    expect(step(connected(), { type: "runConfirmed", connectionId: "conn-1", account: { id: "acct-1", workspace: "w" } })).toMatchObject({ phase: "error", error: { code: "account_mismatch" } });
  });
});

describe("readiness", () => {
  it("separates missing CLI, unsupported versions and tool failures from authentication", () => {
    const state = connected();
    expect(readiness(state, { ...tools, cli: "missing" })).toEqual({ ready: false, cause: "cli_missing", action: "install" });
    expect(readiness(state, { ...tools, version: "unsupported" })).toEqual({ ready: false, cause: "version_unsupported", action: "update" });
    expect(readiness(state, { ...tools, version: "unknown" })).toEqual({ ready: false, cause: "version_unknown", action: "retry" });
    expect(readiness(state, { ...tools, tools: "missing" })).toEqual({ ready: false, cause: "tools_missing", action: "repair" });
    expect(readiness(state, { ...tools, tools: "failed" })).toEqual({ ready: false, cause: "tools_failed", action: "repair" });
    expect(readiness(initialAuthState("claude", null), { ...tools, cli: "missing" })).toEqual({ ready: false, cause: "cli_missing", action: "install" });
    expect(readiness(initialAuthState("claude", null), tools)).toEqual({ ready: false, cause: "not_connected", action: "signIn" });
  });
  it("asks a Claude connection without an organization to sign in again, as its runs refuse", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    const orgless = step(signing, { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection({ account: { id: "acct-1", workspace: null } }) } });
    expect(readiness(orgless, tools)).toEqual({ ready: false, cause: "reauth_required", action: "reauth" });
    expect(authStatus(orgless, tools, 0).actions).toEqual(["reauth", "signOut"]);
    const cursor = step(step(initialAuthState("cursor", null), { type: "signIn", attemptId: "a1", owner: 1 }), { type: "signedIn", attemptId: "a1", result: { status: "stored", connection: connection({ provider: "cursor", account: { id: "acct-1", workspace: null } }) } });
    expect(readiness(cursor, tools)).toEqual({ ready: true });
  });
  it("puts a recorded incompatibility after an unknown version and before every account cause", () => {
    expect(readiness(connected(), { ...tools, version: "incompatible" })).toEqual({ ready: false, cause: "version_incompatible", action: "retry" });
    expect(readiness(initialAuthState("claude", null), { ...tools, version: "incompatible" })).toEqual({ ready: false, cause: "version_incompatible", action: "retry" });
    expect(readiness(step(connected(), { type: "signOut", attemptId: "o1", running: false }), { ...tools, version: "incompatible" })).toMatchObject({ cause: "version_incompatible" });
    expect(readiness(connected(), { ...tools, cli: "missing", version: "incompatible" })).toMatchObject({ cause: "cli_missing" });
  });
  it("applies a recorded incompatible version only to the same installed version", () => {
    const facts: ToolFacts = { ...tools, installed: "2026.10.22-27dcf5f" };
    expect(recordedFacts(facts, "2026.10.22-27dcf5f")).toEqual({ ...facts, version: "incompatible" });
    // A self-update to another build of the same core is a different installed version.
    expect(recordedFacts(facts, "2026.10.22-0aa1111")).toBe(facts);
    expect(recordedFacts(facts, undefined)).toBe(facts);
    expect(recordedFacts(tools, "2026.10.22-27dcf5f")).toBe(tools);
    // Below the minimum or unreadable stays update or retry; the record never hides those.
    for (const version of ["unsupported", "unknown"] as const) expect(recordedFacts({ ...facts, version }, facts.installed)).toEqual({ ...facts, version });
  });
  it("stays ready while a verified connection is being rechecked", () => {
    expect(readiness(step(connected(), { type: "check", attemptId: "c1" }), tools)).toEqual({ ready: true });
  });
});

describe("status DTO", () => {
  it("offers retry for a version cause beside the account's own actions", () => {
    expect(authStatus(initialAuthState("cursor", null), { ...tools, version: "incompatible" }, 0).actions).toEqual(["signIn", "retry"]);
    expect(authStatus(initialAuthState("cursor", null), { ...tools, version: "unknown" }, 0).actions).toEqual(["signIn", "retry"]);
    expect(authStatus(connected(), { ...tools, version: "incompatible" }, 0).actions).toEqual(["signOut", "retry"]);
    expect(authStatus(initialAuthState("claude", connection()), { ...tools, version: "unknown" }, 0).actions).toEqual(["retry", "signOut"]);
    expect(authStatus(initialAuthState("cursor", null), { ...tools, version: "unsupported" }, 0).actions).toEqual(["signIn"]);
    expect(authStatus(initialAuthState("cursor", null), tools, 0).actions).toEqual(["signIn"]);
  });
  it("never publishes the installed version", () => {
    const dto = authStatus(connected(), { ...tools, installed: "2026.10.22-27dcf5f" }, 1);
    expect(JSON.stringify(dto)).not.toContain("2026.10.22");
  });
  it("publishes account, readiness and actions without secrets or internal references", () => {
    const failed = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "failed", code: "network", detail: "sk-ant-secret /Users/x/.claude/.credentials.json" } });
    const dto = authStatus(failed, tools, 7);
    expect(dto).toEqual({ provider: "claude", revision: 7, phase: "connected", account: { displayName: "Ada", email: "ada@example.com" }, attempt: null,
      readiness: { ready: true }, error: { code: "network", retryable: true }, actions: ["retry", "signOut"] });
    const text = JSON.stringify(dto);
    for (const hidden of ["sk-ant", ".credentials", "conn-1", "claude-1", "acct-1", "detail"]) expect(text).not.toContain(hidden);
  });
  it("lists the recovery actions each state allows", () => {
    const signing = step(initialAuthState("claude", null), { type: "signIn", attemptId: "a1", owner: 1 });
    expect(authStatus(signing, tools, 1)).toMatchObject({ phase: "signingIn", attempt: { id: "a1", kind: "signIn", cancelling: false }, actions: ["cancel"] });
    expect(authStatus(step(signing, { type: "cancel", attemptId: "a1", owner: 1 }), tools, 2)).toMatchObject({ attempt: { cancelling: true }, actions: [] });
    expect(authStatus(initialAuthState("claude", null), tools, 0)).toMatchObject({ account: null, actions: ["signIn"] });
    expect(authStatus(connected(), tools, 0).actions).toEqual(["signOut"]);
    const expired = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "expired" } });
    expect(authStatus(expired, tools, 0).actions).toEqual(["reauth", "signOut"]);
    const mismatch = step(step(connected(), { type: "check", attemptId: "c1" }), { type: "checked", attemptId: "c1", result: { status: "connected", account: { id: "acct-2", workspace: "org-1" } } });
    expect(authStatus(mismatch, tools, 0)).toMatchObject({ error: { code: "account_mismatch", retryable: false }, actions: ["reauth", "signOut"] });
    const out = step(step(connected(), { type: "signOut", attemptId: "o1", running: false }), { type: "signedOut", attemptId: "o1", result: { status: "failed" } });
    expect(authStatus(out, tools, 0)).toMatchObject({ phase: "error", error: { code: "sign_out_failed", retryable: true }, actions: ["signOut"] });
  });
  it("rejects a revision that is not a non-negative safe integer", () => {
    for (const revision of [-1, 1.5, Number.NaN, 2 ** 53]) expect(() => authStatus(connected(), tools, revision)).toThrow("Invalid revision");
  });
});
