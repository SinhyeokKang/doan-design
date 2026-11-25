import { useEffect, useId, useRef, type ReactNode } from "react";

// The confirmation opens with focus on Cancel, so automatic focus never lands on the action that writes. `pending`: while the owner's write is
// out the verb spins and Cancel, Escape and the verb stay focusable but do nothing; the owner unmounts it once answered.
export function SettingsDialog({ title, label, description, children, verb, pending, answer }: { title: ReactNode; label?: string; description: ReactNode; children?: ReactNode; verb: string; pending?: boolean; answer: (allow: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const describedBy = useId();
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  function reply(allow: boolean) {
    if (pending) return;
    if (!allow || pending === undefined) dialog.current?.close();
    answer(allow);
  }
  return <dialog ref={dialog} className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-label={label ?? (typeof title === "string" ? title : undefined)} aria-describedby={describedBy} onCancel={event => { event.preventDefault(); reply(false); }}
    // Chromium closes a modal dialog on a repeated Escape even when its cancel is prevented; handling the keydown keeps
    // a busy alert open (as ConversationDeleteDialog does).
    onKeyDown={event => { if (event.key !== "Escape" || event.nativeEvent.isComposing) return; event.preventDefault(); reply(false); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title">{title}</h3><p className="doan-dialog-description" id={describedBy}>{description}</p></div></div>
    {children}<div className="doan-dialog-actions">
      <button className="doan-button" data-ui-variant="subtle" ref={cancel} aria-disabled={pending || undefined} data-disabled={pending ? "" : undefined} onClick={() => reply(false)}>Cancel</button>
      <button className="doan-button" data-ui-variant="prominent" aria-disabled={pending || undefined} aria-busy={pending || undefined} onClick={() => reply(true)}>{pending && <span className="doan-spinner" aria-hidden="true" />}{verb}</button>
    </div>
  </dialog>;
}
