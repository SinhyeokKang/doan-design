import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { OpenProjectResult } from "../main/index";
import type { AddOutcome, ScanSnapshot } from "../main/addProjects";
import type { Provider } from "../main/agentAuth/types";
import type { StepResult } from "../main/onboarding/machine";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderEntry } from "../main/view";
import { nextFocusIndex, pickView, projectStepView, type Part } from "./onboardingView";
import type { AuthCommand, Button, Notice, ProviderView, pasteDialog, stopDialog } from "./agentAuthView";
import { AgentStepSession } from "./agentStep";
import { canAdvance, canComplete, initialScene, nextScene, type Scene, type SceneEvent } from "./onboardingScene";
import { AddProjectsDialog, SetUpFolderConfirm } from "./AddProjectsDialog";
import { PathTip } from "./Home";
import { ProjectFields, useProjectSetup } from "./ProjectSetupDialog";
import { AlertIcon } from "./AlertIcon";

export type Reroot = FolderFocus & { seq: number };

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
// Local copies of the draft's marks; sources are in public/provider-logos/README.md.
const LOGOS: Record<Provider, string> = { claude: "claude.png", codex: "codex.png", cursor: "cursor.svg", antigravity: "antigravity.svg", copilot: "copilot.svg" };

function Parts({ parts }: { parts: readonly Part[] }) {
  return <>{parts.map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <code key={index}>{part.code}</code>)}</>;
}

const chipClass = (tone: "ok" | "warn" | "err" | undefined) => tone ? `ob-chip ${tone}` : "ob-chip";
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

// setup:open-external knows only Claude Code and Codex; main adds Cursor and Copilot later (buzz-onboarding U2).
function openInstallPage(provider: Provider): Promise<boolean> {
  return provider === "claude" || provider === "codex" ? window.doan.openInstallPage(provider) : Promise.resolve(false);
}

export function Welcome({ start }: { start: () => void }) {
  return <div className="ob-welcome-main">
    <div className="ob-atmosphere" aria-hidden="true"></div>
    <div className="ob-wordmark">doan</div>
    <h1 tabIndex={-1}>A place for your next idea.<br />Bring it to life on canvas.</h1>
    <div className="ob-welcome-action"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="lg" onClick={start}>Get started<ArrowRight aria-hidden="true" /></button></div>
  </div>;
}

// The AppShell mode capsule as a stepper: the current step is the white pill, a done step goes back.
export function SetupSteps({ scene, canProject, busy, go }: { scene: Scene; canProject: boolean; busy: boolean; go: (to: "agent" | "project") => void }) {
  const project = scene === "project";
  return <nav className="shell-modes ob-steps" aria-label="Setup steps">
    {project
      ? <button type="button" aria-label="Agent, completed" disabled={busy} onClick={() => go("agent")}><Check aria-hidden="true" /> <span>Agent</span></button>
      : <button type="button" className="current" aria-current="step">1 <span>Agent</span></button>}
    {project
      ? <button type="button" className="current" aria-current="step">2 <span>Project</span></button>
      : <button type="button" disabled={!canProject} onClick={() => go("project")}>2 <span>Project</span></button>}
  </nav>;
}

function ActionButton<C extends string>({ button, run, data }: { button: Button<C>; run: (command: C) => void; data?: Record<string, string> }) {
  return <>
    {button.note && <span className="ob-button-note">{button.note}</span>}
    <button type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm" aria-label={button.ariaLabel} disabled={button.disabled} {...data} onClick={() => run(button.command)}>{button.label}</button>
  </>;
}

export function NoticeView({ notice, run }: { notice: Notice; run: (command: AuthCommand) => void }) {
  return <>
    <div className={notice.role === "alert" ? "doan-notice error doan-panel" : "doan-notice doan-panel"} role={notice.role}>
      {notice.spinner ? <span className="doan-spinner doan-alert-icon" aria-hidden="true" /> : <AlertIcon />}
      <span>{notice.title && <strong className="ob-notice-title">{notice.title}</strong>}{notice.body && <span className="ob-notice-body">{notice.body}</span>}</span>
    </div>
    {notice.note && <p className="ob-provider-help">{notice.note}</p>}
    {notice.actions.length > 0 && <div className={notice.actions.length === 1 ? "ob-state-actions submit-only" : "ob-state-actions"}>
      {notice.actions.map(button => <ActionButton key={button.command} button={button} run={run} />)}
    </div>}
  </>;
}

export function ProviderRow({ view, run }: { view: ProviderView; run: (command: AuthCommand) => void }) {
  return <div className="ob-provider">
    <div className="ob-provider-row">
      <span className="ob-provider-mark" aria-hidden="true"><img src={`/provider-logos/${LOGOS[view.provider]}`} alt="" /></span>
      <div className="ob-provider-label"><strong>{view.name}</strong>{view.detail !== null && <span role={view.detailRole ?? undefined}>{view.detail}</span>}</div>
      {view.button && <ActionButton button={view.button} run={run} />}
    </div>
    {view.helper && <p className="ob-provider-help">{view.helper}</p>}
    {view.notice && <NoticeView notice={view.notice} run={run} />}
    {view.paste && <p className="ob-page-help">{view.paste.prompt} <ActionButton button={view.paste.button} run={run} data={{ "data-paste": view.provider }} /></p>}
  </div>;
}

export function AgentFooter({ canContinue, busy, back, next, continueRef }: { canContinue: boolean; busy: boolean; back: () => void; next: () => void; continueRef?: (node: HTMLButtonElement | null) => void }) {
  return <div className="ob-footer">
    <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={back}><ArrowLeft aria-hidden="true" />Back</button>
    <button type="button" className="doan-button" data-ui-variant="prominent" disabled={!canContinue || busy} data-continue="" ref={continueRef} onClick={next}>Continue<ArrowRight aria-hidden="true" /></button>
  </div>;
}

// Escape answers the open child dialog only; the onboarding window behind it stays.
function dialogKeys(close: () => void) {
  return (event: { key: string; nativeEvent: { isComposing: boolean }; preventDefault(): void; stopPropagation(): void }) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (!event.nativeEvent.isComposing) close();
  };
}
const openModal = (node: HTMLDialogElement | null) => { if (node && !node.open) node.showModal(); };

export function PasteDialog({ view, value, submittable, busy, change, submit, close }: {
  view: ReturnType<typeof pasteDialog>; value: string; submittable: boolean; busy: boolean; change: (value: string) => void; submit: () => void; close: () => void;
}) {
  return <dialog className="doan-dialog" data-ui-size="compact" aria-labelledby="ob-paste-title" aria-busy={busy || undefined} ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <form className="ob-dialog-form" onSubmit={event => { event.preventDefault(); if (submittable) submit(); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="ob-paste-title">{view.title}</h3><p className="doan-dialog-description">{view.body}</p></div></div>
      <input className="doan-input" aria-label={view.inputLabel} placeholder={view.placeholder} maxLength={view.maxLength} value={value} autoFocus disabled={busy} onChange={event => change(event.target.value)} />
      <div className="doan-dialog-actions">
        <button type="button" className="doan-button" data-ui-variant={view.cancel.variant} data-ui-size="sm" onClick={close}>{view.cancel.label}</button>
        <button type="submit" className="doan-button" data-ui-variant={view.submit.variant} data-ui-size="sm" disabled={!submittable}>{view.submit.label}</button>
      </div>
    </form>
  </dialog>;
}

export function StopDialog({ view, busy, confirm, close }: { view: ReturnType<typeof stopDialog>; busy: boolean; confirm: () => void; close: () => void }) {
  return <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="ob-stop-title" aria-describedby="ob-stop-body" ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="ob-stop-title">{view.title}</h3><p className="doan-dialog-description" id="ob-stop-body">{view.body}</p></div></div>
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant={view.cancel.variant} data-ui-size="sm" autoFocus onClick={close}>{view.cancel.label}</button>
      <button type="button" className="doan-button" data-ui-variant={view.confirm.variant} data-ui-size="sm" disabled={busy} onClick={confirm}>{view.confirm.label}</button>
    </div>
  </dialog>;
}

function AgentStep({ session, heading, back, next }: { session: AgentStepSession; heading: (node: HTMLHeadingElement | null) => void; back: () => void; next: () => void }) {
  const { state } = session;
  const list = session.view();
  const continueButton = useRef<HTMLButtonElement | null>(null);
  const invoker = useRef<HTMLElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { session.enter(); }, []);
  useEffect(() => {
    const focus = state.focus;
    if (!focus) return;
    requestAnimationFrame(() => {
      if (focus.target === "continue") { continueButton.current?.focus(); return; }
      // The attempt may have ended meanwhile; the step heading is the next stable place.
      const paste = document.querySelector<HTMLElement>(`[data-paste="${focus.provider}"]`);
      (paste && !paste.matches(":disabled") ? paste : title.current)?.focus();
    });
  }, [state.focus?.seq]);
  // The stop dialog has no single invoker in state, so focus returns to whatever opened it.
  useEffect(() => {
    if (state.dialog) { if (!invoker.current) invoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; return; }
    const previous = invoker.current;
    invoker.current = null;
    if (previous?.isConnected && !previous.matches(":disabled") && !previous.dataset.paste) requestAnimationFrame(() => previous.focus());
  }, [state.dialog?.kind]);
  const run = (provider: Provider) => (command: AuthCommand) => session.command(provider, command);
  const stop = session.stopView(), paste = session.pasteView();
  return <>
    <div className="ob-heading">
      <h2 tabIndex={-1} ref={node => { title.current = node; heading(node); }}>Connect your agent</h2>
      <p>{list.anyReady ? "You’re connected. Add another agent or continue." : "Sign in to at least one agent to continue."}</p>
    </div>
    {list.notice && <div className="ob-list-notice"><NoticeView notice={list.notice} run={command => { if (command === "read") session.retryRead(); }} /></div>}
    {state.installError && <div className="doan-notice error doan-panel ob-list-notice" role="alert"><AlertIcon /><span>{state.installError}</span></div>}
    {list.providers.length > 0 && <div className="doan-panel ob-provider-list">{list.providers.map(view => <ProviderRow key={view.provider} view={view} run={run(view.provider)} />)}</div>}
    <p className="ob-fine">{list.anyReady ? "You can manage your connections later in Settings." : "Your agent account stays on this Mac."}</p>
    <p className="ob-live" role="status">{state.announcement?.text}</p>
    <AgentFooter canContinue={session.canContinue()} busy={state.continuing} back={back} next={next} continueRef={node => { continueButton.current = node; }} />
    {stop && <StopDialog view={stop} busy={false} confirm={() => void session.confirmStop()} close={() => session.closeDialog()} />}
    {paste && state.dialog?.kind === "paste" && <PasteDialog view={paste} value={state.dialog.value} submittable={session.pasteSubmittable()} busy={state.dialog.submitting}
      change={value => session.setPaste(value)} submit={() => void session.submitPaste()} close={() => session.closeDialog()} />}
  </>;
}

// A modal stacked over the onboarding window by the Project step's Open Project….
type Layer = { kind: "choose"; scanId: string } | { kind: "confirm"; confirmId: string; path: string; name: string };

// The full-window first run: Welcome → Agent → Project, mounted once per main onboarding session. The Project step
// is still the earlier folder flow and closes with onboarding:close until batch U2 replaces both.
export function Wizard({ session, entries, reroot, homeDirectory, addOutcome, onClose }: { session: string; addOutcome: AddOutcome | null; entries: FolderEntry[]; reroot: Reroot | null; homeDirectory: string | null; onClose: () => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [agents] = useState(() => new AgentStepSession({ api: window.doan, openInstall: openInstallPage, hasFocus: () => document.hasFocus(), changed: redraw }));
  const [scene, setScene] = useState(() => initialScene(false));
  const [project, setProject] = useState<string | null>(null);
  const [rerooted, setRerooted] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [layer, setLayer] = useState<Layer | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [addScan, setAddScan] = useState<string | null>(null);
  const [addConfirms, setAddConfirms] = useState<AddOutcome["confirms"]>([]);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const adoptedAdd = useRef(false);
  const heading = useRef<HTMLElement | null>(null);
  const live = useRef(true);
  const entry = project === null ? undefined : entries.find(candidate => candidate.path === project);
  const auth = agents.state.auth ?? null;
  const busy = projectBusy || closing;

  useEffect(() => {
    live.current = true;
    agents.start();
    const focused = () => agents.windowFocused();
    window.addEventListener("focus", focused);
    return () => { live.current = false; window.removeEventListener("focus", focused); agents.dispose(); };
  }, []);
  // A scene change moves focus to its heading; Tab then enters the controls (design '이동·취소·포커스 계약').
  useEffect(() => { requestAnimationFrame(() => heading.current?.focus()); }, [scene.generation]);
  const move = (event: SceneEvent) => setScene(current => nextScene(current, event, { auth, busy }));

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

  async function close(): Promise<void> {
    if (busy) return;
    setClosing(true);
    let result: StepResult;
    try { result = await window.doan.closeOnboarding({ session }); } catch (error) { result = { kind: "error", message: errorText(error) }; }
    if (!live.current) return;
    setClosing(false);
    if (result.kind === "success" || result.kind === "stale") onClose();
  }
  function adopt(root: string, cause: "open" | "add") { setRerooted(null); if (cause === "open") setRefused(null); setProject(root); }
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
  function restoreAddFocus() {
    requestAnimationFrame(() => {
      const previous = openFocus.current;
      if (previous?.isConnected && !previous.matches(":disabled")) previous.focus();
      else heading.current?.focus();
    });
  }

  // A stacked modal (the pick-one list, a confirmation, the stop or paste dialog) answers its own keys.
  const stacked = useRef(false);
  stacked.current = layer !== null || addScan !== null || addConfirms.length > 0 || agents.state.dialog !== null;
  const overlay = useRef<HTMLDialogElement | null>(null);
  // On the window, in capture: a button that turns disabled while it runs drops
  // focus to <body>, and keys from there must still reach the onboarding window. Capture
  // also runs before the canvas's own Escape (selection clear) listener.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("dialog") !== null && event.target.closest("dialog") !== overlay.current) return;
      // Top-level Escape neither closes onboarding nor skips a required step; nor may it reach the app behind.
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return; }
      if (stacked.current) return;
      if (event.key === "Tab" && overlay.current) {
        const nodes = Array.from(overlay.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(node => node.closest("dialog") === overlay.current);
        const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement as HTMLElement), event.shiftKey);
        if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, []);

  const welcome = scene.scene === "welcome";
  const setHeading = (node: HTMLElement | null) => { heading.current = node; };
  // A modal <dialog> sits above any app dialog already open (setup, comments),
  // which would otherwise stay on top and leave both unclickable.
  return <dialog className={welcome ? "ob-overlay ob-welcome" : "ob-overlay"} aria-label="Set up doan"
    ref={node => { overlay.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => event.preventDefault()}>
    <div className="ob-chrome">
      {!welcome && <SetupSteps scene={scene.scene} canProject={canAdvance(auth)} busy={busy} go={to => move({ type: "step", to })} />}
    </div>
    <div className="ob-scene native-scroll">
      {welcome && <div className="ob-welcome-scene" ref={node => setHeading(node?.querySelector("h1") ?? null)}><Welcome start={() => move({ type: "start" })} /></div>}
      {scene.scene === "agent" && <AgentStep session={agents} heading={setHeading}
        back={() => void agents.back().then(() => move({ type: "back" }))}
        next={() => void agents.continue().then(advanced => { if (advanced) move({ type: "continue" }); })} />}
      {scene.scene === "project" && <>
        <div className="ob-heading"><h2 tabIndex={-1} ref={setHeading}>Choose a project</h2></div>
        {addMessage && <p role="status">{addMessage}</p>}
        <div className="ob-card"><ProjectStep key={project ?? ""} project={project} entry={entry ?? null} rerooted={rerooted} refused={refused} setBusy={setProjectBusy} open={openProject}
          setUpDone={(result) => { if (result.kind === "rerooted") { setProject(result.root); setRerooted(result.message); } }} /></div>
        <div className="ob-footer">
          <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={() => move({ type: "back" })}><ArrowLeft aria-hidden="true" />Back</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" disabled={busy || !canComplete(auth, entry?.kind === "list" ? entry.path : null)} onClick={() => void close()}>Finish<ArrowRight aria-hidden="true" /></button>
        </div>
      </>}
    </div>
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
  return <dialog className="add-dialog doan-dialog" aria-label={view?.title ?? "Choose a repository"} aria-busy={busy} ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{view?.title ?? "Choose a repository"}</h3><p className="lead doan-dialog-description"><Parts parts={view?.lead ?? []} /></p></div></div>
    <div className="cl native-scroll" role="radiogroup" aria-label="Repositories">
      {view?.rows.map(row => <div className={`cl-item${row.sub ? " sub" : ""}${row.disabled ? " off" : ""}`} key={row.id}>
        <input type="radio" name={`pick-${scanId}`} aria-label={row.label} disabled={row.disabled || busy} checked={picked === row.id} onChange={() => setChoice(row.id)} />
        <PathTip text={row.name}><span className="cl-name">{row.name}{row.sub && <span className="kind">worktree</span>}</span></PathTip>
        {row.chip ? <span className={chipClass(row.chip.tone)}>{row.chip.text}</span> : <span />}
        <PathTip text={row.path}><span className="cl-path">{row.path}</span></PathTip>
      </div>)}
    </div>
    {error && <p role="alert" className="ob-msg error"><AlertIcon /><span>{error}</span></p>}
    <div className="add-foot doan-dialog-actions">{snapshot && !snapshot.done && <span className="scan" role="status"><span className="spinner doan-spinner" />{snapshot.finished} of {snapshot.total} checked</span>}<span className="spacer" />
      <button type="button" className="btn doan-button" data-ui-variant="subtle" autoFocus disabled={busy} onClick={cancel}>Cancel</button>
      <button type="button" className="btn primary doan-button" data-ui-variant="prominent" disabled={picked === null || busy} onClick={() => void submit()}>Choose</button></div>
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
          : <button type="button" className={view.open.primary ? "btn primary doan-button" : "btn doan-button"} data-ui-variant={view.open.primary ? "prominent" : "subtle"} data-ui-size="sm" disabled={view.open.disabled} onClick={() => void openProject()}>Open Project…</button>}
        {view.message && <span className="ob-msg">{view.message}</span>}
        {view.error && <span className="ob-msg error" role="alert"><AlertIcon /><span>{view.error}</span></span>}
      </div>
      {view.form && <>
        <ProjectFields form={{ ...setup.form, running }} choose={() => void setup.choose()} />
        <div className="ob-actions"><span className="spacer" /><button type="button" className="btn primary doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={view.form.setUp.disabled}
          onClick={() => void setup.setUp().then(result => { if (result) setUpDone(result); })}>{view.form.setUp.label}</button></div>
      </>}
    </div>
  </>;
}

