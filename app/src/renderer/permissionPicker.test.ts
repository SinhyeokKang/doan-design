import { expect, test } from "vitest";
import { PERMISSION_MODES } from "../main/conversation/permissionMode";
import { defaultPermission, permissionChoices, permissionPickerView, permissionTrigger } from "./permissionPicker";

const COPILOT = "https://agentclientprotocol.com/protocol/session-modes#";

// permission-mode spec decisions 2 and 5: the four labels, the aria-label, and Full access marked by more than colour.
test("each mode's trigger names it, with its own icon; Full access also warns", () => {
  expect(PERMISSION_MODES.map(permissionTrigger)).toEqual([
    { label: "Default", ariaLabel: "Permission: Default", icon: "shield", warning: false },
    { label: "Accept edits", ariaLabel: "Permission: Accept edits", icon: "file-pen-line", warning: false },
    { label: "Plan (read-only)", ariaLabel: "Permission: Plan (read-only)", icon: "eye", warning: false },
    { label: "Full access", ariaLabel: "Permission: Full access, no approval requests", icon: "shield-alert", warning: true },
  ]);
});

test("Claude and Codex offer the four modes whether or not their models were read", () => {
  for (const state of [undefined, "loading" as const, { error: "x" }, { models: [] }]) {
    expect(permissionChoices("claude", state)).toEqual([...PERMISSION_MODES]);
    expect(permissionChoices("codex", state)).toEqual([...PERMISSION_MODES]);
  }
});

test("an ACP provider offers what its server listed and the table maps, and nothing before its list is read", () => {
  expect(permissionChoices("antigravity", { models: [], modes: { available: ["default", "auto_edit", "yolo"], allowAll: false } })).toEqual(["default", "acceptEdits", "bypass"]);
  expect(permissionChoices("copilot", { models: [], modes: { available: [`${COPILOT}agent`, `${COPILOT}plan`], allowAll: true } })).toEqual(["default", "plan", "bypass"]);
  expect(permissionChoices("cursor", undefined)).toEqual([]);
  expect(permissionChoices("cursor", "loading")).toEqual([]);
  expect(permissionChoices("cursor", { models: [] })).toEqual([]);
});

// Conductor decision (PM-B brief): a one-item picker offers no choice, so an ACP provider with only Default has none.
test("the picker shows only with a choice to make", () => {
  expect(permissionPickerView("cursor", { models: [], modes: { available: ["agent", "ask"], allowAll: false } }, "default")).toBeNull();
  expect(permissionPickerView("cursor", undefined, "default")).toBeNull();
  expect(permissionPickerView(null, undefined, "default")).toBeNull();
  expect(permissionPickerView("cursor", { models: [], modes: { available: ["agent", "plan"], allowAll: false } }, "plan")?.options.map(item => item.id)).toEqual(["default", "plan"]);
});

test("the menu is titled for its provider and describes each mode; the chosen one is checked", () => {
  const view = permissionPickerView("claude", undefined, "acceptEdits")!;
  expect(view).toMatchObject({ mode: "acceptEdits", title: "Permissions · Claude Code", menuLabel: "Permissions for Claude Code", trigger: { label: "Accept edits" } });
  expect(view.options).toEqual([
    { id: "default", label: "Default", description: "Follows Doan’s Claude Code settings", icon: "shield", warning: false, selected: false },
    { id: "acceptEdits", label: "Accept edits", description: "Edits files without asking", icon: "file-pen-line", warning: false, selected: true },
    { id: "plan", label: "Plan (read-only)", description: "Plans without changing files", icon: "eye", warning: false, selected: false },
    { id: "bypass", label: "Full access", description: "Runs everything without asking", icon: "shield-alert", warning: true, selected: false },
  ]);
  expect(permissionPickerView("codex", undefined, "default")!.options[0]!.description).toBe("Follows Doan’s Codex settings");
});

// spec decision 7, design '저장 규칙': a mode the provider cannot offer reads as Default, without a notice.
test("a mode the provider cannot offer shows as Default", () => {
  expect(permissionPickerView("antigravity", { models: [], modes: { available: ["default", "auto_edit"], allowAll: false } }, "plan")?.mode).toBe("default");
});

test("the composer starts from the pick, then the fixed Settings default, then the provider's last mode", () => {
  const all = [...PERMISSION_MODES];
  expect(defaultPermission(all, "plan", "bypass", { provider: "claude", permissionMode: "acceptEdits" })).toBe("plan");
  expect(defaultPermission(all, undefined, "bypass", { provider: "claude", permissionMode: "acceptEdits" })).toBe("acceptEdits");
  // A fixed default without a mode is Default, not the remembered mode: it speaks for its whole choice.
  expect(defaultPermission(all, undefined, "bypass", { provider: "claude" })).toBe("default");
  expect(defaultPermission(all, undefined, "bypass", null)).toBe("bypass");
  expect(defaultPermission(all, undefined, undefined, null)).toBe("default");
});

// T1: switching the provider in a composer to one that cannot offer the picked mode reads as Default.
test("a pick, default or remembered mode the provider cannot offer is Default", () => {
  const antigravity = ["default", "acceptEdits", "bypass"] as const;
  expect(defaultPermission(antigravity, "plan", undefined, null)).toBe("default");
  expect(defaultPermission(antigravity, undefined, "plan", null)).toBe("default");
  expect(defaultPermission(antigravity, undefined, undefined, { provider: "antigravity", permissionMode: "plan" })).toBe("default");
  expect(defaultPermission([], undefined, "bypass", null)).toBe("default");
});
