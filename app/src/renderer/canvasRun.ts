import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, Runtime } from "../main/conversation/types";
import { newConversationMode, pickCanvasConversation, shouldMarkSeen, type CanvasNotice, type NewConversationView, type ResumeTarget } from "./canvasConversation";
import type { ConversationStore, ListView } from "./conversationStore";
import { draftKey, type DockedMode } from "./dockedRules";
import { endSeq, type ScrollTo } from "./overviewRun";

// The canvas page's conversation panel (buzz-canvas-conversation design §2 'Conversation panel', §6 late replies): which
// of the open canvas's conversations shows, the new conversation's start mode with its terminal session, entry
// requests, promotions, seen marks and the revision late replies are checked against. Threads, drafts and queues are
// the ConversationStore's, shared with the Overview. Like OverviewRun it decides without a DOM; the list reads, seen
// marks and navigation are the host's (HomeRun and App).

export interface CanvasRunHost {
  list(root: string): ListView;
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  reread(root: string): void;
  markSeen(conversationId: string, seq: number): void;
  focused(): boolean;
  // A project conversation whose turn drew this canvas and whose promotion is not judged yet (HomeRun's).
  drawing(root: string, canvas: Canvas): string | null;
  changed(): void;
}

export interface CanvasTarget { root: string; canvas: Canvas }
// lastCheckAt: when doan check linked the terminal session (main's resume target).
export type ResumeReply = ResumeTarget & { lastCheckAt?: string };

export type CanvasView =
  | { kind: "wait" }
  | { kind: "new"; listError: boolean; notice: CanvasNotice | null; start: NewConversationView; resume: ResumeReply | undefined; mode: DockedMode }
  | { kind: "conversation"; conversationId: string; archived: boolean; notice: CanvasNotice | null };

interface CanvasState {
  target: CanvasTarget;
  // undefined until the first pick; null is the new conversation state.
  shown?: string | null;
  // Moves with every change of what shows, so a start or send reply that lands after a newer choice leaves it alone.
  revision: number;
  // asked: the list was read again for it once; after: reads started before the request.
  request: { conversationId: string; after: number; asked: boolean; scroll: ScrollTo | null } | null;
  notice: CanvasNotice | null;
  // The list read before the last one, for a promotion while the panel is open.
  previous: readonly ConversationSummary[] | null;
  last: readonly ConversationSummary[] | null;
  // The terminal session: asked once while the canvas shows. `ask` is the ask in flight or answered (0: not asked), so
  // a reply that lands after the person left the canvas is dropped.
  resume?: ResumeReply;
  ask: number;
  choice?: "resume" | "new";
  // A conversation a start reply showed before any list named it: kept until a list read names it, so a read that
  // was older or already in flight cannot replace it (the Overview's `listed` rule).
  unconfirmed: string | null;
}

// A canvas keeps its state by id when it has one, so a moved canvas keeps what it showed and its draft.
export function canvasKey(target: CanvasTarget): string {
  return draftKey({ kind: "new", root: target.root, canvas: target.canvas });
}

export class CanvasRun {
  private canvases = new Map<string, CanvasState>();
  private visible: string | null = null;
  private panelOpen = false;
  private seenEnd = new Map<string, number>();
  private scroll: { conversationId: string; to: ScrollTo; seq: number } | null = null;
  private scrolls = 0;
  private resumeAsks = 0;

  constructor(private host: CanvasRunHost, readonly store: ConversationStore) {
    store.subscribe((conversationId, change) => {
      this.checkSeen();
      if (change !== "read") return;
      const s = this.shownState();
      if (s?.shown === conversationId) this.store.takeDraft(s.target.root, conversationId);
    });
  }

  // The canvas the panel belongs to (the open canvas page's), or null. A moved canvas (same id) keeps its state.
  show(target: CanvasTarget | null): void {
    const key = target ? canvasKey(target) : null;
    if (key !== this.visible) {
      // The terminal session is asked again on the next visit: a reply for the canvas left behind is dropped.
      const left = this.visible ? this.canvases.get(this.visible) : undefined;
      // Leaving also ends a promotion notice: the list it was read from is spent, so a return does not announce it again.
      if (left) { delete left.resume; left.ask = 0; delete left.choice; left.notice = null; left.previous = left.last; }
      this.visible = key;
    }
    if (target) { const s = this.state(target); s.target = target; this.resolve(s); }
    this.checkSeen();
    this.host.changed();
  }
  panel(open: boolean): void { this.panelOpen = open; this.checkSeen(); }
  focusChanged(): void { this.checkSeen(); }

  view(): CanvasView | null {
    const s = this.shownState();
    if (!s) return null;
    if (s.shown === undefined) return this.host.list(s.target.root) === "error" ? this.newView(s, true) : { kind: "wait" };
    if (s.shown === null) return this.newView(s, this.host.list(s.target.root) === "error");
    const listed = this.listed(s.target.root).find(c => c.conversationId === s.shown);
    return { kind: "conversation", conversationId: s.shown, archived: listed?.state === "archived", notice: s.notice };
  }
  revision(): number { return this.shownState()?.revision ?? 0; }
  // The draft key of the composer the panel shows: its conversation's, else the canvas's new conversation's.
  composerKey(): string | null {
    const s = this.shownState();
    if (!s) return null;
    return typeof s.shown === "string" ? `conversation:${s.shown}` : canvasKey(s.target);
  }
  retryList(): void { const s = this.shownState(); if (s) this.host.reread(s.target.root); }
  target(): CanvasTarget | null { return this.shownState()?.target ?? null; }
  scrollRequest(conversationId: string): { to: ScrollTo; seq: number } | null {
    return this.scroll?.conversationId === conversationId ? { to: this.scroll.to, seq: this.scroll.seq } : null;
  }
  takeScroll(conversationId: string): void {
    if (this.scroll?.conversationId === conversationId) this.scroll = null;
  }

  // The person's choice in the dropdown, New and ⌘N on this canvas. Choosing what already shows is still a newer
  // choice than a start or send in flight, so it moves the revision too.
  select(conversationId: string | null): void {
    const s = this.shownState();
    if (!s) return;
    s.request = null;
    s.notice = null;
    s.unconfirmed = null;
    s.revision++;
    this.setShown(s, conversationId);
    this.host.changed();
  }
  // An entry point asks for one of a canvas's conversations (an Overview row, a notification, a promotion's Open, the
  // capsule). Asked before the canvas opens, it waits in that canvas's state until the panel shows it.
  request(target: CanvasTarget, conversationId: string, scroll: ScrollTo | null): void {
    const s = this.state(target);
    s.target = target;
    s.revision++;
    s.unconfirmed = null;
    s.request = { conversationId, after: this.host.readsStarted(target.root), asked: false, scroll };
    if (canvasKey(target) === this.visible) this.resolve(s);
    this.host.changed();
  }
  // The terminal session or a new conversation, chosen in the new conversation state.
  choose(choice: "resume" | "new"): void {
    const s = this.shownState();
    if (!s || s.choice === choice) return;
    s.choice = choice;
    this.host.changed();
  }
  // A start from the new conversation state shows at once, before any list has it, unless the person chose something
  // else while it was sent (`revision` is the panel's then).
  started(target: CanvasTarget, conversationId: string, provider: Provider, revision: number): void {
    this.store.started(conversationId, provider);
    const s = this.canvases.get(canvasKey(target));
    if (!s || s.revision !== revision) return;
    s.request = null;
    s.notice = null;
    delete s.choice;
    const list = this.host.list(target.root);
    s.unconfirmed = Array.isArray(list) && list.some(c => c.conversationId === conversationId) ? null : conversationId;
    this.setShown(s, conversationId);
    this.host.changed();
  }
  // What the panel shows now, to tell later whether it still does (a late Edit and resend takes focus only then).
  showing(): { key: string; conversationId: string; revision: number } | null {
    const s = this.shownState();
    return s && typeof s.shown === "string" ? { key: canvasKey(s.target), conversationId: s.shown, revision: s.revision } : null;
  }
  stillShowing(shown: { key: string; conversationId: string; revision: number }): boolean {
    const now = this.showing();
    return now !== null && now.key === shown.key && now.conversationId === shown.conversationId && now.revision === shown.revision;
  }
  // A send from the panel ends a promotion notice unless the person chose something else while it was sent; a restore
  // made the archived conversation current again, and nothing else changes what shows.
  sent(revision: number): void {
    const s = this.shownState();
    if (s && s.revision === revision) s.notice = null;
    this.host.changed();
  }

  // After every list read HomeRun applied: requests waiting for the list, promotions and returned drafts.
  sync(): void {
    for (const s of this.canvases.values()) {
      const list = this.host.list(s.target.root);
      if (Array.isArray(list) && list !== s.last) { s.previous = s.last; s.last = list; }
      if (canvasKey(s.target) !== this.visible) continue;
      this.resolve(s);
      const shown = s.shown;
      if (shown && this.store.thread(shown)?.read === "ready") this.store.takeDraft(s.target.root, shown);
    }
    this.store.syncQueues();
    this.checkSeen();
  }

  private shownState(): CanvasState | undefined { return this.visible ? this.canvases.get(this.visible) : undefined; }
  private state(target: CanvasTarget): CanvasState {
    const key = canvasKey(target);
    let s = this.canvases.get(key);
    if (!s) { s = { target, revision: 0, request: null, notice: null, previous: null, last: null, ask: 0, unconfirmed: null }; this.canvases.set(key, s); }
    return s;
  }
  private listed(root: string): readonly ConversationSummary[] {
    const list = this.host.list(root);
    return Array.isArray(list) ? list : [];
  }
  private setShown(s: CanvasState, conversationId: string | null): void {
    if (s.shown !== conversationId) s.revision++;
    s.shown = conversationId;
    if (conversationId !== null && this.store.track(conversationId)) this.store.takeDraft(s.target.root, conversationId);
    if (conversationId === null && s.resume === undefined && s.ask === 0) this.askResume(s);
    this.checkSeen();
  }
  private resolve(s: CanvasState): void {
    const list = this.host.list(s.target.root);
    const drawing = this.host.drawing(s.target.root, s.target.canvas);
    if (s.request) {
      const request = s.request;
      const pick = pickCanvasConversation(list, s.target.canvas, request.conversationId, { ...(s.shown !== undefined ? { shown: s.shown } : {}), previous: s.previous, promoted: s.notice?.kind === "promoted" ? s.notice.open : null, drawing });
      if (pick.kind === "wait") return;
      if (pick.kind === "reread") {
        // A read started after the request still does not list it: main does not know it on this canvas.
        if (this.host.readsApplied(s.target.root) <= request.after) {
          if (!request.asked) { request.asked = true; this.host.reread(s.target.root); }
          return;
        }
        s.request = null;
      } else {
        s.request = null;
        s.notice = pick.notice;
        if (pick.kind === "conversation") {
          this.setShown(s, pick.conversationId);
          if (request.scroll && pick.conversationId === request.conversationId) this.scroll = { conversationId: pick.conversationId, to: request.scroll, seq: ++this.scrolls };
          return;
        }
        // A request for another canvas's conversation falls back to this canvas's default.
      }
    }
    if (s.unconfirmed !== null) {
      if (!Array.isArray(list) || !list.some(c => c.conversationId === s.unconfirmed)) return;
      s.unconfirmed = null;
    }
    const pick = pickCanvasConversation(list, s.target.canvas, null, { ...(s.shown !== undefined ? { shown: s.shown } : {}), previous: s.previous, promoted: s.notice?.kind === "promoted" ? s.notice.open : null, drawing });
    // A failed first read shows the new conversation state (view) without picking: the next read that answers picks.
    if (pick.kind === "new" && pick.listError) { if (s.resume === undefined && s.ask === 0) this.askResume(s); return; }
    if (pick.kind === "wait" || pick.kind === "reread") return;
    s.notice = pick.notice;
    this.setShown(s, pick.kind === "conversation" ? pick.conversationId : null);
  }
  private newView(s: CanvasState, listError: boolean): CanvasView {
    const current = this.listed(s.target.root).find(c => c.state === "current" && c.canvas !== undefined && sameTarget(c.canvas, s.target.canvas));
    const resume = s.resume;
    const mode = newConversationMode(resume, { ...(s.choice ? { choice: s.choice } : {}), ...(current ? { current } : {}) });
    // Until the first list read answers, nobody knows whether the canvas's current conversation still works, and a new
    // conversation would end its turn: Send waits as for the terminal session. A failed read lets a new one start.
    const start = this.host.list(s.target.root) === "loading" ? { ...mode, pending: true } : mode;
    const docked: DockedMode = start.mode === "resume" && start.offer
      ? { kind: "resume", root: s.target.root, canvas: s.target.canvas, provider: start.offer as Runtime }
      : { kind: "new", root: s.target.root, canvas: s.target.canvas };
    return { kind: "new", listError, notice: s.notice, start, resume, mode: docked };
  }
  // Called once when the new conversation state first shows on a canvas; reused until the canvas changes. Send waits
  // for the answer so a choice that appears late never changes the mode of a send already made (design §2).
  private askResume(s: CanvasState): void {
    const ask = s.ask = ++this.resumeAsks;
    const { root, canvas } = s.target;
    void window.doan.conversationResumeTarget({ root, canvas }).catch(() => ({ error: "unknown" })).then(reply => {
      if (s.ask !== ask) return;
      s.resume = "error" in reply ? { error: reply.error } : reply.available ? { available: true, runtime: reply.runtime, lastCheckAt: reply.lastCheckAt } : { available: false, reason: reply.reason };
      this.host.changed();
    });
  }
  // Seen only while the panel is open, the window has focus and the conversation shows (design §2 'Seen').
  private checkSeen(): void {
    const s = this.shownState();
    const id = s?.shown;
    if (!s || !id) return;
    const thread = this.store.thread(id);
    if (thread?.read !== "ready") return;
    const summary = this.listed(s.target.root).find(c => c.conversationId === id);
    const end = endSeq(thread.events, this.store.live(s.target.root, id));
    if (!shouldMarkSeen(this.panelOpen, this.host.focused(), id, summary, { end, seen: this.seenEnd.get(id) ?? 0 })) return;
    this.seenEnd.set(id, end!);
    this.host.markSeen(id, end!);
  }
}

// main's rule, as canvasConversationRows states it.
function sameTarget(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}
