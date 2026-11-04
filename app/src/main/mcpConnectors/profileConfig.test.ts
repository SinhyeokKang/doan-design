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

// BB review round 2: a config the parser cannot positively read in its mcp_servers part is a failure, never "no
// servers", so the logout falls back to every server Doan knows.
test("Codex config.toml: trailing comments on headers and url lines are read", () => {
  const text = ['[mcp_servers.doan-notion] # MCP', 'url = "https://mcp.notion.com/mcp" # the Notion server', "enabled = true # on", "",
    "[mcp_servers.doan-notion.env]", 'TOKEN_NAME = "X"', "",
    "[mcp_servers.doan-lit]", "url = 'https://lit.example/mcp'   # literal"].join("\n");
  expect(codexConfigServers(text)).toEqual([
    { name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: null },
    { name: "doan-lit", url: "https://lit.example/mcp", authenticated: null },
  ]);
});

test("Codex config.toml: what it cannot read for certain in the mcp_servers part is a failure", () => {
  for (const text of [
    "[mcp_servers.doan-notion]\nurl = [ broken",
    "[mcp_servers.doan-notion]\nurl = \"https://unterminated",
    "[mcp_servers.doan-notion]\nargs = [\n  \"a\",\n]",
    '[mcp_servers.doan-notion]\nnote = """\nmulti\n"""',
    "[mcp_servers]\ndoan-notion = { url = \"https://mcp.notion.com/mcp\" }",
    'mcp_servers.doan-notion.url = "https://mcp.notion.com/mcp"',
    'mcp_servers = { doan-notion = { url = "https://mcp.notion.com/mcp" } }',
    "[[mcp_servers.doan-notion]]",
    "[mcp_servers.doan-notion\nurl = \"x\"",
    "[mcp_servers.doan-notion]\nthis is not toml",
  ]) expect(codexConfigServers(text), text).toBeNull();
});

test("Codex config.toml: other tables, multi-line strings outside mcp_servers and an empty file read fine", () => {
  const text = ['model = "gpt" # default', 'instructions = """', "[mcp_servers.doan-fake] inside a string", '"""', "[profiles.x]", 'args = ["a", "b"]',
    "[mcp_servers.doan-notion]", 'url = "https://mcp.notion.com/mcp"'].join("\n");
  expect(codexConfigServers(text)).toEqual([{ name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: null }]);
  expect(codexConfigServers("")).toEqual([]);
  expect(codexConfigServers("# nothing\nmodel = \"x\"\n")).toEqual([]);
});

test("Claude .claude.json: mcpServers of the wrong type is a failure; no mcpServers is no servers", () => {
  for (const value of [[], "x", 1, null]) expect(claudeConfigServers(JSON.stringify({ mcpServers: value })), JSON.stringify(value)).toBeNull();
  expect(claudeConfigServers(JSON.stringify({ mcpServers: { "doan-x": "not an entry" } }))).toBeNull();
  expect(claudeConfigServers(JSON.stringify([]))).toBeNull();
  expect(claudeConfigServers(JSON.stringify({ other: 1 }))).toEqual([]);
});

// BB review round 3: the parser is total. An unclosed multi-line string anywhere or a value it cannot decode is the
// failure value, never an exception and never an empty list.
test("Codex config.toml: an unclosed multi-line string anywhere or an undecodable escape is a failure, not a throw", () => {
  expect(codexConfigServers('instructions = """\n[mcp_servers.doan-notion]\nurl = "https://mcp.notion.com/mcp"\n')).toBeNull();
  expect(codexConfigServers("[profiles.x]\nnote = \'\'\'\nopen\n")).toBeNull();
  expect(() => codexConfigServers('[mcp_servers.doan-notion]\nurl = "https://x/\\UFFFFFFFF"\n')).not.toThrow();
  expect(codexConfigServers('[mcp_servers.doan-notion]\nurl = "https://x/\\UFFFFFFFF"\n')).toBeNull();
});
