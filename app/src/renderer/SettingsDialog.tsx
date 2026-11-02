import { useEffect, useRef, type ReactNode } from "react";

// A confirmation before a write (Share on the Project Settings page). It opens modally with focus on Cancel, so automatic
// focus never lands on the action that writes. A title with markup (a path as code) names the dialog through `label`.
export function SettingsDialog({ title, label, description, children, verb, answer }: { title: ReactNode; label?: string; description: ReactNode; children?: ReactNode; verb: string; answer: (allow: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  function reply(allow: boolean) { dialog.current?.close(); answer(allow); }
  return <dialog ref={dialog} className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-label={label ?? (typeof title === "string" ? title : undefined)} onCancel={event => { event.preventDefault(); reply(false); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{title}</h3><p className="doan-dialog-description">{description}</p></div></div>
    {children}<div className="doan-dialog-actions"><button className="doan-button" data-ui-variant="subtle" ref={cancel} onClick={() => reply(false)}>Cancel</button><button className="doan-button" data-ui-variant="prominent" onClick={() => reply(true)}>{verb}</button></div>
  </dialog>;
}
