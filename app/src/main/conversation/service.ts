import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { ConversationStore, restoreEntries, type ConversationMetadata, type JournalWrite } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, releaseReservation, reserveSession } from "./ownership";
import { transportError } from "./transport";
import { sameCanvas } from "./sessions";
import { handoffPrompt, turnPrompt } from "./prompt";
import { handoffDecision, handoffEligibility, handoffGuidanceFor, handoffNoticeKind, handoffQueueOutcome, missedHandoffs, type ConversationHandoffNotice, type HandoffDecision, type HandoffRefusal } from "./handoff";
import { messageLine } from "./messageText";
import { requestTitleText } from "./requestLines";
import { BIND_GRACE_MS, contestedCanvas, PROMOTION_SETTLE_MS, projectBusy, promotionDeadline, promotionTarget } from "./project";
import { clampSeen, conversationSummary, type ConversationSummary } from "./summary";
import { combineQueued } from "./queue";
import { DraftStore, joined, type ReturnedDraft } from "./drafts";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import { codexRestart, type FenceEntry, type FenceMechanism, type FencePaths } from "../agentAuth/fence";
import type { ModelList } from "./models";
import type { PermissionModeId } from "./permissionMode";
import type { QuestionAnswerInput } from "./question";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent, EventPayload, HandoffOrigin, HandoffResolution, Reservation, SkillSummary, StageSignal, TurnStage } from "./types";
import type { LiveTurn } from "../conversationWork";
import type { AfterTurnCleanup } from "./process";
import { readInTranscript, readTranscriptFrom, transcriptSize } from "./io";
import { autoSchedule, claudeResetFromDetail, limitResetFromUsage, limitState, sendAt, sendDecision, SEND_DELAY_MS, turnHadActivity, type LimitEntry } from "./usageLimit";
import type { UsageWindow } from "../agentAuth/usageTypes";
// External (legacy) runs are claude or codex only; doan-account runs may use any app provider.
// model and effort: a choice from the list this run delivered (ipc checks it). attachments: files main rechecked just now.
// permissionMode: one of the common ids (ipc checks it); Default is never stored.
// A start a handoff makes, never one ipc makes: the earlier conversation, the handoff text
// for the prompt (never read for markers) and the rule that the target has no current conversation at acceptance.
// turnId and path: the asking turn and its request, which a cancel meanwhile resolves and a later turn of the same
// conversation may ask again (checkHandoffSource).
export interface HandoffStart { origin: HandoffOrigin; requireNoCurrent: true; handoffText: string; turnId: string; path: string }
// defaultEffort: as SendExtras's, the level the first turn names when its model has no effort; it is never stored.
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
  // The conversation's chosen permission mode for this run, absent for Default. planApproved: the mode Claude switched
  // to once the person approved a plan on a turn sent with Plan, which becomes the conversation's stored mode.
  permissionMode?: PermissionModeId; planApproved?: (mode: PermissionModeId) => void;
  // The agent read a message steer added (its messageId), in line with the run's events (runners.ts SteerHooks).
  steerConsumed?: (messageId: string) => void;
  // Doan-account Claude and Codex runs only: the provider's MCP connector facts (prepare.ts McpConnectorFacts).
  mcp?: McpRun;
  // Doan-account Claude and Codex runs only: called after a turn ends done, or failed on the usage limit (limit), with
  // a read of the account's usage on this run's own connection (no new process). The hook decides whether to read; a
  // Claude run keeps its input open until it resolves, since the CLI exits once its input closes
  // (agentAuth/usageService.ts withTurnUsage). The service reads the reset from it (QueueOptions.limitWindows).
  usageAtTurnEnd?: (read: () => Promise<unknown>, limit?: true) => Promise<void>;
  // Claude runs only: the cleaned text of the first prompt suggestion after a done turn (runners.ts openClaude).
  suggested?: (text: string) => void;
  // Claude runs only: whether background work the done turn started still runs (runners.ts backgroundTasks).
  backgroundChanged?: (running: boolean) => void;
  // Doan-account runs only: the run's lease stops (true) or starts again (false) counting as a running conversation.
  quiet?: (on: boolean) => void;
  // The turn's stage after a frame, called right after that frame's events. It names no turn:
  // a reused Codex server keeps the callback it opened with, and the service takes the live turn of that moment.
  stage?: (stage: TurnStage) => void;
  // Doan-account conversation runs only (never a list read or a terminal session's run): what keeps the run out of the
  // rest of Doan's userData (agentAuth/fence.ts). claudeSandbox: this Claude turn runs with its own sandbox on, so it
  // gets Doan's settings instead of the outer sandbox-exec. denied: the userData entries listed for a provider's own
  // settings (a Claude turn with its sandbox on, every Codex run). exec: another sandbox-exec, for tests.
  // socket: the app socket's path, which a Codex profile server (by its directory) and a sandbox-on Claude turn allow.
  fence?: { paths: FencePaths; denied?: FenceEntry[]; claudeSandbox?: true; socket?: string; exec?: string };
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
// fast: the turn's own Fast (Prepared.fast); a doan Codex turn states standard speed when it is absent.
export interface TurnChoice { model?: string; effort?: string; fast?: true; permissionMode?: PermissionModeId; reloadMcp?: true }
// What a send may carry besides its text: a new choice (model given, effort optional), a new permission mode (judged
// apart from the model, Default included), a new Fast choice (judged apart from the model too) and rechecked attachments.
// defaultEffort: the level the turn names when its choice has none (models.ts ModelOption); it is never stored.
// fastTurn: the turn runs with Fast (ipc's judgement); it is never stored.
export interface SendExtras extends Omit<TurnChoice, "fast"> { fast?: boolean; attachments?: AttachmentRecord[]; defaultEffort?: string; fastTurn?: true }
function askingKey(event: { type: string; requestId: string }): string { return `${event.type.startsWith("question.") ? "question" : "permission"}:${event.requestId}`; }
// steer: Claude and Codex only (steerSupport.ts); adds a message to the running turn turnId and resolves once the
// provider accepted it, which is not yet the agent reading it (Prepared.steerConsumed).
// endAfterTurn: Claude only; ends a finished turn's process for the conversation's next send (process.ts afterTurnCleanup).
// mechanism: a fenced Codex server's, which holds only the modes of that mechanism (agentAuth/fence.ts codexRestart).
export interface Runner { mechanism?: FenceMechanism; sessionId: string; send(prompt: string, turnId: string, attachments?: readonly AttachmentRecord[], choice?: TurnChoice): Promise<void>; answer(requestId: string, optionId: string): boolean; answerQuestion?(requestId: string, answer: QuestionAnswerInput): "ok" | "stale" | "bad_request"; stop(): Promise<void>; close(): Promise<void>; models?(): Promise<ModelList>; skills?(): Promise<SkillSummary[]>; steer?(prompt: string, turnId: string, messageId: string): Promise<void>; endAfterTurn?(): AfterTurnCleanup }
// What a queued send needs from main's attachment store: the queued ids checked again as the send's attachments
// (reclaim throws attachment_missing), consumed once that send was accepted, discarded with a removed message (a paste
// goes with it) and released once a returned draft no longer holds them (its take had no attachment for them, or its
// conversation was deleted first).
// A queued attachment's id with the record it was queued as (item.attachments and ids are in the same order).
type Held = { id: string; record: AttachmentRecord | undefined };
export type TakenDraft = ReturnedDraft & { ids?: (string | null)[] };
// A scheduled conversation's waiting message (conversation `scheduled`), as the renderer shows a queued row. turnId: the
// failed turn whose own message this is, sent again (the renderer hides that turn's Edit and resend meanwhile).
export interface ScheduledItem { itemId: string; text: string; anchors: Anchor[]; attachments: AttachmentRecord[]; turnId?: string }
// reissue: a sent message's files issued again by their recorded paths and held as a queued message's (a turn the usage
// limit stopped goes out again); null when any of them cannot be.
export interface QueueFiles { reclaim(ids: string[]): StartAttachments; consume(ids: string[]): void; discard?(ids: string[]): void; release?(ids: string[]): void; reissue?(records: readonly AttachmentRecord[]): string[] | null }
// drafts: the input queue and the drafts it hands back; files: the queue's attachments; defaultEffort: the level a queued
// turn names when the conversation's model has no stored effort (models.ts ModelCatalog.defaultEffort); fast: whether
// this run's list says the model (its default row when none) takes Fast now, for the turns ipc does not judge: a start,
// a handoff's start and a queue flush (models.ts ModelCatalog.fast). Without it no such turn runs with Fast.
// The Claude session transcript a turn's unreported steers are looked for in (io.ts claudeTranscript).
export interface TranscriptReader { size(configDir: string, sessionId: string): number; read(configDir: string, sessionId: string, from: number): string | null }
// The wall clock and the timers a usage-limit schedule runs on; a timer may fire late, never early by design.
export interface ScheduleClock { now(): number; setTimer(run: () => void, ms: number): unknown; clearTimer(timer: unknown): void }
// limitWindows: the usage windows of a Doan connection after a turn the usage limit stopped, once the read that turn's
// end started is over (agentAuth/usageService.ts limitWindows); without it no limit is held and nothing is scheduled.
// clock: the schedule's clock (tests pass a fake one). resumed: subscribes to the Mac waking from sleep, when timers
// stopped while the wall clock went on. notice: a turn.failed published with its notice held back (publish's
// deferNotice), once main knows the turn was not scheduled again.
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
function freeLease(input: Prepared | undefined): void {
  void input?.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// A Claude process ended about 0.75 s after turn.done, but its reservation held for 2.1-5.0 s after turn.done until the
// group was gone (packaged app, 2026-10-28). The wait allows twice the slowest observed.
const EXIT_WAIT_MS = 10_000;
// How long a Claude turn's end waits for its group to go before its unreported steers are looked for in the transcript;
// past it they go back to the queue without the lookup, as before.
const HELD_END_MS = 2_000;
const TRANSCRIPTS: TranscriptReader = { size: transcriptSize, read: readTranscriptFrom };
// setTimeout fires at once past this delay; a longer schedule is armed again when its timer fires early.
const MAX_TIMER_MS = 2 ** 31 - 1;
const CLOCK: ScheduleClock = {
  now: () => Date.now(),
  setTimer: (run, ms) => { const timer = setTimeout(run, Math.min(ms, MAX_TIMER_MS)); timer.unref?.(); return timer; },
  clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
// A scheduled conversation's send (usage limit): its queued messages go out together at `at`, after reset (the time the
// renderer shows: scheduledAt and send's `at`; a same-reset retry keeps it), on the
// Doan connection it was scheduled for. retried: it waits to go once more for a reset that already stopped it. due: its
// time came while it could not go (its own turn not judged yet, or another project conversation holding the root); it
// goes once the conversation list says something changed.
interface Schedule { at: number; reset: number; provider: Provider; connectionId: string; retried: boolean; timer?: unknown; due?: true }
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
// done: the turn's terminal event was turn.done.
// handoffKey: the DOAN_HANDOFF value of the runner it holds now (openRunner).
// lastSeq: the conversation's last written seq (deliver). stage: the running turn's last stage signal, never stored;
// stageRev counts this entry's signals, so stages that share a seq keep their order.
// exitedAt: when its process group was seen gone. cleaned: the next send already asked its runner to end the finished
// turn's process (endAfterTurn). background: the done turn turnId left background work running (memory only).
// stopping: the person's Stop of the running turn was taken. quiet: the run's lease stops counting as a running
// conversation. transcript: a Claude turn's session transcript, and its size at the turn's first Send now (Steer lookup).
// held: a Claude turn's end kept back until the group is gone, to look for its unreported steers in the transcript.
// lookup: an archive or quit ended the turn with steers unreported; found ones leave the queue once the group is gone.
// unheld: the held end is being written, so it is not held again.
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean; provider?: Provider; since: number; endedAt?: number; project?: string; closed?: boolean; holding?: object; mcpGeneration?: number | undefined; asking?: Set<string>; done?: boolean; handoffKey?: string; lastSeq?: number; stage?: StageSignal; stageRev?: number; pastedStore?: string;
  exitedAt?: number; cleaned?: boolean; background?: { turnId: string; stopping?: true }; stopping?: true; quiet?: (on: boolean) => void;
  transcript?: { configDir: string; sessionId: string; size?: number }; held?: { event: EventPayload; timer: ReturnType<typeof setTimeout> };
  lookup?: { steers: { messageId: string; itemId: string }[]; timer: ReturnType<typeof setTimeout>; giveBack: boolean }; unheld?: true;
  // A turn the usage limit stopped: its connection's usage is being read to learn the reset. Working until then, so its
  // queue stays and no send goes first.
  limitLookup?: LimitLookup;
  // A Stop came while this send was prepared, before acceptance: the send is refused at its next check and never runs.
  cancelled?: true }
// The usage read after a turn the usage limit stopped (limitEnded). A Stop, a stop of the provider's runs, a sign-out
// or replacement and an archive end it (cancelLimit). since: the stops count when it began. told: its deferred failure
// notice was delivered, which happens once unless the turn's own message goes out again.
interface LimitLookup { turnId: string; provider: Provider; connectionId: string; since: number; saved: Extract<ConversationEvent, { type: "turn.failed" }>; told: boolean }
// A project turn's grounds for promotion: the canvas list when the turn was accepted, the paths of its own
// edit activities and the canvas files the folder watcher saw change. endedAt: the turn is over and waits for its first
// folder refresh, or for the timer at the end of the binding window. turnId: the judged turn, for its bound marker.
// Only one turn's own grounds count: the conversation's next send waits for this judgement (waiters) and starts with a
// new snapshot. Kept apart from the live entries, which a send replaces before it is accepted: until judged, it keeps
// its root (checkProject), unless it waits for an answer.
// taken: canvases another conversation of the root was promoted to after this snapshot (promotionTarget).
// exitedAt: when the turn's process group was seen gone, which brings the judgement forward (promotionDeadline).
interface Evidence { root: string; turnId: string; snapshot: Canvas[]; edits: Set<string>; changed: Set<string>; taken: Canvas[]; endedAt?: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout>; waiters: (() => void)[] }
// A Doan-connected conversation's current turn for handoffs, in memory only. snapshot: the
// root's listed canvases when the turn was accepted. startedBy: a handoff started it, so it cannot hand off.
// requests: the handoffs it asked for, in request order. state: judging once the turn ended done and a canvas may still
// be listed (the first folder refresh or the window's end, like a promotion); starting while the decided ones start;
// resolved once every handoff.resolved is written. waiters: sends waiting for that, as for a project judgement.
// guided: the turn was sent with the handoff guidance. edits: the paths of its own edit activities, for missed lines.
// source: the conversation's canvas when its starts began, which the started conversations name as their origin.
interface HandoffTurn { root: string; turnId: string; snapshot: Canvas[]; startedBy?: "handoff"; requests: HandoffRequest[]; guided: boolean; edits: Set<string>; source?: Canvas; state?: "judging" | "starting" | "resolved"; endedAt?: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout>; waiters: (() => void)[] }
// taken while its turn runs, judging once the turn ended done, starting once every request of the turn is decided,
// resolved once its handoff.resolved is written (or would be, after a quit). decision: its judgement, other than wait.
interface HandoffRequest { path: string; text: string; state: "taken" | "judging" | "starting" | "resolved"; decision?: HandoffDecision; resolution?: HandoffResolution }
// A guided turn that ended done, waiting for the handoff's deadline to write its missed lines. Kept apart from the
// HandoffTurn, which the next send replaces: it holds neither the queue nor the working state, and outlives that send.
interface MissedWait { id: string; root: string; snapshot: Canvas[]; edits: string[]; requested: string[]; endedAt: number; exitedAt?: number; timer?: ReturnType<typeof setTimeout> }
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
  private queuedExtras = new Map<string, { owner: string; ids: string[]; records: readonly AttachmentRecord[] }>();
  // The ids a returned draft's files were queued with, until the draft is taken in this run: the renderer checks them
  // again as those files, so a folder replaced since is refused as replaced, not accepted as a new one.
  private returnedHeld = new Map<string, Held[]>();
  private evidence = new Map<string, Evidence>();
  // Sends waiting for their conversation's previous turn to be judged.
  // A Stop or a sign-out of its provider refuses such a send as busy, as it refuses one waiting for the previous process.
  private judging = new Map<string, { wake(): void; cancelled: boolean; provider?: Provider }>();
  private drafts: DraftStore;
  // By messageId, until the agent reads it or its turn ends; a refused one stays, since its read may still come.
  private steers = new Map<string, Steer>();
  // Claude's suggestion for each conversation's next message, in memory only: kept
  // until the next turn is accepted, the conversation is archived or deleted, or its Claude connection signs out or
  // changes. connectionId: the doan connection the turn ran on; none for a legacy external run.
  private suggestions = new Map<string, { text: string; root: string; provider?: Provider; connectionId?: string }>();
  // Each provider's connection as auth last reported it (connectionChanged; undefined: signed out). A run on another
  // connection may still send its suggestion after the change, and must not bring it back.
  private connections = new Map<Provider, string | undefined>();
  // DOAN_HANDOFF value → conversation, for each runner process still alive; never on disk.
  private handoffKeys = new Map<string, string>();
  private handoffTurns = new Map<string, HandoffTurn>();
  // By the guided turn's id: a conversation's next turn may end before the earlier one's wait is over.
  private missedWaits = new Map<string, MissedWait>();
  // Each Doan connection's usage limit, in memory only (usageLimit.ts limitState); limitTimer drops a passed one.
  private limits = new Map<string, LimitEntry>();
  private limitTimer: unknown;
  private schedules = new Map<string, Schedule>();
  // A scheduled send on its way out, until its turn ends: the reset it went for, for a stop by the same limit.
  private resent = new Map<string, { reset: number; retried: boolean }>();
  private waking = false;
  private clock: ScheduleClock;
  // A queued message that is a failed turn's own message sent again, by itemId, until it leaves the queue (forget).
  private repeats = new Map<string, { owner: string; turnId: string }>();
  // listChanged: a root whose conversation list (conversation:list) changed, sent after the write it reports.
  // deleted: a conversation deleted (delete), once its index entry is gone.
  // workEnded: the conversation's turn can no longer take a `doan work update` (its end, an archive or deletion, a
  // history that stopped taking writes, the app quitting), so main drops its work (conversationWork.ts).
  // handedOff: a turn's handoffs started one or more conversations (conversation:handoff, main window only), once all of
  // them were resolved.
  // staged: a running turn's stage changed (conversation:stage, main window only); never written to the history.
  // publish's deferNotice: a turn.failed whose notification waits until main knows the turn was not scheduled again
  // (QueueOptions.notice).
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent, deferNotice?: true) => void, private admit: (root: string, canvas?: Canvas) => Canvas | void = () => {}, private exitWaitMs = EXIT_WAIT_MS, private canvases: (root: string) => readonly Canvas[] = () => [], private listChanged: (root: string) => void = () => {}, private queueOptions: QueueOptions = {}, private deleted: (id: string) => void = () => {}, private workEnded: (id: string) => void = () => {}, private handedOff: (notice: ConversationHandoffNotice) => void = () => {}, private staged: (signal: StageSignal) => void = () => {}) {
    this.drafts = queueOptions.drafts ?? new DraftStore(null);
    this.clock = queueOptions.clock ?? CLOCK;
    queueOptions.resumed?.(() => this.resumed());
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
  async start(request: StartRequest, attached?: StartAttachments, handoff?: HandoffStart): Promise<{ conversationId: string }> {
    if (this.quitting) throw new Error("busy");
    const admitted = this.admit(request.root, request.canvas);
    if (admitted) request = { ...request, canvas: admitted };
    const project = request.mode === "newDesign" ? request.root : undefined;
    // A new conversation never waits for a usage limit: it is refused while its connection's limit holds.
    if (request.mode !== "resume" && request.runtime) {
      const connectionId = this.connections.get(request.runtime), limit = connectionId === undefined ? undefined : this.limits.get(connectionId);
      if (limit && sendDecision({ provider: request.runtime, owner: "doan", start: true, limit: limit.resetsAt, working: false, scheduled: false, now: this.clock.now() }) === "refuse")
        throw Object.assign(new Error("rate_limited"), { resetsAt: new Date(limit.resetsAt).toISOString() });
    }
    if (project) this.checkProject(project);
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops, ...(project ? { project } : {}) }; this.live.set(id, live);
    let opening = false, input: Prepared | undefined;
    const turnId = live.turnId;
    try {
      const prepared = await this.prepare(request);
      input = { ...prepared, ...choice(request), ...(request.model && !request.effort && request.defaultEffort ? { effort: request.defaultEffort } : {}), ...this.runFast(request.fast === true, request.root, prepared, request.model), ...mode(request.permissionMode), planApproved: reported => this.planApproved(id, live, turnId, reported), steerConsumed: messageId => this.steerConsumed(id, messageId), suggested: text => this.suggested(id, live, turnId, text), stage: stage => this.stage(id, live, stage), backgroundChanged: running => this.backgroundChanged(id, live, turnId, running) };
      if (input.owner) live.provider = input.owner.provider;
      if (input.quiet) live.quiet = input.quiet;
      if (this.quitting) throw new Error("busy");
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
      if (this.quitting) throw new Error("busy");
      const currentCanvas = this.admit(request.root, request.canvas);
      if (currentCanvas) request = { ...request, canvas: currentCanvas };
      if (project) this.checkProject(project, id);
      const session = { runtime: input.runtime, origin: request.mode === "resume" ? "resumed" as const : request.mode, sessionId: runner.sessionId, configDir: input.configDir, cwd: input.cwd };
      // Every turn of a newDesign conversation carries Home's paragraph.
      const fromHome = request.mode === "newDesign";
      // seenSeq 0: nothing of a new conversation has been seen, so its first end shows as unseen. The title leaves out the
      // fixed preset and skill lines, which would otherwise fill the sidebar; a preset-only request is titled by the preset.
      const base = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: messageLine(requestTitleText(request.text), request.anchors), state: "current" as const,
        ...choice(request), ...fastOf(request), ...mode(request.permissionMode), ...(fromHome ? { fromHome: true as const } : {}), ...(request.mode === "newDesign" ? { canvasesAtStart: this.snapshot(request.root) } : {}), seenSeq: 0 };
      const runtime = input.runtime;
      // Without an owner the run used an external profile, which exists only for the shared sessions' two runtimes.
      if (!input.owner && runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
      const metadata: ConversationMetadata = input.owner ? { ...base, owner: input.owner, session }
        : { ...base, owner: { kind: "legacy-external" }, session: { ...session, runtime: runtime === "claude" ? "claude" : "codex" } };
      const entries = this.store.list();
      const replaced = entries.filter(m => m.state === "current" && m.root === request.root && m.canvas && request.canvas && sameCanvas(m.canvas, request.canvas));
      // A handoff archives nothing: a current conversation that appeared since the judgement refuses it, and so does an
      // earlier conversation archived meanwhile (POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
      if (handoff) { if (replaced.length) throw new Error("has_conversation"); this.checkHandoffSource(handoff.origin.conversationId, handoff.turnId, handoff.path); }
      // The files may have moved while the runner was prepared and opened; the prompt and history use this check.
      const attachments = attached ? attached.recheck() : request.attachments ?? [];
      const guided = !handoff && handoffGuidanceFor(metadata, mode(request.permissionMode));
      const prompt = handoff ? handoffPrompt(handoff.handoffText, metadata, handoff.origin.canvas)
        : turnPrompt(request.anchors, request.text, metadata, { home: fromHome, attachments, handoff: guided });
      if (prompt === null) throw new Error("bad_request");
      const writes: { id: string; turn: string; body: EventPayload }[] = [];
      for (const old of replaced) {
        const running = this.live.get(old.conversationId); const turn = running?.turnId || randomUUID();
        if (running?.accepted && running.busy && !running.terminal) writes.push({ id: old.conversationId, turn, body: { type: "interrupted", reason: "user" } });
        writes.push({ id: old.conversationId, turn, body: { type: "conversation.archived" } });
      }
      writes.push({ id, turn: live.turnId, body: { type: "user.message", text: request.text, anchors: request.anchors, ...(attachments.length ? { attachments } : {}), ...(handoff ? { origin: handoff.origin } : {}) } }, { id, turn: live.turnId, body: { type: "turn.started" } });
      attached?.sent();
      const saved = this.store.acceptStart([...entries.map(m => replaced.includes(m) ? { ...m, state: "archived" as const } : m), metadata], id, writes);
      live.accepted = true; this.noteTranscript(live, input, runner.sessionId);
      if (project) this.evidence.set(id, { root: project, turnId: live.turnId, snapshot: base.canvasesAtStart ?? [], edits: new Set(), changed: new Set(), taken: [], waiters: [] });
      if (metadata.owner.kind === "doan") this.handoffTurns.set(id, { root: request.root, turnId: live.turnId, snapshot: this.snapshot(request.root), requests: [], guided, edits: new Set(), waiters: [], ...(handoff ? { startedBy: "handoff" as const } : {}) });
      // As a promotion's write: a project turn judged later must not take this canvas over and archive this conversation.
      if (handoff && request.canvas) for (const grounds of this.evidence.values()) if (grounds.root === request.root) grounds.taken.push(request.canvas);
      for (const old of replaced) this.archive(old.conversationId);
      for (const event of saved) this.deliver(event);
      this.changed(request.root);
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A terminal event that came before acceptance (the process gone) already ended the turn: nothing is sent.
      if (!live.terminal) this.sendTurn(id, live, runner, prompt, attachments.length ? attachments : undefined);
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
  // A send to an archived conversation restores it: its canvas is found again by ID, the canvas's current
  // conversation must not be working, and both are swapped through the journal at acceptance. Whether a send restores
  // is decided at admission; a conversation archived while its send prepared is refused as busy.
  // A conversation whose queue is about to go out takes no other send first: the queued messages keep their place.
  send(id: string, text: string, anchors: Anchor[], extras: SendExtras = {}, attached?: StartAttachments): Promise<void> {
    if (this.live.get(id)?.holding) return Promise.reject(new Error("busy"));
    return this.submit(id, text, anchors, extras, attached);
  }
  private async submit(id: string, text: string, anchors: Anchor[], extras: SendExtras, attached?: StartAttachments): Promise<void> {
    // Only a send that waits yields here; any other runs up to its reservation in the caller's tick, as before.
    // The finished turn's process is ended first: its suggestion or background work would otherwise hold the group, and
    // the judgement with it, up to its bound.
    this.endAfterTurn(id);
    const judged = this.judgement(id) ?? this.handoffWait(id); if (judged) await judged;
    this.switchCodexServer(id, extras);
    const exiting = this.previousExit(id); if (exiting) await exiting;
    let metadata = this.metadata(id); if (this.quitting) throw new Error("busy");
    const restoring = metadata.state === "archived";
    let replacing: string[] = [];
    if (restoring) { metadata = this.restoreTarget(metadata); replacing = this.replacing(metadata, id); }
    else metadata = this.refreshCanvas(metadata);
    const runtime = metadata.session.runtime;
    // A history that stopped taking writes is left behind once its process is gone (releaseFailed): the send starts a
    // new turn on a new entry, and is refused like any first write when the history still takes none.
    const existing = this.live.get(id); if (existing?.busy || (existing?.failedPersistence && !existing.exited)) throw new Error("busy");
    const project = metadata.canvas ? undefined : metadata.root;
    if (project) this.checkProject(project, id);
    // An archived conversation's runner is closing; previousExit waited for its process, so a new one opens.
    const live: Live = (existing?.runner && !existing.closed ? existing : undefined) ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: 0 };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; delete live.closed; delete live.stage; live.turnId = randomUUID(); live.since = this.stops; this.live.set(id, live);
    delete live.exitedAt; delete live.cleaned; delete live.background; delete live.stopping; delete live.transcript; delete live.unheld; delete live.cancelled;
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
      input = { ...await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors, ...(extras.attachments?.length ? { attachments: extras.attachments } : {}) }, metadata, undefined, reusing), ...chosen, ...(extras.fastTurn ? { fast: true as const } : {}), planApproved: reported => this.planApproved(id, live, turnId, reported), steerConsumed: messageId => this.steerConsumed(id, messageId), suggested: text => this.suggested(id, live, turnId, text), stage: stage => this.stage(id, live, stage), backgroundChanged: running => this.backgroundChanged(id, live, turnId, running) };
      if (input.owner) live.provider = input.owner.provider;
      if (input.quiet) live.quiet = input.quiet; else delete live.quiet;
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
      const guided = handoffGuidanceFor(metadata, chosen);
      const prompt = turnPrompt(anchors, text, metadata, { home: metadata.fromHome === true && !metadata.canvas, attachments, handoff: guided }); if (prompt === null) throw new Error("bad_request");
      // The choice and snapshot are written before the turn's events: a failed append then leaves only a saved choice.
      // An entry without seenSeq has had all of its history seen; from now on its ends count.
      const projectTurn = project !== undefined && !metadata.canvas;
      const canvasesAtStart = projectTurn ? this.snapshot(metadata.root) : metadata.canvasesAtStart;
      const seenSeq = metadata.seenSeq ?? this.store.read(id).at(-1)?.seq ?? 0;
      const { model: _model, effort: _effort, fast: _fast, permissionMode: _mode, canvasesAtStart: _snapshot, ...rest } = metadata;
      // A picker change stored while this send was prepared is the later pick, so it stays for the next turn.
      const stored = metadata.permissionMode !== admittedMode ? mode(metadata.permissionMode) : mode(chosen.permissionMode);
      const fast = fastOf(extras.fast !== undefined ? extras : metadata);
      const updated: ConversationMetadata = { ...rest, ...choice(chosen), ...fast, ...stored, ...(canvasesAtStart ? { canvasesAtStart } : {}), seenSeq };
      const message: EventPayload = { type: "user.message", text, anchors, ...(attachments.length ? { attachments } : {}) };
      attached?.sent();
      if (restoring) {
        const swap = restoreEntries(this.store.list(), id); if (!swap) throw new Error("busy");
        const writes: JournalWrite[] = swap.replaced.map(old => ({ id: old, turn: this.live.get(old)?.turnId || randomUUID(), body: { type: "conversation.archived" } }));
        writes.push({ id, turn: live.turnId, body: { type: "conversation.restored" } }, { id, turn: live.turnId, body: message }, { id, turn: live.turnId, body: { type: "turn.started" } });
        const saved = this.store.acceptChange({ kind: "restore", id, replaced: swap.replaced }, swap.entries.map(m => m.conversationId === id ? { ...updated, state: "current" } : m), writes);
        live.accepted = true; this.suggestions.delete(id); this.noteTranscript(live, input, live.runner.sessionId);
        for (const old of swap.replaced) this.archive(old);
        for (const event of saved) this.deliver(event);
        this.changed(metadata.root);
      } else {
        if (rebound || chosen.model !== metadata.model || chosen.effort !== metadata.effort || fast.fast !== metadata.fast || stored.permissionMode !== metadata.permissionMode || seenSeq !== metadata.seenSeq || JSON.stringify(canvasesAtStart) !== JSON.stringify(metadata.canvasesAtStart))
          this.store.save(this.store.list().map(m => m.conversationId === id ? updated : m));
        // One write: a turn.started refused by validation, the size limit or a failed open or read must not leave the
        // message, which would read as a turn that runs. A short write is not rolled back (no journal here).
        for (const event of this.store.appendAll(id, live.turnId, [message, { type: "turn.started" }])) this.deliver(event);
        this.changedOf(id); live.accepted = true; this.suggestions.delete(id); this.noteTranscript(live, input, live.runner.sessionId);
      }
      if (projectTurn) this.evidence.set(id, { root: metadata.root, turnId: live.turnId, snapshot: canvasesAtStart ?? [], edits: new Set(), changed: new Set(), taken: [], waiters: [] });
      // The previous turn's handoff was resolved before this send went on (handoffWait).
      if (metadata.owner.kind === "doan") this.handoffTurns.set(id, { root: metadata.root, turnId: live.turnId, snapshot: this.snapshot(metadata.root), requests: [], guided, edits: new Set(), waiters: [] });
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A reused Codex server keeps the lease it opened with; this preparation's lease covered only the checks.
      if (!leased) freeLease(input);
      // A new server read the profile as it opened; only a reused one may hold servers from before a change.
      const generation = input.mcp?.generation();
      const reloadMcp = !opening && generation !== undefined && generation !== live.mcpGeneration;
      if (reloadMcp) live.mcpGeneration = generation;
      const turnChoice: TurnChoice = { ...chosen, permissionMode: chosen.permissionMode ?? "default", ...(!chosen.effort && extras.defaultEffort ? { effort: extras.defaultEffort } : {}), ...(extras.fastTurn ? { fast: true as const } : {}), ...(reloadMcp ? { reloadMcp: true as const } : {}) };
      if (!live.terminal) this.sendTurn(id, live, live.runner, prompt, attachments.length ? attachments : undefined, turnChoice);
    } catch (error) {
      live.busy = false;
      if (reserved && !opening && !live.runner) this.reservations = releaseReservation(this.reservations, id, "not_spawned");
      if (!leased) freeLease(input);
      // Messages queued behind a send that never ran have nothing left to follow; a queue's own send hands them back.
      // A send the person stopped hands them back as stopped.
      if (!this.working(id)) this.giveBack(id, live.cancelled ? "interrupted" : reason(error));
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
  // A Codex server's fence holds only the modes of its mechanism: Full access runs inside the outer sandbox-exec, the
  // other modes on Doan's permission profiles. A send that needs the other one closes the idle server, waits for it as
  // for an archived one (previousExit) and opens a new one, which resumes the thread.
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
    // A Codex server is reused while its conversation stays current; an archived one's server, or one closed because its
    // history stopped taking writes, is closing.
    if (metadata.session.runtime === "codex" && live?.runner && !live.closed && !live.failedPersistence) return;
    if (this.waits.has(id)) throw new Error("busy");
    // A finished Claude turn's process may go on with its suggestion (up to 30 s) or background work after its input
    // closed, past this wait (EXIT_WAIT_MS): the runner ends it (endAfterTurn), and the reservation is still released only
    // once the group is gone (POSTMORTEM 2026-10-28).
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
  // A send of a conversation whose previous turn is not judged yet waits for that judgement (the first folder refresh
  // or the window's end), so the next turn starts with its own snapshot and no grounds of the earlier turn.
  private judgement(id: string): Promise<void> | undefined {
    let evidence = this.evidence.get(id); if (evidence?.endedAt === undefined) return;
    // Its window passed without its timer having run yet (a busy main loop): judged now, as checkProject does.
    if (Date.now() >= this.deadline(evidence.endedAt, evidence.exitedAt)) { this.judge(id); evidence = this.evidence.get(id); if (evidence?.endedAt === undefined) return; }
    return this.awaitJudged(id, evidence.waiters);
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
  // DOAN_CONVERSATION_ID: the CLI's `work update` names this conversation. Set here,
  // for both the doan-account and the legacy external path; a reused Codex server keeps it across turns.
  // DOAN_HANDOFF: a random key per runner of a Doan-connected conversation, a project one included, since a Codex server
  // lives on after a promotion. It only says which conversation asks: the socket token is the
  // boundary, and the conversation id is readable in index.json. It is forgotten once the runner's process is gone.
  // A start's Fast for its run (Prepared.fast): chosen, a doan run, and this run's list says the model takes it now.
  private runFast(on: boolean, root: string, input: Prepared, model: string | undefined): { fast?: true } {
    return on && input.owner && this.queueOptions.fast?.(root, input.runtime, model) === true ? { fast: true } : {};
  }
  private async openRunner(id: string, live: Live, input: Prepared): Promise<Runner> {
    let spawned = false;
    // A fenced Claude turn opened only the pasted images it started with (Codex opens the whole store, ACP has no steer).
    if (input.runtime === "claude" && input.fence) live.pastedStore = `${input.fence.paths.userData}/attachments/`; else delete live.pastedStore;
    const key = input.owner ? randomBytes(32).toString("hex") : undefined;
    if (key) { this.handoffKeys.set(key, id); live.handoffKey = key; } else delete live.handoffKey;
    const release = () => { freeLease(input); if (key) this.handoffKeys.delete(key); };
    try {
      return await this.open({ ...input, env: { ...input.env, DOAN_CONVERSATION_ID: id, ...(key ? { DOAN_HANDOFF: key } : {}) } }, event => { if (this.live.get(id) === live) this.receive(id, event); }, () => { release(); if (this.live.get(id) === live) this.exited(id); }, stop => { spawned = true; live.cleanup = stop; if (this.quitting || this.stopped(live)) void stop(); });
    } catch (error) { if (!spawned) release(); throw error; }
  }
  // A `doan handoff` request after the socket's own checks: null when it was taken and written
  // as handoff.requested in the asking turn. The key must be the one of the runner the conversation runs on now: a
  // previous turn's process that is still exiting asks for no turn.
  requestHandoff(request: { root: string; handoff: string; path: string; text: string }): "not_app_conversation" | HandoffRefusal | null {
    const id = this.handoffKeys.get(request.handoff); if (id === undefined) return "not_app_conversation";
    const m = this.store.list().find(e => e.conversationId === id); if (!m) return "not_app_conversation";
    const live = this.live.get(id), turn = this.handoffTurns.get(id);
    const running = !!live && !!turn && live.handoffKey === request.handoff && turn.turnId === live.turnId && live.accepted && live.busy && !live.terminal &&
      !live.closed && !live.failedPersistence && !this.quitting && m.state === "current";
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
    if (live.terminal) return;
    try {
      // A turned-off Fast is saved before its event: a failed index write then takes this persistence-failure path with
      // no notice saying Fast went off, and a failed append leaves Fast off without one.
      if (event.type === "fast.unused" && event.turnedOff) this.turnFastOff(id);
      // The agent may have taken a steered message without reporting it (only the uuid echo counts). Its end waits for
      // the group to go and the transcript to be read, so no read can follow the end (exited).
      // While an end is held, a later one (a Stop's) adds nothing: the turn is over and the held end is written.
      if (live.held && (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted")) return;
      if ((event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") && this.holdsEnd(id, live)) {
        live.held = { event, timer: setTimeout(() => this.writeHeld(id, live, false), HELD_END_MS) }; live.held.timer.unref?.();
        return;
      }
      const saved = this.append(id, live.turnId, event);
      const evidence = this.evidence.get(id);
      if (event.type === "activity" && event.kind === "edit" && event.path && evidence && evidence.endedAt === undefined) evidence.edits.add(event.path);
      const handoffTurn = this.handoffTurns.get(id);
      if (event.type === "activity" && event.kind === "edit" && event.path && handoffTurn?.turnId === live.turnId) handoffTurn.edits.add(event.path);
      if (event.type === "permission.request" || event.type === "question.request") (live.asking ??= new Set()).add(askingKey(event));
      else if (event.type === "permission.resolved" || event.type === "question.resolved") live.asking?.delete(askingKey(event));
      if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") { live.terminal = true; live.busy = false; live.done = event.type === "turn.done"; live.endedAt = Date.now(); delete live.asking; delete live.stage; delete live.stopping; this.endWork(id); this.dropSteers(id); this.ended(id, live, saved); }
    } catch (error) {
      live.failedPersistence = true; delete live.stage; console.error("doan: conversation event persistence failed", error); void live.runner?.close();
      this.endWork(id);
      this.dropSteers(id);
      // Its turn never ends, so it is never judged and must not hold its root, nor hand off.
      this.dropEvidence(id);
      this.dropHandoff(id);
      // No event says so, but the list's projectBusy and, once the process is gone, the phase change.
      this.changedOf(id);
      // A write after the process was gone (the exit's own turn.failed) leaves nothing to wait for.
      this.releaseFailed(id, live);
    }
  }
  // A turn whose history stopped taking writes can save no terminal event. Once its process is gone it ends as a failed
  // turn would: the conversation stops working, its queue comes back as a draft and the next send starts a new turn.
  // Reached from the group's exit callback too, so a hand-back that throws is only logged.
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
  // Each conversation's current turn for `doan work update` (conversationWork.ts): running from its acceptance until
  // its terminal event, archive, a history that stopped taking writes, or the quit. A send being prepared is not
  // running yet, so a previous turn's late update is dropped until the next turn is accepted.
  liveTurns(): ReadonlyMap<string, LiveTurn> {
    const roots = new Map(this.store.list().map(m => [m.conversationId, m.root]));
    const turns = new Map<string, LiveTurn>();
    for (const [id, live] of this.live) {
      const root = roots.get(id); if (root === undefined) continue;
      turns.set(id, { root, turnId: live.turnId, running: !this.quitting && live.accepted && live.busy && !live.terminal && !live.closed && !live.failedPersistence });
    }
    return turns;
  }
  // What holds Restart to Update back (update installGate): turns running as liveTurns counts them, and the permission
  // requests and questions they wait on. Memory only, since main asks on every conversation event. An archive or a
  // history that stopped taking writes ends a turn without clearing `asking`, so only a turn still open counts its
  // requests.
  restartHolds(): { liveTurns: number; pendingAnswers: number } {
    let liveTurns = 0, pendingAnswers = 0;
    for (const live of this.live.values()) {
      if (live.terminal || live.closed || live.failedPersistence) continue;
      if (!this.quitting && live.accepted && live.busy) liveTurns++;
      pendingAnswers += live.asking?.size ?? 0;
    }
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
    return { events, lastSeq: state.lastSeq, turn: state.turn, ...(pendingPermission ? { pendingPermission } : {}), ...(stage ? { stage } : {}) };
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
  // The grounds of this root's project turns not judged yet (running, or ended within the binding
  // window), for Move to Trash's busy check (canvasTrash.ts trashBusy). Exactly this root, as copies.
  projectEvidence(root: string): { edits: string[]; changed: string[] }[] {
    const now = Date.now();
    return [...this.evidence.values()]
      .filter(evidence => evidence.root === root && (evidence.endedAt === undefined || now < this.deadline(evidence.endedAt, evidence.exitedAt)))
      .map(evidence => ({ edits: [...evidence.edits], changed: [...evidence.changed] }));
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
      return conversationSummary(m, read, { live: this.ran(m.conversationId), queued, working, returned: !!this.drafts.returned(m.conversationId), ...(suggestion ? { suggestion } : {}), ...(background ? { background } : {}), ...(stopping ? { stopping: true as const } : {}),
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
  // What ipc needs to check a send's extras: the conversation's folder, its fixed provider and its owner kind.
  // The picker changed without a send. A running turn keeps the mode it was sent
  // with; the next send that names none and a queue flushed later use this one. ipc refuses it for a
  // legacy external conversation.
  setPermissionMode(id: string, permissionMode: PermissionModeId): void { this.storeMode(id, permissionMode); }
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
  async interrupt(id: string, turnId?: string): Promise<void> {
    this.metadata(id);
    const current = this.live.get(id);
    if (turnId !== undefined && current?.background && !current.busy) {
      const background = current.background;
      if (background.turnId !== turnId || background.stopping) return;
      current.background = { ...background, stopping: true }; this.changedOf(id);
      await current.runner?.stop();
      // Still there once the stop's own wait is over: the line's Stop comes back with its failure.
      if (this.live.get(id) === current && current.background && !current.exited) { current.background = background; this.changedOf(id); throw new Error("busy"); }
      return;
    }
    if (turnId !== undefined && current?.turnId !== turnId) return;
    this.cancelWait(id); const live = this.live.get(id);
    // Stop while the usage read after a limited turn runs: that turn is not sent again; its queue comes back below.
    if (live?.limitLookup) this.cancelLimit(id, live);
    // Stop while the queue waits to go out (for the judgement or the previous process) hands it back instead.
    if (live?.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); return; }
    // A send cancelled while it waited for the judgement or the previous process leaves the queue behind it nothing
    // to follow.
    if (!live || !live.busy) { this.giveBack(id, "interrupted"); return; }
    // A send not accepted yet has no turn to stop: it is cancelled, and refused at its next check (checkSend), before
    // anything reaches the runner. Its queued messages then come back as stopped (submit).
    if (!live.accepted && !live.failedPersistence) { live.cancelled = true; this.changedOf(id); return; }
    // A history that stopped taking writes takes no interrupted event: the Stop ends the closed run's group, and the
    // turn ends once it is gone (releaseFailed).
    if (!live.failedPersistence) { live.stopping = true; this.changedOf(id); }
    const stop = live.failedPersistence ? live.runner?.close() : live.runner?.stop(); if (live.busy) this.receive(id, { type: "interrupted", reason: "user" }); await stop;
  }
  // The preparation of a list read (models, project skills); a quit or a stop of the provider during it refuses the read and frees its lease.
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
  async readListing<T>(input: Prepared, read: ReadListing<T>): Promise<T> {
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
    // A scheduled send would go out on the account the person is leaving.
    for (const [id, schedule] of [...this.schedules]) if (schedule.provider === provider) this.giveBack(id, "interrupted");
    // Such a cancelled send leaves the queue accepted behind it nothing to follow; it comes back as interrupted. A quit
    // keeps it on disk for the next start instead.
    for (const [id, wait] of [...this.waits, ...this.judging]) if (wait.provider === provider) { this.cancelWait(id); this.giveBack(id, "interrupted"); }
    const closing: Promise<void>[] = [];
    for (const listing of this.listings) if (listing.provider === provider && listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.provider !== provider) continue;
      // A queue held for its judgement or for the previous process is the person's to send again, not this run's.
      if (live.holding && !live.busy) { this.release(id, live, live.holding); this.giveBack(id, "interrupted"); }
      if (live.limitLookup) { this.cancelLimit(id, live); this.giveBack(id, "interrupted"); }
      if (live.accepted && live.busy && !live.terminal) this.receive(id, { type: "interrupted", reason: "user" });
      // A held end is written once the group is gone, after the steers the transcript shows.
      if (live.accepted && !live.held) { live.terminal = true; live.busy = false; delete live.stage; }
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
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
    for (const id of [...this.evidence.keys()]) this.dropEvidence(id);
    // An unresolved handoff stays a request in the history, which the next start reads as cancelled.
    for (const id of [...this.handoffTurns.keys()]) this.dropHandoff(id);
    for (const wait of this.missedWaits.values()) clearTimeout(wait.timer);
    this.missedWaits.clear();
    for (const id of [...this.waits.keys(), ...this.judging.keys()]) this.cancelWait(id);
    for (const listing of this.listings) if (listing.cleanup) closing.push(listing.cleanup());
    // Before the appQuit writes: one that throws ends this loop, and the quit's failure is reported, but no
    // conversation's work content may outlive it.
    for (const id of this.live.keys()) this.endWork(id);
    for (const [id, live] of this.live) {
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
      if (live.held) { clearTimeout(live.held.timer); delete live.held; }
      if (live.accepted && live.busy && !live.terminal) this.append(id, live.turnId, { type: "interrupted", reason: "appQuit" });
      live.terminal = true; live.busy = false; delete live.stage;
      // Nothing more is written, but a message the agent already has must not come back from the queue at the next start.
      this.lookLater(id, live, false);
      this.dropSteers(id);
    }
    return Promise.all(closing).then(() => undefined);
  }
  // A folder listing of root was read again. changed: root-relative canvas paths whose files the watcher saw change since
  // the listing before. Project turns collect them while they run; one that ended is judged now.
  refreshed(root: string, changed: readonly string[]): void {
    for (const [id, evidence] of [...this.evidence]) {
      if (evidence.root !== root) continue;
      for (const path of changed) evidence.changed.add(path);
      if (evidence.endedAt !== undefined) this.judge(id);
    }
    for (const [id, turn] of [...this.handoffTurns]) if (turn.root === root && turn.state === "judging") this.judgeHandoff(id, true);
  }
  // A message sent while its conversation works waits in main, in drafts.json, until the turn ends.
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
    const turn = this.handoffTurns.get(id);
    if (live && !live.busy && !live.holding && !this.judging.has(id) && (this.evidence.get(id)?.endedAt !== undefined || (!!turn && this.handoffPending(turn)))) live.holding = {};
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
      // The prompt a send of this message would carry, Home's paragraph and guidance included.
      // A message steered into a handoff's first turn does not lift its limit. A turn that asked already may still hand
      // off to its other new canvases.
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
  // A send that waits for its usage limit (ipc routes it to schedule): an existing, current Doan Claude Code or Codex
  // conversation that is not working, while its connection's limit holds or its messages already wait for a reset.
  scheduling(id: string): boolean {
    const m = this.metadata(id);
    if (this.quitting || m.state !== "current") return false;
    const provider = m.owner.kind === "doan" ? m.owner.provider : m.session.runtime;
    return sendDecision({ provider, owner: m.owner.kind, start: false, limit: this.limitOf(m), working: this.working(id), scheduled: this.schedules.has(id), now: this.clock.now() }) === "schedule";
  }
  // The message waits in drafts.json as a queued one (a restart hands it back as a draft); only its send time is in
  // memory. ids: the attachment ids main holds for it, as for queue. busy: it is not a send that waits (scheduling).
  schedule(id: string, item: { text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; ids?: string[] }): { itemId: string; at: string } {
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
  // The reset of the limit a current Doan Claude Code or Codex conversation's connection holds now, else null.
  private limitOf(m: ConversationMetadata): number | null {
    if (m.owner.kind !== "doan" || m.state !== "current" || (m.owner.provider !== "claude" && m.owner.provider !== "codex")) return null;
    const connectionId = this.connectionOf(m.owner), entry = connectionId === undefined ? undefined : this.limits.get(connectionId);
    return entry && entry.resetsAt > this.clock.now() ? entry.resetsAt : null;
  }
  // A turn the usage limit stopped whose conversation may wait for the reset; its failure notice waits for the decision.
  private limitCandidate(id: string, event: EventPayload): boolean {
    if (event.type !== "turn.failed" || event.code !== "rate_limited" || this.quitting || !this.queueOptions.limitWindows) return false;
    const m = this.store.list().find(e => e.conversationId === id);
    return m?.state === "current" && m.owner.kind === "doan" && (m.owner.provider === "claude" || m.owner.provider === "codex");
  }
  // Reads the connection's usage after the turn (the runner started that read right after it emitted the end, so this
  // waits for it), then decides (settleLimit). The checks run again once the read is back (POSTMORTEM 2026-10-27
  // 'Awaited conversation work outlived its current turn'): an archive, a deletion or the quit took the queue already.
  private limitEnded(id: string, live: Live, saved: Extract<ConversationEvent, { type: "turn.failed" }>, resent: { reset: number; retried: boolean } | undefined): void {
    const m = this.store.list().find(e => e.conversationId === id); if (m?.owner.kind !== "doan") return;
    const owner = m.owner, read = this.queueOptions.limitWindows!;
    const lookup: LimitLookup = { turnId: saved.turnId, provider: owner.provider, connectionId: owner.connectionId, since: this.stops, saved, told: false };
    live.limitLookup = lookup;
    void (async () => {
      await Promise.resolve();
      let windows: readonly UsageWindow[] = [];
      // A read that failed tells no reset: the turn then fails as before, unless Claude Code's own message names one.
      try { windows = await read(owner.provider, owner.connectionId); } catch { windows = []; }
      // Whatever ended the lookup meanwhile (cancelLimit, the quit, a later turn) took the queue and the notice.
      if (this.quitting || this.live.get(id) !== live || live.limitLookup !== lookup || live.turnId !== lookup.turnId || this.stopped(lookup)) return;
      delete live.limitLookup;
      let settled = { armed: false, again: false };
      try { settled = this.settleLimit(id, owner, saved, windows, resent); }
      catch (error) { console.error("doan: a turn the usage limit stopped could not be scheduled", error); }
      try { if (!settled.armed) this.giveBack(id, this.connectionOf(owner) === owner.connectionId ? "turn_failed" : "interrupted"); }
      catch (error) { console.error("doan: queued messages could not be handed back", error); }
      // A turn whose own message goes out again did not end for the person; any other failure is told as before.
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
  // The reset from the usage read, else (Claude Code only) from its own limit message; the connection's limit; then
  // whether the turn's own message waits for it (autoSchedule) and whether the queue behind it does. armed: something
  // waits; again: the turn's own message is among it.
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
    const m = this.metadata(id); if (m.state !== "current") return none;
    const events = this.store.read(id).filter(e => e.turnId === saved.turnId);
    // A turn that also took a message by Send now holds more than one message of the person's: sending the first again
    // would drop the other, so it fails as before (the queue behind it still waits).
    const decision = events.filter(e => e.type === "user.message").length > 1 ? "none" : autoSchedule({ code: saved.code, hadActivity: turnHadActivity(events), reset, ...(previous !== undefined ? { previousReset: previous } : {}), retriedSame: resent?.retried ?? false, now });
    const at = decision === "retry" ? now + SEND_DELAY_MS : reset !== null && reset > now ? sendAt(reset) : null;
    if (at === null) return none;
    const again = decision !== "none" && this.requeue(id, saved.turnId, events);
    // The messages queued behind the turn wait for the same reset; the turn's own only when it did nothing.
    if (!this.drafts.queued(id).length) return none;
    this.arm(id, { at, reset: reset!, provider: owner.provider, connectionId: owner.connectionId, retried: decision === "retry" });
    return { armed: true, again };
  }
  // The turn's own message goes back to the front of the queue as the person wrote it: its text and anchors from the
  // history, its files issued again by path as Edit and resend does. Not a handoff's first message, which the agent
  // wrote. False when it cannot.
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
  // waits while the conversation still works (its stopped turn not judged yet) or another project conversation holds
  // the root, and goes once either ends (wakeDue).
  private sendDue(id: string, schedule: Schedule): void {
    if (this.schedules.get(id) !== schedule || this.quitting) return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (!m || m.state !== "current" || !this.drafts.queued(id).length) { this.disarm(id); this.changedOf(id); return; }
    if (this.working(id)) return;
    if (!m.canvas) { try { this.checkProject(m.root, id); } catch { return; } }
    this.disarm(id);
    this.resent.set(id, { reset: schedule.reset, retried: schedule.retried });
    let live = this.live.get(id);
    if (!live) { live = { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops }; this.live.set(id, live); }
    live.provider ??= schedule.provider;
    live.holding = {};
    if (!m.canvas) live.project = m.root;
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
    this.dropHandoff(id);
    this.store.delete(id);
    this.disarm(id); this.resent.delete(id);
    this.drafts.discard(id);
    const held = this.returnedHeld.get(id); this.returnedHeld.delete(id);
    if (held?.length) this.queueOptions.files?.release?.(held.map(h => h.id));
    try { this.deleted(id); } catch (error) { console.error("doan: deleted conversation cleanup failed", error); }
    this.changed(m.root);
  }
  // Working (the list's working): preparing, running or waiting for an answer, a turn waiting for its judgement, a queue
  // about to go out, or a send waiting for the previous process or for the judgement.
  private working(id: string): boolean {
    const live = this.live.get(id);
    const turn = this.handoffTurns.get(id);
    return !!live && (live.busy || !!live.holding || !!live.limitLookup) || this.waits.has(id) || this.judging.has(id) || this.evidence.get(id)?.endedAt !== undefined || (!!turn && this.handoffPending(turn));
  }
  // A turn's terminal event: queued messages go out after a done turn (a project turn's once it is judged) and come back
  // as a draft after a failed or stopped one; a project turn waits for its judgement.
  // A turn that asked for a handoff cancels it unless done; a done one is judged now, or once its canvas may be listed.
  // A turn the usage limit stopped keeps its queue until main read when the limit resets (limitEnded).
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
    if (turn?.requests.length && turn.state === undefined && turn.turnId === live.turnId) {
      if (type !== "turn.done") this.cancelHandoff(id, turn);
      else {
        turn.state = "judging"; turn.endedAt = live.endedAt ?? Date.now(); if (exitedAt !== undefined) turn.exitedAt = exitedAt;
        for (const request of turn.requests) request.state = "judging";
        this.armHandoff(id, turn);
        // The queue waits for the judgement: it follows the work to the next conversation if one starts.
        this.judgeHandoff(id, false);
        return;
      }
    }
    const evidence = this.evidence.get(id);
    if (evidence) {
      evidence.endedAt = live.endedAt ?? Date.now(); if (exitedAt !== undefined) evidence.exitedAt = exitedAt;
      this.armJudge(id, evidence);
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
      // A turn with a handoff taken and not resolved yet may have made any canvas new to it, every requested one included.
      const handoffs = [...this.handoffTurns.values()].filter(turn => turn.root === evidence.root && turn.requests.some(r => r.state !== "resolved"));
      const contested = listed.filter(row => others.some(other => !other.snapshot.some(old => sameCanvas(old, row))) ||
        handoffs.some(turn => turn.requests.some(r => r.path === row.path) || !turn.snapshot.some(old => sameCanvas(old, row))));
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
  // Taken and waiting for its judgement or its start; a request in a running turn waits for the turn's end instead.
  private handoffPending(turn: HandoffTurn): boolean { return turn.state === "judging" || turn.state === "starting"; }
  // settled: a folder refresh or the window's end came after the turn's end (handoff.ts handoffDecision). Each request is
  // judged on its own; none starts before all are decided, so a later refresh never judges a request that is starting.
  private judgeHandoff(id: string, settled: boolean): void {
    const turn = this.handoffTurns.get(id); if (turn?.state !== "judging") return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (!m || m.state !== "current") { this.cancelHandoff(id, turn); return; }
    let listed: Canvas[] | undefined;
    for (const request of turn.requests) {
      if (request.decision) continue;
      let decision: HandoffDecision;
      try {
        listed ??= this.snapshot(m.root);
        decision = handoffDecision({ done: true, path: request.path, listed, snapshot: turn.snapshot, ...(m.canvas ? { source: m.canvas } : {}), settled,
          current: canvas => this.store.list().some(e => e.state === "current" && e.root === m.root && !!e.canvas && sameCanvas(e.canvas, canvas)) });
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
    if (turn.state === "starting") void this.startHandoffs(id, turn, m);
  }
  // The decided starts, one at a time in request order. A cancel meanwhile (a stop, a sign-out, an archive) resolved the
  // ones left, and a quit dropped the turn: each start is checked again after the one before (POSTMORTEM 2026-10-27).
  private async startHandoffs(id: string, turn: HandoffTurn, m: ConversationMetadata): Promise<void> {
    for (const request of turn.requests) {
      if (this.handoffTurns.get(id) !== turn || turn.state !== "starting") return;
      if (request.state !== "starting" || request.decision?.kind !== "start") continue;
      await this.startHandoff(id, turn, request, m, request.decision.canvas);
    }
  }
  // The next conversation runs on the earlier one's provider, model, effort, Fast and permission mode as they are now.
  // It passes every check of a start; Last used is the person's choice and stays as it was.
  private async startHandoff(id: string, turn: HandoffTurn, request: HandoffRequest, m: ConversationMetadata, target: Canvas): Promise<void> {
    const origin: HandoffOrigin = { kind: "handoff", conversationId: id, canvas: m.canvas! };
    const provider = m.owner.kind === "doan" ? m.owner.provider : undefined, since = this.stops;
    let resolution: HandoffResolution;
    try {
      // The model's default level when it has no stored effort, as a queued turn's.
      const defaultEffort = m.model && !m.effort ? this.queueOptions.defaultEffort?.(m.root, m.session.runtime, m.model) : undefined;
      const { conversationId } = await this.start({ root: m.root, mode: "new", runtime: m.session.runtime, canvas: target, text: request.text, anchors: [], ...choice(m), ...fastOf(m), ...mode(m.permissionMode), ...(defaultEffort ? { defaultEffort } : {}) },
        undefined, { origin, requireNoCurrent: true, handoffText: request.text, turnId: turn.turnId, path: request.path });
      resolution = { outcome: "started", target: { conversationId, canvas: this.store.list().find(e => e.conversationId === conversationId)?.canvas ?? target } };
    } catch (error) {
      const code = reason(error);
      // A stop of its provider meanwhile is the person's cancel, whatever the start then failed with.
      resolution = code === "handoff_cancelled" || this.stopped({ ...(provider ? { provider } : {}), since }) ? { outcome: "cancelled" } : { outcome: "refused", reason: code };
    }
    // An archive meanwhile resolved it as cancelled already, and a quit dropped the turn.
    if (request.state !== "starting" || this.handoffTurns.get(id) !== turn) return;
    this.resolveHandoff(id, turn, request, resolution);
  }
  // The asking turn must still be the conversation's handoff turn: after a cancel, a restore and a later turn may ask
  // for the same path, whose request must not lend this start its state (POSTMORTEM 2026-10-27).
  private checkHandoffSource(id: string, turnId: string, path: string): void {
    const turn = this.handoffTurns.get(id), m = this.store.list().find(e => e.conversationId === id);
    const request = turn?.turnId === turnId ? turn.requests.find(r => r.path === path) : undefined;
    if (request?.state !== "starting" || m?.state !== "current") throw new Error("handoff_cancelled");
  }
  // Every request not resolved yet is cancelled: a turn that did not end done, a stop or sign-out of its provider, an
  // archive. Conversations already started stay.
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
  // Once, after the turn's last resolution. A queue held for the judgement follows a single started handoff to its
  // conversation, goes to this conversation after refusals or several requests as after any done turn, and comes back
  // as a draft after a cancel, as a stop hands it back (handoff.ts handoffQueueOutcome). Then one notice for the turn.
  private settleHandoff(id: string, turn: HandoffTurn): void {
    clearTimeout(turn.timer); delete turn.timer; turn.state = "resolved";
    const resolutions = turn.requests.flatMap(r => r.resolution ? [r.resolution] : []);
    const started = resolutions.flatMap(r => r.outcome === "started" ? [r.target] : []);
    const outcome = handoffQueueOutcome(resolutions.map(r => r.outcome));
    const live = this.live.get(id);
    if (outcome === "move") { this.moveQueue(id, started[0]!.conversationId); this.queueAfterEnd(started[0]!.conversationId); }
    if (live?.holding) {
      if (outcome === "source") this.flush(id, live);
      else { this.release(id, live, live.holding); if (outcome === "draft") this.giveBack(id, "interrupted"); }
    }
    for (const wake of turn.waiters.splice(0)) wake();
    this.changedOf(id);
    const notice = turn.source ? handoffNoticeKind({ root: turn.root, source: { conversationId: id, canvas: turn.source }, started }) : null;
    if (!notice) return;
    try { this.handedOff(notice); }
    catch (error) { console.error("doan: handoff could not be announced", error); }
  }
  // A queue moved to a conversation whose turn already ended (its first turn's end came before the start was accepted):
  // handled as that end handles a queue (ended), so nothing is left waiting. A usage-limit read that end started takes
  // the queue when it is over (limitEnded), and a send scheduled for the reset sends it then (sendDue). A conversation no
  // longer current, closed or whose history stopped taking writes gets it back as a draft, as an archive hands a queue
  // back: a send would restore an archived one over the canvas's current conversation.
  private queueAfterEnd(id: string): void {
    const live = this.live.get(id);
    if (!live?.terminal || live.busy || live.holding || live.limitLookup || this.schedules.has(id) || !this.drafts.queued(id).length) return;
    const m = this.store.list().find(e => e.conversationId === id);
    if (m?.state !== "current" || live.closed || live.failedPersistence) { this.giveBack(id, "interrupted"); return; }
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
  // The earlier conversation's queue follows the work: it goes out after the new conversation's first turn.
  private moveQueue(from: string, to: string): void {
    const moved = this.drafts.move(from, to);
    for (const item of moved) { const held = this.queuedExtras.get(item.itemId); if (held) held.owner = to; }
    if (moved.length) this.changedOf(from);
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
    this.suggestions.delete(id);
    this.endWork(id);
    const running = this.live.get(id);
    if (running) {
      running.terminal = true; running.busy = false; running.closed = true; delete running.holding; delete running.project; delete running.stage;
      this.cancelLimit(id, running);
      void running.runner?.close();
    }
    const turn = this.handoffTurns.get(id);
    if (turn && turn.state !== "resolved") this.cancelHandoff(id, turn);
    this.dropMissed(id);
    this.dropEvidence(id);
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
  // only while the conversation is still in Plan: a mode the person picked during the turn stays.
  private planApproved(id: string, live: Live, turnId: string, reported: PermissionModeId): void {
    if (this.live.get(id) !== live || live.turnId !== turnId || !live.accepted) return;
    if (this.store.list().find(e => e.conversationId === id)?.permissionMode !== "plan") return;
    try { this.storeMode(id, reported); } catch (error) { console.error("doan: the permission mode after a plan approval could not be saved", error); }
  }
  // A turn's suggestion counts only while nothing has moved past that turn: the same run and turn, ended done, no
  // later send started or waiting (a queue about to go out included), not archived, deleted or quitting
  // (POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
  private suggested(id: string, live: Live, turnId: string, text: string): void {
    if (this.quitting || this.live.get(id) !== live || live.turnId !== turnId || !live.accepted || !live.terminal || !live.done || live.busy ||
        live.closed || live.failedPersistence || live.holding || this.waits.has(id) || this.judging.has(id)) return;
    const m = this.store.list().find(e => e.conversationId === id); if (!m || m.state !== "current") return;
    // The turn's own connection: a later send that rebinds the owner has a new turnId, refused above. A legacy external
    // run has no doan connection to compare.
    if (m.owner.kind === "doan" && this.connections.has(m.owner.provider) && this.connections.get(m.owner.provider) !== m.owner.connectionId) return;
    this.suggestions.set(id, { text, root: m.root, ...(m.owner.kind === "doan" ? { provider: m.owner.provider, connectionId: m.owner.connectionId } : {}) });
    this.changed(m.root);
  }
  // A provider's connection now (undefined: signed out). A suggestion made on another connection of it no longer
  // belongs to what the person is signed into.
  // The same holds for a usage limit and the messages scheduled on it: a sign-out or replacement hands them back as a
  // draft at once.
  connectionChanged(provider: Provider, connectionId: string | undefined): void {
    this.connections.set(provider, connectionId);
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
  // Only a turn accepted in this run can still be running; a live entry left by a refused send is not one, and a turn an
  // earlier run left unfinished folds as crashed. Nor is a turn whose history stopped taking writes once its process is
  // gone: no terminal event can be saved for it, so it folds as ended with its pending requests expired.
  private ran(id: string): boolean { const live = this.live.get(id); return !!live?.accepted && !(live.failedPersistence && live.exited); }
  // At admission, and again right before acceptance, since the other conversation may have started meanwhile.
  private checkProject(root: string, exceptId?: string): void {
    const now = Date.now();
    // A turn whose window passed without its timer having run yet (a busy main loop) is judged before it is counted.
    for (const [id, evidence] of [...this.evidence]) if (evidence.endedAt !== undefined && now >= this.deadline(evidence.endedAt, evidence.exitedAt)) this.judge(id);
    // A turn not judged yet keeps its root even when the send that carried it was refused (its live entry no longer
    // counts), except while it waits for an answer.
    const asking = (id: string) => !!this.live.get(id)?.asking?.size;
    if (projectBusy(this.live, root, exceptId, now) || [...this.evidence].some(([id, evidence]) => id !== exceptId && evidence.root === root && !(evidence.endedAt === undefined && asking(id)))) throw new Error("project_busy");
  }
  private snapshot(root: string): Canvas[] { return this.canvases(root).map(c => c.id === undefined ? { path: c.path } : { path: c.path, id: c.id }); }
  private checkSend(id: string, live: Live, state: "current" | "archived"): void {
    if (this.quitting || this.live.get(id) !== live || live.terminal || live.cancelled || this.metadata(id).state !== state) throw new Error("busy");
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
    // The reservation goes first (POSTMORTEM 2026-10-27); a held end is written after the transcript was read.
    this.reservations = releaseReservation(this.reservations, id, "process_exited");
    this.waits.get(id)?.wake();
    const live = this.live.get(id); if (!live) return; live.exited = true; live.exitedAt = Date.now(); delete live.runner; delete live.stage;
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
  }
  // The finished turn's group is gone: its judgements need only the watcher now (promotionDeadline).
  private groupGone(id: string, live: Live): void {
    const evidence = this.evidence.get(id);
    if (evidence && evidence.turnId === live.turnId && evidence.endedAt !== undefined && evidence.exitedAt === undefined) { evidence.exitedAt = live.exitedAt ?? Date.now(); this.armJudge(id, evidence); }
    const turn = this.handoffTurns.get(id);
    if (turn && turn.turnId === live.turnId && turn.state === "judging" && turn.endedAt !== undefined && turn.exitedAt === undefined) { turn.exitedAt = live.exitedAt ?? Date.now(); this.armHandoff(id, turn); }
    const missed = this.missedWaits.get(live.turnId);
    if (missed?.id === id && missed.exitedAt === undefined) { missed.exitedAt = live.exitedAt ?? Date.now(); this.armMissed(live.turnId, missed); }
  }
  private deadline(endedAt: number, exitedAt?: number): number {
    return promotionDeadline({ endedAt, ...(exitedAt !== undefined ? { exitedAt } : {}), settle: PROMOTION_SETTLE_MS, grace: BIND_GRACE_MS });
  }
  private armJudge(id: string, evidence: Evidence): void {
    clearTimeout(evidence.timer);
    evidence.timer = setTimeout(() => this.judge(id), Math.max(0, this.deadline(evidence.endedAt!, evidence.exitedAt) - Date.now()));
    evidence.timer.unref?.();
  }
  private armHandoff(id: string, turn: HandoffTurn): void {
    clearTimeout(turn.timer);
    turn.timer = setTimeout(() => this.judgeHandoff(id, true), Math.max(0, this.deadline(turn.endedAt!, turn.exitedAt) - Date.now()));
    turn.timer.unref?.();
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
    wait.timer.unref?.();
  }
  // Checked again right before the write: an archive or a deletion meanwhile drops the wait, and store.append would
  // recreate a deleted history. A history that stopped taking writes takes none.
  private writeMissed(turnId: string): void {
    const wait = this.missedWaits.get(turnId); if (!wait) return;
    this.missedWaits.delete(turnId);
    const m = this.store.list().find(e => e.conversationId === wait.id), live = this.live.get(wait.id);
    if (this.quitting || !m?.canvas || m.state !== "current" || live?.failedPersistence) return;
    try {
      const missed = missedHandoffs({ root: wait.root, edits: wait.edits, listed: this.snapshot(wait.root), snapshot: wait.snapshot, requested: wait.requested, source: m.canvas,
        current: canvas => this.store.list().some(e => e.state === "current" && e.root === wait.root && !!e.canvas && sameCanvas(e.canvas, canvas)) });
      for (const canvas of missed) this.append(wait.id, turnId, { type: "handoff.missed", canvas });
    } catch (error) { console.error("doan: missed handoffs could not be saved", error); }
  }
  private dropMissed(id: string): void {
    for (const [turnId, wait] of [...this.missedWaits]) if (wait.id === id) { clearTimeout(wait.timer); this.missedWaits.delete(turnId); }
  }
  // Asks the runner to end a finished turn's process once per turn: the next send, a queue at the turn's end, or a
  // send waiting for a judgement. The runner chooses how (process.ts afterTurnCleanup).
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
  // An archive or quit ends the turn at once; a steer the transcript shows later leaves the queue unwritten, and an
  // archive hands the rest back then. True when there is something to look for.
  private lookLater(id: string, live: Live, giveBack: boolean): boolean {
    const steers = this.steering(id).map(([messageId, steer]) => ({ messageId, itemId: steer.itemId }));
    if (!live.transcript || live.exited || !steers.length) return false;
    clearTimeout(live.lookup?.timer);
    live.lookup = { steers, giveBack, timer: setTimeout(() => this.endLookup(id, live, false), HELD_END_MS) }; live.lookup.timer.unref?.();
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
  private sendTurn(id: string, live: Live, runner: Runner, prompt: string, attachments?: readonly AttachmentRecord[], turnChoice?: TurnChoice): void {
    const turn = live.turnId;
    void (turnChoice ? runner.send(prompt, turn, attachments, turnChoice) : attachments ? runner.send(prompt, turn, attachments) : runner.send(prompt, turn)).catch(error => {
      if (this.live.get(id) === live && live.turnId === turn) this.transportFailed(id, error);
    });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? error.message.slice(0, 4096) : "Transport failed" }); }
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
