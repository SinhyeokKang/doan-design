import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createLocalSeen } from "./canvasSeen";
import { createReadState } from "./readState";
import { createFingerprints, fingerprintOf } from "./seenFingerprint";
import { MARKER, readSeen, recordText, SEEN_DIR, writeSeen } from "./seenRecords";
import type { CanvasRow, FolderEntry, ReadStateProblem } from "./view";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-read-state-")));
let count = 0;
afterAll(() => { chmodAll(tmp); rmSync(tmp, { recursive: true, force: true }); });
function chmodAll(dir: string): void {
  try {
    chmodSync(dir, 0o755);
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) chmodAll(join(dir, entry.name));
  } catch { /* gone */ }
}
const isRoot = process.getuid?.() === 0;
const html = (body: string) => `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body>${body}</body></html>`;
const pathOf = (id: string) => `.doan/canvases/${id}.html`;

function project(canvases: Record<string, string>): string {
  const root = join(tmp, `r${count++}`);
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, ".doan/tokens.css"), ":root{--a:1}");
  for (const [id, body] of Object.entries(canvases)) writeFileSync(join(root, pathOf(id)), html(body));
  return root;
}

// The read state as index.ts wires it, over real files, with the shell's list, the visible proof and the window faked.
function app(userData = join(tmp, `u${count++}`)) {
  mkdirSync(userData, { recursive: true });
  const local = createLocalSeen(join(userData, "canvas-seen.json"));
  let entries: FolderEntry[] = [];
  const shown = new Map<string, string>();
  const problems: { root: string; problem: ReadStateProblem }[] = [];
  const writes: string[] = [];
  let changed = 0;
  const state = createReadState({
    local,
    fingerprint: createFingerprints().of,
    read: readSeen,
    write: async (root, name, text, expected) => { writes.push(name); await writeSeen(root, name, text, expected); },
    entries: () => entries,
    shown: async (root, row) => shown.get(`${root}\n${row.path}`) ?? null,
    changed: () => { changed++; },
    problem: (root, problem) => { problems.push({ root, problem }); },
  });
  // A listing as the shell makes it: every HTML file in .doan/canvases, its ID from the file name unless given.
  const list = async (root: string, ids: Record<string, string | undefined> = {}) => {
    const canvases: CanvasRow[] = readdirSync(join(root, ".doan/canvases")).filter(name => name.endsWith(".html")).sort().map(name => {
      const path = `.doan/canvases/${name}`, stem = name.slice(0, -5);
      const id = stem in ids ? ids[stem] : stem;
      return { path, url: `http://x/${encodeURIComponent(root)}/${path}`, mtimeMs: statSync(join(root, path)).mtimeMs, ...(id === undefined ? {} : { id }) };
    });
    const entry: FolderEntry = { path: root, kind: "list", canvases, servedRev: 0 };
    entries = [...entries.filter(item => item.path !== root), entry];
    state.listed(entries);
    await state.idle();
  };
  const marks = (root: string) => {
    const entry = state.decorate(entries).find(item => item.path === root);
    return Object.fromEntries((entry?.kind === "list" ? entry.canvases : []).flatMap(row => row.unseen ? [[row.path.split("/").at(-1)!.slice(0, -5), row.saveFailed ? `${row.unseen}:${row.saveFailed}` : row.unseen]] : []));
  };
  // The canvas page shows `id`'s current bytes (or `bytes`) and main has proven it.
  const show = async (root: string, id: string, bytes?: string) => {
    shown.set(`${root}\n${pathOf(id)}`, fingerprintOf(Buffer.from(bytes ?? readFileSync(join(root, pathOf(id)), "utf8"))));
    expect(state.showing({ root, path: pathOf(id) })).toBe(true);
    state.documentsChanged();
    await state.idle();
  };
  const remove = (root: string) => { entries = entries.filter(item => item.path !== root); state.listed(entries); };
  return { state, local, list, marks, show, remove, problems, writes, changed: () => changed, userData };
}
const seenFiles = (root: string) => readdirSync(join(root, SEEN_DIR)).filter(name => !name.startsWith(".")).sort();
const record = (root: string, id: string) => readFileSync(join(root, SEEN_DIR, `${id}.json`), "utf8");
const touch = (root: string, id: string, body?: string) => {
  const file = join(root, pathOf(id));
  if (body !== undefined) writeFileSync(file, html(body));
  else writeFileSync(file, readFileSync(file));
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
};

test("a project without records starts every canvas seen and writes its records, then the marker", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, marks, writes } = app();
  await list(root);
  expect(marks(root)).toEqual({});
  expect(writes).toEqual(["a.json", "b.json", MARKER]);
  expect(record(root, "a")).toBe(recordText({ html: fingerprintOf(Buffer.from(html("A"))) }));
});

test("a new canvas and changed HTML light the dot; an identical re-save, a restore and a CSS-only change do not", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, marks } = app();
  await list(root);
  touch(root, "a");
  writeFileSync(join(root, ".doan/tokens.css"), ":root{--a:2}");
  await list(root);
  expect(marks(root)).toEqual({});
  touch(root, "b", "B2");
  writeFileSync(join(root, pathOf("c")), html("C"));
  await list(root);
  expect(marks(root)).toEqual({ b: "changed", c: "new" });
  touch(root, "b", "B");
  await list(root);
  expect(marks(root)).toEqual({ c: "new" });
});

test("records that come along with a copy at another path compare by content, so nothing lights up", async () => {
  const root = project({ a: "A", b: "B" });
  const first = app();
  await first.list(root);
  touch(root, "b", "B2");
  await first.list(root);
  const copy = join(tmp, `copy${count++}`);
  cpSync(root, copy, { recursive: true });
  touch(copy, "a");
  const other = app();
  await other.list(copy);
  expect(other.marks(copy)).toEqual({ b: "changed" });
  expect(other.writes).toEqual([]);
});

test("showing a canvas records the shown bytes; a screen showing A while the disk holds B leaves B unseen", async () => {
  const root = project({ a: "A" });
  const { list, marks, show } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  expect(marks(root)).toEqual({ a: "changed" });
  await show(root, "a");
  expect(marks(root)).toEqual({});
  expect(record(root, "a")).toBe(recordText({ html: fingerprintOf(Buffer.from(html("A2"))) }));
  // The file moves on to A3 while the page still shows A2.
  touch(root, "a", "A3");
  await list(root);
  await show(root, "a", html("A2"));
  expect(marks(root)).toEqual({ a: "changed" });
  expect(record(root, "a")).toBe(recordText({ html: fingerprintOf(Buffer.from(html("A2"))) }));
});

test("nothing is recorded without a proof (a thumbnail, Home) and the watcher's read of the app's own write writes nothing more", async () => {
  const root = project({ a: "A" });
  const { state, list, marks, show, writes } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  expect(state.showing(null)).toBe(true);
  state.documentsChanged();
  await state.idle();
  expect(marks(root)).toEqual({ a: "changed" });
  await show(root, "a");
  const after = writes.length;
  state.recordsChanged(root);
  state.documentsChanged();
  await state.idle();
  expect(writes.length).toBe(after);
});

test.skipIf(isRoot)("a save that fails keeps the dot as a save failure on the shown canvas, tells once, and Retry saves it", async () => {
  const root = project({ a: "A" });
  const { state, list, marks, show, problems, writes } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  chmodSync(join(root, SEEN_DIR), 0o555);
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  expect(problems).toEqual([{ root, problem: { kind: "save", path: pathOf("a"), readOnly: true } }]);
  // No retry loop on the same screen: later proofs and listings write nothing and tell nothing.
  const tried = writes.length;
  state.documentsChanged();
  await list(root);
  expect(writes.length).toBe(tried);
  expect(problems).toHaveLength(1);
  // Retry while it still fails answers the failure itself, without another event.
  expect(await state.retry({ root, path: pathOf("a") })).toEqual({ kind: "save", path: pathOf("a"), readOnly: true });
  expect(problems).toHaveLength(1);
  chmodSync(join(root, SEEN_DIR), 0o755);
  expect(await state.retry({ root, path: pathOf("a") })).toBeNull();
  await state.idle();
  expect(marks(root)).toEqual({});
});

test.skipIf(isRoot)("showing the canvas again after a failed save tries again; a failure on an already seen canvas makes no dot", async () => {
  const root = project({ a: "A", b: "B" });
  const { state, list, marks, show, problems } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  chmodSync(join(root, SEEN_DIR), 0o555);
  await show(root, "a");
  expect(problems).toHaveLength(1);
  state.showing({ root, path: pathOf("b") });
  await show(root, "b", html("B-other"));
  expect(marks(root)).toEqual({ a: "changed:save" });
  await show(root, "a");
  expect(problems).toHaveLength(2);
  chmodSync(join(root, SEEN_DIR), 0o755);
  // The same showing is not tried again on its own.
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  state.showing(null);
  await show(root, "a");
  expect(marks(root)).toEqual({});
});

test.skipIf(isRoot)("a first registration whose records cannot be written makes no dot, tells once and waits for Retry", async () => {
  const root = project({ a: "A" });
  chmodSync(join(root, ".doan"), 0o555);
  const { state, list, marks, problems, writes, local } = app();
  await list(root);
  expect(marks(root)).toEqual({});
  expect(problems).toEqual([{ root, problem: { kind: "baseline", readOnly: true } }]);
  expect(local.root(root)?.baseline).toEqual({ a: fingerprintOf(Buffer.from(html("A"))) });
  const tried = writes.length;
  touch(root, "a");
  await list(root);
  expect(writes.length).toBe(tried);
  expect(marks(root)).toEqual({});
  chmodSync(join(root, ".doan"), 0o755);
  writeFileSync(join(root, pathOf("b")), html("B"));
  await list(root);
  expect(marks(root)).toEqual({ b: "new" });
  expect(await state.retry({ root })).toBeNull();
  expect(seenFiles(root)).toEqual([MARKER, "a.json"]);
  expect(local.root(root)).toEqual({ known: { a: "seen" } });
});

test("records damaged or lost after registration keep the last verdicts, tell once, and never reset to a baseline", async () => {
  const root = project({ a: "A", b: "B" });
  const { state, list, marks, problems, writes } = app();
  await list(root);
  touch(root, "b", "B2");
  await list(root);
  writeFileSync(join(root, SEEN_DIR, "a.json"), "<<<<<<< HEAD\n");
  writeFileSync(join(root, SEEN_DIR, "b.json"), `{"v":7}`);
  state.recordsChanged(root);
  await state.idle();
  expect(marks(root)).toEqual({ b: "changed" });
  expect(problems).toEqual([{ root, problem: { kind: "unsupported" } }]);
  await list(root);
  expect(problems).toHaveLength(1);
  expect(await state.retry({ root })).toEqual({ kind: "unsupported" });
  rmSync(join(root, SEEN_DIR), { recursive: true });
  const before = writes.length;
  state.recordsChanged(root);
  await state.idle();
  expect(marks(root)).toEqual({ b: "changed" });
  expect(problems.at(-1)).toEqual({ root, problem: { kind: "records" } });
  expect(writes.length).toBe(before);
});

test("a canvas with a missing or duplicated ID is never saved; shown unseen it tells the ID problem", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, marks, show, problems, writes } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  await list(root, { b: "a" });
  expect(marks(root)).toEqual({ a: "changed" });
  const before = writes.length;
  await show(root, "a");
  expect(writes.length).toBe(before);
  expect(marks(root)).toEqual({ a: "changed:id" });
  expect(problems).toEqual([{ root, problem: { kind: "id", path: pathOf("a") } }]);
});

test("an older Doan's record is converted keeping its unseen canvases unseen", async () => {
  const root = project({ a: "A", b: "B" });
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  const mtime = statSync(join(root, pathOf("a"))).mtimeMs;
  writeFileSync(join(userData, "canvas-seen.json"), JSON.stringify({ v: 1, roots: { [root]: { [pathOf("a")]: mtime, [pathOf("b")]: mtime - 1 } } }));
  const { list, marks } = app(userData);
  await list(root);
  expect(marks(root)).toEqual({ b: "changed" });
  expect(record(root, "b")).toBe(recordText({ unseen: "migrated" }));
  expect(JSON.parse(readFileSync(join(userData, "canvas-seen.json"), "utf8"))).toEqual({ v: 2, roots: { [root]: { known: { a: "seen", b: "changed" } } } });
});

test("a project leaving the list forgets this device's memory but never its records", async () => {
  const root = project({ a: "A" });
  const { list, remove, local } = app();
  await list(root);
  remove(root);
  expect(local.root(root)).toBeUndefined();
  expect(seenFiles(root)).toEqual([MARKER, "a.json"]);
});

test("bad values are refused", async () => {
  const { state } = app();
  for (const value of [undefined, 1, "x", { root: "/r" }, { root: "/r", path: 1 }, { root: "/not-listed", path: "a" }, { root: "/r", path: "a", extra: 1 }]) expect(state.showing(value)).toBe(false);
  expect(await state.retry({ path: "a" })).toBe(false);
  expect(await state.retry({ root: "/not-listed" })).toBe(false);
});
