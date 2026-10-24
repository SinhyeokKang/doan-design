export type WindowKind = "main" | "settings";

const mainOnly = new Set([
  "app:home", "comments:list", "comments:begin", "comments:mutate", "comments:status", "comments:author", "comments:copy", "comments:guard", "comments:transition-answer",
  "project:choose-token-css", "project:init", "folders:add", "folders:add-paths", "folders:scan", "folders:scan-cancel", "folders:add-candidates", "folders:confirm-folder",
  "folders:remove", "folders:restore", "folders:forget-removal", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "ui-state:get", "ui-state:save", "onboarding:get-open", "onboarding:close", "onboarding:first-prompt", "onboarding:copy",
  // Settings reads setup through `setup:*` and projects through the projection only.
  "onboarding:read", "onboarding:run", "onboarding:answer", "onboarding:open-project", "folders:get", "settings:open",
]);
const shared = new Set(["setup:read", "setup:run", "setup:answer", "setup:check-again", "setup:status", "setup:open-external", "projects:get"]);
const settingsOnly = new Set([
  "config:read", "config:write", "config:choose", "setup:copy-path-line", "settings:tab-get", "settings:tab-save", "settings:take-target",
  "projects:reveal", "projects:forward-action",
]);

// The caller must first identify a registered window and check its main frame.
export function senderAllowed(channel: string, windowKind: unknown): boolean {
  if (windowKind !== "main" && windowKind !== "settings") return false;
  return shared.has(channel) || (windowKind === "main" ? mainOnly : settingsOnly).has(channel);
}
