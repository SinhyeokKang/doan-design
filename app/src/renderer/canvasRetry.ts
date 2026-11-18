import type { CanvasState } from "./CanvasController";

// The "Couldn’t load the canvas" Retry (DESIGN 'Busy action'). The reload it starts turns the status to loading at once,
// so the failure line and the Retry stay drawn from this state, the Retry busy, until the reload answers: a failure
// keeps them, a load that succeeds or another canvas clears them. `key` is the canvas it was pressed on; `failures`
// counts Retries that failed in a row, so the line can be announced again.
export interface CanvasRetry { key: string | null; running: boolean; failures: number }
export const CANVAS_RETRY_IDLE: CanvasRetry = { key: null, running: false, failures: 0 };
type Status = CanvasState["status"];

export function canvasRetryPressed(retry: CanvasRetry, key: string | null): CanvasRetry {
  if (retry.running && retry.key === key) return retry;
  return { key, running: true, failures: retry.key === key ? retry.failures : 0 };
}

// The same object when nothing changed, so a render can settle it without looping.
export function canvasRetrySettled(retry: CanvasRetry, key: string | null, status: Status): CanvasRetry {
  const idle = retry.key === null && !retry.running && retry.failures === 0;
  if (idle) return retry;
  if (retry.key !== key) return CANVAS_RETRY_IDLE;
  if (status === "loading") return retry;
  if (status === "failed") return retry.running ? { key, running: false, failures: retry.failures + 1 } : retry;
  return CANVAS_RETRY_IDLE;
}

export function canvasFailedShown(retry: CanvasRetry, key: string | null, status: Status): boolean {
  return status === "failed" || (status === "loading" && retry.running && retry.key === key);
}
