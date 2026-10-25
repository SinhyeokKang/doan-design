import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createReviewStore, parseReviewRaise, parseReviewRead } from "./reviewState";

const tmp = mkdtempSync(join(tmpdir(), "doan-review-state-"));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function file(): string {
  const dir = join(tmp, `d${count++}`);
  mkdirSync(dir);
  return join(dir, "review-state.json");
}
const saved = () => ["/repo", "/other"];
const T0 = "2026-10-26T09:00:00.000Z";
const T1 = "2026-10-26T10:00:00.000Z";
const T2 = "2026-10-26T11:00:00.000Z";
const clock = (iso = T0) => () => new Date(iso);
const onDisk = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const key = (root: string, canvas: string) => `${root}\u0000${canvas}`;

describe("first use", () => {
  test("creates the file with since = now and no canvases", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T0));
    expect(store.marker("/repo", "home")).toEqual({ since: T0 });
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: {} });
  });

  test("keeps since from the file on later launches", () => {
    const path = file();
    createReviewStore(path, saved, clock(T0)).marker("/repo", "home");
    expect(createReviewStore(path, saved, clock(T2)).marker("/repo", "home")).toEqual({ since: T0 });
  });

  test("an unseen canvas uses since; a raised one has its own time", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T0));
    store.raise("/repo", "home", T1);
    expect(store.marker("/repo", "home")).toEqual({ since: T0, lastReviewedAt: T1 });
    expect(store.marker("/repo", "settings")).toEqual({ since: T0 });
    expect(store.marker("/other", "home")).toEqual({ since: T0 });
  });
});

describe("raise", () => {
  test("only raises, never lowers, and writes each raise", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T0));
    expect(store.raise("/repo", "home", T2)).toEqual({ since: T0, lastReviewedAt: T2 });
    expect(store.raise("/repo", "home", T1)).toEqual({ since: T0, lastReviewedAt: T2 });
    expect(store.raise("/repo", "home", T2)).toEqual({ since: T0, lastReviewedAt: T2 });
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T2 } });
    expect(createReviewStore(path, saved, clock(T0)).marker("/repo", "home")).toEqual({ since: T0, lastReviewedAt: T2 });
  });

  test("a time not after since adds no entry", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T1));
    expect(store.raise("/repo", "home", T0)).toEqual({ since: T1 });
    expect(store.raise("/repo", "home", T1)).toEqual({ since: T1 });
    expect(onDisk(path)).toEqual({ v: 1, since: T1, canvases: {} });
  });

  test("a failed write keeps the raise in memory and does not throw", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T0));
    store.marker("/repo", "home");
    const dir = join(path, "..");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    chmodSync(dir, 0o500);
    try {
      expect(store.raise("/repo", "home", T1)).toEqual({ since: T0, lastReviewedAt: T1 });
      expect(error).toHaveBeenCalled();
    } finally {
      chmodSync(dir, 0o700);
      error.mockRestore();
    }
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: {} });
    store.raise("/repo", "home", T2);
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T2 } });
    expect(readdirSync(dir)).toEqual(["review-state.json"]);
  });
});

describe("validation and recovery", () => {
  test.each([
    ["broken JSON", "{broken"],
    ["an array", "[]"],
    ["null", "null"],
    ["empty", ""],
    ["another version", JSON.stringify({ v: 2, since: T0, canvases: {} })],
    ["no since", JSON.stringify({ v: 1, canvases: {} })],
    ["a since without milliseconds", JSON.stringify({ v: 1, since: "2026-10-26T09:00:00Z", canvases: {} })],
    ["an impossible since", JSON.stringify({ v: 1, since: "2026-13-40T09:00:00.000Z", canvases: {} })],
    ["canvases that are not an object", JSON.stringify({ v: 1, since: T0, canvases: [] })],
    ["unknown top-level keys", JSON.stringify({ v: 1, since: T0, canvases: {}, more: 1 })],
  ])("%s starts again from now and is rewritten", (_name, text) => {
    const path = file();
    writeFileSync(path, text);
    const store = createReviewStore(path, saved, clock(T2));
    expect(store.marker("/repo", "home")).toEqual({ since: T2 });
    expect(onDisk(path)).toEqual({ v: 1, since: T2, canvases: {} });
  });

  test("a path that cannot be read as a file starts from now without throwing", () => {
    const path = file();
    mkdirSync(path);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = createReviewStore(path, saved, clock(T2));
      expect(store.marker("/repo", "home")).toEqual({ since: T2 });
      expect(store.raise("/repo", "home", "2026-10-26T12:00:00.000Z")).toEqual({ since: T2, lastReviewedAt: "2026-10-26T12:00:00.000Z" });
    } finally {
      error.mockRestore();
    }
  });

  test("drops invalid entries one by one and keeps the rest", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 1, since: T0, canvases: {
      [key("/repo", "home")]: T1,
      "no-separator": T1,
      [key("relative", "home")]: T1,
      [key("", "home")]: T1,
      [key("/repo", "Bad_ID")]: T1,
      [key("/repo", "")]: T1,
      [`/repo\u0000a\u0000b`]: T1,
      [key("/repo", "short")]: "2026-10-26",
      [key("/repo", "number")]: 5,
      [key("/repo", "month")]: "2026-13-01T00:00:00.000Z",
    } }));
    const store = createReviewStore(path, saved, clock(T2));
    expect(store.marker("/repo", "home")).toEqual({ since: T0, lastReviewedAt: T1 });
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T1 } });
  });

  test("prunes roots that are not saved when the file is first loaded", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T1, [key("/gone", "home")]: T1 } }));
    const store = createReviewStore(path, saved, clock(T2));
    expect(store.marker("/gone", "home")).toEqual({ since: T0 });
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T1 } });
  });

  test("a valid file that needs no change is not rewritten", () => {
    const path = file();
    const text = `${JSON.stringify({ v: 1, since: T0, canvases: { [key("/repo", "home")]: T1 } })}\n`;
    writeFileSync(path, text);
    const before = readdirSync(join(path, ".."));
    createReviewStore(path, saved, clock(T2)).marker("/repo", "home");
    expect(readFileSync(path, "utf8")).toBe(text);
    expect(readdirSync(join(path, ".."))).toEqual(before);
  });
});

describe("forget", () => {
  test("drops every entry of the given roots and keeps the others", () => {
    const path = file();
    const store = createReviewStore(path, saved, clock(T0));
    store.raise("/repo", "home", T1);
    store.raise("/repo", "settings", T1);
    store.raise("/other", "home", T2);
    store.forget(["/repo"]);
    expect(store.marker("/repo", "home")).toEqual({ since: T0 });
    expect(store.marker("/other", "home")).toEqual({ since: T0, lastReviewedAt: T2 });
    expect(onDisk(path)).toEqual({ v: 1, since: T0, canvases: { [key("/other", "home")]: T2 } });
  });

  test("a root that is a prefix of another is not touched", () => {
    const path = file();
    const store = createReviewStore(path, () => ["/repo", "/repo2"], clock(T0));
    store.raise("/repo2", "home", T1);
    store.forget(["/repo"]);
    expect(store.marker("/repo2", "home")).toEqual({ since: T0, lastReviewedAt: T1 });
  });
});

describe("requests", () => {
  test("a read names one root and one canvas id", () => {
    expect(parseReviewRead({ root: "/repo", canvas: "home" })).toEqual({ root: "/repo", canvas: "home" });
    for (const bad of [null, "x", {}, { root: "/repo" }, { root: "repo", canvas: "home" }, { root: "/repo", canvas: "Home" }, { root: "/re\u0000po", canvas: "home" },
      { root: "/repo", canvas: "home", more: 1 }, { root: 1, canvas: "home" }]) {
      expect(parseReviewRead(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  test("a raise adds one event-format time", () => {
    expect(parseReviewRaise({ root: "/repo", canvas: "home", at: T1 })).toEqual({ root: "/repo", canvas: "home", at: T1 });
    for (const bad of [{ root: "/repo", canvas: "home" }, { root: "/repo", canvas: "home", at: "2026-10-26" }, { root: "/repo", canvas: "home", at: 1 },
      { root: "/repo", canvas: "home", at: "2026-02-30T00:00:00.000Z" }, { root: "/repo", canvas: "home", at: T1, more: 1 }]) {
      expect(parseReviewRaise(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
