import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry, OrphanFile } from "../main/view";
import { canvasViewUpdate } from "../renderer/canvasView";
import { idChangeNotice } from "./orphans";

const orphan = (id: string, open: number, resolved: number, extra: Partial<OrphanFile> = {}): OrphanFile => ({ id, file: `.doan/comments/${id}.jsonl`, comments: { open, resolved }, uncertain: false, ...extra });

// project-feedback spec 'id 변경 안내', design §5.
describe("idChangeNotice", () => {
  test("counts every visible comment of the old id, plural", () => {
    expect(idChangeNotice("checkout-v1", [orphan("checkout-v1", 2, 1)]))
      .toEqual({ id: "checkout-v1", count: 3, text: "3 comments still use the old ID checkout-v1 and no longer show here." });
  });

  test("uses the singular for one comment, open or resolved", () => {
    const text = "1 comment still uses the old ID checkout-v1 and no longer shows here.";
    expect(idChangeNotice("checkout-v1", [orphan("checkout-v1", 1, 0)])?.text).toBe(text);
    expect(idChangeNotice("checkout-v1", [orphan("checkout-v1", 0, 1)])?.text).toBe(text);
  });

  test("shows nothing without a remembered id, or when the old id has no visible comment", () => {
    expect(idChangeNotice(null, [orphan("checkout-v1", 2, 0)])).toBeNull();
    expect(idChangeNotice("checkout-v1", [orphan("checkout-v1", 0, 0)])).toBeNull();
    expect(idChangeNotice("checkout-v1", [orphan("other", 2, 0)])).toBeNull();
    expect(idChangeNotice("checkout-v1", undefined)).toBeNull();
  });

  // ls could not read the old file: there is no count to say.
  test("shows nothing when the old file could not be read", () => {
    const unreadable = orphan("checkout-v1", 0, 0, { error: { code: "unreadable_comments", message: "m" } });
    delete unreadable.comments;
    expect(idChangeNotice("checkout-v1", [unreadable])).toBeNull();
  });

  // The old file is an orphan whatever the new id is: the orphan rule matches
  // the first doan:canvas string, valid or not, duplicate or not.
  test("still shows when the new id is a duplicate or invalid", () => {
    const uncertain = orphan("checkout-v1", 2, 0, { uncertain: true });
    expect(idChangeNotice("checkout-v1", [uncertain])?.count).toBe(2);
    expect(idChangeNotice("checkout-v1", [orphan("checkout-v1", 2, 0)])?.count).toBe(2);
  });

  test("clears when the id is restored: the old file is no longer an orphan", () => {
    expect(idChangeNotice("checkout-v1", [])).toBeNull();
  });

  // Only `reload` with `idChanged` hands the controller an old id. A path and
  // id that change together are not `moved` (no row keeps the id) and not
  // `idChanged` (the path is gone), so the canvas closes and no notice shows.
  test("a path and id changed together remember no id", () => {
    const row = (path: string, id: string): CanvasRow => ({ path, id, open: 0, resolved: 0, url: path });
    const list = (canvases: CanvasRow[]): FolderEntry => ({ path: "/repo", kind: "list", canvases, servedRev: 0 });
    const open = { folder: "/repo", canvas: "design/checkout.html", row: { id: "checkout-v1" } };
    const remembered = (update: ReturnType<typeof canvasViewUpdate>) => update.kind === "reload" && update.idChanged ? open.row.id : null;

    const idOnly = canvasViewUpdate([list([row("design/checkout.html", "checkout-v1")])], [list([row("design/checkout.html", "checkout")])], open);
    expect(idChangeNotice(remembered(idOnly), [orphan("checkout-v1", 3, 0)])?.count).toBe(3);

    const both = canvasViewUpdate([list([row("design/checkout.html", "checkout-v1")])], [list([row("design/cart.html", "cart")])], open);
    expect(both).toEqual({ kind: "clear", reason: "missing" });
    expect(idChangeNotice(remembered(both), [orphan("checkout-v1", 3, 0)])).toBeNull();

    const moved = canvasViewUpdate([list([row("design/checkout.html", "checkout-v1")])], [list([row("design/cart.html", "checkout-v1")])], open);
    expect(moved.kind).toBe("moved");
    expect(idChangeNotice(remembered(moved), [])).toBeNull();
  });
});
