import { useEffect, useRef, type ReactNode } from "react";

export function SettingsDialog({ title, children, verb, answer }: { title: string; children: ReactNode; verb: string; answer: (allow: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  function reply(allow: boolean) { dialog.current?.close(); answer(allow); }
  return <dialog ref={dialog} className="ob-dialog doan-dialog" data-ui-size="compact" role="alertdialog" aria-label={title} onCancel={event => { event.preventDefault(); reply(false); }}>
    <h3 className="doan-dialog-title">{title}</h3>{children}<div className="ob-buttons doan-dialog-actions"><button className="btn doan-button" data-ui-variant="subtle" ref={cancel} onClick={() => reply(false)}>Cancel</button><button className="btn primary doan-button" data-ui-variant="prominent" onClick={() => reply(true)}>{verb}</button></div>
  </dialog>;
}
