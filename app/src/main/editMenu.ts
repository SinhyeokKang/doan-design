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
  };
}

export interface EditMenuContents {
  replaceMisspelling(word: string): void;
  showDefinitionForSelection(): void;
  isDestroyed(): boolean;
}

export type EditMenuTemplateItem = { role: EditRole; enabled: boolean } | { label: string; click: () => void } | { type: "separator" };

// Roles, not click handlers, for Cut/Copy/Paste/Select All: they run the same editing command as the Edit menu and its
// keys, so the composer's chip field gets the same DOM copy/cut/paste events it already handles for ⌘C/⌘X/⌘V.
export function editMenuTemplate(items: readonly EditMenuItem[], contents: EditMenuContents): EditMenuTemplateItem[] {
  const live = (run: () => void) => () => { if (!contents.isDestroyed()) run(); };
  return items.map((item): EditMenuTemplateItem => {
    switch (item.kind) {
      case "role": return { role: item.role, enabled: item.enabled };
      case "suggestion": return { label: item.word, click: live(() => contents.replaceMisspelling(item.word)) };
      case "lookUp": return { label: item.label, click: live(() => contents.showDefinitionForSelection()) };
      case "separator": return { type: "separator" };
    }
  });
}
