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
  type FSWatcher,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { createRefresher, watchFolder, type Change, type FolderWatch } from "./watch";

// Pass-through spy, so a test can see which paths got a watcher of their own;
// it also counts raw events, so a test can wait until they stop.
const raw = vi.hoisted(() => ({ events: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const watch = (path: string, options: { recursive: boolean }, listener: (event: string, filename: string | null) => void) =>
    fs.watch(path, options, (event, filename) => {
      raw.events++;
      listener(event, filename);
    });
  return { ...fs, watch: vi.fn(watch) };
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

// Waits until neither a raw event nor a call has arrived for 300 ms (bounded).
// A fixed sleep let a late FSEvents batch from setup slip into the next step,
// and a raw event shows up before the debounced call it causes.
async function settle(calls: () => number): Promise<void> {
  const activity = () => raw.events + calls();
  const deadline = Date.now() + 3_000;
  let seen = activity();
  let since = Date.now();
  while (Date.now() < deadline && Date.now() - since < 300) {
    await sleep(10);
    if (activity() !== seen) {
      seen = activity();
      since = Date.now();
    }
  }
}

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
    mkdirSync(join(root, ".doan/canvases"), { recursive: true });
    writeFileSync(join(root, ".doan/canvases", "a.html"), "<!doctype html>");
  }
  if (parts.doan ?? true) {
    mkdirSync(join(root, ".doan"), { recursive: true });
    writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    if (parts.comments ?? true) mkdirSync(join(root, ".doan", "comments"), { recursive: true });
  }
  return root;
}

// Starts watching, lets startup events settle, then counts re-reads.
async function watch(root: string): Promise<{ reads: () => number; reset: () => void }> {
  let reads = 0;
  open = watchFolder(root, async () => {
    reads++;
  });
  await settle(() => reads);
  reads = 0;
  return { reads: () => reads, reset: () => (reads = 0) };
}

async function expectReread(w: { reads: () => number; reset: () => void }, change: () => void): Promise<void> {
  w.reset();
  change();
  expect(await within(1_000, () => w.reads() >= 1)).toBe(true);
  // Let the debounce window pass so the next step starts clean.
  await settle(w.reads);
}

describe("watchFolder re-reads within a second", () => {
  test.each<[string, (root: string) => void]>([
    ["a canvas is added", (root) => writeFileSync(join(root, ".doan/canvases", "b.html"), "")],
    ["a nested canvas is added", (root) => {
      mkdirSync(join(root, ".doan/canvases", "sub"), { recursive: true });
      writeFileSync(join(root, ".doan/canvases", "sub", "c.html"), "");
    }],
    ["a canvas is deleted", (root) => unlinkSync(join(root, ".doan/canvases", "a.html"))],
    ["a canvas is renamed", (root) => renameSync(join(root, ".doan/canvases", "a.html"), join(root, ".doan/canvases", "b.html"))],
    ["a canvas changes", (root) => appendFileSync(join(root, ".doan/canvases", "a.html"), "<title>x</title>")],
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

  test("when .doan/canvases/ appears later, and then inside it", async () => {
    const root = repo({ design: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, ".doan/canvases"), { recursive: true }));
    await expectReread(w, () => writeFileSync(join(root, ".doan/canvases", "a.html"), ""));
  });

  test("when .doan/canvases/ is deleted and created again, and then inside it", async () => {
    const root = repo();
    const w = await watch(root);
    await expectReread(w, () => rmSync(join(root, ".doan/canvases"), { recursive: true }));
    await expectReread(w, () => mkdirSync(join(root, ".doan/canvases"), { recursive: true }));
    await expectReread(w, () => writeFileSync(join(root, ".doan/canvases", "b.html"), ""));
  });

  test("when .doan/ appears later and then config.json changes", async () => {
    const root = repo({ doan: false });
    const w = await watch(root);
    await expectReread(w, () => {
      mkdirSync(join(root, ".doan"), { recursive: true });
      writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    });
    await expectReread(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}'));
  });

  test("when .doan/comments/ appears later and then a comment file is added", async () => {
    const root = repo({ comments: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, ".doan", "comments"), { recursive: true }));
    await expectReread(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"));
  });
});

describe("watchFolder", () => {
  test("merges a burst of events into one re-read", async () => {
    const root = repo();
    const w = await watch(root);
    for (let i = 0; i < 10; i++) writeFileSync(join(root, ".doan/canvases", `b${i}.html`), "");
    await sleep(800);
    expect(w.reads()).toBe(1);
  });

  test("stops after close", async () => {
    const root = repo();
    const w = await watch(root);
    open?.close();
    writeFileSync(join(root, ".doan/canvases", "b.html"), "");
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
  await settle(() => calls.length);
  calls = [];
  return {
    calls: () => calls,
    merged: () => {
      const names = mergedNames(calls);
      return { reread: calls.some((call) => call.reread), served: calls.some((call) => call.served), ...(names === undefined ? {} : { names }) };
    },
    reset: () => (calls = []),
  };
}

// Like the refresher: a union, unknown once any call had an unknown name, and
// absent when no call carried names. Sorted, so a test can compare it.
function mergedNames(calls: readonly Change[]): string[] | null | undefined {
  if (calls.some((call) => call.names === null)) return null;
  const names = calls.flatMap((call) => call.names ?? []);
  return calls.some((call) => call.names !== undefined) ? [...new Set(names)].sort() : undefined;
}

async function expectChange(w: Recorder, change: () => void, expected: Change): Promise<void> {
  w.reset();
  change();
  expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
  await settle(() => w.calls().length);
  expect(w.merged()).toEqual(expected);
}

async function expectQuiet(w: Recorder, change: () => void): Promise<void> {
  await settle(() => w.calls().length);
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
  // Whether a .doan/canvases/ change is served is the shell's call, made from the names.
  test("a .doan/canvases/ change needs a re-read and carries its names", async () => {
    const root = repo();
    const w = await watchScope(root, [".doan/canvases"]);
    await expectChange(w, () => writeFileSync(join(root, ".doan/canvases", "b.html"), ""), { ...REREAD, names: ["b.html"] });
    await expectChange(w, () => {
      mkdirSync(join(root, ".doan/canvases", "sub"), { recursive: true });
      writeFileSync(join(root, ".doan/canvases", "sub", "c.html"), "");
    }, { ...REREAD, names: ["sub", "sub/c.html"] });
  });

  // Claude Code saves through `<name>.tmp.<pid>.<hex>` renamed over the file;
  // both names arrive within one debounce (revision-continuity task 1).
  test("a save through a temporary sibling carries both names in one call", async () => {
    const root = repo();
    const w = await watchScope(root, [".doan/canvases"]);
    w.reset();
    writeFileSync(join(root, ".doan/canvases", "a.html.tmp.4242.0123456789ab"), "<!doctype html><title>x</title>");
    renameSync(join(root, ".doan/canvases", "a.html.tmp.4242.0123456789ab"), join(root, ".doan/canvases", "a.html"));
    expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
    await sleep(400);
    expect(w.calls()).toHaveLength(1);
    expect(w.merged()).toEqual({ ...REREAD, names: ["a.html", "a.html.tmp.4242.0123456789ab"] });
  });

  // A dead .doan/canvases/ watcher reports no name, so the shell cannot tell what changed.
  test("an error on the .doan/canvases/ watcher re-reads with unknown names", async () => {
    const root = repo();
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, [".doan/canvases"]);
    const index = watchedPaths().indexOf(join(root, ".doan/canvases"));
    const watcher = vi.mocked(fsWatch).mock.results[index]?.value as FSWatcher | undefined;
    expect(watcher).toBeDefined();
    await expectChange(w, () => watcher?.emit("error", new Error("gone")), { ...REREAD, names: null });
  });

  // The root watcher sees .doan/canvases/ itself go and come back; that is served
  // whatever the .doan/canvases/ watcher reported, since every file in it changed.
  test(".doan/canvases/ deleted and created again is a served change", async () => {
    const root = repo();
    const w = await watchScope(root, [".doan/canvases"]);
    w.reset();
    rmSync(join(root, ".doan/canvases"), { recursive: true });
    mkdirSync(join(root, ".doan/canvases"), { recursive: true });
    writeFileSync(join(root, ".doan/canvases", "a.html"), "<!doctype html>");
    expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
    await settle(() => w.calls().length);
    expect(w.merged()).toMatchObject(BOTH);
  });

  test("a .doan/ change only needs a re-read", async () => {
    const root = repo();
    const w = await watchScope(root, [".doan/canvases"]);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"), REREAD);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}'), REREAD);
  });

  // Writing a comment must not reload the canvas, even when `serve` points into `.doan`.
  test("a .doan/ change is never served, even with .doan in scope", async () => {
    const root = repo();
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, [".doan", ".doan/config.json", ".doan/canvases"]);
    expect(recursivePaths().filter((path) => path.startsWith(join(root, ".doan")))).toEqual([join(root, ".doan/canvases")]);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"), REREAD);
    await expectChange(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[".doan"]}'), REREAD);
  });

  test("an atomic save of a tokenCss file is served without a re-read, every time", async () => {
    const root = repo();
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), "a{}");
    const w = await watchScope(root, [".doan/canvases", "styles/tokens.css"]);
    await expectChange(w, () => atomicSave(join(root, "styles", "tokens.css"), "b{}"), SERVED);
    await expectChange(w, () => atomicSave(join(root, "styles", "tokens.css"), "c{}"), SERVED);
  });

  // The temporary file of an atomic save at the root is an unknown root name,
  // which re-reads like any other root event (the root's own deletion is one).
  test("a tokenCss file at the repo root is served", async () => {
    const root = repo();
    writeFileSync(join(root, "tokens.css"), "a{}");
    const w = await watchScope(root, [".doan/canvases", "tokens.css"]);
    await expectChange(w, () => writeFileSync(join(root, "tokens.css"), "b{}"), SERVED);
    await expectChange(w, () => atomicSave(join(root, "tokens.css"), "c{}"), BOTH);
  });

  test("a sibling of a served file is ignored", async () => {
    const root = repo();
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), "a{}");
    const w = await watchScope(root, [".doan/canvases", "styles/tokens.css"]);
    await expectQuiet(w, () => writeFileSync(join(root, "styles", "other.css"), "x{}"));
  });

  test("a served directory is watched recursively", async () => {
    const root = repo();
    mkdirSync(join(root, "assets", "img"), { recursive: true });
    const w = await watchScope(root, ["assets", ".doan/canvases"]);
    await expectChange(w, () => writeFileSync(join(root, "assets", "img", "x.svg"), "<svg/>"), SERVED);
  });

  // A build step that wipes its output directory replaces it in one burst.
  test("a served directory at the root that is replaced is a served change", async () => {
    const root = repo();
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "a.css"), "a{}");
    const w = await watchScope(root, [".doan/canvases", "dist"]);
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
    const w = await watchScope(root, [".doan/canvases", "web/dist"]);
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
    const w = await watchScope(root, ["assets", ".doan/canvases", "styles/tokens.css"]);
    open?.setScope([".doan/canvases"]);
    await expectQuiet(w, () => {
      writeFileSync(join(root, "assets", "x.css"), "x{}");
      atomicSave(join(root, "styles", "tokens.css"), "b{}");
    });
  });

  test("a path that joins the scope on a later read is watched from then on", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, [".doan/canvases"]);
    await expectQuiet(w, () => writeFileSync(join(root, "assets", "x.css"), "x{}"));
    open?.setScope(["assets", ".doan/canvases"]);
    await settle(() => w.calls().length);
    await expectChange(w, () => writeFileSync(join(root, "assets", "y.css"), "y{}"), SERVED);
  });

  test("a serve path inside .doan/canvases/ gets no watcher of its own", async () => {
    const root = repo();
    mkdirSync(join(root, ".doan/canvases", "assets"), { recursive: true });
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, [".doan/canvases", ".doan/canvases/assets"]);
    expect(watchedPaths()).not.toContain(join(root, ".doan/canvases", "assets"));
    await expectChange(w, () => writeFileSync(join(root, ".doan/canvases", "assets", "x.css"), "x{}"), { ...REREAD, names: ["assets/x.css"] });
  });

  // `doan ls` reports a symlinked `doan` by its real path, and the root
  // watcher skips the symlink itself.
  test("a symlinked .doan/canvases/ is watched recursively through its real path", async () => {
    const root = repo({ design: false });
    mkdirSync(join(root, "docs", ".doan/canvases", "sub"), { recursive: true });
    symlinkSync(join("..", "docs", ".doan/canvases"), join(root, ".doan/canvases"));
    vi.mocked(fsWatch).mockClear();
    const w = await watchScope(root, ["docs/.doan/canvases"]);
    expect(watchedPaths()).not.toContain(join(root, ".doan/canvases"));
    await expectChange(w, () => writeFileSync(join(root, "docs", ".doan/canvases", "sub", "a.html"), ""), SERVED);
  });

  test(".doan/canvases/ and a served file changing together make one call with both flags and the names", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, ["assets", ".doan/canvases"]);
    w.reset();
    writeFileSync(join(root, ".doan/canvases", "b.html"), "");
    writeFileSync(join(root, "assets", "x.css"), "x{}");
    expect(await within(1_000, () => w.calls().length >= 1)).toBe(true);
    await sleep(400);
    expect(w.calls()).toEqual([{ ...BOTH, names: ["b.html"] }]);
  });

  test("changes less than 200 ms apart make one call", async () => {
    const root = repo();
    mkdirSync(join(root, "assets"));
    const w = await watchScope(root, ["assets", ".doan/canvases"]);
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

  test("unions design names across triggers within one debounce", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
    }, 50);
    refresher.trigger({ reread: true, served: false, names: ["a.html"] });
    await sleep(20);
    refresher.trigger({ reread: true, served: false, names: ["sub/b.html", "a.html"] });
    await sleep(120);
    expect(runs).toEqual([{ reread: true, served: false, names: ["a.html", "sub/b.html"] }]);
    refresher.close();
  });

  test("leaves names out of a run no design event reached", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
    }, 20);
    refresher.trigger(REREAD);
    refresher.trigger(SERVED);
    await sleep(80);
    expect(runs).toHaveLength(1);
    expect(runs[0]).not.toHaveProperty("names");
    refresher.close();
  });

  test("a trigger without names keeps the names gathered so far", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
    }, 50);
    refresher.trigger({ reread: true, served: false, names: ["a.html"] });
    refresher.trigger(SERVED);
    refresher.trigger(REREAD);
    await sleep(120);
    expect(runs).toEqual([{ reread: true, served: true, names: ["a.html"] }]);
    refresher.close();
  });

  test("an unknown name sticks until a run takes it", async () => {
    const runs: Change[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
    }, 50);
    refresher.trigger({ reread: true, served: false, names: ["a.html"] });
    refresher.trigger({ reread: true, served: false, names: null });
    refresher.trigger({ reread: true, served: false, names: ["b.html"] });
    await sleep(120);
    refresher.trigger({ reread: true, served: false, names: ["c.html"] });
    await sleep(120);
    expect(runs).toEqual([
      { reread: true, served: false, names: null },
      { reread: true, served: false, names: ["c.html"] },
    ]);
    refresher.close();
  });

  test("names arriving during a run reach the run after it, not the running one", async () => {
    const runs: Change[] = [];
    const seen: (readonly string[] | null | undefined)[] = [];
    const refresher = createRefresher(async (change) => {
      runs.push(change);
      seen.push(change.names === null || change.names === undefined ? change.names : [...change.names]);
      await sleep(150);
    }, 20);
    refresher.trigger({ reread: true, served: false, names: ["a.html"] });
    await sleep(60);
    refresher.trigger({ reread: true, served: false, names: ["b.html"] });
    refresher.trigger({ reread: true, served: false, names: null });
    await sleep(500);
    expect(seen).toEqual([["a.html"], null]);
    // The running change was not mutated by the later triggers.
    expect(runs[0]).toEqual({ reread: true, served: false, names: ["a.html"] });
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

test("canvas assets reload after creation, editing and directory replacement", async () => {
  const root = repo();
  const w = await watchScope(root, [".doan/canvases"]);
  const assets = join(root, ".doan/assets");
  await expectChange(w, () => mkdirSync(assets), BOTH);
  await expectChange(w, () => writeFileSync(join(assets, "style.css"), "a{}"), SERVED);
  await expectChange(w, () => {
    rmSync(assets, { recursive: true });
    mkdirSync(assets);
    writeFileSync(join(assets, "style.css"), "b{}");
  }, BOTH);
  await expectChange(w, () => writeFileSync(join(assets, "style.css"), "c{}"), SERVED);
});

test("fixed watchers never follow a symlinked .doan directory", async () => {
  const root = repo({ design: false, doan: false });
  const outside = repo();
  symlinkSync(join(outside, ".doan"), join(root, ".doan"));
  vi.mocked(fsWatch).mockClear();
  await watchScope(root, []);
  expect(watchedPaths().filter(path => path.startsWith(join(root, ".doan")))).toEqual([]);
});
