import { useEffect, useRef, useState } from "react";
import type { ProjectInitRequest } from "../main/index";
import type { ProjectInitResult } from "../main/shell";
import { formView, initMessage, type ProjectForm } from "./onboardingView";
import { AlertIcon } from "./AlertIcon";
import { withChips } from "./codeChips";
import { StorageField } from "./StorageChoice";
import type { StorageChoice } from "./storageRules";
import { NameTip } from "./NameTip";

// Main keeps the picked CSS file, the renderer its ID. kept: another worktree keeps Doan files out of Git, so setup uses plain
// init (PRODUCT §5 item 0 'Doan files'); a refused setup keeps the chosen mode. notGit: Keep out of Git creates a repository.
export function useProjectSetup(root: string, kept = false, notGit = false) {
  const [token, setToken] = useState<{ id: string; path: string } | null>(null);
  const [storage, setStorage] = useState<StorageChoice>("repo");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function choose() {
    try {
      const choice = await window.doan.chooseTokenCss(root);
      if (!live.current) return;
      if (choice.kind === "selected") { setToken({ id: choice.choiceId, path: choice.path }); setError(null); }
      else if (choice.kind === "unavailable") setError(choice.message);
    } catch (failure) { if (live.current) setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  async function setUp(): Promise<ProjectInitResult | null> {
    if (running) return null;
    setRunning(true); setError(null);
    let result: ProjectInitResult;
    try { result = await window.doan.initializeProject(setupRequest(root, token?.id ?? null, storage, kept, notGit)); }
    catch (failure) { result = { kind: "cliError", reason: failure instanceof Error ? failure.message : String(failure) }; }
    if (!live.current) return result;
    setRunning(false);
    if (result.kind !== "success" && result.kind !== "rerooted") setError(initMessage(result));
    return result;
  }
  const form: ProjectForm = { running, token: token?.path ?? null, error, rerooted: null };
  return { form, choose, setUp, storage: { value: storage, kept, notGit, change: setStorage } };
}

// What Set Up asks main for. gitInit is the consent to the .git/ line Will add showed: only with Keep out of Git, for a
// folder outside Git, and never for a project already kept out of Git (plain init follows it).
export function setupRequest(root: string, choiceId: string | null, storage: StorageChoice, kept: boolean, notGit: boolean): ProjectInitRequest {
  const local = !kept && storage === "local";
  return { root, choiceId, storage: local ? "local" : null, ...(local && notGit ? { gitInit: true as const } : {}) };
}

export interface StorageInput { value: StorageChoice; kept: boolean; notGit: boolean; change: (value: StorageChoice) => void }
// Set up project is described by Will add (CHANGES_ID), so a screen reader hears what it writes, the new repository first.
export const CHANGES_ID = "setup-changes";
export function ProjectFields({ root, form, choose, chooseRef, storage }: { root: string; form: ProjectForm; choose: () => void; chooseRef?: (node: HTMLButtonElement | null) => void; storage: StorageInput }) {
  const view = formView(form);
  // Kept out of Git, the exclude entry takes the place of the .gitattributes line; the label is fixed, not the path.
  const local = storage.kept || storage.value === "local";
  const creates = !storage.kept && storage.value === "local" && storage.notGit;
  return <>
    <div className="ob-field">
      <span className="ob-label">Token CSS</span>
      {view.token === null ? <span className="value none">None</span> : <NameTip text={view.token}><span className="value token-path selectable">{view.token}</span></NameTip>}
      <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={view.choose.disabled} ref={chooseRef} onClick={choose}>Choose…</button>
      {view.helper && <span className="ob-helper">{view.helper}</span>}
    </div>
    <StorageField id="setup-storage" value={storage.value} kept={storage.kept} disabled={form.running} change={storage.change} />
    <div className="ob-field">
      <span className="ob-label">Will add</span>
      <span className="ob-changes" id={CHANGES_ID}>{creates && <span><code>.git/</code> — a new Git repository</span>}<span><code>.doan/canvases/</code></span><span><code>.doan/config.json</code></span><span><code>{local ? ".git/info/exclude" : ".gitattributes"}</code> — {local ? "two lines" : "one line"}, if missing</span></span>
      <span />
    </div>
    {view.error && <div className="ob-field"><span className="ob-msg error ob-wide selectable" role="alert"><AlertIcon /><span>{withChips(view.error, [`${root}/.git`])}</span></span></div>}
  </>;
}

// notGit follows the folder's latest read: after a failed creation the folder is read again, and a .git left behind
// takes the .git/ line (and --git-init) away while the error stays.
export function ProjectSetupDialog({ root, name, kept = false, notGit = false, onClose, onRerooted }: { root: string; name: string; kept?: boolean; notGit?: boolean; onClose: () => void; onRerooted: (root: string, message: string) => void }) {
  const { form, choose, setUp, storage } = useProjectSetup(root, kept, notGit);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const close = () => { if (form.running) return; dialog.current?.close(); onClose(); };
  async function submit() {
    const result = await setUp();
    if (result?.kind === "success") { dialog.current?.close(); onClose(); }
    else if (result?.kind === "rerooted") { dialog.current?.close(); onRerooted(result.root, result.message); }
  }
  return <dialog className="ob-dialog setup-dialog doan-dialog doan-scroll" aria-label="Set up project" aria-busy={form.running}
    ref={node => { dialog.current = node; if (node && !node.open) { node.showModal(); chooseButton.current?.focus(); } }}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      // The canvas clears its selection on Escape; this one belongs to the dialog.
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing) close();
    }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">Set up {name}</h3><NameTip text={root}><p className="doan-dialog-description ob-project-path selectable">{root}</p></NameTip></div></div>
    <div className="ob-card">
      <ProjectFields root={root} form={form} choose={() => void choose()} chooseRef={node => { chooseButton.current = node; }} storage={storage} />
    </div>
    <div className="ob-buttons doan-dialog-actions">
      {/* aria-disabled, not disabled, while it runs: the pressed button keeps focus, so a failure leaves it there. */}
      <button type="button" className="doan-button" data-ui-variant="subtle" aria-disabled={form.running || undefined} data-disabled={form.running ? "" : undefined} onClick={close}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-describedby={CHANGES_ID} aria-disabled={form.running || undefined} aria-busy={form.running || undefined}
        onClick={() => { if (!form.running) void submit(); }}>{form.running && <span className="doan-spinner" aria-hidden="true" />}{form.running ? "Setting up" : "Set up project"}</button>
    </div>
  </dialog>;
}
