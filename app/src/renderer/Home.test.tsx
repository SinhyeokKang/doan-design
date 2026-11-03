import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Home, ProblemActions } from "./Home";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { emptyComposer, type ComposerMemory, type HeroComposerProps } from "./HomeComposerView";
import type { PresetListReply, PresetSummary } from "./homeComposer";
import { ShellSidebar } from "./ShellSidebar";
import { groupProjects } from "./homeCards";
import { TooltipProvider } from "./components/ui/tooltip";
import type { CanvasMenu } from "./ShellSidebar";
const NO_CANVAS_MENU: CanvasMenu = { blocked: () => false, exporting: () => false, exportCanvas: () => {}, trash: () => {} };

vi.mock("./components/ui/tooltip", async importOriginal => {
  const actual = await importOriginal<typeof import("./components/ui/tooltip")>();
  return { ...actual, TooltipContent: ({ children }: { children: React.ReactNode }) => <span role="tooltip">{children}</span> };
});

const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const ACCOUNT: AccountIdentity = { id: "acct", workspace: "org", email: "ada@example.com" };
function dto(provider: Provider, f: { expired?: boolean } = {}): AuthStatusDto {
  const state: AuthState = { provider, generation: 1, verified: true, expired: f.expired ?? false, connection: { provider, connectionId: "c", profile: provider, account: ACCOUNT }, attempt: null, error: null, phase: f.expired ? "reauthRequired" : "connected" };
  return authStatus(state, FACTS, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [dto("claude")] };
const PRESETS: PresetSummary[] = [["context", "Gather design context", "start"], ["shape", "Shape a first screen", "start"], ["document", "Document the design system", "start"], ["critique", "Critique the design", "review"], ["polish", "Polish the details", "refine"]]
  .map(([id, title, group]) => ({ id: id!, title: title!, description: `About ${id}.`, scope: `${id} scope`, group: group! }));
const LISTED: PresetListReply = { v: 1, ok: true, result: { version: "1", presets: PRESETS } };
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u" });
const project = (path: string, canvases: CanvasRow[] = [row("buzz-onboarding")]): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases, git: { common: `${path}/.git`, main: path, branch: "main", worktrees: [] } });

function render(entries: FolderEntry[], memory: Partial<ComposerMemory> = {}, props: Partial<HeroComposerProps> = {}) {
  const cards = groupProjects(entries, new Map());
  const sidebar = <ShellSidebar home cards={cards} projects={{}} loaded={entries[0]?.path ?? null} canvas={entries[0]?.kind === "list" ? entries[0].canvases[0]?.path : undefined} homeDirectory={null} search={() => {}} toggle={() => {}} toggleGroup={() => {}} worktree={() => {}} open={() => {}} overview={() => {}} action={() => {}} remove={async () => {}} projectSettings={() => {}} canvasMenu={NO_CANVAS_MENU} />;
  return renderToStaticMarkup(<TooltipProvider><Home header={<header className="top shell-top" />} sidebar={sidebar} entries={entries} homeDirectory="/Users/ada" shellProjects={{}} loaded={null} select={null}
    prefs={{}} memory={{ current: { ...emptyComposer(), auth: AUTH, presets: LISTED, greeting: null, ...memory } }} running={new Map()} restore={null}
    start={async () => ({ ok: true })} openConversation={() => {}} addProjects={() => {}} openSettings={() => {}} {...props} /></TooltipProvider>);
}

test("Home is the shell with the sidebar and a composer body: no project cards, setup checklist or connection banner", () => {
  const html = render([project("/code/doan-design")]);
  expect(html).not.toContain('class="card');
  expect(html).not.toContain("Finish setting up doan");
  expect(html).not.toContain("Connection problem");
  expect(html).toContain('<main class="app-shell home-shell"><header class="top shell-top"></header><aside class="side shell-side"');
  expect(html).toContain('<section class="home-panel" aria-label="Home"><div class="home-stage"><button type="button" class="doany" aria-label="Make Doany hop" style="width:114px;height:114px"><img src="doany/doany.png" alt=""/><canvas hidden="" aria-hidden="true"></canvas></button><h1 class="home-greeting">');
  // The sidebar marks no current project or canvas on Home (design §3).
  expect(html).not.toContain("aria-current=\"location\"");
});

test("the greeting is one of the five questions, with the chosen project's name", () => {
  const html = render([project("/code/doan-design")], { greeting: "Where should we start?" });
  expect(html).toMatch(/<h1 class="home-greeting">(What should we design today\?|What are we making next\?|What would you like to change\?|What’s next for doan-design\?|Where should we start\?)<\/h1>/);
});

test("an empty composer for a project with canvases: project above, tray below, three suggested prompts and no reason line", () => {
  const html = render([project("/code/doan-design")]);
  expect(html).toContain('aria-label="Project: doan-design"');
  expect(html).toContain('<div class="composer-input" aria-label="Message" tabindex="0" contentEditable="true" aria-placeholder="Describe what to design, / for presets" role="textbox" aria-multiline="true"></div>');
  expect(html).toMatch(/<button type="button" class="composer-send doan-icon-button" data-ui-variant="accent" aria-label="Send" disabled=""/);
  expect(html).toContain('<div class="composer-tray"><span class="tray-branch">');
  expect(html).toContain('<span class="tray-path">/code/doan-design</span>');
  expect(html).toContain('<div class="home-suggestions" role="group" aria-label="Suggested prompts">');
  // suggested-prompt-variants C: a prompt-only row (icon tile, sentence, hover arrow), not the shared doan-button.
  expect(html.match(/<button type="button" class="suggestion"><span class="suggestion-icon"><svg[^>]*aria-hidden="true"/g)).toHaveLength(3);
  expect(html).not.toContain("suggestion doan-button");
  expect(html).toContain('<span class="suggestion-label">Review the buzz-onboarding canvas</span>');
  expect(html.match(/suggestion-go/g)).toHaveLength(3);
  expect(html).not.toContain("composer-reason");
});

test("with no project the picker is Add Projects…, the tray and suggestions are gone and Send explains why", () => {
  const html = render([], { text: "Draw a pricing page." });
  expect(html).toContain('<button type="button" class="home-project doan-button" data-ui-size="sm" data-ui-variant="trigger"><svg');
  expect(html).toContain("<span>Add Projects…</span>");
  expect(html).not.toContain("composer-tray");
  expect(html).not.toContain("home-suggestions");
  expect(html).toContain('<div class="composer-reason" role="status"><span>Add a project to send.</span></div>');
});

test("with no ready agent the picker says so, Send is disabled and no suggestion shows", () => {
  const html = render([project("/code/doan-design")], { text: "Draw a pricing page.", auth: { revision: 1, providers: [] } });
  expect(html).toContain('<span class="muted">No agent ready</span>');
  expect(html).not.toContain("composer-reason");
  expect(html).toMatch(/<button[^>]*aria-label="Send" disabled="" title="No agent is ready to run\."/);
  expect(html).toContain("No agent is ready to run.</span>");
  expect(html).not.toContain("home-suggestions");
});

test("a preset chip and attachments sit above the request; Send is enabled; the chip carries the preset's group icon", () => {
  const html = render([project("/code/doan-design")], {
    text: "Turn the onboarding screens into a documented design system.", preset: PRESETS[2]!,
    attachments: [{ key: "a", id: "1", name: "brand-guidelines.pdf", kind: "file", pasted: false, status: "ready", size: 1258291, path: "/Users/ada/Desktop/brand-guidelines.pdf" }],
  });
  expect(html).toContain('<span class="attach-text"><b>brand-guidelines.pdf</b><small>PDF · 1.2 MB</small></span><button type="button" class="chip-remove doan-icon-button" data-ui-size="xs" aria-label="Remove brand-guidelines.pdf">');
  expect(html).toMatch(/<span class="preset-chip"><svg[^>]*class="lucide lucide-compass[^"]*"[^>]*>.*?<\/svg><span>Document the design system<\/span><button type="button" class="chip-remove doan-icon-button" data-ui-size="xs" aria-label="Remove preset Document the design system">/);
  expect(html).toContain('<span role="tooltip">~/Desktop/brand-guidelines.pdf</span>');
  expect(html).toMatch(/aria-label="Send" data-state/);
  expect(html).not.toMatch(/aria-label="Send" disabled/);
  // Suggestions are hidden, not removed: their place stays (see the layout test below).
  expect(html).toContain('<div class="home-suggestions" role="group" aria-label="Suggested prompts" inert="">');
});

test("Tab order is project, chip ×, field, toolbar, Send, worktree, suggestions, then the reason line's Open (design §4.9)", () => {
  const worktrees: FolderEntry[] = ["/code/doan-design", "/code/doan-wt"].map((path, i) => ({ ...project(path), git: { common: "/code/doan-design/.git", main: "/code/doan-design", branch: i ? "feat" : "main", worktrees: [] } }));
  const html = render(worktrees, { preset: PRESETS[3]!, text: "" }, { running: new Map([["/code/doan-design", { conversationId: "c1", waiting: false }]]) });
  const order = [...html.matchAll(/<(button|div class="composer-input")[^>]*?(aria-label="([^"]*)"|>([^<]*))/g)].map(m => m[3] ?? m[4] ?? "");
  const at = (label: string) => order.findIndex(item => item.startsWith(label));
  const sequence = ["Project:", "Remove preset", "Message", "Attach files", "Design presets", "Agent:", "Send", "Worktree:", "Open"].map(at);
  expect(sequence.every(index => index >= 0)).toBe(true);
  expect([...sequence].sort((a, b) => a - b)).toEqual(sequence);
  expect(html).toContain('<div class="composer-reason" role="status"><span>Another conversation is still running in doan-design.</span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-label="Open the running conversation">Open</button></div>');
});

test("after a late project_busy the reason line shows before the list names the conversation, without Open", () => {
  const html = render([project("/code/doan-design")], { text: "Draw it" }, { running: new Map([["/code/doan-design", { conversationId: "", waiting: false }]]) });
  expect(html).toContain('<div class="composer-reason" role="status"><span>Another conversation is still running in doan-design.</span></div>');
});

test("near the limit a counter shows what is left; over it Send is disabled and the reason says to shorten", () => {
  const near = render([project("/code/doan-design")], { text: "x".repeat(30000) });
  expect(near).toContain('<div class="composer-count" aria-live="polite">2,768 characters left</div>');
  const over = render([project("/code/doan-design")], { text: "x".repeat(33000) });
  expect(over).toContain('<div class="composer-count over" aria-live="polite">232 characters over the limit</div>');
  expect(over).toContain("<span>Shorten the message to send it.</span>");
});

// design-sync V2 (2026-10-30): values measured against the confirmed draft in the real app, pinned where a later edit
// would silently move them. Each was a measured mismatch or a value the draft relies on.
test("Home CSS keeps the draft's measured icon sizes, popover status type, chip ink and shared button paddings", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  // Effort and tray chevrons step down to 14px with their icons; the model and project chevrons stay 16px.
  expect(css).toContain(".composer-effort svg { width: var(--size-icon-sm); height: var(--size-icon-sm); }");
  expect(css).toContain(".composer-tray :is(.doan-button, .tray-branch) svg { width: var(--size-icon-sm); height: var(--size-icon-sm); }");
  // Lucide's default 24px made menu rows 40px instead of 32px and the search glyph 24px.
  expect(css).toContain(".check-slot > svg { height: var(--size-icon); }");
  expect(css).toContain(":is(.popover-search, .project-popover .doan-menu-item) > svg { width: var(--size-icon); height: var(--size-icon); }");
  expect(readFileSync(new URL("./ds/surfaces.css", import.meta.url), "utf8")).toContain(".doan-menu-item .check { flex: none; width: 12px;");
  // A portalled popover inherits the page's 13px body; the loading and no-match line is body-sm 14/20.
  expect(css).toMatch(/\.popover-state \{[^}]*font-size: var\(--type-body-sm-size\); line-height: var\(--type-body-sm-line-height\);/);
  // The preset chip's x renders in the shared chip-remove metadata ink, as the confirmed draft does.
  expect(css).toContain(".chip-remove.doan-icon-button { color: var(--text-metadata); }");
  expect(css).not.toMatch(/\.preset-chip \.chip-remove[^{]*\{[^}]*color/);
  // Send keeps the shared disabled fill while sending, as the draft renders it.
  expect(css).not.toMatch(/\.composer-send[^{]*\{[^}]*background/);
});

// buzz-conversation R1: the composer's focused border and the disabled ink of its tools.
test("Home CSS: the focused composer uses the field-focus border with shadow-sm; disabled Attach and Presets take the disabled ink", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".composer-card:focus-within { box-shadow: var(--shadow-sm), 0 0 0 1px var(--border-field-focus); }");
  expect(css).not.toMatch(/\.composer-card[^{]*\{[^}]*--border-prominent/);
  // After the standard-ink rule, so the disabled ink wins at the same specificity.
  const standard = css.indexOf(".composer-tools > .doan-icon-button:not(.composer-send) { color: var(--text-standard); }");
  const disabled = css.indexOf(".composer-tools > .doan-icon-button:not(.composer-send):disabled { color: var(--text-disabled); }");
  expect(standard).toBeGreaterThan(-1);
  expect(disabled).toBeGreaterThan(standard);
});

// doan-mascot design '배치': the stage is placed from the reference group (empty two-line field, suggestions shown), so
// typing keeps the field still and growth goes downward only.
test("typing keeps the suggestions' place, out of the accessibility tree and the focus order", () => {
  const empty = render([project("/code/doan-design")]);
  expect(empty).toContain('<div class="home-suggestions" role="group" aria-label="Suggested prompts">');
  const typed = render([project("/code/doan-design")], { text: "Draw a pricing page." });
  expect(typed).toContain('<div class="home-suggestions" role="group" aria-label="Suggested prompts" inert="">');
  expect(typed.match(/class="suggestion"/g)).toHaveLength(3);
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".home-stage .home-suggestions[inert] { visibility: hidden; }");
});

test("Doany (114px) is the stage's first child, above the greeting; the stage has no fixed top padding", () => {
  const html = render([project("/code/doan-design")]);
  expect(html).toContain('<div class="home-stage"><button type="button" class="doany" aria-label="Make Doany hop" style="width:114px;height:114px"><img src="doany/doany.png" alt=""/><canvas hidden="" aria-hidden="true"></canvas></button><h1 class="home-greeting">');
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const stage = css.match(/\n\.home-stage \{[^}]*\}/)![0];
  expect(stage).not.toContain("152px");
  expect(stage).toContain("padding: var(--space-8);");
});

// project-settings design '영향 범위' 복구 라벨 (draft frame workspace-status): the status line's actions have no
// ellipsis, and Remove names what it removes.
test("the workspace status line offers Locate, Set Up and Remove from Doan", () => {
  const line = (entry: FolderEntry) => renderToStaticMarkup(<ProblemActions entry={entry} action={() => {}} workspace={{ name: "acme-web", homeDirectory: "/Users/ada", home: () => {} }} />);
  const labels = (html: string) => Array.from(html.matchAll(/<button[^>]*>([^<]*)/g), match => match[1]);
  expect(labels(line({ path: "/Users/ada/code/acme-web", kind: "notFound" }))).toEqual(["Locate", "Remove from Doan", "Go Home"]);
  expect(labels(line({ path: "/Users/ada/code/acme-web", kind: "uninitialized" }))).toEqual(["Set Up", "Remove from Doan", "Go Home"]);
});

// suggested-prompt-variants C (confirmed): full-width rows, 32px under the Home composer; an accent icon tile and an
// arrow shown on hover or keyboard focus.
test("suggestion CSS: full-width rows with an accent icon tile, Home's group 32px under the composer", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.home-suggestions \{[^}]*flex-direction: column;[^}]*width: min\(680px, 100%\);[^}]*margin-top: var\(--space-8\);/);
  expect(css).toMatch(/\.suggestion \{[^}]*display: flex;[^}]*width: 100%;[^}]*gap: var\(--space-3\);[^}]*padding: var\(--space-2\) var\(--space-3\) var\(--space-2\) var\(--space-2\);[^}]*border-radius: var\(--radius-row\);/);
  expect(css).toMatch(/\.suggestion-icon \{[^}]*width: var\(--size-control-xs\);[^}]*height: var\(--size-control-xs\);[^}]*border-radius: var\(--radius-toolbar-icon\);[^}]*background: var\(--surface-accent-subtle\);/);
  expect(css).toMatch(/\.suggestion-go \{[^}]*visibility: hidden;/);
  expect(css).toMatch(/\.suggestion:is\(:hover, :focus-visible\) \.suggestion-go \{ visibility: visible; \}/);
});
