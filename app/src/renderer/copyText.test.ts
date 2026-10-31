import { afterEach, expect, test, vi } from "vitest";
import { copyText } from "./copyText";

// buzz-project design §8: main denies every permission check, so the thread's Copy writes through the document's own
// copy command. Review RM r1 ⚪(d): no element takes focus or selection for it, so the person's field (an IME
// composition may be in it) is never blurred; the copy event's clipboard data carries the text instead.

type Listener = (event: { clipboardData: { setData(type: string, value: string): void } | null; preventDefault(): void }) => void;
let listeners: Map<string, Listener>;
let written: Record<string, string>;
let prevented: boolean;
function stub(exec: () => boolean, clipboard = true) {
  listeners = new Map(); written = {}; prevented = false;
  const field = { focus: vi.fn(), blur: vi.fn() };
  const doc = {
    activeElement: field,
    addEventListener: vi.fn((name: string, listener: Listener) => { listeners.set(name, listener); }),
    removeEventListener: vi.fn((name: string, listener: Listener) => { if (listeners.get(name) === listener) listeners.delete(name); }),
    createElement: vi.fn(),
    execCommand: vi.fn((command: string) => {
      if (command === "copy") listeners.get("copy")?.({ clipboardData: clipboard ? { setData: (type, value) => { written[type] = value; } } : null, preventDefault: () => { prevented = true; } });
      return exec();
    }),
  };
  vi.stubGlobal("document", doc);
  return { doc, field };
}
afterEach(() => vi.unstubAllGlobals());

test("the copy event carries the text, and no element is created, focused or blurred", () => {
  const { doc, field } = stub(() => true);
  expect(copyText("npm run build")).toBe(true);
  expect(written).toEqual({ "text/plain": "npm run build" });
  expect(prevented).toBe(true);
  expect(doc.createElement).not.toHaveBeenCalled();
  expect(field.focus).not.toHaveBeenCalled();
  expect(field.blur).not.toHaveBeenCalled();
  expect(doc.activeElement).toBe(field);
  expect(listeners.size).toBe(0);
});

test("a refused or failing copy reports failure and leaves no listener", () => {
  stub(() => false);
  expect(copyText("x")).toBe(false);
  expect(listeners.size).toBe(0);
  stub(() => { throw new Error("no"); });
  expect(copyText("x")).toBe(false);
  expect(listeners.size).toBe(0);
  stub(() => true, false);
  expect(copyText("x")).toBe(false);
});
