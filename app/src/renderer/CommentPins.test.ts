import { afterEach, expect, it, vi } from "vitest";
import { CommentPins } from "./CommentPins";
afterEach(() => vi.unstubAllGlobals());
it("keeps focus during geometry updates and falls back only when the focused node disappears", () => {
  const buttons: (EventTarget & { style: Record<string, string>; remove: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; textContent: string })[] = [];
  const document = { activeElement: null as unknown, createElement: () => {
    const button = Object.assign(new EventTarget(), { style: {}, remove: vi.fn(), setAttribute: vi.fn(), textContent: "" }); buttons.push(button); return button;
  } };
  vi.stubGlobal("document", document);
  const activate = vi.fn(), fallback = vi.fn(), append = vi.fn();
  const layer = new CommentPins({ append }, activate, fallback);
  layer.render([{ node: "same", comments: ["a", "b"], x: 30, y: 40 }, { node: "child", comments: ["c"], x: 30, y: 40 }]);
  expect(buttons).toHaveLength(2);
  expect(buttons[0]?.style.height).toBe("24px");
  document.activeElement = buttons[0];
  layer.render([{ node: "same", comments: ["a"], x: 300, y: 400 }]);
  expect(buttons).toHaveLength(2);
  expect(fallback).not.toHaveBeenCalled();
  expect(buttons[0]?.style.left).toBe("300px");
  buttons[0]?.dispatchEvent(new Event("click"));
  expect(activate).toHaveBeenCalledWith("same");
  layer.render([]);
  expect(fallback).toHaveBeenCalledOnce();
});
