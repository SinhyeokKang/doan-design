import { useEffect, useState } from "react";
import type { DoanApi } from "../preload";

// `window.doan`, or the prototype window's own visibility event of the same name.
export type VisibleCalls = Pick<DoanApi, "onWindowVisible">;

// A wall-clock time that renders its owner every `ms` while the window shows. Wall-clock text ("3m", "now", a time of
// day) is computed while rendering and nothing else re-renders App at rest. Hidden means the document is hidden or the
// window is closed or the app hidden (POSTMORTEM 2026-10-25: document visibility is not native visibility); showing
// again refreshes it at once.
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
