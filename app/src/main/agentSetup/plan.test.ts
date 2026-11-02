import { describe, expect, it } from "vitest";
import { CLAUDE_ALLOW_RULES, classifyTarget, codexRuleText, installEligibility, mergeClaudeAllow, needsSystemLink, plan, plannedTargets, type Observation } from "./plan";

const HOME = "/Users/u";
const SHARE = `${HOME}/.local/share/doan`;
const RESOURCES = "/Applications/Doan.app/Contents/Resources";
const link = (value: string): Observation => ({ kind: "symlink", value });
const MISSING: Observation = { kind: "missing" };

describe("installEligibility", () => {
  it.each([
    ["/Applications/Doan.app", true, "eligible"],
    [`${HOME}/Applications/Doan.app`, true, "eligible"],
    // The bundle name is not checked: a renamed copy in Applications sets up agents too.
    ["/Applications/Doan 2.app", true, "eligible"],
    ["/Applications/Doan.app", false, "dev"],
    ["/Applications/Tools/Doan.app", true, "outside-applications"],
    [`${HOME}/code/doan/app/dist/mac-arm64/Doan.app`, true, "outside-applications"],
    ["/Users/other/Applications/Doan.app", true, "outside-applications"],
    ["/private/var/folders/x/AppTranslocation/1234/d/Doan.app", true, "translocated"],
  ] as const)("%s packaged=%s is %s", (bundle, packaged, expected) => {
    expect(installEligibility(bundle, HOME, packaged)).toBe(expected);
  });
});

describe("needsSystemLink", () => {
  it("is true only when ~/.local/bin is not on the login shell's PATH", () => {
    expect(needsSystemLink("/usr/bin:/bin", HOME)).toBe(true);
    expect(needsSystemLink(`/usr/bin:${HOME}/.local/bin/`, HOME)).toBe(false);
    expect(needsSystemLink(`/usr/bin:${HOME}/.local/bin`, HOME)).toBe(false);
    // A relative entry is not the directory, whatever the working directory.
    expect(needsSystemLink(".local/bin:/bin", HOME)).toBe(true);
    // Without a PATH there is no evidence the dialog is needed.
    expect(needsSystemLink(null, HOME)).toBe(false);
  });
});

describe("classifyTarget", () => {
  // Classification reads the link value only: an existing and a broken target with the same value classify alike, so
  // each protected value appears with a path that exists on a Mac (/Applications, /opt) and one that does not.
  it.each([
    ["cli", link(`${SHARE}/current/bin/doan`), "ours"],
    ["cli", link("/Applications/Doan.app/Contents/Resources/bin/doan"), "legacy-ours"],
    ["cli", link("/Users/u/code/onboard-l2/app/dist/mac-arm64/doan.APP/Contents/Resources/bin/doan"), "legacy-ours"],
    ["cli", link("../share/doan/current/bin/doan"), "foreign"],
    ["cli", link("../../Applications/Doan.app/Contents/Resources/bin/doan"), "foreign"],
    ["cli", link("/opt/homebrew/bin/doan"), "foreign"],
    ["cli", link("/nowhere/bin/doan"), "foreign"],
    ["cli", link(`${SHARE}/../../../../etc/doan`), "foreign"],
    ["cli", link("/Users/other/.local/share/doan/current/bin/doan"), "foreign"],
    ["cli", { kind: "file" }, "foreign"],
    ["cli", { kind: "directory" }, "foreign"],
    ["cli", { kind: "other" }, "foreign"],
    ["cli", MISSING, "missing"],
    ["system-cli", link(`${SHARE}/current/bin/doan`), "ours"],
    // Only the exact link is ours in /usr/local/bin: nothing there is ever replaced under root.
    ["system-cli", link(`${SHARE}/old/bin/doan`), "foreign"],
    // Connect never wrote /usr/local/bin, so the legacy form is someone else's there.
    ["system-cli", link("/Applications/Doan.app/Contents/Resources/bin/doan"), "foreign"],
    ["current", link("/Applications/Doan 2.app/Contents/Resources"), "ours"],
    ["current", link("/nowhere/Doan.app/Contents/Resources"), "ours"],
    ["current", { kind: "directory" }, "foreign"],
    ["current", { kind: "file" }, "foreign"],
    ["skill", link("/elsewhere"), "ours"],
    ["claude-skill", link(`${SHARE}/skill`), "ours"],
    ["claude-skill", link("../../.agents/skills/doan"), "legacy-ours"],
    ["claude-skill", link("../.agents/skills/doan"), "foreign"],
    ["claude-skill", link("/Users/u/.agents/skills/doan"), "foreign"],
    ["claude-skill", { kind: "directory" }, "foreign"],
    ["agents-skill", link("../../.agents/skills/doan"), "foreign"],
    // Connect's copied stub folder is left for the person to delete.
    ["agents-skill", { kind: "directory" }, "foreign"],
    ["agents-skill", link("/opt/homebrew"), "foreign"],
    ["gemini-skill", link(`${SHARE}/skill`), "ours"],
    ["gemini-skill", MISSING, "missing"],
    ["codex-rule", { kind: "file", content: codexRuleText() }, "ours"],
    ["codex-rule", { kind: "file", content: `${codexRuleText()}prefix_rule(pattern=["rm"], decision="allow")\n` }, "foreign"],
    ["codex-rule", { kind: "file", content: 'prefix_rule(pattern=["doan"], decision="allow")\n' }, "foreign"],
    ["codex-rule", link(`${SHARE}/current/doan.rules`), "foreign"],
    ["codex-rule", { kind: "directory" }, "foreign"],
    ["codex-rule", MISSING, "missing"],
  ] as const)("%s %j is %s", (target, observation, expected) => {
    expect(classifyTarget(target, HOME, observation)).toBe(expected);
  });
});

describe("plannedTargets", () => {
  it("lists ego's layout with absolute values from HOME and the bundle", () => {
    expect(plannedTargets(HOME, RESOURCES, ["claude", "codex", "gemini"], true).map(t => [t.target, t.path, t.want])).toEqual([
      ["current", `${SHARE}/current`, RESOURCES],
      ["skill", `${SHARE}/skill`, `${SHARE}/current/skills/doan`],
      ["cli", `${HOME}/.local/bin/doan`, `${SHARE}/current/bin/doan`],
      ["system-cli", "/usr/local/bin/doan", `${SHARE}/current/bin/doan`],
      ["agents-skill", `${HOME}/.agents/skills/doan`, `${SHARE}/skill`],
      ["claude-skill", `${HOME}/.claude/skills/doan`, `${SHARE}/skill`],
      ["gemini-skill", `${HOME}/.gemini/config/skills/doan`, `${SHARE}/skill`],
      ["codex-rule", `${HOME}/.codex/rules/doan.rules`, codexRuleText()],
      ["claude-allow", `${HOME}/.claude/settings.json`, `${JSON.stringify({ permissions: { allow: CLAUDE_ALLOW_RULES } }, null, 2)}\n`],
    ]);
  });

  it("allows every doan command, as ego lite does for its CLI", () => {
    expect(codexRuleText()).toMatch(/^prefix_rule\(pattern=\["doan"\], decision="allow"\)$/m);
  });

  it("leaves out missing provider folders and the system link when PATH has ~/.local/bin", () => {
    expect(plannedTargets(HOME, RESOURCES, [], false).map(t => t.target)).toEqual(["current", "skill", "cli", "agents-skill"]);
    expect(plannedTargets(HOME, RESOURCES, ["gemini"], false).map(t => t.target)).toEqual(["current", "skill", "cli", "agents-skill", "gemini-skill"]);
  });
});

describe("plan", () => {
  const targets = plannedTargets(HOME, RESOURCES, ["claude", "gemini"], false);
  const settled = (overrides: Record<string, Observation> = {}): Record<string, Observation> =>
    Object.fromEntries(targets.map(t => [t.target, overrides[t.target] ?? (t.file ? { kind: "file", content: t.want, real: t.path } : { ...link(t.want), real: t.path })]));
  const actions = (steps: ReturnType<typeof plan>) => steps.map(step => [step.target, step.action === "skip" ? ("on" in step ? `skip:${step.on}` : `skip:${step.item.reason}`) : step.action]);

  it("creates everything on a fresh HOME", () => {
    const observations = Object.fromEntries(targets.map(t => [t.target, { ...MISSING, real: t.path }]));
    expect(actions(plan(targets, observations, HOME)).map(([, action]) => action)).toEqual(Array(targets.length).fill("create"));
  });

  it("keeps everything on the second run", () => {
    expect(actions(plan(targets, settled(), HOME)).map(([, action]) => action)).toEqual(Array(targets.length).fill("keep"));
  });

  it("replaces only current after the app moves", () => {
    expect(actions(plan(targets, settled({ current: { ...link("/Users/u/Applications/Doan.app/Contents/Resources"), real: `${SHARE}/current` } }), HOME))).toEqual([
      ["current", "replace"], ["skill", "keep"], ["cli", "keep"], ["agents-skill", "keep"], ["claude-skill", "keep"], ["gemini-skill", "keep"], ["claude-allow", "keep"],
    ]);
  });

  it("replaces Connect's legacy links", () => {
    expect(actions(plan(targets, settled({
      cli: { ...link("/Users/u/code/onboard-l2/app/dist/mac-arm64/Doan.app/Contents/Resources/bin/doan"), real: `${HOME}/.local/bin/doan` },
      "claude-skill": { ...link("../../.agents/skills/doan"), real: `${HOME}/.claude/skills/doan` },
    }), HOME)).filter(([, action]) => action !== "keep")).toEqual([["cli", "replace"], ["claude-skill", "replace"]]);
  });

  it("skips everything that goes through a foreign current and reports current only", () => {
    const steps = plan(targets, settled({ current: { kind: "directory", real: `${SHARE}/current` } }), HOME);
    expect(actions(steps)).toEqual([
      ["current", "skip:foreign"], ["skill", "skip:current"], ["cli", "skip:current"], ["agents-skill", "skip:current"], ["claude-skill", "skip:current"], ["gemini-skill", "skip:current"], ["claude-allow", "skip:current"],
    ]);
    expect(steps[0]).toMatchObject({ item: { target: "current", path: `${SHARE}/current`, reason: "foreign", found: "folder", providers: ["claude", "codex", "cursor", "antigravity", "copilot"] } });
  });

  it("skips the skill links behind a foreign skill link, not the CLI", () => {
    expect(actions(plan(targets, settled({ skill: { kind: "file", real: `${SHARE}/skill` } }), HOME))).toEqual([
      ["current", "keep"], ["skill", "skip:foreign"], ["cli", "keep"], ["agents-skill", "skip:skill"], ["claude-skill", "skip:skill"], ["gemini-skill", "skip:skill"], ["claude-allow", "keep"],
    ]);
  });

  it("reports a blocked ancestor as a write failure", () => {
    const steps = plan(targets, settled({ "gemini-skill": { kind: "missing", blockedParent: `${HOME}/.gemini/config`, real: null } }), HOME);
    expect(steps.find(step => step.target === "gemini-skill")).toMatchObject({ action: "skip", item: { target: "gemini-skill", reason: "write-failed", cause: "blocked-parent", at: `${HOME}/.gemini/config` } });
  });

  it("writes the Codex rule only when the doan on PATH is Doan's", () => {
    const codex = plannedTargets(HOME, RESOURCES, ["codex"], true);
    const fresh = (overrides: Record<string, Observation>) => Object.fromEntries(codex.map(t => [t.target, overrides[t.target] ?? { ...MISSING, real: t.path }]));
    expect(actions(plan(codex, fresh({}), HOME)).at(-1)).toEqual(["codex-rule", "create"]);
    expect(actions(plan(codex, fresh({ cli: { kind: "file", real: `${HOME}/.local/bin/doan` } }), HOME)).at(-1)).toEqual(["codex-rule", "skip:cli"]);
    expect(actions(plan(codex, fresh({ "system-cli": { kind: "file", real: "/usr/local/bin/doan" } }), HOME)).at(-1)).toEqual(["codex-rule", "skip:system-cli"]);
    expect(actions(plan(codex, fresh({ "codex-rule": { kind: "file", content: codexRuleText(), real: `${HOME}/.codex/rules/doan.rules` } }), HOME)).at(-1)).toEqual(["codex-rule", "keep"]);
  });

  it("counts ~/.claude/skills resolving to ~/.agents/skills as one target", () => {
    const shared = `${HOME}/.agents/skills/doan`;
    const steps = plan(targets, settled({ "agents-skill": { kind: "directory", real: shared }, "claude-skill": { kind: "directory", real: shared } }), HOME);
    expect(actions(steps).slice(3, 5)).toEqual([["agents-skill", "skip:foreign"], ["claude-skill", "shared"]]);
    expect(steps[3]).toMatchObject({ item: { providers: ["claude", "codex", "cursor", "copilot"] } });
  });

});

describe("mergeClaudeAllow", () => {
  const RULES = ["Bash(doan work start *)", "Bash(doan work done *)"];
  const written = (text: string | null) => {
    const result = mergeClaudeAllow(text);
    if (result.kind !== "write") throw new Error(`expected a write, got ${JSON.stringify(result)}`);
    return result.text;
  };

  it("allows exactly doan work start and doan work done, with arguments", () => {
    expect(CLAUDE_ALLOW_RULES).toEqual(RULES);
  });

  it("creates the settings for a missing file", () => {
    const text = written(null);
    expect(JSON.parse(text)).toEqual({ permissions: { allow: RULES } });
    expect(text).toBe(`${JSON.stringify({ permissions: { allow: RULES } }, null, 2)}\n`);
  });

  it("keeps every other key and allow entry, adding only the missing rules after them", () => {
    const before = { model: "opus", env: { A: "1" }, permissions: { allow: ["Bash(npm run *)", RULES[1]], deny: ["Bash(rm *)"], defaultMode: "default" }, hooks: { Stop: [] } };
    const after = JSON.parse(written(JSON.stringify(before)));
    expect(after).toEqual({ ...before, permissions: { ...before.permissions, allow: ["Bash(npm run *)", RULES[1], RULES[0]] } });
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it("adds allow to permissions, and permissions to the settings, when they are missing", () => {
    expect(JSON.parse(written('{"permissions":{"deny":[]}}'))).toEqual({ permissions: { deny: [], allow: RULES } });
    expect(JSON.parse(written('{"theme":"dark"}'))).toEqual({ theme: "dark", permissions: { allow: RULES } });
  });

  it("writes nothing when both rules are there, so a second run is the same", () => {
    expect(mergeClaudeAllow(written('{"theme":"dark"}'))).toEqual({ kind: "keep" });
    expect(mergeClaudeAllow(`{ "permissions": { "allow": [${RULES.map(rule => JSON.stringify(rule)).join(", ")}] } }`)).toEqual({ kind: "keep" });
  });

  it("leaves every other byte as it was, so numbers JSON.parse cannot hold keep their text", () => {
    expect(written('{"customId":9007199254740993,"customLimit":1e400,"permissions":{"allow":[]}}'))
      .toBe('{"customId":9007199254740993,"customLimit":1e400,"permissions":{"allow":["Bash(doan work start *)", "Bash(doan work done *)"]}}');
    const pretty = '{\n  "model": "opus",\n  "permissions": {\n    "allow": [\n      "Bash(npm run *)"\n    ]\n  }\n}\n';
    expect(written(pretty)).toBe('{\n  "model": "opus",\n  "permissions": {\n    "allow": [\n      "Bash(npm run *)",\n      "Bash(doan work start *)",\n      "Bash(doan work done *)"\n    ]\n  }\n}\n');
    expect(written('{ "theme": "dark" }\n')).toBe('{ "theme": "dark", "permissions": {"allow": ["Bash(doan work start *)", "Bash(doan work done *)"]} }\n');
    expect(written('{"permissions":{}}')).toBe('{"permissions":{"allow": ["Bash(doan work start *)", "Bash(doan work done *)"]}}');
  });

  it("keeps duplicate keys, adding the rules to the allow list Claude Code reads (the last one)", () => {
    expect(written('{"permissions":{"allow":["a"]},"x":1,"x":2,"permissions":{"allow":[],"allow":["b"]}}'))
      .toBe('{"permissions":{"allow":["a"]},"x":1,"x":2,"permissions":{"allow":[],"allow":["b","Bash(doan work start *)","Bash(doan work done *)"]}}');
    expect(mergeClaudeAllow(`{"permissions":{"allow":${JSON.stringify(RULES)}},"permissions":{}}`)).toMatchObject({ kind: "write" });
    expect(mergeClaudeAllow(`{"permissions":{},"permissions":{"allow":${JSON.stringify(RULES)}}}`)).toEqual({ kind: "keep" });
  });

  // RC2-3: JSON.parse accepts this, so the scan that finds where to insert must not run out of stack on it.
  it("adds the rules to deep but valid JSON", () => {
    const deep = `{"unrelated":${"[".repeat(10000)}0${"]".repeat(10000)},"permissions":{"allow":[]}}`;
    expect(written(deep)).toBe(`${deep.slice(0, -3)}"Bash(doan work start *)", "Bash(doan work done *)"]}}`);
  });

  it("does not count a broader rule as one of Doan's", () => {
    expect(JSON.parse(written('{"permissions":{"allow":["Bash(doan *)"]}}')).permissions.allow).toEqual(["Bash(doan *)", ...RULES]);
  });

  it.each([
    ["an empty file", "", "json"],
    ["broken JSON", '{"permissions": {"allow": []},}', "json"],
    ["JSON with comments", '// mine\n{"permissions": {}}', "json"],
    ["a list", "[]", "object"],
    ["null", "null", "object"],
    ["a string", '"x"', "object"],
    ["permissions as a list", '{"permissions": []}', "permissions"],
    ["permissions as null", '{"permissions": null}', "permissions"],
    ["permissions as a string", '{"permissions": "allow"}', "permissions"],
    ["allow as a string", '{"permissions": {"allow": "Bash(doan *)"}}', "allow"],
    ["allow as an object", '{"permissions": {"allow": {}}}', "allow"],
    ["allow as null", '{"permissions": {"allow": null}}', "allow"],
  ] as const)("refuses %s", (_name, text, problem) => {
    expect(mergeClaudeAllow(text)).toEqual({ kind: "refuse", problem });
  });
});
