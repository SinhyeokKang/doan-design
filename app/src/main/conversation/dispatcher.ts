import { object } from "./sessions";
import { codexPermission, codexQuestionReply, endTransport, initialTransport, normalizeCodex, normalizeCodexReply, permissionAnswer, steerTransport, storedAnswers, type CodexContext, type CodexReplyOwner, type SteerResult } from "./transport";
import { questionAnswer } from "./questionAnswer";
import type { Question, QuestionAnswerInput } from "./question";
import type { BoundaryKind } from "./commandRecords";
import type { EventPayload, PendingPermission, TurnStage } from "./types";
// The server's own error answer to a pending request; timeouts, write failures and exit reject with a plain Error.
// code: the JSON-RPC error code, which tells an unknown method (-32601) apart whatever the server's wording.
export class RpcError extends Error { constructor(message: string, readonly code?: number) { super(message); } }
// steered: the message a turn/steer carries, dropped when the server refuses it.
interface Pending { owner?: CodexReplyOwner; steered?: string; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
export class CodexDispatcher {
  private state = initialTransport();
  private context: CodexContext = { root: "", sessionId: "", turnId: "" };
  private pending = new Map<string | number, Pending>();
  private permissions = new Map<string, { id: string | number; request: PendingPermission }>();
  // Async questions: the server waits for no reply, only for a turn/steer, so nothing is written when one expires.
  private questions = new Map<string, Question[]>();
  private next = 1;
  private closed = false;
  // consumed: a steered message the server echoed, called in line with emit. stage: the turn's stage after a notification,
  // called after its events. boundary: the turn's compaction completed, called in line with emit.
  constructor(private write: (value: unknown) => void, private emit: (value: EventPayload) => void, private cleanup: () => void, private consumed: (messageId: string) => void = () => {}, private stage: (stage: TurnStage) => void = () => {}, private boundary: (kind: BoundaryKind) => void = () => {}) {}
  begin(context: CodexContext): void { this.expire(); this.context = context; this.state = initialTransport(); }
  started(turnId: string): void { this.context = { ...this.context, turnId }; }
  end(): void {
    if (this.closed) return;
    this.close();
    if (this.context.turnId) this.apply(endTransport(this.state));
  }
  request(method: string, params: unknown, owner?: CodexReplyOwner): Promise<unknown> { return this.call(method, params, owner, true); }
  // A request beside the conversation (a usage read): an unanswered one refuses only itself, never the running turn.
  query(method: string, params: unknown): Promise<unknown> { return this.call(method, params, undefined, false); }
  // A turn that can still take a steered message: begun, not stopped and not ended.
  running(): boolean { return !this.closed && !this.state.terminal && !this.state.stop && !!this.context.turnId; }
  // An unanswered steer refuses only itself (the server may hold its reply behind a permission answer), never the turn.
  // Reply and echo are unordered, so the message can be consumed before this resolves or after a timeout.
  steer(params: unknown, messageId: string): Promise<unknown> {
    if (!this.running()) return Promise.reject(new Error("not_running"));
    this.state = steerTransport(this.state, messageId);
    return this.call("turn/steer", params, undefined, false, messageId);
  }
  private call(method: string, params: unknown, owner: CodexReplyOwner | undefined, failOnTimeout: boolean, steered?: string): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("process_exited"));
    const id = owner?.requestId ?? `doan-${this.next++}`;
    if (this.pending.has(id)) return Promise.reject(new Error("Duplicate RPC ID"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("RPC timeout")); if (failOnTimeout) this.fail(); }, 10_000);
      this.pending.set(id, { ...(owner ? { owner } : {}), ...(steered ? { steered } : {}), resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); this.fail(); }
    });
  }
  receive(raw: unknown): void {
    if (this.closed) return;
    if (!object(raw)) { this.fail(); return; }
    if ("id" in raw && (typeof raw.id !== "string" && (typeof raw.id !== "number" || !Number.isSafeInteger(raw.id)))) { this.fail(); return; }
    if ("method" in raw) {
      if (typeof raw.method !== "string" || !object(raw.params) || "result" in raw) { this.fail(); return; }
      const result = normalizeCodex(this.state, raw, this.context);
      if (result.request) {
        const { id, disposition } = result.request;
        if (disposition === "permission") {
          const request = codexPermission(raw, undefined, this.context.labels);
          if (!request || this.permissions.has(request.event.requestId)) { this.fail(); return; }
          this.permissions.set(request.event.requestId, { id, request });
        } else if (result.request.disposition === "decline") {
          // A server id a held permission still owns would get a second response when that permission is answered.
          if ([...this.permissions.values()].some(held => held.id === id)) { this.fail(); return; }
          try { this.write(result.request.response); } catch { this.fail(); return; }
        } else if (!this.reject(id)) return;
      }
      if (result.question) this.questions.set(result.question.requestId, result.question.questions);
      this.apply(result); return;
    }
    if ((typeof raw.id !== "string" && typeof raw.id !== "number") || ("result" in raw) === ("error" in raw) || ("error" in raw && !object(raw.error))) { this.fail(); return; }
    const pending = this.pending.get(raw.id); if (!pending) return;
    this.pending.delete(raw.id); clearTimeout(pending.timer);
    if ("error" in raw) {
      if (pending.owner) this.apply(normalizeCodexReply(this.state, raw, this.context, pending.owner));
      // Dropped here, not in a rejection handler: an echo later in the same chunk is received before those run.
      if (pending.steered && this.state.steered) this.state = { ...this.state, steered: this.state.steered.filter(id => id !== pending.steered) };
      const error = object(raw.error) ? raw.error : {};
      pending.reject(new RpcError(typeof error.message === "string" ? error.message : "RPC error", typeof error.code === "number" ? error.code : undefined));
    } else pending.resolve(raw.result);
  }
  answer(requestId: string, option: string): boolean {
    const pending = this.permissions.get(requestId); if (!pending) return false;
    const answer = permissionAnswer(pending.request, option); if (!answer) return false;
    try { this.write(answer.response); } catch { this.fail(); return false; }
    this.permissions.delete(requestId); this.emit(answer.event); return true;
  }
  // The answer is steered without a clientUserMessageId: its echo is the question's answer, not a message of the thread.
  // A refused or unanswered steer refuses only itself; the turn's end then ends the wait.
  answerQuestion(requestId: string, given: QuestionAnswerInput): "ok" | "stale" | "bad_request" {
    const questions = this.questions.get(requestId); if (!questions || !this.running()) return "stale";
    const answer = questionAnswer(questions, given); if (!answer) return "bad_request";
    this.questions.delete(requestId);
    this.call("turn/steer", { threadId: this.context.sessionId, expectedTurnId: this.context.turnId, input: [{ type: "text", text: codexQuestionReply(questions, answer) }] }, undefined, false).catch(() => {});
    this.emit({ type: "question.resolved", requestId, outcome: answer.outcome, ...(answer.outcome === "answered" ? { answers: storedAnswers(questions, answer) } : {}) });
    return "ok";
  }
  expire(): void {
    for (const requestId of this.questions.keys()) {
      this.questions.delete(requestId);
      this.emit({ type: "question.resolved", requestId, outcome: "expired" });
    }
    for (const [requestId, pending] of this.permissions) {
      this.permissions.delete(requestId); this.reject(pending.id);
      this.emit({ type: "permission.resolved", requestId, optionId: "expired" });
    }
  }
  stop(reason: "user" | "appQuit"): void { this.state = { ...this.state, stop: reason }; this.expire(); }
  // The leader has exited. Its bounded output drain now decides which requests received no reply.
  clearDeadlines(): void { for (const entry of this.pending.values()) clearTimeout(entry.timer); }
  close(): void {
    if (this.closed) return; this.closed = true; this.expire();
    // A protocol failure closes before the transport ends and end() then returns early, so the cache goes here.
    this.state = { ...this.state, fileSummaries: {} };
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("process_exited")); }
    this.pending.clear();
  }
  private apply(result: SteerResult & { boundary?: BoundaryKind }): void {
    this.state = result.state;
    for (const id of result.consumed ?? []) this.consumed(id);
    for (const event of result.events) this.emit(event);
    if (result.boundary) this.boundary(result.boundary);
    if (result.stage) this.stage(result.stage);
    if (result.state.terminal) this.expire();
  }
  private reject(id: string | number): boolean {
    try { this.write({ id, error: { code: -32601, message: "Unsupported request or unavailable owner." } }); return true; }
    catch { this.fail(); return false; }
  }
  private fail(): void { if (this.closed) return; this.close(); this.cleanup(); }
}
