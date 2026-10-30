import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ProjectScreen, projectFocusNode, projectNotice, type ProjectScreenProps } from "./Onboarding";
import type { ProjectStepState } from "./projectStep";

// buzz-add-projects U2: the page renders the onboarding Project screen with the differences in design '온보딩과의 공유'.
const noop = () => {};
const on: ProjectScreenProps["on"] = { back: noop, backToAgents: noop, chooseFolder: noop, chooseExisting: noop, setUrl: noop, find: noop, cancelInspect: noop, edit: noop,
  pickListed: noop, useListed: noop, pickCandidate: noop, select: noop, setUp: noop, changeDestination: noop, useExisting: noop, clone: noop, cancelClone: noop, complete: noop, retry: noop };
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
  expect(html).toMatch(/Choose folder<\/button><\/div><div class="doan-notice error doan-panel ob-project-notice ob-drop-notice" role="alert" tabindex="-1"><svg[^>]*><\/svg><span>Drop one folder at a time\.<\/span><\/div>/);
});

// The shared focus hook's decision (design '포커스'); the page and first run pass their own scene root.
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
