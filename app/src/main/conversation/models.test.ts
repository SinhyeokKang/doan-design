import { expect, it, vi } from "vitest";
import { applyClaudeFastUnavailable, ModelCatalog, parseAcpModels, parseAcpModes, parseClaudeModels, parseCodexModels, type ModelList, type ModelOption } from "./models";
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

// buzz-conversation fix 1: Codex's turn/start effort overrides "this turn and subsequent turns" (0.164.0 TurnStartParams),
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

// permission-mode S2: ACP mode lists come from the same session/new reply as the models, with no extra request.
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
  const rows = [true, false, undefined, "true", 1].map((supportsFastMode, i) => ({ value: String(i), supportsFastMode, description: "provider copy" }));
  expect(parseClaudeModels(rows)).toEqual(rows.map((_, i) => ({ id: String(i), label: String(i), default: false, ...(i === 0 ? { fast: {} } : {}) })));
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

// fast-mode A3: whether a turn's model takes Fast now, the list's default row standing in for a conversation that has
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
