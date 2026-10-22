import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  watch as fsWatch,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { createRefresher, watchFolder, type Change, type FolderWatch } from "./watch";

// Pass-through spy, so a test can see which paths got a watcher of their own.
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, watch: vi.fn(fs.watch) };
});

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-watch-")));
let count = 0;
let open: FolderWatch | undefined;

afterEach(() => {
  open?.close();
  open = undefined;
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function within(ms: number, done: () => boolean): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (done()) return true;
    await sleep(10);
  }
  return done();
}

function repo(parts: { design?: boolean; doan?: boolean; comments?: boolean } = {}): string {
  const root = join(tmp, `r${count++}`);
  mkdirSync(root);
  if (parts.design ?? true) {
    mkdirSync(join(root, "design"));
    writeFileSync(join(root, "design", "a.html"), "<!doctype html>");
  }
  if (parts.doan ?? true) {
    mkdirSync(join(root, ".doan"));
    writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    if (parts.comments ?? true) mkdirSync(join(root, ".doan", "comments"));
  }
  return root;
}

// Starts watching, lets startup events settle, then counts re-reads.
async function watch(root: string): Promise<{ reads: () => number; reset: () => void }> {
  let reads = 0;
  open = watchFolder(root, async () => {
    reads++;
  });
  await sleep(300);
  reads = 0;
  return { reads: () => reads, reset: () => (reads = 0) };
}

async function expectReread(w: { reads: () => number; reset: () => void }, change: () => void): Promise<void> {
  w.reset();
  change();
  expect(await within(1_000, () => w.reads() >= 1)).toBe(true);
  // Let the debounce window pass so the next step starts clean.
  await sleep(300);
}

describe("watchFolder re-reads within a second", () => {
  test.each<[string, (root: string) => void]>([
    ["a canvas is added", (root) => writeFileSync(join(root, "design", "b.html"), "")],
    ["a nested canvas is added", (root) => {
      mkdirSync(join(root, "design", "sub"));
      writeFileSync(join(root, "design", "sub", "c.html"), "");
    }],
    ["a canvas is deleted", (root) => unlinkSync(join(root, "design", "a.html"))],
    ["a canvas is renamed", (root) => renameSync(join(root, "design", "a.html"), join(root, "design", "b.html"))],
    ["a canvas changes", (root) => appendFileSync(join(root, "design", "a.html"), "<title>x</title>")],
    ["config.json changes", (root) => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}')],
    ["a comment file is added", (root) => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n")],
  ])("when %s", async (_label, change) => {
    const root = repo();
    await expectReread(await watch(root), () => change(root));
  });

  test("when a comment file changes", async () => {
    const root = repo();
    writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n");
    await expectReread(await watch(root), () => appendFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"));
  });

  test("when design/ appears later, and then inside it", async () => {
    const root = repo({ design: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, "design")));
    await expectReread(w, () => writeFileSync(join(root, "design", "a.html"), ""));
  });

  test("when design/ is deleted and created again, and then inside it", async () => {
    const root = repo();
    const w = await watch(root);
    await expectReread(w, () => rmSync(join(root, "design"), { recursive: true }));
    await expectReread(w, () => mkdirSync(join(root, "design")));
    await expectReread(w, () => writeFileSync(join(root, "design", "b.html"), ""));
  });

  test("when .doan/ appears later and then config.json changes", async () => {
    const root = repo({ doan: false });
    const w = await watch(root);
    await expectReread(w, () => {
      mkdirSync(join(root, ".doan"));
      writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    });
    await expectReread(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}'));
  });

  test("when .doan/comments/ appears later and then a comment file is added", async () => {
    const root = repo({ comments: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, ".doan", "comments")));
    await expectReread(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"));
  });
});

describe("watchFolder", () => {
  test("merges a burst of events into one re-read", async () => {
    const root = repo();
    const w = await watch(root);
    for (let i = 0; i < 10; i++) writeFileSync(join(root, "design", `b${i}.html`), "");
    await sleep(800);
    expect(w.reads()).toBe(1);
  });

  test("stops after close", async () => {
    const root = repo();
    const w = await watch(root);
    open?.close();
    writeFileSync(join(root, "design", "b.html"), "");
    await sleep(500);
    expect(w.reads()).toBe(0);
  });
});

const REREAD: Change = { reread: true, served: false };
const SERVED: Change = { reread: false, served: true };
const BOTH: Change = { reread: true, served: true };

interface Recorder {
  calls: () => Change[];
  merged: () => Change;
  reset: () => void;
}

// Starts watching with a serving scope as `doan ls` reports it, lets startup
// events settle, then records what each re-read was asked to do.
async function watchScope(root: string, scope: string[]): Promise<Recorder> {
  let calls: Change[] = [];
  open = watchFolder(root, async (change) => {
    calls.push(change);
  });
  open.setScope(scope);
  await sleep(300);
  calls = [];
  return {
    calls: () => calls,
    merged: () => ({ reread: calls.some((call) => call.reread), served: calls.some((call) => call.served) }),
    reset: () => (calls = []),
  };
}

async function expectChange(w: Recorder, change: () => void, expected: Change): Promise<void> {
  w.reset();
  change();
  expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
  await sleep(300);
  expect(w.merged()).toEqual(expected);
}

async function expectQuiet(w: Recorder, change: () => void): Promise<void> {
  w.reset();
  change();
  await sleep(600);
  expect(w.calls()).toEqual([]);
}

// Editors save by writing a temporary file and renaming it over the target.
function atomicSave(path: string, content: string): void {
  writeFileSync(`${path}.tmp-save`, content);
  renameSync(`${path}.tmp-save`, path);
}

function watchedPaths(): string[] {
  return vi.mocked(fsWatch).mock.calls.map(([path]) => String(path));
}

function recursivePaths(): string[] {
  return vi.mocked(fsWatch).mock.calls.flatMap((call: unknown[]) => {
    const [path, options] = call;
    const recursive = typeof options === "object" && options !== null && "recursive" in options && options.recursive === true;
    return recursive ? [String(path)] : [];
  });
}

describe("watchFolder classifies changes", () => {
  test("a design/ change needs a re-read and is a served change", async () => {
    const root = repo();
    const w = await watchScope(root, ["design"]);
    await expectChange(w, () => writeFileSync(join(root, "design", "b.html"), ""), BOTH);
  });

  test("a .doan/ change only needs a re-read", async () => {
    const root = repo();
    const w = await watchScope(root, ["design"]);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"), REREAD);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}'), REREAD);
  });

  // Writing a comment must not reload the canvas, even when `serve` points into `.doan`.
  test("a .doan/ change is never served, even with .doan in scope", async () => {
    const root = repo();
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, [".doan", ".doan/config.json", "design"]);
    expect(recursivePaths().filter((path) => path.startsWith(join(root, ".doan")))).toEqual([]);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"), REREAD);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[".doan"]}'), REREAD);
  });

  test("an atomic save of a tokenCss file is served without a re-read, every time", async () => {
    const root = repo();
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), "a{}");
    const w = await watchScope(root, ["design", "styles/tokens.css"]);
    await expectChange(w, () => atomicSave(join(root, "styles", "tokens.css"), "b{}"), SERVED);
    await expectChange(w, () => atomicSave(join(root, "styles", "tokens.css"), "c{}"), SERVED);
  });

  // The temporary file of an atomic save at the root is an unknown root name,
  // which re-reads like any other root event (the root's own deletion is one).
  test("a tokenCss file at the repo root is served", async () => {
    const root = repo();
    writeFileSync(join(root, "tokens.css"), "a{}");
    const w = await watchScope(root, ["design", "tokens.css"]);
    await expectChange(w, () => writeFileSync(join(root, "tokens.css"), "b{}"), SERVED);
    await expectChange(w, () => atomicSave(join(root, "tokens.css"), "c{}"), BOTH);
  });

  test("a sibling of a served file is ignored", async () => {
    const root = repo();
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), "a{}");
    const w = await watchScope(root, ["design", "styles/tokens.css"]);
    await expectQuiet(w, () => writeFileSync(join(root, "styles", "other.css"), "x{}"));
  });

  test("a served directory is watched recursively", async () => {
    const root = repo();
    mkdirSync(join(root, "assets", "img"), { recursive: true });
    const w = await watchScope(root, ["assets", "design"]);
    await expectChange(w, () => writeFileSync(join(root, "assets", "img", "x.svg"), "<svg/>"), SERVED);
  });

  // A build step that wipes its output directory replaces it in one burst.
  test("a served directory at the root that is replaced is a served change", async () => {
    const root = repo();
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "a.css"), "a{}");
    const w = await watchScope(root, ["design", "dist"]);
    await expectChange(w, () => {
      rmSync(join(root, "dist"), { recursive: true });
      mkdirSync(join(root, "dist"));
      writeFileSync(join(root, "dist", "a.css"), "b{}");
    }, BOTH);
  });

  test("a nested served directory deleted and created again is watched again", async () => {
    const root = repo();
    mkdirSync(join(root, "web", "dist"), { recursive: true });
    writeFileSync(join(root, "web", "dist", "a.css"), "a{}");
    const w = await watchScope(root, ["design", "web/dist"]);
    await expectChange(w, () => rmSync(join(root, "web", "dist"), { recursive: true }), SERVED);
    await expectChange(w, () => {
      mkdirSync(join(root, "web", "dist"));
      writeFileSync(join(root, "web", "dist", "a.css"), "b{}");
    }, SERVED);
    await expectChange(w, () => writeFileSync(join(root, "web", "dist", "a.css"), "c{}"), SERVED);
  });

  test("a path that leaves the scope is no longer watched", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), "a{}");
    const w = await watchScope(root, ["assets", "design", "styles/tokens.css"]);
    open?.setScope(["design"]);
    await expectQuiet(w, () => {
      writeFileSync(join(root, "assets", "x.css"), "x{}");
      atomicSave(join(root, "styles", "tokens.css"), "b{}");
    });
  });

  test("a path that joins the scope on a later read is watched from then on", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, ["design"]);
    await expectQuiet(w, () => writeFileSync(join(root, "assets", "x.css"), "x{}"));
    open?.setScope(["assets", "design"]);
    await sleep(300);
    await expectChange(w, () => writeFileSync(join(root, "assets", "y.css"), "y{}"), SERVED);
  });

  test("a serve path inside design/ gets no watcher of its own", async () => {
    const root = repo();
    mkdirSync(join(root, "design", "assets"));
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, ["design", "design/assets"]);
    expect(watchedPaths()).not.toContain(join(root, "design", "assets"));
    await expectChange(w, () => writeFileSync(join(root, "design", "assets", "x.css"), "x{}"), BOTH);
  });

  // `doan ls` reports a symlinked `design` by its real path, and the root
  // watcher skips the symlink itself.
  test("a symlinked design/ is watched recursively through its real path", async () => {
    const root = repo({ design: false });
    mkdirSync(join(root, "docs", "design", "sub"), { recursive: true });
    symlinkSync(join("docs", "design"), join(root, "design"));
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, ["docs/design"]);
    expect(watchedPaths()).not.toContain(join(root, "design"));
    await expectChange(w, () => writeFileSync(join(root, "docs", "design", "sub", "a.html"), ""), SERVED);
  });

  test("design/ and a served file changing together make one call with both flags", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, ["assets", "design"]);
    w.reset();
    writeFileSync(join(root, "design", "b.html"), "");
    writeFileSync(join(root, "assets", "x.css"), "x{}");
    expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
    await sleep(400);
    expect(w.calls()).toEqual([BOTH]);
  });

  test("changes less than 200 ms apart make one call", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, ["assets", "design"]);
    w.reset();
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(root, "assets", `x${i}.css`), "x{}");
      await sleep(40);
    }
    expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
    await sleep(400);
    expect(w.calls()).toEqual([SERVED]);
  });
});

describe("createRefresher", () => {
  test("debounces triggers into one run", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
    }, 50);
    refresher.trigger(REREAD);
    await sleep(20);
    refresher.trigger(REREAD);
    await sleep(20);
    refresher.trigger(REREAD);
    expect(runs).toBe(0);
    await sleep(120);
    expect(runs).toBe(1);
    refresher.close();
  });

  test("runs once more when triggered during a run, never two at a time", async () => {
    let runs = 0;
    let active = 0;
    let overlapped = false;
    const refresher = createRefresher(async () => {
      runs++;
      active++;
      if (active > 1) overlapped = true;
      await sleep(150);
      active--;
    }, 20);
    refresher.trigger(REREAD);
    await sleep(60);
    refresher.trigger(REREAD);
    refresher.trigger(REREAD);
    await sleep(500);
    expect(runs).toBe(2);
    expect(overlapped).toBe(false);
    refresher.close();
  });

  test("keeps going after a run fails", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
      throw new Error("boom");
    }, 20);
    refresher.trigger(REREAD);
    await sleep(80);
    refresher.trigger(REREAD);
    await sleep(80);
    expect(runs).toBe(2);
    refresher.close();
  });

  test("close drops a pending run", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
    }, 50);
    refresher.trigger(REREAD);
    refresher.close();
    await sleep(120);
    expect(runs).toBe(0);
  });

  test("merges the flags of triggers within one debounce", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
    }, 50);
    refresher.trigger(REREAD);
    await sleep(20);
    refresher.trigger(SERVED);
    await sleep(120);
    expect(runs).toEqual([BOTH]);
    refresher.close();
  });

  test("carries a change made during a run into the run after it", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
      await sleep(150);
    }, 20);
    refresher.trigger(REREAD);
    await sleep(60);
    refresher.trigger(SERVED);
    await sleep(500);
    expect(runs).toEqual([REREAD, SERVED]);
    refresher.close();
  });
});
