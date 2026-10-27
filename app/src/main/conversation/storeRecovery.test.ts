import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore, type ConversationMetadata } from "./store";
import { ConversationService } from "./service";
const hooks = vi.hoisted(() => ({ limit: 256 * 1024 * 1024, opened: new Set<number>() }));
vi.mock("./io", async original => {
  const io = await original<typeof import("./io")>();
  return { ...io, get CONVERSATION_HISTORY_BYTES() { return hooks.limit; },
    readDescriptor: (fd: number, limit: number, prefixSize?: number) => io.readDescriptor(fd, Math.min(limit, hooks.limit), prefixSize),
    readRegular: (path: string, limit?: number) => io.readRegular(path, path.endsWith(".jsonl") ? Math.min(limit ?? Infinity, hooks.limit) : limit) };
});
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, openSync: (path: import("node:fs").PathLike, flags: number, mode?: number) => { const fd = fs.openSync(path, flags, mode); hooks.opened.add(fd); return fd; },
    closeSync: (fd: number) => { fs.closeSync(fd); hooks.opened.delete(fd); } };
});
const roots: string[] = [];
afterEach(() => { hooks.limit = 256 * 1024 * 1024; vi.useRealTimers(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-recovery-"))); roots.push(root);
  const store = new ConversationStore(root), directory = join(root, "conversations");
  return { root, store, path: (id: string) => join(directory, id + ".jsonl"), index: join(directory, "index.json"), journal: join(directory, "start-undo.json") };
}
function meta(id: string): ConversationMetadata { return { conversationId: id, root: "/repo", title: id, canvas: { path: "doan/a.html" }, state: "current", session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profile", cwd: "/repo" } }; }
it("checks serialized UTF-8 bytes before append, allowing the exact read boundary", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  const f = setup(); f.store.append("old", "t", { type: "turn.done" });
  const before = readFileSync(f.path("old"));
  const body = { type: "message.delta" as const, messageId: "m", text: "한🙂" };
  const serialized = JSON.stringify({ ...body, v: 1, conversationId: "old", turnId: "t", seq: 2, at: new Date().toISOString() }) + "\n";
  hooks.limit = before.length + Buffer.byteLength(serialized) - 1;
  expect(() => f.store.append("old", "t", body)).toThrow("File exceeds limit");
  expect(readFileSync(f.path("old"))).toEqual(before);
  hooks.limit++; f.store.append("old", "t", body);
  expect(statSync(f.path("old")).size).toBe(hooks.limit); expect(f.store.read("old")).toHaveLength(2);
});
it("rejects an archival bound crossing without publication and leaves forCanvas readable", async () => {
  const f = setup(), published: unknown[] = []; let session = 0;
  const service = new ConversationService(f.store, async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }), async () => ({ sessionId: `s${++session}`, send: async () => {}, answer: () => false, stop: async () => {}, close: async () => {} }), e => published.push(e));
  const request = { root: "/repo", canvas: { path: "doan/a.html" }, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
  const old = (await service.start(request)).conversationId; service.receive(old, { type: "turn.done" });
  const bytes = readFileSync(f.path(old)), index = readFileSync(f.index), count = published.length;
  hooks.limit = bytes.length + 1;
  await expect(service.start(request)).rejects.toThrow();
  expect(readFileSync(f.path(old))).toEqual(bytes); expect(readFileSync(f.index)).toEqual(index); expect(published).toHaveLength(count);
  expect(service.forCanvas("/repo", request.canvas).current?.conversationId).toBe(old);
});
it("rolls back earlier staged writes when a later initial event exceeds the bound", () => {
  const f = setup(); f.store.save([meta("old")]); f.store.append("old", "t", { type: "turn.done" });
  const bytes = readFileSync(f.path("old")), index = readFileSync(f.index); hooks.limit = 500;
  expect(() => f.store.acceptStart([{ ...meta("old"), state: "archived" }, meta("new")], "new", [
    { id: "old", turn: "t", body: { type: "conversation.archived" } },
    { id: "new", turn: "t", body: { type: "turn.started" } },
    { id: "new", turn: "t", body: { type: "user.message", text: "한".repeat(200), anchors: [] } },
  ])).toThrow("File exceeds limit");
  expect(readFileSync(f.path("old"))).toEqual(bytes); expect(readFileSync(f.index)).toEqual(index);
  expect(existsSync(f.path("new"))).toBe(false); expect(f.store.read("old")).toHaveLength(1);
});

function recoveryFixture() {
  const f = setup(); f.store.save([meta("old"), meta("other")]);
  const previous = ["old", "other"].map(id => {
    f.store.append(id, "t", { type: "turn.started" }); const stat = statSync(f.path(id));
    f.store.append(id, "t", { type: "turn.done" });
    return { id, size: stat.size, ino: stat.ino, dev: stat.dev };
  });
  const snapshots = [f.index, f.path("old"), f.path("other")].map(path => ({ path, bytes: readFileSync(path) }));
  return { ...f, previous, snapshots };
}
it.each(["bad-id", "duplicate", "new-as-old", "unknown-old", "negative-inode", "fractional-device", "huge-size", "later-identity", "later-short-file", "partial-json", "invalid-prefix", "alias-inode"])("preserves every target before rejecting recovery: %s", kind => {
  const f = recoveryFixture(); const previous = f.previous.map(p => ({ ...p }));
  const first = previous[0], second = previous[1], snapshot = f.snapshots[2];
  if (!first || !second || !snapshot) throw new Error("Missing fixture");
  if (kind === "bad-id") second.id = "../outside";
  if (kind === "duplicate") previous[1] = { ...first };
  if (kind === "new-as-old") second.id = "new";
  if (kind === "unknown-old") second.id = "unknown";
  if (kind === "negative-inode") second.ino = -1;
  if (kind === "fractional-device") second.dev = 0.5;
  if (kind === "huge-size") second.size = Number.MAX_SAFE_INTEGER;
  if (kind === "later-identity") second.ino++;
  if (kind === "later-short-file") second.size = statSync(f.path("other")).size + 1;
  if (kind === "partial-json") second.size = 1;
  if (kind === "invalid-prefix") {
    const bytes = readFileSync(f.path("other"), "utf8").replace('"seq":1', '"seq":9'); writeFileSync(f.path("other"), bytes);
    snapshot.bytes = Buffer.from(bytes);
  }
  if (kind === "alias-inode") previous[1] = { ...first, id: "other" };
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous }));
  expect(() => new ConversationStore(f.root)).toThrow();
  for (const s of f.snapshots) expect(readFileSync(s.path)).toEqual(s.bytes);
  expect(existsSync(f.journal)).toBe(true);
  expect(hooks.opened.size).toBe(0);
});
it("rejects a new ID that already belongs to an existing conversation before staging", () => {
  const f = setup(); f.store.save([meta("old")]); f.store.append("old", "t", { type: "turn.done" });
  const bytes = readFileSync(f.path("old")), index = readFileSync(f.index);
  expect(() => f.store.acceptStart([meta("old")], "old", [{ id: "old", turn: "t", body: { type: "turn.started" } }])).toThrow();
  expect(readFileSync(f.path("old"))).toEqual(bytes); expect(readFileSync(f.index)).toEqual(index);
});
it("rejects an old indexed ID masquerading as a committed new ID", () => {
  const f = recoveryFixture(); writeFileSync(f.journal, JSON.stringify({ id: "old", previous: f.previous }));
  expect(() => new ConversationStore(f.root)).toThrow();
  for (const s of f.snapshots) expect(readFileSync(s.path)).toEqual(s.bytes);
  expect(existsSync(f.journal)).toBe(true);
});
it("recovers valid prefixes even if an interrupted append left a malformed tail", () => {
  const f = recoveryFixture(); const second = f.previous[1]; if (!second) throw new Error("Missing fixture");
  writeFileSync(f.path("other"), readFileSync(f.path("other")).subarray(0, second.size).toString() + '{"partial":');
  writeFileSync(f.path("new"), "partial"); writeFileSync(f.journal, JSON.stringify({ id: "new", previous: f.previous }));
  const restarted = new ConversationStore(f.root);
  expect(restarted.read("old")).toHaveLength(1); expect(restarted.read("other")).toHaveLength(1);
  expect(existsSync(f.path("new"))).toBe(false); expect(existsSync(f.journal)).toBe(false);
});

it.each(["linked-new", "aliased-new"])("validates the new deletion target before any old truncation: %s", kind => {
  const f = recoveryFixture();
  if (kind === "linked-new") symlinkSync(f.path("old"), f.path("new"));
  else linkSync(f.path("old"), f.path("new"));
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous: f.previous }));
  expect(() => new ConversationStore(f.root)).toThrow();
  for (const s of f.snapshots) expect(readFileSync(s.path)).toEqual(s.bytes);
  expect(existsSync(f.path("new"))).toBe(true); expect(hooks.opened.size).toBe(0);
});
it("cleans only the journal after a committed start even when old descriptors changed", () => {
  const f = recoveryFixture(); f.store.save([{ ...meta("old"), state: "archived" }, { ...meta("other"), state: "archived" }, meta("new")]);
  const old = f.previous[0]; if (!old) throw new Error("Missing fixture"); old.ino = Math.max(...f.previous.map(p => p.ino)) + 1000;
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous: f.previous }));
  const before = readFileSync(f.path("old"));
  expect(new ConversationStore(f.root).list()).toHaveLength(3);
  expect(readFileSync(f.path("old"))).toEqual(before); expect(existsSync(f.journal)).toBe(false);
});

it("validates all journal entries before committed cleanup", () => {
  const f = recoveryFixture(); f.store.save([{ ...meta("old"), state: "archived" }, { ...meta("other"), state: "archived" }, meta("new")]);
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous: [...f.previous, { id: "../bad" }] }));
  const index = readFileSync(f.index);
  expect(() => new ConversationStore(f.root)).toThrow("Invalid start recovery record");
  expect(readFileSync(f.index)).toEqual(index); expect(existsSync(f.journal)).toBe(true);
});
