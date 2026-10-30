import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MachineState, StepResult } from "../main/onboarding/machine";
import type { SetupStatus } from "../main/setupBroker";
import { ConnectionParts, ConnectionRows } from "./ConnectionRows";
import { connectionConfirm } from "./connectionRowView";
import { idleUi, type MachineUi, type Row } from "./onboardingView";
import { SettingsDialog } from "./SettingsDialog";
import { AlertIcon } from "./AlertIcon";

// Settings > Connections (design 'Connections'), moved from the Settings window with the same rows, statuses, actions,
// confirmations and copy. A setup step and its confirmation own the page until they settle (onLock), so nothing can
// unmount the confirmation while main still holds the setup lock (POSTMORTEM 2026-10-25 'A forwarded Settings target
// discarded a pending setup confirmation'). The window has one setup owner now, so the old "another window" notice is
// gone.
export function SettingsConnections({ onLock, actions }: { onLock(locked: boolean): void; actions: HTMLElement | null }) {
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [ui, setUi] = useState<MachineUi>(() => ({ ...idleUi(), checking: true }));
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; target: "cli" | "stub" | "claudeLink" | "mcp"; row: Row } | null>(null);
  const live = useRef(true), reads = useRef(0), installRequests = useRef(0);
  const lockRef = useRef({ onLock, locked: false });
  lockRef.current.onLock = onLock;
  // Reported as the step starts and ends, not after a render: a move between the two must already see the lock.
  const lock = (locked: boolean) => { if (lockRef.current.locked !== locked) { lockRef.current.locked = locked; lockRef.current.onLock(locked); } };
  // A window focus waits for the read main runs then (its 60 s throttle, shared with Git refresh); the page's own reads
  // clear it, so their read cycles never start another.
  const focusRead = useRef(false), checking = useRef(false);
  const busyRead = useRef(false);
  busyRead.current = ui.running !== null || ui.checking || !!status?.busy;
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  async function read() {
    const request = ++reads.current;
    focusRead.current = false;
    setUi(current => ({ ...current, checking: true, readError: null }));
    try {
      const reply = await window.doan.readSetup(`settings:${request}`);
      if (!live.current || request !== reads.current) return;
      if (reply.kind === "state") setMachine(reply.state);
      setUi(current => ({ ...current, checking: false, readError: reply.kind === "stale" ? "Couldn’t read connections. Choose Check Again." : null }));
    } catch (error) { if (live.current && request === reads.current) setUi(current => ({ ...current, checking: false, readError: error instanceof Error ? error.message : String(error) })); }
  }
  useEffect(() => {
    live.current = true;
    void read();
    // After main's focus read finishes, reread the full rows: details, PATH line and confirmation content,
    // as well as the three statuses.
    const unsubscribe = window.doan.onSetupStatus(next => {
      setStatus(next);
      const finished = checking.current && !next.checking;
      checking.current = next.checking;
      if (!finished || !focusRead.current || busyRead.current) return;
      setJustConnected(null); void read();
    });
    const focused = () => { focusRead.current = true; };
    window.addEventListener("focus", focused);
    return () => { live.current = false; reads.current++; unsubscribe(); window.removeEventListener("focus", focused); lock(false); };
  }, []);
  async function settle(row: Row, promise: Promise<StepResult>) {
    let result: StepResult;
    try { result = await promise; } catch (error) { result = { kind: "error", message: error instanceof Error ? error.message : String(error) }; }
    if (!live.current) return;
    if (result.kind === "confirm") { setConfirm({ id: result.id, target: result.target, row }); return; }
    setUi(current => ({ ...current, running: null, outcome: { ...current.outcome, [row]: result.kind === "stale" ? { kind: "changed" } : result.kind === "busy" ? { kind: "unavailable", message: "Another setup step is running. Try again when it finishes." } : result.kind === "error" || result.kind === "unavailable" ? result : undefined } }));
    lock(false);
    if (result.kind === "success") setJustConnected(row);
    await read();
    requestAnimationFrame(() => {
      if (!live.current) return;
      if (returnFocus.current?.isConnected && !returnFocus.current.disabled) returnFocus.current.focus();
      else document.querySelector<HTMLButtonElement>(`[data-connection="${row}"] .cn-name`)?.focus();
    });
  }
  function run(row: Row) {
    if (!machine || ui.running || status?.busy) return;
    returnFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    lock(true);
    setUi(current => ({ ...current, running: row, outcome: { ...current.outcome, [row]: undefined } }));
    void settle(row, window.doan.runSetupStep(row === "cli" ? { step: "cli", expected: machine.expected } : { step: "connect", agent: row, expected: machine.expected }));
  }
  function check() { setInstallError(null); setJustConnected(null); void read(); }
  const busy = !!status?.busy || ui.running !== null;
  const view = confirm && machine ? connectionConfirm(confirm.target, confirm.row === "cli" ? "claude" : confirm.row, machine) : null;
  return <>
    {actions && createPortal(<button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy || ui.checking} onClick={check}>Check Again</button>, actions)}
    {installError && <div className="doan-notice error doan-panel settings-notice" role="alert"><AlertIcon /><span>{installError}</span></div>}
    {ui.readError && <div className="doan-notice error doan-panel settings-notice" role="alert"><AlertIcon /><span>{ui.readError}</span></div>}
    <ConnectionRows machine={machine} ui={ui} rows={["cli", "claude", "codex"]} busy={busy} justConnected={justConnected} run={run} checkAgain={check} install={agent => {
      // Only the latest Install result is shown (POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback').
      const request = ++installRequests.current; setInstallError(null);
      void window.doan.openInstallPage(agent).then(ok => { if (live.current && request === installRequests.current && !ok) setInstallError("Couldn’t open the install page."); }).catch(error => { if (live.current && request === installRequests.current) setInstallError(error instanceof Error ? error.message : String(error)); });
    }} copyPath={() => {
      setUi(current => ({ ...current, pathCopy: "copying" }));
      void window.doan.copyPathLine().then(result => { if (live.current) setUi(current => ({ ...current, pathCopy: result.kind === "success" ? "copied" : "failed" })); }).catch(() => { if (live.current) setUi(current => ({ ...current, pathCopy: "failed" })); });
    }} />
    {confirm && view && <SettingsDialog title={view.title} verb={view.verb} description={<ConnectionParts parts={view.body} />} answer={allow => { const pending = confirm; setConfirm(null); void settle(pending.row, window.doan.answerSetupConfirm({ id: pending.id, allow })); }}>
      <dl className="ob-compare"><dt>Current</dt><dd>{view.current}</dd><dt>New</dt><dd>{view.next}</dd></dl></SettingsDialog>}
  </>;
}
