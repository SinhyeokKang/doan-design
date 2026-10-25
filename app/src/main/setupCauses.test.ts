import { describe, expect, test } from "vitest";
import { connectionSummary } from "../setup/connectionSummary";
import { connectionCauses, type CauseInput } from "./setupCauses";

function machine(): CauseInput {
  return {
    probe: { ok: true, path: "/bin" } as CauseInput["probe"], cli: { state: "ours", value: null }, stub: { state: "ours" }, claudeLink: { state: "ours", value: null },
    agents: { claude: { executable: "/bin/claude", mcp: { state: "ours", value: "" } }, codex: { executable: "/bin/codex", mcp: { state: "ours", value: "" } } },
    display: { cliPath: "/h/.local/bin/doan", stubPath: "/h/.agents/skills/doan/SKILL.md", claudeLinkPath: "/h/.claude/skills/doan", blocked: { cli: null, stub: null, claudeLink: null } },
  };
}

describe("connectionCauses", () => {
  test("is empty when no row needs attention", () => {
    expect(connectionCauses(machine(), false)).toEqual({});
  });
  test("names a dangling doan command link without a path", () => {
    const input = machine(); input.cli = { state: "dangling", value: "/gone/doan" };
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-dangling" } });
  });
  test("names the other copy a doan command link points to, preferring the real path", () => {
    const input = machine(); input.cli = { state: "link-other", value: "../other/doan" };
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-other", path: "../other/doan" } });
    input.display.realPaths = { cli: "/Users/a/other/doan" };
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-other", path: "/Users/a/other/doan" } });
    input.cli = { state: "link-other", value: null };
    delete input.display.realPaths;
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-other" } });
  });
  test("names the item in the way of a blocked doan command, else the command path", () => {
    const input = machine(); input.cli = { state: "blocked", value: null };
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-blocked", path: "/h/.local/bin/doan" } });
    input.display.blocked.cli = "/h/.local";
    expect(connectionCauses(input, false)).toEqual({ cli: { kind: "cli-blocked", path: "/h/.local" } });
  });
  test("translocated wins over the link state", () => {
    const input = machine(); input.cli = { state: "dangling", value: null };
    expect(connectionCauses(input, true)).toEqual({ cli: { kind: "translocated" } });
    expect(connectionCauses(machine(), true)).toEqual({ cli: { kind: "translocated" } });
  });
  test.each(["claude", "codex"] as const)("names the %s cause: MCP before shared skill before Claude link", agent => {
    const mcp = machine(); mcp.agents[agent].mcp.state = "other";
    expect(connectionCauses(mcp, false)).toEqual({ [agent]: { kind: "mcp-other" } });
    const differs = machine(); differs.stub.state = "differs";
    expect(connectionCauses(differs, false)).toEqual({ claude: { kind: "skill-differs" }, codex: { kind: "skill-differs" } });
    const blocked = machine(); blocked.stub.state = "blocked";
    expect(connectionCauses(blocked, false)).toEqual({ claude: { kind: "skill-blocked", path: "/h/.agents/skills/doan/SKILL.md" }, codex: { kind: "skill-blocked", path: "/h/.agents/skills/doan/SKILL.md" } });
    blocked.display.blocked.stub = "/h/.agents";
    expect(connectionCauses(blocked, false).codex).toEqual({ kind: "skill-blocked", path: "/h/.agents" });
    const both = machine(); both.agents[agent].mcp.state = "other"; both.stub.state = "differs"; both.claudeLink = { state: "link-other", value: null };
    expect(connectionCauses(both, false)[agent]?.kind).toBe("mcp-other");
  });
  test("names the command an other MCP registration runs", () => {
    const claude = machine(); claude.agents.claude.mcp = { state: "other", value: JSON.stringify({ type: "stdio", command: "/old/doan", args: ["mcp"] }) };
    expect(connectionCauses(claude, false)).toEqual({ claude: { kind: "mcp-other", path: "/old/doan" } });
    const codex = machine(); codex.agents.codex.mcp = { state: "other", value: JSON.stringify({ name: "doan", enabled: true, transport: { type: "stdio", command: "/old/doan", args: ["mcp"] } }) };
    expect(connectionCauses(codex, false)).toEqual({ codex: { kind: "mcp-other", path: "/old/doan" } });
    const url = machine(); url.agents.claude.mcp = { state: "other", value: JSON.stringify({ type: "http", url: "https://x" }) };
    expect(connectionCauses(url, false)).toEqual({ claude: { kind: "mcp-other" } });
  });
  test("the Claude link causes belong to the claude row only", () => {
    const dangling = machine(); dangling.claudeLink = { state: "dangling", value: "gone" };
    expect(connectionCauses(dangling, false)).toEqual({ claude: { kind: "claude-link-dangling" } });
    const other = machine(); other.claudeLink = { state: "link-other", value: "../x" };
    expect(connectionCauses(other, false)).toEqual({ claude: { kind: "claude-link-other", path: "../x" } });
    other.display.realPaths = { claudeLink: "/Users/a/x" };
    expect(connectionCauses(other, false)).toEqual({ claude: { kind: "claude-link-other", path: "/Users/a/x" } });
    const blocked = machine(); blocked.claudeLink = { state: "blocked", value: null };
    expect(connectionCauses(blocked, false)).toEqual({ claude: { kind: "claude-link-blocked", path: "/h/.claude/skills/doan" } });
    blocked.display.blocked.claudeLink = "/h/.claude/skills";
    expect(connectionCauses(blocked, false)).toEqual({ claude: { kind: "claude-link-blocked", path: "/h/.claude/skills" } });
    for (const state of ["dangling", "link-other", "blocked"] as const) {
      const skill = machine(); skill.stub.state = "differs"; skill.claudeLink = { state, value: null };
      expect(connectionCauses(skill, false).claude?.kind).toBe("skill-differs");
    }
  });
  test("an agent that is not installed has no cause even when the shared skill differs", () => {
    const input = machine(); input.stub.state = "differs"; input.agents.codex.executable = null;
    expect(connectionCauses(input, false)).toEqual({ claude: { kind: "skill-differs" } });
  });

  // A banner sentence exists exactly for the rows the summary calls Needs attention.
  test("a row has a cause exactly when its summary is needs-attention", () => {
    const links = ["missing", "ours", "dangling", "link-other", "blocked"] as const;
    for (const probeOk of [true, false]) for (const translocated of [false, true]) for (const cli of links) for (const claudeLink of links)
      for (const stub of ["missing", "ours", "differs", "blocked"] as const) for (const claudeMcp of ["missing", "ours", "other", "unknown"] as const)
        for (const codexMcp of ["missing", "ours", "other", "unknown"] as const) for (const claudeExe of ["/bin/claude", null]) {
          const input = machine();
          input.probe = (probeOk ? { ok: true, path: "/bin" } : { ok: false, reason: "timeout" }) as CauseInput["probe"];
          input.cli.state = cli; input.claudeLink.state = claudeLink; input.stub.state = stub;
          input.agents.claude = { executable: claudeExe, mcp: { state: claudeMcp, value: "" } }; input.agents.codex.mcp.state = codexMcp;
          const summary = connectionSummary(input, translocated);
          const causes = connectionCauses(input, translocated);
          for (const row of ["cli", "claude", "codex"] as const) {
            expect(causes[row] !== undefined, JSON.stringify({ row, summary, causes })).toBe(summary[row] === "needs-attention");
          }
        }
  });
});
