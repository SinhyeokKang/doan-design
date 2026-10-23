import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: mock.fork } }));
import { createCommentDirectory } from "./mkdir";
class Child extends EventEmitter {
  killed = 0;
  postMessage = vi.fn();
  kill() { this.killed++; queueMicrotask(() => this.emit("exit", 0)); return true; }
}
let child: Child;
beforeEach(() => { child = new Child(); mock.fork.mockReset().mockReturnValue(child); });
it("waits for actual exit after one result", async () => { child.kill = () => { child.killed++; return true; }; const p = createCommentDirectory("/repo", ".doan"); let done = false; void p.then(() => { done = true; }); child.emit("message", { ok: true }); await Promise.resolve(); expect(done).toBe(false); child.emit("exit", 0); await p; expect(child.postMessage).toHaveBeenCalledExactlyOnceWith({ parent: "/repo", name: ".doan" }); expect(child.listenerCount("message")).toBe(0); });
it.each([null, {}, { ok: true, extra: true }, { ok: "yes" }])("rejects malformed result %j and cleans up", async msg => { const p = createCommentDirectory("/repo", "comments"); child.emit("message", msg); await expect(p).rejects.toThrow(); expect(child.killed).toBe(1); expect(child.eventNames()).toEqual([]); });
it("rejects duplicate results", async () => { const p = createCommentDirectory("/repo", "comments"); child.emit("message", { ok: true }); child.emit("message", { ok: true }); await expect(p).rejects.toThrow(); });
it("rejects an early crash", async () => { const p = createCommentDirectory("/repo", "comments"); child.emit("exit", 1); await expect(p).rejects.toThrow(); });
it("rejects spawn failure", async () => { mock.fork.mockImplementation(() => { throw new Error("spawn"); }); await expect(createCommentDirectory("/repo", "comments")).rejects.toThrow("spawn"); });
it("times out and ignores a late success", async () => { vi.useFakeTimers(); try { const p = createCommentDirectory("/repo", "comments"); const rejected = expect(p).rejects.toThrow("timeout"); await vi.advanceTimersByTimeAsync(10_000); child.emit("message", { ok: true }); await rejected; expect(child.eventNames()).toEqual([]); } finally { vi.useRealTimers(); } });
