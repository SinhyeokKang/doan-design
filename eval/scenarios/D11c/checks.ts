import type { Checks } from "../../lib/types.ts";
import d11 from "../D11/checks.ts";

// D11b without the two spacing notes the component code does not back.
const checks: Checks = ctx => d11(ctx);
export default checks;
