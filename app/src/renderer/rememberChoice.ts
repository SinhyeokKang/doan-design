import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { ConversationEvent } from "../main/conversation/types";
import type { HomeMemory } from "../restore/uiState";
import type { NewConversationDefault } from "./homeComposer";

// fast is present only when the person switched Fast. Without modelPicked or effortPicked the value is only what the
// composer resolved, which a fixed Settings default must not take on.
export interface ComposerChoice { provider: Provider; model: string | null; effort: string | null; permissionMode?: PermissionModeId; fast?: boolean; modelPicked?: true; effortPicked?: true }

// Apart from its model: `models[provider]` is replaced on every model pick. Off is no entry.
export function rememberFast(memory: HomeMemory | null, provider: Provider, on: boolean): HomeMemory {
  if (memory && (memory.fast?.[provider] === true) === on) return memory;
  const { [provider]: _old, ...rest } = memory?.fast ?? {};
  return { ...memory, fast: on ? { ...rest, [provider]: true } : rest };
}

// Laid over the read map one provider at a time: a whole-map merge would drop every other provider's read Fast, and
// an off is a removal a merge cannot carry.
export function withFastChanges(fast: HomeMemory["fast"], changes: ReadonlyMap<Provider, boolean>): HomeMemory["fast"] {
  if (changes.size === 0) return fast;
  const next = { ...fast };
  for (const [provider, on] of changes) { if (on) next[provider] = true; else delete next[provider]; }
  return next;
}

// Only an event received as it happened: one read back from history must not undo a Fast the person turned on again.
export function shouldTurnOffFast(event: ConversationEvent, live: boolean): boolean {
  return live && event.type === "fast.unused" && event.turnedOff === true;
}

// Default is no entry. Used alone for a mode the composer followed rather than picked (a Claude plan approval).
export function rememberPermission(memory: HomeMemory | null, provider: Provider, mode: PermissionModeId): HomeMemory {
  const current = memory?.permissions?.[provider];
  if (memory && (current ?? "default") === mode) return memory;
  const { [provider]: _old, ...rest } = memory?.permissions ?? {};
  return { ...memory, permissions: mode === "default" ? rest : { ...rest, [provider]: mode } };
}

// A pick alone is Last used, not only a send. The same memory comes back for an unchanged pick, so App re-renders
// nothing.
export function rememberChoice(memory: HomeMemory | null, choice: ComposerChoice): HomeMemory {
  const saved = memory?.models?.[choice.provider];
  const model = choice.model ? { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) } : saved;
  const withFast = choice.fast === undefined ? memory : rememberFast(memory, choice.provider, choice.fast);
  const withMode = choice.permissionMode === undefined ? withFast : rememberPermission(withFast, choice.provider, choice.permissionMode);
  if (withMode && withMode === memory && memory.lastProvider === choice.provider && saved?.model === model?.model && saved?.effort === model?.effort) return memory;
  const models = model ? { ...withMode?.models, [choice.provider]: model } : withMode?.models;
  return { ...withMode, lastProvider: choice.provider, ...(models ? { models } : {}) };
}

// A fixed agent would otherwise override the pick at the next new conversation. Only a picked model is fixed, so Model
// Default keeps following the provider's default; the mode is judged apart from the model.
export function preferenceAfterPick(current: NewConversationDefault | null, choice: ComposerChoice): NewConversationDefault | undefined {
  if (!current) return undefined;
  const same = current.provider === choice.provider;
  if (!choice.model && !same) return undefined;
  const keptModel = same ? current.model : undefined;
  // The model and the level apply apart, each only when picked.
  const nextModel = choice.model && choice.modelPicked ? choice.model : keptModel;
  // A level is fixed only for the model it was picked for: the fixed one, or under Model Default the default shown.
  const ownEffort = choice.effortPicked === true && !!choice.model && (nextModel === undefined || nextModel === choice.model);
  // An unpicked level stays with its model: kept while the fixed model stays, dropped when another model is picked.
  const effort = ownEffort ? choice.effort ?? undefined : same && nextModel === keptModel ? current.effort : undefined;
  const model = { ...(nextModel ? { model: nextModel } : {}), ...(effort ? { effort } : {}) };
  const mode = choice.permissionMode !== undefined ? choice.permissionMode : same ? current.permissionMode : undefined;
  const next: NewConversationDefault = { provider: choice.provider, ...model, ...(mode !== undefined && mode !== "default" ? { permissionMode: mode } : {}) };
  return same && current.model === next.model && current.effort === next.effort && current.permissionMode === next.permissionMode ? undefined : next;
}
