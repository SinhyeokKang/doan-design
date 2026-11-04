import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { codexMcpServers, parseClaudeMcpList } from "./status";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("claude mcp list: the doan- servers with their URLs, after the health-check header", () => {
  expect(parseClaudeMcpList(fixture("claude-list-needs-auth.txt"), 0)).toEqual([{ name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: false }]);
});

test("claude mcp list: other servers (claude.ai connectors, the person's own, stdio) are left out", () => {
  const output = [
    "Checking MCP server health…", "",
    "claude.ai Figma: https://mcp.figma.com/mcp - ✔ Connected",
    "notion: https://mcp.notion.com/mcp (HTTP) - ✔ Connected",
    "local: node server.js - ✔ Connected",
    "doan-figma: https://mcp.figma.com/mcp (HTTP) - ✔ Connected",
    "doan-mcp-example-com: https://mcp.example.com/a/b (HTTP) - ✘ Failed to connect",
  ].join("\n");
  expect(parseClaudeMcpList(output, 0)).toEqual([
    { name: "doan-figma", url: "https://mcp.figma.com/mcp", authenticated: true },
    { name: "doan-mcp-example-com", url: "https://mcp.example.com/a/b", authenticated: null },
  ]);
});

test("claude mcp list: no servers is an empty list", () => {
  expect(parseClaudeMcpList("No MCP servers configured. Use `claude mcp add` to add a server.\n", 0)).toEqual([]);
});

test("claude mcp list: a failed exit or a doan- line in another shape is unreadable, so no logout is skipped silently", () => {
  expect(parseClaudeMcpList(fixture("claude-list-needs-auth.txt"), 1)).toBeNull();
  expect(parseClaudeMcpList("doan-notion: something new\n", 0)).toBeNull();
  expect(parseClaudeMcpList("doan-notion: https://mcp.notion.com/mcp (SSE) - ✔ Connected\n", 0)).toBeNull();
});

test("codex mcp list --json: every server with its URL and sign-in, null for what it does not say", () => {
  const listed = JSON.parse(fixture("codex-list-connected.json"));
  const stdio = { name: "local", transport: { type: "stdio", command: "node" }, auth_status: "unsupported" };
  expect(codexMcpServers(JSON.stringify([...listed, stdio]))).toEqual([{ name: "doan-notion", url: "https://mcp.notion.com/mcp", authenticated: true }, { name: "local", url: null, authenticated: null }]);
  expect(codexMcpServers(fixture("codex-list-unregistered.json"))).toEqual([]);
});

test("codex mcp list --json: anything but a list of named servers is unreadable", () => {
  for (const text of ["", "{}", "[{}]", '[{"name":""}]', "not json"]) expect(codexMcpServers(text)).toBeNull();
});
