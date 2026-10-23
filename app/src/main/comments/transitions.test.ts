import { expect, test, vi } from "vitest";
import { createTransitionGuard } from "./transitions";
test("holds close/quit, ignores forged acknowledgements, and executes only an approved pending action", () => {
  const send = vi.fn(); const action = vi.fn(); const guard = createTransitionGuard(send);
  guard.set(true);
  guard.request({ kind: "quit" }, action);
  expect(action).not.toHaveBeenCalled();
  const id = send.mock.calls[0]?.[0].id;
  guard.answer({ id: "wrong", allow: true }); expect(action).not.toHaveBeenCalled();
  guard.answer({ id, allow: false }); expect(action).not.toHaveBeenCalled();
  guard.request({ kind: "close-project", root: "/repo" }, action);
  guard.answer({ id: send.mock.calls[1]?.[0].id, allow: true }); expect(action).toHaveBeenCalledOnce();
});
