import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

async function start(cliPath = cli, onEntries?: (entries: FolderEntry[]) => void): Promise<Started> {
  const foldersFile = join(dir(), "folders.json");
  const changes: FolderEntry[][] = [];
  const shell = await startShell(foldersFile, cliPath, (entries) => {
    changes.push(entries);
    onEntries?.(entries);
  });
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
    expect(await shell.open(root)).toMatch(/^doan CLI error/);
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ListEntry = Extract<FolderEntry, { kind: "list" }>;

function listed(entries: FolderEntry[], root: string): ListEntry | undefined {
  const entry = entries.find((candidate) => candidate.path === root);
  return entry?.kind === "list" ? entry : undefined;
}

function rev(changes: FolderEntry[][], root: string): number | undefined {
  return listed(latest(changes), root)?.servedRev;
}

function has(entry: ListEntry | undefined, path: string): boolean {
  return entry?.canvases.some((canvas) => canvas.path === path) ?? false;
}

// Wraps the real CLI so each `--repo` read (the shell's re-reads) is counted
// and waits while `hold` exists.
function countingCli(): { path: string; hold: string; reads: () => number } {
  const base = dir();
  const hold = join(base, "hold");
  const log = join(base, "log");
  const path = join(base, "doan");
  writeFileSync(
    path,
    `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--repo" ]; then
    echo x >> '${log}'
    while [ -e '${hold}' ]; do sleep 0.02; done
    exec '${cli}' "$@"
  fi
done
exec '${cli}' "$@"
`,
  );
  chmodSync(path, 0o755);
  const reads = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").length - 1 : 0);
  return { path, hold, reads };
}

function servedRepo(config: object): string {
  const root = writeRepo(dir(), JSON.stringify({ v: 1, ...config }));
  mkdirSync(join(root, ".doan", "comments"));
  mkdirSync(join(root, "styles"));
  writeFileSync(join(root, "styles", "tokens.css"), "a{}");
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "x.css"), "x{}");
  return root;
}

function atomicSave(path: string, content: string): void {
  writeFileSync(`${path}.tmp-save`, content);
  renameSync(`${path}.tmp-save`, path);
}

// Opens the folder, waits for its first list and lets the watcher settle.
async function opened(root: string, cliPath = cli, onEntries?: (entries: FolderEntry[]) => void): Promise<Started & { rev0: number }> {
  const started = await start(cliPath, onEntries);
  await started.shell.open(root);
  await vi.waitFor(() => expect(listed(latest(started.changes), root)).toBeDefined(), until);
  // Until nothing is published for 400 ms (bounded): a fixed sleep let a late
  // startup run land after `rev0` and fail a test expecting no bump.
  const deadline = Date.now() + 3_000;
  let seen = started.changes.length;
  let since = Date.now();
  while (Date.now() < deadline && Date.now() - since < 400) {
    await sleep(10);
    if (started.changes.length !== seen) {
      seen = started.changes.length;
      since = Date.now();
    }
  }
  const rev0 = rev(started.changes, root);
  if (rev0 === undefined) throw new Error("folder is not listed");
  return { ...started, rev0 };
}

describe("served revision", () => {
  test("a design/ change publishes the new list together with the bump", async () => {
    const root = servedRepo({});
    const { changes, rev0 } = await opened(root);
    writeFileSync(join(root, "design", "b.html"), "<!doctype html><title>B</title>");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b.html")).toBe(true), until);
    const first = changes.map((entries) => listed(entries, root)).find((entry) => has(entry, "design/b.html"));
    expect(first?.servedRev).toBe(rev0 + 1);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
  });

  test("an atomic tokenCss save bumps without running doan ls", async () => {
    const counting = countingCli();
    const root = servedRepo({ tokenCss: "styles/tokens.css" });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    atomicSave(join(root, "styles", "tokens.css"), "b{}");
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 1), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
    expect(counting.reads()).toBe(reads);
  });

  test("a serve file change bumps without running doan ls", async () => {
    const counting = countingCli();
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(join(root, "assets", "x.css"), "y{}");
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 1), until);
    await sleep(500);
    expect(counting.reads()).toBe(reads);
  });

  // `doan ls` reports the same scope afterwards, so only the watcher can tell.
  test("a serve directory at the root that is replaced bumps", async () => {
    const root = servedRepo({ serve: ["dist"] });
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "a.css"), "a{}");
    const { changes, rev0 } = await opened(root);
    rmSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "a.css"), "b{}");
    await vi.waitFor(() => expect(rev(changes, root)).toBeGreaterThan(rev0), until);
  });

  test.each<[string, object]>([
    ["no serve", {}],
    ["serve pointing at .doan", { serve: [".doan"] }],
  ])("a .doan/ change re-reads without a bump (%s)", async (_label, config) => {
    const counting = countingCli();
    const root = servedRepo(config);
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    const published = changes.length;
    writeFileSync(join(root, ".doan", "comments", "x.jsonl"), "{}\n");
    await vi.waitFor(() => expect(changes.length).toBeGreaterThan(published), until);
    await sleep(500);
    expect(counting.reads()).toBeGreaterThan(reads);
    expect(rev(changes, root)).toBe(rev0);
  });

  // The bump must not reach the renderer before the server serves the new scope.
  test("a serve entry added to config bumps once the server serves it", async () => {
    const root = servedRepo({});
    const fetched: Promise<number>[] = [];
    let last: number | undefined;
    const { changes, rev0 } = await opened(root, cli, (entries) => {
      const entry = listed(entries, root);
      if (entry === undefined || entry.servedRev === last) return;
      last = entry.servedRev;
      const url = entry.canvases[0]?.url.replace(/design\/a\.html$/, "assets/x.css");
      if (url) fetched.push(fetch(url).then((response) => response.status));
    });
    fetched.length = 0;
    writeFileSync(join(root, ".doan", "config.json"), JSON.stringify({ v: 1, serve: ["assets"] }));
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 1), until);
    expect(await Promise.all(fetched)).toEqual([200]);
  });

  test("changes less than 200 ms apart end in one bump", async () => {
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root);
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(root, "design", `b${i}.html`), "<!doctype html>");
      await sleep(40);
    }
    await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b3.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
  });

  test("design/ and a serve file changing together end in one read and one bump", async () => {
    const counting = countingCli();
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(join(root, "design", "b.html"), "<!doctype html>");
    writeFileSync(join(root, "assets", "x.css"), "y{}");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
    expect(counting.reads()).toBe(reads + 1);
  });

  test("a serve change while a design/ read is running keeps its bump", async () => {
    const counting = countingCli();
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(counting.hold, "");
    writeFileSync(join(root, "design", "b.html"), "<!doctype html>");
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 1), until);
    writeFileSync(join(root, "assets", "x.css"), "y{}");
    // Past the debounce, so the serve change is queued behind the running read.
    await sleep(400);
    unlinkSync(counting.hold);
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 2), until);
    const first = changes.map((entries) => listed(entries, root)).find((entry) => has(entry, "design/b.html"));
    expect(first?.servedRev).toBe(rev0 + 1);
  });

  test("a discarded stale read keeps its bump", async () => {
    const counting = countingCli();
    const root = servedRepo({});
    const { shell, changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(counting.hold, "");
    writeFileSync(join(root, "design", "b.html"), "<!doctype html>");
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 1), until);
    // Re-opening starts a newer read, so the watcher's read is discarded.
    await shell.open(root);
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 2), until);
    unlinkSync(counting.hold);
    await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
  });
});


describe("reopening stored folders", () => {
  test.each(["restored", "missing", "uninitialized"])("publishes loading then the CLI state when %s", async (state) => {
    const root = writeRepo(dir());
    const { shell, changes } = await opened(root);
    rmSync(root, { recursive: true, force: true });
    await vi.waitFor(() => expect(shell.entries()).toEqual([{ path: root, kind: "notFound" }]), until);
    if (state === "restored") writeRepo(root);
    if (state === "uninitialized") mkdirSync(root);
    const checkpoint = changes.length;
    await shell.reopen(root);
    expect(changes[checkpoint]).toEqual([{ path: root, kind: "loading" }]);
    const kind = state === "restored" ? "list" : state === "missing" ? "notFound" : "uninitialized";
    await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe(kind), until);
    if (state === "restored") {
      writeFileSync(join(root, "design", "b.html"), "<!doctype html>");
      await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b.html")).toBe(true), until);
    }
  });

  test("reopens CLI errors using the saved path", async () => {
    const root = writeRepo(dir());
    const executable = join(dir(), "doan");
    const foldersFile = join(dir(), "folders.json");
    writeFileSync(foldersFile, JSON.stringify([root]));
    const changes: FolderEntry[][] = [];
    const shell = await startShell(foldersFile, executable, (entries) => changes.push(entries));
    shells.push(shell);
    await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe("cliError"), until);
    writeFileSync(executable, `#!/bin/sh\nexec '${cli}' "$@"\n`);
    chmodSync(executable, 0o755);
    const checkpoint = changes.length;
    await shell.reopen(root);
    expect(changes[checkpoint]).toEqual([{ path: root, kind: "loading" }]);
    await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe("list"), until);
    expect(saved(foldersFile)).toEqual([root]);
  });

  test("ignores paths that are not open", async () => {
    const { shell, changes } = await start();
    await shell.reopen("/not-open");
    expect(shell.entries()).toEqual([]);
    expect(changes).toEqual([]);
  });

  test("two consecutive reopens leave only one active watcher", async () => {
    const counting = countingCli();
    const root = writeRepo(dir());
    const { shell, changes } = await opened(root, counting.path);
    await shell.reopen(root);
    await shell.reopen(root);
    await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe("list"), until);
    await sleep(500);
    const reads = counting.reads();
    writeFileSync(join(root, "design", "b.html"), "<!doctype html>");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), "design/b.html")).toBe(true), until);
    await sleep(500);
    expect(counting.reads()).toBe(reads + 1);
  });
});
