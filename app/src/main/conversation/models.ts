import { object } from "./sessions";
import type { Provider } from "../agentAuth/types";
import type { Prepared } from "./service";
import type { FastUnusedReason } from "./types";
import type { AcpModes } from "./permissionMode";

// One model the provider listed for a folder. efforts: the levels that model takes, only from Claude and Codex
// (Cursor and Antigravity put effort in the model ID, Copilot has none). defaultEffort: Codex's default level of that
// model, which a send names when the choice has none: turn/start's effort holds for later turns too (0.164.0
// TurnStartParams), so leaving it out would keep the previous turn's level on a reused server.
export interface ModelOption { id: string; label: string; default: boolean; older?: true; efforts?: string[]; defaultEffort?: string; fast?: { description?: string; unavailable?: FastUnusedReason } }
// A provider's list for a folder. modes: the ACP server's mode list from the same session/new reply (none for Claude
// and Codex, whose four modes are fixed, or for an ACP server that listed none).
export interface ModelList { models: ModelOption[]; modes?: AcpModes }
export type ModelsReply = ModelList | { error: string };
const LIMIT = 256, TEXT = 512;
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= TEXT && !value.includes("\0"); }
function levels(values: unknown[]): string[] | undefined {
  const found = [...new Set(values.filter(text))];
  return found.length > 0 ? found : undefined;
}
function unique(models: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return models.filter(m => !seen.has(m.id) && !!seen.add(m.id)).slice(0, LIMIT);
}
// The IDs of a list's earlier generations, which the menus fold. A name splits on "-" into version pieces
// (`\d+(\.\d+)*`) and the family (the rest); a family's rows below its highest version are older. This guesses from
// provider naming, so a name it cannot read (no version piece) stays current rather than disappearing. 8- and 4-digit
// pieces are dates, not versions: read as a version, `claude-haiku-4-5-20251001` would fold the undated 4-5 row. The
// default row counts toward its family's highest version (Claude's paired alias row is already removed) but is never
// older itself.
export function olderIds(entries: { id: string; name: string; isDefault: boolean }[]): Set<string> {
  const read = entries.map(e => {
    const family: string[] = [], version: number[] = [];
    for (const piece of e.name.replace(/\[[^\]]*\]$/, "").split("-")) {
      if (/^(\d{8}|\d{4})$/.test(piece)) continue;
      if (/^\d+(\.\d+)*$/.test(piece)) version.push(...piece.split(".").map(Number));
      else family.push(piece);
    }
    return { ...e, family: family.join("-"), version };
  });
  const newest = new Map<string, number[]>();
  for (const r of read) if (r.version.length && compare(r.version, newest.get(r.family) ?? []) > 0) newest.set(r.family, r.version);
  return new Set(read.filter(r => !r.isDefault && r.version.length && compare(r.version, newest.get(r.family)!) < 0).map(r => r.id));
}
// Piecewise; with equal leading pieces the shorter version is smaller ([6] < [6, 1]).
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}
function markOlder(models: ModelOption[], name: (m: ModelOption) => string = m => m.id): ModelOption[] {
  const older = olderIds(models.map(m => ({ id: m.id, name: name(m), isDefault: m.default })));
  return models.map(m => older.has(m.id) ? { ...m, older: true } : m);
}
// Agent SDK Query.supportedModels() rows; the "default" row is the account's default (0.3.312).
export function parseClaudeModels(rows: unknown): ModelOption[] {
  if (!Array.isArray(rows)) throw new Error("session_unavailable");
  const models = rows.filter(object).filter(r => text(r.value));
  const defaultIndex = models.findIndex(r => r.value === "default");
  const resolved = models[defaultIndex]?.resolvedModel;
  const pairedIndex = text(resolved) ? models.findIndex((r, i) => i !== defaultIndex && r.resolvedModel === resolved) : -1;
  const kept = unique(models.map((r, i) => {
    const named = i === defaultIndex ? models[pairedIndex] ?? r : r;
    const efforts = r.supportsEffort === true && Array.isArray(r.supportedEffortLevels) ? levels(r.supportedEffortLevels) : undefined;
    return { id: String(r.value), label: text(named.displayName) ? named.displayName : String(named.value), default: r.value === "default", ...(efforts ? { efforts } : {}), ...(r.supportsFastMode === true ? { fast: {} } : {}) };
  }).filter((_, i) => i !== pairedIndex));
  // An alias (`opus`) is compared by the model it resolves to; resolvedModel is read only here, not delivered. Only
  // the first row of a value is kept by unique, so only its own resolvedModel counts.
  const resolvedOf = new Map<string, unknown>();
  for (const r of models) if (!resolvedOf.has(String(r.value))) resolvedOf.set(String(r.value), r.resolvedModel);
  return markOlder(kept, m => { const resolved = resolvedOf.get(m.id); return text(resolved) ? resolved : m.id; });
}
// Codex app-server model/list result (0.164.0): {data: [{id, displayName, isDefault, supportedReasoningEfforts}]}.
export function parseCodexModels(result: unknown): ModelOption[] {
  if (!object(result) || !Array.isArray(result.data)) throw new Error("session_unavailable");
  return markOlder(unique(result.data.filter(object).filter(r => text(r.id) && r.hidden !== true).map(r => {
    const efforts = Array.isArray(r.supportedReasoningEfforts) ? levels(r.supportedReasoningEfforts.filter(object).map(e => e.reasoningEffort)) : undefined;
    const fallback = text(r.defaultReasoningEffort) && efforts?.includes(r.defaultReasoningEffort) ? r.defaultReasoningEffort : undefined;
    const priority = Array.isArray(r.serviceTiers) ? r.serviceTiers.filter(object).find(t => t.id === "priority") : undefined;
    return { id: String(r.id), label: text(r.displayName) ? r.displayName : String(r.id), default: r.isDefault === true, ...(efforts ? { efforts } : {}), ...(fallback ? { defaultEffort: fallback } : {}), ...(priority ? { fast: { ...(text(priority.description) ? { description: priority.description } : {}) } } : {}) };
  })));
}
// Model-specific and transient failures do not disable other Fast rows during a list read.
export function applyClaudeFastUnavailable(disabledReason: unknown, models: ModelOption[]): ModelOption[] {
  const unavailable: FastUnusedReason | undefined = disabledReason === "free" ? "plan" : disabledReason === "extra_usage_disabled" ? "extra_usage" : disabledReason === "preference" ? "policy" : undefined;
  return unavailable ? models.map(m => m.fast ? { ...m, fast: { ...m.fast, unavailable } } : m) : models;
}
// ACP session/new result: models {currentModelId, availableModels [{modelId, name}]}. Copilot lists `auto` twice.
export function parseAcpModels(result: unknown): ModelOption[] {
  const models = object(result) && object(result.models) ? result.models : null;
  if (!models || !Array.isArray(models.availableModels)) return [];
  return markOlder(unique(models.availableModels.filter(object).filter(r => text(r.modelId)).map(r =>
    ({ id: String(r.modelId), label: text(r.name) ? r.name : String(r.modelId), default: r.modelId === models.currentModelId }))));
}
// ACP session/new (or session/load) result: modes {currentModeId, availableModes [{id, name}]}, and Copilot's
// configOptions entry {id: "allow_all", options [{value: "on"}, {value: "off"}]}.
export function parseAcpModes(result: unknown): AcpModes | undefined {
  const modes = object(result) && object(result.modes) ? result.modes : null;
  if (!modes || !Array.isArray(modes.availableModes)) return undefined;
  const available = [...new Set(modes.availableModes.filter(object).map(m => m.id).filter(text))].slice(0, LIMIT);
  if (!available.length) return undefined;
  const allowAll = acpOption(result, "allow_all");
  const values = allowAll && Array.isArray(allowAll.options) ? allowAll.options.filter(object).map(o => o.value) : [];
  return { available, allowAll: values.includes("on") && values.includes("off") };
}
// One configOptions entry of an ACP session reply by its id.
export function acpOption(result: unknown, id: string): Record<string, unknown> | undefined {
  return object(result) && Array.isArray(result.configOptions) ? result.configOptions.filter(object).find(o => o.id === id) : undefined;
}

const KNOWN = ["no_agent", "not_logged_in", "cli_missing", "cli_install_failed", "runtime_unsupported", "busy", "rate_limited", "process_exited", "session_unavailable", "session_in_use", "project_not_open", "credential_override"];
function code(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message === "outside_root" ? "session_unavailable" : KNOWN.includes(message) ? message : "unknown";
}
// Lists stay in memory until the provider's connection or installed version changes; listing never sends a prompt.
// A start may only name a model (and effort) from the list this run last delivered for that folder and provider.
export class ModelCatalog {
  private cache = new Map<string, Promise<ModelList>>();
  private received = new Map<string, ModelOption[]>();
  constructor(private prepare: (root: string, runtime: Provider) => Promise<Prepared>, private list: (input: Prepared) => Promise<ModelList>) {}
  async models(root: string, runtime: Provider): Promise<ModelsReply> {
    try {
      // The preparation reads the connection and installed version that key the cache, under the run's own lease.
      const input = await this.prepare(root, runtime);
      const key = JSON.stringify([root, runtime, input.owner?.connectionId ?? "", input.installed ?? ""]);
      let pending = this.cache.get(key);
      if (pending) void input.release?.().catch(error => console.error("doan: account lease release failed", error));
      else {
        pending = this.list(input); this.cache.set(key, pending);
        pending.catch(() => { if (this.cache.get(key) === pending) this.cache.delete(key); });
      }
      const { models, modes } = await pending;
      this.received.set(JSON.stringify([root, runtime]), models);
      return { models, ...(modes ? { modes } : {}) };
    } catch (error) { return { error: code(error) }; }
  }
  // The default level of a model in the list this run delivered for that folder and provider, if the list names one.
  defaultEffort(root: string, runtime: Provider, model: string): string | undefined {
    return this.received.get(JSON.stringify([root, runtime]))?.find(m => m.id === model)?.defaultEffort;
  }
  // Whether this run's list says the model takes Fast now. No model: the list's default row, which a conversation without
  // a stored model runs on (Claude `default`, Codex isDefault).
  fast(root: string, runtime: Provider, model: string | undefined): boolean {
    const id = model ?? this.received.get(JSON.stringify([root, runtime]))?.find(m => m.default)?.id;
    return id !== undefined && this.accepts(root, runtime, id, undefined, true);
  }
  accepts(root: string, runtime: Provider, model: string, effort: string | undefined, fast?: boolean): boolean {
    const found = this.received.get(JSON.stringify([root, runtime]))?.find(m => m.id === model);
    return !!found && (effort === undefined || !!found.efforts?.includes(effort)) &&
      (fast !== true || (found.fast !== undefined && found.fast.unavailable === undefined));
  }
}
