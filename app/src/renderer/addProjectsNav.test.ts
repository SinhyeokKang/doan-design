import { expect, test } from "vitest";
import { addPageReturn, leaveLocked, type AddPageOrigin } from "./addProjectsNav";
import type { ProjectPhase } from "./projectStep";

const home: AddPageOrigin = { screen: "home" };
const ws: AddPageOrigin = { screen: "workspace", root: "/w/a" };
const roots = ["/w/a", "/w/b"];
const escape = { kind: "escape", editing: false, overlay: false } as const;

test("Projects tab, Back, Cancel and Escape return to the origin", () => {
  for (const event of [{ kind: "projectsTab" }, { kind: "back" }, { kind: "cancel" }, escape] as const) {
    expect(addPageReturn(home, event, roots)).toEqual({ kind: "home", select: null });
    expect(addPageReturn(ws, event, roots)).toEqual({ kind: "workspace", root: "/w/a", guard: false });
  }
});

test("an origin workspace no longer listed returns Home", () => {
  for (const event of [{ kind: "projectsTab" }, { kind: "back" }, { kind: "cancel" }, escape] as const)
    expect(addPageReturn(ws, event, ["/w/b"])).toEqual({ kind: "home", select: null });
});

test("Forward and reopening the page do nothing", () => {
  expect(addPageReturn(ws, { kind: "forward" }, roots)).toEqual({ kind: "stay" });
  expect(addPageReturn(home, { kind: "reopen" }, roots)).toEqual({ kind: "stay" });
});

test("Escape in an edited field or under an open overlay stays on the page", () => {
  expect(addPageReturn(ws, { kind: "escape", editing: true, overlay: false }, roots)).toEqual({ kind: "stay" });
  expect(addPageReturn(ws, { kind: "escape", editing: false, overlay: true }, roots)).toEqual({ kind: "stay" });
});

test("a finished add goes Home with that root chosen, new or already registered", () => {
  expect(addPageReturn(ws, { kind: "added", root: "/w/new" }, roots)).toEqual({ kind: "home", select: "/w/new" });
  expect(addPageReturn(home, { kind: "added", root: "/w/b" }, roots)).toEqual({ kind: "home", select: "/w/b" });
});

test("a sidebar row or a Quick Open pick leaves for its workspace, through the draft guard when the origin has a draft", () => {
  expect(addPageReturn(home, { kind: "row", root: "/w/b", originDraft: false }, roots)).toEqual({ kind: "workspace", root: "/w/b", guard: false });
  expect(addPageReturn(ws, { kind: "row", root: "/w/b", originDraft: true }, roots)).toEqual({ kind: "workspace", root: "/w/b", guard: true });
  // The origin itself is revealed, not left, so its draft needs no guard.
  expect(addPageReturn(ws, { kind: "row", root: "/w/a", originDraft: true }, roots)).toEqual({ kind: "workspace", root: "/w/a", guard: false });
  expect(addPageReturn(ws, { kind: "quickOpen", root: "/w/b", originDraft: true }, roots)).toEqual({ kind: "workspace", root: "/w/b", guard: true });
  expect(addPageReturn(home, { kind: "quickOpen", root: "/w/b", originDraft: false }, roots)).toEqual({ kind: "workspace", root: "/w/b", guard: false });
});

test("Go > Home goes Home whatever the origin", () => {
  expect(addPageReturn(ws, { kind: "home" }, roots)).toEqual({ kind: "home", select: null });
  expect(addPageReturn(home, { kind: "home" }, roots)).toEqual({ kind: "home", select: null });
});

test("selecting and cloning lock the page, cancelling included; other phases do not", () => {
  expect(leaveLocked({ kind: "selecting" })).toBe(true);
  expect(leaveLocked({ kind: "cloning" })).toBe(true);
  const stopping: ProjectPhase = { kind: "cloning", url: "u", destination: "/w/r", operationId: "op", cancelling: true };
  expect(leaveLocked(stopping)).toBe(true);
  for (const kind of ["choose", "inspecting", "checking", "candidates", "setup", "clone", "cloneCancelled", "ready", "completing"] as const)
    expect(leaveLocked({ kind })).toBe(false);
});
