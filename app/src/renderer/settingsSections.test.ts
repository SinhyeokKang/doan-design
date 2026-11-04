import { expect, test } from "vitest";
import { parseSettingsSection, parseSettingsTarget, SETTINGS_SECTIONS, settingsArrival, settingsSectionsShown, SettingsTargetQueue, shownSettingsSection } from "./settingsSections";

test("the LNB lists Agents, MCP Connectors, Notifications and About in that order", () => {
  expect(SETTINGS_SECTIONS).toEqual([
    { id: "agents", title: "Agents" }, { id: "mcp", title: "MCP Connectors" }, { id: "notifications", title: "Notifications" }, { id: "about", title: "About" },
  ]);
});

// mcp-connectors spec 1: the category exists only while Claude Code or Codex is signed in to Doan.
test("MCP Connectors is left out of the LNB while neither Claude Code nor Codex is signed in", () => {
  expect(settingsSectionsShown(true).map(section => section.id)).toEqual(["agents", "mcp", "notifications", "about"]);
  expect(settingsSectionsShown(false).map(section => section.id)).toEqual(["agents", "notifications", "about"]);
});

test("a target or saved section of MCP Connectors opens Agents while the category is hidden, and waits while sign-ins are unread", () => {
  expect(shownSettingsSection("mcp", false)).toBe("agents");
  expect(shownSettingsSection("mcp", true)).toBe("mcp");
  // Before agent-auth is read nothing is known, so a restored MCP Connectors is kept rather than replaced.
  expect(shownSettingsSection("mcp", null)).toBe("mcp");
  for (const section of ["agents", "notifications", "about"] as const) expect(shownSettingsSection(section, false)).toBe(section);
});

test("a saved section is read back; the old settingsTab value projects becomes Agents", () => {
  for (const section of ["agents", "mcp", "notifications", "about"]) expect(parseSettingsSection(section)).toBe(section);
  expect(parseSettingsSection("projects")).toBe("agents");
  for (const value of [undefined, null, "", "Agents", "settings", 1, {}]) expect(parseSettingsSection(value)).toBeNull();
});

test("an openSettings target names an optional section and, for Agents, an optional provider", () => {
  expect(parseSettingsTarget({})).toEqual({});
  expect(parseSettingsTarget({ section: "about" })).toEqual({ section: "about" });
  expect(parseSettingsTarget({ section: "agents", provider: "codex" })).toEqual({ section: "agents", provider: "codex" });
  // A provider only lives on Agents, so naming one alone means Agents.
  expect(parseSettingsTarget({ provider: "copilot" })).toEqual({ section: "agents", provider: "copilot" });
  // MCP Connectors' target names no provider; App opens Agents instead while the category is hidden.
  expect(parseSettingsTarget({ section: "mcp" })).toEqual({ section: "mcp" });
  expect(parseSettingsTarget({ section: "mcp", provider: "codex" })).toBeNull();
});

test("an openSettings target with an unknown section, a provider outside Agents or extra keys is refused", () => {
  for (const value of [null, undefined, "agents", [], { section: "projects" }, { section: "connections" }, { section: "Agents" }, { section: "notifications", provider: "codex" },
    { section: "agents", provider: "gemini" }, { provider: 1 }, { section: "agents", extra: true }])
    expect(parseSettingsTarget(value), JSON.stringify(value)).toBeNull();
});

test("arriving opens the named section or the last one; a provider gets its row group, anything else the section heading", () => {
  expect(settingsArrival({}, "notifications")).toEqual({ section: "notifications", focus: { kind: "heading" } });
  expect(settingsArrival({ section: "about" }, "notifications")).toEqual({ section: "about", focus: { kind: "heading" } });
  expect(settingsArrival({ section: "agents", provider: "codex" }, "about")).toEqual({ section: "agents", focus: { kind: "provider", provider: "codex" } });
});

// POSTMORTEM 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'.
test("an incoming target applies at once while nothing owns the page", () => {
  const queue = new SettingsTargetQueue();
  expect(queue.offer({ section: "about" }, false)).toEqual({ section: "about" });
  expect(queue.release()).toBeNull();
});

test("while a confirmation or a write owns the page, incoming targets wait and only the latest applies once it ends", () => {
  const queue = new SettingsTargetQueue();
  expect(queue.offer({ section: "about" }, true)).toBeNull();
  expect(queue.offer({ section: "agents", provider: "codex" }, true)).toBeNull();
  expect(queue.release()).toEqual({ section: "agents", provider: "codex" });
  expect(queue.release()).toBeNull();
});

test("a target arriving after the lock ends replaces one still waiting", () => {
  const queue = new SettingsTargetQueue();
  queue.offer({ section: "about" }, true);
  expect(queue.offer({ section: "notifications" }, false)).toEqual({ section: "notifications" });
  expect(queue.release()).toBeNull();
});
