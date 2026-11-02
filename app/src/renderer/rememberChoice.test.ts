import { expect, test } from "vitest";
import { preferenceAfterPick, rememberChoice, rememberPermission } from "./rememberChoice";

// Dogfooding #6: a pick alone is remembered as Last used, per provider, and a fixed Settings default follows it.
test("a pick becomes the last provider and that provider's model and effort", () => {
  const memory = { lastRoot: "/r", lastProvider: "codex" as const, models: { codex: { model: "gpt-6", effort: "high" } } };
  expect(rememberChoice(memory, { provider: "claude", model: "opus", effort: "low" })).toEqual({
    lastRoot: "/r", lastProvider: "claude", models: { codex: { model: "gpt-6", effort: "high" }, claude: { model: "opus", effort: "low" } },
  });
  expect(rememberChoice(null, { provider: "claude", model: "opus", effort: null })).toEqual({ lastProvider: "claude", models: { claude: { model: "opus" } } });
});

test("a pick without a known model keeps the provider's remembered model", () => {
  const memory = { models: { claude: { model: "opus", effort: "low" } } };
  expect(rememberChoice(memory, { provider: "claude", model: null, effort: null })).toEqual({ lastProvider: "claude", models: { claude: { model: "opus", effort: "low" } } });
});

test("an unchanged pick returns the same memory, so remembering it again renders nothing new", () => {
  const memory = { lastProvider: "claude" as const, models: { claude: { model: "opus", effort: "low" } } };
  expect(rememberChoice(memory, { provider: "claude", model: "opus", effort: "low" })).toBe(memory);
});

test("Last used in Settings stays Last used; a fixed default takes the pick", () => {
  expect(preferenceAfterPick(null, { provider: "claude", model: "opus", effort: "low" })).toBeUndefined();
  expect(preferenceAfterPick({ provider: "codex", model: "gpt-6" }, { provider: "claude", model: "opus", effort: "low" })).toEqual({ provider: "claude", model: "opus", effort: "low" });
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: "sonnet", effort: null })).toEqual({ provider: "claude", model: "sonnet" });
  // Nothing to write when the pick already matches, or when the model list is not read yet.
  expect(preferenceAfterPick({ provider: "claude", model: "opus", effort: "low" }, { provider: "claude", model: "opus", effort: "low" })).toBeUndefined();
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: null, effort: null })).toBeUndefined();
});

// permission-mode T1 (design '저장 규칙'): the mode is remembered apart from the model, and a mode picked while the
// model list is not read still counts.
test("a picked mode is the provider's last mode; Default is stored as none", () => {
  const memory = { lastProvider: "claude" as const, models: { claude: { model: "opus" } } };
  expect(rememberChoice(memory, { provider: "claude", model: null, effort: null, permissionMode: "bypass" })).toEqual({
    lastProvider: "claude", models: { claude: { model: "opus" } }, permissions: { claude: "bypass" },
  });
  const withMode = { ...memory, permissions: { claude: "plan" as const, codex: "acceptEdits" as const } };
  expect(rememberChoice(withMode, { provider: "claude", model: "opus", effort: null, permissionMode: "default" })).toEqual({
    lastProvider: "claude", models: { claude: { model: "opus" } }, permissions: { codex: "acceptEdits" },
  });
  expect(rememberChoice(withMode, { provider: "claude", model: "opus", effort: null, permissionMode: "plan" })).toBe(withMode);
  // No picker (an ACP provider without modes): the remembered mode stays.
  expect(rememberChoice(withMode, { provider: "claude", model: "sonnet", effort: null })).toEqual({ ...withMode, models: { claude: { model: "sonnet" } } });
});

test("a followed mode changes only that provider's last mode, not the last provider", () => {
  const memory = { lastProvider: "codex" as const, permissions: { codex: "plan" as const } };
  expect(rememberPermission(memory, "claude", "acceptEdits")).toEqual({ lastProvider: "codex", permissions: { codex: "plan", claude: "acceptEdits" } });
  expect(rememberPermission(memory, "codex", "default")).toEqual({ lastProvider: "codex", permissions: {} });
  expect(rememberPermission(memory, "codex", "plan")).toBe(memory);
  expect(rememberPermission(null, "claude", "bypass")).toEqual({ permissions: { claude: "bypass" } });
});

test("a fixed Settings default takes the picked mode, with or without a model", () => {
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: null, effort: null, permissionMode: "bypass" })).toEqual({ provider: "claude", model: "opus", permissionMode: "bypass" });
  expect(preferenceAfterPick({ provider: "claude", model: "opus", effort: "low", permissionMode: "bypass" }, { provider: "claude", model: "opus", effort: "low", permissionMode: "default" })).toEqual({ provider: "claude", model: "opus", effort: "low" });
  expect(preferenceAfterPick({ provider: "codex", permissionMode: "plan" }, { provider: "claude", model: "opus", effort: null, permissionMode: "acceptEdits" })).toEqual({ provider: "claude", model: "opus", permissionMode: "acceptEdits" });
  // A model pick without a picker keeps the saved mode of the same provider, and does not carry it to another.
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "claude", model: "opus", effort: null })).toEqual({ provider: "claude", model: "opus", permissionMode: "plan" });
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "cursor", model: "auto", effort: null })).toEqual({ provider: "cursor", model: "auto" });
  // Nothing to write: unchanged, Last used, or another provider whose models are not read.
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
  expect(preferenceAfterPick(null, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
});
