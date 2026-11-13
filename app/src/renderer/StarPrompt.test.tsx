import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The star card with hooks as plain state (UpdateHeaderButton.interaction.test.tsx style): main's moment, the 1.2 s
// wait for no input, the put-off checks, the buttons and Esc. The view's markup is rendered on its own below.
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
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});
const { StarPrompt, StarPromptView, STAR_TEXT, starOpenFailedLine } = await import("./StarPrompt");
const { REPOSITORY_URL } = await import("../main/repository");
type ViewProps = import("./StarPrompt").StarPromptViewProps;

let doan: Record<string, ReturnType<typeof vi.fn>>;
let moment: (value: { second: boolean }) => void;
let visible: (value: boolean) => void;
let stopMoment: ReturnType<typeof vi.fn>, stopVisible: ReturnType<typeof vi.fn>;
let busy: boolean;
let focused: boolean;
let overlay: unknown;
const listeners = new Map<string, (event: unknown) => void>();
beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 13, 12) });
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  listeners.clear();
  busy = false; focused = true; overlay = null;
  stopMoment = vi.fn(); stopVisible = vi.fn();
  doan = {
    onStarMoment: vi.fn((listener: typeof moment) => { moment = listener; return stopMoment; }),
    onWindowVisible: vi.fn((listener: typeof visible) => { visible = listener; return stopVisible; }),
    starPromptBusy: vi.fn(async () => busy),
    openStarRepository: vi.fn(async () => true),
    dismissStarPrompt: vi.fn(async () => undefined),
  };
  vi.stubGlobal("window", {
    doan,
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string, listener: (event: unknown) => void) => { if (listeners.get(type) === listener) listeners.delete(type); }),
  });
  vi.stubGlobal("document", { hidden: false, hasFocus: () => focused, querySelector: vi.fn(() => overlay), activeElement: null, body: {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

let onboarding = false, pickOrCapture = false;
beforeEach(() => { onboarding = false; pickOrCapture = false; });
function render(): ViewProps {
  let view: ReactElement<ViewProps> | null = null;
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    view = StarPrompt({ onboarding, pickOrCapture }) as ReactElement<ViewProps>;
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return view!.props;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
// Main's moment, then time with no input; the card's put-off checks run when the wait ends.
async function wait(ms: number) { vi.advanceTimersByTime(ms); await flush(); return render(); }
async function shown(second = false) {
  render(); visible(true);
  moment({ second });
  const view = await wait(1200);
  if (view.card === null) throw new Error("the card did not show");
  return view;
}

test("subscribes to main's moment and the window's visibility once, shows nothing before a moment, and unsubscribes", () => {
  expect(render().card).toBeNull();
  render();
  expect(doan.onStarMoment).toHaveBeenCalledOnce();
  expect(doan.onWindowVisible).toHaveBeenCalledOnce();
  for (const effect of hooks.effects) effect?.cleanup?.();
  expect(stopMoment).toHaveBeenCalledOnce();
  expect(stopVisible).toHaveBeenCalledOnce();
});

test("1.2 s with no key or pointer input after main's moment shows the first card, asking main once whether a conversation is busy", async () => {
  render(); visible(true);
  moment({ second: false });
  expect((await wait(1199)).card).toBeNull();
  expect(doan.starPromptBusy).not.toHaveBeenCalled();
  const view = await wait(1);
  expect(doan.starPromptBusy).toHaveBeenCalledOnce();
  expect(view.card).toMatchObject({ second: false, failed: false, closing: false });
  // The wait is over: its input listeners are gone.
  expect(listeners.size).toBe(0);
});

test.each(["keydown", "pointerdown", "pointermove", "wheel"])("a %s during the wait starts the 1.2 s again", async type => {
  render(); visible(true);
  moment({ second: false });
  await wait(1000);
  listeners.get(type)!({ type });
  expect((await wait(1199)).card).toBeNull();
  expect((await wait(1)).card).not.toBeNull();
});

describe("puts the card off until main's next moment", () => {
  test.each<[string, () => void]>([
    ["an open modal, popover or menu", () => { overlay = {}; }],
    ["another conversation running or waiting for an answer", () => { busy = true; }],
    ["a window behind another app", () => { focused = false; }],
    ["a hidden window", () => { visible(false); }],
    ["first run", () => { onboarding = true; }],
    ["a canvas pick or Capture area", () => { pickOrCapture = true; }],
  ])("%s", async (_name, put) => {
    render(); visible(true);
    put(); render();
    moment({ second: false });
    expect((await wait(1200)).card).toBeNull();
    expect((await wait(10_000)).card).toBeNull();
    overlay = null; busy = false; focused = true; visible(true); onboarding = false; pickOrCapture = false; render();
    moment({ second: false });
    expect((await wait(1200)).card).not.toBeNull();
  });

  test("the overlays it looks for are dialogs, Radix popovers and menus", async () => {
    render(); visible(true);
    moment({ second: false });
    await wait(1200);
    expect(vi.mocked(document.querySelector).mock.calls.map(call => call[0])).toContain('dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog), [role="menu"], [role="listbox"]');
  });
});

test("a moment while waiting, or while the card shows, is ignored", async () => {
  render(); visible(true);
  moment({ second: false });
  await wait(600);
  moment({ second: true });
  const view = await wait(600);
  expect(doan.starPromptBusy).toHaveBeenCalledOnce();
  expect(view.card).toMatchObject({ second: false });
  moment({ second: true });
  expect((await wait(1200)).card).toMatchObject({ second: false });
  expect(doan.starPromptBusy).toHaveBeenCalledOnce();
});

test("the second card is main's to name", async () => {
  expect((await shown(true)).card).toMatchObject({ second: true });
});

// The words are read once as the card appears: the live region is empty when it is added and filled after, as a region
// added with its text already in it is not read.
test("the live region is empty when the card appears and then holds the words once", async () => {
  render(); visible(true);
  moment({ second: false });
  vi.advanceTimersByTime(1200); await flush();
  expect(render().card).toMatchObject({ said: false });
  expect((await wait(100)).card).toMatchObject({ said: true });
});

describe("Star on GitHub ↗", () => {
  test("opens main's repository page once however often it is pressed, then the card leaves", async () => {
    let answer: (opened: boolean) => void = () => {};
    doan.openStarRepository!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    const view = await shown();
    view.onOpen(); view.onOpen(); render().onOpen();
    expect(doan.openStarRepository).toHaveBeenCalledOnce();
    expect(doan.openStarRepository).toHaveBeenCalledWith();
    answer(true); await flush();
    expect(render().card).toMatchObject({ closing: true });
    expect(doan.dismissStarPrompt).not.toHaveBeenCalled();
    expect((await wait(119)).card).not.toBeNull();
    expect((await wait(1)).card).toBeNull();
  });

  test("a browser that did not open keeps the card with the failure line, read once; pressing again is the retry", async () => {
    doan.openStarRepository!.mockResolvedValueOnce(false);
    (await shown()).onOpen(); await flush();
    let view = render();
    expect(view.card).toMatchObject({ failed: true, closing: false });
    doan.openStarRepository!.mockResolvedValueOnce(false);
    view.onOpen(); await flush();
    view = render();
    expect(view.card).toMatchObject({ failed: true, closing: false });
    view.onOpen(); await flush();
    expect(render().card).toMatchObject({ closing: true });
    expect(doan.openStarRepository).toHaveBeenCalledTimes(3);
  });

  // main would record the dismissal first and then ignore the open as no longer due, asking again someone who opened it.
  test("the dismiss button and Esc do nothing while the browser is opening", async () => {
    let answer: (opened: boolean) => void = () => {};
    doan.openStarRepository!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    const view = await shown();
    view.onOpen();
    render().onDismiss();
    render().onKeyDown({ key: "Escape", defaultPrevented: false, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(doan.dismissStarPrompt).not.toHaveBeenCalled();
    expect(render().card).toMatchObject({ closing: false });
    answer(true); await flush();
    expect(render().card).toMatchObject({ closing: true });
    expect(doan.dismissStarPrompt).not.toHaveBeenCalled();
  });

  test("a refused call is a browser that did not open", async () => {
    doan.openStarRepository!.mockRejectedValueOnce(new Error("refused"));
    (await shown()).onOpen(); await flush();
    expect(render().card).toMatchObject({ failed: true, closing: false });
  });
});

test.each([false, true])("the dismiss button tells main and the card leaves (second card: %s)", async second => {
  const view = await shown(second);
  view.onDismiss();
  expect(doan.dismissStarPrompt).toHaveBeenCalledExactlyOnceWith();
  expect(render().card).toMatchObject({ closing: true });
  render().onDismiss();
  expect(doan.dismissStarPrompt).toHaveBeenCalledOnce();
  expect((await wait(120)).card).toBeNull();
});

describe("Esc", () => {
  const key = (name: string, over: Partial<{ defaultPrevented: boolean; isComposing: boolean }> = {}) =>
    ({ key: name, defaultPrevented: false, isComposing: false, ...over, preventDefault: vi.fn(), stopPropagation: vi.fn() });

  test("with focus in the card it is the dismiss button, and goes no further", async () => {
    const event = key("Escape");
    (await shown()).onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(doan.dismissStarPrompt).toHaveBeenCalledOnce();
  });

  test("another key, or an Esc something else already took, leaves the card", async () => {
    const view = await shown();
    for (const event of [key("Enter"), key("Escape", { defaultPrevented: true }), key("Escape", { isComposing: true })]) {
      view.onKeyDown(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(doan.dismissStarPrompt).not.toHaveBeenCalled();
    expect(render().card).toMatchObject({ closing: false });
  });
});

describe("the view", () => {
  const props = (card: ViewProps["card"]): ViewProps => ({ card, onOpen: vi.fn(), onDismiss: vi.fn(), onKeyDown: vi.fn(), onFocus: vi.fn(), buttonRef: vi.fn() });
  const card = { second: false, failed: false, said: true, closing: false };

  test("draws nothing without a card", () => {
    expect(renderToStaticMarkup(<StarPromptView {...props(null)} />)).toBe("");
  });

  test("a named region with the words, read through its own live region, over two stacked small buttons", () => {
    const html = renderToStaticMarkup(<StarPromptView {...props(card)} />);
    expect(STAR_TEXT).toBe("Find Doan useful? It’s open source on GitHub.");
    expect(html).toBe(`<div class="star-prompt doan-floating" role="region" aria-label="Doan on GitHub"><p class="star-prompt-text" aria-hidden="true">${STAR_TEXT}</p>`
      + `<p class="sr-only" role="status">${STAR_TEXT}</p><div class="star-prompt-actions">`
      + `<button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm">Star on GitHub ↗</button>`
      + `<button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Not now</button></div></div>`);
  });

  test("the second card's dismiss button is Don’t ask again", () => {
    expect(renderToStaticMarkup(<StarPromptView {...props({ ...card, second: true })} />)).toContain(">Don’t ask again</button>");
  });

  test("the live region is empty until the card has appeared", () => {
    expect(renderToStaticMarkup(<StarPromptView {...props({ ...card, said: false })} />)).toContain(`<p class="sr-only" role="status"></p>`);
  });

  test("a browser that did not open adds About's failure line, with the address as selectable text, between the words and the buttons", () => {
    expect(starOpenFailedLine).toBe(`Couldn’t open GitHub in your browser. Try again, or find Doan at ${REPOSITORY_URL}`);
    const html = renderToStaticMarkup(<StarPromptView {...props({ ...card, failed: true })} />);
    expect(html).toMatch(new RegExp(`<p class="sr-only" role="status">${starOpenFailedLine}</p><p class="settings-msg error selectable star-prompt-failure"><svg[^>]*class="[^"]*doan-alert-icon"[^>]*>.*</svg>`
      + `<span>Couldn’t open GitHub in your browser. Try again, or find Doan at <span class="star-prompt-url">${REPOSITORY_URL}</span></span></p><div class="star-prompt-actions">`));
  });

  test("a leaving card is closing and inert", () => {
    expect(renderToStaticMarkup(<StarPromptView {...props({ ...card, closing: true })} />)).toMatch(/^<div class="star-prompt doan-floating" role="region" aria-label="Doan on GitHub" data-closing="" inert="">/);
  });
});

describe("styles", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = css.match(new RegExp(`(?:^|\\n|})\\s*${escaped}\\s*\\{([^}]*)\\}`));
    if (!found) throw new Error(`no rule ${selector}`);
    return found[1]!.replace(/\s+/g, " ").trim();
  };

  test("the card sits at the window's bottom left, 16 from both edges, 240 wide, on the toast's layer, opaque with no blur", () => {
    expect(rule(".star-prompt")).toBe("position: absolute; left: var(--space-4); bottom: var(--space-4); z-index: 6; display: grid; gap: var(--space-3); width: 240px; padding: var(--space-3); background: var(--surface-popover); -webkit-backdrop-filter: none; backdrop-filter: none; overflow-wrap: anywhere;");
    expect(rule(".star-prompt-text")).toBe("font-size: var(--type-body-sm-size); line-height: var(--type-body-sm-line-height); letter-spacing: var(--type-body-sm-letter-spacing);");
    expect(rule(".star-prompt-actions")).toBe("display: grid; gap: var(--space-2);");
  });

  test("the card and the toast float with --shadow-floating, enter rising 8px over --time-settle and leave dropping 4px over --time-fast", () => {
    expect(rule(".star-prompt.doan-floating, .toast.doan-floating")).toBe("box-shadow: var(--shadow-floating); transition: opacity var(--time-settle) var(--ease-enter), translate var(--time-settle) var(--ease-enter);");
    expect(css).toMatch(/@starting-style \{\s*\.star-prompt\.doan-floating, \.toast\.doan-floating \{ opacity: 0; translate: 0 var\(--space-2\); \}\s*\}/);
    expect(rule(".star-prompt.doan-floating[data-closing], .toast.doan-floating[data-closing]")).toBe("opacity: 0; translate: 0 var(--space-1); transition-duration: var(--time-fast); transition-timing-function: var(--ease-state);");
  });

  test("Reduce motion keeps only the fades", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .star-prompt.doan-floating"));
    expect(reduced).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{\s*\.star-prompt\.doan-floating, \.toast\.doan-floating \{ transition: opacity var\(--time-settle\) var\(--ease-enter\); \}\s*\.star-prompt\.doan-floating\[data-closing\], \.toast\.doan-floating\[data-closing\] \{ translate: none; \}\s*@starting-style \{\s*\.star-prompt\.doan-floating, \.toast\.doan-floating \{ translate: none; \}\s*\}\s*\}/);
  });

  test("a capture snapshot hides the card as it hides toasts, at once", () => {
    expect(css).toMatch(/\[data-capture-snapshot\] :is\([^)]*\.toast, \.star-prompt,[^)]*\) \{ opacity: 0 !important; \}/);
    expect(rule("[data-capture-snapshot] :is(.toast, .star-prompt)")).toBe("transition: none !important;");
  });
});
