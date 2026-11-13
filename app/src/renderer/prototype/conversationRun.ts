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
  & Pick<PrototypeWindowApi, "setShowing" | "reveal" | "rememberChoice" | "readComposerSettings" | "onComposerSettings" | "readTargetEntry" | "onTargetEntry">;

export interface PrototypeRunHost {
  changed(): void;
  notice(text: string): void;
  focused(): boolean;
}

export class PrototypeConversationRun {
  readonly store: ConversationStore;
  readonly run: CanvasRun;
  readonly support: DockedSupport;
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

  constructor(private readonly calls: PrototypeConversationCalls, private readonly host: PrototypeRunHost) {
    const list = (root: string): ListView => (this.view?.root === root ? this.listView : "loading");
    this.store = new ConversationStore({ list, readsStarted: () => this.reads, readsApplied: () => this.applied, notice: text => host.notice(text), changed: () => host.changed() }, calls);
    this.run = new CanvasRun({
      list, readsStarted: () => this.reads, readsApplied: () => this.applied,
      reread: root => { if (this.view?.root === root) this.read(); },
      markSeen: (conversationId, seq) => { this.seenIds.add(conversationId); void calls.markConversationSeen({ conversationId, seq }).catch(console.error); },
      focused: () => host.focused(),
      // The drawing project conversation is not this window's to know: it reads only the playing canvas's rows.
      drawing: () => null,
      changed: () => this.changed(),
    }, this.store, calls);
    this.support = new DockedSupport(() => host.changed(), calls);
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
    ];
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
    }
    this.last = playingFrameChip(view, this.last);
    if (view.canvasRow === "present" && this.listView === "loading" && this.reading?.key !== key) this.read();
    this.run.show(target);
    this.run.panel(view.panel.open);
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
  // only, so a new current one started in the main window takes over, with the previous conversation's draft when it
  // has none. The new conversation state's draft stays: it may be this window's own first message still being sent,
  // whose start a list read can name before the start's reply comes.
  private sync(): void {
    this.run.sync();
    const shown = this.shown(), view = this.run.view();
    if (shown.kind === "conversation" && (view?.kind === "new" || (view?.kind === "conversation" && view.conversationId !== shown.conversationId))) {
      if (view.kind === "conversation") {
        const from = `conversation:${view.conversationId}`, to = `conversation:${shown.conversationId}`;
        this.store.setDrafts(drafts => carryPrototypeDraft(drafts, from, to));
      }
      this.run.select(shown.conversationId);
    }
    this.changed();
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
