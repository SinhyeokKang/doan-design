import { expect, test } from "vitest";
import { addPageReturn, leaveLocked, pageEscape, type AddPageOrigin } from "./addProjectsNav";
import type { ProjectPhase } from "./projectStep";

const home: AddPageOrigin = { screen: "home" };
const ws: AddPageOrigin = { screen: "workspace", root: "/w/a" };
const roots = ["/w/a", "/w/b"];
const escape = { kind: "escape", editing: false, overlay: false } as const;

test("Projects tab, Back, Cancel and Escape return to the origin", () => {
  for (const event of [{ kind: "projectsTab" }, { kind: "back" }, { kind: "cancel" }, escape] as const) {
    expect(addPageReturn(home, event, roots)).toEqual({ kind: "home", select: null });
    expect(addPageReturn(ws, event, roots)).toEqual({ kind: "workspace", root: "/w/a" });
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

// A sidebar row and a Quick Open pick leave through the shell's own navigation, whose controller asks the draft guard
// canvas by canvas (review-BP 🟡1); the page never decides that a move may skip it, so they are not events here.
test("the destination never carries a guard decision", () => {
  for (const event of [{ kind: "projectsTab" }, { kind: "back" }, { kind: "cancel" }, escape] as const)
    expect(Object.keys(addPageReturn(ws, event, roots)).sort()).toEqual(["kind", "root"]);
});

test("Escape in a field or during an IME composition (isComposing or keyCode 229) is editing", () => {
  const button = { tagName: "BUTTON" }, input = { tagName: "INPUT" };
  expect(pageEscape({ target: button, isComposing: false, keyCode: 27 }, false)).toEqual(escape);
  expect(pageEscape({ target: input, isComposing: false, keyCode: 27 }, false)).toEqual({ ...escape, editing: true });
  expect(pageEscape({ target: { tagName: "DIV", isContentEditable: true }, isComposing: false, keyCode: 27 }, false)).toEqual({ ...escape, editing: true });
  expect(pageEscape({ target: button, isComposing: true, keyCode: 27 }, false)).toEqual({ ...escape, editing: true });
  expect(pageEscape({ target: button, isComposing: false, keyCode: 229 }, false)).toEqual({ ...escape, editing: true });
  expect(pageEscape({ target: button, isComposing: false, keyCode: 27 }, true)).toEqual({ ...escape, overlay: true });
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

// Conductor decision ⚪3(a): only text you can type into counts, so Escape on the candidates' radios leaves the page.
test("a radio, a checkbox or a select is not editing; text fields and textareas are", () => {
  for (const target of [{ tagName: "INPUT", type: "radio" }, { tagName: "INPUT", type: "checkbox" }, { tagName: "SELECT" }, { tagName: "BUTTON" }])
    expect(pageEscape({ target, isComposing: false, keyCode: 27 }, false), target.tagName).toEqual(escape);
  for (const target of [{ tagName: "INPUT", type: "text" }, { tagName: "INPUT", type: "url" }, { tagName: "INPUT" }, { tagName: "TEXTAREA" }])
    expect(pageEscape({ target, isComposing: false, keyCode: 27 }, false)).toEqual({ ...escape, editing: true });
});
