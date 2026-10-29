import { object } from "./sessions";
import type { Provider } from "../agentAuth/types";
import type { Prepare, Prepared } from "./service";

// One model the provider listed for a folder. efforts: the levels that model takes, only from Claude and Codex
// (Cursor and Antigravity put effort in the model ID, Copilot has none; PRODUCT §6 buzz-home P1).
export interface ModelOption { id: string; label: string; default: boolean; efforts?: string[] }
export type ModelsReply = { models: ModelOption[] } | { error: string };
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
// Agent SDK Query.supportedModels() rows; the "default" row is the account's default (0.3.312).
export function parseClaudeModels(rows: unknown): ModelOption[] {
  if (!Array.isArray(rows)) throw new Error("session_unavailable");
  return unique(rows.filter(object).filter(r => text(r.value)).map(r => {
    const efforts = r.supportsEffort === true && Array.isArray(r.supportedEffortLevels) ? levels(r.supportedEffortLevels) : undefined;
    return { id: String(r.value), label: text(r.displayName) ? r.displayName : String(r.value), default: r.value === "default", ...(efforts ? { efforts } : {}) };
  }));
}
// Codex app-server model/list result (0.164.0): {data: [{id, displayName, isDefault, supportedReasoningEfforts}]}.
export function parseCodexModels(result: unknown): ModelOption[] {
  if (!object(result) || !Array.isArray(result.data)) throw new Error("session_unavailable");
  return unique(result.data.filter(object).filter(r => text(r.id) && r.hidden !== true).map(r => {
    const efforts = Array.isArray(r.supportedReasoningEfforts) ? levels(r.supportedReasoningEfforts.filter(object).map(e => e.reasoningEffort)) : undefined;
    return { id: String(r.id), label: text(r.displayName) ? r.displayName : String(r.id), default: r.isDefault === true, ...(efforts ? { efforts } : {}) };
  }));
}
// ACP session/new result: models {currentModelId, availableModels [{modelId, name}]}. Copilot lists `auto` twice.
export function parseAcpModels(result: unknown): ModelOption[] {
  const models = object(result) && object(result.models) ? result.models : null;
  if (!models || !Array.isArray(models.availableModels)) return [];
  return unique(models.availableModels.filter(object).filter(r => text(r.modelId)).map(r =>
    ({ id: String(r.modelId), label: text(r.name) ? r.name : String(r.modelId), default: r.modelId === models.currentModelId })));
}

const KNOWN = ["no_agent", "not_logged_in", "cli_missing", "cli_install_failed", "runtime_unsupported", "busy", "rate_limited", "process_exited", "session_unavailable", "session_in_use", "project_not_open", "credential_override"];
function code(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message === "outside_root" ? "session_unavailable" : KNOWN.includes(message) ? message : "unknown";
}
// Lists stay in memory until the provider's connection or installed version changes; listing never sends a prompt.
// A start may only name a model (and effort) from the list this run last delivered for that folder and provider.
export class ModelCatalog {
  private cache = new Map<string, Promise<ModelOption[]>>();
  private received = new Map<string, ModelOption[]>();
  constructor(private prepare: Prepare, private list: (input: Prepared) => Promise<ModelOption[]>) {}
  async models(root: string, runtime: Provider): Promise<ModelsReply> {
    try {
      // The preparation reads the connection and installed version that key the cache, under the run's own lease.
      const input = await this.prepare({ root, mode: "new", runtime, text: "", anchors: [] });
      const key = JSON.stringify([root, runtime, input.owner?.connectionId ?? "", input.installed ?? ""]);
      let pending = this.cache.get(key);
      if (pending) void input.release?.().catch(error => console.error("doan: account lease release failed", error));
      else {
        pending = this.list(input); this.cache.set(key, pending);
        pending.catch(() => { if (this.cache.get(key) === pending) this.cache.delete(key); });
      }
      const models = await pending;
      this.received.set(JSON.stringify([root, runtime]), models);
      return { models };
    } catch (error) { return { error: code(error) }; }
  }
  accepts(root: string, runtime: Provider, model: string, effort: string | undefined): boolean {
    const found = this.received.get(JSON.stringify([root, runtime]))?.find(m => m.id === model);
    return !!found && (effort === undefined || !!found.efforts?.includes(effort));
  }
}
