import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { agentNoticeView, canvasAgent, canvasWorkTarget, DOT_FIELD, DotFieldLoop, drawDotField, listForPresence, pickWork, settleStopping, siblingWork, stopTurn, type AgentNoticeView, type CanvasAgentState, type WorkingCanvas } from "./agentIndicator";
import type { ConversationWork } from "../main/conversationWork";
import type { CanvasWorkTarget } from "./CanvasController";
import type { CanvasFrameRect } from "./canvasMessage";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { autoCursor, dotGrid, type Dot } from "./dotField";
import { NoticeTyping, typesOn, type NoticeMoment, type TypedText } from "./noticeTyping";

// The agent indicator on the board while this canvas's current conversation works or waits (buzz-canvas design §2
// '에이전트 작업 표시', .doan/canvases/buzz-canvas.html 'agent-working', 'agent-waiting'). The glow and the dot field take
// no pointer input; the notice floats at the board's top centre with one button. Reference: ego lite's agent tab as the
// user described it (2026-11-01); its values live in a native view and were not read (design §2).
// `list` is HomeRun's list state for the canvas's project; `running` is false while the workspace is hidden or the
// Overview covers the canvas, which pauses the dot field. `children` are the canvas notices: they stack in the same
// top-centre column under the agent notice (design §0 '확정 값'), so the column stays when no agent shows.
// `work`: the canvases terminal sessions work on (terminal-agent-activity, draft frame terminal-notice); one on this
// canvas shows the same indicator without a button.
// `entries` group the worktrees: with nothing on this canvas here, a session on its path in another worktree of the
// project shows a notice with Open and no glow (DESIGN 'Terminal work in another worktree', draft frame sibling-notice).
// `onOpenSibling` gets that worktree's root.
// work-update (draft .doan/canvases/work-update.html 'notice-states', 'notice-typing'): `doan work update` content words
// the notice. `conversationWork` is app conversations' content (a project conversation, or a canvas conversation naming
// another canvas, shows the indicator without Stop); `frames` is the open document's layout, for the frame's title.
// `onWork` gets the open canvas's work for the controller's marker and following, once per change.
export function CanvasAgent({ list, canvas, running, work, conversationWork = [], frames = null, entries, onOpen, onOpenSibling, onStopFailed, onWork, children }: {
  list: readonly ConversationSummary[] | "loading" | "error" | undefined; canvas: WorkingCanvas | null; running: boolean; work: readonly WorkItem[];
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
  const title = useRef<{ key: string; title: string } | null>(null);
  let name: string | undefined;
  if (picked?.frame !== undefined) {
    const key = `${picked.source}\0${picked.frame}`, found = frames?.find(frame => frame.id === picked.frame);
    name = found ? found.title ?? found.id : title.current?.key === key ? title.current.title : undefined;
    title.current = name === undefined ? null : { key, title: name };
  }
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
        <span className="doan-agent-dot" data-steady={view.steady ? "" : undefined} aria-hidden="true" />
        <WorkWords view={view} moment={moment} />
        {!action ? null : action.kind === "stop"
          // aria-disabled, not disabled: "Stopping" keeps focus (design §2 'Esc와 포커스').
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
        <span className="doan-agent-dot" aria-hidden="true" />
        <Tooltip><TooltipTrigger asChild><span className="doan-agent-text" role="status">{`Agent is working in ${sibling.label}`}</span></TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={14}>{`Agent is working on this canvas in ${sibling.label}`}</TooltipContent></Tooltip>
        <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-label={`Open this canvas in ${sibling.label}`} onClick={() => onOpenSibling(sibling.root)}>Open</button>
      </div>}
      {children}
    </div>
  </>;
}

// The notice's words (work-update decisions 19–20): the visible line is aria-hidden, the text with its caret right after
// the last visible character; the live region beside it holds the final words from the first moment. A long text
// ellipsizes and its tooltip shows it whole. While a change erases and types, the line keeps a floor of the shorter
// text's width plus the caret, in px (a percentage resolves to 0 in the content-sized card, design §9) and capped by
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
    const animate = typesOn(last.current, moment);
    last.current = moment;
    typing.current?.set(view.text, animate);
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

// The board-wide dot field (design §2): canvas 2D, a virtual cursor sweeping the board, the colour read from the
// element's computed `color` so the theme's role decides it.
export function DotField({ running }: { running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loop = useRef<DotFieldLoop | null>(null);
  const [windowShown, setWindowShown] = useState(true);
  const [pageShown, setPageShown] = useState(true);
  const on = running && windowShown && pageShown;
  const shown = useRef(on); shown.current = on;
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext("2d");
    if (!node || !ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let size = { width: 0, height: 0 }, dots: Dot[] = [], color = "";
    const field = new DotFieldLoop({
      reducedMotion: () => motion.matches,
      request: run => requestAnimationFrame(run),
      cancel: frame => cancelAnimationFrame(frame),
      draw: elapsed => {
        const { width, height } = size;
        const spot = elapsed === null ? null : autoCursor(elapsed, width, height, DOT_FIELD.speed, DOT_FIELD.rows, DOT_FIELD.radius);
        drawDotField(ctx, width, height, dots, spot, color);
      },
    });
    loop.current = field;
    const resize = () => {
      const rect = node.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      size = { width: rect.width, height: rect.height };
      node.width = Math.round(rect.width * ratio); node.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      dots = dotGrid(rect.width, rect.height, DOT_FIELD.gap);
      color = getComputedStyle(node).color;
      field.resized();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    // A change of the setting restarts the loop in the new mode.
    const restart = () => { const on = shown.current; field.set({ running: false }); field.set({ running: on }); };
    motion.addEventListener("change", restart);
    return () => { observer.disconnect(); motion.removeEventListener("change", restart); field.dispose(); loop.current = null; };
  }, []);
  useEffect(() => {
    const visibility = () => setPageShown(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const stop = window.doan.onWindowVisible(setWindowShown);
    return () => { document.removeEventListener("visibilitychange", visibility); stop(); };
  }, []);
  useEffect(() => { loop.current?.set({ running: on }); }, [on]);
  return <canvas className="doan-agent-dots" ref={canvas} />;
}
