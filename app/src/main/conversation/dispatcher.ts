import { object } from "./sessions";
import { codexPermission, endTransport, initialTransport, normalizeCodex, normalizeCodexReply, permissionAnswer, steerTransport, type CodexContext, type CodexReplyOwner, type SteerResult } from "./transport";
import type { EventPayload, PendingPermission } from "./types";
// The server's own error answer to a pending request; timeouts, write failures and exit reject with a plain Error.
export class RpcError extends Error {}
interface Pending { owner?: CodexReplyOwner; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
export class CodexDispatcher {
  private state = initialTransport();
  private context: CodexContext = { root: "", sessionId: "", turnId: "" };
  private pending = new Map<string | number, Pending>();
  private permissions = new Map<string, { id: string | number; request: PendingPermission }>();
  private next = 1;
  private closed = false;
  // consumed: a steered message the server echoed in this turn, called in line with emit.
  constructor(private write: (value: unknown) => void, private emit: (value: EventPayload) => void, private cleanup: () => void, private consumed: (messageId: string) => void = () => {}) {}
  begin(context: CodexContext): void { this.expire(); this.context = context; this.state = initialTransport(); }
  started(turnId: string): void { this.context = { ...this.context, turnId }; }
  end(): void {
    if (this.closed) return;
    this.close();
    if (this.context.turnId) this.apply(endTransport(this.state));
  }
  request(method: string, params: unknown, owner?: CodexReplyOwner): Promise<unknown> { return this.call(method, params, owner, true); }
  // A turn that can still take a steered message: begun, not stopped and not ended.
  running(): boolean { return !this.closed && !this.state.terminal && !this.state.stop && !!this.context.turnId; }
  // turn/steer for messageId. The server may hold its reply while the turn waits on a permission answer, so an unanswered
  // steer refuses only itself: a timeout must not fail the protocol and with it the running turn.
  steer(params: unknown, messageId: string): Promise<unknown> {
    if (!this.running()) return Promise.reject(new Error("not_running"));
    this.state = steerTransport(this.state, messageId);
    return this.call("turn/steer", params, undefined, false);
  }
  private call(method: string, params: unknown, owner: CodexReplyOwner | undefined, failOnTimeout: boolean): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("process_exited"));
    const id = owner?.requestId ?? `doan-${this.next++}`;
    if (this.pending.has(id)) return Promise.reject(new Error("Duplicate RPC ID"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("RPC timeout")); if (failOnTimeout) this.fail(); }, 10_000);
      this.pending.set(id, { ...(owner ? { owner } : {}), resolve, reject, timer });
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
          const request = codexPermission(raw);
          if (!request || this.permissions.has(request.event.requestId)) { this.fail(); return; }
          this.permissions.set(request.event.requestId, { id, request });
        } else if (!this.reject(id)) return;
      }
      this.apply(result); return;
    }
    if ((typeof raw.id !== "string" && typeof raw.id !== "number") || ("result" in raw) === ("error" in raw) || ("error" in raw && !object(raw.error))) { this.fail(); return; }
    const pending = this.pending.get(raw.id); if (!pending) return;
    this.pending.delete(raw.id); clearTimeout(pending.timer);
    if ("error" in raw) {
      if (pending.owner) this.apply(normalizeCodexReply(this.state, raw, this.context, pending.owner));
      pending.reject(new RpcError(object(raw.error) && typeof raw.error.message === "string" ? raw.error.message : "RPC error"));
    } else pending.resolve(raw.result);
  }
  answer(requestId: string, option: string): boolean {
    const pending = this.permissions.get(requestId); if (!pending) return false;
    const answer = permissionAnswer(pending.request, option); if (!answer) return false;
    try { this.write(answer.response); } catch { this.fail(); return false; }
    this.permissions.delete(requestId); this.emit(answer.event); return true;
  }
  expire(): void {
    for (const [requestId, pending] of this.permissions) {
      this.permissions.delete(requestId); this.reject(pending.id);
      this.emit({ type: "permission.resolved", requestId, optionId: "expired" });
    }
  }
  stop(reason: "user" | "appQuit"): void { this.state = { ...this.state, stop: reason }; this.expire(); }
  close(): void {
    if (this.closed) return; this.closed = true; this.expire();
    // A protocol failure closes before the transport ends and end() then returns early, so the cache goes here.
    this.state = { ...this.state, fileSummaries: {} };
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("process_exited")); }
    this.pending.clear();
  }
  private apply(result: SteerResult): void {
    this.state = result.state;
    for (const id of result.consumed ?? []) this.consumed(id);
    for (const event of result.events) this.emit(event);
    if (result.state.terminal) this.expire();
  }
  private reject(id: string | number): boolean {
    try { this.write({ id, error: { code: -32601, message: "Unsupported request or unavailable owner." } }); return true; }
    catch { this.fail(); return false; }
  }
  private fail(): void { if (this.closed) return; this.close(); this.cleanup(); }
}
