import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { ConversationStore, refusesForGood, type ConversationMetadata, type JournalWrite } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, rekeyReservation, releaseReservation, reserveSession } from "./ownership";
import { storableText, transportError, type ClaudeModeReport } from "./transport";
import { runModeAfterInit, runModeAfterStatus } from "./claudeRunMode";
import { handoffPrompt, turnPrompt } from "./prompt";
import { drawnCanvases } from "./drawn";
import { handoffDecision, handoffEligibility, handoffGuidanceFor, handoffNoticeKind, handoffQueueOutcome, missedHandoffs, type ConversationHandoffNotice, type HandoffDecision, type HandoffRefusal } from "./handoff";
import { messageLine } from "./messageText";
import { requestTitleText } from "./requestLines";
import { BIND_GRACE_MS, SETTLE_MS, settleDeadline } from "./project";
import { clampSeen, conversationSummary, type ConversationSummary } from "./summary";
import { combineQueued, nextQueued } from "./queue";
import { DraftStore, type ReturnedDraft } from "./drafts";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import { codexRestart, type FenceEntry, type FenceMechanism, type FencePaths } from "../agentAuth/fence";
import type { ModelList } from "./models";
import type { PermissionModeId } from "./permissionMode";
import type { QuestionAnswerInput } from "./question";
import type { Anchor, AttachmentRecord, BoundarySignal, Canvas, ConversationEvent, EventPayload, HandoffOrigin, HandoffResolution, Reservation, SkillSummary, StageSignal, TurnStage } from "./types";
import type { LiveTurn } from "../conversationWork";
import type { AfterTurnCleanup } from "./process";
import type { BoundaryKind } from "./commandRecords";
import { claudeClearedSession, readInTranscript, readTranscriptFrom, transcriptSize } from "./io";
import { commandBoundary, commandName, passthroughCommands, passthroughName, unsupportedCommand } from "./providerCommands";
import { copilotCompacted } from "./commandRecords";
import { commandTurns } from "./commandTurns";
import { acpCommandsAfter, acpReportedNames, type AcpCommandList } from "./skills";
import { autoSchedule, claudeResetFromDetail, limitResetFromUsage, limitState, sendAt, sendDecision, SEND_DELAY_MS, turnHadActivity, type LimitEntry } from "./usageLimit";
import type { UsageWindow } from "../agentAuth/usageTypes";
// A start a handoff makes, never one ipc makes: the earlier conversation and the handoff text (never read for markers).
// turnId and path: the asking turn and its request, which a later turn of the same conversation may ask again.
export interface HandoffStart { origin: HandoffOrigin; handoffText: string; turnId: string; path: string }
// External runs are claude or codex only. model, effort and permissionMode come checked by ipc (Default never stored);
// attachments were rechecked just now. defaultEffort: the first turn's level when its model has none; never stored.
export interface StartRequest { root: string; mode: "resume" | "new" | "newDesign"; runtime?: Provider; canvas?: Canvas; text: string; anchors: Anchor[]; model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; attachments?: AttachmentRecord[]; defaultEffort?: string }
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
  // The run's own Fast, never the stored choice: set only when the choice is on and this run's list says the turn's
  // model takes Fast now (ipc for a send, QueueOptions.fast otherwise). Claude and Codex runners only read it.
  fast?: true;
  // The chosen permission mode for this run, absent for Default. modeReported (Claude only): a mode init or status reported
  // in Claude's ids, with turnInit and previous as before it; the service decides what it changes (claudeRunMode.ts).
  permissionMode?: PermissionModeId; modeReported?: (report: ClaudeModeReport, turnInit: string | undefined, previous: string | undefined) => void;
  // The agent read a message steer added (its messageId), in line with the run's events (runners.ts SteerHooks).
  steerConsumed?: (messageId: string) => void;
  // Doan-account Claude and Codex runs only: the provider's MCP connector facts (prepare.ts McpConnectorFacts).
  mcp?: McpRun;
  // The provider's own sign that a command changed the context (Claude compact_boundary or a clear's
  // conversation_reset, Codex's completed compaction item), in line with the run's events. It names no turn, as stage.
  boundary?: (kind: BoundaryKind) => void;
  // Claude only: the session id the person's /clear moved the run to (system/init after conversation_reset).
  sessionChanged?: (sessionId: string) => void;
  // ACP only: each available_commands_update the server pushed for the run's session, whenever it came.
  acpCommands?: (update: unknown) => void;
  // Doan-account Claude and Codex runs only: after a turn ends done, or failed on the usage limit (limit), with a usage
  // read on this run's connection. A Claude run keeps its input open until it resolves (usageService.ts withTurnUsage).
  usageAtTurnEnd?: (read: () => Promise<unknown>, limit?: true) => Promise<void>;
  // Doan-account Cursor runs only: whether a usage window is used up. Cursor saves no session for a plan-limited first
  // turn, so the runner asks when session/load answers "not found" (acpRunner.ts).
  limitReached?: () => Promise<boolean>;
  // Claude runs only: the cleaned text of the first prompt suggestion after a done turn (runners.ts openClaude).
  suggested?: (text: string) => void;
  // Claude runs only: whether background work the done turn started still runs (runners.ts backgroundTasks).
  backgroundChanged?: (running: boolean) => void;
  // Doan-account runs only: the run's lease stops (true) or starts again (false) counting as a running conversation.
  quiet?: (on: boolean) => void;
  // The turn's stage after a frame, called right after that frame's events. It names no turn:
  // a reused Codex server keeps the callback it opened with, and the service takes the live turn of that moment.
  stage?: (stage: TurnStage) => void;
  // Doan-account conversation runs and list reads (not Codex's): what keeps the run out of the rest of userData
  // (agentAuth/fence.ts). denied: Codex profile entries. exec: for tests. socket: a Codex profile allows its directory.
  fence?: { paths: FencePaths; denied?: FenceEntry[]; socket?: string; exec?: string };
}
// generation: the provider's connector generation now. labels: connector names by doan- name, for permission
// summaries and activity lines.
export interface McpRun { generation(): number; labels(): Readonly<Record<string, string>> }
// A start's attachments, checked again right before acceptance (recheck throws attachment_missing with the missing
// ids) and marked sent just before the commit.
export interface StartAttachments { recheck(): AttachmentRecord[]; sent(): void }
// One send's model, effort and mode: a reused Codex server needs them on the turn, and a send always names its mode (a
// Codex override holds). reloadMcp: reload changed MCP servers first. fast: absent, a doan Codex turn states standard.
export interface TurnChoice { model?: string; effort?: string; fast?: true; permissionMode?: PermissionModeId; reloadMcp?: true }
// What a send may carry besides its text, each judged apart: a choice, a permission mode, Fast, rechecked attachments.
// defaultEffort (models.ts ModelOption) and fastTurn (ipc's judgement) are never stored.
export interface SendExtras extends Omit<TurnChoice, "fast"> { fast?: boolean; attachments?: AttachmentRecord[]; defaultEffort?: string; fastTurn?: true }
function askingKey(event: { type: string; requestId: string }): string { return `${event.type.startsWith("question.") ? "question" : "permission"}:${event.requestId}`; }
// steer (Claude, Codex): resolves once the provider accepted it, before the agent reads it. endAfterTurn (Claude): ends a
// finished turn's process for the next send. mechanism: a fenced Codex server's (agentAuth/fence.ts codexRestart).
export interface Runner { mechanism?: FenceMechanism; sessionId: string; send(prompt: string, turnId: string, attachments?: readonly AttachmentRecord[], choice?: TurnChoice): Promise<void>; answer(requestId: string, optionId: string): boolean; answerQuestion?(requestId: string, answer: QuestionAnswerInput): "ok" | "stale" | "bad_request"; stop(): Promise<void>; close(): Promise<void>; models?(): Promise<ModelList>; skills?(): Promise<SkillSummary[]>; steer?(prompt: string, turnId: string, messageId: string): Promise<void>; endAfterTurn?(): AfterTurnCleanup }
// A queued attachment's id with the record it was queued as (item.attachments and ids are in the same order).
type Held = { id: string; record: AttachmentRecord | undefined };
export type TakenDraft = ReturnedDraft & { ids?: (string | null)[] };
// A scheduled conversation's waiting message (conversation `scheduled`), as the renderer shows a queued row. turnId: the
// failed turn whose own message this is, sent again (the renderer hides that turn's Edit and resend meanwhile).
export interface ScheduledItem { itemId: string; text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; turnId?: string }
// The queue's hold on main's attachment store: reclaim rechecks queued ids, consume after acceptance, discard with a
// removed message, release once no draft holds them; reissue: a stopped turn's files again by path, or null.
export interface QueueFiles { reclaim(ids: string[]): StartAttachments; consume(ids: string[]): void; discard?(ids: string[]): void; release?(ids: string[]): void; reissue?(records: readonly AttachmentRecord[]): string[] | null }
// The Claude session transcript a turn's unreported steers are looked for in (io.ts claudeTranscript).
export interface TranscriptReader { size(configDir: string, sessionId: string): number; read(configDir: string, sessionId: string, from: number): string | null }
// The wall clock and the timers a usage-limit schedule runs on; a timer may fire late, never early by design.
export interface ScheduleClock { now(): number; setTimer(run: () => void, ms: number): unknown; clearTimer(timer: unknown): void }
// defaultEffort, fast: for the turns ipc does not judge (a start, a handoff's start, a queue flush). limitWindows: usage
// after a limit-stopped turn; without it nothing is scheduled. resumed: Mac wake. notice: a deferred turn.failed notice.
export interface QueueOptions { transcripts?: TranscriptReader; drafts?: DraftStore; files?: QueueFiles; defaultEffort?: (root: string, provider: Provider, model: string) => string | undefined; fast?: (root: string, provider: Provider, model: string | undefined) => boolean;
  limitWindows?: (provider: Provider, connectionId: string) => Promise<readonly UsageWindow[]>; clock?: ScheduleClock; resumed?: (listener: () => void) => void; notice?: (event: ConversationEvent) => void }
export type OpenRunner = (input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<Runner>;
// use "listing": a list read (models, project skills), which a sign-out stops without asking (agentAuth/manager.ts acquire).
// reusing: a send to this conversation's live Codex server, which keeps its thread open between turns.
export type Prepare = (request: StartRequest, stored?: ConversationMetadata, use?: "run" | "listing", reusing?: boolean) => Promise<Prepared>;
// Reads a list (models, project skills) through a provider process opened only for that, reporting its spawn and
// disappearance as OpenRunner does; it never releases the lease itself.
export type ReadListing<T> = (input: Prepared, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<T>;
export type ReadModels = ReadListing<ModelList>;
// A start's composer: Home's for its root, or a canvas's (by path, which a start pressed during the quit names before
// any listing resolves its id).
function startComposer(request: { root: string; canvas?: Canvas }): string { return `start\0${request.root}\0${request.canvas?.path ?? ""}`; }
// An open that failed before its spawn callback registered a stop (openRunner) left no process whose exit would release
// the session. One whose spawn failure already reported exited() was released there; a later send may hold it now.
function unspawned(live: Live): boolean { return !live.runner && !live.cleanup && !live.exited; }
function freeLease(input: Prepared | undefined): void {
  void input?.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// ARCHITECTURE §7 'Send after a finished turn'.
const EXIT_WAIT_MS = 10_000;
// How long a Claude turn's end waits for its group to go before its unreported steers are looked for in the transcript;
// past it they go back to the queue without the lookup.
const HELD_END_MS = 2_000;
const TRANSCRIPTS: TranscriptReader = { size: transcriptSize, read: readTranscriptFrom };
// setTimeout fires at once past this delay; a longer schedule is armed again when its timer fires early.
const MAX_TIMER_MS = 2 ** 31 - 1;
const CLOCK: ScheduleClock = {
  now: () => Date.now(),
  setTimer: (run, ms) => { const timer = setTimeout(run, Math.min(ms, MAX_TIMER_MS)); timer.unref(); return timer; },
  clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
// A scheduled send (usage limit): its queued messages go out together at `at`, after the reset, on the connection it was
// scheduled for. retried: it goes once more for a reset that already stopped it. due: its time came while working.
interface Schedule { at: number; reset: number; provider: Provider; connectionId: string; retried: boolean; timer?: unknown; due?: true }
// holding: one object per hold, so a late flush never frees a later turn's. asking: by kind and id, so one kind never
// settles the other. closed: never reused. held: the end waits for the group; unheld: being written, not held again.
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean; provider?: Provider; since: number; endedAt?: number; closed?: boolean; holding?: object; mcpGeneration?: number | undefined; asking?: Set<string>; done?: boolean; handoffKey?: string; lastSeq?: number; stage?: StageSignal; stageRev?: number; pastedStore?: string;
  exitedAt?: number; cleaned?: boolean; background?: { turnId: string; stopping?: true }; stopping?: true; quiet?: (on: boolean) => void;
  transcript?: { configDir: string; sessionId: string; size?: number }; held?: { event: EventPayload; timer: ReturnType<typeof setTimeout> };
  lookup?: { steers: { messageId: string; itemId: string }[]; timer: ReturnType<typeof setTimeout>; giveBack: boolean }; unheld?: true;
  // A turn the usage limit stopped: its connection's usage is being read to learn the reset. Working until then, so its
  // queue stays and no send goes first.
  limitLookup?: LimitLookup;
  // The accepted turn's conversation for liveTurns, so `doan work` replies read no index inside the CLI's 2 s deadline.
  // refreshCanvas updates it too, since a running turn keeps this entry across a send refused as busy.
  turnOf?: TurnOf;
  // A start's root and canvas until acceptance, when the conversation joins the index (startingCanvases, pendingRoots).
  starting?: { root: string; canvas?: Canvas };
  // A Stop came while this send was prepared, before acceptance: the send is refused at its next check and never runs.
  cancelled?: true;
  // A project removal can be retried before the interrupted runner's process group reports its exit.
  removalStop?: { turnId: string; root: string; interrupt?: "pending" | "done" | "failed"; close?: "pending" | "done" | "failed" };
  // The accepted turn's provider command (providerCommands.ts commandName), absent for a message.
  command?: string;
  // The permission mode a Codex turn of a Doan connection stated on its thread (turn/start), absent for a command turn,
  // which states none (noteMode).
  statedMode?: PermissionModeId;
  // The session a Claude run moved to during this turn (Prepared.sessionChanged), with the run's profile; judged at the
  // turn's done end (followSession).
  movedTo?: { sessionId: string; configDir: string } }
interface TurnOf { root: string; provider: Provider; canvas?: Canvas }
function turnOf(m: ConversationMetadata): TurnOf {
  return { root: m.root, provider: m.owner.kind === "doan" ? m.owner.provider : m.session.runtime, ...(m.canvas ? { canvas: m.canvas } : {}) };
}
// The usage read after a limit-stopped turn (limitEnded), ended by a Stop, a provider stop, a sign-out or a deletion
// (cancelLimit). since: the stops count when it began. told: its deferred failure notice was delivered.
interface LimitLookup { turnId: string; provider: Provider; connectionId: string; since: number; saved: Extract<ConversationEvent, { type: "turn.failed" }>; told: boolean }
// A Doan-connected conversation's current turn for handoffs, in memory only. state: judging after a done end until a
// canvas may be listed, starting while decided ones start, resolved once all are written. source: the origin canvas.
interface HandoffTurn { root: string; turnId: string; snapshot: Canvas[]; startedBy?: "handoff"; requests: HandoffRequest[]; guided: boolean; edits: Set<string>; source?: Canvas; state?: "judging" | "starting" | "resolved"; endedAt?: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout>; waiters: (() => void)[] }
// taken while its turn runs, judging once the turn ended done, starting once every request of the turn is decided,
// resolved once its handoff.resolved is written (or would be, after a quit). decision: its judgement, other than wait.
interface HandoffRequest { path: string; text: string; state: "taken" | "judging" | "starting" | "resolved"; decision?: HandoffDecision; resolution?: HandoffResolution }
// A guided turn that ended done, waiting for the handoff's deadline to write its missed lines. Kept apart from the
// HandoffTurn, which the next send replaces: it holds neither the queue nor the working state, and outlives that send.
interface MissedWait { id: string; root: string; snapshot: Canvas[]; edits: string[]; requested: string[]; endedAt: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout> }
// Any accepted turn's watch for the new canvases it draws. snapshot: the listed canvases at acceptance, never the canvas
// metadata a refused send may change (POSTMORTEM 2026-11-15). Apart from the live entry; lasts to the settle deadline.
interface DrawWatch { id: string; root: string; snapshot: Canvas[]; edits: string[]; announced: Canvas[]; endedAt?: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout> }
// A model-list read: stopped by quit and by a stop of its provider like a run, holding its lease until its group is gone.
interface Listing { provider: Provider; since: number; cleanup?: () => Promise<void> }
// A queued message Send now put into a running turn that the agent has not read yet; its item stays marked sending until
// answered. answered: the request has its answer (a refusal), though the provider may still have taken it.
interface Steer { id: string; itemId: string; live: Live; turnId: string; message: EventPayload; ids: string[]; attached?: StartAttachments; answered: boolean; resolve(): void; reject(error: Error): void }
export class ConversationService {
  private listings = new Set<Listing>();
  private listingOf = new WeakMap<Prepared, Listing>();
  private reservations: Reservation[] = [];
  private live = new Map<string, Live>();
  private quitting = false;
  // After an aborted quit the service stays quitting and the busy refusal invites another press: each composer holds only
  // its last message under one key, not one copy per press for the next launch to return.
  private quitHolds = new Map<string, string>();
  // appQuit interruptions a quit still owes: a retryable failure cancels that quit and is retried by the next. A refusal no
  // retry fixes, or a second failure, is not owed again, or every later quit (update, logout) would be cancelled.
  private owedAppQuit = new Map<string, { turnId: string; failed: boolean }>();
  private stops = 0;
  private lastStop = new Map<Provider, number>();
  // Sends waiting for the previous turn's process to exit; cancelled ones are refused once woken.
  private waits = new Map<string, { wake(): void; cancelled: boolean; provider?: Provider }>();
  // The attachment ids of each queued message, for its send; they mean nothing after a restart (the queue then comes
  // back as a draft), so they stay here.
  private queuedExtras = new Map<string, { owner: string; ids: string[]; records: readonly AttachmentRecord[] }>();
  // The ids a returned draft's files were queued with, until the draft is taken in this run: the renderer checks them
  // again as those files, so a folder replaced since is refused as replaced, not accepted as a new one.
  private returnedHeld = new Map<string, Held[]>();
  // Sends waiting for their conversation's previous turn's handoffs to be resolved (handoffWait).
  // A Stop or a sign-out of its provider refuses such a send as busy, as it refuses one waiting for the previous process.
  private judging = new Map<string, { wake(): void; cancelled: boolean; provider?: Provider }>();
  private drafts: DraftStore;
  // By messageId, until the agent reads it or its turn ends; a refused one stays, since its read may still come.
  private steers = new Map<string, Steer>();
  // Claude's suggestion for each conversation's next message, in memory only, until the next turn is accepted, the
  // conversation is deleted, or its connection signs out or changes. connectionId: none for a legacy external run.
  private suggestions = new Map<string, { text: string; root: string; provider?: Provider; connectionId?: string }>();
  // Each provider's connection as auth last reported it (connectionChanged; undefined: signed out). A run on another
  // connection may still send its suggestion after the change, and must not bring it back.
  private connections = new Map<Provider, string | undefined>();
  // DOAN_HANDOFF value → conversation, for each runner process still alive; never on disk.
  private handoffKeys = new Map<string, string>();
  private handoffTurns = new Map<string, HandoffTurn>();
  // By the guided turn's id: a conversation's next turn may end before the earlier one's wait is over.
  private missedWaits = new Map<string, MissedWait>();
  // By the drawing turn's id, for the same reason.
  private drawWatches = new Map<string, DrawWatch>();
  // Each Doan connection's usage limit, in memory only (usageLimit.ts limitState); limitTimer drops a passed one.
  private limits = new Map<string, LimitEntry>();
  private limitTimer: unknown;
  private schedules = new Map<string, Schedule>();
  // A scheduled send on its way out, until its turn ends: the reset it went for, for a stop by the same limit.
  private resent = new Map<string, { reset: number; retried: boolean }>();
  private waking = false;
  private clock: ScheduleClock;
  // This run's command turns by conversation and turn, with the boundary their provider reported (null while none came);
  // memory only, as the boundary's evidence is (commandTurns.ts).
  private commandRuns = new Map<string, Map<string, BoundaryKind | null>>();
  // Each ACP conversation's last command list, as its connection pushed it (Prepared.acpCommands), with every name the
  // server reported; memory only.
  private acpLists = new Map<string, AcpCommandList & { provider: Provider; reported: string[] }>();
  // The mode each Doan Codex thread was last told on a turn that ended done in this run: Codex keeps it and review/start
  // states none (checkReview). Memory only, since the record does not say which mode a turn stated.
  private statedModes = new Map<string, PermissionModeId>();
  // A queued message that is a failed turn's own message sent again, by itemId, until it leaves the queue (forget).
  private repeats = new Map<string, { owner: string; turnId: string }>();
  // workEnded: the turn can take no more `doan work update`, so main drops its work. staged, boundaryChanged: routed like
  // events, never written to the history. publish's deferNotice: held until main knows the turn was not scheduled again.
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent, deferNotice?: true) => void, private admit: (root: string, canvas?: Canvas) => Canvas | void = () => {}, private exitWaitMs = EXIT_WAIT_MS, private canvases: (root: string) => readonly Canvas[] = () => [], private listChanged: (root: string) => void = () => {}, private queueOptions: QueueOptions = {}, private deleted: (id: string) => void = () => {}, private workEnded: (id: string) => void = () => {}, private handedOff: (notice: ConversationHandoffNotice) => void = () => {}, private staged: (signal: StageSignal) => void = () => {}, private boundaryChanged: (signal: BoundarySignal) => void = () => {}) {
    this.drafts = queueOptions.drafts ?? new DraftStore(null);
    this.clock = queueOptions.clock ?? CLOCK;
    queueOptions.resumed?.(() => this.resumed());
    // The deletions an earlier run recorded finish here, their drafts included (store.ts finishDeletions).
    store.finishDeletions(id => this.drafts.discard(id));
  }
  private quitHold(composer: string): string {
    const key = this.quitHolds.get(composer) ?? randomUUID();
    this.quitHolds.set(composer, key);
    return key;
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
  async start(request: StartRequest, attached?: StartAttachments, handoff?: HandoffStart): Promise<{ conversationId: string }> {
    // No composer outlives the quit, so the message is kept for the next start as one held below would be.
    if (this.quitting) {
      if (!handoff) this.drafts.hold(this.quitHold(startComposer(request)), { root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), text: request.text, anchors: request.anchors, attachments: request.attachments ?? [] });
      throw new Error("busy");
    }
    const admitted = this.admit(request.root, request.canvas);
    if (admitted) request = { ...request, canvas: admitted };
    // A new conversation never waits for a usage limit: it is refused while its connection's limit holds.
    if (request.mode !== "resume" && request.runtime) {
      const connectionId = this.connections.get(request.runtime), limit = connectionId === undefined ? undefined : this.limits.get(connectionId);
      if (limit && sendDecision({ provider: request.runtime, owner: "doan", start: true, limit: limit.resetsAt, working: false, scheduled: false, now: this.clock.now() }) === "refuse")
        throw Object.assign(new Error("rate_limited"), { resetsAt: new Date(limit.resetsAt).toISOString() });
    }
    // A new conversation's thread was told no mode yet, so its /review is refused before anything opens.
    if (request.runtime && !handoff) { checkCommand(request.runtime, request.text, request.anchors, request.attachments?.length || attached ? 1 : 0, !!commandName(request.runtime, request.text)); checkReview(request.runtime, request.text, true, undefined, undefined); }
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops,
      starting: { root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}) } }; this.live.set(id, live);
    // The composer let the message go: until acceptance only drafts.json has it, so a quit returns it after the restart.
    // A handoff's message is the agent's, which a refused handoff reports instead.
    if (!handoff) this.drafts.hold(id, { root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), text: request.text, anchors: request.anchors, attachments: request.attachments ?? [] });
    // Restart to Update is asked again on a list change, and this start now holds it (restartHolds).
    this.changed(request.root);
    let opening = false, input: Prepared | undefined;
    const turnId = live.turnId;
    try {
      const prepared = await this.prepare(request);
      input = { ...prepared, ...choice(request), ...(request.model && !request.effort && request.defaultEffort ? { effort: request.defaultEffort } : {}), ...this.runFast(request.fast === true, request.root, prepared, request.model), ...mode(request.permissionMode), modeReported: (report, turnInit, previous) => this.modeReported(id, live, turnId, request.permissionMode ?? "default", report, turnInit, previous), steerConsumed: messageId => this.steerConsumed(id, messageId), suggested: text => this.suggested(id, live, turnId, text), stage: stage => this.stage(id, live, stage), backgroundChanged: running => this.backgroundChanged(id, live, turnId, running), ...this.commandHooks(id, live, turnId, prepared) };
      const command = handoff ? null : commandName(input.runtime, request.text);
      if (!handoff) { checkCommand(input.runtime, request.text, request.anchors, request.attachments?.length || attached ? 1 : 0, !!command); checkReview(input.runtime, request.text, !!input.owner, undefined, undefined); }
      if (input.owner) live.provider = input.owner.provider;
      if (input.quiet) live.quiet = input.quiet;
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while the runner opens
      if (this.quitting) throw new Error("busy");
      if (request.mode === "resume") this.checkSessionFree(input.runtime, input.configDir, input.sessionId);
      // A handoff cancelled while this was prepared opens no runner and holds no lease (POSTMORTEM 2026-10-27).
      if (handoff) this.checkHandoffSource(handoff.origin.conversationId, handoff.turnId, handoff.path);
      if (input.sessionId) this.promote(id, input, input.sessionId);
      opening = true;
      live.mcpGeneration = input.mcp?.generation();
      const runner = await this.openRunner(id, live, input); live.runner = runner;
      if (live.exited) throw new Error("process_exited");
      input.recheck?.();
      if (!input.sessionId) this.promote(id, input, runner.sessionId);
      if (input.sessionId && input.sessionId !== runner.sessionId) throw new Error("session_unavailable");
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while the runner opens
      if (this.quitting) throw new Error("busy");
      const currentCanvas = this.admit(request.root, request.canvas);
      if (currentCanvas) request = { ...request, canvas: currentCanvas };
      const session = { runtime: input.runtime, origin: request.mode === "resume" ? "resumed" as const : request.mode, sessionId: runner.sessionId, configDir: input.configDir, cwd: input.cwd };
      // Every turn of a newDesign conversation carries Home's paragraph.
      const fromHome = request.mode === "newDesign";
      const titleText = handoff ? (handoff.handoffText.split("\n", 1)[0] ?? "").trimEnd() : requestTitleText(request.text);
      // seenSeq 0 makes the first turn's end unseen. A command defers the title to the next ordinary message.
      const base = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: command ? "" : messageLine(titleText, request.anchors),
        ...choice(request), ...fastOf(request), ...mode(request.permissionMode), ...(fromHome ? { fromHome: true as const } : {}), seenSeq: 0 };
      const runtime = input.runtime;
      // Without an owner the run used an external profile, which exists only for the shared sessions' two runtimes.
      if (!input.owner && runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
      const metadata: ConversationMetadata = input.owner ? { ...base, owner: input.owner, session }
        : { ...base, owner: { kind: "legacy-external" }, session: { ...session, runtime: runtime === "claude" ? "claude" : "codex" } };
      // The canvas's other conversations stay as they are and keep running: a start only adds one beside them.
      const entries = this.store.list();
      if (request.mode === "resume") this.checkSessionFree(input.runtime, input.configDir, runner.sessionId);
      // A handoff cancelled meanwhile does not start (POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
      if (handoff) this.checkHandoffSource(handoff.origin.conversationId, handoff.turnId, handoff.path);
      // The files may have moved while the runner was prepared and opened; the prompt and history use this check.
      const attachments = attached ? attached.recheck() : request.attachments ?? [];
      const guided = !handoff && handoffGuidanceFor(metadata, mode(request.permissionMode));
      // A command goes out as its own text: the provider runs it only as the whole message.
      const prompt = handoff ? handoffPrompt(handoff.handoffText, metadata, handoff.origin.canvas) : command ? request.text
        : turnPrompt(request.anchors, request.text, metadata, { home: fromHome, attachments, handoff: guided });
      if (prompt === null) throw new Error("bad_request");
      const writes: JournalWrite[] = [{ id, turn: live.turnId, body: { type: "user.message", text: request.text, anchors: request.anchors, ...(attachments.length ? { attachments } : {}), ...(handoff ? { origin: handoff.origin } : {}) } }, { id, turn: live.turnId, body: { type: "turn.started" } }];
      attached?.sent();
      const saved = this.store.acceptStart([...entries, metadata], id, writes);
      this.drafts.release(id);
      live.accepted = true; live.turnOf = turnOf(metadata); delete live.starting; this.noteTranscript(live, input, runner.sessionId); this.noteCommand(id, live, command);
      this.noteMode(live, input.runtime, !!input.owner, command, input.permissionMode ?? "default");
      if (metadata.owner.kind === "doan") this.handoffTurns.set(id, { root: request.root, turnId: live.turnId, snapshot: this.snapshot(request.root), requests: [], guided, edits: new Set(), waiters: [], ...(handoff ? { startedBy: "handoff" as const } : {}) });
      this.watchDrawn(id, live.turnId, request.root);
      for (const event of saved) this.deliver(event);
      this.changed(request.root);
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A terminal event that came before acceptance (the process gone) already ended the turn: nothing is sent.
      if (!live.terminal) this.sendTurn(id, live, runner, prompt, attachments.length ? attachments : undefined);
      return { conversationId: id };
    } catch (error) {
      // Its composer keeps the message; one refused by the quit is kept for the next start, since no composer outlives
      // the quit. Not running any more, though its process may take a while to go: Restart to Update need not wait for it.
      live.busy = false;
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while the turn runs
      if (!this.quitting) this.drafts.release(id);
      else if (!handoff && !this.quitHolds.has(startComposer(request))) this.quitHolds.set(startComposer(request), id);
      this.changed(request.root);
      if (!opening || unspawned(live)) { this.reservations = releaseReservation(this.reservations, id, "not_spawned"); this.live.delete(id); freeLease(input); }
      else { void live.runner?.close(); }
      throw error instanceof Error && error.message === "outside_root" ? new Error("session_unavailable") : error;
    }
  }
  // extras: a model (with its effort) replaces the stored choice from this turn on; attached rechecks the attachments
  // before acceptance. Other conversations of the canvas are untouched; a queue about to go out keeps its place.
  send(id: string, text: string, anchors: Anchor[], extras: SendExtras = {}, attached?: StartAttachments): Promise<void> {
    if (this.live.get(id)?.holding) return Promise.reject(new Error("busy"));
    // Held from here, through the waits before the turn, until accepted or refused, as a start's message is (start).
    const held = this.quitting ? this.quitHold(`send\0${id}`) : randomUUID();
    this.drafts.hold(held, { conversationId: id, text, anchors, attachments: extras.attachments ?? [] });
    return this.submit(id, text, anchors, extras, attached, held).catch((error: unknown) => {
      if (!this.quitting) this.drafts.release(held);
      else if (!this.quitHolds.has(`send\0${id}`)) this.quitHolds.set(`send\0${id}`, held);
      throw error;
    });
  }
  private async submit(id: string, text: string, anchors: Anchor[], extras: SendExtras, attached?: StartAttachments, held?: string): Promise<void> {
    // Only a send that waits yields here; any other runs up to its reservation in the caller's tick. The finished turn's
    // process is ended first, or its suggestion or background work would hold the group and a handoff's judgement.
    this.endAfterTurn(id);
    const judged = this.handoffWait(id); if (judged) await judged;
    this.switchCodexServer(id, extras);
    const exiting = this.previousExit(id); if (exiting) await exiting;
    let metadata = this.metadata(id); if (this.quitting) throw new Error("busy");
    metadata = this.refreshCanvas(metadata);
    const runtime = metadata.session.runtime;
    // command: one of the provider's table, which the thread draws; asIs: also an ACP server's unconfirmed one. Either
    // goes out as its own text.
    const command = commandName(runtime, text), asIsName = command ?? passthroughName(text, this.passthroughOf(id, runtime)), asIs = !!asIsName;
    checkCommand(runtime, text, anchors, extras.attachments?.length || attached ? 1 : 0, asIs);
    checkReview(runtime, text, metadata.owner.kind === "doan", this.statedModes.get(id), (extras.permissionMode !== undefined ? extras.permissionMode : metadata.permissionMode) ?? "default");
    // A history that stopped taking writes is left behind once its process is gone (releaseFailed): the send starts a
    // new turn on a new entry, and is refused like any first write when the history still takes none.
    const existing = this.live.get(id); if (existing?.busy || (existing?.failedPersistence && !existing.exited)) throw new Error("busy");
    // A closed runner is closing; previousExit waited for its process, so a new one opens.
    const live: Live = (existing?.runner && !existing.closed ? existing : undefined) ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: 0 };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; delete live.closed; delete live.stage; live.turnId = randomUUID(); live.since = this.stops; this.live.set(id, live);
    delete live.exitedAt; delete live.cleaned; delete live.background; delete live.stopping; delete live.transcript; delete live.unheld; delete live.cancelled;
    this.changedOf(id);
    // The mode is judged apart from the model: a send may change either alone.
    const chosen = { ...extras.model ? choice(extras) : choice(metadata), ...mode(extras.permissionMode !== undefined ? extras.permissionMode : metadata.permissionMode) };
    const admittedMode = metadata.permissionMode;
    let reserved = false, opening = false, input: Prepared | undefined, leased = false;
    try {
      const reusing = runtime === "codex" && !!live.runner;
      this.reserve(id, { ...metadata.session, runtime, command: "", env: {} }, reusing); reserved = true;
      const turnId = live.turnId;
      // steerConsumed names no turn: a reused Codex server keeps the callback it opened with.
      const prepared = await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors, ...(extras.attachments?.length ? { attachments: extras.attachments } : {}) }, metadata, undefined, reusing);
      input = { ...prepared, ...chosen, ...(extras.fastTurn ? { fast: true as const } : {}), modeReported: (report, turnInit, previous) => this.modeReported(id, live, turnId, chosen.permissionMode ?? "default", report, turnInit, previous), steerConsumed: messageId => this.steerConsumed(id, messageId), suggested: text => this.suggested(id, live, turnId, text), stage: stage => this.stage(id, live, stage), backgroundChanged: running => this.backgroundChanged(id, live, turnId, running), ...this.commandHooks(id, live, turnId, prepared) };
      if (input.owner) live.provider = input.owner.provider;
      if (input.quiet) live.quiet = input.quiet; else delete live.quiet;
      this.checkSend(id, live);
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a runner exit can set this while the send awaits
      if (live.exited) throw new Error("process_exited");
      if (!live.runner) { opening = true; leased = true; live.mcpGeneration = input.mcp?.generation(); live.runner = await this.openRunner(id, live, input); }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a runner exit can set this while the runner opens
      if (live.exited) throw new Error("process_exited");
      if (live.runner.sessionId !== metadata.session.sessionId) throw new Error("session_unavailable");
      this.checkSend(id, live);
      input.recheck?.();
      metadata = this.refreshCanvas(this.metadata(id));
      // The same account signed in again under a new connection; judgeConnection already proved account, profile and session.
      const owner = input.owner;
      const rebound = !!owner && metadata.owner.kind === "doan" && metadata.owner.connectionId !== owner.connectionId;
      if (owner && rebound) metadata = { ...metadata, owner, session: metadata.session };
      // The files may have moved while the runner was prepared and opened; the prompt and history use this check.
      const attachments = attached ? attached.recheck() : extras.attachments ?? [];
      // Home's paragraph only while the conversation has no canvas: one an earlier build promoted works on its canvas.
      const guided = handoffGuidanceFor(metadata, chosen);
      const prompt = asIs ? text : turnPrompt(anchors, text, metadata, { home: metadata.fromHome === true && !metadata.canvas, attachments, handoff: guided }); if (prompt === null) throw new Error("bad_request");
      // The choice is written before the turn's events: a failed append then leaves only a saved choice.
      // An entry without seenSeq has had all of its history seen; from now on its ends count.
      const seenSeq = metadata.seenSeq ?? this.store.read(id).at(-1)?.seq ?? 0;
      const { model: _model, effort: _effort, fast: _fast, permissionMode: _mode, ...rest } = metadata;
      // A picker change stored while this send was prepared is the later pick, so it stays for the next turn.
      const stored = metadata.permissionMode !== admittedMode ? mode(metadata.permissionMode) : mode(chosen.permissionMode);
      const fast = fastOf(extras.fast !== undefined ? extras : metadata);
      // A conversation a command started is named by its first message that is not one.
      const title = !asIs && !metadata.title ? messageLine(requestTitleText(text), anchors) : metadata.title;
      const updated: ConversationMetadata = { ...rest, title, ...choice(chosen), ...fast, ...stored, seenSeq };
      const message: EventPayload = { type: "user.message", text, anchors, ...(attachments.length ? { attachments } : {}) };
      attached?.sent();
      if (rebound || title !== metadata.title || chosen.model !== metadata.model || chosen.effort !== metadata.effort || fast.fast !== metadata.fast || stored.permissionMode !== metadata.permissionMode || seenSeq !== metadata.seenSeq)
        this.store.save(this.store.list().map(m => m.conversationId === id ? updated : m));
      // One write: a turn.started refused by validation, the size limit or a failed open or read must not leave the
      // message, which would read as a turn that runs. A short write is not rolled back (no journal here).
      for (const event of this.store.appendAll(id, live.turnId, [message, { type: "turn.started" }])) this.deliver(event);
      if (held) this.drafts.release(held);
      this.changedOf(id); live.accepted = true; live.turnOf = turnOf(updated); this.suggestions.delete(id); this.noteTranscript(live, input, live.runner.sessionId); this.noteCommand(id, live, command, asIsName);
      this.noteMode(live, runtime, metadata.owner.kind === "doan", command, chosen.permissionMode ?? "default");
      // The previous turn's handoff was resolved before this send went on (handoffWait).
      if (metadata.owner.kind === "doan") this.handoffTurns.set(id, { root: metadata.root, turnId: live.turnId, snapshot: this.snapshot(metadata.root), requests: [], guided, edits: new Set(), waiters: [] });
      this.watchDrawn(id, live.turnId, metadata.root);
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A reused Codex server keeps the lease it opened with; this preparation's lease covered only the checks.
      if (!leased) freeLease(input);
      // A new server read the profile as it opened; only a reused one may hold servers from before a change.
      const generation = input.mcp?.generation();
      const reloadMcp = !opening && generation !== undefined && generation !== live.mcpGeneration;
      if (reloadMcp) live.mcpGeneration = generation;
      const turnChoice: TurnChoice = { ...chosen, permissionMode: chosen.permissionMode ?? "default", ...(!chosen.effort && extras.defaultEffort ? { effort: extras.defaultEffort } : {}), ...(extras.fastTurn ? { fast: true as const } : {}), ...(reloadMcp ? { reloadMcp: true as const } : {}) };
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a runner event can end the turn while the send awaits
      if (!live.terminal) this.sendTurn(id, live, live.runner, prompt, attachments.length ? attachments : undefined, turnChoice);
    } catch (error) {
      live.busy = false;
      if (reserved && (opening ? unspawned(live) : !live.runner)) this.reservations = releaseReservation(this.reservations, id, "not_spawned");
      if (!leased) freeLease(input);
      // Messages queued behind a send that never ran have nothing left to follow; a queue's own send hands them back.
      // A send the person stopped hands them back as stopped.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while the send awaits
      if (!this.working(id)) this.giveBack(id, live.cancelled ? "interrupted" : reason(error));
      this.changedOf(id);
      // Closed, as switchCodexServer does: the next send waits for its exit instead of reusing it.
      if (opening && !this.closeRemovalRunner(live)) { live.closed = true; void live.runner?.close(); }
      throw error;
    }
  }
  // A Codex server's fence holds only its mechanism's modes (Full access in the outer sandbox-exec, the rest on Doan's
  // profiles), so a send needing the other closes the idle server, waits for it and opens a new one on the thread.
  private switchCodexServer(id: string, extras: SendExtras): void {
    const live = this.live.get(id), metadata = this.store.list().find(m => m.conversationId === id);
    if (!live?.runner || live.busy || live.closed || metadata?.session.runtime !== "codex") return;
    const next = extras.permissionMode !== undefined ? extras.permissionMode : metadata.permissionMode;
    if (!codexRestart(live.runner.mechanism, next ?? "default")) return;
    live.closed = true; void live.runner.close();
  }
  // A finished turn's process may still be exiting, and its reservation keeps a second process off the session until
  // its group is gone. The send waits for that instead of refusing; every check in send runs again afterwards.
  private previousExit(id: string): Promise<void> | undefined {
    const live = this.live.get(id), metadata = this.store.list().find(m => m.conversationId === id);
    // A turn whose history stopped taking writes is still busy while its closed run's group exits; the send waits for it.
    if (!metadata || (live?.busy && !live.failedPersistence) || this.quitting || !this.reservations.some(r => r.owner === id)) return;
    // A Codex server is reused between turns; a closed one, or one closed because its history stopped taking writes, is
    // closing.
    if (metadata.session.runtime === "codex" && live?.runner && !live.closed && !live.failedPersistence) return;
    if (this.waits.has(id)) throw new Error("busy");
    // A finished Claude turn's process may go on past this wait with its suggestion or background work, so the runner ends
    // it (endAfterTurn); the reservation is still released only once the group is gone (POSTMORTEM 2026-10-28).
    this.endAfterTurn(id);
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
  // A send of a conversation whose turn asked for a handoff waits until it is resolved: the person's queued messages
  // keep their place, and the send then goes to this conversation as any other.
  private handoffWait(id: string): Promise<void> | undefined {
    const turn = this.handoffTurns.get(id);
    return turn && this.handoffPending(turn) ? this.awaitJudged(id, turn.waiters) : undefined;
  }
  // A Stop or a sign-out of its provider refuses the waiting send as busy (cancelWait).
  private awaitJudged(id: string, waiters: (() => void)[]): Promise<void> {
    if (this.judging.has(id)) throw new Error("busy");
    const provider = this.live.get(id)?.provider;
    return new Promise<void>(resolve => {
      const entry = { wake: resolve, cancelled: false, ...(provider ? { provider } : {}) };
      this.judging.set(id, entry); this.changedOf(id);
      waiters.push(resolve);
    }).then(() => {
      const entry = this.judging.get(id); this.judging.delete(id); this.changedOf(id);
      if (entry?.cancelled) throw new Error("busy");
    });
  }
  private cancelWait(id: string): void {
    const wait = this.waits.get(id); if (wait) { wait.cancelled = true; wait.wake(); }
    const judging = this.judging.get(id); if (judging) { judging.cancelled = true; judging.wake(); }
  }
  // A start's Fast for its run (Prepared.fast): chosen, a doan run, and this run's list says the model takes it now.
  private runFast(on: boolean, root: string, input: Prepared, model: string | undefined): { fast?: true } {
    return on && input.owner && this.queueOptions.fast?.(root, input.runtime, model) === true ? { fast: true } : {};
  }
  // The lease goes when this runner's group is gone, or at once if nothing spawned. DOAN_HANDOFF: a per-runner key that
  // only says which conversation asks (the socket token is the boundary), forgotten once the runner's process is gone.
  private async openRunner(id: string, live: Live, input: Prepared): Promise<Runner> {
    let spawned = false;
    // A fenced Claude turn opened only the pasted files it started with (Codex opens the whole store, ACP has no steer).
    if (input.runtime === "claude" && input.fence) live.pastedStore = `${input.fence.paths.userData}/attachments/`; else delete live.pastedStore;
    const key = input.owner ? randomBytes(32).toString("hex") : undefined;
    if (key) { this.handoffKeys.set(key, id); live.handoffKey = key; } else delete live.handoffKey;
    const release = () => { freeLease(input); if (key) this.handoffKeys.delete(key); };
    try {
      return await this.open({ ...input, env: { ...input.env, DOAN_CONVERSATION_ID: id, ...(key ? { DOAN_HANDOFF: key } : {}) } }, event => { if (this.live.get(id) === live) this.receive(id, event); }, () => { release(); if (this.live.get(id) === live) this.exited(id); }, stop => {
        spawned = true; live.cleanup = stop;
        if (!this.closeRemovalRunner(live) && (this.quitting || this.stopped(live))) void stop();
      });
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the spawn callback sets this while the runner opens
    } catch (error) { if (!spawned) release(); throw error; }
  }
  // A `doan handoff` request after the socket's own checks: null when it was taken and written as handoff.requested. The
  // key must be the current runner's, so a previous turn's still-exiting process asks for no turn.
  requestHandoff(request: { root: string; handoff: string; path: string; text: string }): "not_app_conversation" | HandoffRefusal | null {
    const id = this.handoffKeys.get(request.handoff); if (id === undefined) return "not_app_conversation";
    const m = this.store.list().find(e => e.conversationId === id); if (!m) return "not_app_conversation";
    const live = this.live.get(id), turn = this.handoffTurns.get(id);
    const running = !!live && !!turn && live.handoffKey === request.handoff && turn.turnId === live.turnId && live.accepted && live.busy && !live.terminal &&
      !live.closed && !live.failedPersistence && !this.quitting;
    const refused = handoffEligibility(request, { root: m.root, ...(m.canvas ? { canvas: m.canvas } : {}), ...(m.permissionMode ? { permissionMode: m.permissionMode } : {}),
      running, ...(turn?.startedBy ? { startedBy: turn.startedBy } : {}), requested: turn?.requests.map(r => r.path) ?? [] });
    if (refused) return refused;
    const text = request.text.trim(); if (!text) throw new Error("bad_request");
    this.append(id, live!.turnId, { type: "handoff.requested", canvas: { path: request.path }, text });
    turn!.requests.push({ path: request.path, text, state: "taken" });
    return null;
  }
  receive(id: string, event: EventPayload): void {
    const live = this.live.get(id); if (!live || live.failedPersistence || live.terminal) return;
    if (!live.accepted) { live.events.push(event); return; }
    try {
      // A turned-off Fast is saved before its event: a failed index write then takes this persistence-failure path with
      // no notice saying Fast went off, and a failed append leaves Fast off without one.
      if (event.type === "fast.unused" && event.turnedOff) this.turnFastOff(id);
      // The agent may have taken a steered message without reporting it, so its end waits for the group to go and the
      // transcript to be read. While an end is held, a later one (a Stop's) adds nothing.
      if (live.held && (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted")) return;
      if (event.type === "turn.done" && live.movedTo) event = this.followSession(id, live, live.movedTo);
      if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") { delete live.movedTo; this.settleMode(id, live, event.type === "turn.done"); }
      // Copilot's /compact says so only in its answer's text, the one sign over ACP.
      if (event.type === "message.done" && live.command === "compact" && live.turnOf?.provider === "copilot" && copilotCompacted(event.text)) this.boundary(id, "compacted");
      if ((event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") && this.holdsEnd(id, live)) {
        live.held = { event, timer: setTimeout(() => this.writeHeld(id, live, false), HELD_END_MS) }; live.held.timer.unref();
        return;
      }
      const saved = this.append(id, live.turnId, event);
      const handoffTurn = this.handoffTurns.get(id);
      if (event.type === "activity" && event.kind === "edit" && event.path && handoffTurn?.turnId === live.turnId) handoffTurn.edits.add(event.path);
      if (event.type === "activity" && event.kind === "edit" && event.path) this.drewAt(live.turnId, event.path);
      if (event.type === "permission.request" || event.type === "question.request") (live.asking ??= new Set()).add(askingKey(event));
      else if (event.type === "permission.resolved" || event.type === "question.resolved") live.asking?.delete(askingKey(event));
      if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") { live.terminal = true; live.busy = false; live.done = event.type === "turn.done"; live.endedAt = Date.now(); delete live.asking; delete live.stage; delete live.stopping; this.endWork(id); this.dropSteers(id); this.ended(id, live, saved); }
    } catch (error) {
      live.failedPersistence = true; delete live.stage; console.error("doan: conversation event persistence failed", error); void live.runner?.close();
      // Its end is never recorded, yet its turn/start may have told the thread its mode: the thread's mode is unknown
      // until an ordinary turn in the picker's mode ends done (checkReview).
      if (live.statedMode !== undefined) { delete live.statedMode; this.statedModes.delete(id); }
      this.endWork(id);
      this.dropSteers(id);
      // Its turn never ends, so it must not hand off.
      this.dropHandoff(id);
      this.dropDrawn(id);
      // No event says so, but the list's working and, once the process is gone, the phase change.
      this.changedOf(id);
      // A write after the process was gone (the exit's own turn.failed) leaves nothing to wait for.
      this.releaseFailed(id, live);
    }
  }
  // A history that stopped taking writes saves no terminal event; once the process is gone the turn ends as a failed turn
  // would. Reached from the exit callback too, so a hand-back that throws is only logged.
  private releaseFailed(id: string, live: Live): void {
    if (!live.failedPersistence || !live.exited) return;
    live.busy = false;
    try { this.giveBack(id, "turn_failed"); } catch (error) { console.error("doan: queued messages could not be handed back", error); }
    this.changedOf(id);
  }
  // A reason that holds on turned the turn's Fast off: the conversation's choice goes too, so later turns, a queue
  // flushed after this one included, run without it. A failed write throws to receive; the event's append announces the list.
  private turnFastOff(id: string): void {
    const entries = this.store.list(), m = entries.find(e => e.conversationId === id); if (!m?.fast) return;
    const { fast: _fast, ...rest } = m;
    this.store.save(entries.map(e => e === m ? rest : e));
  }
  // Each conversation's current turn for `doan work update` (conversationWork.ts), from acceptance to its end; a send
  // being prepared is not running, so a previous turn's late update is dropped.
  liveTurns(): ReadonlyMap<string, LiveTurn> {
    const turns = new Map<string, LiveTurn>();
    for (const [id, live] of this.live) {
      if (!live.turnOf) continue;
      turns.set(id, { ...live.turnOf, turnId: live.turnId, running: !this.quitting && live.accepted && live.busy && !live.terminal && !live.closed && !live.failedPersistence });
    }
    return turns;
  }
  // Starts main has not accepted yet on this root's canvases, which Move to Trash's busy check (canvasTrash.ts trashBusy)
  // reads beside the list, since the index names a conversation only from acceptance.
  startingCanvases(root: string): Canvas[] {
    const canvases: Canvas[] = [];
    for (const live of this.live.values()) if (this.preparing(live) && live.starting?.root === root && live.starting.canvas) canvases.push(live.starting.canvas);
    return canvases;
  }
  // The menu removes project conversations only. A first send is invisible to the index until acceptance.
  projectRemovalBusy(roots: readonly string[]): boolean {
    for (const [id, live] of this.live) {
      if (live.starting && !live.starting.canvas && roots.includes(live.starting.root) && this.preparing(live)) return true;
      if (live.removalStop && roots.includes(live.removalStop.root) && this.removalStopping(id, live)) return true;
    }
    return this.store.list().some(m => !m.canvas && roots.includes(m.root) && this.working(m.conversationId));
  }
  private removalStopping(id: string, live: Live): boolean {
    const stop = live.removalStop;
    return !!stop && stop.turnId === live.turnId && !live.exited && (stop.interrupt === "pending" || this.reservations.some(r => r.owner === id));
  }
  // A provider can register its process before its handshake yields a Runner. The removal owns one
  // close across registration, the interrupted send's unwind and any retry while that group exits.
  private closeRemovalRunner(live: Live): boolean {
    const attempt = live.removalStop;
    if (!attempt || attempt.turnId !== live.turnId) return false;
    if (attempt.close || live.exited) return true;
    const runner = live.runner;
    const close = runner ? () => runner.close() : live.cleanup;
    if (close) {
      live.closed = true;
      attempt.close = "pending";
      void Promise.resolve().then(close).then(() => { attempt.close = "done"; }, () => { attempt.close = "failed"; });
    }
    return true;
  }
  // A Stop acknowledgement may precede the native turn/start reply and the group's exit.
  // End the project target's runner so even a reusable Codex server must confirm exit before removal.
  async interruptProjectTurn(id: string, turnId: string): Promise<void> {
    const live = this.live.get(id), m = this.metadata(id);
    if (!live || !turnId || live.turnId !== turnId) throw new Error("turn_changed");
    // Only a project conversation's turn: a canvas conversation (an earlier build's promoted one included) is not removed.
    if (m.canvas) throw new Error("turn_changed");
    if (!this.working(id) && !this.removalStopping(id, live)) return;
    // A handoff waiting for its judgement or its start would start a conversation in the root being removed: it is
    // cancelled as a deletion cancels it. A running turn's requests are cancelled by its interrupted end below.
    const turn = this.handoffTurns.get(id);
    if (turn && this.handoffPending(turn)) this.cancelHandoff(id, turn);
    const stop: NonNullable<Live["removalStop"]> = live.removalStop?.turnId === turnId ? live.removalStop : { turnId, root: m.root };
    live.removalStop = stop;
    const failed = () => stop.interrupt === "failed" || stop.close === "failed";
    // Record the person's interruption before closing the runner: close alone may deliver an appQuit event.
    if (!stop.interrupt || stop.interrupt === "failed") {
      stop.interrupt = "pending";
      void this.interrupt(id, turnId, true).then(() => { stop.interrupt = "done"; }, () => { stop.interrupt = "failed"; });
    }
    if (stop.close === "failed") delete stop.close;
    this.closeRemovalRunner(live);
    // The acknowledgement and process callback are independent. A timeout keeps the same attempt for
    // Retry, which observes its progress without interrupting that turn twice.
    const until = performance.now() + this.exitWaitMs;
    for (;;) {
      if (failed()) throw new Error("stop_failed");
      const current = this.live.get(id);
      // Exit deletes a still-preparing live entry. Only its replacement owns a different turn.
      if (current && (current !== live || current.turnId !== turnId)) throw new Error("turn_changed");
      if (stop.interrupt === "done" && stop.close !== "pending" && !this.removalStopping(id, live) && !this.working(id)) return;
      const left = until - performance.now();
      if (left <= 0) throw new Error("stop_pending");
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(100, left)));
    }
  }
  // Roots with an unaccepted start or send, or a send waiting on its previous turn: running for the person, so `doan
  // remove` (cliRemove.ts) refuses for them as restartHolds holds the restart (POSTMORTEM 2026-11-17).
  pendingRoots(): ReadonlySet<string> {
    const roots = new Set<string>(), indexed = new Map(this.store.list().map(m => [m.conversationId, m.root]));
    for (const [id, live] of this.live) {
      const root = live.starting?.root ?? indexed.get(id);
      if (this.preparing(live) && root !== undefined) roots.add(root);
    }
    for (const id of [...this.waits.keys(), ...this.judging.keys()]) { const root = indexed.get(id); if (root !== undefined) roots.add(root); }
    return roots;
  }
  private preparing(live: Live): boolean { return live.busy && !live.accepted && !live.terminal && !live.closed && !live.failedPersistence; }
  // What holds Restart to Update back: running turns as liveTurns counts them and the requests they wait on, from memory
  // since main asks on every event. Only a turn still open counts its requests (a failed history leaves `asking` set).
  restartHolds(): { liveTurns: number; pendingAnswers: number } {
    let liveTurns = 0, pendingAnswers = 0;
    for (const live of this.live.values()) {
      if (live.terminal || live.closed || live.failedPersistence) continue;
      // A send or start before acceptance counts too: the composer shows it running, and a quit stops it.
      if (!this.quitting && live.busy) liveTurns++;
      pendingAnswers += live.asking?.size ?? 0;
    }
    // A send waiting for its previous turn's handoffs or process is in flight as well.
    if (!this.quitting) liveTurns += this.waits.size + this.judging.size;
    return { liveTurns, pendingAnswers };
  }
  private endWork(id: string): void {
    try { this.workEnded(id); } catch (error) { console.error("doan: conversation work cleanup failed", error); }
  }
  read(id: string) {
    this.metadata(id); const events = this.store.read(id); const state = foldConversation(events, id, !this.ran(id));
    const pendingPermission = [...events].reverse().find(e => e.type === "permission.request" && state.permissions[e.requestId] === "pending");
    // The running turn's last stage, so a renderer that reads again need not wait for the next one; absent otherwise.
    const live = this.live.get(id), stage = live && this.staging(id, live) ? live.stage : undefined;
    // commands: the command boundaries, which the record alone does not draw (commandTurns.ts).
    const commands = commandTurns(this.metadata(id).session.runtime, events, this.commandRuns.get(id));
    return { events, lastSeq: state.lastSeq, turn: state.turn, commands, ...(pendingPermission ? { pendingPermission } : {}), ...(stage ? { stage } : {}) };
  }
  // One summary per indexed conversation of the root; an unreadable history fails only its own row.
  list(root: string): ConversationSummary[] {
    return this.store.list().filter(m => m.root === root).map(m => {
      let read: { ok: true; events: ConversationEvent[] } | { ok: false };
      try { read = { ok: true, events: this.store.readRequired(m.conversationId) }; } catch { read = { ok: false }; }
      const suggestion = this.suggestions.get(m.conversationId)?.text;
      const live = this.live.get(m.conversationId);
      const background = live?.background && !live.busy ? live.background : undefined, stopping = live?.stopping && live.busy;
      const queued = this.drafts.queued(m.conversationId).length, working = this.working(m.conversationId);
      const limit = this.limitOf(m), schedule = this.schedules.get(m.conversationId);
      const scheduledAt = schedule && !working && queued ? new Date(schedule.reset).toISOString() : undefined;
      const stoppingRemoval = !!live && this.removalStopping(m.conversationId, live);
      return conversationSummary(m, read, { live: this.ran(m.conversationId), queued, working: working || stoppingRemoval,
        ...((!m.canvas && working || stoppingRemoval) && live?.turnId ? { projectTurnId: live.turnId } : {}), returned: !!this.drafts.returned(m.conversationId), ...(suggestion ? { suggestion } : {}), ...(background ? { background } : {}), ...(stopping ? { stopping: true as const } : {}),
        ...(limit !== null ? { limitResetsAt: new Date(limit).toISOString() } : {}), ...(scheduledAt ? { scheduledAt } : {}) });
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
  // The picker changed without a send: a running turn keeps its mode; the next send naming none and a later queue flush
  // use this one. ipc refuses it for a legacy external conversation.
  setPermissionMode(id: string, permissionMode: PermissionModeId): void { this.storeMode(id, permissionMode); }
  // What ipc needs to check a send's extras: the conversation's folder, its fixed provider and its owner kind.
  sendTarget(id: string): { root: string; provider: Provider; owner: ConversationOwner["kind"]; model?: string; effort?: string; fast?: true } {
    const m = this.metadata(id); return { root: m.root, provider: m.session.runtime, owner: m.owner.kind, ...choice(m), ...fastOf(m) };
  }
  answer(id: string, requestId: string, option: string): void { this.metadata(id); if (!this.live.get(id)?.runner?.answer(requestId, option)) throw new Error("stale"); }
  // The runner holding the question checks the answer against it; a runner without questions holds none.
  answerQuestion(id: string, requestId: string, answer: QuestionAnswerInput): void {
    this.metadata(id); const result = this.live.get(id)?.runner?.answerQuestion?.(requestId, answer) ?? "stale";
    if (result !== "ok") throw new Error(result);
  }
  // turnId: the turn a Stop was pressed for. A Stop of a done turn's background work (its line) ends that turn's group
  // and writes nothing; one that names a turn no longer current does nothing, so a late press never stops a newer send.
  async interrupt(id: string, turnId?: string, closingForRemoval = false): Promise<void> {
    this.metadata(id);
    const current = this.live.get(id);
    if (!closingForRemoval && turnId !== undefined && current?.background && !current.busy) {
      const background = current.background;
      if (background.turnId !== turnId || background.stopping) return;
      current.background = { ...background, stopping: true }; this.changedOf(id);
      await current.runner?.stop();
      // Still there once the stop's own wait is over: the line's Stop comes back with its failure.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the runner can clear this while the stop awaits
      if (this.live.get(id) === current && current.background && !current.exited) { current.background = background; this.changedOf(id); throw new Error("busy"); }
      return;
    }
    if (turnId !== undefined && current?.turnId !== turnId) return;
    this.cancelWait(id); const live = this.live.get(id);
    // Stop while the usage read after a limited turn runs: that turn is not sent again; its queue comes back below.
    if (live?.limitLookup) this.cancelLimit(id, live);
    // Stop while the queue waits to go out (for the handoffs or the previous process) hands it back instead.
    if (live?.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); return; }
    // A send cancelled while it waited for the handoffs or the previous process leaves the queue behind it nothing to
    // follow.
    if (!live || !live.busy) { this.giveBack(id, "interrupted"); return; }
    // A send not accepted yet has no turn to stop: it is cancelled, and refused at its next check (checkSend), before
    // anything reaches the runner. Its queued messages then come back as stopped (submit).
    if (!live.accepted && !live.failedPersistence) { live.cancelled = true; this.changedOf(id); return; }
    // A history that stopped taking writes takes no interrupted event: the Stop ends the closed run's group, and the
    // turn ends once it is gone (releaseFailed).
    if (!live.failedPersistence) { live.stopping = true; this.changedOf(id); }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the runner's stop() can flip this synchronously
    const stop = closingForRemoval ? undefined : live.failedPersistence ? live.runner?.close() : live.runner?.stop(); if (live.busy) this.receive(id, { type: "interrupted", reason: "user" }); await stop;
  }
  // The preparation of a list read (models, project skills); a quit or a stop of the provider during it refuses the read and frees its lease.
  async prepareListing(root: string, runtime: Provider): Promise<Prepared> {
    if (this.quitting) throw new Error("busy");
    const listing: Listing = { provider: runtime, since: this.stops }; this.listings.add(listing);
    let input: Prepared;
    try { input = await this.prepare({ root, mode: "new", runtime, text: "", anchors: [] }, undefined, "listing"); } catch (error) { this.listings.delete(listing); throw error; }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can set this while the listing prepares
    if (this.quitting || this.stopped(listing)) { this.listings.delete(listing); freeLease(input); throw new Error("busy"); }
    const release = input.release;
    const prepared: Prepared = { ...input, release: async () => { this.listings.delete(listing); await release?.(); } };
    this.listingOf.set(prepared, listing);
    return prepared;
  }
  // The lease is released when the read's process group is gone, or at once when nothing was spawned; a group that
  // never disappears keeps it.
  async readListing<T>(input: Prepared, read: ReadListing<T>): Promise<T> {
    const listing = this.listingOf.get(input); if (!listing) throw new Error("bad_request");
    if (this.quitting || this.stopped(listing)) { freeLease(input); throw new Error("busy"); }
    let spawned = false;
    try {
      return await read(input, () => freeLease(input), stop => {
        spawned = true; listing.cleanup = stop;
        if (this.quitting || this.stopped(listing)) void stop();
      });
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the spawn callback sets this while the runner opens
    } catch (error) { if (!spawned) freeLease(input); throw error; }
  }
  // A sign-out or replacement stops the provider's doan-account runs as a user interruption; each lease goes once its group
  // is gone, which the auth attempt waits for. A run still opening stops once it spawns; external runs hold no lease.
  async stopRuns(provider: Provider): Promise<void> {
    this.stops += 1; this.lastStop.set(provider, this.stops);
    // A scheduled send would go out on the account the person is leaving.
    for (const [id, schedule] of [...this.schedules]) if (schedule.provider === provider) this.giveBack(id, "interrupted");
    // Such a cancelled send leaves the queue accepted behind it nothing to follow; it comes back as interrupted. A quit
    // keeps it on disk for the next start instead.
    for (const [id, wait] of [...this.waits, ...this.judging]) if (wait.provider === provider) { this.cancelWait(id); this.giveBack(id, "interrupted"); }
    const closing: Promise<void>[] = [];
    for (const listing of this.listings) if (listing.provider === provider && listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.provider !== provider) continue;
      // A queue held for its handoffs or for the previous process is the person's to send again, not this run's.
      if (live.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); }
      if (live.limitLookup) { this.cancelLimit(id, live); this.giveBack(id, "interrupted"); }
      if (live.accepted && live.busy && !live.terminal) this.receive(id, { type: "interrupted", reason: "user" });
      // A held end is written once the group is gone, after the steers the transcript shows.
      if (live.accepted && !live.held) { live.terminal = true; live.busy = false; delete live.stage; }
      if (live.runner) { live.closed = true; closing.push(live.runner.close()); } else if (live.cleanup) closing.push(live.cleanup());
    }
    // A handoff waiting for its judgement or its start would start a turn on the provider the person chose to stop
    // (a sign-out cancels it). After the loop above, which handed its queue back.
    for (const [id, turn] of [...this.handoffTurns]) {
      const m = this.store.list().find(e => e.conversationId === id);
      if (this.handoffPending(turn) && m?.owner.kind === "doan" && m.owner.provider === provider) this.cancelHandoff(id, turn);
    }
    await Promise.all(closing);
  }
  // A project Remove: the background work done turns of these roots left is stopped without asking, through SIGTERM.
  stopBackground(roots: readonly string[]): void {
    for (const [id, live] of this.live) {
      const root = this.store.list().find(m => m.conversationId === id)?.root;
      if (!live.background || live.busy || root === undefined || !roots.includes(root)) continue;
      live.background = { ...live.background, stopping: true }; this.changedOf(id);
      void live.runner?.stop();
    }
  }
  quit(): Promise<void> {
    const closing: Promise<void>[] = [];
    this.quitting = true;
    // Queued messages stay in drafts.json and come back as drafts at the next start; a scheduled one never goes out.
    for (const schedule of this.schedules.values()) if (schedule.timer !== undefined) this.clock.clearTimer(schedule.timer);
    this.schedules.clear(); this.resent.clear();
    if (this.limitTimer !== undefined) { this.clock.clearTimer(this.limitTimer); this.limitTimer = undefined; }
    // An unresolved handoff stays a request in the history, which the next start reads as cancelled.
    for (const id of [...this.handoffTurns.keys()]) this.dropHandoff(id);
    for (const wait of this.missedWaits.values()) clearTimeout(wait.timer);
    this.missedWaits.clear();
    for (const watch of this.drawWatches.values()) clearTimeout(watch.timer);
    this.drawWatches.clear();
    for (const id of [...this.waits.keys(), ...this.judging.keys()]) this.cancelWait(id);
    for (const listing of this.listings) if (listing.cleanup) closing.push(listing.cleanup());
    // Before the appQuit writes: one that throws cancels the quit, but no conversation's work content or run may
    // outlive it.
    for (const id of this.live.keys()) this.endWork(id);
    for (const live of this.live.values()) if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
    // Decided before the pass below marks every conversation ended. As for a Stop, a history that already stopped taking
    // writes takes no interrupted event: its known refusal is no new persistence failure to cancel the quit for.
    for (const [id, live] of this.live) if (live.accepted && live.busy && !live.terminal && !live.failedPersistence) this.owedAppQuit.set(id, { turnId: live.turnId, failed: false });
    for (const [id, live] of this.live) {
      if (live.held) { clearTimeout(live.held.timer); delete live.held; }
      live.terminal = true; live.busy = false; delete live.stage;
      // Nothing more is written, but a message the agent already has must not come back from the queue at the next start.
      this.lookLater(id, live, false);
      this.dropSteers(id);
    }
    // Last, since a write can throw; each history gets its own attempt, and the first failure that a retry could fix
    // cancels the quit.
    let failure: { error: unknown } | undefined;
    for (const [id, owed] of [...this.owedAppQuit]) {
      try { this.append(id, owed.turnId, { type: "interrupted", reason: "appQuit" }); this.owedAppQuit.delete(id); }
      catch (error) {
        if (owed.failed || refusesForGood(error)) {
          this.owedAppQuit.delete(id);
          console.error("doan: conversation appQuit persistence refused", error);
        } else { owed.failed = true; failure ??= { error }; }
      }
    }
    if (failure) throw failure.error;
    return Promise.all(closing).then(() => undefined);
  }
  // A folder listing of root was read again: a canvas an ended turn wrote may be listed now.
  refreshed(root: string): void {
    for (const [id, turn] of [...this.handoffTurns]) if (turn.root === root && turn.state === "judging") this.judgeHandoff(id, true);
    for (const [turnId, watch] of [...this.drawWatches]) if (watch.root === root) this.judgeDrawn(turnId);
  }
  // A message sent while its conversation works waits in main, in drafts.json, until the turn ends. ids: attachment ids
  // held until it goes out. The queue goes out in the mode stored when it is flushed, not one of its messages'.
  queue(id: string, item: { text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; ids?: string[] }): { itemId: string } {
    const m = this.metadata(id);
    checkCommand(m.session.runtime, item.text, item.anchors, item.attachments?.length ?? 0, this.asIs(id, m.session.runtime, item.text));
    if (this.quitting) throw new Error("busy");
    if (!this.working(id)) throw new Error("not_running");
    const itemId = randomUUID();
    this.drafts.add(id, { itemId, text: item.text, anchors: item.anchors, attachments: item.attachments ?? [] });
    // Queued while the turn's handoffs wait with nothing held yet: their resolution sends it or moves it. A send already
    // waiting for them goes first, and the queue follows its turn.
    const live = this.live.get(id);
    const turn = this.handoffTurns.get(id);
    if (live && !live.busy && !live.holding && !this.judging.has(id) && !!turn && this.handoffPending(turn)) live.holding = {};
    if (item.ids?.length) this.queuedExtras.set(itemId, { owner: id, ids: item.ids, records: item.attachments ?? [] });
    this.changed(m.root);
    return { itemId };
  }
  removeQueued(id: string, itemId: string): void {
    const m = this.metadata(id);
    if (!this.drafts.remove(id, itemId)) throw new Error("stale");
    const held = this.forget(id, [itemId]); if (held.length) this.queueOptions.files?.discard?.(held.map(h => h.id));
    // The last scheduled message removed: nothing is left to send at the reset.
    if (!this.drafts.queued(id).length) this.disarm(id);
    this.changed(m.root);
  }
  // Send now: resolves once the agent read the message; until then it stays queued, marked sending. The checks run again
  // after the provider's answer (POSTMORTEM 2026-10-27). async only so every refusal is a rejection; the rest is sync.
  async sendNow(id: string, itemId: string): Promise<void> {
    const m = this.metadata(id), live = this.live.get(id);
    // A command goes out alone in its own turn, never into a running one.
    const queued = this.drafts.queued(id).find(entry => entry.itemId === itemId);
    if (queued && this.asIs(id, m.session.runtime, queued.text)) throw new Error("bad_request");
    if (!live || !this.steerable(id, live)) throw new Error("not_running");
    const runner = live.runner!, item = this.drafts.queued(id).find(entry => entry.itemId === itemId);
    // A pasted image the turn's fence did not open would be unreadable to the agent: the message waits for the next turn.
    const store = live.pastedStore;
    if (item && store && item.attachments.some(attachment => resolved(attachment.path).startsWith(store))) throw new Error("not_running");
    if (!item || !this.drafts.markOneSending(id, itemId)) throw new Error("stale");
    const ids = this.queuedExtras.get(itemId)?.ids ?? [], files = this.queueOptions.files;
    let attached: StartAttachments | undefined, prompt: string | null;
    let attachments: AttachmentRecord[];
    try {
      attached = ids.length && files ? files.reclaim(ids) : undefined;
      attachments = attached ? attached.recheck() : item.attachments;
      // The prompt a send of this message would carry. A message steered into a handoff's first turn does not lift its limit;
      // a turn that asked already may still hand off to its other new canvases.
      const turn = this.handoffTurns.get(id), current = turn?.turnId === live.turnId ? turn : undefined;
      const handoff = handoffGuidanceFor(m, { ...mode(m.permissionMode), ...(current?.startedBy ? { startedBy: current.startedBy } : {}) });
      prompt = turnPrompt(item.anchors, item.text, m, { home: m.fromHome === true && !m.canvas, attachments, handoff }); if (prompt === null) throw new Error("bad_request");
    } catch (error) { this.drafts.unmarkSending(id, itemId); throw error; }
    const turnId = live.turnId, messageId = randomUUID();
    this.markTranscript(live);
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
  // The first message of a start in root (on canvas) that a quit stopped before acceptance in an earlier run, handed over
  // once, as an earlier run's queue is (its attachments have no ids).
  takeStartDraft(root: string, canvas?: Canvas): TakenDraft | null { return this.drafts.takeStart(root, canvas); }
  // The draft queued messages came back as, handed over once. ids: per attachment, the id it was queued with in this
  // run, or null for one only its path can issue again (an earlier run's queue).
  takeDraft(id: string): TakenDraft | null {
    const m = this.metadata(id), draft = this.drafts.take(id);
    if (!draft) return null;
    const left = [...this.returnedHeld.get(id) ?? []]; this.returnedHeld.delete(id);
    const ids = draft.attachments.map(record => {
      const at = left.findIndex(h => h.record?.path === record.path && h.record.kind === record.kind);
      return at === -1 ? null : left.splice(at, 1)[0]!.id;
    });
    if (left.length) this.queueOptions.files?.release?.(left.map(h => h.id));
    this.changed(m.root);
    return ids.some(heldId => heldId !== null) ? { ...draft, ids } : draft;
  }
  // A send that waits for its usage limit (ipc routes it to schedule): an existing Doan Claude Code or Codex
  // conversation that is not working, while its connection's limit holds or its messages already wait for a reset.
  scheduling(id: string): boolean {
    const m = this.metadata(id);
    if (this.quitting) return false;
    const provider = m.owner.kind === "doan" ? m.owner.provider : m.session.runtime;
    return sendDecision({ provider, owner: m.owner.kind, start: false, limit: this.limitOf(m), working: this.working(id), scheduled: this.schedules.has(id), now: this.clock.now() }) === "schedule";
  }
  // The message waits in drafts.json as a queued one (a restart hands it back as a draft); only its send time is in
  // memory. ids: the attachment ids main holds for it, as for queue. busy: it is not a send that waits (scheduling).
  schedule(id: string, item: { text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; ids?: string[] }): { itemId: string; at: string } {
    const runtime = this.metadata(id).session.runtime;
    checkCommand(runtime, item.text, item.anchors, item.attachments?.length ?? 0, this.asIs(id, runtime, item.text));
    const m = this.metadata(id);
    if (!this.scheduling(id) || m.owner.kind !== "doan") throw new Error("busy");
    const owner = m.owner, connectionId = this.connectionOf(owner), limit = this.limitOf(m);
    const itemId = randomUUID();
    this.drafts.add(id, { itemId, text: item.text, anchors: item.anchors, attachments: item.attachments ?? [] });
    if (item.ids?.length) this.queuedExtras.set(itemId, { owner: id, ids: item.ids, records: item.attachments ?? [] });
    const schedule = this.schedules.get(id) ?? this.arm(id, { at: sendAt(limit!), reset: limit!, provider: owner.provider, connectionId: connectionId!, retried: false });
    this.changed(m.root);
    return { itemId, at: new Date(schedule.reset).toISOString() };
  }
  // The scheduled conversation's waiting messages, in order; none when it is not scheduled.
  scheduled(id: string): ScheduledItem[] {
    this.metadata(id);
    if (!this.schedules.has(id)) return [];
    return this.drafts.queued(id).map(item => {
      const repeat = this.repeats.get(item.itemId);
      return { itemId: item.itemId, text: item.text, anchors: item.anchors, attachments: item.attachments, ...(repeat ? { turnId: repeat.turnId } : {}) };
    });
  }
  // The connection a Doan conversation runs on now: the provider's current one once auth reported it.
  private connectionOf(owner: Extract<ConversationOwner, { kind: "doan" }>): string | undefined {
    return this.connections.has(owner.provider) ? this.connections.get(owner.provider) : owner.connectionId;
  }
  // The reset of the limit a Doan Claude Code or Codex conversation's connection holds now, else null.
  private limitOf(m: ConversationMetadata): number | null {
    if (m.owner.kind !== "doan" || (m.owner.provider !== "claude" && m.owner.provider !== "codex")) return null;
    const connectionId = this.connectionOf(m.owner), entry = connectionId === undefined ? undefined : this.limits.get(connectionId);
    return entry && entry.resetsAt > this.clock.now() ? entry.resetsAt : null;
  }
  // A turn the usage limit stopped whose conversation may wait for the reset; its failure notice waits for the decision.
  private limitCandidate(id: string, event: EventPayload): boolean {
    if (event.type !== "turn.failed" || event.code !== "rate_limited" || this.quitting || !this.queueOptions.limitWindows) return false;
    const m = this.store.list().find(e => e.conversationId === id);
    return !!m && m.owner.kind === "doan" && (m.owner.provider === "claude" || m.owner.provider === "codex");
  }
  // Waits for the usage read the runner started at the turn's end, then decides (settleLimit). The checks run again once
  // it is back (POSTMORTEM 2026-10-27): a deletion or the quit may have taken the queue already.
  private limitEnded(id: string, live: Live, saved: Extract<ConversationEvent, { type: "turn.failed" }>, resent: { reset: number; retried: boolean } | undefined): void {
    const m = this.store.list().find(e => e.conversationId === id); if (m?.owner.kind !== "doan") return;
    const owner = m.owner, read = this.queueOptions.limitWindows!;
    const lookup: LimitLookup = { turnId: saved.turnId, provider: owner.provider, connectionId: owner.connectionId, since: this.stops, saved, told: false };
    live.limitLookup = lookup;
    void (async () => {
      await Promise.resolve();
      let windows: readonly UsageWindow[] = [];
      // A read that failed tells no reset: the turn then fails as any turn does, unless Claude Code's own message names one.
      try { windows = await read(owner.provider, owner.connectionId); } catch { windows = []; }
      // Whatever ended the lookup meanwhile (cancelLimit, the quit, a later turn) took the queue and the notice.
      if (this.quitting || this.live.get(id) !== live || live.limitLookup !== lookup || live.turnId !== lookup.turnId || this.stopped(lookup)) return;
      delete live.limitLookup;
      let settled = { armed: false, again: false };
      try { settled = this.settleLimit(id, owner, saved, windows, resent); }
      catch (error) { console.error("doan: a turn the usage limit stopped could not be scheduled", error); }
      try { if (!settled.armed) this.giveBack(id, this.connectionOf(owner) === owner.connectionId ? "turn_failed" : "interrupted"); }
      catch (error) { console.error("doan: queued messages could not be handed back", error); }
      // A turn whose own message goes out again did not end for the person; any other failure is told.
      if (!settled.again) this.tell(lookup);
      this.changedOf(id);
    })();
  }
  // Ends a running lookup: the turn is not sent again, and its failure is told. The caller hands the queue back.
  private cancelLimit(id: string, live: Live): void {
    const lookup = live.limitLookup; if (!lookup) return;
    delete live.limitLookup;
    this.tell(lookup);
    this.changedOf(id);
  }
  private tell(lookup: LimitLookup): void {
    if (lookup.told) return;
    lookup.told = true;
    try { this.queueOptions.notice?.(lookup.saved); } catch (error) { console.error("doan: conversation notice failed", error); }
  }
  // The reset from the usage read, else (Claude Code only) its own limit message; then whether the turn's own message and
  // the queue behind it wait for it. armed: something waits; again: the turn's own message is among it.
  private settleLimit(id: string, owner: Extract<ConversationOwner, { kind: "doan" }>, saved: Extract<ConversationEvent, { type: "turn.failed" }>, windows: readonly UsageWindow[], resent: { reset: number; retried: boolean } | undefined): { armed: boolean; again: boolean } {
    const none = { armed: false, again: false };
    const now = this.clock.now(), previous = resent?.reset;
    let reset = limitResetFromUsage(windows, now, previous);
    if (reset === null && owner.provider === "claude" && saved.detail) {
      const read = claudeResetFromDetail(saved.detail, now, previous);
      if (read !== null && (read > now || read === previous)) reset = read;
    }
    // A sign-out or replacement meanwhile: this connection is no longer the one the person uses.
    if (this.connectionOf(owner) !== owner.connectionId) return none;
    if (reset !== null && reset > now) { this.limits = limitState(this.limits, owner.connectionId, { provider: owner.provider, resetsAt: reset }, now); this.limitChanged(owner.provider); }
    // Deleted meanwhile: nothing is left to send at the reset.
    if (!this.store.list().some(e => e.conversationId === id)) return none;
    const events = this.store.read(id).filter(e => e.turnId === saved.turnId);
    // A turn that also took a message by Send now holds more than one message of the person's: sending the first again
    // would drop the other, so it fails as any turn does (the queue behind it still waits).
    const decision = events.filter(e => e.type === "user.message").length > 1 ? "none" : autoSchedule({ code: saved.code, hadActivity: turnHadActivity(events), reset, ...(previous !== undefined ? { previousReset: previous } : {}), retriedSame: resent?.retried ?? false, now });
    const at = decision === "retry" ? now + SEND_DELAY_MS : reset !== null && reset > now ? sendAt(reset) : null;
    if (at === null) return none;
    const again = decision !== "none" && this.requeue(id, saved.turnId, events);
    // The messages queued behind the turn wait for the same reset; the turn's own only when it did nothing.
    if (!this.drafts.queued(id).length) return none;
    this.arm(id, { at, reset: reset!, provider: owner.provider, connectionId: owner.connectionId, retried: decision === "retry" });
    return { armed: true, again };
  }
  // The turn's own message goes back to the front of the queue as the person wrote it, its files issued again by path as
  // Edit and resend does; never a handoff's first message, which the agent wrote. False when it cannot.
  private requeue(id: string, turnId: string, events: readonly ConversationEvent[]): boolean {
    const message = events.find(e => e.type === "user.message");
    if (message?.type !== "user.message" || message.origin) return false;
    const records = message.attachments ?? [], files = this.queueOptions.files;
    const ids = records.length ? files?.reissue?.(records) ?? null : [];
    if (ids === null) return false;
    const itemId = randomUUID();
    try { this.drafts.add(id, { itemId, text: message.text, anchors: message.anchors, attachments: [...records] }, true); }
    catch (error) { if (ids.length) files?.discard?.(ids); console.error("doan: a stopped message could not be queued again", error); return false; }
    if (ids.length) this.queuedExtras.set(itemId, { owner: id, ids, records });
    this.repeats.set(itemId, { owner: id, turnId });
    return true;
  }
  private arm(id: string, schedule: Schedule): Schedule {
    this.disarm(id);
    this.schedules.set(id, schedule); this.setTimer(id, schedule);
    return schedule;
  }
  private setTimer(id: string, schedule: Schedule): void {
    schedule.timer = this.clock.setTimer(() => this.fire(id, schedule), Math.max(0, schedule.at - this.clock.now()));
  }
  private disarm(id: string): void {
    const schedule = this.schedules.get(id); if (!schedule) return;
    if (schedule.timer !== undefined) this.clock.clearTimer(schedule.timer);
    this.schedules.delete(id);
  }
  // A timer fires late after a busy loop and early past MAX_TIMER_MS: the wall clock decides.
  private fire(id: string, schedule: Schedule): void {
    if (this.schedules.get(id) !== schedule || this.quitting) return;
    delete schedule.timer;
    if (this.clock.now() < schedule.at) { this.setTimer(id, schedule); return; }
    schedule.due = true;
    this.sendDue(id, schedule);
  }
  // The scheduled messages go out as a queue does after a done turn (flush), checks and attachments included. It
  // waits while the conversation still works, and goes once it stops (wakeDue).
  private sendDue(id: string, schedule: Schedule): void {
    if (this.schedules.get(id) !== schedule || this.quitting) return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (!m || !this.drafts.queued(id).length) { this.disarm(id); this.changedOf(id); return; }
    if (this.working(id)) return;
    this.disarm(id);
    this.resent.set(id, { reset: schedule.reset, retried: schedule.retried });
    let live = this.live.get(id);
    if (!live) { live = { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops }; this.live.set(id, live); }
    live.provider ??= schedule.provider;
    live.holding = {};
    this.flush(id, live);
  }
  // After any list change: a due schedule tries again, once per tick.
  private wakeDue(): void {
    if (this.waking || this.quitting || ![...this.schedules.values()].some(schedule => schedule.due)) return;
    this.waking = true;
    queueMicrotask(() => {
      this.waking = false;
      for (const [id, schedule] of [...this.schedules]) if (schedule.due) this.sendDue(id, schedule);
    });
  }
  // The Mac woke: timers stopped while it slept, so each schedule is judged by the wall clock again.
  private resumed(): void {
    if (this.quitting) return;
    const now = this.clock.now();
    for (const [id, schedule] of [...this.schedules]) {
      if (schedule.timer !== undefined) { this.clock.clearTimer(schedule.timer); delete schedule.timer; }
      if (schedule.due || now >= schedule.at) { schedule.due = true; this.sendDue(id, schedule); } else this.setTimer(id, schedule);
    }
    this.armLimitExpiry();
  }
  // A provider's limit came or went: every root with its conversations reads the list again (limitResetsAt).
  private limitChanged(provider: Provider): void {
    const roots = new Set(this.store.list().filter(m => m.owner.kind === "doan" && m.owner.provider === provider).map(m => m.root));
    for (const root of roots) this.changed(root);
    this.armLimitExpiry();
  }
  // One timer for the next reset, which drops the limits that passed and announces them.
  private armLimitExpiry(): void {
    if (this.limitTimer !== undefined) { this.clock.clearTimer(this.limitTimer); this.limitTimer = undefined; }
    if (this.quitting || !this.limits.size) return;
    const next = Math.min(...[...this.limits.values()].map(entry => entry.resetsAt));
    this.limitTimer = this.clock.setTimer(() => {
      this.limitTimer = undefined;
      const now = this.clock.now(), passed = [...this.limits].filter(([, entry]) => entry.resetsAt <= now);
      if (!passed.length) { this.armLimitExpiry(); return; }
      for (const [connectionId] of passed) this.limits = limitState(this.limits, connectionId, null, now);
      for (const provider of new Set(passed.map(([, entry]) => entry.provider))) this.limitChanged(provider);
      this.armLimitExpiry();
    }, Math.max(0, next - this.clock.now()));
  }
  // Removes Doan's own record (index entry, history, queue, draft), in one tick with the busy check. The live entry stays so
  // the exit callback releases the reservation (POSTMORTEM 2026-10-28) and terminal keeps a late event from recreating it.
  delete(id: string): void {
    if (this.quitting || this.working(id)) throw new Error("busy");
    const m = this.metadata(id);
    this.closeRun(id);
    this.dropHandoff(id);
    this.store.delete(id);
    // Its live entry stays for the exit callback, but the conversation no longer has a turn.
    const live = this.live.get(id); if (live) delete live.turnOf;
    this.disarm(id); this.resent.delete(id); this.commandRuns.delete(id); this.acpLists.delete(id); this.statedModes.delete(id);
    this.drafts.discard(id);
    const held = this.returnedHeld.get(id); this.returnedHeld.delete(id);
    if (held?.length) this.queueOptions.files?.release?.(held.map(h => h.id));
    try { this.deleted(id); } catch (error) { console.error("doan: deleted conversation cleanup failed", error); }
    this.changed(m.root);
  }
  // Working, as the list and Delete read it: preparing, running, waiting for an answer, handoffs waiting, a queue about to
  // go out, or a send waiting for the previous process or the handoffs.
  private working(id: string): boolean {
    const live = this.live.get(id);
    const turn = this.handoffTurns.get(id);
    return !!live && (live.busy || !!live.holding || !!live.limitLookup) || this.waits.has(id) || this.judging.has(id) || (!!turn && this.handoffPending(turn));
  }
  // A turn's end: the queue goes out after done and comes back as a draft otherwise, or waits for a done turn's handoff
  // judgement; a requested handoff is cancelled unless done. A limit-stopped turn keeps its queue for limitEnded.
  private ended(id: string, live: Live, saved: ConversationEvent): void {
    const type = saved.type as "turn.done" | "turn.failed" | "interrupted";
    const resent = this.resent.get(id); this.resent.delete(id);
    if (saved.type === "turn.failed" && this.limitCandidate(id, saved)) this.limitEnded(id, live, saved, resent);
    else if (type !== "turn.done") this.giveBack(id, type === "interrupted" ? "interrupted" : "turn_failed");
    else if (this.drafts.queued(id).length) live.holding = {};
    // The queue going out is the next send: it ends the finished turn's process as a send does.
    if (live.holding) this.endAfterTurn(id);
    const exitedAt = live.exited ? live.exitedAt : undefined;
    const turn = this.handoffTurns.get(id);
    if (turn?.turnId === live.turnId && turn.guided && type === "turn.done") this.awaitMissed(id, turn, live.endedAt ?? Date.now(), exitedAt);
    // Whatever the end: a failed or stopped turn may still have drawn a canvas the folder lists later.
    const drawing = this.drawWatches.get(live.turnId);
    if (drawing) { drawing.endedAt = live.endedAt ?? Date.now(); if (exitedAt !== undefined) drawing.exitedAt = exitedAt; this.armDrawn(live.turnId, drawing); }
    if (turn?.requests.length && turn.state === undefined && turn.turnId === live.turnId) {
      // A project removal's Stop of this turn may meet an end held for an unreported steer, which comes as turn.done
      // once the group is gone: its handoffs belong to a root on its way out.
      if (type !== "turn.done" || live.removalStop?.turnId === live.turnId) this.cancelHandoff(id, turn);
      else {
        turn.state = "judging"; turn.endedAt = live.endedAt ?? Date.now(); if (exitedAt !== undefined) turn.exitedAt = exitedAt;
        for (const request of turn.requests) request.state = "judging";
        this.armHandoff(id, turn);
        // The queue waits for the judgement: it follows the work to the next conversation if one starts.
        this.judgeHandoff(id, false);
        return;
      }
    }
    if (live.holding) this.flush(id, live);
  }
  // Taken and waiting for its judgement or its start; a request in a running turn waits for the turn's end instead.
  private handoffPending(turn: HandoffTurn): boolean { return turn.state === "judging" || turn.state === "starting"; }
  // settled: a folder refresh or the window's end came after the turn's end (handoff.ts handoffDecision). Each request is
  // judged on its own; none starts before all are decided, so a later refresh never judges a request that is starting.
  private judgeHandoff(id: string, settled: boolean): void {
    const turn = this.handoffTurns.get(id); if (turn?.state !== "judging") return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (!m) { this.cancelHandoff(id, turn); return; }
    let listed: Canvas[] | undefined;
    for (const request of turn.requests) {
      if (request.decision) continue;
      let decision: HandoffDecision;
      try {
        listed ??= this.snapshot(m.root);
        decision = handoffDecision({ done: true, path: request.path, listed, snapshot: turn.snapshot, ...(m.canvas ? { source: m.canvas } : {}), settled });
      } catch (error) { console.error("doan: handoff judgement failed", error); decision = { kind: "refused", reason: "not_listed" }; }
      if (decision.kind !== "wait") request.decision = decision;
    }
    if (turn.requests.some(request => !request.decision)) return;
    clearTimeout(turn.timer); delete turn.timer;
    turn.state = "starting"; if (m.canvas) turn.source = m.canvas;
    for (const request of turn.requests) request.state = "starting";
    for (const request of turn.requests) {
      const decision = request.decision!;
      if (decision.kind === "refused") this.resolveHandoff(id, turn, request, { outcome: "refused", reason: decision.reason });
      else if (decision.kind === "cancelled") this.resolveHandoff(id, turn, request, { outcome: "cancelled" });
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- resolveHandoff() can move the turn out of starting
    if (turn.state === "starting") void this.startHandoffs(id, turn, m);
  }
  // The decided starts, one at a time in request order. A cancel meanwhile (a stop, a sign-out) resolved the
  // ones left, and a quit dropped the turn: each start is checked again after the one before (POSTMORTEM 2026-10-27).
  private async startHandoffs(id: string, turn: HandoffTurn, m: ConversationMetadata): Promise<void> {
    for (const request of turn.requests) {
      if (this.handoffTurns.get(id) !== turn || turn.state !== "starting") return;
      if (request.state !== "starting" || request.decision?.kind !== "start") continue;
      await this.startHandoff(id, turn, request, m, request.decision.canvas);
    }
  }
  // The next conversation runs on the earlier one's provider, model, effort, Fast and permission mode as they are now, and
  // passes every check of a start; Last used stays. A project conversation's origin names no canvas.
  private async startHandoff(id: string, turn: HandoffTurn, request: HandoffRequest, m: ConversationMetadata, target: Canvas): Promise<void> {
    const origin: HandoffOrigin = { kind: "handoff", conversationId: id, ...(turn.source ? { canvas: turn.source } : {}) };
    const provider = m.owner.kind === "doan" ? m.owner.provider : undefined, since = this.stops;
    let resolution: HandoffResolution;
    try {
      // The model's default level when it has no stored effort, as a queued turn's.
      const defaultEffort = m.model && !m.effort ? this.queueOptions.defaultEffort?.(m.root, m.session.runtime, m.model) : undefined;
      const { conversationId } = await this.start({ root: m.root, mode: "new", runtime: m.session.runtime, canvas: target, text: request.text, anchors: [], ...choice(m), ...fastOf(m), ...mode(m.permissionMode), ...(defaultEffort ? { defaultEffort } : {}) },
        undefined, { origin, handoffText: request.text, turnId: turn.turnId, path: request.path });
      resolution = { outcome: "started", target: { conversationId, canvas: this.store.list().find(e => e.conversationId === conversationId)?.canvas ?? target } };
    } catch (error) {
      const code = reason(error);
      // A stop of its provider meanwhile is the person's cancel, whatever the start then failed with.
      resolution = code === "handoff_cancelled" || this.stopped({ ...(provider ? { provider } : {}), since }) ? { outcome: "cancelled" } : { outcome: "refused", reason: code };
    }
    // A cancel meanwhile resolved it already, and a quit dropped the turn.
    if (request.state !== "starting" || this.handoffTurns.get(id) !== turn) return;
    this.resolveHandoff(id, turn, request, resolution);
  }
  // The asking turn must still be the conversation's handoff turn: after a cancel, a later turn may ask for the same path,
  // whose request must not lend this start its state; and the conversation must not be deleted (POSTMORTEM 2026-10-27).
  private checkHandoffSource(id: string, turnId: string, path: string): void {
    const turn = this.handoffTurns.get(id), exists = this.store.list().some(e => e.conversationId === id);
    const request = turn?.turnId === turnId ? turn.requests.find(r => r.path === path) : undefined;
    if (request?.state !== "starting" || !exists) throw new Error("handoff_cancelled");
  }
  // Every request not resolved yet is cancelled: a turn that did not end done, a stop or sign-out of its provider, a
  // deletion, a project removal. Conversations already started stay.
  private cancelHandoff(id: string, turn: HandoffTurn): void {
    for (const request of turn.requests) if (request.state !== "resolved") this.resolveHandoff(id, turn, request, { outcome: "cancelled" });
  }
  // Written with the requesting turn's id and the request's path once the turn ended. The last one resolves the turn.
  private resolveHandoff(id: string, turn: HandoffTurn, request: HandoffRequest, resolution: HandoffResolution): void {
    request.state = "resolved"; request.resolution = resolution;
    if (!this.quitting) {
      try { this.append(id, turn.turnId, { type: "handoff.resolved", canvas: { path: request.path }, ...resolution }); }
      catch (error) { console.error("doan: handoff resolution could not be saved", error); }
    }
    if (turn.requests.every(r => r.state === "resolved")) this.settleHandoff(id, turn);
  }
  // Once, after the turn's last resolution: the held queue goes where handoffQueueOutcome says (handoff.ts), then one
  // notice for the turn.
  private settleHandoff(id: string, turn: HandoffTurn): void {
    clearTimeout(turn.timer); delete turn.timer; turn.state = "resolved";
    const resolutions = turn.requests.flatMap(r => r.resolution ? [r.resolution] : []);
    const started = resolutions.flatMap(r => r.outcome === "started" ? [r.target] : []);
    let outcome = handoffQueueOutcome(resolutions.map(r => r.outcome));
    // A next conversation deleted before the queue reached it takes nothing under its id: the queue comes back here as a
    // draft, never sent.
    if (outcome === "move" && !this.store.list().some(e => e.conversationId === started[0]!.conversationId)) outcome = "draft";
    const live = this.live.get(id);
    if (outcome === "move") { this.moveQueue(id, started[0]!.conversationId); this.queueAfterEnd(started[0]!.conversationId); }
    if (live?.holding) {
      if (outcome === "source") this.flush(id, live);
      else { this.release(id, live, live.holding); if (outcome === "draft") this.giveBack(id, "interrupted"); }
    }
    for (const wake of turn.waiters.splice(0)) wake();
    this.changedOf(id);
    const notice = handoffNoticeKind({ root: turn.root, source: { conversationId: id, ...(turn.source ? { canvas: turn.source } : {}) }, started });
    if (!notice) return;
    try { this.handedOff(notice); }
    catch (error) { console.error("doan: handoff could not be announced", error); }
  }
  // A queue moved to a conversation whose turn already ended: handled as that end handles a queue (ended), so nothing is
  // left waiting; a deleted, closed or failed-history conversation gets it back as a draft.
  private queueAfterEnd(id: string): void {
    const live = this.live.get(id);
    if (!live?.terminal || live.busy || live.holding || live.limitLookup || this.schedules.has(id) || !this.drafts.queued(id).length) return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (!m || live.closed || live.failedPersistence) { this.giveBack(id, "interrupted"); return; }
    if (live.done) { live.holding = {}; this.endAfterTurn(id); this.flush(id, live); return; }
    let interrupted = false;
    try { interrupted = [...this.store.read(id)].reverse().find(e => e.turnId === live.turnId && (e.type === "turn.failed" || e.type === "interrupted"))?.type === "interrupted"; }
    catch (error) { console.error("doan: the turn's end could not be read for its queue", error); }
    this.giveBack(id, interrupted ? "interrupted" : "turn_failed");
  }
  // Nothing will judge it: the history stopped taking writes, it was deleted, or the app quits. Its missed lines are not
  // written either.
  private dropHandoff(id: string): void {
    this.dropMissed(id);
    const turn = this.handoffTurns.get(id); if (!turn) return;
    clearTimeout(turn.timer); this.handoffTurns.delete(id);
    for (const wake of turn.waiters.splice(0)) wake();
  }
  // The earlier conversation's queue follows the work: it goes out after the new conversation's first turn. What does not
  // fit there is the source's draft, its attachment ids held for it as giveBack holds them.
  private moveQueue(from: string, to: string): void {
    const { moved, returned } = this.drafts.move(from, to);
    for (const item of moved) { const held = this.queuedExtras.get(item.itemId); if (held) held.owner = to; }
    if (returned.length) {
      const held = this.forget(from, returned.map(item => item.itemId));
      if (held.length) this.returnedHeld.set(from, [...this.returnedHeld.get(from) ?? [], ...held]);
    }
    if (moved.length || returned.length) this.changedOf(from);
  }
  // A deleted conversation's run: it is closed, a send waiting for its previous process is refused, and its queue comes
  // back as a draft before the deletion discards it.
  private closeRun(id: string): void {
    this.suggestions.delete(id);
    this.endWork(id);
    const running = this.live.get(id);
    if (running) {
      running.terminal = true; running.busy = false; running.closed = true; delete running.holding; delete running.stage;
      this.cancelLimit(id, running);
      void running.runner?.close();
    }
    const turn = this.handoffTurns.get(id);
    if (turn && turn.state !== "resolved") this.cancelHandoff(id, turn);
    this.dropMissed(id);
    this.dropDrawn(id);
    this.cancelWait(id);
    this.resent.delete(id);
    // Steers the agent may have taken unreported: the queue comes back once the transcript was read for them.
    const later = running ? this.lookLater(id, running, true) : false;
    this.dropSteers(id);
    if (!later) this.giveBack(id, "interrupted");
  }
  // Every queued message, also those on their way out, comes back as one draft. Its held ids stay for the draft's take
  // in this run; after a restart the draft carries only the files' paths, for attachments:fromPaths.
  private giveBack(id: string, why: string): void {
    // Every waiting message is handed back, so a schedule has nothing left to send.
    this.disarm(id);
    const held = this.forget(id);
    if (this.drafts.giveBackQueued(id, why)) {
      if (held.length) this.returnedHeld.set(id, [...this.returnedHeld.get(id) ?? [], ...held]);
      this.changedOf(id);
    } else if (held.length) this.queueOptions.files?.release?.(held.map(h => h.id));
  }
  private forget(id: string, itemIds?: readonly string[]): Held[] {
    for (const [itemId, repeat] of [...this.repeats]) if (repeat.owner === id && (!itemIds || itemIds.includes(itemId))) this.repeats.delete(itemId);
    const held: Held[] = [];
    for (const [itemId, extras] of [...this.queuedExtras]) if (extras.owner === id && (!itemIds || itemIds.includes(itemId))) {
      held.push(...extras.ids.map((heldId, i) => ({ id: heldId, record: extras.records[i] })));
      this.queuedExtras.delete(itemId);
    }
    return held;
  }
  // The queue goes out as one message, its attachments and the send's checks run again; its items stay marked sending in
  // drafts.json until acceptance, and anything that stops it hands the whole queue back as a draft.
  private flush(id: string, live: Live): void {
    // A sign-out of its provider from here on stops it as it stops a run (stopRuns): it comes back as interrupted.
    const hold = live.holding, provider = live.provider, since = this.stops;
    // A command goes out alone: the queue sends the messages before the next command, or that command (queue.ts).
    const runtime = this.store.list().find(e => e.conversationId === id)?.session.runtime;
    const items = this.drafts.markSending(id, queued => runtime ? nextQueued(queued, item => this.asIs(id, runtime, item.text)) : queued);
    const ids = items.flatMap(item => this.queuedExtras.get(item.itemId)?.ids ?? []);
    const combined = combineQueued(items);
    if (!items.length || !combined.ok) {
      if (items.length) this.giveBack(id, "attachment_limit");
      this.release(id, live, hold); return;
    }
    this.changedOf(id);
    // After the terminal event's own handling: the send changes this conversation's live state.
    void Promise.resolve().then(async () => {
      // Every path that hands the queue back first drops this hold, so the copy captured above is not sent
      // (POSTMORTEM 2026-11-14). A conversation deleted meanwhile gets its queue back instead.
      if (this.live.get(id) !== live || live.holding !== hold) return;
      if (!this.store.list().some(e => e.conversationId === id)) { this.giveBack(id, "interrupted"); this.release(id, live, hold); return; }
      try {
        const files = this.queueOptions.files;
        const attached = ids.length && files ? files.reclaim(ids) : undefined;
        const m = this.metadata(id);
        const defaultEffort = m.model && !m.effort ? this.queueOptions.defaultEffort?.(m.root, m.session.runtime, m.model) : undefined;
        // The Fast stored now, judged for the model the queue goes out on.
        const fastTurn = m.fast === true && m.owner.kind === "doan" && this.queueOptions.fast?.(m.root, m.session.runtime, m.model) === true;
        await this.submit(id, combined.text, combined.anchors, { ...(combined.attachments.length ? { attachments: combined.attachments } : {}), ...(defaultEffort ? { defaultEffort } : {}), ...(fastTurn ? { fastTurn: true as const } : {}) }, attached);
        const sent = items.map(item => item.itemId);
        this.forget(id, sent); this.drafts.sent(id, sent);
        if (ids.length) files?.consume(ids);
      } catch (error) {
        // A scheduled send refused before its turn: no turn of it can be stopped by the same limit.
        this.resent.delete(id);
        // Stopped meanwhile: by the person (the send's cancel) or by a sign-out of its provider.
        const stopped = this.live.get(id)?.cancelled === true || (!!provider && (this.lastStop.get(provider) ?? 0) > since);
        this.giveBack(id, stopped ? "interrupted" : reason(error));
      } finally { this.release(id, live, hold); }
    });
  }
  // The queue went out or came back.
  private release(id: string, live: Live, hold: object | undefined): void {
    if (live.holding === hold) delete live.holding;
    this.changedOf(id);
  }
  // What a Send now needs, as a send's checks (checkSend) plus a turn accepted and running in a runner that can steer.
  private steerable(id: string, live: Live): boolean {
    const m = this.store.list().find(entry => entry.conversationId === id);
    // A command turn takes no other message: it runs alone, and a queued message waits for the next turn.
    return !this.quitting && this.live.get(id) === live && live.accepted && live.busy && !live.terminal && !live.closed && !live.failedPersistence &&
      !live.exited && !this.stopped(live) && !!m && typeof live.runner?.steer === "function" && live.command === undefined;
  }
  private steering(id: string): [string, Steer][] { return [...this.steers].filter(([, steer]) => steer.id === id); }
  // The agent read a steered message: it joins the turn's history and leaves the queue, even over an answered refusal,
  // while its turn still runs and it is still queued; a turn that ended dropped its steers first (dropSteers).
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
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- receive() can fail persistence while it records the steer
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
    // Before submit's busy check: a running turn keeps working on the moved file.
    const turn = this.live.get(metadata.conversationId)?.turnOf; if (turn) turn.canvas = canvas;
    this.changed(metadata.root);
    return refreshed;
  }
  // After a plan approval the mode Claude reported becomes the conversation's, unless the person picked another during the
  // turn; the Ask first run mode is kept beside it (claudeRunMode). Both go in one save, so one change is announced.
  private modeReported(id: string, live: Live, turnId: string, sent: PermissionModeId, report: ClaudeModeReport, turnInit: string | undefined, previous: string | undefined): void {
    // Only while the turn runs and no one asked it to end: the CLI still sends frames after a Stop, which must change
    // nothing. An approval always comes before the result.
    if (this.live.get(id) !== live || live.turnId !== turnId || !live.accepted || live.terminal || live.held || live.stopping || live.closed || live.failedPersistence) return;
    const entries = this.store.list(), entry = entries.find(e => e.conversationId === id); if (!entry) return;
    const facts = { entry, sent, current: true, reported: report.mode };
    const update = report.source === "init" ? runModeAfterInit({ ...facts, counted: turnInit !== undefined }) : runModeAfterStatus({ ...facts, turnInit, previous });
    if (!update) return;
    const { permissionMode: _mode, claudeRunMode: _run, ...rest } = entry;
    const next = { ...rest, ...mode(update.permissionMode), ...(update.claudeRunMode ? { claudeRunMode: update.claudeRunMode } : {}) } as ConversationMetadata;
    if (next.permissionMode === entry.permissionMode && next.claudeRunMode === entry.claudeRunMode) return;
    try { this.store.save(entries.map(e => e === entry ? next : e)); } catch (error) { console.error("doan: the permission mode Claude reported could not be saved", error); return; }
    this.changed(entry.root);
  }
  // A turn's suggestion counts only while nothing moved past that turn: the same run and turn, ended done, no later send
  // started or waiting, not deleted or quitting (POSTMORTEM 2026-10-27).
  private suggested(id: string, live: Live, turnId: string, text: string): void {
    if (this.quitting || this.live.get(id) !== live || live.turnId !== turnId || !live.accepted || !live.terminal || !live.done || live.busy ||
        live.closed || live.failedPersistence || live.holding || this.waits.has(id) || this.judging.has(id)) return;
    const m = this.store.list().find(e => e.conversationId === id); if (!m) return;
    // The turn's own connection: a later send that rebinds the owner has a new turnId, refused above. A legacy external
    // run has no doan connection to compare.
    if (m.owner.kind === "doan" && this.connections.has(m.owner.provider) && this.connections.get(m.owner.provider) !== m.owner.connectionId) return;
    this.suggestions.set(id, { text, root: m.root, ...(m.owner.kind === "doan" ? { provider: m.owner.provider, connectionId: m.owner.connectionId } : {}) });
    this.changed(m.root);
  }
  // A provider's connection now (undefined: signed out). A suggestion, usage limit or scheduled message from another
  // connection no longer belongs to the person's sign-in: scheduled messages come back as a draft at once.
  connectionChanged(provider: Provider, connectionId: string | undefined): void {
    this.connections.set(provider, connectionId);
    for (const [id, list] of [...this.acpLists]) if (list.provider === provider && list.connectionId !== connectionId) this.acpLists.delete(id);
    for (const [id, kept] of [...this.suggestions]) {
      if (kept.provider !== provider || kept.connectionId === connectionId) continue;
      this.suggestions.delete(id); this.changed(kept.root);
    }
    let dropped = false;
    for (const [other, entry] of [...this.limits]) if (entry.provider === provider && other !== connectionId) { this.limits = limitState(this.limits, other, null, this.clock.now()); dropped = true; }
    for (const [id, schedule] of [...this.schedules]) if (schedule.provider === provider && schedule.connectionId !== connectionId) this.giveBack(id, "interrupted");
    for (const [id, live] of [...this.live]) {
      const lookup = live.limitLookup;
      if (lookup && lookup.provider === provider && lookup.connectionId !== connectionId) { this.cancelLimit(id, live); this.giveBack(id, "interrupted"); }
    }
    if (dropped) this.limitChanged(provider);
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
  // A turn takes stages from its acceptance to its end, with receive()'s fence: a Stop writes interrupted at once while
  // the provider still sends frames until its own result, and a finished turn's late frame must not reach the next.
  private staging(id: string, live: Live): boolean {
    return !this.quitting && this.live.get(id) === live && live.accepted && !live.terminal && !live.closed && !live.failedPersistence;
  }
  // The same stage again at the same seq is not sent (Copilot sends 76-88 thought chunks a turn). After an event it goes
  // out again with the new seq: the renderer takes a stage only when no event came after it.
  private stage(id: string, live: Live, stage: TurnStage): void {
    if (!this.staging(id, live) || live.lastSeq === undefined) return;
    const last = live.stage;
    if (last && last.turnId === live.turnId && last.seq === live.lastSeq && sameStage(last.stage, stage)) return;
    live.stageRev = (live.stageRev ?? 0) + 1;
    const signal: StageSignal = { conversationId: id, turnId: live.turnId, seq: live.lastSeq, rev: live.stageRev, stage };
    live.stage = signal;
    try { this.staged(signal); } catch (error) { console.error("doan: conversation stage could not be delivered", error); }
  }
  private stopped(live: { provider?: Provider; since: number }): boolean { return !!live.provider && (this.lastStop.get(live.provider) ?? 0) > live.since; }
  // Only a turn accepted in this run can still be running; an earlier run's unfinished turn folds as crashed, and one whose
  // history stopped taking writes folds as ended once its process is gone.
  private ran(id: string): boolean { const live = this.live.get(id); return !!live?.accepted && !(live.failedPersistence && live.exited); }
  private snapshot(root: string): Canvas[] { return this.canvases(root).map(c => c.id === undefined ? { path: c.path } : { path: c.path, id: c.id }); }
  // One session is one conversation: a terminal session resume is refused while an indexed conversation holds it, running
  // or not, since two conversations sending to one agent session would mix their histories.
  private checkSessionFree(runtime: Provider, configDir: string, sessionId: string | undefined): void {
    if (sessionId !== undefined && this.sessionHeld(runtime, configDir, sessionId)) throw new Error("session_in_use");
  }
  // Whether a conversation in the index holds this agent session. configDir undefined: any profile (a terminal process's
  // occupancy names no profile; session ids are unique per agent).
  sessionHeld(runtime: Provider, configDir: string | undefined, sessionId: string): boolean {
    return this.store.list().some(m => m.session.runtime === runtime && (configDir === undefined || m.session.configDir === configDir) && m.session.sessionId === sessionId);
  }
  // metadata throws not_found for a conversation deleted meanwhile.
  private checkSend(id: string, live: Live): void {
    if (this.quitting || this.live.get(id) !== live || live.terminal || live.cancelled) throw new Error("busy");
    this.metadata(id);
  }
  private metadata(id: string): ConversationMetadata { const m = this.store.list().find(m => m.conversationId === id); if (!m) throw new Error("not_found"); return m; }
  private append(id: string, turn: string, event: EventPayload): ConversationEvent {
    const saved = this.store.append(id, turn, event);
    this.deliver(saved, event.type === "turn.failed" && this.limitCandidate(id, event));
    // Streamed text changes no list field the list shows while a turn runs; its end and activities do.
    if (event.type !== "message.delta") this.changedOf(id);
    return saved;
  }
  // The event is already saved: an index that cannot be read here must not fail it.
  private changedOf(id: string): void {
    try { const root = this.store.list().find(m => m.conversationId === id)?.root; if (root) this.listChanged(root); }
    catch (error) { console.error("doan: conversation list change could not be announced", error); }
    this.wakeDue();
  }
  private changed(root: string): void {
    try { this.listChanged(root); } catch (error) { console.error("doan: conversation list change could not be announced", error); }
    this.wakeDue();
  }
  private deliver(saved: ConversationEvent, deferNotice = false): void {
    const live = this.live.get(saved.conversationId); if (live) live.lastSeq = saved.seq;
    try { if (deferNotice) this.publish(saved, true); else this.publish(saved); } catch (error) { console.error("doan: persisted conversation event could not be delivered", error); }
  }
  private exited(id: string): void {
    const live = this.live.get(id);
    const stoppingRemoval = live && this.removalStopping(id, live);
    // The reservation goes first (POSTMORTEM 2026-10-27); a held end is written after the transcript was read.
    this.reservations = releaseReservation(this.reservations, id, "process_exited");
    this.waits.get(id)?.wake();
    if (!live) return; live.exited = true; live.exitedAt = Date.now(); delete live.runner; delete live.stage;
    if (live.background) { delete live.background; this.changedOf(id); }
    if (!live.accepted) this.live.delete(id);
    if (live.held) this.writeHeld(id, live, true);
    else if (live.accepted && live.busy) {
      // The group went before its turn's end (a crash): steers the transcript shows join the turn first, as for a held end.
      if (!this.quitting) for (const messageId of this.foundSteers(live, this.steering(id).map(([key]) => key))) this.steerConsumed(id, messageId);
      this.receive(id, { type: "turn.failed", code: "process_exited" });
    }
    if (live.lookup) this.endLookup(id, live, true);
    this.groupGone(id, live);
    this.releaseFailed(id, live);
    if (stoppingRemoval && !this.working(id)) this.changedOf(id);
  }
  // The finished turn's group is gone: its judgements need only the watcher now (settleDeadline).
  private groupGone(id: string, live: Live): void {
    const turn = this.handoffTurns.get(id);
    if (turn && turn.turnId === live.turnId && turn.state === "judging" && turn.endedAt !== undefined && turn.exitedAt === undefined) { turn.exitedAt = live.exitedAt ?? Date.now(); this.armHandoff(id, turn); }
    const missed = this.missedWaits.get(live.turnId);
    if (missed?.id === id && missed.exitedAt === undefined) { missed.exitedAt = live.exitedAt ?? Date.now(); this.armMissed(live.turnId, missed); }
    const drawing = this.drawWatches.get(live.turnId);
    if (drawing?.endedAt !== undefined && drawing.exitedAt === undefined) { drawing.exitedAt = live.exitedAt ?? Date.now(); this.armDrawn(live.turnId, drawing); }
  }
  private deadline(endedAt: number, exitedAt?: number): number {
    return settleDeadline({ endedAt, ...(exitedAt !== undefined ? { exitedAt } : {}), settle: SETTLE_MS, grace: BIND_GRACE_MS });
  }
  private armHandoff(id: string, turn: HandoffTurn): void {
    clearTimeout(turn.timer);
    turn.timer = setTimeout(() => this.judgeHandoff(id, true), Math.max(0, this.deadline(turn.endedAt!, turn.exitedAt) - Date.now()));
    turn.timer.unref();
  }
  // A guided turn ended done: its missed lines are judged once, at the same deadline as its handoffs, when the canvases
  // it wrote are listed.
  private awaitMissed(id: string, turn: HandoffTurn, endedAt: number, exitedAt: number | undefined): void {
    const wait: MissedWait = { id, root: turn.root, snapshot: turn.snapshot, edits: [...turn.edits], requested: turn.requests.map(r => r.path), endedAt, ...(exitedAt !== undefined ? { exitedAt } : {}) };
    this.missedWaits.set(turn.turnId, wait);
    this.armMissed(turn.turnId, wait);
  }
  private armMissed(turnId: string, wait: MissedWait): void {
    clearTimeout(wait.timer);
    wait.timer = setTimeout(() => this.writeMissed(turnId), Math.max(0, this.deadline(wait.endedAt, wait.exitedAt) - Date.now()));
    wait.timer.unref();
  }
  // Checked again right before the write: store.append would recreate a deleted history, and a failed history takes none.
  // A new canvas with conversations of its own still counts: the turn could have handed off to it.
  private writeMissed(turnId: string): void {
    const wait = this.missedWaits.get(turnId); if (!wait) return;
    this.missedWaits.delete(turnId);
    const m = this.store.list().find(e => e.conversationId === wait.id), live = this.live.get(wait.id);
    if (this.quitting || !m || live?.failedPersistence) return;
    try {
      const missed = missedHandoffs({ root: wait.root, edits: wait.edits, listed: this.snapshot(wait.root), snapshot: wait.snapshot, requested: wait.requested, ...(m.canvas ? { source: m.canvas } : {}) });
      for (const canvas of missed) this.append(wait.id, turnId, { type: "handoff.missed", canvas });
    } catch (error) { console.error("doan: missed handoffs could not be saved", error); }
  }
  private dropMissed(id: string): void {
    for (const [turnId, wait] of [...this.missedWaits]) if (wait.id === id) { clearTimeout(wait.timer); this.missedWaits.delete(turnId); }
  }
  private watchDrawn(id: string, turnId: string, root: string): void {
    this.drawWatches.set(turnId, { id, root, snapshot: this.snapshot(root), edits: [], announced: [] });
  }
  // An edit activity's path is a candidate only: activities come before a permission answer, so the turn's canvas.drawn
  // waits until the file is listed.
  private drewAt(turnId: string, path: string): void {
    const watch = this.drawWatches.get(turnId); if (!watch || watch.edits.includes(path)) return;
    watch.edits.push(path);
    this.judgeDrawn(turnId);
  }
  // The window ends at the turn's settle deadline, with a last look at the listing.
  private armDrawn(turnId: string, watch: DrawWatch): void {
    clearTimeout(watch.timer);
    watch.timer = setTimeout(() => { this.judgeDrawn(turnId); this.dropDrawnTurn(turnId); }, Math.max(0, this.deadline(watch.endedAt!, watch.exitedAt) - Date.now()));
    watch.timer.unref();
  }
  // Reached from receive, outside its persistence handling: a failed write drops only this watch. Each write is checked
  // again after the listing was read (POSTMORTEM 2026-10-27): store.append would recreate a deleted history.
  private judgeDrawn(turnId: string): void {
    const watch = this.drawWatches.get(turnId); if (!watch?.edits.length) return;
    try {
      for (const canvas of drawnCanvases({ ...watch, listed: this.snapshot(watch.root) })) {
        const exists = this.store.list().some(e => e.conversationId === watch.id);
        if (this.quitting || !exists || this.live.get(watch.id)?.failedPersistence || this.drawWatches.get(turnId) !== watch) { this.dropDrawnTurn(turnId); return; }
        this.append(watch.id, turnId, { type: "canvas.drawn", canvas });
        watch.announced.push(canvas);
      }
    } catch (error) { this.dropDrawnTurn(turnId); console.error("doan: drawn canvases could not be saved", error); }
  }
  private dropDrawnTurn(turnId: string): void {
    const watch = this.drawWatches.get(turnId); if (!watch) return;
    clearTimeout(watch.timer); this.drawWatches.delete(turnId);
  }
  private dropDrawn(id: string): void {
    for (const [turnId, watch] of [...this.drawWatches]) if (watch.id === id) this.dropDrawnTurn(turnId);
  }
  // Asks the runner to end a finished turn's process once per turn: the next send, a queue at the turn's end, or a
  // send waiting for a handoff's judgement. The runner chooses how (process.ts afterTurnCleanup).
  private endAfterTurn(id: string): void {
    const live = this.live.get(id);
    if (!live?.runner || live.busy || live.closed || live.cleaned || !live.runner.endAfterTurn) return;
    live.cleaned = true; live.runner.endAfterTurn();
  }
  // The runner's report on the background work a done turn left. The line shows until the group is gone. A queue going
  // out at the turn's end (holding) is the next send, which already asked the group to end (cleaned): no line.
  private backgroundChanged(id: string, live: Live, turnId: string, running: boolean): void {
    if (!running || this.quitting || this.live.get(id) !== live || live.turnId !== turnId || !live.done || live.busy || live.closed || live.background || live.holding || live.cleaned) return;
    live.background = { turnId }; live.quiet?.(true);
    this.changedOf(id);
  }
  // The Claude session transcript a lookup reads. Its size is taken at the turn's first Send now, not here: finding the
  // file walks the profile's project directories, and a steer's line is written only after the CLI received it.
  private noteTranscript(live: Live, input: Prepared, sessionId: string): void {
    delete live.transcript;
    if (input.runtime === "claude") live.transcript = { configDir: input.configDir, sessionId };
  }
  private markTranscript(live: Live): void {
    const transcript = live.transcript; if (!transcript || transcript.size !== undefined) return;
    try { transcript.size = (this.queueOptions.transcripts ?? TRANSCRIPTS).size(transcript.configDir, transcript.sessionId); }
    catch (error) { console.error("doan: Claude transcript size could not be read", error); transcript.size = 0; }
  }
  private holdsEnd(id: string, live: Live): boolean {
    return !this.quitting && !!live.transcript && !live.exited && !live.held && !live.unheld && this.steering(id).length > 0;
  }
  // The steers of this turn that a transcript read finds (readInTranscript); none when it cannot be read.
  private foundSteers(live: Live, messageIds: readonly string[]): string[] {
    if (!live.transcript || !messageIds.length) return [];
    try {
      const appended = (this.queueOptions.transcripts ?? TRANSCRIPTS).read(live.transcript.configDir, live.transcript.sessionId, live.transcript.size ?? 0);
      return appended === null ? [] : readInTranscript(appended, messageIds);
    } catch (error) { console.error("doan: Claude transcript could not be read", error); return []; }
  }
  // The held end: found steers join the turn first (steerConsumed), then the end is written as it came. lookup: the
  // group is gone; false when the bound ran out first, and the steers go back to the queue unread.
  private writeHeld(id: string, live: Live, lookup: boolean): void {
    const held = live.held; if (!held) return;
    clearTimeout(held.timer); delete live.held;
    if (this.quitting || this.live.get(id) !== live) return;
    if (lookup) for (const messageId of this.foundSteers(live, this.steering(id).map(([key]) => key))) this.steerConsumed(id, messageId);
    live.unheld = true; this.receive(id, held.event);
  }
  // A quit or a deletion ends the turn at once; a steer the transcript shows later leaves the queue unwritten, and a
  // deletion hands the rest back then. True when there is something to look for.
  private lookLater(id: string, live: Live, giveBack: boolean): boolean {
    const steers = this.steering(id).map(([messageId, steer]) => ({ messageId, itemId: steer.itemId }));
    if (!live.transcript || live.exited || !steers.length) return false;
    clearTimeout(live.lookup?.timer);
    live.lookup = { steers, giveBack, timer: setTimeout(() => this.endLookup(id, live, false), HELD_END_MS) }; live.lookup.timer.unref();
    return true;
  }
  private endLookup(id: string, live: Live, read: boolean): void {
    const lookup = live.lookup; if (!lookup) return;
    clearTimeout(lookup.timer); delete live.lookup;
    const found = read ? this.foundSteers(live, lookup.steers.map(s => s.messageId)) : [];
    const items = lookup.steers.filter(s => found.includes(s.messageId)).map(s => s.itemId);
    if (items.length) {
      const held = this.forget(id, items); this.drafts.sent(id, items);
      if (held.length) this.queueOptions.files?.release?.(held.map(h => h.id));
    }
    if (lookup.giveBack) this.giveBack(id, "interrupted");
    this.changedOf(id);
  }
  // The run's command signals. Like stage, they name no turn: a reused Codex server keeps the hooks it opened with.
  private commandHooks(id: string, live: Live, turnId: string, prepared: Prepared): Pick<Prepared, "boundary" | "sessionChanged" | "acpCommands"> {
    return {
      boundary: kind => this.boundary(id, kind),
      sessionChanged: sessionId => { if (this.live.get(id) === live && live.turnId === turnId && !live.terminal) live.movedTo = { sessionId, configDir: prepared.configDir }; },
      acpCommands: update => this.acpPushed(id, prepared, update),
    };
  }
  // asIs: the command the turn sent as its own text, an unconfirmed ACP one included; only the table's (command) draws.
  private noteCommand(id: string, live: Live, command: string | null, asIs: string | null = command): void {
    if (asIs) live.command = asIs; else delete live.command;
    if (!command) return;
    const runs = this.commandRuns.get(id) ?? new Map<string, BoundaryKind | null>(); runs.set(live.turnId, null); this.commandRuns.set(id, runs);
  }
  // Only the running command turn's boundary is drawn (not an automatic compaction), matching what a restart rebuilds. A
  // clear is drawn only once the conversation followed its session (followSession).
  private boundary(id: string, kind: BoundaryKind, followed = false): void {
    const live = this.live.get(id), runs = this.commandRuns.get(id);
    if (!live?.accepted || live.terminal || !live.command || !live.turnOf || !runs?.has(live.turnId) || (kind === "cleared" && !followed)) return;
    if (commandBoundary(live.turnOf.provider, live.command) !== kind || runs.get(live.turnId) === kind) return;
    runs.set(live.turnId, kind);
    this.boundaryChanged({ conversationId: id, turnId: live.turnId, kind });
  }
  // Only the person's /clear is followed, to a session its transcript proves is this conversation's (PRODUCT 'Session
  // identity and paths') and no other conversation holds; the reservation moves with it. Anything else fails the turn.
  private followSession(id: string, live: Live, moved: NonNullable<Live["movedTo"]>): EventPayload {
    const lost: EventPayload = { type: "turn.failed", code: "session_unavailable" };
    const entries = this.store.list(), m = entries.find(e => e.conversationId === id);
    if (!m || live.command !== "clear" || m.session.runtime !== "claude" || m.session.configDir !== moved.configDir ||
      !claudeClearedSession(m.session.configDir, m.session.sessionId, moved.sessionId, m.session.cwd)) return lost;
    if (entries.some(e => e.conversationId !== id && e.session.runtime === "claude" && e.session.configDir === m.session.configDir && e.session.sessionId === moved.sessionId)) return { type: "turn.failed", code: "session_in_use" };
    const rekeyed = rekeyReservation(this.reservations, id, { runtime: "claude", configDir: moved.configDir, sessionId: moved.sessionId });
    if (!rekeyed.ok) return { type: "turn.failed", code: "session_in_use" };
    this.store.save(entries.map(e => e === m ? { ...m, session: { ...m.session, sessionId: moved.sessionId } } as ConversationMetadata : e));
    this.reservations = rekeyed.reservations;
    if (live.transcript) live.transcript = { configDir: moved.configDir, sessionId: moved.sessionId };
    this.boundary(id, "cleared", true);
    return { type: "turn.done" };
  }
  // An ACP conversation's commands: the last list its connection pushed, none before its first session or for another
  // folder or provider (ipc "skills" with a conversationId).
  acpCommands(id: string, root: string, provider: Provider): SkillSummary[] {
    const m = this.store.list().find(e => e.conversationId === id), list = this.acpLists.get(id);
    return m && list && m.root === root && m.session.runtime === provider && list.provider === provider ? list.commands : [];
  }
  // A list pushed by a run of a connection that has since changed is not kept (POSTMORTEM 2026-11-06).
  private acpPushed(id: string, prepared: Prepared, update: unknown): void {
    const connectionId = prepared.owner?.connectionId ?? "", provider = prepared.runtime;
    if (this.connections.has(provider) && this.connections.get(provider) !== connectionId) return;
    const previous = this.acpLists.get(id), next = acpCommandsAfter(previous ?? null, connectionId, provider, update, prepared.installed);
    const reported = acpReportedNames(update) ?? (previous?.connectionId === connectionId ? previous.reported : []);
    if (next) this.acpLists.set(id, { ...next, provider, reported }); else this.acpLists.delete(id);
  }
  // The ACP conversation's server-reported commands sent as written (providerCommands.ts passthroughCommands), with the
  // same scope as acpCommands.
  acpPassthrough(id: string, root: string, provider: Provider): string[] {
    const m = this.store.list().find(e => e.conversationId === id), list = this.acpLists.get(id);
    return m && list && m.root === root && m.session.runtime === provider && list.provider === provider ? passthroughCommands(provider, list.reported) : [];
  }
  private passthroughOf(id: string, provider: Provider): string[] {
    const list = this.acpLists.get(id);
    return list?.provider === provider ? passthroughCommands(provider, list.reported) : [];
  }
  // Whether a text goes out as its own text: a command of the provider's table or the conversation's unconfirmed ACP one.
  private asIs(id: string, provider: Provider, text: string): boolean {
    return !!commandName(provider, text) || !!passthroughName(text, this.passthroughOf(id, provider));
  }
  // A Doan Codex turn that is not a command states its mode on the thread; the mode is known once that turn ended done.
  private noteMode(live: Live, provider: Provider, doan: boolean, command: string | null, stated: PermissionModeId): void {
    if (provider === "codex" && doan && !command) live.statedMode = stated; else delete live.statedMode;
  }
  // A turn that ended otherwise may or may not have reached the thread, so a mode it differed in is no longer known.
  private settleMode(id: string, live: Live, done: boolean): void {
    const stated = live.statedMode; delete live.statedMode;
    if (stated === undefined) return;
    if (done) this.statedModes.set(id, stated);
    else if (this.statedModes.get(id) !== stated) this.statedModes.delete(id);
  }
  private sendTurn(id: string, live: Live, runner: Runner, prompt: string, attachments?: readonly AttachmentRecord[], turnChoice?: TurnChoice): void {
    const turn = live.turnId;
    void (turnChoice ? runner.send(prompt, turn, attachments, turnChoice) : attachments ? runner.send(prompt, turn, attachments) : runner.send(prompt, turn)).catch(error => {
      if (this.live.get(id) === live && live.turnId === turn) this.transportFailed(id, error);
    });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? storableText(error.message).slice(0, 4096) : "Transport failed" }); }
}

// A command message carries nothing but its text (its argument included): no anchors, and no attachments, which stay in
// the composer. A built-in Doan never runs is refused, as the composer's card refuses it (providerCommands.ts).
function checkCommand(provider: Provider, text: string, anchors: readonly Anchor[], attachments: number, asIs: boolean): void {
  if (unsupportedCommand(provider, text) || (asIs && (anchors.length || attachments))) throw new Error("bad_request");
}
// Codex's review/start runs in the mode the thread was last told, so a Doan /review goes out only while that is the known
// picker mode (statedModes), else command_mode_stale. A terminal session's thread is the person's; /compact always goes.
function checkReview(provider: Provider, text: string, doan: boolean, stated: PermissionModeId | undefined, picked: PermissionModeId | undefined): void {
  if (provider === "codex" && doan && commandName(provider, text) === "review" && (stated === undefined || stated !== picked)) throw new Error("command_mode_stale");
}
// The fence names userData resolved, and a recorded path may still go through a link (/var for /private/var).
function resolved(path: string): string { try { return realpathSync.native(path); } catch { return path; } }
// A refusal's code for a draft's reason; anything else is unknown.
function reason(error: unknown): string { return error instanceof Error && /^[a-z_]{1,64}$/.test(error.message) ? error.message : "unknown"; }
function choice(source: { model?: string; effort?: string }): { model?: string; effort?: string } {
  return { ...(source.model ? { model: source.model } : {}), ...(source.effort ? { effort: source.effort } : {}) };
}
function sameStage(a: TurnStage, b: TurnStage): boolean {
  if (a.kind !== "tool" || b.kind !== "tool") return a.kind === b.kind;
  return a.activity === b.activity && a.path === b.path && a.summary === b.summary;
}
// Fast is stored only when on.
function fastOf(source: { fast?: boolean }): { fast?: true } { return source.fast === true ? { fast: true } : {}; }
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
