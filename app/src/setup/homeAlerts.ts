import type { FolderEntry } from "../main/view";
import type { ConnectionSummary } from "./connectionSummary";

export interface HomeAlerts {
  banner?: (keyof ConnectionSummary)[];
  finishCard?: ("cli" | "agents" | "project")[];
}

export function homeAlerts(summary: ConnectionSummary, entries: readonly FolderEntry[], onboardingClosed: boolean): HomeAlerts {
  const banner = (["cli", "claude", "codex"] as const).filter(row => summary[row] === "needs-attention");
  const finishCard: NonNullable<HomeAlerts["finishCard"]> = [];
  if (onboardingClosed) {
    if (summary.cli === "not-connected") finishCard.push("cli");
    if ([summary.claude, summary.codex].every(status => status === "not-connected" || status === "not-installed")) finishCard.push("agents");
    if (entries.length === 0) finishCard.push("project");
  }
  return { ...(banner.length ? { banner } : {}), ...(finishCard.length ? { finishCard } : {}) };
}
