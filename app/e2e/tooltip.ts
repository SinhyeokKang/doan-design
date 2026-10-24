import type { Locator, Page } from "playwright";

// A closed tooltip can retain Radix's pointer-entry latch until pointerleave.
// Clear both that latch and any preceding content before one deliberate entry.
export async function hoverTooltip(page: Page, trigger: Locator): Promise<Locator> {
  const tooltip = page.getByRole("tooltip");
  await page.mouse.move(700, 20);
  if (await tooltip.isVisible()) await page.keyboard.press("Escape");
  await tooltip.waitFor({ state: "hidden", timeout: 1000 });
  await trigger.hover();
  await tooltip.waitFor({ timeout: 1000 });
  return tooltip;
}

