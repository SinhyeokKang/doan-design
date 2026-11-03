import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { committedDeletions, ConversationStore, deleteEntries, type ConversationMetadata } from "./store";
const hooks = vi.hoisted(() => ({ failUnlink: "", failRename: "" }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, unlinkSync: (path: import("node:fs").PathLike) => {
    if (hooks.failUnlink && String(path).endsWith(hooks.failUnlink)) { hooks.failUnlink = ""; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
    return fs.unlinkSync(path);
  }, renameSync: (from: import("node:fs").PathLike, to: import("node:fs").PathLike) => {
    if (hooks.failRename && String(to).endsWith(hooks.failRename)) { hooks.failRename = ""; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
    return fs.renameSync(from, to);
  } };
});
const roots: string[] = [];
afterEach(() => { hooks.failUnlink = ""; hooks.failRename = ""; vi.restoreAllMocks(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Seeds files before the store opens so construction-time recovery and cleanup see them.
function seed(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-delete-"))); roots.push(root);
  const directory = join(root, "conversations"); mkdirSync(directory, { mode: 0o700 });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return { root, directory, index: join(directory, "index.json"), journal: join(directory, "start-undo.json"), record: join(directory, "deletions.json"), path: (id: string) => join(directory, `${id}.jsonl`) };
}
const meta = (id: string, state: "current" | "archived" = "current", canvas = ".doan/canvases/a.html"): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id, canvas: { path: canvas }, state,
  owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profile", cwd: "/repo" } });
const line = (id: string, seq: number, type: string) => JSON.stringify({ type, v: 1, conversationId: id, turnId: "t", seq, at: "2026-11-03T00:00:00.000Z" }) + "\n";
const index = (...entries: ConversationMetadata[]) => JSON.stringify({ v: 2, conversations: entries });
const recorded = (...ids: string[]) => JSON.stringify({ v: 1, ids });
// One app start: the store recovers in its constructor and the service then finishes recorded deletions.
function launch(root: string, discard: (id: string) => void = () => {}) { const store = new ConversationStore(root); store.finishDeletions(discard); return store; }

describe("deleteEntries", () => {
  it("leaves out only the deleted conversation and keeps every other entry as it was", () => {
    const entries = [meta("cur"), meta("old", "archived"), meta("other", "current", ".doan/canvases/b.html")];
    expect(deleteEntries(entries, "cur")).toEqual([meta("old", "archived"), meta("other", "current", ".doan/canvases/b.html")]);
  });
  it("does not make an archived conversation of the same canvas current", () => {
    expect(deleteEntries([meta("cur"), meta("old", "archived")], "cur")?.[0]).toEqual(meta("old", "archived"));
  });
  it("is null for a conversation the index does not hold", () => {
    expect(deleteEntries([meta("a")], "b")).toBeNull();
    expect(deleteEntries([], "a")).toBeNull();
  });
});

describe("committedDeletions", () => {
  it("names the recorded ids the index no longer holds", () => {
    expect(committedDeletions(["a", "gone", "gone2"], ["a", "b"])).toEqual(["gone", "gone2"]);
    expect(committedDeletions([], ["a"])).toEqual([]);
    expect(committedDeletions(["a"], [])).toEqual(["a"]);
  });
  it("counts a recorded id that differs from an indexed id only by case as still indexed", () => {
    expect(committedDeletions(["abc", "ABC-2"], ["Abc", "abc-2"])).toEqual([]);
  });
});

describe("ConversationStore.delete", () => {
  it("removes the index entry and the history, leaving other conversations as they were", () => {
    const f = seed({ "index.json": index(meta("cur"), meta("old", "archived")), "cur.jsonl": line("cur", 1, "turn.started"), "old.jsonl": line("old", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    store.delete("cur");
    expect(store.list()).toEqual([meta("old", "archived")]);
    expect(existsSync(f.path("cur"))).toBe(false);
    expect(store.read("cur")).toEqual([]);
    expect(store.read("old")).toHaveLength(1);
    expect(new ConversationStore(f.root).list()).toEqual([meta("old", "archived")]);
  });
  it("saves an empty index when the last conversation is deleted", () => {
    const f = seed({ "index.json": index(meta("only")), "only.jsonl": line("only", 1, "turn.started") });
    new ConversationStore(f.root).delete("only");
    expect(JSON.parse(readFileSync(f.index, "utf8"))).toEqual({ v: 2, conversations: [] });
  });
  it("refuses an id the index does not hold as not_found and changes nothing", () => {
    const f = seed({ "index.json": index(meta("a")), "a.jsonl": line("a", 1, "turn.started") });
    const before = readFileSync(f.index, "utf8");
    expect(() => new ConversationStore(f.root).delete("missing")).toThrow("not_found");
    expect(readFileSync(f.index, "utf8")).toBe(before);
    expect(existsSync(f.path("a"))).toBe(true);
  });
  it("succeeds when the history is already gone", () => {
    const f = seed({ "index.json": index(meta("a")) });
    new ConversationStore(f.root).delete("a");
    expect(JSON.parse(readFileSync(f.index, "utf8")).conversations).toEqual([]);
  });
  it("commits the index before the history and still succeeds when the unlink fails; the next start removes it", () => {
    const f = seed({ "index.json": index(meta("a"), meta("b", "current", ".doan/canvases/b.html")), "a.jsonl": line("a", 1, "turn.started"), "b.jsonl": line("b", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.failUnlink = "a.jsonl";
    expect(() => store.delete("a")).not.toThrow();
    expect(store.list().map(m => m.conversationId)).toEqual(["b"]);
    expect(existsSync(f.path("a"))).toBe(true);
    const discarded: string[] = [];
    launch(f.root, id => discarded.push(id));
    expect(existsSync(f.path("a"))).toBe(false);
    expect(existsSync(f.path("b"))).toBe(true);
    expect(discarded).toEqual(["a"]);
    expect(existsSync(f.record)).toBe(false);
  });
  it("records the deletion before the index commit and keeps everything when the index rename fails", () => {
    const f = seed({ "index.json": index(meta("a")), "a.jsonl": line("a", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    const before = readFileSync(f.index, "utf8"), history = readFileSync(f.path("a"), "utf8");
    hooks.failRename = "index.json";
    expect(() => store.delete("a")).toThrow("EIO");
    expect(readFileSync(f.index, "utf8")).toBe(before);
    expect(readFileSync(f.path("a"), "utf8")).toBe(history);
    expect(JSON.parse(readFileSync(f.record, "utf8"))).toEqual({ v: 1, ids: ["a"] });
    // The next start finds the conversation still indexed: the deletion never committed, so only the record goes.
    const discarded: string[] = [];
    const next = launch(f.root, id => discarded.push(id));
    expect(next.list()).toEqual([meta("a")]);
    expect(readFileSync(f.path("a"), "utf8")).toBe(history);
    expect(discarded).toEqual([]);
    expect(existsSync(f.record)).toBe(false);
  });
  it("deletes nothing when the record cannot be written or read", () => {
    const f = seed({ "index.json": index(meta("a")), "a.jsonl": line("a", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    const before = readFileSync(f.index, "utf8");
    hooks.failRename = "deletions.json";
    expect(() => store.delete("a")).toThrow("EIO");
    expect(readFileSync(f.index, "utf8")).toBe(before);
    expect(existsSync(f.path("a"))).toBe(true);
    expect(existsSync(f.record)).toBe(false);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    writeFileSync(f.record, "broken");
    expect(() => store.delete("a")).toThrow();
    expect(readFileSync(f.index, "utf8")).toBe(before);
    expect(existsSync(f.path("a"))).toBe(true);
  });
  it("adds each deletion to the record until the next start finishes them", () => {
    const f = seed({ "index.json": index(meta("a"), meta("b", "current", ".doan/canvases/b.html")), "a.jsonl": line("a", 1, "turn.started"), "b.jsonl": line("b", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    store.delete("a"); store.delete("b");
    expect(JSON.parse(readFileSync(f.record, "utf8"))).toEqual({ v: 1, ids: ["a", "b"] });
    const discarded: string[] = [];
    launch(f.root, id => discarded.push(id));
    expect(discarded).toEqual(["a", "b"]);
    expect(existsSync(f.record)).toBe(false);
  });
  it("recovers a pending journal before deleting", () => {
    const f = seed({ "index.json": index(meta("a")), "a.jsonl": line("a", 1, "turn.started") });
    const store = new ConversationStore(f.root);
    // A start that died before its index rename: its own log goes with it.
    writeFileSync(f.path("new"), line("new", 1, "turn.started"));
    writeFileSync(f.journal, JSON.stringify({ v: 1, kind: "start", id: "new", previous: [] }));
    store.delete("a");
    expect(existsSync(f.journal)).toBe(false);
    expect(existsSync(f.path("new"))).toBe(false);
    expect(store.list()).toEqual([]);
  });
  it("deletes nothing from an index it cannot read", () => {
    for (const text of ["broken", JSON.stringify({ v: 3, conversations: [] })]) {
      const f = seed({ "index.json": text, "a.jsonl": line("a", 1, "turn.started") });
      const store = new ConversationStore(f.root);
      expect(() => store.delete("a")).toThrow();
      expect(readFileSync(f.index, "utf8")).toBe(text);
      expect(existsSync(f.path("a"))).toBe(true);
    }
  });
});

describe("finishing recorded deletions at start", () => {
  it("never removes a history no deletion recorded, also across launches after index.json was lost (review Y1)", () => {
    const f = seed({ "old1.jsonl": line("old1", 1, "turn.started"), "old2.jsonl": line("old2", 1, "turn.started") });
    const store = launch(f.root);
    // The person starts one new conversation, which writes a new index over the lost one.
    store.acceptStart([meta("fresh")], "fresh", [{ id: "fresh", turn: "t", body: { type: "turn.started" } }]);
    launch(f.root); launch(f.root);
    for (const id of ["old1", "old2", "fresh"]) expect(existsSync(f.path(id)), id).toBe(true);
  });
  it("leaves an unrecorded history the index does not hold, and removes only the recorded one", () => {
    const f = seed({ "index.json": index(meta("kept")), "kept.jsonl": line("kept", 1, "turn.started"), "gone.jsonl": line("gone", 1, "turn.started"),
      "stray.jsonl": line("stray", 1, "turn.started"), "deletions.json": recorded("gone") });
    const discarded: string[] = [];
    launch(f.root, id => discarded.push(id));
    expect(existsSync(f.path("gone"))).toBe(false);
    expect(existsSync(f.path("stray"))).toBe(true);
    expect(existsSync(f.path("kept"))).toBe(true);
    expect(discarded).toEqual(["gone"]);
    expect(existsSync(f.record)).toBe(false);
  });
  it("leaves a recorded link or directory and anything that is not a history", () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "doan-outside-"))); roots.push(outside);
    writeFileSync(join(outside, "target.jsonl"), "x");
    const f = seed({ "index.json": index(), "index-00000000-0000-4000-8000-000000000000.tmp": "{}", "drafts.json": "{}", "deletions.json": recorded("linked", "folder") });
    symlinkSync(join(outside, "target.jsonl"), join(f.directory, "linked.jsonl"));
    mkdirSync(join(f.directory, "folder.jsonl"));
    launch(f.root);
    for (const name of ["index-00000000-0000-4000-8000-000000000000.tmp", "drafts.json", "linked.jsonl", "folder.jsonl"]) expect(existsSync(join(f.directory, name)), name).toBe(true);
    expect(readFileSync(join(outside, "target.jsonl"), "utf8")).toBe("x");
  });
  it("keeps a recorded history whose name differs from an indexed id only by case", () => {
    const f = seed({ "index.json": index(meta("Abc")), "abc.jsonl": line("Abc", 1, "turn.started"), "deletions.json": recorded("abc") });
    const discarded: string[] = [];
    launch(f.root, id => discarded.push(id));
    expect(existsSync(join(f.directory, "abc.jsonl"))).toBe(true);
    expect(discarded).toEqual([]);
  });
  it("does nothing and keeps the record when index.json is missing, damaged or of a newer version", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const files of [{}, { "index.json": "broken" }, { "index.json": JSON.stringify({ v: 3, conversations: [] }) }, { "index.json": JSON.stringify({ v: 2, conversations: [{ bad: true }] }) }]) {
      const f = seed({ ...files, "a.jsonl": line("a", 1, "turn.started"), "deletions.json": recorded("a") });
      const discarded: string[] = [];
      launch(f.root, id => discarded.push(id));
      expect(existsSync(f.path("a")), JSON.stringify(files)).toBe(true);
      expect(readFileSync(f.record, "utf8")).toBe(recorded("a"));
      expect(discarded).toEqual([]);
    }
  });
  it("keeps a record it cannot read and changes nothing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const text of ["broken", JSON.stringify({ v: 2, ids: ["a"] }), JSON.stringify({ v: 1, ids: ["../a"] })]) {
      const f = seed({ "index.json": index(), "a.jsonl": line("a", 1, "turn.started"), "deletions.json": text });
      launch(f.root);
      expect(existsSync(f.path("a"))).toBe(true);
      expect(readFileSync(f.record, "utf8")).toBe(text);
    }
  });
  it("keeps an id in the record when its history cannot be removed, for the next start", () => {
    const f = seed({ "index.json": index(), "gone.jsonl": line("gone", 1, "turn.started"), "deletions.json": recorded("gone") });
    vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.failUnlink = "gone.jsonl";
    launch(f.root);
    expect(existsSync(f.path("gone"))).toBe(true);
    expect(JSON.parse(readFileSync(f.record, "utf8"))).toEqual({ v: 1, ids: ["gone"] });
    launch(f.root);
    expect(existsSync(f.path("gone"))).toBe(false);
    expect(existsSync(f.record)).toBe(false);
  });
});
