import { describe, expect, test } from "vitest";
import { codexServerToml, mcpLogoutOutcome, mcpLogoutPlan, plaintextLeftovers, reconcilePlan, type McpLogoutInput } from "./plans";

describe("reconcilePlan", () => {
  const file = { v: 1 as const, servers: [{ name: "doan-example-com", url: "https://example.com/mcp" }], everConnected: {} };

  test("only doan- registrations that are neither a preset nor a URL server in the file are removed", () => {
    expect(reconcilePlan(["doan-notion", "doan-figma", "doan-example-com", "doan-removed-com", "doan-old"], { ok: true, file })).toEqual(["doan-removed-com", "doan-old"]);
  });

  test("the person's terminal servers are never targets, whatever their name", () => {
    expect(reconcilePlan(["notion", "notion-poc", "figma", "doan", "Doan-x", "mcp-doan-x"], { ok: true, file })).toEqual([]);
  });

  test("nothing is removed while the file cannot be read or was written by a later Doan", () => {
    expect(reconcilePlan(["doan-removed-com"], { ok: false, code: "broken" })).toEqual([]);
    expect(reconcilePlan(["doan-removed-com"], { ok: false, code: "newer" })).toEqual([]);
  });

  test("a missing registration is not added back", () => {
    expect(reconcilePlan([], { ok: true, file })).toEqual([]);
  });
});

describe("mcpLogoutPlan and mcpLogoutOutcome", () => {
  const servers = ["doan-notion", "doan-example-com", "notion"];
  const input = (patch: Partial<McpLogoutInput>): McpLogoutInput => ({ provider: "codex", kind: "signOut", previousAccountId: null, nextAccountId: null, servers, ...patch });

  test("Codex sign-out logs every doan- server out of the live profile first; a failure is recorded and its live registration removed", () => {
    const signOut = input({});
    expect(mcpLogoutPlan(signOut)).toEqual({ logout: ["doan-notion", "doan-example-com"] });
    expect(mcpLogoutOutcome(signOut, [])).toEqual({ register: [], record: [], unregister: [] });
    expect(mcpLogoutOutcome(signOut, ["doan-example-com"])).toEqual({ register: [], record: ["doan-example-com"], unregister: ["doan-example-com"] });
  });

  test("Claude sign-out adds no MCP step: claude auth logout already clears its MCP tokens", () => {
    const signOut = input({ provider: "claude", previousAccountId: "acct-1" });
    expect(mcpLogoutPlan(signOut)).toEqual({ logout: [] });
    expect(mcpLogoutOutcome(signOut, [])).toEqual({ register: [], record: [], unregister: [] });
  });

  test("a Codex replacement logs the previous profile out and registers only the servers whose logout succeeded", () => {
    const replace = input({ kind: "replace" });
    expect(mcpLogoutPlan(replace)).toEqual({ logout: ["doan-notion", "doan-example-com"] });
    expect(mcpLogoutOutcome(replace, [])).toEqual({ register: ["doan-notion", "doan-example-com"], record: [], unregister: [] });
    expect(mcpLogoutOutcome(replace, ["doan-notion"])).toEqual({ register: ["doan-example-com"], record: ["doan-notion"], unregister: [] });
  });

  test("Codex stores no account id, so every replacement logs out", () => {
    expect(mcpLogoutPlan(input({ kind: "replace", previousAccountId: null, nextAccountId: null })).logout).toHaveLength(2);
  });

  test("a Claude replacement to another account logs the live profile out after commit; it keeps its registrations", () => {
    const replace = input({ provider: "claude", kind: "replace", previousAccountId: "acct-1", nextAccountId: "acct-2" });
    expect(mcpLogoutPlan(replace)).toEqual({ logout: ["doan-notion", "doan-example-com"] });
    expect(mcpLogoutOutcome(replace, ["doan-notion"])).toEqual({ register: [], record: ["doan-notion"], unregister: [] });
  });

  test("a replacement with the same account has no MCP step; a Codex staging profile still gets every registration", () => {
    const claude = input({ provider: "claude", kind: "replace", previousAccountId: "acct-1", nextAccountId: "acct-1" });
    expect(mcpLogoutPlan(claude)).toEqual({ logout: [] });
    expect(mcpLogoutOutcome(claude, [])).toEqual({ register: [], record: [], unregister: [] });
    const codex = input({ kind: "replace", previousAccountId: "acct-1", nextAccountId: "acct-1" });
    expect(mcpLogoutPlan(codex)).toEqual({ logout: [] });
    expect(mcpLogoutOutcome(codex, [])).toEqual({ register: ["doan-notion", "doan-example-com"], record: [], unregister: [] });
  });

  test("an unknown account on either side counts as a different account", () => {
    expect(mcpLogoutPlan(input({ provider: "claude", kind: "replace", previousAccountId: "acct-1", nextAccountId: null })).logout).toHaveLength(2);
    expect(mcpLogoutPlan(input({ provider: "claude", kind: "replace", previousAccountId: null, nextAccountId: "acct-1" })).logout).toHaveLength(2);
  });

  test("a failure reported for a server that was not logged out is ignored", () => {
    expect(mcpLogoutOutcome(input({}), ["notion", "doan-other"])).toEqual({ register: [], record: [], unregister: [] });
  });
});

describe("codexServerToml", () => {
  test("writes one [mcp_servers.<name>] block with the URL as its href", () => {
    expect(codexServerToml("doan-notion", "https://mcp.notion.com/mcp")).toBe('[mcp_servers.doan-notion]\nurl = "https://mcp.notion.com/mcp"\n');
    expect(codexServerToml("doan-example-com", "https://example.com")).toBe('[mcp_servers.doan-example-com]\nurl = "https://example.com/"\n');
  });

  test("escapes what the URL serializer leaves in place", () => {
    expect(codexServerToml("doan-example-com", "https://example.com/a\\b?q=\"x\"")).toBe('[mcp_servers.doan-example-com]\nurl = "https://example.com/a/b?q=%22x%22"\n');
    expect(codexServerToml("doan-example-com", "https://example.com/'a'?b=`c`")).toBe('[mcp_servers.doan-example-com]\nurl = "https://example.com/\'a\'?b=`c`"\n');
  });

  test("refuses a name outside doan- or a URL that is not https", () => {
    for (const [name, url] of [["notion", "https://mcp.notion.com/mcp"], ["doan-x]\n[y", "https://example.com"], ["doan-x", "http://example.com"], ["doan-x", "not a url"]])
      expect(() => codexServerToml(name!, url!), `${name} ${url}`).toThrow();
  });
});

describe("plaintextLeftovers", () => {
  test("Claude's plaintext credential file is to be removed; Codex is forced to the keyring and has none", () => {
    expect(plaintextLeftovers("claude", [".credentials.json", ".claude.json", "settings.json"])).toEqual([".credentials.json"]);
    expect(plaintextLeftovers("claude", [".claude.json"])).toEqual([]);
    expect(plaintextLeftovers("codex", ["auth.json", ".credentials.json", "config.toml"])).toEqual([]);
  });
});
