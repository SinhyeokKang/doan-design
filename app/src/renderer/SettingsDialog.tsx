import { useEffect, useRef, type ReactNode } from "react";

export function SettingsDialog({ title, children, verb, answer }: { title: string; children: ReactNode; verb: string; answer: (allow: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  function reply(allow: boolean) { dialog.current?.close(); answer(allow); }
  return <dialog ref={dialog} className="ob-dialog" role="alertdialog" aria-label={title} onCancel={event => { event.preventDefault(); reply(false); }}>
    <h3>{title}</h3>{children}<div className="ob-buttons"><button className="btn" ref={cancel} onClick={() => reply(false)}>Cancel</button><button className="btn primary" onClick={() => reply(true)}>{verb}</button></div>
  </dialog>;
}
