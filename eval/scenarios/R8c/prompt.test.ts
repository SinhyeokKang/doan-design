import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { turnPrompt } from "./turn-prompt.ts";

// prompt.md is what the app sends for turn.json: turnPrompt's output with `{{repo}}`
// as the root, which the runner fills in. It is checked in because the runner reads
// prompts as files; this test fails when turnPrompt drifts from it.
test("R8c prompt.md is the app's turnPrompt output for turn.json", () => {
  const dir = import.meta.dirname;
  const turn = JSON.parse(readFileSync(join(dir, "turn.json"), "utf8"));
  const sent = turnPrompt(turn.anchors, turn.text, { root: "{{repo}}", canvas: turn.canvas });
  assert.notEqual(sent, null, "turnPrompt refused turn.json");
  assert.equal(readFileSync(join(dir, "prompt.md"), "utf8"), sent);
});
