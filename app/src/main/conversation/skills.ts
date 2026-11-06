import type { Provider } from "../agentAuth/types";
import type { Prepared } from "./service";
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
  // A folder without its skills list is a broken answer; only single rows that do not fit are dropped.
  if (!result.data.every(folder => record(folder) && Array.isArray(folder.skills))) throw new Error("session_unavailable");
  return limited((result.data as Record<string, unknown[]>[]).flatMap(folder => folder.skills!.filter(record))
    .filter(s => s.scope === "repo" && s.enabled !== false && s.pluginId == null && name(s.name))
    .map(s => ({ name: s.name as string, description: typeof s.description === "string" ? firstLine(s.description) : "" })));
}

function free(input: Prepared): void {
  void input.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// Skills change in the repository while the app runs, so unlike ModelCatalog this keeps a list only briefly: a key is
// read at most once in this window, and every list opening asks again after it.
const FRESH_MS = 30_000;
// Lists for Claude and Codex; the other providers answer an empty list without opening anything. As in ModelCatalog,
// every request prepares under its own lease, which reads the connection and installed version that key the list
// (POSTMORTEM 2026-11-06): a sign-out fails the request and a reconnection reads again inside the window, and a read
// begun under the previous connection fills only that connection's key. A request served from a list or from a read in
// flight frees its lease at once; the shared read keeps the lease of the request that started it. A failure passes its
// error on (the ipc maps it to a start code) and records no time, so the next request reads again; the host keeps
// showing the last list it received.
export class SkillCatalog {
  private last = new Map<string, { skills: SkillSummary[]; at: number }>();
  private reading = new Map<string, Promise<SkillSummary[]>>();
  constructor(private prepare: (root: string, provider: Provider) => Promise<Prepared>, private list: (input: Prepared) => Promise<SkillSummary[]>, private now: () => number = Date.now) {}
  async skills(root: string, provider: Provider): Promise<{ skills: SkillSummary[] }> {
    if (provider !== "claude" && provider !== "codex") return { skills: [] };
    const input = await this.prepare(root, provider);
    const key = JSON.stringify([root, provider, input.owner?.connectionId ?? "", input.installed ?? ""]);
    const last = this.last.get(key);
    if (last && this.now() - last.at < FRESH_MS) { free(input); return { skills: last.skills }; }
    let reading = this.reading.get(key);
    if (reading) free(input);
    else {
      const started = this.list(input);
      reading = started; this.reading.set(key, started);
      const done = () => { if (this.reading.get(key) === started) this.reading.delete(key); };
      started.then(skills => { this.last.set(key, { skills, at: this.now() }); done(); }, done);
    }
    return { skills: await reading };
  }
}
