import type { Agent, LinkState, McpState, StubState } from "../main/onboarding/states";

export interface WizardAction {
  id: "install" | "replace" | "checkAgain" | "copyPath" | "connect" | "openProject" | "chooseCss" | "init" | "copy";
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface AgentInput {
  agent: Agent;
  detection: { kind: "found"; path: string } | { kind: "missing" } | { kind: "error"; reason: string };
  mcp: McpState;
  skillLink?: LinkState;
  configPath: string;
  running?: boolean;
  error?: string;
}

export type WizardInput =
  | { step: "cli"; state: LinkState; absoluteCli: boolean; translocated: boolean; target?: string; pathMissing?: boolean; rcFile?: string | null; checking?: boolean; error?: string }
  | { step: "agents"; cliReady: boolean; skill: StubState; agents: readonly AgentInput[] }
  | { step: "project"; state: "none" | "form" | "ready"; tokenCss?: string | null; running?: boolean; error?: string; guidance?: string; reroutedRoot?: string }
  | { step: "prompt"; prompt: string | null; copy: "idle" | "copying" | "copied" | "failed" };

export interface AgentView {
  name: string;
  detection: string;
  message: string;
  configPath: string;
  mcp: string;
  skillLink?: string;
  action: WizardAction | null;
}

export interface WizardView {
  title: string;
  message: string;
  detail: string[];
  actions: WizardAction[];
  agents?: AgentView[];
}

function action(id: WizardAction["id"], label: string, reason?: string): WizardAction {
  return { id, label, disabled: reason !== undefined, ...(reason !== undefined ? { reason } : {}) };
}

const linkLabels: Record<LinkState, string> = { missing: "Not installed", ours: "Installed", "link-other": "Points to another copy", blocked: "Path is in use by something else" };
const mcpLabels: Record<McpState, string> = { missing: "Not connected", ours: "Registered", other: "Another registration exists", unknown: "Couldn't check" };
const skillLabels: Record<StubState, string> = { missing: "Skill is not installed", ours: "Skill is installed", differs: "SKILL.md has different contents", blocked: "Skill path is in use by something else" };

export function wizardView(input: WizardInput): WizardView {
  switch (input.step) {
    case "cli": {
      const reason = input.checking ? "Checking…" : input.error ? `Couldn't check: ${input.error}`
        : input.translocated ? "Move doan to Applications, then open it again."
          : !input.absoluteCli ? "This build has no bundled CLI. Set DOAN_CLI." : undefined;
      const message = reason ?? (input.state === "link-other" ? `Points to another copy: ${input.target ?? ""}`
        : input.state === "blocked" ? `${input.target ?? "This path"} is in use by something else. Move or delete it, then Check Again.`
          : linkLabels[input.state]);
      const actions: WizardAction[] = [];
      if (input.state === "missing") actions.push(action("install", "Install", reason));
      if (input.state === "link-other") actions.push(action("replace", "Replace Link…", reason));
      actions.push(action("checkAgain", "Check Again", input.checking ? "Checking…" : undefined));
      const detail: string[] = [];
      if (input.pathMissing) {
        if (input.rcFile) {
          detail.push(`Add this line to ${input.rcFile}, open a new terminal, then choose Check Again.`, 'export PATH="$HOME/.local/bin:$PATH"');
          actions.push(action("copyPath", "Copy PATH line"));
        } else detail.push("Add ~/.local/bin to PATH in your shell configuration, then choose Check Again.");
      }
      return { title: "CLI", message, detail, actions };
    }
    case "agents": {
      const busy = input.agents.some((agent) => agent.running);
      const agents = input.agents.map((agent): AgentView => {
        const name = agent.agent === "claude" ? "Claude Code" : "Codex";
        const detection = agent.detection.kind === "found" ? `Found at ${agent.detection.path}`
          : agent.detection.kind === "missing" ? "Not installed" : `Couldn't check: ${agent.detection.reason}`;
        const connected = input.cliReady && input.skill === "ours" && agent.mcp === "ours" && (agent.agent === "codex" || agent.skillLink === "ours");
        const reason = busy ? "A connection is in progress." : !input.cliReady ? "Install the CLI in step 1 first."
          : input.skill === "blocked" ? "Move or delete the item at the skill path, then Check Again."
            : agent.agent === "claude" && agent.skillLink === "blocked" ? "Move or delete the item at the Claude skill link path, then Check Again." : undefined;
        const rowAction = agent.detection.kind !== "found" ? null
          : agent.mcp === "unknown" ? action("checkAgain", "Check Again", busy ? "A connection is in progress." : undefined)
            : connected ? null : action("connect", "Connect", reason);
        return { name, detection, configPath: agent.configPath, mcp: mcpLabels[agent.mcp],
          ...(agent.agent === "claude" && agent.skillLink !== undefined ? { skillLink: linkLabels[agent.skillLink] } : {}),
          message: agent.error ?? (agent.running ? "Connecting…" : connected ? `Connected. Start a new ${name} session to use doan.` : ""), action: rowAction };
      });
      return { title: "Agents", message: skillLabels[input.skill], detail: [], actions: [action("checkAgain", "Check Again", busy ? "A connection is in progress." : undefined)], agents };
    }
    case "project": {
      if (input.reroutedRoot) return { title: "Project", message: `This folder is inside ${input.reroutedRoot}, which is already set up.`, detail: [], actions: [] };
      if (input.state === "none") return { title: "Project", message: "Open a project to get started.", detail: [], actions: [action("openProject", "Open Project…")] };
      if (input.state === "ready") return { title: "Project", message: "Already set up", detail: [], actions: [] };
      const reason = input.running ? "Setting up project…" : undefined;
      return { title: "Project", message: input.error ?? reason ?? "Set up this project", detail: [input.tokenCss ?? "None", ...(input.tokenCss ? [] : ["Without token CSS, doan check won't flag hardcoded colors."]), "design/", ".doan/config.json", "One line in .gitattributes", ...(input.guidance ? [input.guidance] : [])], actions: [action("chooseCss", "Choose…", reason), action("init", "Set Up Project", reason)] };
    }
    case "prompt": {
      if (input.prompt === null) return { title: "First prompt", message: "Open a project first.", detail: [], actions: [] };
      const labels = { idle: "Copy", copying: "Copying…", copied: "Copied", failed: "Retry copy" };
      return { title: "First prompt", message: input.prompt, detail: ["Replace <…> before sending."], actions: [action("copy", labels[input.copy], input.copy === "copying" ? "Copying…" : undefined)] };
    }
  }
}
