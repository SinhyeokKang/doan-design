import type { ReplaceDraftConfirm } from "./homeConversations";

// The docked composers' "Replace your draft?" before Edit and resend, drawn as Home's own confirmation. Esc is Keep
// Draft, so both put focus back in the field (`onKeep`).
export function ReplaceDraftDialog({ confirm, onKeep, onReplace }: { confirm: ReplaceDraftConfirm; onKeep(): void; onReplace(): void }) {
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" aria-label={confirm.title} ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); onKeep(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{confirm.title}</h3><p className="doan-dialog-description">{confirm.body}</p></div></div>
    <div className="doan-dialog-actions"><button type="button" className="doan-button" data-ui-variant="subtle" autoFocus onClick={onKeep}>{confirm.cancel}</button><button type="button" className="doan-button" data-ui-variant="prominent" onClick={onReplace}>{confirm.confirm}</button></div>
  </dialog>;
}
