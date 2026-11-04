import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ConnectorStore } from "./store";

let dir: string;
const connectorsFile = () => join(dir, "mcp-connectors.json");
const pendingFile = () => join(dir, "mcp-connectors-pending.json");
const notion = { provider: "codex", name: "doan-notion", url: "https://mcp.notion.com/mcp" } as const;
const failingRename = { renameSync: () => { throw new Error("EACCES"); } };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "doan-mcp-store-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a missing connectors file reads as empty; a patch writes it whole and leaves no temporary file", () => {
  const store = new ConnectorStore(dir);
  expect(store.connectors()).toEqual({ ok: true, file: { v: 1, servers: [], everConnected: {} } });
  const added = store.patch({ add: { name: "doan-mcp-example-com", url: "https://mcp.example.com/mcp" } });
  expect(added).toEqual({ ok: true, file: { v: 1, servers: [{ name: "doan-mcp-example-com", url: "https://mcp.example.com/mcp" }], everConnected: {} } });
  expect(JSON.parse(readFileSync(connectorsFile(), "utf8"))).toEqual(added.ok && added.file);
  expect(readdirSync(dir)).toEqual(["mcp-connectors.json"]);
  expect(new ConnectorStore(dir).connectors()).toEqual(added);
});

test("an unreadable connectors file stays an error: patches are refused and the file is not replaced", () => {
  writeFileSync(connectorsFile(), "{not json");
  const store = new ConnectorStore(dir);
  expect(store.connectors()).toEqual({ ok: false, code: "broken" });
  expect(store.patch({ add: { name: "doan-mcp-example-com", url: "https://mcp.example.com/mcp" } })).toEqual({ ok: false, code: "broken" });
  expect(store.patch({ everConnected: { name: "doan-notion", provider: "claude", value: true } })).toEqual({ ok: false, code: "broken" });
  expect(readFileSync(connectorsFile(), "utf8")).toBe("{not json");
});

test("a connectors file from a newer Doan is never read or written", () => {
  writeFileSync(connectorsFile(), JSON.stringify({ v: 2, servers: [] }));
  const store = new ConnectorStore(dir);
  expect(store.connectors()).toEqual({ ok: false, code: "newer" });
  expect(store.patch({ add: { name: "doan-mcp-example-com", url: "https://mcp.example.com/mcp" } })).toEqual({ ok: false, code: "newer" });
  expect(JSON.parse(readFileSync(connectorsFile(), "utf8"))).toEqual({ v: 2, servers: [] });
});

test("a patch that does not apply is refused without a write", () => {
  const store = new ConnectorStore(dir);
  expect(store.patch({ remove: "doan-unknown" })).toEqual({ ok: false, code: "invalid" });
  expect(existsSync(connectorsFile())).toBe(false);
});

test("a failed write keeps the previous file and removes its temporary file", () => {
  const store = new ConnectorStore(dir);
  store.patch({ everConnected: { name: "doan-notion", provider: "claude", value: true } });
  const before = readFileSync(connectorsFile(), "utf8");
  const failing = new ConnectorStore(dir, { fs: failingRename });
  expect(failing.patch({ everConnected: { name: "doan-notion", provider: "codex", value: true } })).toEqual({ ok: false, code: "write_failed" });
  expect(readFileSync(connectorsFile(), "utf8")).toBe(before);
  expect(readdirSync(dir)).toEqual(["mcp-connectors.json"]);
});

test("a pending logout is recorded in its own file, blocks that server's Connect for that provider and clears", () => {
  const store = new ConnectorStore(dir);
  expect(store.record([notion])).toBe(true);
  expect(JSON.parse(readFileSync(pendingFile(), "utf8"))).toEqual({ v: 1, logouts: [notion] });
  expect(store.blocked("codex", "doan-notion")).toBe(true);
  expect(store.blocked("claude", "doan-notion")).toBe(false);
  expect(store.blocked("codex", "doan-figma")).toBe(false);
  expect(new ConnectorStore(dir).pending("codex")).toEqual([notion]);
  expect(store.clear("codex", "doan-notion")).toBe(true);
  expect(store.blocked("codex", "doan-notion")).toBe(false);
  expect(JSON.parse(readFileSync(pendingFile(), "utf8"))).toEqual({ v: 1, logouts: [] });
});

test("a pending record that cannot be written blocks in memory for this run only", () => {
  const failing = new ConnectorStore(dir, { fs: failingRename });
  expect(failing.record([notion])).toBe(false);
  expect(failing.blocked("codex", "doan-notion")).toBe(true);
  expect(failing.pending()).toEqual([notion]);
  expect(existsSync(pendingFile())).toBe(false);
  expect(new ConnectorStore(dir).blocked("codex", "doan-notion")).toBe(false);
});

test("a record whose removal cannot be written stays blocking, so a later Connect retries the logout first", () => {
  new ConnectorStore(dir).record([notion]);
  const failing = new ConnectorStore(dir, { fs: failingRename });
  expect(failing.clear("codex", "doan-notion")).toBe(false);
  expect(failing.blocked("codex", "doan-notion")).toBe(true);
});

test("an unreadable pending file is not replaced; new records block in memory", () => {
  writeFileSync(pendingFile(), "[]");
  const store = new ConnectorStore(dir);
  expect(store.pending()).toEqual([]);
  expect(store.record([notion])).toBe(false);
  expect(store.blocked("codex", "doan-notion")).toBe(true);
  expect(readFileSync(pendingFile(), "utf8")).toBe("[]");
});

test("pending records work while the connectors file is broken", () => {
  writeFileSync(connectorsFile(), "{not json");
  const store = new ConnectorStore(dir);
  expect(store.record([notion])).toBe(true);
  expect(store.blocked("codex", "doan-notion")).toBe(true);
});

test("an invalid pending record is refused", () => {
  const store = new ConnectorStore(dir);
  expect(store.record([{ provider: "codex", name: "notion", url: "https://mcp.notion.com/mcp" }])).toBe(false);
  expect(store.blocked("codex", "notion")).toBe(false);
  expect(existsSync(pendingFile())).toBe(false);
});
