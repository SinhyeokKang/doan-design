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

// buzz-settings U4: Settings > Notifications (design 'Notifications'), with hooks as plain state.
const { SettingsNotifications } = await import("./SettingsNotifications");
import type { PreferencesSnapshot } from "../main/preferences";

const snapshot = (notifications: Partial<PreferencesSnapshot["preferences"]["notifications"]> = {}, notice: PreferencesSnapshot["notice"] = null): PreferencesSnapshot =>
  ({ preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true, ...notifications }, newConversation: null }, notice });
let doan: Record<string, ReturnType<typeof vi.fn>>;
let props: Parameters<typeof SettingsNotifications>[0];
beforeEach(() => {
  resetHooks();
  doan = { startConversation: vi.fn(), sendConversation: vi.fn(), sendTestNotification: vi.fn(async () => ({ kind: "sent" })), openNotificationSettings: vi.fn(async () => true) };
  vi.stubGlobal("window", { doan });
  props = { preferences: snapshot(), save: vi.fn(async () => ({ ok: true as const, snapshot: snapshot() })) };
});
// review BU1 ⚪4: nothing on the Settings page may start or send a conversation.
afterEach(() => { expect(doan.startConversation).not.toHaveBeenCalled(); expect(doan.sendConversation).not.toHaveBeenCalled(); });
afterEach(() => vi.unstubAllGlobals());
const render = (next: Partial<typeof props> = {}) => { props = { ...props, ...next }; return run(() => SettingsNotifications(props)); };
const switches = () => all(tree).filter(element => element.props.role === "switch");
const toggle = (label: string) => (switches().find(element => element.props["aria-label"] === label)!.props.onClick as () => void)();

test("Delivery and Notify me about: four switches with the design's copy, the permission hint while on", () => {
  render();
  expect(switches().map(element => [element.props["aria-label"], element.props["aria-checked"], !!element.props.disabled, element.props.className])).toEqual([
    ["Desktop notifications", true, false, "doan-switch"], ["Approval requests", true, false, "doan-switch"], ["Finished", true, false, "doan-switch"], ["Couldn’t finish", true, false, "doan-switch"]]);
  for (const copy of ["Delivery", "Notify me about", "Only while Doan isn’t the active window. Clicking one opens the conversation.", "An agent is waiting for you to allow or deny an action.",
    "An agent finished its turn.", "An agent stopped because of an error. Stops you make aren’t announced.", "If no notification appears, allow Doan in System Settings › Notifications."]) expect(text()).toContain(copy);
  expect(button("Send test notification")).toBeDefined();
  expect(button("Open System Settings ↗")).toBeDefined();
});

test("with Desktop notifications off the event switches keep their values but are disabled, and the hint goes", () => {
  render({ preferences: snapshot({ enabled: false, finished: false }) });
  expect(switches().map(element => [element.props["aria-checked"], !!element.props.disabled])).toEqual([[false, false], [true, true], [false, true], [true, true]]);
  expect(all(tree).filter(element => element.props.className === "doan-preference-row" && element.props["data-disabled"] === "")).toHaveLength(3);
  expect(text()).toContain("Turn on desktop notifications to choose these.");
  expect(() => button("Send test notification")).toThrow();
});

test("a switch saves only its key; a failed save keeps the saved choice and offers Retry under that row", async () => {
  render();
  toggle("Finished");
  expect(props.save).toHaveBeenLastCalledWith({ notifications: { finished: false } });
  props.save = vi.fn(async () => ({ ok: false as const, reason: "write_failed" as const, snapshot: snapshot() }));
  render();
  toggle("Desktop notifications");
  await flush(); render();
  expect(props.save).toHaveBeenLastCalledWith({ notifications: { enabled: false } });
  expect(switches()[0]!.props["aria-checked"]).toBe(true);
  expect(text()).toContain("Couldn’t save your notification choices. Your last saved choices still apply.");
  click("Retry");
  expect(props.save).toHaveBeenCalledTimes(2);
  expect(props.save).toHaveBeenLastCalledWith({ notifications: { enabled: false } });
});

test("Send test notification says it was sent, or that Doan isn’t allowed; Open System Settings ↗ asks main for its fixed URL", async () => {
  render();
  click("Send test notification"); await flush(); render();
  expect(text()).toContain("Test notification sent. If you didn’t see it, allow Doan in System Settings › Notifications.");
  doan.sendTestNotification!.mockResolvedValueOnce({ kind: "failed" });
  click("Send test notification"); await flush(); render();
  const alert = all(tree).find(element => element.props.role === "alert")!;
  expect(words(alert.props.children)).toBe("Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications.");
  click("Open System Settings ↗");
  expect(doan.openNotificationSettings).toHaveBeenCalledWith();
});

test("an unreadable preferences file says defaults apply; a newer one says so and keeps every switch from saving", () => {
  render({ preferences: snapshot({}, "broken") });
  expect(text()).toContain("Doan couldn’t read its saved settings, so defaults apply.");
  render({ preferences: snapshot({}, "newer") });
  expect(text()).toContain("These settings were saved by a newer version of Doan");
  expect(text()).toContain("Defaults apply here, and changes aren’t saved. Update Doan to use them.");
  expect(switches().every(element => element.props.disabled === true)).toBe(true);
});

test("Settings notices sit on the white page, so they keep the inset notice instead of the panel", () => {
  const notices = () => all(tree).filter(element => typeof element.props.className === "string" && element.props.className.split(" ").includes("doan-notice")).map(element => element.props.className);
  render({ preferences: snapshot({}, "broken") });
  expect(notices()).toEqual(["doan-notice error settings-notice", "doan-notice"]);
  render({ preferences: snapshot({}, "newer") });
  expect(notices()).toEqual(["doan-notice settings-notice", "doan-notice"]);
});
