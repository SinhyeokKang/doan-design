import { expect, it } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasCrumbs, headerMove, headerRowState, worktreeLabel, worktreeSwitchModel } from "./worktreeSwitchModel";

const canvas: CanvasRow = { path: ".doan/canvases/checkout.html", url: "u", id: "one" };
const main = { kind: "list", path: "/code/demo", servedRev: 0, git: { common: "/code/demo/.git", branch: "main", worktrees: [] }, canvases: [canvas] } satisfies FolderEntry;
const missing = { kind: "notFound", path: "/code/gone", lastCommon: main.git.common } satisfies FolderEntry;
const reading = { kind: "loading", path: "/code/next" } satisfies FolderEntry;
const card = { name: "demo", rows: [main, missing] };

it("names branches, detached HEADs and folders, and keeps a single Git checkout selectable", () => {
  expect(worktreeLabel(main)).toBe("main");
  expect(worktreeLabel({ ...main, git: { common: "c", detached: "123456789", worktrees: [] } })).toBe("detached 1234567");
  expect(worktreeLabel(missing)).toBe("gone");
  expect(worktreeSwitchModel([main, { ...missing, autoRegistered: true }], main.path, "/code")).toMatchObject({
    label: "main", path: "~/demo", rows: [{ root: main.path, label: "main", path: "~/demo", current: true, state: { kind: "open" } }],
  });
  expect(worktreeSwitchModel([{ kind: "list", path: main.path, servedRev: 0, canvases: [] }], main.path, null)).toBeNull();
  expect(worktreeSwitchModel([missing], missing.path, null)?.label).toBe("gone");
});

it("offers recovery on project menus and disables the same row on a canvas", () => {
  expect(worktreeSwitchModel(card.rows, main.path, null)?.rows[1]).toMatchObject({ current: false, chip: "Missing", state: { kind: "repair", actions: ["locate"] } });
  expect(headerRowState(missing, canvas.path)).toEqual({ kind: "disabled", reason: "Missing" });
  expect(headerRowState(reading, canvas.path)).toEqual({ kind: "disabled", reason: "Reading…" });
  expect(headerRowState({ ...main, canvases: [{ ...canvas, path: "different.html" }] }, canvas.path)).toEqual({ kind: "disabled", reason: "No checkout here" });
});

it("moves by exact path across roots even with a different id, and stays when the canvas disappears", () => {
  const other = { ...main, path: "/code/other", canvases: [{ ...canvas, id: "two" }] };
  expect(headerMove(other, canvas.path)).toEqual({ kind: "canvas", root: other.path, path: canvas.path });
  expect(headerMove({ ...other, canvases: [] }, canvas.path)).toEqual({ kind: "stay" });
  expect(headerMove(undefined, canvas.path)).toEqual({ kind: "stay" });
});

it("names the project, optional switch and listed canvas and explains each unavailable switch", () => {
  expect(canvasCrumbs(card, main.path, canvas, "/code")).toMatchObject([
    { kind: "project", label: "demo" }, { kind: "worktree", model: { label: "main" } }, { kind: "canvas", label: "checkout", path: canvas.path },
  ]);
  expect(canvasCrumbs(card, main.path, null, null)).toMatchObject([{ kind: "project" }, { kind: "worktree", reason: "Switching worktrees isn’t available on a page that isn’t a listed canvas." }]);
  expect(canvasCrumbs(card, missing.path, canvas, null)).toMatchObject([{ kind: "project" }, { kind: "worktree", reason: "Switching worktrees isn’t available while the canvas can’t be shown." }]);
  const plain: FolderEntry = { path: "/plain", servedRev: 0, kind: "list", canvases: [canvas] };
  expect(canvasCrumbs({ name: "plain", rows: [plain] }, plain.path, canvas, null).map(crumb => crumb.kind)).toEqual(["project", "canvas"]);
});
