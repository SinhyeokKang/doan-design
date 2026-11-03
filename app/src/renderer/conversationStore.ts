import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { Anchor, AttachmentRecord, ConversationEvent } from "../main/conversation/types";
import { fromMessage, normalize, plainText, type FieldSegment } from "./anchorField";
import { ATTACHMENT_LIMIT_TEXT } from "./canvasConversation";
import { mergeConversationEvents } from "./conversationStrip";
import { EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import { splitRequest, type AttachmentDraft } from "./homeComposer";

// What the Overview's main conversation and the canvas panel share (buzz-canvas-conversation design §1): the threads
// read and merged with live events, the composer drafts by draftKey, queued messages, returned drafts and the
// providers of conversations started here. One store serves both screens, so a conversation's thread and draft are
// the same wherever it shows. Which conversation shows, seen marks and navigation stay with each screen's run.

export type ListView = readonly ConversationSummary[] | "loading" | "error";
// liveAfter: the history's last seq; a permission request after it arrived while the thread was open.
export interface Thread { events: ConversationEvent[]; read: "loading" | "error" | "ready"; liveAfter: number }
// sending: Send now put this message into the running turn and its answer has not come back (queue-send-now).
export interface QueuedMessage { id: string; text: string; sending?: boolean }

export interface ConversationStoreHost {
  list(root: string): ListView;
  // HomeRun's counts of the root's list reads: started so far, and the number of the last one that answered.
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  // A notice about a draft main gave back (a queue with more files than a message takes).
  notice(text: string): void;
  changed(): void;
}

const ATTACH_ERRORS: Record<string, (name: string) => string> = {
  not_found: name => `${name} wasn’t found, so it wasn’t attached.`,
  not_file: name => `${name} isn’t a file, so it wasn’t attached.`,
  not_image: name => `${name} isn’t a readable image, so it wasn’t attached.`,
  unreadable: name => `${name} couldn’t be read, so it wasn’t attached.`,
  too_large: () => "This image is over 50 MB, so it wasn’t attached.",
};

export class ConversationStore {
  // Drafts by draftKey: a conversation's under its id, a new conversation's under its root or canvas.
  drafts: ReadonlyMap<string, DockedDraft> = new Map();
  private threads = new Map<string, Thread>();
  private unclaimed: ConversationEvent[] = [];
  private queues = new Map<string, { root: string; items: QueuedMessage[]; after: number }>();
  private taking = new Set<string>();
  // A returned draft taken, by the reads started then: the list still says so until a later read.
  private taken = new Map<string, number>();
  // Providers of conversations started here, before a list names them.
  private providers = new Map<string, Provider>();
  // Each screen's run hears a thread change for its own seen and promotion rules: "read" once its history was read,
  // "event" for each live event merged into it.
  private listeners = new Set<(conversationId: string, change: "read" | "event") => void>();

  constructor(private host: ConversationStoreHost) {}

  subscribe(listener: (conversationId: string, change: "read" | "event") => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  thread(conversationId: string): Thread | null { return this.threads.get(conversationId) ?? null; }
  providerOf(conversationId: string): Provider | null { return this.providers.get(conversationId) ?? null; }
  started(conversationId: string, provider: Provider): void { this.providers.set(conversationId, provider); }
  queue(conversationId: string): readonly QueuedMessage[] { return this.queues.get(conversationId)?.items ?? []; }
  queued(root: string, conversationId: string, item: QueuedMessage): void {
    const queue = this.queues.get(conversationId);
    this.queues.set(conversationId, { root, items: [...queue?.items ?? [], item], after: this.host.readsStarted(root) });
    this.host.changed();
  }
  unqueued(conversationId: string, itemId: string): void {
    const queue = this.queues.get(conversationId);
    if (!queue) return;
    this.queues.set(conversationId, { ...queue, items: queue.items.filter(item => item.id !== itemId) });
    this.host.changed();
  }
  // Send now: one queued message into the running turn. Main answers once the agent read it (the row leaves) or the
  // message stayed queued (refused, or the turn ended first); until then the row shows Sending… on either screen.
  async sendQueuedNow(conversationId: string, itemId: string): Promise<void | { error: string }> {
    if (!this.markQueued(conversationId, itemId, true)) return { error: "stale" };
    const reply = await sendQueuedNow({ conversationId, itemId }).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) this.markQueued(conversationId, itemId, false);
    else this.unqueued(conversationId, itemId);
    return reply;
  }
  private markQueued(conversationId: string, itemId: string, sending: boolean): boolean {
    const queue = this.queues.get(conversationId);
    const item = queue?.items.find(entry => entry.id === itemId);
    if (!queue || !item || !!item.sending === sending) return false;
    this.queues.set(conversationId, { ...queue, items: queue.items.map(entry => entry === item ? { id: item.id, text: item.text, ...(sending ? { sending } : {}) } : entry) });
    this.host.changed();
    return true;
  }
  // A queue main already sent shows no more once a read started after the queue says so. Main's count leaves out the
  // message Send now has in flight, so that row stays until Send now's answer settles it.
  syncQueues(): void {
    for (const [id, queue] of this.queues) {
      const list = this.host.list(queue.root);
      const c = Array.isArray(list) ? list.find(item => item.conversationId === id) : undefined;
      if (!c || c.queued !== 0 || this.host.readsApplied(queue.root) <= queue.after) continue;
      const items = queue.items.filter(item => item.sending);
      if (items.length < queue.items.length) this.queues.set(id, { ...queue, items });
    }
  }
  setDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void {
    this.drafts = update(this.drafts);
    this.host.changed();
  }
  // Drafts whose key matches go (a removed project's).
  dropDrafts(drop: (key: string) => boolean): void {
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
    this.threads.set(conversationId, { ...thread, read: "loading" });
    this.readThread(conversationId);
    this.host.changed();
  }
  // Main's answers for files being added, applied to each chip in whichever draft holds it now (a promotion may have
  // moved it); a chip removed meanwhile releases its file. Image thumbnails and refusals go back to the caller.
  settleAttachments(keys: readonly string[], results: readonly (AttachmentResult | null)[]): { notices: string[]; images: { key: string; thumbnail: Uint8Array }[] } {
    const notices: string[] = [], images: { key: string; thumbnail: Uint8Array }[] = [];
    const drafts = new Map(this.drafts);
    keys.forEach((key, i) => {
      const result = results[i] ?? null;
      const owner = [...drafts].find(([, draft]) => draft.attachments.some(a => a.key === key));
      if (!owner) { if (result?.ok) void window.doan.removeAttachment(result.attachment.id).catch(() => false); return; }
      const [at, draft] = owner;
      const chip = draft.attachments.find(a => a.key === key)!;
      if (!result || !result.ok) {
        drafts.set(at, { ...draft, attachments: draft.attachments.filter(a => a.key !== key) });
        notices.push(result && !result.ok && result.error === "limit" ? "Only 10 files can be attached." : (ATTACH_ERRORS[result ? result.error : "unreadable"] ?? ATTACH_ERRORS.unreadable!)(result ? result.name : chip.name));
        return;
      }
      const { attachment } = result;
      if (attachment.kind === "image" && attachment.thumbnail) images.push({ key, thumbnail: attachment.thumbnail });
      const ready: AttachmentDraft = { key, id: attachment.id, name: attachment.name, kind: attachment.kind, pasted: attachment.pasted, status: "ready", size: attachment.size, path: attachment.path };
      drafts.set(at, { ...draft, attachments: draft.attachments.map(a => a.key === key ? ready : a) });
    });
    this.drafts = drafts;
    this.host.changed();
    return { notices, images };
  }
  // Edit and resend: the conversation's last request back in its draft, unless the person changed that draft while
  // its files were issued again. True when it was applied.
  async editAndResend(conversationId: string): Promise<boolean> {
    const message = [...this.threads.get(conversationId)?.events ?? []].reverse().find(event => event.type === "user.message");
    if (message?.type !== "user.message") return false;
    const key = `conversation:${conversationId}`, before = this.drafts.get(key);
    const restored = await draftFrom(message.text, message.anchors, message.attachments ?? []);
    if (this.drafts.get(key) !== before) {
      // Not applied: the files issued for it go back.
      for (const attachment of restored.attachments) if (attachment.id) void window.doan.removeAttachment(attachment.id).catch(() => false);
      return false;
    }
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
    const thread = this.threads.get(event.conversationId);
    if (!thread) { this.unclaimed = [...this.unclaimed, event].slice(-500); return; }
    this.threads.set(event.conversationId, { ...thread, events: mergeConversationEvents(thread.events, [event], event.conversationId) });
    this.tell(event.conversationId, "event");
    this.host.changed();
  }
  // Subscribed first (App), then read: events that came meanwhile merge by seq. True when the thread was already read.
  track(conversationId: string): boolean {
    if (this.threads.has(conversationId)) return this.threads.get(conversationId)!.read === "ready";
    const buffered = this.unclaimed.filter(event => event.conversationId === conversationId);
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.threads.set(conversationId, { events: mergeConversationEvents([], buffered, conversationId), read: "loading", liveAfter: Number.MAX_SAFE_INTEGER });
    this.readThread(conversationId);
    return false;
  }
  private readThread(conversationId: string): void {
    void window.doan.readConversation({ conversationId }).catch(() => ({ error: "unknown" })).then(reply => {
      const thread = this.threads.get(conversationId);
      if (!thread) return;
      if ("error" in reply) { this.threads.set(conversationId, { ...thread, read: "error" }); this.host.changed(); return; }
      const events = mergeConversationEvents(reply.events, thread.events, conversationId);
      this.threads.set(conversationId, { events, read: "ready", liveAfter: reply.lastSeq ?? events.at(-1)?.seq ?? 0 });
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
    const list = this.host.list(root);
    const c = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    if (!c?.returnedDraft || this.taking.has(conversationId)) return;
    const took = this.taken.get(conversationId);
    if (took !== undefined && this.host.readsApplied(root) <= took) return;
    this.taking.add(conversationId);
    void window.doan.takeConversationDraft({ conversationId }).catch(() => null).then(async reply => {
      this.taken.set(conversationId, this.host.readsStarted(root));
      if (!reply || "error" in reply) { this.taking.delete(conversationId); return; }
      const returned = await draftFrom(reply.text, reply.anchors, reply.attachments);
      this.taking.delete(conversationId);
      const key = `conversation:${conversationId}`;
      this.setDrafts(drafts => {
        const current = drafts.get(key) ?? EMPTY_DRAFT;
        // What the person typed meanwhile stays first; the returned text follows it. Chips stay segments, so the
        // returned draft's markers are not numbered against the current draft's.
        const between: FieldSegment[] = current.segments.length && returned.segments.length ? [{ kind: "text", text: "\n\n" }] : [];
        const segments = normalize([...current.segments, ...between, ...returned.segments]);
        return new Map(drafts).set(key, { ...current, segments, preset: current.preset ?? returned.preset, attachments: [...current.attachments, ...returned.attachments], shape: plainText(segments).includes("\n") || returned.attachments.length ? "box" : current.shape });
      });
      // main never refuses a send with attachment_limit; it only comes back as the reason a queue was returned.
      if (reply.reason === "attachment_limit") this.host.notice(ATTACHMENT_LIMIT_TEXT);
    });
  }
}

const emptyDraft = (draft: DockedDraft) => draft.segments.length === 0 && !draft.preset && draft.attachments.length === 0;

// TODO(queue-send-now phase 2): call window.doan.sendQueuedNow directly once the preload exposes it; until then an
// app without the method answers as main would for a conversation that cannot take the message.
function sendQueuedNow(request: { conversationId: string; itemId: string }): Promise<void | { error: string }> {
  const api = window.doan as unknown as { sendQueuedNow?(request: { conversationId: string; itemId: string }): Promise<void | { error: string }> };
  return api.sendQueuedNow ? api.sendQueuedNow(request) : Promise.resolve({ error: "not_running" });
}

// A request read back into a draft: the preset line becomes the chip, and recorded files are issued again from their
// paths (a moved file comes back as a missing chip). Shared by a returned queue and Edit and resend.
export async function draftFrom(text: string, anchors: readonly Anchor[], records: readonly AttachmentRecord[]): Promise<DockedDraft> {
  const { preset, body } = splitRequest(text, records.length);
  const issued = records.length ? await window.doan.attachmentsFromPaths(records.map(record => record.path)).catch(() => null) : [];
  const attachments = records.map((record, i): AttachmentDraft => {
    const result = issued?.[i];
    const key = crypto.randomUUID();
    if (result?.ok) return { key, id: result.attachment.id, name: result.attachment.name, kind: result.attachment.kind, pasted: result.attachment.pasted, status: "ready", size: result.attachment.size, path: result.attachment.path };
    return { key, name: record.name, kind: record.kind, pasted: false, status: "missing", size: record.size, path: record.path };
  });
  return { segments: fromMessage(body, anchors), preset: preset ? { ...preset, description: "", scope: "" } : null, attachments, shape: body.includes("\n") || attachments.length ? "box" : "capsule" };
}
