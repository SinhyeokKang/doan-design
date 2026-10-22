import { describe, expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { canvasName, projectNames, projectRow } from "./projectRow";

describe("projectRow", () => {
  test("separates reading and empty hints from status chips", () => {
    expect(projectRow({ path: "/repo", kind: "loading" })).toEqual({ hint: "Reading…", actions: ["close"] });
    expect(projectRow({ path: "/repo", kind: "list", servedRev: 0, canvases: [] })).toEqual({ hint: "No canvases", actions: ["close"] });
    expect(projectRow({ path: "/repo", kind: "list", servedRev: 0, canvases: [{ path: "design/a.html", url: "url", open: 0, resolved: 0 }] })).toEqual({ actions: ["close"] });
  });

  test("matches the draft's initialization and error copy", () => {
    expect(projectRow({ path: "/repo", kind: "uninitialized" })).toEqual({ status: "Not initialized", detail: ["Run in a terminal: ", { code: "doan init" }], actions: ["close"] });
    expect(projectRow({ path: "/repo", kind: "error", message: "Cannot read config" })).toEqual({ status: "Error", detail: ["Cannot read config"], actions: ["close"] });
  });

  test("offers reopen only for missing projects and CLI errors", () => {
    expect(projectRow({ path: "/repo", kind: "notFound" })).toEqual({ status: "Not found", detail: ["/repo is gone or moved. Restore it and Reopen, or Close it."], actions: ["reopen", "close"] });
    expect(projectRow({ path: "/repo", kind: "cliError", reason: "timed out after 10 s" })).toEqual({ status: "CLI error", detail: ["Timed out after 10 s"], actions: ["reopen", "close"] });
    expect(projectRow({ path: "/repo", kind: "cliError", reason: "spawn doan ENOENT" }).detail).toEqual(["Spawn doan ENOENT"]);
    expect(projectRow({ path: "/repo", kind: "cliError", reason: "" })).toEqual({ status: "CLI error", actions: ["reopen", "close"] });
    const entries: FolderEntry[] = [
      { path: "/repo", kind: "loading" }, { path: "/repo", kind: "uninitialized" },
      { path: "/repo", kind: "error", message: "bad" }, { path: "/repo", kind: "list", servedRev: 0, canvases: [] },
    ];
    for (const entry of entries) expect(projectRow(entry).actions).not.toContain("reopen");
  });
});

describe("projectNames", () => {
  test("keeps unique basenames", () => {
    expect([...projectNames(["/code/a", "/code/b"]).values()]).toEqual(["a", "b"]);
    expect(projectNames([]).size).toBe(0);
  });
  test("adds the parent to two or more colliding basenames", () => {
    expect([...projectNames(["/app/doan", "/web/doan"]).values()]).toEqual(["app/doan", "web/doan"]);
    expect([...projectNames(["/app/doan", "/web/doan", "/cli/doan", "/code/other"]).values()]).toEqual(["app/doan", "web/doan", "cli/doan", "other"]);
  });
});

test("canvasName keeps subfolders relative to design", () => {
  expect(canvasName("design/login.html")).toBe("login.html");
  expect(canvasName("design/a/login.html")).toBe("a/login.html");
});
