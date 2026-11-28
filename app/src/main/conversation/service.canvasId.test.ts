import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type Runner, type StartRequest } from "./service";
import { DraftStore } from "./drafts";
import type { Canvas } from "./types";

// A conversation stored by path takes the ID of the one listed row at that path, so a later rename follows it.
const paths: string[] = [];
afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const a = ".doan/canvases/a.html", renamed = ".doan/canvases/renamed.html";
function fixture(rows: Canvas[]) {
  const dir = mkdtempSync(join(tmpdir(), "doan-canvas-id-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider: "codex" as const, connectionId: "conn", accountId: "acct", workspaceId: null, profile: "codex" };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "codex" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed: Canvas[] = [...rows];
  const changes: string[] = [];
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const service = new ConversationService(store, prepare, open, () => {}, admit, 10_000, () => listed, root => changes.push(root), { drafts: new DraftStore(null) });
  const request: StartRequest = { root: "/repo", mode: "new", runtime: "codex", canvas: { path: a }, text: "Make a checkout page", anchors: [] };
  const start = async () => (await service.start(request)).conversationId;
  const relist = (...next: Canvas[]) => { listed.splice(0, listed.length, ...next); service.refreshed("/repo"); };
  const stored = (id: string) => store.list().find(m => m.conversationId === id)?.canvas;
  return { service, store, prepare, listed, changes, start, relist, stored };
}

describe("resolveListedCanvas by path", () => {
  it("takes the ID of the one listed row at the path", () => {
    expect(resolveListedCanvas({ path: a }, [{ id: "a", path: a }, { id: "b", path: renamed }])).toEqual({ id: "a", path: a });
  });
  it("stays by path when the row has no ID", () => {
    expect(resolveListedCanvas({ path: a }, [{ path: a }])).toEqual({ path: a });
  });
  it("stays by path when another listed row shares the row's ID", () => {
    expect(resolveListedCanvas({ path: a }, [{ id: "a", path: a }, { id: "a", path: renamed }])).toEqual({ path: a });
  });
});

describe("a canvas conversation started by path", () => {
  it("is stored with the row's ID and follows the renamed canvas", async () => {
    const h = fixture([{ id: "a", path: a }]);
    const id = await h.start();
    expect(h.stored(id)).toEqual({ id: "a", path: a });
    h.service.receive(id, { type: "turn.done" });
    h.listed.splice(0, 1, { id: "a", path: renamed });
    await h.service.send(id, "continue", []);
    expect(h.prepare.mock.calls.at(-1)?.[0].canvas).toEqual({ id: "a", path: renamed });
    expect(h.stored(id)).toEqual({ id: "a", path: renamed });
  });
});

describe("a conversation stored by path when its canvas had no ID", () => {
  it("adopts the ID once the listing shows it, keeps a running turn's canvas in step, and follows a later rename", async () => {
    const h = fixture([{ path: a }]);
    const id = await h.start();
    expect(h.stored(id)).toEqual({ path: a });
    h.changes.length = 0;
    h.relist({ id: "a", path: a });
    expect(h.stored(id)).toEqual({ id: "a", path: a });
    expect(h.service.liveTurns().get(id)?.canvas).toEqual({ id: "a", path: a });
    expect(h.changes).toContain("/repo");
    h.service.receive(id, { type: "turn.done" });
    h.relist({ id: "a", path: renamed });
    await h.service.send(id, "continue", []);
    expect(h.stored(id)).toEqual({ id: "a", path: renamed });
  });

  it("adopts nothing while the row has no ID or shares its ID with another row", async () => {
    const h = fixture([{ path: a }]);
    const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    const save = vi.spyOn(h.store, "save");
    h.relist({ path: a });
    h.relist({ id: "a", path: a }, { id: "a", path: renamed });
    expect(h.stored(id)).toEqual({ path: a });
    expect(save).not.toHaveBeenCalled();
  });
});
