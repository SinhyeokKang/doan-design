import { randomUUID } from "node:crypto";
import { ConversationStore, type ConversationMetadata } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, releaseReservation, reserveSession } from "./ownership";
import { transportError } from "./transport";
import { sameCanvas } from "./sessions";
import { turnPrompt } from "./prompt";
import type { ConversationOwner, Provider } from "../agentAuth/types";
import type { Anchor, Canvas, ConversationEvent, EventPayload, Reservation } from "./types";
// External (legacy) runs are claude or codex only; doan-account runs may use any app provider.
export interface StartRequest { root: string; mode: "resume" | "new" | "newDesign"; runtime?: Provider; canvas?: Canvas; subject?: string; text: string; anchors: Anchor[] }
export interface Prepared {
  runtime: Provider; configDir: string; cwd: string; sessionId?: string; command: string; env: NodeJS.ProcessEnv; lastCheckAt?: string;
  // Doan-account runs only: arguments ahead of the runner's own, the account the run uses, the lease to release once the
  // spawned group is gone, and a recheck that throws when the account changed during an await.
  args?: string[]; owner?: Extract<ConversationOwner, { kind: "doan" }>; release?: () => Promise<void>; recheck?: () => void;
  // ACP runs only: the authenticate method to select, and the callback for a completed request (Copilot's verification).
  authenticate?: string; confirm?: () => void;
}
export interface Runner { sessionId: string; send(prompt: string, turnId: string): Promise<void>; answer(requestId: string, optionId: string): boolean; stop(): Promise<void>; close(): Promise<void> }
export type OpenRunner = (input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<Runner>;
export type Prepare = (request: StartRequest, stored?: ConversationMetadata) => Promise<Prepared>;
function freeLease(input: Prepared | undefined): void {
  void input?.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// provider: set for a run on a doan account, whose lease a sign-out or replacement waits for (stopRuns).
// since: the stopRuns count when this start or send began; a later stop of its provider stops it once it spawns.
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean; provider?: Provider; since: number }
export class ConversationService {
  private reservations: Reservation[] = [];
  private live = new Map<string, Live>();
  private quitting = false;
  private stops = 0;
  private lastStop = new Map<Provider, number>();
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent) => void, private admit: (root: string, canvas?: Canvas) => Canvas | void = () => {}) {}
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
  async start(request: StartRequest): Promise<{ conversationId: string }> {
    if (this.quitting) throw new Error("busy");
    const admitted = this.admit(request.root, request.canvas);
    if (admitted) request = { ...request, canvas: admitted };
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: this.stops }; this.live.set(id, live);
    let opening = false, input: Prepared | undefined;
    try {
      input = await this.prepare(request);
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
      const base = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: (request.subject ?? request.text).slice(0, 512), state: "current" as const };
      const runtime = input.runtime;
      // Without an owner the run used an external profile, which exists only for the shared sessions' two runtimes.
      if (!input.owner && runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
      const metadata: ConversationMetadata = input.owner ? { ...base, owner: input.owner, session }
        : { ...base, owner: { kind: "legacy-external" }, session: { ...session, runtime: runtime === "claude" ? "claude" : "codex" } };
      const entries = this.store.list();
      const replaced = entries.filter(m => m.state === "current" && m.root === request.root && m.canvas && request.canvas && sameCanvas(m.canvas, request.canvas));
      const prompt = turnPrompt(request.anchors, request.text, metadata); if (prompt === null) throw new Error("bad_request");
      const writes: { id: string; turn: string; body: EventPayload }[] = [];
      for (const old of replaced) {
        const running = this.live.get(old.conversationId); const turn = running?.turnId || randomUUID();
        if (running?.accepted && running.busy && !running.terminal) writes.push({ id: old.conversationId, turn, body: { type: "interrupted", reason: "user" } });
        writes.push({ id: old.conversationId, turn, body: { type: "conversation.archived" } });
      }
      writes.push({ id, turn: live.turnId, body: { type: "user.message", text: request.text, anchors: request.anchors } }, { id, turn: live.turnId, body: { type: "turn.started" } });
      const saved = this.store.acceptStart([...entries.map(m => replaced.includes(m) ? { ...m, state: "archived" as const } : m), metadata], id, writes);
      live.accepted = true;
      for (const old of replaced) {
        const running = this.live.get(old.conversationId);
        if (running) { running.terminal = true; running.busy = false; void running.runner?.close(); }
      }
      for (const event of saved) this.deliver(event);
      for (const event of live.events.splice(0)) this.receive(id, event);
      this.sendTurn(id, live, runner, prompt);
      return { conversationId: id };
    } catch (error) {
      if (!opening) { this.reservations = releaseReservation(this.reservations, id, "not_spawned"); this.live.delete(id); freeLease(input); }
      else { void live.runner?.close(); }
      throw error instanceof Error && error.message === "outside_root" ? new Error("session_unavailable") : error;
    }
  }
  async send(id: string, text: string, anchors: Anchor[]): Promise<void> {
    let metadata = this.refreshCanvas(this.metadata(id)); if (metadata.state !== "current" || this.quitting) throw new Error("busy");
    const runtime = metadata.session.runtime;
    const existing = this.live.get(id); if (existing?.busy || existing?.failedPersistence) throw new Error("busy");
    const live: Live = (existing?.runner ? existing : undefined) ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false, since: 0 };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; live.turnId = randomUUID(); live.since = this.stops; this.live.set(id, live);
    let reserved = false, opening = false, input: Prepared | undefined, leased = false;
    try {
      this.reserve(id, { ...metadata.session, runtime, command: "", env: {} }, runtime === "codex" && !!live.runner); reserved = true;
      input = await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors }, metadata);
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
      const prompt = turnPrompt(anchors, text, metadata); if (prompt === null) throw new Error("bad_request");
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
      if (["turn.done", "turn.failed", "interrupted"].includes(event.type)) { live.terminal = true; live.busy = false; }
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
    this.metadata(id); const live = this.live.get(id); if (!live || !live.busy) return;
    const stop = live.runner?.stop(); if (live.busy) this.receive(id, { type: "interrupted", reason: "user" }); await stop;
  }
  // A sign-out or account replacement the user chose to stop runs for. The provider's doan-account runs end as a user
  // interruption; each lease is released once its group is gone (openRunner), which the auth attempt waits for. A run
  // still preparing or opening is stopped as soon as it spawns. External runs hold no lease and are left alone.
  async stopRuns(provider: Provider): Promise<void> {
    this.stops += 1; this.lastStop.set(provider, this.stops);
    const closing: Promise<void>[] = [];
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
    for (const [id, live] of this.live) {
      if (live.runner) closing.push(live.runner.close()); else if (live.cleanup) closing.push(live.cleanup());
      if (live.accepted && live.busy && !live.terminal) this.append(id, live.turnId, { type: "interrupted", reason: "appQuit" });
      live.terminal = true; live.busy = false;
    }
    return Promise.all(closing).then(() => undefined);
  }
  bind(root: string, canvas: Canvas): void {
    const entries = this.store.list(); const first = entries.find(m => m.root === root && !m.canvas && m.state === "current" && m.session.origin === "newDesign");
    if (first && !entries.some(m => m.root === root && m.state === "current" && m.canvas && sameCanvas(m.canvas, canvas))) this.store.save(entries.map(m => m === first ? { ...m, canvas } : m));
  }
  private refreshCanvas(metadata: ConversationMetadata): ConversationMetadata {
    const canvas = this.admit(metadata.root, metadata.canvas);
    if (!canvas || !metadata.canvas || canvas.path === metadata.canvas.path) return metadata;
    if (!metadata.canvas.id || canvas.id !== metadata.canvas.id) throw new Error("canvas_not_found");
    const refreshed = { ...metadata, canvas };
    this.store.save(this.store.list().map(m => m.conversationId === metadata.conversationId ? refreshed : m));
    return refreshed;
  }
  private stopped(live: Live): boolean { return !!live.provider && (this.lastStop.get(live.provider) ?? 0) > live.since; }
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
    const live = this.live.get(id); if (!live) return; live.exited = true; delete live.runner;
    if (!live.accepted) this.live.delete(id);
    if (live.accepted && live.busy) this.receive(id, { type: "turn.failed", code: "process_exited" });
  }
  private sendTurn(id: string, live: Live, runner: Runner, prompt: string): void {
    const turn = live.turnId;
    void runner.send(prompt, turn).catch(error => {
      if (this.live.get(id) === live && live.turnId === turn) this.transportFailed(id, error);
    });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? error.message.slice(0, 4096) : "Transport failed" }); }
}

export function resolveListedCanvas(canvas: Canvas, listed: readonly Canvas[]): Canvas {
  const matches = listed.filter(row => canvas.id ? row.id === canvas.id : row.path === canvas.path);
  const match = matches.length === 1 ? matches[0] : undefined;
  if (!match) throw new Error("canvas_not_found");
  return canvas.id ? { id: canvas.id, path: match.path } : { path: canvas.path };
}
