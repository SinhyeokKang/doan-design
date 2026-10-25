import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { linkState, stubState, mcpState, parseShellProbe, findOnPath, pathIncludes, rcFileFor, isTranslocated, mcpAddArgs, mcpRemoveArgs, initArgs } from "./states";
import type { CliRun } from "../folderState";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const run = (stdout: string, overrides: Partial<CliRun> = {}) => ({ stdout, stderr: "", exitCode: 0, timedOut: false, ...overrides });

describe("linkState", () => {
  test("recognizes existing targets by canonical identity, including relative links and case aliases", () => {
    expect(linkState({ kind: "symlink" }, { value: "../../.agents/skills/doan", resolved: "/home/.agents/skills/doan" }, "/home/.agents/skills/doan")).toBe("ours");
    expect(linkState({ kind: "symlink" }, { value: "/APP/DOAN", resolved: "/app/doan" }, "/app/doan")).toBe("ours");
  });
  test("never calls a broken link missing or ours", () => {
    expect(linkState({ kind: "symlink" }, { value: "/gone", resolved: null, resolutionError: "ENOENT" }, "/gone")).toBe("dangling");
    expect(linkState({ kind: "symlink" }, { value: "/other", resolved: "/other" }, "/expected")).toBe("link-other");
  });
  test.each(["ELOOP", "EACCES", "ENOTDIR"])("does not diagnose %s as a missing target", resolutionError => {
    expect(linkState({ kind: "symlink" }, { value: "/other", resolved: null, resolutionError }, "/expected")).toBe("link-other");
  });
  test("blocks nonlinks, unreadable links and unsafe parents", () => {
    for (const kind of ["file", "directory", "other"] as const) expect(linkState({ kind }, null, "/app")).toBe("blocked");
    for (const code of ["ENOTDIR", "ELOOP", "EACCES"]) expect(linkState({ kind: "error", code }, null, "/app")).toBe("blocked");
    expect(linkState({ kind: "missing", parentBlocked: true }, null, "/app")).toBe("blocked");
    expect(linkState({ kind: "symlink" }, null, "/app")).toBe("blocked");
    expect(linkState({ kind: "missing" }, null, "/app")).toBe("missing");
  });
});

describe("stubState", () => {
  test("compares only a regular SKILL.md in a real directory", () => {
    expect(stubState({ kind: "directory" }, { kind: "file" }, "stub", "stub")).toBe("ours");
    expect(stubState({ kind: "directory" }, { kind: "file" }, "edited", "stub")).toBe("differs");
    expect(stubState({ kind: "directory" }, { kind: "missing" }, null, "stub")).toBe("missing");
    expect(stubState({ kind: "missing" }, { kind: "missing" }, null, "stub")).toBe("missing");
  });
  test("blocks links, directories at SKILL.md, parent failures and read failures", () => {
    for (const kind of ["symlink", "directory", "other"] as const) expect(stubState({ kind: "directory" }, { kind }, null, "stub")).toBe("blocked");
    for (const kind of ["symlink", "file"] as const) expect(stubState({ kind }, { kind: "file" }, "stub", "stub")).toBe("blocked");
    expect(stubState({ kind: "error", code: "ENOTDIR" }, { kind: "missing" }, null, "stub")).toBe("blocked");
    expect(stubState({ kind: "missing", parentBlocked: true }, { kind: "missing" }, null, "stub")).toBe("blocked");
    expect(stubState({ kind: "directory" }, { kind: "file" }, null, "stub")).toBe("blocked");
  });
});

describe("mcpState", () => {
  const expected = "/tmp/doan-poc7/mcp-wrapper";
  test("reads Codex transport and externally established scope from sanitized PoC output", () => {
    const output = { ...run(fixture("codex-get.stdout.txt")), scope: "user" as const };
    expect(mcpState("codex", output, expected)).toBe("ours");
    expect(mcpState("codex", { ...output, scope: "project" }, expected)).toBe("other");
    expect(mcpState("codex", { ...output, stdout: fixture("codex-get-overwritten.stdout.txt") }, expected)).toBe("other");
    expect(mcpState("codex", { ...output, stdout: fixture("codex-get-missing.stdout.txt"), stderr: fixture("codex-get-missing.stderr.txt"), exitCode: 1 }, expected)).toBe("missing");
    expect(mcpState("codex", { ...output, exitCode: 1, stderr: "permission denied" }, expected)).toBe("unknown");
    expect(mcpState("codex", { ...output, timedOut: true }, expected)).toBe("unknown");
  });
  test("parses only Claude selected config, never health-check text or project registrations", () => {
    const output = { ...run(fixture("claude-user-config.json")), scope: "user" as const };
    expect(mcpState("claude", output, expected)).toBe("ours");
    expect(mcpState("claude", { ...output, scope: "local" }, expected)).toBe("other");
    for (const stdout of ["{}", '{"projects":{"/tmp/repo":{"mcpServers":{"doan":{}}}}}']) expect(mcpState("claude", { ...output, stdout }, expected)).toBe("missing");
    for (const stdout of ["", "[]", "{", fixture("claude-get.stdout.txt"), '{"mcpServers":null}']) expect(mcpState("claude", { ...output, stdout }, expected)).toBe("unknown");
    for (const registration of [{ command: expected, args: ["mcp", "extra"] }, { type: "http", url: "https://example.test" }, { command: "doan", args: ["mcp"] }]) {
      expect(mcpState("claude", { ...output, stdout: JSON.stringify({ mcpServers: { doan: registration } }) }, expected)).toBe("other");
    }
  });
  test("rejects disabled or malformed Codex entries", () => {
    for (const value of [{}, { name: "doan", enabled: false, transport: { type: "stdio", command: expected, args: ["mcp"] } }, { name: "other", transport: {} }]) {
      expect(mcpState("codex", { ...run(JSON.stringify(value)), scope: "user" }, expected)).not.toBe("ours");
    }
  });
});

describe("shell helpers", () => {
  test("reads exactly the three PoC probe lines between nonce markers amid noise", () => {
    expect(parseShellProbe("welcome\nDOAN_PROBE_x_BEGIN\n/bin:/home/bin\n/custom/claude\n/custom/codex\nDOAN_PROBE_x_END\nbye", "x")).toEqual({ ok: true, path: "/bin:/home/bin", claudeConfigDir: "/custom/claude", codexHome: "/custom/codex" });
    expect(parseShellProbe("DOAN_PROBE_x_BEGIN\r\n/bin\r\n\r\n\r\nDOAN_PROBE_x_END\r\n", "x")).toEqual({ ok: true, path: "/bin" });
    for (const stdout of ["", "noise", "DOAN_PROBE_x_BEGIN\n/bin\n\n", "DOAN_PROBE_x_BEGIN\n\n\n\nDOAN_PROBE_x_END", "DOAN_PROBE_y_BEGIN\n/bin\n\n\nDOAN_PROBE_y_END"]) expect(parseShellProbe(stdout, "x").ok).toBe(false);
  });
  test.each(["BEGIN", "END"])("rejects duplicate nonce %s markers", (marker) => {
    const stdout = `DOAN_PROBE_x_BEGIN\n/bin\n\n\nDOAN_PROBE_x_END\nDOAN_PROBE_x_${marker}`;
    expect(parseShellProbe(stdout, "x").ok).toBe(false);
  });
  test.each([0, 1, 2])("rejects NUL in probe field %i", (index) => {
    const fields = ["/bin", "/custom/claude", "/custom/codex"];
    fields[index] += "\0";
    expect(parseShellProbe(`DOAN_PROBE_x_BEGIN\n${fields.join("\n")}\nDOAN_PROBE_x_END`, "x").ok).toBe(false);
  });
  test("preserves symlink-parent PATH candidates for the executable check", () => {
    const checked: string[] = [];
    const candidate = "/probe/alias/../bin/codex";
    expect(findOnPath("/probe/alias/../bin/", "codex", (path) => {
      checked.push(path);
      return path === candidate;
    })).toBe(candidate);
    expect(checked).toEqual([candidate]);
  });
  test("compares PATH entries with trailing-slash tolerance only", () => {
    expect(pathIncludes("/probe/alias/../bin/", "/probe/bin")).toBe(false);
    expect(pathIncludes("/probe/bin", "/probe/alias/../bin/")).toBe(false);
    expect(pathIncludes("/probe/alias/../bin/", "/probe/alias/../bin//")).toBe(true);
    expect(pathIncludes("/probe/./bin", "/probe/bin")).toBe(false);
    expect(pathIncludes("/", "///")).toBe(true);
    expect(findOnPath("///", "codex", () => true)).toBe("/codex");
  });
  test("ignores empty, relative and unexpanded PATH entries and honors order", () => {
    const checked: string[] = [];
    expect(findOnPath(":~/bin:relative:/first/:/second::", "codex", (path) => { checked.push(path); return path === "/second/codex"; })).toBe("/second/codex");
    expect(checked).toEqual(["/first/codex", "/second/codex"]);
    expect(findOnPath("", "claude", () => true)).toBeNull();
    expect(findOnPath("/bin", "../claude", () => true)).toBeNull();
    expect(pathIncludes(":~/bin:/home/.local/bin/:", "/home/.local/bin")).toBe(true);
    expect(pathIncludes("~/bin:/home/.local/bin-other", "/home/.local/bin")).toBe(false);
    expect(pathIncludes("", "")).toBe(false);
  });
  test("offers rc names only for zsh/bash and detects the exact translocation segment", () => {
    expect(rcFileFor("/bin/zsh")).toBe("~/.zshrc");
    expect(rcFileFor("/bin/bash")).toBe("~/.bash_profile");
    expect(rcFileFor("/opt/homebrew/bin/fish")).toBeNull();
    expect(isTranslocated("/private/var/folders/a/AppTranslocation/id/d/doan.app")).toBe(true);
    expect(isTranslocated("/Applications/AppTranslocation-copy/doan.app")).toBe(false);
  });
});

test("builds argv without shell interpolation and keeps Claude user scope", () => {
  const command = "/tmp/a b/$(no)/doan";
  expect(mcpAddArgs("claude", command)).toEqual(["mcp", "add", "--scope", "user", "doan", "--", command, "mcp"]);
  expect(mcpAddArgs("codex", command)).toEqual(["mcp", "add", "doan", "--", command, "mcp"]);
  expect(mcpRemoveArgs("claude")).toEqual(["mcp", "remove", "--scope", "user", "doan"]);
  expect(mcpRemoveArgs("codex")).toEqual(["mcp", "remove", "doan"]);
  expect(initArgs("/tmp/project", null)).toEqual(["init", "--json", "--repo", "/tmp/project"]);
  expect(initArgs("/tmp/project", "/tmp/project/a b.css")).toEqual(["init", "--json", "--repo", "/tmp/project", "--token-css", "/tmp/project/a b.css"]);
});
