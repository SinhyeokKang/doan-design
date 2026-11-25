import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import { toSee } from "../main/conversation/seenEvents";
import type { Canvas, ConversationEvent } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { ConversationStore, type ListView, type QueuedMessage, type StoreCalls, type Thread } from "./conversationStore";
import type { DockedDraft } from "./dockedRules";
import { overviewAfterListChange, pickOverviewConversation, type DraftMove } from "./overviewConversation";
import { waitsForPerson, type SendingMessage, type ThreadItem } from "./threadItems";

export { draftFrom, type ListView, type QueuedMessage, type Thread } from "./conversationStore";

// App owns one for the run, so each root keeps what it showed, its draft and its threads across worktree switches and
// visits. Decided here without a DOM; list reads, seen marks, memory and navigation are the host's.

export interface OverviewRunHost {
  list(root: string): ListView;
  // HomeRun's counts of the root's list reads: started so far, and the number of the last one that answered.
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  reread(root: string): void;
  // null until ui-state was read, so a pick never runs ahead of the memory.
  remembered(): Readonly<Record<string, string>> | null;
  remember(root: string, conversationId: string | null): void;
  markSeen(conversationId: string, seq: number): void;
  // HomeRun's seenPending; none when absent.
  seen?(): ReadonlySet<string>;
  focused(): boolean;
  openCanvas(root: string, canvas: Canvas, conversationId: string, scroll: ScrollTo | null): void;
  toast(message: string, action: string, run: () => void): void;
  // A notice without an action (a returned draft's).
  notice?(text: string): void;
  label(root: string): string;
  changed(): void;
}

export type ScrollTo = "permission";
export type OverviewView = { kind: "wait" } | { kind: "new" } | { kind: "conversation"; conversationId: string };

interface RootState {
  // undefined until a pick; a null conversation is the new conversation state.
  current?: { conversationId: string | null; listed: boolean };
  // Moves with what the root shows, so a later reply leaves a newer choice alone. intent moves only with the person's
  // or an entry's choice, not with what a list read did.
  revision: number;
  intent: number;
  leftAt?: number;
  // true while the new conversation state shown for a fresh start holds, so a return from a canvas keeps it.
  fresh?: boolean;
  // asked: the list was read again for it once; after: reads started before the request.
  request: { conversationId: string; after: number; asked: boolean; scroll: ScrollTo | null } | null;
}

// main's own measure of what is to be seen (summary.ts lastTurnSeq).
export function lastTurnSeq(events: readonly ConversationEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (toSee(events[i]!)) return events[i]!.seq;
  return null;
}
// A turn nothing is live for anymore was cut by a quit or crash, and main counts it ended.
const TERMINAL: ReadonlySet<ConversationEvent["type"]> = new Set(["turn.done", "turn.failed", "interrupted"]);
export function endSeq(events: readonly ConversationEvent[], live: boolean): number | null {
  const last = [...events].reverse().find(toSee);
  if (!last) return null;
  return TERMINAL.has(last.type) || !live ? last.seq : null;
}

// Wait while the list says the conversation waits but its event has not arrived; otherwise the request has nothing
// left to show.
export function scrollTarget(items: readonly ThreadItem[], waiting: boolean): { kind: "item"; key: string } | { kind: "wait" } | { kind: "drop" } {
  const ask = [...items].reverse().find(waitsForPerson);
  if (ask) return { kind: "item", key: ask.key };
  return waiting ? { kind: "wait" } : { kind: "drop" };
}

export class OverviewRun {
  readonly store: ConversationStore;
  private roots = new Map<string, RootState>();
  private visible: string | null = null;
  // Seen: shown in the main column with the window focused.
  private seenEnd = new Map<string, number>();
  // Waiting conversations already toasted, by the request they wait on (the list's preview names it).
  private asked = new Map<string, string>();
  private scroll: { conversationId: string; to: ScrollTo; seq: number } | null = null;
  private scrolls = 0;

  constructor(private host: OverviewRunHost, calls: StoreCalls) {
    this.store = new ConversationStore({
      list: root => host.list(root), readsStarted: root => host.readsStarted(root), readsApplied: root => host.readsApplied(root),
      notice: text => host.notice?.(text), changed: () => host.changed(),
    }, calls);
    this.store.subscribe((conversationId, change) => {
      this.checkSeen();
      const root = change === "read" ? this.rootShowing(conversationId) : undefined;
      if (root) this.store.takeDraft(root, conversationId);
    });
  }

  get drafts(): ReadonlyMap<string, DockedDraft> { return this.store.drafts; }
  view(root: string): OverviewView {
    // With nothing shown yet the column waits rather than flashing a new conversation that then changes.
    const s = this.roots.get(root);
    if (!s?.current) return { kind: "wait" };
    return s.current.conversationId === null ? { kind: "new" } : { kind: "conversation", conversationId: s.current.conversationId };
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

  show(root: string | null): void {
    if (root === this.visible) return;
    const left = this.visible ? this.roots.get(this.visible) : undefined;
    if (left) left.leftAt = left.intent;
    this.visible = root;
    if (root) {
      const s = this.state(root);
      // Reopened with nothing asked meanwhile: picked again. A fresh start's new conversation state is kept: picking again
      // would reopen the conversation it set aside.
      if (s.leftAt !== undefined && s.leftAt === s.intent && !s.request && !(s.fresh === true && s.intent === 0)) delete s.current;
      this.resolve(root, s);
    }
    this.checkSeen();
    this.host.changed();
  }
  focusChanged(): void { this.checkSeen(); }

  // A conversation switch does not enter Back/Forward (App's).
  select(root: string, conversationId: string | null): void {
    const s = this.state(root);
    s.request = null;
    s.revision++; s.intent++;
    if (conversationId === null) {
      if (s.current?.conversationId !== null) { s.current = { conversationId: null, listed: false }; this.host.remember(root, null); }
    } else this.setCurrent(root, s, conversationId, true);
    this.host.changed();
  }
  // A project conversation becomes the root's main conversation once listed.
  request(root: string, conversationId: string, scroll: ScrollTo | null): void {
    const s = this.state(root);
    // Accepted, it is a newer choice than a start or send still waiting for its reply.
    s.revision++; s.intent++;
    s.request = { conversationId, after: this.host.readsStarted(root), asked: false, scroll };
    this.resolve(root, s);
    this.host.changed();
  }
  // A newer choice than the start's `revision` keeps what it chose.
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
    this.host.remember(root, conversationId);
    this.host.changed();
  }
  queued(root: string, conversationId: string, item: QueuedMessage): void { this.store.queued(root, conversationId, item); }
  unqueued(conversationId: string, itemId: string): void { this.store.unqueued(conversationId, itemId); }
  setDrafts(update: (drafts: ReadonlyMap<string, DockedDraft>) => ReadonlyMap<string, DockedDraft>): void { this.store.setDrafts(update); }
  retryThread(conversationId: string): void { this.store.retryThread(conversationId); }
  forgetRoots(roots: readonly string[]): void {
    for (const root of roots) {
      this.roots.delete(root);
      if (this.visible === root) this.visible = null;
    }
    // draftKey: `canvas:` then the JSON array that starts with the root.
    this.store.dropDrafts(key => roots.some(root => key === `root:${root}` || key.startsWith(`canvas:${JSON.stringify([root]).slice(0, -1)},`)));
    this.host.changed();
  }
  settleAttachments(keys: readonly string[], results: readonly (AttachmentResult | null)[]): { notices: string[]; images: { key: string; thumbnail: Uint8Array }[] } {
    return this.store.settleAttachments(keys, results);
  }
  // true when the field should take focus, the same conversation still showing.
  async editAndResend(root: string, conversationId: string): Promise<boolean> {
    const revision = this.state(root).revision;
    if (!await this.store.editAndResend(conversationId)) return false;
    const s = this.roots.get(root);
    return this.visible === root && s?.revision === revision && s.current?.conversationId === conversationId;
  }
  live(root: string, conversationId: string): boolean { return this.store.live(root, conversationId); }
  // A root that showed it gets the new state at a newer revision, so an earlier reply cannot replace that; waiting
  // requests are dropped. The store's records go through its own deleted.
  deleted(conversationId: string): void {
    for (const s of this.roots.values()) {
      if (s.request?.conversationId === conversationId) s.request = null;
      if (s.current?.conversationId === conversationId) { s.revision++; s.current = { conversationId: null, listed: false }; }
    }
    for (const [root, remembered] of Object.entries(this.host.remembered() ?? {})) if (remembered === conversationId) this.host.remember(root, null);
    this.seenEnd.delete(conversationId);
    this.asked.delete(conversationId);
    if (this.scroll?.conversationId === conversationId) this.scroll = null;
    this.host.changed();
  }

  // Subscribed at App mount so nothing is lost before a read.
  event(event: ConversationEvent): void { this.store.event(event); }

  sync(): void {
    // The host's calls report back through HomeRun, which asks for another sync: that one runs after this one instead of
    // inside it.
    if (this.syncing) { this.again = true; return; }
    this.syncing = true;
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- syncOnce() can re-enter sync(), which sets again
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
      // Once a run; main hands it over once.
      if (root === this.visible) this.store.takeStartDraft(root);
      // The store forgets a schedule the list moved past on every read.
      if (shown && root === this.visible) this.store.readScheduled(root, shown);
    }
    this.store.syncQueues();
    this.checkSeen();
  }

  private state(root: string): RootState {
    let s = this.roots.get(root);
    if (!s) { s = { request: null, revision: 0, intent: 0 }; this.roots.set(root, s); }
    return s;
  }
  private rootShowing(conversationId: string): string | undefined {
    return [...this.roots].find(([, s]) => s.current?.conversationId === conversationId)?.[0];
  }
  private setCurrent(root: string, s: RootState, conversationId: string, listed: boolean): void {
    s.revision++;
    s.current = { conversationId, listed };
    this.host.remember(root, conversationId);
    if (this.store.track(conversationId)) this.store.takeDraft(root, conversationId);
    this.checkSeen();
  }
  // Only the first pick of a root reads the memory, so a list read that lands later never replaces a person's choice.
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
    // A request or start moves intent.
    const first = s.fresh === undefined && s.intent === 0;
    const pick = pickOverviewConversation(read, remembered[root], null, first ? this.host.seen?.() ?? new Set() : null);
    s.fresh = pick.kind === "new" && pick.fresh === true;
    if (pick.kind === "conversation") this.setCurrent(root, s, pick.conversationId, true);
    else if (pick.kind === "new") {
      s.revision++;
      s.current = { conversationId: null, listed: false };
      if (pick.forget) this.host.remember(root, null);
    }
  }
  private afterList(root: string, s: RootState, list: readonly ConversationSummary[]): void {
    const current = s.current;
    if (!current || current.conversationId === null) return;
    const id = current.conversationId;
    // deleted() resets the root once main answers. Read as gone now, its draft would move over the new conversation's.
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
  }
  private moveDraft({ from, to }: DraftMove): void { this.store.moveDraft(from, to); }
  private toastWaiting(root: string, s: RootState, list: readonly ConversationSummary[]): void {
    const shown = s.current?.conversationId ?? null;
    for (const c of list) {
      if (c.phase !== "waiting") { this.asked.delete(c.conversationId); continue; }
      if (c.canvas || c.conversationId === shown || this.asked.get(c.conversationId) === c.preview) continue;
      this.asked.set(c.conversationId, c.preview);
      this.host.toast(`${PROVIDER_NAMES[c.provider]} needs your answer in ${this.host.label(root)}.`, "Open", () => this.request(root, c.conversationId, "permission"));
    }
  }
  // Scrolled up or not.
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
