import { FileWarning, FolderCog, FolderX, SquareTerminal, type LucideIcon } from "lucide-react";
import type { FolderEntry } from "../main/view";
import type { OpenCanvas } from "./canvasView";
import type { RowAction } from "./homeCards";
import type { SidebarSlot } from "./canvasNotice";
import { displayPath } from "./projectDisplay";

// What a project in a problem state shows: the overlay over its content and the sidebar row's icon
// (PRODUCT §5 items 1 and 3). Pure; the shell owns timers, focus and inert.

export type ProblemKind = "notFound" | "uninitialized" | "error" | "cliError";
export type ActionVariant = "prominent" | "subtle" | "ghost";
export interface ProblemAction { name: RowAction; variant: ActionVariant }

// `newer`: a Config error from a config in a newer format, kept so a Retry's read shows the same line.
export type ShownOverlay = { kind: "problem"; entryKind: ProblemKind; newer?: true } | { kind: "reading" } | null;

export type ProblemOverlayView =
  | { kind: "reading"; label: string }
  | {
    kind: "problem"; entryKind: ProblemKind; newer?: true; icon: LucideIcon; heading: string;
    // `path` is the `displayPath` text the shell draws as a code chip before `text`.
    line: { path?: string; text: string };
    // The first action is the one prominent action.
    actions: ProblemAction[];
    // `error` and `cliError`, from the entry; absent while `busy` since the entry is `loading` then. The shell keeps
    // the text it last saw so an open Details block stays filled.
    detail?: string;
    busy: boolean;
  };

const READING_LABEL = "Reading project";

const prominent = (name: RowAction): ProblemAction => ({ name, variant: "prominent" });
const ghost = (name: RowAction): ProblemAction => ({ name, variant: "ghost" });

function isProblem(entry: FolderEntry): entry is FolderEntry & { kind: ProblemKind } {
  return entry.kind !== "list" && entry.kind !== "loading";
}

interface Scene { icon: LucideIcon; heading: string; line: { path?: string; text: string }; actions: ProblemAction[] }

function scene(kind: ProblemKind, name: string, path: string, home: string | null, newer = false): Scene {
  switch (kind) {
    case "notFound":
      return { icon: FolderX, heading: `${name} is missing`, line: { path: displayPath(path, home), text: "was moved or deleted." }, actions: [prominent("locate"), ghost("remove")] };
    case "uninitialized":
      return { icon: FolderCog, heading: `${name} isn’t set up`, line: { text: "Set it up to use Doan in this folder." }, actions: [prominent("setUp"), ghost("remove")] };
    case "error":
      return { icon: FileWarning, heading: `Doan couldn’t read ${name}’s configuration`, line: { text: newer ? ".doan/config.json is from a newer version of Doan. Update Doan, then retry." : ".doan/config.json has an error. Fix it, then retry." }, actions: [prominent("retry"), { name: "showInFinder", variant: "subtle" }, ghost("details")] };
    case "cliError":
      return { icon: SquareTerminal, heading: `Doan couldn’t read ${name}`, line: { text: "The doan command failed while reading it. Try again." }, actions: [prominent("retry"), ghost("details"), ghost("remove")] };
  }
}

// `slow`: 300 ms have passed since the entry became `loading`. `shown`: the overlay on screen just before. A `loading`
// that follows a problem scene keeps that scene with its buttons busy, whatever `slow` says (PRODUCT §5 item 3 'Problem states').
export function problemView(entry: FolderEntry, name: string, homeDirectory: string | null, state: { slow: boolean; shown: ShownOverlay }): ProblemOverlayView | null {
  if (entry.kind === "list") return null;
  if (entry.kind === "loading") {
    const { shown } = state;
    if (shown?.kind === "problem") return { kind: "problem", entryKind: shown.entryKind, ...(shown.newer ? { newer: true } : {}), ...scene(shown.entryKind, name, entry.path, homeDirectory, shown.newer), busy: true };
    return shown?.kind === "reading" || state.slow ? { kind: "reading", label: READING_LABEL } : null;
  }
  return {
    kind: "problem", entryKind: entry.kind, ...(entry.kind === "error" && entry.newer ? { newer: true } : {}), ...scene(entry.kind, name, entry.path, homeDirectory, entry.kind === "error" && entry.newer),
    ...(entry.kind === "error" ? { detail: entry.message } : entry.kind === "cliError" ? { detail: entry.reason } : {}), busy: false,
  };
}

// A problem or reading root still shows the Overview. The canvas shows only for a canvas of the loaded root.
export function workspaceBody(screen: string, root: string | null, open: Pick<OpenCanvas, "folder"> | null): "overview" | "canvas" | null {
  if (screen !== "workspace" || root === null) return null;
  return open !== null && open.folder === root ? "canvas" : "overview";
}

export type RowSlot = { kind: "problem"; icon: LucideIcon; label: string } | { kind: "reading"; label: string } | SidebarSlot;

// Order: permission request or question, problem icon, working, unseen. `slow` gates the reading spinner.
export function sidebarSlot(entry: FolderEntry, name: string, conversationSlot: SidebarSlot | null, slow: boolean): RowSlot | null {
  if (conversationSlot?.kind === "permission") return conversationSlot;
  if (isProblem(entry)) {
    const { icon, heading } = scene(entry.kind, name, entry.path, null);
    return { kind: "problem", icon, label: heading };
  }
  if (entry.kind === "loading" && slow) return { kind: "reading", label: `Reading ${name}` };
  return conversationSlot;
}

// The Overview's composer, or the canvas area. A disabled composer falls back to `focusCurrent` in the shell.
export function resolvedFocus(body: "overview" | "canvas"): "composer" | "canvasArea" {
  return body === "overview" ? "composer" : "canvasArea";
}
