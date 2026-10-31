import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { PROVIDER_NAMES } from "./agentAuthView";
import { conversationWork, slotKeyOf, slotsFromList } from "./conversationList";
import { mergeConversationEvents, stripState, type StripState } from "./conversationStrip";
import { newCanvasText } from "./newCanvasText";
import { splitRequest, type AttachmentDraft } from "./homeComposer";
import {
  newCanvasCandidates, permissionToastKey, rememberRequest, removalConfirm, slotKey,
  type HomeConversation, type LastRequest, type Slot,
} from "./homeConversations";
import type { StartInput, StartOutcome } from "./HomeComposerView";

// Home conversations (buzz-home design §4.5, §7; buzz-conversation design §3.4): the send and the move to the project,
// the strip, sidebar slots, the new canvas a turn makes, toasts and the running-removal guard. What survives a reload
// comes from main's conversation list (conversation:list); this run's events keep the strip live between list reads.
// App owns one and wires it to its navigation; everything is decided here so it can be driven without a DOM.

export interface HomeRunHost {
  // canvas: the canvas open in the loaded root's workspace, as committed (the same rows App's visits name).
  view(): { screen: "home" | "workspace" | "addProjects" | "settings"; loadedRoot: string | null; entries: readonly FolderEntry[]; canvas: string | null };
  label(root: string): string;
  // The move after a send goes through the draft guard and waits for the project's read; it is not the person's move.
  // `arrived` says whether the run still wants it: App commits the screen only when it returns true. `conversationId`
  // is the project conversation the Overview should show (buzz-project design §2.4).
  openOverview(root: string, arrived: () => boolean, unavailable: () => void, conversationId: string): void;
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
// opened: the new canvas this conversation's turn made was already opened or offered; one per conversation.
// endedAt: when this run saw the conversation's turn end (Date.now()).
interface Extras { atStart: string[]; checked: string[]; canvasOpens: number; toasted: string | null; opened: boolean; endedAt?: number }
interface Pending { conversationId: string; root: string; moves: number; sawModal: boolean }
export interface Removing { paths: string[]; conversations: string[]; title: string; body: string; cancel: string; confirm: string }

const RUNNING: readonly StripState["kind"][] = ["starting", "working", "permission"];
const RANK: Record<StripState["kind"], number> = { permission: 3, starting: 2, working: 2, done: 1, failed: 1, interrupted: 1 };
const RANK_SLOT: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1 };

// Text deltas only tell the strip the agent started answering; one per turn is kept.
function isText(event: ConversationEvent) { return event.type === "message.delta" || event.type === "message.done"; }
// A project conversation main still works on in its root: Home's reason line and the removal guard count it, as main's
// project limit does (orch decision 21). working also covers what the history cannot show: a turn waiting for its
// judgement, a queue about to go out, a send waiting for the previous process. Main binds a canvas only after a turn
// ends, so a working conversation with a canvas is a canvas one.
const holdsRoot = (c: ConversationSummary) => c.state === "current" && c.working && !c.canvas;
// Must equal main's BIND_GRACE_MS (main/conversation/project.ts), which the renderer cannot import (POSTMORTEM
// 2026-10-30); homeRun.test.ts compares the two. Main still counts a project conversation this long after its turn
// ends and binds the canvas the turn made in it, so a refusal and a late folder update both live this long.
export const BIND_GRACE_MS = 10_000;

export class HomeRun {
  // This run's Home conversations, and those taken from the list for the strip after a reload.
  conversations: HomeConversation[] = [];
  strips: Record<string, StripState> = {};
  lastRequests: ReadonlyMap<string, LastRequest & { conversationId: string }> = new Map();
  dismissed: ReadonlySet<string> = new Set();
  removing: Removing | null = null;
  restore: { request: LastRequest; seq: number } | null = null;
  // main's list per registered root, and a count that moves with each list App draws from.
  lists: ReadonlyMap<string, readonly ConversationSummary[]> = new Map();
  revision = 0;
  private events = new Map<string, ConversationEvent[]>();
  private unclaimed: ConversationEvent[] = [];
  private extras = new Map<string, Extras>();
  // Reads of the list: one in flight per root; a notice that arrives meanwhile asks for one more after it (RA1 N2).
  private reads = new Map<string, { again: boolean }>();
  private readCount = new Map<string, number>();
  // Conversations the person saw (Dismiss, a visit): hidden as seen until a list read that started after main took the
  // marker; `from` is null while main has not answered. The reply and the list notice come in either order
  // (POSTMORTEM 2026-10-26).
  private seen = new Map<string, { root: string; from: number | null }>();
  // A later seq the Overview asked to mark while an earlier mark was still waiting for main.
  private laterSeen = new Map<string, number>();
  // Roots whose last list read failed, and the number of the last read applied per root.
  private listErrors = new Set<string>();
  private applied = new Map<string, number>();
  // When main last refused a start in a root as project_busy, and the list read last asked for then. The reason line
  // shows without Open until a list read asked for after the refusal arrives, which names the holder or none (at most
  // BIND_GRACE_MS, should that read fail).
  private refused = new Map<string, { at: number; after: number }>();
  // Conversations from an earlier run taken from the list: a turn left unfinished there was folded by main.
  private claimed = new Set<string>();
  private claiming = new Set<string>();
  private histories = new Map<string, Promise<{ events: ConversationEvent[] } | null>>();
  // The person's own navigations and canvas opens, counted from the start of the run (design §4.5, §7).
  private moves = 0;
  private canvasOpens = 0;
  private ownOpen: { root: string; canvas: string } | null = null;
  private arrival: Pending | null = null;
  // The project an accepted arrival is taking the window to; App's view catches up only after its commit.
  private destination: string | null = null;
  // A new canvas that appeared while the move after its send is still under way; decided once the move ends.
  private openedDuringMove: { conversationId: string; row: CanvasRow } | null = null;
  private focus: "composer" | null = null;

  constructor(private host: HomeRunHost) {}

  // Subscribed at App mount so no event is lost before a start's reply or the first read (ARCHITECTURE §7).
  event(event: ConversationEvent): void {
    const tracked = this.events.get(event.conversationId);
    if (!tracked) { this.unclaimed = [...this.unclaimed, event].slice(-500); return; }
    if (isText(event) && tracked.some(item => isText(item) && item.turnId === event.turnId)) return;
    this.events.set(event.conversationId, mergeConversationEvents(tracked, [event], event.conversationId));
    this.refresh(event.conversationId);
  }

  // conversation:listChanged for a root.
  listChanged(root: string): void { this.readList(root); }

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
  takeFocus(): "composer" | null { const focus = this.focus; this.focus = null; return focus; }

  // stay: sent from the project's Overview, which shows the new conversation itself; there is no move and no toast.
  async start(request: StartInput, last: LastRequest, options: { stay?: boolean } = {}): Promise<StartOutcome> {
    // The baseline is taken before main accepts, so a canvas that appears before the reply arrives is still new (§7.3).
    const listed = this.host.view().entries.find(entry => entry.path === request.root);
    const atStart = listed?.kind === "list" ? listed.canvases.map(row => row.path) : [];
    const moves = this.moves, canvasOpens = this.canvasOpens;
    const result = await window.doan.startConversation(request).catch(() => ({ error: "unknown" }));
    if ("error" in result) {
      // The list had not shown the conversation that holds the root yet; read it to name that conversation.
      if (result.error === "project_busy") {
        const refusal = { at: Date.now(), after: this.readCount.get(request.root) ?? 0 };
        this.refused.set(request.root, refusal);
        setTimeout(() => { if (this.refused.get(request.root) === refusal) { this.refused.delete(request.root); this.host.changed(); } }, BIND_GRACE_MS);
        this.readList(request.root);
      }
      this.host.changed();
      return { error: result.error, ...("missing" in result && result.missing ? { missing: result.missing } : {}) };
    }
    const { conversationId } = result;
    this.extras.set(conversationId, { atStart, checked: [], canvasOpens, toasted: null, opened: false });
    this.track(conversationId);
    // The list and its history read may have registered this conversation before the reply (POSTMORTEM 2026-10-26):
    // it becomes this run's own, once.
    this.claimed.delete(conversationId);
    if (!this.conversations.some(item => item.conversationId === conversationId)) {
      this.conversations = [...this.conversations, { conversationId, root: request.root, provider: request.runtime, phase: "starting" }];
      this.strips = { ...this.strips, [conversationId]: { kind: "starting" } };
    }
    this.refresh(conversationId);
    void this.history(conversationId).then(read => {
      if (!read) return;
      this.events.set(conversationId, mergeConversationEvents(read.events, this.events.get(conversationId) ?? [], conversationId));
      this.refresh(conversationId);
    });
    this.lastRequests = rememberRequest(this.lastRequests, { ...last, conversationId });
    this.host.sent(request);
    // The person moved while the start was pending, or is no longer on Home: the window stays where they are.
    if (options.stay) { /* the Overview shows it */ }
    else if (moves !== this.moves || this.host.view().screen !== "home") this.startedToast(conversationId, request.root);
    else {
      this.arrival = { conversationId, root: request.root, moves, sawModal: false };
      this.host.openOverview(request.root, () => {
        if (this.arrival?.conversationId !== conversationId || this.moves !== moves) return false;
        this.arrival = null;
        this.destination = request.root;
        // The composer under the conversation, never a permission answer that came in before the reply
        // (buzz-project design §2.5).
        this.focus = "composer";
        this.afterMove();
        this.host.changed();
        return true;
      }, () => this.settle(), conversationId);
    }
    // After the arrival is set up: a canvas that appeared before the reply opens once the move ends.
    this.entriesChanged();
    this.host.changed();
    return { ok: true, conversationId };
  }

  // A send in an existing project conversation from the Overview (buzz-project spec decision 6): the new canvas its
  // turn makes opens as a start's does, from the canvases listed before main accepted the send and only while the
  // person opened no canvas since. An edit of a canvas already listed is not new; main's promotion handles it.
  async send(root: string, provider: Provider, request: Parameters<Window["doan"]["sendConversation"]>[0]): Promise<void | { error: string; missing?: string[] }> {
    const listed = this.host.view().entries.find(entry => entry.path === root);
    const atStart = listed?.kind === "list" ? listed.canvases.map(row => row.path) : [];
    const canvasOpens = this.canvasOpens;
    const id = request.conversationId;
    // What this run held of the conversation before the send: the turn it starts comes after it.
    const before = Math.max(0, ...[...this.events.get(id) ?? [], ...this.unclaimed.filter(event => event.conversationId === id)].map(event => event.seq));
    const sentAt = Date.now();
    const reply = await window.doan.sendConversation(request).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) return { error: reply.error, ...("missing" in reply && Array.isArray(reply.missing) ? { missing: reply.missing as string[] } : {}) };
    const previous = this.extras.get(id);
    this.track(id);
    // The turn may have started, and even ended, before the reply: its end keeps main's binding window for the
    // canvas it made, whichever arrived first.
    const turn = (this.events.get(id) ?? []).filter(event => event.seq > before);
    const state = turn.length ? stripState(this.events.get(id)!) : null;
    const ended = state !== null && !RUNNING.includes(state.kind);
    const endedAt = ended ? (previous?.endedAt !== undefined && previous.endedAt >= sentAt ? previous.endedAt : Date.now()) : undefined;
    this.extras.set(id, { atStart, checked: [], canvasOpens, toasted: previous?.toasted ?? null, opened: false, ...(endedAt !== undefined ? { endedAt } : {}) });
    const phase = state?.kind ?? "starting";
    if (!this.conversations.some(item => item.conversationId === id)) {
      this.claimed.delete(id);
      this.conversations = [...this.conversations, { conversationId: id, root, provider, phase }];
      void this.history(id).then(read => {
        if (!read) return;
        this.events.set(id, mergeConversationEvents(read.events, this.events.get(id) ?? [], id));
        this.refresh(id);
      });
    } else this.conversations = this.conversations.map(item => item.conversationId === id ? { ...item, phase } : item);
    this.strips = { ...this.strips, [id]: state ?? { kind: "starting" } };
    this.entriesChanged();
    this.host.changed();
  }

  // A conversation this run knows, from its own start or main's list.
  knows(conversationId: string): boolean {
    return this.conversations.some(item => item.conversationId === conversationId) || this.summary(conversationId) !== null;
  }

  openConversation(conversationId: string): void {
    this.personNavigated();
    const found = this.summary(conversationId);
    const root = this.conversations.find(item => item.conversationId === conversationId)?.root ?? found?.root;
    if (!root) return;
    const row = this.canvasRow(root, conversationId);
    if (row) this.host.openCanvas(root, row);
    else this.host.openOverview(root, () => true, () => {}, conversationId);
  }

  // Edit on Home (design §3.4): this run's own last request when it is still the root's, otherwise rebuilt from the
  // conversation's last user.message and main's index; attachments are issued again from their paths, and a file that
  // moved comes back as a missing chip. A move the person makes meanwhile wins.
  async editOnHome(conversationId: string): Promise<void> {
    const root = this.conversations.find(item => item.conversationId === conversationId)?.root ?? this.summary(conversationId)?.root;
    if (!root) return;
    const kept = this.lastRequests.get(root);
    if (kept?.conversationId === conversationId) { this.restoreTo(kept); return; }
    const moves = this.moves;
    const request = await this.rebuild(conversationId, root).catch(() => null);
    if (request && moves === this.moves) this.restoreTo(request);
  }
  // Dismiss records the conversation as seen in main, so a reload does not bring it back.
  dismiss(conversationId: string): void {
    this.dismissed = new Set(this.dismissed).add(conversationId);
    this.markSeen(conversationId);
    this.host.changed();
  }

  // A turn of a Home conversation that makes a new canvas opens it where the person looks, without waiting for main's
  // binding, which is decided after the turn ends (decision 17, design §2.4); slots follow main's list once it binds.
  entriesChanged(): void {
    this.syncRoots();
    for (const conversation of this.conversations) {
      const extras = this.extras.get(conversation.conversationId);
      const listed = this.host.view().entries.find(entry => entry.path === conversation.root);
      // While the turn runs, and for main's binding window after it ends: the folder update can land after turn.done.
      const live = RUNNING.includes(conversation.phase) || (extras?.endedAt !== undefined && Date.now() - extras.endedAt <= BIND_GRACE_MS);
      if (!extras || extras.opened || !live || listed?.kind !== "list") continue;
      const rows = newCanvasCandidates(listed.canvases, extras.atStart, extras.checked);
      extras.checked.push(...rows.map(row => row.path));
      if (rows[0]) { extras.opened = true; this.canvasAppeared(conversation.conversationId, rows[0]); }
    }
  }
  private canvasAppeared(conversationId: string, row: CanvasRow): void {
    const conversation = this.conversations.find(item => item.conversationId === conversationId);
    const extras = this.extras.get(conversationId);
    if (!conversation || !extras) return;
    if (this.arrival?.conversationId === conversationId) { this.openedDuringMove = { conversationId, row }; return; }
    const current = this.host.view().entries.find(entry => entry.path === conversation.root);
    const fresh = current?.kind === "list" ? current.canvases.find(item => item.path === row.path) ?? row : row;
    // Opens by itself only on its project's screen when the person opened no canvas since sending (design §7).
    if (this.viewing(conversation.root) && this.canvasOpens === extras.canvasOpens) {
      this.ownOpen = { root: conversation.root, canvas: fresh.path };
      this.host.openCanvas(conversation.root, fresh);
    } else this.host.toast(newCanvasText(this.host.label(conversation.root)), "Open", () => this.host.openCanvas(conversation.root, fresh));
    this.host.changed();
  }

  // A row's screen on view marks its unseen endings seen, also when a turn ends while the person is already there
  // (App calls this again when the list changes).
  // A project conversation is seen only in the Overview's main column (buzz-project spec decision 11, markSeenThrough),
  // so a visit marks canvas conversations only, on their canvas row or, once that canvas left, on the project row.
  visit(keys: readonly string[]): void {
    for (const [root, list] of this.lists) {
      for (const c of list) {
        if (!c.fromHome || !c.canvas || c.phase !== "ended" || !c.unseen || this.seen.has(c.conversationId)) continue;
        if (keys.includes(slotKeyOf(root, c, this.rows(root)))) this.markSeen(c.conversationId);
      }
    }
  }
  // The Overview marks what it showed up to `seq`; a mark still waiting for main is followed by this one.
  markSeenThrough(conversationId: string, seq: number): void {
    const root = this.rootOf(conversationId);
    if (!root) return;
    if (this.seen.get(conversationId)?.from === null) { this.laterSeen.set(conversationId, Math.max(this.laterSeen.get(conversationId) ?? 0, seq)); return; }
    this.seen.set(conversationId, { root, from: null });
    this.host.changed();
    void this.sendSeen(conversationId, root, seq);
  }
  // Conversations marked seen whose list read has not shown main's marker yet.
  seenPending(): ReadonlySet<string> { return new Set(this.seen.keys()); }
  // Main's list for a root: loading until a read answers, error while the last read failed and none answered before.
  listState(root: string): readonly ConversationSummary[] | "loading" | "error" {
    return this.lists.get(root) ?? (this.listErrors.has(root) ? "error" : "loading");
  }
  retryList(root: string): void { this.readList(root); }
  readsStarted(root: string): number { return this.readCount.get(root) ?? 0; }
  readsApplied(root: string): number { return this.applied.get(root) ?? 0; }
  // The project conversation behind a project row's slot (buzz-project design §2.4): opening the row's Overview asks
  // for it. The strongest state first, then the latest activity; null when the slot is a canvas conversation's or none.
  slotConversation(root: string): { conversationId: string; waiting: boolean } | null {
    const seen = new Set(this.seen.keys());
    let best: { c: ConversationSummary; rank: number } | null = null;
    for (const c of this.merged().get(root) ?? []) {
      const work = c.fromHome && !c.canvas ? conversationWork(c, seen) : null;
      if (!work) continue;
      const rank = RANK_SLOT[work.kind];
      if (!best || rank > best.rank || (rank === best.rank && c.lastActivityAt > best.c.lastActivityAt)) best = { c, rank };
    }
    return best && { conversationId: best.c.conversationId, waiting: best.c.phase === "waiting" };
  }
  slots(): Map<string, Slot> {
    return slotsFromList(this.merged(), new Set(this.seen.keys()), root => this.rows(root));
  }
  // Home's reason line by root (spec decision 18): the conversation that holds the root, and whether it waits for an
  // answer. After a late project_busy with no such conversation listed yet, the line names none.
  running(): Map<string, { conversationId: string; waiting: boolean }> {
    const running = new Map<string, { conversationId: string; waiting: boolean }>();
    for (const [root, list] of this.merged()) {
      const holder = list.find(holdsRoot);
      if (holder) running.set(root, { conversationId: holder.conversationId, waiting: holder.phase === "waiting" });
    }
    const now = Date.now();
    for (const [root, { at }] of this.refused) if (!running.has(root) && now - at <= BIND_GRACE_MS) running.set(root, { conversationId: "", waiting: false });
    return running;
  }
  strip(root: string | null): { conversation: HomeConversation; state: StripState } | null {
    if (!root) return null;
    let best: { conversation: HomeConversation; state: StripState; at: string } | null = null;
    // The strongest state first; among equals the latest activity (stripFromList's rule), so the order the history
    // reads finished in does not decide. Ties keep the later registration.
    for (const conversation of this.conversations) {
      const state = this.strips[conversation.conversationId];
      if (conversation.root !== root || this.dismissed.has(conversation.conversationId) || !state) continue;
      const at = this.activityAt(conversation.conversationId);
      if (!best || RANK[state.kind] > RANK[best.state.kind] || (RANK[state.kind] === RANK[best.state.kind] && at >= best.at)) best = { conversation, state, at };
    }
    return best && { conversation: best.conversation, state: best.state };
  }

  // A running conversation is stopped first, and only after the person agrees (design §7.5).
  remove(paths: string[], project: string): Promise<void> {
    const merged = this.merged();
    const running = paths.flatMap(root => (merged.get(root) ?? []).filter(holdsRoot)).map(c => ({ conversationId: c.conversationId, waiting: c.phase === "waiting" }));
    const ask = removalConfirm(running, project);
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

  // The list

  private registered(root: string): boolean {
    return this.host.view().entries.some(entry => entry.path === root && entry.kind === "list");
  }
  // Every registered root is read once; a root that left the list takes its list with it.
  private syncRoots(): void {
    const kept = new Map([...this.lists].filter(([root]) => this.registered(root)));
    if (kept.size !== this.lists.size) { this.lists = kept; this.revision++; }
    for (const entry of this.host.view().entries) if (entry.kind === "list" && !this.lists.has(entry.path)) this.readList(entry.path);
  }
  private readList(root: string): void {
    if (!this.registered(root)) return;
    const reading = this.reads.get(root);
    if (reading) { reading.again = true; return; }
    const n = (this.readCount.get(root) ?? 0) + 1;
    this.readCount.set(root, n);
    const state = { again: false };
    this.reads.set(root, state);
    void window.doan.listConversations({ root }).catch(() => ({ error: "unknown" })).then(reply => {
      this.reads.delete(root);
      if (Array.isArray(reply) && this.registered(root)) this.applyList(root, n, reply);
      else if (!state.again && this.registered(root)) { this.listErrors.add(root); this.revision++; this.host.changed(); }
      if (state.again) this.readList(root);
    });
  }
  private applyList(root: string, n: number, list: readonly ConversationSummary[]): void {
    this.lists = new Map(this.lists).set(root, list);
    this.listErrors.delete(root);
    this.applied.set(root, n);
    this.revision++;
    if ((this.refused.get(root)?.after ?? Infinity) < n) this.refused.delete(root);
    for (const [id, mark] of this.seen) if (mark.root === root && mark.from !== null && n >= mark.from) this.seen.delete(id);
    // The canvas main bound each conversation to; the strip's Done names it and Open goes there.
    const rows = this.rows(root);
    this.conversations = this.conversations.map(item => {
      if (item.root !== root) return item;
      const canvas = list.find(c => c.conversationId === item.conversationId)?.canvas;
      const path = canvas ? (rows.find(row => canvas.id ? row.id === canvas.id : row.path === canvas.path)?.path ?? canvas.path) : undefined;
      if (path === item.canvas) return item;
      const { canvas: _old, ...rest } = item;
      return path === undefined ? rest : { ...rest, canvas: path };
    });
    for (const id of this.claimed) this.refresh(id);
    // A list that arrives while the person is on a row marks its endings seen before it is drawn, so the Dot does not
    // flash. The rows come from the committed view, not the last visit: a switch may not have run App's effect yet.
    const view = this.host.view();
    if (view.screen === "workspace" && view.loadedRoot) this.visit([slotKey(view.loadedRoot), ...(view.canvas ? [slotKey(view.loadedRoot, view.canvas)] : [])]);
    this.claimFor(root, list);
    this.host.changed();
  }
  // After a reload the strip shows the Home conversation with work left that the list names, read from its history.
  // A visit does not take it away: as in the run that started it, the strip stays until Dismiss.
  private claimFor(root: string, list: readonly ConversationSummary[]): void {
    const known = new Set(this.conversations.map(item => item.conversationId));
    const candidates = list.filter(c => c.fromHome && !c.readError && !known.has(c.conversationId) && !this.dismissed.has(c.conversationId)
      && (c.phase !== "ended" || c.unseen));
    for (const summary of candidates) {
      const id = summary.conversationId;
      if (this.claiming.has(id)) continue;
      this.claiming.add(id);
      this.track(id);
      void this.history(id).then(read => {
        this.claiming.delete(id);
        if (!read || this.conversations.some(item => item.conversationId === id)) return;
        this.events.set(id, mergeConversationEvents(read.events, this.events.get(id) ?? [], id));
        this.claimed.add(id);
        this.conversations = [...this.conversations, { conversationId: id, root, provider: summary.provider, phase: "starting", ...(summary.canvas ? { canvas: summary.canvas.path } : {}) }];
        this.refresh(id);
      });
    }
  }
  // One history read per conversation in this run, shared by a start's reply and a list that named it first; later
  // events arrive through event().
  private history(conversationId: string): Promise<{ events: ConversationEvent[] } | null> {
    let read = this.histories.get(conversationId);
    if (!read) {
      read = window.doan.readConversation({ conversationId }).then(reply => "error" in reply ? null : reply, () => null);
      this.histories.set(conversationId, read);
    }
    return read;
  }
  // The latest activity known for a conversation: its list summary's, or a newer event of this run.
  private activityAt(conversationId: string): string {
    const listed = this.summary(conversationId)?.lastActivityAt ?? "";
    const live = this.events.get(conversationId)?.at(-1)?.at ?? "";
    return live > listed ? live : listed;
  }
  // The list with this run's live state over it: a conversation the list does not have yet, and the phase events
  // already told (the list lags behind them).
  private merged(): Map<string, ConversationSummary[]> {
    const merged = new Map<string, ConversationSummary[]>([...this.lists].map(([root, list]) => [root, [...list]]));
    for (const c of this.conversations) {
      const list = merged.get(c.root) ?? [];
      const phase = c.phase === "permission" ? "waiting" : RUNNING.includes(c.phase) ? "running" : "ended";
      const at = list.findIndex(s => s.conversationId === c.conversationId);
      // A turn the events say runs is worked on whatever the lagging list says; after it, main says when work ends.
      if (at !== -1) list[at] = { ...list[at]!, phase, working: list[at]!.working || phase !== "ended" };
      else list.push({ conversationId: c.conversationId, title: "", state: "current", owner: "doan", provider: c.provider, fromHome: true, phase, unseen: false, queued: 0, working: phase !== "ended", lastActivityAt: this.events.get(c.conversationId)?.at(-1)?.at ?? "", preview: "" });
      merged.set(c.root, list);
    }
    return merged;
  }
  private summary(conversationId: string): (ConversationSummary & { root: string }) | null {
    for (const [root, list] of this.lists) {
      const found = list.find(c => c.conversationId === conversationId);
      if (found) return { ...found, root };
    }
    return null;
  }
  private rows(root: string): readonly CanvasRow[] {
    const entry = this.host.view().entries.find(item => item.path === root);
    return entry?.kind === "list" ? entry.canvases : [];
  }
  private canvasRow(root: string, conversationId: string): CanvasRow | undefined {
    const canvas = this.summary(conversationId)?.canvas;
    const rows = this.rows(root);
    if (canvas) return rows.find(row => canvas.id ? row.id === canvas.id : row.path === canvas.path);
    const path = this.conversations.find(item => item.conversationId === conversationId)?.canvas;
    return path ? rows.find(row => row.path === path) : undefined;
  }
  private rootOf(conversationId: string): string | undefined {
    return this.conversations.find(item => item.conversationId === conversationId)?.root ?? this.summary(conversationId)?.root;
  }
  private markSeen(conversationId: string): void {
    const root = this.rootOf(conversationId);
    if (!root || this.seen.get(conversationId)?.from === null) return;
    this.seen.set(conversationId, { root, from: null });
    void (async () => {
      // The last seq the person could have seen: this run's events, else main's history.
      const tracked = this.events.get(conversationId)?.at(-1)?.seq;
      const read = tracked === undefined ? await window.doan.readConversation({ conversationId }) : null;
      const seq = tracked ?? (read && !("error" in read) ? read.lastSeq : null);
      if (seq === null) { this.undoSeen(conversationId); return; }
      await this.sendSeen(conversationId, root, seq);
    })().catch(() => this.undoSeen(conversationId));
  }
  private async sendSeen(conversationId: string, root: string, seq: number): Promise<void> {
    const reply = await window.doan.markConversationSeen({ conversationId, seq }).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) this.undoSeen(conversationId);
    // Only a read that starts from now on shows main's marker.
    else if (this.seen.has(conversationId)) this.seen.set(conversationId, { root, from: (this.readCount.get(root) ?? 0) + 1 });
    const later = this.laterSeen.get(conversationId);
    if (later !== undefined) { this.laterSeen.delete(conversationId); this.markSeenThrough(conversationId, later); }
  }
  private undoSeen(conversationId: string): void {
    if (this.seen.get(conversationId)?.from === null) { this.seen.delete(conversationId); this.host.changed(); }
  }

  // Edit on Home

  private async rebuild(conversationId: string, root: string): Promise<LastRequest | null> {
    const tracked = this.events.get(conversationId);
    const read = tracked ? null : await window.doan.readConversation({ conversationId });
    const events = tracked ?? (read && !("error" in read) ? read.events : []);
    const message = [...events].reverse().find(event => event.type === "user.message");
    if (message?.type !== "user.message") return null;
    const records = message.attachments ?? [];
    const { preset, body } = splitRequest(message.text, records.length);
    const issued = records.length ? await window.doan.attachmentsFromPaths(records.map(record => record.path)).catch(() => null) : [];
    const thumbnails: Record<string, Uint8Array> = {};
    const attachments = records.map((record, i): AttachmentDraft => {
      const result = issued?.[i];
      const key = crypto.randomUUID();
      if (result?.ok && result.attachment.thumbnail) thumbnails[key] = result.attachment.thumbnail;
      if (result?.ok) return { key, id: result.attachment.id, name: result.attachment.name, kind: result.attachment.kind, pasted: result.attachment.pasted, status: "ready", size: result.attachment.size, path: result.attachment.path };
      return { key, name: record.name, kind: record.kind, pasted: false, status: "missing", size: record.size, path: record.path };
    });
    const summary = this.summary(conversationId);
    const provider = summary?.provider ?? this.conversations.find(item => item.conversationId === conversationId)?.provider;
    if (!provider) return null;
    // The preset comes back by id; Home's list fills in the rest when it has it.
    return { root, text: body, preset: preset ? { ...preset, description: "", scope: "" } : null, attachments, provider, model: summary?.model ?? null, effort: summary?.effort ?? null, ...(Object.keys(thumbnails).length ? { thumbnails } : {}) };
  }
  private restoreTo(request: LastRequest): void {
    this.restore = { request, seq: (this.restore?.seq ?? 0) + 1 };
    this.host.goHome();
    this.host.changed();
  }

  private track(conversationId: string): void {
    this.events.set(conversationId, mergeConversationEvents(this.events.get(conversationId) ?? [], this.unclaimed, conversationId));
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
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
    const opened = this.openedDuringMove;
    this.openedDuringMove = null;
    if (opened) this.canvasAppeared(opened.conversationId, opened.row);
  }
  private startedToast(conversationId: string, root: string): void {
    this.host.toast(`Started in ${this.host.label(root)}.`, "Open", () => this.openConversation(conversationId));
  }
  private refresh(conversationId: string): void {
    const events = this.events.get(conversationId);
    const conversation = this.conversations.find(item => item.conversationId === conversationId);
    if (!events || !conversation) return;
    let next = stripState(events);
    // A turn an earlier run left unfinished was folded by main when it restarted; the list says it ended.
    if (this.claimed.has(conversationId) && RUNNING.includes(next.kind) && this.summary(conversationId)?.phase === "ended") next = { kind: "interrupted", reason: "crashed" };
    const previous = this.strips[conversationId];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
    this.conversations = this.conversations.map(item => item.conversationId === conversationId ? { ...item, phase: next.kind } : item);
    this.strips = { ...this.strips, [conversationId]: next };
    const extras = this.extras.get(conversationId);
    if (extras && !RUNNING.includes(next.kind) && (!previous || RUNNING.includes(previous.kind))) extras.endedAt = Date.now();
    const ask = permissionToastKey(next, previous, this.viewing(conversation.root));
    if (ask && extras && extras.toasted !== ask) {
      extras.toasted = ask;
      this.host.toast(`${PROVIDER_NAMES[conversation.provider]} needs your answer in ${this.host.label(conversation.root)}.`, "Open", () => this.openConversation(conversationId));
    }
    this.host.changed();
  }
}
