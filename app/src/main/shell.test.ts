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
import { canvasMtimes, startShell, type Shell } from "./shell";
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
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  writeFileSync(join(root, ".doan/canvases", "a.html"), "<!doctype html><title>A</title>");
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
    const opened = await shell.open(join(root, ".doan/canvases"));
    expect(opened).toEqual({ refused: expect.stringContaining("Cannot read config") });
    expect(shell.entries()).toEqual([]);
    expect(saved(foldersFile)).toEqual([]);
  });

  // `.doan/` without config.json is not a repo marker for the CLI (ARCHITECTURE §13).
  test("a subfolder with only .doan/ inside a broken repo is refused", async () => {
    const root = writeRepo(dir(), "{");
    const sub = join(root, "sub");
    mkdirSync(join(sub, ".doan", "comments"), { recursive: true });
    const { shell } = await start();
    expect(await shell.open(sub)).toEqual({ refused: expect.stringContaining("Cannot read config") });
    expect(shell.entries()).toEqual([]);
  });

  test("the root of a broken repo is stored and shows its error", async () => {
    const root = writeRepo(dir(), "{");
    const { shell, foldersFile } = await start();
    expect(await shell.open(root)).toEqual({ root });
    expect(shell.entries()).toEqual([expect.objectContaining({ path: root })]);
    expect(saved(foldersFile)).toEqual([root]);
  });

  test("a missing CLI refuses the pick instead of storing it", async () => {
    const root = writeRepo(dir());
    const { shell } = await start(join(tmp, "no-such-doan"));
    expect(await shell.open(root)).toEqual({ refused: expect.stringMatching(/^doan CLI error/) });
    expect(shell.entries()).toEqual([]);
  });

  test("a folder that is gone after the dialog is reported, not opened", async () => {
    const { shell } = await start();
    const gone = join(tmp, "gone");
    expect(await shell.open(gone)).toEqual({ refused: `Project not found: ${gone}` });
    const file = join(dir(), "file.txt");
    writeFileSync(file, "x");
    expect(await shell.open(file)).toEqual({ refused: `Project not found: ${file}` });
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
    expect(await Promise.all([shell.open(root), shell.open(join(root, ".doan/canvases"))])).toEqual([{ root }, { root }]);
    expect(shell.entries().map((entry) => entry.path)).toEqual([root]);
    expect(saved(foldersFile)).toEqual([root]);
  });


  test("a read that finishes after its folder was removed changes nothing", async () => {
    const root = writeRepo(dir());
    const other = writeRepo(dir());
    const gated = gatedCli();
    const { shell, changes } = await start(gated.path);
    await shell.open(root);
    expect(shell.entries()).toEqual([{ path: root, kind: "loading" }]);
    await shell.remove([root]);
    const afterRemove = changes.length;
    writeFileSync(gated.gate, "");
    await vi.waitFor(() => expect(existsSync(gated.done)).toBe(true), until);
    // Opening another folder spawns new CLI runs only after the late read's
    // process has exited, so its result is handled before these changes.
    await shell.open(other);
    await vi.waitFor(() => expect(latest(changes)).toEqual([expect.objectContaining({ path: other, kind: "list" })]), until);
    for (const entries of changes.slice(afterRemove)) {
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
    // An already stored folder still resolves to its root, so a caller can show it.
    expect(await shell.open(root)).toEqual({ root });
    await vi.waitFor(() => expect(latest(changes)).toEqual([expect.objectContaining({ path: root, kind: "list" })]), until);
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B</title>");
    await vi.waitFor(() => {
      const [entry] = latest(changes);
      expect(entry?.kind === "list" && entry.canvases.map((canvas) => canvas.path)).toEqual([".doan/canvases/a.html", ".doan/canvases/b.html"]);
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

function rowRev(changes: FolderEntry[][], root: string, path: string): number | undefined {
  return listed(latest(changes), root)?.canvases.find((canvas) => canvas.path === path)?.rev;
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
  mkdirSync(join(root, ".doan", "comments"), { recursive: true });
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
  test("a non-canvas .doan/canvases/ change publishes the new list together with the bump", async () => {
    const root = servedRepo({});
    const { changes, rev0 } = await opened(root);
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B</title>");
    writeFileSync(join(root, ".doan/canvases", "b.css"), "b{}");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b.html")).toBe(true), until);
    const first = changes.map((entries) => listed(entries, root)).find((entry) => has(entry, ".doan/canvases/b.html"));
    expect(first?.servedRev).toBe(rev0 + 1);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
  });

  test("scope is the listed serving scope, and empty for a root that is not open", async () => {
    const root = servedRepo({ tokenCss: "styles/tokens.css", serve: ["assets"] });
    const { shell } = await opened(root);
    expect(shell.scope(root)).toEqual([".doan/canvases", "assets", "styles/tokens.css"]);
    expect(shell.scope(join(root, "nope"))).toEqual([]);
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
      const url = entry.canvases[0]?.url.replace(/\.doan\/canvases\/a\.html$/, "assets/x.css");
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
      writeFileSync(join(root, ".doan/canvases", `b${i}.html`), "<!doctype html>");
      writeFileSync(join(root, ".doan/canvases", `b${i}.css`), "b{}");
      await sleep(40);
    }
    await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b3.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
  });

  test(".doan/canvases/ and a serve file changing together end in one read and one bump", async () => {
    const counting = countingCli();
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html>");
    writeFileSync(join(root, "assets", "x.css"), "y{}");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
    expect(counting.reads()).toBe(reads + 1);
  });

  test("a serve change while a .doan/canvases/ read is running keeps its bump", async () => {
    const counting = countingCli();
    const root = servedRepo({ serve: ["assets"] });
    const { changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(counting.hold, "");
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html>");
    writeFileSync(join(root, ".doan/canvases", "b.css"), "b{}");
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 1), until);
    writeFileSync(join(root, "assets", "x.css"), "y{}");
    // Past the debounce, so the serve change is queued behind the running read.
    await sleep(400);
    unlinkSync(counting.hold);
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 2), until);
    const first = changes.map((entries) => listed(entries, root)).find((entry) => has(entry, ".doan/canvases/b.html"));
    expect(first?.servedRev).toBe(rev0 + 1);
  });

  test("a discarded stale read keeps its bump and its row revisions", async () => {
    const counting = countingCli();
    const root = servedRepo({});
    const { shell, changes, rev0 } = await opened(root, counting.path);
    const reads = counting.reads();
    writeFileSync(counting.hold, "");
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html>");
    writeFileSync(join(root, ".doan/canvases", "b.css"), "b{}");
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 1), until);
    // Re-opening starts a newer read, so the watcher's read is discarded.
    await shell.open(root);
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 2), until);
    unlinkSync(counting.hold);
    await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b.html")).toBe(true), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0 + 1);
    // Only the discarded watcher read saw the name; the re-open read had none.
    expect(rowRev(changes, root, ".doan/canvases/b.html")).toBeGreaterThanOrEqual(1);
  });

  // Another canvas's save must not reload the open one (revision-continuity Q1).
  test.each<[string, (root: string) => void]>([
    ["a plain write", (root) => writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B2</title>")],
    ["a save through a temporary sibling", (root) => {
      writeFileSync(join(root, ".doan/canvases", "b.html.tmp.4242.0123456789ab"), "<!doctype html><title>B2</title>");
      renameSync(join(root, ".doan/canvases", "b.html.tmp.4242.0123456789ab"), join(root, ".doan/canvases", "b.html"));
    }],
  ])("a canvas change by %s moves only that row's revision", async (_label, change) => {
    const root = servedRepo({});
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B</title>");
    const { changes, rev0 } = await opened(root);
    const a = rowRev(changes, root, ".doan/canvases/a.html");
    const b = rowRev(changes, root, ".doan/canvases/b.html") ?? 0;
    change(root);
    await vi.waitFor(() => expect(rowRev(changes, root, ".doan/canvases/b.html")).toBeGreaterThan(b), until);
    await sleep(500);
    expect(rev(changes, root)).toBe(rev0);
    expect(rowRev(changes, root, ".doan/canvases/a.html")).toBe(a);
  });

  test("a non-canvas file under .doan/canvases/ bumps", async () => {
    const root = servedRepo({});
    const { changes, rev0 } = await opened(root);
    const a = rowRev(changes, root, ".doan/canvases/a.html");
    writeFileSync(join(root, ".doan/canvases", "style.css"), "a{}");
    await vi.waitFor(() => expect(rev(changes, root)).toBe(rev0 + 1), until);
    expect(rowRev(changes, root, ".doan/canvases/a.html")).toBe(a);
  });

  // The served path's own watcher dies with it; the re-arm reports the change.
  test("a nested serve directory deleted bumps", async () => {
    const root = servedRepo({ serve: ["web/dist"] });
    mkdirSync(join(root, "web", "dist"), { recursive: true });
    writeFileSync(join(root, "web", "dist", "a.css"), "a{}");
    const { changes, rev0 } = await opened(root);
    rmSync(join(root, "web", "dist"), { recursive: true });
    await vi.waitFor(() => expect(rev(changes, root)).toBeGreaterThan(rev0), until);
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
      writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html>");
      await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b.html")).toBe(true), until);
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
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html>");
    await vi.waitFor(() => expect(has(listed(latest(changes), root), ".doan/canvases/b.html")).toBe(true), until);
    await sleep(500);
    expect(counting.reads()).toBe(reads + 1);
  });
});

test("same-count comment edits and replaced comments directories invalidate without served revision changes", async () => {
  const root = writeRepo(dir());
  mkdirSync(join(root, ".doan/comments"));
  const invalidated = vi.fn();
  const shell = await startShell(join(dir(), "folders.json"), cli, () => {}, { response: () => {}, invalidate: invalidated });
  shells.push(shell); await shell.open(root);
  await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe("list"));
  const before = shell.entries()[0];
  if (before?.kind !== "list") throw new Error("missing list");
  const revision = before.servedRev;
  invalidated.mockClear();
  writeFileSync(join(root, ".doan/comments/a.jsonl"), "broken line\n");
  await vi.waitFor(() => expect(invalidated).toHaveBeenCalledWith(root));
  invalidated.mockClear();
  writeFileSync(join(root, ".doan/comments/a.jsonl"), "another line\n");
  await vi.waitFor(() => expect(invalidated).toHaveBeenCalledWith(root));
  renameSync(join(root, ".doan/comments"), join(root, ".doan/old-comments"));
  mkdirSync(join(root, ".doan/comments"));
  await new Promise(resolve => setTimeout(resolve, 300));
  invalidated.mockClear();
  writeFileSync(join(root, ".doan/comments/a.jsonl"), "new inode\n");
  await vi.waitFor(() => expect(invalidated).toHaveBeenCalledWith(root));
  const after = shell.entries()[0];
  expect(after?.kind === "list" && after.servedRev).toBe(revision);
});

async function uninitialized(root: string, cliPath = cli) {
  const started = await start(cliPath);
  await started.shell.open(root);
  await vi.waitFor(() => expect(started.shell.entries()[0]?.kind).toBe("uninitialized"), until);
  return started;
}

describe("project setup and upward refresh", () => {
  test("re-roots in place, saves order, forwards focus and serves and watches the parent", async () => {
    const root = dir(); const sub = join(root, "web"); mkdirSync(sub);
    const other = writeRepo(dir());
    const file = join(dir(), "folders.json");
    writeFileSync(file, JSON.stringify([sub, other]));
    const changes = vi.fn();
    const shell = await startShell(file, cli, changes); shells.push(shell);
    await vi.waitFor(() => expect(shell.entries()[0]?.kind).toBe("uninitialized"), until);
    writeRepo(root);
    await shell.reopen(sub);
    await vi.waitFor(() => expect(shell.entries().map(e => e.path)).toEqual([root, other]), until);
    await vi.waitFor(() => expect(saved(file)).toEqual([root, other]), until);
    expect(changes).toHaveBeenCalledWith(expect.any(Array), { from: sub, root });
    await vi.waitFor(() => expect(listed(shell.entries(), root)).toBeDefined(), until);
    const entry = listed(shell.entries(), root);
    expect(await fetch(entry?.canvases[0]?.url ?? "").then(r => r.status)).toBe(200);
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B</title>");
    await vi.waitFor(() => expect(has(listed(shell.entries(), root), ".doan/canvases/b.html")).toBe(true), until);
    expect(shell.epoch(sub)).toBeNull();
  });

  test("startup merges two stale children with an existing root without losing order", async () => {
    const root = writeRepo(dir()); const other = writeRepo(dir());
    const a = join(root, "a"); const b = join(root, "b"); mkdirSync(a); mkdirSync(b);
    const file = join(dir(), "folders.json"); writeFileSync(file, JSON.stringify([a, other, b, root]));
    const shell = await startShell(file, cli, () => {}); shells.push(shell);
    await vi.waitFor(() => expect(shell.entries().map(e => e.path)).toEqual([root, other]), until);
    await vi.waitFor(() => expect(saved(file)).toEqual([root, other]), until);
  });

  test("a broken ancestor becomes an error on the old row and never initializes", async () => {
    const root = dir(); const sub = join(root, "web"); mkdirSync(sub);
    const { shell, foldersFile } = await uninitialized(sub);
    writeRepo(root, "{");
    expect(await shell.initialize(sub, null)).toMatchObject({ kind: "unavailable" });
    expect(shell.entries()).toEqual([{ path: sub, kind: "error", message: expect.stringContaining("Cannot read config") }]);
    expect(saved(foldersFile)).toEqual([sub]);
    expect(existsSync(join(sub, ".doan"))).toBe(false);
  });

  test("init re-asks upward and reports re-root without creating a nested repo", async () => {
    const root = dir(); const sub = join(root, "web"); mkdirSync(sub);
    const { shell } = await uninitialized(sub); writeRepo(root);
    expect(await shell.initialize(sub, null)).toMatchObject({ kind: "rerooted", root });
    expect(existsSync(join(sub, ".doan"))).toBe(false);
  });

  test("initializes once for simultaneous requests, uses selected CSS and re-reads stored spelling", async () => {
    const root = dir(); const token = join(root, "tokens.css"); writeFileSync(token, ":root{}");
    const log = join(dir(), "calls"); const wrapper = join(dir(), "doan");
    writeFileSync(wrapper, `#!/bin/sh\nif [ "$1" = init ]; then echo x >> '${log}'; sleep 0.1; fi\nexec '${cli}' "$@"\n`); chmodSync(wrapper, 0o755);
    const { shell, foldersFile } = await uninitialized(root, wrapper);
    const results = await Promise.all([shell.initialize(root, token), shell.initialize(root, token)]);
    expect(results).toEqual([{ kind: "success" }, { kind: "success" }]);
    expect(readFileSync(log, "utf8")).toBe("x\n");
    expect(shell.entries()[0]?.kind).toBe("list");
    expect(saved(foldersFile)).toEqual([root]);
    expect(JSON.parse(readFileSync(join(root, ".doan/config.json"), "utf8")).tokenCss).toBe("tokens.css");
  });

  test("does not initialize closed, missing or already initialized folders", async () => {
    const root = dir(); const { shell } = await uninitialized(root);
    rmSync(root, { recursive: true });
    expect(await shell.initialize(root, null)).toMatchObject({ kind: "unavailable" });
    expect(shell.entries()[0]?.kind).toBe("notFound");
    expect(await shell.initialize(dir(), null)).toMatchObject({ kind: "unavailable" });
    const ready = writeRepo(dir()); await shell.open(ready);
    await vi.waitFor(() => expect(listed(shell.entries(), ready)).toBeDefined(), until);
    expect(await shell.initialize(ready, null)).toMatchObject({ kind: "unavailable" });
  });

  test("init failures retain the CLI error and app guidance", async () => {
    const root = dir(); const wrapper = join(dir(), "doan");
    writeFileSync(wrapper, `#!/bin/sh\nif [ "$1" = init ]; then echo '{"v":1,"ok":false,"error":{"code":"invalid_config","message":"bad config","nextSteps":["do not show"]}}'; exit 2; fi\nexec '${cli}' "$@"\n`); chmodSync(wrapper, 0o755);
    const { shell } = await uninitialized(root, wrapper);
    expect(await shell.initialize(root, null)).toEqual({ kind: "error", message: "bad config", guidance: "Fix the project configuration, then try again." });
  });

  test("init result.repo cannot replace the stored identity", async () => {
    const root = dir(); const wrapper = join(dir(), "doan");
    writeFileSync(wrapper, `#!/bin/sh\nif [ "$1" = init ]; then '${cli}' "$@" >/dev/null; echo '{"v":1,"ok":true,"result":{"initialized":false,"repo":"/forged","created":[]}}'; exit 0; fi\nexec '${cli}' "$@"\n`); chmodSync(wrapper, 0o755);
    const { shell, foldersFile } = await uninitialized(root, wrapper);
    expect(await shell.initialize(root, null)).toEqual({ kind: "success" });
    expect(shell.entries()[0]).toMatchObject({ path: root, kind: "list" });
    expect(saved(foldersFile)).toEqual([root]);
  });
});

describe("canvas mtimes", () => {
  test("a canvas deleted between doan ls and the stat has no value", async () => {
    const root = writeRepo(dir());
    const mtimes = await canvasMtimes(root, [".doan/canvases/a.html", ".doan/canvases/gone.html"]);
    expect(mtimes.get(".doan/canvases/a.html")).toBeTypeOf("number");
    expect(mtimes.has(".doan/canvases/gone.html")).toBe(false);
  });

  test("list entries carry each canvas mtime and the newest as changedAt", async () => {
    const root = writeRepo(dir());
    writeFileSync(join(root, ".doan/canvases", "b.html"), "<!doctype html><title>B</title>");
    const { shell } = await opened(root);
    const entry = listed(shell.entries(), root);
    const times = entry?.canvases.map((canvas) => canvas.mtimeMs) ?? [];
    expect(times).toHaveLength(2);
    for (const time of times) expect(time).toBeTypeOf("number");
    expect(entry?.changedAt).toBe(Math.max(...times.map(Number)));
  });
});

// Answers every `--repo` read from a mode file: `git` lists the folder with a
// git field, anything else fails with a config error.
function gitCli(): { path: string; mode: (value: string) => void } {
  const base = dir();
  const modeFile = join(base, "mode");
  const path = join(base, "doan");
  writeFileSync(modeFile, "git");
  writeFileSync(path, `#!/bin/sh
if [ "$(cat '${modeFile}')" = git ]; then
  printf '{"v":1,"ok":true,"result":{"root":"%s","scope":[".doan/canvases"],"canvases":[],"git":{"common":"/c/.git","branch":"main","worktrees":["%s"]}}}\\n' "$4" "$4"
  exit 0
fi
echo '{"v":1,"ok":false,"error":{"code":"invalid_config","message":"bad config","nextSteps":[]}}'
exit 2
`);
  chmodSync(path, 0o755);
  return { path, mode: (value) => writeFileSync(modeFile, value) };
}

describe("storing, removing and restoring", () => {
  test("store appends only new folders, saves once and returns them", async () => {
    const a = writeRepo(dir());
    const b = writeRepo(dir());
    const { shell, foldersFile } = await start();
    expect(await shell.store([a])).toEqual([a]);
    expect(await shell.store([a, b, b])).toEqual([b]);
    expect(shell.entries().map((entry) => entry.path)).toEqual([a, b]);
    expect(saved(foldersFile)).toEqual([a, b]);
    await vi.waitFor(() => expect(listed(shell.entries(), b)).toBeDefined(), until);
  });

  test("a folder without a repo is stored as is and reads as not set up", async () => {
    const plain = dir();
    const { shell } = await start();
    expect(await shell.store([plain])).toEqual([plain]);
    await vi.waitFor(() => expect(shell.entries()).toEqual([{ path: plain, kind: "uninitialized" }]), until);
  });

  test("remove reports the original indexes and restore puts the folders back there with new server keys", async () => {
    const [a, b, c, d] = [writeRepo(dir()), writeRepo(dir()), writeRepo(dir()), writeRepo(dir())];
    const { shell, foldersFile } = await start();
    await shell.store([a, b, c, d]);
    await vi.waitFor(() => expect(listed(shell.entries(), d)).toBeDefined(), until);
    await vi.waitFor(() => expect(listed(shell.entries(), b)).toBeDefined(), until);
    const before = listed(shell.entries(), b)?.canvases[0]?.url;
    expect(await shell.remove([b, d, "/not/stored"])).toEqual({ paths: [b, d], indexes: [1, 3] });
    expect(shell.entries().map((entry) => entry.path)).toEqual([a, c]);
    expect(saved(foldersFile)).toEqual([a, c]);
    expect(await shell.restore([b, d], [1, 3])).toEqual([b, d]);
    expect(shell.entries().map((entry) => entry.path)).toEqual([a, b, c, d]);
    expect(saved(foldersFile)).toEqual([a, b, c, d]);
    await vi.waitFor(() => expect(listed(shell.entries(), b)).toBeDefined(), until);
    const after = listed(shell.entries(), b)?.canvases[0]?.url;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  test("restore skips a folder that was added again meanwhile", async () => {
    const [a, b] = [writeRepo(dir()), writeRepo(dir())];
    const { shell } = await start();
    await shell.store([a, b]);
    await shell.remove([a]);
    await shell.store([a]);
    expect(await shell.restore([a], [0])).toEqual([]);
    expect(shell.entries().map((entry) => entry.path)).toEqual([b, a]);
  });

  test("replace swaps a folder in place, or only drops it when the new one is stored elsewhere", async () => {
    const [a, b, c, moved] = [writeRepo(dir()), writeRepo(dir()), writeRepo(dir()), writeRepo(dir())];
    const { shell, foldersFile } = await start();
    await shell.store([a, b, c]);
    await shell.replace(b, moved);
    expect(shell.entries().map((entry) => entry.path)).toEqual([a, moved, c]);
    expect(saved(foldersFile)).toEqual([a, moved, c]);
    await vi.waitFor(() => expect(listed(shell.entries(), moved)).toBeDefined(), until);
    await shell.replace(moved, c);
    expect(shell.entries().map((entry) => entry.path)).toEqual([a, c]);
    expect(saved(foldersFile)).toEqual([a, c]);
  });

  test("rereadAll reads every folder again without a loading state", async () => {
    const counting = countingCli();
    const [a, b] = [writeRepo(dir()), writeRepo(dir())];
    const { shell, changes } = await start(counting.path);
    await shell.store([a, b]);
    await vi.waitFor(() => expect(listed(shell.entries(), a) && listed(shell.entries(), b)).toBeTruthy(), until);
    await sleep(500);
    const reads = counting.reads();
    const checkpoint = changes.length;
    shell.rereadAll();
    await vi.waitFor(() => expect(counting.reads()).toBe(reads + 2), until);
    await sleep(300);
    for (const entries of changes.slice(checkpoint)) expect(entries.every((entry) => entry.kind === "list")).toBe(true);
  });

  test("a folder keeps its last git common dir when it stops listing", async () => {
    const git = gitCli();
    const root = dir();
    const { shell } = await start(git.path);
    await shell.store([root]);
    await vi.waitFor(() => expect(shell.entries()[0]).toMatchObject({ kind: "list", git: { common: "/c/.git", branch: "main" }, lastCommon: "/c/.git" }), until);
    git.mode("error");
    shell.rereadAll();
    await vi.waitFor(() => expect(shell.entries()[0]).toEqual({ path: root, kind: "error", message: "bad config", lastCommon: "/c/.git" }), until);
  });
});
