import { chmodSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { openFolderStore, readFoldersFile, writeFoldersFile } from "./folderStore";

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
