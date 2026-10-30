import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MachineState, StepResult } from "./onboarding/machine";
import { createSetupBroker, type SetupStatus } from "./setupBroker";

const MAIN = 1, SETTINGS = 2;

function state(cli: "ours" | "missing" | "dangling"): MachineState {
  const link = { state: cli, value: null, stamp: "" };
  const agent = { executable: "/bin/agent", config: "/c", mcp: { state: "ours" as const, value: "" } };
  return {
    requestId: "r", cli: link, stub: { state: "ours", stamp: "" }, claudeLink: { state: "ours", value: null, stamp: "" },
    probe: { ok: true, path: "/bin", claudeConfigDir: "", codexHome: "" }, agents: { claude: agent, codex: agent },
    display: { cliPath: "/h/.local/bin/doan", stubPath: "/h/s", claudeLinkPath: "/h/c", blocked: { cli: null, stub: null, claudeLink: null } },
  } as unknown as MachineState;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const machine = { read: vi.fn<(id: string) => Promise<MachineState>>(), run: vi.fn<(value: unknown) => Promise<StepResult>>(), answer: vi.fn<(value: unknown) => Promise<StepResult>>(), cancelConfirmation: vi.fn(), isBusy: vi.fn(() => false) };
const published: SetupStatus[] = [];
let closed = false;
let broker: ReturnType<typeof createSetupBroker>;
beforeEach(() => {
  vi.clearAllMocks();
  published.length = 0;
  closed = false;
  machine.read.mockResolvedValue(state("ours"));
  machine.run.mockResolvedValue({ kind: "success" });
  machine.answer.mockResolvedValue({ kind: "success" });
  broker = createSetupBroker({ machine, translocated: false, onboardingClosed: async () => closed, publish: status => published.push(status) });
});

test("starts with no summary, then publishes the read summary and the onboarding flag", async () => {
  expect(broker.status()).toEqual({ summary: null, causes: {}, checking: false, busy: false, onboardingClosed: false });
  closed = true;
  const result = await broker.refresh();
  expect(result).toEqual({ summary: { cli: "connected", claude: "connected", codex: "connected" }, causes: {}, checking: false, busy: false, onboardingClosed: true });
  expect(published.at(-1)).toEqual(result);
});

test("keeps the previous summary while a new read runs", async () => {
  await broker.refresh();
  const later = deferred<MachineState>();
  machine.read.mockReturnValueOnce(later.promise);
  const refreshing = broker.refresh();
  await vi.waitFor(() => expect(published.at(-1)).toMatchObject({ checking: true, summary: { cli: "connected" } }));
  later.resolve(state("dangling"));
  expect((await refreshing).summary?.cli).toBe("needs-attention");
});

test("the causes follow the summary: kept while reading, replaced with the new summary, never ahead of it", async () => {
  await broker.refresh();
  const later = deferred<MachineState>();
  machine.read.mockReturnValueOnce(later.promise);
  const refreshing = broker.refresh();
  await vi.waitFor(() => expect(published.at(-1)).toMatchObject({ checking: true, causes: {} }));
  later.resolve(state("dangling"));
  expect(await refreshing).toMatchObject({ summary: { cli: "needs-attention" }, causes: { cli: { kind: "cli-dangling" } } });
  machine.read.mockResolvedValueOnce(state("ours"));
  expect(await broker.refresh()).toMatchObject({ summary: { cli: "connected" }, causes: {} });
});

test("a read that started earlier cannot replace a newer summary or its causes", async () => {
  const slow = deferred<MachineState>();
  machine.read.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(state("dangling"));
  const first = broker.read(MAIN, "a");
  await broker.read(SETTINGS, "b");
  slow.resolve(state("ours"));
  await first;
  expect(broker.status()).toMatchObject({ summary: { cli: "needs-attention" }, causes: { cli: { kind: "cli-dangling" } } });
});

test("a read that started earlier cannot replace a newer summary", async () => {
  const slow = deferred<MachineState>();
  machine.read.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(state("missing"));
  const first = broker.read(MAIN, "a");
  await broker.read(SETTINGS, "b");
  slow.resolve(state("ours"));
  await first;
  expect(broker.status().summary?.cli).toBe("not-connected");
});

test("refreshes asked for during a refresh run once more, not once each", async () => {
  const slow = deferred<MachineState>();
  machine.read.mockReturnValueOnce(slow.promise);
  const a = broker.refresh(), b = broker.refresh(), c = broker.refresh();
  slow.resolve(state("ours"));
  await Promise.all([a, b, c]);
  expect(machine.read).toHaveBeenCalledTimes(2);
});

test("read tokens are per window: one window's newer read does not stale another's", async () => {
  const slow = deferred<MachineState>();
  machine.read.mockReturnValueOnce(slow.promise);
  const settings = broker.read(SETTINGS, "s1");
  expect(await broker.read(MAIN, "m1")).toMatchObject({ kind: "state" });
  slow.resolve(state("ours"));
  expect(await settings).toMatchObject({ kind: "state", summary: { cli: "connected" } });
  const again = deferred<MachineState>();
  machine.read.mockReturnValueOnce(again.promise);
  const older = broker.read(SETTINGS, "s2");
  await broker.read(SETTINGS, "s3");
  again.resolve(state("ours"));
  expect(await older).toEqual({ kind: "stale" });
});

test("one setup write runs app-wide; the other window gets busy", async () => {
  const slow = deferred<StepResult>();
  machine.run.mockReturnValueOnce(slow.promise);
  const running = broker.run(SETTINGS, { step: "cli" });
  expect(broker.status().busy).toBe(true);
  expect(await broker.run(MAIN, { step: "cli" })).toEqual({ kind: "busy" });
  expect(machine.run).toHaveBeenCalledOnce();
  slow.resolve({ kind: "success" });
  expect(await running).toEqual({ kind: "success" });
  expect(broker.status().busy).toBe(false);
  expect(await broker.run(MAIN, { step: "cli" })).toEqual({ kind: "success" });
});

test("a confirmation belongs to the window that asked; only it can answer", async () => {
  machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q1", target: "cli", message: "Replace?" });
  expect(await broker.run(SETTINGS, { step: "cli" })).toMatchObject({ kind: "confirm", id: "q1" });
  expect(await broker.run(MAIN, { step: "cli" })).toEqual({ kind: "busy" });
  expect(await broker.answer(MAIN, { id: "q1", allow: true })).toEqual({ kind: "busy" });
  expect(await broker.answer(SETTINGS, { id: "old", allow: true })).toEqual({ kind: "stale" });
  expect(await broker.answer(SETTINGS, { id: "q1", allow: true, more: 1 })).toEqual({ kind: "stale" });
  expect(machine.answer).not.toHaveBeenCalled();
  machine.answer.mockResolvedValueOnce({ kind: "confirm", id: "q2", target: "claudeLink", message: "Again?" });
  expect(await broker.answer(SETTINGS, { id: "q1", allow: true })).toMatchObject({ kind: "confirm", id: "q2" });
  expect(await broker.answer(SETTINGS, { id: "q2", allow: true })).toEqual({ kind: "success" });
  expect(machine.answer).toHaveBeenLastCalledWith({ id: "q2", allow: true });
  expect(broker.status().busy).toBe(false);
});

test("a declined confirmation frees the lock", async () => {
  machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
  machine.answer.mockResolvedValueOnce({ kind: "cancelled" });
  await broker.run(MAIN, { step: "cli" });
  expect(await broker.answer(MAIN, { id: "q", allow: false })).toEqual({ kind: "cancelled" });
  expect(broker.status().busy).toBe(false);
});

test("a window that goes away releases its lock and clears the machine's confirmation", async () => {
  machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
  await broker.run(SETTINGS, { step: "cli" });
  broker.drop(MAIN);
  expect(machine.cancelConfirmation).not.toHaveBeenCalled();
  expect(broker.status().busy).toBe(true);
  broker.drop(SETTINGS);
  expect(machine.cancelConfirmation).toHaveBeenCalledOnce();
  expect(broker.status().busy).toBe(false);
  expect(await broker.run(MAIN, { step: "cli" })).toEqual({ kind: "success" });
});

test("a step that ends after its window went away cannot leave a confirmation behind", async () => {
  const slow = deferred<StepResult>();
  machine.run.mockReturnValueOnce(slow.promise);
  const running = broker.run(SETTINGS, { step: "cli" });
  broker.drop(SETTINGS);
  expect(broker.status().busy).toBe(false);
  slow.resolve({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
  expect(await running).toEqual({ kind: "stale" });
  expect(machine.cancelConfirmation).toHaveBeenCalledOnce();
});

test("cancelConfirmation acts only on the owner's pending confirmation", async () => {
  machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
  await broker.run(SETTINGS, { step: "cli" });
  broker.cancelConfirmation(MAIN);
  expect(machine.cancelConfirmation).not.toHaveBeenCalled();
  broker.cancelConfirmation(SETTINGS);
  expect(machine.cancelConfirmation).toHaveBeenCalledOnce();
  expect(broker.isBusy()).toBe(false);
});

test("every finished setup action refreshes the summary", async () => {
  await broker.run(MAIN, { step: "cli" });
  await vi.waitFor(() => expect(machine.read).toHaveBeenCalledOnce());
});

test("isBusy also reports a machine still writing", () => {
  machine.isBusy.mockReturnValue(true);
  expect(broker.isBusy()).toBe(true);
});

test("isWriting is true only for the window whose write is running, not for its confirmation", async () => {
  const slow = deferred<StepResult>();
  machine.run.mockReturnValueOnce(slow.promise);
  const running = broker.run(SETTINGS, { step: "cli" });
  expect(broker.isWriting(SETTINGS)).toBe(true);
  expect(broker.isWriting(MAIN)).toBe(false);
  slow.resolve({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
  await running;
  expect(broker.isWriting(SETTINGS)).toBe(false);
  const slowAnswer = deferred<StepResult>();
  machine.answer.mockReturnValueOnce(slowAnswer.promise);
  const answering = broker.answer(SETTINGS, { id: "q", allow: true });
  expect(broker.isWriting(SETTINGS)).toBe(true);
  slowAnswer.resolve({ kind: "success" });
  await answering;
  expect(broker.isWriting(SETTINGS)).toBe(false);
});

test("a failed first read settles unknown chips and a later read recovers", async () => {
  machine.read.mockRejectedValueOnce(new Error("probe failed"));
  expect(await broker.read(MAIN, "failed")).toEqual({ kind: "stale" });
  expect(broker.status()).toMatchObject({ checking: false, summary: { cli: "couldnt-check", claude: "couldnt-check", codex: "couldnt-check" } });
  await broker.read(MAIN, "recovered");
  expect(broker.status().summary?.cli).toBe("connected");
});

test("refresh failure preserves the last summary and releases checking", async () => {
  await broker.refresh();
  machine.read.mockRejectedValueOnce(new Error("probe failed"));
  expect(await broker.refresh()).toMatchObject({ checking: false, summary: { cli: "connected" } });
});

test("late read failure cannot overwrite a newer success", async () => {
  let reject!: (reason: Error) => void;
  machine.read.mockReturnValueOnce(new Promise<MachineState>((_resolve, fail) => { reject = fail; }));
  const old = broker.read(MAIN, "old");
  await broker.read(MAIN, "new");
  reject(new Error("old failure")); await old;
  expect(broker.status()).toMatchObject({ checking: false, summary: { cli: "connected" } });
});

// buzz-settings design '창 제거와 IPC': the main window's renderer is replaced (reload, crash); main calls drop(owner).
describe("dialog session", () => {
  test("reload 뒤 대기 중 확인이 취소된다", async () => {
    machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" } as StepResult);
    expect(await broker.run(MAIN, { step: "cli" })).toMatchObject({ kind: "confirm" });
    expect(broker.status().busy).toBe(true);
    broker.drop(MAIN);
    expect(machine.cancelConfirmation).toHaveBeenCalledOnce();
    expect(broker.status().busy).toBe(false);
    expect(await broker.answer(MAIN, { id: "q", allow: true })).toEqual({ kind: "stale" });
    expect(machine.answer).not.toHaveBeenCalled();
  });

  test("a read the old renderer started answers stale after the reload", async () => {
    const later = deferred<MachineState>();
    machine.read.mockReturnValueOnce(later.promise);
    const reading = broker.read(MAIN, "r1");
    broker.drop(MAIN);
    later.resolve(state("ours"));
    expect(await reading).toEqual({ kind: "stale" });
  });
});
