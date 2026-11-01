import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-canvas design §2 '도구모음': one Tab stop, the Select picker shown pressed, and pressing it changes nothing.
const ADD = { enabled: true, reason: null, onAdd: () => {} };
const markup = (add: Parameters<typeof CanvasTools>[0]["add"] = ADD) => renderToStaticMarkup(<TooltipProvider><CanvasTools add={add} /></TooltipProvider>);

// Walks the element tree through children only, so no component (and no Radix hook) runs.
function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const own = node.type === "button" ? [node] : [];
  const children = node.props.children as ReactNode;
  return [...own, ...(Array.isArray(children) ? children : [children]).flatMap(buttons)];
}

describe("CanvasTools", () => {
  it("is a named toolbar holding the Select picker, pressed, then Add to conversation", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Select"/);
    expect(html.indexOf('aria-label="Select"')).toBeLessThan(html.indexOf('aria-label="Add to conversation"'));
  });

  it("has one Tab stop", () => {
    expect(markup().match(/tabindex="0"/g)).toHaveLength(1);
  });

  it("does not toggle when pressed: the picker has no press handler", () => {
    const [picker] = buttons(CanvasTools({ add: ADD }));
    expect(picker?.props["aria-pressed"]).toBe(true);
    expect(picker?.props.onClick).toBeUndefined();
  });

  // buzz-canvas-conversation design §2 'Add to conversation': aria-disabled, not disabled, so the tooltip says why.
  it("adds the selection when it can, and otherwise stays focusable and does nothing", () => {
    let added = 0;
    const tool = (add: Parameters<typeof CanvasTools>[0]["add"]) => buttons(CanvasTools({ add }))[1]!;
    (tool({ enabled: true, reason: null, onAdd: () => added++ }).props.onClick as () => void)();
    expect(added).toBe(1);
    const off = tool({ enabled: false, reason: "Pick from canvas isn’t available while the canvas can’t be shown.", onAdd: () => added++ });
    (off.props.onClick as () => void)();
    expect(added).toBe(1);
    expect(off.props["aria-disabled"]).toBe(true);
    expect(off.props.disabled).toBeUndefined();
    expect(off.props.tabIndex).toBe(-1);
  });

  it("explains an unavailable tool in its tooltip, and names itself otherwise", () => {
    const reason = "Pick from canvas isn’t available while the canvas can’t be shown.";
    expect(markup({ enabled: false, reason, onAdd: () => {} })).toMatch(/aria-label="Add to conversation" aria-disabled="true"/);
    expect(markup({ enabled: false, reason: null, onAdd: () => {} })).toMatch(/aria-label="Add to conversation" aria-disabled="true"/);
  });
});
