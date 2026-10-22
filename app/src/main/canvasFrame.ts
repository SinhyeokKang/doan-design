// Pure decisions for the canvas iframe's security boundary. Kept free of
// Electron types so they can be tested (and mutation-checked) without a window.

interface TokenBase {
  origin: string;
  // Always ends with "/", so `/t/tok` never matches `/t/tokx/`.
  path: string;
}

function parseHttp(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // userinfo can make `http://127.0.0.1:<port>@evil/` look like the local origin.
  if (parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "") return null;
  return parsed;
}

function tokenBase(base: string): TokenBase | null {
  const parsed = parseHttp(base);
  if (parsed === null) return null;
  return { origin: parsed.origin, path: parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/` };
}

// `new URL` has already resolved `..`, `%2e%2e` and `\`, so the path compared
// here is the one the browser would request.
function parseUnder(url: string, prefix: TokenBase): URL | null {
  const parsed = parseHttp(url);
  if (parsed === null || parsed.origin !== prefix.origin || !parsed.pathname.startsWith(prefix.path)) return null;
  return parsed;
}

// Structural on purpose: `WebFrameMain` identity can be unstable across frame
// swaps, so the window's main frame is recognized by having no parent.
function isTopFrame(frame: { parent?: unknown } | null | undefined): boolean {
  return frame !== null && frame !== undefined && frame.parent === null;
}

export interface FrameLike {
  readonly url: string;
  readonly parent: FrameLike | null;
}

// The injection target test: the frame's parent is the window's main frame.
export function childOfTopFrame(frame: FrameLike | null | undefined): boolean {
  return frame !== null && frame !== undefined && isTopFrame(frame.parent);
}

// `base` is `http://127.0.0.1:<port>/t/<token>/`.
export function isCanvasFrame(url: string, base: string, parentIsMain: boolean): boolean {
  if (!parentIsMain) return false;
  const prefix = tokenBase(base);
  return prefix !== null && parseUnder(url, prefix) !== null;
}

// The window refuses popups, so a parentless initiator is the app's own main
// frame, i.e. the renderer setting an iframe src. A missing initiator (browser-
// started, or the initiating frame is gone) is not the app.
export function startedByApp(initiator: { parent?: unknown } | null | undefined): boolean {
  return isTopFrame(initiator);
}

// Fails closed: a frame is left alone only when it is proven to be nested in a
// canvas. A guess that comes out wrong must restrict a canvas, never free it.
export function navigationGate(frame: FrameLike | null | undefined): "refuse" | "check" | "skip" {
  if (frame === null || frame === undefined) return "refuse";
  const parent = frame.parent;
  if (parent !== null && parent !== undefined && parent.parent !== null && parent.parent !== undefined) return "skip";
  return "check";
}

// The app may load any token URL; it never builds a src from canvas-sent values,
// so this does not let a canvas pick another folder. A canvas itself stays under
// the folder key it is on.
export function allowFrameNavigation(current: string, next: string, base: string, fromApp: boolean): boolean {
  const prefix = tokenBase(base);
  if (prefix === null || parseUnder(next, prefix) === null) return false;
  if (fromApp) return true;
  const from = parseUnder(current, prefix);
  if (from === null) return false;
  const key = from.pathname.slice(prefix.path.length).split("/")[0] ?? "";
  if (key === "") return false;
  return parseUnder(next, { origin: prefix.origin, path: `${prefix.path}${key}/` }) !== null;
}

// The `will-frame-navigate` decision as a whole. The window's main frame is
// refused here too, so this does not depend on `will-navigate` for it.
export function frameNavigationAllowed(
  details: { url: string; frame: FrameLike | null | undefined; initiator?: FrameLike | null | undefined },
  base: string,
): boolean {
  // A WebFrameMain disposed mid-navigation throws on property access; letting
  // that escape would skip preventDefault and let the navigation through.
  try {
    const frame = details.frame;
    const gate = navigationGate(frame);
    if (gate === "skip") return true;
    if (gate === "refuse" || frame === null || frame === undefined || isTopFrame(frame)) return false;
    return allowFrameNavigation(frame.url, details.url, base, startedByApp(details.initiator));
  } catch {
    return false;
  }
}

interface SenderFrameLike {
  parent?: unknown;
}

export function fromAppFrame(
  event: { sender: unknown; senderFrame: SenderFrameLike | null | undefined },
  win: { webContents: unknown },
): boolean {
  if (event.sender === undefined || event.sender !== win.webContents) return false;
  return isTopFrame(event.senderFrame);
}
