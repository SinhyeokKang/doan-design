import { describe, expect, test } from "vitest";
import { connectionSummary, type ConnectionMachineState } from "./connectionSummary";

function machine(): ConnectionMachineState {
  return {
    probe: { ok: true, path: "/bin" }, cli: { state: "ours" }, stub: { state: "ours" }, claudeLink: { state: "ours" },
    agents: { claude: { executable: "/bin/claude", mcp: { state: "ours" } }, codex: { executable: "/bin/codex", mcp: { state: "ours" } } },
  };
}
describe("connectionSummary", () => {
  test("reports all connected without depending on PATH membership", () => {
    expect(connectionSummary(machine(), false)).toEqual({ cli: "connected", claude: "connected", codex: "connected" });
  });
  test.each(["missing", "ours", "dangling", "link-other", "blocked"] as const)("classifies CLI %s", state => {
    const input = machine(); input.cli.state = state;
    expect(connectionSummary(input, false).cli).toBe(state === "ours" ? "connected" : state === "missing" ? "not-connected" : "needs-attention");
    expect(connectionSummary(input, true).cli).toBe("needs-attention");
  });
  test("reports failed probing without claiming an agent is absent", () => {
    const input = machine(); input.probe = { ok: false, reason: "timeout" }; input.agents.claude.executable = null;
    expect(connectionSummary(input, false)).toEqual({ cli: "couldnt-check", claude: "couldnt-check", codex: "couldnt-check" });
    expect(connectionSummary(input, true).cli).toBe("needs-attention");
  });
  test.each(["claude", "codex"] as const)("classifies every %s MCP state", agent => {
    for (const [state, expected] of [["ours", "connected"], ["missing", "not-connected"], ["other", "needs-attention"], ["unknown", "couldnt-check"]] as const) {
      const input = machine(); input.agents[agent].mcp.state = state;
      expect(connectionSummary(input, false)[agent]).toBe(expected);
      input.agents[agent].executable = null;
      expect(connectionSummary(input, false)[agent]).toBe("not-installed");
    }
  });
  test.each(["missing", "ours", "differs", "blocked"] as const)("classifies shared skill %s for both agents", state => {
    const input = machine(); input.stub.state = state;
    const expected = state === "ours" ? "connected" : state === "missing" ? "not-connected" : "needs-attention";
    expect(connectionSummary(input, false)).toEqual({ cli: "connected", claude: expected, codex: expected });
  });
  test.each(["missing", "ours", "dangling", "link-other", "blocked"] as const)("uses Claude link %s only for Claude", state => {
    const input = machine(); input.claudeLink.state = state;
    expect(connectionSummary(input, false).claude).toBe(state === "ours" ? "connected" : state === "missing" ? "not-connected" : "needs-attention");
    expect(connectionSummary(input, false).codex).toBe("connected");
  });
  test("unknown MCP wins over incomplete or conflicting setup", () => {
    const input = machine(); input.agents.claude.mcp.state = "unknown"; input.stub.state = "differs";
    expect(connectionSummary(input, false).claude).toBe("couldnt-check");
    input.agents.codex.mcp.state = "missing";
    expect(connectionSummary(input, false).codex).toBe("needs-attention");
  });
});
