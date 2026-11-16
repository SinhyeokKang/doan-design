// A failed conversation-list read's Retry: `running` while the read it started is out, `failures` the reads that
// failed in a row since the list last answered.
export interface ListRetry { running: boolean; failures: number }
export const LIST_RETRY_IDLE: ListRetry = { running: false, failures: 0 };

// The list stays "error" through a failed re-read, so nothing on screen would change and its live region would stay
// silent; every second failure adds a no-break space, which makes the region read the same sentence again (the
// docked composer's queue announcements do the same).
export function announcedAgain(text: string, failures: number): string {
  return failures > 0 && failures % 2 === 0 ? `${text} ` : text;
}
