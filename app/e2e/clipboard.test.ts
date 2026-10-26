import assert from "node:assert/strict";
import { test } from "node:test";
const { saveClipboard, restoreClipboard }: typeof import("./clipboard") = await import(new URL("./clipboard.ts", import.meta.url).href);

class Item {
  readonly types: string[];
  readonly data: Record<string, unknown>;
  constructor(data: Record<string, unknown>) {
    this.data = data;
    this.types = Object.keys(data);
    if (!this.types.length) throw new TypeError("at least one MIME type is required");
  }
  async getType(type: string) { return this.data[type]; }
}
function fixture(items: { types: string[]; getType(type: string): Promise<unknown> }[]) {
  const writes: Item[][] = [];
  let clears = 0;
  const deps = { ClipboardItem: Item, clipboard: {
    read: async () => items,
    write: async (data: Item[]) => { writes.push(data); },
    clear: () => { clears++; },
  } } as unknown as Parameters<typeof saveClipboard>[0];
  return { deps, writes, clears: () => clears };
}

test("captures every payload eagerly and reconstructs separate ordered items", async () => {
  const blob = new Blob(["fixture"]), bookmark = { title: "Fixture", url: "https://example.test" };
  const original = [new Item({ "text/plain": blob, "electron application/bookmark": bookmark }), new Item({ "image/png": new Blob(["image"]) })];
  const f = fixture(original);
  await saveClipboard(f.deps);
  original[0]!.data["text/plain"] = new Blob(["changed"]);
  await restoreClipboard(f.deps);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0]!.length, 2);
  assert.notEqual(f.writes[0]![0], original[0]);
  assert.equal(f.writes[0]![0]!.data["text/plain"], blob);
  assert.equal(f.writes[0]![0]!.data["electron application/bookmark"], bookmark);
  assert.equal(f.clears(), 0);
});

for (const empty of [[], [{ types: [], getType: async () => { throw new Error("must not read"); } }]]) {
  test(`restores an empty clipboard without constructing an empty item (${empty.length} native items)`, async () => {
    const f = fixture(empty);
    await saveClipboard(f.deps);
    await restoreClipboard(f.deps);
    assert.equal(f.clears(), 1);
    assert.deepEqual(f.writes, []);
  });
}

test("empty native items do not discard readable neighboring payloads", async () => {
  const f = fixture([new Item({ "text/plain": "first" }), { types: [], getType: async () => { throw new Error("must not read"); } }, new Item({ "text/html": "last" })]);
  await saveClipboard(f.deps);
  await restoreClipboard(f.deps);
  assert.deepEqual(f.writes[0]!.map(item => item.data), [{ "text/plain": "first" }, { "text/html": "last" }]);
  assert.equal(f.clears(), 0);
});

for (const mode of ["read", "payload", "construct"]) {
  test(`${mode} failure aborts before mutation and never restores a partial snapshot or leaks native errors`, async () => {
    const f = fixture([new Item({ "text/plain": "recoverable" }), { types: ["fixture/secret"], getType: async () => { throw new Error("private payload"); } }]);
    if (mode === "read") f.deps.clipboard.read = async () => { throw new Error("private payload"); };
    if (mode === "construct") {
      f.deps.clipboard.read = async () => [new Item({ "text/plain": "fixture" })] as unknown as Electron.ClipboardItem[];
      f.deps.ClipboardItem = class { constructor() { throw new Error("private payload"); } } as unknown as typeof Electron.ClipboardItem;
    }
    let mutated = false;
    await assert.rejects(async () => { await saveClipboard(f.deps); mutated = true; }, /^Error: Clipboard snapshot failed; runtime clipboard tests must not proceed\.$/);
    assert.equal(mutated, false);
    await restoreClipboard(f.deps);
    assert.deepEqual(f.writes, []);
    assert.equal(f.clears(), 0);
  });
}

test("failed restoration rejects and retains the snapshot for retry", async () => {
  const f = fixture([new Item({ "text/plain": "fixture" })]);
  await saveClipboard(f.deps);
  const write = f.deps.clipboard.write;
  f.deps.clipboard.write = async () => { throw new Error("private native error"); };
  await assert.rejects(restoreClipboard(f.deps), /^Error: Clipboard restoration failed\.$/);
  f.deps.clipboard.write = write;
  await restoreClipboard(f.deps);
  await restoreClipboard(f.deps);
  assert.equal(f.writes.length, 1);
});
