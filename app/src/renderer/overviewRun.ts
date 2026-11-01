import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { fromMessage, normalize, plainText, type FieldSegment } from "./anchorField";
import { mergeConversationEvents } from "./conversationStrip";
import { EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import { splitRequest, type AttachmentDraft } from "./homeComposer";
import { overviewAfterListChange, pickOverviewConversation, type DraftMove } from "./overviewConversation";
import type { ThreadItem } from "./threadItems";

// The project Overview's main conversation (buzz-project design §2.4, §2.5; spec decisions 5, 6, 10, 11). App owns one
// for the run, so each root keeps what it showed, its new-conversation draft and its threads across worktree switches
// and visits. Everything is decided here so it can be driven without a DOM; the list reads, seen marks, memory and
// navigation are the host's (HomeRun and App).

export type ListView = readonly ConversationSummary[] | "loading" | "error";

export interface OverviewRunHost {
  list(root: string): ListView;
  // HomeRun's counts of the root's list reads: started so far, and the number of the last one that answered.
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  reread(root: string): void;
  // ui-state's conversationByRoot; null until ui-state was read, so a pick never runs ahead of the memory.
  remembered(): Readonly<Record<string, string>> | null;
  remember(root: string, conversationId: string | null): void;
  markSeen(conversationId: string, seq: number): void;
  focused(): boolean;
  // A requested conversation bound to a canvas opens that canvas (spec decision 4).
  openCanvas(root: string, canvas: Canvas): void;
  toast(message: string, action: string, run: () => void): void;
  label(root: string): string;
  changed(): void;
}

// Where the thread scrolls once it draws a requested conversation: its pending permission request.
export type ScrollTo = "permission";
export interface Moved { conversationId: string; title: string; canvas: Canvas }
export type OverviewView = { kind: "wait" } | { kind: "new"; moved: Moved | null } | { kind: "conversation"; conversationId: string };
// liveAfter: the history's last seq; a permission request after it arrived while the thread was open.
export interface Thread { events: ConversationEvent[]; read: "loading" | "error" | "ready"; liveAfter: number }
export interface QueuedMessage { id: string; text: string }

interface RootState {
  // undefined until a pick; a null conversation is the new conversation state. listed: seen in a list read.
  current?: { conversationId: string | null; listed: boolean };
  // Moves with every change of what the root shows, so a reply that lands after a newer choice leaves it alone;
  // intent moves only with the person's or an entry's choice (a pick, New, a request, a start), not with what a list
  // read did; leftAt: the intent when its Overview was last left.
  revision: number;
  intent: number;
  leftAt?: number;
  // asked: the list was read again for it once; after: reads started before the request.
  request: { conversationId: string; after: number; asked: boolean; scroll: ScrollTo | null } | null;
  moved: Moved | null;
}

const isMarker = (event: ConversationEvent) => event.type.startsWith("conversation.");
// main's own measure of what is to be seen (summary.ts lastTurnSeq): markers of binding, archiving and restoring are not.
function lastTurnSeq(events: readonly ConversationEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (!isMarker(events[i]!)) return events[i]!.seq;
  return null;
}
// The seq through which an ended turn can be seen: its end event is the last one. null while a turn runs or a new
// request waits for its turn; a turn nothing is live for anymore was cut by a quit or crash, and main counts it ended.
const TERMINAL: ReadonlySet<ConversationEvent["type"]> = new Set(["turn.done", "turn.failed", "interrupted"]);
function endSeq(events: readonly ConversationEvent[], live: boolean): number | null {
  const last = [...events].reverse().find(event => !isMarker(event));
  if (!last) return null;
  return TERMINAL.has(last.type) || !live ? last.seq : null;
}
const emptyDraft = (draft: DockedDraft) => draft.segments.length === 0 && !draft.preset && draft.attachments.length === 0;
const ATTACH_ERRORS: Record<string, (name: string) => string> = {
  not_found: name => `${name} wasn’t found, so it wasn’t attached.`,
  not_file: name => `${name} isn’t a file, so it wasn’t attached.`,
  not_image: name => `${name} isn’t a readable image, so it wasn’t attached.`,
  unreadable: name => `${name} couldn’t be read, so it wasn’t attached.`,
  too_large: () => "This image is over 50 MB, so it wasn’t attached.",
};

// Where a requested scroll goes once the thread draws: the pending permission request; wait while the list says the
// conversation waits but its event has not arrived; otherwise the request has nothing left to show.
export function scrollTarget(items: readonly ThreadItem[], waiting: boolean): { kind: "item"; key: string } | { kind: "wait" } | { kind: "drop" } {
  const ask = [...items].reverse().find(item => item.kind === "permission" && item.status === "pending");
  if (ask) return { kind: "item", key: ask.key };
  return waiting ? { kind: "wait" } : { kind: "drop" };
}

export class OverviewRun {
  // Drafts by draftKey: a conversation's under its id, a new conversation's under its root.
  drafts: ReadonlyMap<string, DockedDraft> = new Map();
  private roots = new Map<string, RootState>();
  private threads = new Map<string, Thread>();
  private unclaimed: ConversationEvent[] = [];
  private visible: string | null = null;
  // The turn end the person saw per conversation (shown in the main column with the window focused), as a seq.
  private seenEnd = new Map<string, number>();
  // Promoted conversations whose seen end is to be marked through their binding marker once it is merged.
  private promotions = new Map<string, number>();
  // Waiting conversations already toasted, by the request they wait on (the list's preview names it).
  private asked = new Map<string, string>();
  private queues = new Map<string, { root: string; items: QueuedMessage[]; after: number }>();
  private scroll: { conversationId: string; to: ScrollTo; seq: number } | null = null;
  private scrolls = 0;
  private taking = new Set<string>();
  // A returned draft taken, by the reads started then: the list still says so until a later read.
  private taken = new Map<string, number>();
  // Providers of conversations started here, before a list names them.
  private providers = new Map<string, Provider>();

  constructor(private host: OverviewRunHost) {}

  view(root: string): OverviewView {
    // A request held for the list keeps what shows; with nothing shown yet the column waits rather than flashing a
    // new conversation that then changes.
    const s = this.roots.get(root);
    if (!s?.current) return { kind: "wait" };
    return s.current.conversationId === null ? { kind: "new", moved: s.moved } : { kind: "conversation", conversationId: s.current.conversationId };
  }
  thread(conversationId: string): Thread | null { return this.threads.get(conversationId) ?? null; }
  providerOf(conversationId: string): Provider | null { return this.providers.get(conversationId) ?? null; }
  queue(conversationId: string): readonly QueuedMessage[] { return this.queues.get(conversationId)?.items ?? []; }
  // Each entry's scroll has its own seq, so asking again for the conversation already shown scrolls again.
  scrollRequest(conversationId: string): { to: ScrollTo; seq: number } | null {
    return this.scroll?.conversationId === conversationId ? { to: this.scroll.to, seq: this.scroll.seq } : null;
  }
  takeScroll(conversationId: string): void {
    if (this.scroll?.conversationId === conversationId) this.scroll = null;
  }
  revision(root: string): number { return this.state(root).revision; }

  // The root whose Overview is on screen, or null.
  show(root: string | null): void {
    if (root === this.visible) return;
    const left = this.visible ? this.roots.get(this.visible) : undefined;
    if (left) left.leftAt = left.intent;
    this.visible = root;
    if (root) {
      const s = this.state(root);
      // Reopened with nothing asked for it meanwhile: spec decision 5 picks again; the drafts by key stay.
      if (s.leftAt !== undefined && s.leftAt === s.intent && !s.request) { delete s.current; s.moved = null; }
      this.resolve(root, s);
    }
    this.checkSeen();
    this.host.changed();
  }
  focusChanged(): void { this.checkSeen(); }

  // The person's choice in the dropdown, New and ⌘N. A conversation switch does not enter Back/Forward (App's).
  select(root: string, conversationId: string | null): void {
    const s = this.state(root);
    s.request = null;
    s.revision++; s.intent++;
    if (conversationId === null) {
      s.moved = null;
      if (s.current?.conversationId !== null) { s.current = { conversationId: null, listed: false }; this.host.remember(root, null); }
    } else this.setCurrent(root, s, conversationId, true);
    this.host.changed();
  }
  // An entry point asks for a conversation (Home Send, a notification or toast, the busy line's Open): a canvas
  // conversation opens its canvas, a project conversation becomes the root's main conversation once listed.
  request(root: string, conversationId: string, scroll: ScrollTo | null): void {
    const s = this.state(root);
    // Accepted, it is a newer choice than a start or send still waiting for its reply, even while it waits for the list.
    s.revision++; s.intent++;
    s.request = { conversationId, after: this.host.readsStarted(root), asked: false, scroll };
    this.resolve(root, s);
    this.host.changed();
  }
  // A start from the new conversation state: shown at once, before any list has it. `revision` is the root's when the
  // start was sent; a newer choice (another conversation, New, an entry) keeps what it chose.
  started(root: string, conversationId: string, provider?: Provider, revision?: number): void {
    if (provider) this.providers.set(conversationId, provider);
    const s = this.state(root);
    if (revision !== undefined && revision !== s.revision) return;
    s.request = null;
    s.intent++;
    this.setCurrent(root, s, conversationId, false);
    this.host.changed();
  }
  sent(root: string, conversationId: string, revision?: number): void {
    const s = this.state(root);
    if (revision !== undefined && revision !== s.revision) return;
    s.moved = null;
    this.host.remember(root, conversationId);
    this.host.changed();
  }
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
  setDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void {
    this.drafts = update(this.drafts);
    this.host.changed();
  }
  retryThread(conversationId: string): void {
    const thread = this.threads.get(conversationId);
    if (!thread || thread.read !== "error") return;
    this.threads.set(conversationId, { ...thread, read: "loading" });
    this.readThread(conversationId);
    this.host.changed();
  }
  // A removed project keeps no memory in this run either.
  forgetRoots(roots: readonly string[]): void {
    for (const root of roots) {
      this.roots.delete(root);
      if (this.visible === root) this.visible = null;
    }
    this.drafts = new Map([...this.drafts].filter(([key]) => !roots.some(root => key === `root:${root}`)));
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
  // its files were issued again. True when the field should take focus: the same conversation still shows.
  async editAndResend(root: string, conversationId: string): Promise<boolean> {
    const message = [...this.threads.get(conversationId)?.events ?? []].reverse().find(event => event.type === "user.message");
    if (message?.type !== "user.message") return false;
    const key = `conversation:${conversationId}`, before = this.drafts.get(key), revision = this.state(root).revision;
    const restored = await draftFrom(message.text, message.anchors, message.attachments ?? []);
    if (this.drafts.get(key) !== before) {
      // Not applied: the files issued for it go back.
      for (const attachment of restored.attachments) if (attachment.id) void window.doan.removeAttachment(attachment.id).catch(() => false);
      return false;
    }
    this.setDrafts(drafts => new Map(drafts).set(key, restored));
    const s = this.roots.get(root);
    return this.visible === root && s?.revision === revision && s.current?.conversationId === conversationId;
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
    this.markPromotion(event.conversationId);
    this.checkSeen();
    this.host.changed();
  }

  // After every list read HomeRun applied (and any change of the memory): picks waiting for the list, promotions,
  // the waiting toast and queues.
  sync(): void {
    // The host's calls (a reread, a seen mark) report back through HomeRun, which asks for another sync: that one
    // runs after this one instead of inside it.
    if (this.syncing) { this.again = true; return; }
    this.syncing = true;
    try { do { this.again = false; this.syncOnce(); } while (this.again); } finally { this.syncing = false; }
  }
  private syncing = false;
  private again = false;
  private syncOnce(): void {
    for (const [root, s] of this.roots) {
      this.resolve(root, s);
      const list = this.host.list(root);
      if (!Array.isArray(list)) continue;
      this.afterList(root, s, list);
      if (root === this.visible) this.toastWaiting(root, s, list);
      const shown = s.current?.conversationId;
      if (shown && this.threads.get(shown)?.read === "ready") this.takeDraft(shown);
    }
    for (const [id, queue] of this.queues) {
      const list = this.host.list(queue.root);
      const c = Array.isArray(list) ? list.find(item => item.conversationId === id) : undefined;
      if (c && c.queued === 0 && queue.items.length > 0 && this.host.readsApplied(queue.root) > queue.after) this.queues.set(id, { ...queue, items: [] });
    }
    this.checkSeen();
  }

  private state(root: string): RootState {
    let s = this.roots.get(root);
    if (!s) { s = { request: null, moved: null, revision: 0, intent: 0 }; this.roots.set(root, s); }
    return s;
  }
  private setCurrent(root: string, s: RootState, conversationId: string, listed: boolean): void {
    s.revision++;
    s.current = { conversationId, listed };
    s.moved = null;
    this.host.remember(root, conversationId);
    this.track(conversationId);
    this.checkSeen();
  }
  // Spec decision 5 through pickOverviewConversation. Only the first pick of a root reads the memory: after it the
  // person's choices hold, so a list read that lands later never replaces one (POSTMORTEM 2026-10-25).
  private resolve(root: string, s: RootState): void {
    const list = this.host.list(root);
    const read = Array.isArray(list) ? list : null;
    if (s.request) {
      const request = s.request;
      const pick = pickOverviewConversation(read, undefined, request.conversationId);
      if (pick.kind === "wait") return;
      if (pick.kind === "reread") {
        // A read started after the request still does not list it: main does not know it here.
        if (this.host.readsApplied(root) <= request.after) {
          if (!request.asked) { request.asked = true; this.host.reread(root); }
          return;
        }
        s.request = null;
      } else if (pick.kind === "conversation") {
        s.request = null;
        this.setCurrent(root, s, pick.conversationId, true);
        if (request.scroll) this.scroll = { conversationId: pick.conversationId, to: request.scroll, seq: ++this.scrolls };
        return;
      } else if (pick.kind === "canvas") {
        s.request = null;
        this.host.openCanvas(root, pick.canvas);
      }
    }
    const remembered = this.host.remembered();
    if (s.current !== undefined || !read || remembered === null) return;
    const pick = pickOverviewConversation(read, remembered[root], null);
    if (pick.kind === "conversation") this.setCurrent(root, s, pick.conversationId, true);
    else if (pick.kind === "new") {
      s.revision++;
      s.current = { conversationId: null, listed: false };
      if (pick.forget) this.host.remember(root, null);
    }
  }
  // Spec decision 6: a promoted or gone main conversation leaves the root in the new conversation state.
  private afterList(root: string, s: RootState, list: readonly ConversationSummary[]): void {
    const current = s.current;
    if (!current || current.conversationId === null) return;
    const id = current.conversationId;
    const change = overviewAfterListChange({ root, conversationId: id, listed: current.listed }, { root, list });
    if (change.kind === "keep") {
      if (list.some(c => c.conversationId === id)) current.listed = true;
      return;
    }
    this.moveDraft(change.draft);
    s.revision++;
    s.current = { conversationId: null, listed: false };
    this.host.remember(root, null);
    if (change.kind !== "promoted") return;
    s.moved = { conversationId: id, title: change.title, canvas: change.canvas };
    // Marked through the promotion marker only when the person had seen the turn's end (spec decision 11); the list
    // notice and the marker event come in either order (POSTMORTEM 2026-10-26).
    const thread = this.threads.get(id), seen = this.seenEnd.get(id);
    const end = thread ? lastTurnSeq(thread.events) : null;
    if (end !== null && seen !== undefined && seen >= end) { this.promotions.set(id, seen); this.markPromotion(id); }
  }
  private markPromotion(conversationId: string): void {
    const after = this.promotions.get(conversationId);
    if (after === undefined) return;
    const marker = this.threads.get(conversationId)?.events.find(event => event.type === "conversation.bound" && event.seq > after);
    if (!marker) return;
    this.promotions.delete(conversationId);
    this.host.markSeen(conversationId, marker.seq);
  }
  // The typed text, composition included, follows into the new conversation; the field element stays the same, so
  // focus and the IME are not cut. An empty conversation draft leaves the root's earlier one.
  private moveDraft({ from, to }: DraftMove): void {
    const draft = this.drafts.get(from);
    if (!draft) return;
    const next = new Map(this.drafts);
    next.delete(from);
    if (!emptyDraft(draft)) next.set(to, draft);
    this.drafts = next;
  }
  // Spec decision 10: another project conversation of the shown root waits while the main column shows something else.
  private toastWaiting(root: string, s: RootState, list: readonly ConversationSummary[]): void {
    const shown = s.current?.conversationId ?? null;
    for (const c of list) {
      if (c.phase !== "waiting") { this.asked.delete(c.conversationId); continue; }
      if (c.canvas || c.state !== "current" || c.conversationId === shown || this.asked.get(c.conversationId) === c.preview) continue;
      this.asked.set(c.conversationId, c.preview);
      this.host.toast(`${PROVIDER_NAMES[c.provider]} needs your answer in ${this.host.label(root)}.`, "Open", () => this.request(root, c.conversationId, "permission"));
    }
  }
  // Spec decision 11: seen only while it shows in the main column with the window focused; scrolled up or not.
  private checkSeen(): void {
    const root = this.visible;
    const id = root ? this.roots.get(root)?.current?.conversationId : null;
    if (!root || !id || !this.host.focused()) return;
    const thread = this.threads.get(id);
    if (thread?.read !== "ready") return;
    const end = endSeq(thread.events, this.live(root, id));
    if (end === null || (this.seenEnd.get(id) ?? 0) >= end) return;
    this.seenEnd.set(id, end);
    this.host.markSeen(id, end);
  }
  // Subscribed first (App), then read: events that came meanwhile merge by seq.
  private track(conversationId: string): void {
    if (this.threads.has(conversationId)) {
      if (this.threads.get(conversationId)!.read === "ready") this.takeDraft(conversationId);
      return;
    }
    const buffered = this.unclaimed.filter(event => event.conversationId === conversationId);
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.threads.set(conversationId, { events: mergeConversationEvents([], buffered, conversationId), read: "loading", liveAfter: Number.MAX_SAFE_INTEGER });
    this.readThread(conversationId);
  }
  private readThread(conversationId: string): void {
    void window.doan.readConversation({ conversationId }).catch(() => ({ error: "unknown" })).then(reply => {
      const thread = this.threads.get(conversationId);
      if (!thread) return;
      if ("error" in reply) { this.threads.set(conversationId, { ...thread, read: "error" }); this.host.changed(); return; }
      const events = mergeConversationEvents(reply.events, thread.events, conversationId);
      this.threads.set(conversationId, { events, read: "ready", liveAfter: reply.lastSeq ?? events.at(-1)?.seq ?? 0 });
      this.markPromotion(conversationId);
      this.checkSeen();
      this.takeDraft(conversationId);
      this.host.changed();
    });
  }
  // Queued messages main handed back after a failed or stopped turn come into the conversation's draft once.
  private takeDraft(conversationId: string): void {
    const root = [...this.roots].find(([, s]) => s.current?.conversationId === conversationId)?.[0];
    const list = root ? this.host.list(root) : null;
    const c = Array.isArray(list) ? list.find(item => item.conversationId === conversationId) : undefined;
    if (!root || !c?.returnedDraft || this.taking.has(conversationId)) return;
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
    });
  }
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
