import { useEffect, useState } from "react";
import type { DoanApi } from "../preload";

// `window.doan`, or the prototype window's own visibility event of the same name.
export type VisibleCalls = Pick<DoanApi, "onWindowVisible">;

// Wall-clock text is computed while rendering, and nothing else re-renders App at rest. Hidden also covers a closed
// window or hidden app: document visibility is not native visibility.
export function useVisibleClock(ms: number, calls: VisibleCalls): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let nativeVisible = true;
    const tick = () => setNow(Date.now());
    const update = (refresh: boolean) => {
      if (document.hidden || !nativeVisible) {
        if (timer !== null) clearInterval(timer);
        timer = null;
        return;
      }
      if (timer !== null) return;
      if (refresh) tick();
      timer = setInterval(tick, ms);
    };
    const visibility = () => update(true);
    update(false);
    document.addEventListener("visibilitychange", visibility);
    const off = calls.onWindowVisible(visible => { nativeVisible = visible; update(true); });
    return () => { off(); document.removeEventListener("visibilitychange", visibility); if (timer !== null) clearInterval(timer); };
  }, [ms, calls]);
  return now;
}
