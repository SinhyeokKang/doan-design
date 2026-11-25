import type { Provider } from "../main/agentAuth/types";
import { permissionOptions, type ClaudeRunMode, type PermissionModeId } from "../main/conversation/permissionMode";
import { PROVIDER_NAMES } from "./agentAuthView";
import type { ModelsState, NewConversationDefault } from "./homeComposer";

// Which modes a provider offers, and how each reaches it, is main/conversation/permissionMode.ts's; this file only
// names, orders and defaults them.

export type PermissionIcon = "shield" | "file-pen-line" | "eye" | "shield-alert";
export interface PermissionTrigger { label: string; ariaLabel: string; icon: PermissionIcon; warning: boolean }

// Default is named for what it does; "Auto" would read as Claude Code's auto mode.
const ASK_FIRST: Partial<Record<Provider, string>> = { claude: "Asks before edits and commands unless allowed", codex: "Asks before going outside its sandbox" };
const MODES: Record<PermissionModeId, { label: string; icon: PermissionIcon; description: (provider: Provider) => string }> = {
  default: { label: "Ask first", icon: "shield", description: provider => ASK_FIRST[provider] ?? `Asks when ${PROVIDER_NAMES[provider]} needs approval` },
  acceptEdits: { label: "Accept edits", icon: "file-pen-line", description: () => "Edits files without asking" },
  plan: { label: "Plan (read-only)", icon: "eye", description: () => "Plans without changing files" },
  bypass: { label: "Full access", icon: "shield-alert", description: () => "Runs everything without asking" },
};

const RUN_MODES: Record<ClaudeRunMode, string> = { auto: "Auto", dontAsk: "Don’t ask", acceptEdits: "Accept edits", plan: "Plan (read-only)", bypassPermissions: "Full access" };

// Colour is never the only signal for Full access. Full access from the settings warns the same way, though the
// stored mode stays Ask first.
export function permissionTrigger(mode: PermissionModeId, runMode?: ClaudeRunMode): PermissionTrigger {
  const { label, icon } = MODES[mode];
  const run = mode === "default" ? runMode : undefined;
  const warning = mode === "bypass" || run === "bypassPermissions";
  const named = run ? `${label}, Claude Code settings run ${RUN_MODES[run]} mode` : label;
  return { label: run ? `${label} · ${RUN_MODES[run]}` : label, ariaLabel: `Permission: ${named}${warning ? ", no approval requests" : ""}`, icon: warning ? "shield-alert" : icon, warning };
}

// null for the same value or a cleared one.
export function runModeAnnouncement(previous: ClaudeRunMode | undefined, next: ClaudeRunMode | undefined): string | null {
  return next !== undefined && next !== previous ? `Claude Code settings run ${RUN_MODES[next]} mode` : null;
}

// An ACP provider's modes come with its model list, so nothing is offered before that list is read.
export function permissionChoices(provider: Provider, state: ModelsState): PermissionModeId[] {
  const modes = state !== undefined && state !== "loading" && "models" in state ? state.modes : undefined;
  return permissionOptions(provider, modes);
}

// A fixed Settings default speaks for its whole choice, so one without a mode is Default. A mode the provider cannot
// offer reads as Default, without a notice.
export function defaultPermission(options: readonly PermissionModeId[], picked: PermissionModeId | undefined, remembered: PermissionModeId | undefined, fixed: NewConversationDefault | null): PermissionModeId {
  const wanted = picked !== undefined ? picked : fixed ? fixed.permissionMode : remembered;
  return wanted !== undefined && options.includes(wanted) ? wanted : "default";
}

export interface PermissionOptionView { id: PermissionModeId; label: string; description: string; icon: PermissionIcon; warning: boolean; selected: boolean }
// Absent while none shows (the trigger's data-run-mode width step).
export interface PermissionPickerView { mode: PermissionModeId; trigger: PermissionTrigger; title: string; menuLabel: string; options: PermissionOptionView[]; runMode?: ClaudeRunMode }

// A provider with no mapped modes, or only Default, offers no choice. runMode is reflected only for Claude while Ask
// first is shown.
export function permissionPickerView(provider: Provider | null, state: ModelsState, mode: PermissionModeId, runMode?: ClaudeRunMode): PermissionPickerView | null {
  if (!provider) return null;
  const options = permissionChoices(provider, state);
  if (options.length < 2) return null;
  const shown = options.includes(mode) ? mode : "default";
  const name = PROVIDER_NAMES[provider];
  const run = provider === "claude" && shown === "default" ? runMode : undefined;
  const description = (id: PermissionModeId) => id === "default" && run ? `Your Claude Code settings run ${RUN_MODES[run]} mode` : MODES[id].description(provider);
  return {
    mode: shown, trigger: permissionTrigger(shown, run), title: `Permissions · ${name}`, menuLabel: `Permissions for ${name}`,
    options: options.map(id => ({ id, label: MODES[id].label, description: description(id), icon: MODES[id].icon, warning: id === "bypass", selected: id === shown })),
    ...(run ? { runMode: run } : {}),
  };
}
