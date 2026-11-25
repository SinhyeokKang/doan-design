import type { ReplaceDraftConfirm } from "./homeConversations";

// An alertdialog, the role focus guards find a confirmation by (POSTMORTEM 2026-10-30). Ids are fixed: one docked composer
// shows it at a time. Esc is Keep draft, so both put focus back in the field (`onKeep`).
export function ReplaceDraftDialog({ confirm, onKeep, onReplace }: { confirm: ReplaceDraftConfirm; onKeep(): void; onReplace(): void }) {
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="replace-draft-title" aria-describedby="replace-draft-body" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); onKeep(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="replace-draft-title">{confirm.title}</h3><p className="doan-dialog-description" id="replace-draft-body">{confirm.body}</p></div></div>
    <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" autoFocus onClick={onKeep}>{confirm.cancel}</button><button type="button" className="doan-button" data-ui-variant="prominent" onClick={onReplace}>{confirm.confirm}</button></div>
  </dialog>;
}
