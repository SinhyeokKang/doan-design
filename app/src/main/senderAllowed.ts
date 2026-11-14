import { PROTOTYPE_CHANNELS, PROTOTYPE_WINDOW_REQUESTS } from "./prototype/ipc";

// `prototype` is the single-frame prototype window: its main frame drives its own run and its conversation panel. It
// reaches the main window's state only through the composer channels below (attachments are its own ids), conversation
// requests main scopes to the playing canvas (index.ts), and its own narrow reads; a canvas that escaped into it could
// not change the selection, settings or another conversation.
export type WindowKind = "main" | "prototype";

const mainOnly = new Set([
  "app:home", "work:get", "deep-link:ready", "doan-open:answer",
  // An app conversation's work content; conversation-work:changed is an event main sends, not a request.
  "conversation-work:get",
  "project:choose-token-css", "project:init",
  "folders:remove", "folders:locate", "folders:reveal", "folders:open", "folders:reopen",
  "selection:set", "inspect:get", "thumbnails:get", "thumbnails:visible", "menu:state", "shell:activity", "ui-state:get", "ui-state:save",
  "onboarding:choose-folder", "folders:get",
  // New folder on the Project step: the save panel and the folder main makes.
  "onboarding:new-folder",
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
  // Home's credit line opens the same fixed repository URL.
  "repository:open",
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
  // Play prototype from the toolbar and the size bubble; prototype:changed is an event main sends the prototype window.
  PROTOTYPE_CHANNELS.play,
  // The prototype window's playing target, and the project conversation the main window says draws it.
  PROTOTYPE_CHANNELS.readTarget, PROTOTYPE_CHANNELS.setDrawing,
]);

// The panel's composer: preset reads, its own attachments (no capture: the window has no board) and agent reply links.
// The main window's own set is not widened for it.
const prototypeComposer = [
  "design-skills:list", "design-skills:get",
  "attachments:choose", "attachments:add-paths", "attachments:add-pasted", "attachments:remove", "attachments:recheck", "attachments:release", "attachments:fromPaths",
  "shell:openLink",
];

const prototypeOnly: ReadonlySet<string> = new Set([...PROTOTYPE_WINDOW_REQUESTS, ...prototypeComposer]);

// The caller must first identify a registered window and check its main frame.
export function senderAllowed(channel: string, windowKind: unknown): boolean {
  if (windowKind === "main") return mainOnly.has(channel);
  if (windowKind === "prototype") return prototypeOnly.has(channel);
  return false;
}
