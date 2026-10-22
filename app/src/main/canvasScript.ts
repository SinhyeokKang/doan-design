// The script main runs inside each canvas iframe (WebFrameMain.executeJavaScript).
// It is shipped as the source text of the functions below, so every function
// here must be self-contained: no imports, no module-level names, nothing the
// bundler could hoist out. `canvasScript` gets the helpers as an argument
// instead, which keeps the helpers unit-testable on their own. It runs in the
// canvas's main world, so the canvas can see and fake everything it posts
// (the renderer validates it, design flow 5).

export interface HeightState {
  sent: number;
  inner: number;
  frozen: boolean;
}

// `min-height: 100vh` style canvases grow with the iframe we resize to fit
// them. Right after our own resize (the viewport became the height we sent),
// a document that still outgrows the viewport is chasing it, so the last sent
// height is kept until this document ends.
export function nextHeight(prev: HeightState | null, measured: number, inner: number): HeightState {
  if (prev === null) return { sent: measured, inner, frozen: false };
  if (prev.frozen) return prev;
  const ownResize = inner !== prev.inner && Math.abs(inner - prev.sent) <= 1;
  if (ownResize && measured > inner + 1) return { sent: prev.sent, inner: prev.inner, frozen: true };
  return { sent: measured, inner, frozen: false };
}

export function canScrollAxis(overflow: string, position: number, client: number, size: number, delta: number): boolean {
  if (delta === 0 || size <= client) return false;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  // Fractional scroll offsets can stop just short of the end.
  return delta > 0 ? position + client < size - 0.5 : position > 0;
}

export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

interface CanvasLib {
  nextHeight: typeof nextHeight;
  canScrollAxis: typeof canScrollAxis;
  clipText: typeof clipText;
}

export function canvasScript(lib: CanvasLib): void {
  const MAX_FRAMES = 1000;
  const MAX_STRING = 200;
  // Each navigation is injected once, but a canvas re-running us must not
  // double every listener.
  const mark = Symbol.for("doan.canvas");
  const marked = window as unknown as Record<symbol, unknown>;
  if (marked[mark]) return;
  marked[mark] = true;

  const post = (message: unknown) => parent.postMessage(message, "*");
  let height: HeightState | null = null;

  const frames = () => {
    const list: { id: string; title?: string; x: number; y: number; width: number; height: number }[] = [];
    let truncated = false;
    const clip = (text: string) => {
      const kept = lib.clipText(text, MAX_STRING);
      if (kept !== text) truncated = true;
      return kept;
    };
    for (const el of document.querySelectorAll("[data-doan-frame]")) {
      if (list.length === MAX_FRAMES) {
        truncated = true;
        break;
      }
      const rect = el.getBoundingClientRect();
      const frame: (typeof list)[number] = { id: clip(el.getAttribute("data-doan-frame") ?? ""), x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
      const title = el.getAttribute("data-doan-title");
      if (title !== null) frame.title = clip(title);
      list.push(frame);
    }
    return { list, truncated };
  };

  const send = () => {
    // Not scrollHeight: it never drops below the viewport, so a canvas could not shrink.
    height = lib.nextHeight(height, Math.ceil(document.documentElement.getBoundingClientRect().height), innerHeight);
    const { list, truncated } = frames();
    post({ type: "layout", href: location.href, height: height.sent, frames: list, truncated });
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      send();
    });
  };

  // The first layout and measure replies skip rAF: an iframe outside the
  // viewport gets no animation frames, so a batched reply would never come.
  const start = () => {
    const resized = new ResizeObserver(schedule);
    resized.observe(document.documentElement);
    if (document.body) resized.observe(document.body);
    new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener("resize", schedule);
    addEventListener("load", schedule);
    void document.fonts.ready.then(schedule);
    send();
  };

  addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) return;
    const data: unknown = event.data;
    if (typeof data === "object" && data !== null && (data as { type?: unknown }).type === "measure") send();
  });

  // The document's own scroll (before the height fits) is not an inner scroller:
  // a wheel there pans the board.
  const scrollsFurther = (target: EventTarget | null, dx: number, dy: number) => {
    // nodeType, not instanceof: a wheel can target the document itself.
    let node = target as Element | null;
    for (; node && node.nodeType === 1 && node !== document.documentElement && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (lib.canScrollAxis(style.overflowY, node.scrollTop, node.clientHeight, node.scrollHeight, dy)) return true;
      if (lib.canScrollAxis(style.overflowX, node.scrollLeft, node.clientWidth, node.scrollWidth, dx)) return true;
    }
    return false;
  };

  addEventListener(
    "wheel",
    (event: WheelEvent) => {
      const zoom = event.ctrlKey || event.metaKey;
      if (!zoom && scrollsFurther(event.target, event.deltaX, event.deltaY)) return;
      event.preventDefault();
      post({ type: "wheel", dx: event.deltaX, dy: event.deltaY, ctrl: event.ctrlKey, meta: event.metaKey, deltaMode: event.deltaMode, x: event.clientX + scrollX, y: event.clientY + scrollY });
    },
    { passive: false, capture: true },
  );

  // Injection happens at did-frame-navigate, while the document is still loading.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function canvasScriptSource(): string {
  return `(${canvasScript.toString()})({nextHeight: ${nextHeight.toString()}, canScrollAxis: ${canScrollAxis.toString()}, clipText: ${clipText.toString()}}); void 0;`;
}
