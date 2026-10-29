import type { Checks } from "../../lib/types.ts";
import d7 from "../D7/checks.ts";

// D7 with a clarified rubric; the automatic checks are unchanged.
const checks: Checks = ctx => d7(ctx);
export default checks;
