import { afterEach, expect, it, vi } from "vitest";
// Records every path attachments.ts opens, so a test can show a file was never opened. `fault` makes the save of a
// capture or paste fail at one step, only while a test sets it.
const { opened, fault } = vi.hoisted(() => ({ opened: [] as string[], fault: { step: null as null | "write" | "realpath" | "lstat" } }));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const broken = () => Object.assign(new Error("injected"), { code: "EIO" });
  return {
    ...fs,
    openSync: (...args: Parameters<typeof fs.openSync>) => { opened.push(String(args[0])); return fs.openSync(...args); },
    // A partial write: the file exists with its first byte, then the write fails.
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      if (fault.step !== "write") return fs.writeFileSync(...args);
      fs.writeFileSync(args[0], new Uint8Array(args[1] as Uint8Array).subarray(0, 1), args[2]); throw broken();
    },
    realpathSync: Object.assign((...args: Parameters<typeof fs.realpathSync>) => fs.realpathSync(...args), {
      native: (...args: Parameters<typeof fs.realpathSync.native>) => { if (fault.step === "realpath") throw broken(); return fs.realpathSync.native(...args); },
    }),
    lstatSync: (...args: Parameters<typeof fs.lstatSync>) => { if (fault.step === "lstat") throw broken(); return fs.lstatSync(...args); },
  };
});
import { existsSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttachmentStore, capturedName, captureRequest, cleanupTargets, imageType, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, type AttachmentResult, type ImageCodec } from "./attachments";
import { senderAllowed } from "./senderAllowed";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const paths: string[] = []; afterEach(() => { fault.step = null; paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
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

// buzz-home design §7.4 (2026-10-29 user): Edit on Home brings the last request's attachments back and checks them
// again at once, with the acceptance checks, on the paths main recorded for those ids only.
it("rechecks restored ids, including ones an accepted start consumed, and names the moved ones", () => {
  const f = fixture();
  const a = join(f.files, "a.txt"), b = join(f.files, "b.txt"); writeFileSync(a, "a"); writeFileSync(b, "b");
  const [ra, rb] = f.store.addPaths({ paths: [a, b] })!.map(ok);
  const pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  const sent = [{ id: ra!.id }, { id: rb!.id }, { id: pasted.id }];
  f.store.markSent(sent); f.store.consume(sent);
  unlinkSync(b);
  const results = f.store.recheck({ ids: [ra!.id, rb!.id, pasted.id, "unknown"] })!;
  expect(results).toEqual([
    { id: ra!.id, ok: true, attachment: { id: ra!.id, name: "a.txt", size: 1, kind: "file", path: a, pasted: false } },
    { id: rb!.id, ok: false, error: "not_found" },
    { id: pasted.id, ok: true, attachment: expect.objectContaining({ id: pasted.id, kind: "image", pasted: true }) },
    { id: "unknown", ok: false, error: "not_found" },
  ]);
  // A rechecked id is the draft's again: the next start takes it.
  expect(f.store.resolve([{ id: ra!.id }])).toMatchObject({ ok: true });
  // A sent paste is part of a conversation's history: removing its restored chip forgets it but keeps the file.
  expect(f.store.remove({ id: pasted.id })).toBe(true);
  expect(existsSync(pasted.path)).toBe(true);
  // …and a later Edit on Home of the same request finds it again.
  expect(f.store.recheck({ ids: [pasted.id] })).toMatchObject([{ id: pasted.id, ok: true }]);
});
it("rechecks without opening another file when a restored path became a link elsewhere", () => {
  const f = fixture();
  const chosen = join(f.files, "a.txt"), secret = join(f.base, "secret.txt"); writeFileSync(chosen, "a"); writeFileSync(secret, "secret");
  const added = ok(f.store.addPaths({ paths: [chosen] })![0]);
  f.store.consume([{ id: added.id }]);
  unlinkSync(chosen); symlinkSync(secret, chosen);
  opened.length = 0;
  expect(f.store.recheck({ ids: [added.id] })).toEqual([{ id: added.id, ok: false, error: "not_found" }]);
  expect(opened).not.toContain(secret);
});
it.each([null, {}, { ids: "x" }, { ids: [1] }, { ids: ["a", "a"] }, { ids: ["a"], extra: 1 }, { ids: Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => `${i}`) }])(
  "refuses a malformed recheck %j", value => { expect(fixture().store.recheck(value)).toBeNull(); });
it("keeps the recheck channel to the main window", () => {
  expect(senderAllowed("attachments:recheck", "main")).toBe(true);
  expect(senderAllowed("attachments:recheck", "settings")).toBe(false);
});

// Review BU3 r2 🟡4: sent ids live as long as the renderer's last requests use them, not by a count.
it("keeps a root's last-request ids through any number of other sends, until the renderer releases them", () => {
  const f = fixture();
  const a = join(f.files, "a.txt"); writeFileSync(a, "a");
  const kept = ok(f.store.addPaths({ paths: [a] })![0]);
  f.store.consume([{ id: kept.id }]);
  for (let i = 0; i < 250; i++) {
    const b = join(f.files, `b${i}.txt`); writeFileSync(b, "b");
    const sent = ok(f.store.addPaths({ paths: [b] })![0]);
    f.store.consume([{ id: sent.id }]);
  }
  expect(f.store.recheck({ ids: [kept.id] })).toMatchObject([{ id: kept.id, ok: true }]);
  f.store.consume([{ id: kept.id }]);
  expect(f.store.release({ ids: [kept.id] })).toBe(true);
  expect(f.store.recheck({ ids: [kept.id] })).toEqual([{ id: kept.id, ok: false, error: "not_found" }]);
  expect(existsSync(a)).toBe(true);
});
it("releases only sent ids and never deletes a sent paste's file", () => {
  const f = fixture();
  const pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) })), draft = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  f.store.markSent([{ id: pasted.id }]); f.store.consume([{ id: pasted.id }]);
  expect(f.store.release({ ids: [pasted.id, draft.id] })).toBe(true);
  expect(existsSync(pasted.path)).toBe(true);
  // A draft's attachment is not a sent one: release leaves it to remove.
  expect(f.store.resolve([{ id: draft.id }])).toMatchObject({ ok: true });
  expect(f.store.release({ ids: "x" })).toBe(false);
  expect(senderAllowed("attachments:release", "main")).toBe(true);
  expect(senderAllowed("attachments:release", "settings")).toBe(false);
});
// buzz-conversation: Edit on Home after a reload or restart issues ids again from the paths a conversation recorded.
it("re-issues recorded paths with the same checks, naming a moved file missing", () => {
  const f = fixture();
  const kept = join(f.files, "kept.txt"), moved = join(f.files, "moved.txt"); writeFileSync(kept, "k"); writeFileSync(moved, "m");
  renameSync(moved, join(f.files, "elsewhere.txt"));
  const [first, second] = f.store.fromPaths({ paths: [kept, moved] })!;
  expect(ok(first)).toMatchObject({ name: "kept.txt", kind: "file", pasted: false });
  expect(second).toEqual({ ok: false, name: "moved.txt", error: "not_found" });
  expect(f.store.resolve([{ id: ok(first).id }])).toMatchObject({ ok: true });
  expect(f.store.fromPaths({ paths: Array.from({ length: MAX_ATTACHMENTS + 1 }, () => kept) })).toBeNull();
});
it("re-issues a sent pasted image from its userData path without ever deleting it", () => {
  const f = fixture();
  const pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  f.store.markSent([{ id: pasted.id }]); f.store.consume([{ id: pasted.id }]);
  const again = ok(f.store.fromPaths({ paths: [pasted.path] })![0]);
  expect(again).toMatchObject({ kind: "image", pasted: false, path: pasted.path });
  expect(f.store.remove({ id: again.id })).toBe(true);
  expect(existsSync(pasted.path)).toBe(true);
});
// buzz-conversation review: a queued message removed before it went out takes its pasted image with it.
it("discards a queued paste that main held and only forgets a queued local file", () => {
  const f = fixture();
  const local = join(f.files, "a.txt"); writeFileSync(local, "a");
  const file = ok(f.store.addPaths({ paths: [local] })![0]), pasted = ok(f.store.addPasted({ bytes: new Uint8Array(PNG) }));
  const ids = [{ id: file.id }, { id: pasted.id }];
  f.store.markSent(ids); f.store.consume(ids);
  f.store.discard([file.id, pasted.id]);
  expect(existsSync(local)).toBe(true); expect(existsSync(pasted.path)).toBe(false);
  expect(f.store.recheck({ ids: [file.id, pasted.id] })).toEqual([{ id: file.id, ok: false, error: "not_found" }, { id: pasted.id, ok: false, error: "not_found" }]);
});

it("names a capture like a paste, with its own prefix", () => {
  expect(capturedName(new Date("2026-11-05T01:02:03.456Z"))).toBe("canvas-capture-2026-11-05T01-02-03-456Z.png");
});
it("accepts only the exact rect shape, finite numbers, the minimum size and a rect inside the window, rounded to integers", () => {
  const size = [1200, 800] as const;
  expect(captureRequest({ rect: { x: 10, y: 20, width: 300, height: 200 } }, size)).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  expect(captureRequest({ rect: { x: 0, y: 0, width: 1200, height: 800 } }, size)).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  expect(captureRequest({ rect: { x: 0, y: 0, width: 8, height: 8 } }, size)).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  // Edges are rounded, so an edge inside the window stays inside and a rect of the minimum size keeps it.
  expect(captureRequest({ rect: { x: 0.5, y: 0.4, width: 1199.5, height: 799.6 } }, size)).toEqual({ x: 1, y: 0, width: 1199, height: 800 });
  expect(captureRequest({ rect: { x: 0.5, y: 0.5, width: 8, height: 8 } }, size)).toEqual({ x: 1, y: 1, width: 8, height: 8 });
  for (const value of [
    null, undefined, "x", [], {}, { rect: null }, { rect: [] }, { rect: {} }, { rect: "x" },
    { rect: { x: 0, y: 0, width: 10, height: 10 }, extra: 1 },
    { rect: { x: 0, y: 0, width: 10 } }, { rect: { x: 0, y: 0, width: 10, height: 10, extra: 1 } }, { rect: { x: 0, y: 0, w: 10, h: 10 } },
    { rect: { x: "0", y: 0, width: 10, height: 10 } }, { rect: { x: NaN, y: 0, width: 10, height: 10 } }, { rect: { x: 0, y: 0, width: Infinity, height: 10 } },
    { rect: { x: 0, y: -Infinity, width: 10, height: 10 } },
    { rect: { x: 0, y: 0, width: 7.9, height: 10 } }, { rect: { x: 0, y: 0, width: 10, height: 7 } }, { rect: { x: 0, y: 0, width: 0, height: 0 } }, { rect: { x: 0, y: 0, width: -10, height: 10 } },
    { rect: { x: -1, y: 0, width: 10, height: 10 } }, { rect: { x: 0, y: -0.5, width: 10, height: 10 } },
    { rect: { x: 1191, y: 0, width: 10, height: 10 } }, { rect: { x: 0, y: 791, width: 10, height: 10 } }, { rect: { x: 0, y: 0, width: 1201, height: 10 } },
  ]) expect(captureRequest(value, size)).toBeNull();
});
it("saves a capture as given, as a main-written paste under userData, without decoding or re-encoding it", () => {
  const f = fixture();
  const captured = ok(f.store.addCaptured(new Uint8Array(PNG)));
  expect(captured).toMatchObject({ kind: "image", pasted: true, size: PNG.length, thumbnail: new Uint8Array([1, 2, 3]) });
  expect(captured.name).toMatch(/^canvas-capture-.*\.png$/);
  expect(Object.keys(captured).sort()).toEqual(["id", "kind", "name", "pasted", "path", "size", "thumbnail"]);
  expect(captured.path.startsWith(realpathSync(f.dir))).toBe(true);
  expect(readFileSync(captured.path)).toEqual(PNG);
  expect(statSync(captured.path).mode & 0o777).toBe(0o600);
  expect(statSync(join(captured.path, "..")).mode & 0o777).toBe(0o700);
  expect(f.reencode).not.toHaveBeenCalled();
  expect(f.thumbnail).toHaveBeenCalledOnce();
  expect(f.store.resolve([{ id: captured.id }])).toEqual({ ok: true, records: [{ name: captured.name, size: PNG.length, kind: "image", path: captured.path }] });
});
it("refuses an empty or oversized capture; the cap is the paste cap and the signature is not checked", () => {
  const f = fixture();
  expect(f.store.addCaptured(new Uint8Array(0))).toEqual({ ok: false, name: "Canvas capture", error: "capture_failed" });
  expect(f.store.addCaptured(new Uint8Array(MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, name: "Canvas capture", error: "too_large" });
  expect(ok(f.store.addCaptured(new Uint8Array([1, 2, 3, 4])))).toMatchObject({ size: 4 });
  expect(readdirSync(f.dir)).toHaveLength(1);
});
it("answers capture_failed, not unreadable, when the capture cannot be written (the directory cannot be made)", () => {
  const f = fixture();
  // A file where the attachments directory belongs makes both directory creations fail.
  mkdirSync(join(f.base, "userData")); writeFileSync(f.dir, "not a directory");
  expect(f.store.addCaptured(new Uint8Array(PNG))).toEqual({ ok: false, name: "Canvas capture", error: "capture_failed" });
  expect(f.store.addPasted({ bytes: new Uint8Array(PNG) })).toEqual({ ok: false, name: "Pasted image", error: "unreadable" });
});
// Each step after the directory exists: the whole image directory goes, nothing is registered, and the two kinds of
// image differ only in the code they answer.
it.each([["a partial write", "write"], ["realpath", "realpath"], ["lstat after the file was written", "lstat"]] as const)(
  "removes the image directory and registers nothing when saving fails at %s", (_label, step) => {
    const f = fixture();
    const entries = () => (f.store as unknown as { entries: Map<string, unknown> }).entries.size;
    fault.step = step;
    expect(f.store.addCaptured(new Uint8Array(PNG))).toEqual({ ok: false, name: "Canvas capture", error: "capture_failed" });
    expect(readdirSync(f.dir)).toEqual([]); expect(entries()).toBe(0);
    expect(f.store.addPasted({ bytes: new Uint8Array(PNG) })).toEqual({ ok: false, name: "Pasted image", error: "unreadable" });
    expect(readdirSync(f.dir)).toEqual([]); expect(entries()).toBe(0);
    // The store still works once the fault is gone.
    fault.step = null;
    expect(ok(f.store.addCaptured(new Uint8Array(PNG)))).toMatchObject({ pasted: true });
    expect(readdirSync(f.dir)).toHaveLength(1); expect(entries()).toBe(1);
  });
it("deletes a capture removed before sending, and keeps a sent one through the next launch's cleanup", () => {
  const f = fixture();
  const removed = ok(f.store.addCaptured(new Uint8Array(PNG))), sent = ok(f.store.addCaptured(new Uint8Array(PNG))), unsent = ok(f.store.addCaptured(new Uint8Array(PNG)));
  expect(f.store.remove({ id: removed.id })).toBe(true); expect(existsSync(removed.path)).toBe(false);
  f.store.markSent([{ id: sent.id }]); f.store.consume([{ id: sent.id }]);
  new AttachmentStore(f.dir, { thumbnail: () => null, reencode: () => null }).cleanup();
  expect(existsSync(sent.path)).toBe(true);
  expect(existsSync(unsent.path)).toBe(false);
});
it("keeps the capture channel to the main window", () => {
  expect(senderAllowed("attachments:capture", "main")).toBe(true);
  expect(senderAllowed("attachments:capture", "settings")).toBe(false);
});
