import { expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasNoticeLabel, seenMark, sidebarSlots } from "./canvasNotice";
import type { Slot } from "./homeConversations";

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html", C = ".doan/ds/c.html";
const row = (path: string, mtimeMs?: number, unseen?: "new" | "changed"): CanvasRow => ({ path, url: path, ...(mtimeMs === undefined ? {} : { mtimeMs }), ...(unseen ? { unseen } : {}) });
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });

test("an unseen canvas gets a canvas notice on its row", () => {
  const slots = sidebarSlots(new Map(), [list("/r", [row(A, 1, "new"), row(B, 2, "changed"), row(C, 3)])], null);
  expect([...slots]).toEqual([
    [`/r\n${B}`, { kind: "canvas", label: canvasNoticeLabel(B, "changed") }],
    [`/r\n${A}`, { kind: "canvas", label: canvasNoticeLabel(A, "new") }],
  ]);
});

test("conversation slots win on the same row and keep their own entries", () => {
  const conversation: Slot = { kind: "unseen", label: "New changes from Codex" };
  const working: Slot = { kind: "working", label: "w" };
  const slots = sidebarSlots(new Map([[`/r\n${A}`, conversation], ["/r", working]]), [list("/r", [row(A, 5, "changed"), row(B, 1, "new")])], null);
  expect(slots.get(`/r\n${A}`)).toBe(conversation);
  expect(slots.get("/r")).toBe(working);
  expect(slots.get(`/r\n${B}`)?.kind).toBe("canvas");
});

test("the canvas shown on the canvas page never shows a notice", () => {
  const entries = [list("/r", [row(A, 5, "changed")]), list("/s", [row(A, 5, "changed")])];
  const slots = sidebarSlots(new Map(), entries, { root: "/r", path: A });
  expect([...slots.keys()]).toEqual([`/s\n${A}`]);
});

test("notices come newest-changed first across roots, so a project row picks the most recent one", () => {
  const slots = sidebarSlots(new Map(), [list("/r", [row(A, 1, "new"), row(B, 9, "new")]), list("/s", [row(C, 5, "changed")])], null);
  expect([...slots.keys()]).toEqual([`/r\n${B}`, `/s\n${C}`, `/r\n${A}`]);
});

test("rows of a root that is not a list show nothing", () => {
  expect(sidebarSlots(new Map(), [{ path: "/r", kind: "loading" }, { path: "/s", kind: "error", message: "x" }], null).size).toBe(0);
});

test("the labels name the canvas", () => {
  expect(canvasNoticeLabel(A, "new")).toBe("a is new");
  expect(canvasNoticeLabel(B, "changed")).toBe("b changed since you last opened it");
});

test("seenMark: an unseen listed canvas shown on the canvas page, with its mtime", () => {
  const entries = [list("/r", [row(A, 7, "changed"), row(B), row(C, 3)])];
  const page = { screen: "workspace" as const, overview: false, root: "/r", shown: A, unlisted: false };
  expect(seenMark(entries, page)).toEqual({ root: "/r", path: A, mtimeMs: 7 });
  expect(seenMark(entries, { ...page, overview: true })).toBeNull();
  expect(seenMark(entries, { ...page, screen: "home" })).toBeNull();
  expect(seenMark(entries, { ...page, unlisted: true })).toBeNull();
  expect(seenMark(entries, { ...page, shown: null })).toBeNull();
  expect(seenMark(entries, { ...page, root: null })).toBeNull();
  // No mtime: nothing to record.
  expect(seenMark(entries, { ...page, shown: B })).toBeNull();
  // Already seen: main has nothing to change.
  expect(seenMark(entries, { ...page, shown: C })).toBeNull();
  expect(seenMark(entries, { ...page, shown: ".doan/canvases/gone.html" })).toBeNull();
});
