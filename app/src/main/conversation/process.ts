import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import { object } from "./sessions";
// How a finished turn's process is ended for the next send. A done turn with its prompt read and no background work has
// only its suggestion left: it is killed at once (a SIGTERM takes the CLI 0.5-1 s, and SIGKILL left every session
// transcript whole and resumable, PoC). Background work runs in process groups of its own that only the CLI's SIGTERM
// handling stops, so a group with any is never killed first. later: the usage read keeps the input open; decide once
// it closes. none: the process is over.
export type AfterTurnCleanup = "kill" | "term" | "none" | "later";
export function afterTurnCleanup(input: { finished: boolean; inputClosed: boolean; background: number; doneTurn: boolean; promptRead: boolean }): AfterTurnCleanup {
  if (input.finished) return "none";
  if (!input.inputClosed) return "later";
  return input.background === 0 && input.doneTurn && input.promptRead ? "kill" : "term";
}
export class OwnedGroup {
  private exited = false;
  private stopping: Promise<void> | undefined;
  private killing: Promise<void> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private escalation: ReturnType<typeof setTimeout> | undefined;
  private waiting: (() => void)[] = [];
  constructor(readonly pid: number, private signal = (pid: number, signal: NodeJS.Signals) => { process.kill(-pid, signal); },
    private alive = (pid: number) => { try { process.kill(-pid, 0); return true; } catch (error) { if (object(error) && error.code === "ESRCH") return false; throw error; } }, private released = () => {}) {}
  childExited(): void { this.observe(); if (!this.exited) this.monitor(); }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.exited) return Promise.resolve();
    this.send("SIGTERM"); this.monitor();
    this.escalation = setTimeout(() => { if (!this.exited) this.send("SIGKILL"); }, 500);
    this.escalation.unref();
    this.stopping = this.bounded();
    return this.stopping;
  }
  // At once, also while a stop is still before its own SIGKILL: a finished turn's process with nothing left to save. The
  // group is released only once it is observed gone, as after a stop.
  kill(): Promise<void> {
    if (this.exited) return Promise.resolve();
    this.send("SIGKILL"); this.monitor();
    this.killing ??= this.bounded();
    return this.stopping ?? this.killing;
  }
  // The 2 s is a ceiling for a group that will not go; a caller waits only until the group is observed gone.
  private bounded(): Promise<void> {
    if (this.exited) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, 2000); timer.unref();
      this.waiting.push(() => { clearTimeout(timer); resolve(); });
    });
  }
  private send(signal: NodeJS.Signals): void { try { this.signal(this.pid, signal); } catch { /* Only an independent liveness observation releases ownership. */ } this.observe(); }
  private monitor(): void { if (!this.poll && !this.exited) { this.poll = setInterval(() => this.observe(), 100); this.poll.unref(); } }
  private observe(): void {
    if (this.exited) return;
    try { if (this.alive(this.pid)) return; } catch { return; }
    this.exited = true; clearInterval(this.poll); clearTimeout(this.escalation); this.released();
    for (const settle of this.waiting.splice(0)) settle();
  }
}

// Install before exit: a pipe may close first, or still contain the leader's last write after it exits.
// A descendant outside the group can retain the descriptor indefinitely.
export function drainOutput(...pipes: Readable[]): () => Promise<void> {
  const closed = Promise.all(pipes.map(pipe => new Promise<void>(resolve => { pipe.once("close", resolve); })));
  return () => new Promise<void>(resolve => {
    const timer = setTimeout(() => { for (const pipe of pipes) pipe.destroy(); resolve(); }, 500);
    timer.unref();
    void closed.then(() => { clearTimeout(timer); resolve(); });
  });
}

// Losing either direction of the protocol stops descendants immediately. The service's exited() can fail
// an accepted turn and release its lease, so it follows both the final protocol events and actual group exit.
export function ownProtocolProcess(child: ChildProcessWithoutNullStreams, clearDeadlines: () => void, endTransport: () => void, exited: () => void) {
  const drain = drainOutput(child.stdout, child.stderr);
  let release!: () => void;
  const gone = new Promise<void>(resolve => { release = resolve; });
  const group = child.pid ? new OwnedGroup(child.pid, undefined, undefined, release) : undefined;
  let ending = false;
  const end = () => {
    if (ending) return;
    ending = true; clearDeadlines();
    if (group) void group.stop(); else release();
    void drain().then(() => { endTransport(); return gone; }).then(exited);
  };
  child.stdin.on("error", end);
  child.stdout.once("end", end);
  child.once("error", end);
  child.once("exit", () => { group?.childExited(); end(); });
  const write = (line: string) => {
    // Rejecting a server request in the tail no longer needs a reply, but its following frames still count.
    if (ending) return;
    if (!child.stdin.writable) throw new Error("process_exited");
    child.stdin.write(line);
  };
  return { group, ending: () => ending, write };
}
