import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, Runtime } from "../main/conversation/types";
import type { DoanApi } from "../preload";
import { newConversationMode, pickShownConversation, shouldMarkSeen, type NewConversationView, type ResumeTarget } from "./canvasConversation";
import type { ConversationStore, ListView } from "./conversationStore";
import { carryDraft, draftKey, hasDraft, type DockedMode } from "./dockedRules";
import { LIST_RETRY_IDLE, type ListRetry } from "./listRetry";
import { followNewConversation } from "./newConversationFollow";
import { endSeq, type ScrollTo } from "./overviewRun";

// The canvas page's conversation panel, in the main window and in the prototype window alike: which
// of the open canvas's conversations shows, the new conversation's start mode with its terminal session, entry
// requests, seen marks and the revision late replies are checked against. Threads, drafts and queues are
// the ConversationStore's, shared with the Overview. Like OverviewRun it decides without a DOM; the list reads, seen
// marks and navigation are the host's (HomeRun and App).

export interface CanvasRunHost {
  list(root: string): ListView;
  readsStarted(root: string): number;
  readsApplied(root: string): number;
  reread(root: string): void;
  // The failed list's Retry for a root (HomeRun's, or the prototype window's own); without it Retry never runs.
  listRetry?(root: string): ListRetry;
  markSeen(conversationId: string, seq: number): void;
  focused(): boolean;
  // The conversation last seen on this canvas on this device (ui-state's conversationByCanvas): undefined until
  // ui-state was read, so the first pick never runs ahead of it; null for none. A host without it remembers nothing.
  remembered?(root: string, canvas: Canvas): string | null | undefined;
  // A conversation seen on this canvas (PRODUCT's Seen). Only the main window writes ui-state; the prototype window
  // has no such member.
  remember?(root: string, canvas: Canvas, conversationId: string): void;
  changed(): void;
}

// The terminal session read: `window.doan`, or the prototype window's same member.
export type ResumeCalls = Pick<DoanApi, "conversationResumeTarget">;

export interface CanvasTarget { root: string; canvas: Canvas }
// lastCheckAt: when doan check linked the terminal session (main's resume target).
export type ResumeReply = ResumeTarget & { lastCheckAt?: string };

export type CanvasView =
  | { kind: "wait" }
  | { kind: "new"; listError: boolean; start: NewConversationView; resume: ResumeReply | undefined; mode: DockedMode }
  | { kind: "conversation"; conversationId: string };

interface CanvasState {
  target: CanvasTarget;
  // undefined until the first pick; null is the new conversation state.
  shown?: string | null;
  // Moves with every change of what shows, so a start or send reply that lands after a newer choice leaves it alone.
  revision: number;
  // asked: the list was read again for it once; after: reads started before the request.
  request: { conversationId: string; after: number; asked: boolean; scroll: ScrollTo | null } | null;
  // The terminal session: asked once while the canvas shows. `ask` is the ask in flight or answered (0: not asked), so
  // a reply that lands after the person left the canvas is dropped.
  resume?: ResumeReply;
  ask: number;
  // The conversation ids the list named when the session was last asked (undefined: no list then). One session is one
  // conversation, so a start or a deletion can change whether main offers it: a change of these asks again.
  askedIds?: string;
  choice?: "resume" | "new";
  // A conversation a start reply showed before any list named it: kept until a list read names it, so a read that
  // was older or already in flight cannot replace it (the Overview's `listed` rule).
  unconfirmed: string | null;
  // The new conversation state shows only because the canvas had no conversation (not the person's New), with the
  // conversations the list named then: one started after (by the person here or in the other window, or by a handoff)
  // then shows (followNewConversation). Taken from the list itself, since a canvas opened after its root's list was read
  // has no earlier read of its own.
  defaultNew?: ReadonlySet<string>;
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
  // Starts from this panel by canvas key, until main answers: their draft is the message being sent.
  private starting = new Map<string, number>();
  // Conversations main deleted: the host's list still names one until its next read, and deleted() picks before the
  // store forgets it, so picks leave these out.
  private gone = new Set<string>();

  constructor(private host: CanvasRunHost, readonly store: ConversationStore, private calls: ResumeCalls) {
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
      if (left) { delete left.resume; left.ask = 0; delete left.askedIds; delete left.choice; }
      this.visible = key;
    }
    if (target) { const s = this.state(target); s.target = target; this.resolve(s); }
    this.checkSeen();
    this.host.changed();
  }
  panel(open: boolean): void { this.panelOpen = open; this.checkSeen(); }
  // A failed write leaves this ending eligible the next time the open panel checks it.
  seenFailed(conversationId: string, seq: number): void {
    if (this.seenEnd.get(conversationId) === seq) this.seenEnd.delete(conversationId);
  }
  focusChanged(): void { this.checkSeen(); this.recheckResume(); }
  // A terminal process holds the linked session (session_in_use): nothing says when it exits, so the target is read
  // again when the terminal work list changes and when the window comes back.
  recheckResume(): void {
    const s = this.shownState();
    if (s?.shown === null && s.resume && "available" in s.resume && !s.resume.available && s.resume.reason === "session_in_use") this.askResume(s);
  }

  view(): CanvasView | null {
    const s = this.shownState();
    if (!s) return null;
    if (s.shown === undefined) return this.host.list(s.target.root) === "error" ? this.newView(s, true) : { kind: "wait" };
    if (s.shown === null) return this.newView(s, this.host.list(s.target.root) === "error");
    return { kind: "conversation", conversationId: s.shown };
  }
  revision(): number { return this.shownState()?.revision ?? 0; }
  // The draft key of the composer the panel shows: its conversation's, else the canvas's new conversation's.
  composerKey(): string | null {
    const s = this.shownState();
    if (!s) return null;
    return s.shown ? `conversation:${s.shown}` : canvasKey(s.target);
  }
  retryList(): void { const s = this.shownState(); if (s) this.host.reread(s.target.root); }
  listRetry(): ListRetry { const s = this.shownState(); return (s && this.host.listRetry?.(s.target.root)) ?? LIST_RETRY_IDLE; }
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
    delete s.defaultNew;
    s.request = null;
    s.unconfirmed = null;
    s.revision++;
    this.setShown(s, conversationId);
    this.host.changed();
  }
  // An entry point asks for one of a canvas's conversations (an Overview row, a notification, a thread card's Open, the
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
  // A start from this panel is in flight until the returned function is called.
  startSending(target: CanvasTarget): () => void {
    const key = canvasKey(target);
    this.starting.set(key, (this.starting.get(key) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const left = (this.starting.get(key) ?? 1) - 1;
      if (left > 0) this.starting.set(key, left); else this.starting.delete(key);
    };
  }
  // Move to Trash reads it (canvasRowMenu trashBlock): main lists a canvas's first conversation only once it accepts it.
  startingOn(target: CanvasTarget): boolean { return this.starting.has(canvasKey(target)); }
  // A removed project keeps no memory in this run, as on the Overview (OverviewRun.forgetRoots): its canvases show
  // afresh if it is added again. A start in flight keeps its count until main answers.
  forgetRoots(roots: readonly string[]): void {
    for (const [key, s] of this.canvases) {
      if (!roots.includes(s.target.root)) continue;
      this.canvases.delete(key);
      if (this.visible === key) this.visible = null;
    }
    this.host.changed();
  }
  // A start from the new conversation state shows at once, before any list has it, unless the person chose something
  // else while it was sent (`revision` is the panel's then).
  started(target: CanvasTarget, conversationId: string, provider: Provider, revision: number): void {
    this.store.started(conversationId, provider);
    const s = this.canvases.get(canvasKey(target));
    if (!s || s.revision !== revision) return;
    s.request = null;
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
  // main deleted it, on whichever canvas. Every canvas state that shows it picks again by the shared rule (the next
  // conversation, else the new conversation state) with a newer revision, so a start or send reply sent before cannot
  // replace that. A request still waiting for it is dropped, so it does not bring it back.
  deleted(conversationId: string): void {
    this.gone.add(conversationId);
    for (const [key, s] of this.canvases) {
      if (s.request?.conversationId === conversationId) s.request = null;
      if (s.shown !== conversationId) continue;
      s.unconfirmed = null;
      s.revision++;
      delete s.defaultNew;
      // A canvas not on screen picks when it shows again, and asks for its terminal session then.
      delete s.shown;
      if (key === this.visible) this.resolve(s);
    }
    this.seenEnd.delete(conversationId);
    if (this.scroll?.conversationId === conversationId) this.scroll = null;
    this.host.changed();
  }

  // After every list read HomeRun applied: requests waiting for the list, newly started conversations and returned
  // drafts.
  sync(): void {
    for (const s of this.canvases.values()) {
      const list = this.host.list(s.target.root);
      if (canvasKey(s.target) !== this.visible) continue;
      this.resolve(s);
      // A conversation started or deleted (here or in the other window) can take or free the terminal session; a start
      // of this panel's own is left alone, so the mode it was sent with stays.
      if (s.shown === null && s.askedIds !== undefined && Array.isArray(list) && listedKey(list) !== s.askedIds && !this.starting.has(canvasKey(s.target)) && !unverified(s)) this.askResume(s, true);
      const shown = s.shown;
      if (shown && this.store.thread(shown)?.read === "ready") this.store.takeDraft(s.target.root, shown);
      // A first message a quit stopped waits in the canvas's new conversation draft (once a run; main hands it over once).
      this.store.takeStartDraft(s.target.root, s.target.canvas);
      if (shown) this.store.readScheduled(s.target.root, shown);
    }
    this.store.syncQueues();
    this.checkSeen();
  }

  private shownState(): CanvasState | undefined { return this.visible ? this.canvases.get(this.visible) : undefined; }
  private state(target: CanvasTarget): CanvasState {
    const key = canvasKey(target);
    let s = this.canvases.get(key);
    if (!s) { s = { target, revision: 0, request: null, ask: 0, unconfirmed: null }; this.canvases.set(key, s); }
    return s;
  }
  private listedIds(root: string): ReadonlySet<string> { return new Set(this.listed(root).map(c => c.conversationId)); }
  private listed(root: string): readonly ConversationSummary[] {
    const list = this.host.list(root);
    return Array.isArray(list) ? list : [];
  }
  private setShown(s: CanvasState, conversationId: string | null): void {
    const was = s.shown;
    if (s.shown !== conversationId) s.revision++;
    s.shown = conversationId;
    if (conversationId !== null && this.store.track(conversationId)) this.store.takeDraft(s.target.root, conversationId);
    // The new conversation state asks for the terminal session when it first shows and every time it comes back: the
    // conversation shown meanwhile may hold the session now (one session is one conversation).
    if (conversationId === null && ((typeof was === "string" && !unverified(s)) || (s.resume === undefined && s.ask === 0))) this.askResume(s, typeof was === "string");
    this.checkSeen();
  }
  private resolve(s: CanvasState): void {
    // Deleting what shows: deleted() picks again once main answers; a list read without it must not pick another.
    if (typeof s.shown === "string" && this.store.deleting(s.shown)) return;
    const { root, canvas } = s.target;
    const listed = this.host.list(root);
    const list = Array.isArray(listed) ? this.store.withoutDeleted(listed).filter(c => !this.gone.has(c.conversationId)) : listed;
    const remembered = this.host.remembered ? this.host.remembered(root, canvas) : null;
    if (s.request) {
      // A request waits for the list rather than being taken by a read in flight; a failed read drops it.
      if (list === "loading") return;
      const request = s.request;
      const pick = Array.isArray(list) ? pickShownConversation({ list, canvas, requested: request.conversationId, shown: s.shown, remembered }) : null;
      if (pick?.kind === "wait") return;
      if (pick?.kind === "reread") {
        // A read started after the request still does not list it: main does not know it on this canvas.
        if (this.host.readsApplied(root) <= request.after) {
          if (!request.asked) { request.asked = true; this.host.reread(root); }
          return;
        }
        s.request = null;
      } else {
        s.request = null;
        if (Array.isArray(list) && pick?.kind === "conversation" && pick.conversationId === request.conversationId) {
          this.setShown(s, pick.conversationId);
          if (request.scroll) this.scroll = { conversationId: pick.conversationId, to: request.scroll, seq: ++this.scrolls };
          return;
        }
        // A request for another canvas's conversation falls back to this canvas's default.
      }
    }
    if (s.unconfirmed !== null) {
      if (!Array.isArray(list) || !list.some(c => c.conversationId === s.unconfirmed)) return;
      s.unconfirmed = null;
    }
    if (s.shown === null && s.defaultNew && Array.isArray(list) && this.followNew(s, s.defaultNew, list)) return;
    const pick = pickShownConversation({ list, canvas, requested: null, shown: s.shown, remembered });
    // A failed first read shows the new conversation state (view) without picking: the next read that answers picks.
    if (pick.kind === "new" && pick.listError) { if (s.shown === undefined && s.resume === undefined && s.ask === 0) this.askResume(s); return; }
    if (pick.kind !== "conversation" && pick.kind !== "new") return;
    const shown = pick.kind === "conversation" ? pick.conversationId : null;
    // The person's New (select(null) leaves shown null without defaultNew) stays theirs across reads; only the default
    // new state takes the list's ids again.
    if (shown === null && (s.shown !== null || s.defaultNew)) s.defaultNew = this.listedIds(root);
    this.setShown(s, shown);
  }
  // A conversation newly started on a canvas showing only the default new state shows (followNewConversation), with the
  // new state's draft when it has none, unless this panel's own start from that draft is in flight (POSTMORTEM
  // 2026-11-14: a draft whose send can be in flight never moves; the composer empties only the key it sent from). A
  // handoff's conversation takes it only while that draft is empty, so no draft ever moves to one.
  private followNew(s: CanvasState, known: ReadonlySet<string>, list: readonly ConversationSummary[]): boolean {
    const key = canvasKey(s.target);
    const id = followNewConversation(known, list, s.target.canvas, { deleting: conversationId => this.store.deleting(conversationId), draft: hasDraft(this.store.drafts.get(key)) });
    if (id === null) return false;
    if (!this.starting.has(key)) this.store.setDrafts(drafts => (hasDraft(drafts.get(key)) ? carryDraft(drafts, key, `conversation:${id}`) : drafts));
    delete s.defaultNew;
    this.setShown(s, id);
    return true;
  }
  private newView(s: CanvasState, listError: boolean): CanvasView {
    const resume = s.resume;
    const start = newConversationMode(resume, { ...(s.choice ? { choice: s.choice } : {}) });
    const docked: DockedMode = start.mode === "resume" && start.offer
      ? { kind: "resume", root: s.target.root, canvas: s.target.canvas, provider: start.offer as Runtime }
      : { kind: "new", root: s.target.root, canvas: s.target.canvas };
    return { kind: "new", listError, start, resume, mode: docked };
  }
  // Called when the new conversation state shows on a canvas and when the conversations that could hold the session
  // change; the answer is reused until then. Send waits for the answer so a choice that appears late never changes the
  // mode of a send already made.
  // `again`: the earlier answer may name a session a conversation took since, so Send waits for this one instead. A
  // terminal process's hold (recheckResume) keeps its answer shown until the new one lands.
  private askResume(s: CanvasState, again = false): void {
    const ask = s.ask = ++this.resumeAsks;
    const { root, canvas } = s.target;
    const list = this.host.list(root);
    if (Array.isArray(list)) s.askedIds = listedKey(list); else delete s.askedIds;
    if (again) delete s.resume;
    void this.calls.conversationResumeTarget({ root, canvas }).catch(() => ({ error: "unknown" })).then(reply => {
      if (s.ask !== ask) return;
      s.resume = "error" in reply ? { error: reply.error } : reply.available ? { available: true, runtime: reply.runtime, lastCheckAt: reply.lastCheckAt, ...(reply.session ? { session: reply.session } : {}) } : { available: false, reason: reply.reason, ...(reply.runtime && reply.session ? { runtime: reply.runtime, session: reply.session } : reply.runtime && reply.reason === "session_unverified" ? { runtime: reply.runtime } : {}) };
      this.host.changed();
    });
  }
  // Seen only while the panel is open, the window has focus and the conversation shows. Then it is also the canvas's
  // last seen conversation on this device, once a list names it there.
  private checkSeen(): void {
    const s = this.shownState();
    const id = s?.shown;
    if (!s || !id) return;
    if (this.panelOpen && this.host.focused() && this.listed(s.target.root).some(c => c.conversationId === id && c.canvas !== undefined && sameTarget(c.canvas, s.target.canvas))) this.host.remember?.(s.target.root, s.target.canvas, id);
    const thread = this.store.thread(id);
    if (thread?.read !== "ready") return;
    const summary = this.listed(s.target.root).find(c => c.conversationId === id);
    const end = endSeq(thread.events, this.store.live(s.target.root, id));
    if (!shouldMarkSeen(this.panelOpen, this.host.focused(), id, summary, { end, seen: this.seenEnd.get(id) ?? 0 })) return;
    this.seenEnd.set(id, end!);
    this.host.markSeen(id, end!);
  }
}

// A terminal session Doan could not check stays unchecked for the rest of the visit: asking again would check the same
// registry records again, and the reason line would flicker away while it waits.
function unverified(s: CanvasState): boolean {
  return !!s.resume && "available" in s.resume && !s.resume.available && s.resume.reason === "session_unverified";
}

// main's rule, as canvasConversationRows states it.
function sameTarget(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}

// The conversations a list names, as one comparable value.
function listedKey(list: readonly ConversationSummary[]): string {
  return list.map(c => c.conversationId).sort().join("\n");
}
