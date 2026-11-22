import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCanvasNames, watchCanvasDirs } from "./canvas-watch.ts";
import { classifyDesignChange } from "./design-change.ts";

function repo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-canvas-watch-")));
  for (const dir of [".doan/canvases", ".doan/ds", ".doan/assets", "src"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, ".doan/canvases/landing.html"), "<!-- seed -->");
  return root;
}

test("a copy that comes and goes in a canvas folder is in the log, writes elsewhere are not", async () => {
  const root = repo();
  const log = join(root, "..", `${root.split("/").pop()}.jsonl`);
  try {
    const watch = await watchCanvasDirs(root, log);
    writeFileSync(join(root, ".doan/assets/a.css"), "a{}");
    writeFileSync(join(root, "src/b.ts"), "");
    writeFileSync(join(root, ".doan/canvases/zz-test.html"), "<!-- copy -->");
    rmSync(join(root, ".doan/canvases/zz-test.html"));
    writeFileSync(join(root, ".doan/ds/.hidden.html"), "");
    // The last write lands right before stop: the settle delay must still catch it.
    writeFileSync(join(root, ".doan/canvases/landing.html"), "<!-- edited -->");
    await watch.stop();
    const names = readCanvasNames(readFileSync(log, "utf8"))!;
    assert.deepEqual([...new Set(names)].sort(), [".doan/canvases/landing.html", ".doan/canvases/zz-test.html", ".doan/ds/.hidden.html"]);
    // Read through the app's own rule: the copy is a second listed canvas, the hidden file reloads every canvas.
    assert.deepEqual(classifyDesignChange([...new Set(names)].sort() as string[]), { bumpServed: true, revPaths: [".doan/canvases/landing.html", ".doan/canvases/zz-test.html"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(log, { force: true });
  }
});

test("files written just before the watch starts are not reported", async () => {
  const root = repo();
  writeFileSync(join(root, ".doan/canvases/landing.html"), "<!-- seed again -->");
  const log = join(root, "..", `${root.split("/").pop()}.jsonl`);
  try {
    const watch = await watchCanvasDirs(root, log);
    await watch.stop();
    assert.deepEqual(readCanvasNames(readFileSync(log, "utf8")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(log, { force: true });
  }
});

// The runner's two lanes open and close watches side by side.
test("a watch keeps reporting while another opens and closes", async () => {
  const [a, b] = [repo(), repo()];
  const [logA, logB] = [a, b].map(root => join(root, "..", `${root.split("/").pop()}.jsonl`)) as [string, string];
  try {
    const watchA = await watchCanvasDirs(a, logA);
    const watchB = await watchCanvasDirs(b, logB);
    writeFileSync(join(b, ".doan/canvases/b.html"), "");
    await watchB.stop();
    writeFileSync(join(a, ".doan/canvases/a.html"), "");
    await watchA.stop();
    assert.deepEqual(readCanvasNames(readFileSync(logA, "utf8")), [".doan/canvases/a.html"]);
    assert.deepEqual(readCanvasNames(readFileSync(logB, "utf8")), [".doan/canvases/b.html"]);
  } finally {
    for (const path of [a, b, logA, logB]) rmSync(path, { recursive: true, force: true });
  }
});

test("a missing log or a recorded watch error leaves the names unknown", () => {
  assert.equal(readCanvasNames(null), null);
  assert.equal(readCanvasNames(`".doan/canvases/a.html"\n{"error":"EMFILE"}\n`), null);
  assert.deepEqual(readCanvasNames(`".doan/canvases/a.html"\nnull\n`), [".doan/canvases/a.html", null]);
});
