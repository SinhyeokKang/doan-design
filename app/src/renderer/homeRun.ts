import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { PROVIDER_NAMES } from "./agentAuthView";
import { slotKeyOf, slotsFromList } from "./conversationList";
import { mergeConversationEvents, stripState, type StripState } from "./conversationStrip";
import { newCanvasText } from "./firstPromptView";
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
// opened: the new canvas this conversation's turn made was already opened or offered; one per conversation.
// endedAt: when this run saw the conversation's turn end (Date.now()).
interface Extras { atStart: string[]; checked: string[]; canvasOpens: number; toasted: string | null; opened: boolean; endedAt?: number }
interface Pending { conversationId: string; root: string; moves: number; sawModal: boolean }
export interface Removing { paths: string[]; conversations: string[]; title: string; body: string; cancel: string; confirm: string }

const RUNNING: readonly StripState["kind"][] = ["starting", "working", "permission"];
const RANK: Record<StripState["kind"], number> = { permission: 3, starting: 2, working: 2, done: 1, failed: 1, interrupted: 1 };

// Text deltas only tell the strip the agent started answering; one per turn is kept.
function isText(event: ConversationEvent) { return event.type === "message.delta" || event.type === "message.done"; }
// A project conversation working in its root: Home's reason line and the removal guard count it, as main's project
// limit does. Main binds a canvas only after a turn ends, so a running conversation with a canvas is a canvas one.
const holdsRoot = (c: ConversationSummary) => c.state === "current" && c.phase !== "ended" && !c.canvas;
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
  // When main last refused a start in a root as project_busy. With no listed conversation holding the root (main
  // counts one for BIND_GRACE_MS after its turn ends), the reason line shows without Open for that long.
  private refused = new Map<string, number>();
  // Conversations from an earlier run taken from the list: a turn left unfinished there was folded by main.
  private claimed = new Set<string>();
  private claiming = new Set<string>();
  // The person's own navigations and canvas opens, counted from the start of the run (design §4.5, §7).
  private moves = 0;
  private canvasOpens = 0;
  private ownOpen: { root: string; canvas: string } | null = null;
  private arrival: Pending | null = null;
  // The project an accepted arrival is taking the window to; App's view catches up only after its commit.
  private destination: string | null = null;
  // A new canvas that appeared while the move after its send is still under way; decided once the move ends.
  private openedDuringMove: { conversationId: string; row: CanvasRow } | null = null;
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
  takeFocus(): "stop" | null { const focus = this.focus; this.focus = null; return focus; }

  async start(request: StartInput, last: LastRequest): Promise<StartOutcome> {
    // The baseline is taken before main accepts, so a canvas that appears before the reply arrives is still new (§7.3).
    const listed = this.host.view().entries.find(entry => entry.path === request.root);
    const atStart = listed?.kind === "list" ? listed.canvases.map(row => row.path) : [];
    const moves = this.moves, canvasOpens = this.canvasOpens;
    const result = await window.doan.startConversation(request).catch(() => ({ error: "unknown" }));
    if ("error" in result) {
      // The list had not shown the conversation that holds the root yet; read it to name that conversation.
      if (result.error === "project_busy") {
        const at = Date.now();
        this.refused.set(request.root, at);
        setTimeout(() => { if (this.refused.get(request.root) === at) { this.refused.delete(request.root); this.host.changed(); } }, BIND_GRACE_MS);
        this.readList(request.root);
      }
      this.host.changed();
      return { error: result.error, ...("missing" in result && result.missing ? { missing: result.missing } : {}) };
    }
    const { conversationId } = result;
    this.extras.set(conversationId, { atStart, checked: [], canvasOpens, toasted: null, opened: false });
    this.track(conversationId);
    this.conversations = [...this.conversations, { conversationId, root: request.root, provider: request.runtime, phase: "starting" }];
    this.strips = { ...this.strips, [conversationId]: { kind: "starting" } };
    this.refresh(conversationId);
    void window.doan.readConversation({ conversationId }).then(read => {
      if ("error" in read) return;
      this.events.set(conversationId, mergeConversationEvents(read.events, this.events.get(conversationId) ?? [], conversationId));
      this.refresh(conversationId);
    }).catch(console.error);
    this.lastRequests = rememberRequest(this.lastRequests, { ...last, conversationId });
    this.host.sent(request);
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
    // After the arrival is set up: a canvas that appeared before the reply opens once the move ends.
    this.entriesChanged();
    this.host.changed();
    return { ok: true };
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
    else this.host.openOverview(root, () => true, () => {});
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
  visit(keys: readonly string[]): void {
    for (const [root, list] of this.lists) {
      for (const c of list) {
        if (!c.fromHome || c.phase !== "ended" || !c.unseen || this.seen.has(c.conversationId)) continue;
        if (keys.includes(slotKeyOf(root, c, this.rows(root)))) this.markSeen(c.conversationId);
      }
    }
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
    for (const [root, at] of this.refused) if (!running.has(root) && now - at <= BIND_GRACE_MS) running.set(root, { conversationId: "", waiting: false });
    return running;
  }
  strip(root: string | null): { conversation: HomeConversation; state: StripState } | null {
    if (!root) return null;
    let best: { conversation: HomeConversation; state: StripState } | null = null;
    // The strongest state first; among equals the latest, as the strip showed one conversation before the list.
    for (const conversation of this.conversations) {
      const state = this.strips[conversation.conversationId];
      if (conversation.root !== root || this.dismissed.has(conversation.conversationId) || !state) continue;
      if (!best || RANK[state.kind] >= RANK[best.state.kind]) best = { conversation, state };
    }
    return best;
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
      if (state.again) this.readList(root);
    });
  }
  private applyList(root: string, n: number, list: readonly ConversationSummary[]): void {
    this.lists = new Map(this.lists).set(root, list);
    this.revision++;
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
      void window.doan.readConversation({ conversationId: id }).then(read => {
        this.claiming.delete(id);
        if ("error" in read || this.conversations.some(item => item.conversationId === id)) return;
        this.events.set(id, mergeConversationEvents(read.events, this.events.get(id) ?? [], id));
        this.claimed.add(id);
        this.conversations = [...this.conversations, { conversationId: id, root, provider: summary.provider, phase: "starting", ...(summary.canvas ? { canvas: summary.canvas.path } : {}) }];
        this.refresh(id);
      }).catch(() => { this.claiming.delete(id); });
    }
  }
  // The list with this run's live state over it: a conversation the list does not have yet, and the phase events
  // already told (the list lags behind them).
  private merged(): Map<string, ConversationSummary[]> {
    const merged = new Map<string, ConversationSummary[]>([...this.lists].map(([root, list]) => [root, [...list]]));
    for (const c of this.conversations) {
      const list = merged.get(c.root) ?? [];
      const phase = c.phase === "permission" ? "waiting" : RUNNING.includes(c.phase) ? "running" : "ended";
      const at = list.findIndex(s => s.conversationId === c.conversationId);
      if (at !== -1) list[at] = { ...list[at]!, phase };
      else list.push({ conversationId: c.conversationId, title: "", state: "current", owner: "doan", provider: c.provider, fromHome: true, phase, unseen: false, queued: 0, lastActivityAt: this.events.get(c.conversationId)?.at(-1)?.at ?? "", preview: "" });
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
  private markSeen(conversationId: string): void {
    const root = this.conversations.find(item => item.conversationId === conversationId)?.root ?? this.summary(conversationId)?.root;
    if (!root || this.seen.get(conversationId)?.from === null) return;
    this.seen.set(conversationId, { root, from: null });
    const undo = () => { if (this.seen.get(conversationId)?.from === null) { this.seen.delete(conversationId); this.host.changed(); } };
    void (async () => {
      // The last seq the person could have seen: this run's events, else main's history.
      const tracked = this.events.get(conversationId)?.at(-1)?.seq;
      const read = tracked === undefined ? await window.doan.readConversation({ conversationId }) : null;
      const seq = tracked ?? (read && !("error" in read) ? read.lastSeq : null);
      if (seq === null) { undo(); return; }
      const reply = await window.doan.markConversationSeen({ conversationId, seq });
      if (reply && "error" in reply) { undo(); return; }
      // Only a read that starts from now on shows main's marker.
      if (this.seen.has(conversationId)) this.seen.set(conversationId, { root, from: (this.readCount.get(root) ?? 0) + 1 });
    })().catch(undo);
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
    const attachments = records.map((record, i): AttachmentDraft => {
      const result = issued?.[i];
      const key = crypto.randomUUID();
      if (result?.ok) return { key, id: result.attachment.id, name: result.attachment.name, kind: result.attachment.kind, pasted: result.attachment.pasted, status: "ready", size: result.attachment.size, path: result.attachment.path };
      return { key, name: record.name, kind: record.kind, pasted: false, status: "missing", size: record.size, path: record.path };
    });
    const summary = this.summary(conversationId);
    const provider = summary?.provider ?? this.conversations.find(item => item.conversationId === conversationId)?.provider;
    if (!provider) return null;
    // The preset comes back by id; Home's list fills in the rest when it has it.
    return { root, text: body, preset: preset ? { ...preset, description: "", scope: "" } : null, attachments, provider, model: summary?.model ?? null, effort: summary?.effort ?? null };
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
