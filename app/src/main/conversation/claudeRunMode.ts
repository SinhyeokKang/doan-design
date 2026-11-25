import { claudeModeAfterPlan, claudeRunModeId, type ClaudeRunMode, type PermissionModeId } from "./permissionMode";
import type { ConversationMetadata } from "./store";

// When a Claude conversation's kept run mode (the mode Claude Code's settings ran the last Ask first turn in) and its
// stored mode change; applied in one index save, so a plan approval sends one change notice. null: nothing to save.

export type RunModeEntry = Pick<ConversationMetadata, "owner" | "permissionMode" | "claudeRunMode">;
export interface RunModeUpdate { permissionMode: PermissionModeId; claudeRunMode: ClaudeRunMode | undefined }
// sent: the mode the turn was sent with. current: the turn is still the conversation's live, accepted one, so a late
// frame of an older turn changes nothing. reported: Claude's own id (claudeModeReport).
export interface RunModeReport { entry: RunModeEntry; sent: PermissionModeId; current: boolean; reported: string }

// Only a doan-owned Claude conversation: a legacy-external run also sends no mode, so it looks like Ask first.
const ownClaude = (entry: RunModeEntry): boolean => entry.owner.kind === "doan" && entry.owner.provider === "claude";
const shown = (reported: string): ClaudeRunMode | undefined => claudeRunModeId(reported) ? reported : undefined;

// counted: a top-level init of this turn was already read. A later one comes from a steer the CLI ran as the next turn
// of the same process, and can report a setMode allowed in that process only.
export function runModeAfterInit(report: RunModeReport & { counted: boolean }): RunModeUpdate | null {
  const { entry, sent, current, reported, counted } = report;
  if (!ownClaude(entry) || sent !== "default" || entry.permissionMode !== undefined || !current || counted) return null;
  const next = shown(reported);
  return next === entry.claudeRunMode ? null : { permissionMode: "default", claudeRunMode: next };
}

// A Plan turn's approval moves the stored mode (claudeModeAfterPlan) and, into Ask first, sets the run mode; an Ask first
// turn whose settings ran plan changes the run mode only, when turnInit and previous are both plan. Other statuses hold.
export function runModeAfterStatus(report: RunModeReport & { turnInit: string | undefined; previous: string | undefined }): RunModeUpdate | null {
  const { entry, sent, current, reported, turnInit, previous } = report;
  if (!current || reported === "plan") return null;
  if (sent === "plan") {
    if (entry.permissionMode !== "plan") return null;
    const permissionMode = claudeModeAfterPlan(reported);
    return { permissionMode, claudeRunMode: ownClaude(entry) && permissionMode === "default" ? shown(reported) : entry.claudeRunMode };
  }
  if (sent !== "default" || !ownClaude(entry) || entry.permissionMode !== undefined || turnInit !== "plan" || previous !== "plan") return null;
  return { permissionMode: "default", claudeRunMode: shown(reported) };
}
