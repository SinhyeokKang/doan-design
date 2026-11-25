import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import type { ConversationWork } from "../main/conversationWork";
import { boardPresence, type AgentPresence, type BoardPresence } from "./agentPresence";
import type { CanvasState, CanvasWorkTarget } from "./CanvasController";
import type { CanvasFrameRect, LayoutMessage } from "./canvasMessage";
import { frameName, frameTitle } from "./canvasTree";
import { groupProjects } from "./homeCards";
import { followTurnKey } from "./workFollow";

// Loading, failed and no-width canvases count. The root is part of the identity: worktrees of one repository share
// canvas ids and paths.
export interface WorkingCanvas { root: string; canvas: Canvas }
export function workingCanvas(open: CanvasState["open"], unlisted: boolean, entry: FolderEntry | undefined): WorkingCanvas | null {
  if (!open || unlisted || entry?.kind !== "list" || entry.path !== open.folder) return null;
  return { root: open.folder, canvas: open.row.id ? { path: open.canvas, id: open.row.id } : { path: open.canvas } };
}

// A list still loading or failed is a failed read to boardPresence.
export function listForPresence(state: readonly ConversationSummary[] | "loading" | "error" | undefined): readonly ConversationSummary[] | null {
  return Array.isArray(state) ? state : null;
}

// A change of `source` does not follow; `key` is the work turn (follow and its stop last one turn). `waiting` keeps
// the marker still.
export interface PickedWork { source: string; key: string; touched: number; frame?: string; note?: string; waiting: boolean }

// The followed conversation decides alone, so another's update never moves the screen; else the last update on this
// root and path wins. App conversation work lives apart from terminal items so it is never counted as terminal work.
export function pickWork(target: WorkingCanvas | null, presence: Pick<AgentPresence, "conversationId" | "kind"> | null, conversations: readonly ConversationWork[], terminal: readonly WorkItem[]): PickedWork | null {
  if (!target) return null;
  const on = (item: { root: string; path: string }) => item.root === target.root && item.path === target.canvas.path;
  const content = (item: { frame?: string; note?: string }) => ({ ...(item.frame === undefined ? {} : { frame: item.frame }), ...(item.note === undefined ? {} : { note: item.note }) });
  const fromConversation = (item: ConversationWork): PickedWork =>
    ({ source: `conversation:${item.conversationId}`, key: followTurnKey(item), touched: item.touched, ...content(item), waiting: presence?.kind === "waiting" && presence.conversationId === item.conversationId });
  if (presence) {
    const own = conversations.find(item => item.conversationId === presence.conversationId && on(item));
    return own ? fromConversation(own) : null;
  }
  let best: PickedWork | null = null;
  for (const item of conversations) if (on(item) && (best === null || item.touched >= best.touched)) best = fromConversation(item);
  for (const item of terminal) {
    if (!on(item) || (best !== null && item.touched < best.touched)) continue;
    best = { source: `terminal:${item.provider ?? ""}:${item.session ?? ""}`, key: followTurnKey(item), touched: item.touched, ...content(item), waiting: false };
  }
  return best;
}

// Built with no work too, so the controller sees a canvas change as entering it.
export function canvasWorkTarget(target: WorkingCanvas | null, picked: PickedWork | null, conversations: readonly ConversationWork[], terminal: readonly WorkItem[]): CanvasWorkTarget | null {
  if (!target) return null;
  const on = (item: { root: string; path: string }) => item.root === target.root && item.path === target.canvas.path;
  const keys = [...conversations.filter(on).map(followTurnKey), ...terminal.filter(on).map(followTurnKey)];
  const work = picked && { source: picked.source, key: picked.key, ...(picked.frame === undefined ? {} : { frame: picked.frame }), waiting: picked.waiting };
  return { root: target.root, path: target.canvas.path, work, keys: [...new Set(keys)] };
}

// The indicator outlives a switch of root or canvas, so the title belongs to one root, path, work turn and frame.
export interface TitleCache { key: string; title: string }
export function workFrameTitle(cache: TitleCache | null, target: WorkingCanvas | null, picked: PickedWork | null, frames: readonly CanvasFrameRect[] | null): { title: string | undefined; cache: TitleCache | null } {
  if (!target || picked?.frame === undefined) return { title: undefined, cache: null };
  const frame = picked.frame;
  const key = JSON.stringify([target.root, target.canvas.path, picked.key, picked.source, frame]), found = frames?.find(item => item.id === frame);
  const title = found ? frameName(found) : cache?.key === key ? cache.title : undefined;
  return { title, cache: title === undefined ? null : { key, title } };
}

// A reload's first layout can report every frame as 0 × 0 before measuring, and following or marking that would place
// the board's origin, not the frame.
export function workFrameRect(layout: Pick<LayoutMessage, "frames"> | null, id: string | undefined): CanvasFrameRect | null {
  if (!layout || id === undefined) return null;
  const frame = layout.frames.find(item => item.id === id);
  return frame && frame.width > 0 && frame.height > 0 ? frame : null;
}

// presence null: a terminal session, a project conversation or a conversation bound to another canvas works on it.
export type CanvasAgentState = { root: string; presence: BoardPresence } | { root: string; presence: null; terminal: true };

// A failed read keeps the previous presence only within the same project: a twin canvas in another worktree must never
// show the first project's conversation.
export function canvasAgent(list: readonly ConversationSummary[] | null, target: WorkingCanvas | null, previous: CanvasAgentState | null, work: readonly WorkItem[], conversations: readonly ConversationWork[] = [], shown: string | null = null): CanvasAgentState | null {
  if (!target) return null;
  const kept = previous?.root === target.root && previous.presence ? previous : null;
  const presence = boardPresence({ list, root: target.root, canvas: target.canvas, shown, previous: kept?.presence ?? null });
  if (presence) return { root: target.root, presence };
  const on = (item: { root: string; path: string }) => item.root === target.root && item.path === target.canvas.path;
  return work.some(on) || conversations.some(on) ? { root: target.root, presence: null, terminal: true } : null;
}

// The group is the sidebar's (`groupProjects`), so the notice never names a worktree the sidebar puts elsewhere. This
// root's own session wins, and the caller lets an app conversation win too.
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
  // The tooltip shows them whole.
  text: string;
  // With a note and a frame both, the frame's title too.
  status: string;
  steady: boolean;
  // The board has no Stop: with several conversations on a canvas it was ambiguous, so stopping is the composer's.
  action: { kind: "open"; label: "Open"; name: "Open the request" } | null;
}

// The note as written, else "Working on <title>", else the fixed words. Waiting overrides it: the person has to act.
export function agentNoticeView(presence: AgentPresence | null, terminal: boolean, content: { frame?: string; title?: string; note?: string } | null = null): AgentNoticeView | null {
  if (!presence && !terminal) return null;
  // The panel beside the board already says which agent this is.
  if (presence?.kind === "waiting") return { text: "Agent needs your answer", status: "Agent needs your answer", steady: true, action: { kind: "open", label: "Open", name: "Open the request" } };
  const name = content?.frame === undefined ? undefined : frameTitle(content.title) ?? content.frame;
  const text = content?.note ?? (name === undefined ? "Agent is working" : `Working on ${name}`);
  const status = content?.note !== undefined && name !== undefined ? `${content.note} — ${name}` : text;
  return { text, status, steady: false, action: null };
}
