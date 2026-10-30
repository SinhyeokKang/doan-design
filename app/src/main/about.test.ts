import { describe, expect, test } from "vitest";
import { aboutCli, aboutText, aboutTool, aboutView, type AboutRead } from "./about";
import type { CliRun } from "./folderState";

const listed = (version: string): CliRun => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version, presets: [] } }) });
const PATH = "/Applications/Doan.app/Contents/Resources/bin/doan";
// The draft's About window (buzz-settings `about`).
const READ: AboutRead = {
  version: "0.1.0",
  cli: { path: PATH, version: "0.1.0" },
  tools: [
    { provider: "claude", cli: "found", installed: "2.1.330", support: "supported" },
    { provider: "codex", cli: "found", installed: "0.163.0", support: "unsupported" },
    { provider: "cursor", cli: "missing", installed: null, support: "unknown" },
    { provider: "antigravity", cli: "found", installed: null, support: "supported" },
    { provider: "copilot", cli: "found", installed: "1.0.110", support: "supported" },
  ],
};

describe("reading", () => {
  test("the CLI version comes from the design-skill list reply; a failed run has no version", () => {
    expect(aboutCli(PATH, listed("0.1.0"))).toEqual({ path: PATH, version: "0.1.0" });
    expect(aboutCli("doan", listed("dev"))).toEqual({ path: "doan", version: "dev" });
    expect(aboutCli(PATH, { exitCode: null, timedOut: false, stdout: "", stderr: "", spawnError: "ENOENT" })).toEqual({ path: PATH, version: null });
    expect(aboutCli(PATH, { exitCode: 0, timedOut: true, stdout: "", stderr: "" })).toEqual({ path: PATH, version: null });
    expect(aboutCli(PATH, { exitCode: 0, timedOut: false, stdout: "nope", stderr: "" })).toEqual({ path: PATH, version: null });
  });

  test("a CLI without presets (usage_error) still has no readable version", () => {
    const usage: CliRun = { exitCode: 2, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: false, error: { code: "usage_error", message: "unknown command", nextSteps: [] } }) };
    expect(aboutCli(PATH, usage)).toEqual({ path: PATH, version: null });
  });

  test("tool facts keep only what About shows", () => {
    expect(aboutTool("codex", { cli: "found", version: "unsupported", installed: "0.163.0", tools: "ready" })).toEqual({ provider: "codex", cli: "found", installed: "0.163.0", support: "unsupported" });
    expect(aboutTool("cursor", { cli: "missing", version: "unknown", tools: "missing" })).toEqual({ provider: "cursor", cli: "missing", installed: null, support: "unknown" });
  });
});

describe("aboutView", () => {
  test("the draft's rows: version, doan command, and each agent tool with the version Doan needs", () => {
    const view = aboutView(READ);
    expect(view.app).toEqual([
      { id: "version", label: "Version", description: null, value: "0.1.0", status: null, tone: "neutral", error: null },
      { id: "cli", label: "doan command", description: PATH, value: "0.1.0", status: null, tone: "neutral", error: null },
    ]);
    expect(view.tools).toEqual([
      { id: "claude", label: "Claude Code", description: "Doan needs 2.1.312 or later.", value: "2.1.330", status: "Supported", tone: "ok", error: null },
      { id: "codex", label: "Codex", description: "Doan needs 0.164.0 or later.", value: "0.163.0", status: "Update needed", tone: "warning", error: null },
      { id: "cursor", label: "Cursor", description: "Doan needs 2026.10.22 or later.", value: null, status: "Not installed", tone: "neutral", error: null },
      { id: "antigravity", label: "Antigravity", description: "Doan downloads its sign-in server when you first sign in.", value: null, status: "Downloaded by Doan", tone: "neutral", error: null },
      { id: "copilot", label: "GitHub Copilot", description: "Doan needs 1.0.105 or later.", value: "1.0.110", status: "Supported", tone: "ok", error: null },
    ]);
  });

  test("a development build shows the CLI as it was found: version dev, a bare doan", () => {
    expect(aboutView({ ...READ, cli: { path: "doan", version: "dev" } }).app[1]).toMatchObject({ description: "doan", value: "dev", error: null });
  });

  test("a version that could not be read says so on its own row only", () => {
    const view = aboutView({ ...READ, cli: { path: PATH, version: null }, tools: [{ provider: "claude", cli: "found", installed: null, support: "unknown" }, { provider: "cursor", cli: "found", installed: "2026.11.03", support: "incompatible" }] });
    expect(view.app[1]).toEqual({ id: "cli", label: "doan command", description: PATH, value: null, status: null, tone: "error", error: "Couldn’t read the doan command’s version." });
    expect(view.app[0]).toMatchObject({ value: "0.1.0", error: null });
    expect(view.tools.find(row => row.id === "claude")).toMatchObject({ value: null, status: "Couldn’t read the version", tone: "warning", error: null });
    expect(view.tools.find(row => row.id === "cursor")).toMatchObject({ value: "2026.11.03", status: "Doan can’t run this version", tone: "error" });
  });

  test("while reading, every value is Checking… and the descriptions stay", () => {
    const view = aboutView(null);
    expect(view.app.map(row => [row.label, row.value])).toEqual([["Version", "Checking…"], ["doan command", "Checking…"]]);
    expect(view.tools.map(row => row.id)).toEqual(["claude", "codex", "cursor", "antigravity", "copilot"]);
    for (const row of view.tools) expect(row).toMatchObject({ value: "Checking…", status: null, error: null });
    expect(view.tools[1]?.description).toBe("Doan needs 0.164.0 or later.");
  });

  test("unreadable agent tools (no account storage) fail on each tool row", () => {
    const view = aboutView({ ...READ, tools: null });
    for (const row of view.tools) expect(row).toMatchObject({ value: null, status: "Couldn’t read the version", tone: "warning" });
  });
});

describe("aboutText", () => {
  test("Copy details is one plain-text block with every row", () => {
    expect(aboutText(READ)).toBe([
      "Doan 0.1.0",
      `doan command 0.1.0 (${PATH})`,
      "Claude Code 2.1.330: Supported (Doan needs 2.1.312 or later)",
      "Codex 0.163.0: Update needed (Doan needs 0.164.0 or later)",
      "Cursor: Not installed (Doan needs 2026.10.22 or later)",
      "Antigravity: Downloaded by Doan",
      "GitHub Copilot 1.0.110: Supported (Doan needs 1.0.105 or later)",
      "",
    ].join("\n"));
  });

  test("unread values are named as such", () => {
    const text = aboutText({ ...READ, cli: { path: "doan", version: null }, tools: null });
    expect(text.split("\n").slice(0, 3)).toEqual(["Doan 0.1.0", "doan command: Couldn’t read the version (doan)", "Claude Code: Couldn’t read the version (Doan needs 2.1.312 or later)"]);
  });
});
