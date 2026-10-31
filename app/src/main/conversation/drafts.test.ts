import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DraftStore } from "./drafts";

const paths: string[] = []; afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function directory(): string { const dir = mkdtempSync(join(tmpdir(), "doan-drafts-")); paths.push(dir); const conversations = join(dir, "conversations"); mkdirSync(conversations); return conversations; }
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const file = { name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" };
const anchor = { element: { selector: "#hero", text: "Hero" } };

describe("DraftStore", () => {
  it("keeps queued items per conversation in order and removes one by its id", () => {
    const store = new DraftStore(directory());
    store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] });
    store.add(A, { itemId: "q2", text: "two", anchors: [], attachments: [file] });
    store.add(B, { itemId: "q3", text: "other", anchors: [], attachments: [] });
    expect(store.queued(A).map(item => item.itemId)).toEqual(["q1", "q2"]);
    expect(store.remove(A, "q1")).toBe(true);
    expect(store.remove(A, "q1")).toBe(false);
    expect(store.markSending(A).map(item => item.text)).toEqual(["two"]);
    expect(store.queued(A)).toEqual([]);
    expect(store.remove(A, "q2")).toBe(false);
    store.sent(A, ["q2"]);
    expect(store.giveBackQueued(A, "turn_failed")).toBe(false);
    expect(store.queued(B)).toHaveLength(1);
  });
  it("writes every change at once through a temporary file, so a crash keeps the queue", () => {
    const dir = directory(), store = new DraftStore(dir);
    store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [file] });
    const saved = JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"));
    expect(saved).toEqual({ v: 1, queued: { [A]: [{ itemId: "q1", text: "one", anchors: [], attachments: [file] }] }, returned: {} });
    expect(readdirSync(dir).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("turns every queued item left by the previous run into a returned draft and never sends it", () => {
    const dir = directory(), first = new DraftStore(dir);
    first.add(A, { itemId: "q1", text: "one {{1}}", anchors: [anchor], attachments: [] });
    first.add(A, { itemId: "q2", text: "two {{1}}", anchors: [anchor], attachments: [file] });
    const next = new DraftStore(dir);
    expect(next.queued(A)).toEqual([]);
    expect(next.returned(A)).toEqual({ text: "one {{1}}\n\ntwo {{2}}", anchors: [anchor, anchor], attachments: [file], reason: "restarted" });
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).queued).toEqual({});
  });
  it("hands a returned draft over once, merging a later one after it with the later reason", () => {
    const store = new DraftStore(directory());
    store.giveBack(A, { text: "first {{1}}", anchors: [anchor], attachments: [] }, "turn_failed");
    store.giveBack(A, { text: "second {{1}}", anchors: [anchor], attachments: [file] }, "interrupted");
    expect(store.returned(A)).toBeDefined();
    expect(store.take(A)).toEqual({ text: "first {{1}}\n\nsecond {{2}}", anchors: [anchor, anchor], attachments: [file], reason: "interrupted" });
    expect(store.take(A)).toBeNull();
    expect(store.returned(A)).toBeUndefined();
  });
  it("keeps a damaged file for diagnosis, refuses to queue and still returns drafts in memory", () => {
    const dir = directory(); writeFileSync(join(dir, "drafts.json"), "{broken");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    expect(log).toHaveBeenCalled();
    expect(() => store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] })).toThrow();
    store.giveBack(A, { text: "kept", anchors: [], attachments: [] }, "turn_failed");
    expect(store.take(A)).toMatchObject({ text: "kept" });
    expect(readFileSync(join(dir, "drafts.json"), "utf8")).toBe("{broken");
  });
  it.each([
    ["an unknown version", { v: 2, queued: {}, returned: {} }],
    ["a malformed conversation id", { v: 1, queued: { "../x": [] }, returned: {} }],
    ["an item without text", { v: 1, queued: { [A]: [{ itemId: "q1", anchors: [], attachments: [] }] }, returned: {} }],
    ["anchors that do not match the text", { v: 1, queued: { [A]: [{ itemId: "q1", text: "{{2}}", anchors: [anchor], attachments: [] }] }, returned: {} }],
    ["a relative attachment path", { v: 1, queued: {}, returned: { [A]: { text: "x", anchors: [], attachments: [{ ...file, path: "a.png" }], reason: "restarted" } } }],
  ])("treats %s as a damaged file", (_name, value) => {
    const dir = directory(); writeFileSync(join(dir, "drafts.json"), JSON.stringify(value));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    expect(() => store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] })).toThrow();
    expect(readFileSync(join(dir, "drafts.json"), "utf8")).toBe(JSON.stringify(value));
  });
  it("starts empty without a file and works in memory without a directory", () => {
    expect(new DraftStore(directory()).queued(A)).toEqual([]);
    const memory = new DraftStore(null);
    memory.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] });
    expect(memory.queued(A)).toHaveLength(1);
  });
});
