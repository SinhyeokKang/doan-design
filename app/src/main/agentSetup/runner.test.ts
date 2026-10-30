import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codexRuleText } from "./plan";
import { adminCommand, runAgentSetup, type AdminResult, type AgentSetupOptions } from "./runner";

// The race test swaps one symlink call; everything else is the real file system.
vi.mock("node:fs", async importOriginal => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, symlinkSync: vi.fn(real.symlinkSync) };
});
const realSymlink = (await vi.importActual<typeof import("node:fs")>("node:fs")).symlinkSync;

let temp: string, home: string, userData: string, systemBin: string, resources: string;
const ALL = ["claude", "codex", "cursor", "antigravity", "copilot"];
function bundle(path: string): string {
  const res = join(path, "Contents/Resources");
  mkdirSync(join(res, "bin"), { recursive: true }); mkdirSync(join(res, "skills/doan"), { recursive: true });
  writeFileSync(join(res, "bin/doan"), "#!/bin/sh\n", { mode: 0o755 }); writeFileSync(join(res, "skills/doan/SKILL.md"), "stub\n");
  return res;
}
// The fake administrator shell runs the command as this user against a temporary system bin.
function shellAdmin(): AgentSetupOptions["runAdmin"] & { calls: string[] } {
  const calls: string[] = [];
  const run = async (command: string): Promise<AdminResult> => {
    calls.push(command);
    try { execFileSync("/bin/sh", ["-c", command], { stdio: "ignore" }); return { kind: "ok" }; } catch { return { kind: "failed", message: "exit 1" }; }
  };
  return Object.assign(run, { calls });
}
function options(overrides: Partial<AgentSetupOptions> = {}): AgentSetupOptions {
  return { home, resources, isPackaged: true, loginPath: `/usr/bin:/bin:${home}/.local/bin`, shell: "/bin/zsh", userData, systemBin, runAdmin: shellAdmin(), log: () => {}, ...overrides };
}
// Every entry under HOME with its identity, so a run that rewrites a link with the same value still shows.
function tree(root = home): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (path: string) => {
    const info = lstatSync(path);
    out[path.slice(root.length) || "/"] = `${info.ino}:${info.mtimeMs}:${info.isSymbolicLink() ? `->${readlinkSync(path)}` : info.isDirectory() ? "dir" : readFileSync(path, "utf8")}`;
    if (info.isDirectory() && !info.isSymbolicLink()) for (const name of readdirSync(path)) walk(join(path, name));
  };
  walk(root);
  return out;
}
const share = () => join(home, ".local/share/doan");
const linkOf = (path: string) => readlinkSync(join(home, path));
const actions = (result: Awaited<ReturnType<typeof runAgentSetup>>) => Object.fromEntries(result.steps.map(step => [step.target, step.action === "skip" ? ("on" in step ? `skip:${step.on}` : `skip:${step.item.reason}`) : step.action]));

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "doan-agent-setup-")));
  home = join(temp, "home"); userData = join(temp, "userData"); systemBin = join(temp, "usr/local/bin");
  mkdirSync(home); mkdirSync(userData);
  resources = bundle(join(home, "Applications/Doan.app"));
});
afterEach(() => {
  vi.mocked(fs.symlinkSync).mockImplementation(realSymlink);
  for (const dir of [join(home, ".local/bin"), join(home, ".agents/skills")]) if (existsSync(dir)) chmodSync(dir, 0o755);
  rmSync(temp, { recursive: true, force: true });
});

describe("runAgentSetup", () => {
  it("sets up a HOME with no ~/.local and no provider folders, creating no provider folder", async () => {
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(actions(result)).toEqual({ current: "create", skill: "create", cli: "create", "agents-skill": "create" });
    expect(linkOf(".local/share/doan/current")).toBe(resources);
    expect(linkOf(".local/share/doan/skill")).toBe(`${share()}/current/skills/doan`);
    expect(linkOf(".local/bin/doan")).toBe(`${share()}/current/bin/doan`);
    expect(linkOf(".agents/skills/doan")).toBe(`${share()}/skill`);
    expect(readFileSync(join(home, ".agents/skills/doan/SKILL.md"), "utf8")).toBe("stub\n");
    for (const dir of [".claude", ".codex", ".gemini"]) expect(existsSync(join(home, dir))).toBe(false);
  });

  it("links the skill into provider folders that exist", async () => {
    mkdirSync(join(home, ".claude")); mkdirSync(join(home, ".gemini"));
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(linkOf(".claude/skills/doan")).toBe(`${share()}/skill`);
    expect(linkOf(".gemini/config/skills/doan")).toBe(`${share()}/skill`);
    expect(readFileSync(join(home, ".gemini/config/skills/doan/SKILL.md"), "utf8")).toBe("stub\n");
  });

  it("writes nothing on the second run", async () => {
    mkdirSync(join(home, ".claude"));
    await runAgentSetup(options());
    const before = tree();
    const result = await runAgentSetup(options());
    expect(new Set(Object.values(actions(result)))).toEqual(new Set(["keep"]));
    expect(tree()).toEqual(before);
  });

  it("replaces only current after the app moves", async () => {
    await runAgentSetup(options());
    const before = tree();
    const moved = bundle(join(home, "Applications/Doan 2.app"));
    const result = await runAgentSetup(options({ resources: moved }));
    expect(actions(result)).toEqual({ current: "replace", skill: "keep", cli: "keep", "agents-skill": "keep" });
    expect(linkOf(".local/share/doan/current")).toBe(moved);
    const after = tree();
    expect(Object.keys(after).filter(path => after[path] !== before[path] && !path.startsWith("/Applications"))).toEqual(["/.local/share/doan", "/.local/share/doan/current"]);
  });

  it("repairs a broken current left by a deleted bundle", async () => {
    mkdirSync(share(), { recursive: true });
    symlinkSync(join(temp, "deleted/Doan.app/Contents/Resources"), join(share(), "current"));
    const result = await runAgentSetup(options());
    expect(actions(result).current).toBe("replace");
    expect(linkOf(".local/share/doan/current")).toBe(resources);
  });

  it("replaces Connect's broken CLI link and relative Claude link", async () => {
    mkdirSync(join(home, ".local/bin"), { recursive: true }); mkdirSync(join(home, ".claude/skills"), { recursive: true });
    symlinkSync(join(temp, "onboard-l2/app/dist/mac-arm64/Doan.app/Contents/Resources/bin/doan"), join(home, ".local/bin/doan"));
    symlinkSync("../../.agents/skills/doan", join(home, ".claude/skills/doan"));
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(actions(result)).toMatchObject({ cli: "replace", "claude-skill": "replace" });
    expect(linkOf(".claude/skills/doan")).toBe(`${share()}/skill`);
  });

  // An existing and a broken target for each protected kind (POSTMORTEM 2026-10-25).
  it.each([
    ["an existing file elsewhere", (path: string) => { writeFileSync(join(temp, "other"), "x"); symlinkSync(join(temp, "other"), path); }, "link"],
    ["a broken link elsewhere", (path: string) => symlinkSync(join(temp, "nowhere/doan"), path), "link"],
    ["a relative link", (path: string) => symlinkSync("../share/doan/current/bin/doan", path), "link"],
    ["a regular file", (path: string) => writeFileSync(path, "mine"), "file"],
    ["a folder", (path: string) => mkdirSync(path), "folder"],
  ] as const)("leaves %s at ~/.local/bin/doan alone and skips the Codex rule behind it", async (_, place, found) => {
    mkdirSync(join(home, ".local/bin"), { recursive: true }); mkdirSync(join(home, ".codex"));
    const cli = join(home, ".local/bin/doan");
    place(cli);
    const before = tree(join(home, ".local/bin"));
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "cli", path: cli, providers: ALL, reason: "foreign", found }]);
    expect(tree(join(home, ".local/bin"))).toEqual(before);
    expect(actions(result)).toMatchObject({ current: "create", cli: "skip:foreign", "agents-skill": "create", "codex-rule": "skip:cli" });
    expect(existsSync(join(home, ".codex/rules"))).toBe(false);
  });

  it("skips everything behind a foreign current and names current only", async () => {
    mkdirSync(join(share(), "current"), { recursive: true });
    mkdirSync(join(home, ".claude"));
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "current", path: join(share(), "current"), providers: ALL, reason: "foreign", found: "folder" }]);
    expect(actions(result)).toEqual({ current: "skip:foreign", skill: "skip:current", cli: "skip:current", "agents-skill": "skip:current", "claude-skill": "skip:current" });
    expect(existsSync(join(home, ".local/bin"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills"))).toBe(false);
  });

  it("records a read-only parent as a write failure and skips the links behind it", async () => {
    mkdirSync(join(home, ".agents/skills"), { recursive: true }); chmodSync(join(home, ".agents/skills"), 0o555);
    mkdirSync(join(home, ".local/share"), { recursive: true }); writeFileSync(join(home, ".local/share/doan"), "a file");
    mkdirSync(join(home, ".claude"));
    const blocked = await runAgentSetup(options());
    expect(blocked.items).toEqual([{ target: "current", path: join(share(), "current"), providers: ALL, reason: "write-failed", cause: "blocked-parent", at: share(), code: "ENOTDIR" }]);
    rmSync(join(home, ".local/share/doan"));
    const readOnly = await runAgentSetup(options());
    expect(readOnly.items).toEqual([{ target: "agents-skill", path: join(home, ".agents/skills/doan"), providers: ["codex", "cursor", "copilot"], reason: "write-failed", cause: "permission", at: join(home, ".agents/skills"), code: "EACCES" }]);
    expect(actions(readOnly)).toMatchObject({ current: "create", "agents-skill": "skip:write-failed", "claude-skill": "create" });
  });

  it("skips a target that appears between the re-check and the write", async () => {
    const cli = join(home, ".local/bin/doan");
    vi.mocked(fs.symlinkSync).mockImplementation((value, path) => {
      if (path === cli) writeFileSync(cli, "someone else's");
      realSymlink(value, path);
    });
    const result = await runAgentSetup(options());
    expect(readFileSync(cli, "utf8")).toBe("someone else's");
    expect(result.items).toEqual([{ target: "cli", path: cli, providers: ALL, reason: "foreign", found: "file" }]);
    expect(actions(result)).toMatchObject({ current: "create", cli: "skip:foreign", "agents-skill": "create" });
  });

  it("counts ~/.claude/skills linked to ~/.agents/skills once", async () => {
    mkdirSync(join(home, ".agents/skills"), { recursive: true }); mkdirSync(join(home, ".claude"));
    symlinkSync(join(home, ".agents/skills"), join(home, ".claude/skills"));
    const result = await runAgentSetup(options());
    expect(actions(result)).toMatchObject({ "agents-skill": "create", "claude-skill": "shared" });
    expect(linkOf(".agents/skills/doan")).toBe(`${share()}/skill`);
  });

  it.each([
    ["a development build", { isPackaged: false }, "dev"],
    ["a copy outside Applications", { resources: "" }, "outside-applications"],
    ["a translocated copy", { resources: "" }, "translocated"],
  ] as const)("writes nothing from %s", async (_, overrides, eligibility) => {
    const res = eligibility === "outside-applications" ? bundle(join(temp, "app/dist/mac-arm64/Doan.app"))
      : eligibility === "translocated" ? bundle(join(temp, "AppTranslocation/1234/d/Doan.app")) : resources;
    const before = tree();
    const result = await runAgentSetup(options({ ...overrides, resources: res }));
    expect(result.items).toEqual([{ target: "copy", path: dirname(dirname(res)), providers: ALL, reason: "not-eligible", eligibility }]);
    expect(tree()).toEqual(before);
  });
});

describe("the Codex rule", () => {
  const rule = () => join(home, ".codex/rules/doan.rules");

  it("is written only when ~/.codex exists, and kept on the next run", async () => {
    expect(actions(await runAgentSetup(options()))["codex-rule"]).toBeUndefined();
    expect(existsSync(join(home, ".codex"))).toBe(false);
    mkdirSync(join(home, ".codex"));
    expect(actions(await runAgentSetup(options()))["codex-rule"]).toBe("create");
    expect(readFileSync(rule(), "utf8")).toBe(codexRuleText());
    expect(lstatSync(rule()).mode & 0o777).toBe(0o644);
    expect(readdirSync(join(home, ".codex/rules"))).toEqual(["doan.rules"]);
    const before = tree(join(home, ".codex"));
    expect(actions(await runAgentSetup(options()))["codex-rule"]).toBe("keep");
    expect(tree(join(home, ".codex"))).toEqual(before);
  });

  it("leaves an edited rule file alone", async () => {
    mkdirSync(join(home, ".codex/rules"), { recursive: true });
    writeFileSync(rule(), `${codexRuleText()}# mine\n`);
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "codex-rule", path: rule(), providers: ["codex"], reason: "foreign", found: "file" }]);
    expect(readFileSync(rule(), "utf8")).toBe(`${codexRuleText()}# mine\n`);
  });

  it("reports a read-only rules folder", async () => {
    mkdirSync(join(home, ".codex/rules"), { recursive: true }); chmodSync(join(home, ".codex/rules"), 0o555);
    try {
      const result = await runAgentSetup(options());
      expect(result.items).toEqual([{ target: "codex-rule", path: rule(), providers: ["codex"], reason: "write-failed", cause: "permission", at: join(home, ".codex/rules"), code: "EACCES" }]);
    } finally { chmodSync(join(home, ".codex/rules"), 0o755); }
  });

  it("is still written after the administrator dialog was cancelled", async () => {
    mkdirSync(join(home, ".codex"));
    const result = await runAgentSetup(options({ loginPath: "/usr/bin:/bin", runAdmin: async () => ({ kind: "cancelled" }) }));
    expect(actions(result)).toMatchObject({ "system-cli": "skip:admin-cancelled", "codex-rule": "create" });
  });
});

describe("the /usr/local/bin link", () => {
  const noLocalBin = "/usr/bin:/bin";

  it("is not asked for when the login PATH has ~/.local/bin", async () => {
    const admin = shellAdmin();
    const result = await runAgentSetup(options({ runAdmin: admin }));
    expect(admin.calls).toEqual([]);
    expect(actions(result)["system-cli"]).toBeUndefined();
  });

  it("is created through the administrator shell when ~/.local/bin is not on PATH", async () => {
    const admin = shellAdmin();
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: admin }));
    expect(admin.calls).toHaveLength(1);
    expect(result.items).toEqual([]);
    expect(readlinkSync(join(systemBin, "doan"))).toBe(`${share()}/current/bin/doan`);
    const again = shellAdmin();
    expect(actions(await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: again })))["system-cli"]).toBe("keep");
    expect(again.calls).toEqual([]);
  });

  it("replaces only a link Doan made, rechecking its value in the administrator shell", async () => {
    mkdirSync(systemBin, { recursive: true });
    symlinkSync(`${share()}/old/bin/doan`, join(systemBin, "doan"));
    const result = await runAgentSetup(options({ loginPath: noLocalBin }));
    expect(actions(result)["system-cli"]).toBe("replace");
    expect(readlinkSync(join(systemBin, "doan"))).toBe(`${share()}/current/bin/doan`);
    expect(readdirSync(systemBin)).toEqual(["doan"]);
  });

  it("leaves a foreign /usr/local/bin/doan alone without asking", async () => {
    mkdirSync(systemBin, { recursive: true }); writeFileSync(join(systemBin, "doan"), "brew");
    const admin = shellAdmin();
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: admin }));
    expect(admin.calls).toEqual([]);
    expect(result.items).toEqual([{ target: "system-cli", path: join(systemBin, "doan"), providers: ALL, reason: "foreign", found: "file" }]);
  });

  it("never asks again after the person cancels, and keeps showing the PATH line", async () => {
    const cancel = vi.fn(async (): Promise<AdminResult> => ({ kind: "cancelled" }));
    const first = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: cancel }));
    const item = { target: "system-cli", path: join(systemBin, "doan"), providers: ALL, reason: "admin-cancelled", rcFile: "~/.zshrc" };
    expect(first.items).toEqual([item]);
    const second = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: cancel }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(second.items).toEqual([item]);
    expect(existsSync(join(systemBin, "doan"))).toBe(false);
  });

  it("reports a failed administrator command as a write failure and asks again next time", async () => {
    const fail = vi.fn(async (): Promise<AdminResult> => ({ kind: "failed", message: "boom" }));
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: fail }));
    expect(result.items).toEqual([{ target: "system-cli", path: join(systemBin, "doan"), providers: ALL, reason: "write-failed", cause: "other", at: systemBin, code: "administrator command failed" }]);
    await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: fail }));
    expect(fail).toHaveBeenCalledTimes(2);
  });
});

describe("adminCommand", () => {
  it("quotes every path for the shell", () => {
    expect(adminCommand({ path: "/usr/local/bin/doan", want: "/Users/o'neil/.local/share/doan/current/bin/doan" }, null))
      .toBe("/bin/mkdir -p '/usr/local/bin' && /bin/ln -s '/Users/o'\\''neil/.local/share/doan/current/bin/doan' '/usr/local/bin/doan'");
  });
});
