import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type Runner, type StartRequest } from "./service";
import { DraftStore } from "./drafts";
import type { Canvas, ConversationEvent } from "./types";

// Every turn's canvas.drawn events: a new canvas the turn edited, written once it is listed, until the turn's
// settle deadline (ARCHITECTURE §7 'Handoff' for the window).
const paths: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" };
const c = { path: ".doan/canvases/c.html", id: "c" }, d = { path: ".doan/canvases/d.html", id: "d" };
const at = (canvas: Canvas) => `/repo/${canvas.path}`;
function fixture(options: { provider?: "claude" | "codex"; listed?: Canvas[]; legacy?: boolean } = {}) {
  const provider = options.provider ?? "codex";
  const dir = mkdtempSync(join(tmpdir(), "doan-drawn-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider, connectionId: "conn", accountId: "acct", workspaceId: null, profile: provider };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: provider, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, ...(options.legacy ? {} : { owner }), ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed: Canvas[] = [...options.listed ?? [a]];
  // Runs once each time main reads the root's listing, before it is returned.
  const hooks = { onList: undefined as undefined | (() => void) };
  const canvases = () => { hooks.onList?.(); return listed; };
  const published: ConversationEvent[] = [];
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, 10_000, canvases, () => {}, { drafts: new DraftStore(null) });
  const canvasRequest: StartRequest = { root: "/repo", mode: "new", runtime: provider, canvas: a, text: "Make a checkout page", anchors: [], model: "gpt-x", effort: "high", permissionMode: "acceptEdits" };
  const start = async (request: Partial<StartRequest> = {}, omit: ("canvas" | "runtime")[] = []) => {
    const full: Partial<StartRequest> = { ...canvasRequest, ...request };
    for (const field of omit) delete full[field];
    return (await service.start(full as StartRequest)).conversationId;
  };
  const project = () => start({ mode: "newDesign", text: "Draw two pages" }, ["canvas"]);
  const legacy = () => start({ mode: "resume" }, ["runtime"]);
  const drawn = (id: string) => store.read(id).filter(e => e.type === "canvas.drawn");
  const turnOf = (id: string) => store.read(id).filter(e => e.type === "turn.started").at(-1)!.turnId;
  const edit = (id: string, path: string) => service.receive(id, { type: "activity", kind: "edit", path, insideDesign: true, summary: "Edit" });
  const list = (...canvases: Canvas[]) => { listed.push(...canvases); service.refreshed("/repo"); };
  return { dir, service, store, open, runners, listed, hooks, published, start, project, legacy, drawn, turnOf, edit, list };
}
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

describe("canvas.drawn", () => {
  const kinds = [["a Doan project conversation", (h: ReturnType<typeof fixture>) => h.project()], ["a Doan canvas conversation", (h: ReturnType<typeof fixture>) => h.start()]] as const;
  for (const [kind, begin] of kinds) {
    it(`writes one event per new canvas for ${kind}, under the turn, in edit order`, async () => {
      fake();
      const h = fixture(); const id = await begin(h); const turn = h.turnOf(id);
      h.edit(id, at(c)); h.edit(id, at(d));
      h.list(c, d);
      expect(h.drawn(id)).toMatchObject([{ canvas: c, turnId: turn }, { canvas: d, turnId: turn }]);
      expect(h.published.filter(e => e.type === "canvas.drawn")).toHaveLength(2);
      h.service.receive(id, { type: "turn.done" });
      vi.advanceTimersByTime(10_000);
      h.service.refreshed("/repo");
      expect(h.drawn(id)).toHaveLength(2);
    });
  }
  it("writes one event per new canvas for a legacy external conversation", async () => {
    fake();
    const h = fixture({ legacy: true }); const id = await h.legacy();
    expect(h.store.list()[0]!.owner.kind).toBe("legacy-external");
    h.edit(id, at(c)); h.edit(id, at(d)); h.list(c, d);
    expect(h.drawn(id)).toMatchObject([{ canvas: c }, { canvas: d }]);
  });
  it("writes at once when the edited canvas is listed already", async () => {
    const h = fixture(); const id = await h.start();
    h.listed.push(c);
    h.edit(id, at(c));
    expect(h.drawn(id)).toMatchObject([{ canvas: c }]);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "canvas.drawn" });
  });
  it("writes none for an existing canvas the turn edited", async () => {
    fake();
    const h = fixture({ listed: [a, b] }); const id = await h.start();
    h.edit(id, at(a)); h.edit(id, at(b)); h.service.refreshed("/repo");
    h.service.receive(id, { type: "turn.done" }); vi.advanceTimersByTime(10_000);
    expect(h.drawn(id)).toEqual([]);
  });
  it("writes none for a canvas that is new but that the turn did not edit", async () => {
    const h = fixture(); const id = await h.start();
    h.service.receive(id, { type: "activity", kind: "command", summary: "Ran a command" });
    h.list(c);
    expect(h.drawn(id)).toEqual([]);
  });
  it("writes one for a canvas listed during the turn, before its turn.done", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c));
    expect(h.drawn(id)).toEqual([]);
    h.list(c);
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(10_000);
    const types = h.store.read(id).map(e => e.type);
    expect(types.indexOf("canvas.drawn")).toBeLessThan(types.indexOf("turn.done"));
    expect(h.drawn(id)).toHaveLength(1);
  });
  it("writes one for a canvas listed after turn.done within the window, and none after it", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(4_000);
    h.list(c);
    const types = h.store.read(id).map(e => e.type);
    expect(types.indexOf("canvas.drawn")).toBeGreaterThan(types.indexOf("turn.done"));
    expect(h.drawn(id)).toHaveLength(1);

    const late = fixture(); const other = await late.start();
    late.edit(other, at(c)); late.service.receive(other, { type: "turn.done" });
    vi.advanceTimersByTime(10_000);
    late.list(c);
    expect(late.drawn(other)).toEqual([]);
  });
  it("waits until BIND_GRACE_MS while a Codex server stays alive, but only a settle time once a group is gone", async () => {
    fake();
    const codex = fixture({ provider: "codex" }); const id = await codex.start();
    codex.edit(id, at(c)); codex.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(9_999);
    codex.list(c);
    expect(codex.drawn(id)).toHaveLength(1);

    const claude = fixture({ provider: "claude" }); const other = await claude.start();
    claude.edit(other, at(c)); claude.service.receive(other, { type: "turn.done" });
    claude.open.mock.calls[0]![2]();
    vi.advanceTimersByTime(5_572);
    claude.list(c);
    expect(claude.drawn(other)).toEqual([]);
  });
  it("writes one within the window for a failed or a stopped turn", async () => {
    fake();
    const failed = fixture(); const id = await failed.start();
    failed.edit(id, at(c)); failed.service.receive(id, { type: "turn.failed", code: "process_exited" });
    vi.advanceTimersByTime(2_000); failed.list(c);
    expect(failed.drawn(id)).toHaveLength(1);

    const stopped = fixture(); const other = await stopped.start();
    stopped.edit(other, at(c)); await stopped.service.interrupt(other);
    vi.advanceTimersByTime(2_000); stopped.list(c);
    expect(stopped.drawn(other)).toHaveLength(1);
  });
  it("writes none for a canvas renamed or trashed during the turn", async () => {
    fake();
    // An existing canvas renamed: the edit of its new path still names the canvas the turn started with.
    const renamed = fixture({ listed: [a, b] }); const id = await renamed.start();
    renamed.listed.splice(1, 1, { path: ".doan/canvases/b2.html", id: "b" });
    renamed.edit(id, "/repo/.doan/canvases/b2.html"); renamed.service.refreshed("/repo");
    // A new canvas trashed before it was listed.
    renamed.edit(id, at(c)); renamed.service.refreshed("/repo");
    renamed.service.receive(id, { type: "turn.done" }); vi.advanceTimersByTime(10_000);
    expect(renamed.drawn(id)).toEqual([]);
  });
  it("keeps an earlier turn's watch after the next send, and writes under that turn", async () => {
    fake();
    const h = fixture(); const id = await h.start(); const first = h.turnOf(id);
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(1_000);
    await h.service.send(id, "and d", []); const second = h.turnOf(id);
    h.edit(id, at(d));
    h.list(c, d);
    expect(h.drawn(id)).toMatchObject([{ canvas: c, turnId: first }, { canvas: d, turnId: second }]);
  });
  it("neither holds the queue nor keeps the conversation working while it waits", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(false);
  });
  it("writes nothing and never recreates the history of a conversation deleted before the write", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    h.service.delete(id);
    h.list(c);
    vi.advanceTimersByTime(10_000);
    expect(h.store.read(id)).toEqual([]);
    expect(existsSync(join(h.dir, "conversations", `${id}.jsonl`))).toBe(false);
  });
  // POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn': the conversation is checked again right
  // before the write, after the listing was read.
  it("checks the conversation again after reading the listing, right before the write", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    const append = vi.spyOn(h.store, "append");
    h.hooks.onList = () => { h.hooks.onList = undefined; h.store.save(h.store.list().filter(m => m.conversationId !== id)); };
    h.list(c);
    vi.advanceTimersByTime(10_000);
    expect(append.mock.calls.filter(([, , event]) => event.type === "canvas.drawn")).toEqual([]);
  });
  it("writes nothing after the app quit", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    await h.service.quit();
    h.list(c); vi.advanceTimersByTime(10_000);
    expect(h.drawn(id)).toEqual([]);
  });
  it("drops the watch once the history stopped taking writes", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c));
    const append = h.store.append.bind(h.store);
    const spy = vi.spyOn(h.store, "append").mockImplementation((conversation, turn, event) => { if (event.type === "activity" && event.kind === "other") throw new Error("EIO"); return append(conversation, turn, event); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(id, { type: "activity", kind: "other", summary: "x" });
    h.list(c); vi.advanceTimersByTime(10_000);
    expect(spy.mock.calls.filter(([, , event]) => event.type === "canvas.drawn")).toEqual([]);
  });
  it("only logs a failed write: the turn keeps running and writing, and the watch is dropped", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    const append = h.store.append.bind(h.store);
    const spy = vi.spyOn(h.store, "append").mockImplementation((conversation, turn, event) => { if (event.type === "canvas.drawn") throw new Error("EIO"); return append(conversation, turn, event); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.edit(id, at(c)); h.list(c);
    expect(logged).toHaveBeenCalled();
    h.service.receive(id, { type: "activity", kind: "other", summary: "still working" });
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.read(id).map(e => e.type).slice(-2)).toEqual(["activity", "turn.done"]);
    expect(h.service.list("/repo").find(s => s.conversationId === id)).toMatchObject({ phase: "ended", working: false });
    h.service.refreshed("/repo"); vi.advanceTimersByTime(10_000);
    expect(spy.mock.calls.filter(([, , event]) => event.type === "canvas.drawn")).toHaveLength(1);
  });
  it("writes one in each conversation when two turns edited the same new path", async () => {
    const h = fixture({ listed: [a, b] });
    const first = await h.start(), second = await h.start({ canvas: b });
    h.edit(first, at(c)); h.edit(second, at(c));
    h.list(c);
    expect(h.drawn(first)).toMatchObject([{ canvas: c }]);
    expect(h.drawn(second)).toMatchObject([{ canvas: c }]);
  });
  // POSTMORTEM 2026-11-15 'A running turn's in-memory canvas missed a move that a refused send had already saved': the
  // watch holds the turn's own listing snapshot, not a copy of the conversation's canvas, so a move saved by a refused
  // send changes nothing.
  it("judges the same after a send refused as busy saved the conversation's moved canvas", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    const moved = { path: ".doan/canvases/moved.html", id: "a" };
    h.listed.splice(0, 1, moved);
    await expect(h.service.send(id, "while running", [])).rejects.toThrow("busy");
    expect(h.store.list()[0]!.canvas).toEqual(moved);
    h.edit(id, at(moved)); h.edit(id, at(c));
    h.list(c);
    h.service.receive(id, { type: "turn.done" }); vi.advanceTimersByTime(10_000);
    expect(h.drawn(id)).toMatchObject([{ canvas: c }]);
  });
});
