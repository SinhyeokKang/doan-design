import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { HomeMemory } from "../restore/uiState";
import type { NewConversationDefault } from "./homeComposer";

// What a composer shows after a pick. model is null while the provider's list is not read; effort is null for the
// model's default level, which is sent as no effort. permissionMode is absent when the composer shows no permission
// picker (an ACP provider without modes), so nothing about the mode is remembered.
export interface ComposerChoice { provider: Provider; model: string | null; effort: string | null; permissionMode?: PermissionModeId }

// The provider's last mode, judged apart from its model (permission-mode design '저장 규칙'). Default is no entry.
// The same memory comes back when nothing changes. Used alone for a mode the composer followed rather than picked
// (a Claude plan approval), which is not a provider choice.
export function rememberPermission(memory: HomeMemory | null, provider: Provider, mode: PermissionModeId): HomeMemory {
  const current = memory?.permissions?.[provider];
  if (memory && (current ?? "default") === mode) return memory;
  const { [provider]: _old, ...rest } = memory?.permissions ?? {};
  return { ...memory, permissions: mode === "default" ? rest : { ...rest, [provider]: mode } };
}

// A pick alone is Last used (dogfooding #6), not only a send. Without a known model the provider's remembered model
// stays. The same memory comes back for an unchanged pick, so App re-renders nothing.
export function rememberChoice(memory: HomeMemory | null, choice: ComposerChoice): HomeMemory {
  const saved = memory?.models?.[choice.provider];
  const model = choice.model ? { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) } : saved;
  const withMode = choice.permissionMode === undefined ? memory : rememberPermission(memory, choice.provider, choice.permissionMode);
  if (withMode && withMode === memory && memory.lastProvider === choice.provider && saved?.model === model?.model && saved?.effort === model?.effort) return memory;
  const models = model ? { ...withMode?.models, [choice.provider]: model } : withMode?.models;
  return { ...withMode, lastProvider: choice.provider, ...(models ? { models } : {}) };
}

// A fixed agent in Settings > Agents 'New conversations' would otherwise override the pick at the next new
// conversation, so it follows the pick; Last used (null) already does. undefined: nothing to write. The mode is
// judged apart from the model: a mode picked before the model list is read still replaces the saved one, and a model
// pick without a picker keeps the saved mode of the same provider.
export function preferenceAfterPick(current: NewConversationDefault | null, choice: ComposerChoice): NewConversationDefault | undefined {
  if (!current) return undefined;
  const same = current.provider === choice.provider;
  if (!choice.model && !same) return undefined;
  const model = choice.model ? { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) }
    : { ...(current.model ? { model: current.model } : {}), ...(current.effort ? { effort: current.effort } : {}) };
  const mode = choice.permissionMode !== undefined ? choice.permissionMode : same ? current.permissionMode : undefined;
  const next: NewConversationDefault = { provider: choice.provider, ...model, ...(mode !== undefined && mode !== "default" ? { permissionMode: mode } : {}) };
  return same && current.model === next.model && current.effort === next.effort && current.permissionMode === next.permissionMode ? undefined : next;
}
