import { Fragment, useContext, useEffect, useRef, useState } from "react";
import type { OpenProjectResult } from "../main/index";
import type { AddOutcome, ScanSnapshot } from "../main/addProjects";
import type { MachineState, StepRequest, StepResult } from "../main/onboarding/machine";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderEntry } from "../main/view";
import {
  advanceAfter, agentsView, copyFor, footerView, idleUi, indicatorView, nextFocusIndex, pickView, projectStepView, promptStepView, STEP_COPY, stepsDone, wizardBusy,
  type ConfirmView, type FooterView, type IndicatorStep, type MachineUi, type Part, type Row, type RowOutcome,
} from "./onboardingView";
import { AddProjectsDialog, SetUpFolderConfirm } from "./AddProjectsDialog";
import { ConnectionRows } from "./ConnectionRows";
import { connectionConfirm } from "./connectionRowView";
import { FirstPrompt, FirstPromptContext } from "./FirstPrompt";
import { PathTip } from "./Home";
import { ProjectFields, useProjectSetup } from "./ProjectSetupDialog";

export type Reroot = FolderFocus & { seq: number };

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function Parts({ parts }: { parts: readonly Part[] }) {
  return <>{parts.map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <code key={index}>{part.code}</code>)}</>;
}

const chipClass = (tone: "ok" | "warn" | "err" | undefined) => tone ? `ob-chip ${tone}` : "ob-chip";

export function StepIndicator({ steps, go }: { steps: IndicatorStep[]; go: (step: number) => void }) {
  return <ol className="ob-steps" aria-label="Steps">
    {steps.map(step => <Fragment key={step.step}>
      {step.step > 0 && <li className="sep" aria-hidden="true" />}
      <li><button type="button" className={step.done ? "ob-step done" : "ob-step"} aria-label={step.ariaLabel} aria-current={step.current ? "step" : undefined} disabled={step.disabled} onClick={() => go(step.step)}>
        {step.done ? <span className="num" aria-hidden="true">✓</span> : <span className="num">{step.step + 1}</span>}{step.label}
      </button></li>
    </Fragment>)}
  </ol>;
}

export function WizardFooter({ view, checkAgain, skip, next }: { view: FooterView; checkAgain: () => void; skip: () => void; next: () => void }) {
  return <div className="ob-foot">
    <span className="meta">{view.stepNo}</span>
    {view.checkAgain && <button type="button" className="btn" disabled={view.checkAgain.disabled} onClick={checkAgain}>Check Again</button>}
    <span className="spacer" />
    {view.skip && <button type="button" className="btn ghost" disabled={view.skip.disabled} onClick={skip}>Skip</button>}
    <button type="button" className={view.next.primary ? "btn primary" : "btn"} disabled={view.next.disabled} onClick={next}>{view.next.label}</button>
  </div>;
}

export function ConfirmDialog({ view, answer }: { view: ConfirmView; answer: (allow: boolean) => void }) {
  const cancel = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const reply = (allow: boolean) => { dialog.current?.close(); answer(allow); };
  return <dialog className="ob-dialog" role="alertdialog" aria-label={view.title}
    ref={node => { dialog.current = node; if (node && !node.open) { node.showModal(); cancel.current?.focus(); } }}
    onCancel={event => { event.preventDefault(); reply(false); }}
    onKeyDown={event => {
      // Escape answers this dialog only; it must not close the wizard behind it.
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing) reply(false);
    }}>
    <h3>{view.title}</h3>
    <p><Parts parts={view.body} /></p>
    <dl className="ob-compare"><dt>Current</dt><dd>{view.current}</dd><dt>New</dt><dd>{view.next}</dd></dl>
    <div className="ob-buttons"><button type="button" className="btn" ref={cancel} onClick={() => reply(false)}>Cancel</button><button type="button" className="btn primary" onClick={() => reply(true)}>{view.verb}</button></div>
  </dialog>;
}

function outcomeOf(result: StepResult): RowOutcome | undefined {
  switch (result.kind) {
    case "success": case "cancelled": case "confirm": return undefined;
    case "stale": return { kind: "changed" };
    case "busy": return { kind: "unavailable", message: "Another setup step is running. Try again when it finishes." };
    case "unavailable": return { kind: "unavailable", message: result.message };
    case "error": return { kind: "error", message: result.message, ...(result.original !== undefined ? { original: result.original } : {}) };
  }
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

// A modal stacked over the wizard by step 3's Open Project….
type Layer = { kind: "choose"; scanId: string } | { kind: "confirm"; confirmId: string; path: string; name: string };

// The full-window "Set Up doan" wizard. Mounted once per main wizard session.
export function Wizard({ session, entries, reroot, homeDirectory, addOutcome, onClose }: { session: string; addOutcome: AddOutcome | null; entries: FolderEntry[]; reroot: Reroot | null; homeDirectory: string | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [ui, setUi] = useState<MachineUi>(() => ({ ...idleUi(), checking: true }));
  const [confirm, setConfirm] = useState<{ id: string; target: "cli" | "stub" | "claudeLink" | "mcp"; row: Row } | null>(null);
  // The agent Connect just finished for: its row says to start a new session until Check Again.
  const [justConnected, setJustConnected] = useState<Row | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [rerooted, setRerooted] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [layer, setLayer] = useState<Layer | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [addScan, setAddScan] = useState<string | null>(null);
  const [addConfirms, setAddConfirms] = useState<AddOutcome["confirms"]>([]);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const adoptedAdd = useRef(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const installs = useRef(0);
  const wait = useContext(FirstPromptContext);
  const title = useRef<HTMLSpanElement>(null);
  const reads = useRef(0);
  const live = useRef(true);
  // Set when a project was just opened, set up or added from step 4: move on once main lists it.
  const [advance, setAdvance] = useState<"open" | "setup" | "add" | null>(null);
  const entry = project === null ? undefined : entries.find(candidate => candidate.path === project);

  async function read() {
    const requestId = `${session}:${++reads.current}`;
    setUi(current => ({ ...current, checking: true, readError: null }));
    try {
      const reply = await window.doan.readOnboarding({ session, requestId });
      if (!live.current || requestId !== `${session}:${reads.current}`) return;
      if (reply.kind === "state" && reply.state.requestId === requestId) setMachine(reply.state);
      setUi(current => ({ ...current, checking: false, readError: reply.kind === "stale" ? "Couldn’t read connections. Choose Check Again." : null }));
    } catch (error) {
      if (live.current && requestId === `${session}:${reads.current}`) setUi(current => ({ ...current, checking: false, readError: errorText(error) }));
    }
  }
  useEffect(() => {
    live.current = true;
    title.current?.focus();
    void read();
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    if (!advance || !entry) return;
    const next = advanceAfter(advance === "add" ? "open" : advance, entry.kind);
    if (next === "wait") return;
    setAdvance(null);
    if (next === "advance") setStep(3);
    // Added from step 4 but not set up: the setup form is step 3's.
    else if (advance === "add") setStep(2);
  }, [advance, entry?.kind, project]);
  useEffect(() => {
    if (!addOutcome) return;
    const root = addOutcome.added[0] ?? addOutcome.duplicate;
    if (root) adoptAdded(root);
    setRefused(addOutcome.messages.join("\n") || null);
    setAddMessage(addOutcome.duplicate ? `Already added: ${addOutcome.duplicate}` : null);
    setAddScan(addOutcome.scanId);
    setAddConfirms(addOutcome.confirms);
  }, [addOutcome]);
  useEffect(() => {
    if (reroot && project === reroot.from) { setProject(reroot.root); setRerooted(`This folder is inside ${reroot.root}, which is already set up.`); }
  }, [reroot?.seq]);

  async function settle(row: Row, request: Promise<StepResult>) {
    let result: StepResult;
    try { result = await request; } catch (error) { result = { kind: "error", message: errorText(error) }; }
    if (!live.current) return;
    if (result.kind === "confirm") { setConfirm({ id: result.id, target: result.target, row }); return; }
    if (result.kind === "success" && row !== "cli") setJustConnected(row);
    setUi(current => ({ ...current, running: null, outcome: { ...current.outcome, [row]: outcomeOf(result) } }));
    await read();
  }
  function run(row: Row) {
    if (!machine || ui.running !== null) return;
    setUi(current => ({ ...current, running: row, outcome: { ...current.outcome, [row]: undefined } }));
    const request: StepRequest = row === "cli" ? { step: "cli", expected: machine.expected } : { step: "connect", agent: row, expected: machine.expected };
    void settle(row, window.doan.runOnboardingStep(request));
  }
  function answer(allow: boolean) {
    const pending = confirm;
    setConfirm(null);
    if (pending) void settle(pending.row, window.doan.answerOnboardingReplace({ id: pending.id, allow }));
  }
  async function copyPath() {
    setUi(current => ({ ...current, pathCopy: "copying" }));
    const copied = await copyFor(true, () => live.current, () => window.doan.copyPathLine());
    if (copied) setUi(current => ({ ...current, pathCopy: copied }));
  }

  const busy = wizardBusy({ running: ui.running, confirming: confirm !== null || addScan !== null || addConfirms.length > 0, projectBusy: projectBusy || adding, closing, pathCopy: ui.pathCopy, promptCopy: promptBusy ? "copying" : "idle" });
  // True once the wizard closed.
  async function close(): Promise<boolean> {
    if (busy) return false;
    setClosing(true);
    let result: StepResult;
    try { result = await window.doan.closeOnboarding({ session }); } catch (error) { result = { kind: "error", message: errorText(error) }; }
    if (!live.current) return false;
    setClosing(false);
    // A warning means onboarding.json was not saved; the wizard still closes for this run.
    if (result.kind !== "success" && result.kind !== "stale") return false;
    onClose();
    return true;
  }
  function adopt(root: string, cause: "open" | "add") { setAdvance(cause); setRerooted(null); if (cause === "open") setRefused(null); setProject(root); }
  function adoptAdded(root: string) {
    // A multi-add can finish through a direct result, a scan and several confirmations.
    if (adoptedAdd.current) return;
    adoptedAdd.current = true;
    adopt(root, "add");
  }
  // Open Project… is disabled while main answers, so a stacked modal opened
  // from it would hand focus back to <body> when cancelled.
  const openFocus = useRef<HTMLElement | null>(null);
  function cancelLayer() {
    setLayer(null);
    requestAnimationFrame(() => { const node = openFocus.current; if (node?.isConnected && !node.matches(":disabled")) node.focus(); });
  }
  async function openProject() {
    openFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let result: OpenProjectResult;
    try { result = await window.doan.openProject(); } catch { return; }
    if (!live.current) return;
    setRefused(null);
    if (result.kind === "stored") adopt(result.root, "open");
    else if (result.kind === "choose") setLayer({ kind: "choose", scanId: result.scanId });
    else if (result.kind === "confirm") setLayer({ kind: "confirm", confirmId: result.confirmId, path: result.path, name: result.name });
    else if (result.kind === "refused") setRefused(result.message);
  }
  async function addProject() {
    openFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    adoptedAdd.current = false;
    setRefused(null); setAddMessage(null); setAdding(true);
    try { await window.doan.addProjects(); } catch (error) { if (live.current) setRefused(errorText(error)); }
    finally { if (live.current) setAdding(false); }
  }
  function restoreAddFocus() {
    requestAnimationFrame(() => {
      const previous = openFocus.current;
      if (previous?.isConnected && !previous.matches(":disabled")) previous.focus();
      else title.current?.focus();
    });
  }
  async function install(agent: "claude" | "codex") {
    const request = ++installs.current;
    setInstallError(null);
    try {
      const ok = await window.doan.openInstallPage(agent);
      if (live.current && request === installs.current && !ok) setInstallError("Couldn’t open the install page.");
    } catch (error) { if (live.current && request === installs.current) setInstallError(errorText(error)); }
  }

  const closeLatest = useRef(close);
  closeLatest.current = close;
  // A stacked modal (a confirmation, the pick-one list) answers its own keys.
  const stacked = useRef(false);
  stacked.current = confirm !== null || layer !== null || addScan !== null || addConfirms.length > 0;
  const overlay = useRef<HTMLDialogElement | null>(null);
  // On the window, in capture: a button that turns disabled while it runs drops
  // focus to <body>, and keys from there must still reach the wizard. Capture
  // also runs before the canvas's own Escape (selection clear) listener.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      // A confirmation dialog answers its own keys.
      if (event.target instanceof Element && event.target.closest("dialog") !== null && event.target.closest("dialog") !== overlay.current) return;
      // Focus fell out of a stacked modal (a button disabled itself while it
      // runs): the key must not reach the wizard behind it.
      if (stacked.current) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } return; }
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (!event.isComposing) void closeLatest.current();
      } else if (event.key === "Tab" && overlay.current) {
        const nodes = Array.from(overlay.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(node => node.closest("dialog") === overlay.current);
        const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement as HTMLElement), event.shiftKey);
        if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, []);

  const done = stepsDone(machine, entry, promptCopied);
  const go = (next: number) => { if (!busy) setStep(Math.max(0, Math.min(3, next))); };
  const checkAgain = () => { setUi(current => ({ ...current, outcome: {} })); setJustConnected(null); void read(); };
  const confirmed = confirm && machine ? connectionConfirm(confirm.target, confirm.row === "cli" ? "claude" : confirm.row, machine) : null;
  // Steps 1–2 draw the Settings connection rows (conductor decision reuse-row).
  const rows = (connections: readonly Row[]) => <ConnectionRows machine={machine} ui={ui} rows={connections} busy={busy} justConnected={justConnected} run={run} checkAgain={checkAgain}
    install={agent => void install(agent)} copyPath={() => void copyPath()} />;
  const noAgent = step === 1 ? agentsView(machine, ui).notice : undefined;

  // A modal <dialog> sits above any app dialog already open (setup, comments),
  // which would otherwise stay on top and leave both unclickable.
  return <dialog className="ob-overlay" aria-label="Set Up doan"
    ref={node => { overlay.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => event.preventDefault()}>
    <div className="top ob-top">
      <span className="traffic-space" aria-hidden="true" />
      <span className="logo"><i /><span className="ob-title" tabIndex={-1} ref={title}>Set Up doan</span></span>
      <span className="spacer" />
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void close()}>Close <span className="kbd">Esc</span></button>
    </div>
    <StepIndicator steps={indicatorView(step, done, busy)} go={go} />
    <div className="ob-body native-scroll"><div className="ob-form">
      <h2>{STEP_COPY[step]?.heading}</h2>
      <p className="ob-lead"><Parts parts={STEP_COPY[step]?.lead ?? []} /></p>
      {ui.readError && <p className="ob-msg error" role="alert">{ui.readError}</p>}
      {installError && <p className="ob-msg error" role="alert">{installError}</p>}
      {addMessage && <p role="status">{addMessage}</p>}
      {step !== 2 && refused && <p className="ob-msg error" role="alert">{refused}</p>}
      {step === 0 && rows(["cli"])}
      {step === 1 && <>{rows(["claude", "codex"])}{noAgent && <p className="cn-note" role="status">{noAgent}</p>}</>}
      {step === 2 && <ProjectStep key={project ?? ""} project={project} entry={entry ?? null} rerooted={rerooted} refused={refused} setBusy={setProjectBusy} open={openProject}
        setUpDone={(result) => {
          if (result.kind === "success") setAdvance("setup");
          else if (result.kind === "rerooted") { setProject(result.root); setRerooted(result.message); }
        }} />}
      {step === 3 && <PromptStep entry={entry ?? (project ? { kind: "loading", path: project } : null)} reviewProject={() => go(2)} busy={busy} setBusy={setPromptBusy} copied={() => setPromptCopied(true)} addProject={addProject}
        openReady={async () => { if (await close()) wait.open(); }} />}
    </div></div>
    <WizardFooter view={footerView(step, !!done[step], busy, ui.checking)} checkAgain={checkAgain} skip={() => go(step + 1)} next={() => { if (step === 3) void close(); else go(step + 1); }} />
    {addScan && <AddProjectsDialog key={addScan} scanId={addScan} homeDirectory={homeDirectory}
      close={() => { setAddScan(null); restoreAddFocus(); }} added={roots => { if (roots[0]) adoptAdded(roots[0]); }} />}
    {!addScan && addConfirms[0] && <SetUpFolderConfirm key={addConfirms[0].confirmId} name={addConfirms[0].name} path={addConfirms[0].path}
      cancel={() => { setAddConfirms(current => current.slice(1)); restoreAddFocus(); }}
      confirm={async () => {
        const pending = addConfirms[0];
        if (!pending) return;
        const result = await window.doan.confirmFolder(pending.confirmId);
        const root = result.kind === "added" ? result.added[0] : undefined;
        if (!root) throw new Error("This confirmation is no longer available. Add the folder again.");
        setAddConfirms(current => current.slice(1)); adoptedAdd.current = true; adopt(root, "add"); restoreAddFocus();
      }} />}
    {confirmed && <ConfirmDialog view={confirmed} answer={answer} />}
    {layer?.kind === "choose" && <PickOneDialog key={layer.scanId} scanId={layer.scanId} homeDirectory={homeDirectory} close={cancelLayer} chosen={root => { setLayer(null); adopt(root, "open"); }} />}
    {layer?.kind === "confirm" && <SetUpFolderConfirm key={layer.confirmId} name={layer.name} path={layer.path} cancel={cancelLayer}
      confirm={async () => {
        const result = await window.doan.confirmFolder(layer.confirmId);
        const root = result.kind === "added" ? result.added[0] : undefined;
        if (root === undefined) throw new Error("This confirmation is no longer available. Open the folder again.");
        setLayer(null); adopt(root, "open");
      }} />}
  </dialog>;
}

// Step 3 picked a folder of repositories: choose exactly one, worktrees included.
function PickOneDialog({ scanId, homeDirectory, close, chosen }: { scanId: string; homeDirectory: string | null; close: () => void; chosen: (root: string) => void }) {
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => window.doan.watchScan(scanId, setSnapshot), [scanId]);
  const view = snapshot ? pickView(snapshot, homeDirectory) : null;
  const picked = choice ?? view?.initial ?? null;
  const cancel = () => { if (busy) return; void window.doan.cancelScan(scanId).catch(console.error); dialog.current?.close(); close(); };
  async function submit() {
    if (picked === null) return;
    setBusy(true); setError("");
    try {
      const result = await window.doan.addCandidates(scanId, [picked]);
      const root = result.kind === "added" ? result.added[0] : undefined;
      if (root !== undefined) { dialog.current?.close(); chosen(root); return; }
      setError("This list is no longer available. Open the folder again.");
    } catch (failure) { setError(errorText(failure)); }
    setBusy(false);
  }
  return <dialog className="add-dialog" aria-label={view?.title ?? "Choose a repository"} aria-busy={busy} ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <h3>{view?.title ?? "Choose a repository"}</h3>
    <p className="lead"><Parts parts={view?.lead ?? []} /></p>
    <div className="cl native-scroll" role="radiogroup" aria-label="Repositories">
      {view?.rows.map(row => <div className={`cl-item${row.sub ? " sub" : ""}${row.disabled ? " off" : ""}`} key={row.id}>
        <input type="radio" name={`pick-${scanId}`} aria-label={row.label} disabled={row.disabled || busy} checked={picked === row.id} onChange={() => setChoice(row.id)} />
        <PathTip text={row.name}><span className="cl-name">{row.name}{row.sub && <span className="kind">worktree</span>}</span></PathTip>
        {row.chip ? <span className={chipClass(row.chip.tone)}>{row.chip.text}</span> : <span />}
        <PathTip text={row.path}><span className="cl-path">{row.path}</span></PathTip>
      </div>)}
    </div>
    {error && <p role="alert" className="ob-msg error">{error}</p>}
    <div className="add-foot">{snapshot && !snapshot.done && <span className="scan" role="status"><span className="spinner" />{snapshot.finished} of {snapshot.total} checked</span>}<span className="spacer" />
      <button type="button" className="btn" autoFocus disabled={busy} onClick={cancel}>Cancel</button>
      <button type="button" className="btn primary" disabled={picked === null || busy} onClick={() => void submit()}>Choose</button></div>
  </dialog>;
}

function ProjectStep({ project, entry, rerooted, refused, setBusy, open, setUpDone }: {
  project: string | null; entry: FolderEntry | null; rerooted: string | null; refused: string | null; setBusy: (busy: boolean) => void;
  open: () => Promise<void>; setUpDone: (result: ProjectInitResult) => void;
}) {
  const setup = useProjectSetup(project ?? "");
  const [opening, setOpening] = useState(false);
  const running = setup.form.running || opening;
  useEffect(() => { setBusy(running); return () => setBusy(false); }, [running]);
  const view = projectStepView(entry ?? (project ? { path: project, kind: "loading" } : null), { ...setup.form, running, rerooted, refused });
  const openProject = async () => { setOpening(true); try { await open(); } finally { setOpening(false); } };
  return <>
    <div className="ob-card">
      <div className="ob-field">
        <span className="ob-label">Project</span>
        {view.value ? <span className="value">{view.value.name} <span className="meta" title={view.value.path}>{view.value.path}</span></span> : <span className="value none">No project open</span>}
        {view.chip ? <span className="ob-chip ok">{view.chip}</span>
          : <button type="button" className={view.open.primary ? "btn primary" : "btn"} disabled={view.open.disabled} onClick={() => void openProject()}>Open Project…</button>}
        {view.message && <span className="ob-msg">{view.message}</span>}
        {view.error && <span className="ob-msg error" role="alert">{view.error}</span>}
      </div>
      {view.form && <>
        <ProjectFields form={{ ...setup.form, running }} choose={() => void setup.choose()} />
        <div className="ob-actions"><span className="spacer" /><button type="button" className="btn primary" disabled={view.form.setUp.disabled}
          onClick={() => void setup.setUp().then(result => { if (result) setUpDone(result); })}>{view.form.setUp.label}</button></div>
      </>}
    </div>
  </>;
}

// Step 4: the shared first prompt, Add Project… without a project, and
// Canvas ready once the waited-for canvas arrived in this project.
function PromptStep({ entry, busy, setBusy, copied, addProject, reviewProject, openReady }: {
  entry: FolderEntry | null; reviewProject: () => void; busy: boolean; setBusy: (busy: boolean) => void; copied: () => void; addProject: () => void; openReady: () => Promise<void>;
}) {
  const wait = useContext(FirstPromptContext);
  const arrived = entry && wait.state.kind === "arrived" && wait.state.root === entry.path ? wait.state.path : null;
  const view = promptStepView(entry, entry?.kind === "list" ? entry.canvases.find(row => row.path === arrived) ?? null : null, busy);
  if (view.project) return <div className="ob-card"><div className="ob-prompt"><div className="fp-none">
    <p><code>{view.project.path}</code> · <span className="ob-chip">{view.project.status}</span></p>
    <button type="button" className="btn primary" disabled={view.project.disabled} onClick={reviewProject}>{view.project.label}</button>
  </div></div></div>;
  if (view.addProject) {
    const add = view.addProject;
    return <div className="ob-card"><div className="ob-prompt"><div className="fp-none"><p><Parts parts={add.text} /></p>
      <button type="button" className="btn primary" disabled={add.disabled} onClick={addProject}>{add.label}</button></div></div></div>;
  }
  const ready = view.ready && <div className="fp-ready" role="status"><span className="dot" aria-hidden="true" /><span className="msg">{view.ready.text}</span>
    <button type="button" className="btn primary" disabled={view.ready.open.disabled} onClick={() => void openReady()}>{view.ready.open.label}</button></div>;
  return <div className="ob-card"><FirstPrompt key={entry?.path} root={entry?.path ?? ""} ready={ready || undefined} onBusy={setBusy} onCopied={copied} /></div>;
}
