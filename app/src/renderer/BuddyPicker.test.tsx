import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_PREFERENCES, type PreferencesSnapshot } from "../main/preferences";
import type { BuddySelection } from "./buddySelection";

// The buddy picker and the two screens that hold its row (.doan/canvases/buddy-choice.html), with hooks as plain
// values (SettingsPage.test.tsx style): no DOM here, so handlers are called directly on the element tree.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: (run: () => unknown) => { hooks.effects.push(run); },
    useLayoutEffect: () => {},
  };
});
const { BuddyFailureNotice, BuddyFlow, BuddyRows, rowFocusTarget } = await import("./BuddyPicker");
const { BuddyIntro, BuddyScene } = await import("./Onboarding");

beforeEach(() => { hooks.refs = []; hooks.refCursor = 0; hooks.effects = []; vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; }); });
afterEach(() => vi.unstubAllGlobals());

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  // Function components are expanded so the tree holds what they draw.
  if (typeof node.type === "function") return all((node.type as (props: unknown) => ReactNode)(node.props));
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
const radios = (tree: ReactNode) => all(tree).filter(element => element.type === "input");
const snapshot = (notice: PreferencesSnapshot["notice"] = null): PreferencesSnapshot => ({ preferences: DEFAULT_PREFERENCES, notice });
const selection = (patch: Partial<BuddySelection> = {}): BuddySelection => ({ shown: "doany", failure: null, lockedUntil: null, select: vi.fn(async () => true), settled: async () => true, commit: vi.fn(async () => true), dismiss: vi.fn(), ...patch });
const key = (name: string) => ({ key: name, preventDefault: vi.fn() });

describe("first run's Cover Flow row", () => {
  const flow = (patch: Partial<Parameters<typeof BuddyFlow>[0]> = {}) => BuddyFlow({ name: "ob-buddy", labelledBy: "ob-buddy-title", selected: "doany", disabled: false, select: vi.fn(), ...patch });

  test("a radio group named by the heading: five cards in the row's order, Doany in the middle, each radio named and described", () => {
    const tree = flow();
    const group = all(tree)[0]!;
    expect(group.props).toMatchObject({ role: "radiogroup", "aria-labelledby": "ob-buddy-title", className: "buddy-flow" });
    expect(group.props["aria-disabled"]).toBeUndefined();
    const cards = all(tree).filter(element => element.type === "label");
    expect(cards.map(card => card.props["data-o"])).toEqual([-2, -1, 0, 1, 2]);
    expect(cards.every(card => card.props.className === "doan-panel buddy-card")).toBe(true);
    expect(radios(tree).map(radio => [radio.props.value, radio.props.checked])).toEqual([["popo", false], ["puri", false], ["doany", true], ["dungdung", false], ["dori", false]]);
    expect(radios(tree)[0]!.props).toMatchObject({ type: "radio", name: "ob-buddy", "aria-labelledby": "ob-buddy-popo-name", "aria-describedby": "ob-buddy-popo-line" });
    const popo = cards[0]!;
    expect(all(popo).find(element => element.type === "img")!.props).toEqual({ src: "buddies/popo/card.png", alt: "" });
    expect(all(popo).find(element => element.type === "strong")!.props).toMatchObject({ id: "ob-buddy-popo-name", children: "Popo" });
    expect(all(popo).find(element => element.type === "span")!.props).toMatchObject({ id: "ob-buddy-popo-line", children: "A whimsical bookworm who dreams up new games." });
  });

  test("Dori at the end: the other four stack on its left", () => {
    expect(all(flow({ selected: "dori" })).filter(element => element.type === "label").map(card => card.props["data-o"])).toEqual([-4, -3, -2, -1, 0]);
  });

  test("a card click picks through the radio's change", () => {
    const select = vi.fn();
    const tree = flow({ select });
    (radios(tree)[3]!.props.onChange as () => void)();
    expect(select).toHaveBeenCalledWith("dungdung");
  });

  test("arrows pick the next card and move focus to it, stop at the ends and never wrap; Return does nothing", () => {
    const select = vi.fn();
    const target = { focus: vi.fn() };
    const query = vi.fn(() => target);
    const tree = flow({ select });
    hooks.refs[0]!.current = { querySelector: query };
    const keys = all(tree)[0]!.props.onKeyDown as (event: ReturnType<typeof key>) => void;
    const right = key("ArrowRight");
    keys(right);
    expect(right.preventDefault).toHaveBeenCalled();
    expect(select).toHaveBeenLastCalledWith("dungdung");
    expect(query).toHaveBeenLastCalledWith('input[value="dungdung"]');
    expect(target.focus).toHaveBeenCalled();
    keys(key("ArrowUp"));
    expect(select).toHaveBeenLastCalledWith("puri");
    select.mockClear();
    const enter = key("Enter");
    keys(enter);
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();

    hooks.refCursor = 0;
    const end = flow({ selected: "dori", select });
    const stop = key("ArrowRight");
    (all(end)[0]!.props.onKeyDown as (event: ReturnType<typeof key>) => void)(stop);
    // The native radio would wrap to Popo; the row stays on Dori.
    expect(stop.preventDefault).toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  // A fake row: five cards whose inline transforms the scroll writes, on fake timers and frames.
  function scrollRow(select: (id: string) => void, selected = "doany") {
    vi.useFakeTimers();
    let now = 0;
    const frames: ((time: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (run: (time: number) => void) => { frames.push(run); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const cards = Array.from({ length: 5 }, () => ({ style: { transform: "", zIndex: "" } }));
    let wheel: ((event: Record<string, unknown>) => void) | null = null;
    flow({ select, selected: selected as never });
    const node = { clientWidth: 992, dataset: {} as Record<string, string>, querySelectorAll: () => cards, addEventListener: (type: string, listener: typeof wheel, options: unknown) => { expect([type, options]).toEqual(["wheel", { passive: false }]); wheel = listener; }, removeEventListener: vi.fn() };
    hooks.refs[0]!.current = node;
    for (const run of hooks.effects) run();
    const tick = (ms: number) => { for (let t = 0; t < ms; t += 16) { now += 16; vi.advanceTimersByTime(16); const run = frames.splice(0); for (const f of run) f(now); } };
    const send = (dx: number, dy = 0) => { const event = { deltaX: dx, deltaY: dy, shiftKey: false, preventDefault: vi.fn() }; wheel!(event); tick(16); return event; };
    return { cards, node, tick, send };
  }

  test("a horizontal scroll moves the row continuously and picks only the card it snaps to", () => {
    const select = vi.fn();
    const row = scrollRow(select);
    // A fast double swipe right from Doany, as a trackpad sends it (the second swipe inside the first's momentum).
    for (const dx of [4, 18, 52, 67, 56, 62, 62, 60, 59, 57, 58, 55, 51, 47, 31, 13, 78, 144, 134, 198, 199, 188, 177, 167, 158, 142, 134, 129, 124, 119]) row.send(dx);
    expect(row.node.dataset.scrolling).toBe("");
    // Between cards while it runs: the middle card has turned partway, and nothing is picked yet.
    expect(row.cards[2]!.style.transform).toMatch(/^translateX\(-?\d/);
    expect(select).not.toHaveBeenCalled();
    row.tick(160 + 240 + 32);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("dori");
    vi.useRealTimers(); vi.restoreAllMocks();
  });

  test("a gentle swipe settles on the nearest card; a vertical scroll is the page's", () => {
    const select = vi.fn();
    const row = scrollRow(select);
    for (const dx of [10, 40, 90, 120, 110, 80, 60, 40, 30, 20]) row.send(dx);
    row.tick(500);
    expect(select).toHaveBeenCalledExactlyOnceWith("dungdung");
    const down = row.send(0, 40);
    expect(down.preventDefault).not.toHaveBeenCalled();
    row.tick(500);
    expect(select).toHaveBeenCalledTimes(1);
    vi.useRealTimers(); vi.restoreAllMocks();
  });

  test("a scroll that settles back on the chosen card picks nothing", () => {
    const select = vi.fn();
    const row = scrollRow(select);
    for (const dx of [20, 40, 30, 20, 10]) row.send(dx);
    row.tick(500);
    expect(select).not.toHaveBeenCalled();
    expect(row.cards.every(card => card.style.transform === "")).toBe(true);
    expect(row.node.dataset.scrolling).toBeUndefined();
    vi.useRealTimers(); vi.restoreAllMocks();
  });

  test("off (a newer file, or no snapshot yet): the group is aria-disabled, its radios disabled, and arrows and swipes do nothing", () => {
    const select = vi.fn();
    const tree = flow({ disabled: true, select });
    expect(all(tree)[0]!.props["aria-disabled"]).toBe(true);
    expect(radios(tree).every(radio => radio.props.disabled === true)).toBe(true);
    (all(tree)[0]!.props.onKeyDown as (event: ReturnType<typeof key>) => void)(key("ArrowRight"));
    let wheel: ((event: Record<string, unknown>) => void) | null = null;
    hooks.refs[0]!.current = { addEventListener: (_: string, listener: typeof wheel) => { wheel = listener; }, removeEventListener: vi.fn() };
    for (const run of hooks.effects) run();
    wheel!({ deltaX: 40, deltaY: 0, shiftKey: false, timeStamp: 0, preventDefault: vi.fn() });
    expect(select).not.toHaveBeenCalled();
  });
});

describe("Settings > General's rows", () => {
  const rows = (patch: Partial<Parameters<typeof BuddyRows>[0]> = {}) => BuddyRows({ name: "settings-buddy", labelledBy: "settings-general-buddy", selected: "popo", disabled: false, request: vi.fn(), ...patch });
  const event = (patch: Record<string, unknown> = {}) => ({ preventDefault: vi.fn(), ...patch });

  test("one preference row per buddy in the default order; the whole row is the label, with the card picture and the onboarding radio", () => {
    const tree = rows();
    expect(all(tree)[0]!.props).toMatchObject({ role: "radiogroup", "aria-labelledby": "settings-general-buddy", className: "buddy-rows" });
    const labels = all(tree).filter(element => element.type === "label");
    expect(labels.every(row => row.props.className === "doan-preference-row buddy-row" && row.props["data-disabled"] === undefined)).toBe(true);
    expect(radios(tree).map(radio => [radio.props.value, radio.props.checked])).toEqual([["doany", false], ["puri", false], ["dungdung", false], ["popo", true], ["dori", false]]);
    expect(words(labels[4]!.props.children)).toBe("DoriA quiet, caring friend to lean on when you’re tired.");
    expect(all(labels[0]).filter(element => element.type === "img").map(image => image.props)).toEqual([{ src: "buddies/doany/card.png", alt: "" }]);
    expect(all(labels[0]).some(element => element.props.className === "ob-radio" && element.props["aria-hidden"] === "true")).toBe(true);
    const off = rows({ disabled: true });
    expect(radios(off).every(radio => radio.props.disabled === true)).toBe(true);
    expect(all(off).filter(element => element.type === "label").every(row => row.props["data-disabled"] === "")).toBe(true);
  });

  // A switch is confirmed first: the radio never turns checked on its own, so the row, Home and the accent wait.
  test("a click (and Space, which the browser turns into a click) asks for the buddy without checking its radio", () => {
    const request = vi.fn();
    const tree = rows({ request });
    const click = event();
    (radios(tree)[1]!.props.onClick as (event: unknown) => void)(click);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("puri");
    expect(radios(tree).find(radio => radio.props.checked)!.props.value).toBe("popo");
  });

  test("Return on a row asks for its buddy too", () => {
    const request = vi.fn();
    const tree = rows({ request });
    const enter = event({ key: "Enter" });
    (radios(tree)[4]!.props.onKeyDown as (event: unknown) => void)(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("dori");
  });

  test("the current buddy's row asks for nothing", () => {
    const request = vi.fn();
    const tree = rows({ request });
    (radios(tree)[3]!.props.onClick as (event: unknown) => void)(event());
    (radios(tree)[3]!.props.onKeyDown as (event: unknown) => void)(event({ key: "Enter" }));
    expect(request).not.toHaveBeenCalled();
  });

  test("off: a click or Return asks for nothing", () => {
    const request = vi.fn();
    const tree = rows({ request, disabled: true });
    (radios(tree)[1]!.props.onClick as (event: unknown) => void)(event());
    (radios(tree)[1]!.props.onKeyDown as (event: unknown) => void)(event({ key: "Enter" }));
    expect(request).not.toHaveBeenCalled();
  });

  // POSTMORTEM 2026-11-12 'An arrow key on the setup panel's storage radio dropped focus to the heading'.
  test("arrows only move focus, wrapping at the ends: focus lands on the next row, nothing is asked or checked", () => {
    const request = vi.fn();
    const inputs = new Map<string, { focus(): void }>();
    const doc = { activeElement: null as unknown };
    vi.stubGlobal("document", doc);
    const group = { querySelector: (selector: string) => inputs.get(/value="(\w+)"/.exec(selector)?.[1] ?? "") ?? null };
    for (const id of ["doany", "puri", "dungdung", "popo", "dori"]) inputs.set(id, { focus() { doc.activeElement = this; } });
    const tree = rows({ request });
    hooks.refs[0]!.current = group;
    const keys = all(tree)[0]!.props.onKeyDown as (event: unknown) => void;
    const press = (key: string, from: string) => { const pressed = event({ key, target: { value: from } }); keys(pressed); return pressed; };
    expect(press("ArrowDown", "popo").preventDefault).toHaveBeenCalled();
    expect(doc.activeElement).toBe(inputs.get("dori"));
    press("ArrowDown", "dori");
    expect(doc.activeElement).toBe(inputs.get("doany"));
    press("ArrowUp", "doany");
    expect(doc.activeElement).toBe(inputs.get("dori"));
    press("ArrowRight", "doany");
    expect(doc.activeElement).toBe(inputs.get("puri"));
    press("ArrowLeft", "puri");
    expect(doc.activeElement).toBe(inputs.get("doany"));
    expect(request).not.toHaveBeenCalled();
    expect(radios(tree).find(radio => radio.props.checked)!.props.value).toBe("popo");
    expect(press("Tab", "doany").preventDefault).not.toHaveBeenCalled();
  });

  test("locked: the group is inert under the overlay", () => {
    expect(all(rows({ inert: true }))[0]!.props.inert).toBe(true);
    expect(all(rows())[0]!.props.inert).toBeFalsy();
  });
});

test("rowFocusTarget: up/left and down/right go round the rows; other keys are not the rows'", () => {
  const ids = ["doany", "puri", "dungdung", "popo", "dori"] as const;
  expect(rowFocusTarget(ids, "doany", "ArrowDown")).toBe("puri");
  expect(rowFocusTarget(ids, "doany", "ArrowRight")).toBe("puri");
  expect(rowFocusTarget(ids, "doany", "ArrowUp")).toBe("dori");
  expect(rowFocusTarget(ids, "doany", "ArrowLeft")).toBe("dori");
  expect(rowFocusTarget(ids, "dori", "ArrowDown")).toBe("doany");
  expect(rowFocusTarget(ids, "popo", "ArrowUp")).toBe("dungdung");
  for (const key of ["Enter", " ", "Home", "End", "Tab", "a"]) expect(rowFocusTarget(ids, "popo", key), key).toBeNull();
});

test("the failure notice names both buddies; Retry is named by its word and described by the sentence; no live role", () => {
  const retry = vi.fn();
  const tree = BuddyFailureNotice({ failure: { picked: "popo", kept: "doany" }, id: "ob-buddy-error", className: "doan-panel buddy-step-notice", retry });
  const [notice] = all(tree);
  expect(notice!.props.className).toBe("doan-notice error doan-panel buddy-step-notice");
  expect(notice!.props.role).toBeUndefined();
  expect(all(tree).find(element => element.props.id === "ob-buddy-error")!.props.children).toBe("Couldn’t switch to Popo. Doany is still your buddy.");
  const button = all(tree).find(element => element.type === "button")!;
  expect(button.props).toMatchObject({ "aria-describedby": "ob-buddy-error", children: "Retry", "data-ui-variant": "subtle", "data-ui-size": "sm" });
  (button.props.onClick as () => void)();
  expect(retry).toHaveBeenCalled();
});

describe("the Buddy step and the existing-user buddy screen", () => {
  const scene = (buddy: BuddySelection, preferences: PreferencesSnapshot | null = snapshot()) => BuddyScene({ selection: buddy, preferences, heading: vi.fn(), footer: <footer /> });

  test("heading, lead and row, then the footer: the radio group is named by the visible heading", () => {
    const tree = scene(selection());
    const heading = all(tree).find(element => element.type === "h2")!;
    expect(heading.props).toMatchObject({ id: "ob-buddy-title", tabIndex: -1, children: "Choose your buddy" });
    expect(words(all(tree).find(element => element.type === "p")!.props.children)).toBe("It keeps you company in Doan and sets the app’s accent color. You can change it anytime in Settings.");
    expect(all(tree).find(element => element.props.role === "radiogroup")!.props["aria-labelledby"]).toBe("ob-buddy-title");
    expect(all(tree).some(element => element.props.className?.toString().includes("doan-notice"))).toBe(false);
    expect(all(tree).find(element => element.props.className === "ob-live")!.props.children).toBe("");
  });

  test("a failure: the panel notice under the row, read once by the live region; Retry saves the pick again and, when it saves, focuses the checked radio", async () => {
    const checked = { focus: vi.fn() };
    vi.stubGlobal("document", { querySelector: (selector: string) => selector === ".ob-overlay .buddy-flow" ? { querySelector: (inner: string) => inner === 'input[type="radio"]:checked' ? checked : null } : null });
    const select = vi.fn(async () => true);
    const tree = scene(selection({ failure: { picked: "popo", kept: "doany" }, select }));
    const order = all(tree).map(element => element.props.className ?? element.type);
    expect(order.indexOf("buddy-flow")).toBeLessThan(order.indexOf("doan-notice error doan-panel buddy-step-notice"));
    expect(all(tree).find(element => element.props.className === "ob-live")!.props).toMatchObject({ role: "status", children: "Couldn’t switch to Popo. Doany is still your buddy." });
    const retry = all(tree).find(element => element.type === "button" && element.props.children === "Retry")!;
    (retry.props.onClick as () => void)();
    // First run's Retry starts no lock: the buddy alone, no change time.
    expect(select.mock.calls).toEqual([["popo"]]);
    await vi.waitFor(() => expect(checked.focus).toHaveBeenCalled());
  });

  test("a Retry that fails again leaves focus on Retry", async () => {
    const checked = { focus: vi.fn() };
    vi.stubGlobal("document", { querySelector: () => ({ querySelector: () => checked }) });
    const select = vi.fn(async () => false);
    const tree = scene(selection({ failure: { picked: "popo", kept: "doany" }, select }));
    (all(tree).find(element => element.type === "button" && element.props.children === "Retry")!.props.onClick as () => void)();
    await Promise.resolve(); await Promise.resolve();
    expect(checked.focus).not.toHaveBeenCalled();
  });

  test("broken: Settings' broken notice above the row as a panel notice, and the row can be picked", () => {
    const tree = scene(selection(), snapshot("broken"));
    const notice = all(tree).find(element => element.props.role === "alert")!;
    expect(notice.props.className).toBe("doan-notice error doan-panel buddy-step-notice buddy-step-notice-top");
    expect(words(notice.props.children)).toBe("Doan couldn’t read its saved settings, so defaults apply.");
    const order = all(tree).map(element => element.props.role ?? element.props.className);
    expect(order.indexOf("alert")).toBeLessThan(order.indexOf("radiogroup"));
    expect(radios(tree).every(radio => radio.props.disabled === false)).toBe(true);
  });

  test("newer: Settings' newer notice above the row, and the row is off; no snapshot yet: off with no notice", () => {
    const newer = scene(selection(), snapshot("newer"));
    expect(all(newer).find(element => element.props.role === "status" && element.props.className !== "ob-live")!.props.className).toBe("doan-notice doan-panel buddy-step-notice buddy-step-notice-top");
    expect(radios(newer).every(radio => radio.props.disabled === true)).toBe(true);
    const unread = scene(selection(), null);
    expect(radios(unread).every(radio => radio.props.disabled === true)).toBe(true);
    expect(all(unread).some(element => String(element.props.className ?? "").includes("doan-notice"))).toBe(false);
  });

  test("the existing-user screen covers the window with no stepper and no Back: Continue saves the buddy on screen, then closes", async () => {
    const commit = vi.fn(async () => true);
    const onClose = vi.fn();
    const tree = BuddyIntro({ selection: selection({ commit }), preferences: snapshot(), onClose });
    const dialog = all(tree)[0]!;
    expect(dialog.type).toBe("dialog");
    expect(dialog.props).toMatchObject({ className: "ob-overlay", "aria-label": "Set up Doan" });
    expect(all(tree).some(element => element.props.className === "ob-steps")).toBe(false);
    const buttons = all(tree).filter(element => element.type === "button");
    expect(buttons.map(button => words(button.props.children))).toEqual(["Continue"]);
    expect(all(tree).find(element => element.props.className === "ob-footer ob-footer-intro")).toBeTruthy();
    (buttons[0]!.props.onClick as () => void)();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(commit).toHaveBeenCalled();
  });

  test("a Continue whose save fails keeps the screen", async () => {
    const commit = vi.fn(async () => false);
    const onClose = vi.fn();
    const tree = BuddyIntro({ selection: selection({ commit }), preferences: snapshot(), onClose });
    (all(tree).find(element => element.type === "button")!.props.onClick as () => void)();
    await vi.waitFor(() => expect(commit).toHaveBeenCalled());
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("picker CSS (buddy-choice draft)", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  test("the row's card, its 196px picture and the chosen card's ring and glow", () => {
    expect(css).toContain(".buddy-flow { position: relative; height: 340px; perspective: 1000px;");
    expect(css).toMatch(/\.buddy-card \{[^}]*width: 244px;[^}]*padding: var\(--space-5\) var\(--space-6\);/);
    expect(css).toContain(".buddy-card img { width: 196px; height: 196px;");
    expect(css).toContain(".buddy-card:has(input:checked) { box-shadow: 0 0 0 2px var(--text-accent),");
  });
  test("below a 780px window the step's gaps and the cards shrink, linear down to the 600px minimum", () => {
    const shrink = (from: number, to: number) => `clamp(${from}px, calc(${from}px + (100vh - 600px) * ${to - from} / 180), ${to}px)`;
    expect(css).toContain(`.ob-scene.ob-buddy-scene { padding-top: ${shrink(24, 40)}; padding-bottom: ${shrink(24, 48)}; }`);
    expect(css).toContain(`.ob-buddy-scene .ob-heading { margin-bottom: ${shrink(16, 32)}; }`);
    expect(css).toContain(`.ob-buddy-scene .ob-footer { padding-top: ${shrink(16, 32)}; }`);
    expect(css).toContain(`.buddy-flow { height: ${shrink(316, 340)}; }`);
    expect(css).toContain(`.buddy-card { width: ${shrink(220, 244)}; margin-left: calc(-1 * ${shrink(110, 122)}); }`);
    expect(css).toContain(`.buddy-card img { width: ${shrink(172, 196)}; height: ${shrink(172, 196)}; }`);
  });
  test("the focus ring sits outside the accent ring; forced colours outline the chosen card; reduced motion jumps", () => {
    expect(css).toContain(".buddy-card:has(input:focus-visible) { outline: 2px solid var(--border-focus); outline-offset: 2px; }");
    expect(css).toContain("@media (forced-colors: active) { .buddy-card:has(input:checked) { outline: 2px solid Highlight; } }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .buddy-card { transition: none; } }");
    expect(css).toContain(".buddy-flow[data-scrolling] .buddy-card { transition: none; }");
  });
  test("a notice in the picker's places only adds margins, never type or padding (POSTMORTEM 2026-11-09)", () => {
    for (const name of ["buddy-step-notice", "buddy-step-notice-top", "buddy-notice"]) {
      expect(css).not.toMatch(new RegExp(`(^|\\n)\\.${name} \\{[^}]*(font|padding)`));
    }
  });
});
