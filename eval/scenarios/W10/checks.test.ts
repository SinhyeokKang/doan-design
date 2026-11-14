import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { CheckContext, WorkExchange } from "../../lib/types.ts";
import checks from "./checks.ts";

const path = ".doan/canvases/landing.html";
const seed = readFileSync(join(import.meta.dirname, "seed", path), "utf8");
const final = readFileSync(join(import.meta.dirname, "fixtures/pass", path), "utf8");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const others = [{ kind: "conversation", provider: "codex", frame: "hero", note: "Rewriting the hero headline" }];
const start = (): WorkExchange => ({ request: { v: 3, action: "start", root: "/repo", path }, response: { v: 3, ok: true, others } as WorkExchange["response"], at: new Date().toISOString(), hashes: { [path]: hash(seed) } });
const done = (html = final): WorkExchange => ({ request: { v: 3, action: "done", root: "/repo" }, response: { v: 3, ok: true }, at: new Date().toISOString(), hashes: { [path]: hash(html) } });

function run(log: WorkExchange[], html = final, changed = [path], errors = 0, calls: string[] = [], opened = 0) {
  return checks({
    seed: () => seed, read: () => html, changedFiles: () => changed, work: () => log, calls: { commands: calls, mcpTools: [] }, open: () => Array.from({ length: opened }), prototype: () => [],
    doan: () => ({ code: errors === 0 ? 0 : 1, json: { result: { summary: { errors } } } }),
  } as unknown as CheckContext);
}
const failing = (...args: Parameters<typeof run>) => run(...args).filter(c => !c.pass).map(c => c.id);

test("W10 passes an edited headline with start and done around it", () => {
  assert.deepEqual(failing([start(), done()]), []);
});

test("W10 accepts a reformatted canvas with the same content", () => {
  const reformatted = final.replace("</h1>\n<p", "</h1>\n\n  <p");
  assert.deepEqual(failing([start(), done(reformatted)], reformatted), []);
});

test("W10 fails an unchanged canvas", () => {
  assert.deepEqual(failing([start(), done(seed)], seed, []), ["start_before_edit", "done_at_end", "start_path", "headline_updated", "only_canvas_changed"]);
});

test("W10 fails the wrong headline and unrelated edits", () => {
  assert.deepEqual(failing([start(), done(final.replace("Design together", "Design apart"))], final.replace("Design together", "Design apart")), ["headline_updated"]);
  assert.deepEqual(failing([start(), done(final.replace("Built with Doan.", "Built."))], final.replace("Built with Doan.", "Built.")), ["headline_updated"]);
});

test("W10 fails changes to other files and a canvas doan check rejects", () => {
  assert.deepEqual(failing([start(), done()], final, [path, "notes.txt"]), ["only_canvas_changed"]);
  assert.deepEqual(failing([start(), done()], final, [path], 2), ["doan_check_clean"]);
});

test("W10 still needs the work signals around the edit", () => {
  assert.deepEqual(failing([done()]), ["start_before_edit", "start_path"]);
  assert.deepEqual(failing([start()]), ["done_at_end"]);
});

test("W10 fails a run that opened the canvas", () => {
  assert.deepEqual(failing([start(), done()], final, [path], 0, ["doan open .doan/canvases/landing.html"]), ["no_doan_open"]);
  assert.deepEqual(failing([start(), done()], final, [path], 0, [], 1), ["no_doan_open"]);
});
