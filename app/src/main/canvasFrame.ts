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

// `base` is `http://127.0.0.1:<port>/t/<token>/`.
export function isCanvasFrame(url: string, base: string, parentIsMain: boolean): boolean {
  if (!parentIsMain) return false;
  const prefix = tokenBase(base);
  return prefix !== null && parseUnder(url, prefix) !== null;
}

// `current` is null when Electron gives no frame, which is refused rather than
// guessed. Only frames whose parent is the app's main frame are restricted by
// the caller; a nested embed is not this function's concern.
export function allowFrameNavigation(current: string | null, next: string, base: string): boolean {
  if (current === null) return false;
  const prefix = tokenBase(base);
  if (prefix === null || parseUnder(next, prefix) === null) return false;
  // The renderer gives a new iframe `about:blank`/nothing before its first src.
  if (current === "" || current === "about:blank") return true;
  const from = parseUnder(current, prefix);
  if (from === null) return false;
  const key = from.pathname.slice(prefix.path.length).split("/")[0] ?? "";
  if (key === "") return false;
  return parseUnder(next, { origin: prefix.origin, path: `${prefix.path}${key}/` }) !== null;
}

interface SenderFrameLike {
  parent?: unknown;
}

// Structural on purpose: `WebFrameMain` identity can be unstable across frame
// swaps, so the main frame is recognized by having no parent.
export function fromAppFrame(
  event: { sender: unknown; senderFrame: SenderFrameLike | null | undefined },
  win: { webContents: unknown },
): boolean {
  if (event.sender === undefined || event.sender !== win.webContents) return false;
  const frame = event.senderFrame;
  return frame !== null && frame !== undefined && frame.parent === null;
}
