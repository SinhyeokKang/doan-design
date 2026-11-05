import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CheckStarted, Lease } from "./manager";
import { READ_INTERVAL_MS } from "./usageSchedule";
import { UsageService, withTurnUsage, type UsageAuth } from "./usageService";
import type { UsageEntry, UsageReading } from "./usageTypes";
import type { Prepared } from "../conversation/service";
import { PROVIDERS, type AuthState, type Provider, type Readiness } from "./types";

const claudeFixture: unknown = JSON.parse(readFileSync(new URL("./fixtures/claude-usage.json", import.meta.url), "utf8"));
const codexFixture: unknown = JSON.parse(readFileSync(new URL("./fixtures/codex-usage.json", import.meta.url), "utf8"));

const ok = (readAt: number, usedPercent = 42): UsageReading => ({ status: "ok", windows: [{ id: "five_hour", label: "5-hour", usedPercent }], readAt });
const failed = (readAt: number): UsageReading => ({ status: "unavailable", reason: "read_failed", readAt });
function connected(provider: Provider, connectionId: string, over: Partial<AuthState> = {}): AuthState {
  return {
    provider, phase: "connected", generation: 1, verified: true, expired: false, attempt: null, error: null,
    connection: { provider, connectionId, profile: `${provider}-profile-7f3a`, account: { id: "acct-secret-1", workspace: "org-secret-1", email: "ada@example.com" } },
    ...over,
  };
}
const disconnected = (provider: Provider): AuthState => ({ provider, phase: "disconnected", generation: 0, verified: false, expired: false, connection: null, attempt: null, error: null });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

// The AuthManager surface the service uses, with leases that count until released.
class FakeAuth implements UsageAuth {
  states = new Map<Provider, AuthState>(PROVIDERS.map(p => [p, disconnected(p)]));
  held = 0;
  uses: string[] = [];
  refuse: string | null = null;
  readonly checks: Provider[] = [];
  state(provider: Provider): AuthState { return this.states.get(provider)!; }
  async check(provider: Provider): Promise<CheckStarted> {
    this.checks.push(provider);
    const state = this.state(provider);
    this.states.set(provider, { ...state, verified: true });
    return { ok: true, attemptId: "check-1", done: Promise.resolve(this.state(provider)), outcome: Promise.resolve("ok") };
  }
  async checked(_provider: Provider): Promise<void> {}
  async acquire(provider: Provider, use: "usage"): Promise<Lease> {
    if (this.refuse) throw new Error(this.refuse);
    this.uses.push(`${provider}:${use}`); this.held += 1;
    let released = false;
    return { command: `/bin/${provider}`, env: { HOME: `/profiles/${provider}` }, profileDir: `/profiles/${provider}`, release: async () => { if (!released) { released = true; this.held -= 1; } } };
  }
}
function setup(over: { visible?: () => boolean; readiness?: (provider: Provider) => Readiness; read?: (provider: Provider, lease: Lease, signal: AbortSignal) => Promise<UsageReading> } = {}) {
  const auth = new FakeAuth();
  let now = 1_000_000;
  const published: UsageEntry[][] = [];
  const read = vi.fn(over.read ?? (async (_provider: Provider) => ok(now)));
  const make = () => new UsageService({ auth, readiness: over.readiness ?? (() => ({ ready: true })), read, visible: over.visible ?? (() => true), publish: entries => published.push(entries), now: () => now });
  return { auth, read, published, make, advance: (ms: number) => { now += ms; }, now: () => now };
}

describe("UsageService entries", () => {
  it("lists connected providers that show usage, in PROVIDERS order, and never Antigravity", () => {
    const h = setup();
    for (const provider of ["copilot", "antigravity", "claude", "cursor"] as const) h.auth.states.set(provider, connected(provider, `conn-${provider}`));
    const usage = h.make();
    expect(usage.entries().map(entry => entry.provider)).toEqual(["claude", "cursor", "copilot"]);
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: false }, { provider: "cursor", inFlight: false }, { provider: "copilot", inFlight: false }]);
  });
  it("sends no connection ID, profile, account ID, email or workspace to the window", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "conn-secret-claude"));
    h.auth.states.set("codex", connected("codex", "conn-secret-codex", { expired: true, phase: "reauthRequired", verified: false }));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await usage.settled();
    const sent = JSON.stringify([usage.entries(), h.published]);
    for (const secret of ["conn-secret", "profile-7f3a", "acct-secret", "org-secret", "ada@example.com", "/profiles/"]) expect(sent).not.toContain(secret);
  });
});

describe("UsageService reads", () => {
  it("reads every usable provider once at start through a usage lease, showing in-flight then the reading", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "c1")); h.auth.states.set("codex", connected("codex", "x1"));
    const usage = h.make();
    usage.trigger({ kind: "start" });
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: true }, { provider: "codex", inFlight: true }]);
    await usage.settled();
    expect(h.read.mock.calls.map(call => call[0])).toEqual(["claude", "codex"]);
    expect(h.auth.uses).toEqual(["claude:usage", "codex:usage"]);
    expect(h.auth.held).toBe(0);
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: false, reading: ok(h.now()) }, { provider: "codex", inFlight: false, reading: ok(h.now()) }]);
    expect(h.published.at(-1)).toEqual(usage.entries());
  });
  it("joins a second trigger to the read in flight: one read, one result for both", async () => {
    const gate = deferred<UsageReading>();
    const h = setup({ read: () => gate.promise });
    h.auth.states.set("cursor", connected("cursor", "u1"));
    const usage = h.make();
    usage.trigger({ kind: "refresh" }); usage.trigger({ kind: "refresh" }); usage.trigger({ kind: "open" });
    await flush();
    expect(h.read).toHaveBeenCalledOnce();
    gate.resolve(ok(h.now(), 77)); await usage.settled();
    expect(usage.entries()).toEqual([{ provider: "cursor", inFlight: false, reading: ok(h.now(), 77) }]);
  });
  it("keeps the 5-minute interval for start and turn ends, and lets refresh read at once", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "c1"));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await usage.settled();
    h.advance(READ_INTERVAL_MS - 1);
    usage.trigger({ kind: "start" }); usage.trigger({ kind: "open" }); await usage.settled();
    expect(h.read).toHaveBeenCalledOnce();
    usage.trigger({ kind: "refresh" }); await usage.settled();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
  it("retries a failed read when the popover opens, within the interval", async () => {
    const h = setup({ read: async () => failed(1_000_000) });
    h.auth.states.set("codex", connected("codex", "x1"));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await usage.settled();
    h.advance(1000);
    usage.trigger({ kind: "start" }); await usage.settled();
    expect(h.read).toHaveBeenCalledOnce();
    usage.trigger({ kind: "open" }); await usage.settled();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
  it("gives a Claude read its login's organization to pin, and no other provider's", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "c1")); h.auth.states.set("codex", connected("codex", "x1"));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await usage.settled();
    const leases = new Map(h.read.mock.calls.map(([provider, lease]) => [provider, lease as Lease & { organization?: string }]));
    expect(leases.get("claude")?.organization).toBe("org-secret-1");
    expect(leases.get("codex")).not.toHaveProperty("organization");
  });
  it("turns a thrown read and a refused lease into read_failed, never leaving the provider in flight", async () => {
    const h = setup({ read: async () => { throw new Error("boom"); } });
    h.auth.states.set("claude", connected("claude", "c1")); h.auth.states.set("codex", connected("codex", "x1"));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await usage.settled();
    expect(usage.entries()).toEqual([
      { provider: "claude", inFlight: false, reading: failed(h.now()) }, { provider: "codex", inFlight: false, reading: failed(h.now()) },
    ]);
    h.auth.refuse = "busy";
    usage.trigger({ kind: "refresh" }); await usage.settled();
    expect(usage.entries().every(entry => !entry.inFlight && entry.reading?.status === "unavailable")).toBe(true);
  });
  it("checks an unverified connection first, as a run does, and reads Copilot unchecked (its check costs a request)", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "c1", { verified: false }));
    h.auth.states.set("copilot", connected("copilot", "p1", { verified: false }));
    const usage = h.make();
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: false }, { provider: "copilot", inFlight: false }]);
    usage.trigger({ kind: "start" }); await usage.settled();
    expect(h.auth.checks).toEqual(["claude"]);
    expect(h.read.mock.calls.map(call => call[0]).sort()).toEqual(["claude", "copilot"]);
  });
});

describe("UsageService checks", () => {
  it("shares one check per provider across triggers and waits for a check someone else started", async () => {
    const gate = deferred<UsageReading>();
    const h = setup({ read: () => gate.promise });
    h.auth.states.set("claude", connected("claude", "c1", { verified: false }));
    h.auth.states.set("codex", connected("codex", "x1", { verified: false, phase: "checking", attempt: { id: "other-check", kind: "check", owner: null, cancelled: false } }));
    const checked = vi.spyOn(h.auth, "checked").mockImplementation(async (provider: Provider) => { h.auth.states.set(provider, connected(provider, "x1")); });
    const usage = h.make();
    usage.trigger({ kind: "start" }); usage.trigger({ kind: "refresh" }); usage.trigger({ kind: "open" });
    await flush(); await flush();
    expect(h.auth.checks).toEqual(["claude"]);
    expect(checked).toHaveBeenCalledWith("codex");
    gate.resolve(ok(h.now())); await usage.settled();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
});

// review-B 🟡2: a check runs up to 20 s (statusRun); quit and a sign-out stop a read waiting on it at once, and
// AuthManager stops the check itself.
describe("UsageService quit and stop during a check", () => {
  const hung = (h: ReturnType<typeof setup>) => {
    vi.spyOn(h.auth, "check").mockImplementation(async () => ({ ok: true, attemptId: "check-1", done: new Promise<AuthState>(() => {}), outcome: new Promise(() => {}) }));
    vi.spyOn(h.auth, "checked").mockImplementation(() => new Promise<void>(() => {}));
  };
  it.each([
    ["a check it started", { verified: false }],
    ["a check someone else started", { verified: false, phase: "checking", attempt: { id: "other-check", kind: "check", owner: null, cancelled: false } }],
  ] as const)("quits without waiting out %s", async (_name, over) => {
    const h = setup(); hung(h);
    h.auth.states.set("claude", connected("claude", "c1", over as Partial<AuthState>));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await flush(); await flush();
    const started = Date.now();
    await usage.quit();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(h.read).not.toHaveBeenCalled();
    await usage.settled();
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: false, reading: failed(h.now()) }]);
  });
  it("stops a provider's read waiting on its check for a sign-out", async () => {
    const h = setup(); hung(h);
    h.auth.states.set("codex", connected("codex", "x1", { verified: false }));
    const usage = h.make();
    usage.trigger({ kind: "start" }); await flush(); await flush();
    const stopping = usage.stop("codex").then(() => "stopped");
    expect(await Promise.race([stopping, new Promise(resolve => setTimeout(() => resolve("waiting"), 500))])).toBe("stopped");
    expect(h.read).not.toHaveBeenCalled();
    expect(h.auth.held).toBe(0);
  });
});

describe("UsageService unusable connections", () => {
  it("does not read a connection readiness refuses and carries its cause instead", async () => {
    const h = setup({ readiness: provider => provider === "codex" ? { ready: false, cause: "version_unsupported", action: "update" } : { ready: true } });
    h.auth.states.set("claude", connected("claude", "c1", { expired: true, verified: false, phase: "reauthRequired" }));
    h.auth.states.set("codex", connected("codex", "x1"));
    h.auth.states.set("cursor", connected("cursor", "u1", { verified: false, error: { code: "check_failed" } }));
    const readiness = (provider: Provider): Readiness => provider === "claude" ? { ready: false, cause: "reauth_required", action: "reauth" }
      : provider === "codex" ? { ready: false, cause: "version_unsupported", action: "update" } : { ready: false, cause: "unverified", action: "retry" };
    const usage = new UsageService({ auth: h.auth, readiness, read: h.read, visible: () => true, publish: () => {}, now: h.now });
    usage.trigger({ kind: "refresh" }); await usage.settled();
    expect(h.read).not.toHaveBeenCalled();
    expect(usage.entries()).toEqual([
      { provider: "claude", inFlight: false, blocked: "reauth_required" },
      { provider: "codex", inFlight: false, blocked: "version_unsupported" },
      { provider: "cursor", inFlight: false, blocked: "unverified" },
    ]);
  });
  it("reads a reauth cause that is not an expired sign-in (an unpinned Claude login) as one Settings calls unavailable", () => {
    const h = setup({ readiness: () => ({ ready: false, cause: "reauth_required", action: "reauth" }) });
    h.auth.states.set("claude", connected("claude", "c1"));
    expect(h.make().entries()).toEqual([{ provider: "claude", inFlight: false, blocked: "unverified" }]);
  });
});

describe("UsageService connection changes", () => {
  it("reads after a sign-in, drops a signed-out provider, and forgets the previous account on a replacement", async () => {
    const h = setup();
    const usage = h.make();
    expect(usage.entries()).toEqual([]);
    h.auth.states.set("codex", connected("codex", "x1"));
    usage.authChanged();
    expect(usage.entries()).toEqual([{ provider: "codex", inFlight: true }]);
    await usage.settled();
    expect(usage.entries()).toEqual([{ provider: "codex", inFlight: false, reading: ok(h.now()) }]);
    const gate = deferred<UsageReading>();
    h.read.mockImplementationOnce(() => gate.promise);
    h.auth.states.set("codex", connected("codex", "x2"));
    usage.authChanged();
    expect(usage.entries()).toEqual([{ provider: "codex", inFlight: true }]);
    h.auth.states.set("codex", disconnected("codex"));
    usage.authChanged();
    expect(usage.entries()).toEqual([]);
    gate.resolve(ok(h.now(), 99)); await usage.settled();
    expect(usage.entries()).toEqual([]);
    expect(h.published.at(-1)).toEqual([]);
  });
  it("drops a read that started before the account was replaced", async () => {
    const gate = deferred<UsageReading>();
    const h = setup();
    h.read.mockImplementationOnce(() => gate.promise);
    h.auth.states.set("claude", connected("claude", "c1"));
    const usage = h.make();
    usage.trigger({ kind: "refresh" }); await flush();
    h.auth.states.set("claude", connected("claude", "c2"));
    usage.authChanged(); await flush(); await flush();
    expect(h.read).toHaveBeenCalledTimes(2);
    gate.resolve(ok(h.now(), 88)); await usage.settled();
    expect(usage.entries()).toEqual([{ provider: "claude", inFlight: false, reading: ok(h.now(), 42) }]);
  });
  // review-B 🟢1: the earlier account's read is stopped when the new account's read takes its place.
  it("stops the earlier account's read when a replacement's read starts", async () => {
    const signals: AbortSignal[] = [];
    const h = setup({ read: (_provider, _lease, signal) => { signals.push(signal); return new Promise(resolve => signal.addEventListener("abort", () => resolve(failed(0)))); } });
    h.auth.states.set("claude", connected("claude", "c1"));
    const usage = h.make();
    usage.trigger({ kind: "refresh" }); await flush(); await flush();
    h.auth.states.set("claude", connected("claude", "c2"));
    usage.authChanged(); await flush(); await flush();
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    await usage.quit();
    expect(h.auth.held).toBe(0);
  });
  it("reads a sign-in once its connection becomes usable, if it was busy when it appeared", async () => {
    let ready = false;
    const h = setup({ readiness: () => ready ? { ready: true } : { ready: false, cause: "busy", action: "wait" } });
    const usage = h.make();
    h.auth.states.set("codex", connected("codex", "x1"));
    usage.authChanged(); await usage.settled();
    expect(h.read).not.toHaveBeenCalled();
    ready = true;
    usage.authChanged(); await usage.settled();
    expect(h.read).toHaveBeenCalledOnce();
  });
  it("stops the provider's read for a sign-out: the read is aborted and its lease released before stop resolves", async () => {
    let aborted = false;
    const h = setup({ read: (_provider, _lease, signal) => new Promise(resolve => signal.addEventListener("abort", () => { aborted = true; setTimeout(() => resolve(failed(0)), 5); })) });
    h.auth.states.set("cursor", connected("cursor", "u1"));
    const usage = h.make();
    usage.trigger({ kind: "refresh" }); await flush(); await flush();
    expect(h.auth.held).toBe(1);
    await usage.stop("cursor");
    expect(aborted).toBe(true);
    expect(h.auth.held).toBe(0);
    expect(usage.entries()[0]?.inFlight).toBe(false);
  });
});

describe("UsageService visibility", () => {
  it("does not read while the app window is hidden, and reads under the 5-minute rule when it shows again", async () => {
    let visible = false;
    const h = setup({ visible: () => visible });
    h.auth.states.set("claude", connected("claude", "c1"));
    const usage = h.make();
    usage.trigger({ kind: "start" }); usage.trigger({ kind: "refresh" }); await usage.settled();
    expect(h.read).not.toHaveBeenCalled();
    visible = true; usage.visibilityChanged(); await usage.settled();
    expect(h.read).toHaveBeenCalledOnce();
    visible = false; usage.visibilityChanged(); h.advance(60_000);
    visible = true; usage.visibilityChanged(); await usage.settled();
    expect(h.read).toHaveBeenCalledOnce();
    visible = false; usage.visibilityChanged(); h.advance(READ_INTERVAL_MS);
    visible = true; usage.visibilityChanged(); await usage.settled();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
});

describe("UsageService turn ends", () => {
  it("reads through the run's open connection without a lease or a new process, under the 5-minute rule", async () => {
    const h = setup();
    h.auth.states.set("claude", connected("claude", "c1"));
    const usage = h.make();
    const read = vi.fn(async () => claudeFixture);
    await usage.turnEnd("claude", "c1", read);
    expect(read).toHaveBeenCalledOnce();
    expect(h.read).not.toHaveBeenCalled();
    expect(h.auth.uses).toEqual([]);
    expect(usage.entries()[0]).toMatchObject({ provider: "claude", inFlight: false, reading: { status: "ok", readAt: h.now() } });
    h.advance(60_000);
    await usage.turnEnd("claude", "c1", read);
    expect(read).toHaveBeenCalledOnce();
  });
  it("parses Codex's reply and reads Method not found as not_supported", async () => {
    const h = setup();
    h.auth.states.set("codex", connected("codex", "x1"));
    const usage = h.make();
    await usage.turnEnd("codex", "x1", async () => codexFixture);
    expect(usage.entries()[0]?.reading).toMatchObject({ status: "ok" });
    h.advance(READ_INTERVAL_MS);
    await usage.turnEnd("codex", "x1", async () => { throw Object.assign(new Error("Method not found"), { code: -32601 }); });
    expect(usage.entries()[0]?.reading).toEqual({ status: "unavailable", reason: "not_supported", readAt: h.now() });
  });
  it("skips a turn end of another connection, a hidden window and a read already in flight", async () => {
    let visible = true;
    const gate = deferred<UsageReading>();
    const h = setup({ visible: () => visible, read: () => gate.promise });
    h.auth.states.set("claude", connected("claude", "c2"));
    const usage = h.make();
    const read = vi.fn(async () => claudeFixture);
    await usage.turnEnd("claude", "c1", read);
    visible = false; await usage.turnEnd("claude", "c2", read); visible = true;
    usage.trigger({ kind: "refresh" }); await flush();
    await usage.turnEnd("claude", "c2", read);
    expect(read).not.toHaveBeenCalled();
    gate.resolve(ok(h.now())); await usage.settled();
  });
  it("hooks only a Doan-account Claude or Codex run; a legacy external run and ACP runs get none", async () => {
    const usage = { turnEnd: vi.fn(async () => {}) };
    const base: Prepared = { runtime: "claude", configDir: "/p", cwd: "/r", command: "/bin/claude", env: {} };
    const owner = (provider: Provider) => ({ kind: "doan" as const, provider, connectionId: `conn-${provider}`, accountId: null, workspaceId: null, profile: provider });
    expect(withTurnUsage(base, usage).usageAtTurnEnd).toBeUndefined();
    expect(withTurnUsage({ ...base, runtime: "cursor", owner: owner("cursor") }, usage).usageAtTurnEnd).toBeUndefined();
    const hooked = withTurnUsage({ ...base, runtime: "codex", owner: owner("codex") }, usage);
    const read = async () => codexFixture;
    await hooked.usageAtTurnEnd!(read);
    expect(usage.turnEnd).toHaveBeenCalledExactlyOnceWith("codex", "conn-codex", read);
  });
});

describe("UsageService memory only", () => {
  it("imports nothing that writes files: values live in main memory only", () => {
    for (const file of ["./usageService.ts", "./usageStore.ts", "./usageIpc.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/from "node:fs|from "fs|writeFile|appendFile/);
    }
  });
});
