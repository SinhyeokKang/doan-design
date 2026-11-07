// Which items the right-click text edit menu holds. Kept free of Electron so the rules are tested without a window;
// index.ts turns the result into a native menu.

import { isTopFrame } from "./canvasFrame";

export interface EditMenuInput {
  mainFrame: boolean;
  editable: boolean;
  password: boolean;
  selection: string;
  flags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
  misspelled: string;
  suggestions: readonly string[];
  // Where the menu was opened, in CSS px (the app uses no page zoom); the field check looks there.
  point: { x: number; y: number };
}

export type EditRole = "cut" | "copy" | "paste" | "selectAll";

export type EditMenuItem =
  | { kind: "suggestion"; word: string }
  | { kind: "role"; role: EditRole; enabled: boolean }
  | { kind: "lookUp"; label: string }
  | { kind: "separator" };

// Doan's own cut-off, not a measured macOS rule.
const LOOK_UP_MAX = 30;

export function lookUpLabel(selection: string): string {
  const folded = selection.replace(/\s+/g, " ").trim();
  // Array.from walks code points, so an emoji at the boundary is kept or dropped whole.
  const points = Array.from(folded);
  const text = points.length > LOOK_UP_MAX ? `${points.slice(0, LOOK_UP_MAX).join("")}…` : folded;
  return `Look Up “${text}”`;
}

// Sections in macOS order (NSTextView.menu(for:) on macOS 26.6.2): spelling, Look Up, Cut/Copy/Paste, then Select All,
// which NSTextView lacks but the Edit menu has. Empty sections are dropped, so separators only ever sit between two.
export function editMenuItems(input: EditMenuInput): EditMenuItem[] {
  // The canvas iframe is never edited by hand (PRODUCT §3), so no edit commands are offered into it.
  if (!input.mainFrame) return [];
  if (!input.editable && input.selection === "") return [];
  const role = (name: EditRole, enabled: boolean): EditMenuItem => ({ kind: "role", role: name, enabled });
  const suggestions: EditMenuItem[] = input.editable && !input.password && input.misspelled !== ""
    ? input.suggestions.map(word => ({ kind: "suggestion", word }))
    : [];
  const lookUp: EditMenuItem[] = !input.password && input.selection.trim() !== "" ? [{ kind: "lookUp", label: lookUpLabel(input.selection) }] : [];
  const sections: EditMenuItem[][] = input.editable
    ? [suggestions, lookUp, [role("cut", input.flags.canCut), role("copy", input.flags.canCopy), role("paste", input.flags.canPaste)], [role("selectAll", input.flags.canSelectAll)]]
    : [lookUp, [role("copy", input.flags.canCopy)]];
  return sections.filter(section => section.length > 0).flatMap((section, index) => index === 0 ? section : [{ kind: "separator" as const }, ...section]);
}

// The slice of Electron's ContextMenuParams the menu reads, structural so this file needs no Electron import.
export interface ContextMenuParamsLike {
  frame: { parent?: unknown } | null;
  isEditable: boolean;
  formControlType: string;
  selectionText: string;
  editFlags: EditMenuInput["flags"];
  misspelledWord: string;
  dictionarySuggestions: readonly string[];
  x: number;
  y: number;
}

export function editMenuInput(params: ContextMenuParamsLike): EditMenuInput {
  let mainFrame: boolean;
  // A WebFrameMain disposed since the event was raised throws on property access; such a frame gets no menu.
  try {
    mainFrame = isTopFrame(params.frame);
  } catch {
    mainFrame = false;
  }
  const { canCut, canCopy, canPaste, canSelectAll } = params.editFlags;
  return {
    mainFrame, editable: params.isEditable, password: params.formControlType === "input-password", selection: params.selectionText,
    flags: { canCut, canCopy, canPaste, canSelectAll }, misspelled: params.misspelledWord, suggestions: params.dictionarySuggestions,
    point: { x: params.x, y: params.y },
  };
}

export interface EditMenuContents {
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  replaceMisspelling(word: string): void;
  showDefinitionForSelection(): void;
  isDestroyed(): boolean;
  executeJavaScript(code: string): Promise<unknown>;
}

export type EditMenuTemplateItem = { label: string; enabled?: boolean; accelerator?: string; click: () => void } | { type: "separator" };

const EDIT_LABELS: Record<EditRole, string> = { cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select All" };
// Only for the hint macOS draws beside the label: a click item loses the one a role item showed.
const EDIT_ACCELERATORS: Record<EditRole, string> = { cut: "CmdOrCtrl+X", copy: "CmdOrCtrl+C", paste: "CmdOrCtrl+V", selectAll: "CmdOrCtrl+A" };

// True only while the focused element is the one under the menu's point, or holds it (a chip inside the composer).
// A fixed script with two numbers in it: main never runs a string the renderer chose. Non-finite input gets no script,
// so the item does nothing.
export function fieldCheckScript(point: { x: number; y: number }): string | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return `(() => { const at = document.elementFromPoint(${point.x}, ${point.y}); const active = document.activeElement;
    return at !== null && active !== null && active !== document.body && active !== document.documentElement && (active === at || active.contains(at)); })()`;
}

// Cut/Copy/Paste/Select All and spelling act on whatever is focused when chosen, not on the field the menu opened on.
// If that field went away while the menu was open (a question card answered, say), focus can sit in another field,
// which would then take the paste or the replacement. So an editable menu's writing items first ask the page whether
// focus is still on the opened field, the way Edit > Undo checks for a focused chip field. Look Up and a non-editable
// menu's Copy write nothing, so they are not checked. The webContents methods run the same Chromium editing commands as
// the Edit menu's roles, so the chip field gets its usual DOM copy/cut/paste events.
export function editMenuTemplate(input: EditMenuInput, contents: EditMenuContents): EditMenuTemplateItem[] {
  const script = fieldCheckScript(input.point);
  const checked = (run: () => void) => () => {
    if (contents.isDestroyed()) return;
    if (!input.editable) return run();
    if (script === null) return;
    // A rejected script (the page navigated or crashed) and any non-true answer leave the page alone.
    void contents.executeJavaScript(script).then(same => { if (same === true && !contents.isDestroyed()) run(); }, () => undefined);
  };
  return editMenuItems(input).map((item): EditMenuTemplateItem => {
    switch (item.kind) {
      case "role": return { label: EDIT_LABELS[item.role], enabled: item.enabled, accelerator: EDIT_ACCELERATORS[item.role], click: checked(() => contents[item.role]()) };
      case "suggestion": return { label: item.word, click: checked(() => contents.replaceMisspelling(item.word)) };
      case "lookUp": return { label: item.label, click: () => { if (!contents.isDestroyed()) contents.showDefinitionForSelection(); } };
      case "separator": return { type: "separator" };
    }
  });
}
