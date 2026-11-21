import { claudeModeAfterPlan, claudeRunModeId, type ClaudeRunMode, type PermissionModeId } from "./permissionMode";
import type { ConversationMetadata } from "./store";

// When a Claude conversation's kept run mode (claudeRunMode: the mode Claude Code's own settings ran the last Ask first
// turn in) and its stored mode change. The service applies an update in one index save, so a plan approval sends one
// change notice. null: nothing to save.

export type RunModeEntry = Pick<ConversationMetadata, "owner" | "permissionMode" | "claudeRunMode">;
export interface RunModeUpdate { permissionMode: PermissionModeId; claudeRunMode: ClaudeRunMode | undefined }
// sent: the mode the turn was sent with. current: the turn is still the conversation's live, accepted one, so a late
// frame of an older turn changes nothing. reported: Claude's own id (claudeModeReport).
export interface RunModeReport { entry: RunModeEntry; sent: PermissionModeId; current: boolean; reported: string }

// Only a doan-owned Claude conversation: a legacy-external run also sends no mode, so to the runner it looks like Ask
// first.
const ownClaude = (entry: RunModeEntry): boolean => entry.owner.kind === "doan" && entry.owner.provider === "claude";
const shown = (reported: string): ClaudeRunMode | undefined => claudeRunModeId(reported) ? reported : undefined;

// counted: a top-level init of this turn was already read. A later one comes from a steer the CLI ran as the next turn
// of the same process, and can report a setMode allowed in that process only (PoC, Claude Code 2.1.312).
export function runModeAfterInit(report: RunModeReport & { counted: boolean }): RunModeUpdate | null {
  const { entry, sent, current, reported, counted } = report;
  if (!ownClaude(entry) || sent !== "default" || entry.permissionMode !== undefined || !current || counted) return null;
  const next = shown(reported);
  return next === entry.claudeRunMode ? null : { permissionMode: "default", claudeRunMode: next };
}

// The two approvals Doan follows; any other status (a suggestion's setMode) holds in that process only.
// A Plan turn's approval moves the stored mode as before (claudeModeAfterPlan); when that is Ask first, the run mode
// becomes what the process now runs. Into another mode the run mode is left as the last one seen, for a re-pick of Ask
// first. An Ask first turn whose settings ran plan changes the run mode only. Approval reported default in every PoC
// case, which clears the key.
export function runModeAfterStatus(report: RunModeReport): RunModeUpdate | null {
  const { entry, sent, current, reported } = report;
  if (!current || reported === "plan") return null;
  if (sent === "plan") {
    if (entry.permissionMode !== "plan") return null;
    const permissionMode = claudeModeAfterPlan(reported);
    return { permissionMode, claudeRunMode: ownClaude(entry) && permissionMode === "default" ? shown(reported) : entry.claudeRunMode };
  }
  if (sent !== "default" || !ownClaude(entry) || entry.permissionMode !== undefined || entry.claudeRunMode !== "plan") return null;
  return { permissionMode: "default", claudeRunMode: shown(reported) };
}
