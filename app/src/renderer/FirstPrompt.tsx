import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { firstPromptReducer, type FirstPromptEvent, type FirstPromptState } from "../firstPrompt/firstPrompt";
import type { CanvasRow, FolderEntry } from "../main/view";
import { arrivalAction, HELPER_LINES, newCanvasText, promptCopyLabel, sentenceParts, SUBJECT_LABEL, SUBJECT_PLACEHOLDER, subjectView, WAITING_TEXT, waitEvent } from "./firstPromptView";
import { unavailableCanvasMessage } from "./quickOpen";
import { COPY_FAILED, type CopyState } from "./onboardingView";
import { AlertIcon } from "./AlertIcon";

// The one first-prompt wait of this app run (renderer memory: a relaunch
// forgets it). App owns it because an arrival is shown wherever the user is.
export interface FirstPromptWait {
  state: FirstPromptState;
  // The clipboard holds the sentence for `root`: start waiting from the canvases listed now.
  copied: (root: string) => void;
  // Opens the arrived canvas (the wizard's Canvas ready Open) and ends the wait.
  open: () => void;
}
export const FirstPromptContext = createContext<FirstPromptWait>({ state: { kind: "idle" }, copied: () => {}, open: () => {} });

interface WaitDeps {
  entries: readonly FolderEntry[];
  wizardOpen: boolean;
  // The root of the workspace on screen; null on Home.
  workspaceRoot: string | null;
  toast: (message: string, label?: string, run?: () => void) => void;
  projectName: (root: string) => string;
  openCanvas: (root: string, row: CanvasRow, explicit: boolean) => void;
}

export function useFirstPromptWait(deps: WaitDeps): FirstPromptWait {
  const [state, setState] = useState<FirstPromptState>({ kind: "idle" });
  const dispatch = (event: FirstPromptEvent) => setState(current => firstPromptReducer(current, event));
  const latest = useRef({ deps, state });
  latest.current = { deps, state };
  const arrivedRow = (root: string, path: string) => {
    const entry = latest.current.deps.entries.find(candidate => candidate.path === root);
    return entry?.kind === "list" ? entry.canvases.find(candidate => candidate.path === path) : undefined;
  };
  const openArrived = (root: string, path: string, explicit = false) => {
    const row = arrivedRow(root, path);
    if (row) latest.current.deps.openCanvas(root, row, explicit);
    else if (explicit) latest.current.deps.toast(unavailableCanvasMessage(latest.current.deps.entries.find(entry => entry.path === root), path));
  };
  const showToast = (root: string, path: string) => latest.current.deps.toast(newCanvasText(latest.current.deps.projectName(root)), "Open", () => openArrived(root, path, true));
  // From main: document.hidden stays false while the window is hidden.
  const visible = useRef(true);
  // An arrival while hidden: its toast shows once the window is back.
  const pending = useRef<{ root: string; path: string } | null>(null);
  useEffect(() => window.doan.onWindowVisible(value => {
    visible.current = value;
    const held = pending.current;
    // Open would find no row for a project or canvas removed while hidden.
    if (value && held) { pending.current = null; if (arrivedRow(held.root, held.path)) showToast(held.root, held.path); }
  }), []);
  useEffect(() => {
    if (pending.current && !deps.entries.some(entry => entry.path === pending.current?.root)) pending.current = null;
  }, [deps.entries]);
  useEffect(() => {
    const event = waitEvent(state, deps.entries);
    if (event) dispatch(event);
  }, [state, deps.entries]);
  useEffect(() => {
    if (state.kind !== "arrived") return;
    const action = arrivalAction({ wizardOpen: deps.wizardOpen, hidden: !visible.current, workspaceRoot: deps.workspaceRoot }, state.root);
    if (action === "wizard") return;
    const { root, path } = state;
    dispatch({ type: "dismissed" });
    if (action === "open") openArrived(root, path);
    else if (visible.current) showToast(root, path);
    else pending.current = { root, path };
  }, [state, deps.wizardOpen]);
  return useMemo(() => ({
    state,
    copied(root: string) {
      const entry = latest.current.deps.entries.find(candidate => candidate.path === root);
      dispatch({ type: "copied", root, knownPaths: entry?.kind === "list" ? entry.canvases.map(row => row.path) : [] });
    },
    open() {
      const current = latest.current.state;
      if (current.kind !== "arrived") return;
      dispatch({ type: "dismissed" });
      openArrived(current.root, current.path, true);
    },
  }), [state]);
}

export interface FirstPromptViewProps {
  id: string;
  root: string;
  subject: string;
  // Main's sentence for `subject`; null while there is none to show.
  sentence: string | null;
  copy: CopyState;
  // The trimmed subject of the last successful copy.
  copiedSubject: string | null;
  waiting: boolean;
  // Takes the place of the actions (the wizard's Canvas ready).
  ready?: ReactNode;
  change: (subject: string) => void;
  copyIt: () => void;
}

export function FirstPromptView({ id, root, subject, sentence, copy, copiedSubject, waiting, ready, change, copyIt }: FirstPromptViewProps) {
  const view = subjectView(subject);
  const parts = sentenceParts(root, view.copyable ? sentence : null);
  const edited = copiedSubject !== null && subject.trim() !== copiedSubject;
  return <div className="ob-prompt">
    <div className="fp-field">
      <div className="fp-labelrow"><label className="fp-label" htmlFor={id}>{SUBJECT_LABEL}</label>{view.count && <span className="fp-count err">{view.count}</span>}</div>
      <input className={view.error ? "fp-input invalid" : "fp-input"} id={id} type="text" placeholder={SUBJECT_PLACEHOLDER} aria-invalid={view.error ? true : undefined} value={subject} onChange={event => change(event.target.value)} />
    </div>
    {view.error ? <p className="fp-error" role="alert"><AlertIcon /><span>{view.error}</span></p>
      : <p className="ob-sentence">{parts.before}{parts.mark && <mark className={parts.slot ? "slot" : undefined}>{parts.mark}</mark>}{parts.after}</p>}
    {copy === "failed" && <p className="ob-msg error" role="alert"><AlertIcon /><span>{COPY_FAILED}</span></p>}
    {ready ?? <div className="ob-actions">
      {waiting ? <><span className="fp-wait" role="status"><span className="spinner doan-spinner" aria-hidden="true" />{WAITING_TEXT}</span><span className="spacer" /></>
        : <span className="ob-helper">{HELPER_LINES[0]}<br />{HELPER_LINES[1]}</span>}
      <button type="button" className="btn primary doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={!view.copyable || copy === "copying"} onClick={copyIt}>{promptCopyLabel(copy, edited)}</button>
    </div>}
  </div>;
}

// Wizard step 4 and the zero-canvas workspace (spec decision 11). The subject
// leaves the app only through the clipboard; main builds the preview and the
// copied sentence with the same function.
export function FirstPrompt({ root, ready, onBusy, onCopied }: { root: string; ready?: ReactNode; onBusy?: (busy: boolean) => void; onCopied?: () => void }) {
  const wait = useContext(FirstPromptContext);
  const id = useId();
  const [subject, setSubject] = useState("");
  const [sentence, setSentence] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [copiedSubject, setCopiedSubject] = useState<string | null>(null);
  const asked = useRef(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const request = ++asked.current;
    if (!subjectView(subject).copyable) { setSentence(null); return; }
    void window.doan.firstPrompt(root, subject).then(text => { if (asked.current === request) setSentence(text); }, () => { if (asked.current === request) setSentence(null); });
  }, [root, subject]);
  useEffect(() => { onBusy?.(copy === "copying"); }, [copy]);
  useEffect(() => () => onBusy?.(false), []);
  async function copyIt() {
    const text = subject;
    if (!subjectView(text).copyable || copy === "copying") return;
    setCopy("copying");
    let ok = false;
    try { ok = (await window.doan.copyFirstPrompt(root, text)).kind === "success"; } catch { /* Shown as Retry copy. */ }
    // The clipboard holds the sentence even if this view went away meanwhile.
    if (ok) { wait.copied(root); onCopied?.(); }
    if (!live.current) return;
    if (ok) setCopiedSubject(text.trim());
    setCopy(ok ? "copied" : "failed");
  }
  const waiting = wait.state.kind === "waiting" && wait.state.root === root;
  return <FirstPromptView id={id} root={root} subject={subject} sentence={sentence} copy={copy} copiedSubject={copiedSubject} waiting={waiting} ready={ready} change={setSubject} copyIt={() => void copyIt()} />;
}
