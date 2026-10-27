import { describe, expect, test } from "vitest";
import type { Comment, Target } from "../formats/types";
import { foldText } from "../formats/foldText";
import type { CanvasRow, OrphanFile } from "../main/view";
import { feedbackFocusAfterRemoval, feedbackGroups, feedbackKey, feedbackTree, type FeedbackFile } from "./feedbackGroups";

const kim = { kind: "human", name: "Kim Doe" } as const;
let seq = 0;
function comment(target: Target, extra: Partial<Comment> = {}): Comment {
  seq += 1;
  const at = `2026-10-25T10:${String(seq).padStart(2, "0")}:00.000Z`;
  return { comment: `cmt_${seq}`, status: "open", body: `Body ${seq}`, target, canvasHash: "sha256:0", createdBy: kim, createdAt: at, updatedAt: at, ...extra };
}
const resolved = (target: Target, at: string, extra: Partial<Comment> = {}) => comment(target, { status: "resolved", resolvedAt: at, resolvedBy: kim, ...extra });
const element = (doanId: string, frame?: string): Target => ({ element: { doanId, selector: `[data-doan-id="${doanId}"]`, html: `<button data-doan-id="${doanId}">` }, ...(frame ? { frame } : {}) });
const row = (path: string, id: string | undefined, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, ...(id ? { id } : {}), open: 0, resolved: 0, url: path, frames: [], ...extra });
const orphan = (id: string, open: number, resolvedCount: number, extra: Partial<OrphanFile> = {}): OrphanFile => ({ id, file: `.doan/comments/${id}.jsonl`, comments: { open, resolved: resolvedCount }, uncertain: false, ...extra });
const file = (id: string, comments: Comment[], toReview = 0): FeedbackFile => ({ id, comments, toReview });

// project-feedback spec 'Feedback 패널', design §3, draft `feedback-panel`.
describe("feedbackGroups", () => {
  test("orphans first, then canvases in Overview card order, not ls order", () => {
    // ls order is path byte order; the Overview puts a folder's own canvases
    // before its subfolders (overviewSections).
    const rows = [row(".doan/canvases/b.html", "b"), row(".doan/canvases/sub/a.html", "a"), row(".doan/canvases/z.html", "z")];
    const files = rows.map(r => file(r.id!, [comment({})]));
    const view = feedbackGroups([...files, file("old", [comment({})])], rows, [orphan("old", 1, 0)], "open");
    expect(view.orphans?.files.map(group => group.id)).toEqual(["old"]);
    expect(view.canvases.map(group => group.row.path)).toEqual([".doan/canvases/b.html", ".doan/canvases/z.html", ".doan/canvases/sub/a.html"]);
  });

  test("puts canvas targets in Whole canvas first, frames in document order, then stored frames not in the canvas", () => {
    const frames = [{ id: "hero", title: "Hero" }, { id: "shipping", title: "Shipping" }, { id: "payment" }];
    const canvasWide = comment({}, { body: "Tighten the rhythm.\nSecond line." });
    const loose = comment(element("cta"));
    const label = comment(element("ship-next", "shipping"), { body: "Disable until the form is valid" });
    const frameTarget = comment({ frame: "shipping" });
    const hero = comment(element("hero-cta", "hero"));
    const gone = comment({ frame: "summary-v1" });
    const goneElement = comment(element("old-total", "summary-v1"));
    const view = feedbackGroups([file("checkout", [gone, label, canvasWide, hero, frameTarget, loose, goneElement])], [row(".doan/canvases/checkout.html", "checkout", { title: "Checkout", frames })], [], "open");
    const group = view.canvases[0];
    if (group?.kind !== "comments") throw new Error("no comments group");
    expect(group.frames.map(frame => [frame.kind, frame.label, frame.rows.map(r => r.comment)])).toEqual([
      ["whole", "Whole canvas", [canvasWide.comment, loose.comment]],
      ["frame", "Hero", [hero.comment]],
      ["frame", "Shipping", [label.comment, frameTarget.comment]],
      ["missing", "summary-v1 (not in canvas)", [gone.comment, goneElement.comment]],
    ]);
    // Inside a frame group the target label loses its " · in <frame>" part.
    expect(group.frames[2]?.rows.map(r => [r.label, r.line])).toEqual([
      ["Element · button ship-next", "Disable until the form is valid"],
      ["Frame · Shipping", frameTarget.body],
    ]);
    expect(group.frames[0]?.rows[0]).toEqual({ comment: canvasWide.comment, status: "open", label: "Canvas", title: "Canvas", line: "Tighten the rhythm." });
    expect(group.frames[3]?.rows[1]?.label).toBe("Element · button old-total");
    expect(group.frames[3]?.rows[1]?.title).toBe('[data-doan-id="old-total"]');
    expect(group.count).toBe(7);
  });

  // A canvas with more than 1,000 frames lists only the first 1,000; a stored
  // frame past the cut may still be in the canvas, so it is not "not in canvas".
  test("puts frames past a truncated list after the listed ones, by their stored id", () => {
    const frames = [{ id: "f1", title: "One" }];
    const late = comment({ frame: "f1500" });
    const first = comment({ frame: "f1" });
    const view = feedbackGroups([file("big", [late, first])], [row(".doan/canvases/big.html", "big", { frames, framesTruncated: true })], [], "open");
    const group = view.canvases[0];
    if (group?.kind !== "comments") throw new Error("no comments group");
    expect(group.frames.map(frame => [frame.kind, frame.label])).toEqual([["frame", "One"], ["frame", "f1500"]]);
  });

  test("keys frame groups by frame id and occurrence, so repeated frame ids stay apart from stored ones", () => {
    const frames = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const view = feedbackGroups([file("c", [comment({ frame: "b" }), comment({}), comment({ frame: "x" })])], [row(".doan/canvases/c.html", "c", { frames })], [], "open");
    const group = view.canvases[0];
    if (group?.kind !== "comments") throw new Error("no comments group");
    expect(group.key).toBe("canvas:.doan/canvases/c.html");
    expect(group.frames.map(frame => frame.key)).toEqual([".doan/canvases/c.html#whole", ".doan/canvases/c.html#frame:b:0", ".doan/canvases/c.html#saved:x"]);
  });

  // R-T4 ⚪5: collapse and focus state is kept by key, so a frame inserted
  // before a group must not hand its key to the neighbour.
  test("a frame inserted before a group keeps that group's key", () => {
    const comments = [comment({ frame: "b" })];
    const key = (frames: { id: string }[]) => {
      const group = feedbackGroups([file("c", comments)], [row(".doan/canvases/c.html", "c", { frames })], [], "open").canvases[0];
      if (group?.kind !== "comments") throw new Error("no comments group");
      return group.frames.map(frame => frame.key);
    };
    expect(key([{ id: "b" }])).toEqual(key([{ id: "new" }, { id: "b" }]));
    // A repeated id counts its occurrences; comments go to the first one.
    expect(key([{ id: "b" }, { id: "b" }])).toEqual([".doan/canvases/c.html#frame:b:0"]);
  });

  test("runs Resolved rows by resolution time, newest first, and keeps Open rows in file order", () => {
    const frames = [{ id: "shipping", title: "Shipping" }];
    const older = resolved({ frame: "shipping" }, "2026-10-25T12:00:00.000Z");
    const newer = resolved(element("postcode", "shipping"), "2026-10-25T13:00:00.000Z");
    const openA = comment({ frame: "shipping" });
    const openB = comment(element("x", "shipping"));
    const files = [file("c", [older, openB, newer, openA])];
    const rows = [row(".doan/canvases/c.html", "c", { frames })];
    const resolvedView = feedbackGroups(files, rows, [], "resolved").canvases[0];
    const openView = feedbackGroups(files, rows, [], "open").canvases[0];
    if (resolvedView?.kind !== "comments" || openView?.kind !== "comments") throw new Error("no comments group");
    expect(resolvedView.frames[0]?.rows.map(r => [r.comment, r.status])).toEqual([[newer.comment, "resolved"], [older.comment, "resolved"]]);
    expect(openView.frames[0]?.rows.map(r => r.comment)).toEqual([openB.comment, openA.comment]);
  });

  test("gives same-title canvases their file name and no one else", () => {
    const rows = [row(".doan/canvases/2026-10-checkout-revamp.html", "revamp", { title: "Checkout" }), row(".doan/canvases/checkout/checkout.html", "checkout", { title: "Checkout" }), row(".doan/canvases/settings/billing.html", "billing", { title: "Billing & plans" })];
    const view = feedbackGroups(rows.map(r => file(r.id!, [comment({})])), rows, [], "open");
    expect(view.canvases.map(group => [group.name, group.fileName])).toEqual([
      ["Checkout", "2026-10-checkout-revamp.html"],
      ["Checkout", "checkout.html"],
      ["Billing & plans", undefined],
    ]);
  });

  // Draft confirmation (2026-10-25): Open still shows a canvas head that has
  // resolutions to review; other groups without the chosen status are hidden.
  test("Open shows a canvas with only resolutions to review as a head, and hides other empty canvases", () => {
    const rows = [row(".doan/canvases/a.html", "a"), row(".doan/canvases/b.html", "b"), row(".doan/canvases/c.html", "c")];
    const files = [file("a", [resolved({}, "2026-10-25T12:00:00.000Z")], 1), file("b", [resolved({}, "2026-10-25T12:00:00.000Z")]), file("c", [comment({})])];
    const open = feedbackGroups(files, rows, [], "open");
    expect(open.canvases.map(group => group.kind === "comments" ? [group.row.id, group.count, group.toReview, group.frames.length] : null)).toEqual([["a", 0, 1, 0], ["c", 1, 0, 1]]);
    const done = feedbackGroups(files, rows, [], "resolved");
    expect(done.canvases.map(group => group.row.id)).toEqual(["a", "b"]);
  });

  test("leaves out rows ls could not read and rows without an id or comments", () => {
    const rows = [row(".doan/canvases/none.html", undefined), row(".doan/canvases/broken.html", undefined, { error: { code: "unreadable_canvas", message: "m" } })];
    expect(feedbackGroups([], rows, [], "open").canvases).toEqual([]);
  });

  // orch.md 2026-10-26 (R-T4 🟡1): ls sends no id for an invalid or duplicate
  // doan:canvas but still counts its comments, which comments:project never
  // reads. The canvas keeps its Overview place with the ls counts only.
  test("a canvas without a usable id but with ls comments is a count-only group in Overview order", () => {
    const rows = [row(".doan/canvases/a.html", "a"), row(".doan/canvases/bad.html", undefined, { title: "Bad", open: 2, resolved: 1 }), row(".doan/canvases/c.html", "c")];
    const files = [file("a", [comment({})]), file("c", [comment({})])];
    const open = feedbackGroups(files, rows, [], "open");
    expect(open.canvases.map(group => [group.row.path, group.kind])).toEqual([[".doan/canvases/a.html", "comments"], [".doan/canvases/bad.html", "countOnly"], [".doan/canvases/c.html", "comments"]]);
    expect(open.canvases[1]).toEqual({ key: "canvas:.doan/canvases/bad.html", row: rows[1], name: "Bad", kind: "countOnly", count: 2, open: 2, resolved: 1, note: "This canvas needs a unique, valid ID — run doan check" });
    expect(open.counts).toEqual({ open: 4, resolved: 1 });
    expect(feedbackGroups(files, rows, [], "resolved").canvases.map(group => [group.row.path, group.kind === "countOnly" ? group.count : null])).toEqual([[".doan/canvases/bad.html", 1]]);
    const noResolved = [row(".doan/canvases/bad.html", undefined, { open: 2 })];
    expect(feedbackGroups([], noResolved, [], "resolved").canvases).toEqual([]);
  });

  test("a count-only canvas follows the same-title file name rule", () => {
    const rows = [row(".doan/canvases/checkout.html", "checkout", { title: "Checkout" }), row(".doan/canvases/old/checkout.html", undefined, { title: "Checkout", open: 1 })];
    const view = feedbackGroups([file("checkout", [comment({})])], rows, [], "open");
    expect(view.canvases.map(group => [group.kind, group.name, group.fileName])).toEqual([["comments", "Checkout", "checkout.html"], ["countOnly", "Checkout", "checkout.html"]]);
  });

  // Two files sharing one id both lose the id and both carry that id's counts
  // (cli read.go); ls does not say which rows share it, so each card's group
  // shows the counts its Overview card shows, and both add to the segments.
  test("two rows sharing one id are two count-only groups, as the Overview shows two cards", () => {
    const rows = [row(".doan/canvases/a.html", undefined, { open: 1 }), row(".doan/canvases/b.html", undefined, { open: 1 })];
    const view = feedbackGroups([], rows, [], "open");
    expect(view.canvases.map(group => [group.key, group.kind === "countOnly" ? group.count : null])).toEqual([["canvas:.doan/canvases/a.html", 1], ["canvas:.doan/canvases/b.html", 1]]);
    expect(view.counts).toEqual({ open: 2, resolved: 0 });
  });

  test("a canvas without a usable id whose comments ls could not read is an error group", () => {
    const rows = [row(".doan/canvases/bad.html", undefined, { commentsError: { code: "unreadable_comments", message: ".doan/comments/Bad.jsonl: permission denied" } })];
    expect(feedbackGroups([], rows, [], "resolved").canvases.map(group => group.kind === "error" ? group.error : group.kind)).toEqual([".doan/comments/Bad.jsonl: permission denied"]);
  });

  test("a canvas whose comments could not be read is a group-level error in both views, outside the counts", () => {
    const rows = [row(".doan/canvases/a.html", "a"), row(".doan/canvases/b.html", "b", { commentsError: { code: "unreadable_comments", message: ".doan/comments/b.jsonl: permission denied" } }), row(".doan/canvases/c.html", "c")];
    const files: FeedbackFile[] = [{ id: "a", error: "EACCES" }, file("c", [comment({})])];
    for (const status of ["open", "resolved"] as const) {
      const view = feedbackGroups(files, rows, [], status);
      expect(view.canvases.filter(group => group.kind === "error").map(group => group.kind === "error" ? [group.row.id, group.error] : null))
        .toEqual([["a", "EACCES"], ["b", ".doan/comments/b.jsonl: permission denied"]]);
    }
    expect(feedbackGroups(files, rows, [], "open").counts).toEqual({ open: 1, resolved: 0 });
  });

  // R-T4 ⚪3: the renderer's ls and comments:project's reply can be from
  // different moments, so a missing entry is "not read yet", not zero comments.
  test("a canvas id with no file entry is pending with its ls counts, hidden when ls has none of the status", () => {
    const rows = [row(".doan/canvases/a.html", "a", { open: 2, resolved: 0 }), row(".doan/canvases/b.html", "b")];
    const open = feedbackGroups([], rows, [], "open");
    expect(open.canvases).toEqual([{ key: "canvas:.doan/canvases/a.html", row: rows[0], name: "a", kind: "pending", count: 2 }]);
    expect(open.counts).toEqual({ open: 2, resolved: 0 });
    expect(feedbackGroups([], rows, [], "resolved").canvases).toEqual([]);
  });

  // The fold drops duplicate lines a union merge leaves, as the CLI's does.
  test("counts equal ls when a union merge duplicated lines", () => {
    const hash = "sha256:" + "0".repeat(64);
    const line = (id: number, type: string, cmt: number, extra = "") => `{"v":1,"id":"evt_00000000-0000-4000-8000-00000000000${id}","at":"2026-10-21T10:0${id}:00.000Z","type":"${type}","comment":"cmt_00000000-0000-4000-8000-0000000000a${cmt}","by":{"kind":"human","name":"a"}${extra}}`;
    const create = (id: number, cmt: number) => line(id, "create", cmt, `,"body":"b${cmt}","canvasHash":"${hash}","target":{}`);
    const text = [create(1, 1), create(2, 2), create(1, 1), create(3, 3), line(4, "resolve", 3), create(2, 2), line(4, "resolve", 3)].join("\n") + "\n";
    const { comments } = foldText(text);
    const ls = row(".doan/canvases/a.html", "a", { open: 2, resolved: 1 });
    const open = feedbackGroups([file("a", comments)], [ls], [], "open");
    expect(open.counts).toEqual({ open: ls.open, resolved: ls.resolved });
    expect(open.canvases[0]?.kind === "comments" && open.canvases[0].count).toBe(2);
  });

  test("segment counts add up canvases and orphans, whichever status is chosen", () => {
    const rows = [row(".doan/canvases/a.html", "a")];
    const files = [file("a", [comment({}), resolved({}, "2026-10-25T12:00:00.000Z")]), file("old", [comment({}), comment({})])];
    const orphans = [orphan("old", 2, 0), orphan("Foo", 3, 1)];
    expect(feedbackGroups(files, rows, orphans, "open").counts).toEqual({ open: 6, resolved: 2 });
    expect(feedbackGroups(files, rows, orphans, "resolved").counts).toEqual({ open: 6, resolved: 2 });
  });
});

describe("feedbackGroups orphans", () => {
  test("one group per file in ls order with the chosen status's cards, Resolved newest first", () => {
    const a1 = comment({});
    const a2 = resolved({}, "2026-10-25T12:00:00.000Z");
    const a3 = resolved({}, "2026-10-25T13:00:00.000Z");
    const b1 = comment(element("x", "gone"));
    const files = [file("checkout-v1", [a1, a2, a3]), file("promo-banner", [b1])];
    const orphans = [orphan("checkout-v1", 1, 2), orphan("promo-banner", 1, 0)];
    const open = feedbackGroups(files, [], orphans, "open").orphans;
    expect(open).toEqual({
      readOnly: false,
      count: 2,
      files: [
        { key: "orphan:.doan/comments/checkout-v1.jsonl", id: "checkout-v1", file: ".doan/comments/checkout-v1.jsonl", kind: "cards", count: 1, comments: [a1] },
        { key: "orphan:.doan/comments/promo-banner.jsonl", id: "promo-banner", file: ".doan/comments/promo-banner.jsonl", kind: "cards", count: 1, comments: [b1] },
      ],
    });
    const done = feedbackGroups(files, [], orphans, "resolved").orphans;
    expect(done?.files.map(group => group.kind === "cards" ? group.comments.map(c => c.comment) : null)).toEqual([[a3.comment, a2.comment]]);
  });

  test("hides files with no visible comment, and the section when nothing is left", () => {
    const view = feedbackGroups([file("deleted", [])], [], [orphan("deleted", 0, 0)], "open");
    expect(view.orphans).toBeNull();
    expect(feedbackGroups([], [], [], "open").orphans).toBeNull();
  });

  test("shows only orphans when the project has no canvases", () => {
    const view = feedbackGroups([file("old", [comment({})])], [], [orphan("old", 1, 0)], "open");
    expect(view.canvases).toEqual([]);
    expect(view.orphans?.files).toHaveLength(1);
  });

  test("a file that is not a canvas id is a count-only row with the ls counts", () => {
    const foreign = orphan("Foo", 3, 1);
    expect(feedbackGroups([], [], [foreign], "open").orphans?.files).toEqual([
      { key: "orphan:.doan/comments/Foo.jsonl", id: "Foo", file: ".doan/comments/Foo.jsonl", kind: "countOnly", count: 3, open: 3, resolved: 1 },
    ]);
    expect(feedbackGroups([], [], [orphan("Foo", 3, 0)], "resolved").orphans).toBeNull();
  });

  test("a kebab file with no file entry is pending with its ls counts", () => {
    const view = feedbackGroups([], [], [orphan("old", 2, 1)], "open");
    expect(view.orphans).toEqual({ readOnly: false, count: 2, files: [{ key: "orphan:.doan/comments/old.jsonl", id: "old", file: ".doan/comments/old.jsonl", kind: "pending", count: 2 }] });
    expect(view.counts).toEqual({ open: 2, resolved: 1 });
    expect(feedbackGroups([], [], [orphan("old", 2, 0)], "resolved").orphans).toBeNull();
  });

  test("a file named .jsonl (empty id) is a count-only row", () => {
    const empty: OrphanFile = { id: "", file: ".doan/comments/.jsonl", comments: { open: 1, resolved: 0 }, uncertain: false };
    expect(feedbackGroups([], [], [empty], "open").orphans?.files).toEqual([
      { key: "orphan:.doan/comments/.jsonl", id: "", file: ".doan/comments/.jsonl", kind: "countOnly", count: 1, open: 1, resolved: 0 },
    ]);
  });

  test("a file ls or main could not read is an error group in both views", () => {
    const unreadable = orphan("gone", 0, 0, { error: { code: "unreadable_comments", message: ".doan/comments/gone.jsonl: permission denied" } });
    delete unreadable.comments;
    const failed = orphan("late", 2, 0);
    const files: FeedbackFile[] = [{ id: "late", error: "EACCES" }];
    for (const status of ["open", "resolved"] as const) {
      expect(feedbackGroups(files, [], [unreadable, failed], status).orphans?.files.map(group => [group.id, group.kind === "error" ? group.error : group.kind])).toEqual([
        ["gone", ".doan/comments/gone.jsonl: permission denied"],
        ["late", "EACCES"],
      ]);
    }
  });

  test("is read-only when ls is not sure the files have no canvas", () => {
    const view = feedbackGroups([file("old", [comment({})])], [], [orphan("old", 1, 0, { uncertain: true })], "open");
    expect(view.orphans?.readOnly).toBe(true);
  });
});

// project-feedback spec 'Feedback 패널' keyboard: next row, else previous, else the panel title.
describe("feedbackFocusAfterRemoval", () => {
  test("moves to the next row still shown", () => {
    expect(feedbackFocusAfterRemoval(["a", "b", "c", "d"], ["a", "d"], "b")).toEqual({ kind: "row", key: "d" });
  });

  test("falls back to the previous row", () => {
    expect(feedbackFocusAfterRemoval(["a", "b", "c"], ["a"], "c")).toEqual({ kind: "row", key: "a" });
  });

  test("falls back to the panel title when no row is left", () => {
    expect(feedbackFocusAfterRemoval(["a"], [], "a")).toEqual({ kind: "title" });
  });

  test("leaves focus alone while the focused row is still shown", () => {
    expect(feedbackFocusAfterRemoval(["a", "b"], ["b"], "b")).toBeNull();
  });
});

// The rows of the Feedback tree as the keyboard walks them (draft
// `feedback-panel` behavior): heads and comment rows, collapsed groups hiding
// their children; notes, cards and messages are not tree rows.
describe("feedbackTree", () => {
  const frames = [{ id: "shipping", title: "Shipping" }];
  const rows = [row(".doan/canvases/c.html", "c", { title: "Checkout", frames }), row(".doan/canvases/bad.html", undefined, { title: "Bad", open: 2, resolved: 1 })];
  const shipping = comment({ frame: "shipping" });
  const wide = comment({});
  const files = [file("c", [wide, shipping]), file("old", [comment({})])];
  const view = () => feedbackGroups(files, rows, [orphan("old", 1, 0), orphan("Foo", 3, 1)], "open");

  test("lists orphans, their files, canvases, frame groups and comment rows with levels and parents", () => {
    expect(feedbackTree(view(), new Set()).map(item => [item.key, item.level, item.parent ?? null, item.expanded ?? null])).toEqual([
      ["orphans", 1, null, true],
      ["orphan:.doan/comments/old.jsonl", 2, "orphans", true],
      ["orphan:.doan/comments/Foo.jsonl", 2, "orphans", null],
      // Overview card order: by title.
      ["canvas:.doan/canvases/bad.html", 1, null, null],
      ["canvas:.doan/canvases/c.html", 1, null, true],
      [".doan/canvases/c.html#whole", 2, "canvas:.doan/canvases/c.html", true],
      [`item:.doan/canvases/c.html:${wide.comment}`, 3, ".doan/canvases/c.html#whole", null],
      [".doan/canvases/c.html#frame:shipping:0", 2, "canvas:.doan/canvases/c.html", true],
      [`item:.doan/canvases/c.html:${shipping.comment}`, 3, ".doan/canvases/c.html#frame:shipping:0", null],
    ]);
  });

  // Draft `feedback-panel` "Zero counts": a head shown in Open only for its
  // review entry has nothing under it and reads as collapsed.
  test("a canvas head with no row of the chosen status is collapsed", () => {
    const done = comment({}, { status: "resolved", resolvedAt: "2026-10-25T00:00:00.000Z", resolvedBy: { kind: "agent", name: "codex" } });
    const zero = feedbackGroups([file("p", [done], 2)], [row(".doan/canvases/p.html", "p", { title: "Profile" })], [], "open");
    expect(feedbackTree(zero, new Set()).map(item => [item.key, item.expanded])).toEqual([["canvas:.doan/canvases/p.html", false]]);
    expect(feedbackTree(zero, new Set(["canvas:.doan/canvases/p.html"])).map(item => item.expanded)).toEqual([false]);
  });

  test("a collapsed group hides what is under it", () => {
    const keys = feedbackTree(view(), new Set(["orphans", ".doan/canvases/c.html#whole"])).map(item => item.key);
    expect(keys).toEqual(["orphans", "canvas:.doan/canvases/bad.html", "canvas:.doan/canvases/c.html", ".doan/canvases/c.html#whole", ".doan/canvases/c.html#frame:shipping:0", `item:.doan/canvases/c.html:${shipping.comment}`]);
    expect(feedbackTree(view(), new Set(["canvas:.doan/canvases/c.html"])).map(item => item.key)).not.toContain(".doan/canvases/c.html#whole");
  });
});

// Sidebar tree keys: ↑↓, Home/End, → expands or enters, ← collapses or goes to the parent, Enter opens.
describe("feedbackKey", () => {
  const tree = [
    { key: "g", level: 1, expanded: true },
    { key: "f", level: 2, parent: "g", expanded: false },
    { key: "h", level: 2, parent: "g", expanded: true },
    { key: "i", level: 3, parent: "h" },
    { key: "n", level: 1 },
  ];
  test.each([
    ["ArrowDown", 0, { focus: 1 }], ["ArrowDown", 4, { focus: 4 }],
    ["ArrowUp", 2, { focus: 1 }], ["ArrowUp", 0, { focus: 0 }],
    ["Home", 3, { focus: 0 }], ["End", 1, { focus: 4 }],
    ["ArrowRight", 1, { toggle: "f" }], ["ArrowRight", 2, { focus: 3 }], ["ArrowRight", 3, null], ["ArrowRight", 4, null],
    ["ArrowLeft", 2, { toggle: "h" }], ["ArrowLeft", 3, { focus: 2 }], ["ArrowLeft", 1, { focus: 0 }], ["ArrowLeft", 4, null],
    ["Enter", 3, { act: true }], ["a", 0, undefined],
  ] as const)("%s on row %i", (key, index, result) => {
    expect(feedbackKey(tree, index, key)).toEqual(result);
  });
});
