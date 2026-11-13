import { expect, test } from "vitest";
import { TooltipProvider } from "./tooltip";

// Tooltips wait before the first one opens so passing over controls does not flash labels; moving on to the next
// control within the skip window opens its tooltip at once. Content is not hoverable: the pointer leaving the trigger
// closes the tooltip even when it heads for the capsule.
test("the tooltip provider waits 700ms, skips the wait within 300ms and keeps no hoverable content", () => {
  const element = TooltipProvider({ children: null });
  expect(element.props).toMatchObject({ delayDuration: 700, skipDelayDuration: 300, disableHoverableContent: true });
});

test("a caller can still override the provider's timing", () => {
  const element = TooltipProvider({ children: null, delayDuration: 0 });
  expect(element.props).toMatchObject({ delayDuration: 0, skipDelayDuration: 300, disableHoverableContent: true });
});

// A control that turns unavailable while focused (Play prototype losing its frame's mark) must stay the same element:
// a different component between the trigger and the control would make React mount a new button and drop focus.
test("an asChild trigger keeps one tree whether its control is available or not", async () => {
  const { createElement } = await import("react");
  const { TooltipTrigger } = await import("./tooltip");
  const layer = (control: ReturnType<typeof createElement>) => (TooltipTrigger({ asChild: true, children: control }).props as { children: { type: unknown; props: { own: boolean } } }).children;
  const available = layer(createElement("button", { "aria-label": "Play prototype" }));
  const unavailable = layer(createElement("button", { "aria-label": "Play prototype", "aria-disabled": true, "aria-describedby": "canvas-play-reason" }));
  expect(unavailable.type).toBe(available.type);
  expect([available.props.own, unavailable.props.own]).toEqual([false, true]);
});
