import { describe, expect, it, vi } from "vitest";
import type { OnboardingRequest, OnboardingResponse, OnboardingState } from "../../formats/types";
import { validateOnboardingResponse } from "../../formats/validate";
import { AUTH_CHANNELS, AuthIpc, type AuthBackend, type AuthSnapshot } from "../agentAuth/ipc";
import { initialAuthState, transition } from "../agentAuth/state";
import { PROVIDERS, type AccountConnection, type AuthEvent, type AuthState, type Provider, type ToolFacts } from "../agentAuth/types";
import type { CheckOutcome } from "../agentAuth/manager";
import { ONBOARDING_CHANNELS, OnboardingService, rendererRequest, type OnboardingProjects } from "./service";

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
  // A check's outcome arrives after its result and any write-back, as AuthManager reports it.
  const outcomes = new Map<string, (outcome: CheckOutcome) => void>();
  const api: AuthBackend = {
    state: provider => states.get(provider)!,
    check: vi.fn(async provider => {
      const result = started(provider, { type: "check", attemptId: `check-${++ids}` });
      return result.ok ? { ...result, outcome: new Promise<CheckOutcome>(resolve => outcomes.set(result.attemptId, resolve)) } : result;
    }),
    signIn: vi.fn(async (provider, owner, options) => {
      if (states.get(provider)!.attempt?.kind === "signIn" || [...states.values()].some(s => s.attempt && s.attempt.kind !== "check")) return { ok: false as const, reason: "busy" as const, state: states.get(provider)! };
      if (running.has(provider) && !options.stop) return { ok: false as const, reason: "stop_required" as const, state: states.get(provider)! };
      return started(provider, { type: "signIn", attemptId: `sign-${++ids}`, owner });
    }),
    cancel: vi.fn(async (provider, attemptId, owner) => apply(provider, { type: "cancel", attemptId, owner })),
    submitCode: vi.fn(() => ({ ok: true as const })),
    signOut: vi.fn(async (provider, options) => started(provider, { type: "signOut", attemptId: `out-${++ids}`, running: false, stop: options.stop === true })),
  };
  const checked = (attemptId: string, outcome: CheckOutcome) => outcomes.get(attemptId)!(outcome);
  return { api, apply, states, running, checked, onChange(listener: () => void) { changed = listener; } };
}

// Folder work as the projects module answers it; paths under /gone, /taken and /nowhere stand for the disk's answers.
function fakeProjects(): OnboardingProjects & { [K in keyof OnboardingProjects]: ReturnType<typeof vi.fn> } {
  return {
    folder: vi.fn(async (path: string) => path.startsWith("/gone") ? null : path),
    destination: vi.fn(async (path: string): Promise<"absent" | "exists" | "no_parent" | "inside_project"> => path.startsWith("/taken") ? "exists" : path.startsWith("/nowhere") ? "no_parent" : "absent"),
    inspectPath: vi.fn(async (path: string) => ({ ok: true as const, candidates: [{ path, changes: [] }] })),
    inspectUrl: vi.fn(async () => []),
    select: vi.fn(async (path: string) => ({ ok: true as const, root: path })),
    clone: vi.fn(async (_url: string, destination: string) => ({ ok: true as const, root: destination })),
    confirm: vi.fn(async (root: string) => ({ ok: true as const, root })),
    saveCompletion: vi.fn(() => ({ ok: true as const })),
  };
}

function setup(options: { completed?: boolean; auth?: boolean; owner?: number | null; read?: () => Promise<AuthSnapshot>; facts?: ToolFacts } = {}) {
  const b = backend();
  const openExternal = vi.fn(async (_url: string) => {});
  const published: OnboardingState[] = [];
  let service: OnboardingService | undefined;
  const ipc = new AuthIpc({ backend: b.api, probe: async () => options.facts ?? ready, openExternal, publish: snapshot => service?.authChanged(snapshot), prompt: vi.fn() });
  b.onChange(() => ipc.changed());
  const auth = options.auth === false ? null : options.read ? { read: options.read, latest: () => ipc.latest(), handle: ipc.handle.bind(ipc) } : ipc;
  let completed = options.completed ?? false;
  const projects = fakeProjects();
  service = new OnboardingService({
    auth, mainOwner: () => options.owner === undefined ? MAIN : options.owner, completed: () => completed,
    publish: state => published.push(state), newId: () => `id-${++ids}`, snapshotWaitMs: 50, projects, quickReplyMs: 50,
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
  // A connected, checked Claude: the one ready agent onboarding needs.
  const makeReady = () => { b.states.set("claude", { ...initialAuthState("claude", claude), verified: true }); ipc.changed(); };
  return { b, ipc, service, ask, published, openExternal, prompt, projects, ready: makeReady, complete(value: boolean) { completed = value; } };
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

  it("skips Codex's local listener line and opens its auth URL", async () => {
    const t = setup();
    const id = await session(t);
    await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "codex" });
    t.prompt("codex", "sign-1", "http://localhost:1455");
    await settle();
    expect(t.openExternal).not.toHaveBeenCalled();
    expect(t.service.snapshot().operations[0]!.state).toBe("pending");
    t.prompt("codex", "sign-1", "https://auth.openai.com/oauth/authorize?client_id=x");
    await settle();
    expect(t.openExternal.mock.calls).toEqual([["https://auth.openai.com/oauth/authorize?client_id=x"]]);
    expect(t.service.snapshot().operations[0]!.state).toBe("awaiting_user");
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

describe("request identity", () => {
  it("answers a resent request with its original operation for the whole session, past every list limit", async () => {
    const t = setup({ facts: { cli: "found", version: "unknown", tools: "ready" } });
    const id = await session(t);
    const first = operation(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "claude" }));
    for (let i = 1; i <= 1030; i++) await t.service.answer({ v: 2, token: TOKEN, op: "check", sessionId: id, requestId: `r${i}`, provider: "claude" });
    expect(operation(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "claude" }))).toEqual(first);
    expect(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "codex" })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
    expect(state(await t.ask({ op: "status", sessionId: id })).operations.length).toBeLessThanOrEqual(20);
  }, 30_000);

  it("answers a refused request with the same refusal when resent, even after conditions changed", async () => {
    const t = setup();
    const id = await session(t);
    await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" });
    const refused = await t.ask({ op: "sign_in", sessionId: id, requestId: "r2", provider: "codex" });
    expect(refused).toMatchObject({ ok: false, error: { code: "busy" } });
    t.b.apply("claude", { type: "cancel", attemptId: "sign-1", owner: MAIN }); t.b.apply("claude", { type: "settled", attemptId: "sign-1" });
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r2", provider: "codex" })).toEqual(refused);
    expect(await t.ask({ op: "sign_in", sessionId: id, requestId: "r2", provider: "cursor" })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
    expect(t.b.api.signIn).toHaveBeenCalledTimes(2);
  });
});

describe("status of one operation", () => {
  it("reads the operation and revision after the auth read, so a change meanwhile is never mixed with an older operation", async () => {
    let release!: (snapshot: AuthSnapshot) => void;
    let hold = false;
    const t = setup({ read: () => hold ? new Promise<AuthSnapshot>(resolve => { release = resolve; }) : Promise.resolve(t.ipc.latest()) });
    const id = await session(t);
    const op = operation(await t.ask({ op: "sign_in", sessionId: id, requestId: "r1", provider: "claude" }));
    hold = true;
    const reading = t.service.answer({ v: 2, token: TOKEN, op: "status", sessionId: id, operationId: op.operationId });
    await settle();
    t.b.apply("claude", { type: "cancel", attemptId: "sign-1", owner: MAIN }); t.b.apply("claude", { type: "settled", attemptId: "sign-1" });
    release(t.ipc.latest());
    const read = state(await reading);
    expect(read.operations[0]).toMatchObject({ state: "cancelled" });
    expect(read.revision).toBe(t.published.at(-1)!.revision);
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
  it("runs a check as an operation and reports its outcome once the check and its write-back are done", async () => {
    const t = setup();
    t.b.states.set("claude", initialAuthState("claude", claude));
    const id = await session(t);
    const op = operation(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" }));
    expect(op).toMatchObject({ kind: "check", state: "running", provider: "claude" });
    // The result alone does not end the operation: a write-back may still fail after it.
    t.b.apply("claude", { type: "checked", attemptId: "check-1", result: { status: "connected", account: claude.account } });
    await settle();
    expect(state(await t.ask({ op: "status", sessionId: id })).operations[0]).toEqual(op);
    t.b.checked("check-1", "ok");
    await settle();
    expect(state(await t.ask({ op: "status", sessionId: id })).operations[0]).toEqual({ ...op, state: "succeeded" });
  });

  it.each([["account_mismatch"], ["storage_failed"], ["check_failed"], ["network"], ["cli_install_failed"]] as const)("ends a check whose outcome is %s as failed with a fixed message", async outcome => {
    const t = setup();
    t.b.states.set("claude", initialAuthState("claude", claude, true));
    const id = await session(t);
    const op = operation(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" }));
    t.b.checked("check-1", outcome);
    await settle();
    const ended = state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations[0]!;
    expect(ended).toEqual({ ...op, state: "failed", error: { code: outcome, message: expect.any(String) } });
  });

  it("ends a check a sign-in replaced as cancelled", async () => {
    const t = setup();
    const id = await session(t);
    const op = operation(await t.ask({ op: "check", sessionId: id, requestId: "r1", provider: "claude" }));
    t.b.checked("check-1", "replaced");
    await settle();
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations[0]).toEqual({ ...op, state: "cancelled" });
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

describe("kept operations", () => {
  it("bounds the operations status lists, and a resend still gets its original operation", async () => {
    // A version cause answers each check at once with no attempt to follow.
    const t = setup({ facts: { cli: "found", version: "unknown", tools: "ready" } });
    const id = await session(t);
    const first = operation(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "claude" }));
    expect(first.state).toBe("succeeded");
    for (let i = 1; i < 60; i++) await t.ask({ op: "check", sessionId: id, requestId: `r${i}`, provider: "claude" });
    const listed = state(await t.ask({ op: "status", sessionId: id })).operations;
    expect(listed).toHaveLength(20);
    expect(t.published.at(-1)!.operations).toHaveLength(20);
    expect(operation(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "claude" }))).toEqual(first);
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: first.operationId })).operations).toEqual([first]);
    expect(await t.ask({ op: "check", sessionId: id, requestId: "r0", provider: "codex" })).toMatchObject({ ok: false, error: { code: "request_conflict" } });
  });
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const ALL = [".doan/canvases/", ".doan/config.json", ".gitattributes"];

describe("project inspection", () => {
  it("inspects a picked folder and no longer refuses it as unavailable", async () => {
    const t = setup();
    const id = await session(t);
    const reply = await t.ask({ op: "project_inspect", sessionId: id, requestId: "r1", path: "/Users/ada/studio" });
    expect(reply.ok).toBe(true);
    expect(operation(reply)).toMatchObject({ kind: "project_inspect", state: "succeeded", inspection: { candidates: [{ path: "/Users/ada/studio", changes: [] }] } });
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r2", path: "/gone/x" })).toMatchObject({ ok: false, error: { code: "path_unavailable" } });
  });

  it("checks a GitHub URL and its destination before any work, and plans the clone", async () => {
    const t = setup();
    const id = await session(t);
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r1", url: "https://gitlab.com/acme/studio" })).toMatchObject({ ok: false, error: { code: "invalid_url" } });
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r2", url: "https://github.com/acme/studio", destination: "/taken/studio" })).toMatchObject({ ok: false, error: { code: "destination_exists" } });
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r3", url: "https://github.com/acme/studio", destination: "/nowhere/studio" })).toMatchObject({ ok: false, error: { code: "path_unavailable" } });
    t.projects.inspectUrl.mockResolvedValueOnce([{ path: "/Users/ada/studio", changes: [] }]);
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r4", url: "git@github.com:acme/studio.git", destination: "/Users/ada/new" }));
    expect(op.inspection).toEqual({ inspectionId: expect.any(String), candidates: [{ path: "/Users/ada/studio", changes: [] }], clone: { destination: "/Users/ada/new", changes: ALL } });
    expect(t.projects.inspectUrl).toHaveBeenCalledWith({ owner: "acme", repository: "studio", transport: "ssh", url: "git@github.com:acme/studio.git" });
  });

  it("answers running past its reply limit and finishes on status", async () => {
    const t = setup();
    const id = await session(t);
    const slow = deferred<{ ok: true; candidates: { path: string; changes: [] }[] }>();
    t.projects.inspectPath.mockReturnValueOnce(slow.promise);
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r1", path: "/Users/ada/studio" }));
    expect(op.state).toBe("running");
    slow.resolve({ ok: true, candidates: [{ path: "/Users/ada/studio", changes: [] }] });
    await settle();
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations[0]).toMatchObject({ state: "succeeded", inspection: { candidates: [{ path: "/Users/ada/studio" }] } });
  });

  it("discards an older inspection that finishes after a newer one started", async () => {
    const t = setup();
    const id = await session(t);
    const old = deferred<{ ok: true; candidates: { path: string; changes: [] }[] }>();
    t.projects.inspectPath.mockReturnValueOnce(old.promise);
    const first = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r1", path: "/Users/ada/old" }));
    const second = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "r2", path: "/Users/ada/new" }));
    old.resolve({ ok: true, candidates: [{ path: "/Users/ada/old", changes: [] }] });
    await settle();
    const late = state(await t.ask({ op: "status", sessionId: id, operationId: first.operationId })).operations[0]!;
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId: late.inspection!.inspectionId, path: "/Users/ada/old" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    expect(operation(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId: second.inspection!.inspectionId, path: "/Users/ada/new" }))).toMatchObject({ state: "succeeded" });
  });
});

describe("project selection", () => {
  async function inspected(t: ReturnType<typeof setup>, changes: string[] = []) {
    const id = await session(t);
    t.projects.inspectPath.mockResolvedValueOnce({ ok: true, candidates: [{ path: "/Users/ada/studio", changes }] });
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", path: "/Users/ada/studio" }));
    return { id, inspectionId: op.inspection!.inspectionId };
  }

  it("selects a candidate of the latest inspection and reports the project", async () => {
    const t = setup();
    const { id, inspectionId } = await inspected(t);
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId, path: "/Users/ada/other" })).toMatchObject({ ok: false, error: { code: "not_candidate" } });
    expect(operation(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId, path: "/Users/ada/studio" }))).toMatchObject({ kind: "project_select", state: "succeeded", project: { root: "/Users/ada/studio" } });
    expect(t.projects.select).toHaveBeenCalledWith("/Users/ada/studio", false, null);
    expect(state(await t.ask({ op: "status", sessionId: id })).project).toEqual({ root: "/Users/ada/studio" });
  });

  it("needs an explicit initialize for a folder that would change", async () => {
    const t = setup();
    const { id, inspectionId } = await inspected(t, ALL);
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId, path: "/Users/ada/studio" })).toMatchObject({ ok: false, error: { code: "initialize_required" } });
    expect(t.projects.select).not.toHaveBeenCalled();
    expect(operation(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId, path: "/Users/ada/studio", initialize: true }))).toMatchObject({ state: "succeeded" });
    expect(t.projects.select).toHaveBeenCalledWith("/Users/ada/studio", true, null);
  });

  it("goes stale as soon as a newer inspection starts, from the window or a client", async () => {
    const t = setup();
    const { id, inspectionId } = await inspected(t);
    t.projects.inspectPath.mockReturnValueOnce(new Promise(() => {}));
    await t.service.answer(rendererRequest("project_inspect", { sessionId: id, requestId: "w1", path: "/Users/ada/elsewhere" })!);
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId, path: "/Users/ada/studio" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
  });

  it("keeps the previous project when a selection fails, with a fixed message", async () => {
    const t = setup();
    const { id, inspectionId } = await inspected(t);
    await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId, path: "/Users/ada/studio" });
    t.projects.select.mockResolvedValueOnce({ ok: false, code: "remote_mismatch" });
    expect(operation(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId, path: "/Users/ada/studio" }))).toMatchObject({ state: "failed", error: { code: "remote_mismatch", message: expect.any(String) } });
    expect(state(await t.ask({ op: "status", sessionId: id })).project).toEqual({ root: "/Users/ada/studio" });
  });
});

describe("clone", () => {
  async function planned(t: ReturnType<typeof setup>, destination = "/Users/ada/studio") {
    const id = await session(t);
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", url: "https://github.com/acme/studio", destination }));
    return { id, inspectionId: op.inspection!.inspectionId, destination };
  }

  it("needs the inspection that planned this destination", async () => {
    const t = setup();
    const { id, inspectionId } = await planned(t);
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination: "/Users/ada/elsewhere" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    const path = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i2", path: "/Users/ada/x" }));
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "c2", inspectionId: path.inspection!.inspectionId, destination: "/Users/ada/studio" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
  });

  it("refuses a destination that appeared after the inspection", async () => {
    const t = setup();
    const { id, inspectionId } = await planned(t, "/taken/studio".replace("/taken", "/Users/ada"));
    t.projects.destination.mockResolvedValueOnce("exists");
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination: "/Users/ada/studio" })).toMatchObject({ ok: false, error: { code: "destination_exists" } });
    expect(t.projects.clone).not.toHaveBeenCalled();
  });

  it("clones in the background, refuses new project work until cleanup ends, and reports a cancel", async () => {
    const t = setup();
    const { id, inspectionId, destination } = await planned(t);
    const result = deferred<{ ok: false; cancelled: true }>();
    let signal: AbortSignal | undefined;
    t.projects.clone.mockImplementationOnce(async (_url: string, _destination: string, s: AbortSignal) => { signal = s; return result.promise; });
    const op = operation(await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination }));
    expect(op).toMatchObject({ kind: "project_clone", state: "running" });
    expect(t.projects.clone).toHaveBeenCalledWith("https://github.com/acme/studio", destination, expect.anything());
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "c2", inspectionId, destination })).toMatchObject({ ok: false, error: { code: "busy" } });
    const cancelling = operation(await t.ask({ op: "cancel", sessionId: id, requestId: "x1", operationId: op.operationId }));
    expect(cancelling).toMatchObject({ state: "running", cancelling: true });
    expect(signal?.aborted).toBe(true);
    // Processes may still be running: no retry, no other location.
    expect(await t.ask({ op: "project_clone", sessionId: id, requestId: "c3", inspectionId, destination })).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i9", path: "/Users/ada/x" })).toMatchObject({ ok: false, error: { code: "busy" } });
    result.resolve({ ok: false, cancelled: true });
    await settle();
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations[0]).toEqual({ ...op, state: "cancelled" });
    expect(operation(await t.ask({ op: "project_clone", sessionId: id, requestId: "c4", inspectionId, destination }))).toMatchObject({ state: "succeeded", project: { root: destination } });
    expect(state(await t.ask({ op: "status", sessionId: id })).project).toEqual({ root: destination });
  });

  it("reports cleanup and access failures by code only", async () => {
    const t = setup();
    const { id, inspectionId, destination } = await planned(t);
    t.projects.clone.mockResolvedValueOnce({ ok: false, code: "cleanup_failed" });
    expect(operation(await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination }))).toMatchObject({ state: "failed", error: { code: "cleanup_failed" } });
    t.projects.clone.mockRejectedValueOnce(new Error("fatal: Authentication failed for https://token@github.com"));
    const thrown = operation(await t.ask({ op: "project_clone", sessionId: id, requestId: "c2", inspectionId, destination }));
    expect(thrown).toMatchObject({ state: "failed", error: { code: "clone_failed" } });
    expect(JSON.stringify(thrown)).not.toMatch(/token|Authentication/);
  });

  it("cancels a running clone on quit and waits for it", async () => {
    const t = setup();
    const { id, inspectionId, destination } = await planned(t);
    let finished = false;
    t.projects.clone.mockImplementationOnce((_u: string, _d: string, s: AbortSignal) => new Promise(resolve => s.addEventListener("abort", () => setTimeout(() => { finished = true; resolve({ ok: false, cancelled: true }); }, 20))));
    await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination });
    await t.service.quit();
    expect(finished).toBe(true);
  });
});

describe("exclusive project work", () => {
  async function planned(t: ReturnType<typeof setup>) {
    const id = await session(t);
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", url: "https://github.com/acme/studio", destination: "/Users/ada/studio" }));
    return { id, inspectionId: op.inspection!.inspectionId };
  }

  it("starts one clone for two requests that arrive together", async () => {
    const t = setup();
    const { id, inspectionId } = await planned(t);
    t.projects.clone.mockImplementation(() => new Promise(() => {}));
    const [a, b] = await Promise.all([
      t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId, destination: "/Users/ada/studio" }),
      t.ask({ op: "project_clone", sessionId: id, requestId: "c2", inspectionId, destination: "/Users/ada/studio" }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(t.projects.clone).toHaveBeenCalledTimes(1);
  });

  it("keeps complete and a project change from running together", async () => {
    const t = setup();
    const { id, inspectionId } = await planned(t);
    t.ready();
    const path = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i2", path: "/Users/ada/p1" }));
    await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId: path.inspection!.inspectionId, path: "/Users/ada/p1" });
    void inspectionId;
    const again = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i3", url: "https://github.com/acme/studio", destination: "/Users/ada/studio" }));
    t.projects.clone.mockImplementationOnce(() => new Promise(() => {}));
    await t.ask({ op: "project_clone", sessionId: id, requestId: "c1", inspectionId: again.inspection!.inspectionId, destination: "/Users/ada/studio" });
    expect(await t.ask({ op: "complete", sessionId: id, requestId: "d1" })).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(t.projects.saveCompletion).not.toHaveBeenCalled();
  });

  it("holds a selection while complete runs", async () => {
    const t = setup();
    const id = await session(t);
    t.ready();
    const path = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", path: "/Users/ada/p1" }));
    await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId: path.inspection!.inspectionId, path: "/Users/ada/p1" });
    t.projects.confirm.mockReturnValueOnce(new Promise(() => {}));
    await t.ask({ op: "complete", sessionId: id, requestId: "d1" });
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId: path.inspection!.inspectionId, path: "/Users/ada/p1" })).toMatchObject({ ok: false, error: { code: "busy" } });
  });

  it("refuses a clone destination inside another project", async () => {
    const t = setup();
    const id = await session(t);
    t.projects.destination.mockResolvedValueOnce("inside_project");
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", url: "https://github.com/acme/studio", destination: "/Users/ada/app/studio" })).toMatchObject({ ok: false, error: { code: "path_unavailable" } });
  });

  it("takes no new project work once quit was accepted", async () => {
    const t = setup();
    const id = await session(t);
    await t.service.quit();
    expect(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", path: "/Users/ada/p1" })).toMatchObject({ ok: false, error: { code: "busy" } });
  });

  it("counts an inspection as started before its checks finish", async () => {
    const t = setup();
    const id = await session(t);
    const slow = deferred<string | null>();
    t.projects.folder.mockReturnValueOnce(slow.promise);
    const first = t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", path: "/Users/ada/old" });
    const second = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i2", path: "/Users/ada/new" }));
    slow.resolve("/Users/ada/old");
    const old = operation(await first);
    expect(await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId: old.inspection!.inspectionId, path: "/Users/ada/old" })).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    expect(operation(await t.ask({ op: "project_select", sessionId: id, requestId: "s2", inspectionId: second.inspection!.inspectionId, path: "/Users/ada/new" }))).toMatchObject({ state: "succeeded" });
  });
});

describe("complete", () => {
  async function selected(t: ReturnType<typeof setup>) {
    const id = await session(t);
    const op = operation(await t.ask({ op: "project_inspect", sessionId: id, requestId: "i1", path: "/Users/ada/studio" }));
    await t.ask({ op: "project_select", sessionId: id, requestId: "s1", inspectionId: op.inspection!.inspectionId, path: "/Users/ada/studio" });
    return id;
  }

  it("needs a ready agent and a selected project", async () => {
    const t = setup();
    const id = await session(t);
    expect(await t.ask({ op: "complete", sessionId: id, requestId: "d1" })).toMatchObject({ ok: false, error: { code: "no_ready_agent" } });
    t.ready();
    expect(await t.ask({ op: "complete", sessionId: id, requestId: "d2" })).toMatchObject({ ok: false, error: { code: "no_project" } });
  });

  it("re-reads the project, saves completion once and keeps the project when saving fails", async () => {
    const t = setup();
    const id = await selected(t);
    t.ready();
    t.projects.saveCompletion.mockReturnValueOnce({ ok: false, reason: "save_failed" });
    expect(operation(await t.ask({ op: "complete", sessionId: id, requestId: "d1" }))).toMatchObject({ kind: "complete", state: "failed", error: { code: "completion_save_failed" } });
    expect(state(await t.ask({ op: "status", sessionId: id })).project).toEqual({ root: "/Users/ada/studio" });
    // Retry repeats the checks and the save only; selection and setup are not run again.
    expect(operation(await t.ask({ op: "complete", sessionId: id, requestId: "d2" }))).toMatchObject({ state: "succeeded", project: { root: "/Users/ada/studio" } });
    expect(t.projects.select).toHaveBeenCalledTimes(1);
    expect(t.projects.confirm).toHaveBeenCalledTimes(2);
    expect(t.projects.saveCompletion).toHaveBeenCalledWith("/Users/ada/studio");
  });

  it("does not repeat a save a newer app refused, and stops if the agent stopped being ready", async () => {
    const t = setup();
    const id = await selected(t);
    t.ready();
    t.projects.saveCompletion.mockReturnValueOnce({ ok: false, reason: "unknown_version" });
    expect(operation(await t.ask({ op: "complete", sessionId: id, requestId: "d1" }))).toMatchObject({ state: "failed", error: { code: "completion_unsupported_version" } });
    t.projects.confirm.mockImplementationOnce(async (root: string) => { t.b.states.set("claude", initialAuthState("claude", null)); t.ipc.changed(); return { ok: true, root }; });
    expect(operation(await t.ask({ op: "complete", sessionId: id, requestId: "d2" }))).toMatchObject({ state: "failed", error: { code: "no_ready_agent" } });
    expect(t.projects.saveCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not save completion once quit was accepted", async () => {
    const t = setup();
    const id = await selected(t);
    t.ready();
    const confirm = deferred<{ ok: true; root: string }>();
    t.projects.confirm.mockReturnValueOnce(confirm.promise);
    const op = operation(await t.ask({ op: "complete", sessionId: id, requestId: "d1" }));
    const quitting = t.service.quit();
    confirm.resolve({ ok: true, root: "/Users/ada/studio" });
    await quitting; await settle();
    expect(t.projects.saveCompletion).not.toHaveBeenCalled();
    expect(state(await t.ask({ op: "status", sessionId: id, operationId: op.operationId })).operations[0]).toMatchObject({ state: "cancelled" });
  });

  it("reports a project that is no longer readable or registered", async () => {
    const t = setup();
    const id = await selected(t);
    t.ready();
    t.projects.confirm.mockResolvedValueOnce({ ok: false, code: "project_unavailable" });
    expect(operation(await t.ask({ op: "complete", sessionId: id, requestId: "d1" }))).toMatchObject({ state: "failed", error: { code: "project_unavailable" } });
    expect(t.projects.saveCompletion).not.toHaveBeenCalled();
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
    expect(Object.values(ONBOARDING_CHANNELS)).toEqual(["onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete", "onboarding:changed"]);
  });
});
