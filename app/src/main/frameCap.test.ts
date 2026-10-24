import { expect, test } from "vitest";
import { capFrames, MAX_STATIC_FRAMES, MAX_STATIC_STRING } from "./frameCap";

const frames = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `f${i}` }));

test("capFrames passes a short list through untouched", () => {
  expect(capFrames([{ id: "a", title: "A" }, { id: "b" }])).toEqual({ frames: [{ id: "a", title: "A" }, { id: "b" }], truncated: false });
  expect(capFrames([])).toEqual({ frames: [], truncated: false });
});

test("capFrames keeps exactly 1,000 and flags 1,001", () => {
  expect(MAX_STATIC_FRAMES).toBe(1000);
  const exact = capFrames(frames(1000));
  expect(exact.frames).toHaveLength(1000);
  expect(exact.truncated).toBe(false);
  const over = capFrames(frames(1001));
  expect(over.frames).toHaveLength(1000);
  expect(over.frames.at(-1)).toEqual({ id: "f999" });
  expect(over.truncated).toBe(true);
});

test("capFrames keeps empty and duplicate ids, which are positions rather than keys", () => {
  expect(capFrames([{ id: "" }, { id: "x" }, { id: "x" }]).frames.map((f) => f.id)).toEqual(["", "x", "x"]);
});

test("capFrames clips an id or title to the rendered 200 code units", () => {
  expect(MAX_STATIC_STRING).toBe(200);
  const long = "a".repeat(201);
  const out = capFrames([{ id: long, title: long }]).frames[0] ?? { id: "" };
  expect(out.id).toBe("a".repeat(200));
  expect(out.title).toBe("a".repeat(200));
  expect(capFrames([{ id: "a".repeat(200) }]).frames[0]?.id).toHaveLength(200);
});

test("capFrames does not leave half a surrogate pair at the cut", () => {
  const emoji = "😀";
  const text = "a".repeat(199) + emoji;
  expect(capFrames([{ id: text }]).frames[0]?.id).toBe("a".repeat(199));
});

test("capFrames does not mutate its input", () => {
  const input = [{ id: "a".repeat(300), title: "t" }];
  capFrames(input);
  expect(input[0]?.id).toHaveLength(300);
});
