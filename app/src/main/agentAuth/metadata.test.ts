import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseAuthMetadata, serializeAuthMetadata, validOwner } from "./metadata";
import type { AuthMetadata } from "./types";

const fixture = readFileSync(new URL("./fixtures/metadata-v1.json", import.meta.url), "utf8");
const valid = (): AuthMetadata => JSON.parse(fixture) as AuthMetadata;
const failedFixture = readFileSync(new URL("./fixtures/metadata-v1-sign-out-failed.json", import.meta.url), "utf8");
const parse = (value: unknown) => parseAuthMetadata(typeof value === "string" ? value : JSON.stringify(value));

describe("device-local auth metadata v1", () => {
  it("reads the fixture into one connection per provider", () => {
    const result = parseAuthMetadata(fixture);
    expect(result).toEqual({ ok: true, metadata: valid() });
    if (!result.ok) throw new Error(result.code);
    expect(result.metadata.accounts.map(c => [c.provider, c.connectionId, c.profile])).toEqual([["claude", "conn-claude-1", "claude"], ["cursor", "conn-cursor-1", "cursor"]]);
  });
  it("round-trips through serialization", () => {
    const text = serializeAuthMetadata(valid());
    expect(parseAuthMetadata(text)).toEqual({ ok: true, metadata: valid() });
    expect(serializeAuthMetadata({ v: 1, accounts: [] })).toBe('{"v":1,"accounts":[]}');
  });
  it("keeps a failed sign-out with its connection so it still blocks runs after a restart", () => {
    const result = parseAuthMetadata(failedFixture);
    expect(result).toEqual({ ok: true, metadata: JSON.parse(failedFixture) });
    if (!result.ok) throw new Error(result.code);
    expect(result.metadata.signOutFailed).toEqual(["cursor"]);
    expect(parseAuthMetadata(serializeAuthMetadata(result.metadata))).toEqual(result);
  });
  it.each([
    ["not a list", { signOutFailed: "cursor" }],
    ["unknown provider", { signOutFailed: ["gemini"] }],
    ["provider without a connection", { signOutFailed: ["copilot"] }],
    ["duplicate provider", { signOutFailed: ["cursor", "cursor"] }],
  ])("rejects a failed sign-out list that is %s", (_name, over) => {
    const metadata = { ...valid(), ...over };
    expect(parse(metadata)).toEqual({ ok: false, code: "invalid" });
    expect(() => serializeAuthMetadata(metadata as AuthMetadata)).toThrow("Invalid auth metadata");
  });
  it("separates unknown versions from corrupt files", () => {
    expect(parse({ ...valid(), v: 2 })).toEqual({ ok: false, code: "unknown_version" });
    expect(parse({ accounts: [] })).toEqual({ ok: false, code: "unknown_version" });
    for (const text of ["", "broken", fixture.slice(0, fixture.length / 2)]) expect(parse(text)).toEqual({ ok: false, code: "corrupt" });
    for (const value of [null, [], "text"]) expect(parse(value)).toEqual({ ok: false, code: "corrupt" });
  });
  it.each([
    ["duplicate provider", (m: any) => { m.accounts[1].provider = "claude"; }],
    ["duplicate connection", (m: any) => { m.accounts[1].connectionId = "conn-claude-1"; }],
    ["duplicate profile", (m: any) => { m.accounts[1].profile = "claude"; }],
    ["unknown provider", (m: any) => { m.accounts[0].provider = "gemini"; }],
    ["profile path", (m: any) => { m.accounts[0].profile = "/Users/ada/.claude"; }],
    ["token field", (m: any) => { m.accounts[0].token = "sk-ant-x"; }],
    ["account secret", (m: any) => { m.accounts[0].account.refreshToken = "r"; }],
    ["top-level extra", (m: any) => { m.verifier = "v"; }],
    ["missing account", (m: any) => { delete m.accounts[0].account; }],
    ["missing workspace", (m: any) => { delete m.accounts[0].account.workspace; }],
    ["long email", (m: any) => { m.accounts[0].account.email = "a".repeat(513); }],
    ["NUL display name", (m: any) => { m.accounts[0].account.displayName = "a\0"; }],
    ["accounts not array", (m: any) => { m.accounts = {}; }],
  ])("rejects an invalid document: %s", (_name, mutate) => {
    const metadata = valid(); mutate(metadata);
    expect(parse(metadata)).toEqual({ ok: false, code: "invalid" });
    expect(() => serializeAuthMetadata(metadata)).toThrow("Invalid auth metadata");
  });
});

describe("conversation owner", () => {
  it("accepts the legacy marker and complete doan owners only", () => {
    expect(validOwner({ kind: "legacy-external" })).toBe(true);
    const doan = { kind: "doan", provider: "copilot", connectionId: "conn-1", accountId: null, workspaceId: null, profile: "copilot" };
    expect(validOwner(doan)).toBe(true);
    for (const value of [{ kind: "legacy-external", provider: "claude" }, { ...doan, token: "x" }, { ...doan, provider: "gemini" }, { ...doan, profile: "/p" },
      { ...doan, connectionId: "" }, { ...doan, accountId: 1 }, { kind: "external" }, null]) expect(validOwner(value)).toBe(false);
    const { workspaceId: _omitted, ...missing } = doan;
    expect(validOwner(missing)).toBe(false);
  });
});

describe("serialized fixtures", () => {
  it("carry no tokens, auth codes, verifiers or credential locations", () => {
    const sources = [new URL("./fixtures/", import.meta.url), new URL("../conversation/fixtures/", import.meta.url)];
    const files = sources.flatMap(dir => readdirSync(dir).filter(name => /^(metadata|index)-.*\.json$/.test(name)).map(name => readFileSync(new URL(name, dir), "utf8")));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const text of files) {
      expect(text).not.toMatch(/token|secret|password|verifier|"code"|credential|refresh|bearer|api[_-]?key|sk-|auth\.json|hosts\.yml|\/Users\//i);
    }
  });
});
