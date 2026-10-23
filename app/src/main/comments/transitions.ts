import { randomUUID } from "node:crypto";
import { object } from "./identity";
export type Transition = { kind: "quit" } | { kind: "close-project"; root: string };
export type TransitionRequest = Transition & { id: string };
export function createTransitionGuard(send: (request: TransitionRequest) => void) {
  let guarded = false;
  let pending: { id: string; action: () => void } | null = null;
  return {
    set(value: boolean) { guarded = value; },
    reset() { guarded = false; pending = null; },
    request(transition: Transition, action: () => void) {
      if (!guarded) { action(); return; }
      if (pending) return;
      const id = randomUUID();
      pending = { id, action };
      send({ ...transition, id });
    },
    answer(value: unknown) {
      if (!object(value) || Object.keys(value).length !== 2 || typeof value.id !== "string" || typeof value.allow !== "boolean" || value.id !== pending?.id) return;
      const action = pending.action;
      pending = null;
      if (value.allow) action();
    },
  };
}
