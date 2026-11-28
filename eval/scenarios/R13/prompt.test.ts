import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { turnPrompt } from "../../lib/turn-prompt.ts";

// prompt.md is what the app sends for turn.json: a Home conversation's turn whose only anchor is a canvas anchor.
test("R13 prompt.md is the app's turnPrompt output for turn.json", () => {
  const dir = import.meta.dirname;
  const turn = JSON.parse(readFileSync(join(dir, "turn.json"), "utf8"));
  const sent = turnPrompt(turn.anchors, turn.text, { root: "{{repo}}" }, { handoff: true, home: true });
  assert.notEqual(sent, null, "turnPrompt refused turn.json");
  assert.equal(readFileSync(join(dir, "prompt.md"), "utf8"), sent);
});
