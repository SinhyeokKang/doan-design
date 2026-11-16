import { DropdownMenu } from "radix-ui";
import { AlertIcon } from "./AlertIcon";
import { announcedAgain, type ListRetry } from "./listRetry";

export const LIST_FAILED_TEXT = "Couldn’t read conversations";

// The conversation list's Retry as DESIGN 'Busy action' draws it: while its read runs it keeps its fill, its label and
// focus, with the spinner inside, aria-busy and aria-disabled, and a press does nothing. Plain functions, not
// components, so the button stays the element its host draws.
export function listRetryButton(retry: ListRetry, variant: "panel" | "subtle", onRetry: () => void) {
  return <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant={variant}
    aria-disabled={retry.running || undefined} aria-busy={retry.running || undefined} onClick={() => { if (!retry.running) onRetry(); }}>
    {retry.running ? <><span className="doan-spinner" aria-hidden="true" />Retry</> : "Retry"}</button>;
}

// The title menu's row: never Radix `disabled`, which would drop its highlight and the focus on it while it runs.
export function listRetryItem(retry: ListRetry, onRetry: () => void) {
  return <DropdownMenu.Item className="doan-menu-item" aria-disabled={retry.running || undefined} aria-busy={retry.running || undefined}
    onSelect={event => { event.preventDefault(); if (!retry.running) onRetry(); }}>
    {retry.running ? <><span className="doan-spinner" aria-hidden="true" />Retry</> : "Retry"}</DropdownMenu.Item>;
}

// The thread-place notice of a list never read: the canvas panel's, and the Overview's new conversation column.
export function listFailedNotice(retry: ListRetry, onRetry: () => void) {
  return <div className="doan-notice error thread-notice" role="alert"><AlertIcon /><span className="strip-text selectable"><b>{LIST_FAILED_TEXT}</b>
    <span>{announcedAgain("Try again. You can still start a new conversation.", retry.failures)}</span></span>
    <span className="strip-actions">{listRetryButton(retry, "panel", onRetry)}</span></div>;
}
