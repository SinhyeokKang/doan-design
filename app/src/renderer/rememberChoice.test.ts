import { expect, test } from "vitest";
import { preferenceAfterPick, rememberChoice } from "./rememberChoice";

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
