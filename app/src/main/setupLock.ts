interface Owner { owner: number; operation: string }
export type SetupLock = { kind: "idle" } | ({ kind: "writing" } & Owner) | ({ kind: "confirming"; confirmation: string } & Owner);
export type SetupLockAction = Owner & (
  | { type: "acquire" | "release" }
  | { type: "confirm"; confirmation: string }
  | { type: "answer"; confirmation: string; allow: boolean }
);
export interface SetupLockResult { kind: "success" | "busy" | "stale"; state: SetupLock }

export function setupLock(state: SetupLock, action: SetupLockAction): SetupLockResult {
  const owner = { owner: action.owner, operation: action.operation };
  if (action.type === "acquire") return state.kind === "idle"
    ? { kind: "success", state: { kind: "writing", ...owner } } : { kind: "busy", state };
  if (state.kind === "idle") return { kind: "stale", state };
  if (state.owner !== action.owner) return { kind: "busy", state };
  // A late completion from the same window cannot unlock its next operation.
  if (state.operation !== action.operation) return { kind: "stale", state };
  if (action.type === "release") return { kind: "success", state: { kind: "idle" } };
  if (action.type === "confirm" && state.kind === "writing") return { kind: "success", state: { kind: "confirming", ...owner, confirmation: action.confirmation } };
  if (action.type === "answer" && state.kind === "confirming" && action.confirmation === state.confirmation) {
    return { kind: "success", state: action.allow ? { kind: "writing", ...owner } : { kind: "idle" } };
  }
  return { kind: "stale", state };
}
