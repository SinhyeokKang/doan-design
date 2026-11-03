// `doan onboarding start` launches a closed app with `open -g … --args <flag>` so the app the person is using stays in
// front; `doan open` launches without it. Only a fresh launch receives `--args`.
export const BACKGROUND_LAUNCH_FLAG = "--doan-launch=background";

export function launchedInBackground(argv: readonly string[]): boolean {
  return argv.includes(BACKGROUND_LAUNCH_FLAG);
}

export interface RevealInput {
  // app.isActive(): Doan is the frontmost app, even with its window closed.
  appActive: boolean;
  windowVisible: boolean;
  // A wait for activation is on and has already bounced the Dock icon. A background launch waits without bouncing,
  // so the `start` the CLI sends right after it still bounces once.
  bounced: boolean;
}

export interface Reveal {
  show: "now" | "on-activate" | "none";
  bounce: boolean;
}

// What `onboarding start` does with the window. Showing it while another app is in front would activate Doan
// (BrowserWindow.show and app.show both do), so an inactive app only waits and bounces.
export function revealFor({ appActive, windowVisible, bounced }: RevealInput): Reveal {
  if (appActive) return { show: "now", bounce: false };
  if (windowVisible) return { show: "none", bounce: true };
  return { show: "on-activate", bounce: !bounced };
}
