import { expect, test, vi } from "vitest";
import { MCP_CHANNELS, McpIpc, type McpBackend } from "./ipc";
import type { McpSnapshot } from "./service";

const snapshot: McpSnapshot = { revision: 3, file: "ok", servers: [], providers: [] };
function backend(): McpBackend & { [K in keyof McpBackend]: ReturnType<typeof vi.fn> } {
  return {
    snapshot: vi.fn(() => snapshot), refresh: vi.fn(), add: vi.fn(() => ({ ok: true, name: "doan-mcp-example-com" })),
    connect: vi.fn(() => ({ ok: true })), disconnect: vi.fn(() => ({ ok: true })), remove: vi.fn(() => ({ ok: true })),
    cancel: vi.fn(() => ({ ok: true })), openLink: vi.fn(async () => ({ ok: true })),
  } as never;
}
const invalid = { ok: false, reason: "invalid" };

test("the channels are kebab-case under mcp-connectors:", () => {
  expect(Object.values(MCP_CHANNELS)).toEqual(["mcp-connectors:list", "mcp-connectors:add", "mcp-connectors:connect", "mcp-connectors:disconnect",
    "mcp-connectors:remove", "mcp-connectors:cancel", "mcp-connectors:open-link", "mcp-connectors:changed"]);
});

test("list answers the snapshot; with refresh it also starts status reads", async () => {
  const b = backend(), ipc = new McpIpc(b);
  expect(await ipc.handle(MCP_CHANNELS.list, undefined)).toBe(snapshot);
  expect(b.refresh).not.toHaveBeenCalled();
  expect(await ipc.handle(MCP_CHANNELS.list, { refresh: true })).toBe(snapshot);
  expect(b.refresh).toHaveBeenCalledOnce();
  for (const value of [null, {}, { refresh: false }, { refresh: true, extra: 1 }, "x"]) expect(await ipc.handle(MCP_CHANNELS.list, value)).toEqual(invalid);
});

test("add takes one URL string of bounded length; the service judges it", async () => {
  const b = backend(), ipc = new McpIpc(b);
  expect(await ipc.handle(MCP_CHANNELS.add, { url: "https://mcp.example.com/mcp" })).toEqual({ ok: true, name: "doan-mcp-example-com" });
  expect(b.add).toHaveBeenCalledWith("https://mcp.example.com/mcp");
  for (const value of [undefined, {}, { url: 1 }, { url: "x".repeat(4097) }, { url: "https://a.example", name: "doan-a" }]) expect(await ipc.handle(MCP_CHANNELS.add, value)).toEqual(invalid);
  expect(b.add).toHaveBeenCalledOnce();
});

test("provider actions take a Claude or Codex provider and a doan- server name only", async () => {
  const b = backend(), ipc = new McpIpc(b);
  for (const [channel, method] of [[MCP_CHANNELS.connect, "connect"], [MCP_CHANNELS.disconnect, "disconnect"], [MCP_CHANNELS.cancel, "cancel"], [MCP_CHANNELS.openLink, "openLink"]] as const) {
    expect(await ipc.handle(channel, { provider: "codex", name: "doan-notion" })).toEqual({ ok: true });
    expect(b[method]).toHaveBeenCalledWith("codex", "doan-notion");
    for (const value of [undefined, { provider: "cursor", name: "doan-notion" }, { provider: "codex", name: "notion" }, { provider: "codex", name: "doan-notion", url: "https://x" },
      { provider: "codex" }, { provider: "toString", name: "doan-notion" }, { provider: "codex", name: "doan-" + "a".repeat(30) }]) {
      expect(await ipc.handle(channel, value)).toEqual(invalid);
    }
    expect(b[method]).toHaveBeenCalledOnce();
  }
});

test("remove takes a server name only", async () => {
  const b = backend(), ipc = new McpIpc(b);
  expect(await ipc.handle(MCP_CHANNELS.remove, { name: "doan-mcp-example-com" })).toEqual({ ok: true });
  expect(b.remove).toHaveBeenCalledWith("doan-mcp-example-com");
  for (const value of [undefined, { name: "../x" }, { name: "doan-x", provider: "codex" }]) expect(await ipc.handle(MCP_CHANNELS.remove, value)).toEqual(invalid);
});

test("the changed event and unknown channels are not requests", async () => {
  const ipc = new McpIpc(backend());
  expect(await ipc.handle(MCP_CHANNELS.changed, undefined)).toEqual(invalid);
  expect(await ipc.handle("mcp-connectors:delete", { name: "doan-x" })).toEqual(invalid);
});
