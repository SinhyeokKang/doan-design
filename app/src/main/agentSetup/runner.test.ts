import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_ALLOW_RULES, codexRuleText } from "./plan";
import { adminCommand, runAgentSetup, type AdminResult, type AgentSetupOptions } from "./runner";

// The race test swaps one symlink call; everything else is the real file system.
vi.mock("node:fs", async importOriginal => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, symlinkSync: vi.fn(real.symlinkSync), renameSync: vi.fn(real.renameSync), linkSync: vi.fn(real.linkSync), writeFileSync: vi.fn(real.writeFileSync) };
});
const { symlinkSync: realSymlink, renameSync: realRename, linkSync: realLink, writeFileSync: realWrite } = await vi.importActual<typeof import("node:fs")>("node:fs");

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
  vi.mocked(fs.symlinkSync).mockImplementation(realSymlink); vi.mocked(fs.renameSync).mockImplementation(realRename); vi.mocked(fs.linkSync).mockImplementation(realLink);
  vi.mocked(fs.writeFileSync).mockImplementation(realWrite);
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
    expect(actions(result)).toEqual({ current: "skip:foreign", skill: "skip:current", cli: "skip:current", "agents-skill": "skip:current", "claude-skill": "skip:current", "claude-allow": "skip:current" });
    expect(existsSync(join(home, ".local/bin"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills"))).toBe(false);
    expect(existsSync(join(home, ".claude/settings.json"))).toBe(false);
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

describe("the Claude Code allow rule", () => {
  const settings = () => join(home, ".claude/settings.json");
  const created = `${JSON.stringify({ permissions: { allow: CLAUDE_ALLOW_RULES } }, null, 2)}\n`;
  const allowOf = () => JSON.parse(readFileSync(settings(), "utf8")).permissions.allow;

  it("is written only when ~/.claude exists, and kept on the next run", async () => {
    expect(actions(await runAgentSetup(options()))["claude-allow"]).toBeUndefined();
    expect(existsSync(join(home, ".claude"))).toBe(false);
    mkdirSync(join(home, ".claude"));
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(actions(result)["claude-allow"]).toBe("create");
    expect(readFileSync(settings(), "utf8")).toBe(created);
    expect(lstatSync(settings()).mode & 0o777).toBe(0o644);
    const before = tree(join(home, ".claude"));
    expect(actions(await runAgentSetup(options()))["claude-allow"]).toBe("keep");
    expect(tree(join(home, ".claude"))).toEqual(before);
  });

  it("merges into the person's settings, keeping their keys, rules and file mode, and leaves no temporary file", async () => {
    mkdirSync(join(home, ".claude"));
    const mine = { model: "opus", permissions: { allow: ["Bash(npm run *)"], deny: ["Bash(rm *)"] }, hooks: {} };
    writeFileSync(settings(), JSON.stringify(mine), { mode: 0o600 });
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(actions(result)["claude-allow"]).toBe("replace");
    expect(JSON.parse(readFileSync(settings(), "utf8"))).toEqual({ ...mine, permissions: { ...mine.permissions, allow: ["Bash(npm run *)", ...CLAUDE_ALLOW_RULES] } });
    expect(lstatSync(settings()).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(home, ".claude")).sort()).toEqual(["settings.json", "skills"]);
    expect(actions(await runAgentSetup(options()))["claude-allow"]).toBe("keep");
  });

  it.each([
    ["broken JSON", '{"permissions": {"allow": [],}}', "json"],
    ["a list", "[]", "object"],
    ["permissions that isn't an object", '{"permissions": []}', "permissions"],
    ["allow that isn't a list", '{"permissions": {"allow": "Bash(doan *)"}}', "allow"],
  ] as const)("leaves settings with %s alone and names them", async (_name, text, problem) => {
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), text);
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "claude-settings", problem }]);
    expect(readFileSync(settings(), "utf8")).toBe(text);
  });

  // RC2-2: a lossy UTF-8 read would turn FF into U+FFFD, parse, and write EF BF BD back. A BOM is kept and refused too.
  it.each([
    ["bytes that are not UTF-8", Buffer.concat([Buffer.from('{"note":"'), Buffer.from([0xff]), Buffer.from('","permissions":{"allow":[]}}')])],
    ["a byte order mark", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"permissions":{"allow":[]}}')])],
  ] as const)("leaves settings with %s alone and names them as broken JSON", async (_name, bytes) => {
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), bytes);
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "claude-settings", problem: "json" }]);
    expect(readFileSync(settings()).equals(bytes)).toBe(true);
  });

  // RC2-3: the scan that finds where to insert must not stop setup on a file JSON.parse accepts.
  it("merges into deep but valid settings and finishes the run", async () => {
    mkdirSync(join(home, ".claude"));
    const deep = `{"unrelated":${"[".repeat(10000)}0${"]".repeat(10000)},"permissions":{"allow":[]}}`;
    writeFileSync(settings(), deep);
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([]);
    expect(actions(result)).toMatchObject({ current: "create", cli: "create", "claude-skill": "create", "claude-allow": "replace" });
    expect(readFileSync(settings(), "utf8")).toBe(`${deep.slice(0, -3)}"Bash(doan work start *)", "Bash(doan work done *)", "Bash(doan open *)", "Bash(doan work update *)"]}}`);
  });

  it("never writes through a link, and says nothing once the file it links to has every rule, as nothing is left to add", async () => {
    mkdirSync(join(home, ".claude")); mkdirSync(join(home, "dotfiles"));
    const target = join(home, "dotfiles/settings.json");
    writeFileSync(target, '{"theme":"dark"}'); symlinkSync(target, settings());
    const result = await runAgentSetup(options());
    expect(result.items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "claude-settings", problem: "link" }]);
    expect(readFileSync(target, "utf8")).toBe('{"theme":"dark"}');
    expect(readlinkSync(settings())).toBe(target);
    writeFileSync(target, JSON.stringify({ theme: "dark", permissions: { allow: CLAUDE_ALLOW_RULES } }));
    const added = await runAgentSetup(options());
    expect(added.items).toEqual([]);
    expect(actions(added)["claude-allow"]).toBe("keep");
  });

  it("names a broken link as a link", async () => {
    mkdirSync(join(home, ".claude")); symlinkSync(join(home, "gone.json"), settings());
    expect((await runAgentSetup(options())).items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "claude-settings", problem: "link" }]);
  });

  it("does not read through a link to something that is not a file", async () => {
    mkdirSync(join(home, ".claude")); execFileSync("/usr/bin/mkfifo", [join(home, "pipe")]);
    symlinkSync(join(home, "pipe"), settings());
    expect((await runAgentSetup(options())).items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "claude-settings", problem: "link" }]);
  });

  it("leaves a folder in its place alone", async () => {
    mkdirSync(settings(), { recursive: true });
    expect((await runAgentSetup(options())).items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "foreign", found: "folder" }]);
  });

  it("waits for Doan's doan on PATH, like the Codex rule", async () => {
    mkdirSync(join(home, ".claude")); mkdirSync(join(home, ".local/bin"), { recursive: true });
    writeFileSync(join(home, ".local/bin/doan"), "someone else's");
    const result = await runAgentSetup(options());
    expect(actions(result)).toMatchObject({ cli: "skip:foreign", "claude-allow": "skip:cli" });
    expect(existsSync(settings())).toBe(false);
  });

  it("keeps a change Claude Code makes while Doan is merging, and decides again next run", async () => {
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), '{"theme":"dark"}');
    vi.mocked(fs.writeFileSync).mockImplementation((path, data, options) => {
      realWrite(path, data, options);
      if (String(path).includes(".doan-")) realWrite(settings(), '{"theme":"light"}');
    });
    const result = await runAgentSetup(options());
    expect(actions(result)["claude-allow"]).toBe("changed");
    expect(result.items).toEqual([]);
    expect(readFileSync(settings(), "utf8")).toBe('{"theme":"light"}');
    expect(readdirSync(join(home, ".claude")).sort()).toEqual(["settings.json", "skills"]);
    vi.mocked(fs.writeFileSync).mockImplementation(realWrite);
    expect(actions(await runAgentSetup(options()))["claude-allow"]).toBe("replace");
    expect(JSON.parse(readFileSync(settings(), "utf8"))).toEqual({ theme: "light", permissions: { allow: CLAUDE_ALLOW_RULES } });
  });

  // The review's timing: Claude Code saves after Doan's last look and before Doan publishes its merge.
  const newer = '{"model":"sonnet","permissions":{"allow":[],"deny":["Bash(rm *)"]}}';
  const leftovers = () => readdirSync(join(home, ".claude")).filter(name => name.startsWith(".doan-"));

  it("keeps a save Claude Code makes in place after Doan's last look, and decides again next run", async () => {
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), '{"model":"opus","permissions":{"allow":[]}}');
    let saved = false;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (!saved && (from === settings() || to === settings())) { saved = true; realWrite(settings(), newer); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(saved).toBe(true);
    expect(actions(result)["claude-allow"]).toBe("changed");
    expect(result.items).toEqual([]);
    expect(readFileSync(settings(), "utf8")).toBe(newer);
    expect(leftovers()).toEqual([]);
    vi.mocked(fs.renameSync).mockImplementation(realRename);
    expect(actions(await runAgentSetup(options()))["claude-allow"]).toBe("replace");
    expect(JSON.parse(readFileSync(settings(), "utf8"))).toEqual({ model: "sonnet", permissions: { allow: CLAUDE_ALLOW_RULES, deny: ["Bash(rm *)"] } });
  });

  // RC2-2: the moved file is compared as bytes, so a save that only differs where UTF-8 cannot decode is not lost.
  it("keeps a save after Doan's last look that a lossy UTF-8 read would see as unchanged", async () => {
    mkdirSync(join(home, ".claude"));
    const mine = Buffer.from('{"note":"\uFFFD","permissions":{"allow":[]}}');
    const saved = Buffer.concat([Buffer.from('{"note":"'), Buffer.from([0xff]), Buffer.from('","permissions":{"allow":[]}}')]);
    expect(saved.toString("utf8")).toBe(mine.toString("utf8"));
    writeFileSync(settings(), mine);
    let wrote = false;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (!wrote && from === settings()) { wrote = true; realWrite(settings(), saved); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(wrote).toBe(true);
    expect(actions(result)["claude-allow"]).toBe("changed");
    expect(readFileSync(settings()).equals(saved)).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it("keeps a file Claude Code renames into place after Doan's last look, even with the same bytes", async () => {
    const mine = '{"model":"opus"}';
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), mine);
    let ino = -1;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (ino < 0 && (from === settings() || to === settings())) {
        const staged = join(home, ".claude/claude-save.tmp");
        realWrite(staged, mine); realRename(staged, settings()); ino = lstatSync(settings()).ino;
      }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(ino).toBeGreaterThan(0);
    expect(actions(result)["claude-allow"]).toBe("changed");
    expect(lstatSync(settings()).ino).toBe(ino);
    expect(readFileSync(settings(), "utf8")).toBe(mine);
    expect(leftovers()).toEqual([]);
  });

  it("keeps a file Claude Code writes while Doan's merge is about to be published", async () => {
    mkdirSync(join(home, ".claude")); writeFileSync(settings(), '{"model":"opus","permissions":{"allow":[]}}');
    let saved = false;
    vi.mocked(fs.linkSync).mockImplementation((from, to) => {
      if (!saved && to === settings()) { saved = true; realWrite(settings(), newer); }
      realLink(from, to);
    });
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (!saved && to === settings()) { saved = true; realWrite(settings(), newer); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(saved).toBe(true);
    expect(actions(result)["claude-allow"]).toBe("changed");
    expect(result.items).toEqual([]);
    expect(readFileSync(settings(), "utf8")).toBe(newer);
    expect(leftovers()).toEqual([]);
  });

  it("reports a read-only ~/.claude without touching the settings", async () => {
    mkdirSync(join(home, ".claude/skills"), { recursive: true }); symlinkSync(`${share()}/skill`, join(home, ".claude/skills/doan"));
    writeFileSync(settings(), "{}"); chmodSync(join(home, ".claude"), 0o555);
    try {
      const result = await runAgentSetup(options());
      expect(result.items).toEqual([{ target: "claude-allow", path: settings(), providers: ["claude"], reason: "write-failed", cause: "permission", at: join(home, ".claude"), code: "EACCES" }]);
      expect(readFileSync(settings(), "utf8")).toBe("{}");
    } finally { chmodSync(join(home, ".claude"), 0o755); }
  });

  it("allows only the work commands and open, never all of doan", async () => {
    mkdirSync(join(home, ".claude"));
    await runAgentSetup(options());
    expect(allowOf()).toEqual(["Bash(doan work start *)", "Bash(doan work done *)", "Bash(doan open *)", "Bash(doan work update *)"]);
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

  it("creates the link as the person, without the dialog, when /usr/local/bin is writable", async () => {
    mkdirSync(systemBin, { recursive: true });
    const admin = shellAdmin();
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: admin }));
    expect(admin.calls).toEqual([]);
    expect(result.items).toEqual([]);
    expect(actions(result)["system-cli"]).toBe("create");
    expect(readlinkSync(join(systemBin, "doan"))).toBe(`${share()}/current/bin/doan`);
  });

  // Doan never placed another form there, so nothing in /usr/local/bin is ever replaced under root.
  it("leaves any other link there alone without asking, even one under Doan's folder", async () => {
    mkdirSync(systemBin, { recursive: true });
    symlinkSync(`${share()}/old/bin/doan`, join(systemBin, "doan"));
    const admin = shellAdmin();
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: admin }));
    expect(admin.calls).toEqual([]);
    expect(result.items).toEqual([{ target: "system-cli", path: join(systemBin, "doan"), providers: ALL, reason: "foreign", found: "link" }]);
    expect(readlinkSync(join(systemBin, "doan"))).toBe(`${share()}/old/bin/doan`);
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

// The final mutation boundaries of a replacement (review R1): a competitor arrives right before Doan moves the old link
// aside, right before it creates the new one, or the parent folder is swapped in between.
describe("replacing a link", () => {
  const cli = () => join(home, ".local/bin/doan");
  const leftovers = (dir: string) => readdirSync(dir).filter(name => name.startsWith(".doan-"));
  async function outdated() {
    await runAgentSetup(options());
    rmSync(cli()); symlinkSync(`${share()}/old/bin/doan`, cli());
  }

  it("puts back a foreign file that arrives right before the swap", async () => {
    await outdated();
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (from === cli()) { rmSync(cli()); writeFileSync(cli(), "FOREIGN"); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(readFileSync(cli(), "utf8")).toBe("FOREIGN");
    expect(result.items).toEqual([{ target: "cli", path: cli(), providers: ALL, reason: "foreign", found: "file" }]);
    expect(leftovers(join(home, ".local/bin"))).toEqual([]);
  });

  it("puts back a foreign link that arrives right before the swap", async () => {
    await outdated();
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (from === cli()) { rmSync(cli()); realSymlink("/opt/homebrew/bin/doan", cli()); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    expect(readlinkSync(cli())).toBe("/opt/homebrew/bin/doan");
    expect(result.items).toMatchObject([{ target: "cli", reason: "foreign", found: "link" }]);
    expect(leftovers(join(home, ".local/bin"))).toEqual([]);
  });

  // Node has no exclusive rename, so a folder is never moved back: it stays at the aside name and About says where.
  it("keeps a foreign folder that arrives right before the swap at the aside name", async () => {
    await outdated();
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (from === cli()) { rmSync(cli()); mkdirSync(cli()); writeFileSync(join(cli(), "mine"), "x"); }
      realRename(from, to);
    });
    const result = await runAgentSetup(options());
    const [aside] = leftovers(join(home, ".local/bin"));
    expect(readFileSync(join(home, ".local/bin", aside!, "mine"), "utf8")).toBe("x");
    expect(existsSync(cli())).toBe(false);
    expect(result.items).toEqual([{ target: "cli", path: cli(), providers: ALL, reason: "write-failed", cause: "displaced", at: join(home, ".local/bin", aside!), code: "EEXIST" }]);
  });

  it("leaves a file that arrives right after the old link is moved aside", async () => {
    await outdated();
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      realRename(from, to);
      if (from === cli()) writeFileSync(cli(), "ARRIVED");
    });
    const result = await runAgentSetup(options());
    expect(readFileSync(cli(), "utf8")).toBe("ARRIVED");
    expect(result.items).toMatchObject([{ target: "cli", reason: "foreign", found: "file" }]);
    expect(leftovers(join(home, ".local/bin"))).toEqual([]);
  });

  it("leaves a file that arrives at the new link's creation", async () => {
    await outdated();
    vi.mocked(fs.symlinkSync).mockImplementation((value, path) => {
      if (path === cli()) writeFileSync(cli(), "ARRIVED");
      realSymlink(value, path);
    });
    const result = await runAgentSetup(options());
    expect(readFileSync(cli(), "utf8")).toBe("ARRIVED");
    expect(result.items).toMatchObject([{ target: "cli", reason: "foreign", found: "file" }]);
    expect(leftovers(join(home, ".local/bin"))).toEqual([]);
  });

  it.each([
    ["a foreign file", (path: string) => writeFileSync(path, "FOREIGN")],
    ["a link with Doan's old value", (path: string) => realSymlink(`${share()}/old/bin/doan`, path)],
  ] as const)("fails closed when ~/.local/bin is swapped for a link to a folder holding %s", async (_, place) => {
    await outdated();
    const elsewhere = join(temp, "elsewhere"), moved = join(home, ".local/bin-old");
    mkdirSync(elsewhere); place(join(elsewhere, "doan"));
    const before = tree(elsewhere);
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (from === cli()) { realRename(join(home, ".local/bin"), moved); realSymlink(elsewhere, join(home, ".local/bin")); }
      realRename(from, to);
    });
    await runAgentSetup(options());
    vi.mocked(fs.renameSync).mockImplementation(realRename);
    expect(Object.values(tree(elsewhere)).map(entry => entry.split(":").slice(2).join(":"))).toEqual(Object.values(before).map(entry => entry.split(":").slice(2).join(":")));
    expect(leftovers(elsewhere)).toEqual([]);
    expect(readlinkSync(join(moved, "doan"))).toBe(`${share()}/old/bin/doan`);
  });

  it("keeps a displaced entry at a recoverable name when something else takes its place", async () => {
    await outdated();
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (from === cli()) { rmSync(cli()); writeFileSync(cli(), "FOREIGN"); }
      realRename(from, to);
    });
    vi.mocked(fs.linkSync).mockImplementation((from, to) => {
      if (to === cli()) writeFileSync(cli(), "ARRIVED");
      realLink(from, to);
    });
    const result = await runAgentSetup(options());
    const [aside] = leftovers(join(home, ".local/bin"));
    expect(readFileSync(join(home, ".local/bin", aside!), "utf8")).toBe("FOREIGN");
    expect(readFileSync(cli(), "utf8")).toBe("ARRIVED");
    expect(result.items).toEqual([{ target: "cli", path: cli(), providers: ALL, reason: "write-failed", cause: "displaced", at: join(home, ".local/bin", aside!), code: "EEXIST" }]);
  });
});

describe("the administrator command", () => {
  const noLocalBin = "/usr/bin:/bin";
  const target = () => join(systemBin, "doan");
  // A root-owned /usr/local/bin: read-only for this user except while the fake administrator shell runs the command,
  // after `during` changes the target as something running as root could.
  function rootOwned(): void { mkdirSync(systemBin, { recursive: true }); chmodSync(systemBin, 0o555); }
  const asRoot = (during: () => void = () => {}) => async (command: string): Promise<AdminResult> => {
    chmodSync(systemBin, 0o755);
    try { during(); execFileSync("/bin/sh", ["-c", command], { stdio: "ignore" }); return { kind: "ok" }; }
    catch { return { kind: "failed", message: "exit" }; }
    finally { chmodSync(systemBin, 0o555); }
  };
  afterEach(() => { if (existsSync(systemBin)) chmodSync(systemBin, 0o755); });

  it("runs only absolute system binaries under a cleared environment", () => {
    const command = adminCommand({ path: "/usr/local/bin/doan", want: "/Users/o'neil/.local/share/doan/current/bin/doan" });
    expect(command).toBe("/usr/bin/env -i PATH=/usr/bin:/bin /bin/mkdir -p '/usr/local/bin' && /usr/bin/env -i PATH=/usr/bin:/bin /bin/ln -s -h '/Users/o'\\''neil/.local/share/doan/current/bin/doan' '/usr/local/bin/doan'");
    expect(command).not.toContain(process.execPath);
  });

  it("asks when /usr/local/bin is not writable and creates the link there", async () => {
    rootOwned();
    const admin = vi.fn(asRoot());
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: admin }));
    expect(admin).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(readlinkSync(target())).toBe(`${share()}/current/bin/doan`);
  });

  it("does not follow a link to a folder that appears while the dialog is open", async () => {
    rootOwned(); mkdirSync(join(temp, "elsewhere"));
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: asRoot(() => symlinkSync(join(temp, "elsewhere"), target())) }));
    expect(result.items).toEqual([{ target: "system-cli", path: target(), providers: ALL, reason: "foreign", found: "link" }]);
    expect(readdirSync(join(temp, "elsewhere"))).toEqual([]);
  });

  it("does not replace a file that appears while the dialog is open", async () => {
    rootOwned();
    const result = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: asRoot(() => writeFileSync(target(), "FOREIGN")) }));
    expect(readFileSync(target(), "utf8")).toBe("FOREIGN");
    expect(result.items).toEqual([{ target: "system-cli", path: target(), providers: ALL, reason: "foreign", found: "file" }]);
  });

  it("handles paths with spaces and quotes", async () => {
    systemBin = join(temp, "sys bin's \"x\"");
    const created = await runAgentSetup(options({ loginPath: noLocalBin, runAdmin: shellAdmin() }));
    expect(created.items).toEqual([]);
    expect(readlinkSync(target())).toBe(`${share()}/current/bin/doan`);
  });
});
