import { describe, expect, it, test } from "vitest";
import { PERMISSION_MODES } from "../main/conversation/permissionMode";
import { defaultPermission, permissionChoices, permissionPickerView, permissionTrigger, runModeAnnouncement } from "./permissionPicker";

const COPILOT = "https://agentclientprotocol.com/protocol/session-modes#";

test("each mode's trigger names it, with its own icon; Full access also warns", () => {
  expect(PERMISSION_MODES.map(mode => permissionTrigger(mode))).toEqual([
    { label: "Ask first", ariaLabel: "Permission: Ask first", icon: "shield", warning: false },
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

// A one-item picker offers no choice, so an ACP provider with only Default has none.
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
    { id: "default", label: "Ask first", description: "Asks before edits and commands unless allowed", icon: "shield", warning: false, selected: false },
    { id: "acceptEdits", label: "Accept edits", description: "Edits files without asking", icon: "file-pen-line", warning: false, selected: true },
    { id: "plan", label: "Plan (read-only)", description: "Plans without changing files", icon: "eye", warning: false, selected: false },
    { id: "bypass", label: "Full access", description: "Runs everything without asking", icon: "shield-alert", warning: true, selected: false },
  ]);
  expect(permissionPickerView("codex", undefined, "default")!.options[0]!.description).toBe("Asks before going outside its sandbox");
});

// The stored id stays "default" though the mode is named Ask first.
test("Ask first names the Default mode, with a line per provider", () => {
  const claude = permissionPickerView("claude", undefined, "default")!;
  expect(claude).toMatchObject({ mode: "default", trigger: { label: "Ask first", ariaLabel: "Permission: Ask first" } });
  expect(claude.options[0]).toMatchObject({ id: "default", label: "Ask first", description: "Asks before edits and commands unless allowed", selected: true });
  expect(permissionPickerView("codex", undefined, "default")!.options[0]).toMatchObject({ id: "default", label: "Ask first", description: "Asks before going outside its sandbox" });
  const copilot = permissionPickerView("copilot", { models: [], modes: { available: [`${COPILOT}agent`, `${COPILOT}plan`], allowAll: true } }, "default")!;
  expect(copilot.options[0]).toMatchObject({ id: "default", label: "Ask first", description: "Asks when GitHub Copilot needs approval" });
  const antigravity = permissionPickerView("antigravity", { models: [], modes: { available: ["default", "auto_edit"], allowAll: false } }, "default")!;
  expect(antigravity.options[0]!.description).toBe("Asks when Antigravity needs approval");
  // An ACP provider left with Ask first alone still offers no picker.
  expect(permissionPickerView("cursor", { models: [], modes: { available: ["agent", "ask"], allowAll: false } }, "default")).toBeNull();
});

// A mode the provider cannot offer reads as Default, without a notice.
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

// Switching the provider in a composer to one that cannot offer the picked mode reads as Default.
test("a pick, default or remembered mode the provider cannot offer is Default", () => {
  const antigravity = ["default", "acceptEdits", "bypass"] as const;
  expect(defaultPermission(antigravity, "plan", undefined, null)).toBe("default");
  expect(defaultPermission(antigravity, undefined, "plan", null)).toBe("default");
  expect(defaultPermission(antigravity, undefined, undefined, { provider: "antigravity", permissionMode: "plan" })).toBe("default");
  expect(defaultPermission([], undefined, "bypass", null)).toBe("default");
});

describe("the mode Claude Code settings run", () => {
  it("names it after Ask first on the trigger and says so in the aria-label", () => {
    expect(permissionTrigger("default", "auto")).toEqual({ label: "Ask first · Auto", ariaLabel: "Permission: Ask first, Claude Code settings run Auto mode", icon: "shield", warning: false });
    expect(permissionTrigger("default", "dontAsk")).toEqual({ label: "Ask first · Don’t ask", ariaLabel: "Permission: Ask first, Claude Code settings run Don’t ask mode", icon: "shield", warning: false });
    expect(permissionTrigger("default", "acceptEdits")).toEqual({ label: "Ask first · Accept edits", ariaLabel: "Permission: Ask first, Claude Code settings run Accept edits mode", icon: "shield", warning: false });
    expect(permissionTrigger("default", "plan")).toEqual({ label: "Ask first · Plan (read-only)", ariaLabel: "Permission: Ask first, Claude Code settings run Plan (read-only) mode", icon: "shield", warning: false });
  });
  // The stored mode stays Ask first, so the warning cannot come from the mode; an icon-only trigger still tells it apart.
  it("warns for Full access the settings run, by icon, warning and aria-label", () => {
    expect(permissionTrigger("default", "bypassPermissions")).toEqual({ label: "Ask first · Full access", ariaLabel: "Permission: Ask first, Claude Code settings run Full access mode, no approval requests", icon: "shield-alert", warning: true });
  });
  it("leaves the trigger as it was without a value", () => {
    expect(permissionTrigger("default", undefined)).toEqual(permissionTrigger("default"));
  });
  it("shows in a Claude picker whose stored mode is Ask first, with the Ask first line naming it", () => {
    const view = permissionPickerView("claude", undefined, "default", "auto")!;
    expect(view.trigger).toEqual(permissionTrigger("default", "auto"));
    expect(view.options[0]).toEqual({ id: "default", label: "Ask first", description: "Your Claude Code settings run Auto mode", icon: "shield", warning: false, selected: true });
    expect(view.options.slice(1)).toEqual(permissionPickerView("claude", undefined, "default")!.options.slice(1));
    expect(permissionPickerView("claude", undefined, "default", "dontAsk")!.options[0]!.description).toBe("Your Claude Code settings run Don’t ask mode");
    expect(permissionPickerView("claude", undefined, "default", "bypassPermissions")!.trigger).toMatchObject({ icon: "shield-alert", warning: true });
  });
  // The value is kept, not cleared, so picking Ask first again shows it at once.
  it("hides behind any other stored mode", () => {
    for (const mode of ["acceptEdits", "plan", "bypass"] as const) expect(permissionPickerView("claude", undefined, mode, "auto")).toEqual(permissionPickerView("claude", undefined, mode));
  });
  it("never shows for another provider", () => {
    expect(permissionPickerView("codex", undefined, "default", "auto")).toEqual(permissionPickerView("codex", undefined, "default"));
    const modes = { models: [], modes: { available: [`${COPILOT}agent`, `${COPILOT}plan`], allowAll: true } };
    expect(permissionPickerView("copilot", modes, "default", "bypassPermissions")).toEqual(permissionPickerView("copilot", modes, "default"));
  });
  it("announces a new value once, and nothing for the same value or a cleared one", () => {
    expect(runModeAnnouncement(undefined, "auto")).toBe("Claude Code settings run Auto mode");
    expect(runModeAnnouncement("auto", "dontAsk")).toBe("Claude Code settings run Don’t ask mode");
    expect(runModeAnnouncement("dontAsk", "bypassPermissions")).toBe("Claude Code settings run Full access mode");
    expect(runModeAnnouncement("auto", "auto")).toBeNull();
    expect(runModeAnnouncement("auto", undefined)).toBeNull();
    expect(runModeAnnouncement(undefined, undefined)).toBeNull();
  });
});
