import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, inject, test, vi } from "vitest";
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

const until = { timeout: 5000, interval: 20 };

function latest(changes: FolderEntry[][]): FolderEntry[] {
  return changes.at(-1) ?? [];
}

// Wraps the real CLI so `--repo` reads (the shell's re-reads, not the
// cwd run of `open`) wait until `gate` exists, then mark `done`.
function gatedCli(): { path: string; gate: string; done: string } {
  const base = dir();
  const gate = join(base, "gate");
  const done = join(base, "done");
  const path = join(base, "doan");
  writeFileSync(
    path,
    `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--repo" ]; then
    while [ ! -e '${gate}' ]; do sleep 0.02; done
    '${cli}' "$@"; status=$?
    touch '${done}'
    exit $status
  fi
done
exec '${cli}' "$@"
`,
  );
  chmodSync(path, 0o755);
  return { path, gate, done };
}

describe("shell races", () => {
  test("the same root opened twice at once is one folder", async () => {
    const root = writeRepo(dir());
    const { shell, foldersFile } = await start();
    await Promise.all([shell.open(root), shell.open(join(root, "design"))]);
    expect(shell.entries().map((entry) => entry.path)).toEqual([root]);
    expect(saved(foldersFile)).toEqual([root]);
  });

  test("a read that finishes after its folder was closed changes nothing", async () => {
    const root = writeRepo(dir());
    const other = writeRepo(dir());
    const gated = gatedCli();
    const { shell, changes } = await start(gated.path);
    await shell.open(root);
    expect(shell.entries()).toEqual([{ path: root, kind: "loading" }]);
    await shell.close(root);
    const afterClose = changes.length;
    writeFileSync(gated.gate, "");
    await vi.waitFor(() => expect(existsSync(gated.done)).toBe(true), until);
    // Opening another folder spawns new CLI runs only after the late read's
    // process has exited, so its result is handled before these changes.
    await shell.open(other);
    await vi.waitFor(() => expect(latest(changes)).toEqual([expect.objectContaining({ path: other, kind: "list" })]), until);
    for (const entries of changes.slice(afterClose)) {
      expect(entries.map((entry) => entry.path)).toEqual([other]);
    }
  });

  test("re-opening a folder that came back watches it again", async () => {
    const root = writeRepo(dir());
    const { shell, changes } = await start();
    await shell.open(root);
    await vi.waitFor(() => expect(latest(changes)).toEqual([expect.objectContaining({ path: root, kind: "list" })]), until);
    rmSync(root, { recursive: true, force: true });
    await vi.waitFor(() => expect(latest(changes)).toEqual([{ path: root, kind: "notFound" }]), until);
    writeRepo(root);
    await shell.open(root);
    await vi.waitFor(() => expect(latest(changes)).toEqual([expect.objectContaining({ path: root, kind: "list" })]), until);
    writeFileSync(join(root, "design", "b.html"), "<!doctype html><title>B</title>");
    await vi.waitFor(() => {
      const [entry] = latest(changes);
      expect(entry?.kind === "list" && entry.canvases.map((canvas) => canvas.path)).toEqual(["design/a.html", "design/b.html"]);
    }, until);
  });
});
