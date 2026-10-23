import { expect, test, vi } from "vitest";
import { createCommentsService } from "./service";
import type { CommentIdentity, ServiceDependencies } from "./service";
import { AppendUncertainError } from "./files";
import { MkdirTerminationUnconfirmedError } from "./mkdir";
vi.mock("electron", () => ({ utilityProcess: {} }));
vi.mock("./files", () => ({ AppendUncertainError: class extends Error {} }));
const identity: CommentIdentity = { root: "/repo", path: "design/a.html", canvas: "a" };
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
