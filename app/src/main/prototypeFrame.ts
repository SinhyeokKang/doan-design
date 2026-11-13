// The prototype window's `will-frame-navigate` decision. Kept Electron-free beside `canvasFrame.ts`.
//
// The board's `frameNavigationAllowed` lets a canvas move to another document of its own folder; a prototype must not
// leave its frame, so its direct child frame may only be (re)loaded by the host, and only to the current run's URL.
// Links, `location` changes, reloads, native form submits and download links all arrive here as the canvas's own
// moves and are refused. Same-document moves (hash, pushState) never reach this event.
import { isTopFrame, navigationGate, startedByApp, type FrameLike } from "./canvasFrame";

function normalized(url: string): string | null {
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

export function prototypeFrameNavigationAllowed(
  details: { url: string; frame: FrameLike | null | undefined; initiator?: FrameLike | null | undefined },
  runUrl: string | null,
): boolean {
  // A WebFrameMain disposed mid-navigation throws on property access; letting that escape would skip
  // preventDefault and let the navigation through.
  try {
    const frame = details.frame;
    const gate = navigationGate(frame);
    // A nested iframe's own navigation keeps the board's rule; the sandbox already stops it from moving its parent.
    if (gate === "skip") return true;
    if (gate === "refuse" || frame === null || frame === undefined || isTopFrame(frame)) return false;
    if (runUrl === null || !startedByApp(details.initiator)) return false;
    const next = normalized(details.url);
    return next !== null && next === normalized(runUrl);
  } catch {
    return false;
  }
}
