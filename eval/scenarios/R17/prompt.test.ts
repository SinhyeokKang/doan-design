import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handoffPrompt } from "../../lib/turn-prompt.ts";

// prompt.md is what the app sends for a turn another conversation's send started: the sending agent's message in
// handoffText, the canvas it came from in context.from, and the received-turn guidance. The chain is in scenario.json.
test("R17 prompt.md is the app's handoffPrompt output for turn.json", () => {
  const dir = import.meta.dirname;
  const turn = JSON.parse(readFileSync(join(dir, "turn.json"), "utf8"));
  const sent = handoffPrompt(turn.text, { root: "{{repo}}", canvas: turn.canvas }, turn.from, { via: turn.via, handoff: true });
  assert.notEqual(sent, null, "handoffPrompt refused turn.json");
  assert.equal(readFileSync(join(dir, "prompt.md"), "utf8"), sent);
});
