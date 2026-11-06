import type { SkillSummary } from "./types";

// Both lists carry repository text that anyone with push access wrote, and it crosses IPC into every composer.
const ROWS = 200, NAME = 64, DESCRIPTION = 200;
// A name goes into a fixed line "Use the project skill `<name>`." and is matched as one /word in the person's text.
const UNWRITABLE = /[\s\p{Cc}`]/u;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function name(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= NAME && !UNWRITABLE.test(value);
}
function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0]!.slice(0, DESCRIPTION);
  return /[\uD800-\uDBFF]$/.test(line) ? line.slice(0, -1) : line;
}
function limited(rows: SkillSummary[]): SkillSummary[] {
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(r.name) && !!seen.add(r.name)).slice(0, ROWS);
}
// Agent SDK initializationResult().commands: {name, description, argumentHint, builtin?, aliases?}, with no source
// field. Claude Code 2.1.284 and 2.1.318 end each description with its source: " (project)", " (user)" (the Doan stub),
// " (claude.ai sync)", " (MCP)" (MCP prompts and claude.ai connectors, which only supportedCommands() lists after the
// servers connect). Only the project tail is kept, so a change to that tail empties the list instead of leaking others.
// A project skill named doan is left out with the stub, which the name alone tells apart.
const PROJECT = " (project)";
export function parseClaudeSkills(commands: unknown): SkillSummary[] {
  if (!Array.isArray(commands)) throw new Error("session_unavailable");
  return limited(commands.filter(record).filter(c => c.builtin !== true && name(c.name) && c.name !== "doan" &&
    typeof c.description === "string" && c.description.endsWith(PROJECT))
    .map(c => ({ name: c.name as string, description: firstLine((c.description as string).slice(0, -PROJECT.length)) })));
}
// Codex app-server skills/list (0.158.0, 0.166.0): {data: [{cwd, skills: [{name, description, path, scope, enabled,
// pluginId, ...}], errors}]}. Only the repository's own skills: scope "user" includes the person's real ~/.agents/skills
// and the Doan stubs, "system" the profile's bundled skills, and a pluginId marks a marketplace plugin's skill. errors
// lists SKILL.md files Codex could not read; those are simply not offered.
export function parseCodexSkills(result: unknown): SkillSummary[] {
  if (!record(result) || !Array.isArray(result.data)) throw new Error("session_unavailable");
  return limited(result.data.filter(record).flatMap(folder => Array.isArray(folder.skills) ? folder.skills.filter(record) : [])
    .filter(s => s.scope === "repo" && s.enabled !== false && s.pluginId == null && name(s.name))
    .map(s => ({ name: s.name as string, description: typeof s.description === "string" ? firstLine(s.description) : "" })));
}
