import type { Checks } from "../../lib/types.ts";
import o1Checks from "../O1/checks.ts";
import { noComplete, noDoanInit } from "../O3/setup-checks.ts";

// First run is already finished, so the agent stops at select: O1's checks that
// do not need `complete`, plus no `doan init` and no `complete`.
const NEEDS_COMPLETE = ["complete_only_when_ready", "completion_confirmed"];
const checks: Checks = ctx => [
  ...o1Checks(ctx).filter(c => !NEEDS_COMPLETE.includes(c.id)),
  noDoanInit(ctx),
  noComplete(ctx.onboarding()),
];
export default checks;
