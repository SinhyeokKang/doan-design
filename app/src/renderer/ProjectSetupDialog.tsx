import { useEffect, useRef, useState } from "react";
import type { ProjectInitResult } from "../main/shell";
import { formView, initMessage, type ProjectForm } from "./onboardingView";
import { AlertIcon } from "./AlertIcon";

// One project setup form, used by the wizard's Project step and the sidebar's
// Set Up… dialog. Main keeps the picked CSS file; the renderer holds only its ID.
export function useProjectSetup(root: string) {
  const [token, setToken] = useState<{ id: string; path: string } | null>(null);
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
    try { result = await window.doan.initializeProject({ root, choiceId: token?.id ?? null }); }
    catch (failure) { result = { kind: "cliError", reason: failure instanceof Error ? failure.message : String(failure) }; }
    if (!live.current) return result;
    setRunning(false);
    if (result.kind !== "success" && result.kind !== "rerooted") setError(initMessage(result));
    return result;
  }
  const form: ProjectForm = { running, token: token?.path ?? null, error, rerooted: null };
  return { form, choose, setUp };
}

export function ProjectFields({ form, choose, chooseRef }: { form: ProjectForm; choose: () => void; chooseRef?: (node: HTMLButtonElement | null) => void }) {
  const view = formView(form);
  return <>
    <div className="ob-field">
      <span className="ob-label">Token CSS</span>
      <span className={view.token === null ? "value none" : "value token-path"} title={view.token ?? undefined}>{view.token ?? "None"}</span>
      <button type="button" className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={view.choose.disabled} ref={chooseRef} onClick={choose}>Choose…</button>
      {view.helper && <span className="ob-helper">{view.helper}</span>}
    </div>
    <div className="ob-field">
      <span className="ob-label">Will add</span>
      <span className="ob-changes"><span><code>.doan/canvases/</code></span><span><code>.doan/config.json</code></span><span><code>.gitattributes</code> — missing Doan lines</span></span>
      <span />
    </div>
    {view.error && <div className="ob-field"><span className="ob-msg error ob-wide" role="alert"><AlertIcon /><span>{view.error}</span></span></div>}
  </>;
}

export function ProjectSetupDialog({ root, name, onClose, onRerooted }: { root: string; name: string; onClose: () => void; onRerooted: (root: string, message: string) => void }) {
  const { form, choose, setUp } = useProjectSetup(root);
  const chooseButton = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const close = () => { if (form.running) return; dialog.current?.close(); onClose(); };
  async function submit() {
    const result = await setUp();
    if (result?.kind === "success") { dialog.current?.close(); onClose(); }
    else if (result?.kind === "rerooted") { dialog.current?.close(); onRerooted(result.root, result.message); }
  }
  return <dialog className="ob-dialog setup-dialog doan-dialog" aria-label="Set Up Project" aria-busy={form.running}
    ref={node => { dialog.current = node; if (node && !node.open) { node.showModal(); chooseButton.current?.focus(); } }}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      // The canvas clears its selection on Escape; this one belongs to the dialog.
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing) close();
    }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">Set up {name}</h3><p className="doan-dialog-description ob-project-path" title={root}>{root}</p></div></div>
    <div className="ob-card">
      <ProjectFields form={form} choose={() => void choose()} chooseRef={node => { chooseButton.current = node; }} />
    </div>
    <div className="ob-buttons doan-dialog-actions">
      <button type="button" className="btn doan-button" data-ui-variant="subtle" disabled={form.running} onClick={close}>Cancel</button>
      <button type="button" className="btn primary doan-button" data-ui-variant="prominent" disabled={form.running} onClick={() => void submit()}>{form.running ? "Setting Up…" : "Set Up Project"}</button>
    </div>
  </dialog>;
}
