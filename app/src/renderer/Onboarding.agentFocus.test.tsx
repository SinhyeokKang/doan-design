import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// A sign-in finished in the browser lands while the window is in the background; the Agent step's focus hand-offs
// are made again when the window activates (POSTMORTEM 2026-11-17). Driven with hooks as plain state.
const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], refCursor: 0, effectCursor: 0,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: (run: () => unknown, deps?: unknown[]) => {
      const index = hooks.effectCursor++, previous = hooks.effects[index];
      if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
      const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
      hooks.effects[index] = slot;
      hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
    },
  };
});

const { AgentStep, AgentFooter } = await import("./Onboarding");

type Step = Parameters<typeof AgentStep>[0];
let focused: string[];
let session: Record<string, unknown> & { state: Record<string, unknown> };
let tree: ReactNode;
let win: EventTarget;
const BODY = { name: "body" };
let page: { activeElement: unknown; body: unknown; hasFocus(): boolean; querySelector(selector: string): unknown; querySelectorAll(selector: string): unknown[] };

function control(name: string) {
  return Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { name, isConnected: true, focus: () => focused.push(name), matches: () => false });
}
const heading = () => control("heading"), continueButton = () => control("continue");

beforeEach(() => {
  hooks.refs = []; hooks.effects = []; hooks.pending = [];
  focused = [];
  session = {
    state: { dialog: null, focus: null, announcement: null, continuing: false, auth: null, contexts: {} },
    enter: vi.fn(), view: () => ({ anyReady: false, notice: null, providers: [] }), stopView: () => null, pasteView: () => null,
    canContinue: () => true, command: vi.fn(async () => {}),
  };
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  page = { activeElement: BODY, body: BODY, hasFocus: () => true, querySelector: () => null, querySelectorAll: () => [] };
  vi.stubGlobal("document", page);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
// Renders AgentStep, attaches the heading and Continue as React would, then runs its effects.
function render() {
  hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = AgentStep({ session: session as unknown as Step["session"], heading: () => {}, back: () => {}, next: () => {} });
  (all(tree).find(element => element.type === "h2")!.ref as unknown as (node: unknown) => void)(heading());
  (all(tree).find(element => element.type === AgentFooter)!.props.continueRef as (node: unknown) => void)(continueButton());
  for (const run of hooks.pending) run();
}
function activate() { win.dispatchEvent(new Event("focus")); vi.runAllTimers(); }

test("Continue focused for a sign-in that finished with the window in the background is focused again on activation", () => {
  render();
  page.hasFocus = () => false;
  session.state = { ...session.state, focus: { target: "continue", seq: 1 } };
  render();
  expect(focused).toEqual(["continue"]);
  focused = [];
  activate();
  expect(focused).toEqual(["continue", "continue"]);
});

test("a used control that a background sign-in removed hands focus on again on activation", () => {
  // The row keeps nothing usable while the browser holds the sign-in, so focus goes to the step heading.
  session.view = () => ({ anyReady: false, notice: null, providers: [{ provider: "claude", button: { command: "signIn", label: "Sign in", variant: "prominent", disabled: true }, notice: null, paste: null }] });
  render();
  const signIn = control("signIn");
  page.activeElement = signIn;
  (all(tree).find(element => element.props.view !== undefined && (element.props.view as { provider?: string }).provider === "claude")!.props.run as (command: string) => void)("signIn");
  Object.assign(signIn, { isConnected: false });
  page.activeElement = BODY;
  page.hasFocus = () => false;
  render();
  expect(focused).toEqual(["heading"]);
  focused = [];
  activate();
  expect(focused).toEqual(["heading", "heading"]);
});
