import type { AuthState, ConnectionJudgment, ConversationOwner, SessionFacts } from "./types";
// An account match is necessary but not sufficient: the stored session must exist and be free.
export function judgeConnection(owner: ConversationOwner, state: AuthState, session: SessionFacts): ConnectionJudgment {
  if (owner.kind === "legacy-external") return { decision: "legacy" };
  if (owner.provider !== state.provider) return { decision: "reject", cause: "provider_mismatch" };
  if (state.attempt && state.attempt.kind !== "check") return { decision: "reject", cause: "busy" };
  if (state.error?.code === "sign_out_failed") return { decision: "reject", cause: "sign_out_failed" };
  const current = state.connection;
  if (!current) return { decision: "reauth", cause: "not_connected" };
  if (state.expired) return { decision: "reauth", cause: "reauth_required" };
  if (!state.verified) return { decision: "reject", cause: "unverified" };
  // Without a stable provider ID the same account cannot be proven; email is never evidence.
  if (owner.accountId === null || current.account.id === null) return { decision: "reject", cause: "account_unverifiable" };
  if (owner.accountId !== current.account.id || state.error?.code === "account_mismatch") return { decision: "reject", cause: "account_mismatch" };
  if (owner.workspaceId !== current.account.workspace) return { decision: "reject", cause: "workspace_mismatch" };
  if (owner.profile !== current.profile) return { decision: "reject", cause: "profile_mismatch" };
  if (!session.exists) return { decision: "reject", cause: "session_unavailable" };
  if (session.occupancy !== "free") return { decision: "reject", cause: session.occupancy === "occupied" ? "session_in_use" : "session_unavailable" };
  return { decision: "resume", rebind: owner.connectionId !== current.connectionId };
}
