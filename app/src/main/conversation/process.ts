import { object } from "./sessions";
// Stub until the cleanup rule lands.
export type AfterTurnCleanup = "kill" | "term" | "none" | "later";
export function afterTurnCleanup(_input: { finished: boolean; inputClosed: boolean; background: number; doneTurn: boolean; promptRead: boolean }): AfterTurnCleanup { return "none"; }
export class OwnedGroup {
  private exited = false;
  private stopping: Promise<void> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private escalation: ReturnType<typeof setTimeout> | undefined;
  constructor(readonly pid: number, private signal = (pid: number, signal: NodeJS.Signals) => { process.kill(-pid, signal); },
    private alive = (pid: number) => { try { process.kill(-pid, 0); return true; } catch (error) { if (object(error) && error.code === "ESRCH") return false; throw error; } }, private released = () => {}) {}
  childExited(): void { this.observe(); if (!this.exited) this.monitor(); }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.exited) return Promise.resolve();
    this.send("SIGTERM"); this.monitor();
    this.escalation = setTimeout(() => { if (!this.exited) this.send("SIGKILL"); }, 500);
    this.escalation.unref();
    this.stopping = new Promise(resolve => { const timer = setTimeout(resolve, 2000); timer.unref(); });
    return this.stopping;
  }
  kill(): Promise<void> { return this.stop(); }
  private send(signal: NodeJS.Signals): void { try { this.signal(this.pid, signal); } catch { /* Only an independent liveness observation releases ownership. */ } this.observe(); }
  private monitor(): void { if (!this.poll && !this.exited) { this.poll = setInterval(() => this.observe(), 100); this.poll.unref(); } }
  private observe(): void {
    if (this.exited) return;
    try { if (this.alive(this.pid)) return; } catch { return; }
    this.exited = true; clearInterval(this.poll); clearTimeout(this.escalation); this.released();
  }
}
