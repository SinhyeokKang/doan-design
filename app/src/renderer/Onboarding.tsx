import { Fragment, useEffect, useRef, useState } from "react";
import type { MachineState, StepRequest, StepResult } from "../main/onboarding/machine";
import type { Agent } from "../main/onboarding/states";
import type { FolderFocus, ProjectInitResult } from "../main/shell";
import type { FolderEntry } from "../main/view";
import {
  advanceAfter, agentsView, cliItems, confirmView, copyFor, copyLabel, COPY_FAILED, footerView, idleUi, indicatorView, nextFocusIndex, projectStepView, promptParts, stepsDone, wizardBusy,
  type ConfirmView, type CopyState, type FooterView, type IndicatorStep, type ItemView, type MachineUi, type Part, type Row, type RowOutcome,
} from "./onboardingView";
import { ProjectFields, useProjectSetup } from "./ProjectSetupDialog";

export type Reroot = FolderFocus & { seq: number };

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function Parts({ parts }: { parts: readonly Part[] }) {
  return <>{parts.map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <code key={index}>{part.code}</code>)}</>;
}

export function Item({ item, act, head = false }: { item: ItemView; act: (id: NonNullable<ItemView["button"]>["id"]) => void; head?: boolean }) {
  const button = item.button;
  const className = head ? "ob-agent" : item.sub ? "ob-item sub" : "ob-item";
  return <>
    <div className={item.dimmed ? `${className} dimmed` : className}>
      <span className="ob-label">{item.label}</span>
      <span className="ob-detail">{item.detailChip && <span className={chipClass(item.detailChip.tone)}>{item.detailChip.text}</span>}<Parts parts={item.detail} /></span>
      <span className="ob-status">
        {item.chip && <span className={chipClass(item.chip.tone)}>{item.chip.text}</span>}
        {button && <button type="button" className={button.primary ? "btn primary" : "btn"} disabled={button.disabled} onClick={() => act(button.id)}>{button.label}</button>}
      </span>
      {item.copyLine && <span className="ob-copyline"><output>{item.copyLine.text}</output><button type="button" className="btn" disabled={item.copyLine.button.disabled} onClick={() => act("copyPath")}>{item.copyLine.button.label}</button></span>}
      {item.msg && <span className={`ob-msg ${item.msg.tone}`} role={item.msg.tone === "error" ? "alert" : undefined}><Parts parts={item.msg.parts} /></span>}
      {item.reason && !item.dimmed && <span className="ob-reason">{item.reason}</span>}
    </div>
    {/* A dimmed item keeps its notice readable in a row of its own (draft wizard-agents). */}
    {item.reason && item.dimmed && <div className="ob-item sub ob-notice"><span /><span className="ob-reason">{item.reason}</span></div>}
  </>;
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
const nameOf = (path: string) => path.split("/").filter(Boolean).at(-1) ?? path;

// The full-window "Set Up doan" wizard. Mounted once per main wizard session.
export function Wizard({ session, entries, reroot, onClose }: { session: string; entries: FolderEntry[]; reroot: Reroot | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [ui, setUi] = useState<MachineUi>(() => ({ ...idleUi(), checking: true }));
  const [confirm, setConfirm] = useState<{ id: string; target: "cli" | "stub" | "claudeLink" | "mcp"; row: Row } | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [rerooted, setRerooted] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [promptCopy, setPromptCopy] = useState<CopyState>("idle");
  const [promptCopied, setPromptCopied] = useState(false);
  const title = useRef<HTMLSpanElement>(null);
  const reads = useRef(0);
  const live = useRef(true);
  // Set when a project was just opened or set up: move on once main lists it.
  const [advance, setAdvance] = useState<"open" | "setup" | null>(null);
  const entry = project === null ? undefined : entries.find(candidate => candidate.path === project);

  async function read() {
    const requestId = `${session}:${++reads.current}`;
    setUi(current => ({ ...current, checking: true, readError: null }));
    try {
      const reply = await window.doan.readOnboarding({ session, requestId });
      if (!live.current || requestId !== `${session}:${reads.current}`) return;
      if (reply.kind === "state" && reply.state.requestId === requestId) setMachine(reply.state);
      setUi(current => ({ ...current, checking: false }));
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
    const next = advanceAfter(advance, entry.kind);
    if (next === "wait") return;
    setAdvance(null);
    if (next === "advance") setStep(3);
  }, [advance, entry?.kind, project]);
  useEffect(() => {
    if (reroot && project === reroot.from) { setProject(reroot.root); setRerooted(`This folder is inside ${reroot.root}, which is already set up.`); }
  }, [reroot?.seq]);

  async function settle(row: Row, request: Promise<StepResult>) {
    let result: StepResult;
    try { result = await request; } catch (error) { result = { kind: "error", message: errorText(error) }; }
    if (!live.current) return;
    if (result.kind === "confirm") { setConfirm({ id: result.id, target: result.target, row }); return; }
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

  const busy = wizardBusy({ running: ui.running, confirming: confirm !== null, projectBusy, closing, pathCopy: ui.pathCopy, promptCopy });
  async function close() {
    if (busy) return;
    setClosing(true);
    let result: StepResult;
    try { result = await window.doan.closeOnboarding({ session }); } catch (error) { result = { kind: "error", message: errorText(error) }; }
    if (!live.current) return;
    setClosing(false);
    // A warning means onboarding.json was not saved; the wizard still closes for this run.
    if (result.kind === "success" || result.kind === "stale") onClose();
  }

  const closeLatest = useRef(close);
  closeLatest.current = close;
  const overlay = useRef<HTMLDialogElement | null>(null);
  // On the window, in capture: a button that turns disabled while it runs drops
  // focus to <body>, and keys from there must still reach the wizard. Capture
  // also runs before the canvas's own Escape (selection clear) listener.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      // A confirmation dialog answers its own keys.
      if (event.target instanceof Element && event.target.closest("dialog") !== null && event.target.closest("dialog") !== overlay.current) return;
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
  const act = (id: NonNullable<ItemView["button"]>["id"], row: Row) => {
    if (id === "copyPath") void copyPath();
    else run(row);
  };
  const checkAgain = () => { setUi(current => ({ ...current, outcome: {} })); void read(); };
  const confirmed = confirm && machine ? confirmView(confirm.target, confirm.row === "cli" ? "claude" : confirm.row, machine) : null;

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
      {step === 0 && <>
        <h2>Install the doan command</h2>
        <p className="ob-lead">Your terminal and your agents run doan through a link in <code>~/.local/bin</code>. The link points to the copy inside this app.</p>
        <div className="ob-card">{cliItems(machine, ui).map(item => <Item key={item.key} item={item} act={id => act(id, "cli")} />)}</div>
      </>}
      {step === 1 && <AgentsStep machine={machine} ui={ui} act={(id, row) => act(id, row)} />}
      {step === 2 && <ProjectStep key={project ?? ""} project={project} entry={entry ?? null} rerooted={rerooted} setBusy={setProjectBusy}
        open={async () => {
          let root: string | null = null;
          try { root = await window.doan.openFolder(); } catch { /* The sheet reports its own failures. */ }
          if (!live.current || root === null) return;
          setAdvance("open"); setRerooted(null); setProject(root);
        }}
        setUpDone={(result) => {
          if (result.kind === "success") setAdvance("setup");
          else if (result.kind === "rerooted") { setProject(result.root); setRerooted(result.message); }
        }} />}
      {step === 3 && <PromptStep project={entry?.kind === "list" ? entry.path : null} copy={promptCopy} setCopy={setPromptCopy} copied={() => setPromptCopied(true)} />}
    </div></div>
    <WizardFooter view={footerView(step, !!done[step], busy, ui.checking)} checkAgain={checkAgain} skip={() => go(step + 1)} next={() => { if (step === 3) void close(); else go(step + 1); }} />
    {confirmed && <ConfirmDialog view={confirmed} answer={answer} />}
  </dialog>;
}

function AgentsStep({ machine, ui, act }: { machine: MachineState | null; ui: MachineUi; act: (id: NonNullable<ItemView["button"]>["id"], row: Agent) => void }) {
  const view = agentsView(machine, ui);
  return <>
    <h2>Connect your agents</h2>
    <p className="ob-lead">Connect installs the doan skill and registers the doan MCP server for that agent. Nothing changes until you choose Connect.</p>
    <div className="ob-card"><Item item={view.skill} act={() => {}} /></div>
    {view.agents.map(card => <div className="ob-card" key={card.agent}>
      <Item item={card.head} head act={id => act(id, card.agent)} />
      {card.items.map(item => <Item key={item.key} item={item} act={id => act(id, card.agent)} />)}
    </div>)}
  </>;
}

function ProjectStep({ project, entry, rerooted, setBusy, open, setUpDone }: {
  project: string | null; entry: FolderEntry | null; rerooted: string | null; setBusy: (busy: boolean) => void;
  open: () => Promise<void>; setUpDone: (result: ProjectInitResult) => void;
}) {
  const setup = useProjectSetup(project ?? "");
  const [opening, setOpening] = useState(false);
  const running = setup.form.running || opening;
  useEffect(() => { setBusy(running); return () => setBusy(false); }, [running]);
  const view = projectStepView(entry ?? (project ? { path: project, kind: "loading" } : null), { ...setup.form, running, rerooted });
  const openProject = async () => { setOpening(true); try { await open(); } finally { setOpening(false); } };
  return <>
    <h2>Set up a project</h2>
    <p className="ob-lead">Choose a repository. doan adds <code>design/</code> for canvases and <code>.doan/</code> for its settings.</p>
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

// The copy state lives in the Wizard so a pending copy keeps the wizard busy.
function PromptStep({ project, copy, setCopy, copied }: { project: string | null; copy: CopyState; setCopy: (copy: CopyState) => void; copied: () => void }) {
  // undefined while main is asked; null when it has no sentence for this project.
  const [sentence, setSentence] = useState<string | null | undefined>(undefined);
  // The project a pending copy belongs to; null once this step unmounts.
  const target = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    target.current = project;
    setSentence(undefined); setCopy("idle");
    if (project) void window.doan.firstPrompt(project).then(text => { if (live) setSentence(text); }, () => { if (live) setSentence(null); });
    return () => { live = false; target.current = null; };
  }, [project]);
  async function copyPrompt() {
    if (!project) return;
    setCopy("copying");
    const result = await copyFor(project, () => target.current, () => window.doan.copyFirstPrompt(project));
    if (result === null) return;
    setCopy(result);
    if (result === "copied") copied();
  }
  return <>
    <h2>Send your first prompt</h2>
    <p className="ob-lead">Paste this into a new Claude Code or Codex session to make the first canvas{project ? ` in ${nameOf(project)}` : ""}.</p>
    <div className="ob-card"><div className="ob-prompt">
      {project === null || sentence === null ? <p className="ob-reason">Open a project first.</p> : sentence !== undefined && <>
        <p className="ob-sentence">{promptParts(sentence).map((part, index) => part.mark ? <mark key={index}>{part.text}</mark> : <Fragment key={index}>{part.text}</Fragment>)}</p>
        {copy === "failed" && <p className="ob-msg error" role="alert">{COPY_FAILED}</p>}
        <div className="ob-actions"><span className="ob-helper">Replace &lt;what you want to design&gt; before sending.</span>
          <button type="button" className="btn primary" disabled={copy === "copying"} onClick={() => void copyPrompt()}>{copyLabel(copy)}</button></div>
      </>}
    </div></div>
  </>;
}
