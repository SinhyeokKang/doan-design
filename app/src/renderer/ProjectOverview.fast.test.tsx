import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
// Effects are collected during the static render and run after it, as React would after a commit.
const effects = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (run: () => unknown) => { effects.push(run); } }));
// The docked composer is replaced by a recorder: these tests read what the Overview hands it and press its Send.
const docked = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("./DockedComposer", async original => ({ ...await original<typeof import("./DockedComposer")>(), DockedComposer: (props: Record<string, unknown>) => { docked.props = props; return null; } }));
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import { DockedSupport, modelsKey } from "./dockedSupport";
import type { ModelOption, ModelPickerView } from "./homeComposer";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// fast-mode B2 (design §1 renderer): the Overview's composer shows the conversation's stored Fast, a new start sends the
// Fast it shows, an existing conversation's send names Fast only once the person switched it, and only a switch is
// remembered. The canvas panel's composer follows the same lines (CanvasConversationPanel.tsx).

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "Checkout copy", state: "current", owner: "doan", provider: "claude", model: "opus",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...patch,
});
function status(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude")] };
const OPUS: ModelOption = { id: "opus", label: "Opus", default: true, efforts: ["high"], fast: {} };
const SONNET: ModelOption = { id: "sonnet", label: "Sonnet", default: false, efforts: ["high"] };

beforeEach(() => vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), listConversationModels: vi.fn(() => new Promise(() => {})), setConversationPermissionMode: vi.fn(async () => undefined) } }));
afterEach(() => vi.unstubAllGlobals());

function render(list: ListView, current: string | null, patch: Partial<ProjectOverviewProps> = {}, picks?: (support: DockedSupport) => void) {
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host);
  run.show(ROOT);
  run.select(ROOT, current);
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  support.presets = { v: 1, ok: true, result: { version: "1", presets: [] } };
  support.models = { [modelsKey(ROOT, "claude")]: { models: [OPUS, SONNET] } };
  picks?.(support);
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {}, ...patch,
  };
  effects.length = 0; docked.props = null;
  renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  for (const run of effects.splice(0)) run();
  return { support, composer: docked.props! as { picker: ModelPickerView; onSend(request: unknown): Promise<unknown>; onPickFast(on: boolean): void; onPickModel(provider: Provider, value: string | null): void; onPickEffort(value: string): void } };
}
const REQUEST = { text: "Go", anchors: [], attachments: [] };
const KEY = `conversation:${A}`;

test("an existing conversation shows its stored Fast, kept while a model without Fast is chosen", () => {
  expect(render([summary({ fast: true })], A).composer.picker.effort).toMatchObject({ ariaLabel: "Effort: default, Fast on", fast: { on: true } });
  expect(render([summary()], A).composer.picker.effort).toMatchObject({ ariaLabel: "Effort: default, Fast off", fast: { on: false } });
  const sonnet = render([summary({ fast: true })], A, {}, support => support.pick(KEY, { model: "sonnet" }));
  expect(sonnet.composer.picker.effort?.fast).toBeNull();
  expect(render([summary({ fast: true })], A, {}, support => support.pick(KEY, { model: "sonnet" })).support.picks[KEY]).not.toHaveProperty("fast");
});

test("an existing conversation's send names Fast only after a switch, and only while the model offers it", async () => {
  const sent = vi.fn(async (_provider: Provider, _request: unknown) => {});
  await render([summary({ fast: true })], A, { onSendConversation: sent }).composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).not.toHaveProperty("fast");
  await render([summary({ fast: true })], A, { onSendConversation: sent }, support => support.pick(KEY, { fast: false })).composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).toMatchObject({ conversationId: A, fast: false });
  // Switched on for Opus, then Sonnet chosen: main would refuse Fast for Sonnet, so the switch waits.
  await render([summary()], A, { onSendConversation: sent }, support => support.pick(KEY, { fast: true, model: "sonnet" })).composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).toMatchObject({ model: "sonnet" });
  expect(sent.mock.calls.at(-1)![1]).not.toHaveProperty("fast");
});

test("a new conversation starts with its provider's Last used Fast, sent only while the switch shows it on", async () => {
  const start = vi.fn(async (_request: unknown, _last: unknown) => ({ ok: true as const }));
  const fresh = render([], null, { onStart: start, prefs: { fast: { claude: true } } });
  expect(fresh.composer.picker.effort?.fast).toEqual({ on: true, description: "Same model, faster output. Requires usage credits." });
  await fresh.composer.onSend(REQUEST);
  expect(start.mock.calls.at(-1)![0]).toMatchObject({ runtime: "claude", model: "opus", fast: true });
  await render([], null, { onStart: start, prefs: { fast: { claude: true } } }, support => support.pick(`root:${ROOT}`, { model: "sonnet" })).composer.onSend(REQUEST);
  expect(start.mock.calls.at(-1)![0]).not.toHaveProperty("fast");
  await render([], null, { onStart: start }).composer.onSend(REQUEST);
  expect(start.mock.calls.at(-1)![0]).not.toHaveProperty("fast");
});

test("a new conversation's switch belongs to its provider: picking another provider drops it", () => {
  const { support, composer } = render([], null, {}, support => support.pick(`root:${ROOT}`, { fast: true }));
  composer.onPickModel("claude", "sonnet");
  expect(support.picks[`root:${ROOT}`]).toEqual({ provider: "claude", fast: true, model: "sonnet" });
  composer.onPickModel("codex", "gpt-6.1-sol");
  expect(support.picks[`root:${ROOT}`]).toEqual({ provider: "codex", model: "gpt-6.1-sol" });
});

// review R 🟡2 (decision 3): a switch held from earlier is never sent to Last used again on a mount or another pick;
// only the toggle itself records Fast.
test("only the Fast toggle itself is remembered as Last used Fast", () => {
  const onRemember = vi.fn();
  // Toggled in A earlier, then Last used changed elsewhere: coming back to A, or changing A's effort, records no Fast.
  render([summary()], A, { onRemember }, support => support.pick(KEY, { fast: true }));
  render([summary()], A, { onRemember }, support => support.pick(KEY, { fast: true, effort: "high" }));
  expect(onRemember).toHaveBeenCalled();
  for (const [choice] of onRemember.mock.calls) expect(choice).not.toHaveProperty("fast");
  onRemember.mockClear();
  render([summary()], A, { onRemember }).composer.onPickFast(true);
  expect(onRemember).toHaveBeenCalledTimes(1);
  expect(onRemember.mock.calls[0]![0]).toMatchObject({ provider: "claude", model: "opus", fast: true });
});

// review R 🟡1: an off is stored whatever the model; only an on waits for a model that can use it.
test("a switch off is sent even after a model without Fast is chosen; a terminal session sends neither", async () => {
  const sent = vi.fn(async (_provider: Provider, _request: unknown) => {});
  await render([summary({ fast: true })], A, { onSendConversation: sent }, support => support.pick(KEY, { fast: false, model: "sonnet" })).composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).toMatchObject({ model: "sonnet", fast: false });
  await render([summary({ fast: true, owner: "legacy-external" })], A, { onSendConversation: sent }, support => support.pick(KEY, { fast: false })).composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).not.toHaveProperty("fast");
});

test("Fast turned off in a conversation drops the switch its composer still held", () => {
  const { support } = render([summary()], A, {}, support => support.pick(KEY, { fast: true, model: "opus" }));
  support.fastTurnedOff(A);
  expect(support.picks[KEY]).toEqual({ model: "opus" });
});

// picker-default-labels review 🔴1: Claude Code's default row has the id "default", the same word the pre-list Default
// row used to pass. Picking it must choose that model, not fall back to the conversation's stored one.
test("an existing conversation on another model can pick Claude Code's default row", async () => {
  const paired = (support: DockedSupport) => { support.models = { [modelsKey(ROOT, "claude")]: { models: [{ id: "default", label: "Opus 5.5", default: true, efforts: ["high"] }, SONNET] } }; };
  const { support, composer } = render([summary({ model: "sonnet" })], A, {}, paired);
  expect(composer.picker.trigger.label).toBe("Sonnet");
  composer.onPickModel("claude", "default");
  const sent = vi.fn(async (_provider: Provider, _request: unknown) => {});
  const after = render([summary({ model: "sonnet" })], A, { onSendConversation: sent }, next => { paired(next); next.picks = support.picks; });
  expect(after.composer.picker.trigger).toMatchObject({ label: "Opus 5.5", isDefault: true });
  await after.composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).toMatchObject({ model: "default" });
});

// RV ⚪2: the effort menu's Default row, picked in a conversation that stored a level, sends the model with no effort,
// so main clears the stored level (Codex then sends its model's defaultEffort for that turn, unchanged here).
test("an existing conversation that picks the effort Default row sends its model and no effort", async () => {
  const { support, composer } = render([summary({ effort: "high" })], A);
  expect(composer.picker.effort).toMatchObject({ label: "High", unset: { selected: false } });
  composer.onPickEffort("");
  const sent = vi.fn(async (_provider: Provider, _request: unknown) => {});
  const after = render([summary({ effort: "high" })], A, { onSendConversation: sent }, next => { next.picks = support.picks; });
  expect(after.composer.picker.effort).toMatchObject({ label: "Effort", placeholder: true, unset: { selected: true } });
  await after.composer.onSend(REQUEST);
  expect(sent.mock.calls.at(-1)![1]).toMatchObject({ conversationId: A, model: "opus" });
  expect(sent.mock.calls.at(-1)![1]).not.toHaveProperty("effort");
});

// A docked new conversation says whether its model was picked, so a fixed Settings default without a model is not moved
// onto the provider's default by a pick of something else.
test("a new conversation's pick marks the model as picked only when the model was picked", () => {
  const onRemember = vi.fn();
  render([], null, { onRemember }, support => support.pick(`root:${ROOT}`, { permissionMode: "plan" }));
  expect(onRemember.mock.calls.at(-1)![0]).toMatchObject({ provider: "claude", model: "opus", permissionMode: "plan" });
  expect(onRemember.mock.calls.at(-1)![0]).not.toHaveProperty("modelPicked");
  render([], null, { onRemember }, support => support.pick(`root:${ROOT}`, { model: "sonnet" }));
  expect(onRemember.mock.calls.at(-1)![0]).toMatchObject({ provider: "claude", model: "sonnet", modelPicked: true });
});
