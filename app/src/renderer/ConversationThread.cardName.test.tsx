import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CanvasCard } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";

// Run the canvas card's name hooks against a stubbed layout, as the renderer interaction tests do.
const hooks = vi.hoisted(() => ({
  active: false,
  keep: null as number | null,
  title: { current: null as unknown },
  effect: undefined as (() => void | (() => void)) | undefined,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useRef: (initial: unknown) => hooks.active ? hooks.title : actual.useRef(initial),
    useState: (initial: unknown) => hooks.active ? [hooks.keep, (next: number | null) => { hooks.keep = next; }] : actual.useState(initial),
    useLayoutEffect: (run: () => void | (() => void), deps: unknown[]) => {
      if (hooks.active) hooks.effect = run;
      else actual.useLayoutEffect(run, deps);
    },
  };
});

function findCardText(node: ReactNode): ReactNode[] {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) continue;
    if (child.props.className === "cc-text") return Children.toArray(child.props.children);
    const found = findCardText(child.props.children);
    if (found.length) return found;
  }
  return [];
}

test("a canvas card keeps a fitting fractional-width name whole and cuts it only after it overflows", () => {
  const name = "checkout-flow.html";
  const card = CanvasCard({
    entry: { kind: "canvasCard", key: "card", canvas: { path: `.doan/canvases/${name}` }, drawing: false, drawn: true },
    context: { rows: [], thumbnails: new Map(), now: 0, root: "/repo" },
    project: "demo",
    provider: "claude",
    canvasListed: () => true,
  });
  const [nameElement] = findCardText(card);
  if (!isValidElement(nameElement) || typeof nameElement.type !== "function") throw new Error("Missing card name component");
  const draw = () => {
    hooks.active = true;
    try {
      return (nameElement.type as (props: unknown) => ReactNode)(nameElement.props);
    } finally {
      hooks.active = false;
    }
  };

  let available = 108.75;
  let resized: (() => void) | undefined;
  class Label {
    getBoundingClientRect() { return { left: 20 }; }
  }
  hooks.title.current = {
    lastElementChild: new Label(),
    getBoundingClientRect: () => ({ right: 20 + available }),
  };
  vi.stubGlobal("HTMLElement", Label);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("getComputedStyle", () => ({ font: "500 12px sans-serif", letterSpacing: "normal" }));
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => ({ measureText: (text: string) => ({ width: text.length * 6 + 0.25 }) }) }),
  });

  draw();
  const disconnect = hooks.effect?.();
  try {
    resized!();
    const fitting = renderToStaticMarkup(<TooltipProvider>{draw()}</TooltipProvider>);
    expect(fitting).toContain(`class="cc-name">${name}</span>`);
    expect(fitting).not.toContain('data-slot="tooltip-trigger"');

    available = 96.75;
    resized!();
    const cut = draw();
    const overflow = renderToStaticMarkup(<TooltipProvider>{cut}</TooltipProvider>);
    expect(overflow).toMatch(/class="cc-name"[^>]*data-slot="tooltip-trigger"[^>]*>[^<]*…[^<]*\.html<\/span>/u);
    const tooltip = Children.toArray((cut as { props: { children: ReactNode } }).props.children)[1];
    expect(tooltip).toMatchObject({ props: { children: [expect.anything(), { props: { children: name } }] } });
  } finally {
    disconnect?.();
    vi.unstubAllGlobals();
  }
});
