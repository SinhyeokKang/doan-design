// App providers are not the shared sessions schema's runtimes (conversation/types.ts Runtime).
export const PROVIDERS = ["claude", "codex", "cursor", "antigravity", "copilot"] as const;
export type Provider = (typeof PROVIDERS)[number];
export function validProvider(value: unknown): value is Provider { return PROVIDERS.some(p => p === value); }
// Email and display name are shown, never compared: identity is the provider's id and workspace.
export interface AccountIdentity { id: string | null; workspace: string | null; displayName?: string; email?: string }
// profile is an opaque reference main resolves to a directory (providerEnv profileDir), never a credential location.
export interface AccountConnection { provider: Provider; connectionId: string; profile: string; account: AccountIdentity }
export interface AuthMetadata { v: 1; accounts: AccountConnection[] }
export type ConversationOwner =
  | { kind: "legacy-external" }
  | { kind: "doan"; provider: Provider; connectionId: string; accountId: string | null; workspaceId: string | null; profile: string };
export type AuthPhase = "disconnected" | "checking" | "signingIn" | "connected" | "reauthRequired" | "signingOut" | "error";
// cli_install_failed: doan could not download or verify a provider runtime it installs itself (Antigravity's server).
export type AuthErrorCode = "sign_in_failed" | "network" | "storage_failed" | "check_failed" | "account_mismatch" | "sign_out_failed" | "cli_install_failed";
// detail is main-only diagnostics and may quote provider output; DTOs never copy it.
export interface AuthError { code: AuthErrorCode; detail?: string }
export interface AuthAttempt { id: string; kind: "check" | "signIn" | "signOut"; owner: number | null; cancelled: boolean }
export interface AuthState {
  provider: Provider; phase: AuthPhase; generation: number; verified: boolean; expired: boolean;
  connection: AccountConnection | null; attempt: AuthAttempt | null; error: AuthError | null;
}
export type CheckResult =
  | { status: "connected"; account: AccountIdentity }
  | { status: "disconnected" } | { status: "expired" }
  | { status: "failed"; code: "network" | "check_failed" | "cli_install_failed"; detail?: string };
// A failed or cancelled sign-in leaves no metadata. Without a stored connection its leftover provider
// credentials are orphans to clean up; with one they are the live profile, judged by the next check.
export type SignInResult =
  | { status: "stored"; connection: AccountConnection }
  | { status: "failed"; code: "sign_in_failed" | "network" | "storage_failed" | "cli_install_failed"; detail?: string };
// Report a result only after the attempt's processes and listeners are gone.
export type AuthEvent =
  | { type: "check"; attemptId: string }
  | { type: "signIn"; attemptId: string; owner: number }
  | { type: "signOut"; attemptId: string; running: boolean }
  | { type: "checked"; attemptId: string; result: CheckResult }
  | { type: "signedIn"; attemptId: string; result: SignInResult }
  | { type: "signedOut"; attemptId: string; result: { status: "removed" } | { status: "failed"; detail?: string } }
  | { type: "cancel"; attemptId: string; owner: number }
  | { type: "ownerClosed"; owner: number }
  | { type: "settled"; attemptId: string }
  | { type: "writeBackFailed"; detail?: string }
  | { type: "runConfirmed"; connectionId: string };
export type AuthRejection = "busy" | "stale" | "not_owner" | "stop_required" | "not_connected" | "sign_out_failed" | "invalid";
export type AuthTransition = { ok: true; outcome: "applied" | "unchanged"; state: AuthState } | { ok: false; reason: AuthRejection; state: AuthState };
export interface ToolFacts { cli: "found" | "missing"; version: "supported" | "unsupported" | "unknown"; tools: "ready" | "missing" | "failed" }
export type ReadinessCause =
  | "cli_missing" | "version_unsupported" | "version_unknown" | "busy" | "sign_out_failed" | "not_connected"
  | "account_mismatch" | "reauth_required" | "unverified" | "tools_missing" | "tools_failed";
export type RecoveryAction = "install" | "update" | "retry" | "wait" | "signOut" | "signIn" | "reauth" | "repair";
export type Readiness = { ready: true } | { ready: false; cause: ReadinessCause; action: RecoveryAction };
export type AuthAction = "signIn" | "cancel" | "retry" | "reauth" | "signOut";
export interface AuthStatusDto {
  provider: Provider; revision: number; phase: AuthPhase;
  account: { displayName?: string; email?: string } | null;
  attempt: { id: string; kind: AuthAttempt["kind"]; cancelling: boolean } | null;
  readiness: Readiness; error: { code: AuthErrorCode; retryable: boolean } | null; actions: AuthAction[];
}
export interface SessionFacts { exists: boolean; occupancy: "free" | "occupied" | "unknown" }
export type ConnectionJudgment =
  | { decision: "resume"; rebind: boolean }
  | { decision: "legacy" }
  | { decision: "reauth"; cause: "not_connected" | "reauth_required" }
  | { decision: "reject"; cause: "provider_mismatch" | "busy" | "sign_out_failed" | "unverified" | "account_unverifiable" | "account_mismatch" | "workspace_mismatch" | "profile_mismatch" | "session_unavailable" | "session_in_use" };
