import { useState, type ReactElement, type ReactNode } from "react";

// The "Details ▸/▾" disclosure behind which a read error's raw message waits
// (project-feedback draft `tree-errors`). The caller places the button and
// the message, which differ between the tree and the Comments panel.
export function ErrorDetails({ className, detail, children }: { className: string; detail: string; children: (button: ReactElement, detail: string | null) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = <button type="button" className={className} aria-label="Details" aria-expanded={open} onClick={() => setOpen(!open)}>Details {open ? "▾" : "▸"}</button>;
  return children(button, open ? detail : null);
}
