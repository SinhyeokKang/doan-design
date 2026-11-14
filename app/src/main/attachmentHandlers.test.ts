import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAttachmentHandlers, type AttachmentOwner } from "./attachmentHandlers";
import { AttachmentStore } from "./attachments";
import { conversationHandler, queueFiles } from "./conversation/ipc";
import { ConversationService, type Prepare, type Prepared } from "./conversation/service";
import { ConversationStore } from "./conversation/store";

// The handlers index.ts registers for both windows, on a real store: each draft attachment belongs to the window that
// holds it, so one window's close or request never takes another window's draft.
const MAIN: AttachmentOwner = "main";
const PROTO: AttachmentOwner = "prototype:7";
const NEXT_PROTO: AttachmentOwner = "prototype:8";

let dir: string;
let file: string;
let store: AttachmentStore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "doan-attach-owners-"));
  file = join(dir, "notes.txt");
  writeFileSync(file, "hello");
  store = new AttachmentStore(join(dir, "store"), { thumbnail: () => null, reencode: bytes => bytes });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function setup(picked: string[] = []) {
  let alive = new Set<AttachmentOwner>([MAIN, PROTO, NEXT_PROTO]);
  let resolvePick: ((paths: string[]) => void) | null = null;
  const handlers = createAttachmentHandlers(store, {
    pick: () => picked.length ? Promise.resolve(picked) : new Promise(resolve => { resolvePick = resolve; }),
    alive: owner => alive.has(owner),
  });
  return {
    handlers,
    kill: (owner: AttachmentOwner) => { alive = new Set([...alive].filter(o => o !== owner)); handlers.closed(owner); },
    answerPick: (paths: string[]) => resolvePick?.(paths),
  };
}
const idOf = (results: { ok: boolean; attachment?: { id: string } }[] | null): string => {
  const first = results?.[0];
  if (!first?.ok || !first.attachment) throw new Error("not issued");
  return first.attachment.id;
};
// What the conversation handler does when it takes a queued message: the files are marked sent and consumed.
const queue = (id: string) => { store.markSent([{ id }]); store.consume([{ id }]); };

describe("a draft attachment belongs to the window that holds it", () => {
  test("a queue the main window took back is its draft: the prototype window's close leaves it", () => {
    const { handlers, kill } = setup();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    queue(id);
    // The turn failed and the main window showed the conversation first: it took the draft and checked its files.
    handlers.taken(MAIN, [id]);
    expect(handlers.recheck(MAIN, { ids: [id] })?.[0]).toMatchObject({ ok: true });
    kill(PROTO);
    expect(store.resolve([{ id }])).toMatchObject({ ok: true });
  });

  test("a queued message keeps its files through the prototype window's close", () => {
    const { handlers, kill } = setup();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    queue(id);
    kill(PROTO);
    expect(() => queueFiles(store).reclaim([id])).not.toThrow();
  });

  test("the prototype window's close forgets the draft it still holds", () => {
    const { handlers, kill } = setup();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    kill(PROTO);
    expect(store.resolve([{ id }])).toMatchObject({ ok: false, error: "attachment_missing" });
  });

  test("a window cannot remove, recheck or release another window's attachment", () => {
    const { handlers } = setup();
    const id = idOf(handlers.addPaths(MAIN, { paths: [file] }));
    expect(handlers.remove(PROTO, { id })).toBe(false);
    expect(handlers.recheck(PROTO, { ids: [id] })).toBeNull();
    expect(store.resolve([{ id }])).toMatchObject({ ok: true });
    queue(id);
    expect(handlers.release(PROTO, { ids: [id] })).toBe(false);
    expect(() => queueFiles(store).reclaim([id])).not.toThrow();
    // Its own window still can.
    expect(handlers.release(MAIN, { ids: [id] })).toBe(true);
  });

  test("a new prototype window is not the closed one", () => {
    const { handlers, kill } = setup();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    expect(handlers.remove(NEXT_PROTO, { id })).toBe(false);
    kill(NEXT_PROTO);
    expect(store.resolve([{ id }])).toMatchObject({ ok: true });
  });

  test("an Attach dialog answered after its window closed issues nothing", async () => {
    const { handlers, kill, answerPick } = setup();
    const pending = handlers.choose(PROTO);
    kill(PROTO);
    answerPick([file]);
    expect(await pending).toEqual([]);
    // Nothing of it is left behind under the closed window, and the next window's close takes nothing of the main one.
    const id = idOf(handlers.addPaths(MAIN, { paths: [file] }));
    kill(NEXT_PROTO);
    expect(store.resolve([{ id }])).toMatchObject({ ok: true });
  });

  test("the window's own requests work as before", async () => {
    const { handlers } = setup([file]);
    const chosen = await handlers.choose(PROTO);
    expect(chosen[0]).toMatchObject({ ok: true });
    const id = idOf(chosen);
    expect(handlers.recheck(PROTO, { ids: [id] })?.[0]).toMatchObject({ ok: true });
    expect(handlers.remove(PROTO, { id })).toBe(true);
  });
});

// A start, send or queue carries a window's draft attachments: only its own, and once main accepted the request the ids
// are the conversation's (the queue, a send under way), never the window's draft again until a window takes a
// returned draft. Through the real conversation handler and store.
describe("attachments in a conversation request", () => {
  async function conversation() {
    const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
    const prepare = vi.fn<Prepare>(async () => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner }));
    const open = vi.fn(async (_input: Prepared) => ({ sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const conversations = join(dir, "conversations");
    mkdirSync(conversations);
    const service = new ConversationService(new ConversationStore(conversations), prepare, open, () => {});
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { attachments: store });
    const id = (await handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
    // The turn is running: a send goes in, a queue waits.
    const queued = vi.spyOn(service, "queue").mockReturnValue({ itemId: "q1" });
    const sent = vi.spyOn(service, "send").mockResolvedValue(undefined);
    return { id, queued, sent, request: (method: "queue" | "send", raw: Record<string, unknown>) => (owner: AttachmentOwner, handlers: ReturnType<typeof setup>["handlers"]) =>
      handlers.conversation(owner, raw, () => handle(true, method, raw)) };
  }

  test("a queued message stays sendable when its window closes while the queue goes out", async () => {
    const { handlers, kill } = setup();
    const { id: conversationId, request } = await conversation();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    expect(await request("queue", { conversationId, text: "x", attachments: [{ id }] })(PROTO, handlers)).toEqual({ itemId: "q1" });
    // The turn ended: the service takes the queue back to send it and prepares the next turn; the window closes then.
    const hooks = queueFiles(store).reclaim([id]);
    kill(PROTO);
    expect(() => hooks.recheck()).not.toThrow();
  });

  test("a window cannot queue or send another window's draft attachment, and that draft still sends", async () => {
    const { handlers } = setup();
    const { id: conversationId, request, queued, sent } = await conversation();
    const id = idOf(handlers.addPaths(MAIN, { paths: [file] }));
    expect(await request("queue", { conversationId, text: "x", attachments: [{ id }] })(PROTO, handlers)).toEqual({ error: "bad_request" });
    expect(await request("send", { conversationId, text: "x", attachments: [{ id }] })(PROTO, handlers)).toEqual({ error: "bad_request" });
    expect(queued).not.toHaveBeenCalled();
    expect(store.resolve([{ id }])).toMatchObject({ ok: true });
    expect(await request("send", { conversationId, text: "x", attachments: [{ id }] })(MAIN, handlers)).toBeUndefined();
    expect(sent).toHaveBeenCalledOnce();
  });

  test("the prototype window cannot send an id main never gave it; the main window still can (a capture)", async () => {
    const { handlers } = setup();
    const { id: conversationId, request, sent } = await conversation();
    // Issued outside the handlers, as a canvas capture or the service's reissue is.
    const id = idOf(store.addPaths({ paths: [file] }));
    expect(await request("send", { conversationId, text: "x", attachments: [{ id }] })(PROTO, handlers)).toEqual({ error: "bad_request" });
    expect(handlers.recheck(PROTO, { ids: [id] })).toBeNull();
    expect(await request("send", { conversationId, text: "x", attachments: [{ id }] })(MAIN, handlers)).toBeUndefined();
    expect(sent).toHaveBeenCalledOnce();
  });

  test("an id the main window took back and removed is not the prototype window's to take again", async () => {
    const { handlers } = setup();
    const { id: conversationId, request } = await conversation();
    const id = idOf(handlers.addPaths(PROTO, { paths: [file] }));
    await request("queue", { conversationId, text: "x", attachments: [{ id }] })(PROTO, handlers);
    handlers.taken(MAIN, [id]);
    expect(handlers.recheck(MAIN, { ids: [id] })?.[0]).toMatchObject({ ok: true });
    expect(handlers.remove(MAIN, { id })).toBe(true);
    expect(handlers.recheck(PROTO, { ids: [id] })).toBeNull();
  });
});
