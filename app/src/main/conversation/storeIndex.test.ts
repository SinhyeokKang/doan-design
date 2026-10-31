import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore, parseIndex, restoreEntries, type ConversationMetadata } from "./store";
const hooks = vi.hoisted(() => ({ failRename: false, journals: [] as string[] }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: (from: import("node:fs").PathLike, to: import("node:fs").PathLike) => {
    if (String(to).endsWith("start-undo.json")) hooks.journals.push(fs.readFileSync(from, "utf8"));
    if (hooks.failRename && String(to).endsWith("index.json")) { hooks.failRename = false; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
    return fs.renameSync(from, to);
  } };
});
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const roots: string[] = [];
afterEach(() => { hooks.failRename = false; hooks.journals = []; roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Seeds files before the store opens so construction-time recovery sees them.
function seed(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-index-"))); roots.push(root);
  const directory = join(root, "conversations"); mkdirSync(directory, { mode: 0o700 });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return { root, directory, index: join(directory, "index.json"), journal: join(directory, "start-undo.json"), path: (id: string) => join(directory, `${id}.jsonl`) };
}
const legacy = (id: string): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id, canvas: { path: `.doan/canvases/${id}.html` }, state: "current", owner: { kind: "legacy-external" },
  session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profiles/codex", cwd: "/repo" } });
const owned = (id: string): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id, state: "current",
  owner: { kind: "doan", provider: "antigravity", connectionId: "conn-1", accountId: "acct-1", workspaceId: null, profile: "antigravity" },
  session: { runtime: "antigravity", origin: "newDesign", sessionId: id, configDir: "/profiles/antigravity", cwd: "/repo" } });
const line = (id: string, seq: number, type: string) => JSON.stringify({ type, v: 1, conversationId: id, turnId: "t", seq, at: "2026-10-27T00:00:00.000Z" }) + "\n";

describe("index version interpretation", () => {
  it("reads v1 as legacy-external without attributing any entry to a doan account", () => {
    const result = parseIndex(fixture("index-v1.json"));
    if (!result.ok) throw new Error(result.code);
    expect(result.entries.map(m => [m.conversationId, m.owner])).toEqual([["legacy-1", { kind: "legacy-external" }], ["legacy-2", { kind: "legacy-external" }]]);
    expect(result.entries[1]).not.toHaveProperty("owner.provider");
  });
  it("reads the v2 fixture with both owner kinds", () => {
    expect(parseIndex(fixture("index-v2.json"))).toEqual({ ok: true, entries: JSON.parse(fixture("index-v2.json")).conversations });
  });
  it("separates unknown versions from corrupt and invalid indexes", () => {
    const v2 = JSON.parse(fixture("index-v2.json"));
    expect(parseIndex(JSON.stringify({ ...v2, v: 3 }))).toEqual({ ok: false, code: "unknown_version" });
    expect(parseIndex(JSON.stringify({ conversations: [] }))).toEqual({ ok: false, code: "unknown_version" });
    for (const text of ["broken", "", "null", "[]", fixture("index-v2.json").slice(0, 200)]) expect(parseIndex(text)).toEqual({ ok: false, code: "corrupt" });
    const invalid = [
      (m: any) => { delete m.owner; },
      (m: any) => { m.owner.token = "x"; },
      (m: any) => { m.session.runtime = "claude"; },
      (m: any) => { m.owner.profile = "/profiles/cursor"; },
      (m: any) => { m.owner = { kind: "legacy-external" }; },
    ];
    for (const mutate of invalid) {
      const copy = JSON.parse(fixture("index-v2.json")); mutate(copy.conversations[1]);
      expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
    }
    const duplicate = JSON.parse(fixture("index-v2.json")); duplicate.conversations[1].conversationId = "legacy-1";
    expect(parseIndex(JSON.stringify(duplicate))).toEqual({ ok: false, code: "invalid" });
  });
});

describe("conversation index v2 storage", () => {
  it("lists a v1 index as legacy-external and writes v2 on the next save", () => {
    const f = seed({ "index.json": fixture("index-v1.json") });
    const store = new ConversationStore(f.root);
    expect(store.list().every(m => m.owner.kind === "legacy-external")).toBe(true);
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v1.json"));
    store.save(store.list());
    const saved = JSON.parse(readFileSync(f.index, "utf8"));
    expect(saved.v).toBe(2);
    expect(saved.conversations.map((m: ConversationMetadata) => m.owner)).toEqual([{ kind: "legacy-external" }, { kind: "legacy-external" }]);
  });
  it("round-trips legacy and doan-owned entries", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    store.save([legacy("old"), owned("new")]);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), owned("new")]);
  });
  it("rejects invalid entries before replacing the index", () => {
    const f = seed(); const store = new ConversationStore(f.root); store.save([legacy("old")]);
    const before = readFileSync(f.index);
    const bad = { ...owned("new"), session: { ...owned("new").session, runtime: "codex" as const } };
    expect(() => store.save([legacy("old"), bad])).toThrow("Invalid conversation index");
    expect(readFileSync(f.index)).toEqual(before);
  });
  it("refuses unknown versions without overwriting the index or touching history", () => {
    const future = JSON.stringify({ v: 3, conversations: [] });
    const f = seed({ "index.json": future, "old.jsonl": line("old", 1, "turn.done") });
    const store = new ConversationStore(f.root);
    expect(() => store.list()).toThrow("Unsupported conversation index version");
    expect(() => store.save([legacy("old")])).toThrow("Unsupported conversation index version");
    expect(readFileSync(f.index, "utf8")).toBe(future);
    expect(store.read("old")).toHaveLength(1);
  });
  it("reports a corrupt index explicitly and keeps it", () => {
    const f = seed({ "index.json": "{broken" });
    const store = new ConversationStore(f.root);
    expect(() => store.list()).toThrow("Invalid conversation index");
    expect(() => store.save([legacy("old")])).toThrow("Invalid conversation index");
    expect(readFileSync(f.index, "utf8")).toBe("{broken");
  });
  it("keeps the v1 index readable when the first v2 save is interrupted", () => {
    const f = seed({ "index.json": fixture("index-v1.json") });
    const store = new ConversationStore(f.root);
    hooks.failRename = true;
    expect(() => store.save(store.list())).toThrow("EIO");
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v1.json"));
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    expect(store.list().map(m => m.owner.kind)).toEqual(["legacy-external", "legacy-external"]);
  });
  it("writes the undo journal with its version, kind and file identity only", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    store.save([owned("old")]); store.append("old", "t", { type: "turn.done" });
    store.acceptStart([{ ...owned("old"), state: "archived" }, legacy("new")], "new", [{ id: "old", turn: "t", body: { type: "conversation.archived" } }, { id: "new", turn: "t", body: { type: "turn.started" } }]);
    expect(hooks.journals).toHaveLength(1);
    const journal = JSON.parse(hooks.journals[0]!);
    expect(Object.keys(journal)).toEqual(["v", "kind", "id", "previous"]);
    expect([journal.v, journal.kind]).toEqual([1, "start"]);
    expect(Object.keys(journal.previous[0])).toEqual(["id", "size", "ino", "dev"]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(2);
  });
});

describe("start recovery across index versions", () => {
  function interrupted(index: string) {
    const f = seed({ "index.json": index, "legacy-1.jsonl": line("legacy-1", 1, "turn.done") });
    const stat = statSync(f.path("legacy-1"));
    writeFileSync(f.path("legacy-1"), line("legacy-1", 1, "turn.done") + line("legacy-1", 2, "conversation.archived"));
    writeFileSync(f.path("new"), line("new", 1, "turn.started"));
    writeFileSync(f.journal, JSON.stringify({ id: "new", previous: [{ id: "legacy-1", size: stat.size, ino: stat.ino, dev: stat.dev }] }));
    return f;
  }
  it("rolls back an uncommitted start over a v1 index and leaves the v1 file in place", () => {
    const f = interrupted(fixture("index-v1.json"));
    const store = new ConversationStore(f.root);
    expect(existsSync(f.journal)).toBe(false); expect(existsSync(f.path("new"))).toBe(false);
    expect(readFileSync(f.path("legacy-1"), "utf8")).toBe(line("legacy-1", 1, "turn.done"));
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v1.json"));
    expect(store.list().map(m => m.owner.kind)).toEqual(["legacy-external", "legacy-external"]);
  });
  it("keeps a start committed by a v2 index rename that replaced a v1 index", () => {
    const committed = JSON.parse(fixture("index-v2.json"));
    committed.conversations[0].state = "archived";
    committed.conversations.push({ ...legacy("new"), canvas: { path: ".doan/canvases/a.html", id: "a" } });
    const f = interrupted(JSON.stringify(committed));
    const logs = [f.path("legacy-1"), f.path("new")].map(path => readFileSync(path));
    const store = new ConversationStore(f.root);
    expect(existsSync(f.journal)).toBe(false);
    expect([f.path("legacy-1"), f.path("new")].map(path => readFileSync(path))).toEqual(logs);
    expect(store.list().map(m => [m.conversationId, m.state, m.owner.kind])).toEqual([["legacy-1", "archived", "legacy-external"], ["doan-1", "current", "doan"], ["new", "current", "legacy-external"]]);
  });
  it("blocks recovery without truncating history when the index version is unknown", () => {
    const f = interrupted(JSON.stringify({ v: 3, conversations: [] }));
    const logs = [f.path("legacy-1"), f.path("new"), f.journal].map(path => readFileSync(path));
    expect(() => new ConversationStore(f.root)).toThrow("Unsupported conversation index version");
    expect([f.path("legacy-1"), f.path("new"), f.journal].map(path => readFileSync(path))).toEqual(logs);
  });
});

describe("home conversation fields in index v2", () => {
  it("reads the optional model, effort and start canvases without changing the version", () => {
    const raw = JSON.parse(fixture("index-v2-home.json"));
    expect(raw.v).toBe(2);
    expect(parseIndex(fixture("index-v2-home.json"))).toEqual({ ok: true, entries: raw.conversations });
  });
  it("round-trips the fields and leaves entries without them unchanged", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const home = { ...owned("home"), model: "gemini-3-pro", effort: "low", canvasesAtStart: [{ path: ".doan/canvases/a.html", id: "a" }] };
    const empty = { ...owned("empty"), canvasesAtStart: [] };
    store.save([legacy("old"), home, empty]);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), home, empty]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).conversations[0]).not.toHaveProperty("model");
  });
  it("keeps a conversation bound to a design-system canvas in .doan/ds/", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const bound = { ...legacy("button"), canvas: { path: ".doan/ds/button.html", id: "button" }, canvasesAtStart: [{ path: ".doan/ds/color.html" }] };
    store.save([bound]);
    expect(new ConversationStore(f.root).list()).toEqual([bound]);
  });
  it.each([".doan/dsx/a.html", ".doan/ds", ".doan/ds/../canvases/a.html", ".doan/assets/a.html"])("rejects a canvas path %s outside the canvas directories", path => {
    const copy = JSON.parse(fixture("index-v2-home.json")); copy.conversations[1].canvas = { path };
    expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
  });
  it("rejects malformed fields like any other entry field", () => {
    const invalid = [
      (m: any) => { m.model = ""; },
      (m: any) => { m.model = 1; },
      (m: any) => { m.effort = null; },
      (m: any) => { m.effort = ""; },
      (m: any) => { m.canvasesAtStart = {}; },
      (m: any) => { m.canvasesAtStart = [{ path: "a.html" }]; },
      (m: any) => { m.canvasesAtStart = [".doan/canvases/a.html"]; },
    ];
    for (const mutate of invalid) {
      const copy = JSON.parse(fixture("index-v2-home.json")); mutate(copy.conversations[1]);
      expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
    }
  });
  it("keeps a v3 index with the new fields as an unknown version and never overwrites it", () => {
    const future = JSON.stringify({ ...JSON.parse(fixture("index-v2-home.json")), v: 3 });
    expect(parseIndex(future)).toEqual({ ok: false, code: "unknown_version" });
    const f = seed({ "index.json": future }); const store = new ConversationStore(f.root);
    expect(() => store.save([legacy("old")])).toThrow("Unsupported conversation index version");
    expect(readFileSync(f.index, "utf8")).toBe(future);
  });
});

describe("user.message attachments in event v1", () => {
  const attachments = [
    { name: "shot.png", size: 2048, kind: "image", path: "/Users/me/Desktop/shot.png" },
    { name: "notes.md", size: 0, kind: "file", path: "/tmp/notes.md" },
  ] as const;
  const message = (extra: Record<string, unknown>) => JSON.stringify({ type: "user.message", text: "hi", anchors: [], v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-10-29T00:00:00.000Z", ...extra }) + "\n";
  it("round-trips attachment metadata in version 1", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const saved = store.append("c", "t", { type: "user.message", text: "hi", anchors: [], attachments: [...attachments] });
    expect(saved.v).toBe(1);
    expect(new ConversationStore(f.root).read("c")).toEqual([saved]);
    expect(saved).toMatchObject({ attachments });
  });
  it("reads a message without attachments and ignores unknown fields", () => {
    const f = seed({ "c.jsonl": message({ future: { x: 1 } }) });
    expect(new ConversationStore(f.root).read("c")).toHaveLength(1);
  });
  it("rejects malformed attachment metadata", () => {
    const bad = [
      {},
      [null],
      [{ ...attachments[0], kind: "pdf" }],
      [{ ...attachments[0], path: "shot.png" }],
      [{ ...attachments[0], size: -1 }],
      [{ ...attachments[0], size: 1.5 }],
      [{ ...attachments[0], name: "" }],
      [{ name: "shot.png", kind: "image", path: "/a.png" }],
    ];
    for (const value of bad) {
      const f = seed({ "c.jsonl": message({ attachments: value }) });
      expect(() => new ConversationStore(f.root).read("c")).toThrow("Invalid conversation event");
    }
  });
});
it("reads the optional Home mark only as true and keeps reading entries without it", () => {
  const entry = { conversationId: "0f8fad5b-d9cb-469f-a165-70867728950e", root: "/repo", title: "t", state: "current", owner: { kind: "legacy-external" },
    session: { runtime: "codex", origin: "newDesign", sessionId: "s", configDir: "/c", cwd: "/repo" } };
  expect(parseIndex(JSON.stringify({ v: 2, conversations: [{ ...entry, fromHome: true }] }))).toMatchObject({ ok: true, entries: [{ fromHome: true }] });
  expect(parseIndex(JSON.stringify({ v: 2, conversations: [entry] }))).toMatchObject({ ok: true });
  expect(parseIndex(JSON.stringify({ v: 2, conversations: [{ ...entry, fromHome: "yes" }] }))).toEqual({ ok: false, code: "invalid" });
});

describe("seen marker in index v2", () => {
  it("round-trips seenSeq and reads entries without it", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    store.save([legacy("old"), { ...owned("seen"), seenSeq: 0 }, { ...owned("later"), seenSeq: 12 }]);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), { ...owned("seen"), seenSeq: 0 }, { ...owned("later"), seenSeq: 12 }]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(2);
    expect(new ConversationStore(f.root).list()[0]).not.toHaveProperty("seenSeq");
  });
  it.each([-1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1])("rejects seenSeq %s", seenSeq => {
    const copy = JSON.parse(fixture("index-v2.json")); copy.conversations[0].seenSeq = seenSeq;
    expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
  });
});

describe("restoreEntries", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  it("swaps the archived conversation with the current one of its canvas and leaves the rest", () => {
    const current = { ...legacy("now"), canvas }, archived = { ...legacy("then"), canvas, state: "archived" as const }, other = legacy("other"), older = { ...legacy("older"), canvas, state: "archived" as const };
    expect(restoreEntries([current, archived, other, older], "then")).toEqual({ entries: [{ ...current, state: "archived" }, { ...archived, state: "current" }, other, older], replaced: ["now"] });
  });
  it("matches the canvas by ID across a move", () => {
    const current = { ...legacy("now"), canvas: { path: ".doan/canvases/moved.html", id: "a" } }, archived = { ...legacy("then"), canvas, state: "archived" as const };
    expect(restoreEntries([current, archived], "then")?.replaced).toEqual(["now"]);
  });
  it("refuses a target that is not an archived canvas conversation", () => {
    expect(restoreEntries([legacy("now")], "now")).toBeNull();
    expect(restoreEntries([legacy("now")], "missing")).toBeNull();
  });
});
