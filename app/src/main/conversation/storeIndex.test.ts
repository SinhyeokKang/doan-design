import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore, parseIndex, type ConversationMetadata } from "./store";
import { FOLDER_ATTACHMENT, IMAGE_NAMED_FOLDER, LEGACY_ATTACHMENTS } from "./attachmentRecords.fixture";
import type { HandoffOrigin } from "./types";
const hooks = vi.hoisted(() => ({ failRename: false, shortWrite: false, failClose: false, closing: null as number | null, journals: [] as string[] }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, writeSync: (...args: Parameters<typeof fs.writeSync>) => {
    if (hooks.shortWrite) { hooks.shortWrite = false; return 0; }
    // The descriptor just written to fully is the one whose close fails.
    if (hooks.failClose) { hooks.failClose = false; hooks.closing = args[0]; }
    return (fs.writeSync as (...a: Parameters<typeof fs.writeSync>) => number)(...args);
  }, closeSync: (fd: number) => {
    fs.closeSync(fd);
    if (fd === hooks.closing) { hooks.closing = null; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
  }, renameSync: (from: import("node:fs").PathLike, to: import("node:fs").PathLike) => {
    if (String(to).endsWith("start-undo.json")) hooks.journals.push(fs.readFileSync(from, "utf8"));
    if (hooks.failRename && String(to).endsWith("index.json")) { hooks.failRename = false; throw Object.assign(new Error("EIO"), { code: "EIO" }); }
    return fs.renameSync(from, to);
  } };
});
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const roots: string[] = [];
afterEach(() => { hooks.failRename = false; hooks.shortWrite = false; hooks.failClose = false; hooks.closing = null; hooks.journals = []; roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
// Seeds files before the store opens so construction-time recovery sees them.
function seed(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-index-"))); roots.push(root);
  const directory = join(root, "conversations"); mkdirSync(directory, { mode: 0o700 });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return { root, directory, index: join(directory, "index.json"), journal: join(directory, "start-undo.json"), path: (id: string) => join(directory, `${id}.jsonl`) };
}
const legacy = (id: string): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id, canvas: { path: `.doan/canvases/${id}.html` }, owner: { kind: "legacy-external" },
  session: { runtime: "codex", origin: "new", sessionId: id, configDir: "/profiles/codex", cwd: "/repo" } });
const owned = (id: string): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id,
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
    expect(parseIndex(fixture("index-v2.json"))).toEqual({ ok: true, entries: JSON.parse(fixture("index-v2.json")).conversations.map(({ state: _s, ...rest }: { state: string }) => rest) });
  });
  it("separates unknown versions from corrupt and invalid indexes", () => {
    const v2 = JSON.parse(fixture("index-v2.json"));
    expect(parseIndex(JSON.stringify({ ...v2, v: 4 }))).toEqual({ ok: false, code: "unknown_version" });
    expect(parseIndex(JSON.stringify({ conversations: [] }))).toEqual({ ok: false, code: "unknown_version" });
    for (const text of ["broken", "", "null", "[]", fixture("index-v2.json").slice(0, 200)]) expect(parseIndex(text)).toEqual({ ok: false, code: "corrupt" });
    const invalid = [
      (m: any) => { delete m.owner; },
      (m: any) => { m.owner.token = "x"; },
      (m: any) => { m.session.runtime = "claude"; },
      (m: any) => { m.owner.profile = "/profiles/cursor"; },
      (m: any) => { m.owner = { kind: "legacy-external" }; },
      // v1 and v2 knew two states; any other value, or none, came from no build that wrote them.
      (m: any) => { m.state = "pinned"; },
      (m: any) => { delete m.state; },
    ];
    for (const mutate of invalid) {
      const copy = JSON.parse(fixture("index-v2.json")); mutate(copy.conversations[1]);
      expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
    }
    const duplicate = JSON.parse(fixture("index-v2.json")); duplicate.conversations[1].conversationId = "legacy-1";
    expect(parseIndex(JSON.stringify(duplicate))).toEqual({ ok: false, code: "invalid" });
  });
});

// v3 drops the state field. v1 and v2 are read into the v3 shape in memory and the first save writes v3.
describe("index v3 and migration", () => {
  const ids = (read: ReturnType<typeof parseIndex>) => { if (!read.ok) throw new Error(read.code); return read.entries; };
  it("reads the v3 fixture with every field and no state", () => {
    const raw = JSON.parse(fixture("index-v3.json"));
    expect(raw.v).toBe(3);
    expect(raw.conversations.some((m: object) => "state" in m)).toBe(false);
    expect(ids(parseIndex(fixture("index-v3.json")))).toEqual(raw.conversations);
  });
  it("reads two conversations of one canvas as two ordinary conversations", () => {
    const entries = ids(parseIndex(fixture("index-v3.json")));
    expect(entries.filter(m => m.canvas?.id === "a").map(m => m.conversationId)).toEqual(["legacy-1", "doan-1"]);
  });
  it("migrates v2 archived conversations into ordinary ones that count as seen", () => {
    const raw = JSON.parse(fixture("index-v2-archived.json"));
    const entries = ids(parseIndex(fixture("index-v2-archived.json")));
    expect(entries.every(m => !("state" in m))).toBe(true);
    // An entry without seenSeq has had its whole history seen (summary.ts), so the interruption recorded when it was
    // archived does not light up as an unseen end.
    expect(entries[0]).not.toHaveProperty("seenSeq");
    expect(entries[0]).toEqual((({ state: _s, seenSeq: _seen, ...rest }) => rest)(raw.conversations[0]));
    expect(entries[1]).toEqual((({ state: _s, ...rest }) => rest)(raw.conversations[1]));
    expect(entries[2]).toEqual((({ state: _s, ...rest }) => rest)(raw.conversations[2]));
  });
  it("migrates v1 archived conversations the same way", () => {
    const entries = ids(parseIndex(fixture("index-v1.json")));
    expect(entries.map(m => m.conversationId)).toEqual(["legacy-1", "legacy-2"]);
  });
  it("reads the v2 Home fixture into the v3 shape without changing its fields", () => {
    expect(ids(parseIndex(fixture("index-v2-home.json")))).toEqual(JSON.parse(fixture("index-v2-home.json")).conversations.map(({ state: _s, ...rest }: { state: string }) => rest));
  });
  it("ignores a state field in v3 like any other unknown field", () => {
    const copy = JSON.parse(fixture("index-v3.json")); copy.conversations[0].state = "ignored";
    expect(ids(parseIndex(JSON.stringify(copy)))[0]).not.toHaveProperty("state");
  });
  it("rejects malformed v3 entries like v2 ones", () => {
    const invalid = [
      (m: any) => { delete m.owner; },
      (m: any) => { m.session.runtime = "claude"; },
      (m: any) => { m.seenSeq = -1; },
      (m: any) => { m.canvas = { path: "a.html" }; },
    ];
    for (const mutate of invalid) {
      const copy = JSON.parse(fixture("index-v3.json")); mutate(copy.conversations[1]);
      expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
    }
    const duplicate = JSON.parse(fixture("index-v3.json")); duplicate.conversations[1].conversationId = "legacy-1";
    expect(parseIndex(JSON.stringify(duplicate))).toEqual({ ok: false, code: "invalid" });
  });
  it("keeps v4 an unknown version", () => {
    expect(parseIndex(JSON.stringify({ ...JSON.parse(fixture("index-v3.json")), v: 4 }))).toEqual({ ok: false, code: "unknown_version" });
  });
  // Earlier builds accept only v1 and v2 and refuse anything else as an unsupported version, so they never read a v3
  // index as if it were v2.
  it("writes v3 without the state field on the first save of a v2 index", () => {
    const f = seed({ "index.json": fixture("index-v2-archived.json") });
    const store = new ConversationStore(f.root);
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v2-archived.json"));
    store.save(store.list());
    const saved = JSON.parse(readFileSync(f.index, "utf8"));
    expect(saved.v).toBe(3);
    expect(saved.conversations.some((m: object) => "state" in m)).toBe(false);
    expect(saved.conversations[0]).not.toHaveProperty("seenSeq");
    expect(new ConversationStore(f.root).list()).toEqual(store.list());
  });
  it("keeps the v2 index as it was when the first v3 save is interrupted", () => {
    const f = seed({ "index.json": fixture("index-v2-archived.json") });
    const store = new ConversationStore(f.root);
    hooks.failRename = true;
    expect(() => store.save(store.list())).toThrow("EIO");
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v2-archived.json"));
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    expect(store.list().every(m => !("state" in m))).toBe(true);
  });
});

describe("conversation index v2 storage", () => {
  it("lists a v1 index as legacy-external and writes v3 on the next save", () => {
    const f = seed({ "index.json": fixture("index-v1.json") });
    const store = new ConversationStore(f.root);
    expect(store.list().every(m => m.owner.kind === "legacy-external")).toBe(true);
    expect(readFileSync(f.index, "utf8")).toBe(fixture("index-v1.json"));
    store.save(store.list());
    const saved = JSON.parse(readFileSync(f.index, "utf8"));
    expect(saved.v).toBe(3);
    expect(saved.conversations.map((m: ConversationMetadata) => m.owner)).toEqual([{ kind: "legacy-external" }, { kind: "legacy-external" }]);
  });
  it("round-trips legacy and doan-owned entries", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    store.save([legacy("old"), owned("new")]);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), owned("new")]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).conversations.some((m: object) => "state" in m)).toBe(false);
  });
  it("rejects invalid entries before replacing the index", () => {
    const f = seed(); const store = new ConversationStore(f.root); store.save([legacy("old")]);
    const before = readFileSync(f.index);
    const bad = { ...owned("new"), session: { ...owned("new").session, runtime: "codex" as const } };
    expect(() => store.save([legacy("old"), bad])).toThrow("Invalid conversation index");
    expect(readFileSync(f.index)).toEqual(before);
  });
  it("refuses unknown versions without overwriting the index or touching history", () => {
    const future = JSON.stringify({ v: 4, conversations: [] });
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
  // A start beside another conversation of the same canvas leaves that conversation alone, so its journal pins no
  // other history.
  it("writes the undo journal with its version, kind and file identity only", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const old = legacy("old"), next = { ...legacy("new"), canvas: { path: ".doan/canvases/old.html" } };
    store.save([old]); store.append("old", "t", { type: "turn.done" });
    const before = readFileSync(f.path("old"));
    store.acceptStart([old, next], "new", [{ id: "new", turn: "t", body: { type: "turn.started" } }]);
    expect(hooks.journals).toHaveLength(1);
    const journal = JSON.parse(hooks.journals[0]!);
    expect(Object.keys(journal)).toEqual(["v", "kind", "id", "previous"]);
    expect([journal.v, journal.kind, journal.previous]).toEqual([1, "start", []]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    expect(readFileSync(f.path("old"))).toEqual(before);
    expect(store.list().map(m => m.conversationId)).toEqual(["old", "new"]);
  });
  // Nothing lists the conversations directory at start, so a temporary file a failed write leaves stays for good.
  it("removes the index's temporary file when its write fails", () => {
    const f = seed(); const store = new ConversationStore(f.root); store.save([legacy("old")]);
    const before = readFileSync(f.index);
    hooks.shortWrite = true;
    expect(() => store.save([legacy("old"), legacy("new")])).toThrow("Incomplete conversation write");
    expect(readFileSync(f.index)).toEqual(before);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("removes the undo record's temporary file when its write fails", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const old = legacy("old"), next = { ...legacy("new"), canvas: { path: ".doan/canvases/old.html" } };
    store.save([old]);
    hooks.shortWrite = true;
    expect(() => store.acceptStart([old, next], "new", [{ id: "new", turn: "t", body: { type: "turn.started" } }])).toThrow("Incomplete conversation write");
    expect(existsSync(f.journal)).toBe(false); expect(existsSync(f.path("new"))).toBe(false);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    expect(store.list().map(m => m.conversationId)).toEqual(["old"]);
  });
  it("removes the index's temporary file when its close fails after a full write", () => {
    const f = seed(); const store = new ConversationStore(f.root); store.save([legacy("old")]);
    const before = readFileSync(f.index);
    hooks.failClose = true;
    expect(() => store.save([legacy("old"), legacy("new")])).toThrow("EIO");
    expect(readFileSync(f.index)).toEqual(before);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("removes the undo record's temporary file when its close fails after a full write", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const old = legacy("old"), next = { ...legacy("new"), canvas: { path: ".doan/canvases/old.html" } };
    store.save([old]);
    hooks.failClose = true;
    expect(() => store.acceptStart([old, next], "new", [{ id: "new", turn: "t", body: { type: "turn.started" } }])).toThrow("EIO");
    expect(existsSync(f.journal)).toBe(false); expect(existsSync(f.path("new"))).toBe(false);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    expect(store.list().map(m => m.conversationId)).toEqual(["old"]);
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
  it("keeps a start committed by an earlier build's v2 index rename that replaced a v1 index", () => {
    const committed = JSON.parse(fixture("index-v2.json"));
    committed.conversations[0].state = "archived";
    committed.conversations.push({ ...legacy("new"), state: "current", canvas: { path: ".doan/canvases/a.html", id: "a" } });
    const f = interrupted(JSON.stringify(committed));
    const logs = [f.path("legacy-1"), f.path("new")].map(path => readFileSync(path));
    const store = new ConversationStore(f.root);
    expect(existsSync(f.journal)).toBe(false);
    expect([f.path("legacy-1"), f.path("new")].map(path => readFileSync(path))).toEqual(logs);
    expect(readFileSync(f.index, "utf8")).toBe(JSON.stringify(committed));
    expect(store.list().map(m => [m.conversationId, m.owner.kind])).toEqual([["legacy-1", "legacy-external"], ["doan-1", "doan"], ["new", "legacy-external"]]);
  });
  it("blocks recovery without truncating history when the index version is unknown", () => {
    const f = interrupted(JSON.stringify({ v: 4, conversations: [] }));
    const logs = [f.path("legacy-1"), f.path("new"), f.journal].map(path => readFileSync(path));
    expect(() => new ConversationStore(f.root)).toThrow("Unsupported conversation index version");
    expect([f.path("legacy-1"), f.path("new"), f.journal].map(path => readFileSync(path))).toEqual(logs);
  });
  // A start that archived another conversation was written by an earlier build, which never writes v3: beside a v3
  // index it is damaged, and nothing is truncated.
  it("refuses an earlier build's archiving start beside a v3 index without touching history", () => {
    const v3 = JSON.parse(fixture("index-v3.json"));
    const f = interrupted(JSON.stringify(v3));
    const logs = [f.path("legacy-1"), f.path("new"), f.journal, f.index].map(path => readFileSync(path));
    expect(() => new ConversationStore(f.root)).toThrow("Invalid start recovery record");
    expect([f.path("legacy-1"), f.path("new"), f.journal, f.index].map(path => readFileSync(path))).toEqual(logs);
  });
});

describe("home conversation fields in index v2", () => {
  it("reads the optional model, effort and start canvases without changing the version", () => {
    const raw = JSON.parse(fixture("index-v2-home.json"));
    expect(raw.v).toBe(2);
    expect(parseIndex(fixture("index-v2-home.json"))).toEqual({ ok: true, entries: raw.conversations.map(({ state: _s, ...rest }: { state: string }) => rest) });
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
  it("round-trips a chosen permission mode without changing the version", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const modes = (["acceptEdits", "plan", "bypass"] as const).map(permissionMode => ({ ...owned(`mode-${permissionMode.toLowerCase()}`), permissionMode }));
    store.save([legacy("old"), ...modes]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), ...modes]);
  });
  // A later build may add a mode: that one field reads as Default instead of making the whole index invalid.
  it.each([["a later build's mode", "auto"], ["Default spelled out", "default"], ["a wrong type", 3], ["null", null], ["an empty id", ""]])("reads %s as Default for that entry only and keeps the index valid", (_label, permissionMode) => {
    const copy = JSON.parse(fixture("index-v2-home.json")); copy.conversations[1].permissionMode = permissionMode;
    const read = parseIndex(JSON.stringify(copy));
    if (!read.ok) throw new Error(read.code);
    const { permissionMode: _dropped, state: _state, ...expected } = copy.conversations[1];
    expect(read.entries[1]).toEqual(expected);
    expect(read.entries[0]).toEqual((({ state: _state, ...rest }) => rest)(copy.conversations[0]));
  });
  it("keeps a v4 index with the new fields as an unknown version and never overwrites it", () => {
    const future = JSON.stringify({ ...JSON.parse(fixture("index-v2-home.json")), v: 4 });
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
  it("reads earlier records and folder records side by side", () => {
    const records = [...LEGACY_ATTACHMENTS, FOLDER_ATTACHMENT, IMAGE_NAMED_FOLDER];
    const f = seed({ "c.jsonl": message({ attachments: records }) });
    expect(new ConversationStore(f.root).read("c")).toMatchObject([{ attachments: records }]);
    const store = new ConversationStore(f.root);
    const saved = store.append("c", "t", { type: "user.message", text: "hi", anchors: [], attachments: [FOLDER_ATTACHMENT] });
    expect(new ConversationStore(f.root).read("c")[1]).toEqual(saved);
  });
  it("rejects a folder record that carries a size or lacks a path", () => {
    for (const value of [[{ ...FOLDER_ATTACHMENT, size: 0 }], [{ name: "references", kind: "directory" }], [{ ...FOLDER_ATTACHMENT, path: "references" }]]) {
      const f = seed({ "c.jsonl": message({ attachments: value }) });
      expect(() => new ConversationStore(f.root).read("c")).toThrow("Invalid conversation event");
    }
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

describe("seen marker in the index", () => {
  it("round-trips seenSeq and reads entries without it", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    store.save([legacy("old"), { ...owned("seen"), seenSeq: 0 }, { ...owned("later"), seenSeq: 12 }]);
    expect(new ConversationStore(f.root).list()).toEqual([legacy("old"), { ...owned("seen"), seenSeq: 0 }, { ...owned("later"), seenSeq: 12 }]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    expect(new ConversationStore(f.root).list()[0]).not.toHaveProperty("seenSeq");
  });
  it.each([-1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1])("rejects seenSeq %s", seenSeq => {
    const copy = JSON.parse(fixture("index-v2.json")); copy.conversations[0].seenSeq = seenSeq;
    expect(parseIndex(JSON.stringify(copy))).toEqual({ ok: false, code: "invalid" });
  });
});

// The successor's first user.message carries its origin and the agent's text
// as written, markers included; the earlier conversation keeps its request and resolution.
describe("handoff events in event v1", () => {
  const origin = { kind: "handoff", conversationId: "a", canvas: { path: ".doan/canvases/a.html", id: "a" } } as const;
  const line = (body: Record<string, unknown>) => JSON.stringify({ v: 1, conversationId: "c", turnId: "t", seq: 1, at: "2026-11-06T00:00:00.000Z", ...body }) + "\n";
  it("round-trips a handoff's first message with marker-like text, and the request and its resolutions", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const saved = [
      store.append("c", "t", { type: "user.message", text: "Keep {{1}} as typed.", anchors: [], origin }),
      store.append("c", "t", { type: "handoff.requested", canvas: { path: ".doan/canvases/new.html" }, text: "Continue {{2}}." }),
      store.append("c", "t", { type: "handoff.resolved", outcome: "started", target: { conversationId: "b", canvas: { path: ".doan/canvases/new.html", id: "new" } } }),
      store.append("c", "t", { type: "handoff.resolved", outcome: "refused", reason: "not_logged_in" }),
      store.append("c", "t", { type: "handoff.resolved", outcome: "cancelled" }),
    ];
    expect(new ConversationStore(f.root).read("c")).toEqual(saved);
  });
  // A turn may hand off to several canvases, so each resolution names its request's path; a missed line names a new
  // canvas the agent never asked for.
  it("round-trips resolutions that name their request's canvas, and a missed handoff", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const saved = [
      store.append("c", "t", { type: "handoff.resolved", canvas: { path: ".doan/canvases/b.html" }, outcome: "started", target: { conversationId: "b", canvas: { path: ".doan/canvases/b.html", id: "b" } } }),
      store.append("c", "t", { type: "handoff.resolved", canvas: { path: ".doan/canvases/x.html" }, outcome: "refused", reason: "not_listed" }),
      store.append("c", "t", { type: "handoff.resolved", canvas: { path: ".doan/canvases/y.html" }, outcome: "cancelled" }),
      store.append("c", "t", { type: "handoff.missed", canvas: { path: ".doan/canvases/c.html", id: "c" } }),
      store.append("c", "t", { type: "handoff.missed", canvas: { path: ".doan/canvases/plain.html" } }),
    ];
    expect(new ConversationStore(f.root).read("c")).toEqual(saved);
  });
  it("round-trips a drawn canvas with and without an id", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const saved = [
      store.append("c", "t", { type: "canvas.drawn", canvas: { path: ".doan/canvases/c.html", id: "c" } }),
      store.append("c", "t", { type: "canvas.drawn", canvas: { path: ".doan/canvases/plain.html" } }),
    ];
    expect(new ConversationStore(f.root).read("c")).toEqual(saved);
  });
  it("rejects a drawn canvas that is missing or invalid", () => {
    const bad = [
      { type: "canvas.drawn" },
      { type: "canvas.drawn", canvas: null },
      { type: "canvas.drawn", canvas: { path: "" } },
      { type: "canvas.drawn", canvas: { path: "a.html" } },
      { type: "canvas.drawn", canvas: { path: ".doan/canvases/a.html", id: "Not An Id" } },
    ];
    for (const body of bad) {
      const f = seed({ "c.jsonl": line(body) });
      expect(() => new ConversationStore(f.root).read("c"), JSON.stringify(body)).toThrow("Invalid conversation event");
    }
  });
  // A project conversation's handoff names no canvas. Its text is the agent's, so a leading command name or a marker never
  // makes it a command turn or an anchored message (POSTMORTEM 2026-11-18).
  it("round-trips a project conversation's handoff, whose origin names no canvas", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const project = { kind: "handoff", conversationId: "p" } as const;
    const saved = [store.append("c", "t", { type: "user.message", text: "/review the checkout {{1}}", anchors: [], origin: project })];
    expect(new ConversationStore(f.root).read("c")).toEqual(saved);
    for (const bad of [{ ...project, canvas: null }, { ...project, canvas: { path: "" } }, { ...project, canvas: { path: "a.html" } }]) {
      const g = seed({ "c.jsonl": line({ type: "user.message", text: "x", anchors: [], origin: bad }) });
      expect(() => new ConversationStore(g.root).read("c"), JSON.stringify(bad)).toThrow("Invalid conversation event");
    }
  });
  // A new build's origin adds via, chain and provider; the chain runs from step 0 to the sender (ARCHITECTURE §7 'Handoff').
  it("round-trips an origin with via, chain and provider, and a send's sent resolution, and rejects malformed ones", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const linked: HandoffOrigin = { kind: "handoff", conversationId: "s", canvas: { path: ".doan/canvases/a.html", id: "a" }, via: "send", chain: ["p", "s"], provider: "codex" };
    const saved = [
      store.append("c", "t", { type: "user.message", text: "Use {{1}}", anchors: [], origin: linked }),
      store.append("c", "t", { type: "handoff.requested", canvas: { path: ".doan/canvases/b.html" }, text: "x", via: "send" }),
      store.append("c", "t", { type: "handoff.resolved", canvas: { path: ".doan/canvases/b.html" }, via: "send", outcome: "sent", target: { conversationId: "b", canvas: { path: ".doan/canvases/b.html", id: "b" } }, queued: true }),
    ];
    expect(new ConversationStore(f.root).read("c")).toEqual(saved);
    const five = ["1", "2", "3", "4", "s"];
    expect(new ConversationStore(seed({ "c.jsonl": line({ type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: five } }) }).root).read("c")).toHaveLength(1);
    const bad = [
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, via: "mail" } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: [] } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: ["0", ...five] } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: ["s", "p"] } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: ["", "s"] } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: ["x".repeat(513), "s"] } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, chain: "s" } },
      { type: "user.message", text: "x", anchors: [], origin: { ...linked, provider: "gemini" } },
      { type: "handoff.requested", canvas: { path: ".doan/canvases/b.html" }, text: "x", via: "mail" },
      { type: "handoff.resolved", via: "send", outcome: "sent", target: { conversationId: "b", canvas: { path: ".doan/canvases/b.html" } } },
      { type: "handoff.resolved", via: "send", outcome: "sent", target: { canvas: { path: ".doan/canvases/b.html" } }, queued: false },
      { type: "handoff.resolved", via: "send", outcome: "sent", target: { conversationId: "b", canvas: { path: "b.html" } }, queued: false },
      { type: "handoff.resolved", via: "post", outcome: "cancelled" },
    ];
    for (const body of bad) {
      const g = seed({ "c.jsonl": line(body) });
      expect(() => new ConversationStore(g.root).read("c"), JSON.stringify(body)).toThrow("Invalid conversation event");
    }
  });
  it("still reads a resolution written before resolutions named their canvas", () => {
    const old = line({ type: "handoff.resolved", outcome: "started", target: { conversationId: "b", canvas: { path: ".doan/canvases/b.html" } } });
    const f = seed({ "c.jsonl": old });
    expect(new ConversationStore(f.root).read("c")).toEqual([JSON.parse(old)]);
  });
  it("still refuses a person's message whose markers name no anchor", () => {
    const f = seed({ "c.jsonl": line({ type: "user.message", text: "{{1}}", anchors: [] }) });
    expect(() => new ConversationStore(f.root).read("c")).toThrow("Invalid conversation event");
  });
  it("reads a permission request's reason and an option's detail, and rejects them when they are not text", () => {
    const ask = { type: "permission.request", requestId: "r", tool: "Bash", summary: "npm test", reason: "Run the tests", options: [{ id: "always", label: "Always", kind: "allowAlways", detail: "Adds a rule." }] };
    expect(new ConversationStore(seed({ "c.jsonl": line(ask) }).root).read("c")).toEqual([JSON.parse(line(ask))]);
    for (const body of [{ ...ask, reason: 1 }, { ...ask, options: [{ ...ask.options[0], detail: {} }] }]) {
      const f = seed({ "c.jsonl": line(body) });
      expect(() => new ConversationStore(f.root).read("c"), JSON.stringify(body)).toThrow("Invalid conversation event");
    }
  });
  it("rejects malformed handoff events", () => {
    const bad = [
      { type: "user.message", text: "x", anchors: [], origin: { kind: "other", conversationId: "a", canvas: origin.canvas } },
      { type: "user.message", text: "x", anchors: [], origin: { kind: "handoff", canvas: origin.canvas } },
      { type: "user.message", text: "x", anchors: [{ frame: { id: "f" } }], origin },
      { type: "handoff.requested", canvas: { path: "" }, text: "x" },
      { type: "handoff.requested", canvas: { path: ".doan/canvases/a.html" } },
      { type: "handoff.resolved", outcome: "started", target: { canvas: { path: ".doan/canvases/a.html" } } },
      { type: "handoff.resolved", outcome: "started", conversationId: "b", canvas: { path: ".doan/canvases/a.html" } },
      { type: "handoff.resolved", outcome: "refused" },
      { type: "handoff.resolved", outcome: "maybe" },
      { type: "handoff.resolved", canvas: { path: "" }, outcome: "cancelled" },
      { type: "handoff.resolved", canvas: ".doan/canvases/a.html", outcome: "cancelled" },
      { type: "handoff.resolved", canvas: {}, outcome: "cancelled" },
      { type: "handoff.missed" },
      { type: "handoff.missed", canvas: { path: "" } },
      { type: "handoff.missed", canvas: { path: "a.html" } },
      { type: "handoff.missed", canvas: { path: ".doan/canvases/a.html", id: "Not An Id" } },
    ];
    for (const body of bad) {
      const f = seed({ "c.jsonl": line(body) });
      expect(() => new ConversationStore(f.root).read("c"), JSON.stringify(body)).toThrow("Invalid conversation event");
    }
  });
});


describe("Fast metadata", () => {
  it("round-trips true without changing index version or adding Fast to older entries", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const fast = { ...owned("fast"), fast: true as const };
    store.save([fast, owned("old")]);
    expect(new ConversationStore(f.root).list()).toEqual([fast, owned("old")]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    expect(new ConversationStore(f.root).list()[1]).not.toHaveProperty("fast");
  });
  it.each(["yes", false, null, 1, {}])("rejects invalid Fast metadata: %j", fast => {
    expect(parseIndex(JSON.stringify({ v: 2, conversations: [{ ...owned("bad"), fast }] }))).toEqual({ ok: false, code: "invalid" });
  });
});

// claudeRunMode is the mode Claude Code's own settings ran the last Ask first turn in; no key means none was seen.
describe("Claude run mode in the index", () => {
  const claude = (id: string): ConversationMetadata => ({ conversationId: id, root: "/repo", title: id,
    owner: { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: null, profile: "claude" },
    session: { runtime: "claude", origin: "newDesign", sessionId: id, configDir: "/profiles/claude", cwd: "/repo" } });
  it("round-trips each mode without changing the version or adding the key to other entries", () => {
    const f = seed(); const store = new ConversationStore(f.root);
    const runs = (["auto", "dontAsk", "acceptEdits", "plan", "bypassPermissions"] as const).map(claudeRunMode => ({ ...claude(`run-${claudeRunMode.toLowerCase()}`), claudeRunMode }));
    store.save([claude("none"), ...runs]);
    expect(JSON.parse(readFileSync(f.index, "utf8")).v).toBe(3);
    expect(new ConversationStore(f.root).list()).toEqual([claude("none"), ...runs]);
    expect(new ConversationStore(f.root).list()[0]).not.toHaveProperty("claudeRunMode");
  });
  // The value is kept whatever mode is stored; only the display looks at Ask first.
  it("reads the key on an entry whose stored mode is not Ask first", () => {
    const entry = { ...claude("picked"), permissionMode: "acceptEdits" as const, claudeRunMode: "auto" as const };
    const read = parseIndex(JSON.stringify({ v: 3, conversations: [entry] }));
    expect(read).toEqual({ ok: true, entries: [entry] });
  });
  // A later build's value, or Ask first's own id spelled out, drops that key alone: the index stays valid, and "default"
  // never stands for "none seen".
  it.each([["a later build's mode", "someNewMode"], ["Claude's default spelled out", "default"], ["a common id", "bypass"], ["a wrong type", 3], ["null", null], ["an empty id", ""]])("drops %s for that entry only and keeps the index valid", (_label, claudeRunMode) => {
    const kept = { ...claude("kept"), claudeRunMode: "dontAsk" as const };
    const read = parseIndex(JSON.stringify({ v: 3, conversations: [{ ...claude("odd"), claudeRunMode }, kept] }));
    expect(read).toEqual({ ok: true, entries: [claude("odd"), kept] });
  });
});
