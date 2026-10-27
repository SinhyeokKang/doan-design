import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSessionRecords, pickSession, sessionAvailability, SESSION_TAIL_BYTES } from "./sessions";
import { agentEnv } from "./environment";
import type { SessionRecord, AvailabilityFacts, UnavailableReason } from "./types";

const record: SessionRecord = { v: 1, at: "2026-10-27T00:00:00.000Z", root: "/repo", canvas: { id: "home", path: ".doan/canvases/home.html" }, hash: `sha256:${"a".repeat(64)}`, runtime: "claude", sessionId: "session-1", cwd: "/repo", configDir: "/profile/.claude" };
const facts: AvailabilityFacts = { cli: true, version: "2.1.310", sdkVersion: "0.3.310", root: "/repo", cwd: "/repo", configDir: "/profile/.claude", selectedConfigDir: "/profile/.claude", occupancy: "free", sessionExists: true };
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
    [{ sdkVersion: "9" }, "session_unavailable"], [{ occupancy: "occupied" }, "session_in_use"],
    [{ occupancy: "unknown" }, "session_unavailable"], [{ sessionExists: false }, "session_unavailable"],
    [{ cwd: "/repo2" }, "outside_root"], [{ cwd: "/outside/symlink-target" }, "outside_root"],
    [{ cwd: null }, "session_unavailable"], [{ root: null }, "session_unavailable"],
    [{ configDir: null }, "session_unavailable"], [{ selectedConfigDir: "/other-profile" }, "session_unavailable"],
  ];
  it.each(unavailableCases)("refuses unavailable facts %j", (patch, reason) => {
    expect(sessionAvailability(record, { ...facts, ...patch })).toBe(reason);
  });
  it("accepts verified in-root cwd and external config without relaxing version", () => {
    expect(sessionAvailability(record, { ...facts, cwd: "/repo/sub" })).toBeNull();
    const codex: SessionRecord = { ...record, runtime: "codex" };
    expect(sessionAvailability(codex, { ...facts, version: "0.163.0" })).toBeNull();
    expect(sessionAvailability(codex, { ...facts, version: "0.164.0" })).toBe("session_unavailable");
  });
  it("rejects empty session IDs via schema", () => {
    expect(parseSessionRecords(JSON.stringify({ ...record, runtime: "codex", sessionId: "" }))).toEqual([]);
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
