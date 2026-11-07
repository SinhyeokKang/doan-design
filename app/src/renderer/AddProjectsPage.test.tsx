import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ProjectScreen, projectFocusNode, projectNotice, type ProjectScreenProps } from "./Onboarding";
import type { ProjectStepState } from "./projectStep";

// The page shares onboarding's Project screen, with its own heading and footer because it adds a project without wizard steps.
const noop = () => {};
const on: ProjectScreenProps["on"] = { back: noop, backToAgents: noop, chooseFolder: noop, chooseExisting: noop, setUrl: noop, find: noop, cancelInspect: noop, edit: noop,
  pickListed: noop, useListed: noop, pickCandidate: noop, select: noop, setUp: noop, changeDestination: noop, useExisting: noop, clone: noop, cancelClone: noop, complete: noop, retry: noop, setStorage: noop };
const base: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
const page = (state: Partial<ProjectStepState>, busy = false) => renderToStaticMarkup(<ProjectScreen use="addPage" headingId="add-page-title" state={{ ...base, ...state }} busy={busy} agentReady projects={["/Users/ada/code/doan"]} home="/Users/ada" urlValid={false} heading={noop} on={on} />);
const cloning = { kind: "cloning", url: "https://github.com/acme/tokens", destination: "/Users/ada/code/tokens", operationId: "op", cancelling: false } as const;

test("the page heading is 'Add a project', named for the landmark, without Your projects", () => {
  const html = page({});
  expect(html).toContain('<div class="ob-heading"><h2 tabindex="-1" id="add-page-title">Add a project</h2><p>Start with a folder on your Mac, or a GitHub repository.</p></div>');
  expect(html).not.toContain("Your projects");
  expect(html).toContain("Open a local folder");
});

test("the page footer is Cancel, plus the step's primary only for candidates and clone", () => {
  expect(page({})).toContain('<div class="ob-footer add-footer"><button type="button" class="doan-button" data-ui-variant="subtle">Cancel</button></div>');
  const candidates = page({ phase: { kind: "candidates", inspectionId: "i", url: null, candidates: [{ path: "/w/a", changes: [] }, { path: "/w/b", changes: [] }], choice: "/w/a" } });
  expect(candidates).toMatch(/<div class="ob-footer add-footer"><button type="button" class="doan-button" data-ui-variant="subtle">Cancel<\/button><button type="button" class="doan-button" data-ui-variant="prominent" data-consent="">Use this folder<svg/);
  const clone = page({ phase: { kind: "clone", url: "https://github.com/acme/tokens", inspectionId: "i", destination: "/Users/ada/code/tokens" } });
  expect(clone).toMatch(/data-ui-variant="prominent" data-consent="">Clone and add<svg/);
  expect(page({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [] } })).toContain(">Set up and add</button>");
});

// the page's footer only leaves, so a local folder's setup offers Choose
// another folder under its panel, as drawn; first run keeps its shipped setup panel.
test("a local folder's setup offers Choose another folder on the page only", () => {
  const setup: Partial<ProjectStepState> = { phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [] } };
  const other = '<div class="ob-small-action"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Choose another folder</button></div>';
  expect(page(setup)).toContain(`</section>${other}<div class="ob-footer add-footer">`);
  const firstRun = renderToStaticMarkup(<ProjectScreen state={{ ...base, ...setup }} busy={false} agentReady projects={[]} home={null} urlValid={false} heading={noop} on={on} />);
  expect(firstRun).toContain("Set up and continue");
  expect(firstRun).not.toContain("Choose another folder");
});

// a setup error whose recovery already offers Choose another folder does not repeat it underneath.
test("a failed local setup shows Choose another folder once, in its recovery", () => {
  for (const code of ["init_failed", "config_invalid"] as const) {
    const html = page({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [] }, error: { code } });
    expect(html.match(/Choose another folder/g)).toHaveLength(1);
    expect(html).not.toContain("ob-small-action");
  }
});

test("selecting and cloning have no footer; cloning says why the page cannot be left", () => {
  expect(page({ phase: { kind: "selecting", path: "/w/a" } }, true)).not.toContain("ob-footer");
  const html = page({ phase: cloning }, true);
  expect(html).not.toContain("ob-footer");
  expect(html).toContain('<p class="ob-fine">Stay on this page until the clone finishes, or cancel it.</p>');
  expect(page({ phase: { ...cloning, cancelling: true } }, true)).not.toContain("ob-footer");
});

test("the inline Cancel of a repository check is named apart from the footer Cancel", () => {
  const html = page({ phase: { kind: "inspecting", url: "https://github.com/acme/tokens" }, url: "https://github.com/acme/tokens" }, true);
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-label="Cancel check">Cancel</button>');
  expect(html).toContain('data-ui-variant="subtle">Cancel</button></div>');
});

test("every error code shows first run's copy; the page never shows the no-agent notice", () => {
  for (const code of ["project_unavailable", "remote_mismatch", "init_failed", "config_invalid", "git_missing", "destination_exists", "clone_failed"] as const) {
    const html = page({ phase: { kind: "choose" }, error: { code } });
    expect(html).toContain(projectNotice(code, undefined, null).body);
  }
  expect(page({ phase: { kind: "choose" }, error: { code: "no_ready_agent" } })).not.toContain("Back to agents");
});

test("a refused drop's notice sits under the card as an alert", () => {
  const html = renderToStaticMarkup(<ProjectScreen use="addPage" state={base} busy={false} agentReady projects={[]} home={null} urlValid={false} heading={noop} on={on}
    drop={{ notice: "Drop one folder at a time.", allowed: () => true, started: noop, dropped: noop }} />);
  // The page sits on the white home panel, so its notice keeps the inset fill; first run's overlay takes the panel.
  expect(html).toMatch(/Choose folder<\/button><\/div><div class="doan-notice error ob-project-notice ob-drop-notice" role="alert" tabindex="-1"><svg[^>]*>.*?<\/svg><span>Drop one folder at a time\.<\/span><\/div>/);
});

test("first run's Project step takes the same card drop", () => {
  const html = renderToStaticMarkup(<ProjectScreen state={base} busy={false} agentReady projects={[]} home={null} urlValid={false} heading={noop} on={on}
    drop={{ notice: "Only folders can be added.", allowed: () => true, started: noop, dropped: noop }} />);
  expect(html).toContain("Choose your project");
  expect(html).toMatch(/Choose folder<\/button><\/div><div class="doan-notice error doan-panel ob-project-notice ob-drop-notice" role="alert" tabindex="-1">.*?<span>Only folders can be added\.<\/span>/);
});

// The shared focus hook's decision; the page and first run pass their own scene root.
interface Fake { isConnected: boolean; disabled: boolean; matches(selector: string): boolean; focus(): void; closest?(): null; dataset?: Record<string, string> }
const node = (over: Partial<Fake> = {}): Fake => { const n: Fake = { isConnected: true, disabled: false, matches: s => s === ":disabled" ? n.disabled : false, focus: vi.fn(), dataset: {}, ...over }; return n; };
function root(found: Record<string, Fake | null>) { return { querySelector: (selector: string) => Object.entries(found).find(([key]) => selector.includes(key))?.[1] ?? null }; }
const body = node();
test("focus: a closed folder sheet hands focus back to its button, else the alert, the status or the first action", () => {
  for (const use of ["page", "onboarding"]) {
    const opener = node(), heading = node(), alert = node(), status = node(), action = node();
    const scene = root({ 'role="alert"': alert, 'role="status"': status, "button:not(:disabled)": action });
    const at = (state: ProjectStepState, over: Partial<Parameters<typeof projectFocusNode>[0]> = {}) =>
      projectFocusNode({ opened: null, asked: false, root: scene as never, active: body as never, body: body as never, heading: heading as never, state, agentReady: true, busy: false, ...over });
    expect(at(base, { opened: { node: opener as never, phase: "choose" } }), use).toBe(opener);
    // The screen changed while the sheet was open: the button is not where the person is any more.
    expect(at({ ...base, phase: { kind: "checking", path: "/w/a" } }, { opened: { node: opener as never, phase: "choose" } })).toBe(status);
    expect(at({ ...base, error: { code: "project_unavailable" } })).toBe(alert);
    expect(at({ ...base, phase: cloning })).toBe(status);
    expect(at(base)).toBe(action);
    // Focus the person holds is never moved.
    expect(at(base, { active: node() as never })).toBeNull();
    expect(at(base, { root: root({}) as never })).toBe(heading);
  }
});

// the page's CSS lives in styles.css (POSTMORTEM 2026-10-25 'Production CSS extraction concealed missing
// development styles'), from the draft's add-panel, card drop and lock rules.
test("the panel scrolls whole, the card holds its drop target, and the lock takes the disabled ink", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.add-panel \{ display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;/);
  expect(css).toMatch(/\.ob-local-option \{ position: relative;/);
  expect(css).toMatch(/\.drop-target \{ position: absolute; inset: 0;[^}]*outline: 2px dashed var\(--affordance-accent\);/);
  for (const selector of ['.shell-modes button[aria-disabled="true"]', '.shell-search[aria-disabled="true"]', '.shell-side .row[aria-disabled="true"]', '.shell-history .doan-icon-button[aria-disabled="true"]', '.doan-menu-item[aria-disabled="true"]'])
    expect(css).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{ color: var\\(--text-disabled\\); cursor: default; \\}`));
  for (const source of ["./AddProjectsPage.tsx", "./Onboarding.tsx"]) expect(readFileSync(new URL(source, import.meta.url), "utf8")).not.toMatch(/import .*\.css/);
});

// the page's shared Project screen is drawn in first run's 14/20 body text with plain numerals,
// like the onboarding overlay; the panel otherwise passes on the app body's 13px/normal and tabular numerals. The
// panel scrolls only vertically, as drawn.
test("the page panel sets first run's body text and clips sideways", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const rule = /\.add-panel \{([^}]*)\}/.exec(css)?.[1] ?? "";
  for (const declaration of ["overflow-x: hidden;", "overflow-y: auto;", "font-size: var(--type-body-sm-size);", "line-height: var(--type-body-sm-line-height);", "font-variant-numeric: normal;"])
    expect(rule).toContain(declaration);
});

// a locked menu item shows no highlight fill, and its icon and path take the disabled ink; the selected
// worktree keeps its own fill and check.
test("locked project-menu items get no highlight fill and disabled ink on their icon and path", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain('.doan-menu-item[aria-disabled="true"]:not([aria-current="true"]):is([data-highlighted], [data-state="open"]) { background: transparent; }');
  expect(css).toContain('.shell-project-menu .doan-menu-item[aria-disabled="true"] > svg:first-child, .shell-worktree[aria-disabled="true"] small { color: var(--text-disabled); }');
});

// a drop notice never takes focus, so an error that follows it is the one announced.
test("focus: the drop notice is never the alert focus goes to", () => {
  const dropNotice = node(), error = node(), heading = node();
  const scene = { querySelector: (selector: string) => !selector.includes('role="alert"') ? null : selector.includes(":not(.ob-drop-notice)") ? error : dropNotice };
  for (const _use of ["page", "onboarding"])
    expect(projectFocusNode({ opened: null, asked: false, root: scene as never, active: null, body: body as never, heading: heading as never, state: { ...base, error: { code: "remote_mismatch" } }, agentReady: true, busy: false })).toBe(error);
});

// Draft canvas local-doan-files frames setup-panel and clone: the "Doan files" card above the button, or the fact for a
// project already kept out of Git; on the clone screen under Save to, disabled while the clone runs.
test("the setup panel offers where the Doan files go, or says the project already keeps them out of Git", () => {
  const setup = (over: object, state: Partial<ProjectStepState> = {}) => page({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"], ...over }, ...state });
  const html = setup({});
  expect(html).toMatch(/<div class="ob-field-label storage-label" id="ob-setup-storage-label">Doan files<\/div><div role="radiogroup" aria-labelledby="ob-setup-storage-label" class="doan-panel ob-provider-list storage-list">/);
  expect(html).toContain('<input type="radio" name="ob-setup-storage" checked=""/>');
  expect(html).toContain("<strong>Include in Git</strong><span>Git tracks these files. Commit them so your team gets your canvases and settings.</span>");
  expect(html).toContain("<strong>Keep out of Git (this Mac only)</strong><span>These files stay in this worktree on this Mac; other worktrees and Macs don’t get them. Git ignores them, so <code>git worktree remove</code> or <code>git clean -x</code> deletes them. To show someone a canvas, use Export in the canvas menu.</span>");
  expect(html.indexOf("Doan files")).toBeLessThan(html.indexOf("Set up and add"));
  const local = setup({}, { storage: "local" });
  expect(local.match(/<input type="radio" name="ob-setup-storage"( checked="")?\/>/g)).toEqual(['<input type="radio" name="ob-setup-storage"/>', '<input type="radio" name="ob-setup-storage" checked=""/>']);
  const kept = setup({ changes: [".doan/canvases/", ".doan/config.json"], storage: "local" });
  expect(kept).toContain('<div class="doan-panel ob-provider-list"><div class="ob-provider"><div class="ob-provider-label"><strong>Keep out of Git (this Mac only)</strong><span>This project already keeps its Doan files out of Git in every worktree. Change it in Project Settings.</span></div></div></div>');
  expect(kept).not.toContain('type="radio"');
});

test("a refused local setup says why in the panel's notice, with the choice still there", () => {
  const html = page({ storage: "local", phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [".doan/canvases/", ".doan/config.json", ".git/info/exclude"], storage: "local" }, error: { code: "local_not_git" } });
  expect(html).toContain("This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run git init here first.");
  expect(html).toContain('<input type="radio" name="ob-setup-storage" checked=""/>');
  expect(page({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [] }, error: { code: "local_exclude_failed" } }))
    .toContain("Couldn’t add Doan’s lines to .git/info/exclude, so nothing was set up. Make sure the repository’s Git metadata and its exclude file can be read and written, then retry.");
});

test("the clone screen asks under Save to, and keeps the choice disabled while the clone runs", () => {
  const clone = page({ storage: "local", phase: { kind: "clone", url: "https://github.com/acme/tokens", inspectionId: "i", destination: "/Users/ada/code/tokens" } });
  expect(clone).toContain('Change</button></div><div class="ob-field-label ob-spaced" id="ob-clone-storage-label">Doan files</div><div role="radiogroup"');
  expect(clone.indexOf("Doan files")).toBeLessThan(clone.indexOf("Already have this repository?"));
  expect(clone).toContain('<input type="radio" name="ob-clone-storage" checked=""/>');
  const running = page({ storage: "local", phase: cloning }, true);
  expect(running).toContain('<input type="radio" disabled="" name="ob-clone-storage" checked=""/>');
  expect(running).toContain('<input type="radio" disabled="" name="ob-clone-storage"/>');
});

// After a clone landed, a storage or setup failure is told in main's words, which say the clone stayed.
test("a clone that landed but whose storage failed says so on the clone screen", () => {
  const message = "The repository was cloned and added, but Doan could not keep its files out of Git, so they stay in Git for now. Choose Keep out of Git in its Project Settings to try again.";
  for (const code of ["local_exclude_failed", "local_not_git", "init_failed"] as const) {
    const html = page({ storage: "local", phase: { kind: "clone", url: "https://github.com/acme/tokens", inspectionId: null, destination: "/Users/ada/code/tokens" }, error: { code, message } });
    expect(html, code).toContain(message);
    expect(html, code).not.toContain("nothing was set up");
  }
});
