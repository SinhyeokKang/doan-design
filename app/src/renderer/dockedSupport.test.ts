import { afterEach, expect, test, vi } from "vitest";
import { DockedSupport, modelsKey } from "./dockedSupport";

afterEach(() => vi.unstubAllGlobals());
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// An existing conversation's pick is stored at once and shows until its summary reports it.
test("an existing conversation's mode pick is stored at once and shows until the summary reports it", async () => {
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: set } });
  const support = new DockedSupport(() => {}, window.doan);
  support.pickPermission("conversation:c1", "c1", "bypass");
  expect(set).toHaveBeenCalledWith({ conversationId: "c1", permissionMode: "bypass" });
  await flush();
  expect(support.picks["conversation:c1"]).toEqual({ permissionMode: "bypass" });
  support.settlePermission("conversation:c1", "default");
  expect(support.picks["conversation:c1"]).toEqual({ permissionMode: "bypass" });
  support.settlePermission("conversation:c1", "bypass");
  expect(support.picks["conversation:c1"]).toEqual({});
});

test("a refused pick goes back to the stored mode; a new conversation's pick calls nothing", async () => {
  const set = vi.fn(async () => ({ error: "bad_request" }));
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: set } });
  const support = new DockedSupport(() => {}, window.doan);
  support.pickPermission("conversation:c1", "c1", "plan");
  await flush();
  expect(support.picks["conversation:c1"]).toEqual({});
  support.pickPermission("new:/r", null, "plan");
  expect(set).toHaveBeenCalledTimes(1);
  expect(support.picks["new:/r"]).toEqual({ permissionMode: "plan" });
});

// A pending pick remembers its stored mode; if main moves that mode first (a plan approval), the pick is dropped.
test("a pending pick is dropped when the stored mode changes from the one it was made from", async () => {
  vi.stubGlobal("window", { doan: { setConversationPermissionMode: vi.fn(async () => undefined) } });
  const support = new DockedSupport(() => {}, window.doan);
  support.pickPermission("conversation:c1", "c1", "acceptEdits", "plan");
  await flush();
  support.settlePermission("conversation:c1", "plan");
  expect(support.picks["conversation:c1"]).toMatchObject({ permissionMode: "acceptEdits" });
  support.settlePermission("conversation:c1", "default");
  expect(support.picks["conversation:c1"]).toEqual({});
});

// A just-started conversation's mode shows until its summary arrives; it is no pick, so it is not sent or remembered.
test("a just-started conversation's mode shows until its summary arrives", () => {
  const support = new DockedSupport(() => {}, { designSkills: { list: vi.fn(), get: vi.fn() }, listConversationModels: vi.fn(), setConversationPermissionMode: vi.fn() });
  support.startedIn("conversation:c1", "bypass");
  expect(support.started["conversation:c1"]).toBe("bypass");
  expect(support.picks["conversation:c1"]).toBeUndefined();
  support.settlePermission("conversation:c1", null);
  expect(support.started["conversation:c1"]).toBe("bypass");
  support.settlePermission("conversation:c1", "default");
  expect(support.started["conversation:c1"]).toBeUndefined();
});

// A Codex account replacement mints a new connection, so the models list is read again for it.
test("a provider's list is read again for its new connection, and the previous connection's list is not shown for it", async () => {
  const { authStatus } = await import("../main/agentAuth/state");
  const snapshot = (generation: number) => ({ revision: generation, providers: [authStatus({ provider: "codex", generation, verified: true, expired: false, connection: { provider: "codex", connectionId: `c${generation}`, profile: "codex", account: { id: null, workspace: null, email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" }, { cli: "found", version: "supported", tools: "ready" }, generation)] });
  const list = vi.fn().mockResolvedValueOnce({ models: [{ id: "gpt-old", label: "GPT Old", default: true }] }).mockResolvedValueOnce({ models: [{ id: "gpt-new", label: "GPT New", default: true }] });
  vi.stubGlobal("window", { doan: { listConversationModels: list } });
  const support = new DockedSupport(() => {}, window.doan);
  support.setAuth(snapshot(1));
  support.readModels("/r", "codex");
  await flush();
  expect(support.models[modelsKey("/r", "codex", 1)]).toMatchObject({ models: [{ id: "gpt-old" }] });
  support.setAuth(snapshot(2));
  expect(support.models[modelsKey("/r", "codex", 2)]).toBeUndefined();
  support.readModels("/r", "codex");
  await flush();
  expect(list).toHaveBeenCalledTimes(2);
  expect(support.models[modelsKey("/r", "codex", 2)]).toMatchObject({ models: [{ id: "gpt-new" }] });
});

// A failed read is not kept for the run: the picker asks again when it opens, and the next answer shows.
test("a failed models read is read again; a list that arrived is not", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("cli")).mockResolvedValueOnce({ error: "unavailable" }).mockResolvedValueOnce({ models: [{ id: "gpt", label: "GPT", default: true }] });
  vi.stubGlobal("window", { doan: { listConversationModels: list } });
  const support = new DockedSupport(() => {}, window.doan);
  const key = modelsKey("/r", "codex", 0);
  support.readModels("/r", "codex");
  await flush();
  expect(support.models[key]).toEqual({ error: "unknown" });
  support.readModels("/r", "codex");
  await flush();
  expect(support.models[key]).toEqual({ error: "unavailable" });
  support.readModels("/r", "codex");
  await flush();
  expect(support.models[key]).toMatchObject({ models: [{ id: "gpt" }] });
  support.readModels("/r", "codex");
  expect(list).toHaveBeenCalledTimes(3);
});

// DESIGN 'Busy action': Retry reads the presets again keeping the failed reply (its notice and Retry) until the new
// answer, and says whether it succeeded, so the Retry knows whether its line goes.
test("a presets Retry keeps the failed reply until the answer and resolves whether it succeeded", async () => {
  const listed = { v: 1, ok: true, result: { version: "1", presets: [] } };
  let answer!: (reply: unknown) => void;
  const list = vi.fn().mockRejectedValueOnce(new Error("cli")).mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
  vi.stubGlobal("window", { doan: { designSkills: { list } } });
  const support = new DockedSupport(() => {}, window.doan);
  support.readPresets();
  expect(support.presets).toBeUndefined();
  await flush();
  expect(support.presets).toMatchObject({ ok: false });
  const shown = support.presets;
  const again = support.retryPresets();
  expect(support.presets).toBe(shown);
  answer(listed);
  expect(await again).toBe(true);
  expect(support.presets).toBe(listed);
});
