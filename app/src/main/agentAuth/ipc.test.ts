import { describe, expect, it, vi } from "vitest";
import { AUTH_CHANNELS, AuthIpc, type AuthBackend, type AuthPromptEvent, type AuthSnapshot } from "./ipc";
import { initialAuthState, transition } from "./state";
import { PROVIDERS, type AccountConnection, type AuthEvent, type AuthState, type Provider, type ToolFacts } from "./types";

const ready: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const cursor: AccountConnection = { provider: "cursor", connectionId: "conn-secret", profile: "cursor", account: { id: "acct-secret", workspace: null, email: "ada@example.com" } };

// Backend states change only through the real transitions, so the IPC layer sees what AuthManager would publish.
function backend() {
  const states = new Map<Provider, AuthState>(PROVIDERS.map(p => [p, initialAuthState(p, p === "cursor" ? cursor : null)]));
  const apply = (provider: Provider, event: AuthEvent) => { const result = transition(states.get(provider)!, event); if (result.ok) states.set(provider, result.state); return result; };
  const started = (provider: Provider, event: AuthEvent) => {
    const result = apply(provider, event);
    return result.ok ? { ok: true as const, attemptId: "attemptId" in event ? event.attemptId : "", done: Promise.resolve(result.state) } : { ok: false as const, reason: result.reason, state: result.state };
  };
  const api: AuthBackend = {
    state: provider => states.get(provider)!,
    check: vi.fn(async provider => { const r = started(provider, { type: "check", attemptId: "check-1" }); return r.ok ? { ...r, outcome: Promise.resolve("ok" as const) } : r; }),
    signIn: vi.fn(async (provider, owner, options) => options.stop || provider !== "cursor" ? started(provider, { type: "signIn", attemptId: "sign-1", owner }) : { ok: false as const, reason: "stop_required" as const, state: states.get(provider)! }),
    cancel: vi.fn(async (provider, attemptId, owner) => apply(provider, { type: "cancel", attemptId, owner })),
    submitCode: vi.fn(() => ({ ok: true as const })),
    signOut: vi.fn(async (provider, options) => started(provider, { type: "signOut", attemptId: "out-1", running: true, stop: options.stop === true })),
  };
  return { api, apply };
}
function ipc(probe: (provider: Provider) => Promise<ToolFacts> = vi.fn(async () => ready)) {
  const b = backend();
  const options = { backend: b.api, probe: vi.fn(probe), openExternal: vi.fn(async (_url: string) => {}), publish: vi.fn<(snapshot: AuthSnapshot) => void>(), prompt: vi.fn<(owner: number, event: AuthPromptEvent) => void>() };
  return { ...b, options, ipc: new AuthIpc(options) };
}

describe("agent auth IPC", () => {
  it("names its channels after the existing kebab-case IPC namespaces", () => {
    expect(Object.values(AUTH_CHANNELS)).toEqual(["agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out", "agent-auth:changed", "agent-auth:prompt"]);
  });
  it("reads every provider's secret-free status after probing tool facts once", async () => {
    const t = ipc();
    const snapshot = await t.ipc.read();
    expect(snapshot.providers.map(p => p.provider)).toEqual([...PROVIDERS]);
    expect(snapshot.providers.find(p => p.provider === "cursor")).toMatchObject({ phase: "connected", account: { email: "ada@example.com" }, readiness: { ready: false, cause: "unverified" } });
    expect(JSON.stringify(snapshot)).not.toMatch(/conn-secret|acct-secret|"profile"/);
    await t.ipc.read();
    expect(t.options.probe).toHaveBeenCalledTimes(PROVIDERS.length);
  });
  it("raises the revision for every change and every new tool fact, so an older snapshot never wins", async () => {
    const pending: ((facts: ToolFacts) => void)[] = [];
    const finish = (facts: ToolFacts) => pending.splice(0).forEach(resolve => resolve(facts));
    const t = ipc(() => new Promise<ToolFacts>(resolve => { pending.push(resolve); }));
    const reading = t.ipc.read();
    t.apply("claude", { type: "check", attemptId: "c1" }); t.ipc.changed();
    const first = t.options.publish.mock.calls[0]![0];
    expect(first.providers.find(p => p.provider === "claude")?.readiness).toEqual({ ready: false, cause: "version_unknown", action: "retry" });
    finish({ cli: "missing", version: "unknown", tools: "ready" });
    const read = await reading;
    expect(read.revision).toBeGreaterThan(first.revision);
    expect(read.providers[0]!.readiness).toMatchObject({ cause: "cli_missing" });
    const revisions = t.options.publish.mock.calls.map(c => c[0].revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
  });
  it.each([
    [AUTH_CHANNELS.check, { provider: "gemini" }],
    [AUTH_CHANNELS.check, { provider: "cursor", extra: 1 }],
    [AUTH_CHANNELS.signIn, { provider: "cursor", stop: "yes" }],
    [AUTH_CHANNELS.signIn, "cursor"],
    [AUTH_CHANNELS.cancel, { provider: "cursor", attemptId: "../x" }],
    [AUTH_CHANNELS.cancel, { provider: "cursor", attemptId: 7 }],
    [AUTH_CHANNELS.submitCode, { provider: "antigravity", attemptId: "a1", code: "x".repeat(16385) }],
    [AUTH_CHANNELS.submitCode, { provider: "antigravity", attemptId: "a1" }],
    [AUTH_CHANNELS.openLink, { provider: "cursor", attemptId: "a1", url: "https://example.com" }],
    [AUTH_CHANNELS.signOut, { provider: "cursor", stop: 1 }],
    [AUTH_CHANNELS.signOut, null],
    ["agent-auth:delete", { provider: "cursor" }],
  ])("refuses %s with %j before reaching the backend", async (channel, value) => {
    const t = ipc();
    expect(await t.ipc.handle(channel, value, 7)).toEqual({ ok: false, reason: "invalid" });
    for (const method of [t.api.check, t.api.signIn, t.api.cancel, t.api.submitCode, t.api.signOut]) expect(method).not.toHaveBeenCalled();
    expect(t.options.openExternal).not.toHaveBeenCalled();
  });
  it("binds sign-in, cancel and pasted addresses to the sending window and never returns state", async () => {
    const t = ipc();
    expect(await t.ipc.handle(AUTH_CHANNELS.signIn, { provider: "cursor" }, 7)).toEqual({ ok: false, reason: "stop_required" });
    expect(await t.ipc.handle(AUTH_CHANNELS.signIn, { provider: "cursor", stop: true }, 7)).toEqual({ ok: true, attemptId: "sign-1" });
    expect(t.api.signIn).toHaveBeenLastCalledWith("cursor", 7, { stop: true });
    expect(await t.ipc.handle(AUTH_CHANNELS.cancel, { provider: "cursor", attemptId: "sign-1" }, 8)).toEqual({ ok: false, reason: "not_owner" });
    expect(await t.ipc.handle(AUTH_CHANNELS.submitCode, { provider: "cursor", attemptId: "sign-1", code: "http://127.0.0.1:5/?code=c&state=s" }, 7)).toEqual({ ok: true });
    expect(t.api.submitCode).toHaveBeenCalledWith("cursor", "sign-1", 7, "http://127.0.0.1:5/?code=c&state=s");
    expect(await t.ipc.handle(AUTH_CHANNELS.cancel, { provider: "cursor", attemptId: "sign-1" }, 7)).toEqual({ ok: true });
  });
  it("passes an explicit stop to sign-out and refreshes tool facts on a check", async () => {
    const t = ipc();
    await t.ipc.read();
    expect(await t.ipc.handle(AUTH_CHANNELS.signOut, { provider: "cursor", stop: true }, 7)).toEqual({ ok: true, attemptId: "out-1" });
    expect(t.api.signOut).toHaveBeenCalledWith("cursor", { stop: true });
    expect(await t.ipc.handle(AUTH_CHANNELS.check, { provider: "claude" }, 7)).toEqual({ ok: true, attemptId: "check-1" });
    await vi.waitFor(() => expect(t.options.probe).toHaveBeenCalledTimes(PROVIDERS.length + 1));
    expect(t.options.probe).toHaveBeenLastCalledWith("claude");
  });
  it("reads one provider's tool facts again after a run found them changed and publishes only a change", async () => {
    let facts = ready;
    const t = ipc(async () => facts);
    await t.ipc.read(); t.options.publish.mockClear();
    await t.ipc.refreshTools("cursor");
    expect(t.options.probe).toHaveBeenLastCalledWith("cursor");
    expect(t.options.publish).not.toHaveBeenCalled();
    facts = { cli: "found", version: "unsupported", tools: "ready" };
    await t.ipc.refreshTools("cursor");
    expect(t.options.probe).toHaveBeenCalledTimes(PROVIDERS.length + 2);
    expect(t.options.publish).toHaveBeenCalledOnce();
    expect(t.options.publish.mock.calls[0]![0].providers.find(p => p.provider === "cursor")?.readiness).toMatchObject({ cause: "version_unsupported", action: "update" });
  });
  it("keeps answering reads when a facts probe breaks its never-throws contract", async () => {
    let fail = true;
    const t = ipc(async () => { if (fail) throw new Error("probe broke"); return ready; });
    const snapshot = await t.ipc.read();
    expect(snapshot.providers[0]!.readiness).toMatchObject({ cause: "version_unknown", action: "retry" });
    fail = false;
    await t.ipc.refreshTools("claude");
    expect((await t.ipc.read()).providers[0]!.readiness).not.toMatchObject({ cause: "version_unknown" });
  });
  it("sends a sign-in link only to its owner and opens only that attempt's link", async () => {
    const t = ipc();
    await t.ipc.handle(AUTH_CHANNELS.signIn, { provider: "copilot" }, 7);
    t.ipc.prompted({ provider: "copilot", attemptId: "sign-1", owner: 7, url: "https://github.com/login/oauth/authorize?state=s" });
    expect(t.options.prompt).toHaveBeenCalledWith(7, { provider: "copilot", attemptId: "sign-1", url: "https://github.com/login/oauth/authorize?state=s" });
    expect(await t.ipc.handle(AUTH_CHANNELS.openLink, { provider: "copilot", attemptId: "sign-1" }, 8)).toEqual({ ok: false, reason: "not_owner" });
    expect(await t.ipc.handle(AUTH_CHANNELS.openLink, { provider: "cursor", attemptId: "sign-1" }, 7)).toEqual({ ok: false, reason: "stale" });
    expect(await t.ipc.handle(AUTH_CHANNELS.openLink, { provider: "copilot", attemptId: "sign-1" }, 7)).toEqual({ ok: true });
    expect(t.options.openExternal).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?state=s");
    t.options.openExternal.mockRejectedValueOnce(new Error("no browser"));
    expect(await t.ipc.handle(AUTH_CHANNELS.openLink, { provider: "copilot", attemptId: "sign-1" }, 7)).toEqual({ ok: false, reason: "open_failed" });
    // Once the attempt is cancelled its link is gone.
    await t.ipc.handle(AUTH_CHANNELS.cancel, { provider: "copilot", attemptId: "sign-1" }, 7); t.ipc.changed();
    expect(await t.ipc.handle(AUTH_CHANNELS.openLink, { provider: "copilot", attemptId: "sign-1" }, 7)).toEqual({ ok: false, reason: "stale" });
    expect(t.options.openExternal).toHaveBeenCalledTimes(2);
  });
  it("drops a link for an attempt that is not the provider's current sign-in", () => {
    const t = ipc();
    t.ipc.prompted({ provider: "claude", attemptId: "ghost", owner: 7, url: "https://claude.ai/oauth" });
    expect(t.options.prompt).not.toHaveBeenCalled();
  });
});

describe("run-time version incompatibility records", () => {
  const copilot: ToolFacts = { cli: "found", version: "supported", installed: "1.0.105", tools: "ready" };
  const status = (snapshot: AuthSnapshot, provider: Provider) => snapshot.providers.find(p => p.provider === provider)!;
  it("publishes a record at once, before a refusal returns, even when the tool facts are unchanged", async () => {
    const t = ipc(async () => copilot);
    await t.ipc.read(); t.options.publish.mockClear();
    t.ipc.incompatible("copilot", "1.0.105");
    expect(t.options.publish).toHaveBeenCalledOnce();
    expect(status(t.options.publish.mock.calls[0]![0], "copilot")).toMatchObject({ readiness: { ready: false, cause: "version_incompatible", action: "retry" }, actions: ["signIn", "retry"] });
    expect(t.options.probe).toHaveBeenCalledTimes(PROVIDERS.length);
  });
  it("keeps the record when a refresh that started before it finishes later", async () => {
    let calls = 0, finish!: (facts: ToolFacts) => void;
    const t = ipc(() => calls++ < PROVIDERS.length ? Promise.resolve(copilot) : new Promise<ToolFacts>(resolve => { finish = resolve; }));
    await t.ipc.read();
    const refreshing = t.ipc.refreshTools("copilot");
    t.ipc.incompatible("copilot", "1.0.105");
    finish(copilot); await refreshing;
    expect(status(await t.ipc.read(), "copilot").readiness).toMatchObject({ cause: "version_incompatible" });
  });
  it("clears a record when a handshake of the same installed version passes, not another version's", async () => {
    const t = ipc(async () => copilot);
    await t.ipc.read(); t.ipc.incompatible("copilot", "1.0.105"); t.options.publish.mockClear();
    t.ipc.compatible("copilot", "1.0.106");
    expect(t.options.publish).not.toHaveBeenCalled();
    t.ipc.compatible("copilot", "1.0.105");
    expect(t.options.publish).toHaveBeenCalledOnce();
    expect(status(t.options.publish.mock.calls[0]![0], "copilot").readiness).not.toMatchObject({ cause: "version_incompatible" });
  });
  it("drops a record once a run reads a different installed version, and reads that provider's facts again", async () => {
    // The probe still names the recorded build: only dropping the record lets readiness change.
    const t = ipc(async () => copilot);
    await t.ipc.read(); t.ipc.incompatible("copilot", "1.0.105"); t.options.publish.mockClear();
    t.ipc.versionRead("copilot", "1.0.105");
    expect(t.options.probe).toHaveBeenCalledTimes(PROVIDERS.length);
    t.ipc.versionRead("copilot", "1.0.106");
    await vi.waitFor(() => expect(t.options.publish).toHaveBeenCalledOnce());
    expect(t.options.probe).toHaveBeenLastCalledWith("copilot");
    expect(status(t.options.publish.mock.calls[0]![0], "copilot").readiness).not.toMatchObject({ cause: "version_incompatible" });
  });
  it("only reads the tool facts again on a check while readiness has a version cause, so Copilot's paid check is not run", async () => {
    const facts: Partial<Record<Provider, ToolFacts>> = { copilot, claude: { cli: "found", version: "unknown", tools: "ready" }, cursor: { cli: "found", version: "unsupported", installed: "2026.10.21", tools: "ready" } };
    const t = ipc(async provider => facts[provider] ?? ready);
    await t.ipc.read(); t.ipc.incompatible("copilot", "1.0.105");
    for (const provider of ["copilot", "claude", "cursor"] as const) {
      t.options.probe.mockClear();
      expect(await t.ipc.handle(AUTH_CHANNELS.check, { provider }, 7)).toEqual({ ok: true });
      expect(t.options.probe).toHaveBeenCalledWith(provider);
    }
    expect(t.api.check).not.toHaveBeenCalled();
  });
  it("answers the current snapshot without waiting for the first probe", async () => {
    const t = ipc(() => new Promise<ToolFacts>(() => {}));
    void t.ipc.read();
    const current = t.ipc.latest();
    expect(current.providers.map(p => p.provider)).toEqual([...PROVIDERS]);
    expect(current.providers[0]!.readiness).toEqual({ ready: false, cause: "version_unknown", action: "retry" });
    t.ipc.changed();
    expect(t.ipc.latest().revision).toBeGreaterThan(current.revision);
  });
  it("hands main the outcome of a check it started, and the window only the reply", async () => {
    const t = ipc();
    await t.ipc.read();
    const outcome = Promise.resolve("ok" as const);
    vi.mocked(t.api.check).mockImplementationOnce(async provider => ({ ok: true as const, attemptId: "check-9", done: Promise.resolve(t.api.state(provider)), outcome }));
    const started = await t.ipc.check("claude");
    expect(started.reply).toEqual({ ok: true, attemptId: "check-9" });
    expect(started.outcome).toBe(outcome);
    vi.mocked(t.api.check).mockImplementationOnce(async provider => ({ ok: true as const, attemptId: "check-10", done: Promise.resolve(t.api.state(provider)), outcome }));
    expect(await t.ipc.handle(AUTH_CHANNELS.check, { provider: "claude" }, 7)).toEqual({ ok: true, attemptId: "check-10" });
  });
});

// buzz-settings About: tool versions come from this cache, never from a CLI run of their own.
describe("toolFacts", () => {
  it("answers the cached facts with a recorded incompatible version applied, without probing", async () => {
    const t = ipc(async provider => provider === "codex" ? { cli: "found", version: "supported", installed: "0.170.0", tools: "ready" } : ready);
    await t.ipc.read();
    t.options.probe.mockClear();
    expect(t.ipc.toolFacts("codex")).toEqual({ cli: "found", version: "supported", installed: "0.170.0", tools: "ready" });
    t.ipc.incompatible("codex", "0.170.0");
    expect(t.ipc.toolFacts("codex")).toMatchObject({ version: "incompatible", installed: "0.170.0" });
    expect(t.options.probe).not.toHaveBeenCalled();
  });
  it("answers null for a provider not probed yet", () => {
    expect(ipc().ipc.toolFacts("claude")).toBeNull();
  });
});
