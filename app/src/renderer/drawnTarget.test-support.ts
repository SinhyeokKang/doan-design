import type { ShortcutEvent } from "./canvasTool";

// Test support: there is no DOM in the renderer tests, so a key target is faked from the props a surface draws.
export type Drawn = Readonly<Record<string, unknown>>;

// The innermost of these drawn elements (outermost first). Its closest() matches the class and role selectors the
// app uses on the way out, as the DOM's does.
export function drawn(chain: readonly Drawn[]) {
  const matches = (node: Drawn, part: string) => part.startsWith(".")
    ? (typeof node.className === "string" ? node.className : "").split(/\s+/).includes(part.slice(1))
    : part === `[role="${String(node.role)}"]`;
  const role = chain.at(-1)?.role;
  return {
    tagName: "DIV",
    isContentEditable: false,
    getAttribute: (name: string) => name === "role" && typeof role === "string" ? role : null,
    hasAttribute: () => false,
    closest: (selector: string) => [...chain].reverse().find(node => selector.split(",").some(part => matches(node, part.trim()))) ?? null,
  };
}

// An unmodified keydown on that target, as the window sees it.
export function keydownOn(code: string, target: unknown): ShortcutEvent {
  return { type: "keydown", code, key: "", repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target };
}
