import { connectionSummary, type ConnectionMachineState } from "../setup/connectionSummary";
import type { Agent } from "./onboarding/states";

// Why a Needs-attention row needs attention, one cause per row for the Home
// banner (doan/app-setup.html home-setup). The agent a sentence names is the
// row key itself; Claude Code's skill link exists only on the "claude" row.
export type CauseKind =
  | "cli-dangling" | "cli-other" | "cli-blocked" | "translocated"
  | "mcp-other" | "skill-differs" | "skill-blocked"
  | "claude-link-other" | "claude-link-dangling" | "claude-link-blocked";
// `path` is the path the sentence names, as main spells it (the renderer
// shortens `home`): the item in the way of a blocked state, the other copy a
// link points to, the command an MCP registration runs. Absent when unknown.
export interface Cause { kind: CauseKind; path?: string }
export interface ConnectionCauses {
  cli?: Cause;
  claude?: Cause;
  codex?: Cause;
}

// `ConnectionMachineState` plus what the sentences name; `MachineState` fits.
export type CauseInput = Omit<ConnectionMachineState, "cli" | "claudeLink" | "agents"> & {
  cli: ConnectionMachineState["cli"] & { value: string | null };
  claudeLink: ConnectionMachineState["claudeLink"] & { value: string | null };
  agents: Record<Agent, ConnectionMachineState["agents"][Agent] & { mcp: { value: string } }>;
  display: {
    cliPath: string; stubPath: string; claudeLinkPath: string;
    blocked: { cli: string | null; stub: string | null; claudeLink: string | null };
    realPaths?: { cli?: string; claudeLink?: string };
  };
};

const withPath = (kind: CauseKind, path: string | null | undefined): Cause => path ? { kind, path } : { kind };

// `mcp.value` is the doan registration as JSON: Claude's entry itself, Codex's
// whole `mcp get` result. Anything without a stdio command has none to name.
function mcpCommand(agent: Agent, value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const entry: unknown = agent === "codex" && typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "transport") : parsed;
    const command: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "command") : undefined;
    return typeof command === "string" ? command : null;
  } catch {
    return null;
  }
}

// A row has a cause exactly when `connectionSummary` calls it Needs attention
// (tested over every state), so the banner never has a row without a sentence.
// With several causes at once the first listed wins, in the order a Fix works:
// the MCP registration, then the shared skill, then Claude Code's link.
export function connectionCauses(machine: CauseInput, translocated: boolean): ConnectionCauses {
  const summary = connectionSummary(machine, translocated);
  const { display } = machine;
  const causes: ConnectionCauses = {};
  if (summary.cli === "needs-attention") {
    causes.cli = translocated ? { kind: "translocated" } :
      machine.cli.state === "dangling" ? { kind: "cli-dangling" } :
      machine.cli.state === "link-other" ? withPath("cli-other", display.realPaths?.cli ?? machine.cli.value) :
      withPath("cli-blocked", display.blocked.cli ?? display.cliPath);
  }
  for (const agent of ["claude", "codex"] as const) {
    if (summary[agent] !== "needs-attention") continue;
    const link = agent === "claude" ? machine.claudeLink.state : "ours";
    causes[agent] = machine.agents[agent].mcp.state === "other" ? withPath("mcp-other", mcpCommand(agent, machine.agents[agent].mcp.value)) :
      machine.stub.state === "differs" ? { kind: "skill-differs" } :
      machine.stub.state === "blocked" ? withPath("skill-blocked", display.blocked.stub ?? display.stubPath) :
      link === "dangling" ? { kind: "claude-link-dangling" } :
      link === "link-other" ? withPath("claude-link-other", display.realPaths?.claudeLink ?? machine.claudeLink.value) :
      withPath("claude-link-blocked", display.blocked.claudeLink ?? display.claudeLinkPath);
  }
  return causes;
}
