import type { ConversationSummary } from "../../main/conversation/summary";
import type { PrototypeComposerSettings, PrototypeView, PrototypeWindowApi } from "../../main/prototype/ipc";
import type { FolderEntry } from "../../main/view";
import type { WorkItem } from "../../main/workState";
import type { DoanApi } from "../../preload";
import { canvasConversationTitle, type ConversationCalls } from "../CanvasConversationPanel";
import { CanvasRun, canvasKey, type ResumeCalls } from "../canvasRun";
import { ConversationStore, type ListView, type StoreCalls } from "../conversationStore";
import { LIST_RETRY_IDLE, type ListRetry } from "../listRetry";
import { DockedSupport, type DockedSupportCalls } from "../dockedSupport";
import { canvasStrongestSignal, type CanvasSignal } from "../rightPanelOpen";
import type { ThumbnailCalls } from "../thumbnails";
import type { VisibleCalls } from "../visibleClock";
import { conversationButton, playingFrameChip, prototypeHeadTitle, prototypeShown, type ConversationButton, type PlayingFrameChip, type PrototypeConversationTarget, type PrototypeShown } from "./conversation";

// The prototype window's conversation host without a DOM. It keeps this window's own store (so its drafts, question
// picks and attachment chips are its own) and its own canvas run (so it picks, follows and keeps what it shows by the
// main window's rules, independently of the main window), and reads the playing canvas's conversations (main answers
// only that canvas's rows). The main window's runs are not here: nothing this window does reaches its selection,
// panel or drafts.

// Everything the panel calls: `window.doanPrototype`'s members of the same names as `window.doan`'s, and its own.
export type PrototypeConversationCalls = ConversationCalls & StoreCalls & DockedSupportCalls & ResumeCalls & VisibleCalls & ThumbnailCalls
  & Pick<DoanApi, "deleteConversation" | "markConversationSeen" | "onConversationEvent" | "onConversationStage" | "onConversationBoundary" | "onConversationListChanged" | "getWork" | "onWorkChanged">
  & Pick<PrototypeWindowApi, "listConversations" | "setShowing" | "reveal" | "rememberChoice" | "readComposerSettings" | "onComposerSettings" | "readTargetEntry" | "onTargetEntry" | "rememberedConversation" | "conversationListed">;

export interface PrototypeRunHost {
  changed(): void;
  notice(text: string): void;
  focused(): boolean;
}

interface SeenMark {
  key: string;
  confirmFromRead: number | null;
}

export class PrototypeConversationRun {
  readonly store: ConversationStore;
  readonly run: CanvasRun;
  readonly support: DockedSupport;
  // The calls the panel body makes: this window's, with its starts held in the canvas run until main answers, so a
  // conversation that appears meanwhile never takes the draft being sent.
  readonly bodyCalls: PrototypeConversationCalls;
  private view: PrototypeView | null = null;
  // The playing canvas whose list is held: main answers a list with that canvas's rows only, so a switch of canvas
  // (or root, worktrees sharing ids and paths) starts over.
  private key: string | null = null;
  // Moves with every switch of canvas: only a read made since the last switch applies. A read from an earlier play of
  // the same canvas (A, B, A) can answer after a newer one, and its older list would drop what the newer one named.
  private epoch = 0;
  private listView: ListView = "loading";
  // A failed list's Retry: true while its read is out, and the Retries that failed in a row. Only a Retry counts: a
  // read made for another reason that fails again is not announced again.
  private retrying = false;
  private listFailures = 0;
  private reading: { epoch: number; views: number; again: boolean } | null = null;
  private views = 0;
  // A list change or confirmation could not be read for this canvas. The next available view reads again,
  // even of this same canvas (A, B, A coalesced into one view of A).
  private missed = false;
  private reads = 0;
  private applied = 0;
  private last: PlayingFrameChip | null = null;
  private entryValue: FolderEntry | null = null;
  private entryReads = 0;
  private workItems: readonly WorkItem[] = [];
  private settingsValue: PrototypeComposerSettings | null = null;
  // What main last heard the open panel shows, with the target and the view's run it was sent under (undefined:
  // nothing sent yet).
  private showing: { id: string | null; key: string | null; gen: number | null } | undefined = undefined;
  // Only a list read started after a successful write can supersede that mark, including with a newer unread ending.
  private seenMarks = new Map<string, SeenMark>();
  // The conversation last seen on the playing canvas on this device, as main reads it from ui-state (the main window
  // is its only writer, so this window never writes it): undefined until the read for this canvas settles, which holds
  // the first pick; null for none, or a failed read. Moves with every switch of canvas, so a late answer for the canvas
  // left behind is dropped.
  private rememberedId: string | null | undefined = undefined;
  private rememberedTurn = 0;
  // Whether the source of a handoff card from the Overview is still indexed under the playing root, by conversation id,
  // as main answered. This window lists only the canvas's conversations, so it asks main; a list change of the playing
  // root asks again, and a switch of root forgets every answer. An unknown answer (null: main played another root
  // meanwhile, or could not read its index) is not kept, so the next render asks again. sourceAsks: the asks in flight
  // with the turn they were asked in, one per id and turn. The turn drops an answer asked before a list change or a
  // switch of root.
  private sourceListed = new Map<string, boolean>();
  private sourceAsks = new Map<string, number>();
  private sourceTurn = 0;

  constructor(private readonly calls: PrototypeConversationCalls, private readonly host: PrototypeRunHost) {
    const list = (root: string): ListView => (this.view?.root === root ? this.listView : "loading");
    // A returned queue goes to the window the person looks at: this one only while its panel is open (user decision).
    this.store = new ConversationStore({ list, readsStarted: () => this.reads, readsApplied: () => this.applied, notice: text => host.notice(text), changed: () => host.changed(), takesDrafts: () => this.view?.panel.open === true }, calls);
    this.run = new CanvasRun({
      list, readsStarted: () => this.reads, readsApplied: () => this.applied,
      reread: root => { if (this.view?.root === root) this.read(); },
      listRetry: root => (this.view?.root === root ? this.listRetry() : LIST_RETRY_IDLE),
      markSeen: (conversationId, seq) => { void this.markSeen(conversationId, seq); },
      focused: () => host.focused(),
      remembered: (root, canvas) => (this.key !== null && canvasKey({ root, canvas }) === this.key ? this.rememberedId : undefined),
      changed: () => this.changed(),
    }, this.store, calls);
    this.support = new DockedSupport(() => host.changed(), calls);
    this.bodyCalls = {
      ...calls,
      // Main starts only canvas conversations for this window; a start without a canvas has no draft here to guard.
      startConversation: request => {
        if (!request.canvas) return calls.startConversation(request);
        // The canvas run holds its new state's draft back too while this start is in flight.
        const sending = this.run.startSending({ root: request.root, canvas: request.canvas });
        return calls.startConversation(request).finally(sending);
      },
    };
  }

  // Subscribe first, then read (ARCHITECTURE §7 'Events'): every read this window makes, the first and each one after
  // a switch of canvas, comes after these.
  connect(): () => void {
    const offs = [
      this.calls.onConversationEvent(event => this.store.event(event)),
      this.calls.onConversationStage(signal => this.store.stage(signal)),
      this.calls.onConversationBoundary(signal => this.store.boundary(signal)),
      this.calls.onConversationListChanged(({ root }) => {
        if (this.view?.root !== root) return;
        if (this.view.canvasRow === "present") this.read();
        this.askSourcesAgain(root);
      }),
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
    this.views++;
    if (view === null) { this.run.show(null); this.changed(); return; }
    // The push covers only folder list changes: another root is read here.
    if (before?.root !== view.root) { this.readEntry(); this.sourceTurn++; this.sourceListed.clear(); this.sourceAsks.clear(); }
    const target = this.target()!;
    const key = canvasKey(target);
    if (key !== this.key) {
      this.key = key;
      this.epoch++;
      this.missed = false;
      this.listView = "loading";
      this.retrying = false;
      this.listFailures = 0;
      this.last = null;
      this.readRemembered();
    }
    this.last = playingFrameChip(view, this.last);
    // A row back from being read again (a folder reload) reads the list again: list changes meanwhile were dropped.
    const back = before !== null && before.canvasRow !== "present";
    if (view.canvasRow === "present" && (((this.listView === "loading" || back) && this.reading?.epoch !== this.epoch) || this.missed)) this.read();
    // Close before showing the target so folding cannot retry a failed read mark.
    if (!view.panel.open) this.run.panel(false);
    this.run.show(target);
    if (view.panel.open) this.run.panel(true);
    // Opening the panel takes the returned queue it left to the main window while folded, if that one has not.
    const shown = this.run.view();
    if (view.panel.open && !before?.panel.open && shown?.kind === "conversation") this.store.takeDraft(view.root, shown.conversationId);
    this.changed();
  }

  focusChanged(): void { this.run.focusChanged(); this.changed(); }
  retry(): void {
    // A Retry of a failed list runs, busy at once, until its read settles.
    if (this.listView === "error" && !this.retrying) { this.retrying = true; this.changed(); }
    this.read();
  }
  listRetry(): ListRetry {
    if (this.listView !== "error") return LIST_RETRY_IDLE;
    return { running: this.retrying, failures: this.listFailures };
  }

  // The head menu's Delete, as the main window's: the store marks the conversation as being deleted before main is
  // asked, so no list read picks it meanwhile, and the mark ends exactly once, deleted (success, or not_found: main has
  // none either) or cancelled. Answers main's refusal code, null on success.
  async deleteConversation(conversationId: string): Promise<string | null> {
    this.store.startDelete(conversationId);
    let code: string | null = "unknown";
    try {
      const reply = await this.calls.deleteConversation({ conversationId });
      code = reply && "error" in reply ? reply.error : null;
    } catch (error) { console.error(error); }
    // The cleanup may throw (a run's defect); the mark still ends once and the answer still comes back, or the
    // window's alert would stay open until a reload.
    try {
      if (code === null || code === "not_found") {
        try { this.run.deleted(conversationId); } finally { this.store.deleted(conversationId); }
      } else { this.store.cancelDelete(conversationId); this.run.sync(); }
      this.changed();
    } catch (error) { console.error(error); }
    return code;
  }

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
    if (!target) return { kind: "list_loading" };
    return prototypeShown(this.run.view(), target, this.view?.canvasRow === "loading");
  }
  playing(): PlayingFrameChip | null { return this.last; }
  entry(): FolderEntry | null { return this.entryValue; }
  work(): readonly WorkItem[] { return this.workItems; }
  settings(): PrototypeComposerSettings | null { return this.settingsValue; }
  seen(): ReadonlySet<string> { return new Set(this.seenMarks.keys()); }
  // The panel head's title: the main window's title for the conversation shown, or the shell's own "Conversation".
  headTitle(): string { return prototypeHeadTitle(this.shown(), canvasConversationTitle(this.run, this.listView).title); }
  // The folded panel's button stands for the strongest signal across the playing canvas's conversations, as the main
  // window's: its conversation's own mark, in this window's order (an answer needed, working, an unread ending), is that
  // signal's kind.
  button(): ConversationButton {
    const signal = this.signal();
    const summary = signal && Array.isArray(this.listView) ? this.listView.find(c => c.conversationId === signal.conversationId) : undefined;
    return conversationButton(summary);
  }
  // Show conversation with a badge opens on the conversation the badge stands for; without one the panel keeps what it
  // showed. Called just before the window asks main to open the panel.
  unfoldTarget(): void {
    const target = this.target(), signal = this.signal();
    if (!target || !signal || this.view?.panel.open) return;
    this.run.request({ root: target.root, canvas: target.canvas }, signal.conversationId, signal.kind === "permission" ? "permission" : null);
  }
  private signal(): CanvasSignal | null {
    const target = this.target();
    return target && Array.isArray(this.listView) ? canvasStrongestSignal(this.listView, target.canvas, this.seen()) : null;
  }

  private async markSeen(conversationId: string, seq: number): Promise<void> {
    if (this.key === null) return;
    const mark: SeenMark = { key: this.key, confirmFromRead: null };
    this.seenMarks.set(conversationId, mark);
    const reply = await this.calls.markConversationSeen({ conversationId, seq }).catch(() => ({ error: "unknown" }));
    if (this.seenMarks.get(conversationId) !== mark) return;
    if (reply && "error" in reply) {
      this.seenMarks.delete(conversationId);
      this.run.seenFailed(conversationId, seq);
      this.host.changed();
    } else {
      mark.confirmFromRead = this.reads + 1;
      // Marking an already persisted seq emits no list change. Confirm even when the last notification started
      // its read before this reply: it may name a newer unseen ending.
      if (this.key === mark.key) {
        if (this.view?.canvasRow === "present") this.read();
        else this.missed = true;
      }
    }
  }

  // The request names the canvas this view shows: main answers its rows only while it still plays that canvas.
  private read(): void {
    const target = this.target();
    if (!target || this.key === null) return;
    const epoch = this.epoch;
    if (this.reading?.epoch === epoch) { this.reading.again = true; return; }
    const n = ++this.reads;
    const reading = { epoch, views: this.views, again: false };
    this.reading = reading;
    this.missed = false;
    void this.calls.listConversations({ root: target.root, canvas: target.canvas }).catch(() => ({ error: "unknown" })).then(reply => {
      if (this.reading === reading) this.reading = null;
      if (this.epoch !== epoch) return;
      if (Array.isArray(reply)) this.apply(reply, n);
      // Not a failure, and no answer for this canvas: the view of what main plays reads again, or, when it came while
      // this read was out, a read now does.
      else if (reply.error === "not_playing") { if (reading.views !== this.views) reading.again = true; else this.missed = true; }
      // A failed read after a good one keeps the list it had; only a canvas never read shows the failure.
      else if (!Array.isArray(this.listView)) { this.listView = "error"; if (this.retrying && !reading.again) this.listFailures++; }
      if (reading.again) this.read();
      else this.retrying = false;
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
    for (const [id, mark] of this.seenMarks) if (mark.key === this.key && mark.confirmFromRead !== null && n >= mark.confirmFromRead) this.seenMarks.delete(id);
    this.listView = list;
    this.listFailures = 0;
    this.applied = n;
  }

  private sync(): void {
    this.run.sync();
    this.changed();
  }

  // Whether a handoff card's Overview source still exists: false only once main said so for the playing root; unknown
  // reads as there, as the main window's loading list does (PRODUCT §5 item 2 'Handoff').
  conversationListed(conversationId: string): boolean {
    const root = this.view?.root;
    if (root === undefined) return true;
    // Called while the card renders: the ask starts at most once per id and turn, and an answer that changes what the
    // card shows draws it again. An unknown answer changes nothing, so asking again on the next render cannot loop.
    if (!this.sourceListed.has(conversationId) && this.sourceAsks.get(conversationId) !== this.sourceTurn) this.askSource(root, conversationId);
    return this.sourceListed.get(conversationId) !== false;
  }
  private askSource(root: string, conversationId: string): void {
    const turn = this.sourceTurn;
    this.sourceAsks.set(conversationId, turn);
    void this.calls.conversationListed({ root, conversationId }).catch((error: unknown) => { console.error(error); return null; }).then(answer => {
      if (this.sourceAsks.get(conversationId) === turn) this.sourceAsks.delete(conversationId);
      if (turn !== this.sourceTurn || this.view?.root !== root) return;
      const had = this.sourceListed.get(conversationId);
      if (answer === null) this.sourceListed.delete(conversationId); else this.sourceListed.set(conversationId, answer);
      if (had !== (answer ?? undefined)) this.host.changed();
    });
  }
  // An earlier answer stays until the new one lands, so the card does not flicker.
  private askSourcesAgain(root: string): void {
    this.sourceTurn++;
    for (const conversationId of new Set([...this.sourceListed.keys(), ...this.sourceAsks.keys()])) this.askSource(root, conversationId);
  }

  // Main answers for the canvas it plays; the answer applies only while this window still holds the canvas it asked for.
  private readRemembered(): void {
    const turn = ++this.rememberedTurn;
    this.rememberedId = undefined;
    void this.calls.rememberedConversation().catch((error: unknown) => { console.error(error); return null; }).then(conversationId => {
      if (turn !== this.rememberedTurn) return;
      this.rememberedId = conversationId;
      this.sync();
    });
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
  // Main keeps it only until the playing canvas changes, even back to the same canvas, so every new run sends it again:
  // a play of another canvas always loads a new run, and views coalesced from A, B, A keep the key but not the gen.
  private changed(): void {
    const view = this.run.view();
    const id = this.view?.panel.open && view?.kind === "conversation" ? view.conversationId : null;
    const gen = this.view?.gen ?? null;
    if (this.showing === undefined || this.showing.id !== id || this.showing.key !== this.key || this.showing.gen !== gen) {
      this.showing = { id, key: this.key, gen };
      void this.calls.setShowing(id).catch(console.error);
    }
    this.host.changed();
  }
}
