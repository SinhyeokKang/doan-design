import { editableTarget } from "./selection";

// A pick is not one: it runs ahead of the tool for a moment and leaves it as it was.
export type CanvasTool = "select" | "hand";

export type ToolShortcut = { kind: "tool"; tool: CanvasTool } | { kind: "space"; down: boolean } | { kind: "zoomSelection" } | { kind: "play" };

export type ShortcutEvent = Pick<KeyboardEvent, "type" | "code" | "key" | "repeat" | "isComposing" | "keyCode" | "defaultPrevented" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & { target: unknown };

const TOOL_KEYS: Readonly<Record<string, CanvasTool>> = { KeyV: "select", KeyH: "hand" };
const CONTROL_ROLES = new Set(["button", "menuitem", "treeitem", "option", "tab", "switch", "checkbox", "radio", "combobox"]);

// Space on a focused control presses it; elsewhere it pans.
function interactiveTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const element = target as { tagName: unknown; getAttribute?: (name: string) => string | null; hasAttribute?: (name: string) => boolean };
  if (element.tagName === "BUTTON") return true;
  if (element.tagName === "A" && element.hasAttribute?.("href") === true) return true;
  const role = element.getAttribute?.("role");
  return typeof role === "string" && CONTROL_ROLES.has(role);
}

// A new floating menu or list needs `.doan-menu` or a listed role, or must join this selector (ARCHITECTURE §3
// 'Canvas view'). Closed ones are unmounted, except a native <dialog>, which counts only while open.
export const OPEN_OVERLAY = '.doan-menu, [role="menu"], [role="listbox"], .preset-popover, dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog)';

export function inOpenOverlay(target: unknown): boolean {
  if (typeof target !== "object" || target === null || !("closest" in target) || typeof target.closest !== "function") return false;
  return (target as { closest(selector: string): unknown }).closest(OPEN_OVERLAY) !== null;
}

export function overlayOpen(root: { querySelector(selector: string): unknown }): boolean {
  return root.querySelector(OPEN_OVERLAY) !== null;
}

// By `code`, so a Korean layout's ㅍ and ㅗ still switch tools and ⇧2 is one key on every layout. A Space release always
// counts: one pressed on the canvas may be released over the composer, and a held Space must not outlive the key.
export function toolShortcut(event: ShortcutEvent, context: { canvasPage: boolean }): ToolShortcut | null {
  if (event.type === "keyup") return event.code === "Space" ? { kind: "space", down: false } : null;
  if (event.type !== "keydown") return null;
  const tool = TOOL_KEYS[event.code];
  const zoom = event.code === "Digit2" && event.shiftKey;
  if (tool === undefined && !zoom && event.code !== "Space") return null;
  if (!context.canvasPage || event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || editableTarget(event.target) || inOpenOverlay(event.target)) return null;
  if (tool !== undefined) return { kind: "tool", tool };
  if (zoom) return { kind: "zoomSelection" };
  // ⇧Space plays and never pans.
  if (interactiveTarget(event.target)) return null;
  return event.shiftKey ? { kind: "play" } : { kind: "space", down: true };
}

export type EscapeStep = "cancelPick" | "cancelCapture" | "selectTool" | "clearText" | "stepSelection";

// A pick and capture mode end wherever focus is; a text field keeps its own Esc otherwise. A canvas text range goes
// before the element selection steps back.
export function escapeStep(state: { picking: boolean; capturing: boolean; hand: boolean; editable: boolean; canvasText: boolean }): EscapeStep | null {
  if (state.picking) return "cancelPick";
  if (state.capturing) return "cancelCapture";
  if (state.editable) return null;
  if (state.hand) return "selectTool";
  return state.canvasText ? "clearText" : "stepSelection";
}
