import { useState, type ReactElement, type ReactNode } from "react";

// The caller places the button and the message. A small doan-button: ghost in the tree, subtle beside Retry in a panel.
export function ErrorDetails({ variant, detail, children }: { variant?: "subtle"; detail: string; children: (button: ReactElement, detail: string | null) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = <button type="button" className="doan-button" data-ui-variant={variant} data-ui-size="sm" aria-label="Details" aria-expanded={open} onClick={() => setOpen(!open)}>Details {open ? "▾" : "▸"}</button>;
  return children(button, open ? detail : null);
}
