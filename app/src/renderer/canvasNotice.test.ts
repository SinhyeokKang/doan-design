import { expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasNoticeLabel, readStateToast, shownIntent, sidebarSlots } from "./canvasNotice";
import type { Slot } from "./homeConversations";

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html", C = ".doan/ds/c.html";
const row = (path: string, mtimeMs?: number, unseen?: "new" | "changed", saveFailed?: "save" | "id"): CanvasRow => ({ path, url: path, ...(mtimeMs === undefined ? {} : { mtimeMs }), ...(unseen ? { unseen } : {}), ...(saveFailed ? { saveFailed } : {}) });
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });

test("an unseen canvas gets a canvas notice on its row", () => {
  const slots = sidebarSlots(new Map(), [list("/r", [row(A, 1, "new"), row(B, 2, "changed"), row(C, 3)])], null);
  expect([...slots]).toEqual([
    [`/r\n${B}`, { kind: "canvas", label: canvasNoticeLabel(B, "changed") }],
    [`/r\n${A}`, { kind: "canvas", label: canvasNoticeLabel(A, "new") }],
  ]);
});

test("conversation slots win on the same row and keep their own entries", () => {
  const conversation: Slot = { kind: "unseen", label: "Conversation finished — unread" };
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
  expect(sidebarSlots(new Map(), [{ path: "/r", kind: "loading" }, { path: "/s", kind: "error", message: "x", config: "/s/.doan/config.json" }], null).size).toBe(0);
});

test("the labels name the canvas", () => {
  expect(canvasNoticeLabel(A, "new")).toBe("a is new");
  expect(canvasNoticeLabel(B, "changed")).toBe("b changed since you last opened it");
});

test("shownIntent: a listed canvas the canvas page shows, whether or not it is unseen", () => {
  const entries = [list("/r", [row(A, 7, "changed"), row(B), row(C, 3)])];
  const page = { screen: "workspace" as const, overview: false, root: "/r", shown: A, unlisted: false };
  expect(shownIntent(entries, page)).toEqual({ root: "/r", path: A });
  expect(shownIntent(entries, { ...page, shown: C })).toEqual({ root: "/r", path: C });
  expect(shownIntent(entries, { ...page, overview: true })).toBeNull();
  expect(shownIntent(entries, { ...page, covered: true })).toBeNull();
  expect(shownIntent(entries, { ...page, screen: "home" })).toBeNull();
  expect(shownIntent(entries, { ...page, unlisted: true })).toBeNull();
  expect(shownIntent(entries, { ...page, shown: null })).toBeNull();
  expect(shownIntent(entries, { ...page, root: null })).toBeNull();
  expect(shownIntent(entries, { ...page, shown: ".doan/canvases/gone.html" })).toBeNull();
});

test("a save failure keeps the shown canvas's dot, labelled as a save failure; an ID problem keeps the change label", () => {
  const entries = [list("/r", [row(A, 5, "changed", "save"), row(B, 4, "new", "id"), row(C, 3, "changed")])];
  const shownA = sidebarSlots(new Map(), entries, { root: "/r", path: A });
  expect(shownA.get(`/r\n${A}`)).toEqual({ kind: "canvas", label: "Read state could not be saved for a" });
  const shownB = sidebarSlots(new Map(), entries, { root: "/r", path: B });
  expect(shownB.get(`/r\n${B}`)).toEqual({ kind: "canvas", label: canvasNoticeLabel(B, "new") });
  // Elsewhere a viewed canvas whose save failed still says so.
  expect(shownB.get(`/r\n${A}`)).toEqual({ kind: "canvas", label: "Read state could not be saved for a" });
  expect(sidebarSlots(new Map(), entries, { root: "/r", path: C }).has(`/r\n${C}`)).toBe(false);
});

test("a higher signal hides a failure dot only while it lasts", () => {
  const entries = [list("/r", [row(A, 5, "changed", "save")])];
  const permission: Slot = { kind: "permission", label: "Needs your answer" };
  expect(sidebarSlots(new Map([[`/r\n${A}`, permission]]), entries, { root: "/r", path: A }).get(`/r\n${A}`)).toBe(permission);
  expect(sidebarSlots(new Map(), entries, { root: "/r", path: A }).get(`/r\n${A}`)?.kind).toBe("canvas");
});

test("the Retry toast's words", () => {
  expect(readStateToast({ kind: "save", path: ".doan/canvases/checkout.html", readOnly: true })).toEqual({ message: "Couldn’t save checkout’s read state. This folder is read-only.", busy: "Saving checkout’s read state." });
  expect(readStateToast({ kind: "baseline", readOnly: true }).message).toBe("Couldn’t save the initial read state. This folder is read-only.");
  expect(readStateToast({ kind: "baseline", readOnly: false }).message).toBe("Couldn’t save the initial read state.");
  expect(readStateToast({ kind: "records" }).message).toBe("Read-state records couldn’t be read. Restore them, then retry.");
  expect(readStateToast({ kind: "unsupported" }).message).toBe("These read-state records need a compatible app version. Use that version, then retry.");
  expect(readStateToast({ kind: "id", path: ".doan/canvases/checkout.html" }).message).toBe("Couldn’t save the read state because the canvas ID is missing or duplicated. Fix the ID, then retry.");
});
