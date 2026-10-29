import { closeSync, constants, fstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, rmSync, writeFileSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, extname, isAbsolute, join } from "node:path";
import type { AttachmentRecord } from "./conversation/types";

// Attachments are local paths the agent reads with its own tools (design §4.8; Orca 1.4.243
// `out/shared/agent-session-attachments.js`: "agents receive only host paths"). Only a pasted image, which has no path,
// is written by doan, under <userData>/attachments/<id>/.
export const MAX_ATTACHMENTS = 10;
// The paste cap is Orca's; local files are not capped, but no image above it is decoded for a thumbnail.
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_PATH = 4096;
const SENT = "sent";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export type AttachmentError = "not_found" | "not_file" | "not_image" | "too_large" | "limit" | "unreadable";
export interface AttachmentInfo extends AttachmentRecord { id: string; pasted: boolean; thumbnail?: Uint8Array }
export type AttachmentResult = { ok: true; attachment: AttachmentInfo } | { ok: false; name: string; error: AttachmentError };
export type ResolvedAttachments = { ok: true; records: AttachmentRecord[] } | { ok: false; error: "bad_request" } | { ok: false; error: "attachment_missing"; missing: string[] };
// Electron's nativeImage behind a seam: it decodes only bytes that passed the size and signature checks, never a path.
export interface ImageCodec { thumbnail(bytes: Uint8Array): Uint8Array | null; reencode(bytes: Uint8Array): Uint8Array | null }
// dev and ino: the file checked when it was added; a recheck reads nothing from any other file.
// sent: a conversation already holds this file, so forgetting it never deletes a paste (Edit on Home brings it back).
interface Entry extends AttachmentRecord { id: string; pasted: boolean; dir?: string; dev: number; ino: number; sent?: true }
export type RecheckResult = { id: string; ok: true; attachment: AttachmentInfo } | { id: string; ok: false; error: AttachmentError };

// The leading bytes of the image formats doan accepts; a mismatch is never decoded.
export function imageType(head: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return "image/gif";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}
interface Opened { size: number; dev: number; ino: number; head: Uint8Array; bytes?: Uint8Array }
// Opens a canonical path without following a link (O_NONBLOCK keeps a FIFO from blocking main) and reads only once
// the opened file is a regular file and, on a recheck, the same one. whole: also the bytes of an image within the cap,
// for its thumbnail, from the same descriptor.
function readChecked(path: string, expected: { dev: number; ino: number } | null, whole: boolean): Opened {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw Object.assign(new Error("not_file"), { code: "not_file" });
    if (expected && (stat.dev !== expected.dev || stat.ino !== expected.ino)) throw Object.assign(new Error("replaced"), { code: "ENOENT" });
    const head = Buffer.alloc(16); const read = readSync(fd, head, 0, 16, 0);
    const opened: Opened = { size: stat.size, dev: stat.dev, ino: stat.ino, head: head.subarray(0, read) };
    if (whole && stat.size <= MAX_IMAGE_BYTES && imageType(opened.head)) {
      const bytes = Buffer.alloc(stat.size);
      if (readSync(fd, bytes, 0, stat.size, 0) === stat.size) opened.bytes = bytes;
    }
    return opened;
  } finally { closeSync(fd); }
}
// Directories of pasted images a start never took; a sent one stays with its conversation.
export function cleanupTargets(entries: readonly { name: string; directory: boolean; sent: boolean }[]): string[] {
  return entries.filter(e => e.directory && ID.test(e.name) && !e.sent).map(e => e.name);
}
export function pastedName(at: Date): string { return `pasted-${at.toISOString().replace(/[:.]/g, "-")}.png`; }

export class AttachmentStore {
  private entries = new Map<string, Entry>();
  private sent = new Map<string, Entry>();
  constructor(private dir: string, private codec: ImageCodec) {}
  // At launch, before any paste: removes only unsent paste directories, never reading conversation history.
  cleanup(): void {
    let names: string[];
    try { names = readdirSync(this.dir); } catch { return; }
    const entries = names.map(name => {
      const path = join(this.dir, name);
      let directory = false, sent = false;
      try { directory = lstatSync(path).isDirectory(); sent = directory && lstatSync(join(path, SENT)).isFile(); } catch { /* not sent */ }
      return { name, directory, sent };
    });
    for (const name of cleanupTargets(entries)) rmSync(join(this.dir, name), { recursive: true, force: true });
  }
  addPaths(value: unknown): AttachmentResult[] | null {
    if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("paths" in value)) return null;
    if (!Array.isArray(value.paths)) return null;
    // Spread first: IPC keeps an array's holes and every() skips them.
    const paths: unknown[] = [...value.paths];
    if (paths.length === 0 || paths.length > 64 || !paths.every(p => typeof p === "string" && p.length <= MAX_PATH && isAbsolute(p) && !p.includes("\0"))) return null;
    let accepted = 0;
    return (paths as string[]).map(path => {
      const name = basename(path);
      if (accepted >= MAX_ATTACHMENTS) return { ok: false, name, error: "limit" };
      const checked = this.check(path, null); if ("error" in checked) return { ok: false, name, error: checked.error };
      const { bytes, ...record } = checked;
      const entry: Entry = { id: randomUUID(), pasted: false, ...record };
      this.entries.set(entry.id, entry); accepted++;
      return { ok: true, attachment: this.info(entry, bytes) };
    });
  }
  addPasted(value: unknown): AttachmentResult {
    const name = "Pasted image";
    const bytes = typeof value === "object" && value !== null && Object.keys(value).length === 1 && "bytes" in value && value.bytes instanceof Uint8Array ? value.bytes : null;
    if (!bytes || bytes.length === 0) return { ok: false, name, error: "not_image" };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, name, error: "too_large" };
    if (!imageType(bytes.subarray(0, 16))) return { ok: false, name, error: "not_image" };
    const png = this.codec.reencode(bytes); if (!png || png.length === 0) return { ok: false, name, error: "not_image" };
    if (png.length > MAX_IMAGE_BYTES) return { ok: false, name, error: "too_large" };
    const id = randomUUID(), dir = join(this.dir, id), file = pastedName(new Date());
    try {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 }); mkdirSync(dir, { mode: 0o700 });
      writeFileSync(join(dir, file), png, { mode: 0o600, flag: "wx" });
    } catch { rmSync(dir, { recursive: true, force: true }); return { ok: false, name, error: "unreadable" }; }
    const path = realpathSync.native(join(dir, file)), stat = lstatSync(path);
    const entry: Entry = { id, pasted: true, dir, name: file, size: png.length, kind: "image", path, dev: stat.dev, ino: stat.ino };
    this.entries.set(id, entry);
    return { ok: true, attachment: this.info(entry, png) };
  }
  // A pasted image removed before sending is deleted, even one a refused start marked sent; a local file is only
  // forgotten. An accepted start consumed its entries, so its files never reach here.
  remove(value: unknown): boolean {
    const id = typeof value === "object" && value !== null && Object.keys(value).length === 1 && "id" in value && typeof value.id === "string" ? value.id : null;
    const entry = id ? this.entries.get(id) : undefined; if (!entry) return false;
    this.entries.delete(entry.id);
    // A sent one goes back aside, so a later Edit on Home of the same request can check it again.
    if (entry.sent) this.sent.set(entry.id, entry);
    else if (entry.dir) rmSync(entry.dir, { recursive: true, force: true });
    return true;
  }
  // The send-time recheck: each file must still be the regular file that was checked, at the same canonical path.
  resolve(value: unknown): ResolvedAttachments {
    if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return { ok: false, error: "bad_request" };
    const ids: string[] = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null || Object.keys(item).length !== 1 || !("id" in item) || typeof item.id !== "string" || item.id.length > 64) return { ok: false, error: "bad_request" };
      ids.push(item.id);
    }
    if (new Set(ids).size !== ids.length) return { ok: false, error: "bad_request" };
    const missing: string[] = [], records: AttachmentRecord[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id);
      const checked = entry ? this.check(entry.path, entry) : null;
      if (!entry || !checked || "error" in checked || checked.kind !== entry.kind) missing.push(id);
      else records.push({ name: entry.name, size: checked.size, kind: entry.kind, path: entry.path });
    }
    return missing.length ? { ok: false, error: "attachment_missing", missing } : { ok: true, records };
  }
  // Right before a start is accepted: a sent paste directory survives the next launch's cleanup.
  markSent(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const entry = typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? this.entries.get(item.id) : undefined;
      if (entry?.dir) writeFileSync(join(entry.dir, SENT), "", { mode: 0o600 });
    }
  }
  // After an accepted start; a refused one keeps them for the next try. A consumed entry is kept aside for Edit on
  // Home's recheck until the renderer releases it (its last request for that root was replaced).
  consume(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const entry = typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? this.entries.get(item.id) : undefined;
      if (!entry) continue;
      this.entries.delete(entry.id);
      this.sent.set(entry.id, { ...entry, sent: true });
    }
  }
  // No last request uses these sent ids any more; their files stay where they are. False for a malformed request.
  release(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("ids" in value) || !Array.isArray(value.ids)) return false;
    const ids: unknown[] = [...value.ids];
    if (ids.length > 64 || !ids.every(id => typeof id === "string" && id.length <= 64)) return false;
    for (const id of ids as string[]) this.sent.delete(id);
    return true;
  }
  // Edit on Home (design §7.4): the acceptance checks again, on the canonical paths main recorded for these ids only.
  // A passing consumed id becomes a draft attachment again; null for a malformed request.
  recheck(value: unknown): RecheckResult[] | null {
    if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("ids" in value) || !Array.isArray(value.ids)) return null;
    const ids: unknown[] = [...value.ids];
    if (ids.length > MAX_ATTACHMENTS || !ids.every(id => typeof id === "string" && id.length <= 64) || new Set(ids).size !== ids.length) return null;
    return (ids as string[]).map((id): RecheckResult => {
      const entry = this.entries.get(id) ?? this.sent.get(id);
      const checked = entry ? this.check(entry.path, entry) : null;
      if (!entry || !checked) return { id, ok: false, error: "not_found" };
      if ("error" in checked) return { id, ok: false, error: checked.error };
      if (checked.kind !== entry.kind) return { id, ok: false, error: "not_found" };
      const current = { ...entry, size: checked.size };
      this.sent.delete(id); this.entries.set(id, current);
      return { id, ok: true, attachment: this.info(current, undefined) };
    });
  }
  // expected: a recheck, which compares the fresh canonical path with the stored one before opening anything, so a
  // path swapped to a link elsewhere is refused without reading the other file.
  private check(path: string, expected: Entry | null): AttachmentRecord & { dev: number; ino: number; bytes?: Uint8Array } | { error: AttachmentError } {
    let real: string, opened: Opened;
    try {
      real = realpathSync.native(path);
      if (expected && real !== expected.path) return { error: "not_found" };
      opened = readChecked(real, expected, !expected);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
      return { error: code === "ENOENT" || code === "ENOTDIR" ? "not_found" : code === "not_file" || code === "EISDIR" ? "not_file" : "unreadable" };
    }
    const image = imageType(opened.head) !== null;
    // A file named as an image must be one; its name would otherwise mislead the agent and the chip.
    if (!image && IMAGE_EXTENSIONS.has(extname(real).toLowerCase())) return { error: "not_image" };
    return { name: basename(real), size: opened.size, kind: image ? "image" : "file", path: real, dev: opened.dev, ino: opened.ino, ...(opened.bytes ? { bytes: opened.bytes } : {}) };
  }
  private info(entry: Entry, bytes: Uint8Array | undefined): AttachmentInfo {
    const thumbnail = entry.kind === "image" && bytes ? this.codec.thumbnail(bytes) : null;
    return { id: entry.id, name: entry.name, size: entry.size, kind: entry.kind, path: entry.path, pasted: entry.pasted, ...(thumbnail ? { thumbnail } : {}) };
  }
}
