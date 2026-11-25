import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { agentNoticeView, canvasAgent, canvasWorkTarget, workFrameTitle, type TitleCache, listForPresence, pickWork, siblingWork, type AgentNoticeView, type CanvasAgentState, type WorkingCanvas } from "./agentIndicator";
import type { ConversationWork } from "../main/conversationWork";
import type { CanvasWorkTarget } from "./CanvasController";
import type { CanvasFrameRect } from "./canvasMessage";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { DotFieldMessage, DotFieldSize } from "./dotField";
import { crossesBoundary, NoticeTyping, typesOn, type NoticeMoment, type TypedText } from "./noticeTyping";
import { pickArtist, type BuddyId } from "./buddies";
import { onDevicePixelRatio } from "./devicePixels";

// The glow and the dot field take no pointer input. `running` is false while the workspace is hidden or the Overview
// covers the canvas, which pauses the dot field. `children` are the canvas notices, stacked under the agent notice.
export function CanvasAgent({ list, shown = null, canvas, buddy, running, work, conversationWork = [], frames = null, entries, onOpen, onOpenSibling, onWork, children }: {
  list: readonly ConversationSummary[] | "loading" | "error" | undefined; shown?: string | null; canvas: WorkingCanvas | null; buddy: BuddyId; running: boolean; work: readonly WorkItem[];
  conversationWork?: readonly ConversationWork[]; frames?: readonly CanvasFrameRect[] | null;
  entries: readonly FolderEntry[]; onOpen(conversationId: string): void; onOpenSibling(root: string): void;
  onWork?(target: CanvasWorkTarget | null): void; children?: ReactNode;
}) {
  // The last answer, kept across a failed list read (boardPresence).
  const previous = useRef<CanvasAgentState | null>(null);
  const agent = canvasAgent(listForPresence(list), canvas, previous.current, work, conversationWork, shown);
  previous.current = agent;
  const presence = agent?.presence ?? null;
  const picked = agent ? pickWork(canvas, presence, conversationWork, work) : null;
  const target = canvasWorkTarget(canvas, picked, conversationWork, work);
  const targetKey = JSON.stringify(target);
  const told = useRef(onWork); told.current = onWork;
  useEffect(() => { told.current?.(target); }, [targetKey]);
  // The frame's title as last found, so a reload that has not laid out yet keeps it instead of falling back to the id.
  const title = useRef<TitleCache | null>(null);
  const named = workFrameTitle(title.current, canvas, picked, frames);
  title.current = named.cache;
  const name = named.title;
  const view = agentNoticeView(presence, agent !== null && agent.presence === null, picked && { ...picked, ...(name === undefined ? {} : { title: name }) });
  const moment: NoticeMoment = {
    canvas: canvas && `${canvas.root}\0${canvas.canvas.path}`, visible: running,
    content: picked ? `${picked.source}@${picked.touched}` : presence ? `presence:${presence.conversationId}` : null, waiting: presence?.kind === "waiting",
  };
  // This checkout's own work, app or terminal, wins the column.
  const sibling = agent === null ? siblingWork(work, canvas, entries) : null;

  const action = view?.action;
  // One return shape, so the notices below keep their nodes when the indicator comes and goes.
  return <>
    {view && <div className="doan-agent-glow" aria-hidden="true"><DotField running={running} /></div>}
    <div className="doan-canvas-top">
      {view && <div className={action ? "doan-agent" : "doan-agent doan-agent-terminal"}>
        <BuddyArtist buddy={buddy} still={view.steady || !running} />
        <WorkWords view={view} moment={moment} />
        {action && <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-label={action.name} onClick={() => { if (presence) onOpen(presence.conversationId); }}>{action.label}</button>}
      </div>}
      {/* The tooltip opens below: above, a two-line sentence crossed into the canvas header. 14 = the usual 4px gap plus
         the 10px between the 20px text line and the 40px capsule's bottom. */}
      {sibling && <div className="doan-agent doan-agent-sibling">
        <BuddyArtist buddy={buddy} still={!running} />
        <Tooltip><TooltipTrigger asChild><span className="doan-agent-text" role="status">{`Agent is working in ${sibling.label}`}</span></TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={14}>{`Agent is working on this canvas in ${sibling.label}`}</TooltipContent></Tooltip>
        <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-label={`Open this canvas in ${sibling.label}`} onClick={() => onOpenSibling(sibling.root)}>Open</button>
      </div>}
      {children}
    </div>
  </>;
}

// The visible line is aria-hidden; the live region holds the final words from the first moment. While a change runs,
// the line keeps a px floor of the shorter text plus the caret (a percentage resolves to 0 in the content-sized card).
function WorkWords({ view, moment }: { view: AgentNoticeView; moment: NoticeMoment }) {
  const [typed, setTyped] = useState<TypedText>({ text: view.text, minWidth: null, typing: false });
  const [tip, setTip] = useState(false);
  const line = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null), measure = useRef<HTMLSpanElement>(null);
  const cap = useRef<number | null>(null);
  const typing = useRef<NoticeTyping | null>(null);
  const last = useRef<NoticeMoment | null>(null);
  // A layout effect, so it exists before the one below hands it the first words (layout effects run before passive ones).
  useLayoutEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const width = (value: string) => { const node = measure.current; if (!node) return 0; node.textContent = value; return node.getBoundingClientRect().width; };
    typing.current = new NoticeTyping({
      show: setTyped,
      reducedMotion: () => motion.matches,
      measure: (from, to) => {
        const row = line.current, card = row?.closest(".doan-agent"), column = card?.parentElement;
        cap.current = row && card instanceof HTMLElement && column ? column.clientWidth - (card.offsetWidth - row.offsetWidth) : null;
        const widths = { from: width(from), to: width(to) };
        if (measure.current) measure.current.textContent = "";
        return widths;
      },
    });
    return () => { typing.current?.dispose(); typing.current = null; };
  }, []);
  useLayoutEffect(() => {
    const crossed = crossesBoundary(last.current, moment), animate = typesOn(last.current, moment);
    last.current = moment;
    if (crossed) typing.current?.settle(view.text);
    else typing.current?.set(view.text, animate);
  });
  // The caret's own width and gap (1.5 + 2px, within --space-1) are added to the text floor, never measured with the text.
  const floor = typed.minWidth === null ? undefined : cap.current === null ? `calc(${typed.minWidth}px + var(--space-1))` : `min(calc(${typed.minWidth}px + var(--space-1)), ${cap.current}px)`;
  const cut = () => { const node = text.current; return !!node && node.scrollWidth > node.clientWidth; };
  return <>
    <Tooltip open={tip} onOpenChange={open => setTip(open && cut())}>
      <TooltipTrigger asChild>
        <span className="doan-agent-line" aria-hidden="true" ref={line} style={floor === undefined ? undefined : { minWidth: floor }}>
          <span className="doan-agent-row"><span className="doan-agent-text" ref={text}>{typed.text}</span>
            {/* Waiting asks the person to act: no caret. */}
            {!view.steady && <span className="doan-agent-caret" data-typing={typed.typing ? "" : undefined} />}</span>
        </span>
      </TooltipTrigger>
      {/* Below the card, like the sibling notice's (14 clears the capsule). */}
      <TooltipContent side="bottom" sideOffset={14}>{view.text}</TooltipContent>
    </Tooltip>
    <span className="doan-agent-measure" aria-hidden="true" ref={measure} />
    <span className="sr-only" role="status">{view.status}</span>
  </>;
}

// The pick holds while the buddy stays, so working, stopping and waiting keep one picture. A GIF cannot pause, so a still
// buddy is the variant's first frame; the picture source keeps it under reduced motion.
export function BuddyArtist({ buddy, still }: { buddy: BuddyId; still: boolean }) {
  const [picked, setPicked] = useState(() => pickArtist(buddy, null, Math.random));
  const current = pickArtist(buddy, picked, Math.random);
  if (current !== picked) setPicked(current);
  const { variant } = current;
  return <span className="doan-agent-artist" aria-hidden="true"><picture>
    <source srcSet={variant.rest} media="(prefers-reduced-motion: reduce)" />
    <img src={still ? variant.rest : variant.gif} alt="" />
  </picture></span>;
}

// Two virtual spots sweep the board, coloured by the element's computed `color`. A module Worker draws on the transferred
// canvas (dotFieldWorker.ts); `start` is injected in tests, which have no Worker or transferControlToOffscreen.
export interface DotFieldPort { post(message: Exclude<DotFieldMessage, { kind: "start" }>): void; close(): void }
export type StartDotField = (canvas: HTMLCanvasElement, init: { size: DotFieldSize; color: string; reducedMotion: boolean }) => DotFieldPort;

function startDotWorker(canvas: HTMLCanvasElement, init: { size: DotFieldSize; color: string; reducedMotion: boolean }): DotFieldPort {
  const worker = new Worker(new URL("./dotFieldWorker.ts", import.meta.url), { type: "module" });
  // The canvas is already transferred, so a script that fails to load leaves the field empty; say so in the log.
  worker.addEventListener("error", event => console.error("dot field worker failed", event.message));
  const offscreen = canvas.transferControlToOffscreen();
  const message: DotFieldMessage = { kind: "start", canvas: offscreen, ...init };
  worker.postMessage(message, [offscreen]);
  return { post: next => worker.postMessage(next), close: () => worker.terminate() };
}

// A canvas can be transferred only once, and StrictMode (dev) runs an effect's cleanup and the effect again on the same
// canvas: a cleanup ends the Worker after the current task, and a run on the same canvas before then takes it back.
const kept = new WeakMap<HTMLCanvasElement, { port: DotFieldPort; size: DotFieldSize; closing: ReturnType<typeof setTimeout> }>();

export function DotField({ running, start = startDotWorker }: { running: boolean; start?: StartDotField }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const port = useRef<DotFieldPort | null>(null);
  const starter = useRef(start); starter.current = start;
  const [windowShown, setWindowShown] = useState(true);
  const [pageShown, setPageShown] = useState(true);
  const on = running && windowShown && pageShown;
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const measure = (): DotFieldSize => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, ratio: window.devicePixelRatio || 1 }; };
    let color = getComputedStyle(node).color;
    const previous = kept.get(node);
    if (previous) { clearTimeout(previous.closing); kept.delete(node); }
    let size = previous?.size ?? measure();
    const field = previous?.port ?? starter.current(node, { size, color, reducedMotion: motion.matches });
    port.current = field;
    const recolor = () => {
      const next = getComputedStyle(node).color;
      if (next === color) return;
      color = next;
      field.post({ kind: "color", color });
    };
    // ResizeObserver calls back once right after observe(); the size the Worker already has would only clear its field.
    const resize = () => {
      recolor();
      const next = measure();
      if (next.width === size.width && next.height === size.height && next.ratio === size.ratio) return;
      size = next;
      field.post({ kind: "size", size });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    const ratio = onDevicePixelRatio(resize);
    const restart = () => field.post({ kind: "motion", reduced: motion.matches });
    motion.addEventListener("change", restart);
    scheme.addEventListener("change", recolor);
    return () => {
      observer.disconnect(); ratio(); motion.removeEventListener("change", restart); scheme.removeEventListener("change", recolor);
      port.current = null;
      kept.set(node, { port: field, size, closing: setTimeout(() => { kept.delete(node); field.close(); }, 0) });
    };
  }, []);
  useEffect(() => {
    const visibility = () => setPageShown(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const stop = window.doan.onWindowVisible(setWindowShown);
    return () => { document.removeEventListener("visibilitychange", visibility); stop(); };
  }, []);
  useEffect(() => { port.current?.post({ kind: "running", running: on }); }, [on]);
  return <canvas className="doan-agent-dots" ref={canvas} />;
}
