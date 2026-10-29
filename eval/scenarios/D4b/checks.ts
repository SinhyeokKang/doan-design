import type { Checks } from "../../lib/types.ts";
import d4 from "../D4/checks.ts";
import { otherDoanCheck, sourceReadCheck } from "../D1/presets.ts";

// D4, with `go run`/`go build` of the doan command counted as another binary
// and reads of doan's source files checked automatically.
const checks: Checks = ctx => [...d4(ctx).filter(c => c.id !== "no_other_doan_binary"), otherDoanCheck(ctx), sourceReadCheck(ctx)];
export default checks;
