export type WindowKind = "main";

const mainOnly = new Set([
  "app:home", "work:get", "deep-link:ready", "doan-open:answer",
  // An app conversation's work content; conversation-work:changed is an event main sends, not a request.
  "conversation-work:get",
  "project:choose-token-css", "project:init",
  "folders:remove", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save",
  "onboarding:choose-folder", "folders:get",
  // The canvas page says which canvas it shows, and the read-state toast's Retry.
  "read-state:showing", "read-state:retry",
  "window:visible",
  // The header drops the traffic-light space in fullscreen.
  "window:fullscreen",
  // The first-run session the CLI shares; Settings never drives first-run.
  "onboarding:start", "onboarding:status", "onboarding:check", "onboarding:cancel", "onboarding:inspect", "onboarding:select", "onboarding:clone", "onboarding:complete",
  // Preset reads for the home; Settings has no preset UI.
  "design-skills:list", "design-skills:get",
  // Home attachments; Settings has no composer.
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove", "attachments:recheck", "attachments:release",
  // Edit on Home re-issues recorded attachment paths, and agent replies open https links.
  "attachments:fromPaths", "shell:openLink",
  // The canvas page captures an area of the board; Settings has no canvas.
  "attachments:capture",
  // Where the OS cursor is, for a canvas click's focus; Settings has no canvas.
  "pointer:get",
  // The Add Projects page's project session; Settings has no such page.
  "add-projects:read", "add-projects:inspect", "add-projects:select", "add-projects:clone", "add-projects:cancel",
  // The Settings page and the Project Settings page. Main fixes every URL, clipboard text and
  // notification itself; these carry choices and requests only.
  "preferences:read", "preferences:write", "notifications:test", "notifications:open-settings", "about:read", "about:copy",
  "config:session-start", "config:session-end",
  // Settings > About's update row, the header button and the Doan menu item; update:state and update:popover are events
  // main sends, not requests.
  "update:get", "update:check", "update:install", "update:openNotes",
  // The GitHub star card; star:moment is an event main sends, not a request.
  "star:open", "star:dismiss", "star:busy",
  "setup:open-external",
  // Install and Update name a provider; main picks the command and writes the script.
  "setup:open-install",
  "agent-auth:read", "agent-auth:check", "agent-auth:sign-in", "agent-auth:cancel", "agent-auth:submit-code", "agent-auth:open-link", "agent-auth:sign-out",
  // The header's usage rings; agent-usage:changed is an event main sends, not a request.
  "agent-usage:read",
  // Settings > MCP Connectors; mcp-connectors:changed is an event main sends, not a request.
  "mcp-connectors:list", "mcp-connectors:add", "mcp-connectors:connect", "mcp-connectors:disconnect", "mcp-connectors:remove", "mcp-connectors:cancel", "mcp-connectors:open-link",
  "config:read", "config:write", "config:choose",
  // The sidebar's canvas row menu; Show in Finder takes only an id main gave for a file it wrote.
  "canvas:trashPlan", "canvas:trash", "canvas:export", "canvas:revealExport",
  // The existing-user buddy screen; Settings is locked while it shows.
  "buddy-intro:read", "buddy-intro:close",
]);

// The caller must first identify a registered window and check its main frame.
export function senderAllowed(channel: string, windowKind: unknown): boolean {
  return windowKind === "main" && mainOnly.has(channel);
}
