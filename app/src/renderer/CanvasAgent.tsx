import { useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { agentNoticeView, canvasAgent, DOT_FIELD, DotFieldLoop, drawDotField, listForPresence, settleStopping, stopTurn, type CanvasAgentState } from "./agentIndicator";
import { autoCursor, dotGrid, type Dot } from "./dotField";

// The agent indicator on the board while this canvas's current conversation works or waits (buzz-canvas design §2
// '에이전트 작업 표시', .doan/canvases/buzz-canvas.html 'agent-working', 'agent-waiting'). The glow and the dot field take
// no pointer input; the notice floats at the board's top centre with one button. Reference: ego lite's agent tab as the
// user described it (2026-11-01); its values live in a native view and were not read (design §2).
// `list` is HomeRun's list state for the canvas's project; `running` is false while the workspace is hidden or the
// Overview covers the canvas, which pauses the dot field.
export function CanvasAgent({ list, canvas, running, onOpen, onStopFailed }: {
  list: readonly ConversationSummary[] | "loading" | "error" | undefined; canvas: Canvas | null; running: boolean;
  onOpen(): void; onStopFailed(text: string): void;
}) {
  // The last answer, kept across a failed list read (agentPresence).
  const previous = useRef<CanvasAgentState | null>(null);
  const agent = canvasAgent(listForPresence(list), canvas, previous.current);
  previous.current = agent;
  const presence = agent?.presence ?? null;
  const [stopping, setStopping] = useState<string | null>(null);
  const held = settleStopping(stopping, presence);
  useEffect(() => { if (stopping !== null && held === null) setStopping(null); }, [stopping, held]);
  const view = agentNoticeView(presence, held);
  if (!agent || !view) return null;

  const stop = () => {
    if (view.action.kind !== "stop" || view.action.disabled) return;
    const { conversationId } = agent.presence;
    setStopping(conversationId);
    void stopTurn(conversationId, agent.provider, request => window.doan.interruptConversation(request)).then(failed => {
      if (failed === null) return;
      setStopping(current => current === conversationId ? null : current);
      onStopFailed(failed);
    });
  };
  const { action } = view;
  return <>
    <div className="doan-agent-glow" aria-hidden="true"><DotField running={running} /></div>
    <div className="doan-canvas-top">
      <div className="doan-agent">
        <span className="doan-agent-dot" data-steady={view.steady ? "" : undefined} aria-hidden="true" />
        <span className="doan-agent-text" role="status">{view.text}</span>
        {action.kind === "stop"
          // aria-disabled, not disabled: "Stopping…" keeps focus (design §2 'Esc와 포커스').
          ? <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-disabled={action.disabled || undefined} onClick={stop}>{action.label}</button>
          : <button type="button" className="doan-button doan-agent-action" data-ui-size="sm" aria-label={action.name} onClick={onOpen}>{action.label}</button>}
      </div>
    </div>
  </>;
}

// The board-wide dot field (design §2): canvas 2D, a virtual cursor sweeping the board, the colour read from the
// element's computed `color` so the theme's role decides it.
function DotField({ running }: { running: boolean }) {
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
