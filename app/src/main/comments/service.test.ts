import { expect, test, vi } from "vitest";
import { createCommentsService } from "./service";
import type { CommentIdentity, ServiceDependencies } from "./service";
import { AppendUncertainError } from "./files";
vi.mock("./files", () => ({ AppendUncertainError: class extends Error {} }));
const identity: CommentIdentity = { root: "/repo", path: "design/a.html", canvas: "a" };
function setup() {
  let bytes = Buffer.alloc(0);
  const deps: ServiceDependencies = {
    authorize: vi.fn(async () => ({ width: 100, url: "http://canvas" })),
    epoch: () => 1,
    author: vi.fn(async () => ({ kind: "human", name: "Human" })),
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
  const payload = { ...identity, requestID, origin: start.value.origin, intent: { type: "create", body: "Hello 한글" } };
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
