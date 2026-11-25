import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { BoundaryKind } from "../main/conversation/commandRecords";
import type { Anchor, AttachmentRecord, BoundarySignal, Canvas, ConversationEvent, StageSignal } from "../main/conversation/types";
import { fromMessage, normalize, plainText, type FieldSegment } from "./anchorField";
import { ATTACHMENT_LIMIT_TEXT } from "./canvasConversation";
import type { SteerPhase } from "../main/conversation/steerSupport";
import { asksPerson, stripState } from "./conversationStrip";
import { mergeEvents } from "../main/conversation/state";
import { draftKey, EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import { EMPTY_QUESTION_DRAFT, questionDraft, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import { attachRefusal, isPastedText, issuedAttachment, readyAttachment, recordedAttachment, splitRequest, type AttachmentDraft } from "./homeComposer";
import type { SendingMessage, SentFile } from "./threadItems";
import { newerStage } from "./turnStatus";
import { messageLine } from "../main/conversation/messageText";
import { REPLACE_DRAFT, type ReplaceDraftConfirm } from "./homeConversations";
import { stripRequestLines } from "../main/conversation/requestLines";
import { STALE_MODE_CARD, type CommandCard } from "./commandView";
import { commandName } from "../main/conversation/providerCommands";
import type { LocalSend } from "./threadMotion";
import type { DoanApi } from "../preload";

// What the Overview's main conversation and the canvas panel share: the threads
// read and merged with live events, the composer drafts by draftKey, queued messages, returned drafts and the
// providers of conversations started here. One store serves both screens, so a conversation's thread and draft are
// the same wherever it shows. Which conversation shows, seen marks and navigation stay with each screen's run.

export type ListView = readonly ConversationSummary[] | "loading" | "error";
// liveAfter: the history's last seq; a permission request after it arrived while the thread was open.
// retrying: a Retry's read of a thread that failed is out, so its notice stays with Retry busy; failures: the Retries
// that failed in a row (the notice reads its line again on each, DESIGN 'Busy action').
export interface Thread { events: ConversationEvent[]; read: "loading" | "error" | "retrying" | "ready"; liveAfter: number; failures?: number }
// text: the row's line. message: the request itself, which the thread draws once Send now moves it there; without it
// the thread shows the line alone.
// turnId: the failed turn whose own message this row sends again at the usage limit's reset.
export interface QueuedMessage { id: string; text: string; message?: { text: string; anchors: readonly Anchor[]; attachments: readonly SentFile[] }; turnId?: string }
// pressed: Send now put this message into the running turn and main has not answered; the press's order. The item
// keeps its place in the queue, so a refusal puts its row back where it was.
type Held = QueuedMessage & { pressed?: number };

// The store's calls to main: `window.doan` in the main window, the same members of `window.doanPrototype` in the
// prototype window, which has no `window.doan`.
export type StoreCalls = Pick<DoanApi, "readConversation" | "takeConversationDraft" | "sendQueuedNow" | "scheduledMessages" |
  "removeAttachment" | "releaseAttachments" | "recheckAttachments" | "attachmentsFromPaths"> &
  // Only the main window takes a start's message a quit stopped; the prototype window has no such call.
  Partial<Pick<DoanApi, "takeStartDraft">>;

export interface ConversationStoreHost {
  list(root: string): ListView;
  // HomeRun's counts of the root's list reads: started so far, and the number of the last one that answered.
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  // A notice about a draft main gave back (a queue with more files than a message takes).
  notice(text: string): void;
  changed(): void;
  // False while this store's window should leave a returned queue to the other window (the prototype window's folded
  // panel: nobody would see it there).
  takesDrafts?(): boolean;
}

export class ConversationStore {
  // Drafts by draftKey: a conversation's under its id, a new conversation's under its root or canvas.
  drafts: ReadonlyMap<string, DockedDraft> = new Map();
  private threads = new Map<string, Thread>();
  private unclaimed: ConversationEvent[] = [];
  // turn: the history's current turn when the last message was queued, the one the queue goes out after; null while
  // the history was not read.
  private queues = new Map<string, { root: string; items: Held[]; after: number; turn: string | null }>();
  private presses = 0;
  private taking = new Set<string>();
  // A returned draft taken, by the reads started then: the list still says so until a later read.
  private taken = new Map<string, number>();
  // New conversation drafts whose start message main was asked for: it hands one over once, so once a run is enough.
  private startsAsked = new Map<string, symbol>();
  // Providers of conversations started here, before a list names them.
  private providers = new Map<string, Provider>();
  // Each screen's run hears a thread change for its own seen and draft rules: "read" once its history was read,
  // "event" for each live event merged into it.
  private listeners = new Set<(conversationId: string, change: "read" | "event") => void>();
  // The hosts drawing a conversation (the Overview, the canvas panels) hear each live event merged into its thread:
  // a streamed delta reaches them only this way, since it leaves the store's host alone.
  private threadListeners = new Map<string, Set<() => void>>();
  // Between conversation:delete and its reply: the reply and main's list notice come in either order (POSTMORTEM
  // 2026-10-26), so a list without the conversation is not read as it having gone.
  private deletingIds = new Set<string>();
  // Deleted in this run: an event that arrives late is dropped rather than kept for a read that would bring it back.
  private deletedIds = new Set<string>();
  // The answers being chosen on question cards, by conversation and request: kept across
  // the thread's redraw for another conversation or canvas, gone once the question is resolved; not across a reload.
  private questions = new Map<string, Map<string, QuestionDraft>>();
  // Each conversation's latest stage signal, pushed or on a read's reply. Kept for a
  // conversation not read yet as its events are; the indicator uses it only for the turn and seq it names.
  private stages = new Map<string, StageSignal>();
  // The schedule (its time and count) each scheduled conversation's rows were last asked for, with that read's own
  // token. Every list read drops the ones the list moved past, shown or not, so the same time and count coming back
  // (a same-reset retry) is read again; only the read holding the current token may apply its answer.
  private schedules = new Map<string, { root: string; schedule: string; token: number }>();
  private scheduleReads = 0;
  // Each conversation's boundaries by turn: a read's (main rebuilds them from Doan's command turns, so they outlive a
  // restart) and this run's conversation:boundary signals, which may name the same turn in either order.
  private bounds = new Map<string, Map<string, BoundaryKind>>();
  // The card of a built-in Doan does not run, by draft key: this run only, shared by every screen showing the draft.
  private cards = new Map<string, CommandCard>();
  private pendingSends = new Map<string, { message: SendingMessage; after: number }[]>();
  // What this window sent, by conversation, for the thread's entry motion; a thread spends a mark once it drew the
  // history's message for it. queueMarks: the one message the queue goes out as after the turn, kept after its rows
  // go, since the rows may leave before that message arrives.
  private sends = new Map<string, LocalSend[]>();
  private queueMarks = new Map<string, LocalSend>();

  constructor(private host: ConversationStoreHost, private calls: StoreCalls) {}

  subscribe(listener: (conversationId: string, change: "read" | "event") => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeThread(conversationId: string, listener: () => void): () => void {
    const held = this.threadListeners.get(conversationId) ?? new Set();
    this.threadListeners.set(conversationId, held.add(listener));
    return () => { held.delete(listener); if (!held.size && this.threadListeners.get(conversationId) === held) this.threadListeners.delete(conversationId); };
  }
  thread(conversationId: string): Thread | null { return this.threads.get(conversationId) ?? null; }
  providerOf(conversationId: string): Provider | null { return this.providers.get(conversationId) ?? null; }
  started(conversationId: string, provider: Provider): void { this.providers.set(conversationId, provider); }
  // The rows: what Send now has in flight shows in the thread instead.
  queue(conversationId: string): readonly QueuedMessage[] {
    return (this.queues.get(conversationId)?.items ?? []).flatMap(({ pressed, ...item }) => pressed === undefined ? [item] : []);
  }
  // Messages Send now has in flight, in press order, for the end of the thread, then sends main has not answered.
  sending(conversationId: string): readonly SendingMessage[] {
    const events = this.threads.get(conversationId)?.events ?? [];
    const pending = (this.pendingSends.get(conversationId) ?? []).filter(send => !events.some(event => event.seq > send.after && event.type === "user.message")).map(send => send.message);
    return [...(this.queues.get(conversationId)?.items ?? []).filter(item => item.pressed !== undefined).sort((a, b) => a.pressed! - b.pressed!)
      .map(item => ({ id: item.id, ...item.message ?? { text: item.text, anchors: [], attachments: [] } })), ...pending];
  }
  // A send main has not answered yet: it may wait for the previous turn's handoffs to settle (at most 10 s) or process
  // before its turn starts, and the thread would show nothing meanwhile. It shows as sending until its turn's own message
  // arrives (`after`: the last event seen at the press) or the returned settle runs on main's answer.
  sendPending(conversationId: string, message: SendingMessage): () => void {
    const after = Math.max(0, ...(this.threads.get(conversationId)?.events ?? []).map(event => event.seq));
    const send = { message, after };
    this.pendingSends.set(conversationId, [...this.pendingSends.get(conversationId) ?? [], send]);
    this.host.changed();
    return () => {
      const left = (this.pendingSends.get(conversationId) ?? []).filter(item => item !== send);
      if (left.length) this.pendingSends.set(conversationId, left); else this.pendingSends.delete(conversationId);
      this.host.changed();
    };
  }
  // A send from this window: its mark draws nothing. after: the conversation's last seq (0 for a new conversation).
  // The returned call drops it, for a send main refused or scheduled.
  markSent(conversationId: string, text: string, after = this.lastSeq(conversationId)): () => void {
    const mark: LocalSend = { text, after };
    this.sends.set(conversationId, [...this.sends.get(conversationId) ?? [], mark]);
    return () => this.spendSends(conversationId, [mark]);
  }
  localSends(conversationId: string): readonly LocalSend[] {
    const sends = this.sends.get(conversationId) ?? [], queue = this.queueMarks.get(conversationId);
    return queue ? [...sends, queue] : sends;
  }
  spendSends(conversationId: string, marks: readonly LocalSend[]): void {
    const left = (this.sends.get(conversationId) ?? []).filter(mark => !marks.includes(mark));
    if (left.length) this.sends.set(conversationId, left); else this.sends.delete(conversationId);
    const queue = this.queueMarks.get(conversationId);
    if (queue && marks.includes(queue)) this.queueMarks.delete(conversationId);
  }
  private lastSeq(conversationId: string): number {
    return Math.max(0, ...(this.threads.get(conversationId)?.events ?? []).map(event => event.seq));
  }
  // The rows still queued go out after the turn as main's flush sends them: combined, a command alone (queue.ts).
  // syncQueues does not call it, so the mark outlives rows main already sent.
  private markQueue(conversationId: string): void {
    const queue = this.queues.get(conversationId), provider = this.providerOf(conversationId) ?? this.summaryOf(conversationId)?.provider;
    const items = (queue?.items ?? []).filter(item => item.pressed === undefined).map(item => item.message ?? { text: item.text, anchors: [], attachments: [] });
    if (items.length) this.queueMarks.set(conversationId, { text: queuedText(items, item => provider !== undefined && commandName(provider, item.text) !== null), after: this.lastSeq(conversationId) });
    else this.queueMarks.delete(conversationId);
  }
  private summaryOf(conversationId: string): ConversationSummary | undefined {
    const root = this.queues.get(conversationId)?.root, list = root === undefined ? null : this.host.list(root);
    return Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
  }
  queued(root: string, conversationId: string, item: QueuedMessage): void {
    const queue = this.queues.get(conversationId);
    this.queues.set(conversationId, { root, items: [...queue?.items ?? [], item], after: this.host.readsStarted(root), turn: this.currentTurn(conversationId) });
    this.markQueue(conversationId);
    this.host.changed();
  }
  unqueued(conversationId: string, itemId: string): void {
    const queue = this.queues.get(conversationId);
    if (!queue) return;
    this.queues.set(conversationId, { ...queue, items: queue.items.filter(item => item.id !== itemId) });
    this.markQueue(conversationId);
    this.host.changed();
  }
  // Send now: one queued message into the running turn. Its row leaves the queue at the press and the message shows at
  // the thread's end on either screen until main answers: once the agent read it (it goes; the history's own message
  // stays), or when it stayed queued (refused, or the turn ended first and main refused it then), which brings its
  // row back to its place.
  // A refusal also says whether the turn still runs as the store reads it then: an end event merged before the screen
  // drew it decides, not the last draw (only a running turn's refusal is said under the row).
  async sendQueuedNow(conversationId: string, itemId: string): Promise<void | { error: string; turnRuns?: boolean }> {
    const item = this.queues.get(conversationId)?.items.find(entry => entry.id === itemId);
    if (!item || !this.markQueued(conversationId, itemId, true)) return { error: "stale" };
    const unmark = this.markSent(conversationId, item.message?.text ?? item.text);
    const reply = await this.calls.sendQueuedNow({ conversationId, itemId }).catch(() => ({ error: "unknown" }));
    if (!reply || !("error" in reply)) { this.unqueued(conversationId, itemId); return reply; }
    unmark();
    this.markQueued(conversationId, itemId, false);
    return { error: reply.error, turnRuns: this.turnRuns(conversationId) };
  }
  private turnRuns(conversationId: string): boolean {
    const root = this.queues.get(conversationId)?.root;
    if (root === undefined) return false;
    const list = this.host.list(root);
    const summary = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    const phase = steerPhaseOf(this.threads.get(conversationId)?.events ?? null, summary, this.live(root, conversationId));
    return phase === "running" || phase === "waiting";
  }
  private markQueued(conversationId: string, itemId: string, sending: boolean): boolean {
    const queue = this.queues.get(conversationId);
    const item = queue?.items.find(entry => entry.id === itemId);
    if (!queue || !item || (item.pressed !== undefined) === sending) return false;
    const { pressed: _, ...rest } = item;
    // Back in the queue: a read taken while it was in flight did not count it (main leaves out the message Send now
    // has in flight), so only a read started from now can say main sent it.
    const after = sending ? queue.after : this.host.readsStarted(queue.root);
    this.queues.set(conversationId, { ...queue, after, items: queue.items.map(entry => entry === item ? sending ? { ...rest, pressed: ++this.presses } : rest : entry) });
    this.markQueue(conversationId);
    this.host.changed();
    return true;
  }
  // A queue main already sent shows no more once a read started after the queue says so. Main's count leaves out the
  // message Send now has in flight, so that message stays until Send now's answer settles it. It also leaves out a queue
  // on its way out after its turn ended: while main still holds the conversation after that turn and gave nothing back
  // as a draft, the rows stay until the next turn opens, so the composer keeps Stop over them. Every read also forgets
  // the scheduled rows' reads the list moved past (readScheduled).
  syncQueues(): void {
    for (const [id, held] of this.schedules) if (this.scheduleOf(held.root, id) !== held.schedule) this.schedules.delete(id);
    for (const [id, queue] of this.queues) {
      const list = this.host.list(queue.root);
      const c = Array.isArray(list) ? list.find(item => item.conversationId === id) : undefined;
      if (!c || c.queued !== 0 || this.host.readsApplied(queue.root) <= queue.after) continue;
      const flushing = !c.returnedDraft && (queue.turn === null || this.currentTurn(id) === queue.turn) &&
        steerPhaseOf(this.threads.get(id)?.events ?? null, c, this.live(queue.root, id)) === "holding";
      if (flushing) continue;
      const items = queue.items.filter(item => item.pressed !== undefined);
      if (items.length < queue.items.length) this.queues.set(id, { ...queue, items });
    }
  }
  // A scheduled conversation's rows are main's: it schedules some by itself (a turn the usage limit stopped before any
  // work), and a reschedule moves them to a later time. Read when the list's schedule appears or changes, and put in as
  // the whole queue. main's count dips while a scheduled send goes out and comes back on a reschedule, so the rows'
  // read mark moves to the reads started from now (POSTMORTEM 2026-11-05).
  readScheduled(root: string, conversationId: string): void {
    const schedule = this.scheduleOf(root, conversationId);
    if (schedule === null) { this.schedules.delete(conversationId); return; }
    if (this.schedules.get(conversationId)?.schedule === schedule) return;
    const token = ++this.scheduleReads;
    this.schedules.set(conversationId, { root, schedule, token });
    void this.calls.scheduledMessages({ conversationId }).catch(error => { console.error(error); return null; }).then(reply => {
      if (this.schedules.get(conversationId)?.token !== token) return;
      // A failed read, or a list that moved on meanwhile, leaves the schedule to be read again on the next sync.
      if (!Array.isArray(reply) || this.scheduleOf(root, conversationId) !== schedule) { this.schedules.delete(conversationId); return; }
      if (this.deletedIds.has(conversationId)) return;
      const items = reply.map((item): QueuedMessage => ({ id: item.itemId, text: messageLine(stripRequestLines(item.text), item.anchors), message: { text: item.text, anchors: item.anchors, attachments: item.attachments }, ...(item.turnId ? { turnId: item.turnId } : {}) }));
      this.queues.set(conversationId, { root, items, after: this.host.readsStarted(root), turn: this.currentTurn(conversationId) });
      this.markQueue(conversationId);
      this.host.changed();
    });
  }
  private scheduleOf(root: string, conversationId: string): string | null {
    const list = this.host.list(root);
    const c = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    return c?.scheduledAt ? `${c.scheduledAt}\n${c.queued}` : null;
  }
  // The last turn failed and its own message waits in the queue to go out again at the reset: its Edit and resend would
  // send it twice, so it hides until that row is removed.
  resendHidden(conversationId: string): boolean {
    const ends = (this.threads.get(conversationId)?.events ?? []).filter(event => event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted");
    const end = ends.at(-1);
    return end?.type === "turn.failed" && (this.queues.get(conversationId)?.items ?? []).some(item => item.turnId === end.turnId);
  }
  questionDraft(conversationId: string, requestId: string): QuestionDraft {
    return this.questions.get(conversationId)?.get(requestId) ?? EMPTY_QUESTION_DRAFT;
  }
  editQuestion(conversationId: string, requestId: string, action: QuestionDraftAction): void {
    // A refusal that arrives after question.resolved (or the delete) cleared the draft would bring it back for good.
    if (this.deletedIds.has(conversationId) || this.resolvedQuestion(conversationId, requestId)) return;
    const before = this.questionDraft(conversationId, requestId), next = questionDraft(before, action);
    if (next === before) return;
    this.questions.set(conversationId, new Map(this.questions.get(conversationId)).set(requestId, next));
    this.host.changed();
  }
  private resolvedQuestion(conversationId: string, requestId: string): boolean {
    const events = this.threads.get(conversationId)?.events ?? this.unclaimed;
    return events.some(event => event.conversationId === conversationId && event.type === "question.resolved" && event.requestId === requestId);
  }
  setDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void {
    this.drafts = update(this.drafts);
    this.host.changed();
  }
  startDelete(conversationId: string): void { this.deletingIds.add(conversationId); }
  cancelDelete(conversationId: string): void { this.deletingIds.delete(conversationId); }
  deleting(conversationId: string): boolean { return this.deletingIds.has(conversationId); }
  // A list read before main deleted it still names it until the next read answers: picks leave it out.
  withoutDeleted(list: readonly ConversationSummary[]): readonly ConversationSummary[] {
    return list.filter(c => !this.deletedIds.has(c.conversationId));
  }
  // main deleted it: its thread, draft, returned draft and queue go. The new conversation's draft stays.
  deleted(conversationId: string): void {
    this.deletingIds.delete(conversationId);
    this.deletedIds.add(conversationId);
    this.dropDrafts(key => key === `conversation:${conversationId}`);
    this.threads.delete(conversationId);
    this.questions.delete(conversationId);
    this.stages.delete(conversationId);
    this.queues.delete(conversationId);
    this.sends.delete(conversationId);
    this.queueMarks.delete(conversationId);
    this.schedules.delete(conversationId);
    this.taking.delete(conversationId);
    this.taken.delete(conversationId);
    this.providers.delete(conversationId);
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.host.changed();
  }
  // Drafts whose key matches go (a removed project's), with every file they held.
  dropDrafts(drop: (key: string) => boolean): void {
    for (const key of this.startsAsked.keys()) if (drop(key)) this.startsAsked.delete(key);
    for (const [key, draft] of this.drafts) if (drop(key)) dropAll(this.calls, draft);
    this.drafts = new Map([...this.drafts].filter(([key]) => !drop(key)));
  }
  // The typed text, composition included, follows into another draft; the field element stays the same, so focus and
  // the IME are not cut. An empty draft leaves the destination's earlier one.
  moveDraft(from: string, to: string): void {
    const draft = this.drafts.get(from);
    if (!draft) return;
    const next = new Map(this.drafts);
    next.delete(from);
    if (!emptyDraft(draft)) next.set(to, draft);
    this.drafts = next;
  }
  retryThread(conversationId: string): void {
    const thread = this.threads.get(conversationId);
    if (!thread || thread.read !== "error") return;
    this.threads.set(conversationId, { ...thread, read: "retrying" });
    this.readThread(conversationId);
    this.host.changed();
  }
  // Main's answers for files being added, applied to each chip in whichever draft holds it now (a conversation gone
  // from the list may have moved it); a chip removed meanwhile releases its file. Image thumbnails and refusals go back to the caller.
  settleAttachments(keys: readonly string[], results: readonly (AttachmentResult | null)[]): { notices: string[]; images: { key: string; thumbnail: Uint8Array }[] } {
    const notices: string[] = [], images: { key: string; thumbnail: Uint8Array }[] = [];
    const drafts = new Map(this.drafts);
    keys.forEach((key, i) => {
      const result = results[i] ?? null;
      const owner = [...drafts].find(([, draft]) => draft.attachments.some(a => a.key === key));
      if (!owner) { if (result?.ok) void this.calls.removeAttachment(result.attachment.id).catch(() => false); return; }
      const [at, draft] = owner;
      const chip = draft.attachments.find(a => a.key === key)!;
      if (!result || !result.ok) {
        drafts.set(at, { ...draft, attachments: draft.attachments.filter(a => a.key !== key) });
        notices.push(attachRefusal(result ? result.error : "unreadable", result ? result.name : chip.name, isPastedText(chip) ? "pastedText" : "file"));
        return;
      }
      const { attachment } = result;
      if (attachment.kind === "image" && attachment.thumbnail) images.push({ key, thumbnail: attachment.thumbnail });
      const ready = readyAttachment(key, attachment);
      drafts.set(at, { ...draft, attachments: draft.attachments.map(a => a.key === key ? ready : a) });
    });
    this.drafts = drafts;
    this.host.changed();
    return { notices, images };
  }
  // Edit and resend asks first when the draft holds something other than the last request (a returned queue included),
  // as Home's Edit does; null when the draft is empty or already that request, so it is replaced at once.
  editAndResendConfirm(conversationId: string): ReplaceDraftConfirm | null {
    const message = [...this.threads.get(conversationId)?.events ?? []].reverse().find(event => event.type === "user.message");
    const draft = this.drafts.get(`conversation:${conversationId}`);
    if (message?.type !== "user.message" || !draft || emptyDraft(draft)) return null;
    const records = message.attachments ?? [];
    const { preset, body } = splitRequest(message.text, records.length);
    const same = JSON.stringify(normalize([...draft.segments])) === JSON.stringify(normalize(fromMessage(body, message.anchors)))
      && (draft.preset?.id ?? null) === (preset?.id ?? null)
      && draft.attachments.length === records.length && draft.attachments.every((a, i) => a.path === records[i]!.path);
    return same ? null : { ...REPLACE_DRAFT, body: "Your draft will be replaced by the last request you sent in this conversation." };
  }
  // Edit and resend: the conversation's last request back in its draft, unless the person changed that draft while
  // its files were issued again. True when it was applied.
  async editAndResend(conversationId: string): Promise<boolean> {
    const message = [...this.threads.get(conversationId)?.events ?? []].reverse().find(event => event.type === "user.message");
    if (message?.type !== "user.message") return false;
    const key = `conversation:${conversationId}`, before = this.drafts.get(key);
    const restored = await draftFrom(this.calls, message.text, message.anchors, message.attachments ?? []);
    if (this.drafts.get(key) !== before || this.deletedIds.has(conversationId)) {
      // Not applied: the files issued for it go back.
      for (const attachment of restored.attachments) if (attachment.id) void this.calls.removeAttachment(attachment.id).catch(() => false);
      return false;
    }
    // The restored chips are issued afresh, so every file of the replaced draft goes back.
    dropAll(this.calls, before);
    this.setDrafts(drafts => new Map(drafts).set(key, restored));
    return true;
  }
  // Whether main still works on the conversation's turn, as threadItems and the seen rule read it.
  live(root: string, conversationId: string): boolean {
    const thread = this.threads.get(conversationId);
    if (thread?.events.some(event => event.seq > thread.liveAfter)) return true;
    const list = this.host.list(root);
    const c = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    return !c || c.phase !== "ended" || c.working;
  }

  // conversation:event, subscribed at App mount so nothing is lost before a read.
  event(event: ConversationEvent): void {
    if (this.deletedIds.has(event.conversationId)) return;
    if (event.type === "question.resolved") this.questions.get(event.conversationId)?.delete(event.requestId);
    const thread = this.threads.get(event.conversationId);
    if (!thread) { this.unclaimed = [...this.unclaimed, event].slice(-500); return; }
    this.threads.set(event.conversationId, { ...thread, events: mergeEvents(thread.events, [event], event.conversationId) });
    // The flushed turn's start can arrive well before the list read that drops a flushing queue's rows; meanwhile
    // those rows would read the turn as running and offer Send now for the message it already carries. Only a start
    // ends the flushing hold, so other events (streamed deltas) skip the sync.
    if (event.type === "turn.started") this.syncQueues();
    this.tell(event.conversationId, "event");
    for (const listener of [...this.threadListeners.get(event.conversationId) ?? []]) listener();
    // A streamed delta arrives every few tens of milliseconds and changes only the reply's text, which only the
    // conversation's own hosts draw; redrawing the store's host (all of App) for each was the streaming cost.
    if (event.type !== "message.delta") this.host.changed();
  }
  // conversation:stage, and the stage a conversation:read reply carries once its events are merged: either may come
  // first (POSTMORTEM 2026-10-26), so newerStage orders them by rev against the history's current turn.
  stage(signal: StageSignal): void {
    if (this.deletedIds.has(signal.conversationId)) return;
    const held = this.stages.get(signal.conversationId) ?? null;
    const next = newerStage(held, signal, this.currentTurn(signal.conversationId));
    if (next === held || next === null) return;
    this.stages.set(signal.conversationId, next);
    this.host.changed();
  }
  stageOf(conversationId: string): StageSignal | null { return this.stages.get(conversationId) ?? null; }
  boundaries(conversationId: string): ReadonlyMap<string, BoundaryKind> { return this.bounds.get(conversationId) ?? NO_BOUNDARIES; }
  boundary(signal: BoundarySignal): void {
    if (this.deletedIds.has(signal.conversationId)) return;
    if (this.addBoundaries(signal.conversationId, [signal])) this.host.changed();
  }
  private addBoundaries(conversationId: string, boundaries: readonly { turnId: string; kind: BoundaryKind }[]): boolean {
    const held = this.bounds.get(conversationId);
    const fresh = boundaries.filter(boundary => held?.get(boundary.turnId) !== boundary.kind);
    if (fresh.length === 0) return false;
    // A new map, so a screen holding the last one sees the change.
    this.bounds.set(conversationId, new Map([...held ?? [], ...fresh.map(boundary => [boundary.turnId, boundary.kind] as const)]));
    return true;
  }
  card(key: string): CommandCard | null { return this.cards.get(key) ?? null; }
  showCard(key: string, card: CommandCard | null): void {
    if ((this.cards.get(key) ?? null) === card) return;
    if (card) this.cards.set(key, card); else this.cards.delete(key);
    this.host.changed();
  }
  private currentTurn(conversationId: string): string | null {
    const events = this.threads.get(conversationId)?.events ?? [];
    for (let i = events.length - 1; i >= 0; i--) if (events[i]!.type === "turn.started") return events[i]!.turnId;
    return null;
  }
  // Subscribed first (App), then read: events that came meanwhile merge by seq. True when the thread was already read.
  track(conversationId: string): boolean {
    if (this.threads.has(conversationId)) return this.threads.get(conversationId)!.read === "ready";
    const buffered = this.unclaimed.filter(event => event.conversationId === conversationId);
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.threads.set(conversationId, { events: mergeEvents([], buffered, conversationId), read: "loading", liveAfter: Number.MAX_SAFE_INTEGER });
    this.readThread(conversationId);
    return false;
  }
  private readThread(conversationId: string): void {
    void this.calls.readConversation({ conversationId }).catch(() => ({ error: "unknown" })).then(reply => {
      const thread = this.threads.get(conversationId);
      if (!thread) return;
      if ("error" in reply) {
        this.threads.set(conversationId, { ...thread, read: "error", failures: thread.read === "retrying" ? (thread.failures ?? 0) + 1 : 0 });
        this.host.changed();
        return;
      }
      // Declared required, but the reply crosses IPC and a partial one is tolerated.
      const tolerated: { lastSeq?: number; commands?: typeof reply.commands } = reply;
      const events = mergeEvents(reply.events, thread.events, conversationId);
      this.threads.set(conversationId, { events, read: "ready", liveAfter: tolerated.lastSeq ?? events.at(-1)?.seq ?? 0 });
      if (tolerated.commands) this.addBoundaries(conversationId, tolerated.commands.boundaries);
      // After the set: stage() reads the current turn from the merged history.
      if (reply.stage) this.stage(reply.stage);
      this.tell(conversationId, "read");
      this.host.changed();
    });
  }
  private tell(conversationId: string, change: "read" | "event"): void {
    for (const listener of this.listeners) listener(conversationId, change);
  }
  // Queued messages main handed back after a failed or stopped turn come into the conversation's draft once, while
  // the conversation shows (`root` is the root whose list names it).
  takeDraft(root: string, conversationId: string): void {
    if (this.host.takesDrafts?.() === false) return;
    const list = this.host.list(root);
    const c = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    if (!c?.returnedDraft || this.taking.has(conversationId)) return;
    const took = this.taken.get(conversationId);
    if (took !== undefined && this.host.readsApplied(root) <= took) return;
    this.taking.add(conversationId);
    void this.calls.takeConversationDraft({ conversationId }).catch(() => null).then(async reply => {
      this.taken.set(conversationId, this.host.readsStarted(root));
      if (!reply || "error" in reply) { this.taking.delete(conversationId); return; }
      const returned = await draftFrom(this.calls, reply.text, reply.anchors, reply.attachments, reply.ids);
      this.taking.delete(conversationId);
      if (this.deletedIds.has(conversationId)) {
        for (const attachment of returned.attachments) dropAttachment(this.calls, attachment);
        return;
      }
      this.addReturned(`conversation:${conversationId}`, returned);
      // main never refuses a send with attachment_limit; it only comes back as the reason a queue was returned.
      if (reply.reason === "attachment_limit") this.host.notice(ATTACHMENT_LIMIT_TEXT);
      // A queued /review main would not send in another permission mode than the thread was last told (Codex
      // review/start takes none): the text is back in the draft, and the card says why.
      // A copy: the composer says each card it is given once, by object.
      if (reply.reason === "command_mode_stale") this.showCard(`conversation:${conversationId}`, { ...STALE_MODE_CARD });
    });
  }
  // A new conversation's first message that a quit stopped before main accepted it, in an earlier run, comes into the
  // new conversation's draft of its root (on canvas) once, when that draft shows.
  takeStartDraft(root: string, canvas?: Canvas): void {
    const request = { root, ...(canvas ? { canvas } : {}) };
    const key = draftKey({ kind: "new", ...request });
    restoreStartDraft(this.calls, this.startsAsked, key, request, draft => this.addReturned(key, draft));
  }
  private addReturned(key: string, returned: DockedDraft): void {
    this.setDrafts(drafts => {
      const current = drafts.get(key) ?? EMPTY_DRAFT;
      // What the person typed meanwhile stays first; the returned text follows it. Chips stay segments, so the
      // returned draft's markers are not numbered against the current draft's.
      const between: FieldSegment[] = current.segments.length && returned.segments.length ? [{ kind: "text", text: "\n\n" }] : [];
      const segments = normalize([...current.segments, ...between, ...returned.segments]);
      return new Map(drafts).set(key, { ...current, segments, preset: current.preset ?? returned.preset, attachments: [...current.attachments, ...returned.attachments], shape: plainText(segments).includes("\n") || returned.attachments.length ? "box" : current.shape });
    });
  }
}

const NO_BOUNDARIES: ReadonlyMap<string, BoundaryKind> = new Map();

// The phase Send now reads, with turnOf's order: a turn that runs or waits for a
// permission answer has something to take the message; a judged turn with work left (a queue about to go out) and an
// ended one do not. The merged events' end wins over a list that has not caught up.
export function steerPhaseOf(events: readonly ConversationEvent[] | null, summary: ConversationSummary | undefined, live: boolean): SteerPhase {
  const kind = events && events.length ? stripState(events).kind : null;
  if (kind !== null && asksPerson(kind)) return "waiting";
  if ((kind === "starting" || kind === "working") && live) return "running";
  const ended = kind === "done" || kind === "failed" || kind === "interrupted";
  if (!ended && summary?.phase === "waiting") return "waiting";
  if (!ended && summary?.phase === "running") return "running";
  return summary?.working ? "holding" : "ended";
}
// A chip leaving a conversation draft gives its file back to main. A held id is released after the remove, which put it
// back aside as sent; a pasted file stays on disk under its sent marker.
export function dropAttachment(calls: Pick<StoreCalls, "removeAttachment" | "releaseAttachments">, attachment: AttachmentDraft): void {
  const id = attachment.id; if (!id) return;
  const removed = calls.removeAttachment(id);
  void (attachment.held ? removed.then(() => calls.releaseAttachments([id])) : removed).catch(console.error);
}
// The text main's flush sends for these queued messages: main/conversation/queue.ts nextQueued and combineQueued,
// which the renderer cannot import (attachments.ts reaches Node modules). A command goes alone; the messages before the
// next command go together, a blank line apart, each one's {{n}} moved past the anchors before it.
function queuedText(items: readonly { text: string; anchors: readonly Anchor[] }[], isCommand: (item: { text: string }) => boolean): string {
  const end = items.findIndex(isCommand);
  const next = end === 0 ? items.slice(0, 1) : items.slice(0, end === -1 ? items.length : end);
  let offset = 0;
  return next.map(item => {
    const text = item.text.replace(/\{\{([1-9][0-9]*)\}\}/g, (_match, n: string) => `{{${Number(n) + offset}}}`);
    offset += item.anchors.length;
    return text;
  }).join("\n\n");
}
// A draft dropped or replaced whole gives back every file it held: a pasted image is deleted, a returned queue's id
// released (main attachments.ts remove).
function dropAll(calls: StoreCalls, draft: DockedDraft | undefined): void {
  for (const attachment of draft?.attachments ?? []) dropAttachment(calls, attachment);
}
const emptyDraft = (draft: DockedDraft) => draft.segments.length === 0 && !draft.preset && draft.attachments.length === 0;

// Remove invalidates a take even if the same key has been registered and asked for again before main answers.
export function restoreStartDraft(calls: StoreCalls, asked: Map<string, symbol>, key: string, request: { root: string; canvas?: Canvas }, restore: (draft: DockedDraft) => void): void {
  if (!calls.takeStartDraft || asked.has(key)) return;
  const token = Symbol();
  asked.set(key, token);
  void calls.takeStartDraft(request).catch(() => ({ error: "unknown" })).then(async reply => {
    if (asked.get(key) !== token || !reply) return;
    // Main keeps a draft it could not hand over, so a later visit asks again.
    if ("error" in reply) { asked.delete(key); return; }
    const draft = await draftFrom(calls, reply.text, reply.anchors, reply.attachments);
    if (asked.get(key) === token) restore(draft);
    else dropAll(calls, draft);
  });
}

// A request read back into a draft: the preset line becomes the chip, and recorded files are issued again from their
// paths (a moved file comes back as a missing chip). Shared by a returned queue and Edit and resend. held: per record,
// the id a queue returned in this run held it as (takeDraft's ids); that one is checked again as the same file or
// folder, so one replaced since comes back Replaced.
export async function draftFrom(calls: StoreCalls, text: string, anchors: readonly Anchor[], records: readonly AttachmentRecord[], held: readonly (string | null)[] = []): Promise<DockedDraft> {
  const { preset, body } = splitRequest(text, records.length);
  const heldIds = records.flatMap((_, i) => { const id = held[i]; return id ? [id] : []; }), fresh = records.filter((_, i) => !held[i]);
  const [rechecked, issued] = await Promise.all([
    heldIds.length ? calls.recheckAttachments(heldIds).catch(() => null) : [],
    fresh.length ? calls.attachmentsFromPaths(fresh.map(record => record.path), fresh.map(({ lines, excerpt }) => ({ ...(lines === undefined ? {} : { lines }), ...(excerpt === undefined ? {} : { excerpt }) }))).catch(() => null) : [],
  ]);
  let next = 0;
  const attachments = records.map((record, i): AttachmentDraft => {
    const key = crypto.randomUUID(), id = held[i];
    if (id) {
      const result = rechecked?.find(item => item.id === id);
      return { ...result?.ok ? readyAttachment(key, result.attachment) : { ...recordedAttachment(key, record), id, ...(result?.error === "replaced" ? { status: "replaced" as const } : {}) }, held: true };
    }
    const { chip, release } = issuedAttachment(key, record, issued?.[next++]);
    if (release) void calls.removeAttachment(release).catch(() => false);
    return chip;
  });
  return { segments: fromMessage(body, anchors), preset: preset ? { ...preset, description: "", scope: "" } : null, attachments, shape: body.includes("\n") || attachments.length ? "box" : "capsule" };
}
