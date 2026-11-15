import type { Checks } from "../../lib/types.ts";
import d7 from "./base.ts";

// Only the rubric is this scenario's own; the automatic checks are the base checks unchanged.
const checks: Checks = ctx => d7(ctx);
export default checks;
