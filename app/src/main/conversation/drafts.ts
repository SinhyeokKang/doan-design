import { closeSync, constants, readdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { MAX_ATTACHMENTS } from "../attachments";
import { canonicalDirectory, openRegular, readRegular } from "./io";
import { combineQueued } from "./queue";
import { anchorTokens, LIMITS } from "./prompt";
import { absolutePath, object } from "./sessions";
import { validAttachment, validCanvas, validId, validOrigin } from "./store";
import type { Anchor, AttachmentRecord, Canvas, HandoffOrigin } from "./types";
// A message sent while its conversation worked, waiting to go out with the others after the turn. sending: its send has
// started and is not accepted yet; it stays on disk until then, so a crash returns it as a draft instead of losing it.
// origin: an agent's message (a send), which carries no anchors or files, is never read for {{n}} markers, never joins the
// person's rows or a draft, and stays queued through failures, give-backs, moves and restarts.
export interface QueuedItem { itemId: string; text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; sending?: true; origin?: HandoffOrigin }
// Queued messages that did not go out (the turn failed or stopped, the send was refused, or the app ended first), joined
// into one draft for the person to edit. reason: "turn_failed", "interrupted", "restarted" or the refused send's code.
export interface ReturnedDraft { text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; reason: string }
export type DraftParts = Omit<ReturnedDraft, "reason">;
// A message a send or start carries from when main takes it until main accepts or refuses it, so a quit in between
// cannot lose it. A send's names its conversation, a start's the root (and canvas), since no conversation exists yet.
export type HeldMessage = DraftParts & ({ conversationId: string } | { root: string; canvas?: Canvas });
// A start's message the app ended before acceptance, waiting for a composer of its root (and canvas) to take it.
export interface ReturnedStart extends DraftParts { root: string; canvas?: Canvas }
interface DraftsFile { queued: Record<string, QueuedItem[]>; returned: Record<string, ReturnedDraft>; sending: Record<string, HeldMessage>; starts: Record<string, ReturnedStart> }
// The whole file, which the reader reads only up to this size; the writer refuses a queued message that would pass it.
export const DRAFTS_FILE_BYTES = 16 * 1024 * 1024;

// A conversation's queue and returned draft together stay within one message (prompt.ts LIMITS, MAX_ATTACHMENTS): the
// writer refuses past it and the reader reads only within it, so what main accepted is always read back whole.
function fits(value: DraftParts): boolean {
  return value.text.length <= LIMITS.text && value.anchors.length <= LIMITS.anchors && value.attachments.length <= MAX_ATTACHMENTS;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= LIMITS.text && !value.includes("\0"); }
function parts(value: unknown): value is DraftParts {
  return object(value) && text(value.text) && Array.isArray(value.anchors) && anchorTokens(value.text, [...value.anchors]) !== null &&
    Array.isArray(value.attachments) && value.attachments.length <= MAX_ATTACHMENTS && [...value.attachments].every(validAttachment);
}
// An agent row is checked apart from the person's: its text as the history keeps an origin message's.
function agentParts(value: Record<string, unknown>): boolean {
  return validOrigin(value.origin) && text(value.text) && Array.isArray(value.anchors) && value.anchors.length === 0 && Array.isArray(value.attachments) && value.attachments.length === 0;
}
function queuedItems(value: unknown): value is QueuedItem[] {
  return Array.isArray(value) && [...value].every(item => object(item) && typeof item.itemId === "string" && item.itemId.length > 0 && item.itemId.length <= 64 &&
    (item.sending === undefined || item.sending === true) && (item.origin === undefined ? parts(item) : agentParts(item)));
}
// The person's rows, which a give-back joins into the draft; agent rows stay queued.
export function personRows(items: readonly QueuedItem[]): QueuedItem[] { return items.filter(item => !item.origin); }
function agentRows(items: readonly QueuedItem[]): QueuedItem[] { return items.filter(item => !!item.origin); }
function returnedDraft(value: unknown): value is ReturnedDraft {
  return object(value) && typeof value.reason === "string" && /^[a-z_]{1,64}$/.test(value.reason) && parts(value);
}
function root(value: unknown): value is { root: string; canvas?: Canvas } {
  return object(value) && typeof value.root === "string" && absolutePath(value.root) && (value.canvas === undefined || validCanvas(value.canvas));
}
function returnedStart(value: unknown): value is ReturnedStart { return root(value) && parts(value) && fits(value); }
function heldMessage(value: unknown): value is HeldMessage {
  if (!object(value)) return false;
  const conversationId = value.conversationId;
  return parts(value) && fits(value) && (typeof conversationId === "string" ? validId(conversationId) : root(value));
}
// Held and returned starts are read entry by entry; an older file has neither. Unreadable entries are dropped: each is
// one message nothing else refers to, unlike a conversation's queue and draft, which are kept for diagnosis.
function entries<T>(value: unknown, valid: (entry: unknown) => entry is T, kind: string): Record<string, T> {
  if (value === undefined) return {};
  const read: Record<string, T> = {};
  if (!object(value)) { console.error(`doan: conversation drafts' ${kind} unreadable; dropped`); return read; }
  for (const [key, entry] of Object.entries(value)) {
    if (validId(key) && valid(entry)) read[key] = entry;
    else console.error(`doan: conversation drafts' ${kind} entry unreadable; dropped`);
  }
  return read;
}
// Each conversation is read on its own: one that cannot be read (a bad entry, or a queue and draft past one message) is
// kept on disk as it is and left out, and the others are read. null: the file itself is not a v1 drafts file.
function parse(raw: unknown): { file: DraftsFile; unread: { queued: Record<string, unknown>; returned: Record<string, unknown> } } | null {
  if (!object(raw) || raw.v !== 1 || !object(raw.queued) || !object(raw.returned)) return null;
  const file: DraftsFile = { queued: {}, returned: {}, sending: entries(raw.sending, heldMessage, "sending"), starts: entries(raw.starts, returnedStart, "starts") }, unread = { queued: {} as Record<string, unknown>, returned: {} as Record<string, unknown> };
  for (const id of new Set([...Object.keys(raw.queued), ...Object.keys(raw.returned)])) {
    const items = raw.queued[id], draft = raw.returned[id];
    const ok = validId(id) && (items === undefined || queuedItems(items)) && (draft === undefined || returnedDraft(draft)) &&
      fits(joined([...(draft === undefined ? [] : [draft as ReturnedDraft]), ...(items === undefined ? [] : personRows(items as QueuedItem[]))]));
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

// A start of root on canvas, or on none: a canvas matches by its id when both have one, else by its path.
function startOn(start: ReturnedStart, root: string, canvas: Canvas | undefined): boolean {
  if (start.root !== root) return false;
  if (!start.canvas || !canvas) return !start.canvas && !canvas;
  return start.canvas.id !== undefined && canvas.id !== undefined ? start.canvas.id === canvas.id : start.canvas.path === canvas.path;
}

// The queue and returned drafts per conversation in <userData>/conversations/drafts.json; queued messages become drafts at
// the next start. A non-drafts file is kept: nothing more is queued, drafts stay in memory. directory null: memory only.
export class DraftStore {
  private file: DraftsFile = { queued: {}, returned: {}, sending: {}, starts: {} };
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
    const left = Object.entries(read.file.queued).filter(([, items]) => items.length > 0), held = Object.entries(read.file.sending);
    if (!left.length && !held.length) return;
    // A send's message goes behind what its conversation already had returned and ahead of its queue, which waited
    // behind that send; a start's waits for its composer.
    for (const [key, { text, anchors, attachments, ...where }] of held) {
      if ("conversationId" in where) {
        // A conversation whose drafts could not be read keeps them as they are; its message is lost rather than mixed in.
        if (where.conversationId in this.unread.queued || where.conversationId in this.unread.returned) console.error("doan: a held message's conversation drafts unreadable; dropped");
        else if (!fits(joined([...this.file.returned[where.conversationId] ? [this.file.returned[where.conversationId]!] : [], { text, anchors, attachments }]))) console.error("doan: a held message does not fit its conversation's draft; dropped");
        else this.merge(where.conversationId, { text, anchors, attachments }, "restarted");
      } else this.file.starts[key] = { ...where, text, anchors, attachments };
    }
    this.file.sending = {};
    // A send held behind its queue (handoffWait), or a queue written before held sends were counted, can pass one message,
    // which the start after this one could not read; so a queued item that does not fit is dropped, as a held send is.
    for (const [id, items] of left) for (const { text, anchors, attachments } of personRows(items)) {
      const earlier = this.file.returned[id];
      if (fits(joined([...earlier ? [earlier] : [], { text, anchors, attachments }]))) this.merge(id, { text, anchors, attachments }, "restarted");
      else console.error("doan: a queued message does not fit its conversation's draft; dropped");
    }
    // Agent rows wait for the conversation's next done turn, one that was on its way out included.
    this.file.queued = Object.fromEntries(left.flatMap(([id, items]) => {
      const kept = agentRows(items).map(({ sending: _sending, ...item }) => item);
      return kept.length ? [[id, kept]] : [];
    }));
    this.save();
  }
  // The messages still waiting, without those whose send has started.
  queued(id: string): readonly QueuedItem[] { return (this.file.queued[id] ?? []).filter(item => !item.sending); }
  // Refused (queue_limit) before any change when draft, held send, queue and item would not fit one message or the file limit; throws
  // when the queue cannot be saved. first: ahead of the waiting ones (a usage-limited turn's own message).
  add(id: string, item: QueuedItem, first = false): void {
    if (this.broken || id in this.unread.queued || id in this.unread.returned) throw new Error("Conversation drafts are damaged");
    // The reader would leave such a conversation unread.
    if (item.origin && !agentParts({ ...item })) throw new Error("bad_request");
    const before = this.file.queued[id], after = first ? [item, ...before ?? []] : [...before ?? [], item];
    if (!this.fitsQueue(id, after)) throw new Error("queue_limit");
    this.file.queued[id] = after;
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
  // The waiting messages that go out next (all of them unless pick names fewer, queue.ts nextQueued), now marked as on
  // their way out.
  markSending(id: string, pick: (items: readonly QueuedItem[]) => readonly QueuedItem[] = items => items): QueuedItem[] {
    const items = pick(this.queued(id));
    if (!items.length) return [];
    const ids = new Set(items.map(item => item.itemId));
    this.file.queued[id] = (this.file.queued[id] ?? []).map(item => item.sending || !ids.has(item.itemId) ? item : { ...item, sending: true });
    this.save();
    return [...items];
  }
  // Only this waiting message, marked as on its way out (Send now); false when it is missing or already marked.
  markOneSending(id: string, itemId: string): boolean { return this.setSending(id, itemId, true); }
  // The refused or ended send of that one message: it waits again where it was.
  unmarkSending(id: string, itemId: string): boolean { return this.setSending(id, itemId, false); }
  private setSending(id: string, itemId: string, on: boolean): boolean {
    const before = this.file.queued[id];
    if (!before?.some(item => item.itemId === itemId && Boolean(item.sending) !== on)) return false;
    this.file.queued[id] = before.map(item => {
      if (item.itemId !== itemId) return item;
      if (on) return { ...item, sending: true };
      const { sending: _sending, ...rest } = item;
      return rest;
    });
    this.save();
    return true;
  }
  // Their send was accepted: they are in the conversation's history now.
  sent(id: string, itemIds: readonly string[]): void {
    const left = (this.file.queued[id] ?? []).filter(item => !itemIds.includes(item.itemId));
    if (left.length) this.file.queued[id] = left; else delete this.file.queued[id];
    this.save();
  }
  // A handoff's queue: the waiting messages go behind the conversation that took the work over, in one write. Those on
  // their way out stay with their send. One that would not fit there as add() judges (the person may have used the
  // target since its start) joins the source's returned draft instead, which the source's own bound already covers.
  // Agent rows stay with the conversation they were sent to.
  move(from: string, to: string): { moved: QueuedItem[]; returned: QueuedItem[] } {
    const items = personRows(this.queued(from));
    if (!items.length) return { moved: [], returned: [] };
    const left = (this.file.queued[from] ?? []).filter(item => item.sending || item.origin);
    if (left.length) this.file.queued[from] = left; else delete this.file.queued[from];
    const moved: QueuedItem[] = [], returned: QueuedItem[] = [];
    const damaged = this.broken || to in this.unread.queued || to in this.unread.returned;
    for (const item of items) {
      const before = this.file.queued[to];
      if (!damaged && this.fitsQueue(to, [...before ?? [], item])) {
        this.file.queued[to] = [...before ?? [], item];
        if (this.bytes() <= this.fileBytes) { moved.push(item); continue; }
        this.restore(to, before);
      }
      this.merge(from, { text: item.text, anchors: item.anchors, attachments: item.attachments }, "queue_limit");
      returned.push(item);
    }
    this.save();
    return { moved, returned };
  }
  // The person's queued messages back as one draft (those on their way out first, as queued), in one write; false when
  // there are none. Agent rows stay queued, one on its way out waiting again.
  giveBackQueued(id: string, reason: string): boolean {
    const items = this.file.queued[id] ?? [], mine = personRows(items), agents = agentRows(items);
    if (!mine.length && !agents.some(item => item.sending)) return false;
    const kept = agents.map(({ sending: _sending, ...item }) => item);
    if (kept.length) this.file.queued[id] = kept; else delete this.file.queued[id];
    if (mine.length) this.merge(id, joined(mine), reason);
    this.save();
    return mine.length > 0;
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
  // Never throws: a message that cannot be held still goes out; only a quit before its acceptance would then lose it.
  hold(key: string, message: HeldMessage): void {
    if (this.broken) return;
    this.file.sending[key] = message;
    if (this.bytes() > this.fileBytes) { delete this.file.sending[key]; console.error("doan: a sent message could not be held; drafts file full"); return; }
    this.save();
  }
  // Its send or start was accepted or refused: the history or the composer has it now.
  release(key: string): void { if (!(key in this.file.sending)) return; delete this.file.sending[key]; this.save(); }
  // The starts of root (on canvas, or on none) a previous run ended before acceptance, joined into one draft, once. A
  // canvas matches by its id when both have one, else by its path. Throws when the hand-over cannot be saved, and keeps them.
  takeStart(rootPath: string, canvas?: Canvas): ReturnedDraft | null {
    const keys = Object.keys(this.file.starts).filter(key => startOn(this.file.starts[key]!, rootPath, canvas));
    if (!keys.length) return null;
    const before = { ...this.file.starts };
    for (const key of keys) delete this.file.starts[key];
    try { this.write(); } catch (error) { this.file.starts = before; throw error; }
    return { ...joined(keys.map(key => before[key]!)), reason: "restarted" };
  }
  // The canvas went to the Trash or the project was removed, so no composer will take these. Never throws: the move or
  // removal already happened; an unsent paste is removed by the next launch's attachment cleanup.
  discardCanvasStarts(rootPath: string, canvas: Canvas): void { this.discardStarts(start => startOn(start, rootPath, canvas)); }
  discardRootStarts(roots: readonly string[]): void { this.discardStarts(start => roots.includes(start.root)); }
  private discardStarts(gone: (start: ReturnedStart) => boolean): void {
    const keys = Object.keys(this.file.starts).filter(key => gone(this.file.starts[key]!));
    if (!keys.length) return;
    for (const key of keys) delete this.file.starts[key];
    this.save();
  }
  // A deleted conversation's queue and returned draft go with it, unread entries and items on their way out included
  // (a deletion waits for the turn to end, so none should be left). Never throws: the deletion is already committed.
  discard(id: string): void {
    const maps = [this.file.queued, this.file.returned, this.unread.queued, this.unread.returned];
    if (!maps.some(map => Object.hasOwn(map, id))) return;
    for (const map of maps) delete map[id];
    this.save();
  }
  private merge(id: string, draft: DraftParts, reason: string): void {
    const earlier = this.file.returned[id];
    this.file.returned[id] = { ...(earlier ? joined([earlier, draft]) : draft), reason };
  }
  // The conversation's returned draft, held sends and this queue, joined in the order the next start merges them, fit one message.
  private fitsQueue(id: string, queue: readonly QueuedItem[]): boolean {
    const earlier = this.file.returned[id];
    const held = Object.values(this.file.sending).filter(message => "conversationId" in message && message.conversationId === id);
    return fits(joined([...(earlier ? [earlier] : []), ...held, ...personRows(queue)]));
  }
  private restore(id: string, items: QueuedItem[] | undefined): void { if (items) this.file.queued[id] = items; else delete this.file.queued[id]; }
  private save(): void { try { this.write(); } catch (error) { console.error("doan: conversation drafts could not be saved", error); } }
  // The file as written, unreadable conversations kept as they were.
  private serialized(file: DraftsFile): string {
    const queued = Object.fromEntries(Object.entries(file.queued).filter(([, items]) => items.length > 0));
    // Held and returned starts only when there are any, so older builds still read a file without them.
    const sending = Object.keys(file.sending).length ? { sending: file.sending } : {}, starts = Object.keys(file.starts).length ? { starts: file.starts } : {};
    return JSON.stringify({ v: 1, queued: { ...this.unread.queued, ...queued }, returned: { ...this.unread.returned, ...file.returned }, ...sending, ...starts });
  }
  // The most the file can take for what is accepted now: each conversation in its larger form, the queue all marked sending
  // beside its draft or one draft holding all of it with the longest reason, so no later write passes the reader's limit.
  private bytes(): number {
    const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
    const reason = "x".repeat(64);
    // A held message is written once more at the next start, as a draft of the same size or smaller.
    let total = size({ v: 1, queued: this.unread.queued, returned: this.unread.returned, sending: this.file.sending, starts: this.file.starts });
    for (const id of new Set([...Object.keys(this.file.queued), ...Object.keys(this.file.returned)])) {
      const items = this.file.queued[id] ?? [], earlier = this.file.returned[id];
      // A queue emptied by removals or sends is not written (serialized) and reserves nothing.
      if (!items.length && !earlier) continue;
      // "id": plus the comma that follows a member.
      const key = size(id) + 2;
      const asQueue = (items.length ? key + size(items.map(item => ({ ...item, sending: true }))) : 0) + (earlier ? key + size({ ...earlier, reason }) : 0);
      // Agent rows never join the draft: they stay a queue beside it.
      const agents = agentRows(items), asDraft = key + size({ ...joined([...(earlier ? [earlier] : []), ...personRows(items)]), reason }) +
        (agents.length ? key + size(agents.map(item => ({ ...item, sending: true }))) : 0);
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
