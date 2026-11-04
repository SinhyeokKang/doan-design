import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { Canvas, ConversationEvent } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { ConversationStore, type ListView, type QueuedMessage, type Thread } from "./conversationStore";
import type { DockedDraft } from "./dockedRules";
import { overviewAfterListChange, pickOverviewConversation, type DraftMove } from "./overviewConversation";
import type { SendingMessage, ThreadItem } from "./threadItems";

export { draftFrom, type ListView, type QueuedMessage, type Thread } from "./conversationStore";

// The project Overview's main conversation (buzz-project design §2.4, §2.5; spec decisions 5, 6, 10, 11). App owns one
// for the run, so each root keeps what it showed, its new-conversation draft and its threads across worktree switches
// and visits. Everything is decided here so it can be driven without a DOM; the list reads, seen marks, memory and
// navigation are the host's (HomeRun and App). Threads, drafts and queues live in the ConversationStore it shares with
// the canvas panel (`store`).

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
  // A requested conversation bound to a canvas opens that canvas with its conversation in the panel (spec decision 4).
  openCanvas(root: string, canvas: Canvas, conversationId: string, scroll: ScrollTo | null): void;
  toast(message: string, action: string, run: () => void): void;
  // A notice without an action (a returned draft's), shown as the Overview's attachment notices are.
  notice?(text: string): void;
  label(root: string): string;
  changed(): void;
}

// Where the thread scrolls once it draws a requested conversation: its pending permission request.
export type ScrollTo = "permission";
export interface Moved { conversationId: string; title: string; canvas: Canvas }
export type OverviewView = { kind: "wait" } | { kind: "new"; moved: Moved | null } | { kind: "conversation"; conversationId: string };

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
export function lastTurnSeq(events: readonly ConversationEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (!isMarker(events[i]!)) return events[i]!.seq;
  return null;
}
// The seq through which an ended turn can be seen: its end event is the last one. null while a turn runs or a new
// request waits for its turn; a turn nothing is live for anymore was cut by a quit or crash, and main counts it ended.
const TERMINAL: ReadonlySet<ConversationEvent["type"]> = new Set(["turn.done", "turn.failed", "interrupted"]);
export function endSeq(events: readonly ConversationEvent[], live: boolean): number | null {
  const last = [...events].reverse().find(event => !isMarker(event));
  if (!last) return null;
  return TERMINAL.has(last.type) || !live ? last.seq : null;
}

// Where a requested scroll goes once the thread draws: the pending permission request; wait while the list says the
// conversation waits but its event has not arrived; otherwise the request has nothing left to show.
export function scrollTarget(items: readonly ThreadItem[], waiting: boolean): { kind: "item"; key: string } | { kind: "wait" } | { kind: "drop" } {
  const ask = [...items].reverse().find(item => item.kind === "permission" && item.status === "pending");
  if (ask) return { kind: "item", key: ask.key };
  return waiting ? { kind: "wait" } : { kind: "drop" };
}

export class OverviewRun {
  // Threads, drafts and queues, shared with the canvas panel's run.
  readonly store: ConversationStore;
  private roots = new Map<string, RootState>();
  private visible: string | null = null;
  // The turn end the person saw per conversation (shown in the main column with the window focused), as a seq.
  private seenEnd = new Map<string, number>();
  // Promoted conversations whose seen end is to be marked through their binding marker once it is merged.
  private promotions = new Map<string, number>();
  // Waiting conversations already toasted, by the request they wait on (the list's preview names it).
  private asked = new Map<string, string>();
  private scroll: { conversationId: string; to: ScrollTo; seq: number } | null = null;
  private scrolls = 0;

  constructor(private host: OverviewRunHost) {
    this.store = new ConversationStore({
      list: root => host.list(root), readsStarted: root => host.readsStarted(root), readsApplied: root => host.readsApplied(root),
      notice: text => host.notice?.(text), changed: () => host.changed(),
    });
    this.store.subscribe((conversationId, change) => {
      this.markPromotion(conversationId);
      this.checkSeen();
      const root = change === "read" ? this.rootShowing(conversationId) : undefined;
      if (root) this.store.takeDraft(root, conversationId);
    });
  }

  get drafts(): ReadonlyMap<string, DockedDraft> { return this.store.drafts; }
  view(root: string): OverviewView {
    // A request held for the list keeps what shows; with nothing shown yet the column waits rather than flashing a
    // new conversation that then changes.
    const s = this.roots.get(root);
    if (!s?.current) return { kind: "wait" };
    return s.current.conversationId === null ? { kind: "new", moved: s.moved } : { kind: "conversation", conversationId: s.current.conversationId };
  }
  thread(conversationId: string): Thread | null { return this.store.thread(conversationId); }
  providerOf(conversationId: string): Provider | null { return this.store.providerOf(conversationId); }
  queue(conversationId: string): readonly QueuedMessage[] { return this.store.queue(conversationId); }
  sending(conversationId: string): readonly SendingMessage[] { return this.store.sending(conversationId); }
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
    if (provider) this.store.started(conversationId, provider);
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
  queued(root: string, conversationId: string, item: QueuedMessage): void { this.store.queued(root, conversationId, item); }
  unqueued(conversationId: string, itemId: string): void { this.store.unqueued(conversationId, itemId); }
  setDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void { this.store.setDrafts(update); }
  retryThread(conversationId: string): void { this.store.retryThread(conversationId); }
  // A removed project keeps no memory in this run either.
  forgetRoots(roots: readonly string[]): void {
    for (const root of roots) {
      this.roots.delete(root);
      if (this.visible === root) this.visible = null;
    }
    this.store.dropDrafts(key => roots.some(root => key === `root:${root}`));
    this.host.changed();
  }
  settleAttachments(keys: readonly string[], results: readonly (AttachmentResult | null)[]): { notices: string[]; images: { key: string; thumbnail: Uint8Array }[] } {
    return this.store.settleAttachments(keys, results);
  }
  // Edit and resend: true when the field should take focus, the same conversation still showing.
  async editAndResend(root: string, conversationId: string): Promise<boolean> {
    const revision = this.state(root).revision;
    if (!await this.store.editAndResend(conversationId)) return false;
    const s = this.roots.get(root);
    return this.visible === root && s?.revision === revision && s.current?.conversationId === conversationId;
  }
  live(root: string, conversationId: string): boolean { return this.store.live(root, conversationId); }
  // main deleted it (conversation-delete design §3.2), in whichever root. A root that showed it shows the new
  // conversation state with a newer revision, so a start or send reply sent before cannot replace that; a request
  // still waiting for it is dropped, so the list is not read again for it. The memory and the moved line go too. The
  // store's records go through its own deleted, which App calls as well.
  deleted(conversationId: string): void {
    for (const s of this.roots.values()) {
      if (s.request?.conversationId === conversationId) s.request = null;
      if (s.moved?.conversationId === conversationId) s.moved = null;
      if (s.current?.conversationId === conversationId) { s.revision++; s.current = { conversationId: null, listed: false }; }
    }
    for (const [root, remembered] of Object.entries(this.host.remembered() ?? {})) if (remembered === conversationId) this.host.remember(root, null);
    this.seenEnd.delete(conversationId);
    this.promotions.delete(conversationId);
    this.asked.delete(conversationId);
    if (this.scroll?.conversationId === conversationId) this.scroll = null;
    this.host.changed();
  }

  // conversation:event, subscribed at App mount so nothing is lost before a read.
  event(event: ConversationEvent): void { this.store.event(event); }

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
      if (shown && this.store.thread(shown)?.read === "ready") this.store.takeDraft(root, shown);
    }
    this.store.syncQueues();
    this.checkSeen();
  }

  private state(root: string): RootState {
    let s = this.roots.get(root);
    if (!s) { s = { request: null, moved: null, revision: 0, intent: 0 }; this.roots.set(root, s); }
    return s;
  }
  private rootShowing(conversationId: string): string | undefined {
    return [...this.roots].find(([, s]) => s.current?.conversationId === conversationId)?.[0];
  }
  private setCurrent(root: string, s: RootState, conversationId: string, listed: boolean): void {
    s.revision++;
    s.current = { conversationId, listed };
    s.moved = null;
    this.host.remember(root, conversationId);
    if (this.store.track(conversationId)) this.store.takeDraft(root, conversationId);
    this.checkSeen();
  }
  // Spec decision 5 through pickOverviewConversation. Only the first pick of a root reads the memory: after it the
  // person's choices hold, so a list read that lands later never replaces one (POSTMORTEM 2026-10-25).
  private resolve(root: string, s: RootState): void {
    const list = this.host.list(root);
    const read = Array.isArray(list) ? this.store.withoutDeleted(list) : null;
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
        this.host.openCanvas(root, pick.canvas, request.conversationId, request.scroll);
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
    // Deleting: deleted() resets the root once main answers. Read as gone now, its draft would move over the new
    // conversation's (conversation-delete spec decision 5).
    if (this.store.deleting(id)) return;
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
    const thread = this.store.thread(id), seen = this.seenEnd.get(id);
    const end = thread ? lastTurnSeq(thread.events) : null;
    if (end !== null && seen !== undefined && seen >= end) { this.promotions.set(id, seen); this.markPromotion(id); }
  }
  private markPromotion(conversationId: string): void {
    const after = this.promotions.get(conversationId);
    if (after === undefined) return;
    const marker = this.store.thread(conversationId)?.events.find(event => event.type === "conversation.bound" && event.seq > after);
    if (!marker) return;
    this.promotions.delete(conversationId);
    this.host.markSeen(conversationId, marker.seq);
  }
  private moveDraft({ from, to }: DraftMove): void { this.store.moveDraft(from, to); }
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
    const thread = this.store.thread(id);
    if (thread?.read !== "ready") return;
    const end = endSeq(thread.events, this.live(root, id));
    if (end === null || (this.seenEnd.get(id) ?? 0) >= end) return;
    this.seenEnd.set(id, end);
    this.host.markSeen(id, end);
  }
}
