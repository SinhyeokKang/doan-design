import { expect, test } from "vitest";
import { DocumentBindings } from "./document";
const record = { marker: "response-1", root: "/repo", path: "design/a.html", hash: "sha256:" + "a".repeat(64), complete: true, stable: true };
test("joins parent Network response and child frame commit and ignores fetch/HEAD and late loaders", () => {
  const bindings = new DocumentBindings();
  bindings.response(record);
  bindings.network({ type: "Document", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "response-1" } } });
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "loader1", url: "http://canvas" });
  expect(bindings.current("canvas", "http://canvas")?.hash).toBe(record.hash);
  bindings.network({ type: "Fetch", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "fetch" } } });
  expect(bindings.current("canvas", "http://canvas")?.hash).toBe(record.hash);
  bindings.start("canvas");
  expect(bindings.current("canvas", "http://canvas")).toBeNull();
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "loader2", url: "http://canvas" });
  bindings.network({ type: "Document", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "response-1" } } });
  expect(bindings.current("canvas", "http://canvas")).toBeNull();
});
test("incomplete, unstable and aborted responses cannot authorize create; detach retires records", () => {
  for (const flags of [{ complete: false, stable: true }, { complete: true, stable: false }]) {
    const bindings = new DocumentBindings();
    bindings.response({ ...record, ...flags });
    bindings.network({ type: "Document", frameId: "canvas", loaderId: "one", response: { headers: { "x-doan-response": "response-1" } } });
    bindings.commit({ id: "canvas", parentId: "main", loaderId: "one", url: "url" });
    expect(bindings.current("canvas", "url")).toBeNull();
    bindings.clear();
    expect(bindings.current("canvas", "url")).toBeNull();
  }
});
