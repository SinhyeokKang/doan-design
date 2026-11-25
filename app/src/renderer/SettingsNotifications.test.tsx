import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
const button = (label: string) => { const found = all(tree).find(element => element.type === "button" && (element.props["aria-label"] === label || words(element.props.children) === label)); if (!found) throw new Error(`no button ${label}`); return found; };
const click = (label: string) => (button(label).props.onClick as () => void)();
const text = () => words(all(tree).filter(element => typeof element.type === "string").map(element => element.props.children));
function resetHooks() { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; }

// Settings > Notifications (PRODUCT §5 item 0 'Notifications'), with hooks as plain state.
const { SettingsNotifications } = await import("./SettingsNotifications");
import type { PreferencesSnapshot } from "../main/preferences";

const snapshot = (notifications: Partial<PreferencesSnapshot["preferences"]["notifications"]> = {}, notice: PreferencesSnapshot["notice"] = null): PreferencesSnapshot =>
  ({ preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true, ...notifications }, newConversation: null, updates: { autoCheck: true } }, notice });
let doan: Record<string, ReturnType<typeof vi.fn>>;
let props: Parameters<typeof SettingsNotifications>[0];
beforeEach(() => {
  resetHooks();
  doan = { startConversation: vi.fn(), sendConversation: vi.fn(), sendTestNotification: vi.fn(async () => ({ kind: "sent" })), openNotificationSettings: vi.fn(async () => true) };
  vi.stubGlobal("window", { doan });
  props = { preferences: snapshot(), save: vi.fn(async () => ({ ok: true as const, snapshot: snapshot() })) };
});
// Nothing on the Settings page may start or send a conversation.
afterEach(() => { expect(doan.startConversation).not.toHaveBeenCalled(); expect(doan.sendConversation).not.toHaveBeenCalled(); });
afterEach(() => vi.unstubAllGlobals());
const render = (next: Partial<typeof props> = {}) => { props = { ...props, ...next }; return run(() => SettingsNotifications(props)); };
const switches = () => all(tree).filter(element => element.props.role === "switch");
const toggle = (label: string) => (switches().find(element => element.props["aria-label"] === label)!.props.onClick as () => void)();

test("Delivery and Notify me about: four switches with the design's copy, the permission hint while on", () => {
  render();
  expect(switches().map(element => [element.props["aria-label"], element.props["aria-checked"], !!element.props.disabled, element.props.className])).toEqual([
    ["Desktop notifications", true, false, "doan-switch"], ["Approval requests", true, false, "doan-switch"], ["Finished", true, false, "doan-switch"], ["Couldn’t finish", true, false, "doan-switch"]]);
  for (const copy of ["Delivery", "Notify me about", "Notifications can appear when the main window is inactive, except for the conversation you’re viewing in a prototype.", "An agent is waiting for you to allow or deny an action, or to answer a question.",
    "An agent finished its turn.", "An agent stopped because of an error. Stops you make aren’t announced.", "If no notification appears, allow Doan in System Settings › Notifications."]) expect(text()).toContain(copy);
  expect(button("Send test notification")).toBeDefined();
  expect(button("Open System Settings ↗")).toBeDefined();
});

// The hint's two actions sit inside its notice, stacked on their own row, panel on the inset fill.
test("the permission hint's actions sit inside its notice, stacked, as panel buttons", () => {
  render();
  const notice = all(tree).find(element => String(element.props.className).startsWith("doan-notice"))!;
  expect(notice.props.className).toBe("doan-notice stacked");
  const inside = all(notice);
  for (const label of ["Send test notification", "Open System Settings ↗"]) {
    const found = inside.find(element => element.type === "button" && words(element.props.children) === label);
    expect(found?.props["data-ui-variant"], label).toBe("panel");
  }
  expect(all(tree).some(element => element.props.className === "ob-state-actions")).toBe(false);
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
  // The notice's text, beside its actions.
  expect(words(all(alert).find(element => String(element.props.className).includes("ob-notice-text"))!.props.children)).toBe("Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications.");
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
  expect(notices()).toEqual(["doan-notice error settings-notice", "doan-notice stacked"]);
  render({ preferences: snapshot({}, "newer") });
  expect(notices()).toEqual(["doan-notice settings-notice", "doan-notice stacked"]);
});

// Read-only text is selectable (the `selectable` class); buttons are not.
test("selectable: the save-failed message, but not its Retry button", async () => {
  props.save = vi.fn(async () => ({ ok: false as const, reason: "write_failed" as const, snapshot: snapshot() }));
  render();
  toggle("Desktop notifications");
  await flush(); render();
  const line = all(tree).find(element => element.type === "p" && String(element.props.className).startsWith("settings-msg error"))!;
  expect(words(line.props.children)).toContain("Couldn’t save your notification choices.");
  expect(String(line.props.className).split(" ")).toContain("selectable");
  expect(String(button("Retry").props.className).split(" ")).not.toContain("selectable");
});

// Only the latest save owns the failure line (POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback'):
// a reply to an earlier save that arrives after a later one was sent is dropped, in either completion order.
describe("a late reply to an earlier save", () => {
  type Reply = Awaited<ReturnType<typeof props.save>>;
  const held = () => { const replies: ((reply: Reply) => void)[] = []; props.save = vi.fn(() => new Promise<Reply>(resolve => replies.push(resolve))); return replies; };
  const failedReply = { ok: false as const, reason: "write_failed" as const, snapshot: snapshot() };
  const savedReply = { ok: true as const, snapshot: snapshot() };
  const failureShown = () => text().includes("Couldn’t save your notification choices.");

  test("an earlier save failing after a later one succeeded shows no failure line", async () => {
    const replies = held();
    render();
    toggle("Finished"); toggle("Approval requests");
    replies[1]!(savedReply); await flush(); render();
    replies[0]!(failedReply); await flush(); render();
    expect(failureShown()).toBe(false);
  });

  // App's save answers null when the IPC call fails; it never rejects.
  test("an earlier save answered null while a later one is out shows no failure line", async () => {
    const replies = held();
    render();
    toggle("Finished"); toggle("Finished");
    replies[0]!(null); await flush(); render();
    expect(failureShown()).toBe(false);
    replies[1]!(savedReply); await flush(); render();
    expect(failureShown()).toBe(false);
  });

  test("an earlier save succeeding after a later one failed keeps the later failure under its own switch", async () => {
    const replies = held();
    render();
    toggle("Finished"); toggle("Approval requests");
    replies[1]!(failedReply); await flush(); render();
    replies[0]!(savedReply); await flush(); render();
    expect(failureShown()).toBe(true);
    const row = all(tree).find(element => element.props.className === "doan-preference-row" && all(element).some(child => child.props["aria-label"] === "Approval requests"))!;
    expect(words(all(row).map(element => element.props.children))).toContain("Couldn’t save your notification choices.");
  });

  test("a Retry's late failure after a later switch save is dropped too", async () => {
    props.save = vi.fn(async () => failedReply);
    render();
    toggle("Finished"); await flush(); render();
    const replies = held();
    render();
    click("Retry"); toggle("Approval requests");
    replies[1]!(savedReply); await flush(); render();
    replies[0]!(failedReply); await flush(); render();
    expect(failureShown()).toBe(false);
  });
});

// DESIGN 'Busy action' (the list Retry's model): Retry keeps its line and focus while the save is out.
test("Retry keeps the failure line while its save is out, busy and named Retry; a repeat failure reads the line again; success clears it", async () => {
  props.save = vi.fn(async () => ({ ok: false as const, reason: "write_failed" as const, snapshot: snapshot() }));
  render();
  toggle("Finished");
  await flush(); render();
  let answer!: (value: Awaited<ReturnType<typeof props.save>>) => void;
  props.save = vi.fn(() => new Promise<Awaited<ReturnType<typeof props.save>>>(resolve => { answer = resolve; }));
  render();
  const lineText = () => words(all(tree).find(element => element.props.className === "settings-msg error selectable")?.props.children);
  const first = lineText();
  expect(button("Retry").props["aria-label"]).toBeUndefined();
  const described = button("Retry").props["aria-describedby"] as string;
  expect(all(tree).find(element => element.props.id === described)).toBeDefined();
  click("Retry"); render();
  expect(lineText()).toBe(first);
  expect(button("Retry").props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  click("Retry");
  expect(props.save).toHaveBeenCalledOnce();
  answer({ ok: false, reason: "write_failed", snapshot: snapshot() }); await flush(); render();
  expect(button("Retry").props["aria-busy"]).toBeUndefined();
  // The same sentence, changed by a no-break space so the alert reads it again.
  expect(lineText()).toBe(`${first} `);
  click("Retry"); render();
  answer({ ok: true, snapshot: snapshot() }); await flush(); render();
  expect(text()).not.toContain("Couldn’t save");
});

test.each(["false", "rejection"])("an OS settings %s keeps the permission hint and retries in place", async failure => {
  render();
  const open = "Open System Settings ↗";
  const route = "Couldn’t open System Settings. On your Mac, go to System Settings › Notifications › Doan.";
  if (failure === "false") doan.openNotificationSettings!.mockResolvedValueOnce(false);
  else doan.openNotificationSettings!.mockRejectedValueOnce(new Error("failed to launch"));
  click(open); await flush(); render();
  const notice = () => all(tree).find(element => element.props.className === "doan-notice stacked")!;
  const error = () => all(notice()).find(element => element.props.role === "alert");
  expect(words(error()?.props.children)).toBe(route);
  expect(button(open).props["aria-describedby"]).toBe(error()!.props.id);
  expect(words(notice().props.children)).toContain("If no notification appears");
  let resolve!: (opened: boolean) => void;
  doan.openNotificationSettings!.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  click(open); render(); click(open);
  expect(doan.openNotificationSettings).toHaveBeenCalledTimes(2);
  expect(button(open).props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  expect(words(error()?.props.children)).toBe(route);
  resolve(true); await flush(); render();
  expect(error()).toBeUndefined();
  expect(button(open).props["aria-describedby"]).toBeUndefined();
  expect(words(notice().props.children)).toContain("If no notification appears");
  expect(doan.sendTestNotification).not.toHaveBeenCalled();
});

test.each([
  ["sent", "status", "Test notification sent. If you didn’t see it, allow Doan in System Settings › Notifications."],
  ["failed", "alert", "Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications."],
])("a %s test result and a launch error have independent live regions", async (kind, role, message) => {
  doan.sendTestNotification!.mockResolvedValueOnce({ kind });
  doan.openNotificationSettings!.mockResolvedValueOnce(false);
  render();
  click("Send test notification"); await flush(); render();
  click("Open System Settings ↗"); await flush(); render();
  const permission = all(tree).find(element => String(element.props.className).includes("settings-permission"))!;
  const regions = all(permission).filter(element => ["alert", "status"].includes(String(element.props.role)));
  expect(regions.map(element => [element.props.role, words(element.props.children)])).toEqual([
    [role, message], ["alert", "Couldn’t open System Settings. On your Mac, go to System Settings › Notifications › Doan."],
  ]);
});
