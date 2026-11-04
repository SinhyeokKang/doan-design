import { expect, test } from "vitest";
import { parseSettingsSection, parseSettingsTarget, SETTINGS_SECTIONS, settingsArrival, SettingsTargetQueue } from "./settingsSections";

test("the LNB lists Agents, Notifications and About in that order", () => {
  expect(SETTINGS_SECTIONS).toEqual([
    { id: "agents", title: "Agents" }, { id: "notifications", title: "Notifications" }, { id: "about", title: "About" },
  ]);
});

test("a saved section is read back; the old settingsTab value projects becomes Agents", () => {
  for (const section of ["agents", "notifications", "about"]) expect(parseSettingsSection(section)).toBe(section);
  expect(parseSettingsSection("projects")).toBe("agents");
  // MCP Connectors has no page yet (mcp-connectors task D2): a saved mcp section opens Agents, as it will whenever the
  // category is hidden.
  expect(parseSettingsSection("mcp")).toBe("agents");
  for (const value of [undefined, null, "", "Agents", "settings", 1, {}]) expect(parseSettingsSection(value)).toBeNull();
});

test("an openSettings target names an optional section and, for Agents, an optional provider", () => {
  expect(parseSettingsTarget({})).toEqual({});
  expect(parseSettingsTarget({ section: "about" })).toEqual({ section: "about" });
  expect(parseSettingsTarget({ section: "agents", provider: "codex" })).toEqual({ section: "agents", provider: "codex" });
  // A provider only lives on Agents, so naming one alone means Agents.
  expect(parseSettingsTarget({ provider: "copilot" })).toEqual({ section: "agents", provider: "copilot" });
  // MCP Connectors' target opens Agents until its page exists, and names no provider.
  expect(parseSettingsTarget({ section: "mcp" })).toEqual({ section: "agents" });
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
