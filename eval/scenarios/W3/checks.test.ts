import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sh } from "../../lib/context.ts";
import type { CheckContext } from "../../lib/types.ts";
import checks from "./checks.ts";

const path = ".doan/canvases/profile.html";
const seed = readFileSync(join(import.meta.dirname, "seed", path), "utf8");
const final = readFileSync(join(import.meta.dirname, "fixtures/pass", path), "utf8");
function labelPass(html: string) {
  const ctx = {
    seed: () => seed, read: () => html, changedFiles: () => [path], work: () => [],
    doan: () => ({ code: 0, json: { result: { summary: { errors: 0 } } } }),
    run: (cmd: string, args: string[]) => sh(cmd, args, import.meta.dirname, process.env),
  } as unknown as CheckContext;
  return checks(ctx).find(c => c.id === "button_label_updated")?.pass;
}
test("W3 accepts a reformatted button and rejects unrelated label or id edits", () => {
  assert.equal(labelPass(final.replace(">Save profile</button>", ">\n  Save profile\n</button>")), true);
  assert.equal(labelPass(seed), false);
  assert.equal(labelPass(final.replace('data-doan-id="heading"', 'data-doan-id="other"')), false);
  assert.equal(labelPass(final.replace("Profile settings</h1>", "Settings</h1>")), false);
});
