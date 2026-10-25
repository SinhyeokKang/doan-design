import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";

export async function waitFor(check: () => Promise<boolean>, name: string, ms = 15_000, interval = 30): Promise<void> {
  const end = Date.now() + ms;
  let lastError: unknown;
  for (;;) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    if (Date.now() >= end) throw lastError ?? new Error(`Timed out waiting for ${name}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

export async function bounded<T>(operation: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms} ms`)), ms); })]);
  } finally { clearTimeout(timer); }
}

interface AppProcess { process(): ChildProcess; close(): Promise<void> }
const children = new WeakMap<AppProcess, ChildProcess>();
function childProcess(app: AppProcess): ChildProcess {
  const child = children.get(app) ?? app.process();
  children.set(app, child);
  return child;
}
// Playwright releases its dispatcher on exit, including native menu quits.
export function rememberApp<T extends AppProcess>(app: T): T { childProcess(app); return app; }
const settled = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;

export async function closeApp(app: AppProcess | undefined, ms = 5_000): Promise<void> {
  if (!app) return;
  const child = childProcess(app);
  const exited = settled(child) ? Promise.resolve() : new Promise<void>(resolve => child.once("exit", () => resolve()));
  try {
    // Subscribe before close: Playwright also resolves close after signal exits.
    if (!settled(child)) await bounded(Promise.all([app.close(), exited]), ms, "app close");
  } catch (error) {
    if (!settled(child)) {
      child.kill("SIGKILL");
      await bounded(exited, ms, "forced app exit");
    }
    throw error;
  }
  assert.deepEqual({ code: child.exitCode, signal: child.signalCode }, { code: 0, signal: null }, "app must exit cleanly");
}

// Each suite owns its app and temp artifacts; a parent cannot safely guess a
// subordinate's current child. Verification runs even when shutdown fails.
export function suiteGuard(options: {
  name: string; app: () => AppProcess | undefined; verify: () => Promise<void>; cleanup: () => Promise<void>;
  timeoutMs?: number; closeMs?: number; verifyMs?: number;
}) {
  let finishing: Promise<void> | undefined, timedOut = false;
  const finish = (): Promise<void> => finishing ??= (async () => {
    const failures: unknown[] = [];
    const app = options.app();
    let child: ChildProcess | undefined;
    try { if (app) child = childProcess(app); await closeApp(app, options.closeMs ?? 5_000); } catch (error) { failures.push(error); }
    console.error(`${options.name}: real-state verification attempted`);
    try {
      await bounded(options.verify(), options.verifyMs ?? 10_000, "real-state verification");
      console.error(`${options.name}: real-state verification passed`);
    } catch (error) { console.error(`${options.name}: real-state verification incomplete or failed`, error); failures.push(error); }
    if ((child && settled(child)) || (!app && !timedOut)) {
      try { await bounded(options.cleanup(), 5_000, "temp cleanup"); } catch (error) { failures.push(error); }
    } else { console.error(`${options.name}: app exit unconfirmed; retaining temp artifacts`); }
    clearTimeout(watchdog);
    if (timedOut) failures.push(new Error(`${options.name}: suite timed out`));
    if (failures.length) throw new AggregateError(failures, `${options.name}: cleanup failed`);
  })();
  const watchdog = setTimeout(() => {
    timedOut = true;
    console.error(`${options.name}: FAIL — suite timed out`);
    void finish().catch(error => console.error(error)).finally(() => process.exit(1));
  }, options.timeoutMs ?? 300_000);
  return { finish };
}
