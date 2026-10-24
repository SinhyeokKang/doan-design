import { randomUUID } from "node:crypto";
import { connectionSummary, type ConnectionSummary } from "../setup/connectionSummary";
import type { MachineState, StepResult } from "./onboarding/machine";
import { setupLock, type SetupLock, type SetupLockAction } from "./setupLock";

// What both windows see: home chips, banner and Finish card in the main
// window, the busy state of the other window's setup buttons.
export interface SetupStatus {
  // null until the first read finishes ("Checking…").
  summary: ConnectionSummary | null;
  // A read is running; the previous summary is still shown meanwhile.
  checking: boolean;
  // A setup write or its confirmation holds the app-wide lock.
  busy: boolean;
  // `onboarding.json` exists: the wizard was closed once.
  onboardingClosed: boolean;
}

export type SetupRead = { kind: "state"; state: MachineState; summary: ConnectionSummary } | { kind: "stale" };

export interface SetupMachine {
  read(requestId: string): Promise<MachineState>;
  run(value: unknown): Promise<StepResult>;
  answer(value: unknown): Promise<StepResult>;
  cancelConfirmation(): void;
  isBusy(): boolean;
}

export interface SetupBrokerDeps {
  machine: SetupMachine;
  translocated: boolean;
  onboardingClosed(): Promise<boolean>;
  publish(status: SetupStatus): void;
}

const failure = (error: unknown): StepResult => ({ kind: "error", message: error instanceof Error ? error.message : String(error) });

// Owners are webContents ids. The machine keeps one pending confirmation of
// its own; the lock records which window owns it, so another window gets
// `busy` and a window that goes away cannot leave it behind.
export function createSetupBroker(deps: SetupBrokerDeps) {
  let lock: SetupLock = { kind: "idle" };
  let status: SetupStatus = { summary: null, checking: false, busy: false, onboardingClosed: false };
  // Each window's newest read; a window's older read answers stale.
  const reads = new Map<number, string>();
  let started = 0, shown = 0, running = 0;
  let refreshing: Promise<SetupStatus> | null = null;
  let again = false;

  const publish = (next: Partial<SetupStatus>) => {
    status = { ...status, ...next };
    deps.publish(status);
  };
  const setLock = (next: SetupLock) => {
    lock = next;
    if (status.busy !== (lock.kind !== "idle")) publish({ busy: lock.kind !== "idle" });
  };
  const apply = (action: SetupLockAction) => {
    const result = setupLock(lock, action);
    if (result.kind === "success") setLock(result.state);
    return result.kind;
  };

  // Every read updates the summary, but one that started before the shown
  // one cannot replace it.
  async function machineRead(requestId: string): Promise<{ state: MachineState; summary: ConnectionSummary }> {
    const seq = ++started;
    if (running++ === 0) publish({ checking: true });
    let result: { state: MachineState; summary: ConnectionSummary } | undefined;
    try {
      const state = await deps.machine.read(requestId);
      result = { state, summary: connectionSummary(state, deps.translocated) };
      return result;
    } finally {
      const fresh = result !== undefined && seq > shown;
      if (fresh) shown = seq;
      publish({ checking: --running > 0, ...(fresh && result ? { summary: result.summary } : {}) });
    }
  }

  // Triggers that arrive during a refresh share it plus one more read, so a
  // burst of focus events does not start a shell probe each.
  function refresh(): Promise<SetupStatus> {
    if (refreshing) { again = true; return refreshing; }
    const run = async () => {
      do {
        again = false;
        status = { ...status, onboardingClosed: await deps.onboardingClosed() };
        try { await machineRead(randomUUID()); } catch { publish({}); }
      } while (again);
      refreshing = null;
      return status;
    };
    refreshing = run();
    return refreshing;
  }

  function settle(owner: number, operation: string, result: StepResult): StepResult {
    if (result.kind === "confirm") {
      if (apply({ type: "confirm", owner, operation, confirmation: result.id }) === "success") return result;
      // The window went away while the step ran; nobody can answer this.
      deps.machine.cancelConfirmation();
      return { kind: "stale" };
    }
    apply({ type: "release", owner, operation });
    void refresh();
    return result;
  }

  function cancelConfirmation(owner: number): void {
    if (lock.kind !== "confirming" || lock.owner !== owner) return;
    deps.machine.cancelConfirmation();
    apply({ type: "release", owner, operation: lock.operation });
  }

  return {
    status: () => status,
    refresh,
    // When the read ends, the caller still checks that its window is the same one.
    async read(owner: number, requestId: string): Promise<SetupRead> {
      const token = randomUUID();
      reads.set(owner, token);
      try {
        const { state, summary } = await machineRead(requestId);
        return reads.get(owner) === token ? { kind: "state", state, summary } : { kind: "stale" };
      } catch {
        return { kind: "stale" };
      }
    },
    async run(owner: number, value: unknown): Promise<StepResult> {
      const operation = randomUUID();
      if (apply({ type: "acquire", owner, operation }) !== "success") return { kind: "busy" };
      let result: StepResult;
      try { result = await deps.machine.run(value); } catch (error) { result = failure(error); }
      return settle(owner, operation, result);
    },
    async answer(owner: number, value: unknown): Promise<StepResult> {
      if (typeof value !== "object" || value === null || Object.keys(value).length !== 2 || !("id" in value) || !("allow" in value) ||
        typeof value.id !== "string" || typeof value.allow !== "boolean") return { kind: "stale" };
      if (lock.kind !== "confirming") return { kind: "stale" };
      if (lock.owner !== owner) return { kind: "busy" };
      const operation = lock.operation;
      const answered = apply({ type: "answer", owner, operation, confirmation: value.id, allow: value.allow });
      if (answered !== "success") return { kind: answered };
      let result: StepResult;
      try { result = await deps.machine.answer({ id: value.id, allow: value.allow }); } catch (error) { result = failure(error); }
      return value.allow ? settle(owner, operation, result) : result;
    },
    cancelConfirmation,
    // The window closed or its renderer was replaced: whatever it held goes.
    // A write still running finishes; its own release then answers stale.
    drop(owner: number): void {
      reads.delete(owner);
      cancelConfirmation(owner);
      if (lock.kind === "writing" && lock.owner === owner) apply({ type: "release", owner, operation: lock.operation });
    },
    isBusy: () => lock.kind !== "idle" || deps.machine.isBusy(),
    setOnboardingClosed(closed: boolean): void {
      if (status.onboardingClosed !== closed) publish({ onboardingClosed: closed });
    },
  };
}

export type SetupBroker = ReturnType<typeof createSetupBroker>;
