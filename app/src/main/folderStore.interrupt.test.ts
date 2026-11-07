// defect-sweep C2 fix round 3: a hand-added alias and an auto-registered real spelling of one folder
// (`folders=[alias, real]`, `marks=[real]`) collapse to one hand-added project. Whichever of the startup step's five
// writes fails, or wherever the app stops, the run that failed and the next launch both keep it hand-added, so a
// missing folder is never pruned as an auto-registered one.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

// Fails the rename that would complete the chosen write; every other write is real.
const io = vi.hoisted(() => ({ failAt: 0, renames: 0 }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: async (from: string, to: string) => {
    if (++io.renames === io.failAt) throw new Error(`injected failure saving ${basename(to)}`);
    return actual.rename(from, to);
  } };
});
const { pruneAuto } = await import("./autoFolders");
const { openFolderStore } = await import("./folderStore");

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-folder-interrupt-")));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { io.failAt = 0; io.renames = 0; });
let count = 0;

function fixture() {
  const base = join(tmp, `d${count++}`), real = join(base, "repo"), alias = join(base, "alias");
  mkdirSync(real, { recursive: true }); symlinkSync(real, alias);
  const folders = join(base, "folders.json"), marks = join(base, "auto-folders.json");
  writeFileSync(folders, JSON.stringify([alias, real]));
  writeFileSync(marks, JSON.stringify([real]));
  return { real, alias, folders, marks };
}
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
// The state step's two writes (canvas-seen.json, ui-state.json), counted with the store's own renames.
const migrate = async () => {
  for (let write = 0; write < 2; write++) if (++io.renames === io.failAt) return false;
  return true;
};
// Hand-added: when every spelling of the folder is missing, at least one listed spelling of it survives pruning.
const handAdded = (store: { list(): string[]; auto(): string[] }) =>
  pruneAuto(store.list(), store.auto(), new Map(store.list().map(path => [path, "ENOENT"]))).length > 0;

test.each([1, 2, 3, 4, 5])("a failure at write %i leaves the project hand-added in that run and the next", async failAt => {
  const { real, folders, marks } = fixture();
  io.failAt = failAt;
  const failed = await openFolderStore(folders, migrate);
  expect(handAdded(failed)).toBe(true);
  // The run that failed lists what reading the files now on disk gives, so it and the next launch agree.
  io.failAt = 0;
  const onDisk = await openFolderStore(folders, async () => false);
  expect({ list: failed.list(), auto: failed.auto() }).toEqual({ list: onDisk.list(), auto: onDisk.auto() });
  // The next launch retries and finishes: one hand-added real path.
  const next = await openFolderStore(folders, migrate);
  expect(next.list()).toEqual([real]);
  expect(next.auto()).toEqual([]);
  expect(read(folders)).toEqual([real]);
  expect(read(marks)).toEqual([]);
});

test("without a failure the step writes the cleared marks, folders.json and the final marks, in that order", async () => {
  const { real, folders, marks } = fixture();
  const store = await openFolderStore(folders, migrate);
  expect(io.renames).toBe(5);
  expect(store.list()).toEqual([real]);
  expect(store.auto()).toEqual([]);
  expect(read(marks)).toEqual([]);
});
