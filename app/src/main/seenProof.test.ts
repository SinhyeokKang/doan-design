import { expect, test } from "vitest";
import { DocumentBindings, type ResponseRecord } from "./document/bindings";
import { shownDocument } from "./seenProof";

const ROOT = "/repo", PATH = ".doan/canvases/a.html", URL = "http://127.0.0.1:1/t/x/k/.doan/canvases/a.html";
const hash = (c: string) => `sha256:${c.repeat(64)}`;
const response = (marker: string, c: string, patch: Partial<ResponseRecord> = {}): ResponseRecord => ({ marker, root: ROOT, path: PATH, hash: hash(c), complete: true, stable: true, ...patch });
// A canvas document loaded in `frame` under `parent` by `loader`, its response recorded with `marker`.
function load(bindings: DocumentBindings, frame: string, loader: string, marker: string, parent = "main", url = URL) {
  bindings.network({ type: "Document", requestId: loader, frameId: frame, loaderId: loader, response: { headers: { "x-doan-response": marker } } });
  bindings.finish(loader, true);
  bindings.commit({ id: frame, parentId: parent, loaderId: loader, url });
}
const proof = (bindings: DocumentBindings, target = { url: URL, root: ROOT, path: PATH }) =>
  shownDocument(bindings.frames(), (frame, url) => bindings.current(frame, url), "main", target)?.hash ?? null;

test("the canvas iframe's finished, complete and stable document proves the bytes it showed", () => {
  const bindings = new DocumentBindings();
  bindings.response(response("m1", "a"));
  load(bindings, "canvas", "l1", "m1");
  expect(proof(bindings)).toBe(hash("a"));
});

test("a frame that is not a direct child of the main frame, or shows another URL, root or path, proves nothing", () => {
  const nested = new DocumentBindings();
  nested.response(response("m1", "a"));
  load(nested, "canvas", "l1", "m1", "prototype-frame");
  expect(proof(nested)).toBeNull();
  const other = new DocumentBindings();
  other.response(response("m1", "a"));
  load(other, "canvas", "l1", "m1", "main", `${URL}?x`);
  expect(proof(other)).toBeNull();
  const bindings = new DocumentBindings();
  bindings.response(response("m1", "a", { root: "/elsewhere" }));
  load(bindings, "canvas", "l1", "m1");
  expect(proof(bindings)).toBeNull();
  expect(proof(bindings, { url: URL, root: "/elsewhere", path: ".doan/canvases/b.html" })).toBeNull();
});

test("while a reload swaps the iframe two frames match and nothing is proven until the old one detaches", () => {
  const bindings = new DocumentBindings();
  bindings.response(response("m1", "a"));
  load(bindings, "old", "l1", "m1");
  bindings.response(response("m2", "b"));
  load(bindings, "new", "l2", "m2");
  expect(proof(bindings)).toBeNull();
  bindings.start("old");
  expect(proof(bindings)).toBe(hash("b"));
});

test("a completion recorded after the loader finished proves the document from then on, and the change hook says so", () => {
  const bindings = new DocumentBindings();
  let changes = 0;
  const stop = bindings.onChange(() => { changes++; });
  bindings.response(response("m1", "a", { complete: false }));
  load(bindings, "canvas", "l1", "m1");
  expect(proof(bindings)).toBeNull();
  const before = changes;
  bindings.response(response("m1", "a"));
  expect(changes).toBeGreaterThan(before);
  expect(proof(bindings)).toBe(hash("a"));
  stop();
  bindings.clear();
  expect(changes).toBe(before + 1);
});

test("an unstable or aborted response, or a response no main-window loader bound (a thumbnail), proves nothing", () => {
  const unstable = new DocumentBindings();
  unstable.response(response("m1", "a", { stable: false }));
  load(unstable, "canvas", "l1", "m1");
  expect(proof(unstable)).toBeNull();
  const aborted = new DocumentBindings();
  aborted.response(response("m1", "a"));
  aborted.network({ type: "Document", requestId: "l1", frameId: "canvas", loaderId: "l1", response: { headers: { "x-doan-response": "m1" } } });
  aborted.commit({ id: "canvas", parentId: "main", loaderId: "l1", url: URL });
  aborted.finish("l1", false);
  expect(proof(aborted)).toBeNull();
  // The capture window's request reaches the shared server, but its loader is never bound in the main window.
  const thumbnail = new DocumentBindings();
  thumbnail.response(response("m1", "a"));
  expect(proof(thumbnail)).toBeNull();
});

test("a screen showing A while the disk holds B proves A, never B", () => {
  const bindings = new DocumentBindings();
  bindings.response(response("m1", "a"));
  load(bindings, "canvas", "l1", "m1");
  // The file changed to B after A was sent; no new document has loaded yet.
  expect(proof(bindings)).toBe(hash("a"));
  expect(proof(bindings)).not.toBe(hash("b"));
});
