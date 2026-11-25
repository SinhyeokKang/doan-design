import type { Checks } from "../../lib/types.ts";
import o1Checks from "../O1/checks.ts";
import { noDoanInit } from "./setup-checks.ts";

// The O1 setup asked as a repository setup request naming no path or command: the agent must take the
// onboarding path and finish it, not `doan init`.
const checks: Checks = ctx => [...o1Checks(ctx), noDoanInit(ctx)];
export default checks;
