import { afterEach, expect, it, vi } from "vitest";
// Records every path attachments.ts opens, so a test can show a file was never opened.
const { opened } = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, openSync: (...args: Parameters<typeof fs.openSync>) => { opened.push(String(args[0])); return fs.openSync(...args); } };
});
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttachmentStore, cleanupTargets, imageType, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, type AttachmentResult, type ImageCodec } from "./attachments";
import { senderAllowed } from "./senderAllowed";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const paths: string[] = []; afterEach(() => paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture(codec: Partial<ImageCodec> = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "doan-attach-"))); paths.push(base);
  const files = join(base, "my files"), dir = join(base, "userData", "attachments"); mkdirSync(files);
  const thumbnail = vi.fn((_bytes: Uint8Array) => new Uint8Array([1, 2, 3])), reencode = vi.fn((bytes: Uint8Array) => new Uint8Array([...PNG, bytes.length & 0xff]));
  const store = new AttachmentStore(dir, { thumbnail, reencode, ...codec });
  return { base, files, dir, store, thumbnail, reencode };
}
function ok(result: AttachmentResult | undefined) { if (!result?.ok) throw new Error(`refused: ${JSON.stringify(result)}`); return result.attachment; }

it("recognises image signatures, not names", () => {
  expect(imageType(PNG)).toBe("image/png");
  expect(imageType(JPEG)).toBe("image/jpeg");
  expect(imageType(Buffer.from("GIF89a"))).toBe("image/gif");
  expect(imageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  expect(imageType(Buffer.from("hello world"))).toBeNull();
});
it("takes a local file by its real path without copying or changing it, with a thumbnail only for images", () => {
  const f = fixture();
  const image = join(f.files, "shot.png"), text = join(f.files, "notes.txt"), link = join(f.files, "alias.png");
  writeFileSync(image, PNG); writeFileSync(text, "hello"); symlinkSync(image, link);
  const before = statSync(image);
  const [a, b, c] = f.store.addPaths({ paths: [image, text, link] })!;
  expect(ok(a)).toMatchObject({ name: "shot.png", size: PNG.length, kind: "image", path: image, pasted: false, thumbnail: new Uint8Array([1, 2, 3]) });
  expect(ok(b)).toMatchObject({ name: "notes.txt", size: 5, kind: "file", path: text, pasted: false });
  expect(ok(b).thumbnail).toBeUndefined();
  // A link is resolved to the file it names.
  expect(ok(c)).toMatchObject({ name: "shot.png", path: image });
  expect(readFileSync(image)).toEqual(PNG); expect(statSync(image).mtimeMs).toBe(before.mtimeMs);
  expect(existsSync(f.dir)).toBe(false);
});
it("refuses folders, special files, missing paths and image names without an image signature, one by one", () => {
  const f = fixture();
  const fake = join(f.files, "fake.png"), fifo = join(f.files, "pipe"), good = join(f.files, "a.txt");
  writeFileSync(fake, "not an image"); writeFileSync(good, "a"); execFileSync("mkfifo", [fifo]);
  const results = f.store.addPaths({ paths: [f.files, fifo, join(f.files, "gone.txt"), fake, good] })!;
  expect(results.map(r => r.ok ? "ok" : r.error)).toEqual(["not_file", "not_file", "not_found", "not_image", "ok"]);
  expect(f.thumbnail).not.toHaveBeenCalled();
});
it("does not decode an image above the cap for its thumbnail", () => {
  const f = fixture();
  const big = join(f.files, "big.png"); writeFileSync(big, PNG); truncateSync(big, MAX_IMAGE_BYTES + 1);
  expect(ok(f.store.addPaths({ paths: [big] })![0])).toMatchObject({ kind: "image", size: MAX_IMAGE_BYTES + 1 });
  expect(f.thumbnail).not.toHaveBeenCalled();
});
it("refuses only the files over the per-request count", () => {
  const f = fixture();
  const list = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, i) => { const p = join(f.files, `${i}.txt`); writeFileSync(p, "x"); return p; });
  const results = f.store.addPaths({ paths: list })!;
  expect(results.filter(r => r.ok)).toHaveLength(MAX_ATTACHMENTS);
  expect(results.slice(MAX_ATTACHMENTS).map(r => !r.ok && r.error)).toEqual(["limit", "limit"]);
  expect(f.store.resolve(results.filter(r => r.ok).map(r => ({ id: ok(r).id }))).ok).toBe(true);
});
it.each([null, {}, { paths: [] }, { paths: ["relative.txt"] }, { paths: [1] }, { paths: ["/a"], extra: 1 }, { paths: Array.from({ length: 65 }, (_, i) => `/f${i}`) }])(
  "refuses a malformed add request %j", value => { expect(fixture().store.addPaths(value)).toBeNull(); });
it("re-encodes a pasted image to PNG under userData and refuses oversized or non-image bytes before decoding", () => {
  const f = fixture();
  const pasted = ok(f.store.addPasted({ bytes: new Uint8Array(JPEG) }));
  expect(pasted).toMatchObject({ kind: "image", pasted: true });
  expect(pasted.name).toMatch(/^pasted-.*\.png$/);
  expect(pasted.path.startsWith(realpathSync(f.dir))).toBe(true);
  expect(imageType(readFileSync(pasted.path))).toBe("image/png");
  expect(f.reencode).toHaveBeenCalledOnce();
  expect(f.store.addPasted({ bytes: new Uint8Array(Buffer.from("plain text")) })).toEqual({ ok: false, name: "Pasted image", error: "not_image" });
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1); big.set(PNG);
  expect(f.store.addPasted({ bytes: big })).toEqual({ ok: false, name: "Pasted image", error: "too_large" });
  expect(f.store.addPasted({ bytes: "x" })).toEqual({ ok: false, name: "Pasted image", error: "not_image" });
  expect(f.reencode).toHaveBeenCalledOnce();
  expect(fixture({ reencode: () => null }).store.addPasted({ bytes: new Uint8Array(PNG) })).toEqual({ ok: false, name: "Pasted image", error: "not_image" });
});
it("deletes a pasted image removed before sending and only forgets a local file", () => {
  const f = fixture();
  const local = join(f.files, "a.txt"); writeFileSync(local, "a");
  const file = ok(f.store.addPaths({ paths: [local] })![0]), pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  expect(f.store.remove({ id: file.id })).toBe(true); expect(existsSync(local)).toBe(true);
  expect(f.store.remove({ id: pasted.id })).toBe(true); expect(existsSync(pasted.path)).toBe(false);
  expect(f.store.remove({ id: pasted.id })).toBe(false);
  expect(f.store.resolve([{ id: file.id }])).toEqual({ ok: false, error: "attachment_missing", missing: [file.id] });
});
it("rechecks every file at send time and names the ones moved or deleted since", () => {
  const f = fixture();
  const a = join(f.files, "a.txt"), b = join(f.files, "b.txt"), img = join(f.files, "c.png"); writeFileSync(a, "a"); writeFileSync(b, "b"); writeFileSync(img, PNG);
  const [ra, rb, rc] = f.store.addPaths({ paths: [a, b, img] })!.map(ok);
  expect(f.store.resolve([{ id: ra!.id }, { id: rb!.id }, { id: rc!.id }])).toEqual({ ok: true, records: [
    { name: "a.txt", size: 1, kind: "file", path: a }, { name: "b.txt", size: 1, kind: "file", path: b }, { name: "c.png", size: PNG.length, kind: "image", path: img }] });
  unlinkSync(a); renameSync(b, join(f.files, "moved.txt")); writeFileSync(img, "no longer an image");
  expect(f.store.resolve([{ id: ra!.id }, { id: rb!.id }, { id: rc!.id }])).toEqual({ ok: false, error: "attachment_missing", missing: [ra!.id, rb!.id, rc!.id] });
  expect(f.store.resolve([{ id: "unknown" }])).toEqual({ ok: false, error: "attachment_missing", missing: ["unknown"] });
});
it.each(["x", [{ id: 1 }], [{ id: "x", path: "/etc/passwd" }], [{ id: "x" }, { id: "x" }], Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({ id: `${i}` }))])(
  "refuses a malformed attachment list %j", value => { expect(fixture().store.resolve(value)).toEqual({ ok: false, error: "bad_request" }); });
it("keeps a sent paste through the next launch's cleanup and removes only unsent paste directories", () => {
  const f = fixture();
  const sent = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) })), unsent = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  f.store.markSent([{ id: sent.id }]); f.store.consume([{ id: sent.id }]);
  const stray = join(f.dir, "not-an-id"); mkdirSync(stray); writeFileSync(join(f.dir, "note.txt"), "x");
  new AttachmentStore(f.dir, { thumbnail: () => null, reencode: () => null }).cleanup();
  expect(existsSync(sent.path)).toBe(true);
  expect(existsSync(unsent.path)).toBe(false);
  expect(existsSync(stray)).toBe(true); expect(existsSync(join(f.dir, "note.txt"))).toBe(true);
  // A consumed attachment is no longer the draft's: a second start cannot reuse it.
  expect(f.store.resolve([{ id: sent.id }])).toMatchObject({ ok: false, error: "attachment_missing" });
});
it("selects cleanup targets by the sent marker alone", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e", other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  expect(cleanupTargets([{ name: id, directory: true, sent: false }, { name: other, directory: true, sent: true }, { name: "x", directory: true, sent: false }, { name: id, directory: false, sent: false }])).toEqual([id]);
});
it("keeps the attachment channels to the main window", () => {
  for (const channel of ["attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove"]) {
    expect(senderAllowed(channel, "main")).toBe(true);
    expect(senderAllowed(channel, "settings")).toBe(false);
  }
});
it("refuses a sparse path list as IPC delivers it", () => {
  const f = fixture(); const local = join(f.files, "a.txt"); writeFileSync(local, "a");
  // eslint-disable-next-line no-sparse-arrays
  expect(f.store.addPaths(structuredClone({ paths: [local, , local] }))).toBeNull();
});
it("deletes a paste marked sent by a start that was then refused, once its chip is removed", () => {
  const f = fixture();
  const pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  f.store.markSent([{ id: pasted.id }]);
  expect(f.store.remove({ id: pasted.id })).toBe(true);
  expect(existsSync(pasted.path)).toBe(false);
});
it("refuses a path swapped to a link elsewhere without opening the other file", () => {
  const f = fixture();
  const chosen = join(f.files, "a.txt"), secret = join(f.base, "secret.txt"); writeFileSync(chosen, "a"); writeFileSync(secret, "secret");
  const added = ok(f.store.addPaths({ paths: [chosen] })![0]);
  unlinkSync(chosen); symlinkSync(secret, chosen);
  opened.length = 0;
  expect(f.store.resolve([{ id: added.id }])).toEqual({ ok: false, error: "attachment_missing", missing: [added.id] });
  expect(opened).not.toContain(secret);
});
it("refuses a file replaced in place at the same path", () => {
  const f = fixture();
  const chosen = join(f.files, "a.txt"), other = join(f.files, "other.txt"); writeFileSync(chosen, "a"); writeFileSync(other, "b");
  const added = ok(f.store.addPaths({ paths: [chosen] })![0]);
  renameSync(other, chosen);
  expect(f.store.resolve([{ id: added.id }])).toEqual({ ok: false, error: "attachment_missing", missing: [added.id] });
});
it("decodes the thumbnail from the bytes it checked, never by opening the path again", () => {
  const f = fixture();
  const image = join(f.files, "shot.png"); writeFileSync(image, PNG);
  opened.length = 0;
  ok(f.store.addPaths({ paths: [image] })![0]);
  expect(Buffer.from(f.thumbnail.mock.calls[0]![0])).toEqual(PNG);
  expect(opened.filter(p => p === image)).toHaveLength(1);
});
