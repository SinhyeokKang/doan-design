// defect-sweep C2 fix round 2: reading roots saved through a symlink as their real paths is one ordered startup step,
// as index.ts wires it: canvas-seen.json, then ui-state.json, then folders.json, then auto-folders.json. Only a step
// that completed lets the next run; a failure keeps the saved spellings for the run and the next launch retries.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { pruneAuto } from "./autoFolders";
import { createCanvasSeenStore } from "./canvasSeen";
import { openFolderStore } from "./folderStore";
import { createUiStateStore, moveUiStateRoots } from "./uiState";
import type { CanvasRow, FolderEntry } from "./view";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-root-migration-")));
let count = 0;
afterAll(() => { chmodSync(tmp, 0o755); rmSync(tmp, { recursive: true, force: true }); });
const isRoot = process.getuid?.() === 0;

const A = ".doan/canvases/a.html";
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
// userData holding the three files, and a real project with a symlink to it.
function fixture() {
  const base = join(tmp, `d${count++}`), userData = join(base, "userData"), real = join(base, "repo"), alias = join(base, "alias");
  mkdirSync(userData, { recursive: true }); mkdirSync(real);
  symlinkSync(real, alias);
  const files = { folders: join(userData, "folders.json"), marks: join(userData, "auto-folders.json"), seen: join(userData, "canvas-seen.json"), ui: join(userData, "ui-state.json") };
  return { userData, real, alias, files };
}
const row = (path: string, mtimeMs: number): CanvasRow => ({ path, url: `http://x/${path}`, mtimeMs });
const listed = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });
const workspace = (root: string) => JSON.stringify({ screen: "workspace", root, expanded: { [root]: ["settings"] }, lastByRoot: {}, shellProjects: { [root]: { roots: [root], expanded: true, groups: { ds: false } } } });
// index.ts's step: canvas-seen first, then ui-state.
const migration = (seen: ReturnType<typeof createCanvasSeenStore>, ui: string) => async (aliases: ReadonlyMap<string, string>) => seen.copyRoots(aliases) && await moveUiStateRoots(ui, aliases);

test("a folder save right after start no longer loses ui-state memory saved under the alias", async () => {
  const { real, alias, files } = fixture();
  writeFileSync(files.folders, JSON.stringify([alias]));
  writeFileSync(files.ui, workspace(alias));
  const seen = createCanvasSeenStore(files.seen);
  const store = await openFolderStore(files.folders, migration(seen, files.ui));
  expect(store.list()).toEqual([real]);
  // The list is saved before the renderer ever saves its UI state, then the app stops.
  await store.add(join(tmp, "other"));
  const reopened = await openFolderStore(files.folders, migration(createCanvasSeenStore(files.seen), files.ui));
  expect(reopened.spellings().size).toBe(0);
  expect(await createUiStateStore(files.ui, () => reopened.list(), undefined, undefined, () => reopened.spellings()).read()).toMatchObject({
    screen: "workspace", root: real, expanded: { [real]: ["settings"] },
    shellProjects: { [real]: { roots: [real], groups: { ds: false } } },
  });
});

test("a canvas-seen write that fails keeps the saved spelling, and the next launch moves the record and keeps the canvas unseen", async () => {
  const { real, alias, files } = fixture();
  writeFileSync(files.folders, JSON.stringify([alias]));
  writeFileSync(files.seen, JSON.stringify({ v: 1, roots: { [alias]: { [A]: 1 } } }));
  const failing = createCanvasSeenStore(files.seen, () => { throw new Error("injected canvas-seen write failure"); });
  const store = await openFolderStore(files.folders, migration(failing, files.ui));
  // Nothing moved: the list, the files and the record keep the saved spelling for this run.
  expect(store.list()).toEqual([alias]);
  expect(json(files.folders)).toEqual([alias]);
  expect(json(files.seen)).toEqual({ v: 1, roots: { [alias]: { [A]: 1 } } });
  // A later folder save in the same run writes the saved spelling, not the real path.
  await store.add(join(tmp, "other"));
  expect(json(files.folders)).toEqual([alias, join(tmp, "other")]);
  // Next launch, the write succeeds: the record moves before the list, and the change since mtime 1 is still unseen.
  const seen = createCanvasSeenStore(files.seen);
  const next = await openFolderStore(files.folders, migration(seen, files.ui));
  expect(next.list()).toEqual([real, join(tmp, "other")]);
  const [entry] = seen.apply([listed(real, [row(A, 2)])]);
  expect(entry?.kind === "list" && entry.canvases[0]?.unseen).toBe("changed");
  expect(json(files.seen)).toEqual({ v: 1, roots: { [real]: { [A]: 1 } } });
});

test("a newer Doan's canvas-seen.json is never overwritten: the spelling stays and every file is untouched", async () => {
  const { alias, files } = fixture();
  const newer = JSON.stringify({ v: 2, roots: {} });
  writeFileSync(files.folders, JSON.stringify([alias]));
  writeFileSync(files.marks, JSON.stringify([alias]));
  writeFileSync(files.seen, newer);
  writeFileSync(files.ui, workspace(alias));
  const store = await openFolderStore(files.folders, migration(createCanvasSeenStore(files.seen), files.ui));
  expect(store.list()).toEqual([alias]);
  expect(store.auto()).toEqual([alias]);
  expect(readFileSync(files.seen, "utf8")).toBe(newer);
  expect(json(files.ui)).toEqual(JSON.parse(workspace(alias)));
  expect(json(files.folders)).toEqual([alias]);
  expect(json(files.marks)).toEqual([alias]);
});

test("a ui-state.json moved by an earlier run whose folder write failed is still read under the spelling this run lists", async () => {
  const { real, alias, files } = fixture();
  writeFileSync(files.folders, JSON.stringify([alias]));
  writeFileSync(files.ui, workspace(real));
  const store = await openFolderStore(files.folders, async () => false);
  expect(store.list()).toEqual([alias]);
  expect(await createUiStateStore(files.ui, () => store.list(), undefined, undefined, () => store.spellings()).read()).toMatchObject({
    screen: "workspace", root: alias, expanded: { [alias]: ["settings"] }, shellProjects: { [alias]: { groups: { ds: false } } },
  });
});

test.skipIf(isRoot)("a folders.json that cannot be written keeps the saved spellings and the auto mark, and leaves the state files as moved", async () => {
  const { userData, alias, files } = fixture();
  writeFileSync(files.folders, JSON.stringify([alias]));
  writeFileSync(files.marks, JSON.stringify([alias]));
  let moved = false;
  chmodSync(userData, 0o555);
  try {
    const store = await openFolderStore(files.folders, async () => { moved = true; return true; });
    expect(moved).toBe(true);
    expect(store.list()).toEqual([alias]);
    expect(store.auto()).toEqual([alias]);
  } finally { chmodSync(userData, 0o755); }
  expect(json(files.folders)).toEqual([alias]);
  // Restart with the folder written: the auto-registered project is still auto.
  const store = await openFolderStore(files.folders, async () => true);
  expect(store.auto()).toEqual(store.list());
});

test("folders.json is written before auto-folders.json, and a stop between them keeps an auto project auto", async () => {
  const { real, alias, files } = fixture();
  // What a run that wrote folders.json and stopped before the marks leaves.
  writeFileSync(files.folders, JSON.stringify([real]));
  writeFileSync(files.marks, JSON.stringify([alias]));
  const store = await openFolderStore(files.folders, async () => true);
  expect(store.list()).toEqual([real]);
  expect(store.auto()).toEqual([real]);
  expect(json(files.marks)).toEqual([real]);
  expect(pruneAuto(store.list(), store.auto(), new Map([[real, "ENOENT"]]))).toEqual([]);
});

test("the state step runs before folders.json changes, and a second launch after success writes nothing", async () => {
  const { real, alias, files } = fixture();
  writeFileSync(files.folders, JSON.stringify([alias]));
  let seenAtStep: unknown;
  await openFolderStore(files.folders, async () => { seenAtStep = json(files.folders); return true; });
  expect(seenAtStep).toEqual([alias]);
  expect(json(files.folders)).toEqual([real]);
  const before = readFileSync(files.folders, "utf8");
  let called = false;
  const again = await openFolderStore(files.folders, async () => { called = true; return true; });
  expect(called).toBe(false);
  expect(again.spellings().size).toBe(0);
  expect(readFileSync(files.folders, "utf8")).toBe(before);
});
