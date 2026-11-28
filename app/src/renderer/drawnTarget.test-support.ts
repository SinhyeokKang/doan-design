import type { ShortcutEvent } from "./canvasTool";

// There is no DOM in the renderer tests, so a key target is faked from the props a surface draws.
export type Drawn = Readonly<Record<string, unknown>>;

// Only the forms the app's rules use; any other form matches nothing.
function matches(node: Drawn, part: string): boolean {
  const not = /^(.+):not\(([a-z]+)\)$/.exec(part);
  if (not) return String(node.tagName ?? "DIV").toLowerCase() !== not[2] && matches(node, not[1]!);
  if (part === "dialog[open]") return String(node.tagName ?? "DIV").toLowerCase() === "dialog" && node.open === true;
  if (part.startsWith(".")) return (typeof node.className === "string" ? node.className : "").split(/\s+/).includes(part.slice(1));
  return part === `[role="${String(node.role)}"]`;
}
const matchesAny = (node: Drawn, selector: string) => selector.split(",").some(part => matches(node, part.trim()));

// The innermost element's closest() matches the class and role selectors the app uses, as the DOM's does.
export function drawn(chain: readonly Drawn[]) {
  const role = chain.at(-1)?.role;
  return {
    tagName: "DIV",
    isContentEditable: false,
    getAttribute: (name: string) => name === "role" && typeof role === "string" ? role : null,
    hasAttribute: () => false,
    closest: (selector: string) => [...chain].reverse().find(node => matchesAny(node, selector)) ?? null,
  };
}

export function drawnDocument(nodes: readonly Drawn[]) {
  return { querySelector: (selector: string) => nodes.find(node => matchesAny(node, selector)) ?? null };
}

// Outermost first. Radix popover content is role="dialog" unless the app sets another role.
export const OPEN_SURFACES: [string, Drawn[]][] = [
  ["the inspector's element menu", [{ className: "doan-floating doan-menu doan-insp-menu" }, { role: "tree" }, { role: "treeitem" }]],
  ["a sidebar canvas row menu", [{ className: "menu doan-floating doan-menu shell-canvas-menu shell-side-menu", role: "menu" }, { role: "menuitem" }]],
  ["a sidebar project row menu", [{ className: "menu doan-floating doan-menu shell-project-menu shell-side-menu", role: "menu" }, { role: "menuitem" }]],
  ["the zoom menu", [{ className: "doan-floating doan-menu doan-zoom-menu", role: "menu" }, { role: "menuitem" }]],
  ["the frame drawer", [{ className: "doan-floating doan-menu doan-frame-list" }, { role: "listbox" }, { role: "option" }]],
  ["the conversation menu", [{ className: "doan-floating doan-menu conv-menu", role: "menu" }, { role: "menuitem" }]],
  ["the composer's agent, effort and permission menus", [{ className: "doan-floating doan-menu agent-popover", role: "menu" }, { role: "menuitem" }]],
  ["the design presets list", [{ className: "doan-floating preset-popover", role: "dialog" }, { role: "listbox" }, { role: "option" }]],
  ["the design presets tabs", [{ className: "doan-floating preset-popover", role: "dialog" }, { className: "group-tabs shell-modes", role: "tablist" }, { role: "tab" }]],
  ["the design presets Retry", [{ className: "doan-floating preset-popover", role: "dialog" }, { className: "popover-actions" }, { className: "doan-button" }]],
  ["the / list", [{ className: "doan-floating preset-popover slash-popover", role: "presentation" }, { className: "popover-list doan-scroll", role: "listbox" }, { className: "doan-menu-item preset-item", role: "option" }]],
  ["the / list's Retry", [{ className: "doan-floating preset-popover slash-popover", role: "presentation" }, { className: "popover-actions" }, { className: "doan-button" }]],
  ["the Agent usage popover", [{ className: "doan-floating doan-popover doan-scroll usage-pop", role: "dialog" }, { className: "doan-button" }]],
  ["Quick Open", [{ tagName: "DIALOG", open: true, className: "doan-dialog doan-scroll qo" }, { role: "listbox" }, { role: "option" }]],
  ["a confirmation", [{ tagName: "DIALOG", open: true, className: "doan-dialog doan-scroll", role: "alertdialog" }, { className: "doan-button" }]],
  ["an alert dialog drawn without <dialog>", [{ className: "doan-dialog", role: "alertdialog" }, { className: "doan-button" }]],
  ["a menu drawn without doan-menu", [{ role: "menu" }, { role: "menuitem" }]],
  ["a list drawn without a menu class", [{ role: "listbox" }, { role: "option" }]],
  ["an open menu's own content", [{ className: "doan-floating doan-menu doan-zoom-menu", role: "menu" }]],
];

export const NOTHING_OPEN: [string, Drawn[]][] = [
  ["nothing", []],
  ["a sidebar row that only has focus", [{ className: "shell-tree", role: "tree" }, { role: "treeitem" }]],
  ["a confirmation mounted closed", [{ tagName: "DIALOG", open: false, className: "doan-dialog doan-scroll", role: "alertdialog" }]],
  ["a tooltip", [{ className: "doan-tooltip", role: "tooltip" }]],
  ["the canvas area", [{ className: "doan-canvas", role: "region" }]],
];

export function keydownOn(code: string, target: unknown): ShortcutEvent {
  return { type: "keydown", code, key: "", repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target };
}
