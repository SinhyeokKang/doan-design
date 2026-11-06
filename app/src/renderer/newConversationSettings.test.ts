import { expect, test } from "vitest";
import { foldRows, modelPickerView, NO_OLDER, olderOpened, type ModelsState } from "./homeComposer";
import { settingsEffortLabel, settingsModelMenu, settingsModelPick } from "./newConversationSettings";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";

// picker-default-labels A4 (spec 'Settings > New conversations', design decision 5, §2 6).

// The 2026-11-06 shape after main's pairing (A1): Claude Code's default row carries its model's name, the opus row is gone.
const CLAUDE: ModelsState = { models: [
  { id: "default", label: "Opus 5.5", default: true, efforts: ["low", "medium", "high", "max"] },
  { id: "sonnet", label: "Sonnet 5.5", default: false, efforts: ["low", "high"] },
  { id: "haiku", label: "Haiku 5.5", default: false },
] };
const CODEX: ModelsState = { models: [
  { id: "gpt-6-luna", label: "GPT-6-Luna", default: true, efforts: ["low", "medium", "high"], defaultEffort: "medium" },
  { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false, efforts: ["low", "high"] },
] };

test("nothing fixed: the trigger reads Default and the model it stands for; the menu opens with a Default row naming it", () => {
  const claude = settingsModelMenu("claude", CLAUDE, undefined);
  expect(claude.label).toBe("Default · Opus 5.5");
  expect(claude.pinned).toBeNull();
  // Claude Code's own default row means the same as the Default row, so only this menu leaves it out.
  expect(claude.rows).toEqual([
    { kind: "unset", value: "unset", label: "Default", description: "Opus 5.5", selected: true },
    { kind: "model", value: "model:sonnet", id: "sonnet", label: "Sonnet 5.5", selected: false },
    { kind: "model", value: "model:haiku", id: "haiku", label: "Haiku 5.5", selected: false },
  ]);
  // Codex's default row is a model of its own, so it stays and can be fixed.
  const codex = settingsModelMenu("codex", CODEX, undefined);
  expect(codex.label).toBe("Default · GPT-6-Luna");
  expect(codex.rows.map(row => row.kind === "model" ? row.id : row.kind)).toEqual(["unset", "gpt-6-luna", "gpt-5.6-terra"]);
});

test("a fixed model is checked and named alone; the Default row unfixes it", () => {
  const menu = settingsModelMenu("codex", CODEX, "gpt-5.6-terra");
  expect(menu).toMatchObject({ label: "GPT-5.6-Terra", pinned: "gpt-5.6-terra" });
  expect(menu.rows[0]).toEqual({ kind: "unset", value: "unset", label: "Default", description: "GPT-6-Luna", selected: false });
  expect(menu.rows.find(row => row.kind === "model" && row.selected)).toMatchObject({ id: "gpt-5.6-terra" });
  expect(settingsModelMenu("codex", CODEX, "gpt-6-luna")).toMatchObject({ label: "GPT-6-Luna", pinned: "gpt-6-luna" });
});

test("a saved Claude Code \"default\", or a model this project does not list, reads as nothing fixed", () => {
  expect(settingsModelMenu("claude", CLAUDE, "default")).toMatchObject({ label: "Default · Opus 5.5", pinned: null, rows: [{ kind: "unset", selected: true }, {}, {}] });
  expect(settingsModelMenu("codex", CODEX, "retired")).toMatchObject({ label: "Default · GPT-6-Luna", pinned: null });
  // Codex's "default" is no special id: it is just not listed.
  expect(settingsModelMenu("codex", CODEX, "default").pinned).toBeNull();
});

test("without a list the trigger is Default alone and the menu holds the Default row with no line", () => {
  for (const state of [undefined, "loading", { error: "unavailable" }, { models: [] }] as ModelsState[]) {
    expect(settingsModelMenu("claude", state, "sonnet")).toEqual({ label: "Default", pinned: null, value: "unset", rows: [{ kind: "unset", value: "unset", label: "Default", description: null, selected: true }] });
  }
  // A list with no default row has nothing to name.
  expect(settingsModelMenu("codex", { models: [{ id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false }] }, undefined)).toMatchObject({ label: "Default", rows: [{ kind: "unset", description: null }, {}] });
});

const FACTS = { cli: "found", version: "supported", tools: "ready" } as const;
function auth(provider: Provider): AuthSnapshot {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return { revision: 1, providers: [authStatus(state, FACTS, 1)] };
}
const effort = (provider: Provider, models: ModelsState, model: string, level: string | null) =>
  modelPickerView(auth(provider), { [provider]: models }, { provider, model, effort: level }).effort!;

test("effort with nothing fixed reads Default and the level it stands for, or Default alone when it is unknown", () => {
  expect(settingsEffortLabel(effort("codex", CODEX, "gpt-6-luna", null))).toBe("Default · Medium");
  expect(settingsEffortLabel(effort("codex", CODEX, "gpt-5.6-terra", null))).toBe("Default");
  expect(settingsEffortLabel(effort("claude", CLAUDE, "default", null))).toBe("Default");
  expect(settingsEffortLabel(effort("codex", CODEX, "gpt-6-luna", "high"))).toBe("High");
  expect(settingsEffortLabel(effort("claude", CLAUDE, "default", "max"))).toBe("Max");
});

// RV 🟡1: each row's menu value is its own, so an ACP model whose id is "default" never shares the top row's value.
test("an ACP model whose id is default keeps its own row and value, apart from the top Default row", () => {
  const ACP: ModelsState = { models: [{ id: "default", label: "Auto", default: true }, { id: "gpt-5.6", label: "GPT-5.6", default: false }] };
  const values = (menu: ReturnType<typeof settingsModelMenu>) => menu.rows.map(row => row.value);
  const other = settingsModelMenu("copilot", ACP, "gpt-5.6");
  expect(other.rows.map(row => row.kind === "model" ? [row.id, row.selected] : ["unset", row.selected])).toEqual([["unset", false], ["default", false], ["gpt-5.6", true]]);
  expect(new Set(values(other)).size).toBe(3);
  expect(other.value).toBe(other.rows[2]!.value);
  // Picking a row's value gives back what to store: the model id, or null for the top row.
  expect(settingsModelPick(other, other.rows[1]!.value)).toBe("default");
  expect(settingsModelPick(other, other.rows[0]!.value)).toBeNull();
  const fixed = settingsModelMenu("copilot", ACP, "default");
  expect(fixed).toMatchObject({ label: "Auto", pinned: "default" });
  expect(fixed.rows.filter(row => row.selected).map(row => row.kind === "model" ? row.id : "unset")).toEqual(["default"]);
  expect(fixed.value).toBe(fixed.rows[1]!.value);
  const unset = settingsModelMenu("copilot", ACP, undefined);
  expect(unset.rows.filter(row => row.selected).map(row => row.kind)).toEqual(["unset"]);
  expect(unset.value).toBe(unset.rows[0]!.value);
  // Claude Code's own default row stays out, and its saved id still reads as nothing fixed.
  const claude = settingsModelMenu("claude", CLAUDE, "default");
  expect(claude.value).toBe(claude.rows[0]!.value);
  expect(claude.rows.some(row => row.kind === "model" && row.id === "default")).toBe(false);
});

// model-drawer-older: the Settings Model menu folds the same way; its Default row never folds.
const CODEX_OLDER: ModelsState = { models: [
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", default: true },
  { id: "gpt-6-sol", label: "GPT-6-Sol", default: false, older: true },
] };
test("an older model keeps its row marked, and picking it fixes that model rather than Default", () => {
  const menu = settingsModelMenu("codex", CODEX_OLDER, "gpt-6-sol");
  expect(menu.rows).toEqual([
    { kind: "unset", value: "unset", label: "Default", description: "GPT-6.1-Sol", selected: false },
    { kind: "model", value: "model:gpt-6.1-sol", id: "gpt-6.1-sol", label: "GPT-6.1-Sol", selected: false },
    { kind: "model", value: "model:gpt-6-sol", id: "gpt-6-sol", label: "GPT-6-Sol", selected: true, older: true },
  ]);
  expect(menu.label).toBe("GPT-6-Sol");
  expect(settingsModelPick(settingsModelMenu("codex", CODEX_OLDER, undefined), "model:gpt-6-sol")).toBe("gpt-6-sol");
  expect(olderOpened(NO_OLDER, [{ provider: "codex", rows: menu.rows }])).toEqual({ open: ["codex"], touched: [] });
});
test("the Settings Default row stays above the fold with the current models", () => {
  const menu = settingsModelMenu("codex", CODEX_OLDER, undefined);
  expect(foldRows(menu.rows).current.map(row => row.value)).toEqual(["unset", "model:gpt-6.1-sol"]);
  expect(olderOpened(NO_OLDER, [{ provider: "codex", rows: menu.rows }])).toBe(NO_OLDER);
});
