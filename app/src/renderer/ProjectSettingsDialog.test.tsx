import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useId: () => "id",
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useReducer: () => [0, () => {}],
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T,>(callback: T) => callback,
  };
});
// A portal renders in place here, so the header actions it places are in the tree.
vi.mock("react-dom", async original => ({ ...await original<typeof import("react-dom")>(), createPortal: (children: ReactNode) => children }));

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" || typeof node === "number" ? String(node) : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
let tree: ReactNode;
function run(make: () => ReactNode): ReactNode {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = make();
  for (const effect of hooks.pending) effect();
  return tree;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const unmount = () => { for (const slot of hooks.effects) slot?.cleanup?.(); };
const button = (label: string) => { const found = all(tree).find(element => element.type === "button" && (element.props["aria-label"] === label || words(element.props.children) === label)); if (!found) throw new Error(`no button ${label}`); return found; };
const click = (label: string) => (button(label).props.onClick as () => void)();
const text = () => words(all(tree).filter(element => typeof element.type === "string").map(element => element.props.children));
function resetHooks() { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; }

// buzz-settings U5: the Project Settings dialog (design 'Project Settings 다이얼로그'), moved from the Settings
// window's ProjectDetail.
const { ProjectSettingsDialog } = await import("./ProjectSettingsDialog");
const { SettingsDialog } = await import("./SettingsDialog");
import type { FolderEntry } from "../main/view";

const ROOT = "/Users/alex/code/acme-web";
const listed = (path = ROOT): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [], git: { common: `${ROOT}/.git`, main: ROOT, branch: "main", worktrees: [] } });
const missing = (path = ROOT): FolderEntry => ({ path, kind: "notFound" });
let doan: Record<string, ReturnType<typeof vi.fn>>;
let props: Parameters<typeof ProjectSettingsDialog>[0];
let focused: string[];
beforeEach(() => {
  resetHooks(); focused = [];
  doan = {
    startConfigSession: vi.fn(async () => {}), endConfigSession: vi.fn(async () => {}),
    readConfig: vi.fn(async (root: string) => ({ kind: "config", root, tokenCss: "src/styles/tokens.css", serve: ["src/components/ui"], changed: false })),
    chooseConfigPath: vi.fn(async () => ({ kind: "selected", choiceId: "ch1", path: "design/brand" })),
    writeConfig: vi.fn(async (request: { root: string }) => ({ kind: "config", root: request.root, tokenCss: "src/styles/tokens.css", serve: ["src/components/ui", "design/brand"], changed: true })),
    revealProject: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan });
  const node = (name: string) => ({ focus: () => focused.push(name), isConnected: true, getClientRects: () => [{}], closest: () => null });
  vi.stubGlobal("document", { activeElement: null, body: {}, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    querySelector: () => null, querySelectorAll: (selector: string) => selector.includes("shell-more") ? [node("menu")] : selector.includes("shell-project-row") ? [node("row")] : selector.includes("shell-search") ? [node("search")] : [] });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  vi.stubGlobal("HTMLButtonElement", class {});
  vi.stubGlobal("Element", class {});
  props = { root: ROOT, projectKey: `${ROOT}/.git`, entries: [listed()], reroot: null, homeDirectory: "/Users/alex", onClose: vi.fn(), onAction: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());
const render = (next: Partial<typeof props> = {}) => { props = { ...props, ...next }; return run(() => ProjectSettingsDialog(props)); };
const dialog = () => all(tree).find(element => element.type === "dialog")!;

test("a healthy worktree: a standard dialog titled with the project and branch, Root, Token CSS and Serve, one Done; a config session spans it", async () => {
  render(); await flush(); render();
  expect(doan.startConfigSession).toHaveBeenCalledTimes(1);
  expect(doan.readConfig).toHaveBeenCalledWith(ROOT);
  expect(dialog().props.className).toBe("doan-dialog settings-dialog");
  expect(dialog().props["data-ui-size"]).toBeUndefined();
  expect(text()).toContain("acme-web settings");
  expect(text()).toContain("main");
  expect(text()).toContain("in this worktree. Commit it to share these with your team.");
  for (const copy of [ROOT, "src/styles/tokens.css", "src/components/ui", "Canvases can read files in .doan/canvases/, the token CSS and these paths."]) expect(text()).toContain(copy);
  expect(all(tree).filter(element => element.type === "button" && words(element.props.children) === "Done")).toHaveLength(1);
  expect(button("Remove src/components/ui from serve")).toBeDefined();
  click("Done");
  expect(props.onClose).toHaveBeenCalledTimes(1);
  unmount();
  expect(doan.endConfigSession).toHaveBeenCalledTimes(1);
});

test("Add… asks first, writes the choice and returns; while it picks, confirms or writes, Done and Escape do not close", async () => {
  let pick: (value: unknown) => void = () => {};
  doan.chooseConfigPath!.mockImplementationOnce(() => new Promise(resolve => { pick = resolve; }));
  render(); await flush(); render();
  click("Add…"); render();
  expect(button("Done").props.disabled).toBe(true);
  const cancel = { preventDefault: vi.fn() };
  (dialog().props.onCancel as (event: unknown) => void)(cancel);
  expect(cancel.preventDefault).toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  pick({ kind: "selected", choiceId: "ch1", path: "design/brand" }); await flush(); render();
  const confirm = all(tree).find(element => element.type === SettingsDialog)!;
  expect(confirm.props).toMatchObject({ title: "Add to serve?", verb: "Add to Serve" });
  expect(button("Done").props.disabled).toBe(true);
  doan.readConfig!.mockResolvedValue({ kind: "config", root: ROOT, tokenCss: "src/styles/tokens.css", serve: ["src/components/ui", "design/brand"], changed: false });
  (confirm.props.answer as (allow: boolean) => void)(true);
  expect(doan.writeConfig).toHaveBeenCalledWith({ root: ROOT, op: "addServe", choiceId: "ch1" });
  await flush(); render();
  expect(text()).toContain("design/brand");
  expect(button("Done").props.disabled).toBeFalsy();
  (dialog().props.onCancel as (event: unknown) => void)({ preventDefault: vi.fn() });
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test("removed while open: the dialog closes and focus goes to the project's menu button, else its row, else Search", async () => {
  render(); await flush(); render();
  render({ entries: [] });
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(focused).toEqual(["menu"]);
});

test("a healthy worktree that turns missing shows the problem view with its recovery in place", async () => {
  render(); await flush(); render();
  render({ entries: [missing()] }); render();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(text()).toContain("Doan can’t find this folder, so its settings can’t be read or changed.");
  expect(all(tree).some(element => String(element.props.className).startsWith("ob-chip") && words(element.props.children) === "Missing")).toBe(true);
  click("Locate…");
  expect(props.onAction).toHaveBeenCalledWith("locate", ROOT, expect.any(Function));
  click("Remove from Doan");
  expect(props.onAction).toHaveBeenCalledWith("remove", ROOT, expect.any(Function));
  // A config error's Show in Finder runs here too.
  render({ entries: [{ path: ROOT, kind: "error", message: "bad config" }] }); render();
  click("Show in Finder");
  expect(doan.revealProject).toHaveBeenCalledWith(ROOT);
});

test("Locate… moving the worktree follows the reroot and reads the new root", async () => {
  render({ entries: [missing()] }); await flush(); render();
  expect(doan.readConfig).not.toHaveBeenCalled();
  render({ entries: [listed("/Users/alex/code/acme-web-2")], reroot: { from: ROOT, root: "/Users/alex/code/acme-web-2", seq: 1 } });
  await flush(); render();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(doan.readConfig).toHaveBeenLastCalledWith("/Users/alex/code/acme-web-2");
  expect(text()).toContain("/Users/alex/code/acme-web-2");
});

// review BU2-4: a write main has not answered holds the dialog too.
test("while a write is pending Done is disabled and Escape is refused", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(); await flush(); render();
  click("Clear"); render();
  expect(button("Done").props.disabled).toBe(true);
  const escape = { preventDefault: vi.fn() };
  (dialog().props.onCancel as (event: unknown) => void)(escape);
  expect(escape.preventDefault).toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  finish({ kind: "config", root: ROOT, tokenCss: null, serve: [], changed: true }); await flush(); render();
  expect(button("Done").props.disabled).toBeFalsy();
});

// review BU2-2: feedback for an in-place recovery stays in the modal; a toast behind it can't be read or reached.
test("Details shows the error inside the dialog, and a refused Locate… says why there", async () => {
  render({ entries: [{ path: ROOT, kind: "error", message: "Invalid .doan/config.json: serve must be a list." }] }); await flush(); render();
  expect(button("Details").props["aria-expanded"]).toBe(false);
  click("Details"); render();
  expect(button("Details").props["aria-expanded"]).toBe(true);
  expect(text()).toContain("Invalid .doan/config.json: serve must be a list.");
  expect(props.onAction).not.toHaveBeenCalled();
  render({ entries: [missing()] }); render();
  click("Locate…");
  const [action, root, notice] = (props.onAction as ReturnType<typeof vi.fn>).mock.lastCall!;
  expect([action, root]).toEqual(["locate", ROOT]);
  (notice as (text: string) => void)("That folder is already in Doan."); render();
  const alert = all(tree).find(element => element.props.role === "alert")!;
  expect(words(alert.props.children)).toBe("That folder is already in Doan.");
});

// review BU2-4: a recovery that turns the worktree healthy removes its button; focus stays in the dialog, on Done.
test("after a recovery the view changes under focus, and focus moves to Done", async () => {
  render({ entries: [missing()] }); await flush(); render();
  const done = { focus: vi.fn() };
  (button("Done").props.ref as { current: unknown }).current = done;
  // The recovery button had focus; the problem view goes, and focus falls to the document.
  render({ entries: [listed()] }); await flush(); render();
  expect(done.focus).toHaveBeenCalled();
});

test("Set Up… closes the dialog first, then opens Project Setup", async () => {
  render({ entries: [{ path: ROOT, kind: "uninitialized" }] }); await flush(); render();
  click("Set Up…");
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onAction).toHaveBeenCalledWith("setUp", ROOT, expect.any(Function));
  expect((props.onClose as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((props.onAction as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
});

// A confirmation can still own the modal layer when a pending operation settles.
test("a completed write does not move focus behind an open confirmation", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(); await flush(); render();
  const change = { focus: vi.fn() };
  (button("Change…").props.ref as { current: unknown }).current = change;
  const origin = Object.assign(new HTMLButtonElement(), { isConnected: false, closest: () => null });
  Object.assign(document, { activeElement: origin });
  click("Clear"); render();
  Object.assign(document, { activeElement: document.body });
  // SettingsDialog renders a dialog with role=alertdialog and no ob-dialog class.
  const confirmation = { role: "alertdialog", open: true };
  Object.assign(document, { querySelector: (selector: string) => selector === 'dialog[role="alertdialog"][open]' ? confirmation : null });
  finish({ kind: "config", root: ROOT, tokenCss: null, serve: [], changed: true });
  await flush(); render();
  expect(button("Done").props.disabled).toBeFalsy();
  expect(change.focus).not.toHaveBeenCalled();
});
