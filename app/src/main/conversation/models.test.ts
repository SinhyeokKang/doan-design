import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyClaudeFastUnavailable, ModelCatalog, olderIds, parseAcpModels, parseAcpModes, parseClaudeModels, parseCodexModels, type ModelList, type ModelOption } from "./models";
import type { Prepared } from "./service";
import type { Provider } from "../agentAuth/types";

// Row shapes recorded from the real providers' model lists; IDs and names are trimmed to the fields doan reads.
it("reads Claude's supportedModels rows with per-model effort levels and the default row", () => {
  expect(parseClaudeModels([
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "Opus", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
    { value: "sonnet", displayName: "Sonnet 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "max"] },
    { value: "haiku", displayName: "Haiku 4.5", description: "", supportsEffort: false },
    { value: "", displayName: "broken" }, "x",
  ])).toEqual([
    { id: "default", label: "Default (recommended)", default: true, efforts: ["low", "medium", "high", "xhigh", "max"] },
    { id: "sonnet", label: "Sonnet 5.5", default: false, efforts: ["low", "medium", "high", "max"] },
    { id: "haiku", label: "Haiku 4.5", default: false },
  ]);
  expect(() => parseClaudeModels({})).toThrow("session_unavailable");
});
it("names Claude's default row after its resolved model and removes the paired row", () => {
  expect(parseClaudeModels([
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", supportsEffort: true, supportedEffortLevels: ["low", "high"], supportsFastMode: true },
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5" },
    { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
  ])).toEqual([
    { id: "default", label: "Opus 5.5", default: true, efforts: ["low", "high"], fast: {} },
    { id: "sonnet", label: "Sonnet 5.5", default: false },
  ]);
});
it("keeps Claude's default row unchanged when no other resolved model matches", () => {
  expect(parseClaudeModels([
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)" },
    { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
  ])).toEqual([
    { id: "default", label: "Default (recommended)", default: true },
    { id: "sonnet", label: "Sonnet 5.5", default: false },
  ]);
});
it.each([
  [undefined, undefined],
  [undefined, "claude-opus-5-5"],
  ["claude-opus-5-5", undefined],
])("keeps Claude's rows when resolvedModel is missing (%s, %s)", (defaultResolved, opusResolved) => {
  expect(parseClaudeModels([
    { value: "default", resolvedModel: defaultResolved, displayName: "Default (recommended)" },
    { value: "opus", resolvedModel: opusResolved, displayName: "Opus 5.5" },
  ])).toEqual([
    { id: "default", label: "Default (recommended)", default: true },
    { id: "opus", label: "Opus 5.5", default: false },
  ]);
});
it("pairs only the first other Claude row with the default row's resolved model", () => {
  expect(parseClaudeModels([
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5" },
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)" },
    { value: "opus-alias", resolvedModel: "claude-opus-5-5", displayName: "Another Opus" },
  ])).toEqual([
    { id: "default", label: "Opus 5.5", default: true },
    { id: "opus-alias", label: "Another Opus", default: false },
  ]);
});
it("reads Codex model/list with isDefault and supportedReasoningEfforts, leaving hidden models out", () => {
  expect(parseCodexModels({ data: [
    { id: "gpt-6-luna", displayName: "GPT-6-Luna", isDefault: true, hidden: false, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "low", description: "" }, { reasoningEffort: "max", description: "" }] },
    { id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra", isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: "ultra" }] },
    { id: "secret", displayName: "Hidden", hidden: true },
  ], nextCursor: null })).toEqual([
    { id: "gpt-6-luna", label: "GPT-6-Luna", default: true, efforts: ["low", "max"] },
    { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false, efforts: ["ultra"] },
  ]);
  expect(() => parseCodexModels({ data: "x" })).toThrow("session_unavailable");
});
it("reads an ACP session/new models list without effort, once per ID, marking the current model as default", () => {
  expect(parseAcpModels({ sessionId: "s", models: { currentModelId: "gemini-3.8-flash-high", availableModels: [
    { modelId: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" }, { modelId: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" }] } }))
    .toEqual([{ id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", default: true }, { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", default: false }]);
  // Copilot's free account listed `auto` twice, the second with usage metadata.
  expect(parseAcpModels({ models: { currentModelId: "auto", availableModels: [{ modelId: "auto", name: "Auto" }, { modelId: "auto", name: "Auto", _meta: { copilotUsage: "1x" } }] } }))
    .toEqual([{ id: "auto", label: "Auto", default: true }]);
  expect(parseAcpModels({ sessionId: "s" })).toEqual([]);
});

const LIST: ModelOption[] = [{ id: "sonnet", label: "Sonnet", default: false, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku", default: true }];
function catalog(over: Partial<Prepared> = {}) {
  let connection = "c1";
  const release = vi.fn(async () => {});
  const prepare = vi.fn(async (root: string, runtime: Provider): Promise<Prepared> => ({ runtime, configDir: "/p", cwd: root, command: "/x", env: {}, release, installed: "1.0.0",
    owner: { kind: "doan", provider: runtime, connectionId: connection, accountId: "a", workspaceId: null, profile: "p" }, ...over }));
  const list = vi.fn(async (input: Prepared): Promise<ModelList> => { await input.release?.(); return { models: LIST }; });
  return { models: new ModelCatalog(prepare, list), prepare, list, release, reconnect: () => { connection = "c2"; } };
}
it("lists once per folder, provider and connection, and once for concurrent reads", async () => {
  const c = catalog();
  const [a, b] = await Promise.all([c.models.models("/repo", "claude"), c.models.models("/repo", "claude")]);
  expect(a).toEqual({ models: LIST }); expect(b).toEqual({ models: LIST });
  expect(c.list).toHaveBeenCalledOnce();
  await c.models.models("/repo", "claude"); expect(c.list).toHaveBeenCalledOnce();
  // Every read's own lease is released, whether it listed or reused the cache.
  expect(c.release).toHaveBeenCalledTimes(3);
  await c.models.models("/other", "claude"); expect(c.list).toHaveBeenCalledTimes(2);
  await c.models.models("/repo", "codex"); expect(c.list).toHaveBeenCalledTimes(3);
  c.reconnect(); await c.models.models("/repo", "claude"); expect(c.list).toHaveBeenCalledTimes(4);
});
it("does not keep a failed list and reports the preparation's code", async () => {
  const c = catalog();
  c.list.mockRejectedValueOnce(new Error("process_exited"));
  expect(await c.models.models("/repo", "cursor")).toEqual({ error: "process_exited" });
  expect(await c.models.models("/repo", "cursor")).toEqual({ models: LIST });
  c.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
  expect(await c.models.models("/repo", "copilot")).toEqual({ error: "not_logged_in" });
  c.prepare.mockRejectedValueOnce(new Error("something private"));
  expect(await c.models.models("/repo", "copilot")).toEqual({ error: "unknown" });
});
it("accepts only a model, and an effort of that model, from the list delivered for that folder and provider", async () => {
  const c = catalog();
  expect(c.models.accepts("/repo", "claude", "sonnet", undefined)).toBe(false);
  await c.models.models("/repo", "claude");
  expect(c.models.accepts("/repo", "claude", "sonnet", "high")).toBe(true);
  expect(c.models.accepts("/repo", "claude", "sonnet", undefined)).toBe(true);
  expect(c.models.accepts("/repo", "claude", "sonnet", "max")).toBe(false);
  expect(c.models.accepts("/repo", "claude", "haiku", "low")).toBe(false);
  expect(c.models.accepts("/repo", "claude", "opus", undefined)).toBe(false);
  expect(c.models.accepts("/other", "claude", "sonnet", undefined)).toBe(false);
  expect(c.models.accepts("/repo", "codex", "sonnet", undefined)).toBe(false);
});

// Codex's turn/start effort overrides "this turn and subsequent turns" (0.164.0 TurnStartParams),
// so a model sent without effort needs the model's default said out loud.
it("keeps a Codex model's default effort only when it is one of its levels", () => {
  expect(parseCodexModels({ data: [
    { id: "a", displayName: "A", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }] },
    { id: "b", displayName: "B", isDefault: false, defaultReasoningEffort: "xhigh", supportedReasoningEfforts: [{ reasoningEffort: "low" }] },
    { id: "c", displayName: "C", isDefault: false, defaultReasoningEffort: "low" },
  ] })).toEqual([
    { id: "a", label: "A", default: true, efforts: ["low", "medium"], defaultEffort: "medium" },
    { id: "b", label: "B", default: false, efforts: ["low"] },
    { id: "c", label: "C", default: false },
  ]);
});
it("answers a model's default effort from the list delivered for that folder and provider", async () => {
  const c = catalog();
  c.list.mockResolvedValue({ models: [{ id: "gpt", label: "GPT", default: true, efforts: ["low", "medium"], defaultEffort: "medium" }, { id: "plain", label: "Plain", default: false }] });
  expect(c.models.defaultEffort("/repo", "codex", "gpt")).toBeUndefined();
  await c.models.models("/repo", "codex");
  expect(c.models.defaultEffort("/repo", "codex", "gpt")).toBe("medium");
  expect(c.models.defaultEffort("/repo", "codex", "plain")).toBeUndefined();
  expect(c.models.defaultEffort("/other", "codex", "gpt")).toBeUndefined();
});

// ACP mode lists come from the same session/new reply as the models, with no extra request.
const COPILOT = "https://agentclientprotocol.com/protocol/session-modes#";
it("reads an ACP session/new mode list and whether Copilot offers allow_all", () => {
  expect(parseAcpModes({ sessionId: "s", modes: { currentModeId: "agent", availableModes: [{ id: "agent", name: "Agent" }, { id: "plan", name: "Plan" }, { id: "ask", name: "Ask" }, { id: "" }, "x"] } }))
    .toEqual({ available: ["agent", "plan", "ask"], allowAll: false });
  expect(parseAcpModes({ modes: { currentModeId: `${COPILOT}agent`, availableModes: [{ id: `${COPILOT}agent` }, { id: `${COPILOT}plan` }] },
    configOptions: [{ id: "mode", category: "mode", currentValue: `${COPILOT}agent` }, { id: "allow_all", category: "permissions", currentValue: "off", options: [{ value: "on" }, { value: "off" }] }] }))
    .toEqual({ available: [`${COPILOT}agent`, `${COPILOT}plan`], allowAll: true });
  // allow_all counts only when it can be both turned on and turned off.
  expect(parseAcpModes({ modes: { availableModes: [{ id: "a" }] }, configOptions: [{ id: "allow_all", options: [{ value: "on" }] }] })).toEqual({ available: ["a"], allowAll: false });
  for (const none of [{ sessionId: "s" }, { modes: {} }, { modes: { availableModes: [] } }, null]) expect(parseAcpModes(none)).toBeUndefined();
});
it("answers an ACP list's modes with its models, and none for a provider that listed none", async () => {
  const c = catalog();
  const modes = { available: ["agent", "plan"], allowAll: false };
  c.list.mockResolvedValueOnce({ models: LIST, modes });
  expect(await c.models.models("/repo", "cursor")).toEqual({ models: LIST, modes });
  expect(await c.models.models("/repo", "cursor")).toEqual({ models: LIST, modes });
  expect(await c.models.models("/repo", "claude")).toEqual({ models: LIST });
});


it("reads Claude Fast only from a true capability without provider description copy", () => {
  const rows = [true, false, undefined, "true", 1].map((supportsFastMode, i) => ({ value: `m${"abcde"[i]}`, supportsFastMode, description: "provider copy" }));
  expect(parseClaudeModels(rows)).toEqual(rows.map((_, i) => ({ id: `m${"abcde"[i]}`, label: `m${"abcde"[i]}`, default: false, ...(i === 0 ? { fast: {} } : {}) })));
});
it("reads Codex Fast from priority id and its valid description, ignoring names and old tiers", () => {
  const tierRows = [
    { serviceTiers: [{ id: "priority", name: "Fast", description: "2x speed, increased usage" }] },
    { serviceTiers: [{ id: "priority", name: "Other" }] },
    { serviceTiers: [{ id: "default", name: "Fast" }] },
    { additionalSpeedTiers: [{ id: "priority", name: "Fast" }] },
    {}, { serviceTiers: null }, { serviceTiers: {} }, { serviceTiers: [null, "priority", {}, { id: 1 }] },
    ...["", "bad\0text", "x".repeat(513), 1, null].map(description => ({ serviceTiers: [{ id: "priority", description }] })),
  ];
  const parsed = parseCodexModels({ data: tierRows.map((row, i) => ({ id: String(i), ...row })) });
  expect(parsed.map(row => row.fast)).toEqual([{ description: "2x speed, increased usage" }, {}, undefined, undefined, undefined, undefined, undefined, undefined, {}, {}, {}, {}, {}]);
});
it("marks every Claude Fast row unavailable for account reasons without mutating the input", () => {
  const rows: ModelOption[] = [{ id: "a", label: "A", default: true, fast: {} }, { id: "b", label: "B", default: false, fast: { description: "kept" } }, { id: "c", label: "C", default: false }];
  for (const [raw, reason] of [["free", "plan"], ["extra_usage_disabled", "extra_usage"], ["preference", "policy"]]) {
    expect(applyClaudeFastUnavailable(raw, rows)).toEqual([
      { ...rows[0], fast: { unavailable: reason } }, { ...rows[1], fast: { description: "kept", unavailable: reason } }, rows[2],
    ]);
  }
  for (const reason of [undefined, null, "model", "cooldown", "sdk_opt_in_required", "unknown", {}, 1]) expect(applyClaudeFastUnavailable(reason, rows)).toBe(rows);
  expect(rows[0]?.fast).toEqual({}); expect(rows[1]?.fast).toEqual({ description: "kept" });
});
it("accepts Fast only from an available model in this run's received root and provider list", async () => {
  const c = catalog();
  c.list.mockResolvedValue({ models: [
    { id: "fast", label: "Fast", default: true, efforts: ["high"], fast: {} },
    { id: "blocked", label: "Blocked", default: false, fast: { unavailable: "plan" } },
    { id: "plain", label: "Plain", default: false },
  ] });
  expect(c.models.accepts("/repo", "claude", "fast", undefined, true)).toBe(false);
  await c.models.models("/repo", "claude");
  expect(c.models.accepts("/repo", "claude", "fast", "high", true)).toBe(true);
  expect(c.models.accepts("/repo", "claude", "fast", "low", true)).toBe(false);
  for (const model of ["plain", "blocked", "missing"]) expect(c.models.accepts("/repo", "claude", model, undefined, true)).toBe(false);
  for (const model of ["plain", "blocked"]) {
    expect(c.models.accepts("/repo", "claude", model, undefined, false)).toBe(true);
    expect(c.models.accepts("/repo", "claude", model, undefined)).toBe(true);
  }
  expect(c.models.accepts("/other", "claude", "fast", undefined, true)).toBe(false);
  expect(c.models.accepts("/repo", "codex", "fast", undefined, true)).toBe(false);
  const restarted = catalog();
  expect(restarted.models.accepts("/repo", "claude", "fast", undefined, true)).toBe(false);
});

// Whether a turn's model takes Fast now, the list's default row standing in for a conversation that has
// no stored model; nothing before this run read the list.
it("answers whether a model takes Fast from this run's list, the default row standing in for no model", async () => {
  const c = catalog();
  c.list.mockResolvedValue({ models: [{ id: "luna", label: "Luna", default: true, fast: {} }, { id: "sol", label: "Sol", default: false, fast: { description: "1.5x speed" } }, { id: "plain", label: "Plain", default: false }] });
  expect(c.models.fast("/repo", "codex", "sol")).toBe(false);
  expect(c.models.fast("/repo", "codex", undefined)).toBe(false);
  await c.models.models("/repo", "codex");
  expect(c.models.fast("/repo", "codex", "sol")).toBe(true);
  expect(c.models.fast("/repo", "codex", undefined)).toBe(true);
  expect(c.models.fast("/repo", "codex", "plain")).toBe(false);
  expect(c.models.fast("/repo", "codex", "missing")).toBe(false);
  expect(c.models.fast("/other", "codex", "sol")).toBe(false);
  c.list.mockResolvedValue({ models: [{ id: "default", label: "Default", default: true, fast: { unavailable: "extra_usage" } }, { id: "plain", label: "Plain", default: false }] });
  await c.models.models("/repo", "claude");
  expect(c.models.fast("/repo", "claude", "default")).toBe(false);
  expect(c.models.fast("/repo", "claude", undefined)).toBe(false);
  c.list.mockResolvedValue({ models: [{ id: "plain", label: "Plain", default: false, fast: {} }] });
  await c.models.models("/repo", "cursor");
  // No default row: a conversation without a stored model cannot be judged.
  expect(c.models.fast("/repo", "cursor", undefined)).toBe(false);
});

// A provider's earlier generations are marked `older`, the menu folds them.
const measured = JSON.parse(readFileSync(join(__dirname, "fixtures", "models-older.json"), "utf8"));
const split = (models: ModelOption[]): [string[], string[]] => [models.filter(m => !m.older).map(m => m.id), models.filter(m => m.older).map(m => m.id)];
const row = (id: string, isDefault = false) => ({ id, name: id, isDefault });
it("folds the measured Claude list to its four aliases, the default row resolving to the newest Opus", () => {
  const [current, older] = split(parseClaudeModels(measured.claude));
  expect(current).toEqual(["default", "fable", "sonnet", "haiku"]);
  expect(older).toEqual(["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"]);
});
it("folds the measured Codex list to the newest of each family", () => {
  const [current, older] = split(parseCodexModels(measured.codex));
  expect(current).toEqual(["gpt-6.1-sol", "gpt-6-astra", "gpt-6.1-terra", "gpt-6-luna"]);
  expect(older).toEqual(["gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
});
it("folds the measured Cursor list to 25 current and 22 older rows, reading names without the bracket tail", () => {
  const models = parseAcpModels(measured.cursor);
  const [current, older] = split(models);
  expect([current.length, older.length]).toEqual([25, 22]);
  expect(current).toEqual(expect.arrayContaining(["default[]", "gpt-5.5[context=272k,reasoning=medium,fast=false]", "glm-5.2[reasoning=high]", "gemini-3.1-pro[]", "deepseek-v41-flash-1017[reasoning_effort=high]", "claude-haiku-5-5[thinking=true,context=300k,reasoning_effort=high]"]));
  expect(older).toEqual(expect.arrayContaining(["claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]", "gemini-3-flash[]", "gpt-5-mini[]", "claude-haiku-4-5[thinking=true]"]));
  expect(models.map(m => m.id)).toEqual(measured.cursor.models.availableModels.map((m: { modelId: string }) => m.modelId));
});
it("keeps every Antigravity effort variant current, its families split by the effort suffix", () => {
  expect(olderIds(["gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low"].map(id => row(id)))).toEqual(new Set());
});
it("marks nothing in an empty list or a list without version numbers", () => {
  expect(olderIds([])).toEqual(new Set());
  expect(olderIds(["auto", "default", "kimi-k3", "glm-5p3"].map(id => row(id)))).toEqual(new Set());
});
it("keeps tied versions current and reads a shorter equal prefix as smaller", () => {
  expect(olderIds([row("a-6"), row("b-6"), row("a-6", true)])).toEqual(new Set());
  expect(olderIds([row("gpt-6-sol"), row("gpt-6.1-sol")])).toEqual(new Set(["gpt-6-sol"]));
  expect(olderIds([row("x-5"), row("x-5-5")])).toEqual(new Set(["x-5"]));
  expect(olderIds([row("x-10"), row("x-9")])).toEqual(new Set(["x-9"]));
});
it("ignores date pieces so a dated id does not beat the undated id of the same generation", () => {
  expect(olderIds([row("claude-haiku-4-5-20251001"), row("claude-haiku-4-5")])).toEqual(new Set());
  expect(olderIds([row("m-2-0101"), row("m-2")])).toEqual(new Set());
  expect(olderIds([row("claude-haiku-4-5-20251001"), row("claude-haiku-5-5")])).toEqual(new Set(["claude-haiku-4-5-20251001"]));
});
it("compares names without a trailing bracket part", () => {
  expect(olderIds([row("claude-opus-5[1m]"), row("claude-opus-5-5")])).toEqual(new Set(["claude-opus-5[1m]"]));
  expect(olderIds([row("m-1[a=1]"), row("m-1[b=2]")])).toEqual(new Set());
});
it("counts the default row toward its family's newest version but never folds it", () => {
  expect(olderIds([{ id: "default", name: "claude-opus-5-5", isDefault: true }, row("claude-opus-4-8")])).toEqual(new Set(["claude-opus-4-8"]));
  expect(olderIds([row("m-1", true), row("m-2")])).toEqual(new Set());
});
it("marks Codex and ACP rows older only after duplicates are removed, and keeps the default row current", () => {
  expect(parseCodexModels({ data: [{ id: "gpt-5", isDefault: true }, { id: "gpt-6" }, { id: "gpt-5.1" }, { id: "gpt-5.1" }] })).toEqual([
    { id: "gpt-5", label: "gpt-5", default: true },
    { id: "gpt-6", label: "gpt-6", default: false },
    { id: "gpt-5.1", label: "gpt-5.1", default: false, older: true },
  ]);
  expect(parseAcpModels({ models: { currentModelId: "auto", availableModels: [{ modelId: "auto" }, { modelId: "auto" }, { modelId: "m-1" }, { modelId: "m-2" }] } })).toEqual([
    { id: "auto", label: "auto", default: true },
    { id: "m-1", label: "m-1", default: false, older: true },
    { id: "m-2", label: "m-2", default: false },
  ]);
});
// A duplicate Claude row that unique drops must not lend its resolvedModel to the row kept.
it("classifies a kept Claude row by its own resolvedModel, never a dropped duplicate's", () => {
  expect(parseClaudeModels([{ value: "alias", displayName: "First alias" }, { value: "alias", resolvedModel: "m-1" }, { value: "m-2" }])).toEqual([
    { id: "alias", label: "First alias", default: false },
    { id: "m-2", label: "m-2", default: false },
  ]);
});
