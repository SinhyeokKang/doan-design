import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
// Effects are collected during the static render and run after it, as React would after a commit; the docked composer
// is replaced by one that keeps its props, so a test can pick and send as the person would.
const effects = vi.hoisted(() => [] as (() => unknown)[]);
const composer = vi.hoisted(() => ({ props: null as unknown }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (run: () => unknown) => { effects.push(run); } }));
vi.mock("./DockedComposer", async original => ({ ...await original<typeof import("./DockedComposer")>(), DockedComposer: (props: unknown) => { composer.props = props; return null; } }));
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import { CanvasConversation, type CanvasConversationProps } from "./CanvasConversationPanel";
import { CanvasRun } from "./canvasRun";
import { TooltipProvider } from "./components/ui/tooltip";
import { ConversationStore } from "./conversationStore";
import type { DockedComposerProps } from "./DockedComposer";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";

// RV-B (permission-mode PM-B review): the docked composers' permission mode across a provider switch, a start, a pending
// pick and a terminal session, in the Overview and the canvas panel.

const ROOT = "/w/acme";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const ENTRY: FolderEntry = { path: ROOT, kind: "list", servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }] };
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "Payment copy", state: "current", owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch,
});
function connected(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [connected("claude"), connected("codex")] };
const REQUEST = { text: "Draw it", anchors: [], attachments: [] };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const docked = () => composer.props as DockedComposerProps;

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  doan = {
    readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}),
    listConversationModels: vi.fn(() => new Promise(() => {})), setConversationPermissionMode: vi.fn(async () => undefined),
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), attachmentsFromPaths: vi.fn(async () => []),
    startConversation: vi.fn(async () => ({ conversationId: A })), sendConversation: vi.fn(async () => undefined),
  };
  vi.stubGlobal("window", { doan: { ...doan, designSkills: { list: vi.fn(() => new Promise(() => {})) } } });
});
afterEach(() => vi.unstubAllGlobals());

// One Overview whose run, support and list outlive its renders.
function overview(patch: Partial<ProjectOverviewProps> = {}) {
  let list: ListView = [];
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "acme", changed: () => {},
  });
  run.show(ROOT);
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  const render = () => {
    const props: ProjectOverviewProps = {
      run, support, root: ROOT, project: "acme", entry: ENTRY, worktrees: [ENTRY], homeDirectory: "/w",
      notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-11-01T00:03:00.000Z"),
      onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true, conversationId: A }), onSettings: () => {},
      onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {}, ...patch,
    };
    effects.length = 0;
    renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
    for (const effect of effects.splice(0)) effect();
    return docked();
  };
  return { run, support, render, setList: (next: ListView) => { list = next; }, open: () => run.request(ROOT, A, null) };
}

// One canvas panel whose run, support and list outlive its renders.
async function panel(patch: Partial<CanvasConversationProps> = {}) {
  let list: ListView = [];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  await flush();
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  const render = () => {
    const props: CanvasConversationProps = {
      run, support, target: { root: ROOT, canvas: CANVAS }, canvasName: "checkout", project: "acme", entry: ENTRY,
      list, seen: new Set(), prefs: null, defaults: null, now: Date.parse("2026-11-01T15:00:00"), blocked: null, frames: [], locateDisabled: false, arrival: null, onArrived: vi.fn(),
      onLocate: vi.fn(async () => "shown" as const), pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} }, composerLink: { current: null },
      onSettings: vi.fn(), onNotice: vi.fn(), onOpenProjectConversation: vi.fn(), ...patch,
    };
    effects.length = 0;
    renderToStaticMarkup(<TooltipProvider><CanvasConversation {...props} /></TooltipProvider>);
    for (const effect of effects.splice(0)) effect();
    return docked();
  };
  return { run, support, render, setList: (next: ListView) => { list = next; run.sync(); }, open: () => run.select(A) };
}

// Each column's own conversation row: the Overview's from Home, the panel's on its canvas.
const setups = {
  overview: { setup: async (patch: object) => overview(patch), row: (patch: Partial<ConversationSummary> = {}) => summary({ fromHome: true, ...patch }) },
  "canvas panel": { setup: async (patch: object) => panel(patch), row: (patch: Partial<ConversationSummary> = {}) => summary({ canvas: CANVAS, ...patch }) },
};

// RV-B 🟡1, spec decision 4: a new conversation's mode pick is the picked provider's. Switching the provider drops it,
// so the new provider shows (and remembers) its own mode; Full access picked for Claude never carries to Codex.
for (const [name, { setup }] of Object.entries(setups)) test(`${name}: a provider switch drops the picked mode`, async () => {
  const onRemember = vi.fn();
  const { render } = await setup({ onRemember, prefs: { permissions: { codex: "plan" } } });
  render().onPickPermission!("bypass");
  expect(render().permission?.mode).toBe("bypass");
  onRemember.mockClear();
  render().onPickModel("codex", "default");
  expect(render().permission?.mode).toBe("plan");
  const codex = onRemember.mock.calls.map(call => call[0]).filter(choice => choice.provider === "codex");
  expect(codex.length).toBeGreaterThan(0);
  for (const choice of codex) expect(choice.permissionMode).toBe("plan");
});

// RV-B 🟡2: a just-started conversation shows the mode it was started in until its summary arrives, then the summary's.
// A send before the summary names no mode (main's stored one runs).
test("overview: a start carries its mode, which shows until the summary arrives and is not sent", async () => {
  const onStart = vi.fn(async (_start: unknown, _last: unknown) => ({ ok: true as const, conversationId: A }));
  const onSendConversation = vi.fn(async (_provider: unknown, _request: unknown) => {});
  const { render, setList, support } = await overview({ onStart, onSendConversation, prefs: { permissions: { claude: "bypass" } } });
  await render().onSend(REQUEST);
  expect(onStart.mock.calls[0]![0]).toMatchObject({ runtime: "claude", permissionMode: "bypass" });
  expect(render().mode).toMatchObject({ kind: "existing", conversationId: A });
  expect(render().permission?.mode).toBe("bypass");
  await render().onSend(REQUEST);
  expect(onSendConversation.mock.calls[0]![1]).not.toHaveProperty("permissionMode");
  setList([summary({ fromHome: true, permissionMode: "acceptEdits" })]);
  render();
  expect(support.started).toEqual({});
  expect(render().permission?.mode).toBe("acceptEdits");
});

// ⚪6: the canvas panel's start, pre-summary send and display, as the Overview's.
test("canvas panel: a start carries its mode, which shows until the summary arrives and is not sent", async () => {
  const onRemember = vi.fn();
  const { render, setList, support } = await panel({ onRemember, prefs: { permissions: { claude: "bypass" } } });
  await render().onSend(REQUEST);
  expect(doan.startConversation!.mock.calls[0]![0]).toMatchObject({ mode: "new", runtime: "claude", permissionMode: "bypass" });
  expect(onRemember).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "claude", permissionMode: "bypass" }));
  expect(render().mode).toMatchObject({ kind: "existing", conversationId: A });
  expect(render().permission?.mode).toBe("bypass");
  await render().onSend(REQUEST);
  expect(doan.sendConversation!.mock.calls[0]![0]).not.toHaveProperty("permissionMode");
  setList([summary({ canvas: CANVAS, permissionMode: "acceptEdits" })]);
  render();
  expect(support.started).toEqual({});
  expect(render().permission?.mode).toBe("acceptEdits");
});

// RV-B 🟡3: a pick main has not reported yet gives way when the stored mode moves off the one it was made from.
for (const [name, { setup, row }] of Object.entries(setups)) test(`${name}: a pending pick gives way to a changed stored mode`, async () => {
  const { render, setList, open } = await setup({});
  setList([row({ permissionMode: "plan" })]);
  open();
  expect(render().mode).toMatchObject({ kind: "existing", conversationId: A });
  render().onPickPermission!("acceptEdits");
  await flush();
  expect(render().permission?.mode).toBe("acceptEdits");
  setList([row()]);
  render();
  expect(render().permission?.mode).toBe("default");
});

// ⚪6: a terminal session keeps its own mode: no picker, and its start names none.
test("canvas panel: a terminal session has no picker and starts without a mode", async () => {
  doan.conversationResumeTarget!.mockImplementation(async () => ({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T14:02:00" }));
  const { render } = await panel({ prefs: { permissions: { claude: "bypass" } } });
  expect(render()).toMatchObject({ fixed: true, permission: null });
  await render().onSend(REQUEST);
  expect(doan.startConversation!.mock.calls[0]![0]).toMatchObject({ mode: "resume" });
  expect(doan.startConversation!.mock.calls[0]![0]).not.toHaveProperty("permissionMode");
});
