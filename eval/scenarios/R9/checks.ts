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
// The frame and element ids in the final canvas.
function ids(html: string): { frames: Set<string>; elements: Set<string> } {
  const all = (attr: string) => new Set([...html.matchAll(new RegExp(`\\b${attr}="([^"]*)"`, "g"))].map(m => m[1]!));
  return { frames: all("data-doan-frame"), elements: all("data-doan-id") };
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
  const destinations = drawn(answer);
  const parsed = destinations.map(parseReplyAnchor);
  const links = parsed.filter((link): link is ReplyAnchor => link !== null);
  // Every `doan:` string in the answer must be a drawn, well-formed link; `doan://open?…` and bare text are not.
  const mentioned = [...answer.matchAll(/doan:[^\s)>\]"'<]*/gi)].map(m => m[0]);
  const pool = destinations.filter(d => parseReplyAnchor(d) !== null);
  const stray = mentioned.filter(m => { const at = pool.indexOf(m); if (at < 0) return true; pool.splice(at, 1); return false; });
  const known = ids(html);
  const unreal = links.filter(l => l.canvas !== CANVAS_ID || !(l.kind === "frame" ? known.frames : known.elements).has(l.id));
  const heading = textOf(html, "billing-title"), button = textOf(html, ELEMENT);
  const has = (kind: ReplyAnchor["kind"], id: string) => links.some(l => l.canvas === CANVAS_ID && l.kind === kind && l.id === id);
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === CANVAS, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "edits_applied", pass: heading === "Billing details" && button === "Save changes", detail: `billing-title: ${JSON.stringify(heading)}, ${ELEMENT}: ${JSON.stringify(button)}` },
    // The turn prompt tells the agent this conversation is inside Doan, so it neither offers nor runs `doan open`.
    noOpen(ctx),
    { id: "doan_links_well_formed", pass: stray.length === 0, detail: stray.length ? `doan: text that the app would not draw as a link: ${JSON.stringify(stray)}` : `${links.length} doan link(s) in the answer outside code, all well-formed` },
    { id: "frame_link", pass: has("frame", FRAME), detail: `want frame ${FRAME} on ${CANVAS_ID}; links: ${JSON.stringify(links)}` },
    { id: "element_link", pass: has("element", ELEMENT), detail: `want element ${ELEMENT} on ${CANVAS_ID}; links: ${JSON.stringify(links)}` },
    { id: "links_name_real_targets", pass: links.length > 0 && unreal.length === 0, detail: unreal.length ? `no such target in the final canvas: ${JSON.stringify(unreal)}` : `${links.length} link(s), every one a frame or element of ${CANVAS_ID}` },
  ];
};
export default checks;
