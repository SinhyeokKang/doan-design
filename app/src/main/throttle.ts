// Starts closed: the caller has just done the work it throttles (the shell
// reads every root at startup). A clock set back restarts the interval.
export function createThrottle(intervalMs: number, now: () => number = () => Date.now()): () => boolean {
  let last = now();
  return () => {
    const time = now();
    if (time < last) last = time;
    if (time - last < intervalMs) return false;
    last = time;
    return true;
  };
}
