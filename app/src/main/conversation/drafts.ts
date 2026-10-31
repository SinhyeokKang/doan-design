import { closeSync, constants, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalDirectory, openRegular, readRegular } from "./io";
import { combineQueued } from "./queue";
import { validAnchor } from "./prompt";
import { absolutePath, object } from "./sessions";
import { validId } from "./store";
import type { Anchor, AttachmentRecord } from "./types";
// A message sent while its conversation worked, waiting to go out with the others after the turn.
export interface QueuedItem { itemId: string; text: string; anchors: Anchor[]; attachments: AttachmentRecord[] }
// Queued messages that did not go out (the turn failed or stopped, the send was refused, or the app ended first), joined
// into one draft for the person to edit. reason: "turn_failed", "interrupted", "restarted" or the refused send's code.
export interface ReturnedDraft { text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; reason: string }
export type DraftParts = Omit<ReturnedDraft, "reason">;
interface DraftsFile { queued: Record<string, QueuedItem[]>; returned: Record<string, ReturnedDraft> }

function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 1_048_576 && !value.includes("\0"); }
// Like prompt.ts anchorTokens without its per-message limits: a draft may join several messages.
function anchored(value: string, anchors: readonly unknown[]): boolean {
  if (anchors.length > 4096 || !anchors.every(validAnchor)) return false;
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
    Array.isArray(value.attachments) && [...value.attachments].every(attachment);
}
function parse(raw: unknown): DraftsFile | null {
  if (!object(raw) || raw.v !== 1 || !object(raw.queued) || !object(raw.returned)) return null;
  const queued: Record<string, QueuedItem[]> = {}, returned: Record<string, ReturnedDraft> = {};
  for (const [id, items] of Object.entries(raw.queued)) {
    if (!validId(id) || !Array.isArray(items) || ![...items].every(item => object(item) && text(item.itemId) && item.itemId.length <= 64 && parts(item))) return null;
    queued[id] = items as QueuedItem[];
  }
  for (const [id, draft] of Object.entries(raw.returned)) {
    if (!validId(id) || !object(draft) || !text(draft.reason) || draft.reason.length > 64 || !parts(draft)) return null;
    returned[id] = draft as ReturnedDraft;
  }
  return { queued, returned };
}
// Messages joined in order, a blank line apart, each one's {{n}} moved past the anchors before it.
export function joined(items: readonly DraftParts[]): DraftParts {
  const words = combineQueued(items.map(item => ({ text: item.text, anchors: item.anchors, attachments: [] })));
  if (!words.ok) throw new Error("unreachable");
  return { text: words.text, anchors: words.anchors, attachments: items.flatMap(item => item.attachments) };
}

// The input queue and the drafts it hands back, per conversation, in <userData>/conversations/drafts.json. Every change
// is written at once (temporary file and rename), so a crash loses nothing; at the next start the queued messages
// become drafts and never go out by themselves. A damaged file is kept for diagnosis: nothing more is queued, and
// returned drafts stay in memory only. directory null: memory only (tests and callers without a store).
export class DraftStore {
  private file: DraftsFile = { queued: {}, returned: {} };
  private readonly directory: string | null;
  private readonly path: string | null;
  private broken = false;
  constructor(directory: string | null) {
    // The conversation store's directory, which it made and checked; written below it without following links.
    this.directory = directory === null ? null : canonicalDirectory(directory);
    this.path = this.directory === null ? null : join(this.directory, "drafts.json");
    if (this.path === null) return;
    let raw: string | null = null;
    try { raw = readRegular(this.path); } catch (error) {
      if (!object(error) || error.code !== "ENOENT") { this.broken = true; console.error("doan: conversation drafts unreadable; kept as they are", error); }
    }
    if (raw === null) return;
    let read: DraftsFile | null = null;
    try { read = parse(JSON.parse(raw)); } catch { read = null; }
    if (!read) { this.broken = true; console.error("doan: conversation drafts damaged; kept as they are"); return; }
    this.file = read;
    const left = Object.entries(read.queued).filter(([, items]) => items.length > 0);
    if (!left.length) return;
    for (const [id, items] of left) this.merge(id, joined(items), "restarted");
    this.file.queued = {};
    try { this.write(); } catch (error) { console.error("doan: conversation drafts could not be saved", error); }
  }
  queued(id: string): readonly QueuedItem[] { return this.file.queued[id] ?? []; }
  // Throws when the queue cannot be saved: a message main could lose is refused instead.
  add(id: string, item: QueuedItem): void {
    if (this.broken) throw new Error("Conversation drafts are damaged");
    const before = this.file.queued[id];
    this.file.queued[id] = [...before ?? [], item];
    try { this.write(); } catch (error) { this.restore(id, before); throw error; }
  }
  remove(id: string, itemId: string): boolean {
    const before = this.file.queued[id];
    if (!before?.some(item => item.itemId === itemId)) return false;
    this.file.queued[id] = before.filter(item => item.itemId !== itemId);
    this.save();
    return true;
  }
  takeQueued(id: string): QueuedItem[] {
    const items = this.file.queued[id] ?? [];
    if (!items.length) return [];
    delete this.file.queued[id];
    this.save();
    return items;
  }
  // The whole queue back as one draft, in one write; false when nothing was queued.
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
  take(id: string): ReturnedDraft | null {
    const draft = this.file.returned[id]; if (!draft) return null;
    delete this.file.returned[id];
    this.save();
    return draft;
  }
  private merge(id: string, draft: DraftParts, reason: string): void {
    const earlier = this.file.returned[id];
    this.file.returned[id] = { ...(earlier ? joined([earlier, draft]) : draft), reason };
  }
  private restore(id: string, items: QueuedItem[] | undefined): void { if (items) this.file.queued[id] = items; else delete this.file.queued[id]; }
  private save(): void { try { this.write(); } catch (error) { console.error("doan: conversation drafts could not be saved", error); } }
  private write(): void {
    if (this.path === null || this.directory === null || this.broken) return;
    const queued = Object.fromEntries(Object.entries(this.file.queued).filter(([, items]) => items.length > 0));
    const temp = join(this.directory, `drafts-${randomUUID()}.tmp`);
    const fd = openRegular(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try {
      const bytes = Buffer.from(JSON.stringify({ v: 1, queued, returned: this.file.returned }));
      if (writeSync(fd, bytes) !== bytes.length) throw new Error("Incomplete drafts write");
    } catch (error) { closeSync(fd); unlinkSync(temp); throw error; }
    closeSync(fd);
    try { renameSync(temp, this.path); } catch (error) { unlinkSync(temp); throw error; }
  }
}
