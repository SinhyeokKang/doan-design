import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAttachmentHandlers, type AttachmentOwner } from "./attachmentHandlers";
import { AttachmentStore } from "./attachments";
import { queueFiles } from "./conversation/ipc";

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
