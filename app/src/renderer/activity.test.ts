import { describe, expect, test } from "vitest";
import type { Author, Comment } from "../formats/types";
import { activityFor, activityKind, movedFrom, pushActivity, resolvedActivity, timeText, type ActivityEvent } from "./activity";

const event = (second: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({ folder: "/repo", canvas: "design/a.html", at: new Date(2026, 9, 22, 14, 3, second), kind: "opened", ...extra });

test("sorts newest first and drops the oldest beyond the per-canvas limit", () => {
  const original = [event(3), event(1)];
  const log = pushActivity(original, event(2), 2);
  expect(activityFor(log, "/repo", "design/a.html").map((item) => item.at.getSeconds())).toEqual([3, 2]);
  expect(original).toHaveLength(2);
  expect(pushActivity([], event(0), 0)).toEqual([]);
});

test("keeps canvas and project keys separate without ambiguous concatenation", () => {
  let log = pushActivity([], event(1), 1);
  log = pushActivity(log, event(2, { folder: "/other" }), 1);
  log = pushActivity(log, event(3, { canvas: "design/b.html" }), 1);
  log = pushActivity(log, event(4, { kind: "reloaded" }), 1);
  expect(log).toHaveLength(3);
  expect(activityFor(log, "/repo", "design/a.html")).toEqual([event(4, { kind: "reloaded" })]);
  expect(activityFor(log, "/other", "design/a.html")).toEqual([event(2, { folder: "/other" })]);
  expect(activityFor(log, "/missing", "design/a.html")).toEqual([]);
});

test("puts the latest insertion first for simultaneous events", () => {
  expect(pushActivity([event(1)], event(1, { kind: "reloaded" }), 50).map((item) => item.kind)).toEqual(["reloaded", "opened"]);
});

test("formats local time with 24-hour digits independently of locale", () => {
  expect(timeText(new Date(2026, 9, 22, 0, 0, 5))).toBe("00:00:05");
  expect(timeText(new Date(2026, 9, 22, 14, 3, 21))).toBe("14:03:21");
});

test("keys a canvas with an id by its id across paths, and one without by its path", () => {
  const log = [
    event(4, { canvas: "design/flows/a.html", id: "a", kind: "moved", from: "design/a.html" }),
    event(3, { id: "replacement" }),
    event(2, { id: "a" }),
    event(1),
    event(0, { folder: "/other", id: "a" }),
  ];
  expect(activityFor(log, "/repo", "design/flows/a.html", "a").map((item) => item.at.getSeconds())).toEqual([4, 2]);
  expect(activityFor(log, "/repo", "design/a.html", "replacement").map((item) => item.at.getSeconds())).toEqual([3]);
  expect(activityFor(log, "/repo", "design/a.html").map((item) => item.at.getSeconds())).toEqual([1]);
  expect(activityFor(log, "/repo", "design/a.html", "").map((item) => item.at.getSeconds())).toEqual([1]);
});

test("keeps the per-canvas limit by canvas id, not by path", () => {
  let log = pushActivity([], event(1, { id: "a" }), 1);
  log = pushActivity(log, event(2, { id: "b" }), 1);
  expect(log.map((item) => item.at.getSeconds())).toEqual([2, 1]);
  log = pushActivity(log, event(3, { canvas: "design/flows/a.html", id: "a" }), 1);
  expect(log.map((item) => item.at.getSeconds())).toEqual([3, 2]);
});

test("names the previous file of a move by its file name", () => {
  expect(movedFrom({ ...event(1), kind: "moved", from: "design/checkout.html" })).toBe("checkout.html");
  expect(movedFrom({ ...event(1), kind: "moved", from: "design/flows/old name.html" })).toBe("old name.html");
});

test("a reload is Changed only when the canvas row revision differs", () => {
  expect(activityKind(3, 4)).toBe("changed");
  expect(activityKind(4, 4)).toBe("reloaded");
  expect(activityKind(undefined, 4)).toBe("reloaded");
  expect(activityKind(4, undefined)).toBe("reloaded");
  expect(activityKind(undefined, undefined)).toBe("reloaded");
});

describe("resolvedActivity", () => {
  const kim: Author = { kind: "human", name: "Kim Doe", email: "kim@example.com" };
  const codex: Author = { kind: "agent", name: "codex" };
  const comment = (id: string, resolvedBy?: Author, resolvedAt = ""): Comment => ({
    comment: id, status: resolvedBy ? "resolved" : "open", body: "Body", target: {}, canvasHash: "sha256-x",
    createdBy: kim, createdAt: "2026-10-25T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z",
    ...(resolvedBy ? { resolvedBy, resolvedAt } : {}),
  });

  test("counts comments that turned resolved and names each resolver once, in resolve order", () => {
    const before = [comment("cmt_a"), comment("cmt_b"), comment("cmt_c"), comment("cmt_d"), comment("cmt_e", codex, "2026-10-25T09:30:00.000Z")];
    const after = [
      comment("cmt_a", kim, "2026-10-25T10:02:00.000Z"),
      comment("cmt_b", codex, "2026-10-25T10:01:00.000Z"),
      comment("cmt_c", codex, "2026-10-25T10:03:00.000Z"),
      comment("cmt_d"),
      comment("cmt_e", codex, "2026-10-25T09:30:00.000Z"),
    ];
    expect(resolvedActivity(before, after)).toEqual({ count: 3, resolvedBy: ["codex", "Kim Doe"] });
  });

  test("records nothing for a resolve and reopen between two reads, a new comment or a deleted one", () => {
    expect(resolvedActivity([comment("cmt_a")], [comment("cmt_a")])).toBeNull();
    expect(resolvedActivity([], [comment("cmt_new", codex, "2026-10-25T10:01:00.000Z")])).toBeNull();
    expect(resolvedActivity([comment("cmt_a")], [])).toBeNull();
  });

  test("the first read is a baseline only", () => {
    expect(resolvedActivity(null, [comment("cmt_a", codex, "2026-10-25T10:01:00.000Z")])).toBeNull();
  });
});
