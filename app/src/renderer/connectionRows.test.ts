import { expect, test } from "vitest";
import type { MachineState } from "../main/onboarding/machine";
import { connectionRow, connectionConfirm, connectionBanner } from "./connectionRows";
import { idleUi } from "./onboardingView";
const home = "/Users/alex";
const app = "/Applications/doan.app/Contents/Resources/bin/doan";
type Overrides = Partial<Omit<MachineState, "display">> & { display?: Partial<MachineState["display"]> };
function machine(overrides: Overrides = {}): MachineState {
  const link = (state: MachineState["cli"]["state"], value: string | null = null) => ({ state, value, stamp: "s" });
  const agents: MachineState["agents"] = {
    claude: { executable: "/opt/homebrew/bin/claude", config: `${home}/.claude`, mcp: { state: "missing", value: "" } },
    codex: { executable: "/opt/homebrew/bin/codex", config: `${home}/.codex`, mcp: { state: "missing", value: "" } },
  };
  const display: MachineState["display"] = {
    home, cliPath: `${home}/.local/bin/doan`, cliTarget: app, stubPath: `${home}/.agents/skills/doan/SKILL.md`,
    claudeLinkPath: `${home}/.claude/skills/doan`, claudeLinkTarget: "../../.agents/skills/doan", mcpCommand: `${home}/.local/bin/doan mcp`,
    configFile: { claude: `${home}/.claude.json`, codex: `${home}/.codex/config.toml` }, configFromEnv: { claude: false, codex: false },
    blocked: { cli: null, stub: null, claudeLink: null }, appVersion: "0.1.0",
  };
  const { display: displayOverrides, ...rest } = overrides;
  const state = { requestId: "r", available: true, reason: null, pathPresent: true, rcFile: "~/.zshrc", probe: { ok: true, path: "/usr/bin" } as const,
    cli: link("missing"), stub: { state: "missing" as const, stamp: "s" }, claudeLink: link("missing"), agents, ...rest, display: { ...display, ...displayOverrides } };
  return { ...state, expected: { cli: state.cli, stub: state.stub, claudeLink: state.claudeLink, agents: state.agents } };
}

test("first read has no action or sentence; refresh keeps the settled status", () => {
  expect(connectionRow(null, "cli", idleUi())).toMatchObject({ status: "Checking…", parts: [] });
  expect(connectionRow(machine(), "cli", { ...idleUi(), checking: true })).toMatchObject({ status: "Not connected", action: { label: "Connect", disabled: true } });
});
test("broken CLI offers Fix and a missing-target confirmation", () => {
  const state = machine({ cli: { state: "dangling", value: "/gone/doan", stamp: "s" } });
  expect(connectionRow(state, "cli", idleUi())).toMatchObject({ status: "Needs attention", cause: "Link is broken.", action: { label: "Fix…" } });
  expect(connectionConfirm("cli", "claude", state)).toMatchObject({ title: "Fix the doan link?", current: "/gone/doan (missing)", verb: "Fix Link" });
  expect(connectionBanner({ kind: "cli-dangling" }, "cli")).toEqual(["The doan command link is broken, so agents can’t reach doan."]);
});
test("blocked and translocated connections never offer replacement", () => {
  expect(connectionRow(machine({ cli: { state: "blocked", value: null, stamp: "s" } }), "cli", idleUi())).toMatchObject({ action: { kind: "check" } });
  expect(connectionRow(machine({ available: false, reason: "Move doan to Applications, then open it again." }), "cli", idleUi()).action).toBeUndefined();
});
test("unknown and absent agents have distinct actions", () => {
  const state = machine(); state.agents.codex.executable = null;
  expect(connectionRow(state, "codex", idleUi())).toMatchObject({ status: "Not installed", action: { kind: "install", label: "Install Codex ↗" } });
  state.probe = { ok: false, reason: "Timed out" };
  expect(connectionRow(state, "codex", idleUi())).toMatchObject({ status: "Couldn’t check", parts: ["Timed out."], action: { kind: "check" } });
});
test("shared skill and MCP conflict copy identifies the cause", () => {
  const state = machine(); state.stub.state = "differs";
  expect(connectionRow(state, "claude", idleUi()).cause).toBe("Skill was changed.");
  state.agents.claude.mcp = { state: "other", value: '{"command":"/other/doan","args":["mcp"]}' };
  expect(connectionRow(state, "claude", idleUi())).toMatchObject({ cause: "MCP runs another command.", parts: ["Claude Code’s doan server runs ", { code: "/other/doan mcp" }, ", not this app’s doan."] });
});
