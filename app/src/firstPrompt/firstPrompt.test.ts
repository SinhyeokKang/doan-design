import { describe, expect, test } from "vitest";
import { arrival, firstPromptReducer, type FirstPromptState } from "./firstPrompt";

const idle: FirstPromptState = { kind: "idle" };
const waiting: FirstPromptState = { kind: "waiting", root: "/code/acme", knownPaths: [".doan/canvases/a.html"] };

describe("arrival", () => {
  test("is null while no path is new", () => {
    expect(arrival([".doan/canvases/a.html"], [{ path: ".doan/canvases/a.html", mtimeMs: 5 }])).toBeNull();
    expect(arrival([], [])).toBeNull();
  });
  test("a path absent at Copy time arrives, also in a project that already has canvases", () => {
    expect(arrival([".doan/canvases/a.html"], [{ path: ".doan/canvases/a.html", mtimeMs: 5 }, { path: ".doan/canvases/b.html", mtimeMs: 9 }])).toBe(".doan/canvases/b.html");
    expect(arrival([], [{ path: ".doan/canvases/a.html" }])).toBe(".doan/canvases/a.html");
  });
  test("several new paths open the one with the largest mtime", () => {
    expect(arrival([".doan/canvases/a.html"], [{ path: ".doan/canvases/b.html", mtimeMs: 7 }, { path: ".doan/canvases/c.html", mtimeMs: 9 }, { path: ".doan/canvases/d.html", mtimeMs: 8 }])).toBe(".doan/canvases/c.html");
  });
  test("a new path without an mtime loses to one with an mtime, and ties keep the listed order", () => {
    expect(arrival([], [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html", mtimeMs: 1 }])).toBe(".doan/canvases/b.html");
    expect(arrival([], [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }])).toBe(".doan/canvases/a.html");
    expect(arrival([], [{ path: ".doan/canvases/a.html", mtimeMs: 3 }, { path: ".doan/canvases/b.html", mtimeMs: 3 }])).toBe(".doan/canvases/a.html");
  });
  test("a canvas that was known and changed is not an arrival", () => {
    expect(arrival([".doan/canvases/a.html"], [{ path: ".doan/canvases/a.html", mtimeMs: 99 }])).toBeNull();
  });
});

describe("firstPromptReducer", () => {
  test("a successful copy starts waiting with the paths known at that moment", () => {
    expect(firstPromptReducer(idle, { type: "copied", root: "/code/acme", knownPaths: [".doan/canvases/a.html"] })).toEqual(waiting);
  });
  test("a new path in the same root arrives, the newest first", () => {
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/acme", rows: [{ path: ".doan/canvases/a.html", mtimeMs: 1 }, { path: ".doan/canvases/b.html", mtimeMs: 2 }, { path: ".doan/canvases/c.html", mtimeMs: 3 }] }))
      .toEqual({ kind: "arrived", root: "/code/acme", path: ".doan/canvases/c.html" });
  });
  test("a listing with nothing new, or for another root, keeps waiting", () => {
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/acme", rows: [{ path: ".doan/canvases/a.html", mtimeMs: 1 }] })).toBe(waiting);
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/other", rows: [{ path: ".doan/canvases/z.html", mtimeMs: 1 }] })).toBe(waiting);
  });
  test("editing the input does not cancel the wait", () => {
    expect(firstPromptReducer(waiting, { type: "edited" })).toBe(waiting);
    expect(firstPromptReducer(idle, { type: "edited" })).toBe(idle);
  });
  test("removing the root cancels; removing another root does not", () => {
    expect(firstPromptReducer(waiting, { type: "removed", root: "/code/acme" })).toEqual(idle);
    expect(firstPromptReducer(waiting, { type: "removed", root: "/code/other" })).toBe(waiting);
    expect(firstPromptReducer({ kind: "arrived", root: "/code/acme", path: ".doan/canvases/b.html" }, { type: "removed", root: "/code/acme" })).toEqual(idle);
  });
  test("nothing arrives without a copy", () => {
    expect(firstPromptReducer(idle, { type: "listed", root: "/code/acme", rows: [{ path: ".doan/canvases/a.html" }] })).toBe(idle);
    expect(firstPromptReducer(idle, { type: "removed", root: "/code/acme" })).toBe(idle);
  });
  test("an arrived state stays until the next copy or dismiss", () => {
    const arrived: FirstPromptState = { kind: "arrived", root: "/code/acme", path: ".doan/canvases/b.html" };
    expect(firstPromptReducer(arrived, { type: "listed", root: "/code/acme", rows: [{ path: ".doan/canvases/c.html", mtimeMs: 9 }] })).toBe(arrived);
    expect(firstPromptReducer(arrived, { type: "copied", root: "/code/acme", knownPaths: [".doan/canvases/a.html", ".doan/canvases/b.html"] }))
      .toEqual({ kind: "waiting", root: "/code/acme", knownPaths: [".doan/canvases/a.html", ".doan/canvases/b.html"] });
    expect(firstPromptReducer(arrived, { type: "dismissed" })).toEqual(idle);
  });
  test("a second copy while waiting replaces the known paths", () => {
    expect(firstPromptReducer(waiting, { type: "copied", root: "/code/acme", knownPaths: [".doan/canvases/a.html", ".doan/canvases/b.html"] }))
      .toEqual({ kind: "waiting", root: "/code/acme", knownPaths: [".doan/canvases/a.html", ".doan/canvases/b.html"] });
  });
});
