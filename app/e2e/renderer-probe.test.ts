import assert from "node:assert/strict";
import { test } from "node:test";
const { installCommentReadProbe }: typeof import("./renderer-probe") = await import(new URL("./renderer-probe.ts", import.meta.url).href);

test("renderer completion follows delayed consumption and exposes a stale-apply mutation", async () => {
  for (const buggy of [false, true]) {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const session = {
      readRevision: 0, identity: { canvas: "a" }, list: { comments: [] as string[] },
      api: { commentsList: async (_request: { requestID: string }) => { await held; return { comments: ["stale"] }; } },
      async read() { const canvas = this.identity.canvas; const result = await this.api.commentsList({ requestID: "held" }); if (buggy || canvas === this.identity.canvas) this.list = result; },
    };
    const windowFixture: { commentReadProbe?: { completed: { requestID: string; canvas: string; count: number }[]; restore: () => void } } = {};
    const documentFixture = { getElementById: () => ({ firstElementChild: { "__reactFiber$fixture": { memoizedState: { memoizedState: session } } } }) };
    Reflect.set(globalThis, "window", windowFixture); Reflect.set(globalThis, "document", documentFixture);
    try {
      installCommentReadProbe(); const pending = session.read(); session.identity = { canvas: "b" };
      await new Promise(resolve => setTimeout(resolve, 550));
      assert.deepEqual(windowFixture.commentReadProbe!.completed, []);
      release(); await pending;
      assert.deepEqual(windowFixture.commentReadProbe!.completed, [{ requestID: "held", canvas: "b", count: buggy ? 1 : 0 }]);
      if (buggy) assert.throws(() => assert.equal(windowFixture.commentReadProbe!.completed[0]!.count, 0));
      windowFixture.commentReadProbe!.restore();
    } finally { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "document"); }
  }
});
