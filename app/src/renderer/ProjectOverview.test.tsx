import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import { DockedSupport } from "./dockedSupport";
import type { PresetSummary } from "./homeComposer";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, worktreeChoice, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-project design §2.1, §2.2, §2.5: the Overview's header and main column as static markup.

const ROOT = "/code/doan", WT = "/code/doan-checkout";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const row = (path: string): CanvasRow => ({ path, id: path.split("/").at(-1)!.replace(/\.html$/, ""), url: "u", open: 0, resolved: 0 });
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

beforeEach(() => vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null) } }));
afterEach(() => vi.unstubAllGlobals());

function render(list: ListView, patch: Partial<ProjectOverviewProps> = {}, setup?: (run: OverviewRun) => void) {
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
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry: entry(ROOT, [".doan/canvases/checkout.html"]), worktrees: [entry(ROOT, [])], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {}, ...patch,
  };
  return renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
}

test("the header names the project, its branch read-only for one worktree, and the conversation's title", () => {
  const html = render([summary()]);
  expect(html).toContain('<span class="ov-project-name">doan</span>');
  expect(html).toMatch(/<span class="doan-chip shell-branch" data-ui-variant="translucent">.*<span>main<\/span><\/span>/);
  expect(html).not.toContain("wt-chip");
  expect(html).toContain('<span class="ov-sep" aria-hidden="true">/</span>');
  expect(html).toMatch(/class="ov-title doan-button"[^>]*>.*<span>What should the checkout empty state say when a cart has expired\?<\/span>/);
  expect(html).toContain('placeholder="Reply, / for presets"');
  expect(html).not.toContain("ov-suggestions");
});

test("with two worktrees the branch chip opens the worktree menu", () => {
  const html = render([summary()], { worktrees: [entry(ROOT, []), entry(WT, [], "feat-checkout")] });
  expect(html).toMatch(/<button[^>]*class="doan-chip shell-branch wt-chip"[^>]*aria-label="Worktree: main"/);
});

test("a new conversation offers Home's suggestions over the composer, also for a project with only a design system", () => {
  const html = render([], { entry: entry(ROOT, [".doan/ds/tokens.html"]) });
  expect(html).toMatch(/class="ov-title doan-button"[^>]*>.*<span>New conversation<\/span>/);
  expect(html).toContain('placeholder="Ask or describe what to design, / for presets"');
  expect(html).toContain('<div class="ov-suggestions" role="group" aria-label="Suggested prompts">');
  expect(html).toContain("Gather design context");
  expect(html).toContain("Shape a first screen");
  expect(html).not.toContain("Document the design system");
  expect(html).not.toContain("Doany");
});

test("canvases but no conversations: a new conversation with suggestions naming the canvas", () => {
  const html = render([]);
  expect(html).toContain("Critique the checkout canvas");
});

test("a promotion leaves the moved line with Open above the suggestions", () => {
  const html = render([summary()], {}, run => {
    run.sync();
    (run as unknown as { roots: Map<string, { current: unknown; moved: unknown }> }).roots.get(ROOT)!.current = { conversationId: null, listed: false };
    (run as unknown as { roots: Map<string, { moved: unknown }> }).roots.get(ROOT)!.moved = { conversationId: A, title: "Checkout copy", canvas: { path: ".doan/canvases/checkout.html", id: "checkout" } };
  });
  expect(html).toMatch(/<div class="doan-notice moved" role="status">.*<span class="grow-text">Checkout copy moved to checkout\.<\/span><button[^>]*>Open<\/button><\/div><div class="ov-suggestions"/);
});

test("the duplicate-ID notice shows under the header", () => {
  const notice = "Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.";
  const html = render([summary()], { notice });
  expect(html).toMatch(new RegExp(`</header><div class="doan-notice ov-notice" role="status">.*<span class="grow-text">${notice.replace(/\./g, "\\.")}</span></div>`));
});

test("while the list is read the title is unavailable and the composer is a new conversation; a failed read says so", () => {
  const loading = render("loading");
  const titleTag = (html: string) => html.match(/<button[^>]*class="ov-title doan-button"[^>]*>/)?.[0] ?? "";
  expect(titleTag(loading)).toContain('disabled=""');
  expect(loading).toContain('placeholder="Ask or describe what to design, / for presets"');
  expect(loading).not.toContain("Loading conversation…");
  const failed = render("error");
  expect(titleTag(failed)).not.toContain("disabled");
});

test("a long title is cut by style only, so the trigger's name keeps the whole title", () => {
  const title = "Does the design system cover dark mode? It should explain how tokens map when the app follows the system setting";
  const html = render([summary({ title })]);
  expect(html).toContain(`<span>${title}</span>`);
});

test("a project that turned into a problem keeps the thread and holds Send with Home's reason", () => {
  const html = render([summary()], { unavailable: "doan isn’t available. Fix it from its menu in the sidebar." });
  expect(html).toContain("doan isn’t available. Fix it from its menu in the sidebar.");
});

// POSTMORTEM 2026-10-25: a switch draws the other conversation's own draft in the very next render, never the previous
// one's.
test("switching conversations draws each one's own draft and title at once", () => {
  const B = "aaaaaaaa-0000-4000-8000-000000000002";
  const list = [summary(), summary({ conversationId: B, title: "Ideas for onboarding" })];
  let run!: OverviewRun;
  const first = render(list, {}, r => {
    run = r; r.sync();
    r.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, { text: "for A", anchors: [], preset: null, attachments: [], shape: "capsule" }).set(`conversation:${B}`, { text: "for B", anchors: [], preset: null, attachments: [], shape: "capsule" }));
  });
  expect(first).toContain(">for A</textarea>");
  const second = render(list, {}, r => {
    r.sync();
    r.drafts = run.drafts;
    r.select(ROOT, B);
  });
  expect(second).toContain(">for B</textarea>");
  expect(second).toContain("<span>Ideas for onboarding</span>");
  expect(second).not.toContain("for A");
});

// Review RM r1 🟡7, design §2.1: the chip's worktree rows behave as the sidebar's: a listed or reading worktree opens,
// a problem one turns the menu to its repair actions.
test("a problem worktree in the chip menu shows its repair actions instead of opening", () => {
  const missing = { kind: "notFound", path: "/code/gone" } as FolderEntry;
  const unset = { kind: "uninitialized", path: "/code/new" } as FolderEntry;
  expect(worktreeChoice(entry(WT, []))).toEqual({ kind: "open" });
  expect(worktreeChoice({ kind: "loading", path: WT } as FolderEntry)).toEqual({ kind: "open" });
  expect(worktreeChoice(missing)).toEqual({ kind: "repair", actions: ["locate"] });
  expect(worktreeChoice(unset)).toEqual({ kind: "repair", actions: ["setUp"] });
});
