import type { Checks } from "../../lib/types.ts";
import d10d from "../D10d/checks.ts";

// The seed README is a product context document, so the document preset lets the
// agent skip context; D10d's other checks (ds layout, tokens, scope) apply unchanged.
const checks: Checks = ctx => d10d(ctx).filter(c => c.id !== "read_context");
export default checks;
