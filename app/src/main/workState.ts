import type { WorkRequest } from "../formats/types";

export interface WorkItem { session: string | null; provider: "claude" | "codex" | null; root: string; path: string }
interface WorkSession { session: string | null; provider: WorkItem["provider"]; paths: readonly { root: string; path: string }[]; started: number }
export interface WorkState { roots: readonly string[]; sessions: readonly WorkSession[] }
export const WORK_EXPIRY_MS = 5 * 60 * 1000;
export const MAX_WORK_SESSIONS = 128;
export const MAX_WORK_PATHS = 128;

export function applyWork(state: WorkState, message: WorkRequest, now: number): WorkState {
  if (!state.roots.includes(message.root)) return state;
  const session = message.session ?? null, provider = message.provider ?? null;
  const matches = (item: WorkSession) => item.session === session && item.provider === provider && (session !== null || item.paths[0]?.root === message.root);
  const current = state.sessions.find(matches);
  if (message.action === "done") return current ? { ...state, sessions: state.sessions.filter(item => !matches(item)) } : state;
  if (current) {
    const present = current.paths.some(target => target.root === message.root && target.path === message.path);
    if (!present && current.paths.length >= MAX_WORK_PATHS) return state;
    const next = { ...current, started: now, paths: present ? current.paths : [...current.paths, { root: message.root, path: message.path }] };
    return { ...state, sessions: state.sessions.map(item => item === current ? next : item) };
  }
  if (state.sessions.length >= MAX_WORK_SESSIONS) return state;
  return { ...state, sessions: [...state.sessions, { session, provider, paths: [{ root: message.root, path: message.path }], started: now }] };
}

export function expireWork(state: WorkState, now: number, lastChange: (root: string, path: string) => number, limit = WORK_EXPIRY_MS): WorkState {
  const sessions = state.sessions.filter(item => now - Math.max(item.started, ...item.paths.map(target => lastChange(target.root, target.path))) < limit);
  return sessions.length === state.sessions.length ? state : { ...state, sessions };
}
export function retainWorkRoots(state: WorkState, roots: readonly string[]): WorkState {
  return { roots, sessions: state.sessions.map(item => ({ ...item, paths: item.paths.filter(target => roots.includes(target.root)) })).filter(item => item.paths.length > 0) };
}
export function workItems(state: WorkState): WorkItem[] {
  return state.sessions.flatMap(item => item.paths.map(target => ({ ...target, session: item.session, provider: item.provider })));
}
