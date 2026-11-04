// Whether a Codex turn may start, from the thread's mcpServer/startupStatus/updated params (already filtered to that
// thread by the runner, and cleared for the reloaded names after config/mcpServer/reload). A turn that starts before
// its servers are ready runs without them (PoC: "omitting pending optional MCP server").
export type StartupGate =
  | { kind: "wait" }
  | { kind: "wait_notice"; names: string[] }
  | { kind: "start" }
  | { kind: "start_without"; names: string[] };

// Remote servers were ready 1-1.6 s after thread/start in the PoC (design 'conversation (Codex)').
export const STARTUP_NOTICE_MS = 1000;
export const STARTUP_LIMIT_MS = 10_000;
const STATUSES = new Set(["starting", "ready", "failed", "cancelled"]);

// names: every doan- server registered in the profile; a signed-out one fails in about 45 ms, so waiting on all of
// them costs little. Anything but starting is settled, and a server that never reported is still starting.
export function codexStartupGate(events: readonly unknown[], names: readonly string[], elapsedMs: number): StartupGate {
  const latest = new Map<string, string>();
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const { name, status } = event as Record<string, unknown>;
    if (typeof name === "string" && typeof status === "string" && STATUSES.has(status)) latest.set(name, status);
  }
  const pending = names.filter(name => (latest.get(name) ?? "starting") === "starting");
  if (pending.length === 0) return { kind: "start" };
  if (elapsedMs >= STARTUP_LIMIT_MS) return { kind: "start_without", names: pending };
  return elapsedMs > STARTUP_NOTICE_MS ? { kind: "wait_notice", names: pending } : { kind: "wait" };
}
