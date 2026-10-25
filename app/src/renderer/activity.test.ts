import { expect, test } from "vitest";
import { activityFor, movedFrom, moveActivity, pushActivity, timeText, type ActivityEvent } from "./activity";

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

test("a move carries the canvas's events to the new path and drops events of whatever sat there before", () => {
  const log = [event(1), event(2, { canvas: "design/flows/a.html" }), event(3, { folder: "/other" }), event(4, { canvas: "design/b.html" })];
  const moved = moveActivity(log, "/repo", "design/a.html", "design/flows/a.html");
  expect(activityFor(moved, "/repo", "design/flows/a.html")).toEqual([event(1, { canvas: "design/flows/a.html" })]);
  expect(activityFor(moved, "/repo", "design/a.html")).toEqual([]);
  expect(activityFor(moved, "/other", "design/a.html")).toEqual([event(3, { folder: "/other" })]);
  expect(activityFor(moved, "/repo", "design/b.html")).toHaveLength(1);
  expect(log).toHaveLength(4);
});

test("names the previous file of a move by its file name", () => {
  expect(movedFrom({ ...event(1), kind: "moved", from: "design/checkout.html" })).toBe("checkout.html");
  expect(movedFrom({ ...event(1), kind: "moved", from: "design/flows/old name.html" })).toBe("old name.html");
});
