// A reply chip's link, `doan:<canvas-id>/<frame|element>/<id>` (agent-reply-chips design 'Format'). The renderer and
// the eval both import this, so the file takes no value imports: a renderer value import of a main module that pulls
// in Node or ajv leaves the built window blank (POSTMORTEM 2026-10-30, `rendererImports.test.ts`).

export interface ReplyAnchor { canvas: string; kind: "frame" | "element"; id: string }

// ARCHITECTURE §1 Conventions 2. Kept here because the copy in the restore code is not exported.
const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Matches `canvasMessage.ts` MAX_STRING and the picker, which drop a doan id over 200: a cut id could match another target.
const MAX_ID = 200;
const SCHEME = "doan:";

// href comes from agent output, so every rule fails closed to null. Not a deep link: `doan://…` is rejected.
export function parseReplyAnchor(href: string): ReplyAnchor | null {
  if (!href.startsWith(SCHEME) || href.startsWith(`${SCHEME}//`)) return null;
  // Split before decoding: only %2F can put a slash in an id.
  const parts = href.slice(SCHEME.length).split("/");
  if (parts.length !== 3) return null;
  const [canvas, kind, raw] = parts as [string, string, string];
  if (!CANVAS_ID.test(canvas) || (kind !== "frame" && kind !== "element")) return null;
  if (raw === "" || raw.includes("?") || raw.includes("#")) return null;
  let id: string;
  try { id = decodeURIComponent(raw); } catch { return null; }
  if (id === "" || id.length > MAX_ID || /\p{Cc}/u.test(id)) return null;
  return { canvas, kind, id };
}
