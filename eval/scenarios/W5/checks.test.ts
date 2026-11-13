import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sh } from "../../lib/context.ts";
import type { CheckContext, WorkExchange } from "../../lib/types.ts";
import checks from "./checks.ts";

const path = ".doan/canvases/pricing.html";
const seed = readFileSync(join(import.meta.dirname, "seed", path), "utf8");
const final = readFileSync(join(import.meta.dirname, "fixtures/pass", path), "utf8");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// The seed with only the Free plan edited: the state between the first and second frame edit.
const freeDone = seed.replace(">Get started</button>", ">Start for free</button>");
let second = 0;
const at = () => new Date(Date.UTC(2026, 10, 6, 0, 0, second++)).toISOString();
const start = (): WorkExchange => ({ request: { v: 3, action: "start", root: "/repo", path }, response: { v: 3, ok: true }, at: at(), hashes: { [path]: hash(seed) } });
const update = (frame: string, canvas: string | null, extra: Partial<WorkExchange> = {}): WorkExchange =>
  ({ request: { v: 3, action: "update", root: "/repo", path, frame, note: `Editing ${frame}` }, response: { v: 3, ok: true }, at: at(), hashes: { [path]: canvas === null ? null : hash(canvas) }, canvas, ...extra });
const done = (): WorkExchange => ({ request: { v: 3, action: "done", root: "/repo" }, response: { v: 3, ok: true }, at: at(), hashes: { [path]: hash(final) } });

function run(log: WorkExchange[], html = final) {
  return checks({
    seed: () => seed, read: () => html, changedFiles: () => [path], work: () => log, open: () => [], prototype: () => [], calls: { commands: [], mcpTools: [] },
    doan: () => ({ code: 0, json: { result: { summary: { errors: 0 } } } }),
    run: (cmd: string, args: string[]) => sh(cmd, args, import.meta.dirname, process.env),
  } as unknown as CheckContext);
}
const failing = (log: WorkExchange[], html = final) => run(log, html).filter(c => !c.pass).map(c => c.id);

test("W5 passes an update before each frame edit, one frame at a time", () => {
  assert.deepEqual(failing([start(), update("plan-free", seed), update("plan-pro", freeDone), update("plan-team", freeDone.replace(">Upgrade</button>", ">Start Pro trial</button>")), done()]), []);
});

test("W5 accepts every update sent before one write, and an update without a separate start", () => {
  assert.deepEqual(failing([update("plan-free", seed), update("plan-pro", seed), update("plan-team", seed), done()]), []);
});

test("W5 rejects an update that arrives after its frame was edited", () => {
  assert.deepEqual(failing([start(), update("plan-free", seed), update("plan-pro", final), update("plan-team", final), done()]), ["update_before_each_frame_edit"]);
});

test("W5 rejects a missing frame, another frame id, another canvas, a refused update and an unreadable snapshot", () => {
  const ids = (log: WorkExchange[]) => failing([start(), ...log, done()]);
  assert.deepEqual(ids([update("plan-free", seed), update("plan-pro", seed)]), ["update_before_each_frame_edit"]);
  assert.deepEqual(ids([update("plan-free", seed), update("plan-pro", seed), update("pricing", seed)]), ["update_before_each_frame_edit"]);
  const other = update("plan-team", seed);
  other.request.path = ".doan/canvases/other.html";
  assert.deepEqual(ids([update("plan-free", seed), update("plan-pro", seed), other]), ["update_before_each_frame_edit"]);
  assert.deepEqual(ids([update("plan-free", seed), update("plan-pro", seed), update("plan-team", seed, { response: { v: 3, ok: false, error: { code: "bad_request", message: "no" } } })]), ["update_before_each_frame_edit"]);
  assert.deepEqual(ids([update("plan-free", seed), update("plan-pro", seed), update("plan-team", null)]), ["update_before_each_frame_edit"]);
});

test("W5 reports the seconds between accepted updates", () => {
  second = 0;
  const detail = run([start(), update("plan-free", seed), update("plan-pro", freeDone), update("plan-team", freeDone)]).find(c => c.id === "update_before_each_frame_edit")!.detail;
  assert.deepEqual(JSON.parse(detail).intervalsSec, [1, 1]);
});

test("W5 accepts reformatted labels and rejects missing or unrelated edits", () => {
  const labels = (html: string) => run([], html).find(c => c.id === "labels_updated")?.pass;
  assert.equal(labels(final.replace(">Talk to sales</button>", ">\n  Talk to sales\n</button>")), true);
  assert.equal(labels(seed), false);
  assert.equal(labels(freeDone), false);
  assert.equal(labels(final.replace('data-doan-frame="plan-pro"', 'data-doan-frame="pro"')), false);
  assert.equal(labels(final.replace("$12 per month", "$10 per month")), false);
});

// Free is edited, then Pro, then Free again before Team. The snapshot each update arrived at shows
// what changed since the previous signal.
const freeDraft = seed.replace(">Get started</button>", ">Try it free</button>");
const proDone = freeDraft.replace(">Upgrade</button>", ">Start Pro trial</button>");
const freeAgain = proDone.replace(">Try it free</button>", ">Start for free</button>");
test("W5 rejects re-entering a frame without a new update", () => {
  assert.deepEqual(failing([start(), update("plan-free", seed), update("plan-pro", freeDraft), update("plan-team", freeAgain), done()]), ["update_before_each_frame_edit"]);
});
test("W5 accepts re-entering a frame with a new update", () => {
  assert.deepEqual(failing([start(), update("plan-free", seed), update("plan-pro", freeDraft), update("plan-free", proDone), update("plan-team", freeAgain), done()]), []);
});
test("W5 rejects an edit before the first update", () => {
  assert.deepEqual(failing([start(), update("plan-free", freeDraft), update("plan-pro", freeDraft), update("plan-team", freeDraft), done()]), ["update_before_each_frame_edit"]);
});
