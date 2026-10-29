import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { MachineState } from "../main/onboarding/machine";
import { ConnectionRows } from "./ConnectionRows";
import { connectionRow, connectionConfirm, connectionBanner } from "./connectionRowView";
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
  expect(connectionConfirm("cli", "claude", state)).toMatchObject({ title: "Fix the Doan link?", current: "/gone/doan (missing)", verb: "Fix Link" });
  expect(connectionBanner({ kind: "cli-dangling" }, "cli")).toEqual(["The doan command link is broken, so agents can’t reach Doan."]);
});
test("blocked and translocated connections never offer replacement", () => {
  expect(connectionRow(machine({ cli: { state: "blocked", value: null, stamp: "s" } }), "cli", idleUi())).toMatchObject({ action: { kind: "check" } });
  expect(connectionRow(machine({ available: false, reason: "Move Doan to Applications, then open it again." }), "cli", idleUi()).action).toBeUndefined();
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
  expect(connectionRow(state, "claude", idleUi())).toMatchObject({ cause: "MCP runs another command.", parts: ["Claude Code’s doan server runs ", { code: "/other/doan mcp" }, ", not this app’s Doan."] });
});

test("blocked shared skill wins over a foreign Claude link and stays read-only", () => {
  const state = machine(); state.stub.state = "blocked"; state.claudeLink.state = "link-other";
  expect(connectionRow(state, "claude", idleUi())).toMatchObject({ cause: "Path is blocked.", action: { kind: "check" } });
});

test("a development build without DOAN_CLI gives its reason as the row sentence, once", () => {
  const reason = "This build has no bundled CLI. Set DOAN_CLI.";
  const state = machine({ available: false, reason, display: { cliTarget: null } });
  expect(connectionRow(state, "cli", idleUi())).toMatchObject({ status: "Not connected", parts: [reason], action: { label: "Connect", disabled: true } });
  const html = renderToStaticMarkup(createElement(ConnectionRows, { machine: state, ui: idleUi(), rows: ["cli"], run() {}, checkAgain() {}, install() {}, copyPath() {} }));
  expect(html.split(reason)).toHaveLength(2);
  expect(html).not.toContain("Agents can’t run Doan until the command is connected.");
  // Agent rows keep their own sentence; the reason follows it.
  expect(connectionRow(state, "claude", idleUi()).parts).toEqual(["Claude Code is installed but can’t use Doan yet."]);
  const agentHtml = renderToStaticMarkup(createElement(ConnectionRows, { machine: state, ui: idleUi(), rows: ["claude"], run() {}, checkAgain() {}, install() {}, copyPath() {} }));
  expect(agentHtml.split(reason)).toHaveLength(2);
});

test("Connect waiting for the doan command uses the row's wording, not the wizard's step number", () => {
  const ui = { ...idleUi(), outcome: { claude: { kind: "unavailable" as const, message: "Install the CLI link in step 1 before connecting MCP." } } };
  const html = renderToStaticMarkup(createElement(ConnectionRows, { machine: machine({ cli: { state: "dangling", value: "/gone", stamp: "s" } }), ui, rows: ["claude"], run() {}, checkAgain() {}, install() {}, copyPath() {} }));
  expect(html).toContain("Connect the doan command first; MCP needs it.");
  expect(html).not.toContain("step 1");
});
