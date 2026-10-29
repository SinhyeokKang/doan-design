import type { Checks } from "../../lib/types.ts";
import d3 from "../D3/checks.ts";
import { bypassChecks } from "../D1/presets.ts";

// D3, plus the bypasses its prompt forbids, checked automatically instead of by
// the judge alone.
const checks: Checks = ctx => [...d3(ctx), ...bypassChecks(ctx)];
export default checks;
