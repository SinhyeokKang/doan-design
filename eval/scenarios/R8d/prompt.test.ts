import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { turnPrompt } from "../../lib/turn-prompt.ts";

// prompt.md is turnPrompt's output for turn.json with `{{repo}}` as the root. It is checked in because the runner
// reads prompts as files; this fails when turnPrompt drifts.
test("R8d prompt.md is the app's turnPrompt output for turn.json", () => {
  const dir = import.meta.dirname;
  const turn = JSON.parse(readFileSync(join(dir, "turn.json"), "utf8"));
  const sent = turnPrompt(turn.anchors, turn.text, { root: "{{repo}}", canvas: turn.canvas }, { handoff: "person" });
  assert.notEqual(sent, null, "turnPrompt refused turn.json");
  assert.equal(readFileSync(join(dir, "prompt.md"), "utf8"), sent);
});
