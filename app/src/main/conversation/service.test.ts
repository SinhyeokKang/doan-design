import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HOME_GUIDANCE, PRESET_GUIDANCE } from "./prompt";
import { ConversationService, resolveListedCanvas, type Runner, type OpenRunner, type Prepare, type QueueFiles } from "./service";
import { DraftStore } from "./drafts";
import type { Canvas, ConversationEvent } from "./types";
import { storedAnswers } from "./transport";
import { foldConversation } from "./state";
const paths: string[] = []; afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; const exits: (() => void)[] = [];
  let hold: (() => void) | undefined;
  const open = vi.fn<OpenRunner>(async (input, emit, exited) => {
    exits.push(exited); if (hold) await new Promise<void>(resolve => { hold = resolve; });
    const runner: Runner = { sessionId: input.sessionId ?? "new-session", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async () => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }));
  const service = new ConversationService(store, prepare, open, () => {});
  return { service, store, runners, exits, prepare, open, hold: () => { hold = () => {}; }, release: () => hold?.() };
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
  await h.service.interrupt(id); await expect(h.service.start({ ...request, canvas: { path: ".doan/canvases/b.html" } })).rejects.toThrow("session_in_use");
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
// mcp-connectors C1: a reused Codex server reloads its MCP servers before the next turn when a Connect, Disconnect,
// Remove or replacement changed the provider's connectors since it opened (design 'reload 배선').
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
it("keeps archived history read-only and persists quit interruption synchronously", async () => {
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
it("does not archive or log a start whose new session ID collides with another owner", async () => {
  const h = fixture(); h.prepare.mockResolvedValue({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} });
  const first = await h.service.start({ ...request, mode: "new", runtime: "codex" });
  await expect(h.service.start({ ...request, mode: "new", runtime: "codex" })).rejects.toThrow("session_in_use");
  expect(h.store.list()).toHaveLength(1); expect(h.store.list()[0]?.state).toBe("current");
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
  await h.service.start({ ...request, mode: "new", runtime: "codex" });
  await expect(h.service.start({ ...request, mode: "new", runtime: "codex" })).rejects.toThrow("session_in_use");
  h.exits[0]?.();
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

it("rejects a pending send archived during preparation and ignores late runner callbacks", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  let release = () => {};
  h.prepare.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }); }));
  const pending = h.service.send(id, "late", []);
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  await h.service.start(request); const before = h.store.read(id);
  release(); await expect(pending).rejects.toThrow("busy");
  h.service.receive(id, { type: "message.delta", messageId: "late", text: "late" });
  expect(h.store.read(id)).toEqual(before); expect(h.runners[0]?.send).toHaveBeenCalledTimes(1);
});

it.each(["corrupt", "archive", "new-log", "index", "prompt"])("preserves prior current and history when replacement fails at %s", async boundary => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); const before = h.store.read(id); const index = h.store.list();
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  if (boundary === "corrupt") writeFileSync(join(paths.at(-1)!, "conversations", id + ".jsonl"), "corrupt\n");
  if (boundary === "archive" || boundary === "new-log") {
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((cid, turn, body) => {
      if ((boundary === "archive" && body.type === "conversation.archived") || (boundary === "new-log" && cid !== id && body.type === "turn.started")) throw new Error("injected");
      return append(cid, turn, body);
    });
  }
  if (boundary === "index") vi.spyOn(h.store, "save").mockImplementationOnce(() => { throw new Error("injected"); });
  await expect(h.service.start({ ...request, text: boundary === "prompt" ? "{{1}}" : request.text })).rejects.toThrow();
  expect(h.store.list()).toEqual(index);
  const restarted = new ConversationStore(paths.at(-1)!); expect(restarted.list()).toEqual(index);
  if (boundary !== "corrupt") expect(restarted.read(id)).toEqual(before);
  expect(h.runners[0]?.close).not.toHaveBeenCalled();
});

it("refreshes a moved stable canvas before preparation and send acceptance", async () => {
  const h = fixture(); let listed = { id: "a", path: ".doan/canvases/a.html" };
  const service = new ConversationService(h.store, h.prepare, h.open, () => {}, (_root, canvas) => {
    if (!canvas || canvas.id !== listed.id) throw new Error("canvas_not_found");
    return listed;
  });
  const id = (await service.start({ ...request, canvas: listed })).conversationId;
  service.receive(id, { type: "turn.done" }); listed = { ...listed, path: ".doan/canvases/moved.html" };
  expect(service.forCanvas(request.root, listed).current?.canvas).toEqual(listed);
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

it("rechecks archive status after an awaited runner opening", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); h.exits[0]?.();
  let release = () => {}; const send = vi.fn(async () => {}); const close = vi.fn(async () => {});
  h.open.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { sessionId: "same-session", send, close, stop: close, answer: () => false }; });
  const pending = h.service.send(id, "late opening", []);
  await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  await h.service.start(request); const before = h.store.read(id);
  release(); await expect(pending).rejects.toThrow("busy");
  expect(send).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce(); expect(h.store.read(id)).toEqual(before);
});
it("retains accepted replacement and emits terminal failure for a transport error", async () => {
  const h = fixture(); const old = (await h.service.start(request)).conversationId;
  h.service.receive(old, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  h.open.mockResolvedValueOnce({ sessionId: "replacement", send: async () => { throw new Error("transport broke"); }, close: async () => {}, stop: async () => {}, answer: () => false });
  const next = (await h.service.start(request)).conversationId;
  expect(h.store.list().find(m => m.conversationId === old)?.state).toBe("archived");
  expect(h.store.list().find(m => m.conversationId === next)?.state).toBe("current");
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
it("restores an archived conversation only after its closing process is gone (POSTMORTEM 2026-10-28)", async () => {
  const h = perTurn(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ ...claudeTurn, sessionId: "replacement" });
  const current = (await h.service.start(request)).conversationId;
  h.service.receive(current, { type: "turn.done" }); h.exits[1]!();
  let sent = false; const pending = h.service.send(id, "back", []).then(() => { sent = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(sent).toBe(false); expect(h.open).toHaveBeenCalledTimes(2);
  h.exits[0]!(); await pending;
  expect(h.open).toHaveBeenCalledTimes(3);
  expect(h.store.list().find(m => m.conversationId === id)!.state).toBe("current");
  expect(h.store.list().find(m => m.conversationId === current)!.state).toBe("archived");
});
it("never reuses the closing Codex server of an archived conversation", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", sessionId: "replacement", command: "/fake", env: {} });
  const current = (await h.service.start(request)).conversationId;
  expect(h.runners[0]?.close).toHaveBeenCalledOnce();
  h.service.receive(current, { type: "turn.done" });
  const pending = h.service.send(id, "back", []);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(h.open).toHaveBeenCalledTimes(2);
  h.exits[0]!(); await pending;
  expect(h.open).toHaveBeenCalledTimes(3);
  expect(h.runners[0]?.send).toHaveBeenCalledOnce(); expect(h.runners[2]?.send).toHaveBeenCalledOnce();
});
it("sends the fixed preset guidance on a follow-up turn as on the first", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  await h.service.send(id, "next", []);
  const prompts = h.runners.flatMap(r => vi.mocked(r.send).mock.calls.map(call => call[0]));
  expect(prompts).toHaveLength(2);
  for (const prompt of prompts) expect(prompt).toContain(PRESET_GUIDANCE);
});

// buzz-home: Home starts (newDesign), chosen models, attachments and binding by start-time lists.
// admit: resolve a canvas against the listed rows as main does (restore needs it); files: the queue's attachment hooks.
function homeFixture(canvases: { path: string; id?: string }[] = [], options: { admit?: boolean; files?: QueueFiles } = {}) {
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
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, 10_000, () => listed, root => changes.push(root), { drafts, ...(options.files ? { files: options.files } : {}) }, id => deleted.push(id));
  // Moves the clock the project limit reads past the binding window of every turn that ended so far.
  let skew = 0; const now = Date.now; vi.spyOn(Date, "now").mockImplementation(() => now() + skew);
  return { dir, service, store, runners, open, prepare, listed, changes, published, owner, drafts, deleted, passBindingWindow: () => { skew += 10_001; } };
}
const homeRequest = { root: "/repo", mode: "newDesign" as const, runtime: "claude" as const, text: "Make a pricing page", anchors: [] };
it("runs a Home start with its chosen model and effort, records them, and applies them again on the next send", async () => {
  const h = homeFixture();
  const id = (await h.service.start({ ...homeRequest, model: "sonnet", effort: "low" })).conversationId;
  expect(h.open.mock.calls[0]![0]).toMatchObject({ model: "sonnet", effort: "low" });
  expect(h.store.list()[0]).toMatchObject({ model: "sonnet", effort: "low", canvasesAtStart: [] });
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
// buzz-conversation M4: a project turn is judged once it ended, at the first folder refresh or the window's end.
it("binds a new canvas at the first folder refresh after the turn ends, never while it runs, and frees the root", async () => {
  const h = homeFixture([{ path: ".doan/canvases/old.html", id: "old" }]);
  const id = (await h.service.start(homeRequest)).conversationId;
  expect(h.store.list()[0]!.canvasesAtStart).toEqual([{ path: ".doan/canvases/old.html", id: "old" }]);
  h.listed.push({ path: ".doan/canvases/new.html", id: "new" });
  h.service.refreshed("/repo", [".doan/canvases/new.html"]);
  expect(h.store.list()[0]!.canvas).toBeUndefined();
  h.service.receive(id, { type: "turn.done" });
  h.changes.length = 0;
  h.service.refreshed("/repo", []);
  expect(h.store.list().find(m => m.conversationId === id)!.canvas).toEqual({ path: ".doan/canvases/new.html", id: "new" });
  expect(h.store.read(id).at(-1)).toMatchObject({ type: "conversation.bound", canvas: { path: ".doan/canvases/new.html", id: "new" } });
  expect(h.published.at(-1)).toMatchObject({ conversationId: id, type: "conversation.bound" });
  expect(h.changes).toContain("/repo");
  // Judged: another project conversation may start at once, inside what used to be the window.
  await h.service.start(homeRequest);
});
// canvas-row-menu: Move to Trash reads an unjudged project turn's grounds.
it("hands out a project turn's edits and changed paths while it runs and within the binding window, and none after its judgement", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  expect(h.service.projectEvidence("/repo")).toEqual([{ edits: [], changed: [] }]);
  h.service.receive(id, { type: "activity", kind: "edit", summary: "Edit", path: "/repo/.doan/canvases/a.html" });
  h.service.refreshed("/repo", [".doan/canvases/b.html"]);
  const running = h.service.projectEvidence("/repo");
  expect(running).toEqual([{ edits: ["/repo/.doan/canvases/a.html"], changed: [".doan/canvases/b.html"] }]);
  // Copies: a caller cannot change the grounds.
  running[0]!.edits.push("/repo/x.html");
  expect(h.service.projectEvidence("/repo")[0]!.edits).toEqual(["/repo/.doan/canvases/a.html"]);
  // Exactly the root: another worktree's path is another root.
  expect(h.service.projectEvidence("/repo-wt")).toEqual([]);
  expect(h.service.projectEvidence("/rep")).toEqual([]);
  h.service.receive(id, { type: "turn.done" });
  expect(h.service.projectEvidence("/repo")).toEqual([{ edits: ["/repo/.doan/canvases/a.html"], changed: [".doan/canvases/b.html"] }]);
  h.service.refreshed("/repo", []);
  expect(h.service.projectEvidence("/repo")).toEqual([]);
});
it("hands out no grounds for a turn whose binding window passed before its judgement ran", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.passBindingWindow();
  expect(h.service.projectEvidence("/repo")).toEqual([]);
});
it("never lets a turn judged without a canvas take a canvas made later", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.service.refreshed("/repo", []);
  h.listed.push({ path: ".doan/canvases/someone-else.html" });
  h.service.refreshed("/repo", [".doan/canvases/someone-else.html"]);
  expect(h.store.list()[0]!.canvas).toBeUndefined();
  expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done"]);
});
it("judges at the end of the binding window when no folder refresh came after the turn", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  // The folder list caught up without a refresh after the turn's end reaching the service.
  h.listed.push({ path: ".doan/canvases/late.html" });
  h.passBindingWindow();
  const other = (await h.service.start(homeRequest)).conversationId;
  expect(h.store.list().find(m => m.conversationId === id)!.canvas).toEqual({ path: ".doan/canvases/late.html" });
  expect(h.store.list().find(m => m.conversationId === other)!.canvas).toBeUndefined();
});
it("judges by its own timer at the end of the binding window", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, { type: "turn.done" });
    h.listed.push({ path: ".doan/canvases/late.html" });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(h.store.list().find(m => m.conversationId === id)!.canvas).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(h.store.list().find(m => m.conversationId === id)!.canvas).toEqual({ path: ".doan/canvases/late.html" });
  } finally { vi.useRealTimers(); }
});
it("binds nothing for conversations of a previous run", async () => {
  const h = homeFixture();
  const first = (await h.service.start(homeRequest)).conversationId;
  h.service.receive(first, { type: "turn.done" });
  // After a restart nothing is running: a new canvas binds to none of them.
  const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => h.listed);
  h.listed.push({ path: ".doan/canvases/b.html" });
  restarted.refreshed("/repo", [".doan/canvases/b.html"]);
  expect(h.store.list().find(m => m.conversationId === first)!.canvas).toBeUndefined();
});

// buzz-home fix round 1: model-list reads are owned runs (quit and sign-out stop them; the lease goes with the group).
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
  const reading = h.service.listModels(input, async (_input, gone, registerStop) => {
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
  void h.service.listModels(input, async (_input, _gone, registerStop) => { registerStop(stop); return new Promise(() => {}); });
  await vi.waitFor(() => expect(h.prepare).toHaveBeenCalled());
  await h.service.stopRuns("codex");
  expect(stop).not.toHaveBeenCalled();
});
it("keeps the lease of a model-list group that never disappears, even after its list came back", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "copilot");
  expect(await h.service.listModels(input, async (_input, _gone, registerStop) => { registerStop(async () => {}); return { models: [{ id: "auto", label: "Auto", default: true }] }; })).toEqual({ models: [{ id: "auto", label: "Auto", default: true }] });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(h.release).not.toHaveBeenCalled();
});
it("stops a model-list process that spawns after its provider was stopped", async () => {
  const h = listingFixture();
  const input = await h.service.prepareListing("/repo", "cursor");
  let spawn!: () => void; const stop = vi.fn(async () => {});
  const reading = h.service.listModels(input, async (_input, _gone, registerStop) => { await new Promise<void>(resolve => { spawn = resolve; }); registerStop(stop); return { models: [] }; });
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
  await expect(h.service.listModels(input, async () => { throw new Error("not_logged_in"); })).rejects.toThrow("not_logged_in");
  await vi.waitFor(() => expect(h.release).toHaveBeenCalledOnce());
});

// buzz-home fix round 1: Home's paragraph follows the conversation's origin, not its binding.
it("drops Home's paragraph once a Home conversation is promoted to a canvas, and keeps it before that", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  expect(h.store.list()[0]).toMatchObject({ fromHome: true });
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
  h.service.refreshed("/repo", []);
  await h.service.send(id, "still a project conversation", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).toContain(HOME_GUIDANCE);
  h.listed.push({ path: ".doan/canvases/made.html" });
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
  h.service.refreshed("/repo", [".doan/canvases/made.html"]);
  await h.service.send(id, "make it darker", []);
  expect(h.store.list()[0]!.canvas).toEqual({ path: ".doan/canvases/made.html" });
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
});
it("never adds Home's paragraph to an entry without the Home mark", async () => {
  const h = homeFixture();
  const id = (await h.service.start(homeRequest)).conversationId;
  h.store.save(h.store.list().map(m => { const { fromHome: _mark, ...old } = m; return old; }));
  expect(h.store.list()[0]).not.toHaveProperty("fromHome");
  h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2](); h.service.refreshed("/repo", []);
  await h.service.send(id, "again", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
  // An entry written before the mark existed (a Home start of an earlier build) reads and gets no paragraph.
  h.service.receive(id, { type: "turn.done" }); h.passBindingWindow();
  const second = (await h.service.start(homeRequest)).conversationId;
  h.store.save(h.store.list().map(m => { if (m.conversationId !== second) return m; const { fromHome: _mark, ...old } = m; return old; }));
  h.service.receive(second, { type: "turn.done" }); h.open.mock.calls.at(-1)![2](); h.service.refreshed("/repo", []);
  await h.service.send(second, "again", []);
  expect(vi.mocked(h.runners.at(-1)!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
});

// buzz-conversation M1: the project's conversation list and the seen marker.
describe("conversation list", () => {
  const legacyEntry = (id: string) => ({ conversationId: id, root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: id, state: "current" as const, owner: { kind: "legacy-external" as const },
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

// buzz-conversation M2: one working project conversation per root.
describe("project conversation limit", () => {
  const canvasRequest = { ...homeRequest, mode: "new" as const, canvas: { path: ".doan/canvases/a.html" } };
  it("refuses another project start while one is still preparing, though it is not in the index yet", async () => {
    const h = homeFixture(); let open!: () => void;
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { open = resolve; }); return prepared(...args); });
    const first = h.service.start(homeRequest);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledOnce());
    expect(h.store.list()).toEqual([]);
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    // Canvas conversations and other roots are not limited.
    await h.service.start(canvasRequest);
    await h.service.start({ ...homeRequest, root: "/other" });
    open(); await first;
  });
  const ask = (requestId: string) => ({ type: "permission.request" as const, requestId, tool: "Write", summary: "Write a.html", options: [{ id: "allow", label: "Allow", kind: "allow" as const }] });
  const answered = (requestId: string) => ({ type: "permission.resolved" as const, requestId, optionId: "allow" });
  // canvas-composer-polish spec 4: a turn waiting for the person's answer does not keep the root.
  it("refuses another project send while a project turn runs or just ended, and takes one while it waits for an answer", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, { type: "turn.done" }); h.open.mock.calls[0]![2](); h.passBindingWindow();
    const b = (await h.service.start(homeRequest)).conversationId;
    await expect(h.service.send(a, "again", [])).rejects.toThrow("project_busy");
    h.service.receive(b, ask("r"));
    await h.service.send(a, "again", []);
    expect(h.store.read(a).filter(e => e.type === "user.message")).toHaveLength(2);
    // Both turns run once b has its answer; a's next send waits until b is done and judged.
    h.service.receive(b, answered("r"));
    h.service.receive(a, { type: "turn.done" }); h.open.mock.calls[2]![2](); h.service.refreshed("/repo", []);
    await expect(h.service.send(a, "and again", [])).rejects.toThrow("project_busy");
    h.service.receive(b, { type: "turn.done" });
    await expect(h.service.send(a, "and again", [])).rejects.toThrow("project_busy");
    h.passBindingWindow();
    await h.service.send(a, "and again", []);
    // The conversation's own next send is not limited by its own window.
    h.service.receive(a, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    await h.service.send(a, "once more", []);
  });
  it("keeps counting a project turn that made a canvas until the turn is judged, except while it waits for an answer", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    h.listed.push({ path: ".doan/canvases/made.html", id: "made" });
    h.service.refreshed("/repo", [".doan/canvases/made.html"]);
    expect(h.store.list()[0]!.canvas).toBeUndefined();
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.service.receive(a, ask("r"));
    const b = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, answered("r"));
    h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
    h.service.receive(a, { type: "turn.done" });
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.service.refreshed("/repo", []);
    expect(h.store.list().find(m => m.conversationId === a)!.canvas).toEqual({ path: ".doan/canvases/made.html", id: "made" });
    expect(h.store.list().find(m => m.conversationId === b)!.canvas).toBeUndefined();
    await h.service.start(homeRequest);
  });
  it("lets another project conversation start and send while one waits for any of its requests, and not after the last answer", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, ask("r1")); h.service.receive(a, ask("r2"));
    const b = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, answered("r1"));
    h.service.receive(b, { type: "turn.done" }); h.open.mock.calls[1]![2](); h.service.refreshed("/repo", []);
    await h.service.send(b, "again", []);
    h.service.receive(a, answered("r2"));
    h.service.receive(b, { type: "turn.done" }); h.open.mock.calls[2]![2](); h.service.refreshed("/repo", []);
    await expect(h.service.send(b, "and again", [])).rejects.toThrow("project_busy");
  });
  it("forgets a turn's open requests when it ends, so the conversation's next turn holds the root", async () => {
    const h = homeFixture();
    // Codex keeps its server, and with it the live entry, between turns.
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementation(async (...args) => ({ ...await prepared(...args), runtime: "codex" as const, owner: { ...h.owner, provider: "codex" as const } }));
    const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, ask("r1"));
    const b = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
    h.service.receive(a, { type: "turn.done" }); h.service.refreshed("/repo", []); h.passBindingWindow();
    await h.service.send(a, "again", []);
    expect(h.open).toHaveBeenCalledTimes(2);
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    expect(h.store.list().find(m => m.conversationId === b)).toBeDefined();
  });
  // canvas-composer-polish design §4 'promotion': turns of one root overlap once a waiting turn has its answer.
  describe("promotion of overlapping turns", () => {
    const x = { path: ".doan/canvases/x.html", id: "x" }, existing = { path: ".doan/canvases/a.html", id: "a" };
    const canvasOf = (h: ReturnType<typeof homeFixture>, id: string) => h.store.list().find(m => m.conversationId === id)!;
    // spec 4: which turn drew a contested canvas is unknown, so neither conversation binds it, whichever is judged first.
    it("binds neither conversation to a new canvas the turn judged first had to leave to an unjudged one (forward)", async () => {
      // B started while A waited, made X and is judged first; A is then denied and ends without a canvas.
      const h = homeFixture([existing]);
      const a = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(a, ask("r"));
      const b = (await h.service.start(homeRequest)).conversationId;
      h.listed.push(x); h.service.refreshed("/repo", [x.path]);
      h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, b).canvas).toBeUndefined();
      h.service.receive(a, { type: "permission.resolved", requestId: "r", optionId: "deny" }); h.service.receive(a, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, a)).toMatchObject({ state: "current" });
      expect(canvasOf(h, a).canvas).toBeUndefined();
      expect(canvasOf(h, b)).toMatchObject({ state: "current" });
      expect(canvasOf(h, b).canvas).toBeUndefined();
    });
    it("binds neither conversation to a new canvas the turn judged first had to leave to an unjudged one (reverse)", async () => {
      // A is stopped while B draws X, so A is judged first; B ends after.
      const h = homeFixture([existing]);
      const a = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(a, ask("r"));
      const b = (await h.service.start(homeRequest)).conversationId;
      h.listed.push(x); h.service.refreshed("/repo", [x.path]);
      await h.service.interrupt(a); h.service.refreshed("/repo", []);
      expect(canvasOf(h, a).canvas).toBeUndefined();
      h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, b).canvas).toBeUndefined();
      expect(canvasOf(h, a).canvas).toBeUndefined();
    });
    it("still binds a turn whose new canvas was left only for multiplicity elsewhere, once no unjudged turn contests it", async () => {
      // B makes two new canvases: B cannot choose, and that refusal leaves nothing behind for A, who made one of them later.
      const h = homeFixture([existing]);
      const a = (await h.service.start(homeRequest)).conversationId;
      const y = { path: ".doan/canvases/y.html", id: "y" };
      h.service.receive(a, ask("r"));
      const b = (await h.service.start(homeRequest)).conversationId;
      h.listed.push(x, y); h.service.refreshed("/repo", [x.path, y.path]);
      h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, b).canvas).toBeUndefined();
      h.listed.splice(h.listed.indexOf(y), 1);
      h.service.receive(a, answered("r")); h.service.receive(a, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, a).canvas).toEqual(x);
    });
    it("never moves a later judged turn onto an existing canvas another conversation was promoted to after its snapshot", async () => {
      const h = homeFixture([existing]);
      const a = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(a, ask("r"));
      const b = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(b, { type: "activity", kind: "edit", summary: "Edit a.html", path: existing.path });
      h.service.refreshed("/repo", [existing.path]);
      h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, b).canvas).toEqual(existing);
      h.service.receive(a, answered("r"));
      h.service.receive(a, { type: "activity", kind: "edit", summary: "Edit a.html", path: existing.path });
      h.service.refreshed("/repo", [existing.path]);
      h.service.receive(a, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, a).canvas).toBeUndefined();
      expect(canvasOf(h, b)).toMatchObject({ canvas: existing, state: "current" });
    });
    it("never moves a later judged turn onto a canvas new to it that another conversation was promoted to after its snapshot", async () => {
      const h = homeFixture([existing]);
      const a = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(a, ask("r"));
      // X is made before B starts (by A or anyone): new to A, already in B's snapshot.
      h.listed.push(x); h.service.refreshed("/repo", [x.path]);
      const b = (await h.service.start(homeRequest)).conversationId;
      h.service.receive(b, { type: "activity", kind: "edit", summary: "Edit x.html", path: x.path });
      h.service.refreshed("/repo", [x.path]);
      h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, b).canvas).toEqual(x);
      h.service.receive(a, answered("r")); h.service.receive(a, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(canvasOf(h, a).canvas).toBeUndefined();
      expect(canvasOf(h, b)).toMatchObject({ canvas: x, state: "current" });
    });
  });
  it("hands an ended turn's queue back as a draft when another turn of the root runs (project_busy)", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, ask("r"));
    await h.service.start(homeRequest);
    h.service.queue(a, { text: "next", anchors: [] });
    h.service.receive(a, answered("r")); h.service.receive(a, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.service.refreshed("/repo", []);
    await vi.waitFor(() => expect(h.service.takeDraft(a)).toMatchObject({ text: "next", reason: "project_busy" }));
    expect(h.store.read(a).filter(e => e.type === "user.message")).toHaveLength(1);
  });
  it("does not let a conversation whose history write failed hold the root", async () => {
    const h = homeFixture();
    const a = (await h.service.start(homeRequest)).conversationId;
    vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
    h.service.receive(a, { type: "activity", kind: "read", summary: "Read a.html" });
    await h.service.start(homeRequest);
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
  it("does not count a start refused during preparation", async () => {
    const h = homeFixture(); h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.start(homeRequest)).rejects.toThrow("not_logged_in");
    await h.service.start(homeRequest);
  });
});

// buzz-conversation M3: a send carries attachments, model and effort.
describe("send extras", () => {
  const attachments = [{ name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" }];
  async function finished(h: ReturnType<typeof homeFixture>, request: Parameters<ConversationService["start"]>[0] = { ...homeRequest, model: "sonnet", effort: "low" }) {
    const id = (await h.service.start(request)).conversationId;
    // The first folder refresh after the turn judges it, as main's folder watcher would.
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls.at(-1)![2](); h.service.refreshed("/repo", []); h.passBindingWindow();
    return id;
  }
  it("saves the new model and effort before the turn's events and opens the run with them", async () => {
    const h = homeFixture(); const id = await finished(h);
    const append = h.store.append.bind(h.store); const atMessage: unknown[] = [];
    vi.spyOn(h.store, "append").mockImplementation((...args) => { if (args[2].type === "user.message") atMessage.push(h.store.list()[0]!.model); return append(...args); });
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
    h.service.receive(id, { type: "turn.done" }); h.passBindingWindow();
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
  it("saves the turn's canvas list as a project conversation's snapshot", async () => {
    const h = homeFixture([{ path: ".doan/canvases/a.html", id: "a" }]);
    const id = await finished(h, homeRequest);
    h.listed.push({ path: ".doan/canvases/b.html", id: "b" });
    await h.service.send(id, "again", []);
    expect(h.store.list()[0]!.canvasesAtStart).toEqual([{ path: ".doan/canvases/a.html", id: "a" }, { path: ".doan/canvases/b.html", id: "b" }]);
  });
});

// buzz-conversation M4: a project turn moves its conversation to the canvas it made or edited.
describe("promotion", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const edit = (path: string) => ({ type: "activity" as const, kind: "edit" as const, summary: `Edit ${path}`, path: `/repo/${path}` });
  async function withCurrent(h: ReturnType<typeof homeFixture>, finish = true) {
    const current = (await h.service.start(canvasStart)).conversationId;
    if (finish) h.service.receive(current, { type: "turn.done" });
    const project = (await h.service.start(homeRequest)).conversationId;
    return { current, project };
  }
  const entry = (h: ReturnType<typeof homeFixture>, id: string) => h.store.list().find(m => m.conversationId === id)!;
  it("moves a project conversation to the existing canvas its own edit changed and archives that canvas's conversation", async () => {
    const h = homeFixture([a, b]); const { current, project } = await withCurrent(h);
    h.service.receive(project, edit(a.path));
    h.service.refreshed("/repo", [a.path]);
    h.service.receive(project, { type: "turn.done" });
    h.changes.length = 0;
    h.service.refreshed("/repo", []);
    expect(entry(h, project)).toMatchObject({ canvas: a, state: "current" });
    expect(entry(h, current).state).toBe("archived");
    expect(h.store.read(current).at(-1)).toMatchObject({ type: "conversation.archived" });
    expect(h.store.read(project).at(-1)).toMatchObject({ type: "conversation.bound", canvas: a });
    // The archived conversation's runner closes as a replaced start's does.
    expect(h.runners[0]!.close).toHaveBeenCalled();
    expect(h.changes).toContain("/repo");
  });
  it("keeps a turn whose edit was refused (no file change) or whose file changed without its edit a project conversation", async () => {
    const h = homeFixture([a, b]); const { current, project } = await withCurrent(h);
    h.service.receive(project, edit(a.path));
    h.service.refreshed("/repo", [b.path]);
    h.service.receive(project, { type: "turn.done" });
    h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toBeUndefined(); expect(entry(h, current).state).toBe("current");
  });
  it("does not promote while the target canvas's current conversation is working", async () => {
    const h = homeFixture([a]); const { current, project } = await withCurrent(h, false);
    h.service.receive(project, edit(a.path)); h.service.refreshed("/repo", [a.path]);
    h.service.receive(project, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toBeUndefined(); expect(entry(h, current).state).toBe("current");
  });
  it("promotes to none of two edited canvases and none of two new ones", async () => {
    const h = homeFixture([a, b]); const { project } = await withCurrent(h);
    h.service.receive(project, edit(a.path)); h.service.receive(project, edit(b.path));
    h.service.refreshed("/repo", [a.path, b.path]);
    h.service.receive(project, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toBeUndefined();
    h.open.mock.calls.at(-1)![2]();
    await h.service.send(project, "two new ones", []);
    h.listed.push({ path: ".doan/canvases/n1.html" }, { path: ".doan/canvases/n2.html" });
    h.service.receive(project, { type: "turn.done" }); h.service.refreshed("/repo", [".doan/canvases/n1.html", ".doan/canvases/n2.html"]);
    expect(entry(h, project).canvas).toBeUndefined();
  });
  it("prefers a new canvas over an edited existing one", async () => {
    const h = homeFixture([a]); const { current, project } = await withCurrent(h);
    h.service.receive(project, edit(a.path));
    h.listed.push({ path: ".doan/canvases/new.html", id: "new" });
    h.service.refreshed("/repo", [a.path, ".doan/canvases/new.html"]);
    h.service.receive(project, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toEqual({ path: ".doan/canvases/new.html", id: "new" });
    expect(entry(h, current).state).toBe("current");
  });
  it("still promotes a failed turn whose edit really changed the canvas", async () => {
    const h = homeFixture([a]); const { current, project } = await withCurrent(h);
    h.service.receive(project, edit(a.path)); h.service.refreshed("/repo", [a.path]);
    h.service.receive(project, { type: "turn.failed", code: "rate_limited" }); h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toEqual(a); expect(entry(h, current).state).toBe("archived");
  });
  it("leaves the index and both histories unchanged, also after a restart, when the promotion cannot be saved", async () => {
    const h = homeFixture([a]); const { current, project } = await withCurrent(h);
    h.service.receive(project, edit(a.path)); h.service.refreshed("/repo", [a.path]);
    h.service.receive(project, { type: "turn.done" });
    const index = h.store.list(), before = [h.store.read(current), h.store.read(project)];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(h.store, "save").mockImplementationOnce(() => { throw new Error("injected"); });
    h.service.refreshed("/repo", []);
    expect(h.store.list()).toEqual(index);
    const restarted = new ConversationStore(h.dir);
    expect(restarted.list()).toEqual(index);
    expect([restarted.read(current), restarted.read(project)]).toEqual(before);
    // A refused promotion does not hold the root.
    await h.service.start(homeRequest);
  });
  it("judges the earlier conversation at its own refresh, so a canvas made in the next one's turn is the next one's", async () => {
    const h = homeFixture();
    const first = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(first, { type: "turn.done" });
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.service.refreshed("/repo", []);
    const second = (await h.service.start(homeRequest)).conversationId;
    h.listed.push({ path: ".doan/canvases/made.html" });
    h.service.refreshed("/repo", [".doan/canvases/made.html"]);
    h.service.receive(second, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(entry(h, second).canvas).toEqual({ path: ".doan/canvases/made.html" });
    expect(entry(h, first).canvas).toBeUndefined();
  });
  it("holds a send of the same conversation until its earlier turn is judged, which still takes a late new canvas", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    // The person answers before the folder refresh that lists the first turn's canvas.
    let sent = false; const sending = h.service.send(id, "and a footer", []).then(() => { sent = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(sent).toBe(false);
    await expect(h.service.send(id, "twice", [])).rejects.toThrow("busy");
    h.listed.push({ path: ".doan/canvases/made.html" });
    h.service.refreshed("/repo", [".doan/canvases/made.html"]);
    await sending;
    expect(entry(h, id).canvas).toEqual({ path: ".doan/canvases/made.html" });
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(2);
  });
  it("never crosses one turn's refused edit with a change made during the next turn (RA2 Y1)", async () => {
    const h = homeFixture([a]); const { current, project } = await withCurrent(h);
    // T1 asks to edit a.html; the edit is refused, so the file never changes.
    h.service.receive(project, edit(a.path));
    h.service.receive(project, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const next = h.service.send(project, "only explain it", []);
    // The folder refresh after T1 comes once T2 was sent.
    await new Promise(resolve => setTimeout(resolve, 10));
    h.service.refreshed("/repo", []);
    await next;
    // During T2, which edits nothing, someone else changes a.html.
    h.service.refreshed("/repo", [a.path]);
    h.service.receive(project, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(entry(h, project).canvas).toBeUndefined(); expect(entry(h, current).state).toBe("current");
  });
});

// buzz-conversation M5: a send to an archived conversation makes it current again.
describe("restore", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  async function archived(h: ReturnType<typeof homeFixture>) {
    const old = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(old, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const current = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(current, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    return { old, current };
  }
  const state = (h: ReturnType<typeof homeFixture>, id: string) => h.store.list().find(m => m.conversationId === id)!.state;
  function unchanged(h: ReturnType<typeof homeFixture>, ids: string[]) {
    const index = h.store.list(), logs = ids.map(id => h.store.read(id));
    return () => { expect(h.store.list()).toEqual(index); expect(ids.map(id => h.store.read(id))).toEqual(logs); };
  }
  it("archives the current conversation, restores the archived one and runs its turn on its own session", async () => {
    const h = homeFixture([a], { admit: true }); const { old, current } = await archived(h);
    h.changes.length = 0;
    await h.service.send(old, "back to this one", []);
    expect(state(h, old)).toBe("current"); expect(state(h, current)).toBe("archived");
    expect(h.store.read(old).slice(-3).map(e => e.type)).toEqual(["conversation.restored", "user.message", "turn.started"]);
    expect(h.store.read(current).at(-1)).toMatchObject({ type: "conversation.archived" });
    expect(h.open.mock.calls.at(-1)![0]).toMatchObject({ sessionId: "s1" });
    expect(h.published.map(e => e.type)).toEqual(expect.arrayContaining(["conversation.restored", "conversation.archived"]));
    expect(h.changes).toContain("/repo");
    // Restarted, the restored conversation is still the current one.
    expect(new ConversationStore(h.dir).list().find(m => m.conversationId === old)!.state).toBe("current");
  });
  it("refuses with canvas_not_found when the canvas is gone or its ID is listed twice, and changes nothing", async () => {
    const h = homeFixture([a], { admit: true }); const { old, current } = await archived(h);
    const check = unchanged(h, [old, current]);
    h.listed.splice(0);
    await expect(h.service.send(old, "back", [])).rejects.toThrow("canvas_not_found");
    h.listed.push(a, { path: ".doan/canvases/copy.html", id: "a" });
    await expect(h.service.send(old, "back", [])).rejects.toThrow("canvas_not_found");
    check();
  });
  it("finds a canvas moved under the same ID and records its new path", async () => {
    const h = homeFixture([a], { admit: true }); const { old } = await archived(h);
    h.listed.splice(0, 1, { path: ".doan/canvases/moved.html", id: "a" });
    await h.service.send(old, "back", []);
    expect(h.store.list().find(m => m.conversationId === old)).toMatchObject({ state: "current", canvas: { path: ".doan/canvases/moved.html", id: "a" } });
  });
  it("refuses with busy while the canvas's current conversation works, and when it starts a send during the restore's preparation", async () => {
    const h = homeFixture([a], { admit: true });
    const old = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(old, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const current = (await h.service.start(canvasStart)).conversationId;
    const check = unchanged(h, [old, current]);
    await expect(h.service.send(old, "back", [])).rejects.toThrow("busy");
    check();
    h.service.receive(current, { type: "turn.done" }); h.open.mock.calls.at(-1)![2]();
    const prepared = h.prepare.getMockImplementation()!; let release!: () => void;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    const restoring = h.service.send(old, "back", []);
    await vi.waitFor(() => expect(release).toBeDefined());
    const next = h.service.send(current, "keep going", []);
    release();
    await expect(restoring).rejects.toThrow("busy");
    await next;
    expect(state(h, current)).toBe("current"); expect(state(h, old)).toBe("archived");
  });
  it("answers not_logged_in when the provider signed out and changes nothing", async () => {
    const h = homeFixture([a], { admit: true }); const { old, current } = await archived(h);
    const check = unchanged(h, [old, current]);
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.send(old, "back", [])).rejects.toThrow("not_logged_in");
    check();
  });
  it("leaves both conversations as they were, also after a restart, when the restore cannot be saved", async () => {
    const h = homeFixture([a], { admit: true }); const { old, current } = await archived(h);
    const check = unchanged(h, [old, current]);
    vi.spyOn(h.store, "save").mockImplementationOnce(() => { throw new Error("injected"); });
    await expect(h.service.send(old, "back", [])).rejects.toThrow("injected");
    check();
    const restarted = new ConversationStore(h.dir);
    expect(restarted.list()).toEqual(h.store.list());
  });
});

// buzz-conversation M6: messages sent while a turn works wait in main and go out together after it.
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
  it("refuses, when it is queued, a message that would take the queue past ten attachments (fix round 1, decision 22)", async () => {
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
  it("holds a project root while a project conversation's queue waits for its judgement and its previous process", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
    // Judged, the queue waits for the previous process; the root stays taken past the binding window.
    h.service.refreshed("/repo", []);
    h.passBindingWindow();
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, id)).toHaveLength(2));
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
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

// buzz-conversation review fixes: pending judgements, refused sends with a queue, crashes and stops while holding.
describe("queue and judgement review fixes", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  const userMessages = (h: ReturnType<typeof homeFixture>, id: string) => h.store.read(id).filter(e => e.type === "user.message");
  it("keeps the root while a send waits for its earlier turn's judgement and is then refused, so another conversation's canvas never goes to it", async () => {
    const h = homeFixture();
    const first = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(first, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    const refused = h.service.send(first, "again", []);
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.service.refreshed("/repo", []);
    await expect(refused).rejects.toThrow("not_logged_in");
    const second = (await h.service.start(homeRequest)).conversationId;
    h.listed.push({ path: ".doan/canvases/made.html" });
    h.service.refreshed("/repo", [".doan/canvases/made.html"]);
    h.service.receive(second, { type: "turn.done" }); h.service.refreshed("/repo", []);
    expect(h.store.list().find(m => m.conversationId === second)!.canvas).toEqual({ path: ".doan/canvases/made.html" });
    expect(h.store.list().find(m => m.conversationId === first)!.canvas).toBeUndefined();
  });
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
    h.service.refreshed("/repo", []);
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
    h.service.refreshed("/repo", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
    await h.service.start(homeRequest);
  });
  it("lets a removed queued message's attachments go and releases a returned draft's ids", async () => {
    const files = { reclaim: vi.fn(() => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = homeFixture([], { files });
    const id = (await h.service.start(canvasStart)).conversationId;
    const record = { name: "a.png", size: 1, kind: "image" as const, path: "/Users/me/a.png" };
    const removed = h.service.queue(id, { text: "gone", anchors: [], attachments: [record], ids: ["x"] });
    h.service.removeQueued(id, removed.itemId);
    expect(files.discard).toHaveBeenCalledWith(["x"]);
    h.service.queue(id, { text: "kept", anchors: [], attachments: [record], ids: ["y"] });
    h.service.receive(id, { type: "turn.failed", code: "rate_limited" });
    expect(files.release).toHaveBeenCalledWith(["y"]);
  });
});

// buzz-conversation fix round 1 (RA2): queue limits, the list's working state, sign-out while held.
describe("fix round 1", () => {
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
  it("lists a conversation as working while it prepares, runs, waits for its previous process and while its turn waits for judgement", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    const working = () => h.service.list("/repo")[0]!.working;
    expect(working()).toBe(true);
    h.changes.length = 0;
    h.service.receive(id, { type: "turn.done" });
    // Its judgement still holds the root.
    expect(working()).toBe(true);
    h.changes.length = 0;
    h.service.refreshed("/repo", []);
    expect(working()).toBe(false); expect(h.changes).toContain("/repo");
    // A send waiting for the previous process works too, and says so.
    h.changes.length = 0;
    const sending = h.service.send(id, "again", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(working()).toBe(true); expect(h.changes).toContain("/repo");
    h.open.mock.calls[0]![2](); await sending;
    expect(working()).toBe(true);
  });
  it("lists a held queue as working while it waits for the previous process, though nothing is queued any more (RA2 Y2)", async () => {
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
  it("hands a queue held for its judgement back as interrupted when its provider signs out, and sends nothing later", async () => {
    const h = homeFixture();
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await h.service.stopRuns("claude");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "next", reason: "interrupted" });
    h.service.refreshed("/repo", []);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(userMessages(h, id)).toHaveLength(1);
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

// buzz-conversation fix round 2 (RA2b Y3): a cancelled waiting send hands back the queue accepted behind it.
describe("cancelled waits and their queues", () => {
  const a = { path: ".doan/canvases/a.html", id: "a" };
  const canvasStart = { ...homeRequest, mode: "new" as const, canvas: a };
  // A project conversation whose next send waits for its earlier turn's judgement, with a message queued behind it.
  async function judgementWait(h: ReturnType<typeof homeFixture>) {
    const id = (await h.service.start(homeRequest)).conversationId;
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
  it("keeps the queue on disk for the next start when the app quits during such a wait", async () => {
    const h = homeFixture(); const { id, waiting } = await judgementWait(h);
    await h.service.quit();
    await expect(waiting).rejects.toThrow("busy");
    expect(h.service.takeDraft(id)).toBeNull();
    expect(new DraftStore(join(h.dir, "conversations")).returned(id)).toMatchObject({ text: "behind it", reason: "restarted" });
  });
});


it.each(["new", "newDesign", "resume"] as const)("stores a one-line chip title without changing the %s message", async mode => {
  const h = fixture();
  const anchors = [{ frame: { id: "hero", title: "Hero section" } }];
  const text = "  Update {{1}}\n\n" + "x".repeat(600);
  const id = (await h.service.start({ root: request.root, mode, ...(mode === "newDesign" ? {} : { canvas: request.canvas }), runtime: "codex", text, anchors })).conversationId;
  expect(h.store.list()[0]!.title).toBe(("Update Hero section " + "x".repeat(600)).slice(0, 512));
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", text, anchors });
});

// permission-mode S1: the chosen mode is stored apart from the model, follows a Claude plan approval and reaches every turn.
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
  // permission-mode spec decisions 7 and 8: a picker change without a send is stored at once, and a queue goes out in
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
  it("stores the mode Claude reports after a plan approval and announces the list change", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" })).conversationId;
    const report = h.open.mock.calls[0]![0].planApproved!;
    h.changes.length = 0;
    report("acceptEdits");
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.changes).toEqual(["/repo"]);
  });
  it("stores Default as no key after a plan approval, and the same mode again changes nothing", async () => {
    const h = homeFixture();
    await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" });
    const report = h.open.mock.calls[0]![0].planApproved!;
    report("default");
    expect(h.store.list()[0]).not.toHaveProperty("permissionMode");
    expect(h.service.list("/repo")[0]).not.toHaveProperty("permissionMode");
    h.changes.length = 0; report("default");
    expect(h.changes).toEqual([]);
  });
  // permission-mode spec decision 8, RV-B ⚪1: a mode the person picked during the Plan turn is theirs; the plan
  // approval follows the SDK only while the conversation is still in Plan.
  it("keeps a mode the person picked during the Plan turn when the plan is approved", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" })).conversationId;
    const report = h.open.mock.calls[0]![0].planApproved!;
    h.service.setPermissionMode(id, "acceptEdits");
    h.changes.length = 0;
    report("default");
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "acceptEdits" });
    expect(h.changes).toEqual([]);
  });
  it("ignores a plan report from a turn that is no longer the conversation's current one", async () => {
    const h = homeFixture();
    const id = (await h.service.start({ ...homeRequest, mode: "new", canvas, permissionMode: "plan" })).conversationId;
    const stale = h.open.mock.calls[0]![0].planApproved!;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await h.service.send(id, "again", []);
    stale("bypass");
    expect(h.store.list()[0]).toMatchObject({ permissionMode: "plan" });
  });
});

// queue-send-now T4: Send now puts one queued message into the running turn; it joins the turn when the agent reads it.
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
    // The turn goes on; the rest of the queue follows it as before.
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
      h.service.receive(id, { type: "turn.done" });
      expect(await answer(sent)).toBe("not_running");
      expect(h.service.list("/repo")[0]!.working).toBe(true);
      h.open.mock.calls[0]![2]();
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
    h.service.receive(id, end);
    expect(await answer(sent)).toBe("not_running");
    expect(h.service.takeDraft(id)).toEqual({ text: "one\n\ntwo", anchors: [], attachments: [], reason });
  });
  it("hands the steered message back when the conversation is archived or its provider signs out meanwhile", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h);
    const item = h.service.queue(id, { text: "one", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept();
    await h.service.stopRuns("claude");
    expect(await answer(sent)).toBe("not_running");
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one", reason: "interrupted" });
  });
  it("hands the steered message back when another start archives the conversation meanwhile, and ignores its late read", async () => {
    const h = homeFixture();
    const { id, calls, read } = await running(h);
    const queued = h.service.queue(id, { text: "two", anchors: [] });
    const archived = h.service.sendNow(id, queued.itemId);
    calls[0]!.accept();
    await h.service.start(canvasStart);
    expect(h.store.list().find(m => m.conversationId === id)?.state).toBe("archived");
    expect(await answer(archived)).toBe("not_running");
    read(calls[0]!.messageId);
    expect(userMessages(h, id)).toHaveLength(1);
    expect(h.service.takeDraft(id)).toMatchObject({ text: "two", reason: "interrupted" });
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
    h.service.receive(id, { type: "turn.failed", code: "rate_limited" });
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
    h.service.receive(id, { type: "turn.done" });
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
  it("keeps a project conversation's root while only a steered message is queued at the turn's end, then sends it", async () => {
    const h = homeFixture();
    const { id, calls } = await running(h, homeRequest);
    const item = h.service.queue(id, { text: "next", anchors: [] });
    const sent = h.service.sendNow(id, item.itemId);
    calls[0]!.accept(); await tick();
    h.service.receive(id, { type: "turn.done" });
    expect(await answer(sent)).toBe("not_running");
    h.service.refreshed("/repo", []);
    h.passBindingWindow();
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
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

// conversation-delete design §2.3: Doan's own record of a conversation on this device goes; the agent's files stay.
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
    ["waiting for its judgement", async (h: ReturnType<typeof homeFixture>) => {
      const id = (await h.service.start(homeRequest)).conversationId;
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
// agent-questions B3 and orch decision 3: a question waits in the turn as a permission request does.
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
  it("lets another project conversation start while one waits on a question, and not once it has its answer", async () => {
    const h = asking(); const a = (await h.service.start(homeRequest)).conversationId;
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    h.service.receive(a, question("r"));
    const b = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []); h.passBindingWindow();
    // A permission resolution with the same id answers no question.
    h.service.receive(a, { type: "permission.resolved", requestId: "r", optionId: "allow" });
    await h.service.start(homeRequest).then(started => h.service.receive(started.conversationId, { type: "turn.done" }));
    h.service.refreshed("/repo", []); h.passBindingWindow();
    h.service.receive(a, resolved("r"));
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
    expect(b).not.toBe(a);
  });
  it("keeps waiting while a question and a permission are open together, until both are answered", async () => {
    const h = asking(); const a = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(a, question("r1")); h.service.receive(a, { type: "permission.request", requestId: "r2", tool: "Write", summary: "Write a.html", options: [{ id: "allow", label: "Allow", kind: "allow" }] });
    h.service.receive(a, { type: "permission.resolved", requestId: "r2", optionId: "allow" });
    const b = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(b, { type: "turn.done" }); h.service.refreshed("/repo", []); h.passBindingWindow();
    h.service.receive(a, resolved("r1"));
    await expect(h.service.start(homeRequest)).rejects.toThrow("project_busy");
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
  // The runner's own expiry (runners.test.ts 'expires a waiting question once on close') comes after the archive and
  // is dropped; the history's archive marker expires the question, once.
  it("closes the runner of a conversation replaced while it waits on a question, and folds the question expired once", async () => {
    const h = asking(); const canvas = { path: ".doan/canvases/a.html", id: "a" }; h.listed.push(canvas);
    const first = (await h.service.start({ ...homeRequest, mode: "new", canvas })).conversationId;
    const emit = h.open.mock.calls[0]![1];
    vi.mocked(h.runners[0]!.close).mockImplementation(async () => { emit({ type: "question.resolved", requestId: "q1", outcome: "expired" }); });
    h.service.receive(first, question("q1"));
    await h.service.start({ ...homeRequest, mode: "new", canvas });
    expect(h.runners[0]!.close).toHaveBeenCalledOnce();
    const history = h.store.read(first);
    expect(history.filter(e => e.type === "question.resolved")).toEqual([]);
    expect(history.map(e => e.type).slice(-2)).toEqual(["interrupted", "conversation.archived"]);
    expect(foldConversation(history, first).questions).toEqual({ q1: "expired" });
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

// prompt-suggestion design 'main' 3-6: a done turn's suggestion is kept in memory per conversation, fenced by the run and
// turn it belongs to, cleared when it no longer applies, and the next send ends a process that only waits for one.
describe("prompt suggestions", () => {
  type SuggestingRunner = Runner & { endSuggestion: ReturnType<typeof vi.fn<() => boolean>> };
  function suggesting() {
    const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
    const store = new ConversationStore(dir);
    const runs: { input: Parameters<OpenRunner>[0]; exited: () => void; runner: SuggestingRunner }[] = [];
    let connection = "conn-1";
    const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
      const runner: SuggestingRunner = { sessionId: input.sessionId ?? `s${runs.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), endSuggestion: vi.fn(() => true) };
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
    expect(h.runs[0]!.runner.endSuggestion).toHaveBeenCalledOnce();
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
    await vi.waitFor(() => expect(h.runs[0]!.runner.endSuggestion).toHaveBeenCalledOnce());
    h.runs[0]!.exited();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.store.read(id).filter(e => e.type === "user.message").at(-1)).toMatchObject({ text: "queued" });
  });
  it.each([
    ["a failed turn", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "turn.failed", code: "unknown" }); }],
    ["an interrupted turn", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "interrupted", reason: "user" }); }],
    ["a turn whose suggestion came", (h: ReturnType<typeof suggesting>, id: string) => { h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests"); }],
  ])("waits for the process of %s to end by itself, as before", async (_name, end) => {
    const h = suggesting(); const id = await h.start();
    end(h, id);
    let sent = false; const pending = h.service.send(id, "next", []).then(() => { sent = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.runs[0]!.runner.endSuggestion).not.toHaveBeenCalled();
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
  it("clears it on archive, and a late suggestion of the same run does not come back", async () => {
    const h = suggesting(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    // A new conversation on the same canvas archives this one.
    h.runs[0]!.exited(); await h.start();
    expect(h.store.list().find(m => m.conversationId === id)?.state).toBe("archived");
    const before = h.changes.length;
    h.suggest(0, "Late");
    expect(h.changes.length).toBe(before);
    // Restoring it shows no suggestion of the earlier turn either.
    h.service.receive(h.store.list().find(m => m.state === "current")!.conversationId, { type: "turn.done" }); h.runs[1]!.exited();
    await h.service.send(id, "back", []); h.service.receive(id, { type: "turn.done" });
    expect(h.shown(id)).toBeUndefined();
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
  it("keeps a legacy external conversation's suggestion across connection changes", async () => {
    const h = suggesting();
    h.prepare.mockImplementation(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.suggest(0, "Run the tests");
    h.service.connectionChanged("claude", undefined);
    expect(h.shown(id)).toBe("Run the tests");
  });
});
