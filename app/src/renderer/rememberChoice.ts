import type { Provider } from "../main/agentAuth/types";
import type { HomeMemory } from "../restore/uiState";
import type { NewConversationDefault } from "./homeComposer";

// What a composer shows after a pick. model is null while the provider's list is not read; effort is null for the
// model's default level, which is sent as no effort.
export interface ComposerChoice { provider: Provider; model: string | null; effort: string | null }

// A pick alone is Last used (dogfooding #6), not only a send. Without a known model the provider's remembered model
// stays. The same memory comes back for an unchanged pick, so App re-renders nothing.
export function rememberChoice(memory: HomeMemory | null, choice: ComposerChoice): HomeMemory {
  const saved = memory?.models?.[choice.provider];
  const model = choice.model ? { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) } : saved;
  if (memory && memory.lastProvider === choice.provider && saved?.model === model?.model && saved?.effort === model?.effort) return memory;
  const models = model ? { ...memory?.models, [choice.provider]: model } : memory?.models;
  return { ...memory, lastProvider: choice.provider, ...(models ? { models } : {}) };
}

// A fixed agent in Settings > Agents 'New conversations' would otherwise override the pick at the next new
// conversation, so it follows the pick; Last used (null) already does. undefined: nothing to write.
export function preferenceAfterPick(current: NewConversationDefault | null, choice: ComposerChoice): NewConversationDefault | undefined {
  if (!current || !choice.model) return undefined;
  const next: NewConversationDefault = { provider: choice.provider, model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) };
  return current.provider === next.provider && current.model === next.model && current.effort === next.effort ? undefined : next;
}
