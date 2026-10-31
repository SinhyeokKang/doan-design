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
    ["an item without text", { v: 1, queued: { [A]: [{ itemId: "q1", anchors: [], attachments: [] }] }, returned: {} }],
    ["anchors that do not match the text", { v: 1, queued: { [A]: [{ itemId: "q1", text: "{{2}}", anchors: [anchor], attachments: [] }] }, returned: {} }],
    ["a relative attachment path", { v: 1, queued: {}, returned: { [A]: { text: "x", anchors: [], attachments: [{ ...file, path: "a.png" }], reason: "restarted" } } }],
  ])("treats %s as damaged, refusing to queue there and keeping the file", (_name, value) => {
    const dir = directory(); writeFileSync(join(dir, "drafts.json"), JSON.stringify(value));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    expect(() => store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] })).toThrow();
    expect(readFileSync(join(dir, "drafts.json"), "utf8")).toBe(JSON.stringify(value));
  });
  it("leaves an entry under a malformed conversation id unread and on disk while the rest works", () => {
    const dir = directory(); writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: { "../x": [] }, returned: {} }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    store.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] });
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).queued["../x"]).toEqual([]);
  });
  it("starts empty without a file and works in memory without a directory", () => {
    expect(new DraftStore(directory()).queued(A)).toEqual([]);
    const memory = new DraftStore(null);
    memory.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] });
    expect(memory.queued(A)).toHaveLength(1);
  });
});

// buzz-conversation fix round 1 (RA2 R1): the writer keeps to the limits the reader checks.
describe("DraftStore limits", () => {
  const item = (itemId: string, text: string, more: Partial<{ anchors: typeof anchor[]; attachments: typeof file[] }> = {}) => ({ itemId, text, anchors: more.anchors ?? [], attachments: more.attachments ?? [] });
  it("refuses, before accepting it, an item that would make the queue and the returned draft larger than one message", () => {
    const store = new DraftStore(directory());
    store.giveBack(A, { text: "x".repeat(20_000), anchors: [], attachments: [] }, "turn_failed");
    expect(() => store.add(A, item("q1", "y".repeat(12_767)))).toThrow("queue_limit");
    expect(store.queued(A)).toEqual([]);
    store.add(A, item("q1", "y".repeat(12_766)));
    expect(store.giveBackQueued(A, "interrupted")).toBe(true);
    expect(store.returned(A)!.text).toHaveLength(32_768);
  });
  it("counts anchors and attachments of the whole draft as one message does", () => {
    const store = new DraftStore(directory());
    const marks = (n: number) => Array.from({ length: n }, (_, i) => `{{${i + 1}}}`).join(" ");
    store.add(A, item("q1", marks(30), { anchors: Array(30).fill(anchor) }));
    expect(() => store.add(A, item("q2", marks(3), { anchors: Array(3).fill(anchor) }))).toThrow("queue_limit");
    store.add(A, item("q2", marks(2), { anchors: Array(2).fill(anchor) }));
    store.add(B, item("f1", "files", { attachments: Array(10).fill(file) }));
    expect(() => store.add(B, item("f2", "one more", { attachments: [file] }))).toThrow("queue_limit");
  });
  it("refuses an item that would take the file past the size the reader reads", () => {
    const dir = directory(), store = new DraftStore(dir, { fileBytes: 2_000 });
    store.add(A, item("q1", "a".repeat(800)));
    expect(() => store.add(B, item("q2", "b".repeat(1_000)))).toThrow("queue_limit");
    expect(new DraftStore(dir, { fileBytes: 2_000 }).returned(A)).toMatchObject({ reason: "restarted" });
  });
  it("reads the other conversations when one conversation's entry is unreadable, and keeps that entry on disk", () => {
    const dir = directory();
    const value = { v: 1, queued: { [A]: [item("q1", "one")] }, returned: { [B]: { text: "z".repeat(40_000), anchors: [], attachments: [], reason: "turn_failed" } } };
    writeFileSync(join(dir, "drafts.json"), JSON.stringify(value));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    expect(log).toHaveBeenCalled();
    expect(store.returned(A)).toMatchObject({ text: "one", reason: "restarted" });
    expect(store.returned(B)).toBeUndefined();
    store.add(A, item("q2", "two"));
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).returned[B]).toEqual(value.returned[B]);
  });
  it("removes temporary files a crash left before their rename", () => {
    const dir = directory();
    writeFileSync(join(dir, "drafts-0b6a3c2e-1f7d-4c1e-9a55-5c7e0e8f9d10.tmp"), "{");
    writeFileSync(join(dir, "index-0b6a3c2e-1f7d-4c1e-9a55-5c7e0e8f9d10.tmp"), "{");
    new DraftStore(dir);
    expect(readdirSync(dir).sort()).toEqual(["index-0b6a3c2e-1f7d-4c1e-9a55-5c7e0e8f9d10.tmp"]);
  });
  it("reports a removal or a hand-over it could not save, and keeps the item or the draft", () => {
    const store = new DraftStore(directory());
    store.add(A, item("q1", "one"));
    const write = vi.spyOn(store as unknown as { write(): void }, "write").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => store.remove(A, "q1")).toThrow("ENOSPC");
    expect(store.queued(A)).toHaveLength(1);
    store.giveBackQueued(A, "interrupted");
    write.mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => store.take(A)).toThrow("ENOSPC");
    expect(store.take(A)).toMatchObject({ text: "one" });
  });
});

// buzz-conversation fix round 2 (RA2b R1): what was accepted still fits the reader's limit in every later form.
describe("DraftStore byte budget", () => {
  const item = (itemId: string, text: string) => ({ itemId, text, anchors: [], attachments: [] });
  // The smallest file limit at which a fresh store accepts these items, one after the other.
  function boundary(add: (store: DraftStore) => void): number {
    for (let limit = 50; limit < 5_000; limit++) {
      const store = new DraftStore(directory(), { fileBytes: limit });
      try { add(store); return limit; } catch (error) { if (!(error instanceof Error) || error.message !== "queue_limit") throw error; }
    }
    throw new Error("no boundary");
  }
  it("reads back everything accepted at the limit after its send started and the app died", () => {
    const limit = boundary(store => store.add(A, item("q1", "one")));
    const dir = directory(), store = new DraftStore(dir, { fileBytes: limit });
    store.add(A, item("q1", "one"));
    store.markSending(A);
    expect(new DraftStore(dir, { fileBytes: limit }).returned(A)).toMatchObject({ text: "one", reason: "restarted" });
  });
  it("reads back every conversation when some queues came back as drafts and others are being sent", () => {
    const fill = (store: DraftStore) => { store.giveBack(A, { text: "earlier", anchors: [], attachments: [] }, "turn_failed"); store.add(A, item("q1", "one")); store.add(B, item("q2", "two")); };
    const limit = boundary(fill);
    const dir = directory(), store = new DraftStore(dir, { fileBytes: limit });
    fill(store);
    store.giveBackQueued(A, "attachment_missing");
    store.markSending(B);
    const next = new DraftStore(dir, { fileBytes: limit });
    expect(next.returned(A)).toMatchObject({ text: "earlier\n\none" });
    expect(next.returned(B)).toMatchObject({ text: "two", reason: "restarted" });
  });
});
