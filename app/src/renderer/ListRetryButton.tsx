import { useRef, useState, type MouseEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { useActivationFocus } from "./activationFocus";
import { AlertIcon } from "./AlertIcon";
import { announcedAgain, LIST_RETRY_IDLE, type ListRetry } from "./listRetry";

export const LIST_FAILED_TEXT = "Couldn’t read conversations";

// DESIGN 'Busy action': while its read runs it keeps its fill, label and focus, with the spinner, aria-busy and aria-disabled.
// Plain functions, not components, so the button stays the element its host draws.
export function listRetryButton(retry: ListRetry, variant: "panel" | "subtle", onRetry: () => void) {
  return retryButton({ running: retry.running, variant, onRetry });
}

// While its request is out the line and the button stay, so focus stays on it. `describedBy` links the line that says what it
// retries (DESIGN 'Accessible names'); onRetry gets the pressed button, so a host can place focus once the line goes.
export function retryButton({ running, variant, describedBy, onRetry }: { running: boolean; variant: "panel" | "subtle"; describedBy?: string; onRetry(button: HTMLElement | null): void }) {
  return <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant={variant} aria-describedby={describedBy}
    aria-disabled={running || undefined} aria-busy={running || undefined} onClick={(event?: MouseEvent<HTMLButtonElement>) => { if (!running) onRetry(event?.currentTarget ?? null); }}>
    {running ? <><span className="doan-spinner" aria-hidden="true" />Retry</> : "Retry"}</button>;
}

// `work` resolves true on success; a press while one runs does nothing. On success focus that was on the Retry moves to the first
// control still in its row, else its section, else its page, instead of falling to <body>.
const CONTROLS = 'button:not(:disabled):not([aria-disabled="true"]), [role="switch"]:not(:disabled), input:not(:disabled), [href]';
export function useRetry(): ListRetry & { run(work: () => Promise<boolean>, pressed?: HTMLElement | null): void } {
  const [state, setState] = useState(LIST_RETRY_IDLE);
  const running = useRef(false);
  // A slow read can answer after the person left the window; the move is made again on activation (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
  const run = (work: () => Promise<boolean>, pressed: HTMLElement | null = null) => {
    if (running.current) return;
    running.current = true;
    setState(previous => ({ ...previous, running: true }));
    const scopes = [".doan-preference-row", ".settings-section", ".settings-page"].flatMap(selector => pressed?.closest(selector) ?? []);
    void work().catch(() => false).then(ok => {
      running.current = false;
      setState(previous => ({ running: false, failures: ok ? 0 : previous.failures + 1 }));
      if (!ok || scopes.length === 0) return;
      requestAnimationFrame(() => {
        if (pressed?.isConnected && document.activeElement === pressed) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        handFocus(() => {
          for (const scope of scopes) {
            const control = scope.isConnected ? scope.querySelector<HTMLElement>(CONTROLS) : null;
            if (control) { control.focus(); return; }
          }
        });
      });
    });
  };
  return { ...state, run };
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
