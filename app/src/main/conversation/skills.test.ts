import { describe, expect, it } from "vitest";
import { parseClaudeSkills, parseCodexSkills } from "./skills";
// Recorded answers from a probe repository (.claude/skills, .claude/commands, .agents/skills, a symlinked skill and odd
// names), with the person's own rows replaced by generic rows of the same shape: Claude initializationResult().commands
// and Codex skills/list {cwds: [root], forceReload: true} for an untrusted project.
import claude318 from "./fixtures/skills-claude-2.1.318.json";
import claude284 from "./fixtures/skills-claude-2.1.284.json";
import codex166 from "./fixtures/skills-codex-0.166.0.json";
import codex158 from "./fixtures/skills-codex-0.158.0.json";

const LONG = `long-${"x".repeat(59)}`;
const probe = (name: string, kind = "skill") => ({ name, description: `Probe ${kind} ${name} for the Doan PoC.` });

describe("parseClaudeSkills", () => {
  it("keeps only the project rows of a recorded answer, at the current and the minimum version, without the source tail", () => {
    const expected = [probe("a"), probe("d"), probe("ends-bang!"), probe(LONG), probe("manual"), probe("Upper-Case"), probe("한글스킬"),
      probe("b", "command"), { name: "sub:x", description: "Probe nested command x for the Doan PoC." }];
    expect(parseClaudeSkills(claude318.commands)).toEqual(expected);
    expect(parseClaudeSkills(claude284.commands)).toEqual(expected);
  });
  it("leaves out built-in commands, the user-scope doan stub, claude.ai sync rows and MCP prompts", () => {
    expect(parseClaudeSkills([
      { name: "compact", description: "Built-in command.", argumentHint: "", builtin: true },
      { name: "fake-builtin", description: "Looks local. (project)", argumentHint: "", builtin: true },
      { name: "doan", description: "Create and revise design canvases with the doan CLI and app. (user)", argumentHint: "" },
      { name: "synced", description: "Synced skill. (claude.ai sync)", argumentHint: "", aliases: ["anthropic-skills:synced"] },
      { name: "probe:probe-prompt", description: "A prompt. (MCP)", argumentHint: "" },
      { name: "plain", description: "No source tail", argumentHint: "" },
      { name: "kept", description: "Kept. (project)", argumentHint: "" },
    ])).toEqual([{ name: "kept", description: "Kept." }]);
  });
  // A project skill named doan is hidden too: the name alone tells the stub apart (spec 'non-goals', accepted).
  it("leaves out a project row named doan", () => {
    expect(parseClaudeSkills([{ name: "doan", description: "Repo skill. (project)" }])).toEqual([]);
  });
  it("refuses names that cannot be written as one word in a fixed line", () => {
    expect(parseClaudeSkills([
      { name: "", description: "Empty. (project)" },
      { name: "two words", description: "Space. (project)" },
      { name: "tab\tname", description: "Tab. (project)" },
      { name: "line\nbreak", description: "Newline. (project)" },
      { name: "nb sp", description: "NBSP. (project)" },
      { name: "tick`name", description: "Backtick. (project)" },
      { name: "nul\u0000name", description: "Control. (project)" },
      { name: `${LONG}y`, description: "65 code units. (project)" },
      { name: LONG, description: "64 code units. (project)" },
      { name: 7, description: "Number. (project)" },
      { description: "No name. (project)" },
      "row", null,
    ])).toEqual([{ name: LONG, description: "64 code units." }]);
  });
  it("keeps the first row of a name", () => {
    expect(parseClaudeSkills([
      { name: "deploy", description: "First. (project)" },
      { name: "deploy", description: "Second. (project)" },
    ])).toEqual([{ name: "deploy", description: "First." }]);
  });
  it("keeps only the description's first line, up to 200 code units, and allows an empty one", () => {
    const long = "y".repeat(250);
    expect(parseClaudeSkills([
      { name: "multi", description: "First line\nsecond line (project)" },
      { name: "crlf", description: "First line\r\nsecond (project)" },
      { name: "long", description: `${long} (project)` },
      { name: "pair", description: `${"z".repeat(199)}😀 (project)` },
      { name: "bare", description: " (project)" },
      { name: "tail-only", description: "(project)" },
    ])).toEqual([
      { name: "multi", description: "First line" },
      { name: "crlf", description: "First line" },
      { name: "long", description: "y".repeat(200) },
      // A cut that would split a surrogate pair drops the whole character.
      { name: "pair", description: "z".repeat(199) },
      { name: "bare", description: "" },
    ]);
  });
  it("keeps at most 200 rows", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ name: `s${i}`, description: `Skill ${i}. (project)` }));
    const parsed = parseClaudeSkills(rows);
    expect(parsed).toHaveLength(200);
    expect(parsed.at(-1)).toEqual({ name: "s199", description: "Skill 199." });
  });
  it("refuses an answer that is not a list", () => {
    for (const answer of [undefined, null, {}, "commands"]) expect(() => parseClaudeSkills(answer)).toThrow("session_unavailable");
  });
});

describe("parseCodexSkills", () => {
  it("keeps only the repository rows of a recorded answer, at the current and the minimum version", () => {
    const expected = [probe("Upper-Codex"), probe("c"), probe("d"), probe("manualc")];
    expect(parseCodexSkills(codex166)).toEqual(expected);
    expect(parseCodexSkills(codex158)).toEqual(expected);
  });
  it("leaves out other scopes, disabled skills and plugin skills, and ignores the errors list", () => {
    const row = (name: string, extra: Record<string, unknown>) => ({ name, description: `${name}.`, path: `/r/.agents/skills/${name}/SKILL.md`, scope: "repo", enabled: true, pluginId: null, ...extra });
    expect(parseCodexSkills({ data: [
      { cwd: "/r", skills: [
        row("user", { scope: "user" }), row("system", { scope: "system" }), row("admin", { scope: "admin" }),
        row("off", { enabled: false }), row("plugin", { pluginId: "market/plugin" }),
        row("no-flag", { enabled: undefined, pluginId: undefined }), row("kept", {}),
      ], errors: [{ path: "/r/.agents/skills/broken/SKILL.md", message: "missing YAML frontmatter delimited by ---" }] },
    ] })).toEqual([{ name: "no-flag", description: "no-flag." }, { name: "kept", description: "kept." }]);
  });
  it("unwraps every folder's list, keeps the first row of a name and skips malformed entries", () => {
    expect(parseCodexSkills({ data: [
      { cwd: "/r", skills: [{ name: "a", description: "A first.", scope: "repo" }, { name: "two words", description: "x", scope: "repo" }, "row"] },
      { cwd: "/r/sub", skills: "none" },
      "folder",
      { cwd: "/r/other", skills: [{ name: "a", description: "A again.", scope: "repo" }, { name: "b", scope: "repo" }] },
    ] })).toEqual([{ name: "a", description: "A first." }, { name: "b", description: "" }]);
  });
  it("applies the same description and row limits", () => {
    const skills = Array.from({ length: 250 }, (_, i) => ({ name: `s${i}`, description: `${"d".repeat(300)}\nmore`, scope: "repo", enabled: true }));
    const parsed = parseCodexSkills({ data: [{ cwd: "/r", skills, errors: [] }] });
    expect(parsed).toHaveLength(200);
    expect(parsed[0]).toEqual({ name: "s0", description: "d".repeat(200) });
  });
  it("refuses an answer without a data list", () => {
    for (const answer of [undefined, null, [], { data: {} }, { skills: [] }]) expect(() => parseCodexSkills(answer)).toThrow("session_unavailable");
  });
});
