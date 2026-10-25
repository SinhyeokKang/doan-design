import type { ScanSnapshot } from "../main/addProjects";
import { describe, expect, test } from "vitest";
import type { MachineState } from "../main/onboarding/machine";
import type { CanvasRow } from "../main/view";
import { PATH_LINE } from "../main/onboarding/machine";
import {
  advanceAfter, agentsView, NO_AGENT_NOTICE, promptStepView, cliItems, confirmView, copyFor, copyLabel, COPY_FAILED, footerView, idleUi, indicatorView, initMessage, nextFocusIndex,
  PATH_LINE_TEXT, pickView, projectStepView, registrationText, STEP_COPY, stepsDone, tilde, wizardBusy, type MachineUi,
} from "./onboardingView";

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
const ui = (patch: Partial<MachineUi> = {}): MachineUi => ({ ...idleUi(), ...patch });
const ours = (patch: Overrides = {}) => machine({ cli: { state: "ours", value: app, stamp: "s" }, ...patch });

describe("step 1 — CLI", () => {
  test("missing shows the link and its target with Install as the primary action", () => {
    const [item] = cliItems(machine(), ui());
    expect(item).toMatchObject({ label: "CLI link", detail: [{ code: "~/.local/bin/doan" }, " → ", { code: app }], chip: { text: "Not installed" }, button: { id: "install", label: "Install", primary: true, disabled: false } });
  });
  test("each link state has its chip, message and action", () => {
    expect(cliItems(ours(), ui())[0]).toMatchObject({ chip: { text: "Installed", tone: "ok" } });
    expect(cliItems(ours(), ui())[0]?.button).toBeUndefined();
    expect(cliItems(machine({ cli: { state: "link-other", value: "/Volumes/doan/doan", stamp: "s" } }), ui())[0]).toMatchObject({
      detail: [{ code: "~/.local/bin/doan" }], chip: { text: "Needs replacement", tone: "warn" }, button: { id: "replace", label: "Replace…", primary: true },
      msg: { tone: "warn", parts: ["Points to another copy: ", { code: "/Volumes/doan/doan" }] },
    });
    expect(cliItems(machine({ cli: { state: "blocked", value: null, stamp: "s" }, display: { blocked: { cli: `${home}/.local/bin`, stub: null, claudeLink: null } } }), ui())[0]).toMatchObject({
      chip: { text: "Unavailable", tone: "err" }, button: { id: "install", disabled: true },
      msg: { tone: "error", parts: [{ code: "~/.local/bin" }, " is in use by something else. Move or delete it, then Check Again."] },
    });
  });
  test("an unavailable CLI disables Install with the reason main gave", () => {
    const translocated = cliItems(machine({ available: false, reason: "Move doan to Applications, then open it again.", display: { cliTarget: null } }), ui())[0];
    expect(translocated).toMatchObject({ detail: [{ code: "~/.local/bin/doan" }], button: { disabled: true }, msg: { tone: "warn", parts: ["Move doan to Applications, then open it again."] } });
    const dev = cliItems(machine({ available: false, reason: "This build has no bundled CLI. Set DOAN_CLI.", display: { cliTarget: null } }), ui())[0];
    expect(dev).toMatchObject({ button: { disabled: true }, reason: "This build has no bundled CLI. Set DOAN_CLI." });
    expect(dev?.msg).toBeUndefined();
  });
  test("checking, a failed read and a running install disable the action", () => {
    expect(cliItems(machine(), ui({ checking: true }))[0]).toMatchObject({ chip: { text: "Checking…" }, button: { disabled: true } });
    expect(cliItems(null, ui({ checking: true }))[0]).toMatchObject({ chip: { text: "Checking…" }, button: { disabled: true } });
    expect(cliItems(null, ui({ readError: "Permission denied." }))[0]).toMatchObject({ chip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: ["Permission denied. Choose Check Again."] } });
    expect(cliItems(machine(), ui({ running: "cli" }))[0]?.button?.disabled).toBe(true);
  });
  test("an action result is shown on the row", () => {
    expect(cliItems(machine(), ui({ outcome: { cli: { kind: "error", message: "EACCES" } } }))[0]?.msg).toEqual({ tone: "error", parts: ["EACCES"] });
    expect(cliItems(machine(), ui({ outcome: { cli: { kind: "changed" } } }))[0]?.reason).toBe("It changed after you looked, so nothing was replaced.");
  });
  test("PATH appears only when it needs action or could not be checked", () => {
    expect(cliItems(ours(), ui())).toHaveLength(1);
    const zsh = cliItems(ours({ pathPresent: false }), ui())[1];
    expect(zsh).toMatchObject({ label: "PATH", detail: ["Add this line to ", { code: "~/.zshrc" }, ", open a new terminal, then choose Check Again."], chip: { text: "Not on PATH", tone: "warn" }, copyLine: { text: PATH_LINE, button: { id: "copyPath", label: "Copy", disabled: false } } });
    expect(cliItems(ours({ pathPresent: false, rcFile: "~/.bash_profile" }), ui())[1]?.detail).toContainEqual({ code: "~/.bash_profile" });
    const other = cliItems(ours({ pathPresent: false, rcFile: null }), ui())[1];
    expect(other).toMatchObject({ detail: ["Add ~/.local/bin to PATH in your shell configuration, then choose Check Again."] });
    expect(other?.copyLine).toBeUndefined();
    expect(cliItems(ours({ pathPresent: false, probe: { ok: false, reason: "Login shell timed out." } }), ui())[1]).toMatchObject({ chip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: ["Login shell timed out. Choose Check Again."] } });
  });
  test("the PATH line copy follows the comments copy labels", () => {
    expect(PATH_LINE_TEXT).toBe(PATH_LINE);
    expect(cliItems(ours({ pathPresent: false }), ui({ pathCopy: "copying" }))[1]?.copyLine?.button).toMatchObject({ label: "Copying…", disabled: true });
    expect(cliItems(ours({ pathPresent: false }), ui({ pathCopy: "copied" }))[1]?.copyLine?.button.label).toBe("Copied");
    const failed = cliItems(ours({ pathPresent: false }), ui({ pathCopy: "failed" }))[1];
    expect(failed).toMatchObject({ copyLine: { button: { label: "Retry copy" } }, msg: { tone: "error", parts: [COPY_FAILED] } });
  });
});

describe("step 2 — Agents", () => {
  test("the shared skill row and both found agents start with Connect", () => {
    const view = agentsView(ours(), ui());
    expect(view.skill).toMatchObject({ label: "Skill", detail: [{ code: "~/.agents/skills/doan/SKILL.md" }, " · shared by Claude Code and Codex"], chip: { text: "Not installed" } });
    const [claude, codex] = view.agents;
    expect(claude?.head).toMatchObject({ label: "Claude Code", detail: ["Found at ", { code: "/opt/homebrew/bin/claude" }], button: { id: "connect", label: "Connect", primary: true, disabled: false } });
    expect(claude?.items).toMatchObject([
      { label: "Skill link", sub: true, detail: [{ code: "~/.claude/skills/doan" }, " → ", { code: "../../.agents/skills/doan" }], chip: { text: "Not installed" } },
      { label: "MCP", sub: true, detail: ["Registers in ", { code: "~/.claude.json" }, " (user scope)"], chip: { text: "Not registered" } },
    ]);
    expect(codex?.items).toMatchObject([{ label: "MCP", detail: ["Registers in ", { code: "~/.codex/config.toml" }] }]);
  });
  test("configuration from the login shell names where it registers", () => {
    const state = ours({ display: { configFile: { claude: "/w/claude/.claude.json", codex: "/w/codex/config.toml" }, configFromEnv: { claude: true, codex: true } } });
    const [claude, codex] = agentsView(state, ui()).agents;
    expect(claude?.items[1]?.detail).toEqual(["Registers in ", { code: "/w/claude/.claude.json" }, " (CLAUDE_CONFIG_DIR, user scope)"]);
    expect(codex?.items[0]?.detail).toEqual(["Registers in ", { code: "/w/codex/config.toml" }, " (CODEX_HOME)"]);
  });
  test("skill states", () => {
    expect(agentsView(ours({ stub: { state: "ours", stamp: "s" } }), ui()).skill.chip).toEqual({ text: "Installed", tone: "ok" });
    expect(agentsView(ours({ stub: { state: "differs", stamp: "s" } }), ui()).skill).toMatchObject({ chip: { text: "Needs replacement", tone: "warn" }, msg: { tone: "warn", parts: ["Modified or from another version"] } });
    const blocked = agentsView(ours({ stub: { state: "blocked", stamp: "s" }, display: { blocked: { cli: null, stub: `${home}/.agents/skills/doan`, claudeLink: null } } }), ui());
    expect(blocked.skill).toMatchObject({ chip: { text: "Unavailable", tone: "err" }, msg: { tone: "error", parts: [{ code: "~/.agents/skills/doan" }, " is in use by something else. Move or delete it, then Check Again."] } });
    expect(blocked.agents[0]?.head.button?.disabled).toBe(true);
  });
  test("detection results: not installed and couldn't check have no Connect or items", () => {
    const missing = ours(); missing.agents.codex = { ...missing.agents.codex, executable: null };
    expect(agentsView(missing, ui()).agents[1]).toEqual({ agent: "codex", head: { key: "codex", label: "Codex", detail: ["Not installed"], link: { target: "codex", label: "Install Codex ↗" } }, items: [] });
    const failed = agentsView(ours({ probe: { ok: false, reason: "Login shell timed out." } }), ui()).agents[0];
    expect(failed).toMatchObject({ head: { detail: [], detailChip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: ["Login shell timed out. Choose Check Again."] } }, items: [] });
    expect(failed?.head.button).toBeUndefined();
  });
  test("MCP states, the step-1 notice and running", () => {
    const other = ours(); other.agents.codex = { ...other.agents.codex, mcp: { state: "other", value: JSON.stringify({ name: "doan", enabled: true, transport: { type: "stdio", command: "/old/doan", args: ["mcp", "--debug"] } }) } };
    expect(agentsView(other, ui()).agents[1]?.items[0]).toMatchObject({ chip: { text: "Needs replacement", tone: "warn" }, msg: { tone: "warn", parts: ["Current command: ", { code: "/old/doan mcp --debug" }] } });
    const unknown = ours(); unknown.agents.claude = { ...unknown.agents.claude, mcp: { state: "unknown", value: "Unexpected token in JSON." } };
    const card = agentsView(unknown, ui()).agents[0];
    expect(card?.items[1]).toMatchObject({ chip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: ["Unexpected token in JSON. Choose Check Again."] } });
    expect(card?.head.button).toMatchObject({ id: "connect", disabled: false });
    const notReady = agentsView(machine(), ui()).agents[0];
    expect(notReady?.items[1]).toMatchObject({ dimmed: true, reason: "Install the CLI link in step 1 before connecting MCP." });
    expect(notReady?.head.button).toMatchObject({ id: "connect", disabled: false });
    const running = agentsView(ours(), ui({ running: "claude" }));
    expect(running.agents[0]?.head.button).toMatchObject({ label: "Connecting…", disabled: true });
    expect(running.agents[0]?.items[1]?.chip).toEqual({ text: "Registering…" });
    expect(running.agents[1]?.head.button?.disabled).toBe(true);
  });
  test("a login shell timeout names the shell, as in the draft", () => {
    const state = ours({ pathPresent: false, probe: { ok: false, reason: "Your login shell (/bin/zsh) didn’t answer in time." } });
    expect(cliItems(state, ui())[1]?.msg).toEqual({ tone: "warn", parts: ["Your login shell (/bin/zsh) didn’t answer in time. Choose Check Again."] });
    expect(agentsView(state, ui()).agents[0]?.head.msg).toEqual({ tone: "warn", parts: ["Your login shell (/bin/zsh) didn’t answer in time. Choose Check Again."] });
  });
  test("a Codex read that could not run or timed out says so once with Check Again", () => {
    for (const value of ["Couldn't run Codex at /opt/homebrew/bin/codex. spawn /opt/homebrew/bin/codex ENOENT", "Codex at /opt/homebrew/bin/codex didn’t answer in 10 s."]) {
      const state = ours(); state.agents.codex = { ...state.agents.codex, mcp: { state: "unknown", value } };
      const msg = agentsView(state, ui()).agents[1]?.items[0]?.msg;
      expect(msg).toEqual({ tone: "warn", parts: [`${value.replace(/\.?$/, ".")} Choose Check Again.`] });
      expect(String(msg?.parts[0]).match(/Check Again/g)).toHaveLength(1);
    }
  });
  test.each(["claude", "codex"] as const)("after Connect stops at an unreadable %s MCP, it keeps Couldn’t check and the observed cause", agent => {
    const state = ours({ stub: { state: "ours", stamp: "s" }, claudeLink: { state: "ours", value: "../../.agents/skills/doan", stamp: "s" } });
    state.agents[agent] = { ...state.agents[agent], mcp: { state: "unknown", value: "Unreadable registration." } };
    const card = agentsView(state, ui({ outcome: { [agent]: { kind: "unavailable", message: "Couldn't check the MCP registration. Check Again." } } })).agents[agent === "claude" ? 0 : 1];
    const mcp = card?.items.at(-1);
    expect(mcp).toMatchObject({ chip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: ["Unreadable registration. Choose Check Again."] } });
    if (agent === "claude") expect(card?.items[0]?.chip).toEqual({ text: "Installed", tone: "ok" });
    expect(card?.head.msg).toBeUndefined();
    expect(card?.head.button).toMatchObject({ id: "connect", disabled: false });
  });
  test.each(["claude", "codex"] as const)("after %s Connect without step 1, MCP keeps the step 1 notice instead of a failure", agent => {
    const state = machine({ stub: { state: "ours", stamp: "s" }, claudeLink: { state: "ours", value: "../../.agents/skills/doan", stamp: "s" } });
    const card = agentsView(state, ui({ outcome: { [agent]: { kind: "unavailable", message: "Install the CLI link in step 1 before connecting MCP." } } })).agents[agent === "claude" ? 0 : 1];
    const mcp = card?.items.at(-1);
    expect(mcp).toMatchObject({ dimmed: true, reason: "Install the CLI link in step 1 before connecting MCP.", chip: { text: "Not registered" } });
    expect(mcp?.msg).toBeUndefined();
    expect(card?.head.msg).toBeUndefined();
  });
  test("connected replaces the button with the new-session notice", () => {
    const state = ours({ stub: { state: "ours", stamp: "s" }, claudeLink: { state: "ours", value: "../../.agents/skills/doan", stamp: "s" } });
    state.agents.claude = { ...state.agents.claude, mcp: { state: "ours", value: "" } };
    const claude = agentsView(state, ui()).agents[0];
    expect(claude?.head).toMatchObject({ msg: { tone: "ok", parts: ["Connected. Start a new Claude Code session to use doan."] } });
    expect(claude?.head.button).toBeUndefined();
    expect(claude?.items.map(item => item.chip)).toEqual([{ text: "Installed", tone: "ok" }, { text: "Registered", tone: "ok" }]);
  });
  test("a failure marks the item that stopped Connect", () => {
    const state = ours({ stub: { state: "ours", stamp: "s" }, claudeLink: { state: "ours", value: "../../.agents/skills/doan", stamp: "s" } });
    const failed = agentsView(state, ui({ outcome: { claude: { kind: "error", message: "claude mcp add exited with code 1" } } })).agents[0];
    expect(failed?.items[1]).toMatchObject({ chip: { text: "Failed", tone: "err" }, msg: { tone: "error", parts: ["claude mcp add exited with code 1"] } });
    expect(failed?.head.button).toMatchObject({ label: "Connect", disabled: false });
    const original = JSON.stringify({ type: "stdio", command: "/old/doan", args: ["mcp"] });
    const replaced = agentsView(state, ui({ outcome: { claude: { kind: "error", message: "denied", original } } })).agents[0];
    expect(replaced?.items[1]?.msg).toEqual({ tone: "error", parts: ["Couldn’t replace the registration: denied. The original command was ", { code: "/old/doan mcp" }, "."] });
    const linkFailed = agentsView(ours({ stub: { state: "ours", stamp: "s" } }), ui({ outcome: { claude: { kind: "error", message: "EACCES" } } })).agents[0];
    expect(linkFailed?.items[0]).toMatchObject({ chip: { text: "Failed", tone: "err" }, msg: { parts: ["EACCES"] } });
    const stubFailed = agentsView(ours(), ui({ outcome: { codex: { kind: "unavailable", message: "Install the CLI link first." } } })).agents[1];
    expect(stubFailed?.head.msg).toEqual({ tone: "error", parts: ["Install the CLI link first."] });
    expect(agentsView(ours(), ui({ outcome: { codex: { kind: "changed" } } })).agents[1]?.head.reason).toBe("It changed after you looked, so nothing was replaced.");
  });
});

describe("confirmations", () => {
  test("each replacement names the current and new target and a specific verb", () => {
    const state = ours({ cli: { state: "link-other", value: "/Users/alex/Downloads/doan.app/Contents/Resources/bin/doan", stamp: "s" }, claudeLink: { state: "link-other", value: "../../my-skills/doan", stamp: "s" } });
    expect(confirmView("cli", "claude", state)).toEqual({ title: "Replace the doan link?", body: [{ code: "~/.local/bin/doan" }, " points to another copy of doan. Your terminal and agents will run this app’s copy instead."], current: "/Users/alex/Downloads/doan.app/Contents/Resources/bin/doan", next: app, verb: "Replace Link" });
    expect(confirmView("claudeLink", "claude", state)).toEqual({ title: "Replace the Claude Code skill link?", body: [{ code: "~/.claude/skills/doan" }, " points to another folder. Claude Code will read the shared doan skill instead."], current: "../../my-skills/doan", next: "../../.agents/skills/doan", verb: "Replace Link" });
    expect(confirmView("stub", "codex", state)).toEqual({ title: "Replace SKILL.md?", body: ["Your edits to SKILL.md will be replaced. Other files in ", { code: "~/.agents/skills/doan" }, " are kept."], current: "~/.agents/skills/doan/SKILL.md — Modified or from another version", next: "The skill stub from this app (doan 0.1.0)", verb: "Replace Skill" });
    state.agents.claude = { ...state.agents.claude, mcp: { state: "other", value: JSON.stringify({ command: "/old/doan", args: ["mcp"] }) } };
    expect(confirmView("mcp", "claude", state)).toEqual({ title: "Replace the doan MCP registration?", body: ["Claude Code already has an MCP server named doan in ", { code: "~/.claude.json" }, " (user scope)."], current: "/old/doan mcp", next: `${home}/.local/bin/doan mcp`, verb: "Replace MCP Registration" });
    expect(confirmView("mcp", "codex", state).body).toEqual(["Codex already has an MCP server named doan in ", { code: "~/.codex/config.toml" }, "."]);
  });
  test("registrations are shown as a command line, or as read when they have none", () => {
    expect(registrationText("claude", JSON.stringify({ command: "/a/doan", args: ["mcp"] }))).toBe("/a/doan mcp");
    expect(registrationText("codex", JSON.stringify({ name: "doan", transport: { command: "/b/doan", args: [] } }))).toBe("/b/doan");
    expect(registrationText("claude", JSON.stringify({ url: "http://x" }))).toBe('{"url":"http://x"}');
    expect(registrationText("claude", "not json")).toBe("not json");
  });
});

describe("wizard frame", () => {
  test("completion follows the 2026-10-24 rules", () => {
    const connected = ours({ stub: { state: "ours", stamp: "s" } }); connected.agents.codex = { ...connected.agents.codex, mcp: { state: "ours", value: "" } };
    expect(stepsDone(connected, { path: "/r", kind: "list", servedRev: 0, canvases: [] }, true)).toEqual([true, true, true, true]);
    expect(stepsDone(machine(), { path: "/r", kind: "uninitialized" }, false)).toEqual([false, false, false, false]);
    expect(stepsDone(null, undefined, false)).toEqual([false, false, false, false]);
    const missingAgent = ours({ stub: { state: "ours", stamp: "s" } }); missingAgent.agents.codex = { executable: null, config: "", mcp: { state: "ours", value: "" } };
    expect(stepsDone(missingAgent, undefined, false)[1]).toBe(false);
  });
  test("the indicator marks done steps with a check, the current step, and disables while busy", () => {
    expect(indicatorView(2, [true, false, false, false], false)).toEqual([
      { step: 0, label: "CLI", done: true, current: false, ariaLabel: "CLI, completed", disabled: false },
      { step: 1, label: "Agents", done: false, current: false, disabled: false },
      { step: 2, label: "Project", done: false, current: true, disabled: false },
      { step: 3, label: "First prompt", done: false, current: false, disabled: false },
    ]);
    expect(indicatorView(0, [false, false, false, false], true).every(step => step.disabled)).toBe(true);
  });
  test("the bottom bar per step", () => {
    expect(footerView(0, false, false, false)).toEqual({ stepNo: "Step 1 of 4", checkAgain: { disabled: false }, skip: { disabled: false }, next: { label: "Continue", primary: false, disabled: false } });
    expect(footerView(1, true, false, false).next).toEqual({ label: "Continue", primary: true, disabled: false });
    expect(footerView(0, false, false, true).checkAgain).toEqual({ disabled: true });
    expect(footerView(2, false, true, false)).toEqual({ stepNo: "Step 3 of 4", skip: { disabled: true }, next: { label: "Continue", primary: false, disabled: true } });
    expect(footerView(3, false, false, false)).toEqual({ stepNo: "Step 4 of 4", next: { label: "Done", primary: true, disabled: false } });
  });
  test("any pending action, including a copy, makes the wizard busy", () => {
    const idle = { running: null, confirming: false, projectBusy: false, closing: false, pathCopy: "idle", promptCopy: "idle" } as const;
    expect(wizardBusy(idle)).toBe(false);
    expect(wizardBusy({ ...idle, pathCopy: "copied", promptCopy: "failed" })).toBe(false);
    for (const patch of [{ running: "claude" }, { confirming: true }, { projectBusy: true }, { closing: true }, { pathCopy: "copying" }, { promptCopy: "copying" }] as const) {
      expect(wizardBusy({ ...idle, ...patch })).toBe(true);
    }
  });
  test("a copy result lands only while its target is still current", async () => {
    let target = "/a";
    let finish: (value: { kind: string }) => void = () => {};
    const late = copyFor("/a", () => target, () => new Promise(resolve => { finish = resolve; }));
    target = "/b"; finish({ kind: "success" });
    expect(await late).toBeNull();
    target = "/a";
    expect(await copyFor("/a", () => target, async () => ({ kind: "success" }))).toBe("copied");
    expect(await copyFor("/a", () => target, async () => ({ kind: "error" }))).toBe("failed");
    expect(await copyFor("/a", () => target, () => Promise.reject(new Error("denied")))).toBe("failed");
    expect(await copyFor("/a", () => null, async () => ({ kind: "success" }))).toBeNull();
  });
  test("Tab wraps inside the wizard", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(3, 1, false)).toBeNull();
    expect(nextFocusIndex(0, -1, false)).toBeNull();
  });
});

describe("step 3 — Project", () => {
  test("before a project is opened", () => {
    expect(projectStepView(null, { running: false, token: null, error: null, rerooted: null })).toEqual({ value: null, open: { primary: true, disabled: false } });
  });
  test("a set-up project shows Already set up; an uninitialized one shows the form", () => {
    expect(projectStepView({ path: "/code/acme", kind: "list", servedRev: 0, canvases: [] }, { running: false, token: null, error: null, rerooted: null })).toEqual({ value: { name: "acme", path: "/code/acme" }, open: { primary: false, disabled: false }, chip: "Already set up" });
    expect(projectStepView({ path: "/code/acme", kind: "uninitialized" }, { running: false, token: null, error: null, rerooted: null })).toEqual({ value: { name: "acme", path: "/code/acme" }, open: { primary: false, disabled: false }, form: { token: null, helper: "Without token CSS, doan check won’t flag hardcoded colors.", choose: { disabled: false }, setUp: { label: "Set Up Project", disabled: false } } });
    expect(projectStepView({ path: "/code/acme", kind: "uninitialized" }, { running: true, token: "/code/acme/t.css", error: null, rerooted: null })).toMatchObject({ open: { disabled: true }, form: { token: "/code/acme/t.css", choose: { disabled: true }, setUp: { label: "Setting Up…", disabled: true } } });
    expect(projectStepView({ path: "/code/acme", kind: "uninitialized" }, { running: false, token: null, error: "doan CLI error: timed out after 10 s", rerooted: null })?.form?.error).toBe("doan CLI error: timed out after 10 s");
  });
  test("rerooted shows the root and the sentence; other states show the row text", () => {
    expect(projectStepView({ path: "/code/acme", kind: "list", servedRev: 0, canvases: [] }, { running: false, token: null, error: null, rerooted: "This folder is inside /code/acme, which is already set up." })).toMatchObject({ chip: "Already set up", message: "This folder is inside /code/acme, which is already set up." });
    expect(projectStepView({ path: "/code/acme", kind: "loading" }, { running: false, token: null, error: null, rerooted: null })).toMatchObject({ message: "Reading…" });
    expect(projectStepView({ path: "/code/acme", kind: "error", message: "Cannot read config" }, { running: false, token: null, error: null, rerooted: null })).toMatchObject({ error: "Cannot read config" });
  });
  test("a refused Open Project… shows main's message as an error, with or without a project", () => {
    expect(projectStepView(null, { running: false, token: null, error: null, rerooted: null, refused: "Can’t open /x: not a folder." })).toEqual({ value: null, open: { primary: true, disabled: false }, error: "Can’t open /x: not a folder." });
    expect(projectStepView({ path: "/code/acme", kind: "list", servedRev: 0, canvases: [] }, { running: false, token: null, error: null, rerooted: null, refused: "No." })).toMatchObject({ chip: "Already set up", error: "No." });
  });
  test("init results become one line of copy, or nothing on success", () => {
    expect(initMessage({ kind: "success" })).toBeNull();
    expect(initMessage({ kind: "error", message: "Token CSS must be a file inside the repository.", guidance: "Check the project and choose a CSS file inside it, then try again." })).toBe("Token CSS must be a file inside the repository. Check the project and choose a CSS file inside it, then try again.");
    expect(initMessage({ kind: "cliError", reason: "timed out after 10 s" })).toBe("doan CLI error: timed out after 10 s");
    expect(initMessage({ kind: "unavailable", message: "This project is no longer available for setup." })).toBe("This project is no longer available for setup.");
    expect(initMessage({ kind: "rerooted", root: "/a", message: "This folder is inside /a, which is already set up." })).toBe("This folder is inside /a, which is already set up.");
  });
});

describe("moving on after Open Project… or Set Up Project", () => {
  test("only a listed project moves on; an opened uninitialized one stops at the form", () => {
    expect(advanceAfter("open", "list")).toBe("advance");
    expect(advanceAfter("setup", "list")).toBe("advance");
    expect(advanceAfter("open", "uninitialized")).toBe("stop");
    // init reports success before main's re-read lands; the old state must not consume the move.
    expect(advanceAfter("setup", "uninitialized")).toBe("wait");
    // A stored folder picked again keeps its old state until its read finishes.
    for (const kind of ["loading", "notFound", "error", "cliError"] as const) {
      expect(advanceAfter("open", kind)).toBe("wait");
      expect(advanceAfter("setup", kind)).toBe("wait");
    }
  });
});

describe("step 4 and copy", () => {
  test("copy labels match comments", () => {
    expect(["idle", "copying", "copied", "failed"].map(state => copyLabel(state as "idle"))).toEqual(["Copy", "Copying…", "Copied", "Retry copy"]);
  });
  test("home is shortened to ~ only at a path boundary", () => {
    expect(tilde("/Users/alex/.local/bin/doan", home)).toBe("~/.local/bin/doan");
    expect(tilde("/Users/alex", home)).toBe("~");
    expect(tilde("/Users/alexander/x", home)).toBe("/Users/alexander/x");
    expect(tilde("/opt/x", home)).toBe("/opt/x");
  });
});


test("symlinked setup locations show the familiar path and the real location", () => {
  const state = machine({ display: { realPaths: { cli: "/managed/bin/doan", stub: "/managed/skills/doan/SKILL.md", claudeLink: "/managed/claude/doan" } } });
  const cli = cliItems(state, ui())[0]?.detail;
  expect(cli).toContainEqual({ code: "~/.local/bin/doan" });
  expect(cli).toContainEqual({ code: "/managed/bin/doan" });
  const view = agentsView(state, ui());
  expect(view.skill.detail).toContainEqual({ code: "~/.agents/skills/doan/SKILL.md" });
  expect(view.skill.detail).toContainEqual({ code: "/managed/skills/doan/SKILL.md" });
  expect(view.agents[0]?.items[0]?.detail).toContainEqual({ code: "~/.claude/skills/doan" });
  expect(view.agents[0]?.items[0]?.detail).toContainEqual({ code: "/managed/claude/doan" });
});


test("Claude shared skills display installed without a self-link target", () => {
  const state = machine({ claudeLink: { state: "ours", value: null, stamp: "s" } });
  Object.assign(state.display, { claudeSharedSkills: true, claudeLinkTarget: "" });
  const card = agentsView(state, ui()).agents[0]!;
  expect(card.items[0]).toMatchObject({ detail: ["Uses the shared skill folder"], chip: { text: "Installed", tone: "ok" } });
  expect(card.head.button?.disabled).toBe(false);
});

test("Claude invalid config display omits an unresolved link destination", () => {
  const state = machine({ display: { claudeLinkPath: "rel/claude/skills/doan", claudeLinkTarget: "" } });
  expect(agentsView(state, ui()).agents[0]!.items[0]!.detail).toEqual([{ code: "rel/claude/skills/doan" }]);
});


describe("install links and the no-agent notice", () => {
  const none = { claude: { executable: null, config: `${home}/.claude`, mcp: { state: "missing" as const, value: "" } }, codex: { executable: null, config: `${home}/.codex`, mcp: { state: "missing" as const, value: "" } } };
  test("an agent with no executable gets an install link; a found one does not", () => {
    const view = agentsView(machine({ agents: { ...none, codex: { ...none.codex, executable: "/opt/homebrew/bin/codex" } } }), ui());
    expect(view.agents[0]?.head.link).toEqual({ target: "claude", label: "Install Claude Code ↗" });
    expect(view.agents[1]?.head.link).toBeUndefined();
  });
  test("with neither agent installed the notice says what to do", () => {
    const view = agentsView(machine({ agents: none }), ui());
    expect(view.agents.map(card => card.head.link?.target)).toEqual(["claude", "codex"]);
    expect(view.notice).toBe("doan works through Claude Code or Codex. Install one, then choose Check Again.");
    expect(view.notice).toBe(NO_AGENT_NOTICE);
  });
  test("one installed agent, an unread state, a running check or a failed probe show no notice", () => {
    expect(agentsView(machine(), ui()).notice).toBeUndefined();
    expect(agentsView(machine({ agents: { ...none, claude: { ...none.claude, executable: "/opt/homebrew/bin/claude" } } }), ui()).notice).toBeUndefined();
    expect(agentsView(null, ui()).notice).toBeUndefined();
    expect(agentsView(machine({ agents: none }), ui({ checking: true })).notice).toBeUndefined();
    expect(agentsView(machine({ agents: none }), ui({ readError: "timed out" })).notice).toBeUndefined();
    expect(agentsView(machine({ agents: none, probe: { ok: false, reason: "The shell did not answer." } }), ui()).notice).toBeUndefined();
  });
  test("a probe failure and an unread state offer no install link", () => {
    expect(agentsView(null, ui()).agents.map(card => card.head.link)).toEqual([undefined, undefined]);
    expect(agentsView(machine({ agents: none, probe: { ok: false, reason: "The shell did not answer." } }), ui()).agents.map(card => card.head.link)).toEqual([undefined, undefined]);
  });
});

describe("step 4 branches", () => {
  const row = (path: string, title?: string): CanvasRow => ({ path, ...(title ? { title } : {}), open: 0, resolved: 0, url: `http://127.0.0.1/${path}` });
  const list = row("design/b.html", "Pricing");
  test("without a project the step offers Add Project…", () => {
    const addProject = { text: ["Add a project first. Your first canvas goes in its ", { code: "design/" }, " folder."], label: "Add Project…", primary: true, disabled: false };
    expect(promptStepView(null, null, false)).toEqual({ addProject });
    expect(promptStepView(null, null, true).addProject?.disabled).toBe(true);
    // An arrival without a project cannot be shown.
    expect(promptStepView(null, list, false)).toEqual({ addProject });
  });
  test("with a project and no arrival only the first prompt shows", () => {
    expect(promptStepView("/code/acme", null, false)).toEqual({});
  });
  test("an arrival shows Canvas ready with Open, named by title or file name", () => {
    expect(promptStepView("/code/acme", list, false)).toEqual({ ready: { text: "Canvas ready: Pricing", open: { label: "Open", disabled: false } } });
    expect(promptStepView("/code/acme", row("design/sign-in.html"), false).ready?.text).toBe("Canvas ready: sign-in");
    expect(promptStepView("/code/acme", list, true).ready?.open.disabled).toBe(true);
  });
});

test("dangling CLI links show Link is broken and Fix instead of another copy", () => {
  expect(cliItems(machine({ cli: { state: "dangling", value: "/gone", stamp: "s" } }), ui())[0]).toMatchObject({
    chip: { text: "Link is broken", tone: "warn" }, button: { id: "replace", label: "Fix…" },
    msg: { tone: "warn", parts: ["Link is broken: ", { code: "/gone" }] },
  });
});

test("every step has the draft's outcome-first heading and lead; step labels stay as shipped", () => {
  expect(STEP_COPY).toEqual([
    { heading: "Let your agents run doan", lead: ["Claude Code and Codex use the doan command to make and check your canvases. Connect it so they can find it."] },
    { heading: "Connect Claude Code or Codex", lead: ["Your agent draws canvases with the doan skill and tools. Connect the agents you use; nothing changes until you choose Connect."] },
    { heading: "Choose where canvases live", lead: ["Pick a repository. doan keeps its canvases in ", { code: "design/" }, ", next to the code they describe."] },
    { heading: "Ask for your first canvas", lead: ["Describe a screen, copy the sentence and paste it into Claude Code or Codex. The canvas opens here when it arrives."] },
  ]);
});

describe("step 3 pick-one list", () => {
  const snapshot = (items: ScanSnapshot["items"], sources = [{ name: "code", path: "/Users/alex/code" }]): ScanSnapshot => ({ scanId: "s", seq: 1, finished: items.length, total: items.length, done: true, sources, items });
  const item = (name: string, status: ScanSnapshot["items"][number]["status"], extra: Partial<ScanSnapshot["items"][number]> = {}): ScanSnapshot["items"][number] =>
    ({ id: name, path: `/Users/alex/code/${name}`, name, status, checked: status === "ready", disabled: status === "added" || status === "unreadable" || status === "checking", canvasCount: status === "ready" ? 14 : null, worktrees: [], ...extra });
  test("repositories and their worktrees are radios; added, unreadable and checking ones are disabled", () => {
    const view = pickView(snapshot([
      item("acme-web", "ready", { worktrees: [{ id: "t1", path: "/Users/alex/code/worktrees/feat-billing/acme-web", name: "feat-billing", checked: false }] }),
      item("billing-api", "notSetUp"), item("one", "ready", { canvasCount: 1 }), item("old", "added"), item("legacy-cms", "unreadable"), item("new", "checking"),
    ]), "/Users/alex");
    expect(view.title).toBe("Choose a repository in code");
    expect(view.lead).toEqual([{ code: "~/code" }, " isn’t a repository. Choose one repository inside it."]);
    expect(view.rows).toEqual([
      { id: "acme-web", name: "acme-web", label: "acme-web", path: "~/code/acme-web", sub: false, disabled: false, chip: { text: "14 canvases", tone: "ok" } },
      { id: "t1", name: "feat-billing", label: "acme-web, feat-billing worktree", path: "~/code/worktrees/feat-billing/acme-web", sub: true, disabled: false },
      { id: "billing-api", name: "billing-api", label: "billing-api", path: "~/code/billing-api", sub: false, disabled: false, chip: { text: "Not set up" } },
      { id: "one", name: "one", label: "one", path: "~/code/one", sub: false, disabled: false, chip: { text: "1 canvas", tone: "ok" } },
      { id: "old", name: "old", label: "old", path: "~/code/old", sub: false, disabled: true, chip: { text: "Already added" } },
      { id: "legacy-cms", name: "legacy-cms", label: "legacy-cms", path: "~/code/legacy-cms", sub: false, disabled: true, chip: { text: "Couldn't read", tone: "warn" } },
      { id: "new", name: "new", label: "new", path: "~/code/new", sub: false, disabled: true, chip: { text: "Checking…" } },
    ]);
    expect(view.initial).toBe("acme-web");
  });
  test("the first choice is the first enabled row; none when nothing can be chosen", () => {
    expect(pickView(snapshot([item("old", "added", { worktrees: [{ id: "t1", path: "/w/old", name: "feat", checked: false }] })]), null).initial).toBe("t1");
    expect(pickView(snapshot([item("legacy-cms", "unreadable")]), null).initial).toBeNull();
    expect(pickView(snapshot([], []), null).title).toBe("Choose a repository");
  });
});
