import { expect, test } from "vitest";
import { modelPickerView, type ModelsState } from "./homeComposer";
import { settingsEffortLabel, settingsModelMenu } from "./newConversationSettings";
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
    { kind: "unset", label: "Default", description: "Opus 5.5", selected: true },
    { kind: "model", id: "sonnet", label: "Sonnet 5.5", selected: false },
    { kind: "model", id: "haiku", label: "Haiku 5.5", selected: false },
  ]);
  // Codex's default row is a model of its own, so it stays and can be fixed.
  const codex = settingsModelMenu("codex", CODEX, undefined);
  expect(codex.label).toBe("Default · GPT-6-Luna");
  expect(codex.rows.map(row => row.kind === "model" ? row.id : row.kind)).toEqual(["unset", "gpt-6-luna", "gpt-5.6-terra"]);
});

test("a fixed model is checked and named alone; the Default row unfixes it", () => {
  const menu = settingsModelMenu("codex", CODEX, "gpt-5.6-terra");
  expect(menu).toMatchObject({ label: "GPT-5.6-Terra", pinned: "gpt-5.6-terra" });
  expect(menu.rows[0]).toEqual({ kind: "unset", label: "Default", description: "GPT-6-Luna", selected: false });
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
    expect(settingsModelMenu("claude", state, "sonnet")).toEqual({ label: "Default", pinned: null, rows: [{ kind: "unset", label: "Default", description: null, selected: true }] });
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
