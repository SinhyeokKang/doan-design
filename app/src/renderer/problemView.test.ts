import { FileWarning, FolderCog, FolderX, SquareTerminal } from "lucide-react";
import { describe, expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { cardRow } from "./homeCards";
import type { SidebarSlot } from "./canvasNotice";
import type { Slot } from "./homeConversations";
import { problemView, resolvedFocus, sidebarSlot, workspaceBody } from "./problemView";

const root = "/Users/me/code/acme";
const home = "/Users/me";
const list: FolderEntry = { path: root, kind: "list", canvases: [], servedRev: 0 };
const problems: Record<"notFound" | "uninitialized" | "error" | "cliError", FolderEntry> = {
  notFound: { path: root, kind: "notFound" },
  uninitialized: { path: root, kind: "uninitialized" },
  error: { path: root, kind: "error", message: "Unexpected token } at line 3", config: `${root}/.doan/config.json` },
  cliError: { path: root, kind: "cliError", reason: "spawn ENOENT" },
};
const loading: FolderEntry = { path: root, kind: "loading" };
const fast = { slow: false, shown: null };
const slow = { slow: true, shown: null };

type ProblemView = Extract<NonNullable<ReturnType<typeof problemView>>, { kind: "problem" }>;
function problem(entry: FolderEntry, shown = null as Parameters<typeof problemView>[3]["shown"], homeDirectory: string | null = home): ProblemView {
  const view = problemView(entry, "acme", homeDirectory, { slow: false, shown });
  if (view?.kind !== "problem") throw new Error(`expected a problem view, got ${JSON.stringify(view)}`);
  return view;
}

describe("problemView content (PRODUCT 'Problem states')", () => {
  test("notFound: FolderX, heading, path line, Locate then Remove", () => {
    expect(problem(problems.notFound)).toEqual({
      kind: "problem", entryKind: "notFound", icon: FolderX, heading: "acme is missing",
      line: { path: "~/code/acme", text: "was moved or deleted." },
      actions: [{ name: "locate", variant: "prominent" }, { name: "remove", variant: "ghost" }],
      busy: false,
    });
  });

  test("notFound shows a path outside HOME in full, and in full without a HOME", () => {
    const outside: FolderEntry = { path: "/Volumes/work/acme", kind: "notFound" };
    expect(problem(outside).line.path).toBe("/Volumes/work/acme");
    expect(problem(problems.notFound, null, null).line.path).toBe(root);
  });

  test("uninitialized: FolderCog, curly apostrophe, Set Up then Remove", () => {
    expect(problem(problems.uninitialized)).toEqual({
      kind: "problem", entryKind: "uninitialized", icon: FolderCog, heading: "acme isn’t set up",
      line: { text: "Set it up to use Doan in this folder." },
      actions: [{ name: "setUp", variant: "prominent" }, { name: "remove", variant: "ghost" }],
      busy: false,
    });
  });

  test("error: FileWarning, Retry, Show in Finder subtle, Details ghost, and the only detail", () => {
    expect(problem(problems.error)).toEqual({
      kind: "problem", entryKind: "error", icon: FileWarning, heading: "Doan couldn’t read acme’s configuration",
      line: { text: ".doan/config.json has an error. Fix it, then retry." },
      actions: [{ name: "retry", variant: "prominent" }, { name: "showInFinder", variant: "subtle" }, { name: "details", variant: "ghost" }],
      detail: "Unexpected token } at line 3",
      busy: false,
    });
  });

  // The file has no fault: this Doan cannot read its newer format, so the line points to updating Doan, not fixing it.
  test("error from a newer config version: same scene, a line about the newer format, kept while a Retry reads", () => {
    const newer: FolderEntry = { ...problems.error, newer: true } as FolderEntry;
    expect(problem(newer)).toEqual({ ...problem(problems.error), newer: true, line: { text: ".doan/config.json is from a newer version of Doan. Update Doan, then retry." } });
    const busy = problem(loading, { kind: "problem", entryKind: "error", newer: true });
    expect(busy.line.text).toBe(".doan/config.json is from a newer version of Doan. Update Doan, then retry.");
    expect(problem(loading, { kind: "problem", entryKind: "error" }).line.text).toBe(".doan/config.json has an error. Fix it, then retry.");
  });

  test("cliError: SquareTerminal, Retry, Details with the CLI's reason, then Remove", () => {
    expect(problem(problems.cliError)).toEqual({
      kind: "problem", entryKind: "cliError", icon: SquareTerminal, heading: "Doan couldn’t read acme",
      line: { text: "The doan command failed while reading it. Try again." },
      actions: [{ name: "retry", variant: "prominent" }, { name: "details", variant: "ghost" }, { name: "remove", variant: "ghost" }],
      detail: "spawn ENOENT",
      busy: false,
    });
  });

  test("only error and cliError carry a detail, and not while busy", () => {
    for (const kind of ["notFound", "uninitialized"] as const) expect(problem(problems[kind])).not.toHaveProperty("detail");
    expect(problemView({ path: root, kind: "loading" }, "acme", home, { slow: false, shown: { kind: "problem", entryKind: "cliError" } })).not.toHaveProperty("detail");
  });

  test("the action set equals cardRow's for every kind, with one prominent action first and no Go Home", () => {
    for (const entry of Object.values(problems)) {
      const view = problem(entry);
      expect([...view.actions.map(action => action.name)].sort()).toEqual([...cardRow(entry, null, null).actions].sort());
      expect(view.actions.filter(action => action.variant === "prominent")).toHaveLength(1);
      expect(view.actions[0]!.variant).toBe("prominent");
      expect(view.actions.map(action => action.name as string)).not.toContain("goHome");
    }
  });
});

describe("problemView state (PRODUCT 'Problem states')", () => {
  test("list has no overlay", () => {
    expect(problemView(list, "acme", home, fast)).toBeNull();
    expect(problemView(list, "acme", home, { slow: true, shown: { kind: "reading" } })).toBeNull();
    expect(problemView(list, "acme", home, { slow: true, shown: { kind: "problem", entryKind: "error" } })).toBeNull();
  });

  test("loading with nothing shown waits for the delay, then reads", () => {
    expect(problemView(loading, "acme", home, fast)).toBeNull();
    expect(problemView(loading, "acme", home, slow)).toEqual({ kind: "reading", label: "Reading project" });
  });

  test("loading after a reading overlay keeps reading, even before slow", () => {
    expect(problemView(loading, "acme", home, { slow: false, shown: { kind: "reading" } })).toEqual({ kind: "reading", label: "Reading project" });
  });

  test("loading after a problem keeps that problem, busy, whatever slow is", () => {
    for (const entryKind of ["notFound", "uninitialized", "error", "cliError"] as const) {
      const idle = problem(problems[entryKind]);
      for (const delayed of [false, true]) {
        const busy = problemView(loading, "acme", home, { slow: delayed, shown: { kind: "problem", entryKind } });
        expect(busy).toMatchObject({ kind: "problem", entryKind, icon: idle.icon, heading: idle.heading, line: idle.line, actions: idle.actions, busy: true });
        // The entry is `loading`, so the message is gone; the shell keeps the last detail it saw.
        expect(busy).not.toHaveProperty("detail");
      }
    }
  });

  test("a problem kind is a problem, not busy, whatever was shown before", () => {
    expect(problemView(problems.cliError, "acme", home, { slow: true, shown: { kind: "problem", entryKind: "error" } })).toMatchObject({ entryKind: "cliError", busy: false });
    expect(problemView(problems.error, "acme", home, { slow: false, shown: { kind: "reading" } })).toMatchObject({ entryKind: "error", busy: false });
  });
});

describe("workspaceBody", () => {
  const open = { folder: root, canvas: ".doan/canvases/a.html" };

  test("is null outside the workspace", () => {
    expect(workspaceBody("home", root, null)).toBeNull();
    expect(workspaceBody("settings", root, open)).toBeNull();
  });

  test("a closed canvas is the Overview", () => {
    expect(workspaceBody("workspace", root, null)).toBe("overview");
  });

  test("an open canvas of the loaded root is the canvas", () => {
    expect(workspaceBody("workspace", root, open)).toBe("canvas");
  });

  test("an open canvas of another root is the Overview", () => {
    expect(workspaceBody("workspace", root, { ...open, folder: "/Users/me/code/other" })).toBe("overview");
  });

  test("no loaded root has no body", () => {
    expect(workspaceBody("workspace", null, null)).toBeNull();
  });
});

describe("sidebarSlot", () => {
  const permission: Slot = { kind: "permission", label: "Waiting for your answer" };
  const working: Slot = { kind: "working", label: "Working" };
  const unseen: Slot = { kind: "unseen", label: "New" };

  test("a permission request or question beats a problem", () => {
    for (const entry of [problems.notFound, problems.error]) expect(sidebarSlot(entry, "acme", permission, true)).toBe(permission);
  });

  test("a problem beats working and unseen, with the heading as its label", () => {
    for (const slot of [working, unseen]) {
      expect(sidebarSlot(problems.notFound, "acme", slot, false)).toEqual({ kind: "problem", icon: FolderX, label: "acme is missing" });
    }
    expect(sidebarSlot(problems.uninitialized, "acme", null, false)).toEqual({ kind: "problem", icon: FolderCog, label: "acme isn’t set up" });
    expect(sidebarSlot(problems.error, "acme", working, false)).toEqual({ kind: "problem", icon: FileWarning, label: "Doan couldn’t read acme’s configuration" });
    expect(sidebarSlot(problems.cliError, "acme", unseen, false)).toEqual({ kind: "problem", icon: SquareTerminal, label: "Doan couldn’t read acme" });
  });

  test("a problem label is the overlay heading", () => {
    for (const entry of Object.values(problems)) expect(sidebarSlot(entry, "acme", null, false)).toMatchObject({ label: problem(entry).heading });
  });

  test("reading shows once slow, otherwise the conversation slot or nothing", () => {
    expect(sidebarSlot(loading, "acme", working, true)).toEqual({ kind: "reading", label: "Reading acme" });
    expect(sidebarSlot(loading, "acme", working, false)).toBe(working);
    expect(sidebarSlot(loading, "acme", null, false)).toBeNull();
  });

  test("a permission request beats the reading spinner", () => {
    expect(sidebarSlot(loading, "acme", permission, true)).toBe(permission);
  });

  test("a problem beats a canvas notice", () => {
    const notice: SidebarSlot = { kind: "canvas", label: "a is new" };
    expect(sidebarSlot(problems.notFound, "acme", notice, false)).toEqual({ kind: "problem", icon: FolderX, label: "acme is missing" });
  });

  test("a list row keeps its conversation slot, or has none", () => {
    for (const slot of [permission, working, unseen]) expect(sidebarSlot(list, "acme", slot, true)).toBe(slot);
    expect(sidebarSlot(list, "acme", null, true)).toBeNull();
  });
});

describe("resolvedFocus", () => {
  test("the Overview focuses the composer, the canvas page its area", () => {
    expect(resolvedFocus("overview")).toBe("composer");
    expect(resolvedFocus("canvas")).toBe("canvasArea");
  });
});
