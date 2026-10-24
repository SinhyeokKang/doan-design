import type { Agent } from "./args.ts";

export const KNOWN_CONDITIONS: { scenario: string; agent: Agent; note: string; expectedFailedChecks: string[] }[] = [
  { scenario: "R2", agent: "codex", expectedFailedChecks: ["selected_primary_background"], note: "expected fail: MCP disabled by design (see R2b)" },
];
