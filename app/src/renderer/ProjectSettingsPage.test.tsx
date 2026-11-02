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

// project-settings T3: the Project Settings page (design '화면', '이동과 잠금', '포커스'), not yet wired into App.
const { ProjectSettingsPage } = await import("./ProjectSettingsPage");
const { SettingsDialog } = await import("./SettingsDialog");
import type { FolderEntry } from "../main/view";

const ROOT = "/Users/alex/code/acme-web";
const listed = (path = ROOT): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: [], git: { common: `${ROOT}/.git`, main: ROOT, branch: "main", worktrees: [] } });
const missing = (path = ROOT): FolderEntry => ({ path, kind: "notFound" });
const uninitialized = (path = ROOT): FolderEntry => ({ path, kind: "uninitialized" });
const configError = (message = "unexpected token } at line 4"): FolderEntry => ({ path: ROOT, kind: "error", message });
const cliError = (): FolderEntry => ({ path: ROOT, kind: "cliError", reason: "timeout" });
const loading = (): FolderEntry => ({ path: ROOT, kind: "loading" });
const CONFIG = { kind: "config", root: ROOT, tokenCss: "src/styles/tokens.css", serve: ["src/components/ui", "public/fonts"], changed: false };
let doan: Record<string, ReturnType<typeof vi.fn>>;
let props: Parameters<typeof ProjectSettingsPage>[0];
let focused: string[];
beforeEach(() => {
  resetHooks(); focused = [];
  doan = {
    startConfigSession: vi.fn(async () => {}), endConfigSession: vi.fn(async () => {}),
    readConfig: vi.fn(async (root: string) => ({ ...CONFIG, root })),
    chooseConfigPath: vi.fn(async () => ({ kind: "selected", choiceId: "ch1", path: "design/brand" })),
    writeConfig: vi.fn(async (request: { root: string }) => ({ ...CONFIG, root: request.root, serve: ["src/components/ui", "public/fonts", "design/brand"], changed: true })),
    revealProject: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("document", { activeElement: null, body: {}, addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelector: () => null, querySelectorAll: () => [] });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("HTMLButtonElement", class {});
  props = {
    header: "HEADER", sidebar: "SIDEBAR", root: ROOT, entries: [listed()], reroot: null, origin: { screen: "home" }, homeDirectory: "/Users/alex", arrival: null,
    onState: vi.fn(), onGone: vi.fn(), onRerooted: vi.fn(), onAction: vi.fn(), onRemove: vi.fn(),
  };
});
afterEach(() => vi.unstubAllGlobals());
const render = (next: Partial<typeof props> = {}) => { props = { ...props, ...next }; return run(() => ProjectSettingsPage(props)); };
// The first render starts the session and the read; a second one shows what the read returned.
const open = async (next: Partial<typeof props> = {}) => { render(next); await flush(); render(); };
const heading = () => all(tree).find(element => element.type === "h1")!;
const confirmation = () => all(tree).find(element => element.type === SettingsDialog);
const hasButton = (label: string) => all(tree).some(element => element.type === "button" && (element.props["aria-label"] === label || words(element.props.children) === label));
const classes = (element: ReactElement<Record<string, unknown>>) => String(element.props.className ?? "").split(" ");
const byClass = (name: string) => all(tree).filter(element => classes(element).includes(name));
const notice = () => byClass("doan-notice")[0];
const onState = () => (props.onState as ReturnType<typeof vi.fn>).mock.calls.map(call => (call[0] as { locked: boolean }).locked);
const labels = () => all(tree).filter(element => element.type === "button").map(element => words(element.props.children));
// A button the page may focus later, standing in for the DOM node.
const node = (alive = true) => Object.assign(new HTMLButtonElement(), { focus: vi.fn(), isConnected: alive, disabled: false, closest: () => null });
const focusOn = (element: unknown) => Object.assign(document, { activeElement: element });
// The row (container) that holds both, found by walking the rendered tree.
const holds = (container: ReactElement<Record<string, unknown>>, label: string) => all(container.props.children as ReactNode).some(element => element.type === "button" && words(element.props.children) === label);
const section = (title: string) => all(tree).find(element => element.type === "section" && all(element.props.children as ReactNode).some(child => child.type === "h2" && words(child.props.children) === title))!;
const statusIn = (container: ReactElement<Record<string, unknown>>) => all(container.props.children as ReactNode).filter(element => classes(element).includes("settings-saved")).map(element => words(element.props.children));

test("a healthy worktree: header, Token CSS, Shared with canvases and Remove from Doan; no Root row and no Done; a config session spans the page", async () => {
  await open();
  expect(doan.startConfigSession).toHaveBeenCalledTimes(1);
  expect(doan.readConfig).toHaveBeenCalledWith(ROOT);
  expect(words(heading().props.children)).toContain("acme-web");
  expect(words(heading().props.children)).toContain("main");
  expect(text()).toContain("~/code/acme-web");
  expect(text()).toContain("in this worktree. Commit it so your team gets these settings.");
  for (const copy of ["Token CSS", "The stylesheet canvases link for tokens.", "src/styles/tokens.css", "Shared with canvases", "src/components/ui", "public/fonts",
    "Files canvases in this worktree can read, besides .doan/canvases/, .doan/ds/, .doan/assets/ and the token CSS.", "Remove from Doan",
    "Files and Git worktrees stay on disk."]) expect(text()).toContain(copy);
  expect(text()).not.toContain("Root");
  expect(hasButton("Done")).toBe(false);
  for (const label of ["Show in Finder", "Change", "Clear", "Add File or Folder", "Remove from Doan", "Remove src/components/ui from Shared with canvases", "Remove public/fonts from Shared with canvases"]) expect(hasButton(label), label).toBe(true);
  expect(all(tree).filter(element => element.type === "main")).toHaveLength(1);
  expect(all(tree).find(element => element.type === "main")!.props.className).toBe("home-panel settings-panel doan-scroll");
  unmount();
  expect(doan.endConfigSession).toHaveBeenCalledTimes(1);
});

test("the header and the sidebar are the shell's, around the white body", async () => {
  await open();
  expect((tree as ReactElement<{ children: ReactNode[] }>).props.children.slice(0, 2)).toEqual(["HEADER", "SIDEBAR"]);
});

test("Reading: the title and the spinner line, Show in Finder, and neither sections nor Remove", async () => {
  doan.readConfig!.mockImplementation(() => new Promise(() => {}));
  render(); await flush(); render();
  expect(text()).toContain("Reading settings");
  expect(text()).not.toContain("in this worktree. Commit it");
  expect(hasButton("Show in Finder")).toBe(true);
  for (const label of ["Remove from Doan", "Change", "Add File or Folder"]) expect(hasButton(label), label).toBe(false);
  expect(byClass("project-settings-loading")[0]!.props.role).toBe("status");
  unmount();
});

test("Read failed: one error notice with main's reason and Retry, only the path in the header, and Remove from Doan stays", async () => {
  doan.readConfig!.mockResolvedValue({ kind: "error", message: "open ~/code/acme-web/.doan/config.json: permission denied" });
  await open();
  expect(byClass("doan-notice")).toHaveLength(1);
  expect(classes(notice()!)).toContain("error");
  expect(text()).toContain("Couldn’t read this worktree’s settings.");
  expect(words(byClass("project-settings-notice-reason")[0]!.props.children)).toBe("open ~/code/acme-web/.doan/config.json: permission denied");
  expect(text()).not.toContain("in this worktree. Commit it");
  expect(hasButton("Retry")).toBe(true);
  expect(hasButton("Remove from Doan")).toBe(true);
  expect(hasButton("Show in Finder")).toBe(true);
  for (const label of ["Change", "Add File or Folder"]) expect(hasButton(label), label).toBe(false);
  unmount();
});

test("Read failed: Retry reads the settings again here, without asking App", async () => {
  doan.readConfig!.mockResolvedValueOnce({ kind: "error", message: "busy" });
  await open();
  click("Retry"); await flush(); render();
  expect(doan.readConfig).toHaveBeenCalledTimes(2);
  expect(props.onAction).not.toHaveBeenCalled();
  expect(text()).toContain("src/styles/tokens.css");
  expect(byClass("doan-notice")).toHaveLength(0);
  unmount();
});

test("No token CSS and nothing shared: the empty guidance with Choose, and Add File or Folder alone", async () => {
  doan.readConfig!.mockResolvedValue({ kind: "config", root: ROOT, tokenCss: null, serve: [], changed: false });
  await open();
  expect(text()).toContain("No token CSS.");
  expect(text()).toContain("won’t flag hardcoded colors.");
  expect(hasButton("Choose")).toBe(true);
  for (const label of ["Change", "Clear"]) expect(hasButton(label), label).toBe(false);
  expect(labels().filter(label => label === "Remove")).toHaveLength(0);
  expect(hasButton("Add File or Folder")).toBe(true);
  unmount();
});

// One row per problem tile of the draft ('alt-2-page-problem', 'alt-2-states-problem').
const PROBLEM_TILES: [string, () => FolderEntry, string, string[], boolean][] = [
  ["Missing", missing, "Doan can’t find this folder, so its settings can’t be read or changed.", ["Locate"], false],
  ["Not set up", uninitialized, "This folder isn’t set up for Doan yet, so it has no settings to change.", ["Set Up"], true],
  ["Config error", configError, "Doan couldn’t read this folder’s configuration, so its settings can’t be changed.", ["Retry", "Details"], true],
  ["CLI error", cliError, "Doan couldn’t read this folder, so its settings can’t be read or changed.", ["Retry"], true],
];
test.each(PROBLEM_TILES)("%s: one notice with its recovery, Remove from Doan below, Show in Finder only when the folder is there", async (_name, make, sentence, actions, finder) => {
  await open({ entries: [make()] });
  expect(byClass("doan-notice")).toHaveLength(1);
  expect(words(notice()!.props.children)).toContain(sentence);
  for (const action of actions) expect(hasButton(action), action).toBe(true);
  expect(hasButton("Remove from Doan")).toBe(true);
  expect(hasButton("Show in Finder")).toBe(finder);
  for (const label of ["Token CSS", "Shared with canvases"]) expect(text()).not.toContain(label);
  expect(text()).not.toContain("in this worktree. Commit it");
  expect(doan.readConfig).not.toHaveBeenCalled();
  unmount();
});

test("Still reading: only the spinner line under the header, with neither Show in Finder nor Remove", async () => {
  await open({ entries: [loading()] });
  expect(text()).toContain("Reading settings");
  for (const label of ["Show in Finder", "Remove from Doan"]) expect(hasButton(label), label).toBe(false);
  expect(byClass("doan-notice")).toHaveLength(0);
  expect(doan.readConfig).not.toHaveBeenCalled();
  unmount();
});

test("a worktree still loading is read once it becomes a list", async () => {
  await open({ entries: [loading()] });
  render({ entries: [listed()] }); await flush(); render();
  expect(doan.readConfig).toHaveBeenCalledWith(ROOT);
  expect(text()).toContain("src/styles/tokens.css");
  unmount();
});

test("no recovery label ends with an ellipsis, in any state", async () => {
  for (const make of [listed, missing, uninitialized, configError, cliError, loading]) {
    resetHooks();
    await open({ entries: [make()] });
    for (const label of labels()) expect(label, `${make.name}: ${label}`).not.toMatch(/…$/);
    unmount();
  }
});

test("recovery buttons hand App the action, the root and a place for feedback", async () => {
  await open({ entries: [missing()] });
  click("Locate");
  expect(props.onAction).toHaveBeenLastCalledWith("locate", ROOT, expect.any(Function));
  render({ entries: [uninitialized()] }); render();
  click("Set Up");
  expect(props.onAction).toHaveBeenLastCalledWith("setUp", ROOT, expect.any(Function));
  render({ entries: [cliError()] }); render();
  click("Retry");
  expect(props.onAction).toHaveBeenLastCalledWith("retry", ROOT, expect.any(Function));
  unmount();
});

test("a refused Locate says why under the notice, as an alert", async () => {
  await open({ entries: [missing()] });
  click("Locate");
  const [, , feedback] = (props.onAction as ReturnType<typeof vi.fn>).mock.lastCall!;
  (feedback as (text: string) => void)("That folder belongs to another repository. Choose acme-web’s folder."); render();
  const alert = all(tree).find(element => element.props.role === "alert")!;
  expect(words(alert.props.children)).toBe("That folder belongs to another repository. Choose acme-web’s folder.");
  // The next attempt clears it.
  click("Locate"); render();
  expect(all(tree).some(element => element.props.role === "alert")).toBe(false);
  unmount();
});

test("Config error: Details opens the error under the notice and closes it again", async () => {
  await open({ entries: [configError("~/code/acme-web/.doan/config.json: unexpected token } at line 4, column 3")] });
  expect(button("Details").props["aria-expanded"]).toBe(false);
  expect(text()).not.toContain("unexpected token");
  click("Details"); render();
  expect(button("Details").props["aria-expanded"]).toBe(true);
  expect(text()).toContain("unexpected token } at line 4, column 3");
  expect(props.onAction).not.toHaveBeenCalled();
  click("Details"); render();
  expect(text()).not.toContain("unexpected token");
  unmount();
});

test("Show in Finder reveals the worktree; Remove from Doan asks App to remove it", async () => {
  await open();
  click("Show in Finder");
  expect(doan.revealProject).toHaveBeenCalledWith(ROOT);
  click("Remove from Doan");
  expect(props.onRemove).toHaveBeenCalledTimes(1);
  unmount();
});

test("Remove from Doan and Show in Finder stay usable while a write is pending", async () => {
  doan.writeConfig!.mockImplementationOnce(() => new Promise(() => {}));
  await open();
  click("Clear"); render();
  expect(button("Remove from Doan").props.disabled).toBeFalsy();
  expect(button("Show in Finder").props.disabled).toBeFalsy();
  unmount();
});

test("Change picks, writes the choice and shows Saved in the Token CSS row", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  click("Change"); await flush(); render();
  expect(doan.chooseConfigPath).toHaveBeenCalledWith(ROOT, "tokenCss");
  expect(doan.writeConfig).toHaveBeenCalledWith({ root: ROOT, op: "setTokenCss", choiceId: "ch1" });
  expect(statusIn(section("Token CSS"))).toEqual(["Saving"]);
  expect(statusIn(section("Shared with canvases"))).toEqual([]);
  for (const label of ["Change", "Clear", "Add File or Folder"]) expect(button(label).props.disabled, label).toBe(true);
  finish({ ...CONFIG, tokenCss: "src/styles/brand.css", changed: true }); await flush(); render();
  expect(statusIn(section("Token CSS"))).toEqual(["Saved"]);
  expect(statusIn(section("Shared with canvases"))).toEqual([]);
  unmount();
});

test("Clear writes at once and shows Saved in the Token CSS row", async () => {
  doan.writeConfig!.mockResolvedValue({ kind: "config", root: ROOT, tokenCss: null, serve: ["src/components/ui", "public/fonts"], changed: true });
  doan.readConfig!.mockResolvedValueOnce({ ...CONFIG }).mockResolvedValue({ kind: "config", root: ROOT, tokenCss: null, serve: ["src/components/ui", "public/fonts"], changed: false });
  await open();
  click("Clear"); await flush(); render();
  expect(doan.writeConfig).toHaveBeenCalledWith({ root: ROOT, op: "clearTokenCss" });
  expect(hasButton("Choose")).toBe(true);
  expect(statusIn(section("Token CSS"))).toEqual(["Saved"]);
  unmount();
});

test("a Token CSS pick outside the worktree fails under the Token CSS row, not under Shared", async () => {
  doan.writeConfig!.mockResolvedValue({ kind: "error", message: "src/vendor/theme.css is outside this worktree" });
  await open();
  click("Change"); await flush(); render();
  const alert = (container: ReactElement<Record<string, unknown>>) => all(container.props.children as ReactNode).filter(element => element.props.role === "alert").map(element => words(element.props.children));
  expect(alert(section("Token CSS"))).toEqual(["src/vendor/theme.css is outside this worktree. Choose a CSS file inside acme-web."]);
  expect(alert(section("Shared with canvases"))).toEqual([]);
  expect(statusIn(section("Token CSS"))).toEqual([]);
  unmount();
});

test("Add File or Folder asks first over the page: the title names the path, Cancel writes nothing", async () => {
  await open();
  click("Add File or Folder"); await flush(); render();
  expect(doan.chooseConfigPath).toHaveBeenCalledWith(ROOT, "serve");
  const dialog = confirmation()!;
  expect(dialog.props).toMatchObject({ title: "Share design/brand with canvases?", verb: "Share" });
  expect(words(dialog.props.description)).toBe("Canvases in this worktree will be able to read design/brand.");
  expect(doan.writeConfig).not.toHaveBeenCalled();
  (dialog.props.answer as (allow: boolean) => void)(false); render();
  expect(confirmation()).toBeUndefined();
  expect(doan.writeConfig).not.toHaveBeenCalled();
  expect(button("Add File or Folder").props.disabled).toBe(false);
  unmount();
});

test("Share writes the path and Saved shows beside Add File or Folder, not in Token CSS", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  click("Add File or Folder"); await flush(); render();
  doan.readConfig!.mockResolvedValue({ ...CONFIG, serve: [...CONFIG.serve, "design/brand"] });
  (confirmation()!.props.answer as (allow: boolean) => void)(true); render();
  expect(doan.writeConfig).toHaveBeenCalledWith({ root: ROOT, op: "addServe", choiceId: "ch1" });
  const addRow = () => all(tree).find(element => classes(element).includes("doan-preference-row-trailing") && holds(element, "Add File or Folder"))!;
  expect(statusIn(addRow())).toEqual(["Saving"]);
  expect(statusIn(section("Token CSS"))).toEqual([]);
  finish({ ...CONFIG, serve: [...CONFIG.serve, "design/brand"], changed: true }); await flush(); render();
  expect(statusIn(addRow())).toEqual(["Saved"]);
  expect(statusIn(section("Token CSS"))).toEqual([]);
  expect(text()).toContain("design/brand");
  unmount();
});

test("a refused Shared write fails under the list, and an unavailable pick asks to choose again", async () => {
  doan.writeConfig!.mockResolvedValue({ kind: "error", message: "../design-kit is outside this worktree" });
  await open();
  click("Add File or Folder"); await flush(); render();
  (confirmation()!.props.answer as (allow: boolean) => void)(true); await flush(); render();
  const alerts = (container: ReactElement<Record<string, unknown>>) => all(container.props.children as ReactNode).filter(element => element.props.role === "alert").map(element => words(element.props.children));
  expect(alerts(section("Shared with canvases"))).toEqual(["../design-kit is outside this worktree. Choose a file or folder inside acme-web."]);
  expect(alerts(section("Token CSS"))).toEqual([]);
  doan.chooseConfigPath!.mockResolvedValueOnce({ kind: "unavailable" });
  click("Add File or Folder"); await flush(); render();
  expect(alerts(section("Shared with canvases"))).toEqual(["This worktree changed. Choose again."]);
  expect(text()).not.toContain("Home");
  unmount();
});

test("Remove writes the path out of the list", async () => {
  await open();
  click("Remove public/fonts from Shared with canvases"); await flush(); render();
  expect(doan.writeConfig).toHaveBeenCalledWith({ root: ROOT, op: "removeServe", path: "public/fonts" });
  unmount();
});

test("the page is locked while it picks, confirms or writes, and released after", async () => {
  let pick: (value: unknown) => void = () => {}, finish: (value: unknown) => void = () => {};
  doan.chooseConfigPath!.mockImplementationOnce(() => new Promise(resolve => { pick = resolve; }));
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  expect(onState()).toEqual([]);
  click("Add File or Folder"); render();
  expect(onState()).toEqual([true]);
  pick({ kind: "selected", choiceId: "ch1", path: "design/brand" }); await flush(); render();
  expect(onState()).toEqual([true]);
  (confirmation()!.props.answer as (allow: boolean) => void)(true); render();
  expect(onState()).toEqual([true]);
  finish({ ...CONFIG, changed: true }); await flush(); render();
  expect(onState()).toEqual([true, false]);
  unmount();
});

test("a cancelled pick or a cancelled confirmation releases the lock", async () => {
  doan.chooseConfigPath!.mockResolvedValueOnce({ kind: "cancelled" });
  await open();
  click("Add File or Folder"); render(); await flush(); render();
  expect(onState()).toEqual([true, false]);
  click("Add File or Folder"); await flush(); render();
  (confirmation()!.props.answer as (allow: boolean) => void)(false); render();
  expect(onState()).toEqual([true, false, true, false]);
  unmount();
});

test("leaving the page while locked releases the lock", async () => {
  doan.writeConfig!.mockImplementationOnce(() => new Promise(() => {}));
  await open();
  click("Clear"); render();
  expect(onState()).toEqual([true]);
  unmount();
  expect(onState()).toEqual([true, false]);
});

test("Show in Finder and Remove from Doan are not locked, but every control that writes is", async () => {
  await open();
  click("Add File or Folder"); await flush(); render();
  for (const label of ["Change", "Clear", "Add File or Folder", "Remove public/fonts from Shared with canvases"]) expect(button(label).props.disabled, label).toBe(true);
  for (const label of ["Show in Finder", "Remove from Doan"]) expect(button(label).props.disabled, label).toBeFalsy();
  unmount();
});

// POSTMORTEM 2026-10-30: the confirmation is the rendered alertdialog, not a class of another component.
test("a completed write does not move focus behind an open confirmation", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  const change = { focus: vi.fn() };
  (button("Change").props.ref as { current: unknown }).current = change;
  focusOn(node(false));
  click("Clear"); render();
  focusOn(document.body);
  // SettingsDialog renders a dialog with role=alertdialog and no styling class to match.
  const guard = { role: "alertdialog", open: true };
  Object.assign(document, { querySelector: (selector: string) => selector === 'dialog[role="alertdialog"][open]' ? guard : null });
  finish({ ...CONFIG, tokenCss: null, changed: true }); await flush(); render();
  expect(button("Add File or Folder").props.disabled).toBeFalsy();
  expect(change.focus).not.toHaveBeenCalled();
  unmount();
});

test("a button inside the open confirmation is never remembered as a place to return to", async () => {
  await open();
  const inside = Object.assign(node(), { closest: (selector: string) => selector === 'dialog[role="alertdialog"]' ? {} : null });
  focusOn(inside);
  click("Clear"); await flush(); render();
  focusOn(document.body); render();
  expect(inside.focus).not.toHaveBeenCalled();
  unmount();
});

test("a write that finishes while the confirmation is open (Share pressed, then more writing) keeps focus out until it closes", async () => {
  let finish: (value: unknown) => void = () => {};
  doan.writeConfig!.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  const add = { focus: vi.fn() };
  (button("Add File or Folder").props.ref as { current: unknown }).current = add;
  const pressed = node(); focusOn(pressed);
  click("Add File or Folder"); await flush(); render();
  const guard = { role: "alertdialog", open: true };
  Object.assign(document, { querySelector: (selector: string) => selector === 'dialog[role="alertdialog"][open]' ? guard : null });
  focusOn(document.body);
  (confirmation()!.props.answer as (allow: boolean) => void)(true); render();
  finish({ ...CONFIG, serve: [...CONFIG.serve, "design/brand"], changed: true }); await flush(); render();
  expect(add.focus).not.toHaveBeenCalled();
  unmount();
});

test("a confirmation open when the worktree turns into a problem is cancelled, and focus goes to the title", async () => {
  await open();
  click("Add File or Folder"); await flush(); render();
  expect(confirmation()).toBeDefined();
  expect(onState()).toEqual([true]);
  const title = { focus: vi.fn() };
  (heading().props.ref as (node: unknown) => void)(title);
  render({ entries: [missing()] }); render();
  expect(confirmation()).toBeUndefined();
  expect(title.focus).toHaveBeenCalled();
  expect(onState()).toEqual([true, false]);
  expect(text()).toContain("Doan can’t find this folder");
  expect(doan.writeConfig).not.toHaveBeenCalled();
  unmount();
});

test("a picker answered after the worktree turned into a problem opens nothing", async () => {
  let pick: (value: unknown) => void = () => {};
  doan.chooseConfigPath!.mockImplementationOnce(() => new Promise(resolve => { pick = resolve; }));
  await open();
  click("Add File or Folder"); render();
  render({ entries: [missing()] }); render();
  pick({ kind: "selected", choiceId: "ch1", path: "design/brand" }); await flush(); render();
  expect(confirmation()).toBeUndefined();
  expect(doan.writeConfig).not.toHaveBeenCalled();
  expect(onState().at(-1)).toBe(false);
  unmount();
});

test("a healthy worktree that turns missing switches the same page to its notice, then reads again once it is healthy", async () => {
  await open();
  render({ entries: [missing()] }); render();
  expect(props.onGone).not.toHaveBeenCalled();
  expect(hasButton("Locate")).toBe(true);
  expect(hasButton("Show in Finder")).toBe(false);
  render({ entries: [listed()] }); await flush(); render();
  expect(doan.readConfig).toHaveBeenCalledTimes(2);
  expect(text()).toContain("src/styles/tokens.css");
  unmount();
});

test("a worktree that leaves the list reports it once and drops an open confirmation", async () => {
  await open();
  click("Add File or Folder"); await flush(); render();
  render({ entries: [] }); render();
  expect(props.onGone).toHaveBeenCalledTimes(1);
  expect(confirmation()).toBeUndefined();
  render({ entries: [] }); render({ entries: [] });
  expect(props.onGone).toHaveBeenCalledTimes(1);
  unmount();
});

test("a worktree that leaves the list reports it even while a write is pending", async () => {
  doan.writeConfig!.mockImplementationOnce(() => new Promise(() => {}));
  await open();
  click("Clear"); render();
  expect(onState()).toEqual([true]);
  render({ entries: [] }); render();
  expect(props.onGone).toHaveBeenCalledTimes(1);
  unmount();
});

test("Locate moving the worktree follows the reroot, reads the new root and tells App the new root and origin", async () => {
  const moved = "/Users/alex/code/acme-web-2";
  await open({ entries: [missing()], origin: { screen: "workspace", root: ROOT } });
  expect(doan.readConfig).not.toHaveBeenCalled();
  render({ entries: [listed(moved)], reroot: { from: ROOT, root: moved, seq: 1 } }); await flush(); render();
  expect(props.onGone).not.toHaveBeenCalled();
  expect(props.onRerooted).toHaveBeenCalledWith(moved, { screen: "workspace", root: moved });
  expect(doan.readConfig).toHaveBeenLastCalledWith(moved);
  expect(text()).toContain("~/code/acme-web-2");
  // Writes go to the new root.
  click("Clear"); await flush(); render();
  expect(doan.writeConfig).toHaveBeenLastCalledWith({ root: moved, op: "clearTokenCss" });
  unmount();
});

test("a reroot leaves a Home origin as it is", async () => {
  const moved = "/Users/alex/code/acme-web-2";
  await open({ entries: [missing()] });
  render({ entries: [listed(moved)], reroot: { from: ROOT, root: moved, seq: 1 } }); await flush(); render();
  expect(props.onRerooted).toHaveBeenCalledWith(moved, { screen: "home" });
  unmount();
});

test("arrival focuses the title a frame later, again for a repeated arrival, and never without one", async () => {
  await open();
  const title = { focus: vi.fn() };
  (heading().props.ref as (node: unknown) => void)(title);
  render(); expect(title.focus).not.toHaveBeenCalled();
  render({ arrival: { seq: 1 } }); expect(title.focus).toHaveBeenCalledTimes(1);
  render({ arrival: { seq: 1 } }); expect(title.focus).toHaveBeenCalledTimes(1);
  render({ arrival: { seq: 2 } }); expect(title.focus).toHaveBeenCalledTimes(2);
  unmount();
});

test("Retry or Locate that removes the focused button moves focus to the title", async () => {
  doan.readConfig!.mockResolvedValueOnce({ kind: "error", message: "busy" });
  await open();
  const title = { focus: vi.fn() };
  (heading().props.ref as (node: unknown) => void)(title);
  focusOn(document.body);
  click("Retry"); await flush(); render();
  expect(title.focus).toHaveBeenCalled();
  title.focus.mockClear();
  // Focus the user moved elsewhere on purpose stays.
  const elsewhere = node(); focusOn(elsewhere);
  render({ entries: [missing()] }); render();
  expect(title.focus).not.toHaveBeenCalled();
  unmount();
});

// Focus after a write (design '포커스'): the pressed button, else the section's main button.
test("after Change the pressed button gets focus back", async () => {
  await open();
  const change = node(); focusOn(change);
  click("Change"); render(); await flush(); render();
  expect(change.focus).toHaveBeenCalled();
  unmount();
});

test("after Clear, focus goes to Choose, the Token CSS row's main button", async () => {
  doan.readConfig!.mockResolvedValueOnce({ ...CONFIG }).mockResolvedValue({ kind: "config", root: ROOT, tokenCss: null, serve: CONFIG.serve, changed: false });
  doan.writeConfig!.mockResolvedValue({ kind: "config", root: ROOT, tokenCss: null, serve: CONFIG.serve, changed: true });
  await open();
  // One ref serves Change and then Choose.
  const primary = { focus: vi.fn() };
  (button("Change").props.ref as { current: unknown }).current = primary;
  const clear = node(false); focusOn(clear);
  click("Clear"); render(); await flush(); render();
  expect(hasButton("Choose")).toBe(true);
  expect(primary.focus).toHaveBeenCalledTimes(1);
  expect(clear.focus).not.toHaveBeenCalled();
  unmount();
});

test("after removing a path, focus goes to the next path's Remove, not Add File or Folder", async () => {
  await open();
  const removes = new Map<string, { focus: ReturnType<typeof vi.fn> }>();
  for (const path of CONFIG.serve) { const target = { focus: vi.fn() }; removes.set(path, target); (button(`Remove ${path} from Shared with canvases`).props.ref as (node: unknown) => void)(target); }
  const add = { focus: vi.fn() };
  (button("Add File or Folder").props.ref as { current: unknown }).current = add;
  doan.writeConfig!.mockResolvedValue({ ...CONFIG, serve: ["public/fonts"], changed: true });
  doan.readConfig!.mockResolvedValue({ ...CONFIG, serve: ["public/fonts"], changed: false });
  focusOn(node(false));
  click("Remove src/components/ui from Shared with canvases"); render(); await flush(); render();
  expect(removes.get("public/fonts")!.focus).toHaveBeenCalledTimes(1);
  expect(add.focus).not.toHaveBeenCalled();
  unmount();
});

test("after removing the last path, focus goes to Add File or Folder", async () => {
  doan.readConfig!.mockResolvedValueOnce({ ...CONFIG, serve: ["only/path"] }).mockResolvedValue({ ...CONFIG, serve: [] });
  doan.writeConfig!.mockResolvedValue({ ...CONFIG, serve: [], changed: true });
  await open();
  const add = { focus: vi.fn() };
  (button("Add File or Folder").props.ref as { current: unknown }).current = add;
  focusOn(node(false));
  click("Remove only/path from Shared with canvases"); render(); await flush(); render();
  expect(add.focus).toHaveBeenCalledTimes(1);
  unmount();
});

test("closing the Share confirmation with Cancel returns focus to Add File or Folder", async () => {
  await open();
  const add = node(); focusOn(add);
  (button("Add File or Folder").props.ref as { current: unknown }).current = add;
  click("Add File or Folder"); render(); await flush(); render();
  focusOn(document.body);
  (confirmation()!.props.answer as (allow: boolean) => void)(false); render();
  expect(add.focus).toHaveBeenCalledTimes(1);
  unmount();
});

test("after Share, focus returns to Add File or Folder once the write has settled", async () => {
  await open();
  const add = node(); focusOn(add);
  (button("Add File or Folder").props.ref as { current: unknown }).current = add;
  click("Add File or Folder"); render(); await flush(); render();
  focusOn(document.body);
  (confirmation()!.props.answer as (allow: boolean) => void)(true); render(); await flush(); render();
  expect(add.focus).toHaveBeenCalledTimes(1);
  unmount();
});
