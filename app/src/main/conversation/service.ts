import { randomUUID } from "node:crypto";
import { ConversationStore, type ConversationMetadata } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, releaseReservation, reserveSession } from "./ownership";
import { transportError } from "./transport";
import { sameCanvas } from "./sessions";
import { turnPrompt } from "./prompt";
import { BIND_GRACE_MS } from "./project";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import type { ModelOption } from "./models";
import type { Anchor, AttachmentRecord, Canvas, ConversationEvent, EventPayload, Reservation } from "./types";
// External (legacy) runs are claude or codex only; doan-account runs may use any app provider.
// model and effort: a choice from the list this run delivered (ipc checks it). attachments: files main rechecked just now.
export interface StartRequest { root: string; mode: "resume" | "new" | "newDesign"; runtime?: Provider; canvas?: Canvas; subject?: string; text: string; anchors: Anchor[]; model?: string; effort?: string; attachments?: AttachmentRecord[] }
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
}
// attachments: the turn's files, which only Antigravity also receives as image blocks. models: the provider's list for
// this folder, from a runner opened only to read it.
// A start's attachments, checked again right before acceptance (recheck throws attachment_missing with the missing
// ids) and marked sent just before the commit.
export interface StartAttachments { recheck(): AttachmentRecord[]; sent(): void }
export interface Runner { sessionId: string; send(prompt: string, turnId: string, attachments?: readonly AttachmentRecord[]): Promise<void>; answer(requestId: string, optionId: string): boolean; stop(): Promise<void>; close(): Promise<void>; models?(): Promise<ModelOption[]> }
export type OpenRunner = (input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<Runner>;
// use "listing": a model list read, which a sign-out stops without asking (agentAuth/manager.ts acquire).
export type Prepare = (request: StartRequest, stored?: ConversationMetadata, use?: "run" | "listing") => Promise<Prepared>;
// Reads a model list through a provider process opened only for that, reporting its spawn and disappearance as
// OpenRunner does; it never releases the lease itself.
export type ReadModels = (input: Prepared, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<ModelOption[]>;
function freeLease(input: Prepared | undefined): void {
  void input?.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// A Claude process ended about 0.75 s after turn.done, but its reservation held for 2.1-5.0 s after turn.done until the
// group was gone (packaged app, D1 2026-10-28). The wait allows twice the slowest observed.
const EXIT_WAIT_MS = 10_000;
// provider: set for a run on a doan account, whose lease a sign-out or replacement waits for (stopRuns).
// since: the stopRuns count when this start or send began; a later stop of its provider stops it once it spawns.
// endedAt: when the accepted turn's terminal event arrived, for binding.
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean; provider?: Provider; since: number; endedAt?: number }
// A model-list read: stopped by quit and by a stop of its provider like a run, holding its lease until its group is gone.
interface Listing { provider: Provider; since: number; cleanup?: () => Promise<void> }
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
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent) => void, private admit: (root: string, canvas?: Canvas) => Canvas | void = () => {}, private exitWaitMs = EXIT_WAIT_MS, private canvases: (root: string) => readonly Canvas[] = () => []) {}
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
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops }; this.live.set(id, live);
    let opening = false, input: Prepared | undefined;
    try {
      input = { ...await this.prepare(request), ...choice(request) };
      if (input.owner) live.provider = input.owner.provider;
      if (this.quitting) throw new Error("busy");
      if (input.sessionId) this.promote(id, input, input.sessionId);
      opening = true;
      const runner = await this.openRunner(id, live, input); live.runner = runner;
      if (live.exited) throw new Error("process_exited");
      input.recheck?.();
      if (!input.sessionId) this.promote(id, input, runner.sessionId);
      if (input.sessionId && input.sessionId !== runner.sessionId) throw new Error("session_unavailable");
      if (this.quitting) throw new Error("busy");
      const currentCanvas = this.admit(request.root, request.canvas);
      if (currentCanvas) request = { ...request, canvas: currentCanvas };
      const session = { runtime: input.runtime, origin: request.mode === "resume" ? "resumed" as const : request.mode, sessionId: runner.sessionId, configDir: input.configDir, cwd: input.cwd };
      // Home sends newDesign without FirstPrompt's subject; every turn of such a conversation carries Home's paragraph.
      const fromHome = request.mode === "newDesign" && request.subject === undefined;
      const base = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: (request.subject ?? request.text).slice(0, 512), state: "current" as const,
        ...choice(request), ...(fromHome ? { fromHome: true as const } : {}), ...(request.mode === "newDesign" ? { canvasesAtStart: this.canvases(request.root).map(c => c.id === undefined ? { path: c.path } : { path: c.path, id: c.id }) } : {}) };
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
      for (const old of replaced) {
        const running = this.live.get(old.conversationId);
        if (running) { running.terminal = true; running.busy = false; void running.runner?.close(); }
      }
      for (const event of saved) this.deliver(event);
      for (const event of live.events.splice(0)) this.receive(id, event);
      this.sendTurn(id, live, runner, prompt, attachments.length ? attachments : undefined);
      return { conversationId: id };
    } catch (error) {
      if (!opening) { this.reservations = releaseReservation(this.reservations, id, "not_spawned"); this.live.delete(id); freeLease(input); }
      else { void live.runner?.close(); }
      throw error instanceof Error && error.message === "outside_root" ? new Error("session_unavailable") : error;
    }
  }
  async send(id: string, text: string, anchors: Anchor[]): Promise<void> {
    // Only a send that waits yields here; any other runs up to its reservation in the caller's tick, as before.
    const exiting = this.previousExit(id); if (exiting) await exiting;
    let metadata = this.refreshCanvas(this.metadata(id)); if (metadata.state !== "current" || this.quitting) throw new Error("busy");
    const runtime = metadata.session.runtime;
    const existing = this.live.get(id); if (existing?.busy || existing?.failedPersistence) throw new Error("busy");
    const live: Live = (existing?.runner ? existing : undefined) ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: 0 };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; live.turnId = randomUUID(); live.since = this.stops; this.live.set(id, live);
    let reserved = false, opening = false, input: Prepared | undefined, leased = false;
    try {
      this.reserve(id, { ...metadata.session, runtime, command: "", env: {} }, runtime === "codex" && !!live.runner); reserved = true;
      input = { ...await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors }, metadata), ...choice(metadata) };
      if (input.owner) live.provider = input.owner.provider;
      this.checkSend(id, live);
      if (live.exited) throw new Error("process_exited");
      if (!live.runner) { opening = true; leased = true; live.runner = await this.openRunner(id, live, input); }
      if (live.exited) throw new Error("process_exited");
      if (live.runner.sessionId !== metadata.session.sessionId) throw new Error("session_unavailable");
      this.checkSend(id, live);
      input.recheck?.();
      metadata = this.refreshCanvas(this.metadata(id));
      // The same account signed in again under a new connection; judgeConnection already proved account, profile and session.
      const owner = input.owner;
      if (owner && metadata.owner.kind === "doan" && metadata.owner.connectionId !== owner.connectionId) {
        const rebound: ConversationMetadata = { ...metadata, owner, session: metadata.session };
        this.store.save(this.store.list().map(m => m.conversationId === id ? rebound : m)); metadata = rebound;
      }
      const prompt = turnPrompt(anchors, text, metadata, { home: metadata.fromHome === true }); if (prompt === null) throw new Error("bad_request");
      this.append(id, live.turnId, { type: "user.message", text, anchors }); this.append(id, live.turnId, { type: "turn.started" }); live.accepted = true;
      for (const event of live.events.splice(0)) this.receive(id, event);
      // A reused Codex server keeps the lease it opened with; this preparation's lease covered only the checks.
      if (!leased) freeLease(input);
      this.sendTurn(id, live, live.runner, prompt);
    } catch (error) {
      live.busy = false;
      if (reserved && !opening && !live.runner) this.reservations = releaseReservation(this.reservations, id, "not_spawned");
      if (!leased) freeLease(input);
      if (opening) void live.runner?.close(); throw error;
    }
  }
  // A finished turn's process may still be exiting, and its reservation keeps a second process off the session until
  // its group is gone. The send waits for that instead of refusing; every check in send runs again afterwards.
  private previousExit(id: string): Promise<void> | undefined {
    const live = this.live.get(id), metadata = this.store.list().find(m => m.conversationId === id);
    if (!metadata || metadata.state !== "current" || live?.busy || live?.failedPersistence || this.quitting || !this.reservations.some(r => r.owner === id)) return;
    if (metadata.session.runtime === "codex" && live?.runner) return;
    if (this.waits.has(id)) throw new Error("busy");
    return this.exitOf(id, live);
  }
  private async exitOf(id: string, live: Live | undefined): Promise<void> {
    let wake!: () => void;
    const woken = new Promise<void>(resolve => { wake = resolve; });
    const wait = { wake, cancelled: false, ...(live?.provider ? { provider: live.provider } : {}) };
    this.waits.set(id, wait);
    const timer = setTimeout(wake, this.exitWaitMs);
    try { await woken; } finally { clearTimeout(timer); this.waits.delete(id); }
    // Refused here, before send replaces the live entry: a replaced entry no longer matches the old process's exit
    // callback, which would then never release the reservation.
    if (wait.cancelled || this.reservations.some(r => r.owner === id)) throw new Error("busy");
  }
  private cancelWait(id: string): void { const wait = this.waits.get(id); if (wait) { wait.cancelled = true; wait.wake(); } }
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
      if (["turn.done", "turn.failed", "interrupted"].includes(event.type)) { live.terminal = true; live.busy = false; live.endedAt = Date.now(); }
    } catch (error) { live.failedPersistence = true; console.error("doan: conversation event persistence failed", error); void live.runner?.close(); }
  }
  read(id: string) {
    this.metadata(id); const events = this.store.read(id); const state = foldConversation(events, id, !this.live.has(id));
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
  answer(id: string, requestId: string, option: string): void { this.metadata(id); if (!this.live.get(id)?.runner?.answer(requestId, option)) throw new Error("stale"); }
  async interrupt(id: string): Promise<void> {
    this.metadata(id); this.cancelWait(id); const live = this.live.get(id); if (!live || !live.busy) return;
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
  async listModels(input: Prepared, read: ReadModels): Promise<ModelOption[]> {
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
    for (const [id, wait] of this.waits) if (wait.provider === provider) this.cancelWait(id);
    const closing: Promise<void>[] = [];
    for (const listing of this.listings) if (listing.provider === provider && listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.provider !== provider) continue;
      if (live.accepted && live.busy && !live.terminal) this.receive(id, { type: "interrupted", reason: "user" });
      if (live.accepted) { live.terminal = true; live.busy = false; }
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
    }
    await Promise.all(closing);
  }
  quit(): Promise<void> {
    const closing: Promise<void>[] = [];
    this.quitting = true;
    for (const id of this.waits.keys()) this.cancelWait(id);
    for (const listing of this.listings) if (listing.cleanup) closing.push(listing.cleanup());
    for (const [id, live] of this.live) {
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
      if (live.accepted && live.busy && !live.terminal) this.append(id, live.turnId, { type: "interrupted", reason: "appQuit" });
      live.terminal = true; live.busy = false;
    }
    return Promise.all(closing).then(() => undefined);
  }
  // A new canvas binds to the most recent unbound newDesign conversation of its folder that was not listed when that
  // conversation started, and only while its turn runs or just ended in this run: a request that made no canvas never
  // takes a canvas made later by something else.
  bind(root: string, canvas: Canvas): void {
    const entries = this.store.list(), now = Date.now();
    if (entries.some(m => m.root === root && m.state === "current" && m.canvas && sameCanvas(m.canvas, canvas))) return;
    const latest = entries.filter(m => m.root === root && !m.canvas && m.state === "current" && m.session.origin === "newDesign" &&
      m.canvasesAtStart !== undefined && !m.canvasesAtStart.some(c => sameCanvas(c, canvas)) && this.binding(m.conversationId, now)).at(-1);
    if (latest) this.store.save(entries.map(m => m === latest ? { ...m, canvas } : m));
  }
  private binding(id: string, now: number): boolean {
    const live = this.live.get(id);
    return !!live?.accepted && ((live.busy && !live.terminal) || (live.endedAt !== undefined && now - live.endedAt <= BIND_GRACE_MS));
  }
  private refreshCanvas(metadata: ConversationMetadata): ConversationMetadata {
    const canvas = this.admit(metadata.root, metadata.canvas);
    if (!canvas || !metadata.canvas || canvas.path === metadata.canvas.path) return metadata;
    if (!metadata.canvas.id || canvas.id !== metadata.canvas.id) throw new Error("canvas_not_found");
    const refreshed = { ...metadata, canvas };
    this.store.save(this.store.list().map(m => m.conversationId === metadata.conversationId ? refreshed : m));
    return refreshed;
  }
  private stopped(live: { provider?: Provider; since: number }): boolean { return !!live.provider && (this.lastStop.get(live.provider) ?? 0) > live.since; }
  private checkSend(id: string, live: Live): void {
    if (this.quitting || this.live.get(id) !== live || live.terminal || this.metadata(id).state !== "current") throw new Error("busy");
  }
  private metadata(id: string): ConversationMetadata { const m = this.store.list().find(m => m.conversationId === id); if (!m) throw new Error("not_found"); return m; }
  private append(id: string, turn: string, event: EventPayload): void {
    const saved = this.store.append(id, turn, event);
    this.deliver(saved);
  }
  private deliver(saved: ConversationEvent): void {
    try { this.publish(saved); } catch (error) { console.error("doan: persisted conversation event could not be delivered", error); }
  }
  private exited(id: string): void {
    this.reservations = releaseReservation(this.reservations, id, "process_exited");
    this.waits.get(id)?.wake();
    const live = this.live.get(id); if (!live) return; live.exited = true; delete live.runner;
    if (!live.accepted) this.live.delete(id);
    if (live.accepted && live.busy) this.receive(id, { type: "turn.failed", code: "process_exited" });
  }
  private sendTurn(id: string, live: Live, runner: Runner, prompt: string, attachments?: readonly AttachmentRecord[]): void {
    const turn = live.turnId;
    void (attachments ? runner.send(prompt, turn, attachments) : runner.send(prompt, turn)).catch(error => {
      if (this.live.get(id) === live && live.turnId === turn) this.transportFailed(id, error);
    });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? error.message.slice(0, 4096) : "Transport failed" }); }
}

function choice(source: { model?: string; effort?: string }): { model?: string; effort?: string } {
  return { ...(source.model ? { model: source.model } : {}), ...(source.effort ? { effort: source.effort } : {}) };
}

export function resolveListedCanvas(canvas: Canvas, listed: readonly Canvas[]): Canvas {
  const matches = listed.filter(row => canvas.id ? row.id === canvas.id : row.path === canvas.path);
  const match = matches.length === 1 ? matches[0] : undefined;
  if (!match) throw new Error("canvas_not_found");
  return canvas.id ? { id: canvas.id, path: match.path } : { path: canvas.path };
}
