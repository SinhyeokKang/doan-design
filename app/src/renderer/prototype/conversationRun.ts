import type { ConversationSummary } from "../../main/conversation/summary";
import type { PrototypeComposerSettings, PrototypeView, PrototypeWindowApi } from "../../main/prototype/ipc";
import type { FolderEntry } from "../../main/view";
import type { WorkItem } from "../../main/workState";
import type { DoanApi } from "../../preload";
import type { ConversationCalls } from "../CanvasConversationPanel";
import { CanvasRun, canvasKey, type ResumeCalls } from "../canvasRun";
import { ConversationStore, type ListView, type StoreCalls } from "../conversationStore";
import { DockedSupport, type DockedSupportCalls } from "../dockedSupport";
import type { VisibleCalls } from "../visibleClock";
import { carryPrototypeDraft, conversationButton, playingFrameChip, prototypeShownConversation, type ConversationButton, type PlayingFrameChip, type PrototypeConversationTarget, type PrototypeShown } from "./conversation";

// The prototype window's conversation host without a DOM. It keeps this window's own store (so its drafts, question
// picks and attachment chips are its own), reads the playing canvas's conversations (main answers only that canvas's
// rows), and always shows that canvas's current conversation. The main window's runs are not here: nothing this
// window does reaches its selection, panel or drafts.

// Everything the panel calls: `window.doanPrototype`'s members of the same names as `window.doan`'s, and its own.
export type PrototypeConversationCalls = ConversationCalls & StoreCalls & DockedSupportCalls & ResumeCalls & VisibleCalls
  & Pick<DoanApi, "listConversations" | "markConversationSeen" | "onConversationEvent" | "onConversationStage" | "onConversationListChanged" | "getWork" | "onWorkChanged">
  & Pick<PrototypeWindowApi, "setShowing" | "reveal" | "rememberChoice" | "readComposerSettings" | "onComposerSettings" | "readTargetEntry" | "onTargetEntry" | "readDrawing" | "onDrawing" | "readPromoted" | "onPromoted">;

export interface PrototypeRunHost {
  changed(): void;
  notice(text: string): void;
  focused(): boolean;
}

export class PrototypeConversationRun {
  readonly store: ConversationStore;
  readonly run: CanvasRun;
  readonly support: DockedSupport;
  // The calls the panel body makes: this window's, with its starts, sends and queues counted by the draft key they
  // left from until main answers, so a list read never moves a draft whose send can still be in flight.
  readonly bodyCalls: PrototypeConversationCalls;
  private inFlight = new Map<string, number>();
  private view: PrototypeView | null = null;
  // The playing canvas whose list is held: main answers a list with that canvas's rows only, so a switch of canvas
  // (or root, worktrees sharing ids and paths) starts over, and a read for a canvas left behind never applies.
  private key: string | null = null;
  private listView: ListView = "loading";
  private reading: { key: string; again: boolean } | null = null;
  private reads = 0;
  private applied = 0;
  private last: PlayingFrameChip | null = null;
  private entryValue: FolderEntry | null = null;
  private entryReads = 0;
  private workItems: readonly WorkItem[] = [];
  private settingsValue: PrototypeComposerSettings | null = null;
  // What main last heard the open panel shows, with the target it was sent under (undefined: nothing sent yet).
  private showing: { id: string | null; key: string | null } | undefined = undefined;
  // Conversations this window marked seen, until a list read says so too.
  private seenIds = new Set<string>();
  // The project conversation drawing the playing canvas, by id only: main relays it from the main window, which reads
  // project conversations this window cannot.
  private drawingId: string | null = null;
  private drawingPushed = false;
  // The project conversation main saw become the playing canvas's current one, by id, likewise relayed.
  private promotedId: string | null = null;
  private promotedPushed = false;

  constructor(private readonly calls: PrototypeConversationCalls, private readonly host: PrototypeRunHost) {
    const list = (root: string): ListView => (this.view?.root === root ? this.listView : "loading");
    // A returned queue goes to the window the person looks at: this one only while its panel is open (user decision).
    this.store = new ConversationStore({ list, readsStarted: () => this.reads, readsApplied: () => this.applied, notice: text => host.notice(text), changed: () => host.changed(), takesDrafts: () => this.view?.panel.open === true }, calls);
    this.run = new CanvasRun({
      list, readsStarted: () => this.reads, readsApplied: () => this.applied,
      reread: root => { if (this.view?.root === root) this.read(); },
      markSeen: (conversationId, seq) => { this.seenIds.add(conversationId); void calls.markConversationSeen({ conversationId, seq }).catch(console.error); },
      focused: () => host.focused(),
      drawing: root => (this.view?.root === root ? this.drawingId : null),
      promoted: root => (this.view?.root === root ? this.promotedId : null),
      changed: () => this.changed(),
    }, this.store, calls);
    this.support = new DockedSupport(() => host.changed(), calls);
    this.bodyCalls = {
      ...calls,
      // Main starts only canvas conversations for this window; a start without a canvas has no draft here to guard.
      startConversation: request => request.canvas ? this.track(canvasKey({ root: request.root, canvas: request.canvas }), calls.startConversation(request)) : calls.startConversation(request),
      sendConversation: request => this.track(`conversation:${request.conversationId}`, calls.sendConversation(request)),
      queueConversation: request => this.track(`conversation:${request.conversationId}`, calls.queueConversation(request)),
    };
  }

  private track<T>(key: string, sent: Promise<T>): Promise<T> {
    this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    return sent.finally(() => {
      const left = (this.inFlight.get(key) ?? 1) - 1;
      if (left > 0) this.inFlight.set(key, left); else this.inFlight.delete(key);
    });
  }

  // Subscribe first, then read (ARCHITECTURE §7 'Events'): every read this window makes, the first and each one after
  // a switch of canvas, comes after these.
  connect(): () => void {
    const offs = [
      this.calls.onConversationEvent(event => this.store.event(event)),
      this.calls.onConversationStage(signal => this.store.stage(signal)),
      this.calls.onConversationListChanged(({ root }) => { if (this.view?.root === root && this.view.canvasRow === "present") this.read(); }),
      this.calls.onWorkChanged(items => { this.workItems = items; this.host.changed(); }),
      this.calls.onTargetEntry(entry => { if (entry === null || entry.path === this.view?.root) { this.entryValue = entry; this.host.changed(); } }),
      this.calls.onComposerSettings(settings => { this.settingsValue = settings; this.host.changed(); }),
      this.calls.onDrawing(conversationId => { this.drawingPushed = true; this.setDrawing(conversationId); }),
      this.calls.onPromoted(conversationId => { this.promotedPushed = true; this.setPromoted(conversationId); }),
    ];
    void this.calls.readDrawing().then(conversationId => { if (!this.drawingPushed) this.setDrawing(conversationId); }, console.error);
    void this.calls.readPromoted().then(conversationId => { if (!this.promotedPushed) this.setPromoted(conversationId); }, console.error);
    void this.calls.getWork().then(items => { this.workItems = items; this.host.changed(); }, console.error);
    void this.calls.readComposerSettings().then(settings => { if (settings && !this.settingsValue) { this.settingsValue = settings; this.host.changed(); } }, console.error);
    return () => { for (const off of offs) off(); };
  }

  setView(view: PrototypeView | null): void {
    const before = this.view;
    this.view = view;
    if (view === null) { this.run.show(null); this.changed(); return; }
    // The push covers only folder list changes: another root is read here.
    if (before?.root !== view.root) this.readEntry();
    const target = this.target()!;
    const key = canvasKey(target);
    if (key !== this.key) {
      this.key = key;
      this.listView = "loading";
      this.last = null;
      // Main nulls the drawing for every new target, but that may come after this view: the canvas left behind's
      // drawing must not show on this one meanwhile.
      this.drawingId = null;
    }
    this.last = playingFrameChip(view, this.last);
    // A row back from being read again (a folder reload) reads the list again: list changes meanwhile were dropped.
    const back = before !== null && before.canvasRow !== "present";
    if (view.canvasRow === "present" && (this.listView === "loading" || back) && this.reading?.key !== key) this.read();
    this.run.show(target);
    this.run.panel(view.panel.open);
    // Opening the panel takes the returned queue it left to the main window while folded, if that one has not.
    const shown = this.run.view();
    if (view.panel.open && !before?.panel.open && shown?.kind === "conversation") this.store.takeDraft(view.root, shown.conversationId);
    this.changed();
  }

  focusChanged(): void { this.run.focusChanged(); this.changed(); }
  retry(): void { this.read(); }

  currentView(): PrototypeView | null { return this.view; }
  target(): PrototypeConversationTarget | null {
    const view = this.view;
    if (!view) return null;
    const lost = view.canvasRow === "gone" || view.canvasRow === "duplicate" ? view.canvasRow : null;
    return { root: view.root, canvas: view.canvasId ? { path: view.path, id: view.canvasId } : { path: view.path }, ...(lost ? { lost } : {}) };
  }
  list(): ListView { return this.listView; }
  shown(): PrototypeShown {
    const target = this.target();
    if (!target || this.view?.canvasRow === "loading") return { kind: "list_loading" };
    return prototypeShownConversation(this.listView, target);
  }
  playing(): PlayingFrameChip | null { return this.last; }
  entry(): FolderEntry | null { return this.entryValue; }
  work(): readonly WorkItem[] { return this.workItems; }
  settings(): PrototypeComposerSettings | null { return this.settingsValue; }
  seen(): ReadonlySet<string> { return this.seenIds; }
  button(): ConversationButton {
    const shown = this.shown();
    const summary = shown.kind === "conversation" && Array.isArray(this.listView) ? this.listView.find(c => c.conversationId === shown.conversationId) : undefined;
    return conversationButton(this.view?.panel.open ?? false, summary, this.seenIds);
  }

  private read(): void {
    const view = this.view, key = this.key;
    if (!view || key === null) return;
    if (this.reading?.key === key) { this.reading.again = true; return; }
    const n = ++this.reads;
    const reading = { key, again: false };
    this.reading = reading;
    void this.calls.listConversations({ root: view.root }).catch(() => ({ error: "unknown" })).then(reply => {
      if (this.reading === reading) this.reading = null;
      if (this.key !== key) return;
      if (Array.isArray(reply)) this.apply(reply, n);
      // A failed read after a good one keeps the list it had; only a canvas never read shows the failure.
      else if (!Array.isArray(this.listView)) this.listView = "error";
      if (reading.again) this.read();
      this.sync();
    });
  }

  private apply(list: readonly ConversationSummary[], n: number): void {
    const before = Array.isArray(this.listView) ? this.listView : null;
    // A conversation of this canvas that a later read no longer names was deleted in the main window: the store's
    // deleted path drops its thread and draft, so no carry below moves that draft anywhere.
    for (const c of before ?? []) {
      if (list.some(item => item.conversationId === c.conversationId)) continue;
      this.store.deleted(c.conversationId);
      this.run.deleted(c.conversationId);
    }
    for (const id of this.seenIds) if (list.some(c => c.conversationId === id && !c.unseen)) this.seenIds.delete(id);
    this.listView = list;
    this.applied = n;
  }

  // CanvasRun keeps showing what it showed while it is listed; this window shows the canvas's current conversation
  // only, so a new current one started in the main window takes over. The draft this window wrote for what it showed
  // follows, when the new conversation has none (user decision), unless its own send or start from that draft is still
  // in flight: a list naming the conversation that start made can come before the start's reply, and the composer
  // empties only the key it sent from.
  private sync(): void {
    this.run.sync();
    const shown = this.shown(), view = this.run.view(), from = this.run.composerKey();
    if (shown.kind === "conversation" && (view?.kind === "new" || (view?.kind === "conversation" && view.conversationId !== shown.conversationId))) {
      const to = `conversation:${shown.conversationId}`;
      if (from !== null && !this.inFlight.has(from)) this.store.setDrafts(drafts => carryPrototypeDraft(drafts, from, to));
      this.run.select(shown.conversationId);
    }
    this.changed();
  }

  private setPromoted(conversationId: string | null): void {
    if (conversationId === this.promotedId) return;
    this.promotedId = conversationId;
    this.changed();
  }

  private setDrawing(conversationId: string | null): void {
    if (conversationId === this.drawingId) return;
    this.drawingId = conversationId;
    this.sync();
  }

  private readEntry(): void {
    const root = this.view?.root;
    const n = ++this.entryReads;
    this.entryValue = null;
    void this.calls.readTargetEntry().then(entry => {
      if (n !== this.entryReads || (entry !== null && entry.path !== root)) return;
      this.entryValue = entry;
      this.host.changed();
    }, console.error);
  }

  // Main hears which conversation the open panel shows, for its notifications; it knows the window's focus itself.
  // Main keeps it only for a conversation of the playing canvas, so a new target sends it again.
  private changed(): void {
    const view = this.run.view();
    const id = this.view?.panel.open && view?.kind === "conversation" ? view.conversationId : null;
    if (this.showing === undefined || this.showing.id !== id || this.showing.key !== this.key) {
      this.showing = { id, key: this.key };
      void this.calls.setShowing(id).catch(console.error);
    }
    this.host.changed();
  }
}
