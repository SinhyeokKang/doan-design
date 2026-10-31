import { afterEach, expect, test, vi } from "vitest";
import { copyText } from "./copyText";

// buzz-project design §8: main denies every permission check, so the thread's Copy writes through the document's own
// copy command, and the person's field keeps its focus and selection (an IME composition may be in it).

interface FakeField { value: string; selectionStart: number; selectionEnd: number; isConnected: boolean; focus: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; setSelectionRange: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; style: Record<string, string> }
function field(value = ""): FakeField {
  const node: FakeField = {
    value, selectionStart: 0, selectionEnd: 0, isConnected: true, style: {},
    focus: vi.fn(() => { doc.activeElement = node; }),
    select: vi.fn(() => { node.selectionStart = 0; node.selectionEnd = node.value.length; }),
    setSelectionRange: vi.fn((start: number, end: number) => { node.selectionStart = start; node.selectionEnd = end; }),
    remove: vi.fn(() => { node.isConnected = false; doc.body.children = doc.body.children.filter(child => child !== node); }),
    setAttribute: vi.fn(),
  };
  return node;
}
let doc: { activeElement: FakeField | null; body: { children: FakeField[]; append(node: FakeField): void }; createElement: ReturnType<typeof vi.fn>; execCommand: ReturnType<typeof vi.fn> };
function stub(exec: (command: string) => boolean) {
  doc = {
    activeElement: null,
    body: { children: [], append(node) { this.children.push(node); } },
    createElement: vi.fn(() => field()),
    execCommand: vi.fn(exec),
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLInputElement", class {});
  vi.stubGlobal("HTMLTextAreaElement", class {});
}
afterEach(() => vi.unstubAllGlobals());

test("copies the text with the copy command and leaves no helper behind", () => {
  let copied: string | null = null;
  stub(command => {
    const active = doc.activeElement!;
    copied = command === "copy" ? active.value.slice(active.selectionStart, active.selectionEnd) : null;
    return true;
  });
  expect(copyText("npm run build")).toBe(true);
  expect(copied).toBe("npm run build");
  expect(doc.body.children).toHaveLength(0);
});

test("the focused field keeps its focus and selection", () => {
  stub(() => true);
  const composer = field("한글 조합 중");
  Object.setPrototypeOf(composer, (globalThis as unknown as { HTMLTextAreaElement: { prototype: object } }).HTMLTextAreaElement.prototype);
  doc.body.append(composer);
  composer.focus();
  composer.setSelectionRange(3, 5);
  copyText("code");
  expect(doc.activeElement).toBe(composer);
  expect([composer.selectionStart, composer.selectionEnd]).toEqual([3, 5]);
  expect(composer.focus).toHaveBeenLastCalledWith({ preventScroll: true });
});

test("a refused or failing copy reports failure and still cleans up", () => {
  stub(() => false);
  expect(copyText("x")).toBe(false);
  expect(doc.body.children).toHaveLength(0);
  stub(() => { throw new Error("no"); });
  expect(copyText("x")).toBe(false);
  expect(doc.body.children).toHaveLength(0);
});
