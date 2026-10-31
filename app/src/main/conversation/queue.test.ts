import { expect, it } from "vitest";
import { combineQueued } from "./queue";
import type { Anchor } from "./types";
const frame = (id: string): Anchor => ({ frame: { id } });
it("joins queued messages in order with a blank line and renumbers anchors", () => {
  expect(combineQueued([
    { text: "Look at {{1}} and {{2}}", anchors: [frame("a"), frame("b")], attachments: ["x"] },
    { text: "Also {{1}}, again {{1}}", anchors: [frame("c")], attachments: [] },
    { text: "Last", anchors: [], attachments: ["y", "z"] },
  ])).toEqual({ ok: true, text: "Look at {{1}} and {{2}}\n\nAlso {{3}}, again {{3}}\n\nLast", anchors: [frame("a"), frame("b"), frame("c")], attachments: ["x", "y", "z"] });
});
it("refuses more than ten attachments together", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `a${i}`);
  expect(combineQueued([{ text: "one", anchors: [], attachments: ten }]).ok).toBe(true);
  expect(combineQueued([{ text: "one", anchors: [], attachments: ten }, { text: "two", anchors: [], attachments: ["b"] }])).toEqual({ ok: false, error: "attachment_limit" });
});
