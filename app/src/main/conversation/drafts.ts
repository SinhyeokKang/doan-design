import { closeSync, constants, readdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { MAX_ATTACHMENTS } from "../attachments";
import { canonicalDirectory, openRegular, readRegular } from "./io";
import { combineQueued } from "./queue";
import { LIMITS, validAnchor } from "./prompt";
import { absolutePath, object } from "./sessions";
import { validId } from "./store";
import type { Anchor, AttachmentRecord } from "./types";
// A message sent while its conversation worked, waiting to go out with the others after the turn. sending: its send has
// started and is not accepted yet; it stays on disk until then, so a crash returns it as a draft instead of losing it.
export interface QueuedItem { itemId: string; text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; sending?: true }
// Queued messages that did not go out (the turn failed or stopped, the send was refused, or the app ended first), joined
// into one draft for the person to edit. reason: "turn_failed", "interrupted", "restarted" or the refused send's code.
export interface ReturnedDraft { text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; reason: string }
export type DraftParts = Omit<ReturnedDraft, "reason">;
interface DraftsFile { queued: Record<string, QueuedItem[]>; returned: Record<string, ReturnedDraft> }
// The whole file, which the reader reads only up to this size; the writer refuses a queued message that would pass it.
export const DRAFTS_FILE_BYTES = 16 * 1024 * 1024;

// A conversation's queue and returned draft together stay within one message (prompt.ts LIMITS, MAX_ATTACHMENTS), the
// size the composer they come back to can hold and a send can carry. The writer refuses a queued message that would
// pass it and the reader reads only what is within it, so what main accepted is always read back whole.
function fits(value: DraftParts): boolean {
  return value.text.length <= LIMITS.text && value.anchors.length <= LIMITS.anchors && value.attachments.length <= MAX_ATTACHMENTS;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= LIMITS.text && !value.includes("\0"); }
// Like prompt.ts anchorTokens: every {{n}} names one of the anchors, each once.
function anchored(value: string, anchors: readonly unknown[]): boolean {
  if (anchors.length > LIMITS.anchors || !anchors.every(validAnchor)) return false;
  const seen = new Set<number>(); let invalid = false;
  const rest = value.replace(/\{\{([^{}]*)\}\}/g, (_match, n: string) => {
    if (!/^[1-9][0-9]*$/.test(n) || Number(n) > anchors.length) invalid = true;
    seen.add(Number(n)); return "";
  });
  return !invalid && !rest.includes("{{") && !rest.includes("}}") && seen.size === anchors.length;
}
function attachment(value: unknown): value is AttachmentRecord {
  return object(value) && text(value.name) && typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0 &&
    (value.kind === "image" || value.kind === "file") && typeof value.path === "string" && absolutePath(value.path);
}
function parts(value: unknown): value is DraftParts {
  return object(value) && text(value.text) && Array.isArray(value.anchors) && anchored(value.text, [...value.anchors]) &&
    Array.isArray(value.attachments) && value.attachments.length <= MAX_ATTACHMENTS && [...value.attachments].every(attachment);
}
function queuedItems(value: unknown): value is QueuedItem[] {
  return Array.isArray(value) && [...value].every(item => object(item) && typeof item.itemId === "string" && item.itemId.length > 0 && item.itemId.length <= 64 &&
    (item.sending === undefined || item.sending === true) && parts(item));
}
function returnedDraft(value: unknown): value is ReturnedDraft {
  return object(value) && typeof value.reason === "string" && /^[a-z_]{1,64}$/.test(value.reason) && parts(value);
}
// Each conversation is read on its own: one that cannot be read (a bad entry, or a queue and draft past one message) is
// kept on disk as it is and left out, and the others are read. null: the file itself is not a v1 drafts file.
function parse(raw: unknown): { file: DraftsFile; unread: { queued: Record<string, unknown>; returned: Record<string, unknown> } } | null {
  if (!object(raw) || raw.v !== 1 || !object(raw.queued) || !object(raw.returned)) return null;
  const file: DraftsFile = { queued: {}, returned: {} }, unread = { queued: {} as Record<string, unknown>, returned: {} as Record<string, unknown> };
  for (const id of new Set([...Object.keys(raw.queued), ...Object.keys(raw.returned)])) {
    const items = raw.queued[id], draft = raw.returned[id];
    const ok = validId(id) && (items === undefined || queuedItems(items)) && (draft === undefined || returnedDraft(draft)) &&
      fits(joined([...(draft === undefined ? [] : [draft as ReturnedDraft]), ...(items === undefined ? [] : items as QueuedItem[])]));
    if (ok) { if (items !== undefined) file.queued[id] = items as QueuedItem[]; if (draft !== undefined) file.returned[id] = draft as ReturnedDraft; continue; }
    console.error("doan: conversation drafts of one conversation unreadable; kept as they are", id.slice(0, 64));
    if (items !== undefined) unread.queued[id] = items;
    if (draft !== undefined) unread.returned[id] = draft;
  }
  return { file, unread };
}
// Messages joined in order, a blank line apart, each one's {{n}} moved past the anchors before it.
export function joined(items: readonly DraftParts[]): DraftParts {
  const words = combineQueued(items.map(item => ({ text: item.text, anchors: item.anchors, attachments: [] })));
  if (!words.ok) throw new Error("unreachable");
  return { text: words.text, anchors: words.anchors, attachments: items.flatMap(item => item.attachments) };
}

// The input queue and the drafts it hands back, per conversation, in <userData>/conversations/drafts.json. Every change
// is written at once (temporary file and rename); at the next start the queued messages become drafts and never go out
// by themselves. A file that is not a drafts file is kept for diagnosis: nothing more is queued, and returned drafts
// stay in memory only. directory null: memory only (tests and callers without a store). fileBytes: the file limit.
export class DraftStore {
  private file: DraftsFile = { queued: {}, returned: {} };
  private unread: { queued: Record<string, unknown>; returned: Record<string, unknown> } = { queued: {}, returned: {} };
  private readonly directory: string | null;
  private readonly path: string | null;
  private readonly fileBytes: number;
  private broken = false;
  constructor(directory: string | null, options: { fileBytes?: number } = {}) {
    this.fileBytes = options.fileBytes ?? DRAFTS_FILE_BYTES;
    // The conversation store's directory, which it made and checked; written below it without following links.
    this.directory = directory === null ? null : canonicalDirectory(directory);
    this.path = this.directory === null ? null : join(this.directory, "drafts.json");
    if (this.path === null || this.directory === null) return;
    // A write that died before its rename left its temporary file behind.
    try {
      for (const name of readdirSync(this.directory)) if (/^drafts-[0-9a-f-]{36}\.tmp$/.test(name)) try { unlinkSync(join(this.directory, name)); } catch { /* left for the next start */ }
    } catch (error) { console.error("doan: conversation drafts directory unreadable", error); }
    let raw: string | null = null;
    try { raw = readRegular(this.path, this.fileBytes); } catch (error) {
      if (!object(error) || error.code !== "ENOENT") { this.broken = true; console.error("doan: conversation drafts unreadable; kept as they are", error); }
    }
    if (raw === null) return;
    let read: ReturnType<typeof parse> = null;
    try { read = parse(JSON.parse(raw)); } catch { read = null; }
    if (!read) { this.broken = true; console.error("doan: conversation drafts damaged; kept as they are"); return; }
    this.file = read.file; this.unread = read.unread;
    const left = Object.entries(read.file.queued).filter(([, items]) => items.length > 0);
    if (!left.length) return;
    for (const [id, items] of left) this.merge(id, joined(items), "restarted");
    this.file.queued = {};
    this.save();
  }
  // The messages still waiting, without those whose send has started.
  queued(id: string): readonly QueuedItem[] { return (this.file.queued[id] ?? []).filter(item => !item.sending); }
  // Refused (queue_limit) before anything changes when the conversation's returned draft, queue and this item would not
  // fit one message, or the file would pass what the reader reads; throws when the queue cannot be saved.
  add(id: string, item: QueuedItem): void {
    if (this.broken || id in this.unread.queued || id in this.unread.returned) throw new Error("Conversation drafts are damaged");
    const before = this.file.queued[id], earlier = this.file.returned[id];
    if (!fits(joined([...(earlier ? [earlier] : []), ...before ?? [], item]))) throw new Error("queue_limit");
    this.file.queued[id] = [...before ?? [], item];
    try {
      if (this.bytes() > this.fileBytes) throw new Error("queue_limit");
      this.write();
    } catch (error) { this.restore(id, before); throw error; }
  }
  // Throws when the removal cannot be saved, and keeps the item.
  remove(id: string, itemId: string): boolean {
    const before = this.file.queued[id];
    if (!before?.some(item => item.itemId === itemId && !item.sending)) return false;
    this.file.queued[id] = before.filter(item => item.itemId !== itemId);
    try { this.write(); } catch (error) { this.restore(id, before); throw error; }
    return true;
  }
  // The waiting messages, now marked as on their way out.
  markSending(id: string): QueuedItem[] {
    const items = this.queued(id);
    if (!items.length) return [];
    this.file.queued[id] = (this.file.queued[id] ?? []).map(item => item.sending ? item : { ...item, sending: true });
    this.save();
    return [...items];
  }
  // Their send was accepted: they are in the conversation's history now.
  sent(id: string, itemIds: readonly string[]): void {
    const left = (this.file.queued[id] ?? []).filter(item => !itemIds.includes(item.itemId));
    if (left.length) this.file.queued[id] = left; else delete this.file.queued[id];
    this.save();
  }
  // The whole queue back as one draft (messages on their way out first, as queued), in one write; false when empty.
  giveBackQueued(id: string, reason: string): boolean {
    const items = this.file.queued[id] ?? [];
    if (!items.length) return false;
    delete this.file.queued[id];
    this.merge(id, joined(items), reason);
    this.save();
    return true;
  }
  // Never throws: a draft that cannot be saved is still handed over in this run.
  giveBack(id: string, draft: DraftParts, reason: string): void { this.merge(id, draft, reason); this.save(); }
  returned(id: string): ReturnedDraft | undefined { return this.file.returned[id]; }
  // Throws when the hand-over cannot be saved, and keeps the draft.
  take(id: string): ReturnedDraft | null {
    const draft = this.file.returned[id]; if (!draft) return null;
    delete this.file.returned[id];
    try { this.write(); } catch (error) { this.file.returned[id] = draft; throw error; }
    return draft;
  }
  private merge(id: string, draft: DraftParts, reason: string): void {
    const earlier = this.file.returned[id];
    this.file.returned[id] = { ...(earlier ? joined([earlier, draft]) : draft), reason };
  }
  private restore(id: string, items: QueuedItem[] | undefined): void { if (items) this.file.queued[id] = items; else delete this.file.queued[id]; }
  private save(): void { try { this.write(); } catch (error) { console.error("doan: conversation drafts could not be saved", error); } }
  // The file as written, unreadable conversations kept as they were.
  private serialized(file: DraftsFile): string {
    const queued = Object.fromEntries(Object.entries(file.queued).filter(([, items]) => items.length > 0));
    return JSON.stringify({ v: 1, queued: { ...this.unread.queued, ...queued }, returned: { ...this.unread.returned, ...file.returned } });
  }
  // The most the file can take for what is accepted now, whatever happens to it later: each conversation as its queue
  // with every item marked sending beside its returned draft, or as one returned draft holding all of it (a restart, a
  // failed turn), with the longest reason, whichever is larger; conversations change form independently, so each takes
  // its own larger form. No later write of these items can then pass what the reader reads.
  private bytes(): number {
    const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
    const reason = "x".repeat(64);
    let total = size({ v: 1, queued: this.unread.queued, returned: this.unread.returned });
    for (const id of new Set([...Object.keys(this.file.queued), ...Object.keys(this.file.returned)])) {
      const items = this.file.queued[id] ?? [], earlier = this.file.returned[id];
      // "id": plus the comma that follows a member.
      const key = size(id) + 2;
      const asQueue = (items.length ? key + size(items.map(item => ({ ...item, sending: true }))) : 0) + (earlier ? key + size({ ...earlier, reason }) : 0);
      const asDraft = key + size({ ...joined([...(earlier ? [earlier] : []), ...items]), reason });
      total += Math.max(asQueue, asDraft);
    }
    return total;
  }
  private write(): void {
    if (this.path === null || this.directory === null || this.broken) return;
    const temp = join(this.directory, `drafts-${randomUUID()}.tmp`);
    const fd = openRegular(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try {
      const bytes = Buffer.from(this.serialized(this.file));
      if (writeSync(fd, bytes) !== bytes.length) throw new Error("Incomplete drafts write");
    } catch (error) { closeSync(fd); unlinkSync(temp); throw error; }
    closeSync(fd);
    try { renameSync(temp, this.path); } catch (error) { unlinkSync(temp); throw error; }
  }
}
