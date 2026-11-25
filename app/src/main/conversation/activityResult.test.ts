import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { LIMITS } from "./prompt";
import type { EventPayload } from "./types";

// A value the store refuses ends the whole turn (appendAll throws), so these pin what the normalizers may produce.
describe("activity.callId and activity.result history lines", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  function setup() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-activity-result-"))); roots.push(root);
    const store = new ConversationStore(root);
    store.append("c", "t", { type: "turn.started" });
    return { store, log: join(root, "conversations", "c.jsonl") };
  }
  const line = (seq: number, body: Record<string, unknown>) => JSON.stringify({ v: 1, conversationId: "c", seq, turnId: "t", at: "2026-11-25T00:00:00.000Z", ...body }) + "\n";
  const edit = { type: "activity", kind: "edit", path: "src/a.ts", insideDesign: false, summary: "Edited a.ts" } as const;
  const result = { type: "activity.result", callId: "toolu_01", path: "src/a.ts", lines: { added: 12, removed: 3 } } as const;

  it("reads and appends an edit activity with a call id and its result", () => {
    const { store, log } = setup();
    expect(store.append("c", "t", { ...edit, callId: "toolu_01" })).toMatchObject({ seq: 2, callId: "toolu_01" });
    expect(store.append("c", "t", result)).toMatchObject({ seq: 3, ...result });
    expect(store.append("c", "t", { type: "activity.result", callId: "toolu_02", lines: { added: 0, removed: 0 } })).toMatchObject({ seq: 4 });
    expect(store.read("c").map(e => e.type)).toEqual(["turn.started", "activity", "activity.result", "activity.result"]);
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, { ...edit, callId: "toolu_01" }) + line(3, result));
    expect(store.read("c")[2]).toMatchObject(result);
  });
  it("reads an activity without a call id, as earlier builds wrote it", () => {
    const { store, log } = setup();
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, edit));
    expect(store.read("c")[1]).toEqual({ v: 1, conversationId: "c", seq: 2, turnId: "t", at: "2026-11-25T00:00:00.000Z", ...edit });
  });
  // Cursor's tool call ids hold a newline (fixtures/acp-cursor.json).
  it("keeps a call id with a newline", () => {
    const { store } = setup();
    const callId = "call_1\nfc_2";
    expect(store.append("c", "t", { ...edit, callId })).toMatchObject({ callId });
    expect(store.append("c", "t", { ...result, callId })).toMatchObject({ callId });
    expect(store.read("c").slice(1).map(e => (e as { callId?: string }).callId)).toEqual([callId, callId]);
  });
  it("takes a call id at the label limit and a path as long as an activity's", () => {
    const { store } = setup();
    const callId = "x".repeat(LIMITS.label);
    const path = "p/".repeat(LIMITS.path);
    expect(store.append("c", "t", { ...edit, path, callId })).toMatchObject({ callId });
    expect(store.append("c", "t", { ...result, path, callId })).toMatchObject({ path });
  });
  it.each<[string, Record<string, unknown>]>([
    ["a negative count", { lines: { added: -1, removed: 0 } }],
    ["a fractional count", { lines: { added: 1.5, removed: 0 } }],
    ["a count past safe integers (1e400 reads as Infinity)", { lines: { added: 1e400, removed: 0 } }],
    ["an unsafe integer", { lines: { added: 0, removed: 2 ** 53 } }],
    ["a text count", { lines: { added: "1", removed: 0 } }],
    ["no removed count", { lines: { added: 1 } }],
    ["no lines", { lines: undefined }],
    ["lines that are not an object", { lines: [1, 2] }],
    ["an empty call id", { callId: "" }],
    ["a call id past the label limit", { callId: "x".repeat(LIMITS.label + 1) }],
    ["a call id with a NUL", { callId: "a\0b" }],
    ["no call id", { callId: undefined }],
    ["a path with a NUL", { path: "a\0b" }],
    ["a path that is not text", { path: 3 }],
  ])("reads a result line with %s as corrupt and refuses to append it", (_name, change) => {
    const { store, log } = setup();
    const body = { ...result, ...change };
    expect(() => store.append("c", "t", body as unknown as EventPayload)).toThrow("Invalid conversation event");
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, body));
    expect(() => store.read("c")).toThrow("Invalid conversation event");
  });
  it.each<[string, unknown]>([
    ["an empty call id", ""], ["a call id past the label limit", "x".repeat(LIMITS.label + 1)], ["a call id with a NUL", "a\0b"], ["a numeric call id", 7],
  ])("reads an activity line with %s as corrupt and refuses to append it", (_name, callId) => {
    const { store, log } = setup();
    expect(() => store.append("c", "t", { ...edit, callId } as unknown as EventPayload)).toThrow("Invalid conversation event");
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, { ...edit, callId }));
    expect(() => store.read("c")).toThrow("Invalid conversation event");
  });
  // As an older Doan: an unknown event type fails the whole history, and an append leaves the file as it was.
  it("fails a whole history holding an unknown event type and never rewrites it", () => {
    const { store, log } = setup();
    const text = line(1, { type: "turn.started" }) + line(2, { ...edit, callId: "toolu_01" }) + line(3, { ...result, type: "activity.later" }) + line(4, { type: "turn.done" });
    writeFileSync(log, text);
    expect(() => store.read("c")).toThrow("Invalid conversation event");
    expect(() => store.append("c", "t2", { type: "turn.started" })).toThrow("Invalid conversation event");
    expect(readFileSync(log, "utf8")).toBe(text);
  });
});
