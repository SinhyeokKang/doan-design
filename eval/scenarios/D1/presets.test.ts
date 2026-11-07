import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckContext } from "../../lib/types.ts";
import { presetChecks, presetLookups } from "./presets.ts";

const ran = (...commands: string[]) => ({ calls: { commands, mcpTools: [] } }) as unknown as CheckContext;
const checks = (ctx: CheckContext) => Object.fromEntries(presetChecks(ctx, { required: [["harden", "clarify", "onboard"]], allowed: ["harden", "clarify", "onboard", "context"] }).map(c => [c.id, c.pass]));

test("a preset read through a shell loop counts for every id it runs", () => {
  const ctx = ran("for p in harden clarify; do doan design-skill $p --json; done");
  assert.deepEqual(presetLookups(ctx), { shellInvoked: true, shellIds: ["harden", "clarify"], ids: ["harden", "clarify"] });
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
