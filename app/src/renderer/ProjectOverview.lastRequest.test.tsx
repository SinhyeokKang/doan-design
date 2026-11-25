import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const docked = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("./DockedComposer", async original => ({ ...await original<typeof import("./DockedComposer")>(), DockedComposer: (props: Record<string, unknown>) => { docked.props = props; return null; } }));
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState } from "../main/agentAuth/types";
import type { FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import type { DockedRequest } from "./DockedComposer";
import { EMPTY_DRAFT } from "./dockedRules";
import { DockedSupport, modelsKey } from "./dockedSupport";
import type { AttachmentDraft, ModelOption } from "./homeComposer";
import { OverviewRun, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// What a new conversation's start remembers as the last request (Edit on Home restores it): a command remembers only its
// text, as Home's composer does, because the preset and attachments it did not take stay in the Overview's draft.

const ROOT = "/code/doan";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const state: AuthState = { provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
const AUTH: AuthSnapshot = { revision: 1, providers: [authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1)] };
const OPUS: ModelOption = { id: "opus", label: "Opus", default: true, efforts: ["high"] };
const POLISH = { id: "polish", label: "Polish" } as unknown as NonNullable<typeof EMPTY_DRAFT.preset>;
const FILE = { key: "k1", id: "att-1", name: "a.png", kind: "image", pasted: true, status: "ready" } as unknown as AttachmentDraft;

beforeEach(() => vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), onAgentUsage: vi.fn(() => () => {}), readAgentUsage: vi.fn(async () => []), listConversationSkills: vi.fn(async () => ({ skills: [] })), listConversationModels: vi.fn(() => new Promise(() => {})), setConversationPermissionMode: vi.fn(async () => undefined) } }));
afterEach(() => vi.unstubAllGlobals());

function render(onStart: ProjectOverviewProps["onStart"]) {
  const host: OverviewRunHost = {
    list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host, window.doan);
  run.show(ROOT);
  run.select(ROOT, null);
  run.setDrafts(drafts => new Map(drafts).set(`root:${ROOT}`, { ...EMPTY_DRAFT, segments: textSegments("/compact"), preset: POLISH, attachments: [FILE] }));
  const support = new DockedSupport(() => {}, window.doan);
  support.auth = AUTH;
  support.presets = { v: 1, ok: true, result: { version: "1", presets: [] } };
  support.models = { [modelsKey(ROOT, "claude", 1)]: { models: [OPUS] } };
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list: [], seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart, onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  docked.props = null;
  renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  return docked.props! as { onSend(request: DockedRequest): Promise<unknown> };
}

test("a command start remembers only the command's text; a message start remembers the draft", async () => {
  const start = vi.fn(async (_request: unknown, _last: unknown) => ({ ok: true as const }));
  await render(start).onSend({ text: "/compact", anchors: [], attachments: [], command: true });
  expect(start.mock.calls.at(-1)![1]).toMatchObject({ root: ROOT, text: "/compact", preset: null, attachments: [], provider: "claude" });
  await render(start).onSend({ text: "Polish it", anchors: [], attachments: [{ id: "att-1" }] });
  expect(start.mock.calls.at(-1)![1]).toMatchObject({ root: ROOT, text: "/compact", preset: POLISH, attachments: [FILE] });
});
