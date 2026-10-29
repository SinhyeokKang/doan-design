import { expect, test } from "vitest";
import { senderAllowed } from "./senderAllowed";
import { AUTH_CHANNELS } from "./agentAuth/ipc";
import { ONBOARDING_CHANNELS } from "./onboarding/service";
const mainOnly = [
  "app:home", "comments:list", "comments:begin", "comments:mutate", "comments:status", "comments:author", "comments:copy", "comments:guard", "comments:transition-answer",
  "project:choose-token-css", "project:init", "folders:add", "folders:add-paths", "folders:scan", "folders:scan-cancel", "folders:add-candidates", "folders:confirm-folder",
  "folders:remove", "folders:restore", "folders:forget-removal", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save", "onboarding:first-prompt", "onboarding:copy",
  // Settings reads setup through `setup:*` and projects through the projection only (orch.md R-A1).
  "onboarding:choose-folder", "folders:get", "settings:open",
  // The first prompt's arrival rule needs to know whether the window is hidden.
  "window:visible",
  // revision-recheck: the project comment read and the device-local review markers.
  "comments:project", "review-state:get", "review-state:raise",
  // project-feedback: resolve, reopen and delete on comments without a canvas.
  "comments:orphan-mutate", "comments:orphan-status",
  // buzz-onboarding: the session the CLI and MCP share; Settings never drives first-run.
  "onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete",
  // doan-design-skills: preset reads for the home; Settings has no preset UI.
  "design-skills:list", "design-skills:get",
  // buzz-home: Home attachments.
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove",
];
const shared = ["setup:read", "setup:run", "setup:answer", "setup:check-again", "setup:status", "setup:open-external", "projects:get",
  "agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out"];
const settingsOnly = [
  "config:read", "config:write", "config:choose", "setup:copy-path-line", "settings:tab-get", "settings:tab-save", "settings:take-target",
  "projects:reveal", "projects:forward-action",
];
test.each(mainOnly)("restricts %s to main", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(false);
});
test.each(shared)("shares %s with Settings", channel => {
  expect(senderAllowed(channel, "main")).toBe(true);
  expect(senderAllowed(channel, "settings")).toBe(true);
});
test("shares every agent-auth request channel, so a channel added to AUTH_CHANNELS alone cannot be refused silently", () => {
  const events: string[] = [AUTH_CHANNELS.changed, AUTH_CHANNELS.prompt];
  const requests = Object.values(AUTH_CHANNELS).filter(channel => !events.includes(channel));
  expect(requests.filter(channel => !shared.includes(channel))).toEqual([]);
  for (const channel of requests) for (const kind of ["main", "settings"]) expect(senderAllowed(channel, kind)).toBe(true);
});
test.each(settingsOnly)("restricts %s to Settings", channel => {
  expect(senderAllowed(channel, "main")).toBe(false);
  expect(senderAllowed(channel, "settings")).toBe(true);
});
test("rejects unknown channels and every unregistered window", () => {
  for (const channel of [...mainOnly, ...shared, ...settingsOnly, "", "setup:delete", "comments:evil", "toString", "__proto__", "settings:", "projects:", "setup:"]) {
    for (const kind of [undefined, null, "thumbnail", "unknown", "", 1, {}]) expect(senderAllowed(channel, kind)).toBe(false);
  }
  for (const kind of ["main", "settings"]) for (const channel of ["", "setup:delete", "comments:evil", "toString", "__proto__", "agent-auth:changed", "agent-auth:prompt", "agent-auth:delete"]) expect(senderAllowed(channel, kind)).toBe(false);
});
test("restricts every onboarding session request channel to main", () => {
  const requests = Object.values(ONBOARDING_CHANNELS).filter(channel => channel !== ONBOARDING_CHANNELS.changed);
  expect(requests.filter(channel => !mainOnly.includes(channel))).toEqual([]);
  for (const channel of requests) expect(senderAllowed(channel, "settings")).toBe(false);
});
