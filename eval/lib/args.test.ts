import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./args.ts";

const now = new Date(2026, 9, 24, 9, 5, 7);

test("defaults run every scenario with both agents once, judged", () => {
  assert.deepEqual(parseArgs([], now), { scenarios: null, agents: ["claude", "codex"], repeat: 1, round: "20261024-090507", selfTest: false, judge: true });
});

test("flags take comma lists and values", () => {
  assert.deepEqual(parseArgs(["--scenarios", "W1,R2", "--agents", "codex", "--repeat", "2", "--round", "base-1", "--no-judge"], now),
    { scenarios: ["W1", "R2"], agents: ["codex"], repeat: 2, round: "base-1", selfTest: false, judge: false });
  assert.equal(parseArgs(["--self-test"], now).selfTest, true);
});

test("bad input is rejected", () => {
  for (const argv of [["--agents", "gemini"], ["--repeat", "0"], ["--repeat", "1.5"], ["--round", "../x"], ["--round", "a/b"], ["--scenarios", ""], ["--scenarios", "../W1"], ["--scenarios"], ["--wat"], ["W1"]])
    assert.throws(() => parseArgs(argv, now), Error, argv.join(" "));
});
