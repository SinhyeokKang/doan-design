import type { Provider } from "../main/agentAuth/types";
import type { EffortView, ModelsState } from "./homeComposer";

// Settings > Agents > New conversations' Model and Effort words.
// Nothing fixed reads "Default" and, when known, the value it stands for, so it
// never reads as a fixed choice.

// value: the row's menu value. A model id can be any string, an ACP agent's "default" included, so the top row's value
// and the model rows' values live apart (by kind) and never collide; settingsModelPick reads one back.
export type SettingsModelRow =
  | { kind: "unset"; value: string; label: "Default"; description: string | null; selected: boolean }
  | { kind: "model"; value: string; id: string; label: string; selected: boolean; older?: true };
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
      ...list.filter(item => !sameAsUnset(provider, item.id)).map((item): SettingsModelRow => ({ kind: "model", value: modelValue(item.id), id: item.id, label: item.label, selected: item.id === fixed?.id, ...(item.older ? { older: true as const } : {}) })),
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

// The Effort menu's rows, kept apart by kind as the Model menu's are (POSTMORTEM 2026-11-06): a level a provider names
// "default" is a level of its own, never the Default row that stores no effort. value: the checked row's value.
export type SettingsEffortRow =
  | { kind: "unset"; value: string; label: "Default"; selected: boolean }
  | { kind: "level"; value: string; id: string; label: string; selected: boolean };
export interface SettingsEffortMenu { value: string; rows: SettingsEffortRow[] }
const levelValue = (id: string) => `effort:${id}`;

export function settingsEffortMenu(effort: EffortView): SettingsEffortMenu {
  const chosen = effort.options.find(item => item.selected) ?? null;
  return {
    value: chosen ? levelValue(chosen.id) : UNSET_VALUE,
    rows: [
      { kind: "unset", value: UNSET_VALUE, label: "Default", selected: !chosen },
      ...effort.options.map((item): SettingsEffortRow => ({ kind: "level", value: levelValue(item.id), id: item.id, label: item.label, selected: item.selected })),
    ],
  };
}

// The level to store for a picked row's value; null stores none (the Default row, or a value no row carries).
export function settingsEffortPick(menu: SettingsEffortMenu, value: string): string | null {
  const row = menu.rows.find(item => item.value === value);
  return row?.kind === "level" ? row.id : null;
}
