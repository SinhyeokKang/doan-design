import assert from "node:assert/strict";
import { test } from "node:test";
import { handoffsForCanvases } from "./handoff.ts";
import { contentHash } from "./work.ts";
import type { HandoffExchange } from "./types.ts";

const paths = [".doan/canvases/profile.html", ".doan/canvases/billing.html"];
const read = (path: string) => paths.includes(path) ? `<p>${path}</p>` : null;
const request = (path: string, hash = contentHash(read(path)), text = "Continue with tap targets."): HandoffExchange => ({
  request: { v: 5, root: "/r", handoff: "ab".repeat(32), path, text },
  response: { v: 5, ok: true, requested: true }, at: "", hashes: { [path]: hash },
});
const failed = (log: HandoffExchange[]) => handoffsForCanvases({ handoff: () => log, read }, paths).filter(c => !c.pass).map(c => c.id);

test("handoffsForCanvases accepts each new canvas after its final write, in either order", () => {
  assert.deepEqual(failed(paths.map(path => request(path))), []);
  assert.deepEqual(failed([...paths].reverse().map(path => request(path))), []);
});
test("handoffsForCanvases rejects missing, duplicate, extra and wrong targets", () => {
  const count = ["handoff_each_canvas_once"];
  // With nothing accepted there is nothing to judge per request: the count check alone reports it.
  for (const [log, ids] of [
    [[], count],
    [[request(paths[0]!)], count],
    [[request(paths[0]!), request(paths[0]!)], count],
    [[...paths.map(path => request(path)), request(paths[0]!)], count],
    [[request(paths[0]!), request(".doan/canvases/source.html")], [...count, "canvases_written_before_requests"]],
  ] as [HandoffExchange[], string[]][]) assert.deepEqual(failed(log), ids);
});
test("handoffsForCanvases reports a missing request only as a count failure", () => {
  assert.deepEqual(failed([]), ["handoff_each_canvas_once"]);
  for (const path of paths) assert.deepEqual(failed([request(path)]), ["handoff_each_canvas_once"]);
});
test("handoffsForCanvases counts accepted requests, never refused attempts or their messages", () => {
  const refused: HandoffExchange = { ...request(paths[0]!), response: { v: 5, ok: false, error: { code: "already_requested", message: "x" } }, hashes: {} };
  assert.deepEqual(failed([refused, ...paths.map(path => request(path)), refused]), []);
  assert.deepEqual(failed([refused, request(paths[1]!)]), ["handoff_each_canvas_once"]);
});
test("handoffsForCanvases rejects a missing canvas or an edit after either request", () => {
  for (const index of [0, 1]) for (const hash of [null, contentHash("earlier")]) {
    const log = paths.map(path => request(path));
    log[index] = request(paths[index]!, hash);
    assert.deepEqual(failed(log), ["canvases_written_before_requests"]);
  }
});
test("handoffsForCanvases requires a message for each target and exposes bounded excerpts", () => {
  for (const index of [0, 1]) {
    const log = paths.map(path => request(path));
    log[index] = request(paths[index]!, undefined, " \n ");
    assert.deepEqual(failed(log), ["handoff_messages_not_empty"]);
  }
  const checks = handoffsForCanvases({ handoff: () => paths.map(path => request(path, undefined, "Continue: " + "x".repeat(400))), read }, paths);
  const detail = checks.find(c => c.id === "handoff_messages_not_empty")!.detail;
  assert.ok(detail.includes("Continue:"));
  assert.ok(!detail.includes("x".repeat(300)));
});
