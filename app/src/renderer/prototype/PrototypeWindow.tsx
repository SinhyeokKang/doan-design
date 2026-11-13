import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Popover } from "radix-ui";
import { ArrowLeft, ArrowRight, ChevronDown, CircleSlash, Expand, FileWarning, Proportions, RotateCw, SquareDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { PROTOTYPE_LOAD_TIMEOUT_MS, type FramesMessage, type PrototypeMode, type PrototypeSnapshot, type PrototypeView, type PrototypeWindowApi, type RunMessage } from "../../main/prototype/ipc";
import { PROTOTYPE_HEADER_RIGHT, prototypeHeaderRows, prototypeViewportBox, type Rect, type ViewportBox } from "../../main/prototype/fit";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { drawerKeyTarget, drawerTypeahead, focusedRowAfter } from "../frameDrawerList";
import { moveBetweenTools } from "../toolbarKeys";
import { currentRun, forwardedMessage, layersForSnapshot, layersForView, NO_LAYERS, type HostLayers } from "./host";
import { CLOSE, covered, DETAILS, drawerLabel, drawerRows, EMPTY_DRAWER, liveText, LOADING_LABEL, modeTooltip, RETRY, stateScene, windowTitle, type DrawerRow, type SceneIcon } from "./view";

// The prototype window (PRODUCT §3 Show, one frame): the main window's shell without a sidebar, a header of Back,
// Forward and Reload, the playing frame's name, and the Fit/Responsive toggle, and the frame's own document in a
// sandboxed iframe in the content panel. Every decision is main's; this window draws its view, hosts the run's iframe
// and forwards the run's reports.

export type PrototypeApi = PrototypeWindowApi & { onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void };

// The reading line waits so a quick load does not flash it in, as the shipped problem overlay's does.
const READING_DELAY_MS = 300;
const SCENE_HEADING_ID = "prototype-state-heading", SCENE_LINE_ID = "prototype-state-line";
// The empty drawer's sentence as the name button's description: focus stays on the button when that drawer opens.
const EMPTY_DRAWER_ID = "prototype-drawer-empty";
const ICONS: Record<SceneIcon, LucideIcon> = { read: FileWarning, init: TriangleAlert, frame: SquareDashed, support: CircleSlash };
const MODES: { mode: PrototypeMode; label: string; icon: LucideIcon }[] = [{ mode: "fit", label: "Fit", icon: Proportions }, { mode: "responsive", label: "Responsive", icon: Expand }];
// A pointer press on a header control keeps focus where it was (usually in the frame), so keys keep reaching the frame.
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

export function PrototypeWindow({ api }: { api: PrototypeApi }) {
  const [view, setView] = useState<PrototypeView | null>(null);
  const [layers, setLayers] = useState<HostLayers>(NO_LAYERS);
  const [readingGen, setReadingGen] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const [menuOpen, setMenuOpen] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const name = useRef<HTMLButtonElement>(null);
  // The gen a pointer Reload left while focus was in the frame or on the page (null otherwise).
  const reloadFocus = useRef<number | null>(null);

  // The header's rows follow the window's content width, which main's fit and capture use too.
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    let changed = false;
    const stop = api.onChanged(next => { changed = true; setView(next); });
    void api.read().then(first => { if (!changed) setView(first); }, () => {});
    return stop;
  }, [api]);

  useEffect(() => api.onSnapshot(({ gen, png, box }) => {
    const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
    setLayers(previous => {
      const next = layersForSnapshot(previous, { gen, url, box }, viewRef.current?.gen ?? null);
      if (next === previous) URL.revokeObjectURL(url);
      return next;
    });
  }), [api]);

  // Views drive the iframes; a still image that leaves the screen frees its blob.
  useLayoutEffect(() => { setLayers(previous => layersForView(previous, view)); }, [view]);
  const snapshotUrl = layers.snapshot?.url;
  useEffect(() => () => { if (snapshotUrl !== undefined) URL.revokeObjectURL(snapshotUrl); }, [snapshotUrl]);

  useEffect(() => { document.title = windowTitle(view); }, [view]);

  const gen = view?.gen ?? null;
  const phase = view?.phase ?? null;
  // The run whose reports count: its result while it loads, and its drawer list, which can come after it is ready.
  const runGen = currentRun(layers, gen)?.gen ?? null;
  const loadingRun = phase === "loading" ? runGen : null;

  // The host's own limit, from the moment the iframe's src is set to the run's result (PROTOTYPE_LOAD_TIMEOUT_MS).
  useEffect(() => {
    if (loadingRun === null) return;
    const timer = setTimeout(() => { void api.reportResult({ gen: loadingRun, state: "timeout" }); }, PROTOTYPE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [api, loadingRun]);

  useEffect(() => {
    if (runGen === null) return;
    const receive = (event: MessageEvent) => {
      const element = frames.current.get(runGen);
      const forward = forwardedMessage(event, element ? { gen: runGen, window: element.contentWindow } : null);
      if (forward === null) return;
      if (forward.kind === "result") void api.reportResult(forward.message as RunMessage);
      else void api.reportFrames(forward.message as FramesMessage);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [api, runGen]);

  // The reading line and its announcement come 300 ms into a load.
  const loadingGen = phase === "loading" ? gen : null;
  useEffect(() => {
    if (loadingGen === null) return;
    const timer = setTimeout(() => setReadingGen(loadingGen), READING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loadingGen]);

  // A new state closes Details. Focus moves to a new scene's title only when it was inside the content, which the
  // overlay now covers, or already fell to the page when a load made the content inert; otherwise it stays where the
  // person put it and the live region speaks.
  const scene = view === null ? null : stateScene(view);
  const sceneKey = scene === null ? null : `${gen}\n${phase}`;
  const focusWasInside = useRef(false);
  const active = document.activeElement;
  focusWasInside.current = active === null || active === document.body || (!!content.current && content.current.contains(active));
  useLayoutEffect(() => {
    setDetails(false);
    if (sceneKey !== null && focusWasInside.current) heading.current?.focus({ preventScroll: true });
  }, [sceneKey]);

  // A pointer Reload replaces the iframe; the old one goes inert while the new one loads, so focus that was in the frame
  // falls to the page. The new run takes it back once ready, unless the person put focus elsewhere meanwhile. A failure
  // or lost state forgets the press: its scene takes focus by the rule above.
  const visibleGen = layers.visible;
  useEffect(() => {
    const pressed = reloadFocus.current;
    if (pressed === null || phase === null || phase === "loading") return;
    if (phase !== "ready") { reloadFocus.current = null; return; }
    if (visibleGen === null || visibleGen <= pressed) return;
    reloadFocus.current = null;
    if (document.activeElement === document.body) frames.current.get(visibleGen)?.focus();
  }, [phase, visibleGen]);
  const onReloadPress = () => {
    const active = document.activeElement;
    const inFrame = active === null || active === document.body || [...frames.current.values()].some(frame => frame === active);
    reloadFocus.current = inFrame ? gen : null;
  };

  const readingShown = phase === "loading" && readingGen === gen;
  return <WindowShell view={view} layers={layers} readingShown={readingShown} details={details} live={liveText(view, readingShown)}
    width={width} menuOpen={menuOpen} content={content} heading={heading} name={name} frames={frames.current}
    onBack={() => void api.back()} onForward={() => void api.forward()} onReload={() => { if (gen !== null) void api.reload(gen); }} onReloadPress={onReloadPress}
    onMode={mode => void api.setMode(mode)} onMenuOpen={setMenuOpen}
    onChoose={frame => void api.choose(frame)} onClose={() => void api.close()} onDetails={() => setDetails(open => !open)} />;
}

export interface ShellProps {
  view: PrototypeView | null;
  layers: HostLayers;
  readingShown: boolean;
  details: boolean;
  live: string;
  // The window's content width, which alone decides whether the name takes the header's second row.
  width: number;
  menuOpen: boolean;
  content?: RefObject<HTMLDivElement | null>;
  heading?: RefObject<HTMLHeadingElement | null>;
  name?: RefObject<HTMLButtonElement | null>;
  frames?: Map<number, HTMLIFrameElement>;
  onBack(): void; onForward(): void; onReload(): void; onReloadPress(): void; onMode(mode: PrototypeMode): void; onMenuOpen(open: boolean): void;
  onChoose(frame: string): void; onClose(): void; onDetails(): void;
}

// The window's markup. Header controls come before the content in the Tab order; the state overlay covers the content
// panel only, so they stay usable over it. Every control keeps one element tree in every state (no view yet, pressed or
// not, either row) so a focused control or the open frame menu survives the change.
export function WindowShell({ view, layers, readingShown, details, live, width, menuOpen, content, heading, name, frames, onBack, onForward, onReload, onReloadPress, onMode, onMenuOpen, onChoose, onClose, onDetails }: ShellProps) {
  const scene = view === null ? null : stateScene(view);
  const coveredNow = view !== null && covered(view.phase);
  // Radix gives an Esc to the top layer only, so a header tooltip over the open frame menu would leave the menu open;
  // the tooltip closes it as that Esc would have, and focus goes back to the name.
  const tipEscape = () => { if (!menuOpen) return; onMenuOpen(false); name?.current?.focus(); };
  return <div className={prototypeHeaderRows(width, PROTOTYPE_HEADER_RIGHT) === 2 ? "pw name-row" : "pw"}>
    <header className="top shell-top pw-top">
      <span className="traffic-space" aria-hidden="true" />
      <div className="shell-history">
        <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!view?.canGoBack} onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!view?.canGoForward} onClick={onForward}><ArrowRight aria-hidden="true" /></button>
        <Tooltip><TooltipTrigger asChild>
          <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Reload prototype" disabled={view === null} onMouseDown={event => { keepFocus(event); onReloadPress(); }} onClick={onReload}><RotateCw aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>Reload prototype</TooltipContent></Tooltip>
      </div>
      {view !== null && <FrameMenu view={view} open={menuOpen} onOpenChange={onMenuOpen} trigger={name} onTipEscape={tipEscape} onChoose={onChoose} />}
      <div className="pw-right">
        <div className="doan-toggle-group" role="group" aria-label="Viewport" onKeyDown={moveBetweenTools}>
          {MODES.map(({ mode, label, icon: Icon }) => {
            const pressed = view?.mode === mode;
            return <Tooltip key={mode}><TooltipTrigger asChild>
              <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label={label} aria-pressed={pressed} tabIndex={pressed ? 0 : -1} disabled={view === null}
                onMouseDown={keepFocus} onClick={() => { if (!pressed) onMode(mode); }}><Icon aria-hidden="true" /></button>
            </TooltipTrigger><TooltipContent onEscapeKeyDown={tipEscape}>{modeTooltip(mode, view?.run)}</TooltipContent></Tooltip>;
          })}
        </div>
      </div>
    </header>
    <ContentPanel view={view} layers={layers} covered={coveredNow} content={content} frames={frames}>
      {view?.phase === "loading" && readingShown && <div className="problem-overlay reading"><p className="problem-reading"><span className="doan-spinner" aria-hidden="true" />{LOADING_LABEL}</p></div>}
      {scene !== null && <div className="problem-overlay">
        <div className="problem-scene" role="group" aria-labelledby={SCENE_HEADING_ID}>
          <SceneIcon icon={scene.icon} />
          <div className="ob-heading problem-heading">
            <h2 id={SCENE_HEADING_ID} ref={heading} tabIndex={-1} aria-describedby={SCENE_LINE_ID}>{scene.heading}</h2>
            <p id={SCENE_LINE_ID} className="selectable">{scene.body}</p>
          </div>
          <div className="problem-actions">
            {scene.failure && <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={onReload}>{RETRY}</button>}
            <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={onClose}>{CLOSE}</button>
            {scene.failure && scene.detail !== undefined && <button type="button" className="doan-button ghost" data-ui-size="sm" aria-expanded={details} onClick={onDetails}>{DETAILS}{details ? " ▾" : " ▸"}</button>}
          </div>
          {scene.failure && details && scene.detail !== undefined && <pre className="problem-detail selectable">{scene.detail}</pre>}
        </div>
      </div>}
    </ContentPanel>
    <p className="sr-only" role="status" aria-live="polite">{live}</p>
  </div>;
}

function SceneIcon({ icon }: { icon: SceneIcon }) {
  const Icon = ICONS[icon];
  return <Icon className="problem-icon" aria-hidden="true" />;
}

function clipStyle(rect: Rect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

// The run iframe at its viewport size, scaled from its top-left, inside a box of the whole-pixel visible size that
// main's capture takes too. Inline styles: the prototype page's CSP blocks injected style elements.
export function viewportStyles(box: ViewportBox) {
  return {
    clip: clipStyle({ x: box.x, y: box.y, width: box.visibleWidth, height: box.visibleHeight }),
    frame: { width: box.width, height: box.height, transform: `scale(${box.scale})` },
  };
}

// The content panel: the run's iframes (a new element per run; one loading stays hidden under the previous screen
// until it is ready) or, with no run on screen, main's still image at the box main took it from; inert while anything
// but a ready run shows, then the state overlay. A mode change only restyles the same elements, so the run is resized,
// never loaded again.
function ContentPanel({ view, layers, covered, content, frames, children }: { view: PrototypeView | null; layers: HostLayers; covered: boolean; content?: RefObject<HTMLDivElement | null> | undefined; frames?: Map<number, HTMLIFrameElement> | undefined; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const measure = () => setSize(previous => (previous.width === node.clientWidth && previous.height === node.clientHeight ? previous : { width: node.clientWidth, height: node.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const mode = view?.mode;
  return <div className="pw-panel" ref={panel}>
    <div className="pw-content" ref={content} inert={covered} data-mode={mode}>
      <div className="pw-stage">
        {layers.snapshot && layers.visible === null && <div className="pw-box" style={clipStyle(layers.snapshot.box)}><img className="pw-snapshot" src={layers.snapshot.url} alt="" /></div>}
        {layers.frames.map(frame => {
          const styles = viewportStyles(prototypeViewportBox(size, { width: frame.markWidth, height: frame.markHeight }, mode ?? "fit"));
          return <div key={frame.gen} className="pw-box" style={{ ...styles.clip, visibility: layers.visible === frame.gen ? "visible" : "hidden" }}>
            <iframe className="pw-frame" src={frame.url} sandbox="allow-scripts allow-forms" title={view?.title ?? "Prototype"}
              ref={node => { if (!frames) return; if (node) frames.set(frame.gen, node); else frames.delete(frame.gen); }} style={styles.frame} />
          </div>;
        })}
      </div>
    </div>
    {children}
  </div>;
}

// The frame name, centred between the header's groups, opens this canvas's marked frames. It names the whole title in
// the shared Tooltip only while the name is cut short. The shell holds the menu's open state, which its other header
// tooltips close on Esc too.
function FrameMenu({ view, open, onOpenChange, trigger: triggerRef, onTipEscape, onChoose }: { view: PrototypeView; open: boolean; onOpenChange(open: boolean): void; trigger?: RefObject<HTMLButtonElement | null> | undefined; onTipEscape(): void; onChoose(frame: string): void }) {
  const [focused, setFocused] = useState<string | null>(null);
  const [cut, setCut] = useState(false);
  const [tip, setTip] = useState(false);
  const text = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const typed = useRef({ text: "", at: 0 });
  const rows = drawerRows(view);
  const active = focusedRowAfter(rows, focused);

  useLayoutEffect(() => {
    const node = text.current;
    if (!node) return;
    const measure = () => setCut(node.scrollWidth > node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view.title]);

  const move = (key: string | null, center = false) => {
    const node = key === null ? undefined : nodes.current.get(key);
    const box = list.current;
    if (!node || !box) return;
    setFocused(key);
    node.focus({ preventScroll: true });
    const row = node.getBoundingClientRect(), area = box.getBoundingClientRect();
    if (center) box.scrollTop += row.top + row.height / 2 - (area.top + area.height / 2);
    else if (row.top < area.top) box.scrollTop += row.top - area.top;
    else if (row.bottom > area.bottom) box.scrollTop += row.bottom - area.bottom;
  };

  // A run that lists other frames while the drawer is open keeps the focused frame, else the playing one.
  useEffect(() => {
    if (!open) return;
    const next = focusedRowAfter(rows, focused);
    if (next !== focused) move(next);
  });

  const pick = (row: DrawerRow) => { onOpenChange(false); onChoose(row.id); };
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") { event.preventDefault(); return; }
    if (event.key === "Enter" || event.key === " ") {
      const row = rows.find(candidate => candidate.key === active);
      if (row) { event.preventDefault(); pick(row); }
      return;
    }
    const target = drawerKeyTarget(rows, active, event.key);
    if (target !== null) { event.preventDefault(); move(target); return; }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 500 ? typed.current.text : "") + event.key.toLowerCase(), at: now };
      const match = drawerTypeahead(rows, active, typed.current.text);
      if (match !== null) { event.preventDefault(); move(match); }
    }
  };

  // With no marked frame the drawer holds a line of text, not a list: it is then a labelled dialog.
  const empty = rows.length === 0;
  const trigger = <button type="button" className="shell-search pw-name" ref={triggerRef} aria-haspopup={empty ? "dialog" : "listbox"}>
    <span className="pw-name-text" ref={text}>{view.title}</span><ChevronDown className="chev" aria-hidden="true" /></button>;
  return <><Popover.Root open={open} onOpenChange={next => { onOpenChange(next); if (next) setFocused(null); }}>
    <Tooltip open={cut && tip} onOpenChange={setTip}><TooltipTrigger asChild><Popover.Trigger asChild {...(empty ? { "aria-describedby": EMPTY_DRAWER_ID } : {})}>{trigger}</Popover.Trigger></TooltipTrigger><TooltipContent onEscapeKeyDown={onTipEscape}>{view.title}</TooltipContent></Tooltip>
    <Popover.Portal><Popover.Content ref={list} role={empty ? "dialog" : undefined} aria-label={empty ? drawerLabel(view) : undefined} className="doan-floating doan-menu doan-frame-list pw-drawer" align="center" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={event => {
        event.preventDefault();
        const start = focusedRowAfter(rows, null);
        move(start, true);
        requestAnimationFrame(() => { const node = start === null ? undefined : nodes.current.get(start); if (node && document.activeElement === node) move(start, true); });
      }}>
      {empty ? <p className="doan-menu-head pw-drawer-empty">{EMPTY_DRAWER}</p>
        : <div role="listbox" aria-label={drawerLabel(view)} onKeyDown={keydown}>
          {rows.map(row => <div key={row.key} role="option" aria-current={row.current ? "location" : undefined}
            tabIndex={row.key === active ? 0 : -1} title={row.name} className="doan-menu-item doan-frame-row"
            ref={node => { if (node) nodes.current.set(row.key, node); else nodes.current.delete(row.key); }}
            onFocus={() => setFocused(row.key)}
            onPointerMove={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}
            onClick={() => pick(row)}>
            <span className="doan-frame-num">{row.number}</span><span className="doan-frame-name">{row.name}</span>{row.current && <span className="doan-frame-viewing">Playing</span>}
          </div>)}
        </div>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>{empty && <span className="sr-only" id={EMPTY_DRAWER_ID}>{EMPTY_DRAWER}</span>}</>;
}
