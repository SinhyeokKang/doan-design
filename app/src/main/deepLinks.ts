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
export function resolveOpenLink(text: string, entries: readonly LinkFolder[]): OpenLinkResult {
  const link = parseOpenLink(text);
  if (!link) return { kind: "malformed" };
  const entry = entries.find(entry => entry.path === link.root);
  if (!entry) return { kind: "unregistered-root" };
  if (entry.kind === "list" && entry.canvases?.some(row => row.path === link.canvas)) return { kind: "navigate", ...link };
  // Match the sidebar card name, including worktrees whose main root is not itself registered.
  const key = (row: LinkFolder) => (row.kind === "list" ? row.git?.common : row.lastCommon) ?? row.path;
  const group = entries.filter(row => key(row) === key(entry));
  const main = group.find(row => row.kind === "list" && row.git?.main)?.git?.main;
  const path = main ?? group[0]!.path;
  return { kind: "canvas-not-listed", project: path.split("/").filter(Boolean).at(-1) ?? path };
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
