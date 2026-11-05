import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {}, ...patch,
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
  expect(html).toContain("Get to know this project");
  expect(html).toContain("Plan the first screen");
  expect(html).not.toContain("Document the design system");
  expect(html).not.toContain("Doany");
});

test("canvases but no conversations: a new conversation with suggestions naming the canvas", () => {
  const html = render([]);
  expect(html).toContain("Review the checkout canvas");
  expect(html).toContain('class="suggestion" title="Review the checkout canvas"><span class="suggestion-icon">');
});

test("a promotion leaves the moved line with Open above the suggestions", () => {
  const html = render([summary()], {}, run => {
    run.sync();
    (run as unknown as { roots: Map<string, { current: unknown; moved: unknown }> }).roots.get(ROOT)!.current = { conversationId: null, listed: false };
    (run as unknown as { roots: Map<string, { moved: unknown }> }).roots.get(ROOT)!.moved = { conversationId: A, title: "Checkout copy", canvas: { path: ".doan/canvases/checkout.html", id: "checkout" } };
  });
  // review DS r1: one line; only the title gives way, and the whole sentence stays in the text (and the tooltip).
  expect(html).toMatch(/<div class="doan-notice moved" role="status">.*<span class="grow-text moved-text" title="Checkout copy moved to checkout\."><span class="moved-title">Checkout copy<\/span><span class="moved-rest"> moved to checkout\.<\/span><\/span><button[^>]*>Open<\/button><\/div><div class="ov-suggestions"/);
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
  expect(loading).not.toContain("Loading conversation");
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
    r.setDrafts(drafts => new Map(drafts).set(`conversation:${A}`, { segments: textSegments("for A"), preset: null, attachments: [], shape: "capsule" }).set(`conversation:${B}`, { segments: textSegments("for B\nand more"), preset: null, attachments: [], shape: "box" }));
  });
  // The field's text is drawn by ChipField once mounted, so static markup shows the draft through its shape; the
  // switch within one render is DockedComposer.interaction's "each conversation keeps its own draft".
  expect(first).toContain('class="docked" data-shape="capsule"');
  const second = render(list, {}, r => {
    r.sync();
    r.setDrafts(() => run.drafts);
    r.select(ROOT, B);
  });
  expect(second).toContain('class="docked" data-shape="box"');
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

// design-sync (buzz-project.html, buzz-conversation.html), measured in the built app: the app body's tabular figures
// widened the short times ("12m" by 2.5px), button.doan-chip's open fill replaced the open worktree chip's pressed
// fill, and two bare lucide glyphs (the moved line's, the Stopped notice's) rendered at 24px instead of 16.
test("the Overview's surfaces take plain numerals, the open chip its pressed fill, and notice glyphs the icon size", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".ov-main, .right.ov-right, .conv-menu, .wt-menu { font-variant-numeric: normal; }");
  expect(css).toContain('.ov-project button.wt-chip[aria-expanded="true"] { background: var(--affordance-backdrop-pressed); }');
  expect(css).toContain(".doan-notice.moved > svg { width: var(--size-icon); height: var(--size-icon); }");
  expect(css).toContain(".moved-text { display: flex; min-width: 0; white-space: nowrap; }");
  expect(css).toContain(".moved-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }");
  expect(css).toContain(".moved-rest { flex: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }");
  // The canvas panel's notices above its composer read the same (buzz-canvas-conversation).
  expect(css).toContain(".conversation-thread .thread-notice > svg, .cp-scroll > .thread-notice > svg { width: var(--size-icon); height: var(--size-icon); }");
  expect(css).toMatch(/\.conversation-thread \.thread-notice \.strip-text span, \.cp-scroll > \.thread-notice \.strip-text span \{[^}]*overflow: visible; text-overflow: clip; \}/);
});

// runtime-test (buzz-project RT): at 960×600 the new-conversation placeholder wrapped to two lines in the empty capsule
// (field 48px, docked 120px) and the first typed character dropped it to one (24/104). One line keeps both the same.
test("the capsule's placeholder stays on one line and ends in an ellipsis", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain('.docked[data-shape="capsule"] .composer-input[data-empty]::before { inset-inline: var(--space-2) var(--space-1); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }');
});

// permission-mode spec decision 7 (U1): an existing conversation's picker shows that conversation's stored mode; a new
// one starts from the fixed Settings default, else the provider's last mode.
test("the picker shows the conversation's own mode, and a new conversation's default", () => {
  expect(render([summary({ permissionMode: "plan" })], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="plan" aria-label="Permission: Plan (read-only)"');
  expect(render([summary()], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="default" aria-label="Permission: Default"');
  expect(render([], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="bypass" aria-label="Permission: Full access, no approval requests"');
  expect(render([], { prefs: { permissions: { claude: "bypass" } }, defaults: { provider: "claude", permissionMode: "acceptEdits" } })).toContain('data-mode="acceptEdits"');
});

// Thread spacing (2026-11-03 user): wider gaps between thread items and more room above the composer; the new
// conversation's suggestion rows stay right above the composer on the Overview and in the canvas panel.
test("thread spacing, and the suggestion rows right above the composer on the Overview and in the canvas panel", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".conversation-thread .thread { display: flex; flex-direction: column; gap: var(--space-6); }");
  expect(css).toContain(".ov-main .thread-scroll { padding: var(--space-2) var(--space-6) var(--space-6); }");
  expect(css).toContain(".doan-conv-panel .thread-scroll { padding: var(--space-2) var(--space-4) var(--space-6); }");
  expect(css).toContain(".doan-conv-panel .conversation-thread .thread { gap: var(--space-5); }");
  expect(css).toContain(".ov-suggestions { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }");
  expect(css).not.toMatch(/\.ov-new \{/);
});

// prompt-suggestion design 'renderer' 1: the shown conversation's suggestion from the Overview's list reaches its composer.
test("the shown conversation's suggestion stands in for the reply placeholder, with the Right Arrow hint", () => {
  const html = render([summary({ suggestion: "Add an expired-cart illustration" })]);
  expect(html).toContain('aria-placeholder="Add an expired-cart illustration"');
  expect(html).toContain("Press Right Arrow to use the suggestion.");
  expect(render([summary()])).not.toContain("Press Right Arrow");
});
