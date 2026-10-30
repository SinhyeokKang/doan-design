import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { OnboardingOperation } from "../formats/types";

// Conductor decisions ⚪2 and ⚪4 (review-BU1): the page body's wiring to App and to its session, with hooks as plain
// state so its effects and the session's own callbacks run (LocalFolderCard.interaction.test.tsx style).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps?: unknown[] } | undefined)[], pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    hooks.effects[index] = { deps };
    hooks.pending.push(() => { run(); });
  },
  useReducer: () => [0, () => {}],
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }]; },
}));
const { AddProjectsPage } = await import("./AddProjectsPage");
const { ProjectScreen } = await import("./Onboarding");

let doan: Record<string, ReturnType<typeof vi.fn>>;
let readPage: (reply: unknown) => void;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  doan = {
    readAddPage: vi.fn(() => new Promise(resolve => { readPage = resolve; })), onAddPageSession: vi.fn(() => () => {}),
    inspectAddPageProject: vi.fn(), selectAddPageProject: vi.fn(() => new Promise(() => {})), cloneAddPageProject: vi.fn(), cancelAddPageOperation: vi.fn(),
    chooseOnboardingFolder: vi.fn(async () => null),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {} });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
});
afterEach(() => vi.unstubAllGlobals());

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
type PageProps = Parameters<typeof AddProjectsPage>[0];
const props = (over: Partial<PageProps> = {}): PageProps => ({ header: null, sidebar: null, projects: [], homeDirectory: "/Users/ada", mainCheckout: () => false, choose: 0, onState: vi.fn(), onCancel: vi.fn(), onAdded: vi.fn(), ...over });
// Renders the page and, once the session id is read, its body, running the effects each render schedules.
function render(page: PageProps, heading?: { focus(): void }) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  const tree = AddProjectsPage(page);
  const body = all(tree).find(element => typeof element.type === "function" && element.type.name === "PageBody");
  const inner = body ? (body.type as (props: unknown) => ReactNode)(body.props) : null;
  const screen = all(inner).find(element => element.type === ProjectScreen) as ReactElement<{ heading(node: unknown): void; on: Record<string, () => void> }> | undefined;
  if (heading) screen?.props.heading(heading);
  for (const run of hooks.pending.splice(0)) run();
  return screen;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const status = (sessionId: string) => ({ v: 2, ok: true, op: "status", result: { sessionId, revision: 0, project: null, operations: [] } });
const op = (kind: OnboardingOperation["kind"], over: Partial<OnboardingOperation>) => ({ v: 2, ok: true, op: kind, result: { operation: { operationId: `op-${kind}`, requestId: "r", kind, state: "succeeded", ...over } } });

test("the page body reads its session, focuses the heading on entry, and reports the lock from the session's own change", async () => {
  const page = props();
  render(page);
  readPage(status("p1")); await flush();
  const heading = { focus: vi.fn() };
  const screen = render(page, heading)!;
  expect(heading.focus).toHaveBeenCalled();
  doan.chooseOnboardingFolder!.mockResolvedValueOnce("/code/app");
  doan.inspectAddPageProject!.mockResolvedValueOnce(op("project_inspect", { inspection: { inspectionId: "i1", candidates: [{ path: "/code/app", changes: [] }] } }));
  screen.props.on.chooseFolder!();
  // Busy at once: the report needs no render in between.
  expect(page.onState).toHaveBeenLastCalledWith({ locked: false, choose: false });
  await flush();
  // Selecting is locked; the select reply is held, and no render ran since the click.
  expect(page.onState).toHaveBeenLastCalledWith({ locked: true, choose: false });
});

test("File > Add Project… on the page runs Choose folder, also when pressed before the session was read", async () => {
  const early = props();
  render(early);
  // ⌘O before readAddPage answered.
  render({ ...early, choose: 1 });
  readPage(status("p1")); await flush();
  render({ ...early, choose: 1 });
  expect(doan.chooseOnboardingFolder).toHaveBeenCalledTimes(1);
  expect(doan.chooseOnboardingFolder).toHaveBeenCalledWith("project");
  render({ ...early, choose: 1 });
  expect(doan.chooseOnboardingFolder).toHaveBeenCalledTimes(1);
  await flush();
  render({ ...early, choose: 2 });
  expect(doan.chooseOnboardingFolder).toHaveBeenCalledTimes(2);
});

test("a page opened without ⌘O does not run Choose folder by itself", async () => {
  const page = props({ choose: 3 });
  render(page);
  readPage(status("p1")); await flush();
  render(page);
  expect(doan.chooseOnboardingFolder).not.toHaveBeenCalled();
});
