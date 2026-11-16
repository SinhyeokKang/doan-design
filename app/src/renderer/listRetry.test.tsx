import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "radix-ui";
import { expect, test, vi } from "vitest";
import { announcedAgain, LIST_RETRY_IDLE } from "./listRetry";
import { listRetryButton, listRetryItem } from "./ListRetryButton";

// A failed conversation-list read's Retry, in a notice, the right panel and the title menus: DESIGN 'Busy action'
// while its read runs, and the same failure read out again when it fails again.

test("each failed Retry changes the line by a no-break space, so its live region reads the same sentence again", () => {
  const text = "Couldn’t read conversations";
  // No failed Retry yet: the plain line.
  expect(announcedAgain(text, 0)).toBe(text);
  expect(announcedAgain(text, 1)).toBe(`${text}\u00a0`);
  expect(announcedAgain(text, 2)).toBe(text);
  expect(announcedAgain(text, 3)).toBe(`${text}\u00a0`);
  expect(LIST_RETRY_IDLE).toEqual({ running: false, failures: 0 });
});

test("an idle Retry is the plain button and runs the read", () => {
  const onRetry = vi.fn();
  const button = listRetryButton(LIST_RETRY_IDLE, "panel", onRetry);
  expect(renderToStaticMarkup(button)).toBe('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Retry</button>');
  button.props.onClick();
  expect(onRetry).toHaveBeenCalledOnce();
});

test("a running Retry keeps its fill, its label and focus, shows the spinner and ignores presses", () => {
  const onRetry = vi.fn();
  const button = listRetryButton({ running: true, failures: 0 }, "subtle", onRetry);
  const html = renderToStaticMarkup(button);
  expect(html).toContain('data-ui-variant="subtle"');
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toMatch(/ disabled=""/);
  expect(html).toMatch(/<span class="doan-spinner" aria-hidden="true"><\/span>Retry<\/button>$/);
  button.props.onClick();
  expect(onRetry).not.toHaveBeenCalled();
});

test("the title menu's Retry row stays a highlightable item while it runs: aria-disabled and aria-busy, never Radix disabled", () => {
  const onRetry = vi.fn();
  const running = listRetryItem({ running: true, failures: 0 }, onRetry);
  expect(running.type).toBe(DropdownMenu.Item);
  expect(running.props).toMatchObject({ className: "doan-menu-item", "aria-disabled": true, "aria-busy": true });
  expect(running.props.disabled).toBeUndefined();
  const event = { preventDefault: vi.fn() };
  running.props.onSelect(event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(onRetry).not.toHaveBeenCalled();
  const idle = listRetryItem(LIST_RETRY_IDLE, onRetry);
  expect(idle.props["aria-busy"]).toBeUndefined();
  idle.props.onSelect({ preventDefault: vi.fn() });
  expect(onRetry).toHaveBeenCalledOnce();
});
