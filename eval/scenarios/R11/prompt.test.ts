import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { turnPrompt } from "../../lib/turn-prompt.ts";

// prompt.md is what the app sends for turn.json: a canvas conversation's turn, which carries the handoff line
// (the same construction as R8d and R9b).
test("R11 prompt.md is the app's turnPrompt output for turn.json", () => {
  const dir = import.meta.dirname;
  const turn = JSON.parse(readFileSync(join(dir, "turn.json"), "utf8"));
  const sent = turnPrompt(turn.anchors, turn.text, { root: "{{repo}}", canvas: turn.canvas }, { handoff: true });
  assert.notEqual(sent, null, "turnPrompt refused turn.json");
  assert.equal(readFileSync(join(dir, "prompt.md"), "utf8"), sent);
});
