import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolFacts } from "./agentAuth/types";
import { createInstallOpener, installChoice, terminalScript, type TerminalChoice } from "./installCommand";
import { INSTALL_URLS } from "./settings";

const missing: ToolFacts = { cli: "missing", version: "unknown", tools: "ready" };
const below = (installed: string): ToolFacts => ({ cli: "found", version: "unsupported", installed, tools: "ready" });

describe("installChoice", () => {
  it.each([
    ["claude", "curl -fsSL https://claude.ai/install.sh | bash", "Install Claude Code"],
    ["codex", "curl -fsSL https://chatgpt.com/codex/install.sh | sh", "Install Codex"],
    ["cursor", "curl https://cursor.com/install -fsS | bash", "Install Cursor"],
    ["copilot", "curl -fsSL https://gh.io/copilot-install | bash", "Install GitHub Copilot"],
  ] as const)("installs %s with its official script when the CLI is missing", (provider, command, title) => {
    expect(installChoice(provider, missing)).toEqual({ kind: "terminal", action: "install", command, title, url: INSTALL_URLS[provider] });
  });

  it.each([
    ["claude", "claude update", "Update Claude Code", "2.0.66", "2.0.67", "2.0.68"],
    ["codex", "codex update", "Update Codex", "0.125.0", "0.126.0", "0.150.0"],
    ["cursor", "cursor-agent update", "Update Cursor", "2026.10.21", "2026.10.22", "2026.10.23"],
    ["copilot", "copilot update", "Update GitHub Copilot", "0.0.395", "0.0.396", "0.0.397"],
  ] as const)("updates %s only from the first version that has the update subcommand", (provider, command, title, under, at, over) => {
    expect(installChoice(provider, below(under))).toEqual({ kind: "page" });
    for (const installed of [at, over]) {
      expect(installChoice(provider, below(installed))).toEqual({ kind: "terminal", action: "update", command, title, url: INSTALL_URLS[provider] });
    }
  });

  it("compares a suffixed version by its x.y.z", () => {
    expect(installChoice("codex", below("0.166.0-alpha.5.1"))).toMatchObject({ kind: "terminal", action: "update" });
    expect(installChoice("codex", below("0.125.9-alpha.5.1"))).toEqual({ kind: "page" });
    expect(installChoice("cursor", below("2026.10.22-27dcf5f"))).toMatchObject({ kind: "terminal", action: "update" });
    expect(installChoice("cursor", below("2026.10.21-27dcf5f"))).toEqual({ kind: "page" });
  });

  it("opens the install page for a version it cannot place against the floor", () => {
    expect(installChoice("codex", below("0.150.0+build"))).toEqual({ kind: "page" });
    expect(installChoice("codex", { cli: "found", version: "unsupported", tools: "ready" })).toEqual({ kind: "page" });
    expect(installChoice("codex", { cli: "found", version: "unknown", installed: "0.150.0", tools: "ready" })).toEqual({ kind: "page" });
  });

  it("opens the install page without facts, and for Antigravity, whose server Doan downloads itself", () => {
    expect(installChoice("codex", null)).toEqual({ kind: "page" });
    expect(installChoice("antigravity", missing)).toEqual({ kind: "page" });
    expect(installChoice("antigravity", below("1.0.0"))).toEqual({ kind: "page" });
  });
});

describe("terminalScript", () => {
  const update = installChoice("codex", below("0.150.0")) as TerminalChoice;
  const install = installChoice("codex", missing) as TerminalChoice;
  let dir: string | undefined;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });
  // Runs the script the way Terminal does, with the command replaced by a harmless one.
  function run(choice: TerminalChoice, input: string): { stdout: string; status: number | null } {
    dir = mkdtempSync(join(tmpdir(), "doan-install-script-"));
    const result = spawnSync("/bin/sh", ["-c", terminalScript(choice, "Codex")], { cwd: dir, input, encoding: "utf8" });
    return { stdout: result.stdout, status: result.status };
  }

  it("starts with a /bin/sh shebang and shows the update command before waiting", () => {
    const script = terminalScript(update, "Codex");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    const { stdout } = run({ ...update, command: "true" }, "");
    expect(stdout).toBe("Update Codex\nThis command updates Codex:\n\n  true\n\nPress Return to run it, or close this window to cancel.\n");
  });

  it("titles and describes an install", () => {
    const { stdout } = run({ ...install, command: "true" }, "");
    expect(stdout).toBe("Install Codex\nThis command installs Codex:\n\n  true\n\nPress Return to run it, or close this window to cancel.\n");
  });

  it("writes the fixed command itself into the script", () => {
    expect(terminalScript(update, "Codex")).toContain("\ncodex update\n");
    expect(terminalScript(install, "Codex")).toContain("\ncurl -fsSL https://chatgpt.com/codex/install.sh | sh\n");
  });

  it("runs nothing until Return", () => {
    run({ ...update, command: "touch ran" }, "");
    expect(existsSync(join(dir!, "ran"))).toBe(false);
  });

  it("tells the person to go back to Doan when the command exits 0", () => {
    const { stdout } = run({ ...update, command: "touch ran" }, "\n");
    expect(existsSync(join(dir!, "ran"))).toBe(true);
    expect(stdout.endsWith("Press Return to run it, or close this window to cancel.\nFinished. Go back to Doan to continue.\n")).toBe(true);
  });

  it.each([
    [update, "To update Codex another way, open https://learn.chatgpt.com/docs/codex/cli"],
    [install, "To install Codex another way, open https://learn.chatgpt.com/docs/codex/cli"],
  ] as const)("names the install page when the command fails", (choice, line) => {
    expect(choice.url).toBe(INSTALL_URLS.codex);
    const { stdout } = run({ ...choice, command: "false" }, "\n");
    expect(stdout.endsWith(`Press Return to run it, or close this window to cancel.\nThe command failed. See the output above.\n${line}\n`)).toBe(true);
  });

  // The install commands pipe curl into a shell: a failed download must not end as Finished.
  it("reports a failure of any piped stage, without changing the shown command", () => {
    const { stdout } = run({ ...install, command: "false | true" }, "\n");
    expect(stdout).toBe("Install Codex\nThis command installs Codex:\n\n  false | true\n\nPress Return to run it, or close this window to cancel.\n" +
      "The command failed. See the output above.\nTo install Codex another way, open https://learn.chatgpt.com/docs/codex/cli\n");
    expect(terminalScript(install, "Codex")).toContain("\nset -o pipefail 2>/dev/null\ncurl -fsSL https://chatgpt.com/codex/install.sh | sh\n");
  });

  it("escapes single quotes in every printed literal", () => {
    const odd: TerminalChoice = { kind: "terminal", action: "install", command: "printf '%s' x", title: "Install O'Brien", url: "https://example.com/it's" };
    const script = terminalScript(odd, "O'Brien");
    expect(script).toContain(`'Install O'\\''Brien'`);
    const ran = spawnSync("/bin/sh", ["-c", script], { input: "\n", encoding: "utf8" });
    expect(ran.stdout).toBe("Install O'Brien\nThis command installs O'Brien:\n\n  printf '%s' x\n\nPress Return to run it, or close this window to cancel.\nxFinished. Go back to Doan to continue.\n");
  });
});

describe("createInstallOpener", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  function opener(openPath: (path: string) => Promise<string> = async () => "", openExternal: (url: string) => Promise<void> = async () => {}) {
    const root = mkdtempSync(join(tmpdir(), "doan-install-open-"));
    roots.push(root);
    const dir = join(root, "terminal");
    const deps = { dir, openPath: vi.fn(openPath), openExternal: vi.fn(openExternal) };
    return { dir, deps, open: createInstallOpener(deps) };
  }

  it("writes the provider's script as an executable .command and opens it in Terminal", async () => {
    const t = opener();
    expect(await t.open("codex", below("0.150.0"))).toBe("terminal");
    const files = readdirSync(t.dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^codex-[0-9a-f]+\.command$/);
    const path = join(t.dir, files[0]!);
    expect(readFileSync(path, "utf8")).toBe(terminalScript(installChoice("codex", below("0.150.0")) as TerminalChoice, "Codex"));
    expect(statSync(path).mode & 0o777).toBe(0o700);
    expect(t.deps.openPath).toHaveBeenCalledExactlyOnceWith(path);
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it("removes the previous files and writes the new script under a new name", async () => {
    const t = opener();
    mkdirSync(t.dir, { recursive: true });
    writeFileSync(join(t.dir, "claude-old.command"), "old");
    writeFileSync(join(t.dir, ".codex-left.tmp"), "left");
    expect(await t.open("claude", missing)).toBe("terminal");
    const first = readdirSync(t.dir);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^claude-[0-9a-f]+\.command$/);
    expect(first[0]).not.toBe("claude-old.command");
    expect(await t.open("claude", missing)).toBe("terminal");
    const second = readdirSync(t.dir);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
  });

  it("finishes one open before the next one's cleanup, so a concurrent open never loses the file it opens", async () => {
    const opened: boolean[] = [];
    const t = opener(async path => { opened.push(existsSync(path)); return ""; });
    expect(await Promise.all([t.open("codex", missing), t.open("cursor", missing), t.open("copilot", missing)])).toEqual(["terminal", "terminal", "terminal"]);
    expect(opened).toEqual([true, true, true]);
    expect(readdirSync(t.dir)).toEqual([expect.stringMatching(/^copilot-/)]);
  });

  it("fails without opening anything when the directory cannot be made", async () => {
    const t = opener();
    writeFileSync(t.dir, "a file where the directory goes");
    expect(await t.open("codex", missing)).toBe("failed");
    expect(t.deps.openPath).not.toHaveBeenCalled();
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it("fails without opening anything when the script cannot be written", async () => {
    const t = opener();
    mkdirSync(t.dir, { recursive: true });
    chmodSync(t.dir, 0o500);
    try { expect(await t.open("codex", missing)).toBe("failed"); } finally { chmodSync(t.dir, 0o700); }
    expect(t.deps.openPath).not.toHaveBeenCalled();
  });

  it("fails when Terminal does not open the script: openPath answers an error string instead of rejecting", async () => {
    const t = opener(async () => "No application knows how to open this file.");
    expect(await t.open("codex", missing)).toBe("failed");
    const rejected = opener(async () => { throw new Error("gone"); });
    expect(await rejected.open("codex", missing)).toBe("failed");
  });

  it("opens the fixed install page when no command applies, and says when the page did not open", async () => {
    const t = opener();
    expect(await t.open("codex", below("0.125.0"))).toBe("page");
    expect(await t.open("cursor", null)).toBe("page");
    expect(t.deps.openExternal.mock.calls).toEqual([[INSTALL_URLS.codex], [INSTALL_URLS.cursor]]);
    expect(existsSync(t.dir)).toBe(false);
    expect(t.deps.openPath).not.toHaveBeenCalled();
    const failing = opener(undefined, async () => { throw new Error("no handler"); });
    expect(await failing.open("codex", below("0.125.0"))).toBe("pageFailed");
  });
});
