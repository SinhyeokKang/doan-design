import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import { textSegments } from "./anchorField";
import { DockedSupport } from "./dockedSupport";
import { suggestedPrompts, type PresetSummary, type SuggestedPrompt } from "./homeComposer";
import { SuggestionButton } from "./ComposerParts";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { worktreeChoice } from "./worktreeSwitchModel";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// The Overview's header and main column as static markup.

const ROOT = "/code/doan", WT = "/code/doan-checkout";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const row = (path: string): CanvasRow => ({ path, id: path.split("/").at(-1)!.replace(/\.html$/, ""), url: "u" });
const entry = (path: string, canvases: string[], branch = "main"): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases: canvases.map(row), git: { branch, common: "/code/doan/.git" } } as FolderEntry);
// An unseen ending by default, so the first entry of the run reopens the conversation rather than starting fresh
// (PRODUCT §5 item 3 'Which conversation shows').
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "What should the checkout empty state say when a cart has expired?", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: true, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...patch,
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
  const run = new OverviewRun(host, window.doan);
  run.show(ROOT);
  setup?.(run);
  const support = new DockedSupport(() => {}, window.doan);
  support.auth = AUTH;
  support.presets = { v: 1, ok: true, result: { version: "1", presets: PRESETS } };
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry: entry(ROOT, [".doan/canvases/checkout.html"]), worktrees: [entry(ROOT, [])], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {}, ...patch,
  };
  return renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
}

test("the header names the project, its selector for one worktree, and the conversation's title", () => {
  const html = render([summary()]);
  expect(html).toContain('<span class="ov-project-name" data-state="closed" data-slot="tooltip-trigger">doan</span>');
  expect(html).toMatch(/<button[^>]*aria-label="Worktree: main"/);
  expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*><svg[^>]*class="[^"]*git-branch/);
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
  // The shared Tooltip, as Home's suggestions have, not the native title.
  expect(html).not.toContain('title="Review the checkout canvas"');
  expect(html).toMatch(/<button type="button" class="suggestion" data-state="closed" data-slot="tooltip-trigger"><span class="suggestion-icon">/);
  // The name is highlighted; title and the sentence's text are unchanged.
  expect(html).toContain('<span class="suggestion-label">Review the <span class="suggestion-value">checkout</span> canvas</span>');
});

// The rows are the shared SuggestionButton, so the three surfaces cannot drift apart again.
const suggestionButtons = (html: string) => html.match(/<button type="button" class="suggestion".*?<\/button>/g) ?? [];
const sharedSuggestions = (prompts: readonly SuggestedPrompt[]) => prompts.flatMap(prompt => suggestionButtons(renderToStaticMarkup(<TooltipProvider><SuggestionButton prompt={prompt} onPick={() => {}} /></TooltipProvider>)));
test("the Overview's suggested prompts are the shared suggestion button", () => {
  const prompts = suggestedPrompts(entry(ROOT, [".doan/canvases/checkout.html"]), "doan", PRESETS);
  expect(prompts.length).toBeGreaterThan(0);
  expect(suggestionButtons(render([]))).toEqual(sharedSuggestions(prompts));
});

test("selectable: the notice text, not the notice's moved line", () => {
  const notice = "Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.";
  const html = render([summary()], { notice });
  expect(html).toContain(`<span class="grow-text selectable">${notice}</span>`);
  expect(html).not.toMatch(/<(h1|button)[^>]*selectable/);
});

test("the duplicate-ID notice shows under the header", () => {
  const notice = "Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.";
  const html = render([summary()], { notice });
  expect(html).toMatch(new RegExp(`</header><div class="doan-notice ov-notice" role="status">.*<span class="grow-text selectable">${notice.replace(/\./g, "\\.")}</span></div>`));
});

test("while the list is read the title is unavailable and the composer is a new conversation; a failed read says so", () => {
  const loading = render("loading");
  const titleTag = (html: string) => html.match(/<button[^>]*class="ov-title doan-button"[^>]*>/)?.[0] ?? "";
  // aria-disabled, still focusable: a trigger focused when the list goes back to loading keeps focus.
  expect(titleTag(loading)).toContain('aria-disabled="true"');
  expect(titleTag(loading)).not.toMatch(/ disabled=""/);
  expect(loading).toContain('placeholder="Ask or describe what to design, / for presets"');
  expect(loading).not.toContain("Loading conversation");
  expect(loading).toContain('<div class="thread-loading" role="status"></div>');
  const failed = render("error");
  expect(titleTag(failed)).not.toContain("disabled");
});

// The column leads with the canvas panel's thread notice, before the suggestions, and the composer stays usable.
test("a failed first read shows the canvas panel's notice with Retry in the new conversation column", () => {
  const html = render("error");
  const column = html.slice(html.indexOf('class="ov-col ov-new"'));
  expect(column).toMatch(/^class="ov-col ov-new"><div class="doan-notice error thread-notice" role="alert"><svg[^>]*class="[^"]*doan-alert-icon[^"]*"/);
  expect(column).toContain('<span class="strip-text selectable"><b>Couldn’t read conversations</b><span>Try again. You can still start a new conversation.</span></span>');
  expect(column).toMatch(/<span class="strip-actions"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Retry<\/button><\/span><\/div><div class="ov-suggestions"/);
  expect(render([])).not.toContain("thread-notice");
  expect(render("loading")).not.toContain("thread-notice");
});

// While the re-read runs the Retry is busy; a second failure changes the line so it is read again.
test("the column's Retry runs while the list is read again, and a repeated failure is announced again", () => {
  const running = render("error", { listRetry: { running: true, failures: 0 } });
  expect(running).toMatch(/<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-disabled="true" aria-busy="true"><span class="doan-spinner" aria-hidden="true"><\/span>Retry<\/button>/);
  const again = render("error", { listRetry: { running: false, failures: 1 } });
  expect(again).toContain("<span>Try again. You can still start a new conversation.\u00a0</span>");
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

// The chip's worktree rows behave as the sidebar's: a listed or reading worktree opens,
// a problem one turns the menu to its repair actions.
test("a problem worktree in the chip menu shows its repair actions instead of opening", () => {
  const missing = { kind: "notFound", path: "/code/gone" } as FolderEntry;
  const unset = { kind: "uninitialized", path: "/code/new" } as FolderEntry;
  expect(worktreeChoice(entry(WT, []))).toEqual({ kind: "open" });
  expect(worktreeChoice({ kind: "loading", path: WT } as FolderEntry)).toEqual({ kind: "open" });
  expect(worktreeChoice(missing)).toEqual({ kind: "repair", actions: ["locate"] });
  expect(worktreeChoice(unset)).toEqual({ kind: "repair", actions: ["setUp"] });
  expect(worktreeChoice({ kind: "error", path: "/code/bad", message: "m", config: "/code/bad/.doan/config.json" } as FolderEntry)).toEqual({ kind: "repair", actions: ["retry", "details"] });
  expect(worktreeChoice({ kind: "cliError", path: "/code/cli", reason: "r" } as FolderEntry)).toEqual({ kind: "repair", actions: ["retry", "details"] });
});

// The app body's tabular figures widen short times, button.doan-chip's open fill would replace the worktree chip's pressed fill,
// and a bare lucide glyph renders at 24px instead of 16.
test("the Overview's surfaces take plain numerals, the open chip its pressed fill, and notice glyphs the icon size", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".ov-main, .right.ov-right, .conv-menu, .wt-menu, .doan-insp-menu, .doan-insp-tip { font-variant-numeric: normal; }");
  expect(css).toContain('button.wt-chip.doan-chip[aria-expanded="true"] { background: var(--affordance-backdrop-pressed); }');
  // The canvas panel's notices above its composer read the same.
  expect(css).toContain(".conversation-thread .thread-notice > svg, :is(.cp-scroll, .ov-new) > .thread-notice > svg { width: var(--size-icon); height: var(--size-icon); }");
  expect(css).toMatch(/\.conversation-thread \.thread-notice \.strip-text span, :is\(\.cp-scroll, \.ov-new\) > \.thread-notice \.strip-text span \{[^}]*overflow: visible; text-overflow: clip; \}/);
});

// The worktree row's label span grows (flex: 1) and the chip is a span too, so it would stretch in Home's and the Overview's
// worktree menus.
test("a worktree row's status chip keeps its content width", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".shell-worktree > .ob-chip { flex: none; }");
});

// A placeholder that wraps to two lines in the empty capsule would drop to one at the first typed character; one line keeps
// both the same.
test("the capsule's placeholder stays on one line and ends in an ellipsis", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain('.docked[data-shape="capsule"] .composer-input[data-empty]::before { inset-inline: var(--space-2) var(--space-1); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }');
});

// An existing conversation's picker shows that conversation's stored mode; a new
// one starts from the fixed Settings default, else the provider's last mode.
test("the picker shows the conversation's own mode, and a new conversation's default", () => {
  expect(render([summary({ permissionMode: "plan" })], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="plan" aria-label="Permission: Plan (read-only)"');
  expect(render([summary()], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="default" aria-label="Permission: Ask first"');
  expect(render([], { prefs: { permissions: { claude: "bypass" } } })).toContain('data-mode="bypass" aria-label="Permission: Full access, no approval requests"');
  expect(render([], { prefs: { permissions: { claude: "bypass" } }, defaults: { provider: "claude", permissionMode: "acceptEdits" } })).toContain('data-mode="acceptEdits"');
});

// Wider gaps between thread items and more room above the composer; the suggestion rows stay right above the composer on the
// Overview and in the canvas panel.
test("thread spacing, and the suggestion rows right above the composer on the Overview and in the canvas panel", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".conversation-thread .thread { display: flex; flex-direction: column; gap: var(--space-6); }");
  // 32 under the last item: the docked buddy stands 56px over the card's top edge.
  expect(css).toContain(".ov-main .thread-scroll { padding: var(--space-2) var(--space-6) var(--space-8); }");
  expect(css).toContain(".doan-conv-panel .thread-scroll { padding: var(--space-2) var(--space-4) var(--space-8); }");
  expect(css).toContain(".doan-conv-panel .conversation-thread .thread { gap: var(--space-5); }");
  // 32 under the suggestions as well: the docked buddy stays on the card while they show, and the last row must clear it.
  expect(css).toContain(".ov-suggestions { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-8); }");
  expect(css).not.toMatch(/\.ov-new \{/);
});

// The shown conversation's suggestion from the Overview's list reaches its composer.
test("the shown conversation's suggestion stands in for the reply placeholder, with the Tab or Right Arrow hint", () => {
  const html = render([summary({ suggestion: "Add an expired-cart illustration" })]);
  expect(html).toContain('aria-placeholder="Add an expired-cart illustration"');
  expect(html).toContain("Press Tab or Right Arrow to use the suggestion.");
  expect(render([summary()])).not.toContain("to use the suggestion");
});

// The docked buddy steps aside for a request waiting at the thread's end; the suggested prompts leave room for it instead.
test("the composer tells the docked buddy when the conversation waits for an answer, not when suggestions show", () => {
  const slot = (html: string) => /<div class="docked-buddy-slot"[^>]*>/.exec(html)![0];
  const fresh = render([]);
  expect(fresh).toContain('aria-label="Suggested prompts"');
  expect(slot(fresh)).toBe('<div class="docked-buddy-slot" aria-hidden="true">');
  expect(slot(render([summary()]))).toBe('<div class="docked-buddy-slot" aria-hidden="true">');
  expect(slot(render([summary({ phase: "waiting" })]))).toBe('<div class="docked-buddy-slot" aria-hidden="true" data-waiting="">');
  expect(slot(render([]))).not.toContain("data-notice");
});

// A long folder name stops at 40% of the header and ellipsizes, as the canvas header's crumb does, so New conversation
// stays inside the header.
test("the Overview's project crumb is capped at 40% and its name ellipsizes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.ov-project \{[^}]*flex: 0 1 auto; max-width: 40%; min-width: 0;/);
  expect(css).toMatch(/\.ov-project-name \{[^}]*min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
});
