import { describe, expect, test } from "vitest";
import { senderAllowed } from "./senderAllowed";
import { AUTH_CHANNELS } from "./agentAuth/ipc";
import { ONBOARDING_CHANNELS } from "./onboarding/service";
const mainOnly = [
  "app:home", "work:get", "deep-link:ready", "doan-open:answer",
  "project:choose-token-css", "project:init",
  "folders:remove", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save",
  "onboarding:choose-folder", "folders:get",
  // canvas-viewport-units D9: the canvas page marks a canvas seen.
  "canvas:seen",
  // Toasts need native visibility.
  "window:visible",
  // shell-panel-layout §2.5: the header drops the traffic-light space in fullscreen.
  "window:fullscreen",
  // buzz-onboarding: the session the CLI shares; Settings never drives first-run.
  "onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete",
  // doan-design-skills: preset reads for the home; Settings has no preset UI.
  "design-skills:list", "design-skills:get",
  // buzz-home: Home attachments.
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove", "attachments:recheck", "attachments:release",
  // buzz-conversation: re-issued attachments from recorded paths, and https links from agent replies.
  "attachments:fromPaths", "shell:openLink",
  // canvas-hand-tool: where the OS cursor is, for a canvas click's focus.
  "pointer:get",
  // canvas-row-menu: Move to Trash and Export from the sidebar's canvas row menu.
  "canvas:trashPlan", "canvas:trash", "canvas:export", "canvas:revealExport",
];
const setupAndAuth = ["setup:open-external",
  "agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out",
  "config:read", "config:write", "config:choose"];
// buzz-settings design '창 제거와 IPC': the Settings page's own requests, and the two events main sends it.
const settingsPage = ["preferences:read", "preferences:write", "notifications:test", "notifications:open-settings", "about:read", "about:copy", "config:session-start", "config:session-end"];
const settingsPageEvents = ["notifications:click", "settings-page:open"];
test.each(mainOnly)("restricts %s to main", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(false);
});
test.each(setupAndAuth)("restricts %s to main", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(false);
});
test("restricts every agent-auth request channel to main, so new channels cannot be refused silently", () => {
  const events: string[] = [AUTH_CHANNELS.changed, AUTH_CHANNELS.prompt];
  const requests = Object.values(AUTH_CHANNELS).filter(channel => !events.includes(channel));
  expect(requests.filter(channel => !setupAndAuth.includes(channel))).toEqual([]);
  for (const channel of requests) {
    expect(senderAllowed(channel, "main")).toBe(true);
    expect(senderAllowed(channel, "settings")).toBe(false);
  }
});
test("rejects unknown channels and every unregistered window", () => {
  for (const channel of [...mainOnly, ...setupAndAuth, ...settingsPage, "", "setup:delete", "comments:evil", "toString", "__proto__", "settings:", "projects:", "setup:"]) {
    for (const kind of [undefined, null, "thumbnail", "unknown", "", 1, {}]) expect(senderAllowed(channel, kind)).toBe(false);
  }
  // zero-setup-agents removed Settings > Connections and its setup channels.
  // Built from the operation names so a search for the channel literals finds only live code.
  const removed = ["read", "run", "answer", "check-again", "status"].map(op => `setup:${op}`);
  // buzz-canvas-conversation removed the app's comment screens with their channels.
  removed.push(...["list", "begin", "mutate", "status", "author", "copy", "guard", "transition-answer"].map(op => `comments:${op}`), "review-state:get", "review-state:raise");
  for (const kind of ["main", "settings"]) for (const channel of [...removed, "", "setup:delete", "comments:evil", "toString", "__proto__", "agent-auth:changed", "agent-auth:prompt", "agent-auth:delete"]) expect(senderAllowed(channel, kind)).toBe(false);
});
test("restricts every onboarding session request channel to main", () => {
  const requests = Object.values(ONBOARDING_CHANNELS).filter(channel => channel !== ONBOARDING_CHANNELS.changed);
  expect(requests.filter(channel => !mainOnly.includes(channel))).toEqual([]);
  for (const channel of requests) expect(senderAllowed(channel, "settings")).toBe(false);
});
// buzz-add-projects: the Add Projects page's session is the main window's; Settings has no Add Projects page.
test("restricts every Add Projects page request channel to main", async () => {
  const { ADD_PAGE_CHANNELS } = await import("./addPage");
  const requests = Object.values(ADD_PAGE_CHANNELS).filter(channel => channel !== ADD_PAGE_CHANNELS.changed && channel !== ADD_PAGE_CHANNELS.open);
  expect(requests).toEqual(["add-projects:read", "add-projects:inspect", "add-projects:select", "add-projects:clone", "add-projects:cancel"]);
  for (const channel of requests) {
    expect(senderAllowed(channel, "main"), channel).toBe(true);
    expect(senderAllowed(channel, "settings"), channel).toBe(false);
  }
  for (const event of [ADD_PAGE_CHANNELS.changed, ADD_PAGE_CHANNELS.open]) for (const kind of ["main", "settings"]) expect(senderAllowed(event, kind)).toBe(false);
});
describe("settings page channels", () => {
  test.each(settingsPage)("restricts %s to the main window", channel => {
    expect(senderAllowed(channel, "main")).toBe(true);
    expect(senderAllowed(channel, "settings")).toBe(false);
  });
  test.each(settingsPageEvents)("%s is an event main sends, never a request", channel => {
    for (const kind of ["main", "settings"]) expect(senderAllowed(channel, kind)).toBe(false);
  });
});
// mcp-connectors B4: the Settings > MCP Connectors requests; :changed is an event main sends, never a request.
test("restricts every MCP Connectors request channel to main and refuses its event", async () => {
  const { MCP_CHANNELS } = await import("./mcpConnectors/ipc");
  const requests = Object.values(MCP_CHANNELS).filter(channel => channel !== MCP_CHANNELS.changed);
  expect(requests).toEqual(["mcp-connectors:list", "mcp-connectors:add", "mcp-connectors:connect", "mcp-connectors:disconnect", "mcp-connectors:remove", "mcp-connectors:cancel", "mcp-connectors:open-link"]);
  for (const channel of requests) {
    expect(senderAllowed(channel, "main"), channel).toBe(true);
    expect(senderAllowed(channel, "settings"), channel).toBe(false);
  }
  for (const kind of ["main", "settings"]) for (const channel of [MCP_CHANNELS.changed, "mcp-connectors:delete", "mcp-connectors:"]) expect(senderAllowed(channel, kind)).toBe(false);
});
