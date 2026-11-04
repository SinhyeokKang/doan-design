import { codexStartupGate, STARTUP_LIMIT_MS, STARTUP_NOTICE_MS } from "../mcpConnectors/startupGate";
import { serverLabel } from "../mcpConnectors/presets";
import { object } from "./sessions";
import type { EventPayload } from "./types";

// The doan- servers a Codex profile registers: every [mcp_servers.doan-<slug>] table header in its config.toml, which
// `codex mcp add` and codexServerToml write. Subtables ([mcp_servers.doan-x.env]) and other servers are not Doan's.
const HEADER = /^\s*\[\s*mcp_servers\s*\.\s*("?)(doan-[a-z0-9][a-z0-9-]{0,15})\1\s*\]\s*(?:#.*)?$/;
export function codexProfileServers(toml: string): string[] {
  const names: string[] = [];
  for (const line of toml.split(/\r?\n/)) {
    const name = line.match(HEADER)?.[2];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function connectors(names: readonly string[], labels: Readonly<Record<string, string>>): string {
  const shown = names.map(name => serverLabel(name, labels));
  return shown.length < 2 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}
// Activity summaries are bounded like every other (transport.ts activity).
export function waitingLine(names: readonly string[], labels: Readonly<Record<string, string>>): string {
  return `Waiting for ${connectors(names, labels)}`.slice(0, 512);
}
export function notReadyLine(names: readonly string[], labels: Readonly<Record<string, string>>): string {
  const line = names.length > 1 ? "weren’t ready, so this turn started without them." : "wasn’t ready, so this turn started without it.";
  const max = 511 - line.length;
  const shown = connectors(names, labels);
  return `${shown.length > max ? shown.slice(0, max) : shown} ${line}`;
}

// Bounds what one app-server can make Doan keep: before thread/start answers, its id is unknown and every thread's
// statuses are kept (the reply and the first statuses arrive in one chunk); after, only that thread's.
const THREADS = 8, SERVERS = 256;

// The mcpServer/startupStatus/updated notifications one Codex runner received, by thread and server, and the turn's
// wait for them (mcp-connectors design 'conversation (Codex)'). The notification has a threadId and no turnId, so the
// runner takes it here instead of handing it to the turn's transport.
export class CodexStartupWatch {
  private threads = new Map<string, Map<string, unknown>>();
  private wake: (() => void) | undefined;
  // thread: the runner's thread id, "" until thread/start answered. Returns whether raw was a startup notification.
  receive(raw: unknown, thread: string): boolean {
    if (!object(raw) || raw.method !== "mcpServer/startupStatus/updated" || "id" in raw || !object(raw.params)) return false;
    const params = raw.params;
    if (typeof params.threadId !== "string" || typeof params.name !== "string") return true;
    if (thread) for (const other of this.threads.keys()) if (other !== thread) this.threads.delete(other);
    if (thread && params.threadId !== thread) return true;
    let statuses = this.threads.get(params.threadId);
    if (!statuses) {
      if (this.threads.size >= THREADS) return true;
      statuses = new Map(); this.threads.set(params.threadId, statuses);
    }
    if (!statuses.has(params.name) && statuses.size >= SERVERS) return true;
    statuses.delete(params.name); statuses.set(params.name, params);
    this.wake?.();
    return true;
  }
  // After config/mcpServer/reload: those servers restart, so what the thread reported for them before no longer holds.
  forget(thread: string, names: readonly string[]): void {
    const statuses = this.threads.get(thread);
    for (const name of names) statuses?.delete(name);
  }
  settled(thread: string, names: readonly string[]): boolean {
    return codexStartupGate(this.events(thread), names, 0).kind === "start";
  }
  size(): number { return [...this.threads.values()].reduce((sum, statuses) => sum + statuses.size, 0); }
  // Resolves true when the turn may start: every server settled, or the limit passed and the line says which did not.
  // Past one second one Waiting line names what is still starting. cancel resolves false and writes nothing more.
  wait(thread: string, names: readonly string[], labels: Readonly<Record<string, string>>, emit: (event: EventPayload) => void): { started: Promise<boolean>; cancel(): void } {
    let cancel = () => {};
    const started = new Promise<boolean>(resolve => {
      const begun = Date.now(); let noticed = false, timer: ReturnType<typeof setTimeout> | undefined, done = false;
      const finish = (value: boolean) => { if (done) return; done = true; clearTimeout(timer); if (this.wake === check) this.wake = undefined; resolve(value); };
      const check = () => {
        if (done) return;
        const gate = codexStartupGate(this.events(thread), names, Date.now() - begun);
        if (gate.kind === "start") { finish(true); return; }
        if (gate.kind === "start_without") { emit({ type: "activity", kind: "other", summary: notReadyLine(gate.names, labels) }); finish(true); return; }
        if (gate.kind === "wait_notice" && !noticed) { noticed = true; emit({ type: "activity", kind: "other", summary: waitingLine(gate.names, labels) }); }
        clearTimeout(timer);
        // The gate shows the notice only past STARTUP_NOTICE_MS, so the timer fires one millisecond after it.
        timer = setTimeout(check, Math.max(0, begun + (noticed ? STARTUP_LIMIT_MS : STARTUP_NOTICE_MS + 1) - Date.now()));
      };
      cancel = () => finish(false);
      this.wake = check;
      check();
    });
    return { started, cancel };
  }
  private events(thread: string): unknown[] { return [...this.threads.get(thread)?.values() ?? []]; }
}
