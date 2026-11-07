import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckContext } from "../../lib/types.ts";
import { presetChecks, presetLookups } from "./presets.ts";

const ran = (...commands: string[]) => ({ calls: { commands, mcpTools: [] } }) as unknown as CheckContext;
const checks = (ctx: CheckContext) => Object.fromEntries(presetChecks(ctx, { required: [["harden", "clarify", "onboard"]], allowed: ["harden", "clarify", "onboard", "context"] }).map(c => [c.id, c.pass]));

test("a preset read through a shell loop counts for every id it runs", () => {
  const ctx = ran("for p in harden clarify; do doan design-skill $p --json; done");
  assert.deepEqual(presetLookups(ctx), { shellInvoked: true, shellIds: ["harden", "clarify"], ids: ["harden", "clarify"], unresolved: [] });
  assert.deepEqual(checks(ctx), { read_harden_or_clarify_or_onboard: true, preset_reads_allowed: true });
});

test("an echoed or quoted lookup is not a read, in a loop or not", () => {
  for (const command of ["echo doan design-skill $p", "for p in harden clarify; do echo doan design-skill $p; done", "printf '%s' 'doan design-skill harden'"]) {
    const ctx = ran(command);
    assert.equal(presetLookups(ctx).shellInvoked, false, command);
    assert.equal(checks(ctx).read_harden_or_clarify_or_onboard, false, command);
  }
});

test("a loop that reads a preset outside the allowed list fails preset_reads_allowed", () => {
  const ctx = ran("for p in harden polish; do doan design-skill $p --json; done");
  assert.deepEqual(presetLookups(ctx).ids, ["harden", "polish"]);
  assert.deepEqual(checks(ctx), { read_harden_or_clarify_or_onboard: true, preset_reads_allowed: false });
});

test("a loop too long to follow cannot pass the allowed-list checks on a partial list", () => {
  const over = [...Array(300).fill("harden"), "polish"].join(" ");
  const ctx = ran(`for p in ${over}; do doan design-skill $p --json; done`);
  assert.deepEqual(presetLookups(ctx).unresolved, ["$p"]);
  assert.deepEqual(checks(ctx), { read_harden_or_clarify_or_onboard: false, preset_reads_allowed: false });
  const none = presetChecks(ctx, { required: [], allowed: [] });
  assert.deepEqual(none.map(c => [c.id, c.pass]), [["no_preset_body_read", false]]);
  // Within the budget every id is followed, so polish still fails the list.
  const within = ran(`for p in ${[...Array(64).fill("harden"), "polish"].join(" ")}; do doan design-skill $p --json; done`);
  assert.deepEqual(checks(within), { read_harden_or_clarify_or_onboard: true, preset_reads_allowed: false });
});

test("a loop that reaches doan through a variable changed inside it reads what the shell would run", () => {
  const ctx = ran("p=harden; for p in polish; do echo $p; done; doan design-skill $p");
  assert.deepEqual(presetLookups(ctx).ids, ["polish"]);
  assert.deepEqual(checks(ctx), { read_harden_or_clarify_or_onboard: false, preset_reads_allowed: false });
  assert.equal(presetLookups(ran("for p in harden; do doan design-skill $p")).shellInvoked, false);
});
