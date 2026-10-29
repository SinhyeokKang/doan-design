import { expect, test } from "vitest";
import { INSTALL_URLS, parseExternalTarget, parseForwardedAction, parseSettingsTab, parseSettingsTarget, projectRows, SETTINGS_TITLES, SETTINGS_WINDOW } from "./settings";
import type { FolderEntry } from "./view";

const stored = (root: string) => root === "/repo";

test("the Settings window is a fixed 640×560 window without minimize, zoom or fullscreen", () => {
  expect(SETTINGS_WINDOW).toMatchObject({ width: 640, height: 560, resizable: false, minimizable: false, maximizable: false, fullscreenable: false });
  expect(SETTINGS_TITLES).toEqual({ connections: "Connections", projects: "Projects" });
});

test("tabs are an enum", () => {
  expect(parseSettingsTab("connections")).toBe("connections");
  expect(parseSettingsTab("projects")).toBe("projects");
  for (const bad of ["", "Connections", "toString", null, 1, {}]) expect(parseSettingsTab(bad)).toBeNull();
});

test("targets name a tab and at most one row the tab owns", () => {
  expect(parseSettingsTarget({ tab: "connections" }, stored)).toEqual({ tab: "connections" });
  expect(parseSettingsTarget({ tab: "connections", connection: "claude" }, stored)).toEqual({ tab: "connections", connection: "claude" });
  expect(parseSettingsTarget({ tab: "projects", project: "/repo" }, stored)).toEqual({ tab: "projects", project: "/repo" });
  for (const bad of [
    null, "projects", {}, { tab: "other" }, { tab: "connections", connection: "gemini" }, { tab: "connections", project: "/repo" },
    { tab: "projects", project: "/elsewhere" }, { tab: "projects", connection: "cli" }, { tab: "projects", project: "/repo", more: 1 },
  ]) expect(parseSettingsTarget(bad, stored), JSON.stringify(bad)).toBeNull();
});

test("the projects projection keeps only what grouping and chips need", () => {
  const entries: FolderEntry[] = [
    { path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html", open: 1, resolved: 0, url: "http://127.0.0.1:1/t/x/a" }], servedRev: 3, changedAt: 9,
      git: { common: "/repo/.git", main: "/repo", branch: "main", worktrees: ["/repo", "/repo-fix"] } },
    { path: "/repo-fix", kind: "error", message: "broken config", lastCommon: "/repo/.git" },
    { path: "/repo-review", kind: "list", canvases: [], servedRev: 1, git: { common: "/repo/.git", main: "/repo", detached: "3f9c2a1d5e7b", worktrees: ["/repo", "/repo-review"] } },
    { path: "/repo-bare", kind: "list", canvases: [], servedRev: 1, git: { common: "/repo/.git", worktrees: [] } },
    { path: "/plain", kind: "uninitialized" },
    { path: "/gone", kind: "notFound" },
  ];
  expect(projectRows(entries, null)).toEqual([
    { path: "/repo", displayPath: "/repo", kind: "list", git: { common: "/repo/.git", main: "/repo", branch: "main" } },
    { path: "/repo-fix", displayPath: "/repo-fix", kind: "error", lastCommon: "/repo/.git" },
    { path: "/repo-review", displayPath: "/repo-review", kind: "list", git: { common: "/repo/.git", main: "/repo", detached: "3f9c2a1d5e7b" } },
    { path: "/repo-bare", displayPath: "/repo-bare", kind: "list", git: { common: "/repo/.git" } },
    { path: "/plain", displayPath: "/plain", kind: "uninitialized" },
    { path: "/gone", displayPath: "/gone", kind: "notFound" },
  ]);
});

test("each row carries its path shortened the way Home shows it", () => {
  const entries: FolderEntry[] = [
    { path: "/Users/me/repo", kind: "uninitialized" },
    { path: "/Users/me", kind: "uninitialized" },
    { path: "/Users/meow/repo", kind: "uninitialized" },
    { path: "/srv/repo", kind: "uninitialized" },
  ];
  expect(projectRows(entries, "/Users/me").map(row => row.displayPath)).toEqual(["~/repo", "~", "/Users/meow/repo", "/srv/repo"]);
  expect(projectRows(entries, null).map(row => row.displayPath)).toEqual(entries.map(entry => entry.path));
});

test("forwarded problem-row actions are an enum on a stored root; Show in Finder runs in main", () => {
  for (const action of ["setUp", "locate", "remove", "retry", "details"]) {
    expect(parseForwardedAction({ path: "/repo", action }, stored)).toEqual({ path: "/repo", action });
  }
  for (const bad of [{ path: "/repo", action: "showInFinder" }, { path: "/other", action: "remove" }, { path: "/repo" }, { path: "/repo", action: "remove", x: 1 }, null]) {
    expect(parseForwardedAction(bad, stored)).toBeNull();
  }
});

test("only the two fixed install pages can be opened", () => {
  expect(parseExternalTarget({ target: "claude" })).toBe("claude");
  expect(parseExternalTarget({ target: "codex" })).toBe("codex");
  expect(parseExternalTarget({ target: "cursor" })).toBe("cursor");
  expect(parseExternalTarget({ target: "copilot" })).toBe("copilot");
  // Doan downloads Antigravity's server itself, so it has no install page.
  expect(parseExternalTarget({ target: "antigravity" })).toBeNull();
  for (const bad of [{ target: "https://example.com" }, { target: "claude", url: "x" }, "claude", null, { target: "toString" }]) expect(parseExternalTarget(bad)).toBeNull();
  expect(INSTALL_URLS).toEqual({
    claude: "https://code.claude.com/docs/en/setup", codex: "https://learn.chatgpt.com/docs/codex/cli",
    cursor: "https://cursor.com/docs/cli/installation",
    copilot: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
  });
});
