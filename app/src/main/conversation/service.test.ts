import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HOME_GUIDANCE, PRESET_GUIDANCE } from "./prompt";
import { ConversationService, resolveListedCanvas, type Runner, type OpenRunner, type Prepare, type QueueFiles, type QueueOptions } from "./service";
import { DraftStore } from "./drafts";
import { SkillCatalog } from "./skills";
import type { Canvas, ConversationEvent } from "./types";
import { storedAnswers } from "./transport";
import { foldConversation } from "./state";
import { othersOnCanvas } from "../workOthers";
const paths: string[] = []; afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; const exits: (() => void)[] = [];
  let hold: (() => void) | undefined;
  const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
    exits.push(exited); if (hold) await new Promise<void>(resolve => { hold = resolve; });
    const runner: Runner = { sessionId: input.sessionId ?? "new-session", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async () => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }));
  const ended: string[] = [];
  const service = new ConversationService(store, prepare, open, () => {}, undefined, undefined, undefined, undefined, undefined, undefined, id => { ended.push(id); });
  return { service, store, dir, runners, exits, prepare, open, ended, hold: () => { hold = () => {}; }, release: () => hold?.() };
}
const request = { root: "/repo", mode: "resume" as const, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] };
it("reserves pending sessions across canvases before opening and leaves rejected starts untouched", async () => {
  const h = fixture(); h.hold(); const first = h.service.start(request); await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
  await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).rejects.toThrow("session_in_use");
  expect(h.store.list()).toEqual([]); h.release(); const id = (await first).conversationId;
  expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started"]);
  await expect(h.service.send(id, "second", [])).rejects.toThrow("busy");
});
it("retains idle Codex ownership until confirmed exit and reuses only the owning server", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "again", []);
  expect(h.open).toHaveBeenCalledOnce(); expect(h.runners[0]?.send).toHaveBeenCalledTimes(2);
  // Deleted, the conversation no longer holds the session; its process still does until it exits.
  await h.service.interrupt(id); h.service.delete(id);
  await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).rejects.toThrow("session_in_use");
  h.exits[0]?.(); await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } });
});
it("tells prepare when a send reuses the conversation's live Codex server", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  expect(h.prepare.mock.calls[0]?.[3]).toBeFalsy();
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "again", []);
  expect(h.prepare.mock.calls[1]?.[3]).toBe(true);
  await h.service.interrupt(id); h.exits[0]?.();
  await h.service.send(id, "after exit", []);
  expect(h.prepare.mock.calls[2]?.[3]).toBeFalsy();
});
// A reused Codex server reloads its MCP servers before the next turn when a Connect, Disconnect,
// Remove or replacement changed the provider's connectors since it opened.
describe("Codex MCP reload", () => {
  function connectors() {
    let generation = 4; const fake = fixture();
    fake.prepare.mockImplementation(async () => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {}, mcp: { generation: () => generation, labels: () => ({}) } }));
    const choices = (runner = 0) => vi.mocked(fake.runners[runner]!.send).mock.calls.map(call => call[3]?.reloadMcp ?? false);
    return { ...fake, bump: () => { generation += 1; }, choices };
  }
  it("reloads once on the next turn after the generation changed, and not again", async () => {
    const h = connectors(); const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "same", []);
    h.service.receive(id, { type: "turn.done" }); h.bump(); await h.service.send(id, "changed", []);
    h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "after", []);
    expect(h.open).toHaveBeenCalledOnce(); expect(h.choices()).toEqual([false, false, true, false]);
  });
  it("keeps a running turn and reloads only before the next one", async () => {
    const h = connectors(); const id = (await h.service.start(request)).conversationId;
    h.bump(); h.bump();
    expect(h.runners[0]!.stop).not.toHaveBeenCalled(); expect(h.runners[0]!.close).not.toHaveBeenCalled(); expect(h.runners[0]!.send).toHaveBeenCalledOnce();
    h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "next", []);
    expect(h.choices()).toEqual([false, true]);
  });
  it("never reloads a server it just opened, which read the current profile", async () => {
    const h = connectors(); const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" }); await h.service.interrupt(id); h.exits[0]?.(); h.bump();
    await h.service.send(id, "reopened", []);
    expect(h.open).toHaveBeenCalledTimes(2); expect(h.choices(1)).toEqual([false]);
    h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "reused", []);
    expect(h.choices(1)).toEqual([false, false]);
  });
  it("sends no reload for a run without connector facts", async () => {
    const h = fixture(); const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "again", []);
    expect(vi.mocked(h.runners[0]!.send).mock.calls.map(call => call[3]?.reloadMcp)).toEqual([undefined, undefined]);
  });
});
it("persists quit interruption synchronously", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.quit(); expect(h.store.read(id).at(-1)).toMatchObject({ type: "interrupted", reason: "appQuit" });
  expect(h.runners[0]?.close).toHaveBeenCalledOnce();
});
it("refuses acceptance when the owned process exits during opening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir); const store = new ConversationStore(dir);
  const service = new ConversationService(store, async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "s", command: "/fake", env: {} }), async (_input, _emit, exited) => {
    exited(); return { sessionId: "s", send: async () => {}, stop: async () => {}, close: async () => {}, answer: () => false };
  }, () => {});
  await expect(service.start(request)).rejects.toThrow("process_exited"); expect(store.list()).toEqual([]);
});
it("keeps different sessions independent", async () => {
  const h = fixture(); const first = await h.service.start(request); h.service.receive(first.conversationId, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "other-session", command: "/fake", env: {} });
  await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } });
  expect(h.store.list()).toHaveLength(2);
});
it("does not log a start whose new session ID collides with another owner", async () => {
  const h = fixture(); h.prepare.mockResolvedValue({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} });
  const first = await h.service.start({ ...request, mode: "new", runtime: "codex" });
  await expect(h.service.start({ ...request, mode: "new", runtime: "codex" })).rejects.toThrow("session_in_use");
  expect(h.store.list()).toHaveLength(1);
  expect(h.store.read(first.conversationId).map(e => e.type)).toEqual(["user.message", "turn.started"]);
  expect(h.runners[1]?.close).toHaveBeenCalledOnce();
});
it("retains a failed opening reservation until the opener confirms process exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir); let exit = () => {};
  const opening: OpenRunner = vi.fn(async (_input, _emit, exited) => { exit = exited; throw new Error("startup failed"); });
  const service = new ConversationService(new ConversationStore(dir), async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "s", command: "/fake", env: {} }), opening, () => {});
  await expect(service.start(request)).rejects.toThrow("startup failed");
  await expect(service.start(request)).rejects.toThrow("session_in_use"); expect(opening).toHaveBeenCalledOnce();
  exit(); await expect(service.start(request)).rejects.toThrow("startup failed"); expect(opening).toHaveBeenCalledTimes(2);
});
it("releases preparation failures without spawning and preserves existing history on a refused send", async () => {
  const h = fixture(); h.prepare.mockRejectedValueOnce(new Error("cli_missing")); await expect(h.service.start(request)).rejects.toThrow("cli_missing");
  expect(h.open).not.toHaveBeenCalled(); const first = await h.service.start(request); h.service.receive(first.conversationId, { type: "turn.done" });
  const before = h.store.read(first.conversationId); h.prepare.mockRejectedValueOnce(new Error("session_unavailable"));
  await expect(h.service.send(first.conversationId, "no", [])).rejects.toThrow("session_unavailable"); expect(h.store.read(first.conversationId)).toEqual(before);
});
it("keeps a colliding generated ID unavailable after the original owner exits", async () => {
  const h = fixture(); h.prepare.mockResolvedValue({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} });
  const first = (await h.service.start({ ...request, mode: "new", runtime: "codex" })).conversationId;
  await expect(h.service.start({ ...request, mode: "new", runtime: "codex" })).rejects.toThrow("session_in_use");
  // Deleted, the first conversation no longer holds the session; only the losing process's quarantine does.
  h.service.receive(first, { type: "turn.done" }); h.exits[0]?.(); h.service.delete(first);
  h.prepare.mockResolvedValue({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "new-session", command: "/fake", env: {} });
  await expect(h.service.start(request)).rejects.toThrow("session_in_use");
  h.exits[1]?.(); await h.service.start(request);
});
it("initiates cleanup while an opener is still awaiting its protocol handshake", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir); const stop = vi.fn(async () => {}); let release = () => {};
  const opening: OpenRunner = async (_input, _emit, _exited, registerStop) => {
    registerStop(stop); await new Promise<void>(resolve => { release = resolve; });
    return { sessionId: "s", send: async () => {}, stop, close: stop, answer: () => false };
  };
  const service = new ConversationService(new ConversationStore(dir), async () => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "s", command: "/fake", env: {} }), opening, () => {});
  const pending = service.start(request); await vi.waitFor(() => expect(release.name).not.toBe("release"));
  await service.quit(); expect(stop).toHaveBeenCalledOnce(); release(); await expect(pending).rejects.toThrow("busy");
});

it("lets a send prepared while another conversation starts on the same canvas run, and leaves that start alone", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  let release = () => {};
  h.prepare.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }); }));
  const pending = h.service.send(id, "late", []);
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  const other = (await h.service.start(request)).conversationId;
  release(); await pending;
  expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done", "user.message", "turn.started"]);
  expect(h.store.read(other).map(e => e.type)).toEqual(["user.message", "turn.started"]);
  expect(h.runners[0]?.send).toHaveBeenCalledTimes(2); expect(h.runners[0]?.close).not.toHaveBeenCalled();
  expect(h.store.list().map(m => m.conversationId).sort()).toEqual([id, other].sort());
});

it.each(["new-log", "index", "prompt"])("leaves the canvas's earlier conversation and its history as they were when another start there fails at %s", async boundary => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); const before = h.store.read(id); const index = h.store.list();
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  if (boundary === "new-log") {
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (cid !== id && body.type === "turn.started") throw new Error("injected");
      return append(cid, turn, body);
    });
  }
  if (boundary === "index") vi.spyOn(h.store, "save").mockImplementationOnce(() => { throw new Error("injected"); });
  await expect(h.service.start({ ...request, text: boundary === "prompt" ? "{{1}}" : request.text })).rejects.toThrow();
  expect(h.store.list()).toEqual(index);
  const restarted = new ConversationStore(paths.at(-1)!); expect(restarted.list()).toEqual(index);
  expect(restarted.read(id)).toEqual(before);
  expect(h.runners[0]?.close).not.toHaveBeenCalled();
});
it("starts a conversation on a canvas whose other conversation's history cannot be read, and leaves that history as it was", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  const log = join(paths.at(-1)!, "conversations", id + ".jsonl");
  writeFileSync(log, "corrupt\n");
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  const next = (await h.service.start(request)).conversationId;
  expect(h.store.list().map(m => m.conversationId).sort()).toEqual([id, next].sort());
  expect(readFileSync(log, "utf8")).toBe("corrupt\n");
});

it("refreshes a moved stable canvas before preparation and send acceptance", async () => {
  const h = fixture(); let listed = { id: "a", path: ".doan/canvases/a.html" };
  const service = new ConversationService(h.store, h.prepare, h.open, () => {}, (_root, canvas) => {
    if (!canvas || canvas.id !== listed.id) throw new Error("canvas_not_found");
    return listed;
  });
  const id = (await service.start({ ...request, canvas: listed })).conversationId;
  service.receive(id, { type: "turn.done" }); listed = { ...listed, path: ".doan/canvases/moved.html" };
  await service.send(id, "continue", []);
  expect(h.prepare.mock.calls.at(-1)?.[0].canvas).toEqual(listed);
  expect(h.store.list()[0]?.canvas).toEqual(listed);
  expect(h.runners[0]?.send).toHaveBeenLastCalledWith(expect.stringContaining(".doan/canvases/moved.html"), expect.any(String), undefined, { permissionMode: "default" });
});

it("resolves unique stable IDs and refuses missing, changed or ambiguous bindings", () => {
  const original = { id: "a", path: ".doan/canvases/a.html" };
  expect(resolveListedCanvas(original, [{ id: "a", path: ".doan/canvases/moved.html" }])).toEqual({ id: "a", path: ".doan/canvases/moved.html" });
  for (const rows of [[], [{ id: "b", path: original.path }], [original, { ...original, path: ".doan/canvases/other.html" }]]) expect(() => resolveListedCanvas(original, rows)).toThrow("canvas_not_found");
  expect(resolveListedCanvas({ path: original.path }, [original])).toEqual({ path: original.path });
  expect(() => resolveListedCanvas({ path: original.path }, [{ id: "a", path: ".doan/canvases/moved.html" }])).toThrow("canvas_not_found");
});

it("ignores a previous turn send rejection after the owning Codex runner starts another turn", async () => {
  const h = fixture(); let reject = (_error: Error) => {};
  const runner: Runner = { sessionId: "same-session", send: vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockResolvedValue(undefined), answer: () => false, close: async () => {}, stop: async () => {} };
  const service = new ConversationService(h.store, h.prepare, async () => runner, () => {});
  const id = (await service.start(request)).conversationId; service.receive(id, { type: "turn.done" });
  await service.send(id, "next", []); const before = h.store.read(id);
  reject(new Error("old transport error")); await Promise.resolve();
  expect(h.store.read(id)).toEqual(before);
});

it("runs a send whose runner opened while another conversation started on the same canvas", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); h.exits[0]?.();
  let release = () => {}; const send = vi.fn(async () => {}); const close = vi.fn(async () => {});
  h.open.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { sessionId: "same-session", send, close, stop: close, answer: () => false }; });
  const pending = h.service.send(id, "late opening", []);
  await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  await h.service.start(request);
  release(); await pending;
  expect(send).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); expect(h.store.read(id).at(-1)?.type).toBe("turn.started");
});
it("keeps the canvas's earlier conversation as it was when a new one starts and fails on transport", async () => {
  const h = fixture(); const old = (await h.service.start(request)).conversationId;
  h.service.receive(old, { type: "turn.done" }); const before = h.store.read(old);
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  h.open.mockResolvedValueOnce({ sessionId: "replacement", send: async () => { throw new Error("transport broke"); }, close: async () => {}, stop: async () => {}, answer: () => false });
  const next = (await h.service.start(request)).conversationId;
  expect(h.store.read(old)).toEqual(before); expect(h.runners[0]?.close).not.toHaveBeenCalled();
  expect(h.store.list().map(m => m.conversationId).sort()).toEqual([old, next].sort());
  expect(h.store.read(next).at(-1)?.type).toBe("turn.failed");
});

// Claude spawns one process per turn; its reservation outlives turn.done until that process group is gone.
const claudeTurn = { runtime: "claude" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} };
function perTurn(exitWaitMs?: number) {
  const h = fixture(); h.prepare.mockResolvedValue(claudeTurn);
  const service = new ConversationService(h.store, h.prepare, h.open, () => {}, undefined, exitWaitMs);
  return { ...h, service };
}
it("waits for a finished turn's process to exit, then sends on the same session", async () => {
  const h = perTurn(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  let sent = false; const pending = h.service.send(id, "right after", []).then(() => { sent = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  // No second process while the first one still holds the session.
  expect(sent).toBe(false); expect(h.open).toHaveBeenCalledOnce();
  await expect(h.service.send(id, "twice", [])).rejects.toThrow("busy");
  h.exits[0]!(); await pending;
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.runners[1]?.send).toHaveBeenCalledOnce();
  expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done", "user.message", "turn.started"]);
});
it("refuses at once while a turn is running and after a process that never exits", async () => {
  const h = perTurn(30); const id = (await h.service.start(request)).conversationId;
  await expect(h.service.send(id, "while running", [])).rejects.toThrow("busy");
  h.service.receive(id, { type: "turn.done" }); const before = h.store.read(id);
  await expect(h.service.send(id, "never exits", [])).rejects.toThrow("busy");
  expect(h.open).toHaveBeenCalledOnce(); expect(h.store.read(id)).toEqual(before);
});
it.each(["interrupt", "quit"] as const)("cancels a send waiting for the previous process on %s", async how => {
  const h = perTurn(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); const before = h.store.read(id);
  const pending = h.service.send(id, "cancelled", []);
  await new Promise(resolve => setTimeout(resolve, 0));
  if (how === "interrupt") await h.service.interrupt(id); else await h.service.quit();
  await expect(pending).rejects.toThrow("busy");
  h.exits[0]!(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(h.open).toHaveBeenCalledOnce(); expect(h.store.read(id)).toEqual(before);
});
it("keeps a timed-out wait from orphaning a failed opening's reservation", async () => {
  const h = perTurn(30); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); h.exits[0]!();
  // The next turn's process spawned, then its opening failed; it still holds the session until it exits.
  h.open.mockImplementationOnce(async (_input, _emit, exited, registerStop) => { h.exits.push(exited); registerStop(async () => {}); throw new Error("startup failed"); });
  await expect(h.service.send(id, "fails to open", [])).rejects.toThrow("startup failed");
  await expect(h.service.send(id, "times out", [])).rejects.toThrow("busy");
  h.exits[1]!(); await h.service.send(id, "after exit", []);
  expect(h.open).toHaveBeenCalledTimes(3);
});
it("keeps the Codex server of a canvas's earlier conversation when another one starts there, and reuses it", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  await h.service.start(request);
  expect(h.runners[0]?.close).not.toHaveBeenCalled();
  await h.service.send(id, "again", []);
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.runners[0]?.send).toHaveBeenCalledTimes(2);
});
// One session is one conversation: a terminal session a conversation already holds is not resumed into another, also
// once that conversation's process is gone and its reservation released.
it("refuses with session_in_use a terminal session resume whose session a conversation already holds, and opens nothing", async () => {
  const h = fixture(); const first = (await h.service.start(request)).conversationId;
  h.service.receive(first, { type: "turn.done" }); h.exits[0]!();
  const before = h.store.read(first);
  await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).rejects.toThrow("session_in_use");
  expect(h.open).toHaveBeenCalledOnce();
  expect(h.store.list().map(m => m.conversationId)).toEqual([first]); expect(h.store.read(first)).toEqual(before);
  // The same session under another profile is another session.
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/other-profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} });
  await h.service.start(request);
  expect(h.store.list()).toHaveLength(2);
});
it("refuses a resume whose session a conversation took while it prepared", async () => {
  const h = fixture(); let release = () => {};
  h.prepare.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }); }));
  const pending = h.service.start(request);
  await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledOnce());
  const first = (await h.service.start(request)).conversationId;
  h.service.receive(first, { type: "turn.done" }); h.exits[0]!();
  release();
  await expect(pending).rejects.toThrow("session_in_use");
  expect(h.open).toHaveBeenCalledOnce(); expect(h.store.list().map(m => m.conversationId)).toEqual([first]);
});
it("resumes a deleted conversation's terminal session again", async () => {
  const h = fixture(); const first = (await h.service.start(request)).conversationId;
  h.service.receive(first, { type: "turn.done" }); h.exits[0]!();
  h.service.delete(first);
  const again = (await h.service.start(request)).conversationId;
  expect(h.store.list().map(m => m.conversationId)).toEqual([again]);
});
it("resumes a terminal session on a canvas whose conversation is running, which goes on", async () => {
  const h = fixture(); const running = (await h.service.start(request)).conversationId;
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "terminal-session", command: "/fake", env: {} });
  const resumed = (await h.service.start(request)).conversationId;
  expect(h.runners[0]?.stop).not.toHaveBeenCalled(); expect(h.runners[0]?.close).not.toHaveBeenCalled();
  expect(h.store.read(running).map(e => e.type)).toEqual(["user.message", "turn.started"]);
  expect(h.store.list().find(m => m.conversationId === resumed)?.session.sessionId).toBe("terminal-session");
  h.service.receive(running, { type: "turn.done" });
  expect(h.store.read(running).at(-1)?.type).toBe("turn.done");
});
it("sends the fixed preset guidance on a follow-up turn as on the first", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  await h.service.send(id, "next", []);
  const prompts = h.runners.flatMap(r => vi.mocked(r.send).mock.calls.map(call => call[0]));
  expect(prompts).toHaveLength(2);
  for (const prompt of prompts) expect(prompt).toContain(PRESET_GUIDANCE);
});

// Home starts (newDesign), chosen models, attachments and binding by start-time lists.
// admit: resolve a canvas against the listed rows as main does; files: the queue's attachment hooks.
function homeFixture(canvases: { path: string; id?: string }[] = [], options: { admit?: boolean; files?: QueueFiles; fast?: QueueOptions["fast"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "conn-secret", accountId: "acct-secret", workspaceId: "org-secret", profile: "profile-secret" };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/config-secret", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed = [...canvases];
  const changes: string[] = [];
  const published: ConversationEvent[] = [];
  const admit = (_root: string, canvas?: Canvas) => options.admit && canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const drafts = new DraftStore(join(dir, "conversations"));
  const deleted: string[] = [];
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, 10_000, () => listed, root => changes.push(root), { drafts, ...(options.files ? { files: options.files } : {}), ...(options.fast ? { fast: options.fast } : {}) }, id => deleted.push(id));
  return { dir, service, store, runners, open, prepare, listed, changes, published, owner, drafts, deleted };
}
const homeRequest = { root: "/repo", mode: "newDesign" as const, runtime: "claude" as const, text: "Make a pricing page", anchors: [] };
it("guards a project removal while its unindexed first turn is preparing and excludes a canvas start", async () => {
  const h = homeFixture();
  for (const start of [homeRequest, { ...homeRequest, mode: "new" as const, canvas: { path: ".doan/canvases/probe.html" } }]) {
    let refuse!: (error: Error) => void;
    h.prepare.mockImplementationOnce(() => new Promise((_resolve, reject) => { refuse = reject; }));
    const result = h.service.start(start);
    expect(h.service.list("/repo")).toEqual([]);
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(start === homeRequest);
    expect(h.service.projectRemovalBusy(["/elsewhere"])).toBe(false);
    refuse(new Error("refused")); await expect(result).rejects.toThrow();
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
  }
});

it("a removal waits for a project turn’s actual group exit after a failed write, and a bounded retry never repeats its Stop", async () => {
  vi.useFakeTimers();
  try {
    const h = homeFixture();
    const { conversationId: id } = await h.service.start(homeRequest);
    const turn = h.store.read(id)[0]!.turnId;
    expect(h.service.list("/repo")[0]).toMatchObject({ projectTurnId: turn });
    vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("disk full"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(id, { type: "activity", kind: "read", summary: "Read file" });
    const stop = h.service.interruptProjectTurn(id, turn);
    const timedOut = expect(stop).rejects.toThrow("stop_pending");
    await vi.advanceTimersByTimeAsync(30_000); await timedOut;
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(true);
    const closes = vi.mocked(h.runners[0]!.close).mock.calls.length;
    const again = h.service.interruptProjectTurn(id, turn);
    h.open.mock.calls[0]![2]();
    await vi.advanceTimersByTimeAsync(200); await again;
    expect(h.runners[0]!.close).toHaveBeenCalledTimes(closes);
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("a native start still pending after Stop cannot outlive project removal or stop a replacement turn", async () => {
  vi.useFakeTimers();
  try {
    const h = homeFixture();
    let finish!: () => void;
    const native = new Promise<void>(resolve => { finish = resolve; });
    const runner: Runner = { sessionId: "codex-server", answer: () => false, send: () => native, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    h.open.mockResolvedValueOnce(runner);
    h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} });
    const { conversationId: id } = await h.service.start({ ...homeRequest, runtime: "codex" });
    const turn = h.store.read(id)[0]!.turnId;
    await expect(h.service.interruptProjectTurn(id, "replaced-turn")).rejects.toThrow();
    expect(runner.close).not.toHaveBeenCalled();
    let settled = false;
    const stop = h.service.interruptProjectTurn(id, turn).then(() => { settled = true; });
    // Within the removal's wait for the group (the exit wait).
    await vi.advanceTimersByTimeAsync(9_900);
    expect(settled).toBe(false);
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(true);
    expect(h.service.list("/repo")[0]?.working).toBe(true);
    h.changes.length = 0;
    finish(); h.open.mock.calls[0]![2]();
    expect(h.changes).toContain("/repo");
    expect(h.service.list("/repo")[0]?.working).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await stop;
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
  } finally { vi.useRealTimers(); }
});

it.each(["before", "after"] as const)("closes a starting project runner registered %s removal, once, and waits for its exit", async order => {
  vi.useFakeTimers();
  try {
    const h = homeFixture();
    const { conversationId: id } = await h.service.start(homeRequest);
    h.service.receive(id, { type: "turn.done" });
    h.open.mock.calls[0]![2]();
    await vi.advanceTimersByTimeAsync(11_000);
    const cleanup = vi.fn(async () => {});
    const runner = h.runners[0]!;
    let ready!: () => void;
    h.open.mockImplementationOnce((_input, _emit, _exit, register) => {
      if (order === "before") register(cleanup);
      return new Promise((resolve, reject) => {
        ready = order === "before" ? () => reject(new Error("handshake closed")) : () => resolve(runner);
      });
    });
    const sending = h.service.send(id, "again", []).then(() => "sent", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(0);
    const turn = h.service.list("/repo")[0]!.projectTurnId!;
    const removing = h.service.interruptProjectTurn(id, turn).then(() => "stopped", (error: Error) => error.message);
    if (order === "after") {
      await vi.advanceTimersByTimeAsync(21_000);
      expect(await removing).toBe("stop_pending");
      expect(h.service.projectRemovalBusy(["/repo"])).toBe(true);
      h.open.mock.calls[1]![3](cleanup);
    }
    await vi.advanceTimersByTimeAsync(100);
    const callsBeforeReady = cleanup.mock.calls.length;
    ready();
    expect(await sending).toBe(order === "before" ? "handshake closed" : "busy");
    expect(callsBeforeReady).toBe(1);
    const retry = h.service.interruptProjectTurn(id, turn);
    expect(runner.close).not.toHaveBeenCalled();
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(true);
    h.open.mock.calls[1]![2]();
    await vi.advanceTimersByTimeAsync(200);
    await retry;
    expect(await removing).toBe(order === "before" ? "stopped" : "stop_pending");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("accepts the observed exit of a reused Codex server while an indexed next turn is still preparing", async () => {
  vi.useFakeTimers();
  try {
    const h = homeFixture();
    const prepared = { runtime: "codex" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {} };
    h.prepare.mockResolvedValueOnce(prepared);
    const { conversationId: id } = await h.service.start({ ...homeRequest, runtime: "codex" });
    h.service.receive(id, { type: "turn.done" });
    await vi.advanceTimersByTimeAsync(11_000);
    let admit!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise(resolve => { admit = () => resolve(prepared); }));
    const sending = expect(h.service.send(id, "again", [])).rejects.toThrow("busy");
    const turn = h.service.list("/repo")[0]!.projectTurnId!;
    const stopping = h.service.interruptProjectTurn(id, turn);
    const stopped = expect(stopping).resolves.toBeUndefined();
    h.open.mock.calls[0]![2](); admit();
    await vi.advanceTimersByTimeAsync(200);
    await sending; await stopped;
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("runs a Home start with its chosen model and effort, records them, and applies them again on the next send", async () => {
  const h = homeFixture();
  const id = (await h.service.start({ ...homeRequest, model: "sonnet", effort: "low" })).conversationId;
  expect(h.open.mock.calls[0]![0]).toMatchObject({ model: "sonnet", effort: "low" });
  expect(h.store.list()[0]).toMatchObject({ model: "sonnet", effort: "low" });
  // No canvas list is saved with the turn.
  expect(h.store.list()[0]).not.toHaveProperty("canvasesAtStart");
  h.service.receive(id, { type: "turn.done" });
  // The Claude process of the first turn exits; the send opens a resume.
  h.open.mock.calls[0]![2]();
  await h.service.send(id, "make it darker", []);
  // The send's runner is opened again (a Claude resume) with the stored choice.
  expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ sessionId: "s1", model: "sonnet", effort: "low" });
});
it("leaves model and effort out when none was chosen", async () => {
  const h = homeFixture();
  await h.service.start(homeRequest);
  expect(h.open.mock.calls[0]![0]).not.toHaveProperty("model");
  expect(h.store.list()[0]).not.toHaveProperty("model");
  expect(h.store.list()[0]).not.toHaveProperty("effort");
});
it("adds Home's paragraph to the prompt only, never to user.message or the title, and keeps account fields out", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  const prompt = vi.mocked(h.runners[0]!.send).mock.calls[0]![0];
  expect(prompt).toContain(HOME_GUIDANCE);
  for (const secret of ["conn-secret", "acct-secret", "org-secret", "profile-secret", "/config-secret", '"sessionId"', "s1"]) expect(prompt).not.toContain(secret);
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", text: "Make a pricing page" });
  expect(h.store.list()[0]!.title).toBe("Make a pricing page");
});
it("records attachments on user.message, lists them in the prompt and hands them to the runner, marking them sent first", async () => {
  const h = homeFixture();
  const attachments = [{ name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" }, { name: "b.pdf", size: 9, kind: "file" as const, path: "/Users/me/b.pdf" }];
  let indexed: number | undefined;
  const id = (await h.service.start({ ...homeRequest, attachments }, { recheck: () => attachments, sent: () => { indexed = h.store.list().length; } })).conversationId;
  expect(indexed).toBe(0);
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", attachments });
  const [prompt, , sent] = vi.mocked(h.runners[0]!.send).mock.calls[0]!;
  expect(JSON.parse(prompt.split("\n\n")[1]!).attachments).toEqual(attachments.map(a => ({ name: a.name, kind: a.kind, path: a.path })));
  expect(sent).toEqual(attachments);
});
it("does not mark attachments sent for a start refused before acceptance", async () => {
  const h = homeFixture(); h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
  const attached = { recheck: vi.fn(() => []), sent: vi.fn() };
  await expect(h.service.start({ ...homeRequest, attachments: [{ name: "a", size: 1, kind: "file", path: "/a" }] }, attached)).rejects.toThrow("not_logged_in");
  expect(attached.recheck).not.toHaveBeenCalled(); expect(attached.sent).not.toHaveBeenCalled();
});

// Model-list reads are owned runs (quit and sign-out stop them; the lease goes with the group).
function listingFixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const release = vi.fn(async () => {});
  let gate: Promise<void> = Promise.resolve();
  const prepare = vi.fn<Prepare>(async request => { await gate; return { runtime: request.runtime!, configDir: "/p", cwd: "/repo", command: "/fake", env: {}, release }; });
  const service = new ConversationService(new ConversationStore(dir), prepare, vi.fn(), () => {});
  return { service, release, prepare, holdPrepare: () => { let open!: () => void; gate = new Promise(resolve => { open = resolve; }); return open; } };
}
it.each(["quit", "stopRuns"] as const)("stops a model-list read on %s during its handshake and frees the lease once the group is gone", async how => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "cursor");
  let exited!: () => void; const stop = vi.fn(async () => {});
  const reading = h.service.readListing(input, async (_input, gone, registerStop) => {
    exited = gone; registerStop(stop);
    await new Promise((_resolve, reject) => { stop.mockImplementation(async () => { reject(new Error("process_exited")); }); });
    return { models: [] };
  });
  await vi.waitFor(() => expect(exited).toBeDefined());
  await (how === "quit" ? h.service.quit() : h.service.stopRuns("cursor"));
  expect(stop).toHaveBeenCalledOnce();
  await expect(reading).rejects.toThrow("process_exited");
  // A stop request is not disappearance: the lease stays until the group is gone.
  expect(h.release).not.toHaveBeenCalled();
  exited(); await vi.waitFor(() => expect(h.release).toHaveBeenCalledOnce());
});
it("prepares a model-list read as a listing, not a conversation run, so a sign-out does not ask to stop it", async () => {
  const h = listingFixture();
  await h.service.prepareListing("/repo", "cursor");
  expect(h.prepare).toHaveBeenCalledWith(expect.objectContaining({ runtime: "cursor" }), undefined, "listing");
});
it("keeps a model-list read of another provider running on a sign-out", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "cursor");
  const stop = vi.fn(async () => {});
  void h.service.readListing(input, async (_input, _gone, registerStop) => { registerStop(stop); return new Promise(() => {}); });
  await vi.waitFor(() => expect(h.prepare).toHaveBeenCalled());
  await h.service.stopRuns("codex");
  expect(stop).not.toHaveBeenCalled();
});
it("keeps the lease of a model-list group that never disappears, even after its list came back", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "copilot");
  expect(await h.service.readListing(input, async (_input, _gone, registerStop) => { registerStop(async () => {}); return { models: [{ id: "auto", label: "Auto", default: true }] }; })).toEqual({ models: [{ id: "auto", label: "Auto", default: true }] });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(h.release).not.toHaveBeenCalled();
});
it("stops a model-list process that spawns after its provider was stopped", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "cursor");
  let spawn!: () => void; const stop = vi.fn(async () => {});
  const reading = h.service.readListing(input, async (_input, _gone, registerStop) => { await new Promise<void>(resolve => { spawn = resolve; }); registerStop(stop); return { models: [] }; });
  await vi.waitFor(() => expect(spawn).toBeDefined());
  await h.service.stopRuns("cursor");
  spawn(); await reading;
  expect(stop).toHaveBeenCalledOnce();
});
it("refuses a model-list read stopped during its preparation and frees the lease without spawning", async () => {
  const h = listingFixture(); const open = h.holdPrepare();
  const preparing = h.service.prepareListing("/repo", "cursor");
  await vi.waitFor(() => expect(h.prepare).toHaveBeenCalled());
  await h.service.stopRuns("cursor"); open();
  await expect(preparing).rejects.toThrow("busy");
  await vi.waitFor(() => expect(h.release).toHaveBeenCalledOnce());
  await h.service.quit();
  await expect(h.service.prepareListing("/repo", "cursor")).rejects.toThrow("busy");
});
it("frees the lease at once when a model-list read fails before anything spawned", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "claude");
  await expect(h.service.readListing(input, async () => { throw new Error("not_logged_in"); })).rejects.toThrow("not_logged_in");
  await vi.waitFor(() => expect(h.release).toHaveBeenCalledOnce());
});

// A project skill read takes the model list's lease path (POSTMORTEM 2026-10-28, 2026-10-30).
it("prepares a project skill read as a listing that stopRuns stops, and a send after the previous run's exit is not refused while it reads", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  const stop = vi.fn(async () => {});
  const skills = new SkillCatalog((root, provider) => h.service.prepareListing(root, provider), input => h.service.readListing(input, async (_input, _gone, registerStop) => { registerStop(stop); return new Promise(() => {}); }));
  void skills.skills("/repo", "claude");
  await vi.waitFor(() => expect(h.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ root: "/repo", runtime: "claude" }), undefined, "listing"));
  // The first run's process is gone; the listing's process, still reading, holds no conversation reservation.
  h.open.mock.calls[0]![2]();
  await expect(h.service.send(id, "next", [])).resolves.toBeUndefined();
  expect(h.open).toHaveBeenCalledTimes(2);
  await h.service.stopRuns("claude");
  expect(stop).toHaveBeenCalledOnce();
});

// Home's paragraph follows the conversation's origin: a Home conversation never moves to a canvas, so every turn has it;
// one an earlier build promoted to a canvas works on that canvas and has none.
it("keeps Home's paragraph on every turn of a Home conversation, also after a turn drew a canvas, and drops it for an earlier build's promoted one", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  expect(h.store.list()[0]).toMatchObject({ fromHome: true });
  h.listed.push({ path: ".doan/canvases/made.html" });
  h.service.receive(id, { type: "activity", kind: "edit", summary: "Edit made.html", path: "/repo/.doan/canvases/made.html" });
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
  h.service.refreshed("/repo");
  await h.service.send(id, "make it darker", []);
  expect(h.store.list()[0]).not.toHaveProperty("canvas");
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).toContain(HOME_GUIDANCE);
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
  h.store.save(h.store.list().map(m => ({ ...m, canvas: { path: ".doan/canvases/made.html" } })));
  await h.service.send(id, "and a footer", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
});
it("never adds Home's paragraph to an entry without the Home mark", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.store.save(h.store.list().map(m => { const { fromHome: _mark, ...old } = m; return old; }));
  expect(h.store.list()[0]).not.toHaveProperty("fromHome");
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2](); h.service.refreshed("/repo");
  await h.service.send(id, "again", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
  // An entry written before the mark existed (a Home start of an earlier build) reads and gets no paragraph.
  h.service.receive(id, { type: "turn.done" });
  const second = (await h.service.start(homeRequest)).conversationId;
  h.store.save(h.store.list().map(m => { if (m.conversationId !== second) return m; const { fromHome: _mark, ...old } = m; return old; }));
  h.service.receive(second, { type: "turn.done" }); h.open.mock.calls.at(-1)![2](); h.service.refreshed("/repo");
  await h.service.send(second, "again", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
});

// The project's conversation list and the seen marker.
describe("conversation list", () => {
  const legacyEntry = (id: string) => ({ conversationId: id, root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: id, owner: { kind: "legacy-external" as const },
    session: { runtime: "codex" as const, origin: "resumed" as const, sessionId: id, configDir: "/home/.codex", cwd: "/repo" } });
  it("lists a root's conversations as summaries and nothing for a root without any", async () => {
    const h = homeFixture();
    expect(h.service.list("/repo")).toEqual([]);
    const id = (await h.service.start(homeRequest)).conversationId;
    expect(h.service.list("/repo")).toEqual([expect.objectContaining({ conversationId: id, phase: "running", owner: "doan", provider: "claude", fromHome: true, unseen: false, queued: 0 })]);
    expect(h.service.list("/other")).toEqual([]);
  });
  it("starts a new conversation at seenSeq 0, so its end is unseen until marked, and marks only forward up to the last seq", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    expect(h.store.list()[0]!.seenSeq).toBe(0);
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.list("/repo")[0]).toMatchObject({ phase: "ended", unseen: true });
    h.service.markSeen(id, 99);
    expect(h.store.list()[0]!.seenSeq).toBe(3);
    h.service.markSeen(id, 1);
    expect(h.store.list()[0]!.seenSeq).toBe(3);
    expect(h.service.list("/repo")[0]!.unseen).toBe(false);
    expect(() => h.service.markSeen("missing", 1)).toThrow("not_found");
  });
  it("counts an entry without seenSeq as seen until its next turn, whose end then counts", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.store.save(h.store.list().map(m => { const { seenSeq: _seen, ...old } = m; return old; }));
    expect(h.service.list("/repo")[0]!.unseen).toBe(false);
    h.service.markSeen(id, 1);
    expect(h.store.list()[0]!.seenSeq).toBe(3);
    h.store.save(h.store.list().map(m => { const { seenSeq: _seen, ...old } = m; return old; }));
    await h.service.send(id, "again", []);
    expect(h.store.list()[0]!.seenSeq).toBe(3);
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.list("/repo")[0]!.unseen).toBe(true);
  });
  it("still folds a turn a previous run left unfinished after a send in this run was refused", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => []);
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(restarted.send(id, "again", [])).rejects.toThrow("not_logged_in");
    expect(restarted.list("/repo")[0]).toMatchObject({ phase: "ended", unseen: true });
    expect(restarted.read(id).turn).toBe("interrupted");
  });
  it("returns a read error for one unreadable history and keeps a legacy external conversation in the list", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.store.save([...h.store.list(), legacyEntry("legacy"), legacyEntry("broken")]);
    h.store.append("legacy", "t", { type: "turn.started" }); h.store.append("legacy", "t", { type: "turn.done" });
    writeFileSync(join(h.dir, "conversations", "broken.jsonl"), "{not json\n");
    const listed = h.service.list("/repo");
    expect(listed.map(s => [s.conversationId, s.readError ?? false, s.owner])).toEqual([[id, false, "doan"], ["legacy", false, "legacy-external"], ["broken", true, "legacy-external"]]);
  });
  it("ends a turn whose terminal event was saved even when the list change cannot be announced", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    const list = h.store.list.bind(h.store);
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementationOnce((...args) => { const saved = append(...args); vi.spyOn(h.store, "list").mockImplementationOnce(() => { throw new Error("Invalid conversation index"); }); return saved; });
    h.service.receive(id, { type: "turn.done" });
    vi.mocked(h.store.list).mockImplementation(list);
    expect(h.service.read(id).turn).toBe("idle");
    h.open.mock.calls[0]![2]();
    await h.service.send(id, "again", []);
  });
  it("announces a list change after the write it reports, and none for streamed text", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    expect(h.changes).toContain("/repo");
    h.changes.length = 0;
    h.service.receive(id, { type: "message.delta", messageId: "m", text: "Hi" });
    expect(h.changes).toEqual([]);
    h.service.receive(id, { type: "turn.done" });
    expect(h.changes).toEqual(["/repo"]);
    expect(h.service.list("/repo")[0]!.unseen).toBe(true);
    const observed: unknown[] = [];
    const service: ConversationService = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => [], root => observed.push(service.list(root)[0]?.unseen));
    service.markSeen(id, 99);
    expect(observed).toEqual([false]);
  });
});

// Project conversations of one root run side by side, as a canvas's conversations do.
describe("project conversations of one root", () => {
  it("starts another while one is still preparing, runs or just ended, and sends to each", async () => {
    const h = homeFixture(); let open!: () => void;
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { open = resolve; }); return prepared(...args); });
    const first = h.service.start(homeRequest);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledOnce());
    const b = (await h.service.start(homeRequest)).conversationId;
    open(); const a = (await first).conversationId;
    h.service.receive(a, { type: "turn.done" });
    const c = (await h.service.start(homeRequest)).conversationId;
    // b opened first, while a still prepared: a's exit is its own runner's.
    h.open.mock.calls.find(call => call[0].env.DOAN_CONVERSATION_ID === a)![2]();
    await h.service.send(a, "again", []);
    expect(h.service.list("/repo").filter(row => row.working).map(row => row.conversationId).sort()).toEqual([a, b, c].sort());
  });
  it("sends an ended turn's queue while another project conversation of the root runs", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    await h.service.start(homeRequest);
    h.service.queue(a, { text: "next", anchors: [] });
    h.service.receive(a, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.store.read(a).filter(e => e.type === "user.message")).toHaveLength(2));
    expect(h.service.takeDraft(a)).toBeNull();
  });
  it("folds a turn whose history stopped taking writes as ended once its process is gone, and announces it", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, { type: "permission.request", requestId: "r", tool: "Write", summary: "Write a.html", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    expect(h.service.list("/repo")[0]!.phase).toBe("waiting");
    vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
    h.changes.length = 0;
    h.service.receive(a, { type: "activity", kind: "read", summary: "Read a.html" });
    expect(h.changes).toEqual(["/repo"]);
    h.changes.length = 0;
    h.open.mock.calls[0]![2]();
    expect(h.changes).toEqual(["/repo"]);
    expect(h.service.list("/repo")[0]).toMatchObject({ phase: "ended", unseen: true });
    const read = h.service.read(a);
    expect(read.turn).toBe("interrupted"); expect(read).not.toHaveProperty("pendingPermission");
  });
});

// A send carries attachments, model and effort.
describe("send extras", () => {
  const attachments = [{ name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" }];
  async function finished(h: ReturnType<typeof homeFixture>, request: Parameters<ConversationService["start"]>[0] = { ...homeRequest, model: "sonnet", effort: "low" }) {
    const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    return id;
  }
  it("saves the new model and effort before the turn's events and opens the run with them", async () => {
    const h = homeFixture(); const id = await finished(h);
    // The message goes out with its turn.started in one write.
    const appendAll = h.store.appendAll.bind(h.store); const atMessage: unknown[] = [];
    vi.spyOn(h.store, "appendAll").mockImplementation((...args) => { if (args[2].some(body => body.type === "user.message")) atMessage.push(h.store.list()[0]!.model); return appendAll(...args); });
    await h.service.send(id, "again", [], { model: "opus", effort: "high" });
    expect(atMessage).toEqual(["opus"]);
    expect(h.store.list()[0]).toMatchObject({ model: "opus", effort: "high" });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ model: "opus", effort: "high" });
    expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![3]).toEqual({ model: "opus", effort: "high", permissionMode: "default" });
  });
  it("drops the old effort when a model comes without one, and keeps the stored choice when nothing changed", async () => {
    const h = homeFixture(); const id = await finished(h);
    await h.service.send(id, "again", [], { model: "haiku" });
    expect(h.store.list()[0]!.model).toBe("haiku"); expect(h.store.list()[0]).not.toHaveProperty("effort");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    await h.service.send(id, "more", []);
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ model: "haiku" }); expect(h.open.mock.calls.at(-1)![0]).not.toHaveProperty("effort");
  });
  it("records attachments on the send's user.message and in the prompt, marking them sent before acceptance", async () => {
    const h = homeFixture(); const id = await finished(h);
    let messages: number | undefined;
    await h.service.send(id, "look", [], { attachments }, { recheck: () => attachments, sent: () => { messages = h.store.read(id).filter(e => e.type === "user.message").length; } });
    expect(messages).toBe(1);
    expect(h.store.read(id).filter(e => e.type === "user.message").at(-1)).toMatchObject({ text: "look", attachments });
    const [prompt, , sent] = vi.mocked(h.runners.at(-1)!.send).mock.calls[0]!;
    expect(JSON.parse(prompt.split("\n\n")[1]!).attachments).toEqual([{ name: "a.png", kind: "image", path: "/Users/me/a.png" }]);
    expect(sent).toEqual(attachments);
  });
  it("leaves the index and history alone when an attachment went missing before acceptance", async () => {
    const h = homeFixture(); const id = await finished(h);
    const before = h.store.read(id), sent = vi.fn();
    const recheck = () => { throw Object.assign(new Error("attachment_missing"), { missing: ["a"] }); };
    await expect(h.service.send(id, "look", [], { model: "opus", attachments }, { recheck, sent })).rejects.toThrow("attachment_missing");
    expect(h.store.list()[0]!.model).toBe("sonnet"); expect(h.store.read(id)).toEqual(before); expect(sent).not.toHaveBeenCalled();
  });
  it("waits for the previous process before a send with extras, then applies them (POSTMORTEM 2026-10-28)", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, model: "sonnet" })).conversationId;
    h.service.receive(id, { type: "turn.done" });
    const attached = { recheck: vi.fn(() => attachments), sent: vi.fn() };
    const sending = h.service.send(id, "again", [], { model: "opus", attachments }, attached);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(attached.sent).not.toHaveBeenCalled();
    h.open.mock.calls[0]![2](); await sending;
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ model: "opus" }); expect(attached.sent).toHaveBeenCalledOnce();
  });
  it("does not mark attachments sent when a sign-out cancels the exit wait", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, model: "sonnet" })).conversationId;
    h.service.receive(id, { type: "turn.done" });
    const attached = { recheck: vi.fn(() => attachments), sent: vi.fn() };
    const sending = h.service.send(id, "again", [], { model: "opus", attachments }, attached);
    await new Promise(resolve => setTimeout(resolve, 10));
    await h.service.stopRuns("claude");
    await expect(sending).rejects.toThrow("busy");
    expect(attached.sent).not.toHaveBeenCalled(); expect(h.store.list()[0]!.model).toBe("sonnet");
  });
  it("passes the turn's model and effort to a reused Codex server", async () => {
    const h = homeFixture();
    const codex = { ...h.owner, provider: "codex" as const };
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "codex", configDir: "/config", cwd: "/repo", command: "/fake", env: {}, owner: codex, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const id = (await h.service.start({ ...homeRequest, runtime: "codex", model: "gpt-6-luna" })).conversationId;
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "again", [], { model: "gpt-6-sol", effort: "low" });
    expect(h.open).toHaveBeenCalledOnce();
    expect(vi.mocked(h.runners[0]!.send).mock.calls[1]![3]).toEqual({ model: "gpt-6-sol", effort: "low", permissionMode: "default" });
  });
  it("tells the runner the model's default effort for a turn whose choice has none, without storing it", async () => {
    const h = homeFixture(); const id = await finished(h);
    await h.service.send(id, "again", [], { model: "opus", defaultEffort: "medium" });
    expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![3]).toEqual({ model: "opus", effort: "medium", permissionMode: "default" });
    expect(h.store.list()[0]!.model).toBe("opus"); expect(h.store.list()[0]).not.toHaveProperty("effort");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    await h.service.send(id, "more", [], { model: "opus", effort: "high", defaultEffort: "medium" });
    expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![3]).toEqual({ model: "opus", effort: "high", permissionMode: "default" });
  });

});

// Several conversations of one canvas run side by side: none is archived or stopped by another.
describe("concurrent conversations on one canvas", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const types = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).map(e => e.type);
  it("starts B while A works, and both turns run to their end", async () => {
    const h = homeFixture([a], { admit: true });
    const first = (await h.service.start(canvasStart)).conversationId;
    const second = (await h.service.start({ ...canvasStart, text: "another idea" })).conversationId;
    expect(h.runners[0]!.stop).not.toHaveBeenCalled(); expect(h.runners[0]!.close).not.toHaveBeenCalled();
    expect(h.service.list("/repo").map(c => [c.conversationId, c.working, c.phase])).toEqual(expect.arrayContaining([[first, true, "running"], [second, true, "running"]]));
    h.service.receive(second, { type: "turn.done" }); h.service.receive(first, { type: "turn.done" });
    expect(types(h, first)).toEqual(["user.message", "turn.started", "turn.done"]);
    expect(types(h, second)).toEqual(["user.message", "turn.started", "turn.done"]);
    expect(h.published.map(e => e.type)).not.toContain("conversation.archived");
  });
  it("runs a send to the canvas's earlier conversation on its own session and touches no other conversation", async () => {
    const h = homeFixture([a], { admit: true });
    const old = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(old, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const other = (await h.service.start(canvasStart)).conversationId;
    const before = h.store.read(other);
    await h.service.send(old, "back to this one", []);
    expect(types(h, old).slice(-2)).toEqual(["user.message", "turn.started"]);
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ sessionId: "s1" });
    expect(h.store.read(other)).toEqual(before); expect(h.runners[1]!.stop).not.toHaveBeenCalled();
  });
  it("sends to a canvas conversation while another one there is working", async () => {
    const h = homeFixture([a], { admit: true });
    const old = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(old, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const working = (await h.service.start(canvasStart)).conversationId;
    await h.service.send(old, "meanwhile", []);
    expect(types(h, old).slice(-2)).toEqual(["user.message", "turn.started"]);
    expect(types(h, working)).toEqual(["user.message", "turn.started"]);
  });
  it("deleting one conversation leaves the canvas's other running turn alone", async () => {
    const h = homeFixture([a], { admit: true });
    const running = (await h.service.start(canvasStart)).conversationId;
    const idle = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(idle, { type: "turn.done" });
    h.service.delete(idle);
    expect(h.runners[0]!.stop).not.toHaveBeenCalled(); expect(h.runners[0]!.close).not.toHaveBeenCalled();
    expect(h.service.list("/repo").map(c => c.conversationId)).toEqual([running]);
    h.service.receive(running, { type: "turn.done" });
    expect(types(h, running)).toEqual(["user.message", "turn.started", "turn.done"]);
  });
  it("counts every running turn of the canvas for an update restart, and a sign-out stops all of them", async () => {
    const h = homeFixture([a], { admit: true });
    const first = (await h.service.start(canvasStart)).conversationId;
    const second = (await h.service.start(canvasStart)).conversationId;
    expect(h.service.restartHolds().liveTurns).toBe(2);
    await h.service.stopRuns("claude");
    for (const id of [first, second]) expect(h.store.read(id).at(-1)).toMatchObject({ type: "interrupted", reason: "user" });
    expect(h.runners[0]!.close).toHaveBeenCalled(); expect(h.runners[1]!.close).toHaveBeenCalled();
  });
  it("a quit stops every running turn of the canvas", async () => {
    const h = homeFixture([a], { admit: true });
    const first = (await h.service.start(canvasStart)).conversationId;
    const second = (await h.service.start(canvasStart)).conversationId;
    await h.service.quit();
    for (const id of [first, second]) expect(h.store.read(id).at(-1)).toMatchObject({ type: "interrupted", reason: "appQuit" });
  });
});

// Messages sent while a turn works wait in main and go out together after it.
describe("queue", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const anchor = { element: { selector: "#hero" } };
  const file = (n: number) => ({ name: `f${n}.png`, size: 1, kind: "image" as const, path: `/Users/me/f${n}.png` });
  const userMessages = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).filter(e => e.type === "user.message");
  it("sends queued messages as one message after turn.done, once the previous process is gone (POSTMORTEM 2026-10-28)", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.changes.length = 0;
    const first = h.service.queue(id, { text: "one {{1}}", anchors: [anchor] });
    h.service.queue(id, { text: "two {{1}}", anchors: [anchor] });
    expect(first.itemId).toEqual(expect.any(String));
    expect(h.changes).toContain("/repo");
    expect(h.service.list("/repo")[0]!.queued).toBe(2);
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "one {{1}}\n\ntwo {{2}}", anchors: [anchor, anchor] });
    expect(h.service.list("/repo")[0]!.queued).toBe(0);
  });
  it("refuses to queue for a conversation that is not working and an unknown one", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(() => h.service.queue(id, { text: "late", anchors: [] })).toThrow("not_running");
    expect(() => h.service.queue("33333333-3333-4333-8333-333333333333", { text: "x", anchors: [] })).toThrow("not_found");
  });
  it("removes a queued message by its id and answers stale for one already gone", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    const first = h.service.queue(id, { text: "one", anchors: [] }); h.service.queue(id, { text: "two", anchors: [] });
    h.service.removeQueued(id, first.itemId);
    expect(() => h.service.removeQueued(id, first.itemId)).toThrow("stale");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "two" });
  });
  it.each([
    ["fails", { type: "turn.failed" as const, code: "rate_limited" as const }, "turn_failed"],
    ["is stopped", { type: "interrupted" as const, reason: "user" as const }, "interrupted"],
  ])("hands the queue back as one draft when the turn %s, once, and sends nothing", async (_how, end, reason) => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] }); h.service.queue(id, { text: "two", anchors: [] });
    h.changes.length = 0;
    h.service.receive(id, end);
    expect(h.changes).toContain("/repo");
    expect(h.service.list("/repo")[0]).toMatchObject({ queued: 0, returnedDraft: true });
    expect(h.service.takeDraft(id)).toEqual({ text: "one\n\ntwo", anchors: [], attachments: [], reason });
    expect(h.service.takeDraft(id)).toBeNull();
    expect(h.service.list("/repo")[0]).not.toHaveProperty("returnedDraft");
    h.open.mock.calls[0]![2](); await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
  });
  it("hands the queue back when its provider signs out during the turn", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    await h.service.stopRuns("claude");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one", reason: "interrupted" });
  });
  it("refuses, when it is queued, a message that would take the queue past ten attachments", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    const six = (from: number) => Array.from({ length: 6 }, (_, i) => file(from + i));
    h.service.queue(id, { text: "one", anchors: [], attachments: six(0), ids: six(0).map(f => f.name) });
    expect(() => h.service.queue(id, { text: "two", anchors: [], attachments: six(6), ids: six(6).map(f => f.name) })).toThrow("queue_limit");
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
  });
  it("hands the queue back with attachment_missing when a queued file went away, and sends the files that remain otherwise", async () => {
    let gone = true;
    const files: QueueFiles = {
      reclaim: vi.fn(() => { if (gone) throw Object.assign(new Error("attachment_missing"), { missing: ["f0"] }); return { recheck: () => [file(0)], sent: vi.fn() }; }),
      consume: vi.fn(),
    };
    const h = homeFixture([], { files });
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "look", anchors: [], attachments: [file(0)], ids: ["f0"] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.service.takeDraft(id)).toMatchObject({ text: "look", attachments: [file(0)], reason: "attachment_missing" }));
    gone = false;
    await h.service.send(id, "again", []);
    h.service.queue(id, { text: "look", anchors: [], attachments: [file(0)], ids: ["f0"] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(3));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "look", attachments: [file(0)] });
    expect(files.consume).toHaveBeenCalledWith(["f0"]);
  });
  it("hands the queue back with the send's code when the queued send is refused", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.service.takeDraft(id)).toMatchObject({ text: "one", reason: "not_logged_in" }));
  });
  it("keeps queued messages across a reload and returns them as a draft after a restart", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => [], () => {}, { drafts: new DraftStore(join(h.dir, "conversations")) });
    expect(restarted.list("/repo")[0]).toMatchObject({ queued: 0, returnedDraft: true });
    expect(restarted.takeDraft(id)).toMatchObject({ text: "one", reason: "restarted" });
  });
});

// Refused sends with a queue, crashes and stops while holding.
describe("queue review fixes", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const userMessages = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).filter(e => e.type === "user.message");
  it("hands back what was queued behind a send that was refused before acceptance", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    let refuse!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise((_resolve, reject) => { refuse = () => reject(new Error("not_logged_in")); }));
    const sending = h.service.send(id, "again", []);
    await vi.waitFor(() => expect(refuse).toBeDefined());
    h.service.queue(id, { text: "behind it", anchors: [] });
    refuse(); await expect(sending).rejects.toThrow("not_logged_in");
    expect(h.service.list("/repo")[0]).toMatchObject({ queued: 0, returnedDraft: true });
    expect(h.service.takeDraft(id)).toMatchObject({ text: "behind it", reason: "not_logged_in" });
  });
  it("hands back, in order, the queue and what was queued while its send was refused", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    h.service.queue(id, { text: "two", anchors: [] });
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.service.list("/repo")[0]).toMatchObject({ returnedDraft: true }));
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one\n\ntwo", reason: "not_logged_in" });
    expect(h.service.list("/repo")[0]!.queued).toBe(0);
  });
  it("keeps a queue that is on its way out in drafts.json until its send is accepted", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    // The app dies while the queued send waits for the previous process.
    expect(new DraftStore(join(h.dir, "conversations")).returned(id)).toMatchObject({ text: "one", reason: "restarted" });
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(new DraftStore(join(h.dir, "conversations")).returned(id)).toBeUndefined();
  });
  it("refuses a direct send while the queue is about to go out, so the queued messages keep their place", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.queue(id, { text: "queued first", anchors: [] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await expect(h.service.send(id, "typed after", [])).rejects.toThrow("busy");
    h.service.refreshed("/repo");
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "queued first" });
  });
  it("hands the queue back as interrupted when Stop comes while it waits to go out", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await h.service.interrupt(id);
    expect(h.service.takeDraft(id)).toMatchObject({ text: "next", reason: "interrupted" });
    h.service.refreshed("/repo");
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
    await h.service.start(homeRequest);
  });
  it("lets a removed queued message's attachments go and hands a returned draft's ids over with it", async () => {
    const files = { reclaim: vi.fn(() => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = homeFixture([], { files });
    const id = (await h.service.start(canvasStart)).conversationId;
    const record = { name: "a.png", size: 1, kind: "image" as const, path: "/Users/me/a.png" };
    const folder = { name: "refs", kind: "directory" as const, path: "/Users/me/refs" };
    const removed = h.service.queue(id, { text: "gone", anchors: [], attachments: [record], ids: ["x"] });
    h.service.removeQueued(id, removed.itemId);
    expect(files.discard).toHaveBeenCalledWith(["x"]);
    h.service.queue(id, { text: "kept", anchors: [], attachments: [record, folder], ids: ["y", "z"] });
    h.service.queue(id, { text: "plain", anchors: [] });
    h.service.receive(id, { type: "turn.failed", code: "rate_limited" });
    // Within this run the draft's files keep the identity they were queued with, so a folder replaced since is still
    // refused as replaced when the draft is checked again.
    expect(files.release).not.toHaveBeenCalled();
    expect(h.service.takeDraft(id)).toMatchObject({ attachments: [record, folder], ids: ["y", "z"] });
    expect(files.release).not.toHaveBeenCalled();
  });
  it("releases a returned draft's held ids when its conversation is deleted before the draft is taken", async () => {
    const files = { reclaim: vi.fn(() => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = homeFixture([], { files });
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "kept", anchors: [], attachments: [{ name: "refs", kind: "directory", path: "/Users/me/refs" }], ids: ["y"] });
    h.service.receive(id, { type: "turn.failed", code: "rate_limited" }); h.open.mock.calls[0]![2]();
    h.service.delete(id);
    expect(files.release).toHaveBeenCalledWith(["y"]);
  });
});

// Queue limits, the list's working state, sign-out while held.
describe("queue limits, working state and sign-out while held", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const userMessages = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).filter(e => e.type === "user.message");
  it("refuses a queued message that would make the queue and its returned draft larger than one message", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "x".repeat(20_000), anchors: [] });
    h.service.receive(id, { type: "interrupted", reason: "user" });
    h.open.mock.calls[0]![2]();
    await h.service.send(id, "again", []);
    expect(() => h.service.queue(id, { text: "y".repeat(12_767), anchors: [] })).toThrow("queue_limit");
    expect(h.service.list("/repo")[0]!.queued).toBe(0);
    // Exactly one message's worth, the blank line between them included, is accepted.
    h.service.queue(id, { text: "y".repeat(12_766), anchors: [] });
    h.service.receive(id, { type: "interrupted", reason: "user" });
    expect(h.service.takeDraft(id)!.text).toHaveLength(32_768);
  });
  it("lists a project conversation as working while it prepares, runs and waits for its previous process, and not once its turn ends", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    const working = () => h.service.list("/repo")[0]!.working;
    expect(working()).toBe(true);
    h.changes.length = 0;
    h.service.receive(id, { type: "turn.done" });
    expect(working()).toBe(false); expect(h.changes).toContain("/repo");
    // A send waiting for the previous process works too, and says so.
    h.changes.length = 0;
    const sending = h.service.send(id, "again", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(working()).toBe(true); expect(h.changes).toContain("/repo");
    h.open.mock.calls[0]![2](); await sending;
    expect(working()).toBe(true);
  });
  it("lists a held queue as working while it waits for the previous process, though nothing is queued any more", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(h.service.list("/repo")[0]).toMatchObject({ phase: "ended", queued: 0, working: true });
  });
  it("lists a send refused during preparation as not working and announces it", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    let refuse!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise((_resolve, reject) => { refuse = () => reject(new Error("not_logged_in")); }));
    h.changes.length = 0;
    const sending = h.service.send(id, "again", []);
    await vi.waitFor(() => expect(refuse).toBeDefined());
    expect(h.service.list("/repo")[0]!.working).toBe(true); expect(h.changes).toContain("/repo");
    h.changes.length = 0;
    refuse(); await expect(sending).rejects.toThrow("not_logged_in");
    expect(h.service.list("/repo")[0]!.working).toBe(false); expect(h.changes).toContain("/repo");
  });
  it("hands a queue waiting for the previous process back as interrupted when its provider signs out", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    await h.service.stopRuns("claude");
    await vi.waitFor(() => expect(h.service.list("/repo")[0]).toMatchObject({ returnedDraft: true }));
    expect(h.service.takeDraft(id)).toMatchObject({ text: "next", reason: "interrupted" });
    h.open.mock.calls[0]![2]();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
  });
  it("reports a removal or a handed-over draft that could not be saved, and keeps it", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const write = vi.spyOn(h.drafts as unknown as { write(): void }, "write").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => h.service.removeQueued(id, item.itemId)).toThrow("ENOSPC");
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    h.service.receive(id, { type: "interrupted", reason: "user" });
    write.mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => h.service.takeDraft(id)).toThrow("ENOSPC");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one" });
  });
});

// A cancelled waiting send hands back the queue accepted behind it.
describe("cancelled waits and their queues", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  // A project conversation whose next send waits for its earlier turn's handoff judgement (the canvas is not listed
  // yet), with a message queued behind it.
  async function judgementWait(h: ReturnType<typeof homeFixture>) {
    const id = (await h.service.start(homeRequest)).conversationId;
    expect(h.service.requestHandoff({ root: "/repo", handoff: h.open.mock.calls[0]![0].env.DOAN_HANDOFF!, path: ".doan/canvases/b.html", text: "go on" })).toBeNull();
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    const waiting = h.service.send(id, "next", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    h.service.queue(id, { text: "behind it", anchors: [] });
    return { id, waiting };
  }
  // A canvas conversation whose next send waits for the previous process, with a message queued behind it.
  async function exitWait(h: ReturnType<typeof homeFixture>) {
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" });
    const waiting = h.service.send(id, "next", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    h.service.queue(id, { text: "behind it", anchors: [] });
    return { id, waiting };
  }
  it.each([["judgement", judgementWait], ["previous process", exitWait]] as const)("hands the queue back as interrupted when Stop cancels a send waiting for its %s", async (_name, setup) => {
    const h = homeFixture(); const { id, waiting } = await setup(h);
    await h.service.interrupt(id);
    await expect(waiting).rejects.toThrow("busy");
    expect(h.service.list("/repo")[0]).toMatchObject({ queued: 0, returnedDraft: true, working: expect.any(Boolean) });
    expect(h.service.takeDraft(id)).toMatchObject({ text: "behind it", reason: "interrupted" });
  });
  it.each([["judgement", judgementWait], ["previous process", exitWait]] as const)("hands the queue back as interrupted when a sign-out cancels a send waiting for its %s", async (_name, setup) => {
    const h = homeFixture(); const { id, waiting } = await setup(h);
    await h.service.stopRuns("claude");
    await expect(waiting).rejects.toThrow("busy");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "behind it", reason: "interrupted" });
  });
  // The waiting send's own message comes back too, ahead of the queue that waited behind it.
  // The send is in flight while it waits, so Restart to Update waits for it too.
  it.each([["judgement", judgementWait], ["previous process", exitWait]] as const)("holds Restart to Update while a send waits for its %s", async (_name, setup) => {
    const h = homeFixture(); const { id, waiting } = await setup(h);
    expect(h.service.restartHolds().liveTurns).toBe(1);
    await h.service.interrupt(id);
    await expect(waiting).rejects.toThrow("busy");
    expect(h.service.restartHolds().liveTurns).toBe(0);
  });
  it("keeps the waiting send and its queue on disk for the next start when the app quits during such a wait", async () => {
    const h = homeFixture(); const { id, waiting } = await judgementWait(h);
    await h.service.quit();
    await expect(waiting).rejects.toThrow("busy");
    expect(h.service.takeDraft(id)).toBeNull();
    expect(new DraftStore(join(h.dir, "conversations")).returned(id)).toMatchObject({ text: "next\n\nbehind it", reason: "restarted" });
  });
});


// The title leaves out the fixed request lines; the message keeps them.
it.each([
  ["skill lines and text", "Use the project skill `deploy`.\nUse the project skill `db-migrate`.\n\nrun /db-migrate first, then /deploy to staging", "run /db-migrate first, then /deploy to staging"],
  ["a preset line, a skill line and text", "Use the Doan design preset `polish` (Polish).\nUse the project skill `deploy`.\n\n/deploy the hero", "/deploy the hero"],
  ["a preset line only", "Use the Doan design preset `polish` (Polish).", "Polish"],
  ["no fixed line", "Make a pricing page", "Make a pricing page"],
])("titles a first message with %s without its fixed lines", async (_case, text, title) => {
  const h = fixture();
  const id = (await h.service.start({ root: request.root, mode: "newDesign", runtime: "codex", text, anchors: [] })).conversationId;
  expect(h.store.list()[0]!.title).toBe(title);
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", text });
});
it.each(["new", "newDesign", "resume"] as const)("stores a one-line chip title without changing the %s message", async mode => {
  const h = fixture();
  const anchors = [{ frame: { id: "hero", title: "Hero section" } }];
  const text = "  Update {{1}}\n\n" + "x".repeat(600);
  const id = (await h.service.start({ root: request.root, mode, ...(mode === "newDesign" ? {} : { canvas: request.canvas }), runtime: "codex", text, anchors })).conversationId;
  expect(h.store.list()[0]!.title).toBe(("Update Hero section " + "x".repeat(600)).slice(0, 512));
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", text, anchors });
});

// The chosen mode is stored apart from the model, follows a Claude plan approval and reaches every turn.
describe("permission mode", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  // A Claude canvas conversation whose first turn ended and whose process is gone.
  async function started(h: ReturnType<typeof homeFixture>, extra: Partial<Parameters<ConversationService["start"]>[0]> = {}) {
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, ...extra })).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    return id;
  }
  const lastTurn = (h: ReturnType<typeof homeFixture>) => vi.mocked(h.runners.at(-1)!.send).mock.calls.at(-1)![3];
  it("opens a start with its mode, stores it and carries it into the resume turn's choice", async () => {
    const h = homeFixture();
    const id = await started(h, { model: "sonnet", permissionMode: "plan" });
    expect(h.open.mock.calls[0]![0]).toMatchObject({ model: "sonnet", permissionMode: "plan" });
    expect(h.store.list()[0]).toMatchObject({ model: "sonnet", permissionMode: "plan" });
    expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "plan" });
    await h.service.send(id, "again", []);
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ sessionId: "s1", model: "sonnet", permissionMode: "plan" });
    expect(lastTurn(h)).toEqual({ model: "sonnet", permissionMode: "plan" });
  });
  it("stores a mode-only send's mode and keeps the model, and keeps the mode when only the model changes", async () => {
    const h = homeFixture();
    const id = await started(h, { model: "sonnet", effort: "low" });
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    await h.service.send(id, "again", [], { permissionMode: "bypass" });
    expect(h.store.list()[0]).toMatchObject({ model: "sonnet", effort: "low", permissionMode: "bypass" });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ model: "sonnet", effort: "low", permissionMode: "bypass" });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    await h.service.send(id, "more", [], { model: "opus" });
    expect(h.store.list()[0]).toMatchObject({ model: "opus", permissionMode: "bypass" });
  });
  it("deletes the stored mode on a Default send and still names Default to the turn", async () => {
    const h = homeFixture();
    const id = await started(h, { permissionMode: "acceptEdits" });
    await h.service.send(id, "again", [], { permissionMode: "default" });
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.open.mock.calls.at(-1)![0]).not.toHaveProperty("permissionMode");
    expect(lastTurn(h)).toEqual({ permissionMode: "default" });
  });
  it("names Default to a reused Codex server's turn, so an earlier override does not stay", async () => {
    const h = homeFixture();
    const codex = { ...h.owner, provider: "codex" as const };
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "codex", configDir: "/config", cwd: "/repo", command: "/fake", env: {}, owner: codex, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, runtime: "codex", permissionMode: "bypass" })).conversationId;
    expect(h.open.mock.calls[0]![0]).toMatchObject({ permissionMode: "bypass" });
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "again", [], { permissionMode: "default" });
    expect(h.open).toHaveBeenCalledOnce();
    expect(vi.mocked(h.runners[0]!.send).mock.calls[1]![3]).toEqual({ permissionMode: "default" });
  });
  // A picker change without a send is stored at once, and a queue goes out in
  // the mode stored when it is flushed, not the one its messages were queued under.
  it("stores a picker change without a send, deletes the key for Default and announces only a change", async () => {
    const h = homeFixture();
    const id = await started(h, { model: "sonnet" });
    h.changes.length = 0;
    h.service.setPermissionMode(id, "plan");
    expect(h.store.list()[0]).toMatchObject({ model: "sonnet", permissionMode: "plan" });
    expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "plan" });
    expect(h.changes).toEqual(["/repo"]);
    h.changes.length = 0; h.service.setPermissionMode(id, "plan");
    expect(h.changes).toEqual([]);
    h.service.setPermissionMode(id, "default");
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.changes).toEqual(["/repo"]);
    expect(() => h.service.setPermissionMode("missing", "plan")).toThrow("not_found");
    // The next send without a mode opens in the stored one.
    h.service.setPermissionMode(id, "acceptEdits");
    await h.service.send(id, "again", []);
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ permissionMode: "acceptEdits" });
  });
  it("sends a queue in the mode stored when it is flushed", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "bypass" })).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    // Changed while the turn runs: the running turn keeps bypass, the queue goes out in Plan.
    h.service.setPermissionMode(id, "plan");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.open.mock.calls[1]![0]).toMatchObject({ permissionMode: "plan" });
    expect(lastTurn(h)).toEqual({ permissionMode: "plan" });
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "plan" });
  });
  it("keeps a picker change made while a send was being prepared", async () => {
    const h = homeFixture();
    const id = await started(h);
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const prepare = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (request, stored) => { await gate; return prepare(request, stored); });
    const sending = h.service.send(id, "again", [], { permissionMode: "acceptEdits" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    h.service.setPermissionMode(id, "plan");
    resume(); await sending;
    // The turn runs in the mode it was sent with; the conversation keeps the later pick for the next one.
    expect(lastTurn(h)).toEqual({ permissionMode: "acceptEdits" });
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "plan" });
  });
  // The runner reports Claude's own ids (modeReported); a Plan turn's approval keeps the common-id rule.
  const statusOf = (mode: string) => ({ source: "status" as const, mode });
  it("stores the mode Claude reports after a plan approval and announces the list change", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" });
    const report = h.open.mock.calls[0]![0].modeReported!;
    h.changes.length = 0;
    report(statusOf("acceptEdits"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.changes).toEqual(["/repo"]);
  });
  it("stores Default as no key after a plan approval, and the same mode again changes nothing", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" });
    const report = h.open.mock.calls[0]![0].modeReported!;
    report(statusOf("default"), undefined, undefined);
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.service.list("/repo")[0]).not.toHaveProperty("permissionMode");
    h.changes.length = 0; report(statusOf("default"), undefined, undefined);
    expect(h.changes).toEqual([]);
  });
  // A mode the person picked during the Plan turn is theirs; the plan
  // approval follows the SDK only while the conversation is still in Plan.
  it("keeps a mode the person picked during the Plan turn when the plan is approved", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" })).conversationId;
    const report = h.open.mock.calls[0]![0].modeReported!;
    h.service.setPermissionMode(id, "acceptEdits");
    h.changes.length = 0;
    report(statusOf("default"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.changes).toEqual([]);
  });
  it("ignores a plan report from a turn that is no longer the conversation's current one", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" })).conversationId;
    const stale = h.open.mock.calls[0]![0].modeReported!;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await h.service.send(id, "again", []);
    stale(statusOf("default"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "plan" });
  });
});

// claudeRunMode: the mode Claude Code's own settings ran the last Ask first turn in, kept with the conversation.
describe("the Claude run mode", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  const statusOf = (mode: string) => ({ source: "status" as const, mode });
  const initOf = (mode: string) => ({ source: "init" as const, mode });
  const reportOf = (h: ReturnType<typeof homeFixture>, call = -1) => h.open.mock.calls.at(call)![0].modeReported!;
  const end = (h: ReturnType<typeof homeFixture>, id: string) => { h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2](); };
  it("keeps the mode an Ask first turn's first init reports and announces it once", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas });
    h.changes.length = 0;
    reportOf(h)(initOf("auto"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "auto" });
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.service.list("/repo")[0]).toMatchObject({ claudeRunMode: "auto" });
    expect(h.changes).toEqual(["/repo"]);
    // Ask first's own mode clears it.
    reportOf(h)(initOf("default"), undefined, undefined);
    expect(h.store.list()[0]).not.toHaveProperty("claudeRunMode");
  });
  // Two saves would send two changes, and the trigger would show a step in between.
  it("saves a plan approval's stored mode and run mode in one index write and one change", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    reportOf(h)(initOf("auto"), undefined, undefined); end(h, id);
    await h.service.send(id, "plan it", [], { permissionMode: "plan" });
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "plan", claudeRunMode: "auto" });
    const save = vi.spyOn(h.store, "save"); h.changes.length = 0;
    reportOf(h)(statusOf("default"), undefined, undefined);
    expect(save).toHaveBeenCalledOnce();
    expect(h.changes).toEqual(["/repo"]);
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.store.list()[0]).not.toHaveProperty("claudeRunMode");
  });
  it("follows the approval of an Ask first turn whose settings ran plan, keeping Ask first", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas });
    reportOf(h)(initOf("plan"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "plan" });
    reportOf(h)(statusOf("default"), "plan", "plan");
    expect(h.store.list()[0]).not.toHaveProperty("claudeRunMode");
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
  });
  // The value is the last Ask first turn's: a send in another mode and a pick keep it; only the display hides it.
  it("keeps the last value through a send with Accept edits and shows it again once Ask first is picked", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    reportOf(h)(initOf("dontAsk"), undefined, undefined); end(h, id);
    await h.service.send(id, "edit it", [], { permissionMode: "acceptEdits" });
    // That turn runs Accept edits; whatever it reports is not the settings' mode.
    reportOf(h)(initOf("acceptEdits"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "acceptEdits", claudeRunMode: "dontAsk" });
    expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "acceptEdits", claudeRunMode: "dontAsk" });
    end(h, id);
    h.service.setPermissionMode(id, "default");
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.service.list("/repo")[0]).toMatchObject({ claudeRunMode: "dontAsk" });
  });
  it("leaves the value of a turn that failed before its init", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    reportOf(h)(initOf("auto"), undefined, undefined); end(h, id);
    await h.service.send(id, "again", []);
    h.service.receive(id, { type: "turn.failed", code: "process_exited" }); h.open.mock.calls.at(-1)![2]();
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "auto" });
    expect(h.service.list("/repo")[0]).toMatchObject({ claudeRunMode: "auto" });
  });
  // A Send now that runs as the CLI's next turn brings a later init of the same process, which can report a setMode
  // allowed there; a message waiting in the queue runs nothing until its own turn.
  it("takes no value from a later init of the turn, a message queued behind it, or an older turn", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    const first = reportOf(h);
    first(initOf("auto"), undefined, undefined);
    h.service.queue(id, { text: "queued", anchors: [] });
    h.changes.length = 0;
    first(initOf("acceptEdits"), "auto", "auto");
    first(statusOf("acceptEdits"), "auto", "acceptEdits");
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "auto" });
    expect(h.changes).toEqual([]);
    end(h, id);
    // The queue went out as its own turn; the first turn's late frames no longer count.
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    first(initOf("dontAsk"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "auto" });
    // The queued turn is a new Ask first turn in a new process: its own first init counts.
    await vi.waitFor(() => expect(h.runners[1]?.send).toHaveBeenCalled());
    h.changes.length = 0;
    reportOf(h)(initOf("dontAsk"), undefined, undefined);
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "dontAsk" });
    expect(h.service.list("/repo")[0]).toMatchObject({ claudeRunMode: "dontAsk" });
    expect(h.changes).toEqual(["/repo"]);
  });
  // The stored plan is an earlier turn's: this turn's own init decides whether its status is a plan approval.
  it("takes no value from a setMode in an Ask first turn whose settings did not run plan, though an earlier one did", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    reportOf(h)(initOf("plan"), undefined, undefined); end(h, id);
    await h.service.send(id, "again", []);
    h.service.setPermissionMode(id, "acceptEdits");
    reportOf(h)(initOf("default"), undefined, undefined);
    h.service.setPermissionMode(id, "default");
    h.changes.length = 0;
    reportOf(h)(statusOf("acceptEdits"), "default", "default");
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "plan" });
    expect(h.changes).toEqual([]);
  });
  // After the approval the process runs default: an "Always allow" on a later Write (setMode acceptEdits) is that
  // process's only, though the turn began in plan.
  it("takes no value from a setMode after an Ask first turn's plan approval", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas });
    reportOf(h)(initOf("plan"), undefined, undefined);
    reportOf(h)(statusOf("default"), "plan", "plan");
    h.changes.length = 0;
    reportOf(h)(statusOf("acceptEdits"), "plan", "default");
    expect(h.store.list()[0]).not.toHaveProperty("claudeRunMode");
    expect(h.changes).toEqual([]);
  });
  // A stopped turn changes nothing, though the CLI keeps sending frames until its own result.
  it("takes no value from an init that arrives after the turn was stopped", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    await h.service.interrupt(id);
    h.changes.length = 0;
    reportOf(h)(initOf("auto"), undefined, undefined);
    expect(h.store.list()[0]).not.toHaveProperty("claudeRunMode");
    expect(h.changes).toEqual([]);
  });
  // A Stop with a Send now message still unread holds the turn's end (the interrupted record waits for the read check),
  // so the turn is not terminal yet; the Stop alone already ends what the turn may change.
  it("takes no value from a report after a Stop that holds the turn's end for an unread steer", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    const report = reportOf(h);
    report(initOf("plan"), undefined, undefined);
    h.runners[0]!.steer = vi.fn(async () => {});
    const item = h.service.queue(id, { text: "steer", anchors: [] });
    const pending = h.service.sendNow(id, item.itemId).catch(() => {});
    await Promise.resolve();
    await h.service.interrupt(id);
    expect(h.store.read(id).some(e => e.type === "interrupted")).toBe(false);
    h.changes.length = 0;
    report(statusOf("default"), "plan", "plan");
    report(initOf("auto"), "plan", "plan");
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "plan" });
    expect(h.changes).toEqual([]);
    h.open.mock.calls[0]![2](); await pending;
    expect(h.store.list()[0]).toMatchObject({ claudeRunMode: "plan" });
  });
  it("never keeps a value for a legacy-external conversation", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    const m = h.store.list()[0]!, { session } = m;
    h.store.save([{ conversationId: id, root: m.root, title: m.title, ...(m.canvas ? { canvas: m.canvas } : {}), owner: { kind: "legacy-external" },
      session: { runtime: "claude", origin: session.origin, sessionId: session.sessionId, configDir: session.configDir, cwd: session.cwd } }]);
    reportOf(h)(initOf("auto"), undefined, undefined);
    expect(h.store.list().find(m => m.conversationId === id)).not.toHaveProperty("claudeRunMode");
  });
});

// Send now puts one queued message into the running turn; it joins the turn when the agent reads it.
describe("send now", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const file = (n: number) => ({ name: `f${n}.png`, size: 1, kind: "image" as const, path: `/Users/me/f${n}.png` });
  const userMessages = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).filter(e => e.type === "user.message");
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  // The provider's side of each steer: accept or refuse it, and report the agent reading it (runners.ts SteerHooks).
  function steering(h: ReturnType<typeof homeFixture>, runner = h.runners.at(-1)!) {
    const calls: { prompt: string; turnId: string; messageId: string; accept(): void; refuse(error: Error): void }[] = [];
    runner.steer = vi.fn((prompt: string, turnId: string, messageId: string) => new Promise<void>((accept, refuse) => { calls.push({ prompt, turnId, messageId, accept, refuse }); }));
    const read = (messageId: string) => h.open.mock.calls.at(-1)![0].steerConsumed!(messageId);
    const turnOf = () => vi.mocked(runner.send).mock.calls.at(-1)![1];
    return { calls, read, turnOf };
  }
  // Answered or still waiting, without waiting for it.
  async function answer(promise: Promise<void>): Promise<"pending" | "ok" | string> {
    const result = promise.then(() => "ok", (error: Error) => error.message);
    return Promise.race([result, tick().then(() => "pending")]);
  }
  async function running(h: ReturnType<typeof homeFixture>, start: Parameters<ConversationService["start"]>[0] = canvasStart) {
    const id = (await h.service.start(start)).conversationId;
    return { id, ...steering(h) };
  }
  const sending = (h: ReturnType<typeof homeFixture>, id: string) =>
    (JSON.parse(readFileSync(join(h.dir, "conversations", "drafts.json"), "utf8")).queued[id] ?? []).filter((item: { sending?: true }) => item.sending).map((item: { text: string }) => item.text);

  const queued = (h: ReturnType<typeof homeFixture>, id: string) =>
    (JSON.parse(readFileSync(join(h.dir, "conversations", "drafts.json"), "utf8")).queued[id] ?? []).map((item: { text: string }) => item.text);

  it("puts the message into the running turn and answers once the agent read it, which appends it to that turn there", async () => {
    const h = homeFixture();
    const { id, calls, read, turnOf } = await running(h);
    const first = h.service.queue(id, { text: "one", anchors: [] }); h.service.queue(id, { text: "two", anchors: [] });
    const sent = h.service.sendNow(id, first.itemId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ turnId: turnOf(), messageId: expect.any(String) });
    expect(calls[0]!.prompt).toContain("one");
    // Marked on disk before the provider answers; the list counts only waiting messages (the renderer keeps the row).
    expect(sending(h, id)).toEqual(["one"]);
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    calls[0]!.accept();
    expect(await answer(sent)).toBe("pending");
    expect(userMessages(h, id)).toHaveLength(1);
    h.service.receive(id, { type: "message.delta", messageId: "m1", text: "working" });
    read(calls[0]!.messageId);
    expect(await answer(sent)).toBe("ok");
    const events = h.store.read(id);
    expect(events.at(-1)).toMatchObject({ type: "user.message", text: "one", turnId: turnOf() });
    expect(events.at(-2)).toMatchObject({ type: "message.delta" });
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    // The turn goes on; the rest of the queue follows it.
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(3));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "two" });
  });
  it("answers when the agent's read comes before the provider's answer", async () => {
    const h = homeFixture();
    const { id, calls, read } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    read(calls[0]!.messageId);
    expect(await answer(sent)).toBe("ok");
    calls[0]!.accept(); await tick();
    expect(userMessages(h, id)).toHaveLength(2);
  });
  it.each([["before the provider answered", false], ["after the provider accepted it, unread", true]])(
    "keeps the message queued in its place when the turn is done %s, and sends the queue in its order once", async (_when, accepted) => {
      const h = homeFixture();
      const { id, calls } = await running(h);
      h.service.queue(id, { text: "one", anchors: [] });
      const second = h.service.queue(id, { text: "two", anchors: [] });
      const sent = h.service.sendNow(id, second.itemId);
      if (accepted) { calls[0]!.accept(); await tick(); }
      // A Claude turn's end with a steer unread waits for its group to go and the transcript read (no file here).
      h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
      expect(await answer(sent)).toBe("not_running");
      expect(h.service.list("/repo")[0]!.working).toBe(true);
      await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
      expect(userMessages(h, id).at(-1)).toMatchObject({ text: "one\n\ntwo" });
      // A late answer and read of the earlier steer change nothing now (POSTMORTEM 2026-10-27, 2026-10-28).
      if (!accepted) calls[0]!.accept();
      h.open.mock.calls[0]![0].steerConsumed!(calls[0]!.messageId);
      await tick();
      expect(userMessages(h, id)).toHaveLength(2);
      expect(vi.mocked(h.runners.at(-1)!.send)).toHaveBeenCalledTimes(1);
      expect(h.runners.reduce((n, r) => n + vi.mocked(r.send).mock.calls.length, 0)).toBe(2);
    });
  it.each([
    ["fails", { type: "turn.failed" as const, code: "rate_limited" as const }, "turn_failed"],
    ["is stopped", { type: "interrupted" as const, reason: "user" as const }, "interrupted"],
  ])("hands the queue back with the steered message when the turn %s first", async (_how, end, reason) => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    h.service.queue(id, { text: "one", anchors: [] });
    const second = h.service.queue(id, { text: "two", anchors: [] });
    const sent = h.service.sendNow(id, second.itemId);
    calls[0]!.accept(); await tick();
    h.service.receive(id, end); h.open.mock.calls[0]![2]();
    expect(await answer(sent)).toBe("not_running");
    expect(h.service.takeDraft(id)).toEqual({ text: "one\n\ntwo", anchors: [], attachments: [], reason });
  });
  it("hands the steered message back when its provider signs out meanwhile", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept();
    await h.service.stopRuns("claude"); h.open.mock.calls[0]![2]();
    expect(await answer(sent)).toBe("not_running");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one", reason: "interrupted" });
  });
  it("puts the steered message back in the queue when the app quits meanwhile, and ignores its late read", async () => {
    const h = homeFixture();
    const { id, calls, read } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept();
    expect(sending(h, id)).toEqual(["one"]);
    await h.service.quit();
    expect(await answer(sent)).toBe("not_running");
    expect(sending(h, id)).toEqual([]);
    read(calls[0]!.messageId);
    expect(userMessages(h, id)).toHaveLength(1);
    expect(queued(h, id)).toEqual(["one"]);
  });
  // A quit whose appQuit write throws for one conversation still ends every other conversation's steers. Both carry a
  // steer and the first appQuit write throws, whichever conversation quit reaches first.
  it("puts every conversation's steered message back in the queue when the first appQuit write throws", async () => {
    const h = homeFixture();
    const conversations = [await running(h), await running(h, { ...canvasStart, canvas: { path: ".doan/canvases/b.html", id: "b" } })];
    const sent = conversations.map(({ id, calls }) => {
      const item = h.service.queue(id, { text: "one", anchors: [] });
      const answered = h.service.sendNow(id, item.itemId);
      calls[0]!.accept();
      return answered;
    });
    await tick();
    for (const { id } of conversations) expect(sending(h, id)).toEqual(["one"]);
    const append = h.store.append.bind(h.store);
    let thrown = false;
    vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (body.type === "interrupted" && !thrown) { thrown = true; throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" }); }
      return append(cid, turn, body);
    });
    expect(() => h.service.quit()).toThrow("EIO");
    for (const answered of sent) expect(await answer(answered)).toBe("not_running");
    for (const { id } of conversations) { expect(sending(h, id)).toEqual([]); expect(queued(h, id)).toEqual(["one"]); }
  });
  it("puts the steered message back in the queue when the history stops taking writes meanwhile, and ignores its late read", async () => {
    const h = homeFixture();
    const { id, calls, read } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept();
    expect(sending(h, id)).toEqual(["one"]);
    vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    expect(await answer(sent)).toBe("not_running");
    expect(sending(h, id)).toEqual([]);
    read(calls[0]!.messageId);
    expect(userMessages(h, id)).toHaveLength(1);
    expect(queued(h, id)).toEqual(["one"]);
  });
  it("keeps the steered message on its turn when another conversation starts on the same canvas meanwhile", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const queued = h.service.queue(id, { text: "two", anchors: [] });
    const sent = h.service.sendNow(id, queued.itemId);
    calls[0]!.accept();
    await h.service.start(canvasStart);
    // The read comes through this conversation's own runner, not the one the other start opened.
    h.open.mock.calls[0]![0].steerConsumed!(calls[0]!.messageId);
    expect(await answer(sent)).toBe("ok");
    expect(userMessages(h, id)).toHaveLength(2);
    expect(h.service.takeDraft(id)).toBeNull();
  });
  it("keeps the message queued, not sending, when the provider refuses it, and the queue follows the turn's end", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.refuse(Object.assign(new Error("no active turn to steer"), { code: -32600 }));
    expect(await answer(sent)).toBe("not_running");
    expect(sending(h, id)).toEqual([]);
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "one" });
  });
  it("hands a refused message back with the queue when the turn then fails", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const queued = h.service.queue(id, { text: "two", anchors: [] });
    const refused = h.service.sendNow(id, queued.itemId);
    calls[0]!.refuse(new Error("RPC timeout"));
    expect(await answer(refused)).toBe("not_running");
    h.service.receive(id, { type: "turn.failed", code: "rate_limited" }); h.open.mock.calls[0]![2]();
    expect(h.service.takeDraft(id)).toMatchObject({ text: "two", reason: "turn_failed" });
  });
  it("lets the agent's read decide over a refusal already answered, while the turn runs and the message is queued", async () => {
    const h = homeFixture();
    const { id, calls, read, turnOf } = await running(h);
    const one = h.service.queue(id, { text: "one", anchors: [] }), two = h.service.queue(id, { text: "two", anchors: [] });
    const first = h.service.sendNow(id, one.itemId);
    calls[0]!.refuse(new Error("RPC timeout"));
    expect(await answer(first)).toBe("not_running");
    // The server took it after all.
    read(calls[0]!.messageId);
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "one", turnId: turnOf() });
    expect(h.service.list("/repo")[0]!.queued).toBe(1);
    // A refused message the person removed since stays out of the history.
    const second = h.service.sendNow(id, two.itemId);
    calls[1]!.refuse(new Error("RPC timeout"));
    expect(await answer(second)).toBe("not_running");
    h.service.removeQueued(id, two.itemId);
    read(calls[1]!.messageId);
    expect(userMessages(h, id)).toHaveLength(2);
  });
  it("answers a Send now made again after a refusal with the earlier steer's late read, once", async () => {
    const h = homeFixture();
    const { id, calls, read } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const first = h.service.sendNow(id, item.itemId);
    calls[0]!.refuse(new Error("RPC timeout"));
    expect(await answer(first)).toBe("not_running");
    const again = h.service.sendNow(id, item.itemId);
    read(calls[0]!.messageId);
    expect(await answer(again)).toBe("ok");
    calls[1]!.accept(); read(calls[1]!.messageId); await tick();
    expect(userMessages(h, id).map(e => e.type === "user.message" && e.text)).toEqual(["Make a pricing page", "one"]);
  });
  it("publishes the turn's end before it answers the refusal it causes", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    let seen = -1;
    const sent = h.service.sendNow(id, item.itemId).catch(() => { seen = h.published.length; });
    calls[0]!.accept(); await tick();
    h.service.receive(id, { type: "turn.done" });
    await sent;
    const done = h.published.findIndex(e => e.type === "turn.done");
    expect(done).toBeGreaterThanOrEqual(0);
    expect(done).toBeLessThan(seen);
  });
  it("answers stale for the same row twice and for a row already gone, and keeps a sending row from Remove", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    await expect(h.service.sendNow(id, item.itemId)).rejects.toThrow("stale");
    expect(calls).toHaveLength(1);
    expect(() => h.service.removeQueued(id, item.itemId)).toThrow("stale");
    expect(sending(h, id)).toEqual(["one"]);
    await expect(h.service.sendNow(id, "44444444-4444-4444-8444-444444444444")).rejects.toThrow("stale");
    await expect(h.service.sendNow("33333333-3333-4333-8333-333333333333", item.itemId)).rejects.toThrow("not_found");
    calls[0]!.accept();
    expect(await answer(sent)).toBe("pending");
  });
  it("puts two rows in one after the other in the order the agent read them", async () => {
    const h = homeFixture();
    const { id, calls, read, turnOf } = await running(h);
    const one = h.service.queue(id, { text: "one", anchors: [] }), two = h.service.queue(id, { text: "two", anchors: [] });
    const first = h.service.sendNow(id, one.itemId), second = h.service.sendNow(id, two.itemId);
    expect(sending(h, id)).toEqual(["one", "two"]);
    calls[0]!.accept(); calls[1]!.accept();
    read(calls[0]!.messageId); read(calls[1]!.messageId);
    expect([await answer(first), await answer(second)]).toEqual(["ok", "ok"]);
    expect(userMessages(h, id).map(e => [e.type === "user.message" && e.text, e.turnId])).toEqual([["Make a pricing page", turnOf()], ["one", turnOf()], ["two", turnOf()]]);
    expect(h.service.list("/repo")[0]!.queued).toBe(0);
  });
  it("refuses as not_running when no turn runs, while it prepares, and for a runner without steer, leaving the row as it was", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    const item = h.service.queue(id, { text: "one", anchors: [] });
    // An ACP runner has no steer.
    await expect(h.service.sendNow(id, item.itemId)).rejects.toThrow("not_running");
    expect(sending(h, id)).toEqual([]);
    steering(h);
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    // Waiting for a permission answer still runs.
    const waiting = h.service.sendNow(id, item.itemId);
    expect(await answer(waiting)).toBe("pending");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(await answer(waiting)).toBe("not_running");
    await expect(h.service.sendNow(id, item.itemId)).rejects.toThrow("not_running");
  });
  it("hands a steered message back as a draft after a restart", async () => {
    const h = homeFixture();
    const { id } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    void h.service.sendNow(id, item.itemId).catch(() => {});
    const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => [], () => {}, { drafts: new DraftStore(join(h.dir, "conversations")) });
    expect(restarted.takeDraft(id)).toMatchObject({ text: "one", reason: "restarted" });
  });
  it("sends a project conversation's message queued only as a steer at the turn's end", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h, homeRequest);
    const item = h.service.queue(id, { text: "next", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept(); await tick();
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(await answer(sent)).toBe("not_running");
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "next" });
  });
  it("rechecks a queued message's files, lists them in the prompt and records them, consuming them once read", async () => {
    let gone = false;
    const sent = vi.fn();
    const files: QueueFiles = { reclaim: vi.fn(() => { if (gone) throw Object.assign(new Error("attachment_missing"), { missing: ["f1"] }); return { recheck: () => [file(0)], sent }; }), consume: vi.fn() };
    const h = homeFixture([], { files });
    const { id, calls, read } = await running(h);
    const item = h.service.queue(id, { text: "look", anchors: [], attachments: [file(0)], ids: ["f0"] });
    const answered = h.service.sendNow(id, item.itemId);
    expect(files.reclaim).toHaveBeenCalledWith(["f0"]);
    expect(JSON.parse(calls[0]!.prompt.split("\n\n")[1]!).attachments).toEqual([{ name: "f0.png", kind: "image", path: "/Users/me/f0.png" }]);
    calls[0]!.accept(); await tick();
    expect(files.consume).not.toHaveBeenCalled();
    read(calls[0]!.messageId);
    expect(await answer(answered)).toBe("ok");
    expect(sent).toHaveBeenCalledOnce();
    expect(files.consume).toHaveBeenCalledWith(["f0"]);
    expect(userMessages(h, id).at(-1)).toMatchObject({ text: "look", attachments: [file(0)] });

    gone = true;
    const other = h.service.queue(id, { text: "again", anchors: [], attachments: [file(1)], ids: ["f1"] });
    await expect(h.service.sendNow(id, other.itemId)).rejects.toThrow("attachment_missing");
    expect(sending(h, id)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

// Doan's own record of a conversation on this device goes; the agent's files stay.
describe("delete", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const history = (h: { dir: string }, id: string) => join(h.dir, "conversations", `${id}.jsonl`);
  // A canvas conversation whose turn ended and whose process is gone.
  async function idle(h: ReturnType<typeof homeFixture>) {
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    return id;
  }
  it("removes an idle conversation's index entry and history, announces the list once and reports the deletion", async () => {
    const h = homeFixture();
    const id = await idle(h), other = (await h.service.start({ ...canvasStart, canvas: { path: ".doan/canvases/b.html", id: "b" } })).conversationId;
    h.changes.length = 0;
    h.service.delete(id);
    expect(h.store.list().map(m => m.conversationId)).toEqual([other]);
    expect(existsSync(history(h, id))).toBe(false);
    expect(h.service.list("/repo").map(s => s.conversationId)).toEqual([other]);
    expect(h.changes).toEqual(["/repo"]);
    expect(h.deleted).toEqual([id]);
  });
  it.each([
    ["running", async (h: ReturnType<typeof homeFixture>) => (await h.service.start(canvasStart)).conversationId],
    ["waiting for an answer", async (h: ReturnType<typeof homeFixture>) => {
      const id = (await h.service.start(canvasStart)).conversationId;
      h.service.receive(id, { type: "permission.request", requestId: "r", tool: "Write", summary: "Write a.html", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
      return id;
    }],
    ["waiting for its handoff's judgement", async (h: ReturnType<typeof homeFixture>) => {
      const id = (await h.service.start(homeRequest)).conversationId;
      h.service.requestHandoff({ root: "/repo", handoff: h.open.mock.calls[0]![0].env.DOAN_HANDOFF!, path: ".doan/canvases/b.html", text: "go on" });
      h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
      return id;
    }],
    ["holding its queue for the previous process", async (h: ReturnType<typeof homeFixture>) => {
      const id = (await h.service.start(canvasStart)).conversationId;
      h.service.queue(id, { text: "next", anchors: [] });
      h.service.receive(id, { type: "turn.done" });
      await new Promise(resolve => setTimeout(resolve, 10));
      return id;
    }],
    ["with a send waiting for the previous process", async (h: ReturnType<typeof homeFixture>) => {
      const id = (await h.service.start(canvasStart)).conversationId;
      h.service.receive(id, { type: "turn.done" });
      void h.service.send(id, "again", []).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 10));
      return id;
    }],
  ] as const)("refuses as busy while the conversation is %s and changes nothing", async (_name, setup) => {
    const h = homeFixture();
    const id = await setup(h);
    const before = readFileSync(history(h, id), "utf8");
    expect(h.service.list("/repo")[0]!.working).toBe(true);
    expect(() => h.service.delete(id)).toThrow("busy");
    expect(h.store.list().map(m => m.conversationId)).toEqual([id]);
    expect(readFileSync(history(h, id), "utf8")).toBe(before);
    expect(h.runners[0]!.close).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([]);
  });
  it("refuses as busy while the app quits and as not_found for a conversation it does not hold", async () => {
    const h = homeFixture();
    const id = await idle(h);
    expect(() => h.service.delete("33333333-3333-4333-8333-333333333333")).toThrow("not_found");
    void h.service.quit();
    expect(() => h.service.delete(id)).toThrow("busy");
    expect(h.store.list()).toHaveLength(1);
  });
  it("deletes nothing and closes nothing when the index cannot be read", async () => {
    const h = fixture();
    const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" });
    writeFileSync(join(h.store["directory"] as string, "index.json"), "broken");
    expect(() => h.service.delete(id)).toThrow("Invalid conversation index");
    expect(h.runners[0]!.close).not.toHaveBeenCalled();
    expect(h.store.read(id).length).toBeGreaterThan(0);
  });
  it("closes an idle Codex server it would have reused, ignores its late events and releases the session once its process exits (POSTMORTEM 2026-10-28)", async () => {
    const h = fixture();
    const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" });
    const emit = h.open.mock.calls[0]![1];
    h.service.delete(id);
    expect(h.runners[0]!.close).toHaveBeenCalledOnce();
    emit({ type: "message.delta", messageId: "m", text: "late" });
    h.service.receive(id, { type: "turn.done" });
    expect(existsSync(join(h.store["directory"] as string, `${id}.jsonl`))).toBe(false);
    // The deleted conversation's process still holds its session until its group is gone.
    await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).rejects.toThrow("session_in_use");
    h.exits[0]!();
    await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).resolves.toMatchObject({ conversationId: expect.any(String) });
  });
  it("answers not_found to every later call on the deleted conversation and writes no history for it", async () => {
    const h = homeFixture();
    const id = await idle(h);
    h.service.delete(id);
    await expect(h.service.send(id, "again", [])).rejects.toThrow("not_found");
    expect(() => h.service.queue(id, { text: "x", anchors: [] })).toThrow("not_found");
    expect(() => h.service.markSeen(id, 1)).toThrow("not_found");
    expect(() => h.service.setPermissionMode(id, "plan")).toThrow("not_found");
    expect(() => h.service.takeDraft(id)).toThrow("not_found");
    expect(() => h.service.read(id)).toThrow("not_found");
    await expect(h.service.interrupt(id)).rejects.toThrow("not_found");
    await expect(h.service.sendNow(id, "item")).rejects.toThrow("not_found");
    expect(() => h.service.delete(id)).toThrow("not_found");
    expect(existsSync(history(h, id))).toBe(false);
  });
  it("never recreates the history of a deleted conversation for an edit result that arrives late", async () => {
    const h = homeFixture();
    const id = await idle(h);
    const emit = h.open.mock.calls[0]![1];
    h.service.delete(id);
    const late = { type: "activity.result", callId: "toolu_1", path: "/repo/a.txt", lines: { added: 1, removed: 1 } } as const;
    emit(late); h.service.receive(id, late);
    expect(existsSync(history(h, id))).toBe(false);
    expect(h.store.list()).toEqual([]);
  });
  it("discards the conversation's returned draft with it", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "queued", anchors: [] });
    h.service.receive(id, { type: "interrupted", reason: "user" }); h.open.mock.calls[0]![2]();
    expect(h.service.list("/repo")[0]).toMatchObject({ returnedDraft: true, working: false });
    h.service.delete(id);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(JSON.parse(readFileSync(join(h.dir, "conversations", "drafts.json"), "utf8")).returned).toEqual({});
  });
  it("still succeeds once the index is committed when the drafts or the deletion report fail afterwards", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "queued", anchors: [] });
    h.service.receive(id, { type: "interrupted", reason: "user" }); h.open.mock.calls[0]![2]();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(h.drafts as unknown as { write(): void }, "write").mockImplementation(() => { throw new Error("ENOSPC"); });
    h.deleted.push = () => { throw new Error("notification gone"); };
    expect(() => h.service.delete(id)).not.toThrow();
    expect(h.store.list()).toEqual([]);
    expect(log).toHaveBeenCalled();
  });
  it("discards, at the next start, the drafts of a recorded deletion and leaves drafts no deletion recorded", async () => {
    const h = homeFixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(id, { text: "queued", anchors: [] });
    h.service.receive(id, { type: "interrupted", reason: "user" }); h.open.mock.calls[0]![2]();
    // The drafts write fails during the deletion, so its draft stays on disk until the next start.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(h.drafts as unknown as { write(): void }, "write").mockImplementation(() => { throw new Error("ENOSPC"); });
    h.service.delete(id);
    const path = join(h.dir, "conversations", "drafts.json"), stray = "33333333-3333-4333-8333-333333333333";
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(saved.returned)).toEqual([id]);
    writeFileSync(path, JSON.stringify({ ...saved, returned: { ...saved.returned, [stray]: saved.returned[id] } }));
    new ConversationService(new ConversationStore(h.dir), h.prepare, h.open, () => {}, () => {}, 10_000, () => [], () => {}, { drafts: new DraftStore(join(h.dir, "conversations")) });
    expect(Object.keys(JSON.parse(readFileSync(path, "utf8")).returned)).toEqual([stray]);
    expect(existsSync(join(h.dir, "conversations", "deletions.json"))).toBe(false);
  });
  it("removes no drafts at start when index.json is missing or unreadable, and keeps the record", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const index of [null, "broken"]) {
      const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
      const store = new ConversationStore(dir), conversations = join(dir, "conversations");
      if (index !== null) writeFileSync(join(conversations, "index.json"), index);
      const gone = "33333333-3333-4333-8333-333333333333";
      const draft = { text: "x", anchors: [], attachments: [], reason: "turn_failed" };
      const value = JSON.stringify({ v: 1, queued: {}, returned: { [gone]: draft } }), record = JSON.stringify({ v: 1, ids: [gone] });
      writeFileSync(join(conversations, "drafts.json"), value);
      writeFileSync(join(conversations, "deletions.json"), record);
      new ConversationService(store, async () => { throw new Error("unused"); }, async () => { throw new Error("unused"); }, () => {}, () => {}, 10_000, () => [], () => {}, { drafts: new DraftStore(conversations) });
      expect(readFileSync(join(conversations, "drafts.json"), "utf8"), String(index)).toBe(value);
      expect(readFileSync(join(conversations, "deletions.json"), "utf8"), String(index)).toBe(record);
    }
  });
  it("marks the run terminal, so a late event of a turn not yet marked ended cannot recreate the history", async () => {
    const h = homeFixture();
    const id = await idle(h);
    // A live entry that is not working but not marked terminal either; deletion must mark it.
    (h.service as unknown as { live: Map<string, { terminal: boolean }> }).live.get(id)!.terminal = false;
    h.service.delete(id);
    h.service.receive(id, { type: "message.delta", messageId: "m", text: "late" });
    expect(existsSync(history(h, id))).toBe(false);
  });
  it("refuses as busy while only a queue hold keeps the conversation working", async () => {
    const h = homeFixture();
    const id = await idle(h);
    (h.service as unknown as { live: Map<string, { holding?: object }> }).live.get(id)!.holding = {};
    expect(() => h.service.delete(id)).toThrow("busy");
    expect(h.store.list().map(m => m.conversationId)).toEqual([id]);
  });
});
// A question waits in the turn as a permission request does.
describe("agent questions", () => {
  const question = (requestId: string) => ({ type: "question.request" as const, requestId, questions: [{ id: "0", header: "Color", question: "Which color?", options: [{ label: "Red" }], multiSelect: false, other: true }] });
  const resolved = (requestId: string) => ({ type: "question.resolved" as const, requestId, outcome: "skipped" as const });
  function asking(answer?: Runner["answerQuestion"]) {
    const h = homeFixture();
    h.open.mockImplementation(async input => {
      const runner: Runner = { sessionId: input.sessionId ?? `s${h.runners.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), ...(answer ? { answerQuestion: vi.fn(answer) } : {}) };
      h.runners.push(runner); return runner;
    });
    return h;
  }
  it("shows a conversation waiting on a question as waiting, with the question as its preview", async () => {
    const h = asking(); const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, question("q1"));
    expect(h.service.list("/repo")[0]).toMatchObject({ phase: "waiting", preview: "Needs your answer: Which color?" });
    expect(h.service.read(id).turn).toBe("waitingPermission");
    h.service.receive(id, resolved("q1"));
    expect(h.service.list("/repo")[0]!.phase).toBe("running");
  });
  it.each(["ok", "stale", "bad_request"] as const)("passes the answer to the runner and maps its %s", async result => {
    const h = asking(() => result); const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, question("q1"));
    const answer = { outcome: "answered" as const, answers: { "0": { selected: [0] } } };
    if (result === "ok") h.service.answerQuestion(id, "q1", answer);
    else expect(() => h.service.answerQuestion(id, "q1", answer)).toThrow(result);
    expect(h.runners[0]!.answerQuestion).toHaveBeenCalledWith("q1", answer);
  });
  it("answers stale for a runner without questions, a conversation with no running turn and an unknown one", async () => {
    const h = asking(); const id = (await h.service.start(homeRequest)).conversationId;
    expect(() => h.service.answerQuestion(id, "q1", { outcome: "skipped" })).toThrow("stale");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(() => h.service.answerQuestion(id, "q1", { outcome: "skipped" })).toThrow("stale");
    expect(() => h.service.answerQuestion("00000000-0000-4000-8000-000000000000", "q1", { outcome: "skipped" })).toThrow();
  });
  // A permission resolution with the same id answers no question.
  it("keeps waiting while a question and a permission are open together, until both are answered", async () => {
    const h = asking(); const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, question("r1")); h.service.receive(a, { type: "permission.request", requestId: "r2", tool: "Write", summary: "Write a.html", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    h.service.receive(a, { type: "permission.resolved", requestId: "r2", optionId: "allow" });
    h.service.receive(a, { type: "permission.resolved", requestId: "r1", optionId: "allow" });
    expect(h.service.list("/repo")[0]!.phase).toBe("waiting");
    h.service.receive(a, resolved("r1"));
    expect(h.service.list("/repo")[0]!.phase).toBe("running");
  });
  // POSTMORTEM 2026-10-28: a send the moment the answered turn ends is taken, not refused as busy.
  it("takes a send right at turn.done after a question was answered", async () => {
    const h = asking(() => "ok"); const id = (await h.service.start({ ...homeRequest, mode: "new", canvas: { path: ".doan/canvases/a.html" } })).conversationId;
    h.service.receive(id, question("q1"));
    h.service.answerQuestion(id, "q1", { outcome: "skipped" }); h.service.receive(id, resolved("q1"));
    h.service.receive(id, { type: "turn.done" });
    const sending = h.service.send(id, "next", []); h.open.mock.calls[0]![2]();
    await sending;
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(2);
  });
  it("keeps a conversation waiting on a question asking when another one starts on the same canvas", async () => {
    const h = asking(); const canvas = { path: ".doan/canvases/a.html", id: "a" }; h.listed.push(canvas);
    const first = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    h.service.receive(first, question("q1"));
    await h.service.start({ ...homeRequest, mode: "new", canvas });
    expect(h.runners[0]!.close).not.toHaveBeenCalled();
    const history = h.store.read(first);
    expect(history.map(e => e.type).slice(-1)).toEqual(["question.request"]);
    expect(foldConversation(history, first, false).questions).toEqual({ q1: "pending" });
    expect(h.service.restartHolds().pendingAnswers).toBe(1);
  });
  // Synthetic secret sentinel: Claude questions are never secret, so the history write path is fed a secret question
  // through storedAnswers, the one place a runner turns an answer into what the history keeps.
  it("writes no secret answer text to the history file or later events", async () => {
    const h = asking(); const id = (await h.service.start(homeRequest)).conversationId;
    const secret = { type: "question.request" as const, requestId: "q1", questions: [{ id: "pin", header: "PIN", question: "Your PIN?", options: [], multiSelect: false, other: true, secret: true as const }] };
    h.service.receive(id, secret);
    const answers = storedAnswers(secret.questions, { outcome: "answered", answers: { pin: { selected: [], other: "SYNTH_SECRET_PIN" } } });
    h.service.receive(id, { type: "question.resolved", requestId: "q1", outcome: "answered", answers });
    h.service.receive(id, { type: "turn.done" });
    expect(readFileSync(join(h.dir, "conversations", `${id}.jsonl`), "utf8")).not.toContain("SYNTH_SECRET_PIN");
    expect(JSON.stringify(h.published)).not.toContain("SYNTH_SECRET_PIN");
    expect(h.store.read(id).find(e => e.type === "question.resolved")).toMatchObject({ outcome: "answered", answers: {} });
  });
});

// A done turn's suggestion is kept in memory per conversation, fenced by the run and
// turn it belongs to, cleared when it no longer applies, and the next send ends a process that only waits for one.
describe("prompt suggestions", () => {
  type SuggestingRunner = Runner & { endAfterTurn: ReturnType<typeof vi.fn> };
  function suggesting() {
    const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
    const store = new ConversationStore(dir);
    const runs: { input: Parameters<OpenRunner>[0]; exited: () => void; runner: SuggestingRunner }[] = [];
    let connection = "conn-1";
    const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
      const runner: SuggestingRunner = { sessionId: input.sessionId ?? `s${runs.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), endAfterTurn: vi.fn(() => "kill" as const) };
      runs.push({ input, exited, runner }); return runner;
    });
    const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {},
      owner: { kind: "doan" as const, provider: "claude" as const, connectionId: connection, accountId: "acct", workspaceId: "org", profile: "claude" }, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const changes: string[] = [];
    const drafts = new DraftStore(join(dir, "conversations"));
    const service = new ConversationService(store, prepare, open, () => {}, undefined, 10_000, () => [], root => changes.push(root), { drafts });
    const start = async (canvas = ".doan/canvases/a.html") => (await service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: canvas }, text: "hello", anchors: [] })).conversationId;
    const shown = (id: string) => service.list("/repo").find(s => s.conversationId === id)?.suggestion;
    const suggest = (run: number, text: string) => runs[run]!.input.suggested!(text);
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    return { service, store, runs, open, prepare, changes, drafts, start, shown, suggest, tick, reconnect: (id: string) => { connection = id; } };
  }
  it("keeps a done turn's suggestion for its conversation, shows it in the list and announces the change", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    const before = h.changes.length;
    h.suggest(0, "Run the tests");
    expect(h.changes.length).toBe(before + 1);
    expect(h.shown(id)).toBe("Run the tests");
  });
  it.each([
    ["a failed turn", { type: "turn.failed", code: "unknown" } as const],
    ["an interrupted turn", { type: "interrupted", reason: "user" } as const],
  ])("ignores a suggestion of %s", async (_name, terminal) => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, terminal);
    h.suggest(0, "Run the tests");
    expect(h.shown(id)).toBeUndefined();
  });
  it("ignores a suggestion that comes before its turn ended", async () => {
    const h = suggesting(); const id = await h.start();
    h.suggest(0, "Too early");
    h.service.receive(id, { type: "turn.done" });
    expect(h.shown(id)).toBeUndefined();
  });
  // POSTMORTEM 2026-10-28: the next send is issued before the previous process's exit callback.
  it("ends a done turn's process that has no suggestion when the next send waits for it, and that send goes out", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    let sent = false; const pending = h.service.send(id, "next", []).then(() => { sent = true; });
    await h.tick();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
    expect(sent).toBe(false); expect(h.open).toHaveBeenCalledOnce();
    // A suggestion that still comes while the send waits belongs to a turn being replaced.
    h.suggest(0, "Too late");
    expect(h.shown(id)).toBeUndefined();
    h.runs[0]!.exited(); await pending;
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done", "user.message", "turn.started"]);
  });
  it("ends it for a queue that goes out at turn.done too", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.queue(id, { text: "queued", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce());
    h.runs[0]!.exited();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.store.read(id).filter(e => e.type === "user.message").at(-1)).toMatchObject({ text: "queued" });
  });
  // The runner decides how (afterTurnCleanup); the send asks for every finished turn's process and waits for its group.
  it.each([
    ["a failed turn", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "turn.failed", code: "unknown" }); }],
    ["an interrupted turn", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "interrupted", reason: "user" }); }],
    ["a turn whose suggestion came", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests"); }],
  ])("asks the process of %s to end too, and waits for its group", async (_name, end) => {
    const h = suggesting(); const id = await h.start();
    end(h, id);
    let sent = false; const pending = h.service.send(id, "next", []).then(() => { sent = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
    expect(sent).toBe(false);
    h.runs[0]!.exited(); await pending;
    expect(h.open).toHaveBeenCalledTimes(2);
  });
  it("clears the suggestion when the next turn is accepted, and a suggestion of the earlier run never comes back", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests"); h.runs[0]!.exited();
    await h.service.send(id, "next", []);
    expect(h.shown(id)).toBeUndefined();
    h.service.receive(id, { type: "turn.done" });
    h.suggest(0, "From the first run");
    expect(h.shown(id)).toBeUndefined();
    h.suggest(1, "From the second run");
    expect(h.shown(id)).toBe("From the second run");
  });
  it("shows the suggestion again after a send is refused before acceptance", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests"); h.runs[0]!.exited();
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.send(id, "next", [])).rejects.toThrow("not_logged_in");
    expect(h.shown(id)).toBe("Run the tests");
  });
  it("keeps it when another conversation starts on the same canvas", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.runs[0]!.exited(); await h.start();
    expect(h.shown(id)).toBe("Run the tests");
  });
  it("clears it on delete, and a late suggestion of the deleted conversation is ignored", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.service.delete(id);
    const before = h.changes.length;
    h.suggest(0, "Late");
    expect(h.changes.length).toBe(before);
    expect(h.service.list("/repo")).toEqual([]);
  });
  it("ignores a suggestion that comes while the app quits", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    await h.service.quit();
    const before = h.changes.length;
    h.suggest(0, "Run the tests");
    expect(h.changes.length).toBe(before);
    expect(h.shown(id)).toBeUndefined();
  });
  it("clears it when the conversation's Claude connection signs out or changes, and only then", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.service.connectionChanged("claude", "conn-1");
    h.service.connectionChanged("codex", undefined);
    expect(h.shown(id)).toBe("Run the tests");
    const before = h.changes.length;
    h.service.connectionChanged("claude", undefined);
    expect(h.shown(id)).toBeUndefined(); expect(h.changes.length).toBe(before + 1);
    h.runs[0]!.exited(); await h.service.send(id, "next", []); h.service.receive(id, { type: "turn.done" }); h.suggest(1, "Again");
    h.service.connectionChanged("claude", "conn-2");
    expect(h.shown(id)).toBeUndefined();
  });
  // A connection change must also refuse a suggestion the earlier run sends after it.
  it.each([["signs out", undefined], ["changes", "conn-2"]] as const)("ignores a suggestion that first arrives after the Claude connection %s", async (_name, next) => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    h.service.connectionChanged("claude", next);
    const before = h.changes.length;
    h.suggest(0, "Stale connection suggestion");
    expect(h.shown(id)).toBeUndefined(); expect(h.changes.length).toBe(before);
  });
  it("does not take a cleared suggestion back when the earlier run sends it again", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.service.connectionChanged("claude", "conn-2");
    h.suggest(0, "Run the tests");
    expect(h.shown(id)).toBeUndefined();
  });
  it("takes the suggestion of a run on the connection signed in now", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    h.service.connectionChanged("claude", "conn-2"); h.reconnect("conn-2");
    h.runs[0]!.exited(); await h.service.send(id, "next", []); h.service.receive(id, { type: "turn.done" });
    h.suggest(1, "On the new connection");
    expect(h.shown(id)).toBe("On the new connection");
  });
  it("keeps a legacy external conversation's suggestion across connection changes", async () => {
    const h = suggesting();
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.service.connectionChanged("claude", undefined);
    expect(h.shown(id)).toBe("Run the tests");
  });
});

// Runs carry their conversation's id, main reads which turn may take an
// update, and every end of a turn clears that conversation's work.
describe("conversation work", () => {
  const prepared = (env: NodeJS.ProcessEnv = {}) => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env });
  it("every runner opened for a conversation carries its id, for a new conversation and a resumed one", async () => {
    const h = fixture(); h.prepare.mockResolvedValue(prepared({ KEEP: "1" }));
    const id = (await h.service.start(request)).conversationId;
    expect(h.open.mock.calls[0]?.[0].env).toEqual({ KEEP: "1", DOAN_CONVERSATION_ID: id });
    h.service.receive(id, { type: "turn.done" }); h.exits[0]?.();
    await h.service.send(id, "after exit", []);
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.open.mock.calls[1]?.[0].env).toEqual({ KEEP: "1", DOAN_CONVERSATION_ID: id });
  });
  it("a turn is running from its acceptance to its end, and the next one only once it is accepted", async () => {
    const h = fixture(); const id = (await h.service.start(request)).conversationId;
    const first = h.service.liveTurns().get(id);
    expect(first).toEqual({ root: "/repo", turnId: expect.any(String), running: true, provider: "codex", canvas: { path: ".doan/canvases/a.html" } });
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    expect(h.service.liveTurns().get(id)?.running).toBe(true);
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.liveTurns().get(id)).toEqual({ ...first, running: false });
    let release: () => void = () => {};
    h.prepare.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(prepared()); }));
    const sending = h.service.send(id, "again", []);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    expect(h.service.liveTurns().get(id)?.running).toBe(false);
    release(); await sending;
    const second = h.service.liveTurns().get(id);
    expect(second).toMatchObject({ root: "/repo", running: true });
    expect(second?.turnId).not.toBe(first?.turnId);
  });
  // `doan work` names other sessions on a canvas by kind and provider (a legacy conversation's session runtime, a
  // doan-owned one's owner provider). Answered inside the CLI's 2 s deadline, so this reads memory only, never the index.
  it("a turn carries its conversation's provider and bound canvas without reading the index", async () => {
    const legacy = fixture(); const external = (await legacy.service.start(request)).conversationId;
    expect(legacy.store.list()[0]).toMatchObject({ owner: { kind: "legacy-external" }, session: { runtime: "codex" } });
    const h = homeFixture(); const id = (await h.service.start(homeRequest)).conversationId;
    const read = (store: ConversationStore) => vi.spyOn(store, "list").mockImplementation(() => { throw new Error("Invalid conversation index"); });
    const reads = [read(legacy.store), read(h.store)];
    expect(legacy.service.liveTurns().get(external)).toEqual({ root: "/repo", turnId: expect.any(String), running: true, provider: "codex", canvas: { path: ".doan/canvases/a.html" } });
    const unbound = h.service.liveTurns().get(id);
    expect(unbound).toEqual({ root: "/repo", turnId: expect.any(String), running: true, provider: "claude" });
    for (const spy of reads) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  });
  it("a deleted conversation has no turn", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(h.service.liveTurns().get(id)).toMatchObject({ running: false, provider: "claude" });
    h.service.delete(id);
    expect(h.service.liveTurns().has(id)).toBe(false);
  });
  // A send refused as busy still saves the moved path first (refreshCanvas before the busy check), so the running turn
  // must follow it: the moved file lists the conversation and the old path no longer does.
  it("a running turn's canvas follows a move a refused send saved", async () => {
    const h = fixture();
    let listed = { id: "a", path: ".doan/canvases/a.html" };
    const service = new ConversationService(h.store, h.prepare, h.open, () => {}, (_root, canvas) => canvas ? listed : undefined);
    const id = (await service.start({ ...request, canvas: listed })).conversationId;
    listed = { id: "a", path: ".doan/canvases/moved.html" };
    await expect(service.send(id, "while running", [])).rejects.toThrow("busy");
    expect(h.store.list()[0]!.canvas).toEqual(listed);
    expect(service.liveTurns().get(id)).toMatchObject({ running: true, canvas: listed });
    const others = (path: string) => othersOnCanvas({ request: { v: 3, token: "t", root: "/repo", action: "start", path }, now: Date.now(), work: [], conversationWork: [], liveTurns: service.liveTurns() });
    expect(others(listed.path)).toEqual([{ kind: "conversation", provider: "codex" }]);
    expect(others(".doan/canvases/a.html")).toEqual([]);
  });
  // Restart to Update asks on every conversation event, so this reads memory only.
  it("restartHolds counts running turns and the answers they wait for, from acceptance to the end", async () => {
    const h = fixture();
    expect(h.service.restartHolds()).toEqual({ liveTurns: 0, pendingAnswers: 0 });
    const id = (await h.service.start(request)).conversationId;
    expect(h.service.restartHolds()).toEqual({ liveTurns: 1, pendingAnswers: 0 });
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    expect(h.service.restartHolds()).toEqual({ liveTurns: 1, pendingAnswers: 1 });
    h.service.receive(id, { type: "permission.resolved", requestId: "r1", optionId: "allow" });
    expect(h.service.restartHolds()).toEqual({ liveTurns: 1, pendingAnswers: 0 });
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.restartHolds()).toEqual({ liveTurns: 0, pendingAnswers: 0 });
    const read = vi.spyOn(h.store, "list");
    h.service.restartHolds();
    expect(read).not.toHaveBeenCalled();
  });
  // A turn that ends without its terminal event keeps its unanswered requests in memory; they must not hold the
  // restart back for the rest of the session.
  it.each<[string, (h: ReturnType<typeof fixture>, id: string) => Promise<unknown> | unknown]>([
    ["a history that stopped taking writes", (h, id) => {
      vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
      vi.spyOn(console, "error").mockImplementation(() => {});
      h.service.receive(id, { type: "activity", kind: "read", title: "Read" } as never);
    }],
  ])("restartHolds no longer counts the answers of a turn ended by %s", async (_label, end) => {
    const h = fixture();
    const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    expect(h.service.restartHolds().pendingAnswers).toBe(1);
    await end(h, id);
    expect(h.service.restartHolds()).toMatchObject({ pendingAnswers: 0 });
    expect(h.service.liveTurns().get(id)?.running ?? false).toBe(false);
  });
  it.each<[string, (h: ReturnType<typeof fixture>, id: string) => Promise<unknown> | unknown]>([
    ["turn.done", (h, id) => h.service.receive(id, { type: "turn.done" })],
    ["turn.failed", (h, id) => h.service.receive(id, { type: "turn.failed", code: "unknown" })],
    ["a Stop", (h, id) => h.service.interrupt(id)],
    ["the process exiting", h => h.exits[0]?.()],
    ["the app quitting", h => h.service.quit()],
    ["a history that stopped taking writes", (h, id) => {
      vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
      vi.spyOn(console, "error").mockImplementation(() => {});
      h.service.receive(id, { type: "activity", kind: "read", title: "Read" } as never);
    }],
  ])("%s clears the conversation's work and ends its turn", async (_label, act) => {
    const h = fixture();
    const id = (await h.service.start(request)).conversationId; h.ended.length = 0;
    await act(h, id);
    expect(h.ended).toContain(id);
    expect(h.service.liveTurns().get(id)?.running ?? false).toBe(false);
  });
  it("another start on the same canvas keeps the running conversation's work, turn and answers", async () => {
    const h = fixture();
    const id = (await h.service.start(request)).conversationId; h.ended.length = 0;
    h.service.receive(id, { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    h.prepare.mockResolvedValueOnce({ ...prepared(), sessionId: "replacement" });
    await h.service.start(request);
    expect(h.ended).not.toContain(id);
    expect(h.service.liveTurns().get(id)?.running).toBe(true);
    expect(h.service.restartHolds()).toEqual({ liveTurns: 2, pendingAnswers: 1 });
  });
  it("a sign-out stopping the provider's runs clears the conversation's work", async () => {
    const h = fixture(); h.prepare.mockResolvedValue({ ...prepared(), owner: { kind: "doan", provider: "codex", connectionId: "c", accountId: "acct", workspaceId: "org", profile: "codex" } });
    const id = (await h.service.start(request)).conversationId; h.ended.length = 0;
    await h.service.stopRuns("codex");
    expect(h.ended).toContain(id);
    expect(h.service.liveTurns().get(id)?.running).toBe(false);
  });
  // A quit whose appQuit write fails still clears every conversation's work, and still reports the failure.
  it("a quit whose first interrupted write fails still clears the work of every conversation", async () => {
    const h = fixture();
    const first = (await h.service.start(request)).conversationId;
    h.prepare.mockResolvedValueOnce({ ...prepared(), sessionId: "second-session" });
    const second = (await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).conversationId;
    h.ended.length = 0;
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (body.type === "interrupted") throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      return append(cid, turn, body);
    });
    expect(() => h.service.quit()).toThrow("EIO");
    expect(h.ended).toEqual(expect.arrayContaining([first, second]));
    // The aborted quit leaves the conversations stopped, so no runner after the failed write may be left open.
    expect(h.runners).toHaveLength(2);
    for (const runner of h.runners) expect(runner.close).toHaveBeenCalled();
  });
  // One history's failed appQuit write cancels the quit, but the others still get theirs, and the next quit writes it again.
  // The failure is one a retry can fix (an I/O error), unlike the refusals below.
  it("a quit writes every other conversation's appQuit past a failed one and writes the failed one at the next quit", async () => {
    const h = fixture();
    const first = (await h.service.start(request)).conversationId;
    h.prepare.mockResolvedValueOnce({ ...prepared(), sessionId: "second-session" });
    const second = (await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).conversationId;
    const append = h.store.append.bind(h.store);
    let failed: string | undefined;
    const spy = vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (body.type === "interrupted" && failed === undefined) { failed = cid; throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" }); }
      return append(cid, turn, body);
    });
    expect(() => h.service.quit()).toThrow("EIO");
    const other = failed === first ? second : first;
    expect(h.store.read(other).filter(e => e.type === "interrupted")).toEqual([expect.objectContaining({ reason: "appQuit" })]);
    expect(h.store.read(failed!).some(e => e.type === "interrupted")).toBe(false);
    spy.mockRestore();
    await h.service.quit();
    for (const id of [first, second]) expect(h.store.read(id).filter(e => e.type === "interrupted")).toEqual([expect.objectContaining({ reason: "appQuit" })]);
  });
  // Like Stop, quit writes no interrupted event to a history that already refused one; that known refusal must not
  // abort the quit or keep a later conversation's runner open.
  it("a quit skips the appQuit write of a history that stopped taking writes and closes every runner", async () => {
    const h = fixture(); vi.spyOn(console, "error").mockImplementation(() => {});
    const first = (await h.service.start(request)).conversationId;
    h.prepare.mockResolvedValueOnce({ ...prepared(), sessionId: "second-session" });
    const second = (await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).conversationId;
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (cid === first) throw new Error("File exceeds limit");
      return append(cid, turn, body);
    });
    // The process is still alive, so the conversation stays busy until its group is observed gone.
    h.service.receive(first, { type: "activity", kind: "read", summary: "Read a.html" });
    await h.service.quit();
    for (const runner of h.runners) expect(runner.close).toHaveBeenCalled();
    expect(h.store.read(first).some(e => e.type === "interrupted")).toBe(false);
    expect(h.store.read(second).at(-1)).toMatchObject({ type: "interrupted", reason: "appQuit" });
  });
  // A history at its size limit, or whose last line is torn, refuses every later append too: a quit that cancelled for it
  // would be cancelled again at every later Cmd+Q, update install and logout, with nothing the person can do.
  it.each([
    ["at its size limit", () => new Error("File exceeds limit")],
    ["unreadable", () => new SyntaxError("Unexpected end of JSON input")],
    ["torn by a short write", () => new Error("Incomplete conversation write")],
  ])("a quit is not cancelled by an appQuit write a history %s refuses for good", async (_label, refusal) => {
    const h = fixture(); vi.spyOn(console, "error").mockImplementation(() => {});
    const first = (await h.service.start(request)).conversationId;
    h.prepare.mockResolvedValueOnce({ ...prepared(), sessionId: "second-session" });
    const second = (await h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).conversationId;
    const append = h.store.append.bind(h.store);
    const spy = vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (cid === first && body.type === "interrupted") throw refusal();
      return append(cid, turn, body);
    });
    await h.service.quit();
    for (const runner of h.runners) expect(runner.close).toHaveBeenCalled();
    expect(h.store.read(second).at(-1)).toMatchObject({ type: "interrupted", reason: "appQuit" });
    // Nothing is owed any more, so a second quit tries no write and is not cancelled either.
    spy.mockClear();
    await h.service.quit();
    expect(spy).not.toHaveBeenCalled();
  });
  it("a quit is not cancelled by a history whose last line is torn", async () => {
    const h = fixture(); vi.spyOn(console, "error").mockImplementation(() => {});
    const id = (await h.service.start(request)).conversationId;
    appendFileSync(join(h.dir, "conversations", `${id}.jsonl`), '{"v":1');
    expect(() => h.store.read(id)).toThrow(SyntaxError);
    await h.service.quit();
    await h.service.quit();
    for (const runner of h.runners) expect(runner.close).toHaveBeenCalled();
  });
  // A failure a retry could fix cancels one quit; when the next quit's retry fails as well, the history counts as
  // refusing, so no third Cmd+Q is needed.
  it("an appQuit write that keeps failing cancels only the first quit", async () => {
    const h = fixture(); vi.spyOn(console, "error").mockImplementation(() => {});
    const id = (await h.service.start(request)).conversationId;
    const append = h.store.append.bind(h.store);
    const spy = vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if (body.type === "interrupted") throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      return append(cid, turn, body);
    });
    expect(() => h.service.quit()).toThrow("EIO");
    await h.service.quit();
    expect(spy.mock.calls.filter(([cid, , body]) => cid === id && body.type === "interrupted")).toHaveLength(2);
    spy.mockClear();
    await h.service.quit();
    expect(spy).not.toHaveBeenCalled();
    for (const runner of h.runners) expect(runner.close).toHaveBeenCalled();
  });
  it("a deletion clears the conversation's work", async () => {
    const h = fixture(); const id = (await h.service.start(request)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.exits[0]?.(); h.ended.length = 0;
    h.service.delete(id);
    expect(h.ended).toEqual([id]);
    expect(h.service.liveTurns().has(id)).toBe(false);
  });
  it("a refused start and a refused send never report an end of a turn that was not accepted", async () => {
    const h = fixture(); h.prepare.mockRejectedValueOnce(new Error("session_unavailable"));
    await expect(h.service.start(request)).rejects.toThrow("session_unavailable");
    expect(h.ended).toEqual([]);
  });
});

// The conversation stores the person's Fast; the runner gets the turn's effective Fast, which ipc judges
// for a send and the QueueOptions callback for a start, a handoff and a queue flush.
describe("fast", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  const takes = (_root: string, _provider: string, model: string | undefined) => model !== "haiku";
  const lastTurn = (h: ReturnType<typeof homeFixture>) => vi.mocked(h.runners.at(-1)!.send).mock.calls.at(-1)![3];
  async function ended(h: ReturnType<typeof homeFixture>, id: string) { h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2](); }
  it("stores a start's Fast and runs it with Fast only when this run's list says its model takes it", async () => {
    const h = homeFixture([], { fast: takes });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "sonnet", fast: true })).conversationId;
    expect(h.store.list()[0]).toMatchObject({ fast: true });
    expect(h.open.mock.calls[0]![0]).toMatchObject({ fast: true });
    expect(h.service.list("/repo")[0]).toMatchObject({ fast: true });
    await ended(h, id);
    const other = (await h.service.start({ ...homeRequest, model: "haiku", fast: true })).conversationId;
    expect(h.store.list().find(m => m.conversationId === other)).toMatchObject({ fast: true });
    expect(h.open.mock.calls[1]![0]).not.toHaveProperty("fast");
    const off = (await h.service.start({ ...homeRequest, mode: "new", canvas: { path: ".doan/canvases/b.html" }, fast: false })).conversationId;
    expect(h.store.list().find(m => m.conversationId === off)).not.toHaveProperty("fast");
    expect(h.open.mock.calls[2]![0]).not.toHaveProperty("fast");
  });
  it("runs no start with Fast without the callback, which only this run's list answers", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas, fast: true });
    expect(h.store.list()[0]).toMatchObject({ fast: true });
    expect(h.open.mock.calls[0]![0]).not.toHaveProperty("fast");
  });
  it("stores a send's Fast choice, runs the turn's Fast as ipc judged it, and keeps the choice across a model without Fast", async () => {
    const h = homeFixture([], { fast: takes });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "sonnet" })).conversationId;
    await ended(h, id);
    await h.service.send(id, "fast", [], { fast: true, fastTurn: true });
    expect(h.store.list()[0]).toMatchObject({ model: "sonnet", fast: true });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ fast: true });
    await ended(h, id);
    // A model without Fast: no Fast for the turn, the stored choice stays.
    await h.service.send(id, "plain", [], { model: "haiku" });
    expect(h.store.list()[0]).toMatchObject({ model: "haiku", fast: true });
    expect(h.open.mock.calls.at(-1)![0]).not.toHaveProperty("fast");
    await ended(h, id);
    await h.service.send(id, "back", [], { model: "opus", fastTurn: true });
    expect(h.store.list()[0]).toMatchObject({ model: "opus", fast: true });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ fast: true });
    await ended(h, id);
    await h.service.send(id, "off", [], { fast: false });
    expect(h.store.list()[0]).not.toHaveProperty("fast");
    expect(h.store.list()[0]).toMatchObject({ model: "opus" });
    expect(h.open.mock.calls.at(-1)![0]).not.toHaveProperty("fast");
  });
  it("names the turn's Fast on every turn of a reused Codex server", async () => {
    const h = homeFixture([], { fast: takes });
    const codex = { ...h.owner, provider: "codex" as const };
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "codex", configDir: "/config", cwd: "/repo", command: "/fake", env: {}, owner: codex, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, runtime: "codex", model: "gpt-6-luna", fast: true })).conversationId;
    expect(h.open.mock.calls[0]![0]).toMatchObject({ fast: true });
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "again", [], { fastTurn: true });
    expect(lastTurn(h)).toEqual({ model: "gpt-6-luna", permissionMode: "default", fast: true });
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "off", [], { fast: false });
    expect(lastTurn(h)).toEqual({ model: "gpt-6-luna", permissionMode: "default" });
    expect(h.open).toHaveBeenCalledOnce();
  });
  it("sends a queue with the Fast stored when it goes out, judged for the model it goes out on", async () => {
    const h = homeFixture([], { fast: takes });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "sonnet", fast: true })).conversationId;
    h.service.queue(id, { text: "one", anchors: [] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.open.mock.calls[1]![0]).toMatchObject({ fast: true });
    // Stored off while the turn runs: the queue goes out without Fast.
    h.service.queue(id, { text: "two", anchors: [] });
    h.store.save(h.store.list().map(({ fast: _fast, ...m }) => m));
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[1]![2]();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(3));
    expect(h.open.mock.calls[2]![0]).not.toHaveProperty("fast");
    // On a model without Fast the stored choice stays and the turn goes without it.
    h.service.queue(id, { text: "three", anchors: [] });
    h.store.save(h.store.list().map(m => ({ ...m, model: "haiku", fast: true as const })));
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[2]![2]();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(4));
    expect(h.open.mock.calls[3]![0]).not.toHaveProperty("fast");
    expect(h.store.list()[0]).toMatchObject({ model: "haiku", fast: true });
  });
  it("names the stored Fast in the send target", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "sonnet", fast: true })).conversationId;
    expect(h.service.sendTarget(id)).toMatchObject({ model: "sonnet", fast: true });
  });
});

// A reason that goes on turns the conversation's Fast off in the flow that records the event.
describe("fast turned off", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  it("clears the stored Fast when the turn records a fast.unused that turned it off, and keeps it otherwise", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    h.service.receive(id, { type: "fast.unused", reason: "cooldown" });
    expect(h.store.list()[0]).toMatchObject({ fast: true });
    h.service.receive(id, { type: "fast.unused" });
    expect(h.store.list()[0]).toMatchObject({ fast: true });
    // The list announced after the index changed, so the composer reads Fast off.
    const listed: unknown[] = []; h.changes.length = 0;
    const changes = h.changes; vi.spyOn(changes, "push").mockImplementation((...roots) => { listed.push(h.service.list("/repo")[0]!.fast); return Array.prototype.push.apply(changes, roots); });
    h.service.receive(id, { type: "fast.unused", reason: "extra_usage", turnedOff: true });
    expect(listed.at(-1)).toBeUndefined();
    expect(h.store.list()[0]).not.toHaveProperty("fast");
    expect(h.store.list()[0]).toMatchObject({ model: "opus" });
    expect(h.store.read(id).filter(e => e.type === "fast.unused")).toHaveLength(3);
    expect(h.service.list("/repo")[0]).not.toHaveProperty("fast");
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    // The next send that names no Fast runs without it.
    await h.service.send(id, "again", []);
    expect(h.open.mock.calls.at(-1)![0]).not.toHaveProperty("fast");
  });
  it("turns Fast off before a queue held for the turn goes out", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "fast.unused", reason: "plan", turnedOff: true });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.open.mock.calls[1]![0]).not.toHaveProperty("fast");
  });
  it("leaves a conversation whose Fast is already off alone, and reading the history again turns nothing off", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    h.service.receive(id, { type: "fast.unused", reason: "plan", turnedOff: true });
    h.service.receive(id, { type: "turn.done" });
    const save = vi.spyOn(h.store, "save");
    h.store.save(h.store.list().map(m => ({ ...m, fast: true as const })));
    save.mockClear();
    h.service.read(id); h.service.list("/repo");
    expect(save).not.toHaveBeenCalled();
    expect(h.store.list()[0]).toMatchObject({ fast: true });
  });
});

// A turn-off whose index write fails takes the persistence-failure path. Nothing claims Fast
// went off while the index still holds it, and nothing runs on as if it had.
describe("fast turned off, index write failed", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  it("records no notice, stops the turn and its queue, and the next run after a restart still has the stored Fast", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    const save = vi.spyOn(h.store, "save").mockImplementationOnce(() => { throw new Error("EACCES"); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(id, { type: "fast.unused", reason: "plan", turnedOff: true });
    expect(save).toHaveBeenCalled(); expect(errors).toHaveBeenCalled();
    // The index still says Fast; no history line or published event says it went off.
    expect(h.store.list()[0]).toMatchObject({ fast: true });
    expect(h.service.list("/repo")[0]).toMatchObject({ fast: true });
    expect(h.store.read(id).some(e => e.type === "fast.unused")).toBe(false);
    expect(h.published.some(e => e.type === "fast.unused")).toBe(false);
    // The history stopped taking writes: the runner closes, the turn's end is not recorded and nothing goes out after it.
    expect(h.runners[0]!.close).toHaveBeenCalled();
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.read(id).some(e => e.type === "turn.done")).toBe(false);
    h.open.mock.calls[0]![2]();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.open).toHaveBeenCalledOnce();
    // The queue comes back as after a failed turn once the process is gone.
    expect(h.service.takeDraft(id)).toMatchObject({ text: "next", reason: "turn_failed" });
    // After a restart the stored Fast still holds, so the next run asks for it and can be judged again.
    const restarted = new ConversationService(new ConversationStore(h.dir), h.prepare, h.open, () => {}, undefined, 10_000, () => [], () => {}, { fast: () => true });
    await restarted.send(id, "again", [], { fastTurn: true });
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.open.mock.calls[1]![0]).toMatchObject({ fast: true });
    restarted.receive(id, { type: "fast.unused", reason: "plan", turnedOff: true });
    expect(new ConversationStore(h.dir).list()[0]).not.toHaveProperty("fast");
    expect(new ConversationStore(h.dir).read(id).filter(e => e.type === "fast.unused")).toEqual([expect.objectContaining({ reason: "plan", turnedOff: true })]);
  });
});

// Pins for a run's Fast around Send now and a send right after a turn-off.
describe("fast kept", () => {
  const canvas = { path: ".doan/canvases/a.html", id: "a" };
  it("puts a Send now message into the running Fast turn without opening or sending another run", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    const runner = h.runners[0]!; runner.steer = vi.fn(async () => {});
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    await vi.waitFor(() => expect(runner.steer).toHaveBeenCalledOnce());
    h.open.mock.calls[0]![0].steerConsumed!(vi.mocked(runner.steer).mock.calls[0]![2]);
    await sent;
    expect(h.open).toHaveBeenCalledOnce();
    expect(h.open.mock.calls[0]![0]).toMatchObject({ fast: true });
    expect(runner.send).toHaveBeenCalledOnce();
    expect(h.store.list()[0]).toMatchObject({ fast: true });
  });
  it("turns Fast on again with a send right after a turn-off, which runs with it", async () => {
    const h = homeFixture([], { fast: () => true });
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, model: "opus", fast: true })).conversationId;
    h.service.receive(id, { type: "fast.unused", reason: "extra_usage", turnedOff: true });
    h.service.receive(id, { type: "turn.done" });
    expect(h.store.list()[0]).not.toHaveProperty("fast");
    // Sent while the turned-off turn's process is still exiting: the send waits, then stores and runs its Fast.
    const sending = h.service.send(id, "fast again", [], { fast: true, fastTurn: true });
    h.open.mock.calls[0]![2]();
    await sending;
    expect(h.store.list()[0]).toMatchObject({ model: "opus", fast: true });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ fast: true });
    expect(h.store.read(id).filter(e => e.type === "fast.unused")).toHaveLength(1);
  });
});

// A turn whose history stopped taking writes can save no terminal event. Once its process group is gone the
// conversation stops working, its queue comes back as after a failed turn, and the next send starts a new turn.
describe("a history that stopped taking writes", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  type Way = "a write while the process runs" | "the exit's own turn.failed" | "a transport failure's turn.failed";
  const row = (h: ReturnType<typeof homeFixture>, id: string) => h.service.list("/repo").find(s => s.conversationId === id)!;
  // An earlier conversation of the canvas (its process gone) and a later one, running, with a queued message.
  async function running(h: ReturnType<typeof homeFixture>, way?: Way) {
    const old = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(old, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    let breakTransport = () => {};
    if (way === "a transport failure's turn.failed") h.open.mockImplementationOnce(async input => {
      const send = vi.fn(() => new Promise<void>((_resolve, reject) => { breakTransport = () => reject(new Error("write EPIPE")); }));
      const runner: Runner = { sessionId: input.sessionId ?? "s2", send, answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
      h.runners.push(runner); return runner;
    });
    const current = (await h.service.start(canvasStart)).conversationId;
    h.service.queue(current, { text: "next", anchors: [] });
    return { old, current, runner: h.runners.at(-1)!, exit: h.open.mock.calls.at(-1)![2], breakTransport: () => breakTransport() };
  }
  // The write fails once; the history takes writes again afterwards.
  function failOnce(h: ReturnType<typeof homeFixture>) {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); }).mockImplementation(append);
  }
  async function failed(h: ReturnType<typeof homeFixture>, way: Way) {
    const turn = await running(h, way);
    if (way === "a write while the process runs") { failOnce(h); h.service.receive(turn.current, { type: "activity", kind: "read", summary: "Read a.html" }); }
    if (way === "a transport failure's turn.failed") { failOnce(h); turn.breakTransport(); await vi.waitFor(() => expect(turn.runner.close).toHaveBeenCalled()); }
    if (way === "the exit's own turn.failed") { failOnce(h); turn.exit(); }
    else turn.exit();
    return turn;
  }
  const ways: Way[] = ["a write while the process runs", "the exit's own turn.failed", "a transport failure's turn.failed"];
  it.each(ways)("ends the conversation's work once its process is gone (%s)", async way => {
    const h = homeFixture([a], { admit: true });
    const { current } = await failed(h, way);
    expect(row(h, current)).toMatchObject({ working: false, phase: "ended" });
    expect(h.store.read(current).filter(e => e.type === "user.message")).toHaveLength(1);
    expect(h.service.takeDraft(current)).toMatchObject({ text: "next", reason: "turn_failed" });
    h.service.delete(current);
    expect(h.store.list().some(m => m.conversationId === current)).toBe(false);
  });
  it.each(ways)("lets the canvas's other conversation send and leaves this one's history as it was (%s)", async way => {
    const h = homeFixture([a], { admit: true });
    const { old, current } = await failed(h, way);
    const before = h.store.read(current);
    await h.service.send(old, "back to this one", []);
    expect(h.store.read(old).slice(-2).map(e => e.type)).toEqual(["user.message", "turn.started"]);
    expect(h.store.read(current)).toEqual(before);
  });
  it.each(ways)("starts a new turn with the next send (%s)", async way => {
    const h = homeFixture([a], { admit: true });
    const { current } = await failed(h, way);
    const opened = h.open.mock.calls.length;
    await h.service.send(current, "again", []);
    expect(h.open).toHaveBeenCalledTimes(opened + 1);
    expect(h.store.read(current).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual(["Make a pricing page", "again"]);
    expect(row(h, current)).toMatchObject({ working: true });
    expect(h.service.read(current).turn).toBe("starting");
  });
  it.each<Way>(["a write while the process runs", "a transport failure's turn.failed"])("stays working until the process is gone; a Stop ends its group and a send waits for it (%s)", async way => {
    const h = homeFixture([a], { admit: true });
    const turn = await running(h, way);
    failOnce(h);
    if (way === "a write while the process runs") h.service.receive(turn.current, { type: "activity", kind: "read", summary: "Read a.html" });
    else turn.breakTransport();
    await vi.waitFor(() => expect(turn.runner.close).toHaveBeenCalledOnce());
    expect(row(h, turn.current)).toMatchObject({ working: true });
    expect(() => h.service.delete(turn.current)).toThrow("busy");
    await h.service.interrupt(turn.current);
    expect(turn.runner.close).toHaveBeenCalledTimes(2);
    expect(row(h, turn.current)).toMatchObject({ working: true });
    const opened = h.open.mock.calls.length;
    let settled = false;
    const sending = h.service.send(turn.current, "again", []).finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(settled).toBe(false); expect(h.open).toHaveBeenCalledTimes(opened);
    turn.exit();
    await sending;
    expect(h.open).toHaveBeenCalledTimes(opened + 1);
    expect(h.service.takeDraft(turn.current)).toMatchObject({ text: "next", reason: "turn_failed" });
    expect(h.store.read(turn.current).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual(["Make a pricing page", "again"]);
  });
  // A Codex server is reused between turns unless it is closed; the one closed over a failed write must be waited out.
  it("makes a Codex conversation's send wait for the closed server's exit instead of refusing it as busy", async () => {
    const h = homeFixture([a], { admit: true });
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, sessionId: stored?.session.sessionId ?? "codex-session" }));
    const current = (await h.service.start({ ...canvasStart, runtime: "codex" })).conversationId;
    const runner = h.runners.at(-1)!, exit = h.open.mock.calls.at(-1)![2];
    failOnce(h);
    h.service.receive(current, { type: "activity", kind: "read", summary: "Read a.html" });
    await vi.waitFor(() => expect(runner.close).toHaveBeenCalledOnce());
    const opened = h.open.mock.calls.length;
    let settled = false;
    const sending = h.service.send(current, "again", []).finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(settled).toBe(false); expect(h.open).toHaveBeenCalledTimes(opened);
    exit();
    await sending;
    expect(h.open).toHaveBeenCalledTimes(opened + 1);
    expect(h.store.read(current).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual(["Make a pricing page", "again"]);
  });
  it("refuses the next send as a first write that failed when the history still takes no writes", async () => {
    const h = homeFixture([a], { admit: true });
    const { current } = await running(h);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(h.store, "appendAll").mockImplementation(() => { throw new Error("File exceeds limit"); });
    h.service.receive(current, { type: "activity", kind: "read", summary: "Read a.html" });
    h.open.mock.calls.at(-1)![2]();
    const runners = h.runners.length;
    await expect(h.service.send(current, "again", [])).rejects.toThrow("File exceeds limit");
    expect(h.runners[runners]!.close).toHaveBeenCalled();
    expect(row(h, current)).toMatchObject({ working: false });
  });
  it("only logs when the queue cannot be handed back", async () => {
    const h = homeFixture([a], { admit: true });
    const turn = await running(h);
    failOnce(h);
    h.service.receive(turn.current, { type: "activity", kind: "read", summary: "Read a.html" });
    const errors = vi.mocked(console.error); errors.mockClear();
    vi.spyOn(h.drafts, "giveBackQueued").mockImplementation(() => { throw new Error("EACCES"); });
    expect(() => turn.exit()).not.toThrow();
    expect(errors).toHaveBeenCalledWith("doan: queued messages could not be handed back", expect.any(Error));
    expect(row(h, turn.current)).toMatchObject({ working: false, phase: "ended" });
  });
  it("ends a project conversation whose history stopped taking writes once its process is gone", async () => {
    const h = homeFixture();
    const first = (await h.service.start(homeRequest)).conversationId;
    failOnce(h);
    h.service.receive(first, { type: "activity", kind: "read", summary: "Read a.html" });
    h.open.mock.calls[0]![2]();
    expect(row(h, first)).toMatchObject({ working: false });
  });
});
