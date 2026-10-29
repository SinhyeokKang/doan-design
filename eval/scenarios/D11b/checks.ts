import type { Checks } from "../../lib/types.ts";
import d11 from "../D11/checks.ts";

// D11 with a complete seed (spacing, shape and depth frames, input and card
// components); the automatic checks are unchanged.
const checks: Checks = ctx => d11(ctx);
export default checks;
