import { describe, expect, it } from "vitest";
import { combineQueued, nextQueued } from "./queue";
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
describe("nextQueued", () => {
  const isCommand = (item: string) => item.startsWith("/");
  it("sends every queued message together when none is a command", () => {
    expect(nextQueued(["a", "b", "c"], isCommand)).toEqual(["a", "b", "c"]);
  });
  it("sends a command alone, never merged with a message before or after it", () => {
    expect(nextQueued(["a", "/compact", "b"], isCommand)).toEqual(["a"]);
    expect(nextQueued(["/compact", "b", "c"], isCommand)).toEqual(["/compact"]);
    expect(nextQueued(["/compact", "/clear"], isCommand)).toEqual(["/compact"]);
  });
  it("sends nothing from an empty queue", () => {
    expect(nextQueued([], isCommand)).toEqual([]);
  });
  // The service's predicate: a command or an agent's message (a row with an origin) goes alone.
  it("sends an agent's message alone, never joined with the person's rows before or after it", () => {
    type Row = { text: string; origin?: { kind: "handoff"; conversationId: string } };
    const alone = (row: Row) => !!row.origin || row.text.startsWith("/");
    const agent: Row = { text: "From drafts: use the new price", origin: { kind: "handoff", conversationId: "s" } };
    expect(nextQueued<Row>([{ text: "a" }, agent, { text: "b" }], alone)).toEqual([{ text: "a" }]);
    expect(nextQueued<Row>([agent, { text: "b" }], alone)).toEqual([agent]);
    expect(nextQueued<Row>([agent, agent], alone)).toEqual([agent]);
  });
});
