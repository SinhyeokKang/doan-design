import type { KeyboardEvent } from "react";
import type { FolderEntry } from "../main/view";
import { copyText } from "../comments/projection";
import { handoffCopied, quickSelect, type QuickKind } from "../comments/handoff";
import { groupProjects } from "./homeCards";
import { COPY_FAILED } from "./onboardingView";
import type { HandoffDialog } from "./CommentsSession";

// design/agent-handoff.html, frames dialog, dialog-states and copy-states.

export function staleText(n: number): string {
  return n === 1 ? "1 comment is no longer open and was removed from the list. Review and copy again."
    : `${n} comments are no longer open and were removed from the list. Review and copy again.`;
}

// The top bar's crumbs: project › ⎇ branch › canvas. Without a branch (a
// detached HEAD, no git) the folder name, as the worktree notice names the path.
export function handoffContext(entries: readonly FolderEntry[], root: string, title: string): string {
  const card = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : []))).find(card => card.rows.some(row => row.path === root));
  const entry = entries.find(entry => entry.path === root), folder = root.split("/").at(-1) ?? root;
  const branch = entry?.kind === "list" ? entry.git?.branch : undefined;
  return `${card?.name ?? folder} › ${branch ? `⎇ ${branch}` : folder} › ${title}`;
}

export interface HandOffDialogProps {
  dialog: HandoffDialog;
  context: string;
  notice: string | null;
  onToggle: (comment: string) => void;
  onQuick: (kind: QuickKind) => void;
  onCopy: () => void;
  onClose: () => void;
}
export function HandOffDialog({ dialog, context, notice, onToggle, onQuick, onCopy, onClose }: HandOffDialogProps) {
  let element: HTMLDialogElement | null = null;
  const { copy, rows, checked } = dialog, n = checked.length;
  const copying = copy.status === "copying", copied = copy.status === "copied", locked = copying || copied;
  const selection = quickSelect(rows, "selection", dialog.selection);
  const close = () => { element?.close(); onClose(); };
  // Copy N disables itself while main copies; focus moves to the dialog first,
  // or it would drop to <body> where this dialog's keys no longer arrive.
  const press = () => {
    if (copied) close();
    else if (n > 0 && !copying) { element?.focus(); onCopy(); }
  };
  const keyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (!composing) close();
      return;
    }
    // A focused button or summary answers Return itself.
    const tag = (event.target as HTMLElement).tagName;
    if (event.key !== "Enter" || composing || tag === "BUTTON" || tag === "SUMMARY") return;
    event.preventDefault(); press();
  };
  return <dialog className="comments-dialog handoff-dialog" aria-label="Hand off to your agent" aria-busy={copying} tabIndex={-1}
    ref={node => {
      element = node;
      if (!node || node.open) return;
      node.showModal();
      // A card's Hand off… checks a row that may sit below the fold.
      node.querySelector<HTMLElement>(".handoff-row input:checked")?.closest<HTMLElement>(".handoff-row")?.scrollIntoView({ block: "nearest" });
      // Copy is the default button, not the first control (All).
      node.querySelector<HTMLElement>(".handoff-actions .comments-btn.primary")?.focus();
    }}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={keyDown}>
    <h3>Hand off to your agent</h3>
    <p className="handoff-context">{context}</p>
    <div className="handoff-quick" role="group" aria-label="Quick select">
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onQuick("all")}>All</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onQuick("none")}>None</button>
      <button type="button" className="comments-btn" disabled={locked || "disabled" in selection} title={"disabled" in selection ? selection.disabled : undefined} onClick={() => onQuick("selection")}>Selection</button>
    </div>
    {rows.length > 0 && <div className="handoff-list native-scroll">
      {rows.map(row => <label key={row.comment.comment} className="handoff-row">
        <input type="checkbox" checked={checked.includes(row.comment.comment)} disabled={locked} onChange={() => onToggle(row.comment.comment)} />
        <span className="handoff-text"><span className="handoff-target" title={row.target.title}>{row.target.text}</span><span className="handoff-body" title={row.comment.body}>{row.first}</span></span>
      </label>)}
    </div>}
    {n > 0 && <details className="handoff-instruction"><summary>Show instruction</summary><div className="handoff-preview">{copyText(dialog.root, dialog.canvas, rows.map(row => row.comment), checked)}</div></details>}
    {notice && <p className="handoff-notice">{notice}</p>}
    {copy.status === "failed" && <p className="handoff-status error" role="alert">{COPY_FAILED}</p>}
    {copy.status === "stale" && <p className="handoff-status warning" role="alert">{staleText(copy.count)}</p>}
    {copy.status === "copied" && <p className="handoff-status ok" role="status">{handoffCopied(copy.count)}</p>}
    <div className="handoff-actions">
      {n === 0 && !locked ? <span className="comments-helper">Choose at least one comment.</span> : <span className="spacer" />}
      {!copied && <button type="button" className="comments-btn" disabled={copying} onClick={close}>Cancel</button>}
      {copied ? <button key="done" type="button" className="comments-btn primary" autoFocus onClick={close}>Done</button>
        : <button key="copy" type="button" className="comments-btn primary" disabled={copying || n === 0} onClick={press}>{copying ? "Copying…" : copy.status === "failed" ? "Retry copy" : `Copy ${n}`}</button>}
    </div>
  </dialog>;
}
