import { CONNECTOR_NAME } from "./names";
import { MCP_PROVIDERS, type McpProvider } from "./presets";
import type { McpAddReply, McpReply, McpService, McpSnapshot } from "./service";

// Kebab-case like agent-auth:*. The invoke channels are main-window-only (senderAllowed.ts); changed is the snapshot
// main sends. A window names a provider and a server, never a URL to open: open-link opens main's own link.
export const MCP_CHANNELS = {
  list: "mcp-connectors:list", add: "mcp-connectors:add", connect: "mcp-connectors:connect", disconnect: "mcp-connectors:disconnect",
  remove: "mcp-connectors:remove", cancel: "mcp-connectors:cancel", openLink: "mcp-connectors:open-link", changed: "mcp-connectors:changed",
} as const;
export type McpBackend = Pick<McpService, "snapshot" | "refresh" | "add" | "connect" | "disconnect" | "remove" | "cancel" | "openLink">;
export type { McpAddReply, McpReply, McpSnapshot };

const MAX_URL_INPUT = 4096;
const invalid = { ok: false, reason: "invalid" } as const;
function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return keys.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => keys.includes(k));
}
const provider = (value: unknown): value is McpProvider => MCP_PROVIDERS.some(p => p === value);
const name = (value: unknown): value is string => typeof value === "string" && CONNECTOR_NAME.test(value);

export class McpIpc {
  constructor(private readonly backend: McpBackend) {}

  // The caller has already checked that the sender is the main window's main frame.
  async handle(channel: string, value: unknown): Promise<McpSnapshot | McpReply | McpAddReply> {
    const backend = this.backend;
    switch (channel) {
      case MCP_CHANNELS.list:
        // refresh: entering the page or Retry of a failed read; statuses are never polled.
        if (value === undefined) return backend.snapshot();
        if (!fields(value, ["refresh"]) || value.refresh !== true) return invalid;
        backend.refresh();
        return backend.snapshot();
      case MCP_CHANNELS.add:
        if (!fields(value, ["url"]) || typeof value.url !== "string" || value.url.length > MAX_URL_INPUT) return invalid;
        return backend.add(value.url);
      case MCP_CHANNELS.remove:
        if (!fields(value, ["name"]) || !name(value.name)) return invalid;
        return backend.remove(value.name);
      case MCP_CHANNELS.connect: case MCP_CHANNELS.disconnect: case MCP_CHANNELS.cancel: case MCP_CHANNELS.openLink: {
        if (!fields(value, ["provider", "name"]) || !provider(value.provider) || !name(value.name)) return invalid;
        if (channel === MCP_CHANNELS.connect) return backend.connect(value.provider, value.name);
        if (channel === MCP_CHANNELS.disconnect) return backend.disconnect(value.provider, value.name);
        if (channel === MCP_CHANNELS.cancel) return backend.cancel(value.provider, value.name);
        return backend.openLink(value.provider, value.name);
      }
    }
    return invalid;
  }
}
