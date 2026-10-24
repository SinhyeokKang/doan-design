import type { MachineState } from "../main/onboarding/machine";
import type { Agent } from "../main/onboarding/states";
import type { ProjectInitResult } from "../main/shell";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasLabel } from "./canvasTree";
import { projectRow, type DetailPart } from "./projectRow";

// Internal state names (ours, link-other, …) stop here; components only see copy.

export type Part = DetailPart;
export interface Chip { text: string; tone?: "ok" | "warn" | "err" }
export interface Msg { tone: "ok" | "warn" | "error"; parts: Part[] }
export interface ButtonView { id: "install" | "replace" | "connect" | "copyPath"; label: string; primary: boolean; disabled: boolean }
export interface ItemView {
  key: string;
  label: string;
  sub?: true;
  detail: Part[];
  // The draft puts a detection chip inside the detail column.
  detailChip?: Chip;
  chip?: Chip;
  button?: ButtonView;
  msg?: Msg;
  reason?: string;
  dimmed?: true;
  copyLine?: { text: string; button: ButtonView };
  // Opens the agent's install page; main maps the target to a fixed URL.
  link?: { target: Agent; label: string };
}
export interface AgentCardView { agent: Agent; head: ItemView; items: ItemView[] }

export type CopyState = "idle" | "copying" | "copied" | "failed";
export type RowOutcome = { kind: "error"; message: string; original?: string } | { kind: "unavailable"; message: string } | { kind: "changed" };
export type Row = "cli" | Agent;
export interface MachineUi {
  checking: boolean;
  running: Row | null;
  readError: string | null;
  outcome: Partial<Record<Row, RowOutcome>>;
  pathCopy: CopyState;
}
export const idleUi = (): MachineUi => ({ checking: false, running: null, readError: null, outcome: {}, pathCopy: "idle" });

// Display copy of main's PATH_LINE (main writes the clipboard; a test keeps them equal).
export const PATH_LINE_TEXT = 'export PATH="$HOME/.local/bin:$PATH"';
export const COPY_FAILED = "Couldn’t copy. Your clipboard could not be updated. Try again.";
const CHANGED = "It changed after you looked, so nothing was replaced.";
const TRANSLOCATED = "Move doan to Applications, then open it again.";
const IN_USE = " is in use by something else. Move or delete it, then Check Again.";
const PLACEHOLDER = "<what you want to design>";
const AGENT_NAMES: Record<Agent, string> = { claude: "Claude Code", codex: "Codex" };

// Step copy for the branches below lives here so the confirmed draft's wording
// is one swap. Titles and descriptions per step are not here yet.
export const NO_AGENT_NOTICE = "doan works through Claude Code or Codex. Install one, then choose Check Again.";
const installLabel = (agent: Agent) => `Install ${AGENT_NAMES[agent]} ↗`;
const ADD_PROJECT_LABEL = "Add Project…";
const OPEN_LABEL = "Open";
const canvasReadyText = (name: string) => `Canvas ready: ${name}`;

export function tilde(path: string, home: string): string {
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
function realLocation(state: MachineState | null, key: "cli" | "stub" | "claudeLink"): Part[] {
  const real = state?.display.realPaths?.[key];
  return real && state ? [" (at ", { code: tilde(real, state.display.home) }, ")"] : [];
}
const parent = (path: string) => path.slice(0, path.lastIndexOf("/"));
const checkAgain = (reason: string) => `${reason.trim().replace(/\.?$/, ".")} Choose Check Again.`;

// A copy result is dropped when its target (the project, or the wizard itself)
// stopped being current while the clipboard was written.
export async function copyFor<T>(target: T, current: () => T | null, copy: () => Promise<{ kind: string }>): Promise<CopyState | null> {
  let ok = false;
  try { ok = (await copy()).kind === "success"; } catch { /* Shown as Retry copy. */ }
  return current() === target ? (ok ? "copied" : "failed") : null;
}

export function copyLabel(state: CopyState): string {
  return state === "copying" ? "Copying…" : state === "copied" ? "Copied" : state === "failed" ? "Retry copy" : "Copy";
}

function linkChip(state: MachineState["cli"]["state"]): Chip {
  switch (state) {
    case "missing": return { text: "Not installed" };
    case "ours": return { text: "Installed", tone: "ok" };
    case "dangling": return { text: "Link is broken", tone: "warn" };
    case "link-other": return { text: "Needs replacement", tone: "warn" };
    case "blocked": return { text: "Unavailable", tone: "err" };
  }
}
function readChip(state: MachineState | null, ui: MachineUi): Chip | null {
  if (ui.readError !== null) return { text: "Couldn’t check", tone: "warn" };
  if (ui.checking || state === null) return { text: "Checking…" };
  return null;
}

export function cliItems(state: MachineState | null, ui: MachineUi): ItemView[] {
  const d = state?.display;
  const path = d ? tilde(d.cliPath, d.home) : "~/.local/bin/doan";
  const cli = state?.cli.state;
  const target = d?.cliTarget && (cli === "missing" || cli === "ours") ? [" → ", { code: d.cliTarget }] : [];
  const item: ItemView = { key: "cli", label: "CLI link", detail: [{ code: path }, ...realLocation(state, "cli"), ...target], chip: readChip(state, ui) ?? linkChip(cli ?? "missing") };
  if (cli !== "ours") {
    const disabled = !state || !state.available || cli === "blocked" || ui.checking || ui.running !== null || ui.readError !== null;
    item.button = cli === "dangling" ? { id: "replace", label: "Fix…", primary: true, disabled } : cli === "link-other" ? { id: "replace", label: "Replace…", primary: true, disabled } : { id: "install", label: "Install", primary: true, disabled };
  }
  if (ui.readError !== null) item.msg = { tone: "warn", parts: [checkAgain(ui.readError)] };
  else if (state && !state.available && state.reason) {
    if (state.reason === TRANSLOCATED) item.msg = { tone: "warn", parts: [state.reason] };
    else item.reason = state.reason;
  } else if (state && cli === "link-other") item.msg = { tone: "warn", parts: ["Points to another copy: ", { code: state.cli.value ?? "" }] };
  else if (state && cli === "dangling") item.msg = { tone: "warn", parts: ["Link is broken: ", { code: state.cli.value ?? "" }] };
  else if (state && cli === "blocked") item.msg = { tone: "error", parts: [{ code: tilde(state.display.blocked.cli ?? state.display.cliPath, state.display.home) }, IN_USE] };
  const outcome = ui.outcome.cli;
  if (outcome?.kind === "changed") item.reason = CHANGED;
  else if (outcome) item.msg = { tone: "error", parts: [outcome.message] };
  const items = [item];
  if (state && (!state.probe.ok || !state.pathPresent)) items.push(pathItem(state, ui));
  return items;
}

function pathItem(state: MachineState, ui: MachineUi): ItemView {
  if (!state.probe.ok) return { key: "path", label: "PATH", detail: [{ code: "~/.local/bin" }], chip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: [checkAgain(state.probe.reason)] } };
  const chip: Chip = { text: "Not on PATH", tone: "warn" };
  if (!state.rcFile) return { key: "path", label: "PATH", detail: ["Add ~/.local/bin to PATH in your shell configuration, then choose Check Again."], chip };
  return {
    key: "path", label: "PATH", detail: ["Add this line to ", { code: state.rcFile }, ", open a new terminal, then choose Check Again."], chip,
    copyLine: { text: PATH_LINE_TEXT, button: { id: "copyPath", label: copyLabel(ui.pathCopy), primary: false, disabled: ui.pathCopy === "copying" } },
    ...(ui.pathCopy === "failed" ? { msg: { tone: "error" as const, parts: [COPY_FAILED] } } : {}),
  };
}

function connected(state: MachineState, agent: Agent): boolean {
  const a = state.agents[agent];
  return a.executable !== null && state.stub.state === "ours" && a.mcp.state === "ours" && (agent === "codex" || state.claudeLink.state === "ours");
}

export interface AgentsStepView { skill: ItemView; agents: AgentCardView[]; notice?: string }
export function agentsView(state: MachineState | null, ui: MachineUi): AgentsStepView {
  const d = state?.display;
  const skill: ItemView = {
    key: "skill", label: "Skill", detail: [{ code: d ? tilde(d.stubPath, d.home) : "~/.agents/skills/doan/SKILL.md" }, ...realLocation(state, "stub"), " · shared by Claude Code and Codex"],
    chip: readChip(state, ui) ?? stubChip(state?.stub.state ?? "missing"),
  };
  if (state?.stub.state === "differs") skill.msg = { tone: "warn", parts: ["Modified or from another version"] };
  if (state?.stub.state === "blocked") skill.msg = { tone: "error", parts: [{ code: tilde(state.display.blocked.stub ?? state.display.stubPath, state.display.home) }, IN_USE] };
  const agents = (["claude", "codex"] as const).map(agent => agentCard(state, ui, agent));
  // Only a settled, successful read can say that no agent is installed.
  const noAgent = state !== null && state.probe.ok && !ui.checking && ui.readError === null && agents.every(card => card.head.link !== undefined);
  return { skill, agents, ...(noAgent ? { notice: NO_AGENT_NOTICE } : {}) };
}

function stubChip(state: MachineState["stub"]["state"]): Chip {
  return state === "differs" ? { text: "Needs replacement", tone: "warn" } : linkChip(state);
}

function agentCard(state: MachineState | null, ui: MachineUi, agent: Agent): AgentCardView {
  const label = AGENT_NAMES[agent];
  if (state === null) return { agent, head: { key: agent, label, detail: [], detailChip: readChip(state, ui) ?? { text: "Checking…" } }, items: [] };
  if (!state.probe.ok) return { agent, head: { key: agent, label, detail: [], detailChip: { text: "Couldn’t check", tone: "warn" }, msg: { tone: "warn", parts: [checkAgain(state.probe.reason)] } }, items: [] };
  const found = state.agents[agent];
  if (found.executable === null) return { agent, head: { key: agent, label, detail: ["Not installed"], link: { target: agent, label: installLabel(agent) } }, items: [] };
  const d = state.display, checking = readChip(state, ui);
  const head: ItemView = { key: agent, label, detail: ["Found at ", { code: found.executable }] };
  if (connected(state, agent)) head.msg = { tone: "ok", parts: [`Connected. Start a new ${label} session to use doan.`] };
  else {
    const blocked = state.stub.state === "blocked" || (agent === "claude" && state.claudeLink.state === "blocked");
    head.button = { id: "connect", label: ui.running === agent ? "Connecting…" : "Connect", primary: true,
      disabled: ui.running !== null || ui.checking || ui.readError !== null || blocked };
  }
  const items: ItemView[] = [];
  if (agent === "claude") {
    const link: ItemView = { key: "claude-link", label: "Skill link", sub: true, detail: d.claudeSharedSkills ? ["Uses the shared skill folder"] : [{ code: tilde(d.claudeLinkPath, d.home) }, ...realLocation(state, "claudeLink"), ...(d.claudeLinkTarget ? [" → ", { code: d.claudeLinkTarget }] : [])], chip: checking ?? linkChip(state.claudeLink.state) };
    if (state.claudeLink.state === "link-other") link.msg = { tone: "warn", parts: ["Points to another folder: ", { code: state.claudeLink.value ?? "" }] };
    if (state.claudeLink.state === "dangling") link.msg = { tone: "warn", parts: ["Link is broken: ", { code: state.claudeLink.value ?? "" }] };
    if (state.claudeLink.state === "blocked") link.msg = { tone: "error", parts: [{ code: tilde(d.blocked.claudeLink ?? d.claudeLinkPath, d.home) }, IN_USE] };
    items.push(link);
  }
  const suffix = agent === "claude" ? (d.configFromEnv.claude ? " (CLAUDE_CONFIG_DIR, user scope)" : " (user scope)") : d.configFromEnv.codex ? " (CODEX_HOME)" : "";
  const mcp: ItemView = { key: `${agent}-mcp`, label: "MCP", sub: true, detail: ["Registers in ", { code: tilde(d.configFile[agent], d.home) }, ...(suffix ? [suffix] : [])], chip: checking ?? mcpChip(found.mcp.state) };
  if (ui.running === agent && found.mcp.state !== "ours") mcp.chip = { text: "Registering…" };
  if (found.mcp.state === "other") mcp.msg = { tone: "warn", parts: ["Current command: ", { code: registrationText(agent, found.mcp.value) }] };
  if (found.mcp.state === "unknown") mcp.msg = { tone: "warn", parts: [checkAgain(found.mcp.value || "The registration could not be read.")] };
  if (state.cli.state !== "ours") { mcp.dimmed = true; mcp.reason = "Install the CLI link in step 1 before connecting MCP."; }
  items.push(mcp);
  const outcome = ui.outcome[agent];
  // Connect stops before MCP when step 1 is not done or MCP could not be read.
  // Nothing failed: the MCP item already shows that reason from the read.
  const mcpWaits = outcome?.kind === "unavailable" && state.stub.state === "ours" && (agent === "codex" || state.claudeLink.state === "ours") &&
    (state.cli.state !== "ours" || found.mcp.state === "unknown");
  if (outcome?.kind === "changed") head.reason = CHANGED;
  else if (outcome && !mcpWaits) {
    const failed: Chip = { text: "Failed", tone: "err" };
    const original = outcome.kind === "error" ? outcome.original : undefined;
    if (original !== undefined) Object.assign(mcp, { chip: failed, msg: { tone: "error", parts: [`Couldn’t replace the registration: ${outcome.message.replace(/\.$/, "")}. The original command was `, { code: registrationText(agent, original) }, "."] } });
    else if (state.stub.state !== "ours") head.msg = { tone: "error", parts: [outcome.message] };
    else {
      const at = agent === "claude" && state.claudeLink.state !== "ours" ? items[0] : mcp;
      if (at) Object.assign(at, { chip: failed, msg: { tone: "error", parts: [outcome.message] } });
    }
  }
  return { agent, head, items };
}

function mcpChip(state: MachineState["agents"]["claude"]["mcp"]["state"]): Chip {
  switch (state) {
    case "missing": return { text: "Not registered" };
    case "ours": return { text: "Registered", tone: "ok" };
    case "other": return { text: "Needs replacement", tone: "warn" };
    case "unknown": return { text: "Couldn’t check", tone: "warn" };
  }
}

// Claude's value is its mcpServers.doan entry; Codex's is `mcp get --json`.
export function registrationText(agent: Agent, value: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return value; }
  if (typeof parsed !== "object" || parsed === null) return value;
  const entry: unknown = agent === "codex" && "transport" in parsed ? parsed.transport : parsed;
  if (typeof entry !== "object" || entry === null || !("command" in entry) || typeof entry.command !== "string") return value;
  const args = "args" in entry && Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === "string") : [];
  return [entry.command, ...args].join(" ");
}

export interface ConfirmView { title: string; body: Part[]; current: string; next: string; verb: string }
export function confirmView(target: "cli" | "stub" | "claudeLink" | "mcp", agent: Agent, state: MachineState): ConfirmView {
  const d = state.display, short = (path: string) => tilde(path, d.home);
  switch (target) {
    case "cli":
      return { title: "Replace the doan link?", body: [{ code: short(d.cliPath) }, " points to another copy of doan. Your terminal and agents will run this app’s copy instead."], current: state.cli.value ?? "", next: d.cliTarget ?? "", verb: "Replace Link" };
    case "claudeLink":
      return { title: "Replace the Claude Code skill link?", body: [{ code: short(d.claudeLinkPath) }, " points to another folder. Claude Code will read the shared doan skill instead."], current: state.claudeLink.value ?? "", next: d.claudeLinkTarget, verb: "Replace Link" };
    case "stub":
      return { title: "Replace SKILL.md?", body: ["Your edits to SKILL.md will be replaced. Other files in ", { code: short(parent(d.stubPath)) }, " are kept."], current: `${short(d.stubPath)} — Modified or from another version`, next: `The skill stub from this app (doan ${d.appVersion})`, verb: "Replace Skill" };
    case "mcp": {
      const where = agent === "claude" ? (d.configFromEnv.claude ? " (CLAUDE_CONFIG_DIR, user scope)." : " (user scope).") : d.configFromEnv.codex ? " (CODEX_HOME)." : ".";
      return { title: "Replace the doan MCP registration?", body: [`${AGENT_NAMES[agent]} already has an MCP server named doan in `, { code: short(d.configFile[agent]) }, where], current: registrationText(agent, state.agents[agent].mcp.value), next: d.mcpCommand, verb: "Replace MCP Registration" };
    }
  }
}

export const STEP_LABELS = ["CLI", "Agents", "Project", "First prompt"] as const;

// 2026-10-24 completion rules (design.md flow 4). Skipping never marks a step done.
export function stepsDone(state: MachineState | null, project: FolderEntry | undefined, promptCopied: boolean): boolean[] {
  return [
    state?.cli.state === "ours",
    state !== null && (["claude", "codex"] as const).some(agent => connected(state, agent)),
    project?.kind === "list",
    promptCopied,
  ];
}

export interface IndicatorStep { step: number; label: string; done: boolean; current: boolean; ariaLabel?: string; disabled: boolean }
export function indicatorView(current: number, done: readonly boolean[], disabled: boolean): IndicatorStep[] {
  return STEP_LABELS.map((label, step) => ({ step, label, done: !!done[step], current: step === current, ...(done[step] ? { ariaLabel: `${label}, completed` } : {}), disabled }));
}

export interface BusyParts { running: Row | null; confirming: boolean; projectBusy: boolean; closing: boolean; pathCopy: CopyState; promptCopy: CopyState }
// design.md flow 4: while any action runs, Close, Escape, the indicator and the bottom bar wait.
export function wizardBusy(parts: BusyParts): boolean {
  return parts.running !== null || parts.confirming || parts.projectBusy || parts.closing || parts.pathCopy === "copying" || parts.promptCopy === "copying";
}

export interface FooterView {
  stepNo: string;
  checkAgain?: { disabled: boolean };
  skip?: { disabled: boolean };
  next: { label: "Continue" | "Done"; primary: boolean; disabled: boolean };
}
export function footerView(step: number, done: boolean, busy: boolean, checking: boolean): FooterView {
  const stepNo = `Step ${step + 1} of 4`;
  if (step === 3) return { stepNo, next: { label: "Done", primary: true, disabled: busy } };
  return { stepNo, ...(step < 2 ? { checkAgain: { disabled: busy || checking } } : {}), skip: { disabled: busy }, next: { label: "Continue", primary: done, disabled: busy } };
}

// Tab is left to the browser except where it would leave the wizard.
export function nextFocusIndex(count: number, index: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (!shift && index === count - 1) return 0;
  if (shift && index === 0) return count - 1;
  return null;
}

export interface PromptStepView {
  addProject?: { label: string; primary: true; disabled: boolean };
  ready?: { text: string; open: { label: string; disabled: boolean } };
}
// Without a project the step offers Add Project… in place of the first prompt;
// once the waited-for canvas has arrived it shows Canvas ready with Open.
export function promptStepView(project: string | null, arrived: CanvasRow | null, busy: boolean): PromptStepView {
  if (project === null) return { addProject: { label: ADD_PROJECT_LABEL, primary: true, disabled: busy } };
  if (arrived === null) return {};
  return { ready: { text: canvasReadyText(canvasLabel(arrived)), open: { label: OPEN_LABEL, disabled: busy } } };
}

export interface ProjectForm { running: boolean; token: string | null; error: string | null; rerooted: string | null }
export interface ProjectStepView {
  value: { name: string; path: string } | null;
  open: { primary: boolean; disabled: boolean };
  chip?: "Already set up";
  message?: string;
  error?: string;
  form?: { token: string | null; helper?: string; choose: { disabled: boolean }; setUp: { label: string; disabled: boolean }; error?: string };
}
export const NO_TOKEN_HELPER = "Without token CSS, doan check won’t flag hardcoded colors.";
export function projectStepView(entry: FolderEntry | null, form: ProjectForm): ProjectStepView {
  const open = { primary: entry === null, disabled: form.running };
  if (entry === null) return { value: null, open };
  const view: ProjectStepView = { value: { name: entry.path.split("/").filter(Boolean).at(-1) ?? entry.path, path: entry.path }, open };
  if (form.rerooted) view.message = form.rerooted;
  switch (entry.kind) {
    case "list": view.chip = "Already set up"; break;
    case "loading": view.message ??= "Reading…"; break;
    case "uninitialized":
      view.form = { ...formView(form) };
      break;
    default: {
      const row = projectRow(entry);
      view.error = row.detail?.map(part => typeof part === "string" ? part : part.code).join("") || row.status || "";
    }
  }
  return view;
}
export function formView(form: ProjectForm): NonNullable<ProjectStepView["form"]> {
  return {
    token: form.token, ...(form.token === null ? { helper: NO_TOKEN_HELPER } : {}),
    choose: { disabled: form.running }, setUp: { label: form.running ? "Setting Up…" : "Set Up Project", disabled: form.running },
    ...(form.error ? { error: form.error } : {}),
  };
}

// After Open Project… or Set Up Project, whether the wizard moves to step 4 now,
// stops on step 3, or waits for main's next read of that project.
export function advanceAfter(cause: "open" | "setup", kind: FolderEntry["kind"]): "advance" | "stop" | "wait" {
  if (kind === "list") return "advance";
  return cause === "open" && kind === "uninitialized" ? "stop" : "wait";
}

export function initMessage(result: ProjectInitResult): string | null {
  switch (result.kind) {
    case "success": return null;
    case "error": return [result.message, result.guidance].filter(Boolean).join(" ");
    case "cliError": return `doan CLI error: ${result.reason}`;
    case "rerooted": case "unavailable": return result.message;
  }
}

export function promptParts(sentence: string): { text: string; mark?: true }[] {
  const at = sentence.indexOf(PLACEHOLDER);
  if (at < 0) return [{ text: sentence }];
  const before = sentence.slice(0, at), after = sentence.slice(at + PLACEHOLDER.length);
  return [...(before ? [{ text: before }] : []), { text: PLACEHOLDER, mark: true as const }, ...(after ? [{ text: after }] : [])];
}
