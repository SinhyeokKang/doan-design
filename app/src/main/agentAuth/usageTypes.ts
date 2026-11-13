// Type-only: the renderer imports these, so nothing here may become a value import.
import type { AuthAttempt, AuthErrorCode, AuthPhase, Provider, Readiness } from "./types";

// A provider's rate-limit window. id is the provider's own key; label is Doan's English name.
// limited is set only when the provider itself says the limit is reached, never inferred from usedPercent.
// periodMins is the window's length when the provider gives it; label "Weekly" marks the provider's overall weekly window.
export interface UsageWindow { id: string; label: string; periodMins?: number; usedPercent: number; resetsAt?: number /* epoch ms */; limited?: true }
// unlimited: every window the provider reports is unlimited; windows is then empty.
export type UsageReading =
  | { status: "ok"; windows: UsageWindow[]; unlimited?: true; readAt: number }
  | { status: "unavailable"; reason: "not_supported" | "no_plan_limits" | "read_failed"; readAt: number };
// A connection that can't be used, as much of it as its Settings > Agents row is worded from (agentAuthView
// connectionLine): no attempt ID, account or error detail.
export interface UsageBlock { readiness: Extract<Readiness, { ready: false }>; phase: AuthPhase; error?: AuthErrorCode; attempt?: AuthAttempt["kind"] }
// What the app window receives. A connection that can't be used carries its block instead of a read.
export interface UsageEntry { provider: Provider; reading?: UsageReading; inFlight: boolean; blocked?: UsageBlock }
// What may start a read. A turn end counts only for a Doan connection's conversation; limit: the usage limit stopped
// that turn, and the read tells when it resets.
export type UsageTrigger =
  | { kind: "start" | "signIn" | "open" | "refresh" }
  | { kind: "turnEnd"; owner: "doan" | "legacy-external"; limit?: true };
