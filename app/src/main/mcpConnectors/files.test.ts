import { describe, expect, test } from "vitest";
import { parseConnectorUrl } from "./names";
import { EMPTY_CONNECTORS, EMPTY_PENDING, parseConnectorsFile, parsePendingLogouts, patchConnectors, patchPendingLogouts, type ConnectorsFile } from "./files";

// `<userData>/mcp-connectors.json` and `<userData>/mcp-connectors-pending.json` (mcp-connectors design '포맷 변경'): only
// TS reads and writes them, so these tests are their schema.

const example = { name: "doan-example-com", url: "https://example.com/mcp" };
const file = (value: unknown) => JSON.stringify(value);

describe("mcp-connectors.json", () => {
  test("no file reads as no URL servers and nothing connected yet", () => {
    expect(parseConnectorsFile(null)).toEqual({ ok: true, file: EMPTY_CONNECTORS });
    expect(EMPTY_CONNECTORS).toEqual({ v: 1, servers: [], everConnected: {} });
  });

  test("URL servers and per-provider everConnected, presets included, read back as written", () => {
    const value: ConnectorsFile = { v: 1, servers: [example, { name: "doan-example-com-2", url: "https://example.com/other" }], everConnected: { "doan-notion": ["claude", "codex"], "doan-example-com": ["codex"] } };
    expect(parseConnectorsFile(file(value))).toEqual({ ok: true, file: value });
  });

  // An unreadable file is not read as defaults: provider registrations stay behind, so an empty list would drift
  // from them (design 'store').
  test.each([
    ["an empty file", ""],
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["no v", file({ servers: [], everConnected: {} })],
    ["v 0", file({ v: 0, servers: [], everConnected: {} })],
    ["a fractional v", file({ v: 1.5, servers: [], everConnected: {} })],
    ["v as a string", file({ v: "1", servers: [], everConnected: {} })],
  ])("%s is broken", (_, text) => {
    expect(parseConnectorsFile(text)).toEqual({ ok: false, code: "broken" });
  });

  test("a later v is newer and never read", () => {
    expect(parseConnectorsFile(file({ v: 2, servers: "anything" }))).toEqual({ ok: false, code: "newer" });
  });

  test.each([
    ["no servers", { v: 1, everConnected: {} }],
    ["no everConnected", { v: 1, servers: [] }],
    ["an unknown field", { v: 1, servers: [], everConnected: {}, extra: 1 }],
    ["a server with an extra field", { v: 1, servers: [{ ...example, label: "x" }], everConnected: {} }],
    ["a server name without doan-", { v: 1, servers: [{ name: "example", url: example.url }], everConnected: {} }],
    ["a server name over 16 slug characters", { v: 1, servers: [{ name: "doan-abcdefghijklmnopq", url: example.url }], everConnected: {} }],
    ["a server under a preset name", { v: 1, servers: [{ name: "doan-notion", url: example.url }], everConnected: {} }],
    ["a server at a preset URL", { v: 1, servers: [{ name: "doan-mcp-notion-com", url: "https://mcp.notion.com/mcp" }], everConnected: {} }],
    ["an http URL", { v: 1, servers: [{ ...example, url: "http://example.com/mcp" }], everConnected: {} }],
    ["a URL not in normalized form", { v: 1, servers: [{ ...example, url: "https://Example.com/mcp/" }], everConnected: {} }],
    ["two servers with one name", { v: 1, servers: [example, { ...example, url: "https://example.com/b" }], everConnected: {} }],
    ["two servers with one URL", { v: 1, servers: [example, { ...example, name: "doan-example-com-2" }], everConnected: {} }],
    ["everConnected for an unknown server", { v: 1, servers: [], everConnected: { "doan-example-com": ["codex"] } }],
    ["everConnected for an unsupported provider", { v: 1, servers: [], everConnected: { "doan-notion": ["cursor"] } }],
    ["everConnected with a repeated provider", { v: 1, servers: [], everConnected: { "doan-notion": ["codex", "codex"] } }],
    ["everConnected with no provider", { v: 1, servers: [], everConnected: { "doan-notion": [] } }],
  ])("%s is broken", (_, value) => {
    expect(parseConnectorsFile(file(value))).toEqual({ ok: false, code: "broken" });
  });

  test("adding a URL server appends it; a taken name or URL, a preset's, or a malformed server is refused", () => {
    const added = patchConnectors(EMPTY_CONNECTORS, { add: example });
    expect(added).toEqual({ v: 1, servers: [example], everConnected: {} });
    expect(patchConnectors(added!, { add: { name: "doan-example-com-2", url: "https://example.com/b" } })?.servers).toEqual([example, { name: "doan-example-com-2", url: "https://example.com/b" }]);
    for (const server of [
      { name: "doan-example-com", url: "https://example.com/b" }, { name: "doan-example-com-2", url: example.url },
      { name: "doan-notion", url: "https://example.com/b" }, { name: "doan-mcp-notion-com", url: "https://mcp.notion.com/mcp" },
      { name: "example", url: "https://example.com/b" }, { name: "doan-x", url: "https://Example.com/b" }, { name: "doan-x", url: " https://example.com/b" },
    ]) expect(patchConnectors(added!, { add: server }), JSON.stringify(server)).toBeNull();
  });

  test("removing a URL server drops it and its everConnected; a preset or an unknown name is refused", () => {
    const current: ConnectorsFile = { v: 1, servers: [example], everConnected: { "doan-example-com": ["claude"], "doan-notion": ["codex"] } };
    expect(patchConnectors(current, { remove: "doan-example-com" })).toEqual({ v: 1, servers: [], everConnected: { "doan-notion": ["codex"] } });
    expect(patchConnectors(current, { remove: "doan-notion" })).toBeNull();
    expect(patchConnectors(current, { remove: "doan-other" })).toBeNull();
  });

  test("everConnected is set and cleared per provider, for presets and URL servers alike", () => {
    let current: ConnectorsFile | null = { v: 1, servers: [example], everConnected: {} };
    current = patchConnectors(current, { everConnected: { name: "doan-notion", provider: "codex", value: true } });
    current = patchConnectors(current!, { everConnected: { name: "doan-notion", provider: "claude", value: true } });
    current = patchConnectors(current!, { everConnected: { name: "doan-example-com", provider: "codex", value: true } });
    // Providers keep one order whatever order they connected in, and a repeat changes nothing.
    current = patchConnectors(current!, { everConnected: { name: "doan-notion", provider: "codex", value: true } });
    expect(current!.everConnected).toEqual({ "doan-notion": ["claude", "codex"], "doan-example-com": ["codex"] });
    current = patchConnectors(current!, { everConnected: { name: "doan-notion", provider: "claude", value: false } });
    current = patchConnectors(current!, { everConnected: { name: "doan-example-com", provider: "codex", value: false } });
    expect(current!.everConnected).toEqual({ "doan-notion": ["codex"] });
    expect(patchConnectors(current!, { everConnected: { name: "doan-other", provider: "codex", value: true } })).toBeNull();
  });

  // Normalization drops one trailing slash, so a URL typed with two is stored with one; storing must not normalize it
  // again (BA review 🟡1).
  test("every URL parseConnectorUrl returns can be added and read back, including one that keeps a trailing slash", () => {
    for (const text of ["https://example.com/mcp//", "https://example.com", "HTTPS://Example.COM:443/a/?b=1", "https://example.com/a%20b"]) {
      const read = parseConnectorUrl(text);
      if (!read.ok) throw new Error(text);
      const added = patchConnectors(EMPTY_CONNECTORS, { add: { name: "doan-example-com", url: read.url } });
      expect(added, text).toEqual({ v: 1, servers: [{ name: "doan-example-com", url: read.url }], everConnected: {} });
      expect(parseConnectorsFile(JSON.stringify(added)), text).toEqual({ ok: true, file: added });
    }
  });

  test("a patched file reads back as the same file", () => {
    const patched = patchConnectors(patchConnectors(EMPTY_CONNECTORS, { add: example })!, { everConnected: { name: "doan-example-com", provider: "claude", value: true } })!;
    expect(parseConnectorsFile(JSON.stringify(patched))).toEqual({ ok: true, file: patched });
  });
});

describe("mcp-connectors-pending.json", () => {
  const notion = { provider: "codex" as const, name: "doan-notion", url: "https://mcp.notion.com/mcp" };

  test("no file reads as no pending logouts", () => {
    expect(parsePendingLogouts(null)).toEqual({ ok: true, file: EMPTY_PENDING });
    expect(EMPTY_PENDING).toEqual({ v: 1, logouts: [] });
  });

  test("a pending logout keeps its provider, server name and the URL the provider registered, as written", () => {
    // The URL is the one the provider's keychain key came from, so it is kept verbatim rather than normalized.
    const value = { v: 1, logouts: [notion, { provider: "claude", name: "doan-example-com", url: "https://Example.com/mcp/" }] };
    expect(parsePendingLogouts(file(value))).toEqual({ ok: true, file: value });
  });

  test.each([
    ["an empty file", ""],
    ["not JSON", "nope"],
    ["no v", file({ logouts: [] })],
    ["v 0", file({ v: 0, logouts: [] })],
    ["no logouts", file({ v: 1 })],
    ["an unknown field", file({ v: 1, logouts: [], extra: true })],
    ["an entry with an extra field", file({ v: 1, logouts: [{ ...notion, token: "x" }] })],
    ["an unsupported provider", file({ v: 1, logouts: [{ ...notion, provider: "cursor" }] })],
    ["a name without doan-", file({ v: 1, logouts: [{ ...notion, name: "notion" }] })],
    ["an http URL", file({ v: 1, logouts: [{ ...notion, url: "http://mcp.notion.com/mcp" }] })],
    ["a URL with a newline", file({ v: 1, logouts: [{ ...notion, url: "https://mcp.notion.com/m\ncp" }] })],
    ["one server twice for a provider", file({ v: 1, logouts: [notion, { ...notion, url: "https://mcp.notion.com/v2" }] })],
  ])("%s is broken", (_, text) => {
    expect(parsePendingLogouts(text)).toEqual({ ok: false, code: "broken" });
  });

  test("a later v is newer", () => {
    expect(parsePendingLogouts(file({ v: 2, logouts: "x" }))).toEqual({ ok: false, code: "newer" });
  });

  test("adding records each server once per provider, a newer URL replacing the old; removing drops one entry", () => {
    const claude = { ...notion, provider: "claude" as const };
    let current = patchPendingLogouts(EMPTY_PENDING, { add: [notion, claude] });
    expect(current).toEqual({ v: 1, logouts: [notion, claude] });
    current = patchPendingLogouts(current!, { add: [{ ...notion, url: "https://mcp.notion.com/v2" }] });
    expect(current).toEqual({ v: 1, logouts: [{ ...notion, url: "https://mcp.notion.com/v2" }, claude] });
    expect(patchPendingLogouts(current!, { remove: { provider: "codex", name: "doan-notion" } })).toEqual({ v: 1, logouts: [claude] });
    // Removing what is not recorded changes nothing.
    expect(patchPendingLogouts(current!, { remove: { provider: "codex", name: "doan-figma" } })).toEqual(current);
  });

  test("a malformed entry is refused rather than recorded", () => {
    for (const entry of [{ ...notion, name: "notion" }, { ...notion, provider: "cursor" }, { ...notion, url: "http://x" }])
      expect(patchPendingLogouts(EMPTY_PENDING, { add: [entry as typeof notion] })).toBeNull();
  });
});
