import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationError } from "../main/conversation/ipc";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { PROVIDER_NAMES } from "./agentAuthView";
import { agentPresence, type AgentPresence } from "./agentPresence";
import type { CanvasState } from "./CanvasController";
import { partitionDots, dotScale, type Dot } from "./dotField";
import { groupProjects } from "./homeCards";

// The agent indicator on the board (buzz-canvas design §2 '에이전트 작업 표시').

// The canvas the indicator reads, with its project root: the open canvas while its project is a listed one and the page
// is a listed canvas. Loading, failed and no-width canvases count (Stop is needed while the HTML is broken); an unlisted
// page or a project problem has none. The root is part of the identity: worktrees of one repository share canvas ids
// and paths.
export interface WorkingCanvas { root: string; canvas: Canvas }
export function workingCanvas(open: CanvasState["open"], unlisted: boolean, entry: FolderEntry | undefined): WorkingCanvas | null {
  if (!open || unlisted || entry?.kind !== "list" || entry.path !== open.folder) return null;
  return { root: open.folder, canvas: open.row.id ? { path: open.canvas, id: open.row.id } : { path: open.canvas } };
}

// HomeRun's list state for the root: a list still loading or failed is a failed read to agentPresence.
export function listForPresence(state: readonly ConversationSummary[] | "loading" | "error" | undefined): readonly ConversationSummary[] | null {
  return Array.isArray(state) ? state : null;
}

// presence null: only a terminal session works on the canvas (terminal-agent-activity), so there is nothing to Stop.
export type CanvasAgentState = { root: string; presence: AgentPresence; provider: string } | { root: string; presence: null; terminal: true };

// agentPresence with the provider's display name, which the Stop failure toast names. A failed read keeps the previous
// presence, and with it the provider, only within the same project: a twin canvas in another worktree (same id or
// path) must never show, or Stop, the first project's conversation (RBR5). Without an app conversation working or
// waiting on it, a terminal session's `doan work` on the canvas (`work`, root + path) shows the terminal variant, so
// the indicator stays when the app turn ends and the terminal session goes on.
export function canvasAgent(list: readonly ConversationSummary[] | null, target: WorkingCanvas | null, previous: CanvasAgentState | null, work: readonly WorkItem[]): CanvasAgentState | null {
  if (!target) return null;
  const kept = previous?.root === target.root ? previous : null;
  const presence = agentPresence(list, target.canvas, kept?.presence ?? null);
  if (presence) {
    const listed = list?.find(c => c.conversationId === presence.conversationId);
    return { root: target.root, presence, provider: listed ? PROVIDER_NAMES[listed.provider] : kept?.presence ? kept.provider : "" };
  }
  return work.some(item => item.root === target.root && item.path === target.canvas.path) ? { root: target.root, presence: null, terminal: true } : null;
}

// A terminal session on the open canvas's path in another worktree of the same project (DESIGN 'Terminal work in another worktree').
// The group is the sidebar's (`groupProjects`), so the notice never names a worktree the sidebar puts elsewhere.
// Only a list worktree that lists the path counts: its Open needs that row. With several, the last in `work` wins
// (WorkItem has no time). This root's own session wins, and the caller lets an app conversation win too. The label is
// the branch, else the folder name (a detached HEAD included).
export function siblingWork(work: readonly WorkItem[], target: WorkingCanvas | null, entries: readonly FolderEntry[]): { root: string; label: string } | null {
  if (!target) return null;
  const path = target.canvas.path;
  if (work.some(item => item.root === target.root && item.path === path)) return null;
  const group = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : []))).find(card => card.rows.some(row => row.path === target.root));
  for (const item of [...work].reverse()) {
    if (item.path !== path || item.root === target.root) continue;
    const entry = group?.rows.find(row => row.path === item.root);
    if (entry?.kind !== "list" || !entry.canvases.some(row => row.path === path)) continue;
    return { root: entry.path, label: entry.git?.branch ?? entry.path.split("/").filter(Boolean).at(-1) ?? entry.path };
  }
  return null;
}

export interface AgentNoticeView {
  text: string;
  // The dot stops while the agent waits for an answer.
  steady: boolean;
  // null: a terminal session, which the app cannot stop.
  action: { kind: "stop"; label: "Stop" | "Stopping…"; disabled: boolean } | { kind: "open"; label: "Open"; name: "Open the request" } | null;
}

// `stopping` is the conversation whose Stop was pressed and whose turn has not ended yet. `terminal`: a terminal session
// works on the canvas; it shows only without an app presence, with the same words and no button (user decision D1).
export function agentNoticeView(presence: AgentPresence | null, stopping: string | null, terminal: boolean): AgentNoticeView | null {
  if (!presence) return terminal ? { text: "Agent is working", steady: false, action: null } : null;
  // A fixed name, not the provider's (dogfooding): the panel beside the board already says which agent this is.
  if (presence.kind === "waiting") return { text: "Agent needs your answer", steady: true, action: { kind: "open", label: "Open", name: "Open the request" } };
  const held = stopping === presence.conversationId;
  return { text: "Agent is working", steady: false, action: { kind: "stop", label: held ? "Stopping…" : "Stop", disabled: held } };
}

// "Stopping…" lasts until the list shows the turn ended (no presence) or another conversation takes the canvas.
export function settleStopping(stopping: string | null, presence: AgentPresence | null): string | null {
  return stopping !== null && presence?.conversationId === stopping ? stopping : null;
}

export function stopFailedText(provider: string): string {
  return `Couldn’t stop ${provider}. Try again.`;
}

// Stop without a confirmation. interruptConversation answers a ConversationError instead of rejecting; either way a
// failure comes back as the toast's text, null when main took the stop.
export async function stopTurn(conversationId: string, provider: string, interrupt: (request: { conversationId: string }) => Promise<void | ConversationError>): Promise<string | null> {
  try {
    const reply = await interrupt({ conversationId });
    return reply && "error" in reply ? stopFailedText(provider) : null;
  } catch {
    return stopFailedText(provider);
  }
}

// The dot field (design §2): malmoi's DotField (components/signin/dot-field.tsx, lib/signin/dot-field.ts at 6dcdd575)
// with doan's values. The alphas are twice malmoi's base (dogfooding #4): white dots at 0.08 barely showed on the
// light board.
export const DOT_FIELD = { gap: 12, baseRadius: 1.5, maxRadius: 2, baseAlpha: 0.16, maxAlpha: 0.5, radius: 320, speed: 320, rows: 5 } as const;

type DotContext = Pick<CanvasRenderingContext2D, "globalAlpha" | "fillStyle" | "clearRect" | "beginPath" | "moveTo" | "arc" | "fill">;

// Dots outside the cursor's radius all share the base size and alpha, so they go into one path and one fill (malmoi R8):
// a full board is thousands of dots each frame.
export function drawDotField(ctx: DotContext, width: number, height: number, dots: Dot[], spot: Dot | null, color: string): void {
  const { baseRadius, maxRadius, baseAlpha, maxAlpha, radius } = DOT_FIELD;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  const { near, far } = partitionDots(dots, spot, radius);
  if (far.length) {
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    for (const dot of far) { ctx.moveTo(dot.x + baseRadius, dot.y); ctx.arc(dot.x, dot.y, baseRadius, 0, Math.PI * 2); }
    ctx.fill();
  }
  for (const dot of near) {
    const distance = Math.hypot(dot.x - spot!.x, dot.y - spot!.y);
    ctx.globalAlpha = dotScale(distance, radius, baseAlpha, maxAlpha);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dotScale(distance, radius, baseRadius, maxRadius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The field's animation frames. `draw` gets the time the cursor has travelled, or null for the still field of reduced
// motion. Paused, it asks for no frame: a hidden workspace or window still runs requestAnimationFrame, so the field
// must stop itself there (design §2). Resuming continues the sweep where it paused.
export class DotFieldLoop {
  private frame: number | null = null;
  private running = false;
  private elapsed = 0;
  private start: number | null = null;
  constructor(private readonly host: { draw(elapsed: number | null): void; reducedMotion(): boolean; request(run: (now: number) => void): number; cancel(frame: number): void }) {}

  set({ running }: { running: boolean }): void {
    if (running === this.running) return;
    this.running = running;
    this.stop();
    if (!running) return;
    if (this.host.reducedMotion()) { this.host.draw(null); return; }
    this.frame = this.host.request(this.tick);
  }

  // The canvas was resized and cleared: a running loop paints on its next frame, a paused or still one now.
  resized(): void {
    if (this.frame !== null) return;
    this.host.draw(this.host.reducedMotion() ? null : this.elapsed);
  }

  dispose(): void { this.running = false; this.stop(); }

  private stop(): void {
    if (this.frame !== null) this.host.cancel(this.frame);
    this.frame = null;
    this.start = null;
  }

  private tick = (now: number): void => {
    this.frame = null;
    if (!this.running) return;
    if (this.start === null) this.start = now - this.elapsed;
    this.elapsed = now - this.start;
    this.host.draw(this.elapsed);
    this.frame = this.host.request(this.tick);
  };
}
