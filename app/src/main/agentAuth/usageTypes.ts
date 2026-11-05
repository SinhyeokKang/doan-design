// Type-only: the renderer imports these, so nothing here may become a value import.
import type { Provider, ReadinessCause } from "./types";

// A provider's rate-limit window. id is the provider's own key; label is Doan's English name.
// limited is set only when the provider itself says the limit is reached, never inferred from usedPercent.
export interface UsageWindow { id: string; label: string; usedPercent: number; resetsAt?: number /* epoch ms */; limited?: true }
// unlimited: every window the provider reports is unlimited; windows is then empty.
export type UsageReading =
  | { status: "ok"; windows: UsageWindow[]; unlimited?: true; readAt: number }
  | { status: "unavailable"; reason: "not_supported" | "no_plan_limits" | "read_failed"; readAt: number };
// What the app window receives. A connection that can't be used carries its Settings > Agents cause instead of a read.
export interface UsageEntry { provider: Provider; reading?: UsageReading; inFlight: boolean; blocked?: ReadinessCause }
// What may start a read. A turn end counts only for a Doan connection's conversation.
export type UsageTrigger =
  | { kind: "start" | "signIn" | "open" | "refresh" }
  | { kind: "turnEnd"; owner: "doan" | "legacy-external" };
