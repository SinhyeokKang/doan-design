import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { thumbnailKey } from "./thumbnailCache";
import { createThumbnails, SERVED_WALK_LIMIT, type ThumbnailDeps, type ThumbnailReply, type Thumbnails } from "./thumbnails";
import type { CanvasRow, FolderEntry } from "./view";

// Holds the cache directory's `mkdir` while set, to stop a cache write midway.
const mkdirGate = vi.hoisted(() => ({ dir: "", held: false, release: () => {} }));
const writeGate = vi.hoisted(() => ({ dir: "", temp: "", release: () => {} }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      await actual.writeFile(...args);
      const path = String(args[0]);
      if (writeGate.dir && path.startsWith(writeGate.dir + "/") && path.endsWith(".tmp")) {
        writeGate.temp = path;
        await new Promise<void>(resolve => { writeGate.release = resolve; });
      }
    },
    mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
      if (mkdirGate.dir !== "" && String(args[0]) === mkdirGate.dir) {
        mkdirGate.held = true;
        await new Promise<void>((resolve) => { mkdirGate.release = resolve; });
      }
      return actual.mkdir(...args);
    },
  };
});

const tmp = mkdtempSync(join(tmpdir(), "doan-thumbnails-"));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Every service a test made, and the captures it left waiting, are let go at
// the end so nothing of one test runs into the next.
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  mkdirGate.dir = "";
  mkdirGate.release();
  writeGate.dir = "";
  writeGate.release();
});
function make(deps: ThumbnailDeps): Thumbnails {
  const thumbnails = createThumbnails(deps);
  cleanups.push(() => thumbnails.dispose());
  return thumbnails;
}

const PNG = (label: string) => Buffer.from(`png:${label}`);

interface Fixture {
  root: string;
  dir: string;
  entries: FolderEntry[];
  captures: string[];
  changed: string[];
  // Captures wait here when set; release() lets the oldest one finish, and
  // fails when none is waiting, so a release is never lost to a capture that
  // has not started yet.
  hold: boolean;
  release(result?: Buffer | null): void;
  result: (url: string) => Buffer | null;
  deps: ThumbnailDeps;
}

function fixture(canvases = ["doan/a.html", "doan/b.html"]): Fixture {
  const base = join(tmp, `t${count++}`);
  const root = join(base, "repo");
  mkdirSync(join(root, "doan"), { recursive: true });
  mkdirSync(join(root, "styles"));
  writeFileSync(join(root, "styles", "tokens.css"), "a{}");
  for (const path of canvases) writeFileSync(join(root, path), `<title>${path}</title>`);
  const waiting: ((result?: Buffer | null) => void)[] = [];
  const f: Fixture = {
    root,
    dir: join(base, "thumbnails"),
    entries: [{ path: root, kind: "list", servedRev: 0, canvases: canvases.map((path) => row(path)) }],
    captures: [],
    changed: [],
    hold: false,
    release: (result) => {
      const next = waiting.shift();
      if (next === undefined) throw new Error("no capture is waiting");
      next(result);
    },
    result: (url) => PNG(url.split("/").at(-1) ?? ""),
    deps: {
      dir: join(base, "thumbnails"),
      appVersion: "1.0.0",
      entries: () => f.entries,
      scope: () => ["doan", "styles/tokens.css"],
      capturer: {
        capture: async (url) => {
          f.captures.push(url);
          if (!f.hold) return f.result(url);
          return new Promise<Buffer | null>((resolve) => waiting.push((result) => resolve(result === undefined ? f.result(url) : result)));
        },
        close: vi.fn(),
      },
      changed: (target) => f.changed.push(target.path),
    },
  };
  cleanups.push(() => { f.hold = false; for (const next of waiting.splice(0)) next(null); });
  return f;
}

function row(path: string, width: number | null = 1280): CanvasRow {
  return { path, open: 0, resolved: 0, url: `http://127.0.0.1:1/t/tok/k/${path}`, ...(width === null ? {} : { width }) };
}

function bump(f: Fixture): FolderEntry[] {
  f.entries = f.entries.map((entry) => (entry.kind === "list" ? { ...entry, servedRev: entry.servedRev + 1 } : entry));
  return f.entries;
}

function touch(path: string, content?: string): void {
  if (content !== undefined) writeFileSync(path, content);
  const later = new Date(Date.now() + 10_000 + count++ * 1000);
  utimesSync(path, later, later);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// get() answers before its job reaches the capturer, so a test waits for the
// capture to start before it releases one.
const started = (f: Fixture, count: number) => vi.waitFor(() => expect(f.captures).toHaveLength(count));
const ready = (png: Buffer): ThumbnailReply => ({ kind: "ready", png: new Uint8Array(png) });
const asBytes = (reply: ThumbnailReply) => (reply.kind === "ready" ? { kind: reply.kind, png: new Uint8Array(reply.png) } : reply);

test("a first get queues a capture, caches PNG and meta, and tells the renderer", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  expect(f.captures).toEqual(["http://127.0.0.1:1/t/tok/k/doan/a.html"]);
  const key = thumbnailKey(f.root, "doan/a.html");
  expect(readFileSync(join(f.dir, `${key}.png`))).toEqual(PNG("a.html"));
  expect(JSON.parse(readFileSync(join(f.dir, `${key}.json`), "utf8"))).toEqual({ mtimeMs: expect.any(Number), size: "<title>doan/a.html</title>".length, appVersion: "1.0.0", tokens: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(asBytes(await thumbnails.get(f.root, "doan/a.html", true))).toEqual(ready(PNG("a.html")));
  expect(f.captures).toHaveLength(1);
});

test("a canvas without width, not listed, or in a folder that is not listed is unavailable and not captured", async () => {
  const f = fixture();
  f.entries = [{ path: f.root, kind: "list", servedRev: 0, canvases: [row("doan/a.html", null)] }, { path: "/loading", kind: "loading" }];
  const thumbnails = make(f.deps);
  for (const [root, path] of [[f.root, "doan/a.html"], [f.root, "doan/b.html"], ["/loading", "doan/a.html"], ["/other", "doan/a.html"]] as const) {
    expect(await thumbnails.get(root, path, true)).toEqual({ kind: "unavailable" });
  }
  expect(f.captures).toEqual([]);
});

test("a failed capture is unavailable until the canvas changes", async () => {
  const f = fixture();
  f.result = () => null;
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "unavailable" });
  expect(existsSync(f.dir)).toBe(false);
  // A served change that leaves this canvas alone keeps the failure.
  thumbnails.entriesChanged(bump(f));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "unavailable" });
  f.result = (url) => PNG(url);
  touch(join(f.root, "doan/a.html"), "<title>A2</title>");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html", "doan/a.html"]));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
  await vi.waitFor(() => expect(f.captures).toHaveLength(2));
});

test("one capture at a time, visible requests first", async () => {
  const f = fixture(["doan/a.html", "doan/b.html", "doan/c.html"]);
  f.hold = true;
  const thumbnails = make(f.deps);
  await thumbnails.get(f.root, "doan/a.html", false);
  await thumbnails.get(f.root, "doan/b.html", false);
  await thumbnails.get(f.root, "doan/c.html", true);
  await started(f, 1);
  expect(f.captures.map((url) => url.split("/").at(-1))).toEqual(["a.html"]);
  f.release();
  await started(f, 2);
  expect(f.captures.at(-1)?.endsWith("c.html")).toBe(true);
  f.release();
  await started(f, 3);
  f.release();
  await vi.waitFor(() => expect(f.changed).toHaveLength(3));
});

test("a later visible get moves a queued canvas ahead", async () => {
  const f = fixture(["doan/a.html", "doan/b.html", "doan/c.html"]);
  f.hold = true;
  const thumbnails = make(f.deps);
  for (const path of ["doan/a.html", "doan/b.html", "doan/c.html"]) await thumbnails.get(f.root, path, false);
  expect(await thumbnails.get(f.root, "doan/c.html", true)).toEqual({ kind: "pending" });
  await started(f, 1);
  f.release();
  await started(f, 2);
  expect(f.captures.at(-1)?.endsWith("c.html")).toBe(true);
  f.release();
  await started(f, 3);
  f.release();
  await vi.waitFor(() => expect(f.changed).toHaveLength(3));
});

test("pausing lets the running capture finish and starts nothing until resumed", async () => {
  const f = fixture();
  f.hold = true;
  const thumbnails = make(f.deps);
  await thumbnails.get(f.root, "doan/a.html", true);
  thumbnails.pause();
  await thumbnails.get(f.root, "doan/b.html", true);
  await started(f, 1);
  f.release();
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(f.captures).toHaveLength(1);
  thumbnails.resume();
  await started(f, 2);
  f.release();
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html", "doan/b.html"]));
});

test("a capture of a canvas edited while it ran is not cached, and a fresh one follows", async () => {
  const f = fixture();
  f.hold = true;
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await started(f, 1);
  touch(join(f.root, "doan/a.html"), "<title>edited</title>");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
  f.release(PNG("old"));
  await started(f, 2);
  const key = thumbnailKey(f.root, "doan/a.html");
  expect(existsSync(join(f.dir, `${key}.png`))).toBe(false);
  f.release(PNG("new"));
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html", "doan/a.html"]));
  expect(readFileSync(join(f.dir, `${key}.png`))).toEqual(PNG("new"));
});

test("a token CSS change makes every thumbnail of the folder stale; a canvas-only change only its own", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  for (const path of ["doan/a.html", "doan/b.html"]) await thumbnails.get(f.root, path, true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  for (const path of ["doan/a.html", "doan/b.html"]) expect((await thumbnails.get(f.root, path, true)).kind).toBe("ready");
  f.changed.length = 0;
  touch(join(f.root, "doan/b.html"), "<title>B2</title>");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/b.html"]));
  expect((await thumbnails.get(f.root, "doan/a.html", true)).kind).toBe("ready");
  expect(await thumbnails.get(f.root, "doan/b.html", true)).toEqual({ kind: "pending" });
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/b.html", "doan/b.html"]));
  f.changed.length = 0;
  touch(join(f.root, "styles/tokens.css"), "a{color:red}");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed.sort()).toEqual(["doan/a.html", "doan/b.html"]));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
});

function bumpRow(f: Fixture, path: string): FolderEntry[] {
  f.entries = f.entries.map((entry) => (entry.kind === "list"
    ? { ...entry, canvases: entry.canvases.map((canvas) => (canvas.path === path ? { ...canvas, rev: (canvas.rev ?? 0) + 1 } : canvas)) }
    : entry));
  return f.entries;
}

// The shell moves a row's revision, not servedRev, when only that canvas file
// changed; only that canvas is checked, so an untouched one is not even looked at.
test("a row revision without a served bump re-checks only that canvas", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  for (const path of ["doan/a.html", "doan/b.html"]) await thumbnails.get(f.root, path, true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  f.changed.length = 0;
  // a.html changes on disk too, but nothing reported it: it is not re-checked.
  touch(join(f.root, "doan/a.html"), "<title>A2</title>");
  touch(join(f.root, "doan/b.html"), "<title>B2</title>");
  thumbnails.entriesChanged(bumpRow(f, "doan/b.html"));
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/b.html"]));
  await vi.waitFor(() => expect(f.captures).toHaveLength(2));
  await sleep(100);
  expect(f.changed).toEqual(["doan/b.html"]);
  expect(await thumbnails.get(f.root, "doan/b.html", true)).toEqual({ kind: "pending" });
  await vi.waitFor(() => expect(f.captures).toHaveLength(3));
  expect(f.captures.at(-1)).toMatch(/design\/b\.html$/);
});

test("a row revision on a canvas whose file did not change keeps its thumbnail", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  thumbnails.entriesChanged(bumpRow(f, "doan/a.html"));
  await sleep(100);
  expect(f.changed).toHaveLength(1);
  expect((await thumbnails.get(f.root, "doan/a.html", true)).kind).toBe("ready");
});

test("a token CSS edit or an app update while the app was closed is caught at the next get", async () => {
  const f = fixture();
  const first = make(f.deps);
  await first.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  first.dispose();
  expect((await make(f.deps).get(f.root, "doan/a.html", true)).kind).toBe("ready");
  touch(join(f.root, "styles/tokens.css"), "a{color:blue}");
  expect(await make({ ...f.deps, capturer: { capture: () => new Promise(() => {}), close: () => {} } }).get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
  const second = make(f.deps);
  await second.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  expect((await make(f.deps).get(f.root, "doan/a.html", true)).kind).toBe("ready");
  expect(await make({ ...f.deps, appVersion: "1.0.1", capturer: { capture: () => new Promise(() => {}), close: () => {} } }).get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
});

test("a change inside a served directory or to a non-canvas file under doan/ makes every thumbnail of the folder stale", async () => {
  const f = fixture();
  mkdirSync(join(f.root, "styles", "img"));
  writeFileSync(join(f.root, "styles", "img", "logo.svg"), "<svg/>");
  writeFileSync(join(f.root, "doan", "mock.css"), "b{}");
  f.deps.scope = () => ["doan", "styles"];
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  for (const path of ["doan/a.html", "doan/b.html"]) await thumbnails.get(f.root, path, true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  for (const [file, content] of [["styles/img/logo.svg", "<svg>2</svg>"], ["doan/mock.css", "b{color:red}"]] as const) {
    for (const path of ["doan/a.html", "doan/b.html"]) await thumbnails.get(f.root, path, true);
    await vi.waitFor(async () => expect((await thumbnails.get(f.root, "doan/b.html", true)).kind).toBe("ready"));
    f.changed.length = 0;
    touch(join(f.root, file), content);
    thumbnails.entriesChanged(bump(f));
    await vi.waitFor(() => expect(f.changed.slice(0, 2).sort()).toEqual(["doan/a.html", "doan/b.html"]));
  }
});

test("a served directory edited while the app was closed is caught at the next get", async () => {
  const f = fixture();
  f.deps.scope = () => ["doan", "styles"];
  await make(f.deps).get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  expect((await make(f.deps).get(f.root, "doan/a.html", true)).kind).toBe("ready");
  touch(join(f.root, "styles/tokens.css"), "a{color:green}");
  expect(await make(f.deps).get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
});

test("the served files are read once per served revision, not per get", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  // Not yet reported by the watcher: the revision's signature still stands.
  touch(join(f.root, "styles/tokens.css"), "a{color:teal}");
  expect((await thumbnails.get(f.root, "doan/a.html", true)).kind).toBe("ready");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
});

test("past the walk limit every served revision counts as changed", async () => {
  const f = fixture(["doan/a.html"]);
  mkdirSync(join(f.root, "styles", "many"));
  for (let i = 0; i <= SERVED_WALK_LIMIT; i++) writeFileSync(join(f.root, "styles", "many", `${i}.css`), "");
  f.deps.scope = () => ["doan", "styles"];
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  expect((await thumbnails.get(f.root, "doan/a.html", true)).kind).toBe("ready");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
});

const countsAsChangedPastLimit = async (f: ReturnType<typeof fixture>) => {
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged(f.entries);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  expect((await thumbnails.get(f.root, "doan/a.html", true)).kind).toBe("ready");
  thumbnails.entriesChanged(bump(f));
  await vi.waitFor(() => expect(f.changed).toHaveLength(2));
  expect(await thumbnails.get(f.root, "doan/a.html", true)).toEqual({ kind: "pending" });
};

test("the walk limit counts empty directories", async () => {
  const f = fixture(["doan/a.html"]);
  for (let i = 0; i <= SERVED_WALK_LIMIT; i++) mkdirSync(join(f.root, "styles", String(i)));
  f.deps.scope = () => ["doan", "styles"];
  await countsAsChangedPastLimit(f);
});

test("the walk limit counts canvas files", async () => {
  const names = Array.from({ length: SERVED_WALK_LIMIT + 1 }, (_, i) => `doan/c${i}.html`);
  const f = fixture(["doan/a.html", ...names]);
  f.deps.scope = () => ["doan"];
  await countsAsChangedPastLimit(f);
});

test("a canvas that leaves the list is forgotten before it is captured", async () => {
  const f = fixture();
  f.hold = true;
  const thumbnails = make(f.deps);
  await thumbnails.get(f.root, "doan/a.html", true);
  await thumbnails.get(f.root, "doan/b.html", true);
  f.entries = [{ path: f.root, kind: "list", servedRev: 1, canvases: [row("doan/a.html")] }];
  thumbnails.entriesChanged(f.entries);
  await started(f, 1);
  f.release();
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(f.captures).toHaveLength(1);
});

test("cleans orphaned cache and temp files once nothing is loading, keeping live and foreign files", async () => {
  const f = fixture(["doan/a.html"]);
  mkdirSync(f.dir);
  const live = thumbnailKey(f.root, "doan/a.html");
  const orphan = thumbnailKey("/gone", "doan/a.html");
  for (const name of [`${live}.png`, `${live}.json`, `${orphan}.png`, `${orphan}.json`, `${live}.png.abc.tmp`, "notes.txt"]) writeFileSync(join(f.dir, name), "x");
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged([...f.entries, { path: "/slow", kind: "loading" }]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(readdirSync(f.dir)).toHaveLength(6);
  thumbnails.entriesChanged([...f.entries, { path: "/slow", kind: "notFound" }]);
  await vi.waitFor(() => expect(readdirSync(f.dir).sort()).toEqual([`${live}.json`, `${live}.png`, "notes.txt"].sort()));
  // Once per start: a later orphan waits for the next start.
  writeFileSync(join(f.dir, `${orphan}.png`), "x");
  thumbnails.entriesChanged(f.entries);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(readdirSync(f.dir)).toContain(`${orphan}.png`);
});

test("removing a project deletes its cache files and drops its running capture", async () => {
  const f = fixture();
  const thumbnails = make(f.deps);
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(f.changed).toHaveLength(1));
  f.hold = true;
  await thumbnails.get(f.root, "doan/b.html", true);
  await started(f, 2);
  const before = f.entries;
  f.entries = [];
  await thumbnails.removed([f.root], before);
  thumbnails.entriesChanged(f.entries);
  expect(readdirSync(f.dir)).toEqual([]);
  f.release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(readdirSync(f.dir)).toEqual([]);
  expect(f.changed).toHaveLength(1);
});

test("a project removed while its cache write runs leaves no files behind", async () => {
  const f = fixture(["doan/a.html"]);
  const thumbnails = make(f.deps);
  mkdirGate.dir = f.dir;
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(mkdirGate.held).toBe(true));
  const before = f.entries;
  f.entries = [];
  const removal = thumbnails.removed([f.root], before);
  thumbnails.entriesChanged(f.entries);
  mkdirGate.dir = "";
  mkdirGate.release();
  await removal;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(existsSync(f.dir) ? readdirSync(f.dir) : []).toEqual([]);
  expect(f.changed).toEqual([]);
});

test("dispose closes the capture window", () => {
  const f = fixture();
  make(f.deps).dispose();
  expect(f.deps.capturer.close).toHaveBeenCalledOnce();
});


test("visibility changes during cache reads determine the next capture", async () => {
  const f = fixture(["doan/a.html", "doan/b.html", "doan/c.html"]);
  f.hold = true;
  const thumbnails = make(f.deps);
  await thumbnails.get(f.root, "doan/a.html", true);
  await started(f, 1);
  const b = thumbnails.get(f.root, "doan/b.html", true);
  const c = thumbnails.get(f.root, "doan/c.html", false);
  thumbnails.visible(f.root, "doan/b.html", false);
  thumbnails.visible(f.root, "doan/c.html", true);
  await Promise.all([b, c]);
  f.release();
  await started(f, 2);
  expect(f.captures.at(-1)?.endsWith("c.html")).toBe(true);
});

test("visibility updates demote queued cards without scheduling new captures", async () => {
  const f = fixture(["doan/a.html", "doan/b.html", "doan/c.html"]);
  f.hold = true;
  const thumbnails = make(f.deps);
  for (const path of ["doan/a.html", "doan/b.html", "doan/c.html"]) await thumbnails.get(f.root, path, true);
  await started(f, 1);
  thumbnails.visible(f.root, "doan/b.html", false);
  thumbnails.visible("/other", "doan/b.html", true);
  thumbnails.visible(f.root, "doan/missing.html", true);
  f.release();
  await started(f, 2);
  expect(f.captures.at(-1)?.endsWith("c.html")).toBe(true);
});

test("startup collection leaves an active temporary write intact while removing orphan temps", async () => {
  const f = fixture(["doan/a.html"]);
  mkdirSync(f.dir);
  const orphan = join(f.dir, "old.png.abc.tmp");
  writeFileSync(orphan, "orphan");
  const thumbnails = make(f.deps);
  thumbnails.entriesChanged([...f.entries, { path: "/slow", kind: "loading" }]);
  writeGate.dir = f.dir;
  await thumbnails.get(f.root, "doan/a.html", true);
  await vi.waitFor(() => expect(writeGate.temp.startsWith(f.dir)).toBe(true));
  const temp = writeGate.temp;
  expect(existsSync(temp)).toBe(true);
  thumbnails.entriesChanged([...f.entries, { path: "/slow", kind: "notFound" }]);
  await vi.waitFor(() => expect(existsSync(orphan)).toBe(false));
  writeGate.dir = "";
  writeGate.release();
  await vi.waitFor(() => expect(f.changed).toEqual(["doan/a.html"]));
  expect(asBytes(await thumbnails.get(f.root, "doan/a.html", true))).toEqual(ready(PNG("a.html")));
  expect(existsSync(temp)).toBe(false);
  expect(readdirSync(f.dir).some(name => name.endsWith(".tmp"))).toBe(false);
});
