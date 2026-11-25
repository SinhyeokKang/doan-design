import type { WorkOther, WorkRequest } from "../formats/types";
import type { ConversationWork, LiveTurn } from "./conversationWork";
import { WORK_EXPIRY_MS, type WorkItem } from "./workState";

// The v3 schema's `others.maxItems`; keeps the reply line far under the CLI's 64 KiB read cap.
export const WORK_OTHERS_MAX = 8;

export interface OthersInput {
  request: Exclude<WorkRequest, { action: "done" }>;
  now: number;
  work: readonly WorkItem[];
  conversationWork: readonly ConversationWork[];
  liveTurns: ReadonlyMap<string, LiveTurn>;
}

// Same file means the same root and path as the CLI sent: worktrees share canvas paths, and roots are never recomputed.
// Elements describe a session only, never an id that would let one agent track another.
export function othersOnCanvas({ request, now, work, conversationWork, liveTurns }: OthersInput): WorkOther[] {
  const here = (root: string, path: string) => root === request.root && path === request.path;
  const found: { other: WorkOther; touched: number }[] = [];
  const bound: WorkOther[] = [];
  const caller = request.conversation === undefined ? { session: request.session ?? null, provider: request.provider ?? null } : null;
  for (const item of work) {
    // Per file: the session may stay alive in the app through its other paths, but this file is no longer its work.
    if (!here(item.root, item.path) || item.touched <= now - WORK_EXPIRY_MS) continue;
    // An anonymous caller is the root's anonymous session (root already matched), so it cannot tell another apart from itself.
    if (caller && item.session === caller.session && item.provider === caller.provider) continue;
    found.push({ other: { kind: "terminal", ...(item.provider ? { provider: item.provider } : {}), ...content(item) }, touched: item.touched });
  }
  for (const [conversationId, turn] of liveTurns) {
    if (!turn.running || conversationId === request.conversation) continue;
    // Another turn's update is stale: neither its file nor its frame and note describe this turn.
    const current = conversationWork.find(item => item.conversationId === conversationId && item.turnId === turn.turnId);
    if (current) {
      if (here(current.root, current.path)) found.push({ other: { kind: "conversation", provider: turn.provider, ...content(current) }, touched: current.touched });
    } else if (turn.canvas && here(turn.root, turn.canvas.path)) bound.push({ kind: "conversation", provider: turn.provider });
  }
  found.sort((a, b) => b.touched - a.touched);
  return [...found.map(entry => entry.other), ...bound].slice(0, WORK_OTHERS_MAX);
}

function content(item: { frame?: string; note?: string }): { frame?: string; note?: string } {
  return { ...(item.frame !== undefined ? { frame: item.frame } : {}), ...(item.note !== undefined ? { note: item.note } : {}) };
}
