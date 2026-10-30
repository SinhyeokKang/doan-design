import { useEffect, useRef, useState } from "react";
import type { ScanSnapshot } from "../main/addProjects";
import { displayPath } from "./projectDisplay";
import { PathTip } from "./Home";
import { AlertIcon } from "./AlertIcon";

export function AddProjectsDialog({ scanId, close, added, homeDirectory }: { homeDirectory: string | null; scanId: string; close: () => void; added: (paths: string[]) => void }) {
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);
  const [choices, setChoices] = useState(new Map<string, boolean>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Disabling submit can leave focus on body; preserve deliberate focus inside the dialog.
  useEffect(() => {
    if (error && !busy && dialog.current?.open && document.activeElement === document.body) cancelButton.current?.focus();
  }, [error, busy]);
  useEffect(() => window.doan.watchScan(scanId, setSnapshot), [scanId]);
  const selected = snapshot?.items.flatMap(item => [...(!item.disabled && (choices.get(item.id) ?? item.checked) ? [item.id] : []), ...item.worktrees.filter(tree => choices.get(tree.id) ?? tree.checked).map(tree => tree.id)]) ?? [];
  const choose = (id: string, value: boolean) => setChoices(previous => new Map(previous).set(id, value));
  const cancel = () => { if (busy) return; void window.doan.cancelScan(scanId).catch(console.error); dialog.current?.close(); close(); };
  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await window.doan.addCandidates(scanId, selected);
      if (result.kind === "added") { dialog.current?.close(); added(result.added); close(); }
      else setError("This checklist is no longer available. Add the folder again.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  const source = snapshot?.sources.length === 1 ? snapshot.sources[0] : undefined;
  const title = source ? `Add projects from ${source.name}` : "Add projects";
  const worktreesOnly = snapshot?.items.length === 1 && snapshot.items[0]?.status === "added" && snapshot.items[0].worktrees.length > 0;
  return <dialog className="add-dialog doan-dialog" aria-label="Add projects" aria-busy={busy} ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{worktreesOnly ? `Add other worktrees of ${snapshot.items[0]?.name}?` : title}</h3>
    <p className="lead doan-dialog-description">{worktreesOnly ? `${snapshot.items[0]?.name} is added. These worktrees of the same repository aren't in Doan yet.` : source ? <><code>{displayPath(source.path, homeDirectory)}</code> isn't a repository. Choose the repositories inside it to add.</> : "Choose the repositories inside the folders to add."}</p></div></div>
    <div className="cl native-scroll" role="group" aria-label={worktreesOnly ? "Worktrees" : "Repositories"}>
      {snapshot?.items.map(item => <div key={item.id}>
        {!worktreesOnly && <div className={`cl-item${item.disabled ? " off" : ""}`}><input type="checkbox" className="doan-checkbox" aria-label={item.name} disabled={item.disabled || busy} checked={choices.get(item.id) ?? item.checked} onChange={event => choose(item.id, event.target.checked)} /><PathTip text={item.name}><span className="cl-name">{item.name}</span></PathTip><span className={`ob-chip${item.status === "ready" ? " ok" : item.status === "unreadable" ? " warn" : ""}`}>{({ ready: `${item.canvasCount ?? 0} ${item.canvasCount === 1 ? "canvas" : "canvases"}`, notSetUp: "Not set up", added: "Already added", unreadable: "Couldn't read", checking: "Checking…" })[item.status]}</span><PathTip text={item.path}><span className="cl-path">{displayPath(item.path, homeDirectory)}</span></PathTip></div>}
        {item.worktrees.map(tree => <div className={`cl-item${worktreesOnly ? "" : " sub"}`} key={tree.id}><input type="checkbox" className="doan-checkbox" aria-label={`${tree.name} worktree`} disabled={busy} checked={choices.get(tree.id) ?? tree.checked} onChange={event => choose(tree.id, event.target.checked)} /><PathTip text={tree.name}><span className="cl-name">{tree.name}<span className="kind">worktree</span></span></PathTip><span /><PathTip text={tree.path}><span className="cl-path">{displayPath(tree.path, homeDirectory)}</span></PathTip></div>)}
      </div>)}
    </div>
    {error && <p role="alert" className="ob-msg error"><AlertIcon /><span>{error}</span></p>}
    <div className="add-foot doan-dialog-actions">{!snapshot?.done ? <span className="scan" role="status"><span className="spinner doan-spinner" />{snapshot?.finished ?? 0} of {snapshot?.total ?? 0} checked</span> : <span className="meta">{selected.length} selected</span>}<span className="spacer" /><button className="btn doan-button" data-ui-variant="subtle" ref={cancelButton} autoFocus disabled={busy} onClick={cancel}>{worktreesOnly ? "Not Now" : "Cancel"}</button><button className="btn primary doan-button" data-ui-variant="prominent" disabled={!snapshot?.done || !selected.length || busy} onClick={() => void submit()}>{worktreesOnly ? "Add Worktrees" : selected.length ? `Add ${selected.length} Project${selected.length === 1 ? "" : "s"}` : "Add Projects"}</button></div>
  </dialog>;
}

export function SetUpFolderConfirm({ name, path, confirm, cancel }: { name: string; path: string; confirm: () => Promise<void>; cancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  // The submitting button became disabled, so a rejected request may leave focus on body.
  useEffect(() => { if (error && !busy) retry.current?.focus(); }, [error, busy]);
  const close = () => { if (!busy) { dialog.current?.close(); cancel(); } };
  return <dialog className="ob-dialog doan-dialog" data-ui-size="compact" aria-label={`Set up ${name} as a Doan project?`} ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">Set up {name} as a Doan project?</h3><p className="doan-dialog-description"><code>{path}</code> isn't a repository. Doan will add it as a project that is not set up yet, then open the setup form.</p></div></div>{error && <p role="alert" className="ob-msg error"><AlertIcon /><span>{error}</span></p>}<div className="ob-buttons doan-dialog-actions"><button className="btn doan-button" data-ui-variant="subtle" autoFocus disabled={busy} onClick={close}>Cancel</button><button className="btn primary doan-button" data-ui-variant="prominent" ref={retry} disabled={busy} onClick={() => { setBusy(true); void confirm().catch(failure => { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false); }); }}>Set Up…</button></div>
  </dialog>;
}
