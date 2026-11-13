import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createStarPrompt } from "./starPromptStore";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 13, 12);
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-star-prompt-")));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const fileIn = () => { const dir = join(tmp, `d${count++}`); mkdirSync(dir); return join(dir, "star-prompt.json"); };
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const done = (seq: number) => ({ v: 1, conversationId: `c${seq % 3}`, seq, turnId: `t${seq}`, at: "2026-11-13T12:00:00.000Z", type: "turn.done" });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function setup(options: { enabled?: boolean; file?: string; write?: (file: string, text: string) => void } = {}) {
  const file = options.file ?? fileIn();
  let now = NOW;
  const moment = vi.fn();
  const store = createStarPrompt({ file, enabled: options.enabled ?? true, now: () => now, moment, ...(options.write ? { write: options.write } : {}) });
  return { file, store, moment, at: (time: number) => { now = time; } };
}

describe("counting", () => {
  test("only a turn that ended in success counts; failed, interrupted and other events do not", async () => {
    const { file, store, moment } = setup();
    store.event(done(1));
    const failed = { ...done(2), type: "turn.failed", code: "process_exited" };
    store.event(failed);
    for (const reason of ["user", "appQuit", "crashed"]) { const interrupted = { ...done(3), type: "interrupted", reason }; store.event(interrupted); }
    for (const type of ["turn.started", "message.agent", "permission.request"]) store.event({ ...done(4), type });
    await flush();
    expect(json(file)).toEqual({ v: 1, turns: 1, threshold: 20, deferredUntil: 0, asks: 0, done: false });
    expect(moment).not.toHaveBeenCalled();
  });

  test("the 20th success sends one moment for the first card; the 19th sends none", async () => {
    const { store, moment } = setup();
    for (let seq = 1; seq <= 19; seq++) store.event(done(seq));
    await flush();
    expect(moment).not.toHaveBeenCalled();
    store.event(done(20));
    await flush();
    expect(moment).toHaveBeenCalledExactlyOnceWith({ second: false });
  });

  test("turns of several conversations that end together each count once, and send one moment", async () => {
    const { file, store, moment } = setup();
    for (let seq = 1; seq <= 18; seq++) store.event(done(seq));
    await flush();
    store.event(done(19)); store.event(done(20)); store.event(done(21));
    await flush();
    expect(json(file)).toMatchObject({ turns: 21 });
    expect(moment).toHaveBeenCalledOnce();
  });

  test("a moment that was put off comes again at the next turn's end", async () => {
    const { store, moment } = setup();
    for (let seq = 1; seq <= 20; seq++) store.event(done(seq));
    await flush();
    store.event(done(21));
    await flush();
    expect(moment).toHaveBeenCalledTimes(2);
  });

  test("a copy that does not update neither counts, writes nor sends", async () => {
    const { file, store, moment } = setup({ enabled: false });
    for (let seq = 1; seq <= 25; seq++) store.event(done(seq));
    store.dismissed(); store.opened();
    await flush();
    expect(existsSync(file)).toBe(false);
    expect(moment).not.toHaveBeenCalled();
  });
});

describe("answers", () => {
  async function due() {
    const shown = setup();
    for (let seq = 1; seq <= 20; seq++) shown.store.event(done(seq));
    await flush();
    shown.moment.mockClear();
    return shown;
  }

  test("Not now waits 40 turns and 3 days, then asks the second card once more; Don't ask again ends it", async () => {
    const { file, store, moment, at } = await due();
    store.dismissed();
    expect(json(file)).toEqual({ v: 1, turns: 20, threshold: 60, deferredUntil: NOW + 3 * DAY, asks: 1, done: false });
    for (let seq = 21; seq <= 60; seq++) store.event(done(seq));
    await flush();
    expect(moment).not.toHaveBeenCalled();
    at(NOW + 3 * DAY);
    store.event(done(61));
    await flush();
    expect(moment).toHaveBeenCalledExactlyOnceWith({ second: true });
    store.dismissed();
    expect(json(file)).toMatchObject({ asks: 1, done: true });
    for (let seq = 62; seq <= 200; seq++) store.event(done(seq));
    await flush();
    expect(moment).toHaveBeenCalledOnce();
  });

  test("a browser that opened ends it", async () => {
    const { file, store, moment } = await due();
    store.opened();
    expect(json(file)).toMatchObject({ turns: 20, done: true });
    store.event(done(21));
    await flush();
    expect(moment).not.toHaveBeenCalled();
  });

  test("a dismissal while nothing is due changes nothing", () => {
    const { file, store } = setup();
    store.event(done(1));
    store.dismissed();
    expect(json(file)).toMatchObject({ turns: 1, threshold: 20, asks: 0, done: false });
  });
});

describe("a file Doan cannot use", () => {
  test.each([
    ["broken", "{"],
    ["from a later Doan", JSON.stringify({ v: 2, turns: 40, threshold: 20, deferredUntil: 0, asks: 0, done: false })],
    ["missing a field", JSON.stringify({ v: 1, turns: 40, threshold: 20, asks: 0, done: false })],
  ])("a %s file never asks and is never written", async (_name, text) => {
    const file = fileIn();
    writeFileSync(file, text);
    const { store, moment } = setup({ file });
    for (let seq = 1; seq <= 25; seq++) store.event(done(seq));
    store.dismissed(); store.opened();
    await flush();
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(moment).not.toHaveBeenCalled();
  });

  test("an unreadable file never asks", async () => {
    const file = fileIn();
    writeFileSync(file, JSON.stringify({ v: 1, turns: 40, threshold: 20, deferredUntil: 0, asks: 0, done: false }));
    chmodSync(file, 0o000);
    try {
      const { store, moment } = setup({ file });
      store.event(done(1));
      await flush();
      expect(moment).not.toHaveBeenCalled();
    } finally { chmodSync(file, 0o600); }
  });

  test("a write that fails stops asking for this run, with nothing said and no temporary file left", async () => {
    const file = fileIn();
    let fail = false;
    const write = vi.fn((path: string, text: string) => { if (fail) throw new Error("EACCES"); writeFileSync(path, text); });
    const { store, moment } = setup({ file, write });
    for (let seq = 1; seq <= 19; seq++) store.event(done(seq));
    fail = true;
    store.event(done(20));
    await flush();
    expect(moment).not.toHaveBeenCalled();
    fail = false;
    store.event(done(21));
    await flush();
    expect(moment).not.toHaveBeenCalled();
    expect(json(file)).toMatchObject({ turns: 19 });
  });

  test("the default write replaces the file through a temporary file in the same folder", async () => {
    const { file, store } = setup();
    store.event(done(1));
    store.event(done(2));
    expect(json(file)).toMatchObject({ turns: 2 });
    expect(readdirSync(join(file, ".."))).toEqual(["star-prompt.json"]);
  });
});
