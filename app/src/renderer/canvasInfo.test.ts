import { expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { canvasInfo } from "./canvasInfo";

const row: CanvasRow = { path: "design/a.html", id: "a", width: 1440, open: 2, resolved: 1, url: "url" };

test("shows all canvas values and counts", () => {
  expect(canvasInfo(row, { frames: [{}, {}], truncated: false })).toEqual({ path: "design/a.html", id: "a", width: "1440 px", frames: "2", open: "2", resolved: "1" });
});

test("uses a dash for missing width, id and layout, preserving zero comments", () => {
  expect(canvasInfo({ path: "design/a.html", url: "url", open: 0, resolved: 0 }, null)).toEqual({ path: "design/a.html", id: "—", width: "—", frames: "—", open: "0", resolved: "0" });
});

test("distinguishes no frames from truncated layout", () => {
  expect(canvasInfo(row, { frames: [], truncated: false }).frames).toBe("0");
  expect(canvasInfo(row, { frames: [], truncated: true }).frames).toBe("1,000+");
});
