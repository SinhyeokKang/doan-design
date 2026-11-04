import { expect, test } from "vitest";
import { claudeConfigServers, codexConfigServers } from "./profileConfig";

test("Codex config.toml: the doan- [mcp_servers] tables with their URL strings, bare or quoted names", () => {
  const text = [
    'model = "gpt"', "",
    "[mcp_servers.doan-notion]", 'url = "https://mcp.notion.com/mcp"', "",
    '[mcp_servers."doan-quoted"]', "url = 'https://quoted.example/mcp'", "",
    "[mcp_servers.doan-escaped]", 'url = "https://e.example/a\\"b\\\\c"', "",
    "[mcp_servers.notion]", 'url = "https://mcp.notion.com/mcp"', "",
    "[mcp_servers.doan-local]", 'command = "node"', "",
    "[profiles.x]", 'url = "https://not-a-server.example"',
  ].join("\n");
  expect(codexConfigServers(text)).toEqual([
    { name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: null },
    { name: "doan-quoted", url: "https://quoted.example/mcp", authenticated: null },
    { name: "doan-escaped", url: 'https://e.example/a"b\\c', authenticated: null },
    { name: "doan-local", url: null, authenticated: null },
  ]);
  expect(codexConfigServers("")).toEqual([]);
});

test("Claude .claude.json: only the doan- mcpServers keys and their urls are taken", () => {
  const text = JSON.stringify({ oauthAccount: { accountUuid: "x" }, mcpServers: { "doan-notion": { type: "http", url: "https://mcp.notion.com/mcp" }, notion: { type: "http", url: "https://n" }, "doan-odd": { type: "stdio" } } });
  expect(claudeConfigServers(text)).toEqual([
    { name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: null },
    { name: "doan-odd", url: null, authenticated: null },
  ]);
  expect(claudeConfigServers(JSON.stringify({}))).toEqual([]);
  expect(claudeConfigServers("not json")).toBeNull();
});
