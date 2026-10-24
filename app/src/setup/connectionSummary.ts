import type { MachineState } from "../main/onboarding/machine";
import type { Agent, LinkState, McpState, StubState } from "../main/onboarding/states";

export type ConnectionStatus = "connected" | "needs-attention" | "not-connected" | "not-installed" | "couldnt-check";
export type ConnectionSummary = Record<"cli" | Agent, ConnectionStatus>;
export interface ConnectionMachineState {
  probe: MachineState["probe"];
  cli: { state: LinkState };
  stub: { state: StubState };
  claudeLink: { state: LinkState };
  agents: Record<Agent, { executable: string | null; mcp: { state: McpState } }>;
}

export function connectionSummary(machine: ConnectionMachineState, translocated: boolean): ConnectionSummary {
  const cli: ConnectionStatus = translocated ? "needs-attention" : !machine.probe.ok ? "couldnt-check" :
    machine.cli.state === "ours" ? "connected" : machine.cli.state === "missing" ? "not-connected" : "needs-attention";
  const agentStatus = (agent: Agent): ConnectionStatus => {
    if (!machine.probe.ok) return "couldnt-check";
    const { executable, mcp } = machine.agents[agent];
    if (executable === null) return "not-installed";
    if (mcp.state === "unknown") return "couldnt-check";
    const link = agent === "claude" ? machine.claudeLink.state : "ours";
    if (mcp.state === "other" || machine.stub.state === "differs" || machine.stub.state === "blocked" ||
      link === "dangling" || link === "link-other" || link === "blocked") return "needs-attention";
    return mcp.state === "ours" && machine.stub.state === "ours" && link === "ours" ? "connected" : "not-connected";
  };
  return { cli, claude: agentStatus("claude"), codex: agentStatus("codex") };
}
