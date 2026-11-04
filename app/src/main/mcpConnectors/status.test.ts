import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseClaudeMcpGet, parseCodexMcpList } from "./status";

// Outputs from the 2026-11-04 PoC (Claude Code 2.1.318, Codex 0.166.0), with the server name set to doan-notion.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("claude mcp get: an unknown name exits 1 and reads as not registered", () => {
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-unregistered.txt"), 1)).toEqual({ registered: false });
});

test("claude mcp get: Needs authentication, before a first sign-in or after a logout, reads as registered and signed out", () => {
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-needs-auth.txt"), 0)).toEqual({ registered: true, authenticated: false });
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-after-logout.txt"), 0)).toEqual({ registered: true, authenticated: false });
});

test("claude mcp get: Connected reads as registered and signed in", () => {
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-connected.txt"), 0)).toEqual({ registered: true, authenticated: true });
  expect(parseClaudeMcpGet("doan-atlassian", fixture("claude-get-atlassian-connected.txt"), 0)).toEqual({ registered: true, authenticated: true });
});

test("claude mcp get: another server's block, an unknown status, a failed exit or anything else is unreadable", () => {
  expect(parseClaudeMcpGet("doan-figma", fixture("claude-get-connected.txt"), 0)).toBeNull();
  expect(parseClaudeMcpGet("doan-figma", fixture("claude-get-unregistered.txt"), 1)).toBeNull();
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-connected.txt").replace("✔ Connected", "✘ Failed to connect"), 0)).toBeNull();
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-connected.txt"), 1)).toBeNull();
  expect(parseClaudeMcpGet("doan-notion", fixture("claude-get-unregistered.txt"), 0)).toBeNull();
  expect(parseClaudeMcpGet("doan-notion", "", 0)).toBeNull();
  expect(parseClaudeMcpGet("doan-notion", "Error: something else", 1)).toBeNull();
});

test("codex mcp list --json: each server with whether it is signed in", () => {
  expect(parseCodexMcpList(fixture("codex-list-unregistered.json"))).toEqual([]);
  expect(parseCodexMcpList(fixture("codex-list-needs-auth.json"))).toEqual([{ name: "doan-notion", authenticated: false }]);
  expect(parseCodexMcpList(fixture("codex-list-after-logout.json"))).toEqual([{ name: "doan-notion", authenticated: false }]);
  expect(parseCodexMcpList(fixture("codex-list-connected.json"))).toEqual([{ name: "doan-notion", authenticated: true }]);
});

test("codex mcp list --json: an auth status Doan does not know leaves that server unknown rather than signed out", () => {
  const list = JSON.parse(fixture("codex-list-connected.json")) as Record<string, unknown>[];
  const text = JSON.stringify([{ ...list[0], auth_status: "bearer_token" }, { ...list[0], name: "notion", auth_status: "unsupported" }]);
  expect(parseCodexMcpList(text)).toEqual([{ name: "doan-notion", authenticated: null }, { name: "notion", authenticated: null }]);
});

test("codex mcp list --json: anything but an array of named servers is unreadable", () => {
  for (const text of ["", "{", "{}", "null", "[1]", '[{"auth_status":"o_auth"}]', '[{"name":"","auth_status":"o_auth"}]'])
    expect(parseCodexMcpList(text), text).toBeNull();
});
