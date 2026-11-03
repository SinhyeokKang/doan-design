import type { Checks } from "../../lib/types.ts";
import o1Checks from "../O1/checks.ts";
import { noDoanInit } from "./setup-checks.ts";

// The O1 setup (Claude ready, repo needs setup, setup files allowed) asked as a
// repository setup request with no path or command name: the agent must take
// the onboarding path and finish it, not `doan init`.
const checks: Checks = ctx => [...o1Checks(ctx), noDoanInit(ctx)];
export default checks;
