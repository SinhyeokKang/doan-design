import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { createRefresher, watchFolder, type FolderWatch } from "./watch";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-watch-")));
let count = 0;
let open: FolderWatch | undefined;

afterEach(() => {
  open?.close();
  open = undefined;
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function within(ms: number, done: () => boolean): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (done()) return true;
    await sleep(10);
  }
  return done();
}

function repo(parts: { design?: boolean; doan?: boolean; comments?: boolean } = {}): string {
  const root = join(tmp, `r${count++}`);
  mkdirSync(root);
  if (parts.design ?? true) {
    mkdirSync(join(root, "design"));
    writeFileSync(join(root, "design", "a.html"), "<!doctype html>");
  }
  if (parts.doan ?? true) {
    mkdirSync(join(root, ".doan"));
    writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    if (parts.comments ?? true) mkdirSync(join(root, ".doan", "comments"));
  }
  return root;
}

// Starts watching, lets startup events settle, then counts re-reads.
async function watch(root: string): Promise<{ reads: () => number; reset: () => void }> {
  let reads = 0;
  open = watchFolder(root, async () => {
    reads++;
  });
  await sleep(300);
  reads = 0;
  return { reads: () => reads, reset: () => (reads = 0) };
}

async function expectReread(w: { reads: () => number; reset: () => void }, change: () => void): Promise<void> {
  w.reset();
  change();
  expect(await within(1_000, () => w.reads() >= 1)).toBe(true);
  // Let the debounce window pass so the next step starts clean.
  await sleep(300);
}

describe("watchFolder re-reads within a second", () => {
  test.each<[string, (root: string) => void]>([
    ["a canvas is added", (root) => writeFileSync(join(root, "design", "b.html"), "")],
    ["a nested canvas is added", (root) => {
      mkdirSync(join(root, "design", "sub"));
      writeFileSync(join(root, "design", "sub", "c.html"), "");
    }],
    ["a canvas is deleted", (root) => unlinkSync(join(root, "design", "a.html"))],
    ["a canvas is renamed", (root) => renameSync(join(root, "design", "a.html"), join(root, "design", "b.html"))],
    ["a canvas changes", (root) => appendFileSync(join(root, "design", "a.html"), "<title>x</title>")],
    ["config.json changes", (root) => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}')],
    ["a comment file is added", (root) => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n")],
  ])("when %s", async (_label, change) => {
    const root = repo();
    await expectReread(await watch(root), () => change(root));
  });

  test("when a comment file changes", async () => {
    const root = repo();
    writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n");
    await expectReread(await watch(root), () => appendFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"));
  });

  test("when design/ appears later, and then inside it", async () => {
    const root = repo({ design: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, "design")));
    await expectReread(w, () => writeFileSync(join(root, "design", "a.html"), ""));
  });

  test("when design/ is deleted and created again, and then inside it", async () => {
    const root = repo();
    const w = await watch(root);
    await expectReread(w, () => rmSync(join(root, "design"), { recursive: true }));
    await expectReread(w, () => mkdirSync(join(root, "design")));
    await expectReread(w, () => writeFileSync(join(root, "design", "b.html"), ""));
  });

  test("when .doan/ appears later and then config.json changes", async () => {
    const root = repo({ doan: false });
    const w = await watch(root);
    await expectReread(w, () => {
      mkdirSync(join(root, ".doan"));
      writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
    });
    await expectReread(w, () => writeFileSync(join(root, ".doan", "config.json"), '{"v":1,"serve":[]}'));
  });

  test("when .doan/comments/ appears later and then a comment file is added", async () => {
    const root = repo({ comments: false });
    const w = await watch(root);
    await expectReread(w, () => mkdirSync(join(root, ".doan", "comments")));
    await expectReread(w, () => writeFileSync(join(root, ".doan", "comments", "a.jsonl"), "{}\n"));
  });
});

describe("watchFolder", () => {
  test("merges a burst of events into one re-read", async () => {
    const root = repo();
    const w = await watch(root);
    for (let i = 0; i < 10; i++) writeFileSync(join(root, "design", `b${i}.html`), "");
    await sleep(800);
    expect(w.reads()).toBe(1);
  });

  test("stops after close", async () => {
    const root = repo();
    const w = await watch(root);
    open?.close();
    writeFileSync(join(root, "design", "b.html"), "");
    await sleep(500);
    expect(w.reads()).toBe(0);
  });
});

describe("createRefresher", () => {
  test("debounces triggers into one run", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
    }, 50);
    refresher.trigger();
    await sleep(20);
    refresher.trigger();
    await sleep(20);
    refresher.trigger();
    expect(runs).toBe(0);
    await sleep(120);
    expect(runs).toBe(1);
    refresher.close();
  });

  test("runs once more when triggered during a run, never two at a time", async () => {
    let runs = 0;
    let active = 0;
    let overlapped = false;
    const refresher = createRefresher(async () => {
      runs++;
      active++;
      if (active > 1) overlapped = true;
      await sleep(150);
      active--;
    }, 20);
    refresher.trigger();
    await sleep(60);
    refresher.trigger();
    refresher.trigger();
    await sleep(500);
    expect(runs).toBe(2);
    expect(overlapped).toBe(false);
    refresher.close();
  });

  test("keeps going after a run fails", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
      throw new Error("boom");
    }, 20);
    refresher.trigger();
    await sleep(80);
    refresher.trigger();
    await sleep(80);
    expect(runs).toBe(2);
    refresher.close();
  });

  test("close drops a pending run", async () => {
    let runs = 0;
    const refresher = createRefresher(async () => {
      runs++;
    }, 50);
    refresher.trigger();
    refresher.close();
    await sleep(120);
    expect(runs).toBe(0);
  });
});
