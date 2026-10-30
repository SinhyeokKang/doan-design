export type WindowKind = "main" | "settings";

const mainOnly = new Set([
  "app:home", "comments:list", "comments:begin", "comments:mutate", "comments:status", "comments:author", "comments:copy", "comments:guard", "comments:transition-answer",
  "project:choose-token-css", "project:init", "folders:add", "folders:add-paths", "folders:scan", "folders:scan-cancel", "folders:add-candidates", "folders:confirm-folder",
  "folders:remove", "folders:restore", "folders:forget-removal", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save", "onboarding:first-prompt", "onboarding:copy",
  // Settings reads setup through `setup:*` and projects through the projection only.
  "onboarding:choose-folder", "folders:get", "settings:open",
  "window:visible", "comments:project", "review-state:get", "review-state:raise", "comments:orphan-mutate", "comments:orphan-status",
  // buzz-onboarding: the first-run session the CLI and MCP share; Settings never drives first-run.
  "onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete",
  // doan-design-skills: preset reads for the home; Settings has no preset UI.
  "design-skills:list", "design-skills:get",
  // buzz-home: Home attachments; Settings has no composer.
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove", "attachments:recheck", "attachments:release",
  // buzz-add-projects: the Add Projects page's project session; Settings has no such page.
  "add-projects:read", "add-projects:inspect", "add-projects:select", "add-projects:clone", "add-projects:cancel",
]);
const shared = new Set([
  "setup:read", "setup:run", "setup:answer", "setup:check-again", "setup:status", "setup:open-external", "projects:get",
  // Agent accounts: either window may sign in or out. Conversation runs stay main-only (`conversation:*`).
  "agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out",
]);
const settingsOnly = new Set([
  "config:read", "config:write", "config:choose", "setup:copy-path-line", "settings:tab-get", "settings:tab-save", "settings:take-target",
  "projects:reveal", "projects:forward-action",
]);

// The caller must first identify a registered window and check its main frame.
export function senderAllowed(channel: string, windowKind: unknown): boolean {
  if (windowKind !== "main" && windowKind !== "settings") return false;
  return shared.has(channel) || (windowKind === "main" ? mainOnly : settingsOnly).has(channel);
}
