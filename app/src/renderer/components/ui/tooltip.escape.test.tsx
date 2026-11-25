import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// The content as drawn, with the Esc handler it hands Radix.
const seen = vi.hoisted(() => [] as { onEscapeKeyDown?: (event: unknown) => void }[]);
vi.mock("radix-ui", async original => {
  const actual = await original<typeof import("radix-ui")>();
  return { ...actual, Tooltip: { ...actual.Tooltip, Portal: ({ children }: { children: unknown }) => children, Content: (props: { onEscapeKeyDown?: (event: unknown) => void }) => { seen.push(props); return null; } } };
});
const { Tooltip, TooltipContent, TooltipEscape, TooltipProvider, TooltipTrigger } = await import("./tooltip");

// An open tooltip over a menu, popover list or modal dialog row is the top dismissable layer, so Radix gives it the first Esc
// (POSTMORTEM 2026-11-07). Inside a TooltipEscape host that Esc closes the host too; the tooltip's own handler still wins.
test("inside a TooltipEscape host, a tooltip's Esc closes the host; its own handler wins; outside one nothing is added", () => {
  const host = { closed: 0 }, own = { called: 0 };
  const draw = (content: ReturnType<typeof createElement>, wrap: boolean) => renderToStaticMarkup(createElement(TooltipProvider, null,
    createElement(Tooltip, { open: true }, createElement(TooltipTrigger, null, "x"),
      wrap ? createElement(TooltipEscape, { value: () => { host.closed++; } }, content) : content)));
  draw(createElement(TooltipContent, null, "Name"), true);
  seen.at(-1)!.onEscapeKeyDown?.({ preventDefault() {} });
  expect(host.closed).toBe(1);
  draw(createElement(TooltipContent, { onEscapeKeyDown: () => { own.called++; } }, "Name"), true);
  seen.at(-1)!.onEscapeKeyDown?.({ preventDefault() {} });
  expect([host.closed, own.called]).toEqual([1, 1]);
  draw(createElement(TooltipContent, null, "Name"), false);
  expect(seen.at(-1)!.onEscapeKeyDown).toBeUndefined();
});
