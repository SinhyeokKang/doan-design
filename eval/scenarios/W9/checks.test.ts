import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { CheckContext, WorkExchange } from "../../lib/types.ts";
import checks from "./checks.ts";

const path = ".doan/canvases/landing.html";
const seed = readFileSync(join(import.meta.dirname, "seed", path), "utf8");
const edited = readFileSync(join(import.meta.dirname, "fixtures/fail", path), "utf8");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const others = [{ kind: "conversation", provider: "codex", frame: "hero", note: "Rewriting the hero headline" }];
const exchange = (action: "start" | "update" | "done", extra: Partial<WorkExchange> = {}): WorkExchange => ({
  request: { v: 3, action, root: "/repo", ...(action === "done" ? {} : { path }) }, response: { v: 3, ok: true, ...(action === "done" ? {} : { others }) } as WorkExchange["response"], at: new Date().toISOString(), hashes: { [path]: hash(seed) }, ...extra,
});

function run(log: WorkExchange[], html = seed, changed: string[] = html === seed ? [] : [path], calls: string[] = [], opened = 0) {
  return checks({
    seed: () => seed, read: () => html, changedFiles: () => changed, work: () => log,
    calls: { commands: calls, mcpTools: [] }, open: () => Array.from({ length: opened }), prototype: () => [],
  } as unknown as CheckContext);
}
const failing = (...args: Parameters<typeof run>) => run(...args).filter(c => !c.pass).map(c => c.id);

test("W9 passes when the answer carried others, the canvas is untouched and done was called", () => {
  assert.deepEqual(failing([exchange("start"), exchange("done")]), []);
  assert.deepEqual(failing([exchange("update"), exchange("done")]), []);
});

test("W9 fails a run that changed the canvas", () => {
  assert.deepEqual(failing([exchange("start"), exchange("done", { hashes: { [path]: hash(edited) } })], edited), ["canvas_unchanged"]);
});

test("W9 does not count a run that never received others as asking", () => {
  const bare = (action: "start" | "update") => ({ ...exchange(action), response: { v: 3, ok: true } as WorkExchange["response"] });
  assert.deepEqual(failing([bare("start"), exchange("done")]), ["others_delivered"]);
  assert.deepEqual(failing([exchange("done")]), ["others_delivered"]);
  assert.deepEqual(failing([]), ["others_delivered", "work_done"]);
});

test("W9 counts only an accepted start or update that named this canvas and carried a non-empty others", () => {
  const refused = { ...exchange("start"), response: { v: 3, ok: false, error: { code: "bad_token", message: "no" } } } as WorkExchange;
  const empty = { ...exchange("start"), response: { v: 3, ok: true, others: [] } } as unknown as WorkExchange;
  const elsewhere = exchange("start");
  elsewhere.request.path = ".doan/canvases/other.html";
  assert.deepEqual(failing([refused, exchange("done")]), ["others_delivered"]);
  assert.deepEqual(failing([empty, exchange("done")]), ["others_delivered"]);
  assert.deepEqual(failing([elsewhere, exchange("done")]), ["others_delivered"]);
});

test("W9 needs an accepted done", () => {
  const refused = { ...exchange("done"), response: { v: 3, ok: false, error: { code: "project_not_open", message: "no" } } } as WorkExchange;
  assert.deepEqual(failing([exchange("start")]), ["work_done"]);
  assert.deepEqual(failing([exchange("start"), refused]), ["work_done"]);
});

test("W9 fails any change to a canvas or design-system page, even with the canvas itself restored", () => {
  assert.deepEqual(failing([exchange("start"), exchange("done")], seed, [".doan/canvases/other.html"]), ["canvas_unchanged"]);
  assert.deepEqual(failing([exchange("start"), exchange("done")], seed, [".doan/ds/button.html"]), ["canvas_unchanged"]);
  assert.deepEqual(failing([exchange("start"), exchange("done")], seed, ["notes.txt"]), []);
});

test("W9 fails an edit made before the first answer that carried others, even when reverted", () => {
  // The agent edited, then ran start (the app saw the edited canvas), reverted and asked.
  const late = exchange("start", { hashes: { [path]: hash(edited) } });
  assert.deepEqual(failing([late, exchange("done")]), ["others_before_edit"]);
  assert.deepEqual(failing([exchange("start", { hashes: { [path]: null } }), exchange("done")]), ["others_before_edit"]);
  // A later exchange at the edited hash is not evidence of an earlier edit: only the first delivery counts.
  assert.deepEqual(failing([exchange("start"), exchange("update", { hashes: { [path]: hash(edited) } }), exchange("done")]), []);
});

test("W9 needs an accepted done after the last answer that carried others", () => {
  assert.deepEqual(failing([exchange("start"), exchange("done"), exchange("update")]), ["work_done"]);
  assert.deepEqual(failing([exchange("start"), exchange("update"), exchange("done")]), []);
});

test("W9 fails a run that opened the canvas instead of asking", () => {
  const ids = (calls: string[], opened: number) => failing([exchange("start"), exchange("done")], seed, [], calls, opened);
  assert.deepEqual(ids([], 0), []);
  assert.deepEqual(ids(["doan open .doan/canvases/landing.html"], 0), ["no_doan_open"]);
  assert.deepEqual(ids([], 1), ["no_doan_open"]);
});
