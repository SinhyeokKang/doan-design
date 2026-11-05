import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { ContextRing } from "./ContextRing";

// context-window-ring spec 6 and design §3 (draft frame ring-tooltip). Static markup draws no portalled tooltip, so
// the element tree is read instead; hover, Escape and re-hover in the real app are left to /design-sync.
type Props = { children?: ReactNode; [key: string]: unknown };
function find(node: ReactNode, type: unknown): Props | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue;
    if (child.type === type) return child.props;
    const inner = find(child.props.children, type);
    if (inner) return inner;
  }
  return null;
}
const text = (node: ReactNode): string[] => Children.toArray(node).flatMap(child =>
  typeof child === "string" ? [child] : isValidElement<Props>(child) ? [text(child.props.children).join("")] : []);

test("the tooltip opens on the ring, a span outside Tab order, with the name then the token counts on two lines", () => {
  const ring = ContextRing({ usage: { value: 42, percent: 42, used: 84_000, size: 200_000 } });
  const trigger = find(ring, TooltipTrigger)!;
  expect(trigger.asChild).toBe(true);
  const markup = renderToStaticMarkup(Children.only(trigger.children) as ReactElement);
  expect(markup).toMatch(/^<span class="context-ring" role="img"/);
  expect(markup).not.toContain("tabindex");
  const content = find(ring, TooltipContent)!;
  // The shared tooltip's default: 4 above the ring (decision 14).
  expect(content.side ?? "top").toBe("top");
  expect(content.sideOffset).toBeUndefined();
  expect(text(content.children)).toEqual(["Context window 42% used · last turn", "84K of 200K tokens"]);
});
