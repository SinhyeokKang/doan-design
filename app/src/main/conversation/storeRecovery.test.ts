import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore, type ConversationMetadata, type JournalChange } from "./store";
import { ConversationService } from "./service";
import type { ConversationEvent, EventPayload } from "./types";
import { turnOf } from "../../renderer/turnStatus";
const hooks = vi.hoisted(() => ({ limit: 256 * 1024 * 1024, opened: new Set<number>(), journal: "" }));
vi.mock("./io", async original => {
  const io = await original<typeof import("./io")>();
  return { ...io, get CONVERSATION_HISTORY_BYTES() { return hooks.limit; },
    readDescriptor: (fd: number, limit: number, prefixSize?: number) => io.readDescriptor(fd, Math.min(limit, hooks.limit), prefixSize),
    readRegular: (path: string, limit?: number) => io.readRegular(path, path.endsWith(".jsonl") ? Math.min(limit ?? Infinity, hooks.limit) : limit) };
});
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, openSync: (path: import("node:fs").PathLike, flags: number, mode?: number) => { const fd = fs.openSync(path, flags, mode); hooks.opened.add(fd); return fd; },
    closeSync: (fd: number) => { fs.closeSync(fd); hooks.opened.delete(fd); },
    renameSync: (from: import("node:fs").PathLike, to: import("node:fs").PathLike) => { if (String(to).endsWith("start-undo.json")) hooks.journal = fs.readFileSync(from, "utf8"); return fs.renameSync(from, to); } };
});
const roots: string[] = [];
afterEach(() => { hooks.limit = 256 * 1024 * 1024; vi.useRealTimers(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-recovery-"))); roots.push(root);
  const store = new ConversationStore(root), directory = join(root, "conversations");
  return { root, store, path: (id: string) => join(directory, id + ".jsonl"), index: join(directory, "index.json"), journal: join(directory, "start-undo.json") };
}
function meta(id: string): ConversationMetadata { return { conversationId: id, root: "/repo", title: id, canvas: { path: ".doan/canvases/a.html" }, owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profile", cwd: "/repo" } }; }
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
// A turn's opening events go in one write, so validation, the size limit and an open or read failure leave neither.
// A short write is not rolled back; only journaled starts and restores recover a prefix.
it("appends several events in one write, or none when they cross the bound together", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T00:00:00Z"));
  const f = setup(); f.store.append("old", "t1", { type: "turn.done" });
  const before = readFileSync(f.path("old"));
  const message = { type: "user.message" as const, text: "again", anchors: [] }, started = { type: "turn.started" as const };
  const line = (body: object, seq: number) => JSON.stringify({ ...body, v: 1, conversationId: "old", turnId: "t2", seq, at: new Date().toISOString() }) + "\n";
  // The message alone would fit; with its turn.started it does not.
  hooks.limit = before.length + Buffer.byteLength(line(message, 2)) + Buffer.byteLength(line(started, 3)) - 1;
  expect(() => f.store.appendAll("old", "t2", [message, started])).toThrow("File exceeds limit");
  expect(readFileSync(f.path("old"))).toEqual(before);
  hooks.limit++;
  expect(f.store.appendAll("old", "t2", [message, started]).map(e => [e.type, e.seq])).toEqual([["user.message", 2], ["turn.started", 3]]);
  expect(f.store.read("old").map(e => e.seq)).toEqual([1, 2, 3]);
  expect(statSync(f.path("old")).size).toBe(hooks.limit);
  // An invalid event among them writes nothing either.
  const saved = readFileSync(f.path("old")); hooks.limit = 256 * 1024 * 1024;
  expect(() => f.store.appendAll("old", "t3", [message, { type: "activity", kind: "nope" } as never])).toThrow("Invalid conversation event");
  expect(readFileSync(f.path("old"))).toEqual(saved);
});
// An existing conversation's send whose turn.started cannot be saved leaves no user.message either, so the
// renderer has no message alone to open a live turn from.
it("rejects a next send whose turn.started cannot be saved without saving or publishing its message", async () => {
  const f = setup(), published: ConversationEvent[] = []; let session = 0;
  const service = new ConversationService(f.store, async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }), async () => ({ sessionId: `s${++session}`, send: async () => {}, answer: () => false, stop: async () => {}, close: async () => {} }), e => published.push(e));
  const request = { root: "/repo", canvas: { path: ".doan/canvases/a.html" }, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
  const id = (await service.start(request)).conversationId; service.receive(id, { type: "turn.done" });
  const bytes = readFileSync(f.path(id)), count = published.length;
  const message = JSON.stringify({ type: "user.message", text: "again", anchors: [], v: 1, conversationId: id, turnId: id, seq: 4, at: new Date().toISOString() }) + "\n";
  hooks.limit = bytes.length + Buffer.byteLength(message) + 8;
  await expect(service.send(id, "again", [])).rejects.toThrow("File exceeds limit");
  expect(readFileSync(f.path(id))).toEqual(bytes);
  expect(published).toHaveLength(count);
  expect(service.list("/repo").find(c => c.conversationId === id)).toMatchObject({ phase: "ended", working: false });
  expect(turnOf(f.store.read(id), true)).toMatchObject({ ended: true });
});
// A second conversation on the same canvas leaves the first one's history alone, so a start whose own first events
// cross the bound leaves nothing behind.
it("rejects a second start on a canvas whose first events cross the bound, leaving the first conversation as it was", async () => {
  const f = setup(), published: unknown[] = []; let session = 0;
  const service = new ConversationService(f.store, async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }), async () => ({ sessionId: `s${++session}`, send: async () => {}, answer: () => false, stop: async () => {}, close: async () => {} }), e => published.push(e));
  const request = { root: "/repo", canvas: { path: ".doan/canvases/a.html" }, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
  const old = (await service.start(request)).conversationId; service.receive(old, { type: "turn.done" });
  const bytes = readFileSync(f.path(old)), index = readFileSync(f.index), count = published.length;
  hooks.limit = bytes.length + 1;
  await expect(service.start({ ...request, text: "x".repeat(bytes.length + 1) })).rejects.toThrow("File exceeds limit");
  expect(readFileSync(f.path(old))).toEqual(bytes); expect(readFileSync(f.index)).toEqual(index); expect(published).toHaveLength(count);
  expect(existsSync(f.journal)).toBe(false);
  expect(service.list("/repo").map(c => c.conversationId)).toEqual([old]);
});
it("rolls back earlier staged writes when a later initial event exceeds the bound", () => {
  const f = setup(); f.store.save([meta("old")]); f.store.append("old", "t", { type: "turn.done" });
  const bytes = readFileSync(f.path("old")), index = readFileSync(f.index); hooks.limit = 500;
  expect(() => f.store.acceptStart([meta("old"), meta("new")], "new", [
    { id: "new", turn: "t", body: { type: "turn.started" } },
    { id: "new", turn: "t", body: { type: "user.message", text: "한".repeat(200), anchors: [] } },
  ])).toThrow("File exceeds limit");
  expect(readFileSync(f.path("old"))).toEqual(bytes); expect(readFileSync(f.index)).toEqual(index);
  expect(existsSync(f.path("new"))).toBe(false); expect(existsSync(f.journal)).toBe(false); expect(f.store.read("old")).toHaveLength(1);
});

// An earlier build's start journal pins the histories it archived; it is only ever found beside that build's v2 index.
const v2Index = (entries: (ConversationMetadata & { state?: string })[]) => JSON.stringify({ v: 2, conversations: entries.map(m => ({ state: "current", ...m })) });
function recoveryFixture() {
  const f = setup(); writeFileSync(f.index, v2Index([meta("old"), meta("other")]));
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
  const f = recoveryFixture(); writeFileSync(f.index, v2Index([{ ...meta("old"), state: "archived" }, { ...meta("other"), state: "archived" }, meta("new")]));
  const old = f.previous[0]; if (!old) throw new Error("Missing fixture"); old.ino = Math.max(...f.previous.map(p => p.ino)) + 1000;
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous: f.previous }));
  const before = readFileSync(f.path("old"));
  expect(new ConversationStore(f.root).list()).toHaveLength(3);
  expect(readFileSync(f.path("old"))).toEqual(before); expect(existsSync(f.journal)).toBe(false);
});

it("validates all journal entries before committed cleanup", () => {
  const f = recoveryFixture(); writeFileSync(f.index, v2Index([{ ...meta("old"), state: "archived" }, { ...meta("other"), state: "archived" }, meta("new")]));
  writeFileSync(f.journal, JSON.stringify({ id: "new", previous: [...f.previous, { id: "../bad" }] }));
  const index = readFileSync(f.index);
  expect(() => new ConversationStore(f.root)).toThrow("Invalid start recovery record");
  expect(readFileSync(f.index)).toEqual(index); expect(existsSync(f.journal)).toBe(true);
});

// A crash right before the index rename leaves the old index with the journal; right after, the new index with it.
describe("typed undo journal", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" };
  type Write = { id: string; turn: string; body: import("./types").EventPayload };
  type Case = { change: JournalChange; entries: (e: ConversationMetadata[]) => ConversationMetadata[]; writes: Write[] };
  const logs = (f: ReturnType<typeof setup>) => ["old", "proj", "arch", "new"].map(id => existsSync(f.path(id)) ? readFileSync(f.path(id)) : null);
  const current = (entries: (ConversationMetadata & { state?: string })[]) => entries.map(({ state: _state, ...m }) => m);
  // old on canvas a, a project conversation without a canvas, and arch, which an earlier build archived from canvas a.
  function changeFixture(disk: "v2" | "v3") {
    const f = setup();
    const { canvas: _canvas, ...project } = meta("proj");
    const entries = [{ ...meta("old"), canvas: a }, project, { ...meta("arch"), canvas: a, state: "archived" as const }];
    for (const id of ["old", "proj", "arch"]) { f.store.append(id, "t", { type: "turn.started" }); f.store.append(id, "t", { type: "turn.done" }); }
    if (disk === "v2") writeFileSync(f.index, v2Index(entries)); else f.store.save(current(entries));
    return { ...f, entries: current(entries), raw: entries };
  }

  // This build archives nothing: a start or a promotion onto canvas a leaves old (and the migrated arch) as they are,
  // and a bind or promote journal names no replaced conversation.
  const cases: Record<"start" | "bind" | "promote", Case> = {
    start: { change: { kind: "start", id: "new" }, entries: e => [...e, { ...meta("new"), canvas: a }],
      writes: [{ id: "new", turn: "n", body: { type: "user.message", text: "hi", anchors: [] } }, { id: "new", turn: "n", body: { type: "turn.started" } }] },
    bind: { change: { kind: "bind", id: "proj", canvas: b, replaced: [] }, entries: e => e.map(m => m.conversationId === "proj" ? { ...m, canvas: b } : m),
      writes: [{ id: "proj", turn: "t", body: { type: "conversation.bound", canvas: b } }] },
    promote: { change: { kind: "promote", id: "proj", canvas: a, replaced: [] }, entries: e => e.map(m => m.conversationId === "proj" ? { ...m, canvas: a } : m),
      writes: [{ id: "proj", turn: "t", body: { type: "conversation.bound", canvas: a } }] },
  };
  const kinds = Object.keys(cases) as (keyof typeof cases)[];
  const each = kinds.flatMap(kind => (["v2", "v3"] as const).map(disk => [kind, disk] as const));
  it.each(kinds)("writes a %s journal that archives nothing", kind => {
    const f = changeFixture("v3"), c = cases[kind];
    f.store.acceptChange(c.change, c.entries(f.entries), c.writes);
    const journal = JSON.parse(hooks.journal);
    expect(Object.keys(journal)).toEqual(kind === "start" ? ["v", "kind", "id", "previous"] : ["v", "kind", "id", "canvas", "replaced", "previous"]);
    expect(journal).toMatchObject({ v: 1, kind, id: c.change.id, ...(kind === "start" ? { previous: [] } : { replaced: [] }) });
    expect(journal.previous.map((p: { id: string }) => p.id)).toEqual(kind === "start" ? [] : ["proj"]);
  });
  it.each(each)("rolls back %s over a %s index when the crash came before the index rename", (kind, disk) => {
    const f = changeFixture(disk), c = cases[kind];
    const beforeLogs = logs(f), beforeIndex = readFileSync(f.index);
    f.store.acceptChange(c.change, c.entries(f.entries), c.writes);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    writeFileSync(f.index, beforeIndex); writeFileSync(f.journal, hooks.journal);
    const restarted = new ConversationStore(f.root);
    expect(logs(f)).toEqual(beforeLogs); expect(readFileSync(f.index)).toEqual(beforeIndex); expect(existsSync(f.journal)).toBe(false);
    expect(restarted.list()).toEqual(f.entries);
  });
  // The rename committed it; the crash came before the journal was removed.
  it.each(each)("keeps %s over a %s index when the crash came after the index rename", (kind, disk) => {
    const f = changeFixture(disk), c = cases[kind];
    f.store.acceptChange(c.change, c.entries(f.entries), c.writes);
    const afterLogs = logs(f), afterIndex = readFileSync(f.index);
    writeFileSync(f.journal, hooks.journal);
    const restarted = new ConversationStore(f.root);
    expect(logs(f)).toEqual(afterLogs); expect(readFileSync(f.index)).toEqual(afterIndex); expect(existsSync(f.journal)).toBe(false);
    expect(restarted.list()).toEqual(c.entries(f.entries));
  });
  // A later build's mode on an entry must not block recovery: the index stays valid and only that field reads as Default.
  it.each(["before", "after"] as const)("recovers a start over an index whose entry carries an unknown permission mode (crash %s the rename)", when => {
    const f = changeFixture("v3"), c = cases.start;
    const raw = JSON.parse(readFileSync(f.index, "utf8")); raw.conversations[0].permissionMode = "auto"; writeFileSync(f.index, JSON.stringify(raw));
    const beforeLogs = logs(f), beforeIndex = readFileSync(f.index);
    const reread = new ConversationStore(f.root).list();
    expect(reread).toEqual(f.entries);
    f.store.acceptChange(c.change, c.entries(reread).map(m => m.conversationId === "new" ? { ...m, permissionMode: "plan" as const } : m), c.writes);
    if (when === "before") writeFileSync(f.index, beforeIndex);
    writeFileSync(f.journal, hooks.journal);
    const restarted = new ConversationStore(f.root);
    expect(existsSync(f.journal)).toBe(false);
    if (when === "before") { expect(logs(f)).toEqual(beforeLogs); expect(restarted.list()).toEqual(f.entries); }
    else expect(restarted.list()).toEqual(c.entries(f.entries).map(m => m.conversationId === "new" ? { ...m, permissionMode: "plan" } : m));
  });
  it.each([
    ["an unknown kind", (j: Record<string, unknown>) => { j.kind = "merge"; }],
    ["an unknown version", (j: Record<string, unknown>) => { j.v = 2; }],
    ["a promote without its canvas", (j: Record<string, unknown>) => { delete j.canvas; }],
    ["a promote naming an untouched replaced id", (j: Record<string, unknown>) => { j.replaced = ["arch"]; }],
  ])("refuses %s without touching any record", (_name, mutate) => {
    const f = changeFixture("v3"), c = cases.promote, beforeIndex = readFileSync(f.index);
    f.store.acceptChange(c.change, c.entries(f.entries), c.writes);
    const journal = JSON.parse(hooks.journal); mutate(journal);
    writeFileSync(f.index, beforeIndex); writeFileSync(f.journal, JSON.stringify(journal));
    const touched = logs(f);
    expect(() => new ConversationStore(f.root)).toThrow();
    expect(logs(f)).toEqual(touched); expect(existsSync(f.journal)).toBe(true); expect(hooks.opened.size).toBe(0);
  });
  it("refuses to stage a promote whose index would not bind the canvas", () => {
    const f = changeFixture("v3"), c = cases.promote, beforeLogs = logs(f), beforeIndex = readFileSync(f.index);
    expect(() => f.store.acceptChange(c.change, f.entries, c.writes)).toThrow();
    expect(logs(f)).toEqual(beforeLogs); expect(readFileSync(f.index)).toEqual(beforeIndex); expect(existsSync(f.journal)).toBe(false);
  });
  it("refuses a restore, since nothing is archived any more, and a bind of an already bound conversation", () => {
    const f = changeFixture("v2"), beforeIndex = readFileSync(f.index);
    expect(() => f.store.acceptChange({ kind: "restore", id: "arch", replaced: ["old"] }, f.entries, [{ id: "old", turn: "t", body: { type: "conversation.archived" } }, { id: "arch", turn: "t", body: { type: "conversation.restored" } }])).toThrow();
    expect(() => f.store.acceptChange({ kind: "bind", id: "old", canvas: b, replaced: [] }, f.entries.map(m => m.conversationId === "old" ? { ...m, canvas: b } : m), [{ id: "old", turn: "t", body: { type: "conversation.bound", canvas: b } }])).toThrow();
    expect(readFileSync(f.index)).toEqual(beforeIndex); expect(existsSync(f.journal)).toBe(false);
  });

  // An earlier build's journal, of each kind it wrote, with its archive and restore meanings: it is settled by those
  // meanings against the v2 index beside it.
  const earlier: Record<"start" | "bind" | "promote" | "restore", Omit<Case, "entries"> & { entries: (e: (ConversationMetadata & { state?: string })[]) => (ConversationMetadata & { state?: string })[] }> = {
    start: { change: { kind: "start", id: "new" }, entries: e => [...e.map(m => m.conversationId === "old" ? { ...m, state: "archived" as const } : m), { ...meta("new"), canvas: a }],
      writes: [{ id: "old", turn: "t", body: { type: "conversation.archived" } }, { id: "new", turn: "n", body: { type: "user.message", text: "hi", anchors: [] } }, { id: "new", turn: "n", body: { type: "turn.started" } }] },
    bind: cases.bind,
    promote: { change: { kind: "promote", id: "proj", canvas: a, replaced: ["old"] }, entries: e => e.map(m => m.conversationId === "proj" ? { ...m, canvas: a } : m.conversationId === "old" ? { ...m, state: "archived" as const } : m),
      writes: [{ id: "old", turn: "t", body: { type: "conversation.archived" } }, { id: "proj", turn: "t", body: { type: "conversation.bound", canvas: a } }] },
    restore: { change: { kind: "restore", id: "arch", replaced: ["old"] }, entries: e => e.map(m => m.conversationId === "arch" ? { ...m, state: "current" as const } : m.conversationId === "old" ? { ...m, state: "archived" as const } : m),
      writes: [{ id: "old", turn: "t", body: { type: "conversation.archived" } }, { id: "arch", turn: "r", body: { type: "conversation.restored" } }] },
  };
  // Only recovery reads an archiving change now; this build never stages one, whatever index it writes over.
  it.each(["start", "promote"] as const)("refuses to stage an archiving %s, leaving every record as it was", kind => {
    const f = changeFixture("v2"), c = earlier[kind], beforeLogs = logs(f), beforeIndex = readFileSync(f.index);
    expect(() => f.store.acceptChange(c.change, c.entries(f.entries), c.writes)).toThrow("Invalid change targets");
    expect(logs(f)).toEqual(beforeLogs); expect(readFileSync(f.index)).toEqual(beforeIndex); expect(existsSync(f.journal)).toBe(false);
  });
  // What the earlier build left behind: its journal (pinning each touched history's size before the writes) and the
  // writes themselves; the index is the caller's.
  function stage(f: ReturnType<typeof changeFixture>, c: Case): string {
    const touched = [...new Set(c.writes.map(w => w.id))];
    const pinned = c.change.kind === "start" ? touched.filter(id => id !== c.change.id) : touched;
    const previous = pinned.map(id => { const stat = statSync(f.path(id)); return { id, size: stat.size, ino: stat.ino, dev: stat.dev }; });
    for (const w of c.writes) f.store.append(w.id, w.turn, w.body);
    const journal = JSON.stringify({ v: 1, ...c.change, previous });
    writeFileSync(f.journal, journal);
    return journal;
  }
  const earlierKinds = Object.keys(earlier) as (keyof typeof earlier)[];
  it.each(earlierKinds)("rolls back an earlier build's %s beside its v2 index when the crash came before the rename", kind => {
    const f = changeFixture("v2"), c = earlier[kind];
    const beforeLogs = logs(f), beforeIndex = readFileSync(f.index);
    stage(f, c);
    const restarted = new ConversationStore(f.root);
    expect(logs(f)).toEqual(beforeLogs); expect(readFileSync(f.index)).toEqual(beforeIndex); expect(existsSync(f.journal)).toBe(false);
    expect(restarted.list()).toEqual(f.entries);
  });
  it.each(earlierKinds)("keeps an earlier build's %s committed by its v2 index rename", kind => {
    const f = changeFixture("v2"), c = earlier[kind];
    stage(f, c);
    const committed = v2Index(c.entries(f.raw));
    writeFileSync(f.index, committed);
    const afterLogs = logs(f);
    const restarted = new ConversationStore(f.root);
    expect(logs(f)).toEqual(afterLogs); expect(readFileSync(f.index, "utf8")).toBe(committed); expect(existsSync(f.journal)).toBe(false);
    expect(restarted.list()).toEqual(current(c.entries(f.raw)));
  });
  it("reads an earlier build's unversioned journal as a start", () => {
    const f = changeFixture("v2"), c = earlier.start, beforeLogs = logs(f);
    const { v: _v, kind: _kind, ...legacyJournal } = JSON.parse(stage(f, c));
    writeFileSync(f.journal, JSON.stringify(legacyJournal));
    new ConversationStore(f.root);
    expect(logs(f)).toEqual(beforeLogs); expect(existsSync(f.journal)).toBe(false);
  });
  // An earlier build never writes v3, so its archiving or restoring journal beside a v3 index is damaged: nothing is
  // truncated and the journal stays for diagnosis.
  it.each(["start", "promote", "restore"] as const)("refuses an earlier build's archiving %s beside a v3 index without touching any record", kind => {
    const f = changeFixture("v3"), c = earlier[kind];
    stage(f, c);
    const touched = logs(f), index = readFileSync(f.index), journal = readFileSync(f.journal);
    expect(() => new ConversationStore(f.root)).toThrow(`Invalid ${kind} recovery record`);
    expect(logs(f)).toEqual(touched); expect(readFileSync(f.index)).toEqual(index); expect(readFileSync(f.journal)).toEqual(journal); expect(hooks.opened.size).toBe(0);
  });
});

// An archived conversation of a v2 index reads as seen: the interruption recorded when it was archived is no unseen
// end. Its next turn's end counts, as for any conversation without a seen marker.
it("lists a conversation archived in a v2 index as seen, and its end after a later send as unseen", async () => {
  const f = setup();
  const archived: EventPayload[] = [{ type: "user.message", text: "hi", anchors: [] }, { type: "turn.started" }, { type: "interrupted", reason: "user" }, { type: "conversation.archived" }];
  const done: EventPayload[] = [{ type: "user.message", text: "hi", anchors: [] }, { type: "turn.started" }, { type: "turn.done" }];
  for (const body of archived) f.store.append("arch", "t", body);
  for (const body of done) f.store.append("cur", "u", body);
  writeFileSync(f.index, v2Index([{ ...meta("arch"), state: "archived", seenSeq: 0 }, { ...meta("cur"), seenSeq: 3 }]));
  let session = 0;
  const service = new ConversationService(new ConversationStore(f.root), async (_request, stored) => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, ...(stored ? { sessionId: stored.session.sessionId } : {}) }), async input => ({ sessionId: input.sessionId ?? `s${++session}`, send: async () => {}, answer: () => false, stop: async () => {}, close: async () => {} }), () => {});
  expect(service.list("/repo").map(c => [c.conversationId, c.phase, c.unseen])).toEqual([["arch", "ended", false], ["cur", "ended", false]]);
  await service.send("arch", "again", []);
  service.receive("arch", { type: "turn.done" });
  expect(service.list("/repo").find(c => c.conversationId === "arch")).toMatchObject({ phase: "ended", unseen: true });
});

it("lists a history over the byte limit as a read error for that row only", () => {
  const f = setup(); f.store.save([meta("big"), { ...meta("small"), canvas: { path: ".doan/canvases/b.html" } }]);
  f.store.append("big", "t", { type: "message.delta", messageId: "m", text: "x".repeat(400) }); f.store.append("small", "t", { type: "turn.done" });
  hooks.limit = 300;
  const service = new ConversationService(f.store, async () => { throw new Error("unused"); }, async () => { throw new Error("unused"); }, () => {});
  expect(service.list("/repo").map(s => [s.conversationId, s.readError ?? false])).toEqual([["big", true], ["small", false]]);
});


describe("Fast unused history", () => {
  it.each([{}, { reason: "plan", turnedOff: true }, { reason: "extra_usage", turnedOff: true }, { reason: "model", turnedOff: true }, { reason: "policy", turnedOff: true }, { reason: "cooldown" }])("reads Fast unused after reopening: %j", fields => {
    const f = setup();
    const event = { type: "fast.unused", ...fields, v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-11-06T00:00:00Z" };
    writeFileSync(f.path("c"), JSON.stringify(event) + "\n");
    expect(new ConversationStore(f.root).read("c")).toEqual([event]);
  });
  it.each([{ turnedOff: true }, { reason: "cooldown", turnedOff: true }, { reason: "unknown" }, { reason: null }, { reason: 1 }, { turnedOff: false }, { turnedOff: "true" }, { turnedOff: null }])("rejects corrupt Fast unused fields: %j", fields => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify({ type: "fast.unused", ...fields, v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-11-06T00:00:00Z" }) + "\n");
    expect(() => new ConversationStore(f.root).read("c")).toThrow();
  });
});

// The model a model_unavailable turn named is kept with that end, so a reopened thread reads the same
// cause. It comes only with that code.
describe("model unavailable history", () => {
  const end = (fields: object) => ({ type: "turn.failed", ...fields, v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-11-07T00:00:00Z" });
  it.each([{ code: "model_unavailable", model: "gpt-6-astra" }, { code: "model_unavailable", model: "gpt-6-astra", detail: "The 'gpt-6-astra' model is not supported." }, { code: "unknown" }])("reads a turn end after reopening: %j", fields => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify(end(fields)) + "\n");
    expect(new ConversationStore(f.root).read("c")).toEqual([end(fields)]);
  });
  it.each([{ code: "model_unavailable" }, { code: "model_unavailable", model: "" }, { code: "model_unavailable", model: 1 }, { code: "unknown", model: "gpt-6-astra" }])("rejects a corrupt model on a turn end: %j", fields => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify(end(fields)) + "\n");
    expect(() => new ConversationStore(f.root).read("c")).toThrow();
  });
});

// A Claude turn whose prompt the CLI never read ends with prompt_unread; any code outside the closed list still makes the
// history unreadable.
describe("prompt unread history", () => {
  const end = (fields: object) => ({ type: "turn.failed", ...fields, v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-11-12T00:00:00Z" });
  it("reads a turn that ended with prompt_unread after reopening", () => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify(end({ code: "prompt_unread" })) + "\n");
    expect(new ConversationStore(f.root).read("c")).toEqual([end({ code: "prompt_unread" })]);
  });
  it.each(["prompt_missing", "PROMPT_UNREAD", ""])("still rejects an unknown code: %s", code => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify(end({ code })) + "\n");
    expect(() => new ConversationStore(f.root).read("c")).toThrow();
  });
});

// A turn that handed off to several canvases names each resolution's request; lines from before keep reading, and a
// missed line without its canvas makes the history unreadable.
describe("multi-handoff history", () => {
  const event = (fields: object, seq = 1) => ({ ...fields, v: 1, conversationId: "c", turnId: "t", seq, at: "2026-11-13T00:00:00Z" });
  it("reads requests, per-canvas resolutions and missed lines after reopening, beside a resolution without a canvas", () => {
    const f = setup();
    const events = [
      event({ type: "handoff.requested", canvas: { path: ".doan/canvases/b.html" }, text: "Go on." }, 1),
      event({ type: "handoff.resolved", outcome: "cancelled" }, 2),
      event({ type: "handoff.resolved", canvas: { path: ".doan/canvases/b.html" }, outcome: "refused", reason: "has_conversation" }, 3),
      event({ type: "handoff.missed", canvas: { path: ".doan/canvases/c.html", id: "c" } }, 4),
    ];
    writeFileSync(f.path("c"), events.map(e => JSON.stringify(e) + "\n").join(""));
    expect(new ConversationStore(f.root).read("c")).toEqual(events);
  });
  it.each([{}, { canvas: null }, { canvas: { id: "c" } }, { canvas: { path: ".doan/canvases/c.html", id: 1 } }])("rejects a missed line without a valid canvas: %j", fields => {
    const f = setup();
    writeFileSync(f.path("c"), JSON.stringify(event({ type: "handoff.missed", ...fields })) + "\n");
    expect(() => new ConversationStore(f.root).read("c")).toThrow();
  });
});
