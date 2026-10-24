import { randomUUID } from "node:crypto";
import { object } from "./identity";
export type Transition = { kind: "quit" } | { kind: "remove-projects"; roots: string[] };
export type TransitionRequest = Transition & { id: string };
// `cancel` runs when the action never will: denied, dropped behind a pending
// request, or reset with the renderer. A caller awaiting the outcome needs it.
export function createTransitionGuard(send: (request: TransitionRequest) => void) {
  let guarded = false;
  let pending: { id: string; action: () => void; cancel: (() => void) | undefined } | null = null;
  return {
    set(value: boolean) { guarded = value; },
    reset() {
      const dropped = pending;
      guarded = false; pending = null;
      dropped?.cancel?.();
    },
    request(transition: Transition, action: () => void, cancel?: () => void) {
      if (!guarded) { action(); return; }
      if (pending) { cancel?.(); return; }
      const id = randomUUID();
      pending = { id, action, cancel };
      send({ ...transition, id });
    },
    answer(value: unknown) {
      if (!object(value) || Object.keys(value).length !== 2 || typeof value.id !== "string" || typeof value.allow !== "boolean" || value.id !== pending?.id) return;
      const { action, cancel } = pending;
      pending = null;
      if (value.allow) action();
      else cancel?.();
    },
  };
}
