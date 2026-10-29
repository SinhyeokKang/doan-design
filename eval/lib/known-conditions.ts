import type { Agent } from "./args.ts";

const ONBOARDING_SANDBOX = "expected fail: Codex workspace-write sandbox blocks the app socket and these scenarios provide no MCP onboarding tools (an MCP variant is follow-up work)";

export const KNOWN_CONDITIONS: { scenario: string; agent: Agent; note: string; expectedFailedChecks: string[] }[] = [
  { scenario: "R1b", agent: "codex", expectedFailedChecks: ["profile_agent_resolves_only", "profile_comments_valid"], note: "MCP write approval refused under approval: never; no shell CLI by design (see USABILITY-EVAL 'Write-tool approval candidate')" },
  { scenario: "R2", agent: "codex", expectedFailedChecks: ["selected_primary_background", "only_canvas_changed"], note: "expected fail: MCP disabled by design (see R2b)" },
  { scenario: "O1", agent: "codex", expectedFailedChecks: ["onboarding_started", "session_from_start", "inspected_repo_path", "selected_with_initialize", "complete_only_when_ready", "completion_confirmed"], note: ONBOARDING_SANDBOX },
  { scenario: "O2", agent: "codex", expectedFailedChecks: ["onboarding_started", "session_from_start", "claude_sign_in_started", "saw_awaiting_user"], note: ONBOARDING_SANDBOX },
];
