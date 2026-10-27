import { describe, expect, test } from "vitest";
import { arrival, firstPromptReducer, type FirstPromptState } from "./firstPrompt";

const idle: FirstPromptState = { kind: "idle" };
const waiting: FirstPromptState = { kind: "waiting", root: "/code/acme", knownPaths: ["doan/a.html"] };

describe("arrival", () => {
  test("is null while no path is new", () => {
    expect(arrival(["doan/a.html"], [{ path: "doan/a.html", mtimeMs: 5 }])).toBeNull();
    expect(arrival([], [])).toBeNull();
  });
  test("a path absent at Copy time arrives, also in a project that already has canvases", () => {
    expect(arrival(["doan/a.html"], [{ path: "doan/a.html", mtimeMs: 5 }, { path: "doan/b.html", mtimeMs: 9 }])).toBe("doan/b.html");
    expect(arrival([], [{ path: "doan/a.html" }])).toBe("doan/a.html");
  });
  test("several new paths open the one with the largest mtime", () => {
    expect(arrival(["doan/a.html"], [{ path: "doan/b.html", mtimeMs: 7 }, { path: "doan/c.html", mtimeMs: 9 }, { path: "doan/d.html", mtimeMs: 8 }])).toBe("doan/c.html");
  });
  test("a new path without an mtime loses to one with an mtime, and ties keep the listed order", () => {
    expect(arrival([], [{ path: "doan/a.html" }, { path: "doan/b.html", mtimeMs: 1 }])).toBe("doan/b.html");
    expect(arrival([], [{ path: "doan/a.html" }, { path: "doan/b.html" }])).toBe("doan/a.html");
    expect(arrival([], [{ path: "doan/a.html", mtimeMs: 3 }, { path: "doan/b.html", mtimeMs: 3 }])).toBe("doan/a.html");
  });
  test("a canvas that was known and changed is not an arrival", () => {
    expect(arrival(["doan/a.html"], [{ path: "doan/a.html", mtimeMs: 99 }])).toBeNull();
  });
});

describe("firstPromptReducer", () => {
  test("a successful copy starts waiting with the paths known at that moment", () => {
    expect(firstPromptReducer(idle, { type: "copied", root: "/code/acme", knownPaths: ["doan/a.html"] })).toEqual(waiting);
  });
  test("a new path in the same root arrives, the newest first", () => {
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/acme", rows: [{ path: "doan/a.html", mtimeMs: 1 }, { path: "doan/b.html", mtimeMs: 2 }, { path: "doan/c.html", mtimeMs: 3 }] }))
      .toEqual({ kind: "arrived", root: "/code/acme", path: "doan/c.html" });
  });
  test("a listing with nothing new, or for another root, keeps waiting", () => {
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/acme", rows: [{ path: "doan/a.html", mtimeMs: 1 }] })).toBe(waiting);
    expect(firstPromptReducer(waiting, { type: "listed", root: "/code/other", rows: [{ path: "doan/z.html", mtimeMs: 1 }] })).toBe(waiting);
  });
  test("editing the input does not cancel the wait", () => {
    expect(firstPromptReducer(waiting, { type: "edited" })).toBe(waiting);
    expect(firstPromptReducer(idle, { type: "edited" })).toBe(idle);
  });
  test("removing the root cancels; removing another root does not", () => {
    expect(firstPromptReducer(waiting, { type: "removed", root: "/code/acme" })).toEqual(idle);
    expect(firstPromptReducer(waiting, { type: "removed", root: "/code/other" })).toBe(waiting);
    expect(firstPromptReducer({ kind: "arrived", root: "/code/acme", path: "doan/b.html" }, { type: "removed", root: "/code/acme" })).toEqual(idle);
  });
  test("nothing arrives without a copy", () => {
    expect(firstPromptReducer(idle, { type: "listed", root: "/code/acme", rows: [{ path: "doan/a.html" }] })).toBe(idle);
    expect(firstPromptReducer(idle, { type: "removed", root: "/code/acme" })).toBe(idle);
  });
  test("an arrived state stays until the next copy or dismiss", () => {
    const arrived: FirstPromptState = { kind: "arrived", root: "/code/acme", path: "doan/b.html" };
    expect(firstPromptReducer(arrived, { type: "listed", root: "/code/acme", rows: [{ path: "doan/c.html", mtimeMs: 9 }] })).toBe(arrived);
    expect(firstPromptReducer(arrived, { type: "copied", root: "/code/acme", knownPaths: ["doan/a.html", "doan/b.html"] }))
      .toEqual({ kind: "waiting", root: "/code/acme", knownPaths: ["doan/a.html", "doan/b.html"] });
    expect(firstPromptReducer(arrived, { type: "dismissed" })).toEqual(idle);
  });
  test("a second copy while waiting replaces the known paths", () => {
    expect(firstPromptReducer(waiting, { type: "copied", root: "/code/acme", knownPaths: ["doan/a.html", "doan/b.html"] }))
      .toEqual({ kind: "waiting", root: "/code/acme", knownPaths: ["doan/a.html", "doan/b.html"] });
  });
});
