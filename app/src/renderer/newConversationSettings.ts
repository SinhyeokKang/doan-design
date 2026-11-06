import type { Provider } from "../main/agentAuth/types";
import type { EffortView, ModelsState } from "./homeComposer";

// Settings > Agents > New conversations' Model and Effort words (picker-default-labels spec 'Settings > New
// conversations', design decision 5). Nothing fixed reads "Default" and, when known, the value it stands for, so it
// never reads as a fixed choice.

export type SettingsModelRow =
  | { kind: "unset"; label: "Default"; description: string | null; selected: boolean }
  | { kind: "model"; id: string; label: string; selected: boolean };
// pinned: the fixed model this project lists, else null (nothing fixed).
export interface SettingsModelMenu { label: string; pinned: string | null; rows: SettingsModelRow[] }

// Claude Code's own default row sends "default", which follows the account's default just as nothing fixed does, so
// the Settings menu leaves it out and a saved "default" reads as nothing fixed.
function sameAsUnset(provider: Provider, id: string): boolean {
  return provider === "claude" && id === "default";
}

export function settingsModelMenu(provider: Provider, state: ModelsState, model: string | undefined): SettingsModelMenu {
  const list = state !== undefined && state !== "loading" && "models" in state ? state.models : [];
  const fixed = model !== undefined && !sameAsUnset(provider, model) ? list.find(item => item.id === model) ?? null : null;
  const standing = list.find(item => item.default) ?? null;
  return {
    label: fixed ? fixed.label : standing ? `Default · ${standing.label}` : "Default",
    pinned: fixed?.id ?? null,
    rows: [
      { kind: "unset", label: "Default", description: standing?.label ?? null, selected: !fixed },
      ...list.filter(item => !sameAsUnset(provider, item.id)).map((item): SettingsModelRow => ({ kind: "model", id: item.id, label: item.label, selected: item.id === fixed?.id })),
    ],
  };
}

// effort: the composer's view for the fixed model, or the default one. Its label is the level alone; a placeholder
// label ("Effort") means the level is unknown.
export function settingsEffortLabel(effort: EffortView): string {
  if (!effort.unset.selected) return effort.label;
  return effort.placeholder ? "Default" : `Default · ${effort.label}`;
}
