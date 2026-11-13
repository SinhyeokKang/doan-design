import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { Popover } from "radix-ui";
import { ArrowLeft, ArrowRight, ChevronDown, CircleSlash, FileWarning, RotateCw, SquareDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { PROTOTYPE_LOAD_TIMEOUT_MS, type FramesMessage, type PrototypeSnapshot, type PrototypeView, type PrototypeWindowApi, type RunMessage } from "../../main/prototype/ipc";
import { prototypeIframeBox } from "../../main/prototype/fit";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { drawerKeyTarget, drawerTypeahead, focusedRowAfter } from "../frameDrawerList";
import { currentRun, forwardedMessage, layersForSnapshot, layersForView, NO_LAYERS, type HostLayers } from "./host";
import { CLOSE, covered, DETAILS, drawerLabel, drawerRows, EMPTY_DRAWER, liveText, LOADING_LABEL, RETRY, stateScene, windowTitle, type DrawerRow, type SceneIcon } from "./view";

// The prototype window (PRODUCT §3 Show, one frame): the main window's shell without a sidebar, a header of Back,
// Forward, Reload and the playing frame's name, and the frame's own document in a sandboxed iframe in the content
// panel. Every decision is main's; this window draws its view, hosts the run's iframe and forwards the run's reports.

export type PrototypeApi = PrototypeWindowApi & { onSnapshot(listener: (snapshot: PrototypeSnapshot) => void): () => void };

// The reading line waits so a quick load does not flash it in, as the shipped problem overlay's does.
const READING_DELAY_MS = 300;
const SCENE_HEADING_ID = "prototype-state-heading", SCENE_LINE_ID = "prototype-state-line";
// The empty drawer's sentence as the name button's description: focus stays on the button when that drawer opens.
const EMPTY_DRAWER_ID = "prototype-drawer-empty";
const ICONS: Record<SceneIcon, LucideIcon> = { read: FileWarning, init: TriangleAlert, frame: SquareDashed, support: CircleSlash };

export function PrototypeWindow({ api }: { api: PrototypeApi }) {
  const [view, setView] = useState<PrototypeView | null>(null);
  const [layers, setLayers] = useState<HostLayers>(NO_LAYERS);
  const [readingGen, setReadingGen] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let changed = false;
    const stop = api.onChanged(next => { changed = true; setView(next); });
    void api.read().then(first => { if (!changed) setView(first); }, () => {});
    return stop;
  }, [api]);

  useEffect(() => api.onSnapshot(({ gen, png }) => {
    const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
    setLayers(previous => {
      const next = layersForSnapshot(previous, { gen, url }, viewRef.current?.gen ?? null);
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

  const readingShown = phase === "loading" && readingGen === gen;
  return <WindowShell view={view} layers={layers} readingShown={readingShown} details={details} live={liveText(view, readingShown)}
    content={content} heading={heading} frames={frames.current}
    onBack={() => void api.back()} onForward={() => void api.forward()} onReload={() => { if (gen !== null) void api.reload(gen); }}
    onChoose={frame => void api.choose(frame)} onClose={() => void api.close()} onDetails={() => setDetails(open => !open)} />;
}

export interface ShellProps {
  view: PrototypeView | null;
  layers: HostLayers;
  readingShown: boolean;
  details: boolean;
  live: string;
  content?: RefObject<HTMLDivElement | null>;
  heading?: RefObject<HTMLHeadingElement | null>;
  frames?: Map<number, HTMLIFrameElement>;
  onBack(): void; onForward(): void; onReload(): void; onChoose(frame: string): void; onClose(): void; onDetails(): void;
}

// The window's markup. Header controls come before the content in the Tab order; the state overlay covers the content
// panel only, so they stay usable over it.
export function WindowShell({ view, layers, readingShown, details, live, content, heading, frames, onBack, onForward, onReload, onChoose, onClose, onDetails }: ShellProps) {
  const scene = view === null ? null : stateScene(view);
  const coveredNow = view !== null && covered(view.phase);
  return <div className="pw">
    <header className="top shell-top pw-top">
      <span className="traffic-space" aria-hidden="true" />
      <div className="shell-history">
        <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Back" disabled={!view?.canGoBack} onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Forward" disabled={!view?.canGoForward} onClick={onForward}><ArrowRight aria-hidden="true" /></button>
        <IconTip label="Reload prototype"><button type="button" className="doan-icon-button" data-ui-placement="chrome" aria-label="Reload prototype" disabled={view === null} onClick={onReload}><RotateCw aria-hidden="true" /></button></IconTip>
      </div>
      {view !== null && <FrameMenu view={view} onChoose={onChoose} />}
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

function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

// The content panel: the run's iframes (a new element per run; one loading stays hidden under the previous screen
// until it is ready) or, with no run on screen, main's still image; inert while anything but a ready run shows, then
// the state overlay.
function ContentPanel({ view, layers, covered, content, frames, children }: { view: PrototypeView | null; layers: HostLayers; covered: boolean; content?: RefObject<HTMLDivElement | null> | undefined; frames?: Map<number, HTMLIFrameElement> | undefined; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const markWidth = view?.run?.markWidth ?? 0;
  const box = markWidth > 0 && width > 0 ? prototypeIframeBox(width, markWidth) : { x: 0, width: null };
  // The still image is the iframe's area, so it takes the iframe's box.
  const place = { left: box.x, ...(box.width === null ? {} : { width: box.width }) };
  return <div className="pw-panel" ref={panel}>
    <div className="pw-content" ref={content} inert={covered}>
      {layers.snapshot && layers.visible === null && <img className="pw-snapshot" src={layers.snapshot.url} alt="" style={place} />}
      {layers.frames.map(frame => <iframe key={frame.gen} className="pw-frame" src={frame.url} sandbox="allow-scripts allow-forms" title={view?.title ?? "Prototype"}
        ref={node => { if (!frames) return; if (node) frames.set(frame.gen, node); else frames.delete(frame.gen); }}
        style={{ ...place, visibility: layers.visible === frame.gen ? "visible" : "hidden" }} />)}
    </div>
    {children}
  </div>;
}

// The frame name, centred in the window, opens this canvas's marked frames. It names the whole title in the shared
// Tooltip only while the name is cut short.
function FrameMenu({ view, onChoose }: { view: PrototypeView; onChoose(frame: string): void }) {
  const [open, setOpen] = useState(false);
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

  const pick = (row: DrawerRow) => { setOpen(false); onChoose(row.id); };
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
  const trigger = <button type="button" className="shell-search pw-name" aria-haspopup={empty ? "dialog" : "listbox"}>
    <span className="pw-name-text" ref={text}>{view.title}</span><ChevronDown className="chev" aria-hidden="true" /></button>;
  return <><Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setFocused(null); }}>
    <Tooltip open={cut && tip} onOpenChange={setTip}><TooltipTrigger asChild><Popover.Trigger asChild {...(empty ? { "aria-describedby": EMPTY_DRAWER_ID } : {})}>{trigger}</Popover.Trigger></TooltipTrigger><TooltipContent>{view.title}</TooltipContent></Tooltip>
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
