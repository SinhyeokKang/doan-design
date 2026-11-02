import type { Provider } from "../main/agentAuth/types";
import { permissionOptions, type PermissionModeId } from "../main/conversation/permissionMode";
import { PROVIDER_NAMES } from "./agentAuthView";
import type { ModelsState, NewConversationDefault } from "./homeComposer";

// The permission mode picker's view (permission-mode spec decisions 2, 5, 7; draft frames picker-menu and settings-row).
// Which modes a provider offers, and how each reaches the provider, is the shared module's (main/conversation/
// permissionMode.ts); this file only names, orders and defaults them for a composer.

export type PermissionIcon = "shield" | "file-pen-line" | "eye" | "shield-alert";
export interface PermissionTrigger { label: string; ariaLabel: string; icon: PermissionIcon; warning: boolean }

const MODES: Record<PermissionModeId, { label: string; icon: PermissionIcon; description: (name: string) => string }> = {
  default: { label: "Default", icon: "shield", description: name => `Follows Doan’s ${name} settings` },
  acceptEdits: { label: "Accept edits", icon: "file-pen-line", description: () => "Edits files without asking" },
  plan: { label: "Plan (read-only)", icon: "eye", description: () => "Plans without changing files" },
  bypass: { label: "Full access", icon: "shield-alert", description: () => "Runs everything without asking" },
};

// Full access is marked by its name, its icon and the warning ink; the aria-label says what it means, so colour is
// never the only signal.
export function permissionTrigger(mode: PermissionModeId): PermissionTrigger {
  const { label, icon } = MODES[mode];
  const warning = mode === "bypass";
  return { label, ariaLabel: `Permission: ${label}${warning ? ", no approval requests" : ""}`, icon, warning };
}

// An ACP provider's modes come with its model list (models IPC `modes`), so nothing is offered before that list is read.
export function permissionChoices(provider: Provider, state: ModelsState): PermissionModeId[] {
  const modes = state !== undefined && state !== "loading" && "models" in state ? state.modes : undefined;
  return permissionOptions(provider, modes);
}

// The person's pick, else the fixed Settings default (which speaks for its whole choice, so one without a mode is
// Default), else the provider's last mode. One the provider cannot offer reads as Default, without a notice.
export function defaultPermission(options: readonly PermissionModeId[], picked: PermissionModeId | undefined, remembered: PermissionModeId | undefined, fixed: NewConversationDefault | null): PermissionModeId {
  const wanted = picked !== undefined ? picked : fixed ? fixed.permissionMode : remembered;
  return wanted !== undefined && options.includes(wanted) ? wanted : "default";
}

export interface PermissionOptionView { id: PermissionModeId; label: string; description: string; icon: PermissionIcon; warning: boolean; selected: boolean }
export interface PermissionPickerView { mode: PermissionModeId; trigger: PermissionTrigger; title: string; menuLabel: string; options: PermissionOptionView[] }

// null: no picker. A provider with no mapped modes, or only Default, offers no choice (PM-B conductor decision).
export function permissionPickerView(provider: Provider | null, state: ModelsState, mode: PermissionModeId): PermissionPickerView | null {
  if (!provider) return null;
  const options = permissionChoices(provider, state);
  if (options.length < 2) return null;
  const shown = options.includes(mode) ? mode : "default";
  const name = PROVIDER_NAMES[provider];
  return {
    mode: shown, trigger: permissionTrigger(shown), title: `Permissions · ${name}`, menuLabel: `Permissions for ${name}`,
    options: options.map(id => ({ id, label: MODES[id].label, description: MODES[id].description(name), icon: MODES[id].icon, warning: id === "bypass", selected: id === shown })),
  };
}
