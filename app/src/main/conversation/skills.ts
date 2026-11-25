import type { Provider } from "../agentAuth/types";
import { COMMAND_ALLOWLIST } from "./providerCommands";
import type { Prepared } from "./service";
import { parseCliVersion, storedVersionAtLeast } from "./sessions";
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
// Agent SDK initializationResult().commands has no source field; each description ends with its source, so only the
// " (project)" tail is kept (a changed tail empties the list rather than leaking others). A skill named doan is dropped.
const PROJECT = " (project)";
export function parseClaudeSkills(commands: unknown): SkillSummary[] {
  if (!Array.isArray(commands)) throw new Error("session_unavailable");
  return limited(commands.filter(record).filter(c => c.builtin !== true && name(c.name) && c.name !== "doan" &&
    typeof c.description === "string" && c.description.endsWith(PROJECT))
    .map(c => ({ kind: "skill" as const, name: c.name as string, description: firstLine((c.description as string).slice(0, -PROJECT.length)) })));
}
// Codex app-server skills/list: {data: [{cwd, skills: [{name, description, path, scope, enabled, pluginId}], errors}]}.
// Only repository skills: "user" holds ~/.agents/skills and the Doan stubs, "system" bundled ones, pluginId a plugin's.
export function parseCodexSkills(result: unknown): SkillSummary[] {
  if (!record(result) || !Array.isArray(result.data)) throw new Error("session_unavailable");
  // A folder without its skills list is a broken answer; only single rows that do not fit are dropped.
  if (!result.data.every(folder => record(folder) && Array.isArray(folder.skills))) throw new Error("session_unavailable");
  return limited((result.data as Record<string, unknown[]>[]).flatMap(folder => folder.skills!.filter(record))
    .filter(s => s.scope === "repo" && s.enabled !== false && s.pluginId == null && name(s.name))
    .map(s => ({ kind: "skill" as const, name: s.name as string, description: typeof s.description === "string" ? firstLine(s.description) : "" })));
}

// The provider's built-in commands Doan runs (providerCommands.ts), only from the confirmed version on. Claude and Codex
// list the whole table, with `reported` lending descriptions; an ACP row needs the server to report it.
const PLACEHOLDER = "Built-in command.";
export function allowedCommands(provider: Provider, installed: string | undefined, reported?: ReadonlyMap<string, string>): SkillSummary[] {
  const table = COMMAND_ALLOWLIST[provider];
  // `installed` keeps a +build suffix, which a stored version never has: only the core is compared.
  if (!storedVersionAtLeast(installed && parseCliVersion(installed)?.core, table.version)) return [];
  const acp = provider !== "claude" && provider !== "codex";
  return table.commands.filter(c => !acp || reported?.has(c.name)).map(c => {
    const said = reported?.get(c.name);
    return { kind: "command" as const, name: c.name, description: said && said !== PLACEHOLDER ? said : c.description };
  });
}
// Agent SDK initializationResult().commands, the same answer parseClaudeSkills reads: its builtin rows lend descriptions.
export function parseClaudeCommands(commands: unknown, installed: string | undefined): SkillSummary[] {
  if (!Array.isArray(commands)) throw new Error("session_unavailable");
  const reported = new Map(commands.filter(record).filter(c => c.builtin === true && name(c.name) && typeof c.description === "string")
    .map(c => [c.name as string, firstLine(c.description as string)]));
  return allowedCommands("claude", installed, reported);
}
// An ACP session/update's update {sessionUpdate: "available_commands_update", availableCommands: [{name, description,
// input?}]}. Names come without the slash.
export function parseAcpCommands(provider: Provider, update: unknown, installed: string | undefined): SkillSummary[] {
  if (!record(update) || update.sessionUpdate !== "available_commands_update" || !Array.isArray(update.availableCommands)) throw new Error("session_unavailable");
  const rows = update.availableCommands.filter(record).filter(c => name(c.name));
  return allowedCommands(provider, installed, new Map(rows.map(c => [c.name as string, typeof c.description === "string" ? firstLine(c.description) : ""])));
}
// Every command name an available_commands_update reports, the ones Doan does not list included; null for one it cannot
// read, as parseAcpCommands refuses it.
export function acpReportedNames(update: unknown): string[] | null {
  if (!record(update) || update.sessionUpdate !== "available_commands_update" || !Array.isArray(update.availableCommands)) return null;
  return [...new Set(update.availableCommands.filter(record).map(c => c.name).filter(name))].slice(0, ROWS);
}
// The commands an ACP conversation's connection last reported, pushed at the server's own times. An unreadable update
// keeps the list; another connection never shows it (POSTMORTEM 2026-11-06).
export interface AcpCommandList { connectionId: string; commands: SkillSummary[] }
export function acpCommandsAfter(previous: AcpCommandList | null, connectionId: string, provider: Provider, update: unknown, installed: string | undefined): AcpCommandList | null {
  const kept = previous?.connectionId === connectionId ? previous : null;
  try { return { connectionId, commands: parseAcpCommands(provider, update, installed) }; }
  catch { return kept; }
}

function free(input: Prepared): void {
  void input.release?.().catch(error => console.error("doan: account lease release failed", error));
}
// Skills change in the repository while the app runs, so unlike ModelCatalog this keeps a list only briefly: a key is
// read at most once in this window, and every list opening asks again after it.
const FRESH_MS = 30_000;
// Lists for Claude and Codex; other providers get an empty list. Every request prepares under its own lease, keying the
// list by connection and version (POSTMORTEM 2026-11-06); a failure records no time, so the next request reads again.
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
