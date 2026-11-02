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
