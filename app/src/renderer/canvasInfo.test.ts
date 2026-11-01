import { expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { canvasInfo } from "./canvasInfo";

const row: CanvasRow = { path: ".doan/canvases/a.html", id: "a", width: 1440, url: "url" };

// Canvas rows carry no comment counts, so Canvas info shows none.
test("shows the canvas values without comment counts", () => {
  expect(canvasInfo(row, { frames: [{}, {}], truncated: false })).toEqual({ path: ".doan/canvases/a.html", id: "a", width: "1440 px", frames: "2" });
});

test("uses a dash for missing width, id and layout", () => {
  expect(canvasInfo({ path: ".doan/canvases/a.html", url: "url" }, null)).toEqual({ path: ".doan/canvases/a.html", id: "—", width: "—", frames: "—" });
});

test("distinguishes no frames from truncated layout", () => {
  expect(canvasInfo(row, { frames: [], truncated: false }).frames).toBe("0");
  expect(canvasInfo(row, { frames: [], truncated: true }).frames).toBe("0");
});

test("frame overflow requires 1000 rendered frames and the static count evidence when available", () => {
  const frames = Array.from({ length: 1000 }, () => ({ id: "frame" }));
  expect(canvasInfo(row, { frames: [{}], truncated: true }).frames).toBe("1");
  expect(canvasInfo({ ...row, frames }, { frames, truncated: true }).frames).toBe("1000");
  expect(canvasInfo({ ...row, frames, framesTruncated: false }, { frames, truncated: true }).frames).toBe("1000");
  expect(canvasInfo({ ...row, frames, framesTruncated: true }, { frames, truncated: false }).frames).toBe("1,000+");
  expect(canvasInfo({ ...row, frames, framesTruncated: true }, { frames: [{}], truncated: true }).frames).toBe("1");
  expect(canvasInfo(row, { frames, truncated: true }).frames).toBe("1,000+");
  expect(canvasInfo(row, { frames, truncated: false }).frames).toBe("1000");
});
