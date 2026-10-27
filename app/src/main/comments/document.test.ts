import { expect, test } from "vitest";
import { DocumentBindings } from "./document";
const record = { marker: "response-1", root: "/repo", path: ".doan/canvases/a.html", hash: "sha256:" + "a".repeat(64), complete: true, stable: true };
test("joins parent Network response and child frame commit and ignores fetch/HEAD and late loaders", () => {
  const bindings = new DocumentBindings();
  bindings.response(record);
  bindings.network({ type: "Document", requestId: "request", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "response-1" } } });
  bindings.finish("request", true);
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "loader1", url: "http://canvas" });
  expect(bindings.current("canvas", "http://canvas")?.hash).toBe(record.hash);
  bindings.network({ type: "Fetch", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "fetch" } } });
  expect(bindings.current("canvas", "http://canvas")?.hash).toBe(record.hash);
  bindings.start("canvas");
  expect(bindings.current("canvas", "http://canvas")).toBeNull();
  bindings.finish("request", true);
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "loader2", url: "http://canvas" });
  bindings.network({ type: "Document", requestId: "request", frameId: "canvas", loaderId: "loader1", response: { headers: { "X-Doan-Response": "response-1" } } });
  expect(bindings.current("canvas", "http://canvas")).toBeNull();
});
test("incomplete, unstable and aborted responses cannot authorize create; detach retires records", () => {
  for (const flags of [{ complete: false, stable: true }, { complete: true, stable: false }]) {
    const bindings = new DocumentBindings();
    bindings.response({ ...record, ...flags });
    bindings.network({ type: "Document", requestId: "request", frameId: "canvas", loaderId: "one", response: { headers: { "x-doan-response": "response-1" } } });
    bindings.finish("request", true);
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "one", url: "url" });
    expect(bindings.current("canvas", "url")).toBeNull();
    bindings.clear();
    expect(bindings.current("canvas", "url")).toBeNull();
  }
});

test("active response survives unrelated HTML traffic and retires on replacement or detach", () => {
  const bindings = new DocumentBindings();
  const bind = (loader: string, marker: string) => {
    bindings.network({ type: "Document", requestId: loader, frameId: "canvas", loaderId: loader, response: { headers: { "x-doan-response": marker } } });
    bindings.finish(loader, true);
    bindings.commit({ id: "canvas", parentId: "main", loaderId: loader, url: "url" });
  };
  bindings.response(record);
  bind("one", record.marker);
  for (let i = 0; i < 600; i++) bindings.response({ ...record, marker: `fetch-${i}` });
  expect(bindings.current("canvas", "url")?.hash).toBe(record.hash);
  // Inspect storage to enforce the resource bound, not only visible validity.
  const responses = (bindings as unknown as { responses: Map<string, unknown> }).responses;
  expect(responses.size).toBeLessThanOrEqual(257);
  bindings.response({ ...record, marker: "replacement", hash: "replacement-hash" });
  bind("two", "replacement");
  expect(bindings.current("canvas", "url")?.hash).toBe("replacement-hash");
  expect(responses.has(record.marker)).toBe(false);
  bindings.start("canvas");
  expect(bindings.current("canvas", "url")).toBeNull();
  expect(responses.has("replacement")).toBe(false);
  for (let i = 0; i < 600; i++) bindings.response({ ...record, marker: `later-${i}` });
  expect(responses.size).toBeLessThanOrEqual(256);
  bindings.clear();
  expect(responses.size).toBe(0);
});

test("active loader survives other document traffic and late server completion still joins", () => {
  const bindings = new DocumentBindings();
  bindings.network({ type: "Document", requestId: "first", frameId: "canvas", loaderId: "active", response: { headers: { "x-doan-response": record.marker } } });
  bindings.commit({ id: "canvas", parentId: "main", loaderId: "active", url: "url" });
  bindings.finish("first", true);
  for (let i = 0; i < 600; i++) {
    bindings.network({ type: "Document", requestId: `r-${i}`, frameId: `f-${i}`, loaderId: `l-${i}`, response: { headers: { "x-doan-response": `m-${i}` } } });
    bindings.finish(`r-${i}`, true);
    bindings.response({ ...record, marker: `m-${i}` });
  }
  bindings.response(record);
  expect(bindings.current("canvas", "url")?.generation).toBe("active");
  bindings.response({ ...record, complete: false });
  expect(bindings.current("canvas", "url")).toBeNull();
  bindings.response(record);
  expect(bindings.current("canvas", "url")?.hash).toBe(record.hash);
  bindings.finish("first", false);
  expect(bindings.current("canvas", "url")).toBeNull();
});
