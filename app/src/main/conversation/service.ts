import { randomUUID } from "node:crypto";
import { ConversationStore, restoreEntries, type ConversationMetadata, type JournalWrite } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, releaseReservation, reserveSession } from "./ownership";
import { transportError } from "./transport";
import { sameCanvas } from "./sessions";
import { turnPrompt } from "./prompt";
import { messageLine } from "./messageText";
import { BIND_GRACE_MS, contestedCanvas, projectBusy, promotionTarget } from "./project";
import { clampSeen, conversationSummary, type ConversationSummary } from "./summary";
import { combineQueued } from "./queue";
import { DraftStore, joined, type ReturnedDraft } from "./drafts";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import type { ModelList } from "./models";
import type { PermissionModeId } from "./permissionMode";
import type { QuestionAnswerInput } from "./question";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent, EventPayload, Reservation } from "./types";
// External (legacy) runs are claude or codex only; doan-account runs may use any app provider.
// model and effort: a choice from the list this run delivered (ipc checks it). attachments: files main rechecked just now.
// permissionMode: one of the common ids (ipc checks it); Default is never stored.
export interface StartRequest { root: string; mode: "resume" | "new" | "newDesign"; runtime?: Provider; canvas?: Canvas; text: string; anchors: Anchor[]; model?: string; effort?: string; permissionMode?: PermissionModeId; attachments?: AttachmentRecord[] }
export interface Prepared {
  runtime: Provider; configDir: string; cwd: string; sessionId?: string; command: string; env: NodeJS.ProcessEnv; lastCheckAt?: string;
  // Doan-account runs only: arguments ahead of the runner's own, the account the run uses, the lease to release once the
  // spawned group is gone, and a recheck that throws when the account changed during an await.
  args?: string[]; owner?: Extract<ConversationOwner, { kind: "doan" }>; release?: () => Promise<void>; recheck?: () => void;
  // ACP runs only: the authenticate method to select, and the callback for a completed request (Copilot's verification).
  authenticate?: string; confirm?: () => void;
  // Doan-account runs with a version run only: record or clear the installed version this run read, from a handshake.
  incompatible?: () => void; compatible?: () => void;
  // The installed version the run read (doan-account runs with a version run), part of the model-list cache key.
  installed?: string;
  // The conversation's chosen model and effort, applied by the runner on every send: a Claude resume and an ACP
  // session/load fall back to the default model otherwise.
  model?: string; effort?: string;
  // The conversation's chosen permission mode for this run, absent for Default. planApproved: the mode Claude switched
  // to once the person approved a plan on a turn sent with Plan, which becomes the conversation's stored mode.
  permissionMode?: PermissionModeId; planApproved?: (mode: PermissionModeId) => void;
  // The agent read a message steer added (its messageId), in line with the run's events (runners.ts SteerHooks).
  steerConsumed?: (messageId: string) => void;
  // Doan-account Claude and Codex runs only: the provider's MCP connector facts (prepare.ts McpConnectorFacts).
  mcp?: McpRun;
  // Doan-account Claude and Codex runs only: called after a turn ends done, with a read of the account's usage on this
  // run's own connection (no new process). The hook decides whether to read; a Claude run keeps its input open until
  // it resolves, since the CLI exits once its input closes (agentAuth/usageService.ts withTurnUsage).
  usageAtTurnEnd?: (read: () => Promise<unknown>) => Promise<void>;
}
// generation: the provider's connector generation now. labels: connector names by doan- name, for permission
// summaries and activity lines.
export interface McpRun { generation(): number; labels(): Readonly<Record<string, string>> }
// attachments: the turn's files, which only Antigravity also receives as image blocks. models: the provider's list for
// this folder, from a runner opened only to read it.
// A start's attachments, checked again right before acceptance (recheck throws attachment_missing with the missing
// ids) and marked sent just before the commit.
export interface StartAttachments { recheck(): AttachmentRecord[]; sent(): void }
// The model, effort and permission mode of one send. Claude and ACP runs open a process per turn with them already; a
// reused Codex server needs them on the turn itself. A send names its mode always, Default included, since a Codex
// override holds for later turns.
// reloadMcp: a reused Codex server whose provider's connectors changed since it opened reloads its MCP servers first.
export interface TurnChoice { model?: string; effort?: string; permissionMode?: PermissionModeId; reloadMcp?: true }
// What a send may carry besides its text: a new choice (model given, effort optional), a new permission mode (judged
// apart from the model, Default included) and rechecked attachments.
// defaultEffort: the level the turn names when its choice has none (models.ts ModelOption); it is never stored.
export interface SendExtras extends TurnChoice { attachments?: AttachmentRecord[]; defaultEffort?: string }
function askingKey(event: { type: string; requestId: string }): string { return `${event.type.startsWith("question.") ? "question" : "permission"}:${event.requestId}`; }
// steer: Claude and Codex only (steerSupport.ts); adds a message to the running turn turnId and resolves once the
// provider accepted it, which is not yet the agent reading it (Prepared.steerConsumed).
export interface Runner { sessionId: string; send(prompt: string, turnId: string, attachments?: readonly AttachmentRecord[], choice?: TurnChoice): Promise<void>; answer(requestId: string, optionId: string): boolean; answerQuestion?(requestId: string, answer: QuestionAnswerInput): "ok" | "stale" | "bad_request"; stop(): Promise<void>; close(): Promise<void>; models?(): Promise<ModelList>; steer?(prompt: string, turnId: string, messageId: string): Promise<void> }
// What a queued send needs from main's attachment store: the queued ids checked again as the send's attachments
// (reclaim throws attachment_missing), consumed once that send was accepted, discarded with a removed message (a paste
// goes with it) and released when they come back in a draft, which carries their paths instead.
export interface QueueFiles { reclaim(ids: string[]): StartAttachments; consume(ids: string[]): void; discard?(ids: string[]): void; release?(ids: string[]): void }
// drafts: the input queue and the drafts it hands back; files: the queue's attachments; defaultEffort: the level a queued
// turn names when the conversation's model has no stored effort (models.ts ModelCatalog.defaultEffort).
export interface QueueOptions { drafts?: DraftStore; files?: QueueFiles; defaultEffort?: (root: string, provider: Provider, model: string) => string | undefined }
export type OpenRunner = (input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<Runner>;
// use "listing": a model list read, which a sign-out stops without asking (agentAuth/manager.ts acquire).
// reusing: a send to this conversation's live Codex server, which keeps its thread open between turns.
export type Prepare = (request: StartRequest, stored?: ConversationMetadata, use?: "run" | "listing", reusing?: boolean) => Promise<Prepared>;
// Reads a model list through a provider process opened only for that, reporting its spawn and disappearance as
// OpenRunner does; it never releases the lease itself.
export type ReadModels = (input: Prepared, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<ModelList>;
function freeLease(input: Prepared | undefined): void {
  void input?.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// A Claude process ended about 0.75 s after turn.done, but its reservation held for 2.1-5.0 s after turn.done until the
// group was gone (packaged app, D1 2026-10-28). The wait allows twice the slowest observed.
const EXIT_WAIT_MS = 10_000;
// provider: set for a run on a doan account, whose lease a sign-out or replacement waits for (stopRuns).
// since: the stopRuns count when this start or send began; a later stop of its provider stops it once it spawns.
// endedAt: when the accepted turn's terminal event arrived, for binding.
// project: the root of this turn when it belongs to a conversation without a canvas (project.ts projectBusy).
// closed: the conversation was archived and its runner is closing; it is never reused (a restore opens a new one).
// holding: queued messages wait to go out after this turn; each hold is its own object, so a flush that ends late
// never lets go of the hold a later turn set.
// mcpGeneration: the provider's connector generation the runner's MCP servers were read at (its opening or last reload).
// asking: the accepted turn's permission requests and questions not answered yet, keyed by kind and id so one kind's
// resolution never settles the other; while any is open the turn waits for the person and does not keep its root
// (projectBusy). A turn's end expires them.
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean; provider?: Provider; since: number; endedAt?: number; project?: string; closed?: boolean; holding?: object; mcpGeneration?: number | undefined; asking?: Set<string> }
// A project turn's grounds for promotion (design §2.4): the canvas list when the turn was accepted, the paths of its own
// edit activities and the canvas files the folder watcher saw change. endedAt: the turn is over and waits for its first
// folder refresh, or for the timer at the end of the binding window. turnId: the judged turn, for its bound marker.
// Only one turn's own grounds count: the conversation's next send waits for this judgement (waiters) and starts with a
// new snapshot. Kept apart from the live entries, which a send replaces before it is accepted: until judged, it keeps
// its root (checkProject), unless it waits for an answer.
// taken: canvases another conversation of the root was promoted to after this snapshot (promotionTarget).
interface Evidence { root: string; turnId: string; snapshot: Canvas[]; edits: Set<string>; changed: Set<string>; taken: Canvas[]; endedAt?: number; timer?: ReturnType<typeof setTimeout>; waiters: (() => void)[] }
// A model-list read: stopped by quit and by a stop of its provider like a run, holding its lease until its group is gone.
interface Listing { provider: Provider; since: number; cleanup?: () => Promise<void> }
// A queued message Send now put into a running turn (live, turnId) that the agent has not read yet. Its item stays in
// drafts.json marked sending until the request is answered; message: the user.message appended once the agent reads
// it. answered: the request already has its answer (a refusal), though the provider may still have taken it.
interface Steer { id: string; itemId: string; live: Live; turnId: string; message: EventPayload; ids: string[]; attached?: StartAttachments; answered: boolean; resolve(): void; reject(error: Error): void }
export class ConversationService {
  private listings = new Set<Listing>();
  private listingOf = new WeakMap<Prepared, Listing>();
  private reservations: Reservation[] = [];
  private live = new Map<string, Live>();
  private quitting = false;
  private stops = 0;
  private lastStop = new Map<Provider, number>();
  // Sends waiting for the previous turn's process to exit; cancelled ones are refused once woken.
  private waits = new Map<string, { wake(): void; cancelled: boolean; provider?: Provider }>();
  // The attachment ids of each queued message, for its send; they mean nothing after a restart (the queue then comes
  // back as a draft), so they stay here.
  private queuedExtras = new Map<string, { owner: string; ids: string[] }>();
  private evidence = new Map<string, Evidence>();
  // Sends waiting for their conversation's previous turn to be judged.
  // A Stop or a sign-out of its provider refuses such a send as busy, as it refuses one waiting for the previous process.
  private judging = new Map<string, { wake(): void; cancelled: boolean; provider?: Provider }>();
  private drafts: DraftStore;
  // By messageId, until the agent reads it or its turn ends; a refused one stays, since its read may still come.
  private steers = new Map<string, Steer>();
  // listChanged: a root whose conversation list (conversation:list) changed, sent after the write it reports.
  // deleted: a conversation deleted (delete), once its index entry is gone.
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent) => void, private admit: (root: string, canvas?: Canvas) => Canvas | void = () => {}, private exitWaitMs = EXIT_WAIT_MS, private canvases: (root: string) => readonly Canvas[] = () => [], private listChanged: (root: string) => void = () => {}, private queueOptions: QueueOptions = {}, private deleted: (id: string) => void = () => {}) {
    this.drafts = queueOptions.drafts ?? new DraftStore(null);
    // The deletions an earlier run recorded finish here, their drafts included (store.ts finishDeletions).
    store.finishDeletions(id => this.drafts.discard(id));
  }
  private reserve(id: string, input?: Prepared, reuse = false): void {
    const key = input?.sessionId ? { runtime: input.runtime, configDir: input.configDir, sessionId: input.sessionId } : null;
    const result = reserveSession(this.reservations, id, key, reuse);
    if (!result.ok) throw new Error(result.code); this.reservations = result.reservations;
  }
  private promote(id: string, input: Prepared, sessionId: string): void {
    const key = { runtime: input.runtime, configDir: input.configDir, sessionId };
    const result = promoteReservation(this.reservations, id, key);
    if (!result.ok) {
      // A losing spawned process may outlive the winner; quarantine its known ID too.
      if (result.code === "session_in_use") this.reservations.push({ owner: id, key });
      throw new Error(result.code);
    }
    this.reservations = result.reservations;
  }
  async start(request: StartRequest, attached?: StartAttachments): Promise<{ conversationId: string }> {
    if (this.quitting) throw new Error("busy");
    const admitted = this.admit(request.root, request.canvas);
    if (admitted) request = { ...request, canvas: admitted };
    const project = request.mode === "newDesign" ? request.root : undefined;
    if (project) this.checkProject(project);
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops, ...(project ? { project } : {}) }; this.live.set(id, live);
    let opening = false, input: Prepared | undefined;
    const turnId = live.turnId;
    try {
      input = { ...await this.prepare(request), ...choice(request), ...mode(request.permissionMode), planApproved: reported => this.planApproved(id, live, turnId, reported), steerConsumed: messageId => this.steerConsumed(id, messageId) };
      if (input.owner) live.provider = input.owner.provider;
      if (this.quitting) throw new Error("busy");
      if (input.sessionId) this.promote(id, input, input.sessionId);
      opening = true;
      live.mcpGeneration = input.mcp?.generation();
      const runner = await this.openRunner(id, live, input); live.runner = runner;
      if (live.exited) throw new Error("process_exited");
      input.recheck?.();
      if (!input.sessionId) this.promote(id, input, runner.sessionId);
      if (input.sessionId && input.sessionId !== runner.sessionId) throw new Error("session_unavailable");
      if (this.quitting) throw new Error("busy");
      const currentCanvas = this.admit(request.root, request.canvas);
      if (currentCanvas) request = { ...request, canvas: currentCanvas };
      if (project) this.checkProject(project, id);
      const session = { runtime: input.runtime, origin: request.mode === "resume" ? "resumed" as const : request.mode, sessionId: runner.sessionId, configDir: input.configDir, cwd: input.cwd };
      // Every turn of a newDesign conversation carries Home's paragraph.
      const fromHome = request.mode === "newDesign";
      // seenSeq 0: nothing of a new conversation has been seen, so its first end shows as unseen.
      const base = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: messageLine(request.text, request.anchors), state: "current" as const,
        ...choice(request), ...mode(request.permissionMode), ...(fromHome ? { fromHome: true as const } : {}), ...(request.mode === "newDesign" ? { canvasesAtStart: this.snapshot(request.root) } : {}), seenSeq: 0 };
      const runtime = input.runtime;
      // Without an owner the run used an external profile, which exists only for the shared sessions' two runtimes.
      if (!input.owner && runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
      const metadata: ConversationMetadata = input.owner ? { ...base, owner: input.owner, session }
        : { ...base, owner: { kind: "legacy-external" }, session: { ...session, runtime: runtime === "claude" ? "claude" : "codex" } };
      const entries = this.store.list();
      const replaced = entries.filter(m => m.state === "current" && m.root === request.root && m.canvas && request.canvas && sameCanvas(m.canvas, request.canvas));
      // The files may have moved while the runner was prepared and opened; the prompt and history use this check.
      const attachments = attached ? attached.recheck() : request.attachments ?? [];
      const prompt = turnPrompt(request.anchors, request.text, metadata, { home: fromHome, attachments }); if (prompt === null) throw new Error("bad_request");
      const writes: { id: string; turn: string; body: EventPayload }[] = [];
      for (const old of replaced) {
        const running = this.live.get(old.conversationId); const turn = running?.turnId || randomUUID();
        if (running?.accepted && running.busy && !running.terminal) writes.push({ id: old.conversationId, turn, body: { type: "interrupted", reason: "user" } });
        writes.push({ id: old.conversationId, turn, body: { type: "conversation.archived" } });
      }
      writes.push({ id, turn: live.turnId, body: { type: "user.message", text: request.text, anchors: request.anchors, ...(attachments.length ? { attachments } : {}) } }, { id, turn: live.turnId, body: { type: "turn.started" } });
      attached?.sent();
      const saved = this.store.acceptStart([...entries.map(m => replaced.includes(m) ? { ...m, state: "archived" as const } : m), metadata], id, writes);
      live.accepted = true;
      if (project) this.evidence.set(id, { root: project, turnId: live.turnId, snapshot: base.canvasesAtStart ?? [], edits: new Set(), changed: new Set(), taken: [], waiters: [] });
      for (const old of replaced) this.archive(old.conversationId);
      for (const event of saved) this.deliver(event);
      this.changed(request.root);
      for (const event of live.events.splice(0)) this.receive(id, event);
      this.sendTurn(id, live, runner, prompt, attachments.length ? attachments : undefined);
      return { conversationId: id };
    } catch (error) {
      // A refused start no longer holds the project, though its process may take a while to go.
      delete live.project;
      if (!opening) { this.reservations = releaseReservation(this.reservations, id, "not_spawned"); this.live.delete(id); freeLease(input); }
      else { void live.runner?.close(); }
      throw error instanceof Error && error.message === "outside_root" ? new Error("session_unavailable") : error;
    }
  }
  // extras: a model (with its effort, if any) replaces the stored choice from this turn on; attachments were checked by
  // ipc, and attached rechecks them right before acceptance and marks pasted ones sent.
  // A send to an archived conversation restores it (design §2.5): its canvas is found again by ID, the canvas's current
  // conversation must not be working, and both are swapped through the journal at acceptance. Whether a send restores
  // is decided at admission; a conversation archived while its send prepared is refused as busy.
  // A conversation whose queue is about to go out takes no other send first: the queued messages keep their place.
  send(id: string, text: string, anchors: Anchor[], extras: SendExtras = {}, attached?: StartAttachments): Promise<void> {
    if (this.live.get(id)?.holding) return Promise.reject(new Error("busy"));
    return this.submit(id, text, anchors, extras, attached);
  }
  private async submit(id: string, text: string, anchors: Anchor[], extras: SendExtras, attached?: StartAttachments): Promise<void> {
    // Only a send that waits yields here; any other runs up to its reservation in the caller's tick, as before.
    const judged = this.judgement(id); if (judged) await judged;
    const exiting = this.previousExit(id); if (exiting) await exiting;
    let metadata = this.metadata(id); if (this.quitting) throw new Error("busy");
    const restoring = metadata.state === "archived";
    let replacing: string[] = [];
    if (restoring) { metadata = this.restoreTarget(metadata); replacing = this.replacing(metadata, id); }
    else metadata = this.refreshCanvas(metadata);
    const runtime = metadata.session.runtime;
    const existing = this.live.get(id); if (existing?.busy || existing?.failedPersistence) throw new Error("busy");
    const project = metadata.canvas ? undefined : metadata.root;
    if (project) this.checkProject(project, id);
    // An archived conversation's runner is closing; previousExit waited for its process, so a new one opens.
    const live: Live = (existing?.runner && !existing.closed ? existing : undefined) ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: 0 };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; delete live.closed; live.turnId = randomUUID(); live.since = this.stops; this.live.set(id, live);
    if (project) live.project = project; else delete live.project;
    this.changedOf(id);
    // The mode is judged apart from the model: a send may change either alone.
    const chosen = { ...extras.model ? choice(extras) : choice(metadata), ...mode(extras.permissionMode !== undefined ? extras.permissionMode : metadata.permissionMode) };
    const admittedMode = metadata.permissionMode;
    const expected = restoring ? "archived" : "current";
    let reserved = false, opening = false, input: Prepared | undefined, leased = false;
    try {
      const reusing = runtime === "codex" && !!live.runner;
      this.reserve(id, { ...metadata.session, runtime, command: "", env: {} }, reusing); reserved = true;
      const turnId = live.turnId;
      // steerConsumed names no turn: a reused Codex server keeps the callback it opened with.
      input = { ...await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors }, metadata, undefined, reusing), ...chosen, planApproved: reported => this.planApproved(id, live, turnId, reported), steerConsumed: messageId => this.steerConsumed(id, messageId) };
      if (input.owner) live.provider = input.owner.provider;
      this.checkSend(id, live, expected);
      if (live.exited) throw new Error("process_exited");
      if (!live.runner) { opening = true; leased = true; live.mcpGeneration = input.mcp?.generation(); live.runner = await this.openRunner(id, live, input); }
      if (live.exited) throw new Error("process_exited");
      if (live.runner.sessionId !== metadata.session.sessionId) throw new Error("session_unavailable");
      this.checkSend(id, live, expected);
      if (project) this.checkProject(project, id);
      input.recheck?.();
      if (restoring) {
        // The canvas's current conversation must be the one seen at admission and still not working.
        metadata = this.restoreTarget(this.metadata(id));
        const now = this.replacing(metadata, id);
        if (now.length !== replacing.length || now.some(other => !replacing.includes(other))) throw new Error("busy");
      } else metadata = this.refreshCanvas(this.metadata(id));
      // The same account signed in again under a new connection; judgeConnection already proved account, profile and session.
      const owner = input.owner;
      const rebound = !!owner && metadata.owner.kind === "doan" && metadata.owner.connectionId !== owner.connectionId;
      if (owner && rebound) metadata = { ...metadata, owner, session: metadata.session };
      // The files may have moved while the runner was prepared and opened; the prompt and history use this check.
      const attachments = attached ? attached.recheck() : extras.attachments ?? [];
      // Home's paragraph only while the conversation has no canvas: a promoted one works on its canvas.
      const prompt = turnPrompt(anchors, text, metadata, { home: metadata.fromHome === true && !metadata.canvas, attachments }); if (prompt === null) throw new Error("bad_request");
      // The choice and snapshot are written before the turn's events: a failed append then leaves only a saved choice.
      // An entry without seenSeq has had all of its history seen; from now on its ends count.
      const projectTurn = project !== undefined && !metadata.canvas;
      const canvasesAtStart = projectTurn ? this.snapshot(metadata.root) : metadata.canvasesAtStart;
      const seenSeq = metadata.seenSeq ?? this.store.read(id).at(-1)?.seq ?? 0;
      const { model: _model, effort: _effort, permissionMode: _mode, canvasesAtStart: _snapshot, ...rest } = metadata;
      // A picker change stored while this send was prepared is the later pick, so it stays for the next turn.
      const stored = metadata.permissionMode !== admittedMode ? mode(metadata.permissionMode) : mode(chosen.permissionMode);
      const updated: ConversationMetadata = { ...rest, ...choice(chosen), ...stored, ...(canvasesAtStart ? { canvasesAtStart } : {}), seenSeq };
      const message: EventPayload = { type: "user.message", text, anchors, ...(attachments.length ? { attachments } : {}) };
      attached?.sent();
      if (restoring) {
        const swap = restoreEntries(this.store.list(), id); if (!swap) throw new Error("busy");
        const writes: JournalWrite[] = swap.replaced.map(old => ({ id: old, turn: this.live.get(old)?.turnId || randomUUID(), body: { type: "conversation.archived" } }));
        writes.push({ id, turn: live.turnId, body: { type: "conversation.restored" } }, { id, turn: live.turnId, body: message }, { id, turn: live.turnId, body: { type: "turn.started" } });
        const saved = this.store.acceptChange({ kind: "restore", id, replaced: swap.replaced }, swap.entries.map(m => m.conversationId === id ? { ...updated, state: "current" } : m), writes);
        live.accepted = true;
        for (const old of swap.replaced) this.archive(old);
        for (const event of saved) this.deliver(event);
        this.changed(metadata.root);
      } else {
        if (rebound || chosen.model !== metadata.model || chosen.effort !== metadata.effort || stored.permissionMode !== metadata.permissionMode || seenSeq !== metadata.seenSeq || JSON.stringify(canvasesAtStart) !== JSON.stringify(metadata.canvasesAtStart))
          this.store.save(this.store.list().map(m => m.conversationId === id ? updated : m));
        this.append(id, live.turnId, message); this.append(id, live.turnId, { type: "turn.started" }); live.accepted = true;
      }
      if (projectTurn) this.evidence.set(id, { root: metadata.root, turnId: live.turnId, snapshot: canvasesAtStart ?? [], edits: new Set(), changed: new Set(), taken: [], waiters: [] });
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A reused Codex server keeps the lease it opened with; this preparation's lease covered only the checks.
      if (!leased) freeLease(input);
      // A new server read the profile as it opened; only a reused one may hold servers from before a change.
      const generation = input.mcp?.generation();
      const reloadMcp = !opening && generation !== undefined && generation !== live.mcpGeneration;
      if (reloadMcp) live.mcpGeneration = generation;
      const turnChoice: TurnChoice = { ...chosen, permissionMode: chosen.permissionMode ?? "default", ...(!chosen.effort && extras.defaultEffort ? { effort: extras.defaultEffort } : {}), ...(reloadMcp ? { reloadMcp: true as const } : {}) };
      this.sendTurn(id, live, live.runner, prompt, attachments.length ? attachments : undefined, turnChoice);
    } catch (error) {
      live.busy = false;
      if (reserved && !opening && !live.runner) this.reservations = releaseReservation(this.reservations, id, "not_spawned");
      if (!leased) freeLease(input);
      // Messages queued behind a send that never ran have nothing left to follow; a queue's own send hands them back.
      if (!this.working(id)) this.giveBack(id, reason(error));
      this.changedOf(id);
      if (opening) void live.runner?.close(); throw error;
    }
  }
  // The archived conversation with its canvas found again by stable ID (moved: the new path, not saved until the restore
  // is accepted); canvas_not_found when it is gone or its ID is listed twice.
  private restoreTarget(metadata: ConversationMetadata): ConversationMetadata {
    if (metadata.state !== "archived" || !metadata.canvas) throw new Error("busy");
    const canvas = this.admit(metadata.root, metadata.canvas);
    return canvas ? { ...metadata, canvas } : metadata;
  }
  // The current conversations a restore of this one archives; busy when one of them is working.
  private replacing(metadata: ConversationMetadata, id: string): string[] {
    const canvas = metadata.canvas; if (!canvas) throw new Error("busy");
    const ids = this.store.list().filter(m => m.conversationId !== id && m.state === "current" && m.root === metadata.root && m.canvas && sameCanvas(m.canvas, canvas)).map(m => m.conversationId);
    if (ids.some(other => this.working(other))) throw new Error("busy");
    return ids;
  }
  // A finished turn's process may still be exiting, and its reservation keeps a second process off the session until
  // its group is gone. The send waits for that instead of refusing; every check in send runs again afterwards.
  private previousExit(id: string): Promise<void> | undefined {
    const live = this.live.get(id), metadata = this.store.list().find(m => m.conversationId === id);
    if (!metadata || live?.busy || live?.failedPersistence || this.quitting || !this.reservations.some(r => r.owner === id)) return;
    // A Codex server is reused while its conversation stays current; an archived one's server is closing.
    if (metadata.session.runtime === "codex" && live?.runner && !live.closed) return;
    if (this.waits.has(id)) throw new Error("busy");
    return this.exitOf(id, live);
  }
  private async exitOf(id: string, live: Live | undefined): Promise<void> {
    let wake!: () => void;
    const woken = new Promise<void>(resolve => { wake = resolve; });
    const wait = { wake, cancelled: false, ...(live?.provider ? { provider: live.provider } : {}) };
    this.waits.set(id, wait); this.changedOf(id);
    const timer = setTimeout(wake, this.exitWaitMs);
    try { await woken; } finally { clearTimeout(timer); this.waits.delete(id); this.changedOf(id); }
    // Refused here, before send replaces the live entry: a replaced entry no longer matches the old process's exit
    // callback, which would then never release the reservation.
    if (wait.cancelled || this.reservations.some(r => r.owner === id)) throw new Error("busy");
  }
  // A send of a conversation whose previous turn is not judged yet waits for that judgement (the first folder refresh
  // or the window's end), so the next turn starts with its own snapshot and no grounds of the earlier turn.
  private judgement(id: string): Promise<void> | undefined {
    let evidence = this.evidence.get(id); if (evidence?.endedAt === undefined) return;
    // Its window passed without its timer having run yet (a busy main loop): judged now, as checkProject does.
    if (Date.now() - evidence.endedAt > BIND_GRACE_MS) { this.judge(id); evidence = this.evidence.get(id); if (evidence?.endedAt === undefined) return; }
    if (this.judging.has(id)) throw new Error("busy");
    const waiting = evidence, provider = this.live.get(id)?.provider;
    return new Promise<void>(resolve => {
      const entry = { wake: resolve, cancelled: false, ...(provider ? { provider } : {}) };
      this.judging.set(id, entry); this.changedOf(id);
      waiting.waiters.push(resolve);
    }).then(() => {
      const entry = this.judging.get(id); this.judging.delete(id); this.changedOf(id);
      if (entry?.cancelled) throw new Error("busy");
    });
  }
  private dropEvidence(id: string): void {
    const evidence = this.evidence.get(id); if (!evidence) return;
    clearTimeout(evidence.timer); this.evidence.delete(id);
    for (const wake of evidence.waiters.splice(0)) wake();
  }
  private cancelWait(id: string): void {
    const wait = this.waits.get(id); if (wait) { wait.cancelled = true; wait.wake(); }
    const judging = this.judging.get(id); if (judging) { judging.cancelled = true; judging.wake(); }
  }
  // The lease belongs to this runner's process group: it is released when that group is gone, or at once when
  // opening failed before anything was spawned.
  private async openRunner(id: string, live: Live, input: Prepared): Promise<Runner> {
    let spawned = false;
    const release = () => freeLease(input);
    try {
      return await this.open(input, event => { if (this.live.get(id) === live) this.receive(id, event); }, () => { release(); if (this.live.get(id) === live) this.exited(id); }, stop => { spawned = true; live.cleanup = stop; if (this.quitting || this.stopped(live)) void stop(); });
    } catch (error) { if (!spawned) release(); throw error; }
  }
  receive(id: string, event: EventPayload): void {
    const live = this.live.get(id); if (!live || live.failedPersistence || live.terminal) return;
    if (!live.accepted) { live.events.push(event); return; }
    if (live.terminal) return;
    try {
      this.append(id, live.turnId, event);
      const evidence = this.evidence.get(id);
      if (event.type === "activity" && event.kind === "edit" && event.path && evidence && evidence.endedAt === undefined) evidence.edits.add(event.path);
      if (event.type === "permission.request" || event.type === "question.request") (live.asking ??= new Set()).add(askingKey(event));
      else if (event.type === "permission.resolved" || event.type === "question.resolved") live.asking?.delete(askingKey(event));
      if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") { live.terminal = true; live.busy = false; live.endedAt = Date.now(); delete live.asking; this.dropSteers(id); this.ended(id, live, event.type); }
    } catch (error) {
      live.failedPersistence = true; console.error("doan: conversation event persistence failed", error); void live.runner?.close();
      this.dropSteers(id);
      // Its turn never ends, so it is never judged and must not hold its root.
      this.dropEvidence(id);
      // No event says so, but the list's projectBusy and, once the process is gone, the phase change.
      this.changedOf(id);
    }
  }
  read(id: string) {
    this.metadata(id); const events = this.store.read(id); const state = foldConversation(events, id, !this.ran(id));
    const pendingPermission = [...events].reverse().find(e => e.type === "permission.request" && state.permissions[e.requestId] === "pending");
    return { events, lastSeq: state.lastSeq, turn: state.turn, ...(pendingPermission ? { pendingPermission } : {}) };
  }
  forCanvas(root: string, canvas: Canvas) {
    for (const m of this.store.list()) if (m.root === root && m.canvas && sameCanvas(m.canvas, canvas)) this.refreshCanvas(m);
    const summaries = this.store.list().filter(m => m.root === root && m.canvas && sameCanvas(m.canvas, canvas)).map(m => {
      const read = this.read(m.conversationId); return { conversationId: m.conversationId, canvas: m.canvas, title: m.title, state: m.state,
        turn: read.turn === "waitingPermission" ? "waitingPermission" : ["starting", "streaming"].includes(read.turn) ? "running" : read.turn === "failed" ? "failed" : "idle",
        session: { runtime: m.session.runtime, origin: m.session.origin }, lastAt: read.events.at(-1)?.at ?? "" };
    });
    return { current: summaries.find(m => m.state === "current") ?? null, archived: summaries.filter(m => m.state === "archived") };
  }
  // canvas-row-menu: the grounds of this root's project turns not judged yet (running, or ended within the binding
  // window), for Move to Trash's busy check (canvasTrash.ts trashBusy). Exactly this root, as copies.
  projectEvidence(root: string): { edits: string[]; changed: string[] }[] {
    const now = Date.now();
    return [...this.evidence.values()]
      .filter(evidence => evidence.root === root && (evidence.endedAt === undefined || now - evidence.endedAt <= BIND_GRACE_MS))
      .map(evidence => ({ edits: [...evidence.edits], changed: [...evidence.changed] }));
  }
  // One summary per indexed conversation of the root; an unreadable history fails only its own row.
  list(root: string): ConversationSummary[] {
    return this.store.list().filter(m => m.root === root).map(m => {
      let read: { ok: true; events: ConversationEvent[] } | { ok: false };
      try { read = { ok: true, events: this.store.readRequired(m.conversationId) }; } catch { read = { ok: false }; }
      return conversationSummary(m, read, { live: this.ran(m.conversationId), queued: this.drafts.queued(m.conversationId).length, working: this.working(m.conversationId), returned: !!this.drafts.returned(m.conversationId) });
    });
  }
  // An entry without seenSeq has had its whole history seen, so a lower seq never makes it unseen.
  markSeen(id: string, seq: number): void {
    const m = this.metadata(id), last = this.store.read(id).at(-1)?.seq ?? 0;
    const next = clampSeen(seq, last, m.seenSeq ?? last);
    if (next === m.seenSeq) return;
    this.store.save(this.store.list().map(e => e.conversationId === id ? { ...e, seenSeq: next } : e));
    this.changed(m.root);
  }
  // What ipc needs to check a send's extras: the conversation's folder, its fixed provider and its owner kind.
  // The picker changed without a send (permission-mode spec decision 7). A running turn keeps the mode it was sent
  // with; the next send that names none and a queue flushed later use this one (decision 8). ipc refuses it for a
  // legacy external conversation.
  setPermissionMode(id: string, permissionMode: PermissionModeId): void { this.storeMode(id, permissionMode); }
  sendTarget(id: string): { root: string; provider: Provider; owner: ConversationOwner["kind"]; model?: string; effort?: string } {
    const m = this.metadata(id); return { root: m.root, provider: m.session.runtime, owner: m.owner.kind, ...choice(m) };
  }
  answer(id: string, requestId: string, option: string): void { this.metadata(id); if (!this.live.get(id)?.runner?.answer(requestId, option)) throw new Error("stale"); }
  // The runner holding the question checks the answer against it; a runner without questions holds none.
  answerQuestion(id: string, requestId: string, answer: QuestionAnswerInput): void {
    this.metadata(id); const result = this.live.get(id)?.runner?.answerQuestion?.(requestId, answer) ?? "stale";
    if (result !== "ok") throw new Error(result);
  }
  async interrupt(id: string): Promise<void> {
    this.metadata(id); this.cancelWait(id); const live = this.live.get(id);
    // Stop while the queue waits to go out (for the judgement or the previous process) hands it back instead.
    if (live?.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); return; }
    // A send cancelled while it waited for the judgement or the previous process leaves the queue behind it nothing
    // to follow.
    if (!live || !live.busy) { this.giveBack(id, "interrupted"); return; }
    const stop = live.runner?.stop(); if (live.busy) this.receive(id, { type: "interrupted", reason: "user" }); await stop;
  }
  // The preparation of a model-list read; a quit or a stop of the provider during it refuses the read and frees its lease.
  async prepareListing(root: string, runtime: Provider): Promise<Prepared> {
    if (this.quitting) throw new Error("busy");
    const listing: Listing = { provider: runtime, since: this.stops }; this.listings.add(listing);
    let input: Prepared;
    try { input = await this.prepare({ root, mode: "new", runtime, text: "", anchors: [] }, undefined, "listing"); } catch (error) { this.listings.delete(listing); throw error; }
    if (this.quitting || this.stopped(listing)) { this.listings.delete(listing); freeLease(input); throw new Error("busy"); }
    const release = input.release;
    const prepared: Prepared = { ...input, release: async () => { this.listings.delete(listing); await release?.(); } };
    this.listingOf.set(prepared, listing);
    return prepared;
  }
  // The lease is released when the read's process group is gone, or at once when nothing was spawned; a group that
  // never disappears keeps it.
  async listModels(input: Prepared, read: ReadModels): Promise<ModelList> {
    const listing = this.listingOf.get(input); if (!listing) throw new Error("bad_request");
    if (this.quitting || this.stopped(listing)) { freeLease(input); throw new Error("busy"); }
    let spawned = false;
    try {
      return await read(input, () => freeLease(input), stop => {
        spawned = true; listing.cleanup = stop;
        if (this.quitting || this.stopped(listing)) void stop();
      });
    } catch (error) { if (!spawned) freeLease(input); throw error; }
  }
  // A sign-out or account replacement the user chose to stop runs for. The provider's doan-account runs end as a user
  // interruption; each lease is released once its group is gone (openRunner), which the auth attempt waits for. A run
  // still preparing or opening is stopped as soon as it spawns. External runs hold no lease and are left alone.
  async stopRuns(provider: Provider): Promise<void> {
    this.stops += 1; this.lastStop.set(provider, this.stops);
    // Such a cancelled send leaves the queue accepted behind it nothing to follow; it comes back as interrupted. A quit
    // keeps it on disk for the next start instead.
    for (const [id, wait] of [...this.waits, ...this.judging]) if (wait.provider === provider) { this.cancelWait(id); this.giveBack(id, "interrupted"); }
    const closing: Promise<void>[] = [];
    for (const listing of this.listings) if (listing.provider === provider && listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.provider !== provider) continue;
      // A queue held for its judgement or for the previous process is the person's to send again, not this run's.
      if (live.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); }
      if (live.accepted && live.busy && !live.terminal) this.receive(id, { type: "interrupted", reason: "user" });
      if (live.accepted) { live.terminal = true; live.busy = false; }
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
    }
    await Promise.all(closing);
  }
  quit(): Promise<void> {
    const closing: Promise<void>[] = [];
    this.quitting = true;
    // Queued messages stay in drafts.json and come back as drafts at the next start.
    for (const id of [...this.evidence.keys()]) this.dropEvidence(id);
    for (const id of [...this.waits.keys(), ...this.judging.keys()]) this.cancelWait(id);
    for (const listing of this.listings) if (listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
      if (live.accepted && live.busy && !live.terminal) this.append(id, live.turnId, { type: "interrupted", reason: "appQuit" });
      live.terminal = true; live.busy = false;
      this.dropSteers(id);
    }
    return Promise.all(closing).then(() => undefined);
  }
  // A folder listing of root was read again. changed: root-relative canvas paths whose files the watcher saw change since
  // the listing before. Project turns collect them while they run; one that ended is judged now (design §2.4).
  refreshed(root: string, changed: readonly string[]): void {
    for (const [id, evidence] of [...this.evidence]) {
      if (evidence.root !== root) continue;
      for (const path of changed) evidence.changed.add(path);
      if (evidence.endedAt !== undefined) this.judge(id);
    }
  }
  // A message sent while its conversation works waits in main, in drafts.json, until the turn ends (design §2.6).
  // ids: the attachment ids main holds for it until it goes out. not_running: nothing is working to queue behind.
  // The queue goes out in the mode stored when it is flushed (setPermissionMode), not one of its messages'.
  queue(id: string, item: { text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; ids?: string[] }): { itemId: string } {
    const m = this.metadata(id);
    if (this.quitting) throw new Error("busy");
    if (!this.working(id)) throw new Error("not_running");
    const itemId = randomUUID();
    this.drafts.add(id, { itemId, text: item.text, anchors: item.anchors, attachments: item.attachments ?? [] });
    // Queued while the turn waits for its judgement with nothing held yet: the judgement sends it. A send already
    // waiting for that judgement goes first, and the queue follows its turn.
    const live = this.live.get(id);
    if (live && !live.busy && !live.holding && !this.judging.has(id) && this.evidence.get(id)?.endedAt !== undefined) live.holding = {};
    if (item.ids?.length) this.queuedExtras.set(itemId, { owner: id, ids: item.ids });
    this.changed(m.root);
    return { itemId };
  }
  removeQueued(id: string, itemId: string): void {
    const m = this.metadata(id);
    if (!this.drafts.remove(id, itemId)) throw new Error("stale");
    const ids = this.forget(id, [itemId]); if (ids.length) this.queueOptions.files?.discard?.(ids);
    this.changed(m.root);
  }
  // Send now: one queued message into the running turn, without stopping it. It resolves once the agent read the
  // message, which is then in the turn's history and out of the queue; until then the item stays queued, marked sending.
  // not_running: nothing runs that can take it (also a provider without steer), the provider refused it, or the turn
  // ended first; the item then waits again where it was and follows the queue's rules. stale: the item is gone or
  // already on its way out. The checks run again after the provider's answer (POSTMORTEM 2026-10-27). A turn's end is
  // published before its refusals are answered, so the renderer knows why.
  // async only so that every refusal is a rejection; everything up to the steer request runs in the caller's tick.
  async sendNow(id: string, itemId: string): Promise<void> {
    const m = this.metadata(id), live = this.live.get(id);
    if (!live || !this.steerable(id, live)) throw new Error("not_running");
    const runner = live.runner!, item = this.drafts.queued(id).find(entry => entry.itemId === itemId);
    if (!item || !this.drafts.markOneSending(id, itemId)) throw new Error("stale");
    const ids = this.queuedExtras.get(itemId)?.ids ?? [], files = this.queueOptions.files;
    let attached: StartAttachments | undefined, prompt: string | null;
    let attachments: AttachmentRecord[];
    try {
      attached = ids.length && files ? files.reclaim(ids) : undefined;
      attachments = attached ? attached.recheck() : item.attachments;
      // The prompt a send of this message would carry, Home's paragraph and guidance included.
      prompt = turnPrompt(item.anchors, item.text, m, { home: m.fromHome === true && !m.canvas, attachments }); if (prompt === null) throw new Error("bad_request");
    } catch (error) { this.drafts.unmarkSending(id, itemId); throw error; }
    const turnId = live.turnId, messageId = randomUUID();
    const message: EventPayload = { type: "user.message", text: item.text, anchors: item.anchors, ...(attachments.length ? { attachments } : {}) };
    return new Promise<void>((resolve, reject) => {
      // Registered before the request: Codex may report the read before its answer to the request.
      const steer: Steer = { id, itemId, live, turnId, message, ids, ...(attached ? { attached } : {}), answered: false, resolve, reject };
      this.steers.set(messageId, steer);
      this.changedOf(id);
      runner.steer!(prompt, turnId, messageId).then(() => {
        if (this.steers.get(messageId) === steer && (!this.steerable(id, live) || live.turnId !== turnId)) this.endSteer(messageId, steer);
      }, () => { if (this.steers.get(messageId) === steer) this.refuse(steer); });
    });
  }
  // The draft queued messages came back as, handed over once.
  takeDraft(id: string): ReturnedDraft | null {
    const m = this.metadata(id), draft = this.drafts.take(id);
    if (draft) this.changed(m.root);
    return draft;
  }
  // Deleting removes Doan's own record of the conversation on this device: its index entry, history, queue and returned
  // draft. The agent's session files stay. Refused (busy) while it works or the app quits. The check and the deletion
  // run in one tick, so no send starts between them; an awaiting send is working, and later calls find no metadata.
  // The run is closed as an archived one's (archive): its live entry stays, so its process's exit callback still
  // releases the reservation (POSTMORTEM 2026-10-28), and terminal keeps a late event from recreating the history
  // (store.append creates the file). The index commit is the result; cleanup after it only logs a failure.
  delete(id: string): void {
    if (this.quitting || this.working(id)) throw new Error("busy");
    const m = this.metadata(id);
    this.archive(id);
    this.store.delete(id);
    this.drafts.discard(id);
    try { this.deleted(id); } catch (error) { console.error("doan: deleted conversation cleanup failed", error); }
    this.changed(m.root);
  }
  // Working (the list's working): preparing, running or waiting for an answer, a turn waiting for its judgement, a queue
  // about to go out, or a send waiting for the previous process or for the judgement.
  private working(id: string): boolean {
    const live = this.live.get(id);
    return !!live && (live.busy || !!live.holding) || this.waits.has(id) || this.judging.has(id) || this.evidence.get(id)?.endedAt !== undefined;
  }
  // A turn's terminal event: queued messages go out after a done turn (a project turn's once it is judged) and come back
  // as a draft after a failed or stopped one; a project turn waits for its judgement.
  private ended(id: string, live: Live, type: "turn.done" | "turn.failed" | "interrupted"): void {
    if (type !== "turn.done") this.giveBack(id, type === "interrupted" ? "interrupted" : "turn_failed");
    else if (this.drafts.queued(id).length) live.holding = {};
    const evidence = this.evidence.get(id);
    if (evidence) {
      evidence.endedAt = live.endedAt ?? Date.now();
      evidence.timer = setTimeout(() => this.judge(id), BIND_GRACE_MS);
      evidence.timer.unref?.();
    } else if (live.holding) this.flush(id, live);
  }
  // The turn's promotion (or none), written through the journal; a refused write changes nothing and is only logged.
  // Afterwards the conversation no longer holds its root, unless its queue goes out next.
  private judge(id: string): void {
    const evidence = this.evidence.get(id); if (evidence?.endedAt === undefined) return;
    clearTimeout(evidence.timer); this.evidence.delete(id);
    // A send waiting for this judgement runs once it is written; the queue, if any, is sent before (it was there first).
    try {
      // The other turns of the root not judged yet (this one is out of the map already): running, waiting for an
      // answer, or ended within their window.
      const listed = this.snapshot(evidence.root), others = [...this.evidence.values()].filter(other => other.root === evidence.root);
      const contested = listed.filter(row => others.some(other => !other.snapshot.some(old => sameCanvas(old, row))));
      const turn = { root: evidence.root, edits: [...evidence.edits], changed: [...evidence.changed], taken: evidence.taken, contested };
      const target = promotionTarget(turn, listed, evidence.snapshot, canvas => this.canvasWorking(evidence.root, canvas, id));
      if (target) this.promoteTo(id, evidence, target);
      const left = contestedCanvas(turn, listed, evidence.snapshot);
      if (left) for (const other of others) if (!other.snapshot.some(old => sameCanvas(old, left))) other.taken.push(left);
    } catch (error) { console.error("doan: conversation promotion failed", error); }
    const live = this.live.get(id);
    if (live?.holding) this.flush(id, live);
    else if (live && !live.busy) delete live.project;
    for (const wake of evidence.waiters.splice(0)) wake();
    this.changedOf(id);
  }
  private canvasWorking(root: string, canvas: Canvas, except: string): boolean {
    return this.store.list().some(m => m.conversationId !== except && m.state === "current" && m.root === root && m.canvas && sameCanvas(m.canvas, canvas) && this.working(m.conversationId));
  }
  private promoteTo(id: string, evidence: Evidence, target: Canvas): void {
    const entries = this.store.list(), me = entries.find(m => m.conversationId === id);
    if (!me || me.state !== "current" || me.canvas) return;
    const replaced = entries.filter(m => m.state === "current" && m.root === me.root && m.canvas && sameCanvas(m.canvas, target)).map(m => m.conversationId);
    const writes: JournalWrite[] = replaced.map(old => ({ id: old, turn: this.live.get(old)?.turnId || randomUUID(), body: { type: "conversation.archived" } }));
    writes.push({ id, turn: evidence.turnId, body: { type: "conversation.bound", canvas: target } });
    const kind = evidence.snapshot.some(c => sameCanvas(c, target)) ? "promote" : "bind";
    const saved = this.store.acceptChange({ kind, id, canvas: target, replaced }, entries.map(m => m.conversationId === id ? { ...m, canvas: target } : replaced.includes(m.conversationId) ? { ...m, state: "archived" } : m), writes);
    // An overlapping turn judged later must not take this canvas over and archive this conversation.
    for (const [other, grounds] of this.evidence) if (other !== id && grounds.root === me.root) grounds.taken.push(target);
    for (const old of replaced) this.archive(old);
    for (const event of saved) this.deliver(event);
    this.changed(me.root);
  }
  // A conversation that stopped being current: its run is closed as a replaced start's is, a send waiting for its
  // previous process is refused, and its queue comes back as a draft.
  private archive(id: string): void {
    const running = this.live.get(id);
    if (running) {
      running.terminal = true; running.busy = false; running.closed = true; delete running.holding; delete running.project;
      void running.runner?.close();
    }
    this.dropEvidence(id);
    this.cancelWait(id);
    this.dropSteers(id);
    this.giveBack(id, "interrupted");
  }
  // Every queued message, also those on their way out, comes back as one draft; their held ids go, since the draft
  // carries the files' paths for attachments:fromPaths.
  private giveBack(id: string, why: string): void {
    const ids = this.forget(id);
    if (ids.length) this.queueOptions.files?.release?.(ids);
    if (this.drafts.giveBackQueued(id, why)) this.changedOf(id);
  }
  private forget(id: string, itemIds?: readonly string[]): string[] {
    const ids: string[] = [];
    for (const [itemId, held] of [...this.queuedExtras]) if (held.owner === id && (!itemIds || itemIds.includes(itemId))) { ids.push(...held.ids); this.queuedExtras.delete(itemId); }
    return ids;
  }
  // The queue goes out as one message: combined, its attachments checked again and the send's own checks run. Its
  // messages stay in drafts.json, marked as on their way out, until the send is accepted. Anything that keeps it from
  // going out hands the whole queue back as a draft with that reason.
  private flush(id: string, live: Live): void {
    // A sign-out of its provider from here on stops it as it stops a run (stopRuns): it comes back as interrupted.
    const hold = live.holding, provider = live.provider, since = this.stops;
    const items = this.drafts.markSending(id);
    const ids = items.flatMap(item => this.queuedExtras.get(item.itemId)?.ids ?? []);
    const combined = combineQueued(items);
    if (!items.length || !combined.ok) {
      if (items.length) this.giveBack(id, "attachment_limit");
      this.release(id, live, hold); return;
    }
    this.changedOf(id);
    // After the terminal event's own handling: the send changes this conversation's live state.
    void Promise.resolve().then(async () => {
      try {
        const files = this.queueOptions.files;
        const attached = ids.length && files ? files.reclaim(ids) : undefined;
        const m = this.metadata(id);
        const defaultEffort = m.model && !m.effort ? this.queueOptions.defaultEffort?.(m.root, m.session.runtime, m.model) : undefined;
        await this.submit(id, combined.text, combined.anchors, { ...(combined.attachments.length ? { attachments: combined.attachments } : {}), ...(defaultEffort ? { defaultEffort } : {}) }, attached);
        const sent = items.map(item => item.itemId);
        this.forget(id, sent); this.drafts.sent(id, sent);
        if (ids.length) files?.consume(ids);
      } catch (error) {
        this.giveBack(id, provider && (this.lastStop.get(provider) ?? 0) > since ? "interrupted" : reason(error));
      } finally { this.release(id, live, hold); }
    });
  }
  // The queue went out or came back: a project conversation not running again lets its root go.
  private release(id: string, live: Live, hold: object | undefined): void {
    if (live.holding === hold) delete live.holding;
    if (this.live.get(id) === live && !live.busy && !live.holding) delete live.project;
    this.changedOf(id);
  }
  // What a Send now needs, as a send's checks (checkSend) plus a turn accepted and running in a runner that can steer.
  private steerable(id: string, live: Live): boolean {
    const m = this.store.list().find(entry => entry.conversationId === id);
    return !this.quitting && this.live.get(id) === live && live.accepted && live.busy && !live.terminal && !live.closed && !live.failedPersistence &&
      !live.exited && !this.stopped(live) && m?.state === "current" && typeof live.runner?.steer === "function";
  }
  private steering(id: string): [string, Steer][] { return [...this.steers].filter(([, steer]) => steer.id === id); }
  // The agent read a steered message: it joins its turn's history at this point and leaves the queue. The read decides,
  // also over a refusal already answered (a Codex answer that timed out while the server took it), as long as the turn
  // it went into still runs and the message is still queued; a turn that ended dropped its steers first (dropSteers).
  private steerConsumed(id: string, messageId: string): void {
    const steer = this.steers.get(messageId); if (!steer || steer.id !== id) return;
    const live = steer.live;
    if (this.live.get(id) !== live || live.turnId !== steer.turnId || !live.accepted || live.terminal || live.failedPersistence) return;
    // A refused message the person removed since is not queued any more; a pending one is marked sending.
    const same = this.steering(id).filter(([, other]) => other.itemId === steer.itemId);
    if (!this.drafts.queued(id).some(item => item.itemId === steer.itemId) && !same.some(([, other]) => !other.answered)) { this.steers.delete(messageId); return; }
    steer.attached?.sent();
    this.receive(id, steer.message);
    // A history that stopped taking writes left the message out; receive took it back into the queue (dropSteers).
    if (live.failedPersistence) return;
    this.forget(id, [steer.itemId]); this.drafts.sent(id, [steer.itemId]);
    if (steer.ids.length) this.queueOptions.files?.consume(steer.ids);
    // A Send now of the same message after a refusal is answered by this read too.
    for (const [key, other] of same) { this.steers.delete(key); if (!other.answered) { other.answered = true; other.resolve(); } }
    this.changedOf(id);
  }
  // Refused by the provider: the message waits in its place again and the request is answered, but the steer stays
  // until its turn ends, in case the provider took it after all.
  private refuse(steer: Steer): void {
    this.drafts.unmarkSending(steer.id, steer.itemId);
    if (!steer.answered) { steer.answered = true; steer.reject(new Error("not_running")); }
    this.changedOf(steer.id);
  }
  // The turn ended (or stopped taking writes) before the agent read its steered messages, which no run reports later:
  // they wait in the queue again, in their places, before the terminal handling sends or hands back the queue.
  private dropSteers(id: string): void { for (const [key, steer] of this.steering(id)) this.endSteer(key, steer); }
  private endSteer(key: string, steer: Steer): void { this.steers.delete(key); if (!steer.answered) this.refuse(steer); }
  private refreshCanvas(metadata: ConversationMetadata): ConversationMetadata {
    const canvas = this.admit(metadata.root, metadata.canvas);
    if (!canvas || !metadata.canvas || canvas.path === metadata.canvas.path) return metadata;
    if (!metadata.canvas.id || canvas.id !== metadata.canvas.id) throw new Error("canvas_not_found");
    const refreshed = { ...metadata, canvas };
    this.store.save(this.store.list().map(m => m.conversationId === metadata.conversationId ? refreshed : m));
    this.changed(metadata.root);
    return refreshed;
  }
  // The one mode Doan follows by itself: after the person approved a plan, the mode Claude reported becomes the
  // conversation's, so its picker and its next turn show what now runs. Only the turn that ran the plan counts, and
  // only while the conversation is still in Plan: a mode the person picked during the turn stays (spec decision 8).
  private planApproved(id: string, live: Live, turnId: string, reported: PermissionModeId): void {
    if (this.live.get(id) !== live || live.turnId !== turnId || !live.accepted) return;
    if (this.store.list().find(e => e.conversationId === id)?.permissionMode !== "plan") return;
    try { this.storeMode(id, reported); } catch (error) { console.error("doan: the permission mode after a plan approval could not be saved", error); }
  }
  // Saved and announced only when it changes; Default as no key.
  private storeMode(id: string, value: PermissionModeId): void {
    const entries = this.store.list(), m = entries.find(e => e.conversationId === id); if (!m) throw new Error("not_found");
    const next = mode(value);
    if (next.permissionMode === m.permissionMode) return;
    const { permissionMode: _old, ...rest } = m;
    this.store.save(entries.map(e => e === m ? { ...rest, ...next } as ConversationMetadata : e));
    this.changed(m.root);
  }
  private stopped(live: { provider?: Provider; since: number }): boolean { return !!live.provider && (this.lastStop.get(live.provider) ?? 0) > live.since; }
  // Only a turn accepted in this run can still be running; a live entry left by a refused send is not one, and a turn an
  // earlier run left unfinished folds as crashed. Nor is a turn whose history stopped taking writes once its process is
  // gone: no terminal event can be saved for it, so it folds as ended with its pending requests expired.
  private ran(id: string): boolean { const live = this.live.get(id); return !!live?.accepted && !(live.failedPersistence && live.exited); }
  // At admission, and again right before acceptance, since the other conversation may have started meanwhile.
  private checkProject(root: string, exceptId?: string): void {
    const now = Date.now();
    // A turn whose window passed without its timer having run yet (a busy main loop) is judged before it is counted.
    for (const [id, evidence] of [...this.evidence]) if (evidence.endedAt !== undefined && now - evidence.endedAt > BIND_GRACE_MS) this.judge(id);
    // A turn not judged yet keeps its root even when the send that carried it was refused (its live entry no longer
    // counts), except while it waits for an answer.
    const asking = (id: string) => !!this.live.get(id)?.asking?.size;
    if (projectBusy(this.live, root, exceptId, now) || [...this.evidence].some(([id, evidence]) => id !== exceptId && evidence.root === root && !(evidence.endedAt === undefined && asking(id)))) throw new Error("project_busy");
  }
  private snapshot(root: string): Canvas[] { return this.canvases(root).map(c => c.id === undefined ? { path: c.path } : { path: c.path, id: c.id }); }
  private checkSend(id: string, live: Live, state: "current" | "archived"): void {
    if (this.quitting || this.live.get(id) !== live || live.terminal || this.metadata(id).state !== state) throw new Error("busy");
  }
  private metadata(id: string): ConversationMetadata { const m = this.store.list().find(m => m.conversationId === id); if (!m) throw new Error("not_found"); return m; }
  private append(id: string, turn: string, event: EventPayload): void {
    const saved = this.store.append(id, turn, event);
    this.deliver(saved);
    // Streamed text changes no list field the list shows while a turn runs; its end and activities do.
    if (event.type !== "message.delta") this.changedOf(id);
  }
  // The event is already saved: an index that cannot be read here must not fail it.
  private changedOf(id: string): void {
    try { const root = this.store.list().find(m => m.conversationId === id)?.root; if (root) this.listChanged(root); }
    catch (error) { console.error("doan: conversation list change could not be announced", error); }
  }
  private changed(root: string): void {
    try { this.listChanged(root); } catch (error) { console.error("doan: conversation list change could not be announced", error); }
  }
  private deliver(saved: ConversationEvent): void {
    try { this.publish(saved); } catch (error) { console.error("doan: persisted conversation event could not be delivered", error); }
  }
  private exited(id: string): void {
    this.reservations = releaseReservation(this.reservations, id, "process_exited");
    this.waits.get(id)?.wake();
    const live = this.live.get(id); if (!live) return; live.exited = true; delete live.runner;
    if (live.failedPersistence) this.changedOf(id);
    if (!live.accepted) this.live.delete(id);
    if (live.accepted && live.busy) this.receive(id, { type: "turn.failed", code: "process_exited" });
  }
  private sendTurn(id: string, live: Live, runner: Runner, prompt: string, attachments?: readonly AttachmentRecord[], turnChoice?: TurnChoice): void {
    const turn = live.turnId;
    void (turnChoice ? runner.send(prompt, turn, attachments, turnChoice) : attachments ? runner.send(prompt, turn, attachments) : runner.send(prompt, turn)).catch(error => {
      if (this.live.get(id) === live && live.turnId === turn) this.transportFailed(id, error);
    });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? error.message.slice(0, 4096) : "Transport failed" }); }
}

// A refusal's code for a draft's reason; anything else is unknown.
function reason(error: unknown): string { return error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : "unknown"; }
function choice(source: { model?: string; effort?: string }): { model?: string; effort?: string } {
  return { ...(source.model ? { model: source.model } : {}), ...(source.effort ? { effort: source.effort } : {}) };
}
// Default is stored, and opened, as no mode.
function mode(value: PermissionModeId | undefined): { permissionMode?: Exclude<PermissionModeId, "default"> } {
  return value && value !== "default" ? { permissionMode: value } : {};
}

export function resolveListedCanvas(canvas: Canvas, listed: readonly Canvas[]): Canvas {
  const matches = listed.filter(row => canvas.id ? row.id === canvas.id : row.path === canvas.path);
  const match = matches.length === 1 ? matches[0] : undefined;
  if (!match) throw new Error("canvas_not_found");
  return canvas.id ? { id: canvas.id, path: match.path } : { path: canvas.path };
}
