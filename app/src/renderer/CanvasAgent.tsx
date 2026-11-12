import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { agentNoticeView, canvasAgent, canvasWorkTarget, workFrameTitle, type TitleCache, listForPresence, pickWork, settleStopping, siblingWork, stopTurn, type AgentNoticeView, type CanvasAgentState, type WorkingCanvas } from "./agentIndicator";
import type { ConversationWork } from "../main/conversationWork";
import type { CanvasWorkTarget } from "./CanvasController";
import type { CanvasFrameRect } from "./canvasMessage";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { DotFieldMessage, DotFieldSize } from "./dotField";
import { crossesBoundary, NoticeTyping, typesOn, type NoticeMoment, type TypedText } from "./noticeTyping";
import { pickArtist, type BuddyId } from "./buddies";

// The agent indicator on the board while this canvas's current conversation works or waits (PRODUCT §5 item 2 'Agent indicator',
// .doan/canvases/doan-canvas.html 'agent-working', 'agent-waiting'). The glow and the dot field take
// no pointer input; the notice floats at the board's top centre with one button. Reference: ego lite's agent tab as the
// user described it (2026-11-01); its values live in a native view and were not read.
// `list` is HomeRun's list state for the canvas's project; `running` is false while the workspace is hidden or the
// Overview covers the canvas, which pauses the dot field. `children` are the canvas notices: they stack in the same
// top-centre column under the agent notice, so the column stays when no agent shows.
// `work`: the canvases terminal sessions work on (draft frame terminal-notice); one on this
// canvas shows the same indicator without a button.
// `entries` group the worktrees: with nothing on this canvas here, a session on its path in another worktree of the
// project shows a notice with Open and no glow (DESIGN 'Terminal work in another worktree', draft frame sibling-notice).
// `onOpenSibling` gets that worktree's root.
// work-update (draft .doan/canvases/work-update.html 'notice-states', 'notice-typing'): `doan work update` content words
// the notice. `conversationWork` is app conversations' content (a project conversation, or a canvas conversation naming
// another canvas, shows the indicator without Stop); `frames` is the open document's layout, for the frame's title.
// `onWork` gets the open canvas's work for the controller's marker and following, once per change. `buddy` is the
// chosen buddy, whose painter the notice shows.
export function CanvasAgent({ list, canvas, buddy, running, work, conversationWork = [], frames = null, entries, onOpen, onOpenSibling, onStopFailed, onWork, children }: {
  list: readonly ConversationSummary[] | "loading" | "error" | undefined; canvas: WorkingCanvas | null; buddy: BuddyId; running: boolean; work: readonly WorkItem[];
  conversationWork?: readonly ConversationWork[]; frames?: readonly CanvasFrameRect[] | null;
  entries: readonly FolderEntry[]; onOpen(): void; onOpenSibling(root: string): void; onStopFailed(text: string): void;
  onWork?(target: CanvasWorkTarget | null): void; children?: ReactNode;
}) {
  // The last answer, kept across a failed list read (agentPresence).
  const previous = useRef<CanvasAgentState | null>(null);
  const agent = canvasAgent(listForPresence(list), canvas, previous.current, work, conversationWork);
  previous.current = agent;
  const presence = agent?.presence ?? null;
  const [stopping, setStopping] = useState<string | null>(null);
  const held = settleStopping(stopping, presence);
  useEffect(() => { if (stopping !== null && held === null) setStopping(null); }, [stopping, held]);
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
  const view = agentNoticeView(presence, held, agent !== null && agent.presence === null, picked && { ...picked, ...(name === undefined ? {} : { title: name }) });
  const moment: NoticeMoment = {
    canvas: canvas && `${canvas.root}\0${canvas.canvas.path}`, visible: running,
    content: picked ? `${picked.source}@${picked.touched}` : presence ? `presence:${presence.conversationId}` : null, waiting: presence?.kind === "waiting",
  };
  // This checkout's own work, app or terminal, wins the column.
  const sibling = agent === null ? siblingWork(work, canvas, entries) : null;

  const stop = () => {
    if (!agent?.presence || view?.action?.kind !== "stop" || view.action.disabled) return;
    const { conversationId } = agent.presence;
    setStopping(conversationId);
    void stopTurn(conversationId, agent.provider, request => window.doan.interruptConversation(request)).then(failed => {
      if (failed === null) return;
      setStopping(current => current === conversationId ? null : current);
      onStopFailed(failed);
    });
  };
  const action = view?.action;
  // One return shape, so the notices below keep their nodes when the indicator comes and goes.
  return <>
    {view && <div className="doan-agent-glow" aria-hidden="true"><DotField running={running} /></div>}
    <div className="doan-canvas-top">
      {view && <div className={action ? "doan-agent" : "doan-agent doan-agent-terminal"}>
        <BuddyArtist buddy={buddy} still={view.steady || !running} />
        <WorkWords view={view} moment={moment} />
        {!action ? null : action.kind === "stop"
          // aria-disabled, not disabled: "Stopping" keeps focus.
          // The composer's Stop glyph; "Stopping" spins in its place.
          ? <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-disabled={action.disabled || undefined} onClick={stop}>
            {action.disabled ? <span className="doan-spinner" aria-hidden="true" /> : <Square fill="currentColor" stroke="none" aria-hidden="true" />}{action.label}</button>
          : <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-label={action.name} onClick={onOpen}>{action.label}</button>}
      </div>}
      {/* The text ellipsizes a long label; its tooltip and Open's name carry it whole. The tooltip opens below: the
          notice sits near the board's top edge, and above it a two-line sentence crossed into the canvas header.
          14 = the tooltip's usual 4px gap plus the 10px between the 20px text line and the 40px capsule's bottom, so it
          clears the capsule instead of covering it. */}
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

// The notice's words: the visible line is aria-hidden, the text with its caret right after
// the last visible character; the live region beside it holds the final words from the first moment. A long text
// ellipsizes and its tooltip shows it whole. While a change erases and types, the line keeps a floor of the shorter
// text's width plus the caret, in px (a percentage resolves to 0 in the content-sized card) and capped by
// the width the card can give the line.
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
  // The caret's own width and gap (--space-1 together) are added to the text floor, never measured with the text.
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

// The chosen buddy in the notice's mark slot (.doan/canvases/doany-artist.html, doany-family.html, buddy-choice.html
// 'notice'): Doany paints, types or reads, picked with equal odds when the notice mounts; a friend has its one painter.
// The pick holds while the buddy stays, so working, stopping and waiting keep one picture; the next notice, or a change
// of buddy while it shows, picks again. A GIF cannot pause, so a still buddy is the variant's first frame: waiting, and
// while the workspace is hidden (the dot field pauses then too). The picture source keeps the first frame under
// reduced motion in every state.
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

// The board-wide dot field: canvas 2D, two virtual spots sweeping the board (the second walks the first's
// path backwards, `opposingCursor`), the colour read from the element's computed `color` so the theme's role decides it.
// A module Worker runs the loop and draws on the transferred canvas (dotFieldWorker.ts); this side only reads the page
// (size, device pixel ratio, colour, motion setting, shown) and sends it. `start` is injected in tests, which have no
// Worker or transferControlToOffscreen.
export interface DotFieldPort { post(message: Exclude<DotFieldMessage, { kind: "start" }>): void; close(): void }
export type StartDotField = (canvas: HTMLCanvasElement, init: { size: DotFieldSize; color: string; reducedMotion: boolean }) => DotFieldPort;

function startDotWorker(canvas: HTMLCanvasElement, init: { size: DotFieldSize; color: string; reducedMotion: boolean }): DotFieldPort {
  const worker = new Worker(new URL("./dotFieldWorker.ts", import.meta.url), { type: "module" });
  const offscreen = canvas.transferControlToOffscreen();
  const message: DotFieldMessage = { kind: "start", canvas: offscreen, ...init };
  worker.postMessage(message, [offscreen]);
  return { post: next => worker.postMessage(next), close: () => worker.terminate() };
}

// A canvas can be transferred only once, and StrictMode (dev) runs an effect's cleanup and the effect again on the same
// canvas: a cleanup ends the Worker after the current task, and a run on the same canvas before then takes it back.
const kept = new WeakMap<HTMLCanvasElement, { port: DotFieldPort; closing: ReturnType<typeof setTimeout> }>();

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
    const field = previous?.port ?? starter.current(node, { size: measure(), color, reducedMotion: motion.matches });
    port.current = field;
    const recolor = () => {
      const next = getComputedStyle(node).color;
      if (next === color) return;
      color = next;
      field.post({ kind: "color", color });
    };
    const resize = () => { recolor(); field.post({ kind: "size", size: measure() }); };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    const restart = () => field.post({ kind: "motion", reduced: motion.matches });
    motion.addEventListener("change", restart);
    scheme.addEventListener("change", recolor);
    return () => {
      observer.disconnect(); motion.removeEventListener("change", restart); scheme.removeEventListener("change", recolor);
      port.current = null;
      kept.set(node, { port: field, closing: setTimeout(() => { kept.delete(node); field.close(); }, 0) });
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
