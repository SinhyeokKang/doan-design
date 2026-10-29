import type { Checks } from "../../lib/types.ts";
import d10 from "../D10/checks.ts";

// D10 without a README, so the document preset's exception for an existing
// product context document cannot apply and `context` is required.
const checks: Checks = ctx => d10(ctx);
export default checks;
