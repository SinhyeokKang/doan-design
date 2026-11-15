import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_PREFERENCES, type PreferencesSnapshot } from "../main/preferences";
import type { BuddySelection } from "./buddySelection";

// Settings > General's confirmed switch and its 24-hour lock (.doan/canvases/buddy-change-cooldown.html), with hooks
// as plain state (SettingsPage.test.tsx style): there is no DOM here, so handlers are called on the element tree and
// `document` is a stub that records focus.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0, changed: 0,
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
      return [hooks.states[index], (next: unknown) => { hooks.changed++; hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { SettingsGeneral } = await import("./SettingsGeneral");
const { SettingsDialog } = await import("./SettingsDialog");
const { Buddy } = await import("./Doany");

const H = 3_600_000;
const NOW = Date.parse("2026-11-14T10:00:00.000Z");
type Listener = () => void;
let listeners: { document: Map<string, Listener>; window: Map<string, Listener> };
let focused: Record<string, ReturnType<typeof vi.fn>>;
let doc: { activeElement: unknown; body: object; hidden: boolean; querySelector(selector: string): unknown; addEventListener(type: string, run: Listener): void; removeEventListener(type: string, run: Listener): void };
const checked = { focus: vi.fn() };

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; hooks.changed = 0;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  listeners = { document: new Map(), window: new Map() };
  focused = {};
  checked.focus.mockClear();
  const element = (selector: string) => (focused[selector] ??= vi.fn());
  doc = {
    activeElement: null, body: {}, hidden: false,
    // Each focusable the component asks for is a stub whose focus is recorded under its selector.
    querySelector: (selector: string) => selector === ".settings-panel .buddy-rows" ? { querySelector: (inner: string) => inner === 'input[type="radio"]:checked' ? checked : null } : { focus: element(selector) },
    addEventListener: (type, run) => listeners.document.set(type, run),
    removeEventListener: (type, run) => { if (listeners.document.get(type) === run) listeners.document.delete(type); },
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { addEventListener: (type: string, run: Listener) => listeners.window.set(type, run), removeEventListener: (type: string, run: Listener) => { if (listeners.window.get(type) === run) listeners.window.delete(type); } });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  // The picker's rows, the notice and the alert are drawn here; the WebGL buddy stays an element.
  if (typeof node.type === "function" && node.type !== Buddy) return [node, ...all((node.type as (props: unknown) => ReactNode)(node.props))];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
const snapshot = (notice: PreferencesSnapshot["notice"] = null): PreferencesSnapshot => ({ preferences: { ...DEFAULT_PREFERENCES, buddy: "doany" }, notice });
const selection = (patch: Partial<BuddySelection> = {}): BuddySelection => ({ shown: "doany", failure: null, lockedUntil: null, select: vi.fn(async () => true), settled: async () => true, commit: vi.fn(async () => true), dismiss: vi.fn(), ...patch });

let nodes: ReactElement<Record<string, unknown>>[];
let onLock: ReturnType<typeof vi.fn<(locked: boolean) => void>>;
function render(buddy: BuddySelection, preferences: PreferencesSnapshot | null = snapshot()) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
  nodes = all(SettingsGeneral({ preferences, buddy, onLock }));
  return nodes;
}
function effects() { const pending = hooks.pending; hooks.pending = []; for (const run of pending) run(); }
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const radio = (id: string) => nodes.find(element => element.type === "input" && element.props.value === id)!;
const click = (id: string) => (radio(id).props.onClick as (event: unknown) => void)({ preventDefault: vi.fn() });
const dialog = () => nodes.find(element => element.type === "dialog");
const button = (name: string) => nodes.find(element => element.type === "button" && words(element.props.children) === name)!;
const lock = () => nodes.find(element => element.props.className === "buddy-lock");
const rowFocus = (id: string) => focused[`.settings-panel .buddy-rows input[value="${id}"]`];
const buddyFocus = () => focused[".settings-panel .buddy-lock .doany"];

beforeEach(() => { onLock = vi.fn<(locked: boolean) => void>(); });

describe("asking before a switch", () => {
  test("another buddy's row opens the alert; the rows keep the saved buddy and nothing saves; the page locks", () => {
    const buddy = selection();
    render(buddy); effects();
    click("popo");
    render(buddy); effects();
    expect(dialog()!.props).toMatchObject({ role: "alertdialog", "aria-label": "Switch to Popo?" });
    expect(words(nodes.find(element => element.type === "h3" && element.props.className === "doan-dialog-title")!.props.children)).toBe("Switch to Popo?");
    expect(words(nodes.find(element => element.props.className === "doan-dialog-description")!.props.children)).toBe("You can’t change your buddy again for 24 hours.");
    expect(nodes.filter(element => element.type === "button").map(element => words(element.props.children))).toEqual(["Cancel", "Switch to Popo"]);
    expect(nodes.filter(element => element.type === "input").find(input => input.props.checked)!.props.value).toBe("doany");
    expect(buddy.select).not.toHaveBeenCalled();
    expect(onLock).toHaveBeenLastCalledWith(true);
  });

  test("Cancel closes it with nothing saved, unlocks the page and puts focus back on the row pressed", () => {
    const buddy = selection();
    render(buddy); effects();
    click("popo");
    render(buddy);
    (button("Cancel").props.onClick as () => void)();
    render(buddy); effects();
    expect(dialog()).toBeUndefined();
    expect(buddy.select).not.toHaveBeenCalled();
    expect(onLock).toHaveBeenLastCalledWith(false);
    expect(rowFocus("popo")).toHaveBeenCalled();
  });

  test("Escape closes it the same way", () => {
    const buddy = selection();
    render(buddy); effects();
    click("dori");
    render(buddy);
    const escape = { preventDefault: vi.fn() };
    (dialog()!.props.onCancel as (event: unknown) => void)(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    render(buddy); effects();
    expect(dialog()).toBeUndefined();
    expect(onLock).toHaveBeenLastCalledWith(false);
    expect(rowFocus("dori")).toHaveBeenCalled();
  });

  test("Switch saves the buddy with this moment as one pick and keeps the alert busy: Cancel, Escape and the rows do nothing", () => {
    let answer!: (saved: boolean) => void;
    const buddy = selection({ select: vi.fn(() => new Promise<boolean>(resolve => { answer = resolve; })) });
    render(buddy); effects();
    click("popo");
    render(buddy);
    (button("Switch to Popo").props.onClick as () => void)();
    expect(buddy.select).toHaveBeenCalledExactlyOnceWith("popo", "2026-11-14T10:00:00.000Z");
    render(buddy);
    expect(dialog()).toBeDefined();
    const verb = button("Switch to Popo");
    expect(verb.props["aria-disabled"]).toBe(true);
    // The pressed verb keeps its fill (no DS disabled look) and says it is busy; Cancel dims.
    expect(verb.props["data-disabled"]).toBeUndefined();
    expect(verb.props["aria-busy"]).toBe(true);
    expect(button("Cancel").props["data-disabled"]).toBe("");
    expect(all(verb.props.children as ReactNode).some(element => element.props.className === "doan-spinner" && element.props["aria-hidden"] === "true")).toBe(true);
    expect(button("Cancel").props["aria-disabled"]).toBe(true);
    (button("Cancel").props.onClick as () => void)();
    (dialog()!.props.onCancel as (event: unknown) => void)({ preventDefault: vi.fn() });
    const escape = { key: "Escape", nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
    (dialog()!.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    (verb.props.onClick as () => void)();
    click("dori");
    render(buddy);
    expect(dialog()).toBeDefined();
    expect(words(nodes.find(element => element.props.className === "doan-dialog-title")!.props.children)).toBe("Switch to Popo?");
    expect(buddy.select).toHaveBeenCalledOnce();
    expect(onLock).toHaveBeenLastCalledWith(true);
    answer(true);
  });

  test("a saved switch closes the alert, unlocks the page, covers the rows and puts focus on the buddy above them", async () => {
    const buddy = selection();
    render(buddy); effects();
    click("popo");
    render(buddy);
    (button("Switch to Popo").props.onClick as () => void)();
    await settle();
    const saved = selection({ shown: "popo", lockedUntil: NOW + 24 * H });
    render(saved); effects();
    expect(dialog()).toBeUndefined();
    expect(onLock).toHaveBeenLastCalledWith(false);
    expect(lock()).toBeDefined();
    expect(nodes.find(element => element.props.role === "radiogroup")!.props.inert).toBe(true);
    expect(buddyFocus()).toHaveBeenCalled();
  });

  test("a failed switch closes the alert with no lock and puts focus on the row pressed; Retry sends a fresh time and lands on the buddy", async () => {
    const buddy = selection({ select: vi.fn(async () => false) });
    render(buddy); effects();
    click("popo");
    render(buddy);
    (button("Switch to Popo").props.onClick as () => void)();
    await settle();
    // The alert is still drawn, modal, until the next render: focus moved now would not land (runtime probe).
    expect(rowFocus("popo")).toBeUndefined();
    const failed = selection({ failure: { picked: "popo", kept: "doany", cooldown: true } });
    render(failed); effects();
    expect(dialog()).toBeUndefined();
    expect(onLock).toHaveBeenLastCalledWith(false);
    expect(lock()).toBeUndefined();
    expect(rowFocus("popo")).toHaveBeenCalled();
    expect(nodes.find(element => element.type === "span" && element.props.id === "settings-buddy-error")!.props.children).toBe("Couldn’t switch to Popo. Doany is still your buddy.");
    vi.setSystemTime(NOW + 60_000);
    (button("Retry").props.onClick as () => void)();
    expect(failed.select).toHaveBeenCalledExactlyOnceWith("popo", "2026-11-14T10:01:00.000Z");
    expect(dialog()).toBeUndefined();
    await settle();
    render(selection({ shown: "popo", lockedUntil: NOW + 25 * H })); effects();
    expect(buddyFocus()).toHaveBeenCalled();
  });

  // Main does not enforce the lock: a second switch confirmed while Retry's save was out would land inside the lock
  // that save starts.
  test("while a Retry save is out the rows open nothing", async () => {
    let answer!: (saved: boolean) => void;
    const failed = selection({ failure: { picked: "popo", kept: "doany", cooldown: true }, select: vi.fn(() => new Promise<boolean>(resolve => { answer = resolve; })) });
    render(failed); effects();
    (button("Retry").props.onClick as () => void)();
    click("dori");
    render(failed);
    expect(dialog()).toBeUndefined();
    expect(onLock).not.toHaveBeenCalledWith(true);
    answer(false);
    await settle();
    click("dori");
    render(failed);
    expect(dialog()).toBeDefined();
  });

  test("leaving the category with the alert open releases the page lock", () => {
    const buddy = selection();
    render(buddy); effects();
    click("popo");
    render(buddy); effects();
    expect(onLock).toHaveBeenLastCalledWith(true);
    for (const effect of hooks.effects) effect?.cleanup?.();
    expect(onLock).toHaveBeenLastCalledWith(false);
  });

  test("the current buddy's row opens nothing", () => {
    const buddy = selection({ shown: "puri" });
    render(buddy); effects();
    click("puri");
    render(buddy);
    expect(dialog()).toBeUndefined();
    expect(onLock).not.toHaveBeenCalledWith(true);
  });
});

describe("the lock", () => {
  test("covers only the group: the rows go inert under the problem overlay's material, with the buddy at 96 px over the countdown and its line", () => {
    render(selection({ shown: "popo", lockedUntil: NOW + 24 * H - 19_000 }));
    const group = nodes.find(element => String(element.props.className ?? "").startsWith("doan-settings-group"))!;
    expect(group.props.className).toBe("doan-settings-group buddy-locked");
    expect(all(group.props.children as ReactNode).some(element => element.props.className === "buddy-lock")).toBe(true);
    const hop = nodes.find(element => element.type === Buddy)!;
    expect(hop.props).toMatchObject({ buddy: "popo", size: 96, describedBy: "settings-buddy-time settings-buddy-rule" });
    const time = nodes.find(element => element.props.id === "settings-buddy-time")!;
    expect(time.type).toBe("h3");
    expect(time.props.children).toBe("23:59:41");
    const rule = nodes.find(element => element.props.id === "settings-buddy-rule")!;
    expect(rule.type).toBe("p");
    expect(rule.props.children).toBe("Until you can change your buddy again. Your buddy stays for 24 hours after each change.");
    // Read once with the buddy when focus reaches it, never every second.
    for (const element of [time, rule]) { expect(element.props.role).toBeUndefined(); expect(element.props["aria-live"]).toBeUndefined(); }
    expect(nodes.find(element => element.props.className === "ob-heading problem-heading")).toBeDefined();
    // The section's title and description and the notices stay outside the overlay.
    expect(all(group.props.children as ReactNode).some(element => element.type === "h2")).toBe(false);
  });

  test("under an hour the hours stay as 00", () => {
    render(selection({ shown: "popo", lockedUntil: NOW + 42 * 60_000 + 17_000 }));
    expect(nodes.find(element => element.props.id === "settings-buddy-time")!.props.children).toBe("00:42:17");
  });

  test("ticks on each second boundary", () => {
    const buddy = selection({ shown: "popo", lockedUntil: NOW + 3_500 });
    render(buddy); effects();
    expect(nodes.find(element => element.props.id === "settings-buddy-time")!.props.children).toBe("00:00:04");
    vi.advanceTimersByTime(499);
    render(buddy); effects();
    expect(nodes.find(element => element.props.id === "settings-buddy-time")!.props.children).toBe("00:00:04");
    const before = hooks.changed;
    vi.advanceTimersByTime(1);
    expect(hooks.changed).toBeGreaterThan(before);
    render(buddy); effects();
    expect(nodes.find(element => element.props.id === "settings-buddy-time")!.props.children).toBe("00:00:03");
  });

  test("at zero the overlay leaves, the rows come back and focus on the buddy moves to the checked row", () => {
    const buddy = selection({ shown: "popo", lockedUntil: NOW + 1_000 });
    render(buddy); effects();
    doc.activeElement = { closest: (selector: string) => selector.includes("buddy-lock") ? {} : null };
    vi.advanceTimersByTime(1_000);
    render(buddy); effects();
    expect(lock()).toBeUndefined();
    expect(nodes.find(element => element.props.role === "radiogroup")!.props.inert).toBeFalsy();
    expect(checked.focus).toHaveBeenCalled();
  });

  test("at zero with focus elsewhere, focus stays where it is", () => {
    const buddy = selection({ shown: "popo", lockedUntil: NOW + 1_000 });
    render(buddy); effects();
    doc.activeElement = { closest: () => null };
    vi.advanceTimersByTime(1_000);
    render(buddy); effects();
    expect(lock()).toBeUndefined();
    expect(checked.focus).not.toHaveBeenCalled();
  });

  // A timer can wake late after sleep; showing the window or giving it focus recomputes at once.
  test("the window showing again or taking focus recomputes the countdown", () => {
    const buddy = selection({ shown: "popo", lockedUntil: NOW + 2 * H });
    render(buddy); effects();
    expect(listeners.document.has("visibilitychange")).toBe(true);
    expect(listeners.window.has("focus")).toBe(true);
    vi.setSystemTime(NOW + H);
    const before = hooks.changed;
    listeners.document.get("visibilitychange")!();
    expect(hooks.changed).toBeGreaterThan(before);
    render(buddy); effects();
    expect(nodes.find(element => element.props.id === "settings-buddy-time")!.props.children).toBe("01:00:00");
    const again = hooks.changed;
    listeners.window.get("focus")!();
    expect(hooks.changed).toBeGreaterThan(again);
  });

  test("leaving the category removes the listeners", () => {
    render(selection({ shown: "popo", lockedUntil: NOW + 2 * H })); effects();
    for (const effect of hooks.effects) effect?.cleanup?.();
    expect(listeners.document.has("visibilitychange")).toBe(false);
    expect(listeners.window.has("focus")).toBe(false);
  });

  test("a new mount keeps the lock; one after the time ran out shows none", () => {
    render(selection({ shown: "popo", lockedUntil: NOW + 5 * H }));
    expect(lock()).toBeDefined();
    hooks.states = []; hooks.refs = []; hooks.effects = [];
    render(selection({ shown: "popo", lockedUntil: NOW - 1 }));
    expect(lock()).toBeUndefined();
    expect(nodes.filter(element => element.type === "input").every(input => input.props.disabled === false)).toBe(true);
  });

  test("a newer file turns the rows off with no overlay; so does a snapshot not yet read", () => {
    render(selection({ shown: "popo", lockedUntil: NOW + 5 * H }), snapshot("newer"));
    expect(lock()).toBeUndefined();
    expect(nodes.filter(element => element.type === "input").every(input => input.props.disabled === true)).toBe(true);
    render(selection({ shown: "popo", lockedUntil: NOW + 5 * H }), null);
    expect(lock()).toBeUndefined();
  });
});

describe("SettingsDialog", () => {
  // Project Settings' Share: no busy state, so a choice closes the alert at once.
  test("without a busy state a choice closes the alert and answers", () => {
    const answer = vi.fn();
    const close = vi.fn();
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    const tree = all(SettingsDialog({ title: "Share x?", description: "d", verb: "Share", answer }));
    hooks.refs[0]!.current = { close, showModal: vi.fn() };
    (tree.find(element => element.type === "button" && words(element.props.children) === "Share")!.props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
    expect(answer).toHaveBeenCalledWith(true);
    const cancel = tree.find(element => element.type === "button" && words(element.props.children) === "Cancel")!;
    expect(cancel.props["aria-disabled"]).toBeUndefined();
  });

  test("with a busy owner, the verb leaves the alert open for the owner to close", () => {
    const answer = vi.fn();
    const close = vi.fn();
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    const tree = all(SettingsDialog({ title: "Switch?", description: "d", verb: "Switch", pending: false, answer }));
    hooks.refs[0]!.current = { close, showModal: vi.fn() };
    (tree.find(element => element.type === "button" && words(element.props.children) === "Switch")!.props.onClick as () => void)();
    expect(answer).toHaveBeenCalledWith(true);
    expect(close).not.toHaveBeenCalled();
  });
});

test("lock CSS: the problem overlay's material over the group, its corners following the group's; tabular digits", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".doan-settings-group.buddy-locked { position: relative; }");
  // The group's row hairline (`> * + *`) must not draw a second line under the group's top border.
  expect(css).toMatch(/\.buddy-lock \{[^}]*border: 0;/);
  expect(css).toMatch(/\.buddy-lock \{[^}]*background: color-mix\(in srgb, var\(--surface-panel\) 60%, transparent\);[^}]*backdrop-filter: blur\(var\(--blur-sm\)\);/);
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{ \.buddy-lock \{ background: var\(--surface-panel\); -webkit-backdrop-filter: none; backdrop-filter: none; \} \}/);
  expect(css).toMatch(/\.buddy-lock \.ob-heading h3 \{[^}]*font-variant-numeric: tabular-nums;/);
});
