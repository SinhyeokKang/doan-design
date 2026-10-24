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
  guard.request({ kind: "remove-projects", roots: ["/repo"] }, action);
  guard.answer({ id: send.mock.calls[1]?.[0].id, allow: true }); expect(action).toHaveBeenCalledOnce();
});

test("a request that cannot run reports why it was dropped", () => {
  const send = vi.fn(); const guard = createTransitionGuard(send);
  const action = vi.fn(); const cancelled = vi.fn();
  // Not guarded: runs at once.
  guard.request({ kind: "remove-projects", roots: ["/a"] }, action, cancelled);
  expect(action).toHaveBeenCalledOnce(); expect(cancelled).not.toHaveBeenCalled();
  guard.set(true);
  guard.request({ kind: "remove-projects", roots: ["/a", "/b"] }, action, cancelled);
  expect(send).toHaveBeenLastCalledWith({ kind: "remove-projects", roots: ["/a", "/b"], id: expect.any(String) });
  // A second request while one is pending is dropped, and says so.
  const second = vi.fn();
  guard.request({ kind: "quit" }, vi.fn(), second);
  expect(second).toHaveBeenCalledOnce();
  guard.answer({ id: send.mock.calls.at(-1)?.[0].id, allow: false });
  expect(cancelled).toHaveBeenCalledOnce(); expect(action).toHaveBeenCalledOnce();
  // A reset (renderer reload) drops the pending request too.
  const third = vi.fn();
  guard.request({ kind: "remove-projects", roots: ["/a"] }, vi.fn(), third);
  guard.reset();
  expect(third).toHaveBeenCalledOnce();
});
