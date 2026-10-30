import { useEffect, useRef, type ReactNode } from "react";

// A confirmation before a write (Fix…, Add to Serve). It opens modally with focus on Cancel, so automatic focus never
// lands on the action that writes. `description` gives the shared dialog header (buzz-settings draft); without it the
// old Settings window's layout stays until R1 removes that window.
export function SettingsDialog({ title, description, children, verb, answer }: { title: string; description?: ReactNode; children?: ReactNode; verb: string; answer: (allow: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  function reply(allow: boolean) { dialog.current?.close(); answer(allow); }
  return <dialog ref={dialog} className="ob-dialog doan-dialog" data-ui-size="compact" role="alertdialog" aria-label={title} onCancel={event => { event.preventDefault(); reply(false); }}>
    {description === undefined ? <h3 className="doan-dialog-title">{title}</h3>
      : <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{title}</h3><p className="doan-dialog-description">{description}</p></div></div>}
    {children}<div className="ob-buttons doan-dialog-actions"><button className="btn doan-button" data-ui-variant="subtle" ref={cancel} onClick={() => reply(false)}>Cancel</button><button className="btn primary doan-button" data-ui-variant="prominent" onClick={() => reply(true)}>{verb}</button></div>
  </dialog>;
}
