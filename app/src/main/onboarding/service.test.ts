import { describe, expect, it, vi } from "vitest";
import type { OnboardingRequest, OnboardingResponse, OnboardingState } from "../../formats/types";
import { validateOnboardingResponse } from "../../formats/validate";
import { AUTH_CHANNELS, AuthIpc, type AuthBackend, type AuthSnapshot } from "../agentAuth/ipc";
import { initialAuthState, transition } from "../agentAuth/state";
import { PROVIDERS, type AccountConnection, type AuthEvent, type AuthState, type Provider, type ToolFacts } from "../agentAuth/types";
import { ONBOARDING_CHANNELS, OnboardingService, rendererRequest } from "./service";

const MAIN = 7;
// Shared across setups so a second service, like an app restart, never repeats a session id.
let ids = 0;
const TOKEN = "t".repeat(64);
const ready: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const claude: AccountConnection = { provider: "claude", connectionId: "conn-secret", profile: "claude", account: { id: "acct-secret", workspace: "org-1", email: "ada@example.com", displayName: "Ada" } };

// A backend whose states move only through agent-auth's real transitions, like AuthManager's.
function backend() {
  const states = new Map<Provider, AuthState>(PROVIDERS.map(p => [p, initialAuthState(p, null)]));
  let ids = 0;
  let changed = () => {};
  const apply = (provider: Provider, event: AuthEvent) => {
    const result = transition(states.get(provider)!, event);
    if (result.ok && result.outcome === "applied") { states.set(provider, result.state); changed(); }
    return result;
  };
  const started = (provider: Provider, event: AuthEvent) => {
    const result = apply(provider, event);
    return result.ok ? { ok: true as const, attemptId: "attemptId" in event ? event.attemptId : "", done: Promise.resolve(result.state) } : { ok: false as const, reason: result.reason, state: result.state };
  };
  const running = new Set<Provider>();
  const api: AuthBackend = {
    state: provider => states.get(provider)!,
    check: vi.fn(async provider => started(provider, { type: "check", attemptId: `check-${++ids}` })),
    signIn: vi.fn(async (provider, owner, options) => {
      if (states.get(provider)!.attempt?.kind === "signIn" || [...states.values()].some(s => s.attempt && s.attempt.kind !== "check")) return { ok: false as const, reason: "busy" as const, state: states.get(provider)! };
      if (running.has(provider) && !options.stop) return { ok: false as const, reason: "stop_required" as const, state: states.get(provider)! };
      return started(provider, { type: "signIn", attemptId: `sign-${++ids}`, owner });
    }),
    cancel: vi.fn(async (provider, attemptId, owner) => apply(provider, { type: "cancel", attemptId, owner })),
    submitCode: vi.fn(() => ({ ok: true as const })),
    signOut: vi.fn(async (provider, options) => started(provider, { type: "signOut", attemptId: `out-${++ids}`, running: false, stop: options.stop === true })),
  };
  return { api, apply, states, running, onChange(listener: () => void) { changed = listener; } };
}

function setup(options: { completed?: boolean; auth?: boolean; owner?: number | null; read?: () => Promise<AuthSnapshot> } = {}) {
  const b = backend();
  const openExternal = vi.fn(async (_url: string) => {});
  const published: OnboardingState[] = [];
  let service: OnboardingService | undefined;
  const ipc = new AuthIpc({ backend: b.api, probe: async () => ready, openExternal, publish: snapshot => service?.authChanged(snapshot), prompt: vi.fn() });
  b.onChange(() => ipc.changed());
  const auth = options.auth === false ? null : options.read ? { read: options.read, latest: () => ipc.latest(), handle: ipc.handle.bind(ipc) } : ipc;
  let completed = options.completed ?? false;
  service = new OnboardingService({
    auth, mainOwner: () => options.owner === undefined ? MAIN : options.owner, completed: () => completed,
    publish: state => published.push(state), newId: () => `id-${++ids}`, snapshotWaitMs: 50,
  });
  const ask = async (request: Record<string, unknown>): Promise<OnboardingResponse> => {
    const response = await service!.answer({ v: 2, token: TOKEN, ...request } as OnboardingRequest);
    expect(validateOnboardingResponse(response), JSON.stringify(validateOnboardingResponse.errors ?? response)).toBe(true);
    return response;
  };
  const prompt = (provider: Provider, attemptId: string, url = `https://example.com/${attemptId}`) => {
    const event = { provider, attemptId, owner: MAIN, url };
    ipc.prompted(event); service!.prompted(event);
  };
  return { b, ipc, service, ask, published, openExternal, prompt, complete(value: boolean) { completed = value; } };
}

async function session(t: ReturnType<typeof setup>): Promise<string> {
  const started = await t.ask({ op: "start" });
  if (!started.ok || started.op !== "start") throw new Error("start failed");
  return started.result.sessionId;
}
function operation(response: OnboardingResponse) {
  if (!response.ok || !("operation" in response.result)) throw new Error(`no operation: ${JSON.stringify(response)}`);
  return response.result.operation;
}
function state(response: OnboardingResponse): OnboardingState {
  if (!response.ok || !("sessionId" in response.result)) throw new Error(`no state: ${JSON.stringify(response)}`);
  return response.result;
}

describe("onboarding session", () => {
  it("starts without a project and answers secret-free agent statuses", async () => {
    const t = setup();
    t.b.states.set("claude", initialAuthState("claude", claude));
    const started = state(await t.ask({ op: "start" }));
    expect(started).toMatchObject({ revision: 0, completed: false, project: null, operations: [] });
    expect(started.agents?.providers.map(p => p.provider)).toEqual([...PROVIDERS]);
    expect(started.agents?.providers[0]).toEqual({ provider: "claude", phase: "connected", readiness: { ready: false, cause: "unverified", action: "retry" }, error: null, actions: ["retry", "signOut"] });
    expect(JSON.stringify(started)).not.toMatch(/ada@example.com|"Ada"|acct-secret|conn-secret|attempt/);
  });

  it("reuses the session on every start, and a new app process makes the old one stale", async () => {
    const t = setup();
    const id = await session(t);
    expect(state(await t.ask({ op: "start" })).sessionId).toBe(id);
    expect(state(await t.ask({ op: "status", sessionId: id })).sessionId).toBe(id);
    const restarted = setup();
    expect(await restarted.ask({ op: "status", sessionId: id })).toEqual({ v: 2, ok: false, error: { code: "session_stale", message: expect.any(String) } });
    expect(await restarted.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" })).toMatchObject({ ok: false, error: { code: "session_stale" } });
    expect(restarted.b.api.signIn).not.toHaveBeenCalled();
  });

  it("answers completion from the marker and keeps writes open after it", async () => {
    const t = setup({ completed: true });
    const id = await session(t);
    expect(state(await t.ask({ op: "status", sessionId: id })).completed).toBe(true);
    expect(operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "codex" }))).toMatchObject({ kind: "sign_in", state: "pending" });
    expect(state(await t.ask({ op: "start" })).completed).toBe(true);
  });

  it("reports unreadable account storage as null agents and refuses auth writes", async () => {
    const t = setup({ auth: false });
    const id = await session(t);
    expect(state(await t.ask({ op: "status", sessionId: id })).agents).toBeNull();
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" })).toMatchObject({ ok: false, error: { code: "auth_unavailable" } });
    expect(await t.ask({ op: "check", sessionId: id, requestId: "r2", provider: "claude" })).toMatchObject({ ok: false, error: { code: "auth_unavailable" } });
  });

  it("does not wait past its limit for the first tool probe", async () => {
    const t = setup({ read: () => new Promise<AuthSnapshot>(() => {}) });
    const before = Date.now();
    const started = state(await t.ask({ op: "start" }));
    expect(Date.now() - before).toBeLessThan(1000);
    expect(started.agents?.providers).toHaveLength(PROVIDERS.length);
  });

  it("narrows status to one operation and refuses an unknown one", async () => {
    const t = setup();
    const id = await session(t);
    const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    await t.ask({ op: "check", sessionId: id, requestId: "r2", provider: "codex" });
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations).toEqual([op]);
    expect(await t.ask({ op: "status", sessionId: id, operationId: "nope" })).toMatchObject({ ok: false, error: { code: "operation_not_found" } });
  });
});

describe("sign-in through the session", () => {
  it("owns a CLI sign-in by the main window and reports the same revision to the UI", async () => {
    const t = setup();
    const id = await session(t);
    const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    expect(op).toMatchObject({ requestId: "r1", kind: "sign_in", state: "pending", provider: "claude" });
    expect(t.b.api.signIn).toHaveBeenCalledWith("claude", MAIN, { stop: false });
    expect(t.b.states.get("claude")!.attempt).toMatchObject({ kind: "signIn", owner: MAIN });
    const status = state(await t.ask({ op: "status", sessionId: id }));
    expect(status.revision).toBeGreaterThan(0);
    expect(t.published.at(-1)).toEqual({ ...status, agents: t.published.at(-1)!.agents });
    expect(t.published.at(-1)!.revision).toBe(status.revision);
  });

  it("returns the original operation for a resent requestId and refuses the same id with other arguments", async () => {
    const t = setup();
    const id = await session(t);
    const first = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    expect(operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" })).operationId).toBe(first.operationId);
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "codex" })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
    expect(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
    expect(t.b.api.signIn).toHaveBeenCalledTimes(1);
    expect(state(await t.ask({ op: "status", sessionId: id })).operations).toHaveLength(1);
  });

  it("answers two identical requests in flight with one operation", async () => {
    const t = setup();
    const id = await session(t);
    const request = { op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" };
    const [a, b] = await Promise.all([t.ask(request), t.ask(request)]);
    expect(operation(a).operationId).toBe(operation(b).operationId);
    expect(t.b.api.signIn).toHaveBeenCalledTimes(1);
  });

  it("returns busy and stop_required unchanged and records no operation", async () => {
    const t = setup();
    const id = await session(t);
    await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" });
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r2", provider: "codex" })).toMatchObject({ ok: false, error: { code: "busy" } });
    t.b.running.add("cursor");
    t.b.apply("claude", { type: "cancel", attemptId: "sign-1", owner: MAIN }); t.b.apply("claude", { type: "settled", attemptId: "sign-1" });
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r3", provider: "cursor" })).toMatchObject({ ok: false, error: { code: "stop_required" } });
    const ops = state(await t.ask({ op: "status", sessionId: id })).operations;
    expect(ops.map(o => o.requestId)).toEqual(["r1"]);
    // A refused request leaves no record: the same id is judged again.
    t.b.running.delete("cursor");
    expect(operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r3", provider: "cursor" }))).toMatchObject({ provider: "cursor" });
  });

  it("refuses a sign-in while there is no main window", async () => {
    const t = setup({ owner: null });
    const id = await session(t);
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" })).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(t.b.api.signIn).not.toHaveBeenCalled();
  });

  it("follows the attempt to awaiting_user and opens the first link only for Claude, Codex and Antigravity", async () => {
    for (const provider of PROVIDERS) {
      const t = setup();
      const id = await session(t);
      const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider }));
      t.prompt(provider, "sign-1", "https://example.com/first");
      t.prompt(provider, "sign-1", "https://example.com/second");
      expect(t.service.snapshot().operations[0]!.state).toBe("awaiting_user");
      await new Promise(resolve => setTimeout(resolve, 0));
      const opens = ["claude", "codex", "antigravity"].includes(provider) ? [["https://example.com/first"]] : [];
      expect(t.openExternal.mock.calls, provider).toEqual(opens);
      expect(op.provider).toBe(provider);
    }
  });

  it("never opens a link for a sign-in the window started itself", async () => {
    const t = setup();
    await session(t);
    const started = await t.ipc.handle(AUTH_CHANNELS.signIn, { provider: "claude" }, MAIN);
    expect(started).toMatchObject({ ok: true });
    t.prompt("claude", "sign-1");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(t.openExternal).not.toHaveBeenCalled();
  });

  it("reports success, failure without its detail, and a cancel from the window", async () => {
    const t = setup();
    const id = await session(t);
    const ok = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    t.b.apply("claude", { type: "signedIn", attemptId: "sign-1", result: { status: "stored", connection: claude } });
    const failed = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r2", provider: "codex" }));
    t.b.apply("codex", { type: "signedIn", attemptId: "sign-2", result: { status: "failed", code: "network", detail: "token=abc /Users/ada/.codex/auth.json ada@example.com" } });
    const cancelled = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r3", provider: "cursor" }));
    // The renderer shares the owner, so it may cancel a CLI sign-in through agent-auth.
    expect(await t.ipc.handle(AUTH_CHANNELS.cancel, { provider: "cursor", attemptId: "sign-3" }, MAIN)).toEqual({ ok: true });
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: cancelled.operationId })).operations[0]).toMatchObject({ state: "running", cancelling: true });
    t.b.apply("cursor", { type: "settled", attemptId: "sign-3" });
    const ops = state(await t.ask({ op: "status", sessionId: id })).operations;
    expect(ops.find(o => o.operationId === ok.operationId)).toEqual({ ...ok, state: "succeeded" });
    expect(ops.find(o => o.operationId === failed.operationId)).toMatchObject({ state: "failed", error: { code: "network" } });
    expect(ops.find(o => o.operationId === cancelled.operationId)).toEqual({ ...cancelled, state: "cancelled" });
    expect(JSON.stringify(ops)).not.toMatch(/token=abc|auth\.json|ada@example\.com/);
  });
});

describe("cancel", () => {
  it("cancels only the attempt its operation started", async () => {
    const t = setup();
    const id = await session(t);
    const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    const reply = operation(await t.ask({ op: "cancel", sessionId: id, requestId: "c1", operationId: op.operationId }));
    expect(reply).toMatchObject({ operationId: op.operationId, kind: "sign_in", state: "running", cancelling: true });
    expect(t.b.api.cancel).toHaveBeenCalledWith("claude", "sign-1", MAIN);
    t.b.apply("claude", { type: "settled", attemptId: "sign-1" });
    expect(operation(await t.ask({ op: "cancel", sessionId: id, requestId: "c1", operationId: op.operationId }))).toMatchObject({ state: "cancelled" });
    expect(t.b.api.cancel).toHaveBeenCalledTimes(1);
  });

  it("cannot cancel a sign-in the main window started, even after its own sign-in ended", async () => {
    const t = setup();
    const id = await session(t);
    const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    t.b.apply("claude", { type: "signedIn", attemptId: "sign-1", result: { status: "failed", code: "sign_in_failed" } });
    // The window starts its own sign-in of the same provider; agent-auth sees the same owner for both.
    expect(await t.ipc.handle(AUTH_CHANNELS.signIn, { provider: "claude" }, MAIN)).toEqual({ ok: true, attemptId: "sign-2" });
    expect(operation(await t.ask({ op: "cancel", sessionId: id, requestId: "c1", operationId: op.operationId }))).toMatchObject({ state: "failed" });
    expect(await t.ask({ op: "cancel", sessionId: id, requestId: "c2", operationId: "sign-2" })).toMatchObject({ ok: false, error: { code: "operation_not_found" } });
    expect(t.b.states.get("claude")!.attempt).toMatchObject({ id: "sign-2", cancelled: false });
    expect(t.b.api.cancel).not.toHaveBeenCalled();
  });

  it("refuses a cancel with the same requestId but another target", async () => {
    const t = setup();
    const id = await session(t);
    const a = operation(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" }));
    const b = operation(await t.ask({ op: "check", sessionId: id, requestId: "r2", provider: "codex" }));
    expect(operation(await t.ask({ op: "cancel", sessionId: id, requestId: "c1", operationId: a.operationId })).operationId).toBe(a.operationId);
    expect(await t.ask({ op: "cancel", sessionId: id, requestId: "c1", operationId: b.operationId })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
  });
});

describe("check", () => {
  it("runs a check as an operation and reports its result", async () => {
    const t = setup();
    t.b.states.set("claude", initialAuthState("claude", claude));
    const id = await session(t);
    const op = operation(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" }));
    expect(op).toMatchObject({ kind: "check", state: "running", provider: "claude" });
    t.b.apply("claude", { type: "checked", attemptId: "check-1", result: { status: "connected", account: claude.account } });
    expect(state(await t.ask({ op: "status", sessionId: id })).operations[0]).toEqual({ ...op, state: "succeeded" });
    const failed = operation(await t.ask({ op: "check", sessionId: id, requestId: "r2", provider: "claude" }));
    t.b.apply("claude", { type: "checked", attemptId: "check-2", result: { status: "failed", code: "check_failed", detail: "stderr: secret" } });
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: failed.operationId })).operations[0]).toMatchObject({ state: "failed", error: { code: "check_failed" } });
  });

  it("spends a Copilot request only when the caller said so", async () => {
    const t = setup();
    const id = await session(t);
    expect(rendererRequest("check", { sessionId: id, requestId: "r1", provider: "copilot" })).toBeNull();
    expect(rendererRequest("check", { sessionId: id, requestId: "r1", provider: "copilot", spendCopilotRequest: false })).toBeNull();
    const request = rendererRequest("check", { sessionId: id, requestId: "r1", provider: "copilot", spendCopilotRequest: true });
    expect(request).not.toBeNull();
    expect(operation(await t.service.answer(request!))).toMatchObject({ kind: "check", provider: "copilot" });
    expect(t.b.api.check).toHaveBeenCalledWith("copilot");
  });

  it("returns busy while another attempt runs for that provider", async () => {
    const t = setup();
    const id = await session(t);
    await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" });
    expect(await t.ask({ op: "check", sessionId: id, requestId: "r2", provider: "claude" })).toMatchObject({ ok: false, error: { code: "busy" } });
  });
});

describe("project operations before B1", () => {
  it("has no inspection to select or clone from and no project to complete", async () => {
    const t = setup();
    const id = await session(t);
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "r1", inspectionId: "i1", path: "/tmp/x" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "r2", inspectionId: "i1", destination: "/tmp/y" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    expect(await t.ask({ op: "complete", sessionId: id, requestId: "r3" })).toMatchObject({ ok: false, error: { code: "no_ready_agent" } });
    // Temporary until B1 implements inspection.
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r4", path: "/tmp/x" })).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });
});

describe("renderer requests", () => {
  it("accept the socket DTO without its version and token, and nothing else", () => {
    expect(rendererRequest("start", {})).toEqual({ v: 2, token: "", op: "start" });
    expect(rendererRequest("status", { sessionId: "s1" })).toEqual({ v: 2, token: "", op: "status", sessionId: "s1" });
    expect(rendererRequest("cancel", { sessionId: "s1", requestId: "r1", operationId: "o1" })).toMatchObject({ op: "cancel" });
    expect(rendererRequest("status", { v: 2, sessionId: "s1" })).toBeNull();
    expect(rendererRequest("status", { token: "x", sessionId: "s1" })).toBeNull();
    expect(rendererRequest("status", { sessionId: "s1", extra: 1 })).toBeNull();
    expect(rendererRequest("cancel", { sessionId: "s1", requestId: "r1" })).toBeNull();
    expect(rendererRequest("status", null)).toBeNull();
    expect(rendererRequest("status", [])).toBeNull();
  });

  it("name channels in the onboarding namespace without reusing the old wizard's", () => {
    expect(Object.values(ONBOARDING_CHANNELS)).toEqual(["onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:clone", "onboarding:complete", "onboarding:changed"]);
  });
});
