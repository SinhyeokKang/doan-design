import type { OpenFrameResult, OpenRequest, OpenResponse } from "../formats/types";

export interface OpenLink { root: string; canvas: string; frame?: string }
export type OpenLinkResult = ({ kind: "navigate" } & OpenLink) | { kind: "malformed" } | { kind: "unregistered-root" } | { kind: "canvas-not-listed"; project: string };
export const OPEN_LINK_LIMIT = 8192;

export function parseOpenLink(text: string): OpenLink | null {
  if (text.length > OPEN_LINK_LIMIT || /[\u0000-\u0020\u007f]/.test(text)) return null;
  let url: URL;
  try {
    // URLSearchParams otherwise silently replaces malformed UTF-8 and percent escapes.
    decodeURIComponent(text);
    url = new URL(text);
  } catch { return null; }
  if (url.protocol !== "doan:" || url.host !== "open" || url.pathname !== "" || url.username || url.password || url.hash) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.join(",") !== "root,canvas" && keys.join(",") !== "root,canvas,frame") return null;
  const root = url.searchParams.get("root"), canvas = url.searchParams.get("canvas"), frame = url.searchParams.get("frame");
  if (!root?.startsWith("/") || root.split("/").includes("..") || /[\u0000-\u001f\u007f\\]/.test(root) ||
      !canvas || !/^\.doan\/(canvases|ds)\/[^/]+\.html$/.test(canvas) || /[\u0000-\u001f\u007f\\]/.test(canvas) ||
      frame === "" || (frame !== null && /[\u0000-\u001f\u007f]/.test(frame))) return null;
  return { root, canvas, ...(frame === null ? {} : { frame }) };
}

interface LinkFolder {
  path: string; kind: string; lastCommon?: string;
  canvases?: readonly { path: string }[];
  git?: { common: string; main?: string };
}
// The checks a doan:// link and a `doan open` request share (ARCHITECTURE §7 'Deep links' 'Security boundary'): an
// exactly registered root and a listed canvas. A root still loading is not a list refusal; the caller decides what a
// read in progress means. `project` is the sidebar card name.
export type OpenTarget = ({ kind: "listed" } & OpenLink) | { kind: "unregistered-root" } | { kind: "loading"; project: string } | { kind: "canvas-not-listed"; project: string };
export function resolveOpenTarget(link: OpenLink, entries: readonly LinkFolder[]): OpenTarget {
  const entry = entries.find(entry => entry.path === link.root);
  if (!entry) return { kind: "unregistered-root" };
  if (entry.kind === "list" && entry.canvases?.some(row => row.path === link.canvas)) return { kind: "listed", ...link };
  return { kind: entry.kind === "loading" ? "loading" : "canvas-not-listed", project: projectName(entry, entries) };
}
// Match the sidebar card name, including worktrees whose main root is not itself registered.
function projectName(entry: LinkFolder, entries: readonly LinkFolder[]): string {
  const key = (row: LinkFolder) => (row.kind === "list" ? row.git?.common : row.lastCommon) ?? row.path;
  const group = entries.filter(row => key(row) === key(entry));
  const main = group.find(row => row.kind === "list" && row.git?.main)?.git?.main;
  const path = main ?? group[0]!.path;
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
// A link reaches here only once no root is loading (index.ts readyOpenLinks); one that was re-read since is refused as
// unlisted, as it always was.
export function resolveOpenLink(text: string, entries: readonly LinkFolder[]): OpenLinkResult {
  const link = parseOpenLink(text);
  if (!link) return { kind: "malformed" };
  const target = resolveOpenTarget(link, entries);
  if (target.kind === "listed") return { ...target, kind: "navigate" };
  if (target.kind === "loading") return { kind: "canvas-not-listed", project: target.project };
  return target;
}

export function openLinkQueue(deliver: (url: string) => void): { receive(url: string): void; ready(): void } {
  let ready = false, pending: string | undefined;
  return {
    receive(url) { if (ready) deliver(url); else pending = url; },
    ready() {
      ready = true;
      const url = pending;
      pending = undefined;
      if (url !== undefined) deliver(url);
    },
  };
}

// `doan open` (app-socket v4) after its schema, token and registered root passed (runtime.ts). Main answers what it can
// decide itself at once, without holding the request: not ready yet (the launch restore or a project read is still
// running; the CLI retries), and the shared root and list checks. A listed canvas is handed to the renderer with an id;
// its answer, or the timeout, settles that request alone, so concurrent requests each get their own reply in the order
// the renderer takes them. Each request carries `expires`, the wall-clock time (ms) at which main stops waiting and tells
// the CLI busy; the renderer touches nothing for a request past it (App.tsx openCanvasRequest), and main drops any late
// answer, so the window does not come forward either. Both processes read the same system clock.
// The window comes forward only for an opened canvas; a refusal changes nothing the person sees.
export type OpenBlock = "add_projects" | "settings" | "project_settings" | "first_run" | "dialog";
export interface OpenAsk { id: string; root: string; canvas: string; frame?: string; expires: number }
export type OpenResult = { kind: "opened"; frame: OpenFrameResult } | { kind: "busy"; reason: OpenBlock } | { kind: "canvas_not_found" };
export type OpenAnswer = { id: string } & OpenResult;
// Well inside the 2 s deadlines on both ends: the app's from connect (runtime.ts LINE_WAIT_MS) and the CLI's per attempt
// from before its dial, so a late main event loop still leaves time for the line read and the reply.
export const OPEN_ANSWER_TIMEOUT_MS = 1000;

const BLOCKED: Record<OpenBlock, string> = {
  add_projects: "The Add Projects page in Doan is in the middle of a task. Finish or cancel it, then try again.",
  settings: "Settings in Doan is in the middle of a change. Finish or cancel it, then try again.",
  project_settings: "Project Settings in Doan is in the middle of a change. Finish or cancel it, then try again.",
  first_run: "Finish Doan's first run, then try again.",
  dialog: "A dialog in Doan is busy and did not close. Finish it, then try again.",
};
function openError(code: "project_not_open" | "canvas_not_found" | "busy" | "not_ready", message: string): OpenResponse {
  return { v: 4, ok: false, error: { code, message } };
}

export interface OpenRequestsHost {
  // The launch restore is applied, the first folders are in and no project is being read (index.ts openLinksReady).
  ready(): boolean;
  entries(): readonly LinkFolder[];
  // Sends the request to the renderer; false when there is no window to ask.
  ask(request: OpenAsk): boolean;
  // Brings the window forward, a hidden app included.
  opened(): void;
}
export function openRequests(host: OpenRequestsHost, timeoutMs = OPEN_ANSWER_TIMEOUT_MS): { open(request: OpenRequest): Promise<OpenResponse>; answer(value: unknown): void } {
  const pending = new Map<string, { frame: boolean; settle(answer: OpenAnswer | null): void }>();
  let next = 0;
  return {
    open(request) {
      if (!host.ready()) return Promise.resolve(openError("not_ready", "Doan is still starting. Try again shortly."));
      const target = resolveOpenTarget({ root: request.root, canvas: request.path, ...(request.frame === undefined ? {} : { frame: request.frame }) }, host.entries());
      if (target.kind === "unregistered-root") return Promise.resolve(openError("project_not_open", "The project is not open in Doan."));
      if (target.kind === "loading") return Promise.resolve(openError("not_ready", "Doan is still reading this project. Try again shortly."));
      if (target.kind === "canvas-not-listed") return Promise.resolve(openError("canvas_not_found", "The canvas is not in the project's canvas list in Doan."));
      const id = String(++next);
      return new Promise<OpenResponse>(resolve => {
        // Taken before the timer is armed, so the renderer's cutoff is never later than main's.
        const expires = Date.now() + timeoutMs;
        let asked = true;
        const timer = setTimeout(() => settle(null), timeoutMs);
        function settle(answer: OpenAnswer | null) {
          clearTimeout(timer);
          pending.delete(id);
          if (answer === null) { resolve(openError("busy", asked ? "Doan did not answer in time. Try again shortly." : "Doan has no window open. Open Doan, then try again.")); return; }
          if (answer.kind === "opened") {
            try { host.opened(); } catch (error) { console.error("doan: cannot bring the window forward", error); }
            resolve({ v: 4, ok: true, opened: true, frame: answer.frame });
          } else if (answer.kind === "busy") resolve(openError("busy", BLOCKED[answer.reason]));
          else resolve(openError("canvas_not_found", "The canvas is not in the project's canvas list in Doan."));
        }
        pending.set(id, { frame: request.frame !== undefined, settle });
        const ask = { id, root: target.root, canvas: target.canvas, ...(target.frame === undefined ? {} : { frame: target.frame }), expires };
        if (!host.ask(ask)) { asked = false; settle(null); }
      });
    },
    answer(value) {
      const answer = openAnswer(value);
      const request = answer && pending.get(answer.id);
      if (!answer || !request) return;
      // A frame result must match what was asked: none without a frame, found or missing with one.
      if (answer.kind === "opened" && (answer.frame === "none") === request.frame) return;
      request.settle(answer);
    },
  };
}
function openAnswer(value: unknown): OpenAnswer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const id: unknown = Reflect.get(value, "id"), kind: unknown = Reflect.get(value, "kind");
  const keys = Object.keys(value).sort().join(",");
  if (typeof id !== "string") return null;
  if (kind === "opened" && keys === "frame,id,kind") {
    const frame: unknown = Reflect.get(value, "frame");
    return frame === "found" || frame === "missing" || frame === "none" ? { id, kind, frame } : null;
  }
  if (kind === "busy" && keys === "id,kind,reason") {
    const reason: unknown = Reflect.get(value, "reason");
    return typeof reason === "string" && Object.hasOwn(BLOCKED, reason) ? { id, kind, reason: reason as OpenBlock } : null;
  }
  return kind === "canvas_not_found" && keys === "id,kind" ? { id, kind } : null;
}
