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

// Settings > About (PRODUCT §5 item 0 'About'), over BM's aboutView rows.
const { SettingsAbout } = await import("./SettingsAbout");
const { AlertIcon } = await import("./AlertIcon");
import type { AboutRead } from "../main/about";
import { DEFAULT_PREFERENCES, type PreferencesPatch, type PreferencesSnapshot, type PreferencesWriteReply } from "../main/preferences";
import type { UpdateSnapshot, UpdateState } from "../main/update/types";

const READ: AboutRead = { version: "0.1.0", cli: { path: "/Applications/Doan.app/Contents/Resources/bin/doan", version: "0.1.0" }, tools: [
  { provider: "claude", cli: "found", installed: "2.1.330", support: "supported" }, { provider: "codex", cli: "found", installed: "0.157.0", support: "unsupported" },
  { provider: "cursor", cli: "missing", installed: null, support: "unknown" }, { provider: "antigravity", cli: "missing", installed: null, support: "unknown" },
  { provider: "copilot", cli: "found", installed: null, support: "unknown" }], setup: { home: "/Users/you", items: [] } };
let doan: Record<string, ReturnType<typeof vi.fn>>;
let windowListeners: Record<string, () => void>;
let reply: (value: AboutRead | null) => void;
let push: (snapshot: UpdateSnapshot) => void;
let unsubscribe: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetHooks(); windowListeners = {};
  unsubscribe = vi.fn();
  doan = { startConversation: vi.fn(), sendConversation: vi.fn(), readAbout: vi.fn(() => new Promise(resolve => { reply = resolve; })), copyAbout: vi.fn(async () => ({ kind: "success" })),
    onUpdate: vi.fn((listener: (snapshot: UpdateSnapshot) => void) => { push = listener; return unsubscribe; }),
    checkForUpdates: vi.fn(async () => {}), installUpdate: vi.fn(async () => ({ kind: "allowed" })), openReleaseNotes: vi.fn(async () => true) };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: () => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
});
// Nothing on the Settings page may start or send a conversation.
afterEach(() => { expect(doan.startConversation).not.toHaveBeenCalled(); expect(doan.sendConversation).not.toHaveBeenCalled(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const actions = {} as HTMLElement;
let preferences: PreferencesSnapshot | null = { preferences: DEFAULT_PREFERENCES, notice: null };
let save: ReturnType<typeof vi.fn>;
beforeEach(() => { preferences = { preferences: DEFAULT_PREFERENCES, notice: null }; save = vi.fn(async (patch: PreferencesPatch) => ({ ok: true, snapshot: { preferences: { ...DEFAULT_PREFERENCES, ...patch }, notice: null } })); });
const render = () => run(() => SettingsAbout({ actions, preferences, save: save as unknown as (patch: PreferencesPatch) => Promise<PreferencesWriteReply | null> }));
const row = (id: string) => all(tree).find(element => element.props["data-about"] === id)!;

test("rows say Checking while About is read on entry, then show versions and support", async () => {
  render();
  expect(doan.readAbout).toHaveBeenCalledTimes(1);
  for (const id of ["version", "cli", "claude", "codex"]) expect(words(row(id).props.children), id).toContain("Checking");
  expect(all(row("cli").props.children as ReactNode).some(element => element.props.role === "status")).toBe(true);
  reply(READ); await flush(); render();
  expect(words(row("cli").props.children)).toContain("/Applications/Doan.app/Contents/Resources/bin/doan");
  expect(words(row("claude").props.children)).toContain("2.1.330");
  expect(all(row("claude").props.children as ReactNode).find(element => String(element.props.className).startsWith("ob-chip"))!.props.className).toBe("ob-chip ok");
  expect(all(row("codex").props.children as ReactNode).find(element => String(element.props.className).startsWith("ob-chip"))!.props.className).toBe("ob-chip warn");
  expect(words(row("antigravity").props.children)).toContain("Downloaded by Doan");
  for (const copy of ["Doan", "Agent tools", "The command-line tools Doan runs for your agent connections."]) expect(text()).toContain(copy);
});

test("a row whose version couldn’t be read says so with Retry, which reads About again", async () => {
  render();
  reply({ ...READ, cli: { ...READ.cli, version: null } }); await flush(); render();
  expect(words(row("cli").props.children)).toContain("Couldn’t read the doan command’s version.");
  expect(words(row("copilot").props.children)).toContain("Couldn’t read the version.");
  const retries = all(tree).filter(element => element.type === "button" && words(element.props.children) === "Retry");
  expect(retries).toHaveLength(2);
  (retries[0]!.props.onClick as () => void)();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
});

// A focus re-read keeps the shown versions, and a read in flight is not started again.
test("returning to the window reads About again without Checking; a focus during a read starts no other", async () => {
  render();
  windowListeners.focus!();
  expect(doan.readAbout).toHaveBeenCalledTimes(1);
  reply(READ); await flush(); render();
  windowListeners.focus!(); render();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
  expect(words(row("claude").props.children)).toContain("2.1.330");
  expect(words(row("claude").props.children)).not.toContain("Checking");
  windowListeners.focus!();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
  reply({ ...READ, tools: READ.tools!.map(tool => tool.provider === "claude" ? { ...tool, installed: "2.1.400" } : tool) }); await flush(); render();
  expect(words(row("claude").props.children)).toContain("2.1.400");
});

test("Copy details asks main to copy, then reads Copied for a moment", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  render();
  click("Copy details");
  expect(doan.copyAbout).toHaveBeenCalledWith();
  await flush(); render();
  expect(button("Copied").props["aria-live"]).toBe("polite");
  vi.advanceTimersByTime(2000); render();
  expect(button("Copy details")).toBeDefined();
  doan.copyAbout!.mockResolvedValueOnce({ kind: "error", message: "The clipboard is busy." });
  click("Copy details"); await flush(); render();
  expect(text()).toContain("Couldn’t copy the details.");
});

// The setup notice sits in the doan command row, as static text with selectable paths.
const ALL = ["claude", "codex", "cursor", "antigravity", "copilot"] as const;
const notice = () => all(row("cli").props.children as ReactNode).find(element => String(element.props.className).includes("doan-notice"));
const extra = () => all(row("cli").props.children as ReactNode).find(element => element.props.className === "doan-preference-row-extra" && element !== undefined);

test("every agent set up: the doan command row has no notice", async () => {
  render(); reply(READ); await flush(); render();
  expect(notice()).toBeUndefined();
  expect(extra()).toBeUndefined();
});

test("skipped items: a warning notice with an aria-hidden icon, one line per item in About's order, paths as code", async () => {
  render();
  reply({ ...READ, setup: { home: "/Users/you", items: [
    { target: "codex-rule", path: "/Users/you/.codex/rules/doan.rules", providers: ["codex"], reason: "write-failed", cause: "permission", at: "/Users/you/.codex/rules", code: "EACCES" },
    { target: "system-cli", path: "/usr/local/bin/doan", providers: [...ALL], reason: "admin-cancelled", rcFile: "~/.zshrc" },
  ] } });
  await flush(); render();
  const box = notice()!;
  expect(box.props.className).toBe("doan-notice warning setup-notice");
  const inside = all(box.props.children as ReactNode);
  // AlertIcon draws CircleAlert with aria-hidden.
  expect(inside.filter(element => element.type === AlertIcon)).toHaveLength(1);
  expect(inside.some(element => element.props.role !== undefined || element.props["aria-live"] !== undefined)).toBe(false);
  expect(inside.some(element => element.type === "button")).toBe(false);
  expect(words(inside.find(element => element.props.className === "ob-notice-title")!.props.children)).toBe("Doan couldn’t set up every agent");
  const items = inside.filter(element => element.props.className === "setup-notice-item");
  expect(items.map(item => words(item.props.children))).toEqual([
    "All agents — ~/.local/bin isn’t on your shell’s PATH, and adding doan to /usr/local/bin was cancelled. Add this line to ~/.zshrc, then open a new terminal:export PATH=\"$HOME/.local/bin:$PATH\"",
    "Codex — Doan couldn’t write ~/.codex/rules/doan.rules (permission denied). Make ~/.codex/rules writable, then reopen Doan.",
  ]);
  expect(all(items[0]!.props.children as ReactNode).filter(element => element.type === "code").map(element => [words(element.props.children), element.props.className])).toEqual([
    ["~/.local/bin", undefined], ["/usr/local/bin", undefined], ["~/.zshrc", undefined], ['export PATH="$HOME/.local/bin:$PATH"', "setup-notice-command"],
  ]);
  expect(all(items[0]!.props.children as ReactNode).find(element => element.props.className === "setup-notice-agents")).toBeDefined();
});

test("a copy that doesn’t set up agents: a neutral notice with the same icon, its sentence as the body", async () => {
  render();
  reply({ ...READ, setup: { home: "/Users/you", items: [{ target: "copy", path: "/Users/you/Downloads/Doan.app", providers: [...ALL], reason: "not-eligible", eligibility: "outside-applications" }] } });
  await flush(); render();
  const box = notice()!;
  expect(box.props.className).toBe("doan-notice setup-notice");
  const inside = all(box.props.children as ReactNode);
  // Every notice carries the icon; a neutral one takes the notice's ink, not a tone.
  expect(inside.filter(element => element.type === AlertIcon)).toHaveLength(1);
  expect(words(inside.find(element => element.props.className === "ob-notice-title")!.props.children)).toBe("This copy doesn’t set up agents or update");
  expect(words(inside.find(element => element.props.className === "ob-notice-body")!.props.children)).toBe("It isn’t directly in the Applications folder. Open the Doan in Applications so your agents can use it.");
});

test("while About is read (setup may still be running), the row shows Checking and no notice", () => {
  render();
  expect(words(row("cli").props.children)).toContain("Checking");
  expect(notice()).toBeUndefined();
});

// The Version row and the automatic-check row come from main's update push (UpdateSnapshot), not from the About read.
const NOON = new Date(2026, 10, 8, 14, 41).getTime();
const snap = (state: UpdateState, over: Partial<UpdateSnapshot> = {}): UpdateSnapshot =>
  ({ version: "0.1.0", state, eligibility: { kind: "enabled" }, gate: { kind: "allowed" }, autoCheck: true, lastCheckedAt: NOON, ...over });
const READY: UpdateState = { kind: "ready", version: "0.1.1" };
const live = () => words(all(tree).find(element => element.props.className === "ob-live" && element.props.role === "status")?.props.children).replace(/​/g, "");
const liveRaw = () => words(all(tree).find(element => element.props.className === "ob-live")?.props.children);
const autoRow = () => all(tree).find(element => element.props.className === "doan-preference-row" && all(element.props.children as ReactNode).some(child => child.props.role === "switch"));
const toggle = () => all(tree).find(element => element.props.role === "switch")!;
const description = () => words(all(row("version").props.children as ReactNode).find(element => element.props.className === "doan-preference-row-description")?.props.children);
const rowButtons = () => all(row("version").props.children as ReactNode).filter(element => element.type === "button");
const BLOCKED_READ = "Can’t restart yet. A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit.";

test("the Version row shows the pushed update state and its actions; the About read never changes it", async () => {
  render();
  expect(doan.onUpdate).toHaveBeenCalledOnce();
  push(snap(READY)); render();
  reply({ ...READ, version: "9.9.9" }); await flush(); render();
  expect(words(row("version").props.children)).toContain("Version");
  expect(description()).toBe("0.1.0 · Doan 0.1.1 is ready. Restart now, or Doan installs it when you quit.");
  expect(text()).not.toContain("9.9.9");
  expect(rowButtons().map(element => [words(element.props.children), element.props["data-ui-variant"], element.props["data-ui-size"]])).toEqual([
    ["Release Notes ↗", "subtle", "sm"], ["Restart to Update", "prominent", "sm"]]);
  // The Doan section order: Version, automatic checks, then the doan command.
  const order = all(tree).filter(element => element.props.className === "doan-preference-row").map(element => element.props["data-about"] ?? (element === autoRow() ? "auto" : "?"));
  expect(order.slice(0, 3)).toEqual(["version", "auto", "cli"]);
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("a failed About read keeps the Version and automatic-check rows; only the doan command and Agent tools go", async () => {
  render(); push(snap({ kind: "upToDate", manual: false })); render();
  reply(null); await flush(); render();
  expect(text()).toContain("Couldn’t read the versions.");
  expect(description()).toBe("0.1.0 · Up to date, last checked today at 2:41 PM");
  expect(autoRow()).toBeDefined();
  expect(all(tree).some(element => element.props["data-about"] === "cli")).toBe(false);
  expect(text()).not.toContain("Agent tools");
  expect(text()).toContain("Doan");
});

test("the row's actions ask main: Check for Updates, Retry, Release Notes and Restart to Update", async () => {
  render(); push(snap({ kind: "idle" })); render();
  click("Check for Updates");
  expect(doan.checkForUpdates).toHaveBeenCalledTimes(1);
  push(snap({ kind: "failed", code: "offline", stage: "check" })); render();
  expect(button("Check for updates again").props.children).toBe("Retry");
  click("Check for updates again");
  expect(doan.checkForUpdates).toHaveBeenCalledTimes(2);
  push(snap(READY)); render();
  click("Release Notes ↗");
  expect(doan.openReleaseNotes).toHaveBeenCalledTimes(1);
  click("Restart to Update");
  expect(doan.installUpdate).toHaveBeenCalledTimes(1);
});

test("checking shows the spinner label on the right without a live role; the description keeps the last result", () => {
  render(); push(snap({ kind: "checking", manual: true, last: { kind: "upToDate", manual: true } })); render();
  const loading = all(row("version").props.children as ReactNode).find(element => element.props.className === "settings-loading")!;
  expect(words(loading.props.children)).toBe("Checking for updates");
  expect(loading.props.role).toBeUndefined();
  expect(description()).toBe("0.1.0 · Up to date, last checked today at 2:41 PM");
  expect(rowButtons()).toHaveLength(0);
});

test("downloading draws a progressbar named by the state text, with the percent beside it hidden from readers", () => {
  render(); push(snap({ kind: "downloading", version: "0.1.1", percent: 42 })); render();
  const bar = all(row("version").props.children as ReactNode).find(element => element.props.role === "progressbar")!;
  expect(bar.props).toMatchObject({ className: "usage-bar update-bar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 42 });
  const state = all(row("version").props.children as ReactNode).find(element => element.props.id === bar.props["aria-labelledby"])!;
  expect(words(state.props.children)).toBe("0.1.0 · Downloading Doan 0.1.1");
  const percent = all(row("version").props.children as ReactNode).find(element => element.props.className === "settings-value")!;
  expect(percent.props).toMatchObject({ "aria-hidden": "true", children: "42%" });
});

test("a failure puts its line under the row, without a live role", () => {
  render(); push(snap({ kind: "failed", code: "offline", stage: "download", version: "0.1.1" })); render();
  expect(description()).toBe("0.1.0 · Couldn’t download Doan 0.1.1.");
  const line = all(row("version").props.children as ReactNode).find(element => String(element.props.className) === "settings-msg error")!;
  expect(words(line.props.children)).toBe("Couldn’t reach GitHub. Check your internet connection, then try again.");
  expect(line.props.role).toBeUndefined();
  expect(button("Download Doan 0.1.1 again")).toBeDefined();
});

test("blocked: the reason is a notice under the row with a title, and stopped adds the error line", () => {
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); render();
  expect(description()).toBe("0.1.0 · Doan 0.1.1 is ready.");
  const box = all(row("version").props.children as ReactNode).find(element => element.props.className === "doan-notice")!;
  const inside = all(box.props.children as ReactNode);
  expect(inside.some(element => element.type === AlertIcon)).toBe(true);
  expect(words(inside.find(element => element.props.className === "ob-notice-title")!.props.children)).toBe("Can’t restart yet");
  expect(words(inside.find(element => element.props.className === "ob-notice-body")!.props.children)).toBe("A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit.");
  expect(box.props.role).toBeUndefined();
  push(snap({ kind: "restartAborted", version: "0.1.1" })); render();
  expect(words(all(row("version").props.children as ReactNode).find(element => String(element.props.className) === "settings-msg error")!.props.children)).toBe("Couldn’t restart Doan. Try again, or quit and open it again.");
});

test("a copy that doesn’t update: the row says so with no action, and there is no automatic-check row", () => {
  render(); push(snap({ kind: "idle" }, { eligibility: { kind: "disabled", reason: "outside-applications" } })); render();
  expect(description()).toBe("0.1.0 · This copy doesn’t update.");
  expect(rowButtons()).toHaveLength(0);
  expect(all(row("version").props.children as ReactNode).some(element => element.props.className === "doan-preference-row-trailing")).toBe(false);
  expect(autoRow()).toBeUndefined();
});

// The page's one live region reads a result once: never the first read, never progress (the MCP Connectors rule).
test("the live region reads results, not the first push or progress, and reads a repeated result again", () => {
  render();
  push(snap({ kind: "upToDate", manual: true })); render();
  expect(live()).toBe("");
  push(snap({ kind: "checking", manual: true, last: { kind: "upToDate", manual: true } })); render();
  expect(live()).toBe("");
  push(snap({ kind: "upToDate", manual: true })); render();
  expect(live()).toBe("Doan is up to date.");
  const first = liveRaw();
  push(snap({ kind: "checking", manual: true, last: { kind: "upToDate", manual: true } })); render();
  push(snap({ kind: "upToDate", manual: true })); render();
  expect(live()).toBe("Doan is up to date.");
  expect(liveRaw()).not.toBe(first);
  push(snap({ kind: "downloading", version: "0.1.1", percent: 0 })); render();
  push(snap({ kind: "downloading", version: "0.1.1", percent: 42 })); render();
  expect(live()).toBe("Doan is up to date.");
  push(snap(READY)); render();
  expect(live()).toBe("Doan 0.1.1 is ready.");
  // A gate change is not news.
  const ready = liveRaw();
  push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); render();
  expect(liveRaw()).toBe(ready);
});

test("Restart to Update answered blocked reads the reason; allowed reads nothing", async () => {
  render(); push(snap(READY)); render();
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  click("Restart to Update"); await flush(); render();
  expect(live()).toBe(BLOCKED_READ);
  const once = liveRaw();
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  click("Restart to Update"); await flush(); render();
  expect(live()).toBe(BLOCKED_READ);
  expect(liveRaw()).not.toBe(once);
  click("Restart to Update"); await flush(); render();
  expect(live()).toBe(BLOCKED_READ);
});

test("the automatic-check switch shows the pushed choice and saves a change; a failed save keeps it, says so and retries", async () => {
  render(); push(snap({ kind: "upToDate", manual: false })); render();
  expect(toggle().props).toMatchObject({ "aria-checked": true, "aria-label": "Check for updates automatically", className: "doan-switch" });
  expect(words(autoRow()!.props.children)).toContain("Checks GitHub when Doan opens and every 6 hours, and downloads in the background. When off, a downloaded update still installs when you quit.");
  (toggle().props.onClick as () => void)();
  expect(save).toHaveBeenLastCalledWith({ updates: { autoCheck: false } });
  await flush(); render();
  expect(text()).not.toContain("Couldn’t save");
  push(snap({ kind: "upToDate", manual: false }, { autoCheck: false })); render();
  expect(toggle().props["aria-checked"]).toBe(false);
  save.mockResolvedValueOnce({ ok: false, reason: "write_failed", snapshot: { preferences: { ...DEFAULT_PREFERENCES, updates: { autoCheck: false } }, notice: null } });
  (toggle().props.onClick as () => void)(); await flush(); render();
  expect(toggle().props["aria-checked"]).toBe(false);
  const line = all(autoRow()!.props.children as ReactNode).find(element => String(element.props.className) === "settings-msg error")!;
  expect(words(line.props.children)).toBe("Couldn’t save your automatic-check choice. Your last saved choice still applies.");
  expect(line.props.role).toBeUndefined();
  expect(live()).toBe("Couldn’t save your automatic-check choice. Your last saved choice still applies.");
  click("Save the automatic-check choice again");
  expect(save).toHaveBeenLastCalledWith({ updates: { autoCheck: true } });
  await flush(); render();
  expect(all(autoRow()!.props.children as ReactNode).some(element => String(element.props.className) === "settings-msg error")).toBe(false);
});

test("the switch waits for preferences and stays off a newer preferences file, whose notice the page shows", () => {
  preferences = null;
  render(); push(snap({ kind: "idle" })); render();
  expect(toggle().props.disabled).toBe(true);
  preferences = { preferences: DEFAULT_PREFERENCES, notice: "newer" };
  render();
  expect(toggle().props.disabled).toBe(true);
  expect(text()).toContain("These settings were saved by a newer version of Doan");
});
