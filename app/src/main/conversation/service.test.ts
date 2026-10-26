import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, type Runner, type OpenRunner, type Prepare } from "./service";
const paths: string[] = []; afterEach(() => paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; const exits: (() => void)[] = [];
  let hold: (() => void) | undefined;
  const open: OpenRunner = vi.fn(async (input, emit, exited) => {
    exits.push(exited); if (hold) await new Promise<void>(resolve => { hold = resolve; });
    const runner: Runner = { sessionId: input.sessionId ?? "new-session", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async () => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} }));
  const service = new ConversationService(store, prepare, open, () => {});
  return { service, store, runners, exits, prepare, open, hold: () => { hold = () => {}; }, release: () => hold?.() };
}
const request = { root: "/repo", mode: "resume" as const, canvas: { path: "design/a.html" }, text: "hello", anchors: [] };
it("reserves pending sessions across canvases before opening and leaves rejected starts untouched", async () => {
  const h = fixture(); h.hold(); const first = h.service.start(request); await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
  await expect(h.service.start({ ...request, canvas: { path: "design/b.html" } })).rejects.toThrow("session_in_use");
  expect(h.store.list()).toEqual([]); h.release(); const id = (await first).conversationId;
  expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started"]);
  await expect(h.service.send(id, "second", [])).rejects.toThrow("busy");
});
it("retains idle Codex ownership until confirmed exit and reuses only the owning server", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "again", []);
  expect(h.open).toHaveBeenCalledOnce(); expect(h.runners[0]?.send).toHaveBeenCalledTimes(2);
  await h.service.interrupt(id); await expect(h.service.start({ ...request, canvas: { path: "design/b.html" } })).rejects.toThrow("session_in_use");
  h.exits[0]?.(); await h.service.start({ ...request, canvas: { path: "design/b.html" } });
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
  await h.service.start({ ...request, canvas: { path: "design/b.html" } });
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
