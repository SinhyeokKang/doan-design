import { execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import { object } from "./sessions";
// How a finished turn's process is ended for the next send. kill: a done turn with only its suggestion left; a group with
// background work is never killed first (the CLI ends it on SIGTERM). later: decide once the usage read closes input.
export type AfterTurnCleanup = "kill" | "term" | "none" | "later";
export function afterTurnCleanup(input: { finished: boolean; inputClosed: boolean; background: number; doneTurn: boolean; promptRead: boolean }): AfterTurnCleanup {
  if (input.finished) return "none";
  if (!input.inputClosed) return "later";
  return input.background === 0 && input.doneTurn && input.promptRead ? "kill" : "term";
}
export type ProcessRow = { pid: number; ppid: number; pgid: number };
// The process groups other than the owned one that its members' descendants lead or joined, read while it is alive
// (orphans belong to launchd). Group 1 and below are never returned: signalling -1 reaches every user process.
export function descendantGroups(table: readonly ProcessRow[], pgid: number): number[] {
  const children = new Map<number, ProcessRow[]>();
  for (const row of table) { const siblings = children.get(row.ppid); if (siblings) siblings.push(row); else children.set(row.ppid, [row]); }
  const queue = table.filter(row => row.pgid === pgid).map(row => row.pid), seen = new Set(queue), groups: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i]!) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid); queue.push(child.pid);
      if (child.pgid !== pgid && child.pgid > 1 && !groups.includes(child.pgid)) groups.push(child.pgid);
    }
  }
  return groups;
}
// Every process's pid, parent and group; an unreadable table is empty, so a stop still ends the owned group.
export function listProcesses(): Promise<ProcessRow[]> {
  return new Promise(resolve => {
    execFile("/bin/ps", ["-A", "-o", "pid=,ppid=,pgid="], { timeout: 1000 }, (error, stdout) => {
      if (error) { resolve([]); return; }
      resolve(stdout.split("\n").map(line => line.trim().split(/\s+/).map(Number)).filter(row => row.length === 3 && row.every(n => Number.isInteger(n) && n >= 0)).map(([pid, ppid, pgid]) => ({ pid: pid!, ppid: ppid!, pgid: pgid! })));
    });
  });
}
export class OwnedGroup {
  // exited: the owned group is gone, which alone releases it. done: so are the descendants' groups a stop or kill found.
  private exited = false;
  private done = false;
  private stopping: Promise<void> | undefined;
  private killing: Promise<void> | undefined;
  private finding: Promise<void> | undefined;
  private leaderExited = false;
  private descendants = new Set<number>();
  private poll: ReturnType<typeof setInterval> | undefined;
  private escalation: ReturnType<typeof setTimeout> | undefined;
  private waiting: (() => void)[] = [];
  // processes: given for a process whose tool commands run in process groups of their own (an ACP server, Claude Code's
  // background commands), so a stop also ends the groups its descendants started; they are read before the first signal.
  constructor(readonly pid: number, private signal = (pid: number, signal: NodeJS.Signals) => { process.kill(-pid, signal); },
    private alive = (pid: number) => { try { process.kill(-pid, 0); return true; } catch (error) { if (object(error) && error.code === "ESRCH") return false; throw error; } }, private released = () => {},
    private processes?: () => Promise<ProcessRow[]>) {}
  childExited(): void { this.leaderExited = true; this.observe(); if (!this.done) this.monitor(); }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.done) return Promise.resolve();
    this.stopping = this.bounded();
    this.found(() => {
      this.send("SIGTERM"); this.monitor();
      this.escalation = setTimeout(() => { if (!this.done) this.send("SIGKILL"); }, 500);
      this.escalation.unref();
    });
    return this.stopping;
  }
  // At once, also mid-stop: a finished turn's process with nothing left to save. It reads no process table, since a Claude
  // kill must land before the CLI's next model call; groups a stop already found get the SIGKILL too.
  kill(): Promise<void> {
    if (this.done) return Promise.resolve();
    this.killing ??= this.bounded();
    this.send("SIGKILL"); this.monitor();
    return this.stopping ?? this.killing;
  }
  // Once the leader has exited its children belong to launchd and cannot be found, so the signal goes at once.
  private found(then: () => void): void {
    if (!this.processes || (this.leaderExited && !this.finding)) { then(); return; }
    this.finding ??= this.processes().then(table => { if (!this.exited) for (const group of descendantGroups(table, this.pid)) this.descendants.add(group); }, () => {});
    void this.finding.then(then);
  }
  // The 2 s is a ceiling for a group that will not go; a caller waits only until the group is observed gone.
  private bounded(): Promise<void> {
    if (this.done) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, 2000); timer.unref();
      this.waiting.push(() => { clearTimeout(timer); resolve(); });
    });
  }
  private send(signal: NodeJS.Signals): void {
    for (const group of [...this.exited ? [] : [this.pid], ...this.descendants]) {
      try { this.signal(group, signal); } catch { /* Only an independent liveness observation releases ownership. */ }
    }
    this.observe();
  }
  private monitor(): void { if (!this.poll && !this.done) { this.poll = setInterval(() => this.observe(), 100); this.poll.unref(); } }
  private observe(): void {
    if (this.done) return;
    for (const group of this.descendants) { try { if (!this.alive(group)) this.descendants.delete(group); } catch { /* unknown: still owned */ } }
    if (!this.exited) {
      try { if (this.alive(this.pid)) return; } catch { return; }
      this.exited = true; this.released();
    }
    if (this.descendants.size) return;
    this.done = true; clearInterval(this.poll); clearTimeout(this.escalation);
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
export function ownProtocolProcess(child: ChildProcessWithoutNullStreams, clearDeadlines: () => void, endTransport: () => void, exited: () => void, processes?: () => Promise<ProcessRow[]>) {
  const drain = drainOutput(child.stdout, child.stderr);
  let release!: () => void;
  const gone = new Promise<void>(resolve => { release = resolve; });
  const group = child.pid ? new OwnedGroup(child.pid, undefined, undefined, release, processes) : undefined;
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
