import { describe, expect, it } from "vitest";
import { aboutNotice, PATH_LINE, rcFileFor, type AboutNotice, type SetupItem } from "./notice";

const HOME = "/Users/u";
const ALL = ["claude", "codex", "cursor", "antigravity", "copilot"] as const;
// Flattens a line the way the renderer shows it: agents, an em dash, then the parts with `code` kept as backticks.
function lines(notice: AboutNotice | null): string[] {
  return notice?.lines.map(line => `${line.agents ? `${line.agents} — ` : ""}${line.parts.map(part => "code" in part ? `\`${part.code}\`` : part.text).join("")}${line.command ? ` [${line.command}]` : ""}`) ?? [];
}

describe("aboutNotice", () => {
  it("shows nothing when every item was set up", () => {
    expect(aboutNotice([], HOME)).toBeNull();
  });

  it("names one foreign CLI link with the draft's words", () => {
    const notice = aboutNotice([{ target: "cli", path: `${HOME}/.local/bin/doan`, providers: [...ALL], reason: "foreign", found: "file" }], HOME);
    expect(notice).toMatchObject({ tone: "warning", title: "Doan couldn’t set up every agent" });
    expect(lines(notice)).toEqual(["All agents — `~/.local/bin/doan` is a file Doan didn’t create, so Doan left it alone. Remove or rename it, then reopen Doan."]);
  });

  it("a setup run that crashed is a warning of its own, before the CLI links, with no path", () => {
    const items: SetupItem[] = [
      { target: "cli", path: `${HOME}/.local/bin/doan`, providers: [...ALL], reason: "foreign", found: "file" },
      { target: "setup", providers: [...ALL], reason: "crashed" },
    ];
    expect(aboutNotice(items, HOME)).toMatchObject({ tone: "warning", title: "Doan couldn’t set up every agent" });
    expect(lines(aboutNotice(items, HOME))).toEqual([
      "All agents — Doan stopped partway through setting up agents, so some may not be set up. Reopen Doan to try again. If this notice comes back, use Copy details to report the problem.",
      "All agents — `~/.local/bin/doan` is a file Doan didn’t create, so Doan left it alone. Remove or rename it, then reopen Doan.",
    ]);
  });

  it("orders several items: CLI links, then skill links, then the Codex rule", () => {
    const items: SetupItem[] = [
      { target: "codex-rule", path: `${HOME}/.codex/rules/doan.rules`, providers: ["codex"], reason: "write-failed", cause: "permission", at: `${HOME}/.codex/rules`, code: "EACCES" },
      { target: "claude-skill", path: `${HOME}/.claude/skills/doan`, providers: ["claude"], reason: "foreign", found: "folder" },
      { target: "system-cli", path: "/usr/local/bin/doan", providers: [...ALL], reason: "admin-cancelled", rcFile: "~/.zshrc" },
    ];
    expect(lines(aboutNotice(items, HOME))).toEqual([
      "All agents — `~/.local/bin` isn’t on your shell’s PATH, and adding doan to `/usr/local/bin` was cancelled. Add this line to `~/.zshrc`, then open a new terminal: [export PATH=\"$HOME/.local/bin:$PATH\"]",
      "Claude Code — `~/.claude/skills/doan` is a folder Doan didn’t create. Remove or rename it, then reopen Doan.",
      "Codex — Doan couldn’t write `~/.codex/rules/doan.rules` (permission denied). Make `~/.codex/rules` writable, then reopen Doan.",
    ]);
  });

  it("puts current first and names the shared-skill agents", () => {
    const items: SetupItem[] = [
      { target: "agents-skill", path: `${HOME}/.agents/skills/doan`, providers: ["codex", "cursor", "copilot"], reason: "foreign", found: "link" },
      { target: "current", path: `${HOME}/.local/share/doan/current`, providers: [...ALL], reason: "write-failed", cause: "blocked-parent", at: `${HOME}/.local/share`, code: "ENOTDIR" },
    ];
    expect(lines(aboutNotice(items, HOME))).toEqual([
      "All agents — Doan couldn’t write `~/.local/share/doan/current` because `~/.local/share` isn’t a folder. Remove or rename it, then reopen Doan.",
      "Codex, Cursor and GitHub Copilot — `~/.agents/skills/doan` is a link Doan didn’t create, so Doan left it alone. Remove or rename it, then reopen Doan.",
    ]);
  });

  it.each([
    ["link", "Claude Code — `~/.claude/settings.json` is a link, so Doan left it alone. To let Claude Code run `doan work` and `doan open` without asking, add `Bash(doan work start *)`, `Bash(doan work done *)` and `Bash(doan open *)` to `permissions.allow` in the file it links to."],
    ["json", "Claude Code — `~/.claude/settings.json` isn’t valid JSON, so Doan couldn’t add the rules that let Claude Code run `doan work` and `doan open` without asking. Fix the file, then reopen Doan."],
    ["object", "Claude Code — `~/.claude/settings.json` isn’t a JSON object, so Doan couldn’t add the rules that let Claude Code run `doan work` and `doan open` without asking. Fix the file, then reopen Doan."],
    ["permissions", "Claude Code — `permissions` in `~/.claude/settings.json` isn’t an object, so Doan couldn’t add the rules that let Claude Code run `doan work` and `doan open` without asking. Fix the file, then reopen Doan."],
    ["allow", "Claude Code — `permissions.allow` in `~/.claude/settings.json` isn’t a list, so Doan couldn’t add the rules that let Claude Code run `doan work` and `doan open` without asking. Fix the file, then reopen Doan."],
  ] as const)("says why the Claude Code settings were left alone (%s)", (problem, line) => {
    expect(lines(aboutNotice([{ target: "claude-allow", path: `${HOME}/.claude/settings.json`, providers: ["claude"], reason: "claude-settings", problem }], HOME))).toEqual([line]);
  });

  it("puts the Claude Code allow rule after the Codex rule", () => {
    const items: SetupItem[] = [
      { target: "claude-allow", path: `${HOME}/.claude/settings.json`, providers: ["claude"], reason: "claude-settings", problem: "json" },
      { target: "codex-rule", path: `${HOME}/.codex/rules/doan.rules`, providers: ["codex"], reason: "foreign", found: "file" },
    ];
    expect(aboutNotice(items, HOME)?.lines.map(line => line.agents)).toEqual(["Codex", "Claude Code"]);
  });

  it("says where a displaced entry was left", () => {
    expect(lines(aboutNotice([{ target: "cli", path: `${HOME}/.local/bin/doan`, providers: [...ALL], reason: "write-failed", cause: "displaced", at: `${HOME}/.local/bin/.doan-1.aside`, code: "EEXIST" }], HOME)))
      .toEqual(["All agents — Doan moved `~/.local/bin/doan`, which it didn’t create, to `~/.local/bin/.doan-1.aside` and couldn’t put it back. Move it back, then reopen Doan."]);
  });

  it("asks for the shell's startup file when the shell is unknown", () => {
    expect(lines(aboutNotice([{ target: "system-cli", path: "/usr/local/bin/doan", providers: [...ALL], reason: "admin-cancelled", rcFile: null }], HOME))[0])
      .toContain("Add this line to your shell’s startup file, then open a new terminal:");
  });

  it.each([
    ["outside-applications", "It isn’t directly in the Applications folder. Open the Doan in Applications so your agents can use it."],
    ["dev", "Development builds never set up agents. Open the Doan in Applications so your agents can use it."],
    ["translocated", "macOS is running it from a temporary location. Move Doan to the Applications folder, then open it again."],
  ] as const)("says this %s copy sets up nothing, without an icon tone", (eligibility, sentence) => {
    const notice = aboutNotice([{ target: "copy", path: "/tmp/Doan.app", providers: [...ALL], reason: "not-eligible", eligibility }], HOME);
    expect(notice).toMatchObject({ tone: "neutral", title: "This copy doesn’t set up agents" });
    expect(lines(notice)).toEqual([sentence]);
  });
});

describe("PATH helpers", () => {
  it("names the rc file for zsh and bash only", () => {
    expect(rcFileFor("/bin/zsh")).toBe("~/.zshrc");
    expect(rcFileFor("/opt/homebrew/bin/bash")).toBe("~/.bash_profile");
    expect(rcFileFor("/usr/local/bin/fish")).toBeNull();
    expect(PATH_LINE).toBe('export PATH="$HOME/.local/bin:$PATH"');
  });
});
