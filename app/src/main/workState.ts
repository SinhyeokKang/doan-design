import { randomUUID } from "node:crypto";
import type { WorkRequest } from "../formats/types";

// frame/note: the content of the entry's last update (absent parts cleared). touched: its last start or update.
// turn: the session's work turn (design §1 rule 9), made once by main so the renderer's follow state is keyed the same
// whenever and wherever it subscribes.
export interface WorkItem { session: string | null; provider: "claude" | "codex" | null; root: string; path: string; frame?: string; note?: string; touched: number; turn: string }
interface WorkTarget { root: string; path: string; frame?: string; note?: string; touched: number }
interface WorkSession { session: string | null; provider: WorkItem["provider"]; paths: readonly WorkTarget[]; started: number; turn: string }
export interface WorkState { roots: readonly string[]; sessions: readonly WorkSession[] }
export const WORK_EXPIRY_MS = 5 * 60 * 1000;
export const MAX_WORK_SESSIONS = 128;
export const MAX_WORK_PATHS = 128;

function content(message: WorkRequest): { frame?: string; note?: string } {
  if (message.action !== "update") return {};
  return { ...(message.frame !== undefined ? { frame: message.frame } : {}), ...(message.note !== undefined ? { note: message.note } : {}) };
}

export function applyWork(state: WorkState, message: WorkRequest, now: number, newTurn: () => string = randomUUID): WorkState {
  // An app conversation's update is kept apart (conversationWork.ts): counted here it would be terminal work.
  if (message.conversation !== undefined || !state.roots.includes(message.root)) return state;
  const session = message.session ?? null, provider = message.provider ?? null;
  const matches = (item: WorkSession) => item.session === session && item.provider === provider && (session !== null || item.paths[0]?.root === message.root);
  const current = state.sessions.find(matches);
  if (message.action === "done") return current ? { ...state, sessions: state.sessions.filter(item => !matches(item)) } : state;
  const added: WorkTarget = { root: message.root, path: message.path, ...content(message), touched: now };
  if (current) {
    const present = current.paths.some(target => target.root === message.root && target.path === message.path);
    const paths = present
      ? current.paths.map(target => target.root !== message.root || target.path !== message.path ? target
        : message.action === "update" ? added : { ...target, touched: now })
      : current.paths.length >= MAX_WORK_PATHS ? current.paths : [...current.paths, added];
    return { ...state, sessions: state.sessions.map(item => item === current ? { ...current, started: now, paths } : item) };
  }
  if (state.sessions.length >= MAX_WORK_SESSIONS) return state;
  return { ...state, sessions: [...state.sessions, { session, provider, paths: [added], started: now, turn: `${provider ?? "none"}:${newTurn()}` }] };
}

export function expireWork(state: WorkState, now: number, lastChange: (root: string, path: string) => number, limit = WORK_EXPIRY_MS): WorkState {
  const sessions = state.sessions.filter(item => now - Math.max(item.started, ...item.paths.map(target => lastChange(target.root, target.path))) < limit);
  return sessions.length === state.sessions.length ? state : { ...state, sessions };
}
export function nextWorkExpiry(state: WorkState, lastChange: (root: string, path: string) => number, limit = WORK_EXPIRY_MS): number | undefined {
  if (!state.sessions.length) return undefined;
  return Math.min(...state.sessions.map(item => Math.max(item.started, ...item.paths.map(target => lastChange(target.root, target.path))) + limit));
}
export function retainWorkRoots(state: WorkState, roots: readonly string[]): WorkState {
  const sessions = state.sessions.map(item => {
    const paths = item.paths.filter(target => roots.includes(target.root));
    return paths.length === item.paths.length ? item : { ...item, paths };
  }).filter(item => item.paths.length > 0);
  if (roots.length === state.roots.length && roots.every((root, i) => root === state.roots[i]) && sessions.length === state.sessions.length && sessions.every((item, i) => item === state.sessions[i])) return state;
  return { roots, sessions };
}
export function workItems(state: WorkState): WorkItem[] {
  return state.sessions.flatMap(item => item.paths.map(target => ({ ...target, session: item.session, provider: item.provider, turn: item.turn })));
}
const ITEM_FIELDS = ["root", "path", "session", "provider", "frame", "note", "touched", "turn"] as const;
export function workItemsChanged(previous: readonly WorkItem[], next: readonly WorkItem[]): boolean {
  return previous.length !== next.length || next.some((item, i) => ITEM_FIELDS.some(field => item[field] !== previous[i]?.[field]));
}
