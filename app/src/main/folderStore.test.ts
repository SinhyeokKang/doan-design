import { chmodSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { openFolderStore, readFoldersFile, readFoldersFileForPruning, writeFoldersFile } from "./folderStore";

const tmp = mkdtempSync(join(tmpdir(), "doan-folders-"));
let count = 0;
const isRoot = process.getuid?.() === 0;

afterAll(() => {
  for (const name of readdirSync(tmp)) chmodSync(join(tmp, name), 0o755);
  rmSync(tmp, { recursive: true, force: true });
});

function dir(): string {
  const path = join(tmp, `d${count++}`);
  mkdirSync(path);
  return path;
}

describe("readFoldersFile", () => {
  test.each(["{not json", "null", "{}", '["/a", 1]'])("invalid contents are unknown for pruning but remain an empty list for other callers: %s", async (contents) => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, contents);
    expect(await readFoldersFileForPruning(file)).toBeNull();
    expect(await readFoldersFile(file)).toEqual([]);
  });

  test("pruning distinguishes a missing file from a read failure", async () => {
    const file = join(dir(), "folders.json");
    expect(await readFoldersFileForPruning(file)).toEqual([]);
    mkdirSync(file);
    expect(await readFoldersFileForPruning(file)).toBeNull();
  });

  test("pruning uses the same normalization as the folder store", async () => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, '["/a", "", "/b", "/a"]');
    expect(await readFoldersFileForPruning(file)).toEqual(["/a", "/b"]);
  });

  test("a missing file is an empty list", async () => {
    expect(await readFoldersFile(join(dir(), "folders.json"))).toEqual([]);
  });

  test("a broken file is an empty list", async () => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, "{not json");
    expect(await readFoldersFile(file)).toEqual([]);
  });

  test("a directory in its place is an empty list", async () => {
    const file = join(dir(), "folders.json");
    mkdirSync(file);
    expect(await readFoldersFile(file)).toEqual([]);
  });
});

describe("writeFoldersFile", () => {
  test("round-trips the list", async () => {
    const file = join(dir(), "folders.json");
    await writeFoldersFile(file, ["/a", "/b"]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["/a", "/b"]);
    expect(await readFoldersFile(file)).toEqual(["/a", "/b"]);
  });

  test("replaces the file by rename and leaves no temp file", async () => {
    const parent = dir();
    const file = join(parent, "folders.json");
    writeFileSync(file, '["/old"]');
    // A hard link still points at the old inode after a rename; an in-place
    // write would change it too.
    linkSync(file, join(parent, "old-link"));
    await writeFoldersFile(file, ["/new"]);
    expect(readFileSync(join(parent, "old-link"), "utf8")).toBe('["/old"]');
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["/new"]);
    expect(readdirSync(parent).sort()).toEqual(["folders.json", "old-link"]);
  });
});

describe("openFolderStore", () => {
  test("loads the saved list and saves each change", async () => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, '["/a"]');
    const store = await openFolderStore(file);
    expect(store.list()).toEqual(["/a"]);
    expect(await store.add("/b")).toBeNull();
    expect(await store.add("/a")).toBeNull();
    expect(await store.remove("/a")).toBeNull();
    expect(store.list()).toEqual(["/b"]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["/b"]);
  });

  test.skipIf(isRoot)("keeps the in-memory list when the directory is not writable", async () => {
    const parent = dir();
    const file = join(parent, "folders.json");
    writeFileSync(file, '["/a"]');
    const store = await openFolderStore(file);
    chmodSync(parent, 0o555);
    try {
      const error = await store.add("/b");
      expect(error).toBeInstanceOf(Error);
      expect(store.list()).toEqual(["/a", "/b"]);
      expect(readFileSync(file, "utf8")).toBe('["/a"]');
      expect(readdirSync(parent)).toEqual(["folders.json"]);
    } finally {
      chmodSync(parent, 0o755);
    }
  });
});

test("replacement preserves order and serializes with later additions", async () => {
  const file = join(dir(), "folders.json"); const store = await openFolderStore(file);
  await store.add("/old");
  const paths = ["/root", "/other"];
  const replace = store.replace(paths); paths.push("/mutated");
  const add = store.add("/last");
  expect(store.list()).toEqual(["/root", "/other", "/last"]);
  expect(await replace).toBeNull(); expect(await add).toBeNull();
  expect(await readFoldersFile(file)).toEqual(["/root", "/other", "/last"]);
});

describe("auto-registered marks", () => {
  const autoFile = (file: string) => join(file, "..", "auto-folders.json");
  const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

  test("adopting writes the mark beside folders.json and a reopened store keeps it", async () => {
    const file = join(dir(), "folders.json");
    const store = await openFolderStore(file);
    expect(await store.add("/main")).toBeNull();
    expect(await store.adopt("/w1")).toBeNull();
    expect(store.list()).toEqual(["/main", "/w1"]);
    expect(store.auto()).toEqual(["/w1"]);
    expect(readJson(file)).toEqual(["/main", "/w1"]);
    expect(readJson(autoFile(file))).toEqual(["/w1"]);
    const reopened = await openFolderStore(file);
    expect(reopened.list()).toEqual(["/main", "/w1"]);
    expect(reopened.auto()).toEqual(["/w1"]);
  });

  test("a store that never adopted writes no mark file", async () => {
    const parent = dir();
    const store = await openFolderStore(join(parent, "folders.json"));
    await store.add("/a");
    await store.remove("/a");
    expect(readdirSync(parent)).toEqual(["folders.json"]);
  });

  test("claiming a root clears its mark on disk", async () => {
    const file = join(dir(), "folders.json");
    const store = await openFolderStore(file);
    await store.adopt("/w1");
    expect(await store.claim("/w1")).toBeNull();
    expect(store.auto()).toEqual([]);
    expect(store.list()).toEqual(["/w1"]);
    expect(readJson(autoFile(file))).toEqual([]);
    expect((await openFolderStore(file)).auto()).toEqual([]);
  });

  test("removing a marked root drops its mark on the next write", async () => {
    const file = join(dir(), "folders.json");
    const store = await openFolderStore(file);
    await store.add("/main");
    await store.adopt("/w1");
    expect(await store.replace(["/main"])).toBeNull();
    expect(store.auto()).toEqual([]);
    expect(readJson(autoFile(file))).toEqual([]);
  });

  test.each(["{not json", "{}", '["/w1", 1]'])("a damaged mark file reads as no marks: %s", async (contents) => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, '["/main", "/w1"]');
    writeFileSync(autoFile(file), contents);
    const store = await openFolderStore(file);
    expect(store.list()).toEqual(["/main", "/w1"]);
    expect(store.auto()).toEqual([]);
  });

  test("a mark of a root not in folders.json is ignored and pruned by the next write", async () => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, '["/main", "/w1"]');
    writeFileSync(autoFile(file), '["/w1", "/gone"]');
    const store = await openFolderStore(file);
    expect(store.auto()).toEqual(["/w1"]);
    await store.add("/other");
    expect(readJson(autoFile(file))).toEqual(["/w1"]);
  });

  // POSTMORTEM 2026-10-26: an unreadable folders.json starts an empty list, which must not erase the marks.
  test("an unreadable folders.json never prunes the marks", async () => {
    const file = join(dir(), "folders.json");
    writeFileSync(file, "{not json");
    writeFileSync(autoFile(file), '["/w1"]');
    const store = await openFolderStore(file);
    expect(store.list()).toEqual([]);
    expect(store.auto()).toEqual([]);
    await store.add("/main");
    await store.adopt("/w2");
    expect(readJson(autoFile(file))).toEqual(["/w1", "/w2"]);
    expect(store.auto()).toEqual(["/w2"]);
  });

  // An earlier write finishing late must not rename an older state over a newer one (POSTMORTEM 2026-10-25).
  test("writes keep their start order across both files", async () => {
    const file = join(dir(), "folders.json");
    const store = await openFolderStore(file);
    await store.add("/main");
    const adopt = store.adopt("/w1");
    const claim = store.claim("/w1");
    const remove = store.replace(["/main"]);
    const again = store.adopt("/w2");
    expect(await adopt).toBeNull(); expect(await claim).toBeNull(); expect(await remove).toBeNull(); expect(await again).toBeNull();
    expect(readJson(file)).toEqual(["/main", "/w2"]);
    expect(readJson(autoFile(file))).toEqual(["/w2"]);
    expect(store.auto()).toEqual(["/w2"]);
  });

  // The mark goes first: a stop between the two files leaves a mark folders.json does not list (ignored), never an
  // unmarked root that would stay hand-added for good.
  test("adopting writes the mark before folders.json", async () => {
    const parent = dir();
    const file = join(parent, "folders.json");
    const store = await openFolderStore(file);
    await store.add("/main");
    rmSync(file);
    mkdirSync(file);
    expect(await store.adopt("/w1")).toBeInstanceOf(Error);
    expect(readJson(autoFile(file))).toEqual(["/w1"]);
  });

  test.skipIf(isRoot)("folders.json is not written when the mark cannot be saved", async () => {
    const parent = dir();
    const file = join(parent, "folders.json");
    const store = await openFolderStore(file);
    await store.add("/main");
    mkdirSync(autoFile(file));
    expect(await store.adopt("/w1")).toBeInstanceOf(Error);
    expect(readJson(file)).toEqual(["/main"]);
    expect(store.auto()).toEqual(["/w1"]);
  });
});
