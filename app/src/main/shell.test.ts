import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, inject, test } from "vitest";
import { startShell, type Shell } from "./shell";
import type { FolderEntry } from "./view";

const cli = inject("doanCli");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-shell-test-")));
let count = 0;
const shells: Shell[] = [];

afterEach(async () => {
  await Promise.all(shells.splice(0).map((shell) => shell.dispose()));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function dir(): string {
  const path = join(tmp, `d${count++}`);
  mkdirSync(path);
  return path;
}

function writeRepo(root: string, config = '{"v":1}'): string {
  mkdirSync(join(root, ".doan"), { recursive: true });
  writeFileSync(join(root, ".doan", "config.json"), config);
  mkdirSync(join(root, "design"), { recursive: true });
  writeFileSync(join(root, "design", "a.html"), "<!doctype html><title>A</title>");
  return root;
}

interface Started {
  shell: Shell;
  changes: FolderEntry[][];
  foldersFile: string;
}

async function start(cliPath = cli): Promise<Started> {
  const foldersFile = join(dir(), "folders.json");
  const changes: FolderEntry[][] = [];
  const shell = await startShell(foldersFile, cliPath, (entries) => changes.push(entries));
  shells.push(shell);
  return { shell, changes, foldersFile };
}

function saved(foldersFile: string): unknown {
  try {
    return JSON.parse(readFileSync(foldersFile, "utf8"));
  } catch {
    return [];
  }
}

describe("opening a picked folder", () => {
  test("a subfolder of a broken repo is refused with the CLI's message", async () => {
    const root = writeRepo(dir(), "{");
    const { shell, foldersFile } = await start();
    const refused = await shell.open(join(root, "design"));
    expect(refused).toContain("Cannot read config");
    expect(shell.entries()).toEqual([]);
    expect(saved(foldersFile)).toEqual([]);
  });

  // `.doan/` without config.json is not a repo marker for the CLI (ARCHITECTURE §13).
  test("a subfolder with only .doan/ inside a broken repo is refused", async () => {
    const root = writeRepo(dir(), "{");
    const sub = join(root, "sub");
    mkdirSync(join(sub, ".doan", "comments"), { recursive: true });
    const { shell } = await start();
    expect(await shell.open(sub)).toContain("Cannot read config");
    expect(shell.entries()).toEqual([]);
  });

  test("the root of a broken repo is stored and shows its error", async () => {
    const root = writeRepo(dir(), "{");
    const { shell, foldersFile } = await start();
    expect(await shell.open(root)).toBeNull();
    expect(shell.entries()).toEqual([expect.objectContaining({ path: root })]);
    expect(saved(foldersFile)).toEqual([root]);
  });

  test("a missing CLI refuses the pick instead of storing it", async () => {
    const root = writeRepo(dir());
    const { shell } = await start(join(tmp, "no-such-doan"));
    expect(await shell.open(root)).toMatch(/^doan CLI 오류/);
    expect(shell.entries()).toEqual([]);
  });

  test("a folder that is gone after the dialog is reported, not opened", async () => {
    const { shell } = await start();
    const gone = join(tmp, "gone");
    expect(await shell.open(gone)).toBe(`폴더를 찾을 수 없음: ${gone}`);
    const file = join(dir(), "file.txt");
    writeFileSync(file, "x");
    expect(await shell.open(file)).toBe(`폴더를 찾을 수 없음: ${file}`);
    expect(shell.entries()).toEqual([]);
  });
});
