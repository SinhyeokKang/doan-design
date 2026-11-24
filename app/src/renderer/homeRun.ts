import type { RemoveResult } from "../main/index";
import type { ScheduledSend } from "../main/conversation/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { PROVIDER_NAMES } from "./agentAuthView";
import { conversationCanvasMatch } from "./canvasConversationRows";
import { conversationWork, scheduledOf, slotKeyOf, slotsFromList } from "./conversationList";
import { dropAttachment } from "./conversationStore";
import { asksPerson, stripState, type StripState } from "./conversationStrip";
import { mergeEvents } from "../main/conversation/state";
import { LIST_RETRY_IDLE, type ListRetry } from "./listRetry";
import { issuedAttachment, sendRefusal, splitRequest, type AttachmentDraft } from "./homeComposer";
import {
  permissionToastKey, rememberRequest, removalConfirm, slotKey,
  type HomeConversation, type LastRequest, type Slot,
} from "./homeConversations";
import { worktreeLabel } from "./homeCards";
import type { StartInput, StartOutcome } from "./HomeComposerView";

// Home conversations: the send and the move to the project,
// the strip, sidebar slots, toasts and the running-removal guard. What survives a reload
// comes from main's conversation list (conversation:list); this run's events keep the strip live between list reads.
// App owns one and wires it to its navigation; everything is decided here so it can be driven without a DOM.

export interface HomeRunHost {
  // canvas: the canvas open in the loaded root's workspace, as committed (the same rows App's visits name).
  view(): { screen: "home" | "workspace" | "addProjects" | "settings" | "projectSettings"; loadedRoot: string | null; entries: readonly FolderEntry[]; canvas: string | null };
  label(root: string): string;
  // The move after a send goes through the draft guard and waits for the project's read; it is not the person's move.
  // `arrived` says whether the run still wants it: App commits the screen only when it returns true. `conversationId`
  // is the project conversation the Overview should show.
  openOverview(root: string, arrived: () => boolean, unavailable: () => void, conversationId: string): void;
  // The person moved first: a move still waiting for the project's read must not land later.
  cancelMove(): void;
  // The canvas a conversation is bound to, opened with that conversation in its panel (an entry: a toast's or
  // notification's Open).
  openCanvas(root: string, row: CanvasRow, conversation: { conversationId: string; waiting: boolean }): void;
  goHome(): void;
  removeNow(paths: string[], group?: true): Promise<void | RemoveResult>;
  toast(message: string, action?: string, run?: () => void): void;
  // ui-state's Home memory after a send.
  sent(request: StartInput): void;
  // A conversation main moved out of Plan (a Claude plan approval): its provider's last mode follows, as after a pick.
  // Any other change of a stored mode is a pick the composer already remembered.
  followedMode?(provider: Provider, mode: PermissionModeId): void;
  changed(): void;
}
// toasted: the permission request this conversation last toasted, so each is toasted once.
interface Extras { toasted: string | null }
interface Pending { conversationId: string; root: string; moves: number; sawModal: boolean }
interface RemovalTarget { conversationId: string; turnId: string; waiting: boolean; root: string; worktree: string; title: string }
interface Removing extends ReturnType<typeof removalConfirm> {
  currentGroup?: (paths: string[]) => string[] | null;
  outstanding?: RemovalTarget[];
  paths: string[]; project: string; stopped: RemovalTarget[]; pending: boolean; error: string | null;
}

function sameRemovalTurn(a: RemovalTarget, b: RemovalTarget): boolean {
  return a.conversationId === b.conversationId && a.turnId === b.turnId;
}
function removalLabels(target: RemovalTarget, group: RemovalTarget[]) {
  const location = group.some(peer => peer.worktree === target.worktree && peer.root !== target.root)
    ? target.root : target.worktree;
  const siblings = group.filter(peer => peer.root === target.root && !sameRemovalTurn(peer, target));
  let title = target.title ? `“${target.title}”` : target.conversationId;
  if (siblings.some(peer => peer.conversationId === target.conversationId)) title += ` · ${target.turnId}`;
  else if (target.title && siblings.some(peer => peer.title === target.title)) title += ` · ${target.conversationId}`;
  return {
    label: siblings.length ? `${location} (${title})` : location,
    name: `${target.title || siblings.length ? title : "the conversation"} in ${location}`,
  };
}
function conversationsIn(targets: RemovalTarget[], group: RemovalTarget[]) {
  const labels = new Intl.ListFormat("en").format(targets.map(target => removalLabels(target, group).label));
  return targets.length === 1 ? `conversation in ${labels}` : `conversations in ${labels}`;
}

const RUNNING: readonly StripState["kind"][] = ["starting", "working", "permission", "question"];
const RANK: Record<StripState["kind"], number> = { permission: 3, question: 3, starting: 2, working: 2, done: 1, failed: 1, interrupted: 1 };
const RANK_SLOT: Record<Slot["kind"], number> = { permission: 4, working: 3, scheduled: 2, unseen: 1 };

// Text deltas only tell the strip the agent started answering; one per turn is kept.
function isText(event: ConversationEvent) { return event.type === "message.delta" || event.type === "message.done"; }
// A project conversation main still works on in its root, which the removal stops first, waiting for an answer
// included. working also covers what the history cannot show: a handoff still to settle, a queue about to go out, a
// send waiting for the previous process. Nothing is promoted any more, so a working conversation with a canvas is a
// canvas one, whatever project turn id an earlier build's list gave it.
const projectWorking = (c: ConversationSummary) => c.working && !c.canvas;

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
  // Reads of the list: one in flight per root; a notice that arrives meanwhile asks for one more after it.
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
  // A failed list's Retry: the roots whose Retry read is out, and the Retries that failed in a row. Only a Retry
  // counts: a read made for another reason that fails again is not announced again.
  private retrying = new Set<string>();
  private retryFailures = new Map<string, number>();
  private applied = new Map<string, number>();
  // Conversations from an earlier run taken from the list: a turn left unfinished there was folded by main.
  private claimed = new Set<string>();
  private claiming = new Set<string>();
  private histories = new Map<string, Promise<{ events: ConversationEvent[] } | null>>();
  // The person's own navigations, counted from the start of the run.
  private moves = 0;
  private arrival: Pending | null = null;
  // The project an accepted arrival is taking the window to; App's view catches up only after its commit.
  private destination: string | null = null;
  private focus: "composer" | null = null;
  // Deleted in this run: a late event or a list read from before the delete must not register it again.
  private deletedIds = new Set<string>();
  // Conversations whose next turn main accepted (its user.message arrived), with the list read last asked for then.
  // main dropped the suggestion on accepting, so a read asked for before may still carry it; only a later read says
  // whether one stands (POSTMORTEM 2026-11-05 'Send now').
  private suggestionsDropped = new Map<string, { root: string; after: number }>();

  constructor(private host: HomeRunHost) {}

  // Subscribed at App mount so no event is lost before a start's reply or the first read (ARCHITECTURE §7).
  event(event: ConversationEvent): void {
    if (this.deletedIds.has(event.conversationId)) return;
    if (event.type === "user.message") this.dropSuggestion(event.conversationId);
    const tracked = this.events.get(event.conversationId);
    if (!tracked) { this.unclaimed = [...this.unclaimed, event].slice(-500); return; }
    if (isText(event) && tracked.some(item => isText(item) && item.turnId === event.turnId)) return;
    this.events.set(event.conversationId, mergeEvents(tracked, [event], event.conversationId));
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
  // A draft guard asks in a dialog; one that closes without the arrival was refused.
  modalChanged(open: boolean): void {
    if (!this.arrival) return;
    if (open) { this.arrival.sawModal = true; return; }
    if (this.arrival.sawModal) this.settle();
  }
  takeFocus(): "composer" | null { const focus = this.focus; this.focus = null; return focus; }

  // stay: sent from the project's Overview, which shows the new conversation itself; there is no move and no toast. A
  // new canvas the turn makes opens nothing by itself: a handoff's own move or toast says where the work went (PRODUCT
  // §5 item 2 'Handoff').
  async start(request: StartInput, last: LastRequest, options: { stay?: boolean } = {}): Promise<StartOutcome> {
    const moves = this.moves;
    const result = await window.doan.startConversation(request).catch(() => ({ error: "unknown" }));
    if ("error" in result) {
      this.host.changed();
      return sendRefusal(result);
    }
    const { conversationId } = result;
    this.extras.set(conversationId, { toasted: null });
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
      this.events.set(conversationId, mergeEvents(read.events, this.events.get(conversationId) ?? [], conversationId));
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
        // The composer under the conversation, never a permission answer that came in before the reply.
        this.focus = "composer";
        this.host.changed();
        return true;
      }, () => this.settle(), conversationId);
    }
    this.host.changed();
    return { ok: true, conversationId };
  }

  // A send in an existing project conversation from the Overview: the run tracks its turn for the strip, the slots and
  // the permission toast. A send main scheduled for the usage limit's reset starts no turn: its answer goes back as it
  // is.
  async send(root: string, provider: Provider, request: Parameters<Window["doan"]["sendConversation"]>[0]): Promise<void | ScheduledSend | { error: string; missing?: string[]; replaced?: string[]; resetsAt?: string }> {
    const id = request.conversationId;
    // What this run held of the conversation before the send: the turn it starts comes after it.
    const before = Math.max(0, ...[...this.events.get(id) ?? [], ...this.unclaimed.filter(event => event.conversationId === id)].map(event => event.seq));
    // The strip before the turn: the permission toast compares against it, since the turn's events may all have
    // arrived before the reply while the run did not track the conversation (nothing to refresh then).
    const stripBefore = this.strips[id];
    const reply = await window.doan.sendConversation(request).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) return sendRefusal(reply);
    if (reply && "scheduled" in reply) return reply;
    const previous = this.extras.get(id);
    this.track(id);
    // The turn may have started, and even ended, before the reply.
    const turn = (this.events.get(id) ?? []).filter(event => event.seq > before);
    const state = turn.length ? stripState(this.events.get(id)!) : null;
    this.extras.set(id, { toasted: previous?.toasted ?? null });
    const phase = state?.kind ?? "starting";
    if (!this.conversations.some(item => item.conversationId === id)) {
      this.claimed.delete(id);
      this.conversations = [...this.conversations, { conversationId: id, root, provider, phase }];
      void this.history(id).then(read => {
        if (!read) return;
        this.events.set(id, mergeEvents(read.events, this.events.get(id) ?? [], id));
        this.refresh(id);
      });
    } else this.conversations = this.conversations.map(item => item.conversationId === id ? { ...item, phase } : item);
    this.strips = { ...this.strips, [id]: state ?? { kind: "starting" } };
    // The transition the reply merged: a waiting request toasts away from its project, once per request.
    if (state) this.askToast(id, root, provider, permissionToastKey(state, stripBefore, this.viewing(root)));
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
    if (row) this.host.openCanvas(root, row, { conversationId, waiting: found?.phase === "waiting" || asksPerson(this.strips[conversationId]?.kind ?? "starting") });
    else this.host.openOverview(root, () => true, () => {}, conversationId);
  }

  // Quick Open's pick, with the root and canvas rows it searched rather than the view now (POSTMORTEM: producer state
  // goes in the callback). The list is checked again first: the conversation may have gone or its canvas may no longer
  // be exactly one row since the results were drawn; then nothing opens and App says why. `arrived` follows a project
  // conversation's move, with whether it waits for an answer (its card takes focus then): by the listed phase, the rule
  // App's askConversation scrolls by, so focus lands on the card or the composer even while the strip runs ahead.
  openFound(root: string, conversationId: string, rows: readonly CanvasRow[], arrived: (waiting: boolean) => void = () => {}): "opened" | "deleted" | "missing" | "duplicate" {
    const found = this.lists.get(root)?.find(c => c.conversationId === conversationId);
    if (!found) return "deleted";
    const match = found.canvas ? conversationCanvasMatch(found.canvas, rows) : null;
    if (match?.kind === "none") return "missing";
    if (match?.kind === "many") return "duplicate";
    this.personNavigated();
    // The canvas panel's notification trigger takes the same waiting as openConversation.
    if (match) this.host.openCanvas(root, match.row, { conversationId, waiting: found.phase === "waiting" || asksPerson(this.strips[conversationId]?.kind ?? "starting") });
    else this.host.openOverview(root, () => { arrived(found.phase === "waiting"); return true; }, () => {}, conversationId);
    return "opened";
  }

  // main deleted it. This run keeps its own conversations whatever the list says, so
  // the strip, its Open and Edit on Home would go on naming it; slots and rows follow main's next list read.
  deleted(conversationId: string): void {
    this.deletedIds.add(conversationId);
    this.conversations = this.conversations.filter(item => item.conversationId !== conversationId);
    const { [conversationId]: _strip, ...strips } = this.strips;
    this.strips = strips;
    this.lastRequests = new Map([...this.lastRequests].filter(([, request]) => request.conversationId !== conversationId));
    for (const records of [this.events, this.histories, this.extras, this.seen, this.laterSeen]) records.delete(conversationId);
    for (const ids of [this.claimed, this.claiming]) ids.delete(conversationId);
    this.unclaimed = this.unclaimed.filter(event => event.conversationId !== conversationId);
    this.host.changed();
  }

  // Edit on Home: this run's own last request when it is still the root's, otherwise rebuilt from the
  // conversation's last user.message and main's index; attachments are issued again from their paths, and a file that
  // moved comes back as a missing chip. A move the person makes meanwhile wins.
  async editOnHome(conversationId: string): Promise<void> {
    const root = this.conversations.find(item => item.conversationId === conversationId)?.root ?? this.summary(conversationId)?.root;
    if (!root) return;
    const kept = this.lastRequests.get(root);
    if (kept?.conversationId === conversationId) { this.restoreTo(kept); return; }
    const moves = this.moves;
    const request = await this.rebuild(conversationId, root).catch(() => null);
    if (!request) return;
    const summary = this.summary(conversationId);
    const provider = summary?.provider ?? this.conversations.find(item => item.conversationId === conversationId)?.provider;
    if (!provider || moves !== this.moves) {
      for (const attachment of request.attachments) dropAttachment(window.doan, attachment);
      return;
    }
    this.restoreTo({ ...request, provider, model: summary?.model ?? null, effort: summary?.effort ?? null });
  }
  // Dismiss records the conversation as seen in main, so a reload does not bring it back.
  dismiss(conversationId: string): void {
    this.dismissed = new Set(this.dismissed).add(conversationId);
    this.markSeen(conversationId);
    this.host.changed();
  }

  // The registered roots changed: each is read once, and a root that left takes its list with it.
  entriesChanged(): void { this.syncRoots(); }

  // A project row's screen on view marks the unseen endings of canvas conversations whose canvas left the project:
  // their slot moved to the project row and no canvas panel can show them (App calls this again when the list
  // changes). A project conversation is seen only in the Overview's main column, and a
  // canvas conversation only in its canvas's open panel, both through
  // markSeenThrough.
  visit(keys: readonly string[]): void {
    for (const [root, list] of this.lists) {
      for (const c of list) {
        if (!c.canvas || c.phase !== "ended" || !c.unseen || this.seen.has(c.conversationId)) continue;
        const key = slotKeyOf(root, c, this.rows(root));
        if (key === slotKey(root) && keys.includes(key)) this.markSeen(c.conversationId);
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
  retryList(root: string): void {
    // A Retry of a failed list runs, busy at once, until its read settles.
    if (this.registered(root) && this.listState(root) === "error" && !this.retrying.has(root)) { this.retrying.add(root); this.revision++; this.host.changed(); }
    this.readList(root);
  }
  listRetry(root: string): ListRetry {
    if (this.listState(root) !== "error") return LIST_RETRY_IDLE;
    return { running: this.retrying.has(root), failures: this.retryFailures.get(root) ?? 0 };
  }
  readsStarted(root: string): number { return this.readCount.get(root) ?? 0; }
  readsApplied(root: string): number { return this.applied.get(root) ?? 0; }
  // The project conversation behind a project row's slot: opening the row's Overview asks
  // for it. The strongest state first, then the latest activity; null when the slot is a canvas conversation's or none.
  slotConversation(root: string): { conversationId: string; waiting: boolean } | null {
    const seen = new Set(this.seen.keys());
    let best: { c: ConversationSummary; rank: number } | null = null;
    for (const c of this.merged().get(root) ?? []) {
      const work = c.fromHome && !c.canvas ? conversationWork(c, seen, scheduledOf(c)) : null;
      if (!work) continue;
      const rank = RANK_SLOT[work.kind];
      if (!best || rank > best.rank || (rank === best.rank && c.lastActivityAt > best.c.lastActivityAt)) best = { c, rank };
    }
    return best && { conversationId: best.c.conversationId, waiting: best.c.phase === "waiting" };
  }
  slots(): Map<string, Slot> {
    return slotsFromList(this.merged(), new Set(this.seen.keys()), root => this.rows(root));
  }
  // Agents with a Doan conversation turn running or waiting for an answer, in any project: Settings > MCP Connectors
  // says a change applies from such an agent's next turn.
  runningProviders(): Set<Provider> {
    const providers = new Set<Provider>();
    for (const list of this.merged().values()) for (const c of list) if (c.owner === "doan" && c.phase !== "ended") providers.add(c.provider);
    return providers;
  }
  // Roots with a project conversation main still works on: Home reads its skills again once that work ends.
  workingRoots(): ReadonlySet<string> {
    return new Set([...this.merged()].filter(([, list]) => list.some(projectWorking)).map(([root]) => root));
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

  // Nothing is removed before the person agrees; a running conversation is stopped first.
  remove(paths: string[], project: string, currentGroup?: (paths: string[]) => string[] | null): Promise<void> {
    const merged = this.merged();
    const running = paths.flatMap(root => (merged.get(root) ?? []).filter(projectWorking)).map(c => ({ conversationId: c.conversationId, waiting: c.phase === "waiting" }));
    this.removing = { paths, project, ...(currentGroup ? { currentGroup } : {}), stopped: [], pending: false, error: null, ...removalConfirm(running, project, paths.length) };
    this.host.changed();
    return Promise.resolve();
  }
  cancelRemove(): void { if (!this.removing?.pending) this.closeRemove(); }
  closeRemove(): void {
    this.removing = null;
    this.host.changed();
  }
  async confirmRemove(): Promise<void> {
    const dialog = this.removing;
    if (!dialog || dialog.pending) return;
    const { paths, project, stopped } = dialog;
    dialog.pending = true;
    this.host.changed();
    const recover = (error: string, action: string) => {
      const prior = stopped.length ? `The ${conversationsIn(stopped, [...stopped, ...(dialog.outstanding ?? [])])} stopped. ` : "";
      Object.assign(dialog, { pending: false, title: `${project} is still in Doan`, body: prior + action, cancel: "Keep project", confirm: "Retry", error });
      this.host.changed();
    };

    const loadingGroup = () => recover("Doan is still loading a project.", `Retry when loading finishes to check the worktrees registered for ${project}.`);
    const changedGroup = (current = dialog.currentGroup?.(paths)) => {
      if (current === null) { loadingGroup(); return true; }
      if (!current || (current.length === paths.length && current.every(root => paths.includes(root)))) return false;
      if (!current.length) { this.closeRemove(); return true; }
      const lists = this.merged();
      const targets = current.flatMap(root => (lists.get(root) ?? []).filter(projectWorking)).map(c => ({ conversationId: c.conversationId, waiting: c.phase === "waiting" }));
      const question = removalConfirm(targets, project, current.length);
      delete dialog.outstanding;
      Object.assign(dialog, question, { paths: current, pending: false, error: null,
        body: `The project now has ${current.length} registered ${current.length === 1 ? "worktree" : "worktrees"}. ${question.body}` });
      this.host.changed();
      return true;
    };
    if (changedGroup()) return;
    // Read main at the press: a listChanged notice (or its follow-up read) may still be on the way.
    let running: RemovalTarget[];
    try {
      const lists = await Promise.all(paths.map(root => window.doan.listConversations({ root })));
      if (this.removing !== dialog || changedGroup()) return;
      const entries = this.host.view().entries;
      running = lists.flatMap((list, i) => {
        if (!Array.isArray(list)) throw new Error(list.error);
        const root = paths[i]!, entry = entries.find(item => item.path === root);
        const worktree = entry ? worktreeLabel(entry) : root;
        const targets = list.filter(projectWorking);
        return targets.map(c => {
          if (!c.projectTurnId) throw new Error("Project turn not yet identified");
          return { conversationId: c.conversationId, turnId: c.projectTurnId, waiting: c.phase === "waiting", root, worktree, title: c.title };
        }).filter(target => !stopped.some(done => sameRemovalTurn(done, target)));
      });
    } catch {
      if (this.removing === dialog) recover("Couldn’t check the project’s conversations.", `Retry to check the conversations before removing ${project}.`);
      return;
    }
    // A plain removal, or a confirmation for fewer conversations, did not authorize stopping additional work.
    const outstanding = dialog.outstanding;
    if (running.length > dialog.conversations.length || (outstanding && running.some(target => !outstanding.some(previous => sameRemovalTurn(previous, target))))) {
      const question = removalConfirm(running, project, paths.length);
      if (dialog.outstanding) {
        const group = [...stopped, ...running];
        const names = new Intl.ListFormat("en").format(running.map(target => removalLabels(target, group).name));
        question.body = `The running conversations changed. Doan will stop ${names}, then remove ${project} from your project list. Files and Git worktrees stay on disk.`;
      }
      Object.assign(dialog, question, { outstanding: running, pending: false, error: null });
      this.host.changed();
      return;
    }
    if (running.length) {
      const singular = running.length === 1;
      Object.assign(dialog, {
        title: singular ? "Stopping conversation…" : "Stopping conversations…",
        body: `${project} stays in your project list until ${singular ? "the conversation stops" : running.length === 2 ? "both conversations stop" : `all ${running.length} conversations stop`}.`,
        confirm: "Stopping…", error: null,
      });
      this.host.changed();
      const replies = await Promise.allSettled(running.map(target => window.doan.interruptProjectTurn({ conversationId: target.conversationId, turnId: target.turnId })));
      if (this.removing !== dialog) return;
      const failed: RemovalTarget[] = [];
      replies.forEach((reply, i) => {
        (reply.status === "fulfilled" && reply.value === undefined ? stopped : failed).push(running[i]!);
      });
      dialog.outstanding = failed;
      dialog.conversations = failed.map(target => target.conversationId);
      if (failed.length) {
        const remaining = failed.length === 1 ? "the remaining conversation" : `the remaining ${failed.length} conversations`;
        recover(`Couldn’t stop the ${conversationsIn(failed, [...stopped, ...failed])}.`, `Retry to stop ${remaining} and remove ${project}.`);
        return;
      }
    }
    try {
      if (changedGroup()) return;
      const result = dialog.currentGroup ? await this.host.removeNow(paths, true) : await this.host.removeNow(paths);
      if (this.removing !== dialog) return;
      if (result?.kind === "groupChanged") { changedGroup(result.paths); return; }
      if (result?.kind === "loading") { loadingGroup(); return; }
      if (result?.kind === "busy") {
        dialog.outstanding = [];
        recover("Project work is still active.", `Retry to check the conversations before removing ${project}.`);
        return;
      }
      if (result?.kind === "unavailable") throw new Error("Project removal unavailable");
    } catch {
      if (this.removing === dialog) recover(`Couldn’t remove ${project} from your project list.`, `Retry to remove ${project}.`);
      return;
    }
    if (this.removing === dialog) this.closeRemove();
  }

  // The list

  private registered(root: string): boolean {
    return this.host.view().entries.some(entry => entry.path === root && entry.kind === "list");
  }
  // A removed project keeps no memory in this run (OverviewRun.forgetRoots): added again, its list reads as new rather
  // than as its last failure. The read counts stay, since stores compare reads against them.
  forgetRoots(roots: readonly string[]): void {
    for (const root of roots) { this.listErrors.delete(root); this.retrying.delete(root); this.retryFailures.delete(root); }
    this.revision++;
    this.host.changed();
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
      else if (!state.again && this.registered(root)) {
        this.listErrors.add(root);
        if (this.retrying.has(root)) this.retryFailures.set(root, (this.retryFailures.get(root) ?? 0) + 1);
        this.revision++; this.host.changed();
      }
      if (state.again) this.readList(root);
      else if (this.retrying.delete(root)) { this.revision++; this.host.changed(); }
    });
  }
  private applyList(root: string, n: number, list: readonly ConversationSummary[]): void {
    const before = this.lists.get(root);
    for (const c of list) {
      const was = before?.find(item => item.conversationId === c.conversationId);
      if (was?.permissionMode === "plan" && c.permissionMode !== "plan") this.host.followedMode?.(c.provider, c.permissionMode ?? "default");
    }
    this.lists = new Map(this.lists).set(root, this.withoutDropped(root, n, list));
    this.listErrors.delete(root);
    this.retryFailures.delete(root);
    this.applied.set(root, n);
    this.revision++;
    for (const [id, mark] of this.seen) if (mark.root === root && mark.from !== null && n >= mark.from) this.seen.delete(id);
    // The canvas main bound each conversation to: an entry's Open (a toast's, a notification's) goes there.
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
    const candidates = list.filter(c => c.fromHome && !c.readError && !known.has(c.conversationId) && !this.dismissed.has(c.conversationId) && !this.deletedIds.has(c.conversationId)
      && (c.phase !== "ended" || c.unseen));
    for (const summary of candidates) {
      const id = summary.conversationId;
      if (this.claiming.has(id)) continue;
      this.claiming.add(id);
      this.track(id);
      void this.history(id).then(read => {
        this.claiming.delete(id);
        // Deleted while its history was read: the claim lapses.
        if (!read || this.deletedIds.has(id) || this.conversations.some(item => item.conversationId === id)) return;
        this.events.set(id, mergeEvents(read.events, this.events.get(id) ?? [], id));
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
      const phase = asksPerson(c.phase) ? "waiting" : RUNNING.includes(c.phase) ? "running" : "ended";
      const at = list.findIndex(s => s.conversationId === c.conversationId);
      // A turn the events say runs is worked on whatever the lagging list says; after it, main says when work ends.
      if (at !== -1) list[at] = { ...list[at]!, phase, working: list[at]!.working || phase !== "ended" };
      else list.push({ conversationId: c.conversationId, title: "", owner: "doan", provider: c.provider, fromHome: true, phase, unseen: false, queued: 0, working: phase !== "ended", lastActivityAt: this.events.get(c.conversationId)?.at(-1)?.at ?? "", preview: "" });
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
  // The accepted turn's conversation shows no suggestion from now until a read asked for after it answers.
  private dropSuggestion(conversationId: string): void {
    const root = this.rootOf(conversationId);
    if (!root) return;
    this.suggestionsDropped.set(conversationId, { root, after: this.readCount.get(root) ?? 0 });
    const list = this.lists.get(root);
    if (!list?.some(c => c.conversationId === conversationId && c.suggestion !== undefined)) return;
    this.lists = new Map(this.lists).set(root, this.withoutDropped(root, this.applied.get(root) ?? 0, list));
    this.revision++;
    this.host.changed();
  }
  private withoutDropped(root: string, n: number, list: readonly ConversationSummary[]): readonly ConversationSummary[] {
    const stale = new Set<string>();
    for (const [id, mark] of this.suggestionsDropped) {
      if (mark.root !== root) continue;
      if (n > mark.after) this.suggestionsDropped.delete(id); else stale.add(id);
    }
    if (!list.some(c => stale.has(c.conversationId) && c.suggestion !== undefined)) return list;
    return list.map(c => {
      if (!stale.has(c.conversationId) || c.suggestion === undefined) return c;
      const { suggestion: _dropped, ...rest } = c;
      return rest;
    });
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

  private async rebuild(conversationId: string, root: string): Promise<Omit<LastRequest, "provider" | "model" | "effort"> | null> {
    const tracked = this.events.get(conversationId);
    const read = tracked ? null : await window.doan.readConversation({ conversationId });
    const events = tracked ?? (read && !("error" in read) ? read.events : []);
    const message = [...events].reverse().find(event => event.type === "user.message");
    if (message?.type !== "user.message") return null;
    const records = message.attachments ?? [];
    const { preset, body } = splitRequest(message.text, records.length);
    const issued = records.length ? await window.doan.attachmentsFromPaths(records.map(record => record.path), records.map(({ lines, excerpt }) => ({ ...(lines === undefined ? {} : { lines }), ...(excerpt === undefined ? {} : { excerpt }) }))).catch(() => null) : [];
    const thumbnails: Record<string, Uint8Array> = {};
    const attachments = records.map((record, i): AttachmentDraft => {
      const result = issued?.[i];
      const key = crypto.randomUUID();
      const { chip, release } = issuedAttachment(key, record, result);
      if (release) void window.doan.removeAttachment(release).catch(() => false);
      else if (result?.ok && result.attachment.thumbnail) thumbnails[key] = result.attachment.thumbnail;
      return chip;
    });
    // The preset comes back by id; Home's list fills in the rest when it has it.
    return { root, text: body, preset: preset ? { ...preset, description: "", scope: "" } : null, attachments, ...(Object.keys(thumbnails).length ? { thumbnails } : {}) };
  }
  private restoreTo(request: LastRequest): void {
    this.restore = { request, seq: (this.restore?.seq ?? 0) + 1 };
    this.host.goHome();
    this.host.changed();
  }

  private track(conversationId: string): void {
    this.events.set(conversationId, mergeEvents(this.events.get(conversationId) ?? [], this.unclaimed, conversationId));
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
    this.askToast(conversationId, conversation.root, conversation.provider, permissionToastKey(next, previous, this.viewing(conversation.root)));
    this.host.changed();
  }
  // One toast per permission request of a conversation this run tracks a turn of.
  private askToast(conversationId: string, root: string, provider: Provider, ask: string | null): void {
    const extras = this.extras.get(conversationId);
    if (!ask || !extras || extras.toasted === ask) return;
    extras.toasted = ask;
    this.host.toast(`${PROVIDER_NAMES[provider]} needs your answer in ${this.host.label(root)}.`, "Open", () => this.openConversation(conversationId));
  }
}
