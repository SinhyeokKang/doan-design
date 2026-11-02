export type WindowKind = "main";

const mainOnly = new Set([
  "app:home", "work:get", "deep-link:ready",
  "project:choose-token-css", "project:init",
  "folders:remove", "folders:restore", "folders:forget-removal", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save",
  "onboarding:choose-folder", "folders:get",
  // canvas-viewport-units D9: the canvas page marks a canvas seen.
  "canvas:seen",
  "window:visible",
  // buzz-onboarding: the first-run session the CLI shares; Settings never drives first-run.
  "onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete",
  // doan-design-skills: preset reads for the home; Settings has no preset UI.
  "design-skills:list", "design-skills:get",
  // buzz-home: Home attachments; Settings has no composer.
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove", "attachments:recheck", "attachments:release",
  // buzz-conversation: Edit on Home re-issues recorded attachment paths, and agent replies open https links.
  "attachments:fromPaths", "shell:openLink",
  // canvas-hand-tool: where the OS cursor is, for a canvas click's focus; Settings has no canvas.
  "pointer:get",
  // buzz-add-projects: the Add Projects page's project session; Settings has no such page.
  "add-projects:read", "add-projects:inspect", "add-projects:select", "add-projects:clone", "add-projects:cancel",
  // buzz-settings: the Settings page and the Project Settings dialog. Main fixes every URL, clipboard text and
  // notification itself; these carry choices and requests only.
  "preferences:read", "preferences:write", "notifications:test", "notifications:open-settings", "about:read", "about:copy",
  "config:session-start", "config:session-end",
  "setup:open-external",
  "agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out",
  "config:read", "config:write", "config:choose",
]);

// The caller must first identify a registered window and check its main frame.
export function senderAllowed(channel: string, windowKind: unknown): boolean {
  return windowKind === "main" && mainOnly.has(channel);
}
