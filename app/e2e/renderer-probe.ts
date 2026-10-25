// Runs only through page.evaluate in the test-owned renderer. Observing the
// session promise includes its stale-response branch, unlike a main IPC reply.
export function installCommentReadProbe(): void {
  const element = document.getElementById("root")?.firstElementChild;
  if (!element) throw new Error("Missing renderer root");
  const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
  if (!key) throw new Error("Missing React fiber for test observation");
  type Session = {
    api: { commentsList: (request: { requestID: string }) => Promise<unknown> };
    read: (...args: unknown[]) => Promise<void>;
    identity: { canvas: string } | null;
    list: { comments: unknown[] } | null;
  };
  type Hook = { memoizedState: unknown; next?: Hook };
  type Fiber = { memoizedState?: Hook; return?: Fiber };
  let session: Session | undefined;
  for (let fiber = Reflect.get(element, key) as Fiber | undefined; fiber; fiber = fiber.return) {
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const candidate = hook.memoizedState;
      if (typeof candidate === "object" && candidate !== null && typeof Reflect.get(candidate, "read") === "function" && Reflect.has(candidate, "readRevision")) session = candidate as Session;
    }
  }
  if (!session) throw new Error("Missing CommentsSession for test observation");
  const original = session.read, api = session.api;
  let active: { requestID?: string } | undefined;
  const completed: { requestID: string; canvas: string | null; count: number | null }[] = [];
  session.api = { ...api, commentsList(request) { if (active) active.requestID = request.requestID; return api.commentsList(request); } };
  session.read = function (...args) {
    const call: { requestID?: string } = {}; active = call;
    const pending = original.apply(this, args); active = undefined;
    return pending.finally(() => {
      if (call.requestID) completed.push({ requestID: call.requestID, canvas: this.identity?.canvas ?? null, count: this.list?.comments.length ?? null });
    });
  };
  Reflect.set(window, "commentReadProbe", { completed, restore: () => { session!.read = original; session!.api = api; } });
}
