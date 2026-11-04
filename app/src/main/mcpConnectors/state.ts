import type { Readiness } from "../agentAuth/types";

// What a provider's status command says about one server (parseClaudeMcpGet, parseCodexMcpList).
export type McpFacts = { registered: false } | { registered: true; authenticated: boolean };
export type CheckOutcome = { ok: true; facts: McpFacts } | { ok: false; reason: "failed" | "timeout" | "unparsable" };
// Status commands use the network, so they run only at set moments and the last value stays shown meanwhile
// (design '상태 판정').
export interface CheckRead { reading: boolean; last: CheckOutcome | null }
// The provider's one running attempt, on whichever server.
export interface ConnectorAttempt { name: string; kind: "connect" | "disconnect" | "remove" }

export type ConnectorStatus = "checking" | "not_connected" | "connecting" | "connected" | "disconnecting" | "removing" | "reconnect_needed" | "check_failed";
// Reconnect and Retry of a failed status read run what Connect and a new read run.
export type ConnectorAction = "connect" | "reconnect" | "disconnect" | "cancel" | "retry";
export interface ConnectorStateInput {
  name: string; readiness: Readiness; attempt: ConnectorAttempt | null; check: CheckRead; everConnected: boolean;
  // A pending logout of the previous account (recorded, or held in memory when the record could not be written).
  blocked: boolean;
}
// disabled: not_ready, the agent is signed in but cannot run; busy, the provider runs an attempt on another server.
// blocked: show the pending-logout line under Connect; pressing it retries that logout first.
export interface ConnectorView { status: ConnectorStatus; action: ConnectorAction | null; disabled: "not_ready" | "busy" | null; blocked: boolean }

const ATTEMPT_STATUS = { connect: "connecting", disconnect: "disconnecting", remove: "removing" } as const;

function settled(check: CheckRead, everConnected: boolean): { status: ConnectorStatus; action: ConnectorAction | null } {
  const last = check.last;
  if (last === null) return { status: "checking", action: null };
  if (!last.ok) return { status: "check_failed", action: "retry" };
  if (!last.facts.registered) return { status: "not_connected", action: "connect" };
  if (last.facts.authenticated) return { status: "connected", action: "disconnect" };
  // Reconnect needed is not stored: it is a sign-in this server once had under this provider.
  return everConnected ? { status: "reconnect_needed", action: "reconnect" } : { status: "not_connected", action: "connect" };
}

export function connectorState(input: ConnectorStateInput): ConnectorView {
  const own = input.attempt?.name === input.name ? input.attempt : null;
  if (own) return { status: ATTEMPT_STATUS[own.kind], action: own.kind === "connect" ? "cancel" : null, disabled: null, blocked: false };
  const { status, action } = settled(input.check, input.everConnected);
  const connects = action === "connect" || action === "reconnect";
  // A sign-in or sign-out in progress leaves Connect pressable: it fails with the busy reason (spec 완료 조건 3).
  const notReady = !input.readiness.ready && input.readiness.cause !== "busy";
  const disabled = action === null ? null : notReady ? "not_ready" : connects && input.attempt ? "busy" : null;
  return { status, action, disabled, blocked: connects && input.blocked };
}
