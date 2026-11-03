import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore, deleteEntries, orphanHistories, type ConversationMetadata } from "./store";
const hooks = vi.hoisted(() => ({ failUnlink: "" }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, unlinkSync: (path: import("node:fs").PathLike) => {
    if (hooks.failUnlink && String(path).endsWith(hooks.failUnlink)) { hooks.failUnlink = ""; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
    return fs.unlinkSync(path);
  } };
});
const roots: string[] = [];
afterEach(() => { hooks.failUnlink = ""; vi.restoreAllMocks(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Seeds files before the store opens so construction-time recovery and cleanup see them.
function seed(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-delete-"))); roots.push(root);
  const directory = join(root, "conversations"); mkdirSync(directory, { mode: 0o700 });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return { root, directory, index: join(directory, "index.json"), journal: join(directory, "start-undo.json"), path: (id: string) => join(directory, `${id}.jsonl`) };
}
const meta = (id: string, state: "current" | "archived" = "current", canvas = ".doan/canvases/a.html"): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id, canvas: { path: canvas }, state,
  owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profile", cwd: "/repo" } });
const line = (id: string, seq: number, type: string) => JSON.stringify({ type, v: 1, conversationId: id, turnId: "t", seq, at: "2026-11-03T00:00:00.000Z" }) + "\n";
const index = (...entries: ConversationMetadata[]) => JSON.stringify({ v: 2, conversations: entries });

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

describe("orphanHistories", () => {
  it("names only histories of valid ids the index does not hold", () => {
    const names = ["a.jsonl", "gone.jsonl", "index.json", "drafts.json", "start-undo.json", "index-1.tmp", "undo-1.tmp", "drafts-1.tmp", "-bad.jsonl", "a.b.jsonl", "x.jsonl.tmp", ".jsonl", "gone2.jsonl"];
    expect(orphanHistories(names, ["a"]).sort()).toEqual(["gone.jsonl", "gone2.jsonl"]);
  });
  it("counts a name that differs from an indexed id only by case as indexed", () => {
    expect(orphanHistories(["abc.jsonl", "ABC-2.jsonl"], ["Abc", "abc-2"])).toEqual([]);
  });
  it("names every history when the index is empty", () => {
    expect(orphanHistories(["a.jsonl"], [])).toEqual(["a.jsonl"]);
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
    new ConversationStore(f.root);
    expect(existsSync(f.path("a"))).toBe(false);
    expect(existsSync(f.path("b"))).toBe(true);
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

describe("orphan history cleanup at start", () => {
  it("removes regular histories the index does not hold and keeps everything else", () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "doan-outside-"))); roots.push(outside);
    writeFileSync(join(outside, "target.jsonl"), "x");
    const f = seed({ "index.json": index(meta("Kept")), "Kept.jsonl": line("Kept", 1, "turn.started"), "gone.jsonl": line("gone", 1, "turn.started"),
      "index-00000000-0000-4000-8000-000000000000.tmp": "{}", "undo-00000000-0000-4000-8000-000000000000.tmp": "{}", "drafts.json": "{}", "x.jsonl.tmp": "x" });
    symlinkSync(join(outside, "target.jsonl"), join(f.directory, "linked.jsonl"));
    mkdirSync(join(f.directory, "folder.jsonl"));
    new ConversationStore(f.root);
    expect(existsSync(f.path("gone"))).toBe(false);
    expect(existsSync(f.path("Kept"))).toBe(true);
    for (const name of ["index-00000000-0000-4000-8000-000000000000.tmp", "undo-00000000-0000-4000-8000-000000000000.tmp", "drafts.json", "x.jsonl.tmp", "linked.jsonl", "folder.jsonl"])
      expect(existsSync(join(f.directory, name)), name).toBe(true);
    expect(readFileSync(join(outside, "target.jsonl"), "utf8")).toBe("x");
  });
  it("keeps a history whose name differs from an indexed id only by case", () => {
    const f = seed({ "index.json": index(meta("Abc")), "abc.jsonl": line("Abc", 1, "turn.started") });
    new ConversationStore(f.root);
    expect(existsSync(join(f.directory, "abc.jsonl"))).toBe(true);
  });
  it("removes nothing when index.json is missing, damaged or of a newer version", () => {
    for (const files of [{}, { "index.json": "broken" }, { "index.json": JSON.stringify({ v: 3, conversations: [] }) }, { "index.json": JSON.stringify({ v: 2, conversations: [{ bad: true }] }) }]) {
      const f = seed({ ...files, "a.jsonl": line("a", 1, "turn.started") });
      new ConversationStore(f.root);
      expect(existsSync(f.path("a")), JSON.stringify(files)).toBe(true);
    }
  });
  it("cleans up after recovering a committed start, keeping its new history", () => {
    const f = seed({ "index.json": index(meta("new")), "new.jsonl": line("new", 1, "turn.started"), "gone.jsonl": line("gone", 1, "turn.started"),
      "start-undo.json": JSON.stringify({ v: 1, kind: "start", id: "new", previous: [] }) });
    new ConversationStore(f.root);
    expect(existsSync(f.journal)).toBe(false);
    expect(existsSync(f.path("new"))).toBe(true);
    expect(existsSync(f.path("gone"))).toBe(false);
  });
});
