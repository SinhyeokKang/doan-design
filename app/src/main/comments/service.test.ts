import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { attemptBaseline, createCommentsService, inspectAttempt, parseCopyScope } from "./service";
import type { CommentEvent } from "../../formats/types";
import { authorizeCanvas } from "./identity";
import type { CommentIdentity, ServiceDependencies } from "./service";
import { AppendUncertainError } from "./files";
import { MkdirTerminationUnconfirmedError } from "./mkdir";
import type { FolderView } from "../cli";
import type { OrphanFile } from "../view";
vi.mock("electron", () => ({ utilityProcess: {} }));
vi.mock("./files", () => ({ AppendUncertainError: class extends Error {} }));
const identity: CommentIdentity = { root: "/repo", path: "design/a.html", canvas: "a" };
function orphanListing(orphan: Partial<OrphanFile> = {}): FolderView {
  return { kind: "list", root: "/repo", scope: ["design"], canvases: [], orphans: [{ id: "gone", file: ".doan/comments/gone.jsonl", comments: { open: 1, resolved: 0 }, uncertain: false, ...orphan }] };
}
function setup() {
  let bytes: Buffer = Buffer.alloc(0);
  const deps: ServiceDependencies = {
    authorize: vi.fn(async () => ({ width: 100, url: "http://canvas" })),
    epoch: () => 1,
    currentHash: async () => "sha256:" + "a".repeat(64),
    author: vi.fn<ServiceDependencies["author"]>(async () => ({ kind: "human", name: "Human" })),
    read: vi.fn(async () => bytes),
    append: vi.fn(async (_root, _canvas, prepare) => { const data = await prepare(bytes); if (data) bytes = Buffer.concat([bytes, data]); }),
    document: vi.fn(async () => ({ generation: "loader-1", hash: "sha256:" + "a".repeat(64), target: {} })),
    validateDocument: vi.fn(async () => true),
    clipboard: vi.fn(), invalidated: vi.fn(),
    listing: vi.fn<ServiceDependencies["listing"]>(async () => orphanListing()),
  };
  const service = createCommentsService(deps);
  return { service, deps, bytes: () => bytes, set: (value: Buffer) => { bytes = value; } };
}
async function create(s: ReturnType<typeof setup>, requestID = "r1") {
  const start = await s.service.begin("window", { ...identity, requestID: "begin", scope: "canvas" });
  if (!start.ok) throw new Error(start.error);
  const payload = { ...identity, requestID, project: start.value.project, origin: start.value.origin, intent: { type: "create", body: "Hello 한글" } };
  return { payload, reply: await s.service.mutate("window", payload) };
}
test("creates main-owned event, folds both states, and rejects authority fields", async () => {
  const s = setup();
  const { payload, reply } = await create(s);
  expect(reply).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(JSON.parse(s.bytes().toString())).toMatchObject({ type: "create", body: "Hello 한글", by: { kind: "human", name: "Human" }, target: {} });
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ status: "open" }] } });
  expect(await s.service.mutate("window", { ...payload, by: { name: "Forged" } })).toMatchObject({ ok: false });
});
test("lost response retry reads disk and never duplicates or changes a prepared event", async () => {
  const s = setup();
  const { payload } = await create(s);
  const original = s.bytes().toString();
  vi.mocked(s.deps.author).mockResolvedValue({ kind: "human", name: "Changed" });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes().toString()).toBe(original);
  expect(await s.service.mutate("window", { ...payload, intent: { type: "create", body: "Changed" } })).toMatchObject({ ok: false });
  s.set(Buffer.alloc(0));
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true });
  expect(s.bytes().toString()).toBe(original);
});
test.each(["partial", "conflict", "unreadable"])("retry %s is unknown without append", async mode => {
  const s = setup();
  const { payload } = await create(s);
  if (mode === "partial") s.set(s.bytes().subarray(0, 50));
  if (mode === "conflict") s.set(Buffer.from(s.bytes().toString().replace("Hello 한글", "changed")));
  if (mode === "unreadable") vi.mocked(s.deps.read).mockRejectedValue(new Error("EACCES"));
  const calls = vi.mocked(s.deps.append).mock.calls.length;
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(vi.mocked(s.deps.append).mock.calls.length).toBe(calls);
});
test("uncertain write stays checkable and replays exact event after confirmed absence", async () => {
  const s = setup();
  vi.mocked(s.deps.append).mockImplementationOnce(async (_r, _c, prepare) => { await prepare(Buffer.alloc(0)); throw new AppendUncertainError("write failed"); });
  const { payload, reply } = await create(s);
  expect(reply).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "absent" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
});
test("missing author blocks mutations and a lost document blocks create", async () => {
  const s = setup();
  vi.mocked(s.deps.author).mockRejectedValue(new Error("Configure a Git user name"));
  expect((await create(s)).reply).toMatchObject({ ok: false });
  expect(s.bytes().length).toBe(0);
  vi.mocked(s.deps.author).mockResolvedValue({ kind: "human", name: "Human" });
  vi.mocked(s.deps.validateDocument).mockResolvedValue(false);
  expect((await create(s)).reply).toMatchObject({ ok: false });
});
test("serializes entire read/prepare/append and keeps roots separate", async () => {
  const s = setup();
  let active = 0;
  let maximum = 0;
  const append = s.deps.append;
  s.deps.append = async (...args) => { maximum = Math.max(maximum, ++active); await new Promise(resolve => setTimeout(resolve, 5)); await append(...args); active--; };
  await Promise.all([create(s, "one"), create(s, "two")]);
  expect(maximum).toBe(1);
  expect(s.bytes().toString().trim().split("\n")).toHaveLength(2);
});
test("root close during author lookup rejects before append", async () => {
  const s = setup();
  let epoch = 1;
  s.deps.epoch = () => epoch;
  s.deps.author = async () => { epoch++; return { kind: "human", name: "Human" }; };
  expect((await create(s)).reply).toMatchObject({ ok: false });
  expect(s.bytes().length).toBe(0);
});

test("a replay with confirmed absence still rejects a changed expected comment", async () => {
  const s = setup(); const created = await create(s);
  const initial = JSON.parse(s.bytes().toString());
  const expected = { body: initial.body, status: "open", updatedAt: initial.at };
  const edit = { ...identity, requestID: "edit", project: 1, intent: { type: "edit", comment: initial.comment, body: "edit", expected } };
  expect(await s.service.mutate("window", edit)).toMatchObject({ ok: true });
  const external = { ...initial, id: "evt_00000000-0000-4000-8000-000000000099", type: "edit", at: "2099-01-01T00:00:00.000Z", body: "external" };
  delete external.target; delete external.canvasHash;
  s.set(Buffer.from(JSON.stringify(initial) + "\n" + JSON.stringify(external) + "\n"));
  expect(await s.service.mutate("window", edit)).toMatchObject({ ok: false });
  expect(created.reply.ok).toBe(true);
});

test("main project generation rejects a draft from a closed and reopened root", async () => {
  const s = setup();
  expect(await s.service.mutate("window", { ...identity, project: 0, requestID: "stale", intent: { type: "delete", comment: "old", expected: { body: "body", status: "open", updatedAt: "time" } } })).toMatchObject({ ok: false });
  expect(s.deps.append).not.toHaveBeenCalled();
});

test("timestamps advance past accepted events ignored by folding", async () => {
  const s = setup();
  s.set(Buffer.from(JSON.stringify({ v: 1, id: "evt_00000000-0000-4000-8000-000000000010", comment: "cmt_00000000-0000-4000-8000-000000000010", type: "edit", body: "ignored", by: { kind: "agent", name: "agent" }, at: "2099-01-01T00:00:00.000Z" }) + "\n"));
  expect((await create(s)).reply.ok).toBe(true);
  const lines = s.bytes().toString().trim().split("\n");
  expect(JSON.parse(lines[1] ?? "{}").at).toBe("2099-01-01T00:00:00.001Z");
});

test.each(["edit", "delete", "resolve", "reopen"])("missing author blocks existing %s without requiring a document", async type => {
  const s = setup(); await create(s);
  const event = JSON.parse(s.bytes().toString());
  vi.mocked(s.deps.author).mockRejectedValue(new Error("Configure a Git user name"));
  const before = s.bytes().toString();
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: type, intent: { type, comment: event.comment, expected: { body: event.body, status: "open", updatedAt: event.at }, ...(type === "edit" ? { body: "edit" } : {}) } })).toMatchObject({ ok: false });
  expect(s.bytes().toString()).toBe(before);
});

test("same request id and canvas in different roots are independent", async () => {
  const s = setup(); const files = new Map<string, Buffer>();
  s.deps.read = async root => files.get(root) ?? Buffer.alloc(0);
  s.deps.append = async (root, _canvas, prepare) => { const before = files.get(root) ?? Buffer.alloc(0); const next = await prepare(before); if (next) files.set(root, Buffer.concat([before, next])); };
  for (const root of ["/repo", "/other"]) {
    const begin = await s.service.begin("window", { ...identity, root, requestID: "begin", scope: "canvas" });
    if (!begin.ok) throw new Error(begin.error);
    expect(await s.service.mutate("window", { ...identity, root, project: 1, requestID: "same", origin: begin.value.origin, intent: { type: "create", body: root } })).toMatchObject({ ok: true });
  }
  expect(files.size).toBe(2);
  expect(files.get("/repo")?.equals(files.get("/other") ?? Buffer.alloc(0))).toBe(false);
});

test("unconfirmed mkdir blocks same, new and concurrent cross-canvas saves until external recovery", async () => {
  const s = setup();
  const begin = await s.service.begin("window", { ...identity, requestID: "begin", scope: "canvas" });
  if (!begin.ok) throw new Error(begin.error);
  const payload = { ...identity, project: 1, requestID: "uncertain", origin: begin.value.origin, intent: { type: "create", body: "body" } };
  const other = { ...identity, canvas: "b", path: "design/b.html" };
  const otherBegin = await s.service.begin("window", { ...other, requestID: "begin", scope: "canvas" });
  if (!otherBegin.ok) throw new Error(otherBegin.error);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(s.deps.append).mockImplementationOnce(async () => { await wait; throw new MkdirTerminationUnconfirmedError("missing exit"); });
  const first = s.service.mutate("window", payload);
  const concurrent = s.service.mutate("window", { ...payload, ...other, origin: otherBegin.value.origin });
  await new Promise(resolve => setTimeout(resolve, 10));
  release();
  const blocked = { ok: true, value: { state: "unknown", recovery: "child-exit-required" } };
  expect(await first).toMatchObject(blocked);
  expect(await concurrent).toMatchObject(blocked);
  expect(await s.service.mutate("window", payload)).toMatchObject(blocked);
  expect(await s.service.mutate("window", { ...payload, requestID: "new" })).toMatchObject(blocked);
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject(blocked);
  s.deps.epoch = () => 2;
  expect(await s.service.mutate("window", { ...payload, project: 2 })).toMatchObject(blocked);
  expect(s.deps.append).toHaveBeenCalledTimes(1);
  expect(s.deps.read).not.toHaveBeenCalled();
  const independent = await s.service.begin("window", { ...identity, root: "/other", requestID: "begin", scope: "canvas" });
  if (!independent.ok) throw new Error(independent.error);
  expect(await s.service.mutate("window", { ...payload, root: "/other", project: 2, origin: independent.value.origin })).toMatchObject({ ok: true, value: { state: "saved" } });
});

function createdId(s: ReturnType<typeof setup>): string { return JSON.parse(s.bytes().toString().trim().split("\n")[0] ?? "{}").comment; }
test("copy waits for the actual clipboard commit before reporting copied", async () => {
  const s = setup(); await create(s);
  const id = createdId(s);
  let finish: (() => void) | undefined;
  s.deps.clipboard = () => new Promise<void>(resolve => { finish = resolve; });
  let settled = false;
  const copy = s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [id] } }).then(result => { settled = true; return result; });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(settled).toBe(false);
  finish?.(); expect(await copy).toMatchObject({ ok: true, value: { copied: true } });
});
test("copy reports asynchronous clipboard rejection", async () => {
  const s = setup(); await create(s);
  const rejected = Promise.reject(new Error("Clipboard unavailable"));
  void rejected.catch(() => {});
  s.deps.clipboard = () => rejected;
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [createdId(s)] } })).toMatchObject({ ok: false, error: "Clipboard unavailable" });
});
test("copy reports synchronous clipboard failure", async () => {
  const s = setup(); await create(s);
  s.deps.clipboard = () => { throw new Error("Clipboard unavailable"); };
  const reply = await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [createdId(s)] } });
  expect(reply).toMatchObject({ ok: false, error: "Clipboard unavailable" });
  expect(reply).not.toHaveProperty("code");
});
test.each([
  ["missing scope", undefined],
  ["array scope", [["a"]]],
  ["old all scope", { kind: "all" }],
  ["old one scope", { kind: "one", comment: "a" }],
  ["extra key", { comments: ["a"], kind: "all" }],
  ["not an array", { comments: "a" }],
  ["empty set", { comments: [] }],
  ["cloned hole", structuredClone({ comments: new Array(1) })],
  ["cloned valid id and hole", structuredClone({ comments: Object.assign(new Array(2), { 0: "a" }) })],
  ["1,001 ids", { comments: Array.from({ length: 1001 }, (_, i) => `c${i}`) }],
  ["empty id", { comments: [""] }],
  ["non-string id", { comments: [1] }],
  ["4,097-unit id", { comments: ["x".repeat(4097)] }],
  ["NUL in id", { comments: ["a\0b"] }],
  ["duplicate ids", { comments: ["a", "b", "a"] }],
])("parseCopyScope rejects %s", (_name, scope) => {
  expect(() => parseCopyScope(scope)).toThrow("Invalid copy scope.");
});
test("parseCopyScope accepts 1 to 1,000 distinct bounded ids and copies the array", () => {
  const ids = Array.from({ length: 1000 }, (_, i) => `c${i}`);
  const input = { comments: ids };
  const parsed = parseCopyScope(input);
  expect(parsed).toEqual({ comments: ids });
  ids.push("later"); expect(parsed.comments).toHaveLength(1000);
  expect(parseCopyScope({ comments: ["😀".repeat(2048)] })).toEqual({ comments: ["😀".repeat(2048)] });
});
test("copy rejects an invalid scope before reading the disk", async () => {
  const s = setup(); await create(s);
  vi.mocked(s.deps.read).mockClear();
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { kind: "all" } })).toMatchObject({ ok: false, error: "Invalid copy scope." });
  expect(s.deps.read).not.toHaveBeenCalled();
  expect(s.deps.clipboard).not.toHaveBeenCalled();
});
test.each([false, true])("copy rejects a cloned sparse scope before disk access with valid id=%s", async withId => {
  const s = setup(); await create(s);
  const comments = new Array(withId ? 2 : 1);
  if (withId) comments[0] = createdId(s);
  const scope = structuredClone({ comments });
  vi.mocked(s.deps.read).mockClear();
  vi.mocked(s.deps.authorize).mockClear();
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope })).toMatchObject({ ok: false, error: "Invalid copy scope." });
  expect(s.deps.authorize).not.toHaveBeenCalled();
  expect(s.deps.read).not.toHaveBeenCalled();
  expect(s.deps.clipboard).not.toHaveBeenCalled();
});
test("copy rejects an id that is open only on another canvas", async () => {
  const s = setup(); await create(s, "r1"); const first = createdId(s);
  const canvasA = s.bytes();
  s.set(Buffer.alloc(0));
  await create(s, "r2"); const other = createdId(s);
  const canvasB = s.bytes();
  s.deps.read = vi.fn(async (_root, canvas) => canvas === "a" ? canvasA : canvas === "b" ? canvasB : Buffer.alloc(0));
  expect(await s.service.list("window", { ...identity, path: "design/b.html", canvas: "b", requestID: "read-b" })).toMatchObject({ ok: true, value: { comments: [{ comment: other, status: "open" }] } });
  vi.mocked(s.deps.read).mockClear();
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [first, other] } })).toMatchObject({ ok: false, code: "not_open", identity: { requestID: "copy" } });
  expect(s.deps.read).toHaveBeenCalledExactlyOnceWith(identity.root, identity.canvas);
  expect(s.deps.clipboard).not.toHaveBeenCalled();
});
test("copy rereads the disk and rejects not_open when any id is not an open comment on that canvas", async () => {
  const s = setup(); await create(s, "r1"); const first = createdId(s);
  await create(s, "r2"); const second = JSON.parse(s.bytes().toString().trim().split("\n")[1] ?? "{}").comment;
  const ok = await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [second, first] } });
  expect(ok).toMatchObject({ ok: true, value: { copied: true } });
  expect(JSON.parse(vi.mocked(s.deps.clipboard).mock.calls[0]?.[0].split("\n").at(-1) ?? "").comments).toEqual([first, second]);
  vi.mocked(s.deps.clipboard).mockClear();
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [first, "cmt_unknown"] } })).toMatchObject({ ok: false, code: "not_open", identity: { requestID: "copy" } });
  const before = s.bytes();
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: "resolve", intent: { type: "resolve", comment: second, expected: { body: "Hello 한글", status: "open", updatedAt: JSON.parse(before.toString().trim().split("\n")[1] ?? "{}").at } } })).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [first, second] } })).toMatchObject({ ok: false, code: "not_open" });
  expect(s.deps.clipboard).not.toHaveBeenCalled();
});
test("a resolve landing between main's read and the clipboard write still reports the copy it wrote", async () => {
  const s = setup(); await create(s); const id = createdId(s);
  let finish: (() => void) | undefined;
  s.deps.clipboard = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const copy = s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [id] } });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  // An agent's CLI resolve writes the file directly, outside the app's queue.
  s.set(Buffer.concat([s.bytes(), Buffer.from(JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, at: "2099-01-01T00:00:00.000Z", comment: id, by: { kind: "agent", name: "claude" }, type: "resolve" }) + "\n")]));
  finish?.();
  expect(await copy).toMatchObject({ ok: true, value: { copied: true } });
  expect(s.deps.clipboard).toHaveBeenCalledWith(expect.stringContaining(id));
  s.deps.clipboard = vi.fn();
  expect(await s.service.copy("window", { ...identity, requestID: "again", scope: { comments: [id] } })).toMatchObject({ ok: false, code: "not_open" });
});

test.each(["invalid string", "invalid line", "double BOM"])("service list and copy tolerate %s without losing valid comments", async mode => {
  const s = setup(); await create(s);
  const valid = s.bytes();
  if (mode === "invalid string") {
    const offset = valid.indexOf("Hello");
    s.set(Buffer.concat([valid.subarray(0, offset), Buffer.from([0xff]), valid.subarray(offset + 1)]));
  }
  if (mode === "invalid line") s.set(Buffer.concat([Buffer.from([0xff, 10]), valid]));
  if (mode === "double BOM") s.set(Buffer.concat([Buffer.from("\uFEFF\uFEFF"), valid, valid]));
  const listed = await s.service.list("window", { ...identity, requestID: "read" });
  expect(listed).toMatchObject({ ok: true, value: { comments: [{ body: mode === "invalid string" ? "�ello 한글" : "Hello 한글" }], warnings: mode === "invalid string" ? [] : [{ code: "invalid_event", line: 1 }] } });
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [JSON.parse(valid.toString()).comment] } })).toMatchObject({ ok: true });
  expect(s.deps.clipboard).toHaveBeenCalledWith(expect.stringContaining(JSON.parse(valid.toString()).comment));
});

test("existing malformed bytes do not block editing an unrelated valid comment", async () => {
  const s = setup(); await create(s);
  const event = JSON.parse(s.bytes().toString());
  const before = Buffer.concat([Buffer.from([0xff, 10]), s.bytes()]);
  s.set(before);
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: "edit-invalid-baseline", intent: { type: "edit", comment: event.comment, body: "Edited", expected: { body: event.body, status: "open", updatedAt: event.at } } })).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes().subarray(0, before.length)).toEqual(before);
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ body: "Edited" }], warnings: [{ code: "invalid_event", line: 1 }] } });
});

test.each([false, true])("new malformed UTF-8 tail stays unknown with matching event present=%s", async present => {
  const s = setup(); const { payload } = await create(s);
  s.set(Buffer.concat([present ? s.bytes() : Buffer.alloc(0), Buffer.from([0xff, 10])]));
  const calls = vi.mocked(s.deps.append).mock.calls.length;
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(s.deps.append).toHaveBeenCalledTimes(calls);
});

test("changed baseline bytes with the same warning count remain unknown", async () => {
  const s = setup(); s.set(Buffer.from("bad\n"));
  const { payload } = await create(s);
  s.set(Buffer.from(s.bytes().toString().replace("bad", "BAD")));
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
});

test("malformed baseline permits exact absence and immutable retry but no new invalid tail", async () => {
  const s = setup(); const baseline = Buffer.from([0xff, 10]); s.set(baseline);
  const { payload, reply } = await create(s);
  expect(reply).toMatchObject({ ok: true, value: { state: "saved" } });
  const saved = Buffer.from(s.bytes());
  s.set(baseline);
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "absent" } });
  vi.mocked(s.deps.author).mockResolvedValue({ kind: "human", name: "Different" });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes()).toEqual(saved);
  s.set(Buffer.concat([saved, Buffer.from([0xff])]));
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
});

test("preparing many requests does not copy whole-file baselines", async () => {
  const s = setup(); s.set(Buffer.from(" ".repeat(1024 * 1024) + "\n"));
  const from = vi.spyOn(Buffer, "from");
  try {
    for (let i = 0; i < 8; i++) expect((await create(s, `large-${i}`)).reply).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(from.mock.calls.filter(([input]) => Buffer.isBuffer(input) && input.length >= 1024 * 1024)).toHaveLength(0);
  } finally { from.mockRestore(); }
});

test("invalid UTF-8 inside a new otherwise valid event is not proof of saved or absent", async () => {
  const s = setup(); const { payload } = await create(s);
  const saved = s.bytes();
  const extra = Buffer.from(saved.toString().replace(/evt_[a-f0-9-]+/, "evt_00000000-0000-4000-8000-000000000099"));
  const offset = extra.indexOf("Hello");
  extra[offset] = 0xff;
  s.set(Buffer.concat([saved, extra]));
  const calls = vi.mocked(s.deps.append).mock.calls.length;
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(s.deps.append).toHaveBeenCalledTimes(calls);
});

const byteCases = [
  { name: "truncated three-byte prefix", hex: "e282", body: "��" },
  { name: "truncated four-byte prefix", hex: "f09f92", body: "���" },
  { name: "short four-byte prefix", hex: "f09f", body: "��" },
  { name: "interrupted continuation", hex: "e28241", body: "��A" },
  { name: "stray continuation", hex: "80bf", body: "��" },
  { name: "overlong two-byte", hex: "c0af", body: "��" },
  { name: "overlong three-byte", hex: "e09fbf", body: "���" },
  { name: "overlong four-byte", hex: "f08fbfbf", body: "����" },
  { name: "surrogate", hex: "eda080", body: "���" },
  { name: "above Unicode maximum", hex: "f4908080", body: "����" },
  { name: "invalid lead", hex: "f5808080", body: "����" },
  { name: "valid boundaries", hex: "c280dfbfe0a080ed9fbfee8080efbfbff0908080f48fbfbf", body: "\u0080\u07ff\u0800\ud7ff\ue000\uffff\u{10000}\u{10ffff}" },
  { name: "valid Korean astral and BOM", hex: "ed959cf09f9880efbbbf", body: "한😀\uFEFF" },
];
function replaceBody(valid: Buffer, body: Buffer): Buffer {
  const start = valid.indexOf("Hello 한글");
  return Buffer.concat([valid.subarray(0, start), body, valid.subarray(start + Buffer.byteLength("Hello 한글"))]);
}
test.each(byteCases)("Go byte parity at list/copy/edit ingress: $name", async ({ hex, body }) => {
  const s = setup(); await create(s);
  const event = JSON.parse(s.bytes().toString());
  const before = replaceBody(s.bytes(), Buffer.from(hex, "hex"));
  s.set(before);
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ body }], warnings: [] } });
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [event.comment] } })).toMatchObject({ ok: true });
  expect(s.deps.clipboard).toHaveBeenCalledWith(expect.stringContaining(event.comment));
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: "edit", intent: { type: "edit", comment: event.comment, body: "Edited", expected: { body, status: "open", updatedAt: event.at } } })).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes().subarray(0, before.length)).toEqual(before);
});

test("raw truncated prefix conflicts with one literal replacement for an equal event ID", async () => {
  const s = setup(); await create(s);
  const valid = s.bytes();
  const event = JSON.parse(valid.toString());
  s.set(Buffer.concat([replaceBody(valid, Buffer.from([0xe2, 0x82])), replaceBody(valid, Buffer.from("�"))]));
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [], warnings: [{ code: "conflicting_duplicate", line: 1 }, { code: "conflicting_duplicate", line: 2 }] } });
  expect(await s.service.copy("window", { ...identity, requestID: "copy", scope: { comments: [event.comment] } })).toMatchObject({ ok: false, code: "not_open" });
  expect(s.deps.clipboard).not.toHaveBeenCalled();
});

test.each(["tail", "changed prefix"])("truncated multibyte %s never proves an uncertain append", async mode => {
  const s = setup(); await create(s, "baseline");
  const baseline = s.bytes();
  const { payload } = await create(s, "pending");
  const saved = s.bytes();
  const malformed = replaceBody(baseline, Buffer.from([0xe2, 0x82]));
  s.set(mode === "tail" ? Buffer.concat([saved, malformed]) : Buffer.concat([malformed, saved.subarray(baseline.length)]));
  const calls = vi.mocked(s.deps.append).mock.calls.length;
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(s.deps.append).toHaveBeenCalledTimes(calls);
});

test("one leading BOM preserves a valid multibyte body", async () => {
  const s = setup(); await create(s);
  s.set(Buffer.concat([Buffer.from("\uFEFF"), s.bytes()]));
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ body: "Hello 한글" }], warnings: [] } });
});

test.each([
  { cause: "invalid", canvas: "Invalid", canvases: [{ path: identity.path, id: "Invalid" }] },
  { cause: "duplicate", canvas: "a", canvases: [{ path: identity.path, id: "a" }, { path: "design/b.html", id: "a" }] },
  { cause: "missing", canvas: "a", canvases: [] },
  { cause: "missing", canvas: "a", canvases: [{ path: "design/b.html", id: "a" }] },
])("returns the $cause identity cause from authorization", async ({ cause, canvas, canvases }) => {
  const s = setup();
  vi.mocked(s.deps.authorize).mockImplementation(async requested => ({
    ...authorizeCanvas(requested, { kind: "list", root: identity.root, canvases }), url: "http://canvas",
  }));
  const request = { ...identity, canvas, requestID: "read" };
  expect(await s.service.list("window", request)).toEqual({
    ok: false, identity: request, error: "Canvas identity is missing, changed or duplicated.", cause,
  });
  expect(s.deps.read).not.toHaveBeenCalled();
});
test("non-identity failures omit cause even with the same error message", async () => {
  const s = setup();
  const request = { ...identity, requestID: "read" };
  vi.mocked(s.deps.read).mockRejectedValue(new Error("Canvas identity is missing, changed or duplicated."));
  expect(await s.service.list("window", request)).toEqual({
    ok: false, identity: request, error: "Canvas identity is missing, changed or duplicated.",
  });
});

async function resolved(s: ReturnType<typeof setup>) {
  await create(s);
  const event = JSON.parse(s.bytes().toString());
  const open = { body: event.body, status: "open", updatedAt: event.at };
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: "resolve", intent: { type: "resolve", comment: event.comment, expected: open } })).toMatchObject({ ok: true, value: { state: "saved" } });
  const resolve = JSON.parse(s.bytes().toString().trim().split("\n")[1] ?? "{}");
  const expected = { ...open, resolvedAt: resolve.at, status: "resolved" };
  return { comment: event.comment as string, expected, payload: { ...identity, project: 1, requestID: "edit-reopen", intent: { type: "edit-reopen", comment: event.comment, body: "Revised", expected } } };
}
const lines = (bytes: Buffer) => bytes.toString().trim().split("\n").map(line => JSON.parse(line));

test("edit-reopen writes the edit and reopen lines in one append and replies with the edit id", async () => {
  const s = setup(); const { payload, comment } = await resolved(s);
  const before = s.bytes(); const calls = vi.mocked(s.deps.append).mock.calls.length;
  const reply = await s.service.mutate("window", payload);
  expect(s.deps.append).toHaveBeenCalledTimes(calls + 1);
  const [edit, reopen] = lines(s.bytes().subarray(before.length));
  expect(edit).toMatchObject({ type: "edit", comment, body: "Revised", by: { kind: "human", name: "Human" } });
  expect(reopen).toMatchObject({ type: "reopen", comment, at: new Date(Date.parse(edit.at) + 1).toISOString() });
  expect(reply).toEqual({ ok: true, identity: expect.anything(), value: { state: "saved", event: edit.id, comment } });
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ status: "open", body: "Revised" }] } });
});

test("edit-reopen retry after an uncertain write replays the same two events", async () => {
  const s = setup(); const { payload } = await resolved(s);
  const before = s.bytes();
  let prepared: Buffer | null = null;
  vi.mocked(s.deps.append).mockImplementationOnce(async (_r, _c, prepare) => { prepared = await prepare(before); throw new AppendUncertainError("write failed"); });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown", event: lines(prepared ?? Buffer.alloc(0))[0].id } });
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "absent" } });
  vi.mocked(s.deps.author).mockResolvedValue({ kind: "human", name: "Changed" });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes()).toEqual(Buffer.concat([before, prepared ?? Buffer.alloc(0)]));
  const saved = s.bytes();
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(s.bytes()).toEqual(saved);
});

test.each([0, 1])("edit-reopen with only event %i on disk is unknown and never appends", async kept => {
  const s = setup(); const { payload } = await resolved(s);
  const before = s.bytes();
  await s.service.mutate("window", payload);
  const added = s.bytes().subarray(before.length).toString().trim().split("\n");
  s.set(Buffer.concat([before, Buffer.from(`${added[kept]}\n`)]));
  const calls = vi.mocked(s.deps.append).mock.calls.length;
  expect(await s.service.status("window", { ...identity, requestID: payload.requestID })).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "unknown" } });
  expect(s.deps.append).toHaveBeenCalledTimes(calls);
});

test.each(["edit", "reopen"])("a human %s written in between rejects edit-reopen like a stale edit", async type => {
  const s = setup(); const { payload, comment } = await resolved(s);
  const external = { v: 1, id: "evt_00000000-0000-4000-8000-000000000099", comment, at: "2099-01-01T00:00:00.000Z", by: { kind: "human", name: "Other" }, type, ...(type === "edit" ? { body: "external" } : {}) };
  s.set(Buffer.concat([s.bytes(), Buffer.from(JSON.stringify(external) + "\n")]));
  const before = s.bytes();
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: false, error: expect.stringContaining("Comment changed") });
  expect(s.bytes()).toEqual(before);
});

test.each(["edit", "reopen"])("an agent %s ignored by folding does not reject edit-reopen", async type => {
  const s = setup(); const { payload, comment } = await resolved(s);
  const agent = { v: 1, id: "evt_00000000-0000-4000-8000-000000000099", comment, at: "2099-01-01T00:00:00.000Z", by: { kind: "agent", name: "codex" }, type, ...(type === "edit" ? { body: "agent" } : {}) };
  s.set(Buffer.concat([s.bytes(), Buffer.from(JSON.stringify(agent) + "\n")]));
  expect(await s.service.mutate("window", payload)).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(lines(s.bytes()).slice(-2).map(event => event.at)).toEqual(["2099-01-01T00:00:00.001Z", "2099-01-01T00:00:00.002Z"]);
});

test("Save only stays a single edit that keeps the comment resolved", async () => {
  const s = setup(); const { comment, expected } = await resolved(s);
  const before = s.bytes();
  expect(await s.service.mutate("window", { ...identity, project: 1, requestID: "save-only", intent: { type: "edit", comment, body: "Revised", expected } })).toMatchObject({ ok: true, value: { state: "saved" } });
  expect(lines(s.bytes().subarray(before.length))).toEqual([expect.objectContaining({ type: "edit" })]);
  expect(await s.service.list("window", { ...identity, requestID: "read" })).toMatchObject({ ok: true, value: { comments: [{ status: "resolved", body: "Revised" }] } });
});

test.each([
  ["missing body", ({ body: _body, ...rest }: Record<string, unknown>) => rest],
  ["blank body", (intent: Record<string, unknown>) => ({ ...intent, body: " " })],
  ["extra key", (intent: Record<string, unknown>) => ({ ...intent, origin: "x" })],
] as const)("edit-reopen rejects %s before append", async (_name, change) => {
  const s = setup(); const { payload } = await resolved(s);
  const before = s.bytes();
  expect(await s.service.mutate("window", { ...payload, intent: change(payload.intent) })).toMatchObject({ ok: false, error: "Invalid mutation." });
  expect(s.bytes()).toEqual(before);
});

test("inspectAttempt is saved only when every event is present and absent only when none is", () => {
  const base = Buffer.from(JSON.stringify({ v: 1, id: "evt_00000000-0000-4000-8000-000000000001", comment: "cmt_00000000-0000-4000-8000-000000000001", at: "2026-01-01T00:00:00.000Z", type: "create", by: { kind: "human", name: "Kim" }, body: "b", target: {}, canvasHash: "sha256:" + "a".repeat(64) }) + "\n");
  const event = (n: number, type: "edit" | "reopen") => ({ v: 1, id: `evt_00000000-0000-4000-8000-00000000000${n}`, comment: "cmt_00000000-0000-4000-8000-000000000001", at: `2026-01-01T00:00:00.00${n}Z`, by: { kind: "human", name: "Kim" }, type, ...(type === "edit" ? { body: "e" } : {}) }) as CommentEvent;
  const events: [CommentEvent, CommentEvent] = [event(2, "edit"), event(3, "reopen")];
  const evidence = { events, before: attemptBaseline(base) };
  const withLines = (...added: CommentEvent[]) => Buffer.concat([base, ...added.map(e => Buffer.from(JSON.stringify(e) + "\n"))]);
  expect(inspectAttempt(withLines(...events), evidence)).toEqual({ state: "saved", event: events[0].id, comment: events[0].comment });
  expect(inspectAttempt(base, evidence)).toEqual({ state: "absent", event: events[0].id, comment: events[0].comment });
  for (const one of events) expect(inspectAttempt(withLines(one), evidence)).toMatchObject({ state: "unknown" });
  expect(inspectAttempt(withLines(events[0], { ...events[1], at: "2026-01-01T00:00:00.009Z" }), evidence)).toMatchObject({ state: "unknown" });
  expect(inspectAttempt(withLines(events[0]), { events: [events[0]], before: attemptBaseline(base) })).toMatchObject({ state: "saved" });
});

describe("comments without a canvas (project-feedback design §4)", () => {
  const orphan = { root: "/repo", canvas: "gone" };
  const seeded = JSON.stringify({ v: 1, id: "evt_00000000-0000-4000-8000-000000000001", at: "2026-10-26T10:00:00.000Z", type: "create", comment: "cmt_00000000-0000-4000-8000-000000000001", by: { kind: "human", name: "Kim" }, body: "Old", target: {}, canvasHash: "sha256:" + "a".repeat(64) }) + "\n";
  const expected = { body: "Old", status: "open", updatedAt: "2026-10-26T10:00:00.000Z" };
  const intent = (type: string) => ({ type, comment: "cmt_00000000-0000-4000-8000-000000000001", expected, ...(type === "edit" || type === "edit-reopen" ? { body: "New" } : {}) });
  function seed() { const s = setup(); s.set(Buffer.from(seeded)); return s; }
  const payload = (type = "resolve", requestID = "o1") => ({ ...orphan, requestID, project: 1, intent: intent(type) });

  test("resolves with a non-creating append, judged on a fresh ls inside the append", async () => {
    const s = seed();
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, identity: { ...orphan, requestID: "o1" }, value: { state: "saved" } });
    expect(JSON.parse(s.bytes().toString().split("\n")[1] ?? "{}")).toMatchObject({ type: "resolve", by: { kind: "human", name: "Human" } });
    expect(vi.mocked(s.deps.append).mock.calls[0]?.slice(0, 2)).toEqual(["/repo", "gone"]);
    expect(vi.mocked(s.deps.append).mock.calls[0]?.[3]).toEqual({ create: false });
    // Before the attempt check, after the Git name lookup and in the append callback, as for a canvas.
    expect(s.deps.listing).toHaveBeenCalledTimes(3);
    expect(s.deps.authorize).not.toHaveBeenCalled();
    expect(s.deps.invalidated).toHaveBeenCalledWith("/repo");
  });

  test.each(["reopen", "delete"])("allows %s", async type => {
    const s = seed();
    if (type === "reopen") expect(await s.service.orphanMutate("window", payload("resolve", "first"))).toMatchObject({ ok: true });
    const current = type === "reopen" ? { ...intent(type), expected: { ...expected, status: "resolved", resolvedAt: JSON.parse(s.bytes().toString().split("\n")[1] ?? "{}").at } } : intent(type);
    expect(await s.service.orphanMutate("window", { ...orphan, requestID: "o2", project: 1, intent: current })).toMatchObject({ ok: true, value: { state: "saved" } });
  });

  test.each(["create", "edit", "edit-reopen"])("refuses %s before reading anything", async type => {
    const s = seed();
    const value = type === "create" ? { ...orphan, requestID: "c", project: 1, intent: { type, body: "New" } } : payload(type);
    expect(await s.service.orphanMutate("window", value)).toMatchObject({ ok: false, error: "Comments without a canvas can only be resolved, reopened or deleted." });
    expect(s.deps.listing).not.toHaveBeenCalled();
    expect(s.deps.append).not.toHaveBeenCalled();
  });

  test("refuses a path, an origin or any other field", async () => {
    const s = seed();
    for (const extra of [{ path: "design/gone.html" }, { origin: "x" }, { by: { name: "Forged" } }]) {
      expect(await s.service.orphanMutate("window", { ...payload(), ...extra })).toMatchObject({ ok: false });
    }
    expect(s.deps.append).not.toHaveBeenCalled();
  });

  test("without a Git name nothing is written", async () => {
    const s = seed();
    vi.mocked(s.deps.author).mockRejectedValue(new Error("Configure a Git user name before saving comments."));
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: false, error: "Configure a Git user name before saving comments." });
    vi.mocked(s.deps.author).mockResolvedValue({ kind: "human", name: " " });
    expect(await s.service.orphanMutate("window", payload("resolve", "o2"))).toMatchObject({ ok: false, error: "Configure a Git user name before saving comments." });
    expect(s.bytes().toString()).toBe(seeded);
  });

  test.each<[string, FolderView]>([
    ["uncertain", orphanListing({ uncertain: true })],
    ["unreadable", orphanListing({ error: { code: "unreadable_comments", message: "Cannot read" } })],
    ["no longer an orphan", { kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/gone.html", id: "gone" }], orphans: [] }],
    ["another root", { ...orphanListing(), root: "/other" } as FolderView],
    ["not listed", { kind: "cliError", reason: "timed out" }],
  ])("refuses an orphan that is %s", async (_name, view) => {
    const s = seed();
    vi.mocked(s.deps.listing).mockResolvedValue(view);
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: false, error: "These comments are no longer without a canvas, or the project could not be read fully." });
    expect(s.deps.append).not.toHaveBeenCalled();
  });

  test("refuses an id that is not a canvas id", async () => {
    const s = seed();
    vi.mocked(s.deps.listing).mockResolvedValue(orphanListing({ id: "Foo", file: ".doan/comments/Foo.jsonl" }));
    expect(await s.service.orphanMutate("window", { ...payload(), canvas: "Foo" })).toMatchObject({ ok: false });
    expect(s.deps.append).not.toHaveBeenCalled();
  });

  test("a canvas restored between the judgement and the write is refused inside the append", async () => {
    const s = seed();
    vi.mocked(s.deps.listing).mockResolvedValueOnce(orphanListing()).mockResolvedValueOnce(orphanListing()).mockResolvedValue({ kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/gone.html", id: "gone" }], orphans: [] });
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: false, error: "These comments are no longer without a canvas, or the project could not be read fully." });
    expect(s.deps.append).toHaveBeenCalledTimes(1);
    expect(s.bytes().toString()).toBe(seeded);
  });

  test("a file removed after the judgement is refused and the error is not uncertain", async () => {
    const s = seed();
    vi.mocked(s.deps.append).mockRejectedValueOnce(new Error("The comment file no longer exists."));
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: false, error: "The comment file no longer exists." });
  });

  test("a changed expected state is refused", async () => {
    const s = seed();
    expect(await s.service.orphanMutate("window", { ...payload(), intent: { ...intent("resolve"), expected: { ...expected, body: "Other" } } })).toMatchObject({ ok: false });
    expect(s.bytes().toString()).toBe(seeded);
  });

  test("status checks root, epoch and attempt only, so it answers after the canvas returns", async () => {
    const s = seed();
    vi.mocked(s.deps.append).mockImplementationOnce(async (_r, _c, prepare) => { await prepare(Buffer.from(seeded)); throw new AppendUncertainError("write failed"); });
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "unknown" } });
    vi.mocked(s.deps.listing).mockClear().mockResolvedValue({ kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/gone.html", id: "gone" }], orphans: [] });
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "o1" })).toMatchObject({ ok: true, identity: { ...orphan, requestID: "o1" }, value: { state: "absent" } });
    expect(s.deps.listing).not.toHaveBeenCalled();
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "other" })).toMatchObject({ ok: true, value: { state: "unknown" } });
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "o1", path: "design/gone.html" })).toMatchObject({ ok: false });
    s.deps.epoch = () => null;
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "o1" })).toMatchObject({ ok: false });
  });

  test("a retry writes the stored event once, and a reused request id with other content is refused", async () => {
    const s = seed();
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "saved" } });
    const saved = s.bytes().toString();
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "o1" })).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(await s.service.orphanMutate("window", payload("delete"))).toMatchObject({ ok: false, error: "Request id was reused with different content." });
    expect(s.bytes().toString()).toBe(saved);
  });

  test("an uncertain write is retried without a path once absence is confirmed", async () => {
    const s = seed();
    vi.mocked(s.deps.append).mockImplementationOnce(async (_r, _c, prepare) => { await prepare(Buffer.from(seeded)); throw new AppendUncertainError("write failed"); });
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "unknown" } });
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(s.bytes().toString().trim().split("\n")).toHaveLength(2);
  });

  test("a request id is not shared between a canvas request and an orphan request", async () => {
    const s = seed();
    const canvas = { root: "/repo", path: "design/gone.html", canvas: "gone", requestID: "o1", project: 1, intent: intent("resolve") };
    vi.mocked(s.deps.authorize).mockResolvedValue({ width: 100, url: "http://canvas" });
    expect(await s.service.mutate("window", canvas)).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(await s.service.orphanMutate("window", payload())).toMatchObject({ ok: false, error: "Request id was reused with different content." });
    expect(await s.service.orphanStatus("window", { ...orphan, requestID: "o1" })).toMatchObject({ ok: true, value: { state: "unknown" } });
    const t = seed();
    expect(await t.service.orphanMutate("window", payload())).toMatchObject({ ok: true, value: { state: "saved" } });
    expect(await t.service.status("window", { ...orphan, path: "design/gone.html", requestID: "o1" })).toMatchObject({ ok: true, value: { state: "unknown" } });
    expect(await t.service.mutate("window", canvas)).toMatchObject({ ok: false, error: "Request id was reused with different content." });
  });

  test("a stale project generation is refused", async () => {
    const s = seed();
    expect(await s.service.orphanMutate("window", { ...payload(), project: 0 })).toMatchObject({ ok: false });
    expect(s.deps.append).not.toHaveBeenCalled();
  });
});
