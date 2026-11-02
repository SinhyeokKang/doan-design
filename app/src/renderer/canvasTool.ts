import { editableTarget } from "./selection";

// The canvas tools a person switches between (canvas-hand-tool spec 결정 1). A pick is not one: it runs ahead of the
// tool for a moment and leaves it as it was.
export type CanvasTool = "select" | "hand";

export type ToolShortcut = { kind: "tool"; tool: CanvasTool } | { kind: "space"; down: boolean };

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

// By key position (`code`), so a Korean layout's ㅍ and ㅗ still switch tools. A Space release always counts: one
// pressed on the canvas may be released over the composer, and a held Space must not outlive the key.
export function toolShortcut(event: ShortcutEvent, context: { canvasPage: boolean }): ToolShortcut | null {
  if (event.type === "keyup") return event.code === "Space" ? { kind: "space", down: false } : null;
  if (event.type !== "keydown") return null;
  const tool = TOOL_KEYS[event.code];
  if (tool === undefined && event.code !== "Space") return null;
  if (!context.canvasPage || event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || editableTarget(event.target)) return null;
  if (tool !== undefined) return { kind: "tool", tool };
  return interactiveTarget(event.target) ? null : { kind: "space", down: true };
}

export type EscapeStep = "cancelPick" | "selectTool" | "clearSelection";

// Esc's next action once menus, popovers and the `/` list have had theirs (they prevent it). A pick ends wherever focus
// is; a text field keeps its own Esc otherwise.
export function escapeStep(state: { picking: boolean; hand: boolean; editable: boolean }): EscapeStep | null {
  if (state.picking) return "cancelPick";
  if (state.editable) return null;
  return state.hand ? "selectTool" : "clearSelection";
}
