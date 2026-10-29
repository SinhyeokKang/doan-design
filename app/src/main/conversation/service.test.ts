import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HOME_GUIDANCE, PRESET_GUIDANCE } from "./prompt";
import { ConversationService, resolveListedCanvas, type Runner, type OpenRunner, type Prepare } from "./service";
const paths: string[] = []; afterEach(() => paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
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
  expect(h.runners[0]?.send).toHaveBeenLastCalledWith(expect.stringContaining(".doan/canvases/moved.html"), expect.any(String));
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
it("refuses an archived conversation at once instead of waiting for the previous process", async () => {
  // A wait far longer than the bound: a refusal that waited would exceed it by seconds, not by scheduler jitter.
  const h = perTurn(2000); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  h.prepare.mockResolvedValueOnce({ ...claudeTurn, sessionId: "replacement" });
  await h.service.start(request);
  const started = Date.now();
  await expect(h.service.send(id, "archived", [])).rejects.toThrow("busy");
  expect(Date.now() - started).toBeLessThan(500);
});
it("sends the fixed preset guidance on a follow-up turn as on the first", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  await h.service.send(id, "next", []);
  const prompts = h.runners.flatMap(r => vi.mocked(r.send).mock.calls.map(call => call[0]));
  expect(prompts).toHaveLength(2);
  for (const prompt of prompts) expect(prompt).toContain(PRESET_GUIDANCE);
});

// buzz-home: Home starts (newDesign without a subject), chosen models, attachments and binding by start-time lists.
function homeFixture(canvases: { path: string; id?: string }[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "conn-secret", accountId: "acct-secret", workspaceId: "org-secret", profile: "profile-secret" };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/config-secret", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed = [...canvases];
  const service = new ConversationService(store, prepare, open, () => {}, () => {}, 10_000, () => listed);
  return { service, store, runners, open, prepare, listed };
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
  // FirstPrompt's subject start is not a Home request.
  await h.service.start({ ...homeRequest, subject: "a pricing page", text: "Use the doan skill to make a design canvas in /repo for a pricing page." });
  expect(vi.mocked(h.runners[1]!.send).mock.calls[0]![0]).not.toContain(HOME_GUIDANCE);
});
it("records attachments on user.message, lists them in the prompt and hands them to the runner, marking them sent first", async () => {
  const h = homeFixture();
  const attachments = [{ name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" }, { name: "b.pdf", size: 9, kind: "file" as const, path: "/Users/me/b.pdf" }];
  let indexed: number | undefined;
  const id = (await h.service.start({ ...homeRequest, attachments }, () => { indexed = h.store.list().length; })).conversationId;
  expect(indexed).toBe(0);
  expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", attachments });
  const [prompt, , sent] = vi.mocked(h.runners[0]!.send).mock.calls[0]!;
  expect(JSON.parse(prompt.split("\n\n")[1]!).attachments).toEqual(attachments.map(a => ({ name: a.name, kind: a.kind, path: a.path })));
  expect(sent).toEqual(attachments);
});
it("does not mark attachments sent for a start refused before acceptance", async () => {
  const h = homeFixture(); h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
  const beforeAccept = vi.fn();
  await expect(h.service.start({ ...homeRequest, attachments: [{ name: "a", size: 1, kind: "file", path: "/a" }] }, beforeAccept)).rejects.toThrow("not_logged_in");
  expect(beforeAccept).not.toHaveBeenCalled();
});
it("binds a new canvas only to a running or just-finished conversation that did not list it at its start", async () => {
  const h = homeFixture([{ path: ".doan/canvases/old.html", id: "old" }]);
  const id = (await h.service.start(homeRequest)).conversationId;
  expect(h.store.list()[0]!.canvasesAtStart).toEqual([{ path: ".doan/canvases/old.html", id: "old" }]);
  // A canvas that was already there when the request started is not its canvas.
  h.service.bind("/repo", { path: ".doan/canvases/old.html", id: "old" });
  expect(h.store.list()[0]!.canvas).toBeUndefined();
  h.service.bind("/repo", { path: ".doan/canvases/new.html", id: "new" });
  expect(h.store.list().find(m => m.conversationId === id)!.canvas).toEqual({ path: ".doan/canvases/new.html", id: "new" });
});
it("never lets a finished conversation that made no canvas take a canvas made later", async () => {
  const h = homeFixture(); const now = vi.spyOn(Date, "now");
  try {
    now.mockReturnValue(1_000_000);
    const id = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(id, { type: "turn.done" });
    // Just after the turn the folder list may still be catching up with the agent's write.
    now.mockReturnValue(1_005_000); h.service.bind("/repo", { path: ".doan/canvases/late.html" });
    expect(h.store.list()[0]!.canvas).toEqual({ path: ".doan/canvases/late.html" });
    const other = (await h.service.start(homeRequest)).conversationId;
    h.service.receive(other, { type: "turn.done" });
    now.mockReturnValue(1_005_000 + 60_000); h.service.bind("/repo", { path: ".doan/canvases/someone-else.html" });
    expect(h.store.list().find(m => m.conversationId === other)!.canvas).toBeUndefined();
  } finally { now.mockRestore(); }
});
it("binds to the most recent of two running conversations and ignores conversations of a previous run", async () => {
  const h = homeFixture();
  const first = (await h.service.start(homeRequest)).conversationId;
  const second = (await h.service.start(homeRequest)).conversationId;
  h.service.bind("/repo", { path: ".doan/canvases/a.html" });
  expect(h.store.list().find(m => m.conversationId === second)!.canvas).toEqual({ path: ".doan/canvases/a.html" });
  expect(h.store.list().find(m => m.conversationId === first)!.canvas).toBeUndefined();
  // After a restart nothing is running: a new canvas binds to none of them.
  const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => []);
  restarted.bind("/repo", { path: ".doan/canvases/b.html" });
  expect(h.store.list().find(m => m.conversationId === first)!.canvas).toBeUndefined();
});
