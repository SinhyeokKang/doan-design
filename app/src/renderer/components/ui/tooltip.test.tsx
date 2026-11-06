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
