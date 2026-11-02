import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReplyAnchor, type ReplyAnchor } from "../../../app/src/main/conversation/replyAnchor.ts";
import { finalAnswer, withoutCode } from "../../lib/answer.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const CANVAS = ".doan/canvases/account.html";
const turn = JSON.parse(readFileSync(join(import.meta.dirname, "turn.json"), "utf8"));
// The targets the person anchored: the frame of anchor 1 and the element of anchor 2.
const CANVAS_ID: string = turn.canvas.id;
const FRAME: string = turn.anchors[0].frame.id;
const ELEMENT: string = turn.anchors[1].element.doanId;

// What the app's Markdown draws as a link to a `doan:` target: an inline link's destination (bare or in angle brackets)
// or an autolink. A bare `doan:…` in running text is not drawn as a link, so it is not a destination here.
function drawn(text: string): string[] {
  const inline = [...text.matchAll(/\]\(\s*<?(doan:[^)\s>]*)/gi)].map(m => m[1]!);
  const auto = [...text.matchAll(/<(doan:[^>\s]*)>/gi)].map(m => m[1]!);
  return [...inline, ...auto];
}
// `doan:` strings meant as links that the app would not draw: a malformed destination (including `doan://open?…`) and a
// bare `doan:<canvas>/<kind>/<id>` in running text. A link's visible text and prose such as "the doan: scheme" are not.
function stray(text: string): string[] {
  const destinations = drawn(text);
  const bad = destinations.filter(d => parseReplyAnchor(d) === null);
  const outsideText = text.replace(/\[[^\]]*\](?=\()/g, "");
  const pool = [...destinations];
  const bare = [...outsideText.matchAll(/doan:[^\s)>\]"'<]*/gi)].map(m => m[0]).filter(m => {
    const at = pool.indexOf(m);
    if (at >= 0) { pool.splice(at, 1); return false; }
    return m.includes("/");
  });
  return [...bad, ...bare];
}
// The frame and element ids in the final canvas, and the element ids inside one frame (frames are siblings in the seed;
// a frame's content runs to the next frame or the end of the body).
function ids(html: string): { frames: Set<string>; elements: Set<string> } {
  const all = (attr: string) => new Set([...html.matchAll(new RegExp(`\\b${attr}="([^"]*)"`, "g"))].map(m => m[1]!));
  return { frames: all("data-doan-frame"), elements: all("data-doan-id") };
}
function inside(html: string, frame: string): Set<string> {
  const start = html.indexOf(`data-doan-frame="${frame}"`);
  if (start < 0) return new Set();
  const rest = html.slice(start + 1);
  const end = rest.search(/data-doan-frame="|<\/body>/);
  return new Set([...(end < 0 ? rest : rest.slice(0, end)).matchAll(/\bdata-doan-id="([^"]*)"/g)].map(m => m[1]!));
}
// The text of the element with this doan id, tags inside it removed.
function textOf(html: string, id: string): string | null {
  const match = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bdata-doan-id="${id}"[^>]*>([\\s\\S]*?)</\\1>`, "i").exec(html);
  return match ? match[2]!.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : null;
}

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const html = ctx.read(CANVAS) ?? "";
  const answer = withoutCode(finalAnswer(ctx.transcript));
  const links = drawn(answer).map(parseReplyAnchor).filter((link): link is ReplyAnchor => link !== null);
  const bad = stray(answer);
  const known = ids(html);
  const real = (l: ReplyAnchor) => l.canvas === CANVAS_ID && (l.kind === "frame" ? known.frames : known.elements).has(l.id);
  const unreal = links.filter(l => !real(l));
  const valid = links.filter(real);
  const heading = textOf(html, "billing-title"), button = textOf(html, ELEMENT);
  // Each edited place is pointed at by a link to the edited element or to the frame that contains it. The heading's
  // frame is the anchored one (a real element inside it counts too); the button sits in the Profile frame.
  const insideFrame = inside(html, FRAME);
  const points = (frames: string[], elements: (id: string) => boolean) => valid.some(l => l.kind === "frame" ? frames.includes(l.id) : elements(l.id));
  const headingLinked = points([FRAME], id => insideFrame.has(id));
  const buttonLinked = points([turn.anchors[1].frame.id], id => id === ELEMENT);
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === CANVAS, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "edits_applied", pass: heading === "Billing details" && button === "Save changes", detail: `billing-title: ${JSON.stringify(heading)}, ${ELEMENT}: ${JSON.stringify(button)}` },
    // The turn prompt tells the agent this conversation is inside Doan, so it neither offers nor runs `doan open`.
    noOpen(ctx),
    { id: "doan_links_well_formed", pass: bad.length === 0, detail: bad.length ? `doan: text that the app would not draw as a link: ${JSON.stringify(bad)}` : `${links.length} doan link(s) in the answer outside code, all well-formed` },
    { id: "links_name_real_targets", pass: links.length > 0 && unreal.length === 0, detail: unreal.length ? `no such target in ${CANVAS_ID}'s final canvas: ${JSON.stringify(unreal)}` : `${links.length} link(s), every one a frame or element of ${CANVAS_ID}` },
    { id: "heading_change_linked", pass: headingLinked, detail: `want frame ${FRAME} or an element inside it (${[...insideFrame].join(", ") || "none"}); links: ${JSON.stringify(valid)}` },
    { id: "button_change_linked", pass: buttonLinked, detail: `want element ${ELEMENT} or frame ${turn.anchors[1].frame.id}; links: ${JSON.stringify(valid)}` },
  ];
};
export default checks;
