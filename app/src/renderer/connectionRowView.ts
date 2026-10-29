import { connectionCauses, type Cause as BannerCause } from "../main/setupCauses";
import type { MachineState } from "../main/onboarding/machine";
import type { Agent } from "../main/onboarding/states";
import { connectionSummary, type ConnectionStatus } from "../setup/connectionSummary";
import { confirmView, registrationText, tilde, type ConfirmView, type MachineUi, type Part, type Row } from "./onboardingView";

export const CONNECTION_NAMES: Record<Row, string> = { cli: "doan command", claude: "Claude Code", codex: "Codex" };
export const CONNECTION_LABELS: Record<ConnectionStatus, string> = { connected: "Connected", "needs-attention": "Needs attention", "not-connected": "Not connected", "not-installed": "Not installed", "couldnt-check": "Couldn’t check" };
const TRANSLOCATED = "Move Doan to Applications, then open it again.";
export interface ConnectionView {
  status: string;
  tone?: "ok" | "warn";
  cause?: string;
  parts: Part[];
  action?: { kind: "run" | "check" | "install"; label: string; primary: boolean; disabled: boolean };
}

// Copy comes from the accepted app-setup draft. State precedence stays in setup/.
export function connectionRow(state: MachineState | null, row: Row, ui: MachineUi, busy = false): ConnectionView {
  if (!state) return { status: ui.readError ? "Couldn’t check" : "Checking…", parts: ui.readError ? [ui.readError] : [] };
  const status = connectionSummary(state, state.reason === TRANSLOCATED)[row];
  const name = CONNECTION_NAMES[row];
  const cause = connectionCauses(state, state.reason === TRANSLOCATED)[row];
  const view: ConnectionView = { status: CONNECTION_LABELS[status], parts: [], ...(status === "connected" ? { tone: "ok" } : status === "needs-attention" || status === "couldnt-check" ? { tone: "warn" } : {}) };
  const action = (kind: "run" | "check" | "install", label: string) => {
    view.action = { kind, label, primary: kind === "run", disabled: busy || ui.checking || ui.readError !== null || ui.running !== null || (kind === "run" && !state.available) };
  };
  if (status === "connected") view.parts = [row === "cli" ? "Your agents and your terminal can run Doan." : `${name} can use the doan skill and tools.`];
  else if (status === "not-installed") { view.parts = [`${name} isn’t installed on this Mac.`]; action("install", `Install ${name} ↗`); }
  // A build that cannot connect (no bundled CLI) says why on the doan command row instead of its usual sentence.
  else if (status === "not-connected") { view.parts = [row !== "cli" ? `${name} is installed but can’t use Doan yet.` : !state.available && state.reason ? state.reason : "Agents can’t run Doan until the command is connected."]; action("run", "Connect"); }
  else if (status === "couldnt-check") {
    const reason = !state.probe.ok ? state.probe.reason : row === "cli" ? ui.readError : state.agents[row].mcp.value;
    view.parts = [(reason || "The registration could not be read.").replace(/\.?$/, ".")]; action("check", "Check Again");
  } else {
    action("run", "Fix…");
    if (cause?.kind === "translocated") { view.cause = "Running outside Applications."; view.parts = [TRANSLOCATED]; delete view.action; }
    else if (cause?.kind === "cli-dangling") { view.cause = "Link is broken."; view.parts = ["The file it points to no longer exists, so agents can’t reach Doan."]; }
    else if (cause?.kind === "cli-other") { view.cause = "Points to another copy."; view.parts = ["Agents run a different Doan, not the one in this app."]; }
    else if (row !== "cli" && cause?.kind === "mcp-other") { view.cause = "MCP runs another command."; view.parts = [`${name}’s doan server runs `, { code: registrationText(row, state.agents[row].mcp.value) }, ", not this app’s Doan."]; }
    else if (cause?.kind === "skill-differs") { view.cause = "Skill was changed."; view.parts = ["The shared doan skill differs from this app’s version."]; }
    else if (cause?.kind === "claude-link-other" || cause?.kind === "claude-link-dangling") { view.cause = state.claudeLink.state === "dangling" ? "Skill link is broken." : "Skill link points elsewhere."; view.parts = [state.claudeLink.state === "dangling" ? "The doan skill folder it points to no longer exists." : "Claude Code reads a different doan skill folder."]; }
    else {
      const d = state.display;
      const path = cause?.path ?? (row === "cli" ? d.cliPath : d.stubPath);
      view.cause = "Path is blocked."; view.parts = [{ code: tilde(path, d.home) }, " is in use by something else. Move or delete it, then Check Again."]; action("check", "Check Again");
    }
  }
  if (view.action && ui.running === row) view.action.label = status === "needs-attention" ? "Fixing…" : "Connecting…";
  return view;
}

export function connectionConfirm(target: "cli" | "stub" | "claudeLink" | "mcp", agent: Agent, state: MachineState): ConfirmView {
  if (target === "cli" && state.cli.state === "dangling") return {
    title: "Fix the Doan link?", body: [{ code: tilde(state.display.cliPath, state.display.home) }, " points to a file that no longer exists. Your terminal and agents will run this app’s copy instead."],
    current: `${state.cli.value ?? ""} (missing)`, next: state.display.cliTarget ?? "", verb: "Fix Link",
  };
  return confirmView(target, agent, state);
}

export type { Cause as BannerCause } from "../main/setupCauses";
export function connectionBanner(cause: BannerCause, row: Row): Part[] {
  const name = CONNECTION_NAMES[row];
  switch (cause.kind) {
    case "translocated": return ["Doan is running outside Applications, so agents can’t reach it. Move Doan to Applications, then open it again."];
    case "cli-dangling": return ["The doan command link is broken, so agents can’t reach Doan."];
    case "cli-other": return ["The doan command runs another copy of Doan, so agents may not reach this app."];
    case "cli-blocked": return ["Something else is at ", { code: cause.path ?? "~/.local/bin/doan" }, ", so agents can’t reach Doan."];
    case "mcp-other": return [`${name}’s doan MCP server runs another command, so ${name} can’t use Doan.`];
    case "skill-differs": return ["The doan skill was changed, so agents may follow other instructions."];
    case "claude-link-other": return ["Claude Code’s doan skill link points elsewhere, so Claude Code may follow other instructions."];
    case "claude-link-dangling": return ["Claude Code’s doan skill link is broken, so Claude Code can’t read the doan skill."];
    case "skill-blocked": case "claude-link-blocked": return ["Something else is at ", { code: cause.path ?? "the doan skill path" }, `, so ${name} can’t read the doan skill.`];
  }
}
