import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The prompt names the frame by its title; the checks expect its id. Both come from the seed canvas.
test("W4 prompt names the seed frame by title and the checks use its id", () => {
  const canvas = readFileSync(join(import.meta.dirname, "seed/.doan/canvases/profile.html"), "utf8");
  assert.match(canvas, /data-doan-frame="profile-form" data-doan-title="Profile form"/);
  assert.match(readFileSync(join(import.meta.dirname, "prompt.md"), "utf8"), /"Profile form" frame/);
  assert.match(readFileSync(join(import.meta.dirname, "checks.ts"), "utf8"), /const frame = "profile-form"/);
});
