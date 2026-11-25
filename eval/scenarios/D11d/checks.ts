import type { Checks } from "../../lib/types.ts";
import d11 from "../D11e/checks.ts";

// D11e's checks, with a seed recording only what token and component CSS do: no link role or unbacked usage
// policy, and the button's padding, cursor and focus outline in both artifacts.
const checks: Checks = ctx => d11(ctx);
export default checks;
