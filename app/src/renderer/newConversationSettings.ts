import type { Provider } from "../main/agentAuth/types";
import type { EffortView, ModelsState } from "./homeComposer";

// Settings > Agents > New conversations' Model and Effort words (picker-default-labels spec 'Settings > New
// conversations', design decision 5). Nothing fixed reads "Default" and, when known, the value it stands for, so it
// never reads as a fixed choice.

// value: the row's menu value. A model id can be any string, an ACP agent's "default" included, so the top row's value
// and the model rows' values live apart (by kind) and never collide; settingsModelPick reads one back.
export type SettingsModelRow =
  | { kind: "unset"; value: string; label: "Default"; description: string | null; selected: boolean }
  | { kind: "model"; value: string; id: string; label: string; selected: boolean };
// pinned: the fixed model this project lists, else null (nothing fixed). value: the checked row's value.
export interface SettingsModelMenu { label: string; pinned: string | null; value: string; rows: SettingsModelRow[] }

const UNSET_VALUE = "unset";
const modelValue = (id: string) => `model:${id}`;

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
    value: fixed ? modelValue(fixed.id) : UNSET_VALUE,
    rows: [
      { kind: "unset", value: UNSET_VALUE, label: "Default", description: standing?.label ?? null, selected: !fixed },
      ...list.filter(item => !sameAsUnset(provider, item.id)).map((item): SettingsModelRow => ({ kind: "model", value: modelValue(item.id), id: item.id, label: item.label, selected: item.id === fixed?.id })),
    ],
  };
}

// The model id to store for a picked row's value; null unfixes (the top row, or a value no row carries).
export function settingsModelPick(menu: SettingsModelMenu, value: string): string | null {
  const row = menu.rows.find(item => item.value === value);
  return row?.kind === "model" ? row.id : null;
}

// effort: the composer's view for the fixed model, or the default one. Its label is the level alone; a placeholder
// label ("Effort") means the level is unknown.
export function settingsEffortLabel(effort: EffortView): string {
  if (!effort.unset.selected) return effort.label;
  return effort.placeholder ? "Default" : `Default · ${effort.label}`;
}
