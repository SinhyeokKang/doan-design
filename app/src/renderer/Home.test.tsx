import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Home } from "./Home";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { emptyComposer, type ComposerMemory, type HomeComposerProps } from "./HomeComposerView";
import type { PresetListReply, PresetSummary } from "./homeComposer";
import { ShellSidebar } from "./ShellSidebar";
import { groupProjects } from "./homeCards";
import { TooltipProvider } from "./components/ui/tooltip";

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
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u", open: 0, resolved: 0 });
const project = (path: string, canvases: CanvasRow[] = [row("buzz-onboarding")]): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases, git: { common: `${path}/.git`, main: path, branch: "main", worktrees: [] } });

function render(entries: FolderEntry[], memory: Partial<ComposerMemory> = {}, props: Partial<HomeComposerProps> = {}) {
  const cards = groupProjects(entries, new Map());
  const sidebar = <ShellSidebar home cards={cards} projects={{}} loaded={entries[0]?.path ?? null} canvas={entries[0]?.kind === "list" ? entries[0].canvases[0]?.path : undefined} homeDirectory={null} search={() => {}} toggle={() => {}} worktree={() => {}} open={() => {}} overview={() => {}} action={() => {}} remove={async () => {}} />;
  return renderToStaticMarkup(<TooltipProvider><Home header={<header className="top shell-top" />} sidebar={sidebar} entries={entries} homeDirectory="/Users/ada" shellProjects={{}} loaded={null} select={null}
    prefs={{}} memory={{ current: { ...emptyComposer(), auth: AUTH, presets: LISTED, greeting: null, ...memory } }} running={new Map()} restore={null}
    start={async () => ({ ok: true })} openConversation={() => {}} {...props} /></TooltipProvider>);
}

test("Home is the shell with the sidebar and a composer body: no project cards, setup checklist or connection banner", () => {
  const html = render([project("/code/doan-design")]);
  expect(html).not.toContain('class="card');
  expect(html).not.toContain("Finish setting up doan");
  expect(html).not.toContain("Connection problem");
  expect(html).toContain('<main class="app-shell home-shell"><header class="top shell-top"></header><aside class="side shell-side"');
  expect(html).toContain('<section class="home-panel" aria-label="Home"><div class="home-atmosphere" aria-hidden="true"></div><div class="home-stage"><h1 class="home-greeting">');
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
  expect(html).toContain('<textarea class="composer-input" aria-label="Message" rows="2" placeholder="Describe what to design, / for presets"></textarea>');
  expect(html).toMatch(/<button type="button" class="composer-send doan-icon-button" data-ui-variant="accent" aria-label="Send" disabled=""/);
  expect(html).toContain('<div class="composer-tray"><span class="tray-branch">');
  expect(html).toContain('<span class="tray-path">/code/doan-design</span>');
  expect(html).toContain('<div class="home-suggestions" role="group" aria-label="Suggested prompts">');
  expect(html.match(/class="suggestion doan-button" data-ui-size="sm" data-ui-variant="quiet"/g)).toHaveLength(3);
  expect(html).toContain("<span>Critique the buzz-onboarding canvas</span>");
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
  expect(html).toContain('<div class="composer-reason" role="status"><span>No agent is ready to run.</span></div>');
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
  expect(html).not.toContain("home-suggestions");
});

test("Tab order is project, chip ×, field, toolbar, Send, worktree, suggestions, then the reason line's Open (design §4.9)", () => {
  const worktrees: FolderEntry[] = ["/code/doan-design", "/code/doan-wt"].map((path, i) => ({ ...project(path), git: { common: "/code/doan-design/.git", main: "/code/doan-design", branch: i ? "feat" : "main", worktrees: [] } }));
  const html = render(worktrees, { preset: PRESETS[3]!, text: "" }, { running: new Map([["/code/doan-design", "c1"]]) });
  const order = [...html.matchAll(/<(button|textarea)[^>]*?(aria-label="([^"]*)"|>([^<]*))/g)].map(m => m[3] ?? m[4] ?? "");
  const at = (label: string) => order.findIndex(item => item.startsWith(label));
  const sequence = ["Project:", "Remove preset", "Message", "Attach files", "Design presets", "Agent:", "Send", "Worktree:", "Open"].map(at);
  expect(sequence.every(index => index >= 0)).toBe(true);
  expect([...sequence].sort((a, b) => a - b)).toEqual(sequence);
  expect(html).toContain('<div class="composer-reason" role="status"><span>A conversation from Home is still running in doan-design.</span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Open</button></div>');
});

test("near the limit a counter shows what is left; over it Send is disabled and the reason says to shorten", () => {
  const near = render([project("/code/doan-design")], { text: "x".repeat(30000) });
  expect(near).toContain('<div class="composer-count" aria-live="polite">2,768 characters left</div>');
  const over = render([project("/code/doan-design")], { text: "x".repeat(33000) });
  expect(over).toContain('<div class="composer-count over" aria-live="polite">232 characters over the limit</div>');
  expect(over).toContain("<span>Shorten the message to send it.</span>");
});
