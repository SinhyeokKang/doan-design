import type { Agent } from "./args.ts";

export const KNOWN_CONDITIONS: { scenario: string; agent: Agent; note: string; expectedFailedChecks: string[] }[] = [];
