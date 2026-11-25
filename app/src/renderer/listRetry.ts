// A failed conversation-list read's Retry: `running` while the read it started is out, `failures` the Retries that
// failed in a row since the list last answered.
export interface ListRetry { running: boolean; failures: number }
export const LIST_RETRY_IDLE: ListRetry = { running: false, failures: 0 };

// The list stays "error" through a failed Retry, so every other failed Retry adds a no-break space and the live region
// reads the same sentence again.
export function announcedAgain(text: string, failures: number): string {
  return failures % 2 === 1 ? `${text}\u00a0` : text;
}
