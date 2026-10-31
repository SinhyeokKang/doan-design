import type { Agent } from "./args.ts";

export const KNOWN_CONDITIONS: { scenario: string; agent: Agent; note: string; expectedFailedChecks: string[] }[] = [
  { scenario: "R1b", agent: "codex", expectedFailedChecks: ["profile_agent_resolves_only", "profile_comments_valid"], note: "MCP write approval refused under approval: never; no shell CLI by design (see USABILITY-EVAL 'Write-tool approval candidate')" },
];
