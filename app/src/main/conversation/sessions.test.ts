import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLAUDE_REGISTRY_FLOOR, CODEX_ROLLOUT_FLOOR, MINIMUM_VERSIONS, parseCliVersion, parseSessionRecords, pickSession, sessionAvailability, SESSION_TAIL_BYTES, storedVersionAtLeast, versionStatus } from "./sessions";
import { agentEnv } from "./environment";
import type { SessionRecord, AvailabilityFacts, UnavailableReason } from "./types";

const record: SessionRecord = { v: 1, at: "2026-10-27T00:00:00.000Z", root: "/repo", canvas: { id: "home", path: ".doan/canvases/home.html" }, hash: `sha256:${"a".repeat(64)}`, runtime: "claude", sessionId: "session-1", cwd: "/repo", configDir: "/profile/.claude" };
const facts: AvailabilityFacts = { cli: true, version: "2.1.312", root: "/repo", cwd: "/repo", configDir: "/profile/.claude", selectedConfigDir: "/profile/.claude", occupancy: "free", sessionExists: true };
describe("session records", () => {
  it("uses the shared schema and skips malformed, unknown and truncated records", () => {
    const text = [JSON.stringify(record), "broken", JSON.stringify({ ...record, v: 2 }), JSON.stringify({ ...record, configDir: undefined }), '{"v":1'].join("\n");
    expect(parseSessionRecords(text)).toEqual([record]);
    const literal = readFileSync(new URL("../../../../schema/fixtures/sessions/valid/canvas-literal-backslashes.json", import.meta.url), "utf8");
    expect(parseSessionRecords(JSON.stringify(JSON.parse(literal)))).toHaveLength(1);
  });
  it("drops the first partial tail line and bounds bytes", () => {
    expect(SESSION_TAIL_BYTES).toBeGreaterThan(0);
    expect(parseSessionRecords(`${JSON.stringify(record)}\n${JSON.stringify(record)}`, true)).toEqual([record]);
    expect(parseSessionRecords("x".repeat(SESSION_TAIL_BYTES + 1))).toEqual([]);
  });
  it("selects time before line order and resolves ties by later line", () => {
    const newer = { ...record, sessionId: "new", at: "2026-10-27T01:00:00.000Z" };
    const tie = { ...newer, sessionId: "tie" };
    expect(pickSession([newer, record, tie], "/repo", record.canvas, () => null)).toEqual({ available: true, record: tie });
  });
  it("follows canvas id across a move, isolates worktrees and never matches a replacement id", () => {
    expect(pickSession([record], "/repo", { id: "home", path: ".doan/canvases/moved.html" }, () => null).available).toBe(true);
    expect(pickSession([record], "/other", record.canvas, () => null)).toEqual({ available: false, reason: "no_record" });
    expect(pickSession([record], "/repo", { ...record.canvas, id: "replacement" }, () => null).available).toBe(false);
    expect(pickSession([record], "/repo", null, () => null).available).toBe(false);
  });
  it("uses path only for canvases without identity", () => {
    const plain = { ...record, canvas: { path: ".doan/canvases/home.html" } };
    expect(pickSession([plain], "/repo", plain.canvas, () => null).available).toBe(true);
    expect(pickSession([plain], "/repo", { path: ".doan/canvases/moved.html" }, () => null).available).toBe(false);
  });
  it("does not fall back from the latest valid but unavailable session", () => {
    const newest = { ...record, sessionId: "missing" };
    const checked: string[] = [];
    expect(pickSession([record, newest], "/repo", record.canvas, r => { checked.push(r.sessionId); return "session_unavailable"; })).toEqual({ available: false, reason: "session_unavailable" });
    expect(checked).toEqual(["missing"]);
  });
  const unavailableCases: [Partial<AvailabilityFacts>, UnavailableReason][] = [
    [{ cli: false }, "cli_missing"], [{ version: "9" }, "session_unavailable"],
    [{ version: "2.1.311" }, "session_unavailable"], [{ version: null }, "session_unavailable"], [{ occupancy: "occupied" }, "session_in_use"],
    [{ occupancy: "unknown" }, "session_unavailable"], [{ sessionExists: false }, "session_unavailable"],
    [{ cwd: "/repo2" }, "outside_root"], [{ cwd: "/outside/symlink-target" }, "outside_root"],
    [{ cwd: null }, "session_unavailable"], [{ root: null }, "session_unavailable"],
    [{ configDir: null }, "session_unavailable"], [{ selectedConfigDir: "/other-profile" }, "session_unavailable"],
  ];
  it.each(unavailableCases)("refuses unavailable facts %j", (patch, reason) => {
    expect(sessionAvailability(record, { ...facts, ...patch })).toBe(reason);
  });
  it("accepts verified in-root cwd and external config at or above the minimum version", () => {
    expect(sessionAvailability(record, { ...facts, cwd: "/repo/sub" })).toBeNull();
    expect(sessionAvailability(record, { ...facts, version: "2.1.400" })).toBeNull();
    const codex: SessionRecord = { ...record, runtime: "codex" };
    expect(sessionAvailability(codex, { ...facts, version: "0.164.0" })).toBeNull();
    expect(sessionAvailability(codex, { ...facts, version: "0.170.0" })).toBeNull();
    expect(sessionAvailability(codex, { ...facts, version: "0.163.0" })).toBe("session_unavailable");
  });
  it("rejects empty session IDs via schema", () => {
    expect(parseSessionRecords(JSON.stringify({ ...record, runtime: "codex", sessionId: "" }))).toEqual([]);
  });
});

describe("agent CLI versions", () => {
  it("reads the first x.y.z of each provider's real --version output as its core", () => {
    expect(parseCliVersion("2.1.312 (Claude Code)")).toEqual({ core: "2.1.312", installed: "2.1.312" });
    expect(parseCliVersion("codex-cli 0.164.0\n")).toEqual({ core: "0.164.0", installed: "0.164.0" });
    expect(parseCliVersion("2026.10.22-27dcf5f\n")).toEqual({ core: "2026.10.22", installed: "2026.10.22-27dcf5f" });
    expect(parseCliVersion("GitHub Copilot CLI 1.0.105.\n")).toEqual({ core: "1.0.105", installed: "1.0.105" });
  });
  it("keeps a suffix in the installed version but never in the core", () => {
    expect(parseCliVersion("2.1.400-beta.1")).toEqual({ core: "2.1.400", installed: "2.1.400-beta.1" });
    expect(parseCliVersion("0.170.0+build.7")).toEqual({ core: "0.170.0", installed: "0.170.0+build.7" });
    expect(parseCliVersion("2026.10.22")).toEqual({ core: "2026.10.22", installed: "2026.10.22" });
    // The first match wins, even when a banner line names another version.
    expect(parseCliVersion("node 22.1.0\ncodex-cli 0.164.0")).toMatchObject({ core: "22.1.0" });
    expect(parseCliVersion("Claude Code")).toBeNull();
    expect(parseCliVersion("")).toBeNull();
  });
  it.each([
    ["claude", "2.1.311 (Claude Code)", "unsupported"], ["claude", "2.1.312 (Claude Code)", "supported"], ["claude", "2.1.400 (Claude Code)", "supported"], ["claude", "3.0.0", "supported"],
    ["codex", "codex-cli 0.162.0", "unsupported"], ["codex", "codex-cli 0.164.0", "supported"], ["codex", "codex-cli 0.170.0", "supported"], ["codex", "codex-cli 1.0.0", "supported"],
    ["cursor", "2026.10.21-0aa1111", "unsupported"], ["cursor", "2026.10.22-0aa1111", "supported"], ["cursor", "2026.10.23-0aa1111", "supported"], ["cursor", "2026.10.22", "supported"],
    ["copilot", "GitHub Copilot CLI 1.0.104.", "unsupported"], ["copilot", "GitHub Copilot CLI 1.0.105.", "supported"], ["copilot", "GitHub Copilot CLI 1.0.106.", "supported"],
    ["codex", "codex-cli 0.99.0", "unsupported"], ["copilot", "1.0.99", "unsupported"], ["copilot", "1.0.1000", "supported"],
    ["claude", "2.1.311-beta.9", "unsupported"], ["claude", "2.1.312-beta.1", "supported"],
    ["codex", "codex-cli", "unknown"], ["cursor", "", "unknown"], ["copilot", "1.0", "unknown"],
  ] as const)("compares %s %j numerically with its minimum: %s", (provider, output, status) => {
    expect(versionStatus(provider, output)).toBe(status);
  });
  it("keeps the verified minimums and floors where the session evidence needs them", () => {
    expect(MINIMUM_VERSIONS).toEqual({ claude: "2.1.312", codex: "0.164.0", cursor: "2026.10.22", copilot: "1.0.105" });
    // A floor never follows a raised minimum: raising one abandons conversations the older versions made.
    expect(storedVersionAtLeast(MINIMUM_VERSIONS.codex, CODEX_ROLLOUT_FLOOR)).toBe(true);
    expect(storedVersionAtLeast(MINIMUM_VERSIONS.claude, CLAUDE_REGISTRY_FLOOR)).toBe(true);
    expect(CODEX_ROLLOUT_FLOOR).toBe("0.163.0"); expect(CLAUDE_REGISTRY_FLOOR).toBe("2.1.312");
  });
  it.each([
    ["0.163.0", true], ["0.164.0", true], ["0.170.0", true], ["1.0.0", true], ["0.164.0-alpha.2", true],
    ["0.162.0", false], ["0.99.0", false], ["v0.164.0", false], ["0.164.0 x", false], [" 0.164.0", false], ["0.164", false], ["0.164.0+build", false], ["", false], [164, false], [null, false], [undefined, false],
  ] as const)("accepts a stored version %j against the floor only as a whole x.y.z[-suffix]: %s", (value, accepted) => {
    expect(storedVersionAtLeast(value, "0.163.0")).toBe(accepted);
  });
});

describe("agent environment", () => {
  const probe = { env: { HOME: "/home/test", PATH: "/bin", KEEP: "yes", CLAUDE_CODE_SESSION_ID: "old", CODEX_THREAD_ID: "old", CODEX_SESSION_ID: "old" }, path: "/tools:/bin", configDir: "/profile/.claude" };
  it("removes inherited identities and uses verified cwd, current profile and app runtime", () => {
    const result = agentEnv(probe, record.runtime, "/data/runtime.json", { root: "/repo", cwd: "/repo/sub", configDir: probe.configDir });
    expect(result).toEqual({ cwd: "/repo/sub", env: { HOME: "/home/test", PATH: "/tools:/bin", KEEP: "yes", CLAUDE_CONFIG_DIR: probe.configDir, DOAN_RUNTIME: "/data/runtime.json" } });
    expect(probe.env.CODEX_THREAD_ID).toBe("old");
  });
  it.each(["relative", "/bad\0path", ""])('refuses invalid app runtime %j', path => {
    expect(agentEnv(probe, "claude", path, { root: "/repo", cwd: "/repo", configDir: probe.configDir })).toBeNull();
  });
  it("refuses missing, outside and profile-mismatched verified facts", () => {
    for (const patch of [{ cwd: null }, { cwd: "/repo2" }, { configDir: "/other" }, { root: null }]) {
      expect(agentEnv(probe, "claude", "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir: probe.configDir, ...patch })).toBeNull();
    }
  });
  it("sets the Codex profile without adding permission policy", () => {
    const result = agentEnv({ ...probe, configDir: "/profile/.codex" }, "codex", "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir: "/profile/.codex" });
    expect(result?.env.CODEX_HOME).toBe("/profile/.codex");
    expect(result?.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  });
});
