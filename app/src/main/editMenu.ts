// Which items the right-click text edit menu holds. Kept free of Electron so the rules are tested without a window;
// index.ts turns the result into a native menu.

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
