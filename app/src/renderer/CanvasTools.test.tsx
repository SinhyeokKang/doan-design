import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-canvas design §2 '도구모음': one Tab stop, the Select picker shown pressed, and pressing it changes nothing.
const markup = () => renderToStaticMarkup(<TooltipProvider><CanvasTools /></TooltipProvider>);

// Walks the element tree through children only, so no component (and no Radix hook) runs.
function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const own = node.type === "button" ? [node] : [];
  const children = node.props.children as ReactNode;
  return [...own, ...(Array.isArray(children) ? children : [children]).flatMap(buttons)];
}

describe("CanvasTools", () => {
  it("is a named toolbar holding the Select picker, pressed", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Select"/);
  });

  it("has one Tab stop", () => {
    expect(markup().match(/tabindex="0"/g)).toHaveLength(1);
  });

  it("does not toggle when pressed: the picker has no press handler", () => {
    const [picker] = buttons(CanvasTools());
    expect(picker?.props["aria-pressed"]).toBe(true);
    expect(picker?.props.onClick).toBeUndefined();
  });
});
