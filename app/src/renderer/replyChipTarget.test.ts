import { describe, expect, it } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { replyChipTarget } from "./replyChipTarget";

const ROOT = "/w/main";
const row = (path: string, id?: string): CanvasRow => ({ path, url: `u-${path}`, ...(id === undefined ? {} : { id }) });
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases });
const drafts = row(".doan/canvases/drafts.html", "drafts");
const checkout = row(".doan/canvases/checkout.html", "checkout");
const link = (canvas: string) => ({ canvas, kind: "frame" as const, id: "editor" });

describe("replyChipTarget", () => {
  it("locates in the canvas that is on screen", () => {
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: "drafts", entry: list(ROOT, [drafts, checkout]) })).toBe("locate");
  });

  it("locates without needing the list, since the open canvas is already there", () => {
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: "drafts", entry: undefined })).toBe("locate");
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: "drafts", entry: { path: ROOT, kind: "loading" } })).toBe("locate");
  });

  it("opens the row while the Overview covers the canvas (openCanvasId null), even for the id that was last open", () => {
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry: list(ROOT, [drafts, checkout]) })).toEqual({ open: drafts });
  });

  it("opens another canvas of the same root", () => {
    expect(replyChipTarget(link("checkout"), { root: ROOT, openCanvasId: "drafts", entry: list(ROOT, [drafts, checkout]) })).toEqual({ open: checkout });
  });

  it("is missing when no row has the id", () => {
    expect(replyChipTarget(link("gone"), { root: ROOT, openCanvasId: "drafts", entry: list(ROOT, [drafts, checkout]) })).toBe("missing");
    expect(replyChipTarget(link("gone"), { root: ROOT, openCanvasId: null, entry: list(ROOT, []) })).toBe("missing");
  });

  it("is duplicate when two rows use the id", () => {
    const twin = row(".doan/canvases/drafts-copy.html", "drafts");
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry: list(ROOT, [drafts, twin]) })).toBe("duplicate");
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: "checkout", entry: list(ROOT, [drafts, checkout, twin]) })).toBe("duplicate");
  });

  it("is unavailable while the list is being read or the project has a problem", () => {
    const state = (entry: FolderEntry | undefined) => replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry });
    expect(state({ path: ROOT, kind: "loading" })).toBe("unavailable");
    expect(state({ path: ROOT, kind: "uninitialized" })).toBe("unavailable");
    expect(state({ path: ROOT, kind: "error", message: "bad config", config: `${ROOT}/.doan/config.json` })).toBe("unavailable");
    expect(state({ path: ROOT, kind: "cliError", reason: "missing" })).toBe("unavailable");
    expect(state({ path: ROOT, kind: "notFound" })).toBe("unavailable");
    expect(state(undefined)).toBe("unavailable");
  });

  it("ignores a row without an id, and never matches the id by path or title", () => {
    const noId = { ...row(".doan/canvases/drafts.html"), title: "drafts" };
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry: list(ROOT, [noId]) })).toBe("missing");
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry: list(ROOT, [noId, drafts]) })).toEqual({ open: drafts });
    // Two id-less rows are not a duplicate of anything.
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry: list(ROOT, [noId, row("x.html"), drafts]) })).toEqual({ open: drafts });
  });

  it("does not look at another worktree's list, which may use the same canvas id", () => {
    const other = list("/w/other", [drafts, checkout]);
    expect(replyChipTarget(link("checkout"), { root: ROOT, openCanvasId: null, entry: other })).toBe("unavailable");
    // An id of the other worktree is not found in this root's list.
    expect(replyChipTarget(link("checkout"), { root: ROOT, openCanvasId: "drafts", entry: list(ROOT, [drafts]) })).toBe("missing");
  });

  it("compares the whole id, not a prefix or another case", () => {
    const entry = list(ROOT, [row("a.html", "drafts-2"), row("b.html", "Drafts")]);
    expect(replyChipTarget(link("drafts"), { root: ROOT, openCanvasId: null, entry })).toBe("missing");
  });
});

// A canvas chip presses through the same rule with its anchor's id; its path is only a label.
describe("replyChipTarget for a canvas chip", () => {
  const press = (id: string, openCanvasId: string | null, entry: FolderEntry | undefined) => replyChipTarget({ canvas: id }, { root: ROOT, openCanvasId, entry });
  const twin = row(".doan/canvases/drafts-copy.html", "drafts");

  it("locates the open canvas, opens another, and names a missing one", () => {
    expect(press("drafts", "drafts", list(ROOT, [drafts, checkout]))).toBe("locate");
    expect(press("checkout", "drafts", list(ROOT, [drafts, checkout]))).toEqual({ open: checkout });
    expect(press("checkout", null, list(ROOT, [drafts, checkout]))).toEqual({ open: checkout });
    expect(press("gone", "drafts", list(ROOT, [drafts, checkout]))).toBe("missing");
  });

  it("refuses a shared id and a list that is being read or has a problem", () => {
    expect(press("drafts", "checkout", list(ROOT, [drafts, checkout, twin]))).toBe("duplicate");
    expect(press("checkout", "drafts", { path: ROOT, kind: "loading" })).toBe("unavailable");
    expect(press("checkout", null, { path: ROOT, kind: "error", message: "bad", config: `${ROOT}/.doan/config.json` })).toBe("unavailable");
  });
});
