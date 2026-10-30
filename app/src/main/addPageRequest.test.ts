import { describe, expect, test } from "vitest";
import { addPageRequest } from "./addPageRequest";

const ids = { sessionId: "s-1", requestId: "r-1" };
const URL = "https://github.com/acme/studio";
const long = `/${"a".repeat(4096)}`;

describe("addPageRequest", () => {
  test("read: the current state, or one session's operation", () => {
    expect(addPageRequest("read", {})).toEqual({ op: "read" });
    expect(addPageRequest("read", { sessionId: "s-1" })).toEqual({ v: 2, token: "", op: "status", sessionId: "s-1" });
    expect(addPageRequest("read", { sessionId: "s-1", operationId: "o-1" })).toEqual({ v: 2, token: "", op: "status", sessionId: "s-1", operationId: "o-1" });
  });

  test("inspect: a folder, a folder of a repository, a repository and its planned clone", () => {
    expect(addPageRequest("inspect", { ...ids, path: "/work/studio" })).toEqual({ v: 2, token: "", op: "project_inspect", ...ids, path: "/work/studio" });
    expect(addPageRequest("inspect", { ...ids, path: "/work/studio", url: URL })).toEqual({ v: 2, token: "", op: "project_inspect", ...ids, path: "/work/studio", url: URL });
    expect(addPageRequest("inspect", { ...ids, url: URL })).toEqual({ v: 2, token: "", op: "project_inspect", ...ids, url: URL });
    expect(addPageRequest("inspect", { ...ids, url: URL, destination: "/work/studio" })).toEqual({ v: 2, token: "", op: "project_inspect", ...ids, url: URL, destination: "/work/studio" });
  });

  test("select, clone and cancel", () => {
    expect(addPageRequest("select", { ...ids, inspectionId: "i-1", path: "/work/studio" })).toEqual({ v: 2, token: "", op: "project_select", ...ids, inspectionId: "i-1", path: "/work/studio" });
    expect(addPageRequest("select", { ...ids, inspectionId: "i-1", path: "/work/studio", initialize: true })).toMatchObject({ op: "project_select", initialize: true });
    expect(addPageRequest("clone", { ...ids, inspectionId: "i-1", destination: "/work/studio" })).toEqual({ v: 2, token: "", op: "project_clone", ...ids, inspectionId: "i-1", destination: "/work/studio" });
    expect(addPageRequest("cancel", { ...ids, operationId: "o-1" })).toEqual({ v: 2, token: "", op: "cancel", ...ids, operationId: "o-1" });
  });

  test("refuses unknown keys, including the socket's own", () => {
    for (const [op, value] of [
      ["read", { more: 1 }], ["read", { sessionId: "s-1", requestId: "r-1" }],
      ["inspect", { ...ids, path: "/a", more: 1 }], ["inspect", { ...ids, path: "/a", v: 2 }], ["inspect", { ...ids, path: "/a", token: "t" }], ["inspect", { ...ids, path: "/a", op: "project_select" }],
      ["select", { ...ids, inspectionId: "i", path: "/a", force: true }], ["clone", { ...ids, inspectionId: "i", destination: "/a", url: URL }],
      ["cancel", { ...ids, operationId: "o", provider: "claude" }],
    ] as const) expect(addPageRequest(op, value), JSON.stringify([op, value])).toBeNull();
  });

  test("refuses values that are not the right type or shape", () => {
    for (const [op, value] of [
      ["read", undefined], ["read", null], ["read", "s-1"], ["read", []], ["inspect", [ids]],
      ["inspect", { ...ids, path: 1 }], ["inspect", { ...ids, path: ["/a"] }], ["inspect", { sessionId: 1, requestId: "r", path: "/a" }],
      ["inspect", { ...ids }], ["inspect", { ...ids, path: "/a", destination: "/b" }],
      ["select", { ...ids, inspectionId: "i", path: "/a", initialize: "yes" }], ["select", { ...ids, path: "/a" }],
      ["clone", { ...ids, inspectionId: "i" }], ["cancel", { ...ids }], ["cancel", { ...ids, operationId: "" }],
      ["inspect", { ...ids, requestId: "r 1", path: "/a" }],
    ] as const) expect(addPageRequest(op, value), JSON.stringify([op, value])).toBeNull();
  });

  test("paths are absolute", () => {
    for (const path of ["work/studio", "./studio", "~/studio", ""]) {
      expect(addPageRequest("inspect", { ...ids, path }), path).toBeNull();
      expect(addPageRequest("select", { ...ids, inspectionId: "i", path }), path).toBeNull();
      expect(addPageRequest("clone", { ...ids, inspectionId: "i", destination: path }), path).toBeNull();
      expect(addPageRequest("inspect", { ...ids, url: URL, destination: path }), path).toBeNull();
    }
  });

  test("no string is longer than 4096 characters", () => {
    expect(addPageRequest("inspect", { ...ids, path: long.slice(0, 4096) })).not.toBeNull();
    expect(addPageRequest("inspect", { ...ids, path: long })).toBeNull();
    expect(addPageRequest("select", { ...ids, inspectionId: "i", path: long })).toBeNull();
    expect(addPageRequest("clone", { ...ids, inspectionId: "i", destination: long })).toBeNull();
    expect(addPageRequest("inspect", { ...ids, url: URL, destination: long })).toBeNull();
  });

  test("a URL must be a GitHub repository URL", () => {
    for (const url of ["", "studio", "https://gitlab.com/acme/studio", "https://github.com/acme", "file:///work/studio", `${URL}/${"x".repeat(4096)}`]) {
      expect(addPageRequest("inspect", { ...ids, url }), url).toBeNull();
      expect(addPageRequest("inspect", { ...ids, path: "/a", url }), url).toBeNull();
    }
    expect(addPageRequest("inspect", { ...ids, url: "git@github.com:acme/studio.git" })).not.toBeNull();
  });
});
