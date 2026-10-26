import { useState, type ReactElement, type ReactNode } from "react";

// The "Details ▸/▾" disclosure behind which a read error's raw message waits
// (project-feedback draft `tree-errors`). The caller places the button and
// the message, which differ between the tree and the Comments panel.
// The button is a small doan-button: ghost in the tree, subtle beside Retry in a panel.
export function ErrorDetails({ className, variant, detail, children }: { className: string; variant?: "subtle"; detail: string; children: (button: ReactElement, detail: string | null) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = <button type="button" className={`${className} doan-button`} data-ui-variant={variant} data-ui-size="sm" aria-label="Details" aria-expanded={open} onClick={() => setOpen(!open)}>Details {open ? "▾" : "▸"}</button>;
  return children(button, open ? detail : null);
}
