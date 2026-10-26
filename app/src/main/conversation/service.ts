import { randomUUID } from "node:crypto";
import { ConversationStore, type ConversationMetadata } from "./store";
import { foldConversation } from "./state";
import { promoteReservation, releaseReservation, reserveSession } from "./ownership";
import { transportError } from "./transport";
import { sameCanvas } from "./sessions";
import { turnPrompt } from "./prompt";
import type { Anchor, Canvas, ConversationEvent, EventPayload, Reservation, Runtime } from "./types";
export interface StartRequest { root: string; mode: "resume" | "new" | "newDesign"; runtime?: Runtime; canvas?: Canvas; subject?: string; text: string; anchors: Anchor[] }
export interface Prepared { runtime: Runtime; configDir: string; cwd: string; sessionId?: string; command: string; env: NodeJS.ProcessEnv; lastCheckAt?: string }
export interface Runner { sessionId: string; send(prompt: string, turnId: string): Promise<void>; answer(requestId: string, optionId: string): boolean; stop(): Promise<void>; close(): Promise<void> }
export type OpenRunner = (input: Prepared, emit: (event: EventPayload) => void, exited: () => void, registerStop: (stop: () => Promise<void>) => void) => Promise<Runner>;
export type Prepare = (request: StartRequest, session?: ConversationMetadata["session"]) => Promise<Prepared>;
interface Live { turnId: string; busy: boolean; accepted: boolean; runner?: Runner; cleanup?: () => Promise<void>; terminal: boolean; events: EventPayload[]; failedPersistence: boolean; exited: boolean }
export class ConversationService {
  private reservations: Reservation[] = [];
  private live = new Map<string, Live>();
  private quitting = false;
  constructor(private store: ConversationStore, private prepare: Prepare, private open: OpenRunner, private publish: (event: ConversationEvent) => void, private admit: (root: string, canvas?: Canvas) => void = () => {}) {}
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
    this.admit(request.root, request.canvas);
    const id = randomUUID(); this.reserve(id);
    const live: Live = { turnId: randomUUID(), busy: true, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false }; this.live.set(id, live);
    let opening = false;
    try {
      const input = await this.prepare(request);
      if (this.quitting) throw new Error("busy");
      if (input.sessionId) this.promote(id, input, input.sessionId);
      opening = true;
      const runner = await this.open(input, event => this.receive(id, event), () => this.exited(id), stop => { live.cleanup = stop; if (this.quitting) void stop(); }); live.runner = runner;
      if (live.exited) throw new Error("process_exited");
      if (!input.sessionId) this.promote(id, input, runner.sessionId);
      if (input.sessionId && input.sessionId !== runner.sessionId) throw new Error("session_unavailable");
      if (this.quitting) throw new Error("busy");
      this.admit(request.root, request.canvas);
      const metadata: ConversationMetadata = { conversationId: id, root: request.root, ...(request.canvas ? { canvas: request.canvas } : {}), title: (request.subject ?? request.text).slice(0, 512), state: "current", session: { runtime: input.runtime, origin: request.mode === "resume" ? "resumed" : request.mode, sessionId: runner.sessionId, configDir: input.configDir, cwd: input.cwd } };
      const entries = this.store.list();
      const replaced = entries.filter(m => m.state === "current" && m.root === request.root && m.canvas && request.canvas && sameCanvas(m.canvas, request.canvas));
      this.store.save([...entries.map(m => replaced.includes(m) ? { ...m, state: "archived" as const } : m), metadata]);
      live.accepted = true;
      for (const old of replaced) this.archive(old.conversationId);
      this.append(id, live.turnId, { type: "user.message", text: request.text, anchors: request.anchors });
      this.append(id, live.turnId, { type: "turn.started" });
      for (const event of live.events.splice(0)) this.receive(id, event);
      const prompt = turnPrompt(request.anchors, request.text, metadata); if (prompt === null) throw new Error("bad_request");
      void runner.send(prompt, live.turnId).catch(error => this.transportFailed(id, error));
      return { conversationId: id };
    } catch (error) {
      if (!opening) { this.reservations = releaseReservation(this.reservations, id, "not_spawned"); this.live.delete(id); }
      else { void live.runner?.close(); }
      throw error instanceof Error && error.message === "outside_root" ? new Error("session_unavailable") : error;
    }
  }
  async send(id: string, text: string, anchors: Anchor[]): Promise<void> {
    const metadata = this.metadata(id); this.admit(metadata.root, metadata.canvas); if (metadata.state !== "current" || this.quitting) throw new Error("busy");
    const existing = this.live.get(id); if (existing?.busy || existing?.failedPersistence) throw new Error("busy");
    const live: Live = existing ?? { turnId: "", busy: false, accepted: false, terminal: false, events: [], failedPersistence: false, exited: false };
    live.busy = true; live.exited = false; live.terminal = false; live.accepted = false; live.turnId = randomUUID(); this.live.set(id, live);
    let reserved = false, opening = false;
    try {
      this.reserve(id, { ...metadata.session, command: "", env: {} }, metadata.session.runtime === "codex" && !!live.runner); reserved = true;
      const input = await this.prepare({ root: metadata.root, ...(metadata.canvas ? { canvas: metadata.canvas } : {}), mode: "resume", text, anchors }, metadata.session);
      if (this.quitting) throw new Error("busy");
      if (live.exited) throw new Error("process_exited");
      if (!live.runner) { opening = true; live.runner = await this.open(input, event => this.receive(id, event), () => this.exited(id), stop => { live.cleanup = stop; if (this.quitting) void stop(); }); }
      if (live.exited) throw new Error("process_exited");
      if (live.runner.sessionId !== metadata.session.sessionId) throw new Error("session_unavailable");
      this.admit(metadata.root, metadata.canvas);
      const prompt = turnPrompt(anchors, text, metadata); if (prompt === null) throw new Error("bad_request");
      this.append(id, live.turnId, { type: "user.message", text, anchors }); this.append(id, live.turnId, { type: "turn.started" }); live.accepted = true;
      for (const event of live.events.splice(0)) this.receive(id, event);
      void live.runner.send(prompt, live.turnId).catch(error => this.transportFailed(id, error));
    } catch (error) {
      live.busy = false;
      if (reserved && !opening && !live.runner) this.reservations = releaseReservation(this.reservations, id, "not_spawned");
      if (opening) void live.runner?.close(); throw error;
    }
  }
  receive(id: string, event: EventPayload): void {
    const live = this.live.get(id); if (!live || live.failedPersistence) return;
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
  private metadata(id: string): ConversationMetadata { const m = this.store.list().find(m => m.conversationId === id); if (!m) throw new Error("not_found"); return m; }
  private append(id: string, turn: string, event: EventPayload): void {
    const saved = this.store.append(id, turn, event);
    try { this.publish(saved); } catch (error) { console.error("doan: persisted conversation event could not be delivered", error); }
  }
  private archive(id: string): void {
    const live = this.live.get(id); void live?.runner?.close(); if (live?.busy) this.receive(id, { type: "interrupted", reason: "user" });
    this.append(id, live?.turnId ?? randomUUID(), { type: "conversation.archived" }); if (live) live.terminal = true;
  }
  private exited(id: string): void {
    this.reservations = releaseReservation(this.reservations, id, "process_exited");
    const live = this.live.get(id); if (!live) return; live.exited = true; delete live.runner;
    if (!live.accepted) this.live.delete(id);
    if (live.accepted && live.busy) this.receive(id, { type: "turn.failed", code: "process_exited" });
  }
  private transportFailed(id: string, error: unknown): void { this.receive(id, { type: "turn.failed", code: transportError(error instanceof Error ? error.message : ""), detail: error instanceof Error ? error.message.slice(0, 4096) : "Transport failed" }); }
}
