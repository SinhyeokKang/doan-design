import { connectionSummary, type ConnectionMachineState } from "../setup/connectionSummary";

// Why a Needs-attention row needs attention, one enum per row for the Home
// banner (design/app-setup.html home-setup). The agent a sentence names is the
// row key itself; Claude Code's skill link exists only on the "claude" row.
export type CliCause = "translocated" | "dangling" | "link-other" | "blocked";
export type AgentCause = "mcp-other" | "skill-differs" | "skill-blocked" | "link-dangling" | "link-other" | "link-blocked";
export interface ConnectionCauses {
  cli?: CliCause;
  claude?: AgentCause;
  codex?: AgentCause;
}

// A row has a cause exactly when `connectionSummary` calls it Needs attention
// (tested over every state), so the banner never has a row without a sentence.
// With several causes at once the first listed wins, in the order a Fix works:
// the MCP registration, then the shared skill, then Claude Code's link.
export function connectionCauses(machine: ConnectionMachineState, translocated: boolean): ConnectionCauses {
  const summary = connectionSummary(machine, translocated);
  const causes: ConnectionCauses = {};
  if (summary.cli === "needs-attention") causes.cli = translocated ? "translocated" : (machine.cli.state as Exclude<CliCause, "translocated">);
  for (const agent of ["claude", "codex"] as const) {
    if (summary[agent] !== "needs-attention") continue;
    const link = agent === "claude" ? machine.claudeLink.state : "ours";
    causes[agent] = machine.agents[agent].mcp.state === "other" ? "mcp-other" :
      machine.stub.state === "differs" ? "skill-differs" :
      machine.stub.state === "blocked" ? "skill-blocked" :
      link === "dangling" ? "link-dangling" : link === "link-other" ? "link-other" : "link-blocked";
  }
  return causes;
}
