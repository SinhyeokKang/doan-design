// After a software-compositing fallback a vibrancy window's translucent fills may lose their alpha, so each such window
// drops the material and emulates "Reduce transparency", reusing every `prefers-reduced-transparency: reduce` rule.

export interface FallbackWindow {
  isDestroyed(): boolean;
  setVibrancy(type: null): void;
  setBackgroundColor(color: string): void;
  webContents: {
    debugger: { isAttached(): boolean; attach(): void; sendCommand(method: string, params: object): Promise<unknown> };
    executeJavaScript(code: string): Promise<unknown>;
    on(event: "did-finish-load", listener: () => void): unknown;
  };
}

export interface OpaqueFallback {
  // A window created with vibrancy; turned opaque at once when the fallback has already happened.
  adopt(window: FallbackWindow): void;
  trigger(): void;
}

const REDUCE = { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] };

function opaque(window: FallbackWindow): void {
  window.setVibrancy(null);
  const contents = window.webContents;
  const failed = (error: unknown) => console.error("doan: cannot make the window opaque", error);
  // Attach fails while DevTools holds the page, which then keeps its own fills. Only the page's own session gets the
  // command, so canvases' media stays the system's (ARCHITECTURE §1: the app never changes a canvas's styles).
  const emulate = () => {
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach();
      contents.debugger.sendCommand("Emulation.setEmulatedMedia", REDUCE).catch(failed);
    } catch (error) { failed(error); }
  };
  emulate();
  // A page reloaded after its renderer died comes back with the debugger detached and no emulation.
  contents.on("did-finish-load", emulate);
  // The page's own token, so the native background behind the page matches it.
  contents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue("--bg-app").trim()`)
    .then(color => { if (typeof color === "string" && color !== "" && !window.isDestroyed()) window.setBackgroundColor(color); })
    .catch(failed);
}

export function createOpaqueFallback(): OpaqueFallback {
  const windows = new Set<FallbackWindow>();
  let triggered = false;
  return {
    adopt(window) {
      if (triggered) { if (!window.isDestroyed()) opaque(window); return; }
      // The prototype window is created again for each run; closed ones are not kept.
      for (const known of windows) if (known.isDestroyed()) windows.delete(known);
      windows.add(window);
    },
    trigger() {
      if (triggered) return;
      triggered = true;
      for (const window of windows) if (!window.isDestroyed()) opaque(window);
      windows.clear();
    },
  };
}
