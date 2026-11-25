import type { Provider } from "../agentAuth/types";

// Which providers can take a message into a running turn (a fixed table, never asked at run time), and when a queued
// row offers Send now. The renderer imports this by value, so types only (rendererImports.test.ts, POSTMORTEM 2026-10-30).

export const STEER_PROVIDERS: readonly Provider[] = ["claude", "codex"];
export function canSteer(provider: Provider): boolean { return STEER_PROVIDERS.includes(provider); }

// The conversation's phase as the composer sees it; only running or waiting has a turn to add to. The host passes the
// fold's `starting` (Codex before its native id) as "running"; "starting" here means no accepted turn yet.
export type SteerPhase = "preparing" | "starting" | "running" | "waiting" | "holding" | "ended";

// provider: the one stored with the conversation, not the composer's picker. sending: this row's Send now is in flight.
export function sendNowShown(input: { provider: Provider; phase: SteerPhase; sending: boolean }): boolean {
  return canSteer(input.provider) && (input.phase === "running" || input.phase === "waiting") && !input.sending;
}
