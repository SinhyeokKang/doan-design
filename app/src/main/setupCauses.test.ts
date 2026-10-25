import { describe, expect, test } from "vitest";
import { connectionSummary, type ConnectionMachineState } from "../setup/connectionSummary";
import { connectionCauses } from "./setupCauses";

function machine(): ConnectionMachineState {
  return {
    probe: { ok: true, path: "/bin" } as ConnectionMachineState["probe"], cli: { state: "ours" }, stub: { state: "ours" }, claudeLink: { state: "ours" },
    agents: { claude: { executable: "/bin/claude", mcp: { state: "ours" } }, codex: { executable: "/bin/codex", mcp: { state: "ours" } } },
  };
}

describe("connectionCauses", () => {
  test("is empty when no row needs attention", () => {
    expect(connectionCauses(machine(), false)).toEqual({});
  });
  test.each([["dangling", "dangling"], ["link-other", "link-other"], ["blocked", "blocked"]] as const)("names the doan command cause for link %s", (state, cause) => {
    const input = machine(); input.cli.state = state;
    expect(connectionCauses(input, false)).toEqual({ cli: cause });
  });
  test("translocated wins over the link state", () => {
    const input = machine(); input.cli.state = "dangling";
    expect(connectionCauses(input, true)).toEqual({ cli: "translocated" });
    expect(connectionCauses(machine(), true)).toEqual({ cli: "translocated" });
  });
  test.each(["claude", "codex"] as const)("names the %s cause: MCP before shared skill before Claude link", agent => {
    const mcp = machine(); mcp.agents[agent].mcp.state = "other";
    expect(connectionCauses(mcp, false)).toEqual({ [agent]: "mcp-other" });
    const differs = machine(); differs.stub.state = "differs";
    expect(connectionCauses(differs, false)).toEqual({ claude: "skill-differs", codex: "skill-differs" });
    const blocked = machine(); blocked.stub.state = "blocked";
    expect(connectionCauses(blocked, false)).toEqual({ claude: "skill-blocked", codex: "skill-blocked" });
    const both = machine(); both.agents[agent].mcp.state = "other"; both.stub.state = "differs"; both.claudeLink.state = "link-other";
    expect(connectionCauses(both, false)[agent]).toBe("mcp-other");
  });
  test.each([["dangling", "link-dangling"], ["link-other", "link-other"], ["blocked", "link-blocked"]] as const)("the Claude link %s is a Claude cause only", (state, cause) => {
    const input = machine(); input.claudeLink.state = state;
    expect(connectionCauses(input, false)).toEqual({ claude: cause });
    const skill = machine(); skill.stub.state = "differs"; skill.claudeLink.state = state;
    expect(connectionCauses(skill, false).claude).toBe("skill-differs");
  });
  test("an agent that is not installed has no cause even when the shared skill differs", () => {
    const input = machine(); input.stub.state = "differs"; input.agents.codex.executable = null;
    expect(connectionCauses(input, false)).toEqual({ claude: "skill-differs" });
  });

  // A banner sentence exists exactly for the rows the summary calls Needs attention.
  test("a row has a cause exactly when its summary is needs-attention", () => {
    const links = ["missing", "ours", "dangling", "link-other", "blocked"] as const;
    for (const probeOk of [true, false]) for (const translocated of [false, true]) for (const cli of links) for (const claudeLink of links)
      for (const stub of ["missing", "ours", "differs", "blocked"] as const) for (const claudeMcp of ["missing", "ours", "other", "unknown"] as const)
        for (const codexMcp of ["missing", "ours", "other", "unknown"] as const) for (const claudeExe of ["/bin/claude", null]) {
          const input = machine();
          input.probe = (probeOk ? { ok: true, path: "/bin" } : { ok: false, reason: "timeout" }) as ConnectionMachineState["probe"];
          input.cli.state = cli; input.claudeLink.state = claudeLink; input.stub.state = stub;
          input.agents.claude = { executable: claudeExe, mcp: { state: claudeMcp } }; input.agents.codex.mcp.state = codexMcp;
          const summary = connectionSummary(input, translocated);
          const causes = connectionCauses(input, translocated);
          for (const row of ["cli", "claude", "codex"] as const) {
            expect(causes[row] !== undefined, JSON.stringify({ row, summary, causes })).toBe(summary[row] === "needs-attention");
          }
        }
  });
});
