import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createLocalSeen } from "./canvasSeen";
import { PROMPT_MS, withFifo } from "./fifo.fixture";
import { GRACE_MS, readGitSignal } from "./gitSignal";
import { createReadState } from "./readState";
import { createFingerprints, fingerprintOf } from "./seenFingerprint";
import { SEEN_DIR } from "./seenRecords";
import type { CanvasRow, FolderEntry, ReadStateProblem } from "./view";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-read-state-")));
let count = 0;
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });
const isRoot = process.getuid?.() === 0;
const html = (body: string) => `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body>${body}</body></html>`;
const pathOf = (id: string) => `.doan/canvases/${id}.html`;
const hashOf = (body: string) => fingerprintOf(Buffer.from(html(body)));

// A project in a git checkout on `main`.
function project(canvases: Record<string, string>): string {
  const root = join(tmp, `r${count++}`);
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  mkdirSync(join(root, ".git/refs/heads"), { recursive: true });
  writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(root, ".doan/tokens.css"), ":root{--a:1}");
  for (const [id, body] of Object.entries(canvases)) writeFileSync(join(root, pathOf(id)), html(body));
  return root;
}
// Every file under the root with its bytes, `.git` aside (a test's own git moves are not the app's).
function tree(dir: string, base = dir): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== ".git") Object.assign(files, tree(path, base)); }
    else files[path.slice(base.length + 1)] = readFileSync(path, "utf8");
  }
  return files;
}

// The read state as index.ts wires it, over real files and the real git signal reader, with the shell's list, the
// visible proof, the window and the grace's clock faked. `localWrite` stands in for canvas-seen.json's file write.
function app(userData = join(tmp, `u${count++}`), options: { localWrite?: (file: string, text: string) => void } = {}) {
  mkdirSync(userData, { recursive: true });
  const local = createLocalSeen(join(userData, "canvas-seen.json"), options.localWrite);
  let entries: FolderEntry[] = [];
  const shown = new Map<string, string>();
  const problems: { root: string; problem: ReadStateProblem }[] = [];
  const reads: string[] = [];
  let changed = 0;
  let clock = 1_000_000;
  let timers: { at: number; run: () => void }[] = [];
  const state = createReadState({
    local,
    fingerprint: createFingerprints().of,
    read: async (root, ids) => { reads.push(root); return (await import("./seenRecords")).readSeen(root, ids); },
    gitSignal: readGitSignal,
    entries: () => entries,
    shown: async (root, row) => shown.get(`${root}\n${row.path}`) ?? null,
    changed: () => { changed++; },
    problem: (root, problem) => { problems.push({ root, problem }); },
    now: () => clock,
    after: (ms, run) => {
      const timer = { at: clock + ms, run };
      timers.push(timer);
      return () => { timers = timers.filter(item => item !== timer); };
    },
  });
  // A listing as the shell makes it: every HTML file in .doan/canvases, its ID from the file name unless given.
  const list = async (root: string, ids: Record<string, string | undefined> = {}, unreadable: string[] = []) => {
    const canvases: CanvasRow[] = readdirSync(join(root, ".doan/canvases")).filter(name => name.endsWith(".html")).sort().map(name => {
      const path = `.doan/canvases/${name}`, stem = name.slice(0, -5);
      const id = stem in ids ? ids[stem] : stem;
      return {
        path, url: `http://x/${encodeURIComponent(root)}/${path}`, mtimeMs: statSync(join(root, path)).mtimeMs, ...(id === undefined ? {} : { id }),
        ...(unreadable.includes(stem) ? { error: { code: "EIO", message: "cannot read" } } : {}),
      };
    });
    const entry: FolderEntry = { path: root, kind: "list", canvases, servedRev: 0 };
    entries = [...entries.filter(item => item.path !== root), entry];
    state.listed(entries);
    await state.idle();
  };
  // Time passes; due grace timers run.
  const advance = async (ms: number) => {
    clock += ms;
    for (const timer of timers.filter(item => item.at <= clock)) {
      timers = timers.filter(item => item !== timer);
      timer.run();
    }
    await state.idle();
  };
  const git = async (root: string) => { state.gitChanged(root); await state.idle(); };
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
  return { state, local, list, advance, git, marks, show, remove, problems, reads, changed: () => changed, userData };
}
const touch = (root: string, id: string, body?: string) => {
  const file = join(root, pathOf(id));
  if (body !== undefined) writeFileSync(file, html(body));
  else writeFileSync(file, readFileSync(file));
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
};
const add = (root: string, id: string) => writeFileSync(join(root, pathOf(id)), html(id.toUpperCase()));

test("showing a canvas changes no file under the root: the record is this device's", async () => {
  const root = project({ a: "A", b: "B" });
  const before = tree(root);
  const { list, marks, show, local } = app();
  await list(root);
  touch(root, "a", "A2");
  const edited = tree(root);
  await list(root);
  expect(marks(root)).toEqual({ a: "changed" });
  await show(root, "a");
  expect(marks(root)).toEqual({});
  expect(tree(root)).toEqual(edited);
  expect(Object.keys(edited).sort()).toEqual(Object.keys(before).sort());
  expect(existsSync(join(root, SEEN_DIR))).toBe(false);
  expect(local.root(root)?.canvases.a).toEqual({ html: hashOf("A2") });
});

test("a new canvas lights after its grace, changed HTML at once; an identical re-save, a restore and a CSS-only change do not", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, advance, marks } = app();
  await list(root);
  touch(root, "a");
  writeFileSync(join(root, ".doan/tokens.css"), ":root{--a:2}");
  await list(root);
  expect(marks(root)).toEqual({});
  touch(root, "b", "B2");
  add(root, "c");
  await list(root);
  expect(marks(root)).toEqual({ b: "changed" });
  await advance(GRACE_MS - 1);
  expect(marks(root)).toEqual({ b: "changed" });
  await advance(1);
  expect(marks(root)).toEqual({ b: "changed", c: "new" });
  touch(root, "b", "B");
  await list(root);
  expect(marks(root)).toEqual({ c: "new" });
});

test("after a restart, a canvas new in the first listing has no dot", async () => {
  const root = project({ a: "A" });
  const userData = join(tmp, `u${count++}`);
  const first = app(userData);
  await first.list(root);
  // Added while the app was closed.
  add(root, "b");
  const restarted = app(userData);
  await restarted.list(root);
  await restarted.advance(GRACE_MS);
  expect(restarted.marks(root)).toEqual({});
  expect(restarted.local.root(root)?.canvases.b).toEqual({ html: hashOf("B") });
});

test("a new-canvas dot and a changed dot lit before a restart stay lit", async () => {
  const root = project({ a: "A" });
  const userData = join(tmp, `u${count++}`);
  const first = app(userData);
  await first.list(root);
  add(root, "b");
  touch(root, "a", "A2");
  await first.list(root);
  await first.advance(GRACE_MS);
  expect(first.marks(root)).toEqual({ a: "changed", b: "new" });
  const restarted = app(userData);
  await restarted.list(root);
  expect(restarted.marks(root)).toEqual({ a: "changed", b: "new" });
  await restarted.show(root, "b");
  expect(restarted.marks(root)).toEqual({ a: "changed" });
});

test("a canvas arriving right after a branch switch, or just before one, has no dot", async () => {
  const root = project({ a: "A" });
  const { list, advance, git, marks, local } = app();
  await list(root);
  // The checkout writes the working tree and HEAD; the listing sees both.
  writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/other\n");
  add(root, "b");
  await git(root);
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
  expect(local.root(root)?.canvases.b).toEqual({ html: hashOf("B") });
  // A pull writes the files first and FETCH_HEAD and ORIG_HEAD a moment later.
  add(root, "c");
  await list(root);
  await advance(GRACE_MS / 2);
  writeFileSync(join(root, ".git/FETCH_HEAD"), "abc\tbranch 'main'\n");
  await git(root);
  expect(local.root(root)?.canvases.c).toEqual({ html: hashOf("C") });
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
});

test("a canvas committed right after it was created still gets a dot; a branch switch long before does not hide one", async () => {
  const root = project({ a: "A" });
  const { list, advance, git, marks } = app();
  await list(root);
  writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/feature\n");
  await git(root);
  await advance(GRACE_MS + 1);
  add(root, "b");
  await list(root);
  // A commit moves the branch's ref and the index, never HEAD.
  writeFileSync(join(root, ".git/refs/heads/feature"), `${"1".repeat(40)}\n`);
  writeFileSync(join(root, ".git/index"), "index");
  await git(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({ b: "new" });
});

test("a canvas shown during its grace is recorded as shown and never lights", async () => {
  const root = project({ a: "A" });
  const { list, advance, show, marks, local } = app();
  await list(root);
  add(root, "b");
  await list(root);
  await show(root, "b");
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
  expect(local.root(root)?.canvases.b).toEqual({ html: hashOf("B") });
});

test("a canvas whose HTML could not be read at the first listing is not new once it can be", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, advance, marks, local } = app();
  await list(root, {}, ["b"]);
  expect(local.root(root)?.canvases.b).toBeUndefined();
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
  expect(local.root(root)?.canvases.b).toEqual({ html: hashOf("B") });
});

test("a project in a subfolder of its repository sees the repository's branch switch", async () => {
  const repo = project({});
  const root = join(repo, "packages/web");
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, pathOf("a")), html("A"));
  const { list, advance, git, marks } = app();
  await list(root);
  writeFileSync(join(repo, ".git/HEAD"), "ref: refs/heads/other\n");
  writeFileSync(join(root, pathOf("b")), html("B"));
  await git(root);
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
});

test("a project outside git, or with a .git that cannot be read, settles new canvases as new", async () => {
  const root = project({ a: "A" });
  rmSync(join(root, ".git"), { recursive: true });
  writeFileSync(join(root, ".git"), "not a link\n");
  const { list, advance, marks } = app();
  await list(root);
  add(root, "b");
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({ b: "new" });
});

test("a git file that is a FIFO does not hang the listing or the git signal", async () => {
  // A FIFO .git or HEAD reads as no repository or no branch, so the signal moved and git brought the canvas; a FIFO
  // FETCH_HEAD or ORIG_HEAD reads as no file, so nothing moved and the canvas is new.
  const expected: Record<string, Record<string, string>> = { ".git": {}, ".git/HEAD": {}, ".git/FETCH_HEAD": { b: "new" }, ".git/ORIG_HEAD": { b: "new" } };
  for (const [at, dots] of Object.entries(expected)) {
    const root = project({ a: "A" });
    const { list, advance, git, marks } = app();
    await list(root);
    rmSync(join(root, at), { recursive: true, force: true });
    add(root, "b");
    const listed = await withFifo(join(root, at), async () => {
      await list(root);
      await git(root);
      return readGitSignal(root);
    });
    expect(listed.ms, at).toBeLessThan(PROMPT_MS);
    await advance(GRACE_MS);
    expect(marks(root), at).toEqual(dots);
  }
});

test("a save that fails keeps the dot as a save failure on the shown canvas, tells once, and Retry saves it", async () => {
  const root = project({ a: "A" });
  let fail = false;
  const { state, list, marks, show, problems, local } = app(undefined, { localWrite: (file, text) => { if (fail) throw new Error("injected"); writeFileSync(file, text); } });
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  fail = true;
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  expect(problems).toEqual([{ root, problem: { kind: "save", path: pathOf("a") } }]);
  expect(local.root(root)?.canvases.a).toEqual({ html: hashOf("A") });
  // No retry loop on the same screen: later proofs and listings tell nothing.
  state.documentsChanged();
  await list(root);
  expect(problems).toHaveLength(1);
  // Retry while it still fails answers the failure itself, without another event.
  expect(await state.retry({ root, path: pathOf("a") })).toEqual({ kind: "save", path: pathOf("a") });
  expect(problems).toHaveLength(1);
  fail = false;
  expect(await state.retry({ root, path: pathOf("a") })).toBeNull();
  await state.idle();
  expect(marks(root)).toEqual({});
});

test("a failed save keeps its failure dot while the canvas stays shown, even when its HTML changes", async () => {
  const root = project({ a: "A" });
  let fail = false;
  const { state, list, marks, show, changed } = app(undefined, { localWrite: (file, text) => { if (fail) throw new Error("injected"); writeFileSync(file, text); } });
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  fail = true;
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  touch(root, "a", "A3");
  await list(root);
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  const before = changed();
  expect(state.showing(null)).toBe(true);
  await state.idle();
  expect(marks(root)).toEqual({ a: "changed" });
  expect(changed()).toBeGreaterThan(before);
});

test("showing the canvas again after a failed save tries again; a failure on an already seen canvas makes no dot", async () => {
  const root = project({ a: "A", b: "B" });
  let fail = false;
  const { state, list, marks, show, problems } = app(undefined, { localWrite: (file, text) => { if (fail) throw new Error("injected"); writeFileSync(file, text); } });
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  fail = true;
  await show(root, "a");
  expect(problems).toHaveLength(1);
  await show(root, "b", html("B-other"));
  expect(marks(root)).toEqual({ a: "changed:save" });
  expect(problems).toHaveLength(1);
  await show(root, "a");
  expect(problems).toHaveLength(2);
  fail = false;
  // The same showing is not tried again on its own.
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:save" });
  state.showing(null);
  await show(root, "a");
  expect(marks(root)).toEqual({});
});

test("a canvas with a missing or duplicated ID is never recorded; shown unseen it tells the ID problem", async () => {
  const root = project({ a: "A", b: "B" });
  const { list, marks, show, problems, local } = app();
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  await list(root, { b: "a" });
  expect(marks(root)).toEqual({ a: "changed" });
  await show(root, "a");
  expect(marks(root)).toEqual({ a: "changed:id" });
  expect(problems).toEqual([{ root, problem: { kind: "id", path: pathOf("a") } }]);
  expect(local.root(root)?.canvases.a).toEqual({ html: hashOf("A") });
});

test("a screen still showing A while the record and the disk both hold B records nothing", async () => {
  const root = project({ a: "A" });
  const { list, marks, show, local } = app();
  await list(root);
  touch(root, "a", "B");
  await list(root);
  await show(root, "a");
  await show(root, "a", html("A"));
  expect(local.root(root)?.canvases.a).toEqual({ html: hashOf("B") });
  expect(marks(root)).toEqual({});
});

// A project whose `.doan/seen/` holds records an older Doan wrote: a seen as it is now, b seen at older content, c
// unseen when it was converted.
function sharedProject(): string {
  const root = project({ a: "A", b: "B", c: "C" });
  mkdirSync(join(root, SEEN_DIR));
  writeFileSync(join(root, SEEN_DIR, "_project.json"), `{"v":1}\n`);
  writeFileSync(join(root, SEEN_DIR, "a.json"), `{"v":1,"html":"${hashOf("A")}"}\n`);
  writeFileSync(join(root, SEEN_DIR, "b.json"), `{"v":1,"html":"${hashOf("old")}"}\n`);
  writeFileSync(join(root, SEEN_DIR, "c.json"), `{"v":1,"unseen":"migrated"}\n`);
  return root;
}

test("a project's .doan/seen/ records become its local record once, keeping every dot, and are never read again", async () => {
  const root = sharedProject();
  const records = tree(root);
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  // This device knew the project under an older Doan.
  writeFileSync(join(userData, "canvas-seen.json"), JSON.stringify({ v: 2, roots: { [root]: { known: { a: "seen", b: "changed", c: "changed" } } } }));
  const first = app(userData);
  await first.list(root);
  expect(first.marks(root)).toEqual({ b: "changed", c: "changed" });
  expect(first.problems).toEqual([]);
  expect(first.local.root(root)?.migrated).toBe(true);
  await first.show(root, "b");
  await first.list(root);
  expect(first.reads).toEqual([root]);
  expect(tree(root)).toEqual(records);
  // Gone or damaged afterwards: nothing changes, nothing is told.
  writeFileSync(join(root, SEEN_DIR, "c.json"), "<<<<<<< HEAD\n");
  const restarted = app(userData);
  await restarted.list(root);
  expect(restarted.marks(root)).toEqual({ c: "changed" });
  expect(restarted.reads).toEqual([]);
});

test("a new worktree or another machine with tracked .doan/seen/ records starts as a first registration and never reads them", async () => {
  const root = sharedProject();
  const { list, advance, marks, reads, local } = app();
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({});
  expect(reads).toEqual([]);
  expect(local.root(root)).toEqual({ migrated: true, canvases: { a: { html: hashOf("A") }, b: { html: hashOf("B") }, c: { html: hashOf("C") } } });
});

test("after a damaged canvas-seen.json is moved aside, a project with .doan/seen/ records lights nothing", async () => {
  const root = sharedProject();
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  writeFileSync(join(userData, "canvas-seen.json"), "{");
  const { list, marks, reads } = app(userData);
  await list(root);
  expect(marks(root)).toEqual({});
  expect(reads).toEqual([]);
});

test("an older Doan's device-local record is converted keeping its unseen canvases unseen", async () => {
  const root = project({ a: "A", b: "B" });
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  const mtime = statSync(join(root, pathOf("a"))).mtimeMs;
  writeFileSync(join(userData, "canvas-seen.json"), JSON.stringify({ v: 1, roots: { [root]: { [pathOf("a")]: mtime, [pathOf("b")]: mtime - 1 } } }));
  const { list, marks } = app(userData);
  await list(root);
  expect(marks(root)).toEqual({ b: "changed" });
  expect(JSON.parse(readFileSync(join(userData, "canvas-seen.json"), "utf8"))).toEqual({ v: 3, roots: { [root]: { migrated: true, canvases: { a: { html: hashOf("A") }, b: { unseen: "migrated" } } } } });
});

test("a project leaving the list keeps its record; registered again it compares with it and baselines what is new", async () => {
  const root = project({ a: "A" });
  const { list, advance, remove, marks, local } = app();
  await list(root);
  remove(root);
  await advance(0);
  expect(local.root(root)?.canvases.a).toEqual({ html: hashOf("A") });
  touch(root, "a", "A2");
  add(root, "b");
  await list(root);
  await advance(GRACE_MS);
  expect(marks(root)).toEqual({ a: "changed" });
});

test("a damaged canvas-seen.json is moved aside: nothing lights, and the first project entry tells it once", async () => {
  const root = project({ a: "A" });
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  writeFileSync(join(userData, "canvas-seen.json"), "{");
  const { state, list, marks, problems } = app(userData);
  await list(root);
  expect(marks(root)).toEqual({});
  expect(readdirSync(userData).filter(name => name.startsWith("canvas-seen.corrupt-"))).toHaveLength(1);
  expect(await state.retry({ root })).toEqual({ kind: "records" });
  expect(await state.retry({ root })).toBeNull();
  expect(problems).toEqual([]);
});

test("a later Doan's canvas-seen.json is never overwritten: verdicts work in memory and the first project entry tells it once", async () => {
  const root = project({ a: "A" });
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  const newer = JSON.stringify({ v: 4, roots: {} });
  writeFileSync(join(userData, "canvas-seen.json"), newer);
  const { state, list, marks, show } = app(userData);
  await list(root);
  touch(root, "a", "A2");
  await list(root);
  expect(marks(root)).toEqual({ a: "changed" });
  await show(root, "a");
  expect(marks(root)).toEqual({});
  expect(await state.retry({ root })).toEqual({ kind: "unsupported" });
  expect(await state.retry({ root })).toBeNull();
  expect(readFileSync(join(userData, "canvas-seen.json"), "utf8")).toBe(newer);
});

test.skipIf(isRoot)("a canvas-seen.json that cannot be written loses nothing this run: a first listing and a new canvas stay as judged", async () => {
  const root = project({ a: "A" });
  const userData = join(tmp, `u${count++}`);
  mkdirSync(userData);
  chmodSync(userData, 0o555);
  try {
    const { list, advance, marks } = app(userData);
    await list(root);
    add(root, "b");
    await list(root);
    await advance(GRACE_MS);
    expect(marks(root)).toEqual({ b: "new" });
    await list(root);
    expect(marks(root)).toEqual({ b: "new" });
  } finally { chmodSync(userData, 0o755); }
});

test("bad values are refused", async () => {
  const { state } = app();
  for (const value of [undefined, 1, "x", { root: "/r" }, { root: "/r", path: 1 }, { root: "/not-listed", path: "a" }, { root: "/r", path: "a", extra: 1 }]) expect(state.showing(value)).toBe(false);
  expect(await state.retry({ path: "a" })).toBe(false);
  expect(await state.retry({ root: "/not-listed" })).toBe(false);
});
