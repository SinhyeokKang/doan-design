import type { ConversationEvent } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { PROVIDER_NAMES } from "./agentAuthView";
import { mergeConversationEvents, stripState, type StripState } from "./conversationStrip";
import { newCanvasText } from "./firstPromptView";
import {
  conversationPhase, newCanvasCandidates, permissionToastKey, rememberRequest, removalConfirm, slotState,
  type HomeConversation, type LastRequest, type Slot,
} from "./homeConversations";
import type { StartInput, StartOutcome } from "./HomeComposerView";

// The Home conversations of this run (buzz-home design §4.5, §7): the send and the move to the project, the strip
// states, sidebar slots, canvas binding, toasts and the running-removal guard. App owns one and wires it to its
// navigation; everything is decided here so it can be driven without a DOM.

export interface HomeRunHost {
  view(): { screen: "home" | "workspace"; loadedRoot: string | null; entries: readonly FolderEntry[] };
  label(root: string): string;
  // The move after a send goes through the draft guard and waits for the project's read; it is not the person's move.
  // `arrived` says whether the run still wants it: App commits the screen only when it returns true.
  openOverview(root: string, arrived: () => boolean, unavailable: () => void): void;
  // The person moved first: a move still waiting for the project's read must not land later.
  cancelMove(): void;
  openCanvas(root: string, row: CanvasRow): void;
  goHome(): void;
  removeNow(paths: string[]): Promise<void>;
  toast(message: string, action?: string, run?: () => void): void;
  // ui-state's Home memory after a send (design §8).
  sent(request: StartInput): void;
  changed(): void;
}
interface Extras { atStart: string[]; checked: string[]; canvasOpens: number; toasted: string | null }
interface Pending { conversationId: string; root: string; moves: number; sawModal: boolean }
export interface Removing { paths: string[]; conversations: string[]; title: string; body: string; cancel: string; confirm: string }

// Text deltas only tell the strip the agent started answering; one per turn is kept.
function isText(event: ConversationEvent) { return event.type === "message.delta" || event.type === "message.done"; }

export class HomeRun {
  conversations: HomeConversation[] = [];
  strips: Record<string, StripState> = {};
  lastRequests: ReadonlyMap<string, LastRequest> = new Map();
  visits: ReadonlyMap<string, number> = new Map();
  dismissed: ReadonlySet<string> = new Set();
  removing: Removing | null = null;
  restore: { request: LastRequest; seq: number } | null = null;
  private events = new Map<string, ConversationEvent[]>();
  private unclaimed: ConversationEvent[] = [];
  private extras = new Map<string, Extras>();
  private clock = 0;
  // The person's own navigations and canvas opens, counted from the start of the run (design §4.5, §7).
  private moves = 0;
  private canvasOpens = 0;
  private ownOpen: { root: string; canvas: string } | null = null;
  private arrival: Pending | null = null;
  // The project an accepted arrival is taking the window to; App's view catches up only after its commit.
  private destination: string | null = null;
  // A canvas bound while the move after its send is still under way; decided once the move ends.
  private boundDuringMove: { conversationId: string; row: CanvasRow } | null = null;
  private focus: "stop" | null = null;

  constructor(private host: HomeRunHost) {}

  // Subscribed at App mount so no event is lost before a start's reply or the first read (ARCHITECTURE §7).
  event(event: ConversationEvent): void {
    const tracked = this.events.get(event.conversationId);
    if (!tracked) { this.unclaimed = [...this.unclaimed, event].slice(-500); return; }
    if (isText(event) && tracked.some(item => isText(item) && item.turnId === event.turnId)) return;
    this.events.set(event.conversationId, mergeConversationEvents(tracked, [event], event.conversationId));
    this.refresh(event.conversationId);
  }

  // Any navigation the person makes; a pending move after a send gives way to it.
  personNavigated(): void {
    this.moves++;
    this.destination = null;
    if (this.arrival) this.host.cancelMove();
    this.settle();
  }
  // A canvas on screen; one the run opened itself is not the person's.
  canvasShown(root: string, canvas: string): void {
    if (this.ownOpen?.root === root && this.ownOpen.canvas === canvas) { this.ownOpen = null; return; }
    this.canvasOpens++;
  }
  // A draft guard asks in a dialog; one that closes without the arrival was refused.
  modalChanged(open: boolean): void {
    if (!this.arrival) return;
    if (open) { this.arrival.sawModal = true; return; }
    if (this.arrival.sawModal) this.settle();
  }
  takeFocus(): "stop" | null { const focus = this.focus; this.focus = null; return focus; }

  async start(request: StartInput, last: LastRequest): Promise<StartOutcome> {
    // The baseline is taken before main accepts, so a canvas main binds before the reply arrives is still new (§7.3).
    const listed = this.host.view().entries.find(entry => entry.path === request.root);
    const atStart = listed?.kind === "list" ? listed.canvases.map(row => row.path) : [];
    const moves = this.moves, canvasOpens = this.canvasOpens;
    const result = await window.doan.startConversation(request).catch(() => ({ error: "unknown" }));
    if ("error" in result) { this.host.changed(); return { error: result.error, ...("missing" in result && result.missing ? { missing: result.missing } : {}) }; }
    const { conversationId } = result;
    this.extras.set(conversationId, { atStart, checked: [], canvasOpens, toasted: null });
    this.events.set(conversationId, mergeConversationEvents([], this.unclaimed, conversationId));
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.conversations = [...this.conversations, { conversationId, root: request.root, provider: request.runtime, phase: "starting" }];
    this.strips = { ...this.strips, [conversationId]: { kind: "starting" } };
    this.refresh(conversationId);
    void window.doan.readConversation({ conversationId }).then(read => {
      if ("error" in read) return;
      this.events.set(conversationId, mergeConversationEvents(read.events, this.events.get(conversationId) ?? [], conversationId));
      this.refresh(conversationId);
    }).catch(console.error);
    this.lastRequests = rememberRequest(this.lastRequests, last);
    this.host.sent(request);
    this.entriesChanged();
    // The person moved while the start was pending, or is no longer on Home: the window stays where they are.
    if (moves !== this.moves || this.host.view().screen !== "home") this.startedToast(conversationId, request.root);
    else {
      this.arrival = { conversationId, root: request.root, moves, sawModal: false };
      this.host.openOverview(request.root, () => {
        if (this.arrival?.conversationId !== conversationId || this.moves !== moves) return false;
        this.arrival = null;
        this.destination = request.root;
        // Stop, never a permission answer that came in before the reply (design §4.9, §7).
        this.focus = "stop";
        this.afterMove();
        this.host.changed();
        return true;
      }, () => this.settle());
    }
    this.host.changed();
    return { ok: true };
  }

  openConversation(conversationId: string): void {
    this.personNavigated();
    const conversation = this.conversations.find(item => item.conversationId === conversationId);
    if (!conversation) return;
    const listed = this.host.view().entries.find(entry => entry.path === conversation.root);
    const row = conversation.canvas && listed?.kind === "list" ? listed.canvases.find(item => item.path === conversation.canvas) : undefined;
    if (row) this.host.openCanvas(conversation.root, row);
    else this.host.openOverview(conversation.root, () => true, () => {});
  }

  editOnHome(root: string): void {
    const last = this.lastRequests.get(root);
    if (!last) return;
    this.restore = { request: last, seq: (this.restore?.seq ?? 0) + 1 };
    this.host.goHome();
    this.host.changed();
  }
  dismiss(conversationId: string): void { this.dismissed = new Set(this.dismissed).add(conversationId); this.host.changed(); }

  // A new canvas row is checked with main once; the conversation main bound it to takes it (design §7.3).
  entriesChanged(): void {
    for (const conversation of this.conversations) {
      const extras = this.extras.get(conversation.conversationId);
      const listed = this.host.view().entries.find(entry => entry.path === conversation.root);
      if (conversation.canvas || !extras || listed?.kind !== "list") continue;
      for (const row of newCanvasCandidates(listed.canvases, extras.atStart, extras.checked)) {
        extras.checked.push(row.path);
        void window.doan.conversationForCanvas({ root: conversation.root, canvas: { path: row.path, ...(row.id ? { id: row.id } : {}) } }).then(found => {
          if ("error" in found || found.current?.conversationId !== conversation.conversationId) return;
          this.bound(conversation.conversationId, row);
        }).catch(console.error);
      }
    }
  }
  private bound(conversationId: string, row: CanvasRow): void {
    const conversation = this.conversations.find(item => item.conversationId === conversationId);
    const extras = this.extras.get(conversationId);
    if (!conversation || !extras || conversation.canvas) return;
    if (this.arrival?.conversationId === conversationId) { this.boundDuringMove = { conversationId, row }; return; }
    this.conversations = this.conversations.map(item => item.conversationId === conversationId ? { ...item, canvas: row.path } : item);
    const current = this.host.view().entries.find(entry => entry.path === conversation.root);
    const fresh = current?.kind === "list" ? current.canvases.find(item => item.path === row.path) ?? row : row;
    // Opens by itself only on its project's screen when the person opened no canvas since sending (design §7).
    if (this.viewing(conversation.root) && this.canvasOpens === extras.canvasOpens) {
      this.ownOpen = { root: conversation.root, canvas: fresh.path };
      this.host.openCanvas(conversation.root, fresh);
    } else this.host.toast(newCanvasText(this.host.label(conversation.root)), "Open", () => this.host.openCanvas(conversation.root, fresh));
    this.host.changed();
  }

  // A row's screen on view clears its unseen Dot, also when a turn ends while the person is already there (§7.2).
  visit(keys: readonly string[]): void {
    const tick = ++this.clock, next = new Map(this.visits);
    for (const key of keys) next.set(key, tick);
    this.visits = next;
  }
  slots(): Map<string, Slot> { return slotState(this.conversations, this.visits); }
  running(): Map<string, string> {
    return new Map(this.conversations.filter(item => ["starting", "working", "permission"].includes(item.phase)).map(item => [item.root, item.conversationId] as const));
  }
  strip(root: string | null): { conversation: HomeConversation; state: StripState } | null {
    const conversation = root ? this.conversations.filter(item => item.root === root && !this.dismissed.has(item.conversationId)).at(-1) : undefined;
    const state = conversation && this.strips[conversation.conversationId];
    return conversation && state ? { conversation, state } : null;
  }

  // A running Home conversation is stopped first, and only after the person agrees (design §7.5).
  remove(paths: string[], project: string): Promise<void> {
    const ask = removalConfirm(this.conversations, paths, project);
    if (!ask) return this.host.removeNow(paths);
    this.removing = { paths, ...ask };
    this.host.changed();
    return Promise.resolve();
  }
  cancelRemove(): void { this.removing = null; this.host.changed(); }
  // Undo restores the project only; the stopped conversation does not start again.
  async confirmRemove(): Promise<void> {
    const removing = this.removing;
    if (!removing) return;
    this.removing = null; this.host.changed();
    await Promise.all(removing.conversations.map(conversationId => window.doan.interruptConversation({ conversationId }).catch(console.error)));
    await this.host.removeNow(removing.paths);
  }

  private viewing(root: string): boolean {
    if (this.destination === root) return true;
    const view = this.host.view();
    return view.screen === "workspace" && view.loadedRoot === root;
  }
  // The person moved first, the project could not be opened, or the person refused the draft guard.
  private settle(): void {
    const pending = this.arrival;
    if (!pending) return;
    this.arrival = null;
    this.startedToast(pending.conversationId, pending.root);
    this.afterMove();
  }
  private afterMove(): void {
    const bound = this.boundDuringMove;
    this.boundDuringMove = null;
    if (bound) this.bound(bound.conversationId, bound.row);
  }
  private startedToast(conversationId: string, root: string): void {
    this.host.toast(`Started in ${this.host.label(root)}.`, "Open", () => this.openConversation(conversationId));
  }
  private refresh(conversationId: string): void {
    const events = this.events.get(conversationId);
    const conversation = this.conversations.find(item => item.conversationId === conversationId);
    if (!events || !conversation) return;
    const next = stripState(events), previous = this.strips[conversationId];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
    this.conversations = this.conversations.map(item => item.conversationId === conversationId ? conversationPhase(item, next.kind, ++this.clock) : item);
    this.strips = { ...this.strips, [conversationId]: next };
    const extras = this.extras.get(conversationId);
    const ask = permissionToastKey(next, previous, this.viewing(conversation.root));
    if (ask && extras && extras.toasted !== ask) {
      extras.toasted = ask;
      this.host.toast(`${PROVIDER_NAMES[conversation.provider]} needs your answer in ${this.host.label(conversation.root)}.`, "Open", () => this.openConversation(conversationId));
    }
    this.host.changed();
  }
}

