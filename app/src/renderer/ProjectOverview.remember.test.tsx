import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
// Effects are collected during the static render and run after it, as React would after a commit.
const effects = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (run: () => unknown) => { effects.push(run); } }));
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { DockedSupport } from "./dockedSupport";
import type { PresetSummary } from "./homeComposer";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, worktreeChoice, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-project design §2.1, §2.2, §2.5: the Overview's header and main column as static markup.

const ROOT = "/code/doan", WT = "/code/doan-checkout";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const row = (path: string): CanvasRow => ({ path, id: path.split("/").at(-1)!.replace(/\.html$/, ""), url: "u" });
const entry = (path: string, canvases: string[], branch = "main"): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases: canvases.map(row), git: { branch, common: "/code/doan/.git" } } as FolderEntry);
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "What should the checkout empty state say when a cart has expired?", state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...patch,
});
const PRESETS: PresetSummary[] = ([["context", "Gather design context", "start"], ["shape", "Shape a first screen", "start"], ["document", "Document the design system", "start"], ["critique", "Critique the design", "review"], ["polish", "Polish the details", "refine"]] as const)
  .map(([id, title, group]) => ({ id, title, description: "", scope: "", group }));
function status(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude")] };

beforeEach(() => vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), listConversationModels: vi.fn(() => new Promise(() => {})), setConversationPermissionMode: vi.fn(async () => undefined) } }));
afterEach(() => vi.unstubAllGlobals());

function render(list: ListView, patch: Partial<ProjectOverviewProps> = {}, setup?: (run: OverviewRun) => void, picks?: (support: DockedSupport) => void) {
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host);
  run.show(ROOT);
  setup?.(run);
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  support.presets = { v: 1, ok: true, result: { version: "1", presets: PRESETS } };
  picks?.(support);
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry: entry(ROOT, [".doan/canvases/checkout.html"]), worktrees: [entry(ROOT, [])], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {}, ...patch,
  };
  effects.length = 0;
  const html = renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  for (const run of effects.splice(0)) run();
  return html;
}


// code-review PM-B 🟡1: in an existing conversation a model pick alone does not remember the conversation's stored
// mode as the provider's last mode (Full access must only follow a pick of it); a mode pick does.
test("a model pick in an existing conversation remembers no mode; a mode pick does", () => {
  const onRemember = vi.fn();
  render([summary({ permissionMode: "bypass" })], { onRemember }, undefined, support => support.pick(`conversation:${A}`, { model: "opus" }));
  expect(onRemember).toHaveBeenCalled();
  expect(onRemember.mock.calls.at(-1)![0]).not.toHaveProperty("permissionMode");
  onRemember.mockClear();
  render([summary({ permissionMode: "bypass" })], { onRemember }, undefined, support => support.pick(`conversation:${A}`, { permissionMode: "plan" }));
  expect(onRemember.mock.calls.at(-1)![0]).toMatchObject({ provider: "claude", permissionMode: "plan" });
});
