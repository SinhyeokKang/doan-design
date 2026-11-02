import { expect, test, vi } from "vitest";
import type { FolderEntry } from "../main/view";
import { decideOpen, type OpenPage } from "./openDecision";

const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html";
const row = { path: A, url: "u-a" };
const listed: FolderEntry[] = [{ path: "/w/a", kind: "list", servedRev: 0, canvases: [row] }];
const page = (patch: Partial<OpenPage> = {}): OpenPage => ({ locked: null, firstRun: false, dismissDialogs: () => true, entries: () => listed, ...patch });

test("a listed canvas on a free page opens its row", () => {
  expect(decideOpen({ root: "/w/a", canvas: A }, page())).toEqual({ kind: "opened", row });
});

test("a locked page refuses with its name before any dialog is touched", () => {
  const dismissDialogs = vi.fn(() => true);
  for (const locked of ["add_projects", "settings", "project_settings"] as const) {
    expect(decideOpen({ root: "/w/a", canvas: A }, page({ locked, firstRun: true, dismissDialogs }))).toEqual({ kind: "busy", reason: locked });
  }
  expect(dismissDialogs).not.toHaveBeenCalled();
});

test("first run refuses and leaves the wizard's dialogs open", () => {
  const dismissDialogs = vi.fn(() => true);
  expect(decideOpen({ root: "/w/a", canvas: A }, page({ firstRun: true, dismissDialogs }))).toEqual({ kind: "busy", reason: "first_run" });
  expect(dismissDialogs).not.toHaveBeenCalled();
});

test("a dialog that refuses its cancel keeps the move from happening", () => {
  const entries = vi.fn(() => listed);
  expect(decideOpen({ root: "/w/a", canvas: A }, page({ dismissDialogs: () => false, entries }))).toEqual({ kind: "busy", reason: "dialog" });
  expect(entries).not.toHaveBeenCalled();
});

test("the list is read after the dialogs closed, and a canvas missing from it is not found with its entry", () => {
  const order: string[] = [];
  const decision = decideOpen({ root: "/w/a", canvas: B }, page({ dismissDialogs: () => { order.push("dismiss"); return true; }, entries: () => { order.push("entries"); return listed; } }));
  expect(order).toEqual(["dismiss", "entries"]);
  expect(decision).toEqual({ kind: "canvas_not_found", entry: listed[0] });
});

test("a root the renderer does not list, or lists as not a list, is not found", () => {
  expect(decideOpen({ root: "/w/b", canvas: A }, page())).toEqual({ kind: "canvas_not_found", entry: undefined });
  const loading: FolderEntry = { path: "/w/a", kind: "loading" };
  expect(decideOpen({ root: "/w/a", canvas: A }, page({ entries: () => [loading] }))).toEqual({ kind: "canvas_not_found", entry: loading });
});
