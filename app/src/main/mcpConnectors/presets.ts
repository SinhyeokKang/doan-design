import type { Provider } from "../agentAuth/types";

// The renderer imports this module by value, so it must stay free of Node modules and main-only imports
// (POSTMORTEM 2026-10-30 'A renderer import of a main module left the built app's window blank').

// Cursor, Copilot and Antigravity failed the PoC for reasons of their own (mcp-connectors spec '비목표').
export type McpProvider = Extract<Provider, "claude" | "codex">;
export const MCP_PROVIDERS: readonly McpProvider[] = ["claude", "codex"];

// A server the person added by URL. name is what Doan registers with each provider: `doan-<slug>` keeps it apart from
// the person's terminal registrations, because Codex keys its keychain entry by name and URL hash only.
export interface ConnectorServer { name: string; url: string }
export interface McpPreset extends ConnectorServer { label: string }

// All three passed connect and one tool call under Claude Code and Codex in the PoC (design 'PRESETS').
export const PRESETS: readonly McpPreset[] = [
  { name: "doan-notion", label: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "doan-atlassian", label: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp" },
  { name: "doan-figma", label: "Figma", url: "https://mcp.figma.com/mcp" },
];

export function connectorLabel(server: ConnectorServer): string {
  return new URL(server.url).host;
}

export function connectorLabels(servers: readonly ConnectorServer[]): Record<string, string> {
  return Object.fromEntries([...PRESETS.map(preset => [preset.name, preset.label]), ...servers.map(server => [server.name, connectorLabel(server)])]);
}

// What a permission summary calls a server. A doan- server missing from the labels (removed meanwhile) shows its slug,
// never the internal name; any other server keeps the name its provider gave it.
export function serverLabel(name: string, labels: Readonly<Record<string, string>>): string {
  return Object.hasOwn(labels, name) ? labels[name]! : name.startsWith("doan-") ? name.slice(5) : name;
}
