import { expect, test } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { preferenceAfterPick, rememberChoice, rememberFast, rememberPermission, shouldTurnOffFast } from "./rememberChoice";

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
  expect(preferenceAfterPick({ provider: "codex", model: "gpt-6" }, { provider: "claude", model: "opus", effort: "low", modelPicked: true })).toEqual({ provider: "claude", model: "opus", effort: "low" });
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: "sonnet", effort: null, modelPicked: true })).toEqual({ provider: "claude", model: "sonnet" });
  // Nothing to write when the pick already matches, or when the model list is not read yet.
  expect(preferenceAfterPick({ provider: "claude", model: "opus", effort: "low" }, { provider: "claude", model: "opus", effort: "low", modelPicked: true })).toBeUndefined();
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
  expect(preferenceAfterPick({ provider: "claude", model: "opus", effort: "low", permissionMode: "bypass" }, { provider: "claude", model: "opus", effort: "low", permissionMode: "default", modelPicked: true })).toEqual({ provider: "claude", model: "opus", effort: "low" });
  expect(preferenceAfterPick({ provider: "codex", permissionMode: "plan" }, { provider: "claude", model: "opus", effort: null, permissionMode: "acceptEdits", modelPicked: true })).toEqual({ provider: "claude", model: "opus", permissionMode: "acceptEdits" });
  // A model pick without a picker keeps the saved mode of the same provider, and does not carry it to another.
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "claude", model: "opus", effort: null, modelPicked: true })).toEqual({ provider: "claude", model: "opus", permissionMode: "plan" });
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "cursor", model: "auto", effort: null, modelPicked: true })).toEqual({ provider: "cursor", model: "auto" });
  // Nothing to write: unchanged, Last used, or another provider whose models are not read.
  expect(preferenceAfterPick({ provider: "claude", permissionMode: "plan" }, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
  expect(preferenceAfterPick(null, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "claude", model: null, effort: null, permissionMode: "plan" })).toBeUndefined();
});

// fast-mode A5 (design §2 9–10, decision 3): Fast is remembered per provider, apart from the model, only when the switch
// changes or Fast turns itself off.
test("a switched Fast is its provider's, kept across model picks and apart from the other provider", () => {
  const memory = { lastProvider: "codex" as const, models: { codex: { model: "gpt-6" } } };
  const on = rememberChoice(memory, { provider: "codex", model: "gpt-6", effort: null, fast: true });
  expect(on).toEqual({ ...memory, fast: { codex: true } });
  const moved = rememberChoice(on, { provider: "codex", model: "gpt-6-mini", effort: null });
  expect(moved.fast).toEqual({ codex: true });
  const claude = rememberChoice(moved, { provider: "claude", model: "opus", effort: null, fast: false });
  expect(claude.fast).toEqual({ codex: true });
  expect(rememberChoice(claude, { provider: "codex", model: "gpt-6", effort: null, fast: false }).fast).toEqual({});
  expect(rememberChoice(on, { provider: "codex", model: "gpt-6", effort: null, fast: true })).toBe(on);
});

test("a choice without a switch change (a send) leaves Fast alone", () => {
  const memory = { fast: { claude: true as const } };
  expect(rememberChoice(memory, { provider: "claude", model: "opus", effort: "high" }).fast).toEqual({ claude: true });
  expect(rememberChoice(null, { provider: "claude", model: "opus", effort: "high" })).not.toHaveProperty("fast");
});

test("rememberFast changes one provider and returns the same memory when nothing changes", () => {
  const memory = { lastProvider: "codex" as const, fast: { codex: true as const } };
  expect(rememberFast(memory, "claude", true)).toEqual({ lastProvider: "codex", fast: { codex: true, claude: true } });
  expect(rememberFast(memory, "codex", false)).toEqual({ lastProvider: "codex", fast: {} });
  expect(rememberFast(memory, "codex", true)).toBe(memory);
  expect(rememberFast(null, "claude", true)).toEqual({ fast: { claude: true } });
});

test("a fixed Settings default ignores Fast", () => {
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: "opus", effort: null, fast: true })).toBeUndefined();
  expect(preferenceAfterPick({ provider: "claude", model: "opus" }, { provider: "claude", model: "sonnet", effort: null, fast: true, modelPicked: true })).toEqual({ provider: "claude", model: "sonnet" });
});

test("only a turnedOff Fast-not-used event received live turns Last used off", () => {
  const event = (payload: Record<string, unknown>) => ({ v: 1, conversationId: "c1", seq: 3, turnId: "t1", at: "2026-11-06T00:00:00Z", ...payload }) as ConversationEvent;
  expect(shouldTurnOffFast(event({ type: "fast.unused", reason: "plan", turnedOff: true }), true)).toBe(true);
  // A history read or a subscription's snapshot replays it: a restart must not turn off a Fast the person turned on again.
  expect(shouldTurnOffFast(event({ type: "fast.unused", reason: "plan", turnedOff: true }), false)).toBe(false);
  expect(shouldTurnOffFast(event({ type: "fast.unused", reason: "cooldown" }), true)).toBe(false);
  expect(shouldTurnOffFast(event({ type: "fast.unused" }), true)).toBe(false);
  expect(shouldTurnOffFast(event({ type: "turn.done" }), true)).toBe(false);
});

// A fixed default with Model Default (no model) stays unfixed after a composer pick that leaves the model alone: the
// composer's model is then only the provider's default, which Settings' Default row already stands for.
test("a pick that leaves the model alone never fixes the provider's default model", () => {
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "codex", model: "gpt-6-luna", effort: null, permissionMode: "plan" })).toEqual({ provider: "codex", permissionMode: "plan" });
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "codex", model: "gpt-6-luna", effort: "high", effortPicked: true })).toEqual({ provider: "codex", effort: "high" });
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "codex", model: "gpt-6-luna", effort: null, fast: true })).toBeUndefined();
  // A fixed model stays fixed; another provider's default is that provider, unfixed.
  expect(preferenceAfterPick({ provider: "codex", model: "gpt-5.6-terra" }, { provider: "codex", model: "gpt-5.6-terra", effort: "high", effortPicked: true })).toEqual({ provider: "codex", model: "gpt-5.6-terra", effort: "high" });
  expect(preferenceAfterPick({ provider: "claude" }, { provider: "codex", model: "gpt-6-luna", effort: null })).toEqual({ provider: "codex" });
  // A picked model, even the default one, is fixed.
  expect(preferenceAfterPick({ provider: "codex" }, { provider: "codex", model: "gpt-6-luna", effort: null, modelPicked: true })).toEqual({ provider: "codex", model: "gpt-6-luna" });
});

// A fixed effort stays unless an effort was picked, and only an effort picked for the fixed model (or for the default
// model under Model Default) is written.
test("a pick that leaves the effort alone keeps a fixed effort; a picked effort is fixed only for its own model", () => {
  const terra = { provider: "codex" as const, model: "gpt-5.6-terra", effort: "xhigh" };
  // The project does not list Terra: the composer shows GPT-6-Luna with no level.
  expect(preferenceAfterPick(terra, { provider: "codex", model: "gpt-6-luna", effort: null, permissionMode: "plan" })).toEqual({ ...terra, permissionMode: "plan" });
  expect(preferenceAfterPick(terra, { provider: "codex", model: "gpt-6-luna", effort: "low", effortPicked: true })).toBeUndefined();
  // Model Default: the effort shown is the default model's, so a picked one is fixed, and the Default row clears it.
  expect(preferenceAfterPick({ provider: "codex", effort: "high" }, { provider: "codex", model: "gpt-6-luna", effort: null, permissionMode: "plan" })).toEqual({ provider: "codex", effort: "high", permissionMode: "plan" });
  expect(preferenceAfterPick({ provider: "codex", effort: "high" }, { provider: "codex", model: "gpt-6-luna", effort: null, effortPicked: true })).toEqual({ provider: "codex" });
  expect(preferenceAfterPick({ provider: "codex", model: "gpt-5.6-terra", effort: "xhigh" }, { provider: "codex", model: "gpt-5.6-terra", effort: "low", effortPicked: true })).toEqual({ provider: "codex", model: "gpt-5.6-terra", effort: "low" });
});
