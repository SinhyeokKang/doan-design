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
  if (state.error?.code === "account_mismatch") return { decision: "reject", cause: "account_mismatch" };
  // Without a stable provider ID another login cannot be told apart, and email is never evidence. Every stored sign-in
  // mints a new connectionId, so only the conversation's own connection is known to hold its login (user decision 2026-10-28).
  if (owner.accountId === null || current.account.id === null) {
    if (owner.connectionId !== current.connectionId) return { decision: "reject", cause: "account_unverifiable" };
  } else if (owner.accountId !== current.account.id) return { decision: "reject", cause: "account_mismatch" };
  if (owner.workspaceId !== current.account.workspace) return { decision: "reject", cause: "workspace_mismatch" };
  if (owner.profile !== current.profile) return { decision: "reject", cause: "profile_mismatch" };
  if (!session.exists) return { decision: "reject", cause: "session_unavailable" };
  if (session.occupancy !== "free") return { decision: "reject", cause: session.occupancy === "occupied" ? "session_in_use" : "session_unavailable" };
  return { decision: "resume", rebind: owner.connectionId !== current.connectionId };
}
