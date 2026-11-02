import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createCanvasSeenStore } from "./canvasSeen";
import type { CanvasRow, FolderEntry } from "./view";

const tmp = mkdtempSync(join(tmpdir(), "doan-canvas-seen-"));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function file(): string {
  const dir = join(tmp, `d${count++}`);
  mkdirSync(dir);
  return join(dir, "canvas-seen.json");
}
const row = (path: string, mtimeMs?: number): CanvasRow => ({ path, url: `http://x/${path}`, ...(mtimeMs === undefined ? {} : { mtimeMs }) });
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });
const unseen = (entries: readonly FolderEntry[]) => entries.flatMap(entry => entry.kind === "list" ? entry.canvases.filter(row => row.unseen).map(row => `${entry.path}:${row.path}`) : []);
const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html";

describe("apply", () => {
  test("the first listing of a root with no record counts every canvas as seen", () => {
    const store = createCanvasSeenStore(file());
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 20)])]))).toEqual([]);
  });

  test("a canvas new after the baseline is unseen, and one changed since it was seen", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 5)])]))).toEqual(["/r:" + B]);
    const [entry] = store.apply([list("/r", [row(A, 11), row(B, 5)])]);
    expect(entry?.kind === "list" && entry.canvases.map(row => row.unseen)).toEqual(["changed", "new"]);
  });

  test("any other mtime is changed, even an older one after a clock rollback; the same one is seen", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    expect(unseen(store.apply([list("/r", [row(A, 10)])]))).toEqual([]);
    const [entry] = store.apply([list("/r", [row(A, 9)])]);
    expect(entry?.kind === "list" && entry.canvases.map(row => row.unseen)).toEqual(["changed"]);
  });

  test("a row without an mtime is never unseen and leaves the record alone", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    expect(unseen(store.apply([list("/r", [row(A), row(B)])]))).toEqual([]);
    expect(unseen(store.apply([list("/r", [row(A, 10)])]))).toEqual([]);
  });

  test("a loading root is not baselined; its first listing is", () => {
    const store = createCanvasSeenStore(file());
    store.apply([{ path: "/r", kind: "loading" }]);
    expect(unseen(store.apply([list("/r", [row(A, 10)])]))).toEqual([]);
  });

  test("a canvas missing from one listing and back with the same mtime is not unseen", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10), row(B, 20)])]);
    store.apply([list("/r", [row(A, 10)])]);
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 20)])]))).toEqual([]);
  });

  test("a root in an error kind keeps its record; a removed root loses it and is baselined again", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    store.apply([{ path: "/r", kind: "error", message: "x" }]);
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 1)])]))).toEqual(["/r:" + B]);
    store.apply([]);
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 1)])]))).toEqual([]);
  });

  test("leaves the given entries untouched", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    const entries = [list("/r", [row(A, 11)])];
    const before = JSON.stringify(entries);
    store.apply(entries);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe("mark", () => {
  test("records the listed mtime, and marking it again does not move the record", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    const entries = [list("/r", [row(A, 12)])];
    expect(unseen(store.apply(entries))).toEqual(["/r:" + A]);
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 12 })).toBe(true);
    expect(unseen(store.apply(entries))).toEqual([]);
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 12 })).toBe(false);
    expect(unseen(store.apply(entries))).toEqual([]);
  });

  test("records a listed mtime older than the one seen, so a rolled-back canvas can be cleared", () => {
    const path = file();
    const store = createCanvasSeenStore(path);
    store.apply([list("/r", [row(A, 2000)])]);
    const entries = [list("/r", [row(A, 1000)])];
    expect(unseen(store.apply(entries))).toEqual(["/r:" + A]);
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 1000 })).toBe(true);
    expect(unseen(store.apply(entries))).toEqual([]);
    expect(unseen(createCanvasSeenStore(path).apply(entries))).toEqual([]);
  });

  test("refuses a mark whose mtime is not the listed row's: a stale mark after a newer listing, or any other value", () => {
    const store = createCanvasSeenStore(file());
    store.apply([list("/r", [row(A, 10)])]);
    const entries = [list("/r", [row(A, 13)])];
    expect(unseen(store.apply(entries))).toEqual(["/r:" + A]);
    for (const mtimeMs of [12, 10, 14, 1e15]) expect(store.mark(entries, { root: "/r", path: A, mtimeMs })).toBe(false);
    expect(unseen(store.apply(entries))).toEqual(["/r:" + A]);
    expect(store.mark([list("/r", [row(A)])], { root: "/r", path: A, mtimeMs: 13 })).toBe(false);
  });

  test("a mark on a root with no record baselines it first, so the other canvases do not turn new", () => {
    const store = createCanvasSeenStore(file());
    const entries = [list("/r", [row(A, 10), row(B, 20)])];
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 10 })).toBe(true);
    expect(unseen(store.apply(entries))).toEqual([]);
  });

  test("refuses an unregistered root, an unlisted path and a bad value", () => {
    const store = createCanvasSeenStore(file());
    const entries = [list("/r", [row(A, 10)]), { path: "/e", kind: "error", message: "x" } as FolderEntry];
    store.apply(entries);
    for (const value of [
      { root: "/other", path: A, mtimeMs: 20 }, { root: "/r", path: B, mtimeMs: 20 }, { root: "/e", path: A, mtimeMs: 20 },
      { root: "/r", path: A, mtimeMs: Number.NaN }, { root: "/r", path: A, mtimeMs: "20" }, { root: "/r", path: A }, null, "x",
    ]) expect(store.mark(entries, value)).toBe(false);
  });
});

describe("persistence", () => {
  test("survives a restart: what was seen stays seen and later changes stay unseen", () => {
    const path = file();
    const first = createCanvasSeenStore(path);
    first.apply([list("/r", [row(A, 10), row(B, 20)])]);
    first.mark([list("/r", [row(A, 15), row(B, 20)])], { root: "/r", path: A, mtimeMs: 15 });
    const second = createCanvasSeenStore(path);
    expect(unseen(second.apply([list("/r", [row(A, 15), row(B, 21)]), list("/n", [row(A, 1)])]))).toEqual(["/r:" + B]);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 1, roots: { "/r": { [A]: 15, [B]: 20 }, "/n": { [A]: 1 } } });
  });

  test("a missing, broken or wrong-shaped file starts empty, so every root is baselined", () => {
    for (const text of [null, "{broken", JSON.stringify({ v: 1, roots: [] }), JSON.stringify({ roots: {} })]) {
      const path = file();
      if (text !== null) writeFileSync(path, text);
      expect(unseen(createCanvasSeenStore(path).apply([list("/r", [row(A, 10)])]))).toEqual([]);
    }
  });

  test("a wrong-typed entry is dropped on its own", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 1, roots: { "/r": { [A]: "x", [B]: 5 }, "/s": 3 } }));
    expect(unseen(createCanvasSeenStore(path).apply([list("/r", [row(A, 10), row(B, 6)])]))).toEqual(["/r:" + A, "/r:" + B]);
  });

  test("a file from a newer Doan is never overwritten", () => {
    const path = file();
    const text = JSON.stringify({ v: 2, roots: {} });
    writeFileSync(path, text);
    const store = createCanvasSeenStore(path);
    store.apply([list("/r", [row(A, 10)])]);
    store.mark([list("/r", [row(A, 11)])], { root: "/r", path: A, mtimeMs: 11 });
    expect(readFileSync(path, "utf8")).toBe(text);
  });

  test("a failed write is retried on the next apply or mark, and on a flush only while unsaved", () => {
    const path = file();
    let fail = true;
    const write = vi.fn((target: string, text: string) => {
      if (fail) throw new Error("disk full");
      writeFileSync(target, text);
    });
    const store = createCanvasSeenStore(path, write);
    store.apply([list("/r", [row(A, 10)])]);
    expect(write).toHaveBeenCalledTimes(1);
    fail = false;
    store.apply([list("/r", [row(A, 10)])]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 1, roots: { "/r": { [A]: 10 } } });
    store.apply([list("/r", [row(A, 10)])]);
    store.flushSync();
    expect(write).toHaveBeenCalledTimes(2);

    fail = true;
    const entries = [list("/r", [row(A, 11)])];
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 11 })).toBe(true);
    expect(write).toHaveBeenCalledTimes(3);
    fail = false;
    expect(store.mark(entries, { root: "/r", path: A, mtimeMs: 11 })).toBe(false);
    expect(write).toHaveBeenCalledTimes(4);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 1, roots: { "/r": { [A]: 11 } } });

    fail = true;
    expect(store.mark([list("/r", [row(A, 12)])], { root: "/r", path: A, mtimeMs: 12 })).toBe(true);
    fail = false;
    store.flushSync();
    expect(write).toHaveBeenCalledTimes(6);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 1, roots: { "/r": { [A]: 12 } } });
    store.flushSync();
    expect(write).toHaveBeenCalledTimes(6);
  });

  test("a failed write keeps the state in memory", () => {
    const dir = file();
    mkdirSync(dir);
    const store = createCanvasSeenStore(join(dir, "missing", "canvas-seen.json"));
    store.apply([list("/r", [row(A, 10)])]);
    expect(unseen(store.apply([list("/r", [row(A, 10), row(B, 1)])]))).toEqual(["/r:" + B]);
  });
});
