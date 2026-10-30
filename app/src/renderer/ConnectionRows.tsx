import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { MachineState } from "../main/onboarding/machine";
import type { Agent } from "../main/onboarding/states";
import { agentsView, cliItems, copyLabel, PATH_LINE_TEXT, COPY_FAILED, type ItemView, type MachineUi, type Part, type Row } from "./onboardingView";
import { CONNECTION_NAMES, connectionRow } from "./connectionRowView";
import { AlertIcon } from "./AlertIcon";

const MCP_WAITS = "Connect the doan command first; MCP needs it.";
// main's MCP refusal names the wizard's step 1, which Settings does not have; the
// wizard's rows use the same wording as the dimmed MCP item too.
const outcomeText = (message: string) => message === "Install the CLI link in step 1 before connecting MCP." ? MCP_WAITS : message;
export function ConnectionParts({ parts }: { parts: readonly Part[] }) {
  return <>{parts.map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <code key={index}>{part.code}</code>)}</>;
}
export interface ConnectionRowsProps {
  machine: MachineState | null;
  ui: MachineUi;
  rows: readonly Row[];
  busy?: boolean;
  target?: { connection: Row } | null;
  justConnected?: Row | null;
  run: (row: Row) => void;
  checkAgain: () => void;
  install: (agent: Agent) => void;
  copyPath: () => void;
}
// Both renderers own their IPC and confirmation lifecycle; the row only emits intent.
export function ConnectionRows({ machine, ui, rows, busy = false, target, justConnected, run, checkAgain, install, copyPath }: ConnectionRowsProps) {
  const [expanded, setExpanded] = useState<Partial<Record<Row, boolean>>>({});
  const card = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<Row | null>(null);
  useEffect(() => {
    if (!target) return;
    setExpanded(current => ({ ...current, [target.connection]: true }));
    focusTarget.current = target.connection;
  }, [target]);
  useEffect(() => {
    const row = focusTarget.current;
    if (!row || !machine || ui.checking) return;
    const node = card.current?.querySelector<HTMLElement>(`[data-connection="${row}"]`);
    (node?.querySelector<HTMLButtonElement>(".cn-end button:not(:disabled)") ?? node?.querySelector<HTMLButtonElement>(".cn-name"))?.focus();
    focusTarget.current = null;
  }, [machine, ui.checking, expanded]);
  return <div className="ob-card cn-card" ref={card}>{rows.map(row => {
    const view = connectionRow(machine, row, ui, busy);
    const outcome = ui.outcome[row];
    return <div className="cn-row" key={row} data-connection={row}>
      <button className="cn-name" aria-expanded={!!expanded[row]} onClick={() => setExpanded(current => ({ ...current, [row]: !current[row] }))}><span className="tw" aria-hidden="true">{expanded[row] ? "▾" : "▸"}</span>{CONNECTION_NAMES[row]}</button>
      <span className="cn-end"><span className={`ob-chip${view.tone ? ` ${view.tone}` : ""}`}>{view.status}</span>{view.action && <button className={`btn doan-button${view.action.primary ? " primary" : ""}`} data-ui-variant={view.action.primary ? "prominent" : "subtle"} data-ui-size="sm" disabled={view.action.disabled} onClick={() => view.action?.kind === "check" ? checkAgain() : view.action?.kind === "install" && row !== "cli" ? install(row) : run(row)}>{view.action.label}</button>}</span>
      {(view.parts.length > 0 || view.cause) && <p className={`cn-say${justConnected === row && row !== "cli" && view.status === "Connected" ? " ok" : ""}`}>{justConnected === row && row !== "cli" && view.status === "Connected" ? `Connected. Start a new ${CONNECTION_NAMES[row]} session to use Doan.` : <>{view.cause && <><b>{view.cause}</b>{" "}</>}<ConnectionParts parts={view.parts} /></>}</p>}
      {machine && !machine.available && machine.reason && view.cause !== "Running outside Applications." && !view.parts.includes(machine.reason) && <p className="cn-say">{machine.reason}</p>}
      {outcome && <p className="cn-say" role="alert">{outcome.kind === "changed" ? "It changed after you looked, so nothing was replaced." : outcomeText(outcome.message)}</p>}
      {expanded[row] && <div className="cn-details"><Details machine={machine} ui={ui} row={row} copyPath={copyPath} /></div>}
    </div>;
  })}</div>;
}
// A link and its target can run longer than the row; they stay on one line, the full
// path in title.
const LINK_PATHS = new Set(["cli", "claude-link"]);
function DetailItem({ item, reason }: { item: ItemView; reason?: ReactNode }) {
  return <><div className={`ob-item${item.dimmed ? " dimmed" : ""}`}>
    <span className="ob-label">{item.label}</span>{LINK_PATHS.has(item.key)
      ? <span className="ob-detail path" title={item.detail.map(part => typeof part === "string" ? part : part.code).join("")}><ConnectionParts parts={item.detail} /></span>
      : <span className="ob-detail"><ConnectionParts parts={item.detail} /></span>}
    <span className="ob-status">{item.chip && <span className={`ob-chip${item.chip.tone ? ` ${item.chip.tone}` : ""}`}>{item.chip.text}</span>}</span>
    {item.msg && <span className={`ob-msg ${item.msg.tone}`}>{item.msg.tone !== "ok" && <AlertIcon />}<span><ConnectionParts parts={item.msg.parts} /></span></span>}
    {(reason || item.reason) && !item.dimmed && <span className="ob-reason">{reason ?? item.reason}</span>}
  </div>{item.reason && item.dimmed && <div className="ob-item ob-notice"><span /><span className="ob-reason">{item.reason}</span></div>}</>;
}
function Details({ machine, ui, row, copyPath }: Pick<ConnectionRowsProps, "machine" | "ui" | "copyPath"> & { row: Row }) {
  const detailUi = { ...ui, checking: !machine && ui.checking };
  if (row === "cli") {
    const items = cliItems(machine, detailUi);
    const link = items[0];
    if (machine?.cli.state === "dangling" && link) {
      link.msg = { tone: "warn", parts: ["Points to ", { code: machine.cli.value ?? "" }, ", which no longer exists."] };
      delete link.reason;
    }
    return <>{link && <DetailItem item={link} reason={machine?.cli.state === "dangling" ? <>Fix points it to <code>{machine.display.cliTarget}</code>.</> : undefined} />}
      {machine?.probe.ok && !machine.pathPresent ? <div className="cn-opt"><span className="cn-opt-head">Use Doan in your terminal <span className="ob-chip">Optional</span></span>
        <p>{machine.rcFile ? <>Add this line to <code>{machine.rcFile}</code>, then open a new terminal. Agents don’t need it.</> : "Add ~/.local/bin to PATH in your shell configuration, then choose Check Again."}</p>
        {machine.rcFile && <span className="ob-copyline"><output>{PATH_LINE_TEXT}</output><button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={ui.pathCopy === "copying"} onClick={copyPath}>{copyLabel(ui.pathCopy)}</button></span>}
        {ui.pathCopy === "failed" && <p role="alert" className="ob-msg error"><AlertIcon /><span>{COPY_FAILED}</span></p>}</div> : items.slice(1).map(item => <DetailItem key={item.key} item={item} />)}</>;
  }
  const agents = agentsView(machine, detailUi);
  const agent = agents.agents.find(card => card.agent === row);
  const skill = { ...agents.skill, detail: agents.skill.detail.map(part => part === " · shared by Claude Code and Codex" ? ` · shared with ${row === "claude" ? "Codex" : "Claude Code"}` : part) };
  return <>{machine?.agents[row].executable && <DetailItem item={{ key: "found", label: "Found at", detail: [{ code: machine.agents[row].executable }] }} />}<DetailItem item={skill} />{agent?.items.map(item => <DetailItem key={item.key} item={item.dimmed ? { ...item, reason: MCP_WAITS } : item} />)}</>;
}
