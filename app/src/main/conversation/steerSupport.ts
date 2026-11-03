import type { Provider } from "../agentAuth/types";

// Which providers can take a message into a running turn (queue-send-now), and when a queued row offers Send now.
// A fixed table of what the PoC confirmed on each provider's minimum version; the provider is not asked at run time.
// The renderer imports this module by value, so it must import nothing but types (rendererImports.test.ts,
// POSTMORTEM 2026-10-30).

export const STEER_PROVIDERS: readonly Provider[] = ["claude", "codex"];
export function canSteer(provider: Provider): boolean { return STEER_PROVIDERS.includes(provider); }

// The conversation's phase as the composer sees it. Only a turn that is running or waiting for a permission answer has
// something to add a message to; the others (preparing, a turn judged or a queue about to go out) have no turn.
export type SteerPhase = "preparing" | "starting" | "running" | "waiting" | "holding" | "ended";

// provider: the one stored with the conversation, not the composer's picker. sending: this row's Send now is in flight.
export function sendNowShown(input: { provider: Provider; phase: SteerPhase; sending: boolean }): boolean {
  return canSteer(input.provider) && (input.phase === "running" || input.phase === "waiting") && !input.sending;
}
