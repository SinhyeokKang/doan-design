import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DraftStore } from "./drafts";
import { FOLDER_ATTACHMENT, LEGACY_ATTACHMENTS } from "./attachmentRecords.fixture";

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
  it("reads a draft returned with workspace_changed back as it was saved", () => {
    const dir = directory();
    new DraftStore(dir).giveBack(A, { text: "one {{1}}", anchors: [anchor], attachments: [] }, "workspace_changed");
    expect(new DraftStore(dir).take(A)).toEqual({ text: "one {{1}}", anchors: [anchor], attachments: [], reason: "workspace_changed" });
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
  it("reads queued items and returned drafts holding earlier records and folders, and hands folders back as folders", () => {
    const dir = directory();
    const attachments = [...LEGACY_ATTACHMENTS, FOLDER_ATTACHMENT];
    writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: { [A]: [{ itemId: "q1", text: "one", anchors: [], attachments }] }, returned: { [B]: { text: "two", anchors: [], attachments: [FOLDER_ATTACHMENT], reason: "turn_failed" } } }));
    const store = new DraftStore(dir);
    expect(store.take(A)).toEqual({ text: "one", anchors: [], attachments, reason: "restarted" });
    expect(store.take(B)).toEqual({ text: "two", anchors: [], attachments: [FOLDER_ATTACHMENT], reason: "turn_failed" });
  });
  it("leaves unread a conversation whose folder record carries a size", () => {
    const dir = directory();
    writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: {}, returned: { [A]: { text: "x", anchors: [], attachments: [{ ...FOLDER_ATTACHMENT, size: 1 }], reason: "turn_failed" } } }));
    expect(new DraftStore(dir).returned(A)).toBeUndefined();
  });
  it("starts empty without a file and works in memory without a directory", () => {
    expect(new DraftStore(directory()).queued(A)).toEqual([]);
    const memory = new DraftStore(null);
    memory.add(A, { itemId: "q1", text: "one", anchors: [], attachments: [] });
    expect(memory.queued(A)).toHaveLength(1);
  });
});

// The writer keeps to the limits the reader checks.
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

// What was accepted still fits the reader's limit in every later form.
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

// An emptied queue reserves nothing.
describe("DraftStore emptied queues", () => {
  it("frees the budget of a conversation whose last queued item was removed", () => {
    const item = { itemId: "q1", text: "one", anchors: [], attachments: [] };
    let limit = 50;
    for (; limit < 5_000; limit++) { try { new DraftStore(directory(), { fileBytes: limit }).add(A, item); break; } catch { /* below the boundary */ } }
    const store = new DraftStore(directory(), { fileBytes: limit });
    store.add(A, item);
    expect(store.remove(A, "q1")).toBe(true);
    store.add(B, { ...item, itemId: "q2" });
    expect(store.queued(B)).toHaveLength(1);
  });
});

describe("DraftStore single-item sending", () => {
  const item = (itemId: string) => ({ itemId, text: itemId, anchors: [], attachments: [] });
  it("marks one item, hides it from queued, and unmarks it in place", () => {
    const store = new DraftStore(directory());
    store.add(A, item("q1")); store.add(A, item("q2")); store.add(A, item("q3"));
    expect(store.markOneSending(A, "q2")).toBe(true);
    expect(store.queued(A).map(i => i.itemId)).toEqual(["q1", "q3"]);
    expect(store.markOneSending(A, "q2")).toBe(false);
    expect(store.remove(A, "q2")).toBe(false);
    expect(store.unmarkSending(A, "q2")).toBe(true);
    expect(store.queued(A).map(i => i.itemId)).toEqual(["q1", "q2", "q3"]);
    expect(store.unmarkSending(A, "q2")).toBe(false);
  });
  it("refuses a missing item or conversation", () => {
    const store = new DraftStore(directory());
    store.add(A, item("q1"));
    expect(store.markOneSending(A, "nope")).toBe(false);
    expect(store.markOneSending(B, "q1")).toBe(false);
    expect(store.unmarkSending(A, "q1")).toBe(false);
  });
  it("writes the mark to disk so a restart returns the item as a draft", () => {
    const dir = directory();
    const store = new DraftStore(dir);
    store.add(A, item("q1")); store.add(A, item("q2"));
    store.markOneSending(A, "q1");
    const reopened = new DraftStore(dir);
    expect(reopened.queued(A)).toEqual([]);
    expect(reopened.returned(A)?.text).toBe("q1\n\nq2");
    expect(reopened.returned(A)?.reason).toBe("restarted");
  });
  it("gives a marked item back with the rest as one draft in order", () => {
    const store = new DraftStore(directory());
    store.add(A, item("q1")); store.add(A, item("q2")); store.add(A, item("q3"));
    store.markOneSending(A, "q2");
    expect(store.giveBackQueued(A, "interrupted")).toBe(true);
    expect(store.returned(A)?.text).toBe("q1\n\nq2\n\nq3");
    expect(store.queued(A)).toEqual([]);
  });
  it("sent removes only the marked item", () => {
    const store = new DraftStore(directory());
    store.add(A, item("q1")); store.add(A, item("q2"));
    store.markOneSending(A, "q1");
    store.sent(A, ["q1"]);
    expect(store.queued(A).map(i => i.itemId)).toEqual(["q2"]);
  });
});

// A deleted conversation's queue and returned draft go with it.
describe("DraftStore discard", () => {
  const item = (itemId: string, text: string) => ({ itemId, text, anchors: [], attachments: [] });
  it("removes a conversation's queue, its items on their way out and its returned draft, and saves at once", () => {
    const dir = directory(), store = new DraftStore(dir);
    store.add(A, item("q1", "one")); store.add(A, item("q2", "two")); store.markOneSending(A, "q2");
    store.giveBack(A, { text: "back", anchors: [], attachments: [] }, "turn_failed");
    store.add(B, item("q3", "other"));
    store.discard(A);
    expect(store.queued(A)).toEqual([]); expect(store.returned(A)).toBeUndefined();
    expect(store.queued(B)).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"));
    expect(saved).toEqual({ v: 1, queued: { [B]: [item("q3", "other")] }, returned: {} });
    expect(new DraftStore(dir).returned(A)).toBeUndefined();
  });
  it("removes an entry of that conversation it could not read", () => {
    const dir = directory();
    writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: {}, returned: { [A]: { text: "z".repeat(40_000), anchors: [], attachments: [], reason: "turn_failed" }, [B]: { text: "kept", anchors: [], attachments: [], reason: "turn_failed" } } }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new DraftStore(dir);
    store.discard(A);
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).returned).toEqual({ [B]: { text: "kept", anchors: [], attachments: [], reason: "turn_failed" } });
  });
  it("writes nothing for a conversation without drafts", () => {
    const dir = directory(), store = new DraftStore(dir);
    const write = vi.spyOn(store as unknown as { write(): void }, "write");
    store.discard(A);
    expect(write).not.toHaveBeenCalled();
  });
  it("never throws when the file is damaged or the write fails, and drops the drafts in memory", () => {
    const dir = directory(); writeFileSync(join(dir, "drafts.json"), "{broken");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const damaged = new DraftStore(dir);
    damaged.giveBack(A, { text: "kept", anchors: [], attachments: [] }, "turn_failed");
    expect(() => damaged.discard(A)).not.toThrow();
    expect(damaged.returned(A)).toBeUndefined();
    expect(readFileSync(join(dir, "drafts.json"), "utf8")).toBe("{broken");
    const failing = new DraftStore(directory());
    failing.add(A, item("q1", "one"));
    vi.spyOn(failing as unknown as { write(): void }, "write").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => failing.discard(A)).not.toThrow();
    expect(failing.queued(A)).toEqual([]);
  });
});

// A send's or start's message from when main takes it until main accepts or refuses it (`sending`), and the starts a
// quit stopped (`starts`). Both keys are written only when they hold something, so the file reads as before otherwise.
describe("DraftStore held messages", () => {
  const C = "33333333-3333-4333-8333-333333333333", D = "44444444-4444-4444-8444-444444444444";
  it("writes a held message at once and removes it on release, leaving the file as before", () => {
    const dir = directory(), store = new DraftStore(dir);
    store.hold(C, { conversationId: A, text: "next", anchors: [], attachments: [] });
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).sending).toEqual({ [C]: { conversationId: A, text: "next", anchors: [], attachments: [] } });
    store.release(C);
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"))).toEqual({ v: 1, queued: {}, returned: {} });
  });
  it("returns a held send after its returned draft and before its queue at the next start, and keeps a held start for its composer", () => {
    const dir = directory(), first = new DraftStore(dir);
    first.giveBack(A, { text: "earlier", anchors: [], attachments: [] }, "turn_failed");
    first.hold(C, { conversationId: A, text: "sent {{1}}", anchors: [anchor], attachments: [] });
    first.add(A, { itemId: "q1", text: "queued", anchors: [], attachments: [file] });
    first.hold(D, { root: "/repo", canvas: { path: ".doan/canvases/a.html", id: "a" }, text: "first", anchors: [], attachments: [file] });
    const next = new DraftStore(dir);
    expect(next.take(A)).toEqual({ text: "earlier\n\nsent {{1}}\n\nqueued", anchors: [anchor], attachments: [file], reason: "restarted" });
    const saved = JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8"));
    expect(saved.sending).toBeUndefined();
    expect(saved.starts).toEqual({ [D]: { root: "/repo", canvas: { path: ".doan/canvases/a.html", id: "a" }, text: "first", anchors: [], attachments: [file] } });
    // Not this run's: a start still pending in a later run is not handed over.
    expect(next.takeStart("/repo")).toBeNull();
    expect(next.takeStart("/repo", { path: ".doan/canvases/b.html", id: "a" })).toEqual({ text: "first", anchors: [], attachments: [file], reason: "restarted" });
    expect(next.takeStart("/repo", { path: ".doan/canvases/b.html", id: "a" })).toBeNull();
    expect(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).starts).toBeUndefined();
  });
  it("matches a canvas without an id by its path, and a root start only without a canvas", () => {
    const dir = directory(), first = new DraftStore(dir);
    first.hold(C, { root: "/repo", canvas: { path: ".doan/canvases/a.html" }, text: "canvas", anchors: [], attachments: [] });
    first.hold(D, { root: "/repo", text: "root", anchors: [], attachments: [] });
    const next = new DraftStore(dir);
    expect(next.takeStart("/repo", { path: ".doan/canvases/a.html", id: "a" })).toMatchObject({ text: "canvas" });
    expect(next.takeStart("/other")).toBeNull();
    expect(next.takeStart("/repo")).toMatchObject({ text: "root" });
  });
  it("drops unreadable held or returned start entries and reads the rest", () => {
    const dir = directory();
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: {}, returned: {},
      sending: { [C]: { conversationId: "../x", text: "bad", anchors: [], attachments: [] }, [D]: { root: "relative", text: "bad", anchors: [], attachments: [] } },
      starts: { "../x": { root: "/repo", text: "bad", anchors: [], attachments: [] }, [A]: { root: "/repo", text: "good", anchors: [], attachments: [] } } }));
    const store = new DraftStore(dir);
    expect(store.takeStart("/repo")).toMatchObject({ text: "good" });
    expect(store.take(A)).toBeNull();
  });
  it("reads a file from before held messages", () => {
    const dir = directory();
    writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1, queued: {}, returned: { [A]: { text: "kept", anchors: [], attachments: [], reason: "turn_failed" } } }));
    expect(new DraftStore(dir).take(A)).toMatchObject({ text: "kept" });
  });
  it("never throws when a held message cannot be saved", () => {
    const store = new DraftStore(directory());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(store as unknown as { write(): void }, "write").mockImplementation(() => { throw new Error("ENOSPC"); });
    expect(() => store.hold(C, { root: "/repo", text: "x", anchors: [], attachments: [] })).not.toThrow();
    expect(() => store.release(C)).not.toThrow();
  });
});

// A start a quit stopped waits for a composer of its root and canvas; one whose canvas went to the Trash or whose project
// was removed from Doan is never taken, so those go with it (PRODUCT §5 items 1 and 10, Move to Trash).
describe("DraftStore discarded starts", () => {
  const C = "33333333-3333-4333-8333-333333333333", D = "44444444-4444-4444-8444-444444444444";
  const E = "55555555-5555-4555-8555-555555555555", F = "66666666-6666-4666-8666-666666666666";
  // Four starts a quit stopped: canvas a (by id) and canvas b (by path only) of /repo, /repo itself, and canvas a of /other.
  function stopped(dir: string): DraftStore {
    const first = new DraftStore(dir);
    first.hold(C, { root: "/repo", canvas: { path: ".doan/canvases/a.html", id: "a" }, text: "on a", anchors: [], attachments: [file] });
    first.hold(D, { root: "/repo", canvas: { path: ".doan/canvases/b.html" }, text: "on b", anchors: [], attachments: [] });
    first.hold(E, { root: "/repo", text: "on repo", anchors: [], attachments: [] });
    first.hold(F, { root: "/other", canvas: { path: ".doan/canvases/a.html", id: "a" }, text: "on other", anchors: [], attachments: [] });
    return new DraftStore(dir);
  }
  const startTexts = (dir: string) => Object.values(JSON.parse(readFileSync(join(dir, "drafts.json"), "utf8")).starts ?? {}).map(start => (start as { text: string }).text).sort();

  it("moving a canvas to the Trash discards its starts, matched as a composer would take them, and keeps every other", () => {
    const dir = directory(), store = stopped(dir);
    store.discardCanvasStarts("/repo", { path: ".doan/canvases/renamed.html", id: "a" });
    expect(startTexts(dir)).toEqual(["on b", "on other", "on repo"]);
    store.discardCanvasStarts("/repo", { path: ".doan/canvases/b.html" });
    expect(startTexts(dir)).toEqual(["on other", "on repo"]);
    const next = new DraftStore(dir);
    expect(next.takeStart("/repo", { path: ".doan/canvases/a.html", id: "a" })).toBeNull();
    expect(next.takeStart("/repo")).toMatchObject({ text: "on repo" });
    expect(next.takeStart("/other", { path: ".doan/canvases/a.html", id: "a" })).toMatchObject({ text: "on other" });
  });

  it("removing a project discards every start of its roots, on a canvas or not, and keeps other roots'", () => {
    const dir = directory(), store = stopped(dir);
    store.discardRootStarts(["/repo", "/repo-wt"]);
    expect(startTexts(dir)).toEqual(["on other"]);
    expect(new DraftStore(dir).takeStart("/repo")).toBeNull();
  });

  it("writes nothing when no start matches", () => {
    const dir = directory(), store = new DraftStore(dir);
    store.discardRootStarts(["/repo"]);
    store.discardCanvasStarts("/repo", { path: ".doan/canvases/a.html" });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("never throws when the file cannot be written: the removal or the move already happened", () => {
    const store = stopped(directory());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(store as unknown as { write(): void }, "write").mockImplementation(() => { throw new Error("ENOSPC"); });
    expect(() => store.discardCanvasStarts("/repo", { path: ".doan/canvases/a.html", id: "a" })).not.toThrow();
    expect(() => store.discardRootStarts(["/repo"])).not.toThrow();
  });
});

it("lists attachment paths from persisted drafts, queued messages and interrupted starts without reading history", () => {
  const dir = directory();
  const message = (path: string) => ({ text: "notes", anchors: [], attachments: [{ name: "pasted-text-x.txt", kind: "file", size: 5, path, lines: 1, excerpt: "notes" }] });
  writeFileSync(join(dir, "drafts.json"), JSON.stringify({ v: 1,
    queued: { [A]: [{ itemId: "q", ...message("/queue.txt") }] }, returned: { [A]: { ...message("/draft.txt"), reason: "restarted" } },
    sending: { [B]: { ...message("/sending.txt"), root: "/repo" } }, starts: { [A]: { ...message("/start.txt"), root: "/repo" } } }));
  writeFileSync(join(dir, A + ".jsonl"), "unreadable history");
  const store = new DraftStore(dir);
  expect(new Set(store.attachmentPaths())).toEqual(new Set(["/queue.txt", "/draft.txt", "/sending.txt", "/start.txt"]));
  expect(store.take(A)?.attachments[0]).toMatchObject({ lines: 1, excerpt: "notes" });
});
