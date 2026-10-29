import type { Checks } from "../../lib/types.ts";
import d11 from "../D11/checks.ts";

// D11c with a seed that records only what the token and component CSS do:
// no link role, no unbacked usage policies, and the button's padding, cursor
// and focus outline in both artifacts.
const checks: Checks = ctx => d11(ctx);
export default checks;
