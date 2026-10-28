import { validAccount, validAuthId, validConnection } from "./metadata";
import { validProvider, type AccountConnection, type AuthAction, type AuthError, type AuthEvent, type AuthPhase, type AuthRejection, type AuthState, type AuthStatusDto, type AuthTransition, type Provider, type Readiness, type ToolFacts } from "./types";
type Fields = Omit<AuthState, "phase">;
function phaseOf(s: Fields): AuthPhase {
  if (s.attempt) return s.attempt.kind === "check" ? "checking" : s.attempt.kind === "signIn" ? "signingIn" : "signingOut";
  if (!s.connection) return s.error ? "error" : "disconnected";
  if (s.error?.code === "sign_out_failed" || s.error?.code === "account_mismatch") return "error";
  return s.expired ? "reauthRequired" : "connected";
}
function settle(fields: Fields): AuthState { return { ...fields, phase: phaseOf(fields) }; }
function failure(code: AuthError["code"], detail: string | undefined): AuthError { return detail === undefined ? { code } : { code, detail }; }
export function initialAuthState(provider: Provider, stored: AccountConnection | null): AuthState {
  if (!validProvider(provider) || (stored !== null && (!validConnection(stored) || stored.provider !== provider))) throw new Error("Invalid stored connection");
  // Stored metadata proves a completed save, not a live login, until a check or sign-in verifies it.
  return settle({ provider, generation: 0, verified: false, expired: false, connection: stored, attempt: null, error: null });
}
export function transition(state: AuthState, event: AuthEvent): AuthTransition {
  const reject = (reason: AuthRejection): AuthTransition => ({ ok: false, reason, state });
  const apply = (next: Partial<Fields>): AuthTransition => ({ ok: true, outcome: "applied", state: settle({ ...state, ...next }) });
  const attempt = state.attempt;
  // A failed sign-out may have left credentials behind, so only a successful one clears it.
  const kept = state.error?.code === "sign_out_failed" ? state.error : null;
  switch (event.type) {
    case "check": case "signIn": case "signOut": {
      if (!validAuthId(event.attemptId) || (event.type === "signIn" && (!Number.isSafeInteger(event.owner) || event.owner < 0))) return reject("invalid");
      // A write may replace a pending check; the check's late result then reads as stale.
      if (attempt && (event.type === "check" || attempt.kind !== "check")) return reject("busy");
      if (event.type === "check") return apply({ attempt: { id: event.attemptId, kind: "check", owner: null, cancelled: false } });
      if (event.type === "signIn") {
        if (kept) return reject("sign_out_failed");
        return apply({ attempt: { id: event.attemptId, kind: "signIn", owner: event.owner, cancelled: false } });
      }
      if (!state.connection) return reject("not_connected");
      if (event.running) return reject("stop_required");
      return apply({ attempt: { id: event.attemptId, kind: "signOut", owner: null, cancelled: false } });
    }
    case "checked": case "signedIn": case "signedOut": {
      const kind = event.type === "checked" ? "check" : event.type === "signedIn" ? "signIn" : "signOut";
      if (!attempt || attempt.id !== event.attemptId || attempt.kind !== kind || attempt.cancelled) return reject("stale");
      if (event.type === "signedOut") {
        return event.result.status === "removed"
          ? apply({ attempt: null, connection: null, generation: state.generation + 1, verified: false, expired: false, error: null })
          : apply({ attempt: null, error: failure("sign_out_failed", event.result.detail) });
      }
      if (event.type === "signedIn") {
        const result = event.result;
        // A replacement shares the dedicated profile and may have overwritten the previous login before failing.
        if (result.status === "failed") return apply({ attempt: null, verified: false, error: failure(result.code, result.detail) });
        if (!validConnection(result.connection) || result.connection.provider !== state.provider) return reject("invalid");
        return apply({ attempt: null, connection: result.connection, generation: state.generation + 1, verified: true, expired: false, error: null });
      }
      const result = event.result;
      switch (result.status) {
        case "failed": return apply({ attempt: null, error: kept ?? failure(result.code, result.detail) });
        case "expired": case "disconnected": return apply({ attempt: null, expired: !!state.connection, error: kept });
        case "connected": {
          if (!validAccount(result.account)) return reject("invalid");
          // A provider login without stored metadata is an unfinished save, never a connection.
          if (!state.connection) return apply({ attempt: null, error: kept });
          const stored = state.connection.account;
          if (stored.id !== result.account.id || stored.workspace !== result.account.workspace) return apply({ attempt: null, error: kept ?? { code: "account_mismatch" } });
          // Without a stable ID any login matches, so the shown account must be the one just checked.
          const connection = stored.id === null ? { ...state.connection, account: result.account } : state.connection;
          return apply({ attempt: null, connection, verified: true, expired: false, error: kept });
        }
      }
      return reject("invalid");
    }
    case "cancel":
      if (!attempt || attempt.id !== event.attemptId) return reject("stale");
      if (attempt.kind !== "signIn") return reject("invalid");
      if (attempt.owner !== event.owner) return reject("not_owner");
      if (attempt.cancelled) return { ok: true, outcome: "unchanged", state };
      return apply({ attempt: { ...attempt, cancelled: true } });
    case "ownerClosed":
      if (!attempt || attempt.kind !== "signIn" || attempt.owner !== event.owner || attempt.cancelled) return { ok: true, outcome: "unchanged", state };
      return apply({ attempt: { ...attempt, cancelled: true } });
    case "settled":
      if (!attempt || attempt.id !== event.attemptId) return reject("stale");
      // Only cancellation waits for cleanup; finished attempts end with their result.
      if (!attempt.cancelled) return reject("invalid");
      // Only sign-ins are cancellable, and one may have rewritten the profile before it stopped.
      return apply({ attempt: null, verified: false });
    case "runConfirmed":
      // Only the run's own connection, and only a clean unchecked one: a check's or a write-back's verdict stands.
      if (!state.connection || state.connection.connectionId !== event.connectionId || state.verified || state.expired || state.error || state.attempt) return { ok: true, outcome: "unchanged", state };
      return apply({ verified: true });
    case "writeBackFailed":
      if (!state.connection) return { ok: true, outcome: "unchanged", state };
      // A provider refresh that never reached the vault may have revoked the credential the vault still holds.
      return apply({ verified: false, error: kept ?? failure("storage_failed", event.detail) });
  }
  return reject("invalid");
}
export function readiness(state: AuthState, facts: ToolFacts): Readiness {
  if (facts.cli === "missing") return { ready: false, cause: "cli_missing", action: "install" };
  if (facts.version === "unsupported") return { ready: false, cause: "version_unsupported", action: "update" };
  if (facts.version === "unknown") return { ready: false, cause: "version_unknown", action: "retry" };
  if (state.attempt && state.attempt.kind !== "check") return { ready: false, cause: "busy", action: "wait" };
  if (state.error?.code === "sign_out_failed") return { ready: false, cause: "sign_out_failed", action: "signOut" };
  if (!state.connection) return { ready: false, cause: "not_connected", action: "signIn" };
  if (state.error?.code === "account_mismatch") return { ready: false, cause: "account_mismatch", action: "reauth" };
  if (state.expired) return { ready: false, cause: "reauth_required", action: "reauth" };
  if (!state.verified) return { ready: false, cause: "unverified", action: state.attempt ? "wait" : "retry" };
  if (facts.tools === "missing") return { ready: false, cause: "tools_missing", action: "repair" };
  if (facts.tools === "failed") return { ready: false, cause: "tools_failed", action: "repair" };
  return { ready: true };
}
function actions(state: AuthState): AuthAction[] {
  if (state.attempt) return state.attempt.kind === "signIn" && !state.attempt.cancelled ? ["cancel"] : [];
  if (!state.connection) return ["signIn"];
  if (state.error?.code === "sign_out_failed") return ["signOut"];
  if (state.expired || state.error?.code === "account_mismatch") return ["reauth", "signOut"];
  if (!state.verified || state.error?.code === "network" || state.error?.code === "check_failed" || state.error?.code === "cli_install_failed") return ["retry", "signOut"];
  return ["signOut"];
}
// Built field by field so connection IDs, profiles, account IDs and diagnostics never reach a window.
export function authStatus(state: AuthState, facts: ToolFacts, revision: number): AuthStatusDto {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision");
  const account = state.connection?.account;
  return {
    provider: state.provider, revision, phase: state.phase,
    account: account ? { ...(account.displayName !== undefined ? { displayName: account.displayName } : {}), ...(account.email !== undefined ? { email: account.email } : {}) } : null,
    attempt: state.attempt ? { id: state.attempt.id, kind: state.attempt.kind, cancelling: state.attempt.cancelled } : null,
    readiness: readiness(state, facts),
    error: state.error ? { code: state.error.code, retryable: state.error.code !== "account_mismatch" } : null,
    actions: actions(state),
  };
}
