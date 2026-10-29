import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MachineState, StepResult } from "../main/onboarding/machine";
import type { SettingsTab, SettingsTarget } from "../main/settings";
import type { SetupStatus } from "../main/setupBroker";
import { ConnectionRows, ConnectionParts } from "./ConnectionRows";
import { connectionConfirm } from "./connectionRowView";
import { idleUi, type MachineUi, type Row } from "./onboardingView";
import { SettingsDialog } from "./SettingsDialog";
import { SettingsProjects } from "./settingsProjects";
import { AlertIcon } from "./AlertIcon";

export function SettingsWindow() {
  const [tab, setTab] = useState<SettingsTab>("connections");
  const [locked, setLocked] = useState(false);
  const [target, setTarget] = useState<SettingsTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targetVersion = useRef(0);
  const lock = useRef(false), currentTab = useRef<SettingsTab>(tab);
  const queuedTarget = useRef<SettingsTarget | null>(null);
  lock.current = locked; currentTab.current = tab;
  const reportBusy = useCallback((busy: boolean) => { lock.current = busy; setLocked(busy); }, []);
  function select(next: SettingsTab) { setTab(next); void window.doanSettings.saveTab(next).then(ok => { if (!ok) setError("Couldn’t save the Settings tab."); }).catch(error => setError(error instanceof Error ? error.message : String(error))); }
  useEffect(() => {
    if (locked || !queuedTarget.current) return;
    const next = queuedTarget.current; queuedTarget.current = null;
    setTarget(next); select(next.tab);
  }, [locked]);
  useEffect(() => {
    let live = true;
    const receive = (next: SettingsTarget) => {
      targetVersion.current++;
      // A target from Home must not unmount the owner of main's pending confirmation.
      if (lock.current) { queuedTarget.current = next; select(currentTab.current); }
      else { setTarget(next); select(next.tab); }
    };
    const unsubscribe = window.doanSettings.onTarget(receive);
    const version = targetVersion.current;
    void (async () => {
      const saved = await window.doanSettings.getTab();
      const pending = await window.doanSettings.takeTarget();
      if (!live || version !== targetVersion.current) return;
      if (pending) receive(pending); else if (saved) setTab(saved);
    })().catch(error => { if (live) setError(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; unsubscribe(); };
  }, []);
  return <main className="settings-shell"><div className="st-tabbar"><div className="st-tabs" role="tablist" aria-label="Settings">{(["connections", "projects"] as const).map(value => <button key={value} className="st-tab" role="tab" disabled={locked} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => { if (!lock.current) select(value); }} onKeyDown={event => {
    if (lock.current) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? "connections" : event.key === "End" ? "projects" : value === "connections" ? "projects" : "connections";
    select(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next === "connections" ? 0 : 1]?.focus();
  }}>{value === "connections" ? "Connections" : "Projects"}</button>)}</div></div>
    {error && <p role="alert" className="pj-msg"><AlertIcon /><span>{error}</span></p>}
    {tab === "connections" ? <SettingsConnections onBusy={reportBusy} target={target?.tab === "connections" ? target : null} /> : <SettingsProjects onBusy={reportBusy} target={target?.tab === "projects" ? target : null} />}
  </main>;
}
function SettingsConnections({ target, onBusy }: { onBusy: (busy: boolean) => void; target: Extract<SettingsTarget, { tab: "connections" }> | null }) {
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [ui, setUi] = useState<MachineUi>(() => ({ ...idleUi(), checking: true }));
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const installRequests = useRef(0);
  const [justConnected, setJustConnected] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; target: "cli" | "stub" | "claudeLink" | "mcp"; row: Row } | null>(null);
  useEffect(() => { onBusy(ui.running !== null); return () => onBusy(false); }, [ui.running]);
  const live = useRef(true), reads = useRef(0), busyRead = useRef(false);
  busyRead.current = ui.running !== null || !!status?.busy;
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  async function read() {
    const request = ++reads.current;
    setUi(current => ({ ...current, checking: true, readError: null }));
    try {
      const reply = await window.doanSettings.readSetup(`settings:${request}`);
      if (!live.current || request !== reads.current) return;
      if (reply.kind === "state") setMachine(reply.state);
      setUi(current => ({ ...current, checking: false, readError: reply.kind === "stale" ? "Couldn’t read connections. Choose Check Again." : null }));
    } catch (error) { if (live.current && request === reads.current) setUi(current => ({ ...current, checking: false, readError: error instanceof Error ? error.message : String(error) })); }
  }
  useEffect(() => {
    live.current = true; void read();
    const unsubscribe = window.doanSettings.onSetupStatus(setStatus);
    let lastFocusRead = Date.now();
    const refresh = () => {
      const now = Date.now();
      if (now < lastFocusRead) lastFocusRead = now;
      if (!busyRead.current && now - lastFocusRead >= 60_000) {
        lastFocusRead = now; setJustConnected(null); void read();
      }
    };
    window.addEventListener("focus", refresh);
    return () => { live.current = false; reads.current++; unsubscribe(); window.removeEventListener("focus", refresh); };
  }, []);
  async function settle(row: Row, promise: Promise<StepResult>) {
    let result: StepResult;
    try { result = await promise; } catch (error) { result = { kind: "error", message: error instanceof Error ? error.message : String(error) }; }
    if (!live.current) return;
    if (result.kind === "confirm") { setConfirm({ id: result.id, target: result.target, row }); return; }
    setUi(current => ({ ...current, running: null, outcome: { ...current.outcome, [row]: result.kind === "stale" ? { kind: "changed" } : result.kind === "busy" ? { kind: "unavailable", message: "Another setup step is running. Try again when it finishes." } : result.kind === "error" || result.kind === "unavailable" ? result : undefined } }));
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
    setUi(current => ({ ...current, running: row, outcome: { ...current.outcome, [row]: undefined } }));
    void settle(row, window.doanSettings.runSetupStep(row === "cli" ? { step: "cli", expected: machine.expected } : { step: "connect", agent: row, expected: machine.expected }));
  }
  function check() { setInstallError(null); setJustConnected(null); void read(); }
  const rowTarget = useMemo(() => target?.connection ? { connection: target.connection } : null, [target]);
  const busy = !!status?.busy || ui.running !== null;
  const view = confirm && machine ? connectionConfirm(confirm.target, confirm.row === "cli" ? "claude" : confirm.row, machine) : null;
  return <section className="st-body" role="tabpanel" aria-label="Connections"><div className="st-head"><p className="st-lead">Your agents reach Doan through these three. Each row says whether that works right now.</p><button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy || ui.checking} onClick={check}>Check Again</button></div>
    {status?.busy && !ui.running && <p className="st-notice doan-notice warning" role="status"><AlertIcon /><span>Another window is running a setup step. These buttons work again when it finishes.</span></p>}
    {installError && <p className="st-notice doan-notice error" role="alert"><AlertIcon /><span>{installError}</span></p>}
    {ui.readError && <p className="st-notice doan-notice error" role="alert"><AlertIcon /><span>{ui.readError}</span></p>}
    <ConnectionRows machine={machine} ui={ui} rows={["cli", "claude", "codex"]} busy={busy} target={rowTarget} justConnected={justConnected} run={run} checkAgain={check} install={agent => {
      const request = ++installRequests.current; setInstallError(null);
      void window.doanSettings.openInstallPage(agent).then(ok => { if (live.current && request === installRequests.current && !ok) setInstallError("Couldn’t open the install page."); }).catch(error => { if (live.current && request === installRequests.current) setInstallError(error instanceof Error ? error.message : String(error)); });
    }} copyPath={() => {
      setUi(current => ({ ...current, pathCopy: "copying" }));
      void window.doanSettings.copyPathLine().then(result => { if (live.current) setUi(current => ({ ...current, pathCopy: result.kind === "success" ? "copied" : "failed" })); }).catch(() => { if (live.current) setUi(current => ({ ...current, pathCopy: "failed" })); });
    }} />
    {confirm && view && <SettingsDialog title={view.title} verb={view.verb} answer={allow => { const pending = confirm; setConfirm(null); void settle(pending.row, window.doanSettings.answerSetupConfirm({ id: pending.id, allow })); }}><p><ConnectionParts parts={view.body} /></p><dl className="ob-compare"><dt>Current</dt><dd>{view.current}</dd><dt>New</dt><dd>{view.next}</dd></dl></SettingsDialog>}
  </section>;
}
