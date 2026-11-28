import type { Check, Checks, CheckContext } from "../../lib/types.ts";
import { cssClickStates, Dom, parseCanvas, resolve, ScriptReader, styleTexts } from "./board.ts";

const canvas = ".doan/canvases/projects.html";
// The frame the prompt names ("Project list"); the click and the motion belong in it.
const target = "project-list";

// The four checks below, plus the final canvas's style and script texts (inline, linked and imported) for scenarios
// that share this canvas (W16).
export function boardChecks(ctx: CheckContext): { checks: Check[]; css: string[]; scripts: string[] } {
  const check = ctx.doan(["check"]);
  const clean = { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` };
  const seedHtml = ctx.seed(canvas), finalHtml = ctx.read(canvas);
  const seed = seedHtml === null ? null : parseCanvas(ctx, seedHtml);
  const final = finalHtml === null ? null : parseCanvas(ctx, finalHtml);
  if (seed === null || final === null) {
    const detail = finalHtml === null ? "canvas missing" : "parse failed";
    return { checks: [clean, ...["no_board_click_trigger", "prototype_marked", "other_frames_unchanged"].map(id => ({ id, pass: false, detail }))], css: [], scripts: [] };
  }

  const dom = new Dom(final.nodes);
  const board: string[] = [];
  let interaction = final.triggers.length > 0;
  for (const t of final.triggers) if (!final.nodes[t.node]!.marked) board.push(t.kind);
  const scripts: string[] = [];
  for (const script of final.scripts) {
    const path = script.src === null ? null : resolve(canvas, script.src);
    const text = script.src === null ? script.text : (path === null ? null : ctx.read(path)) ?? "";
    scripts.push(text);
    for (const { site, value } of new ScriptReader(dom, text, script.node).registrations()) {
      interaction = true;
      // A receiver only run time can tell (unknown, or a lookup that finds nothing yet) is left to the judge.
      if (value.kind === "page" || (value.kind === "nodes" && value.nodes.some(i => !dom.nodes[i]!.marked))) board.push(`script ${script.src ?? "inline"}: ${site}`);
    }
  }
  const css = styleTexts(ctx, canvas, final);
  const states = cssClickStates(dom, css);
  interaction ||= states.interaction;
  board.push(...states.board);

  const seedIds = new Set(seed.frames.map(f => f.id));
  const marked = final.frames.filter(f => f.prototype !== null && (f.id === target || !seedIds.has(f.id)));
  const changed = seed.frames.filter(f => f.id !== target).filter(f => {
    const now = final.frames.filter(g => g.id === f.id);
    return now.length !== 1 || now[0]!.source !== f.source;
  }).map(f => f.id);

  return { css, scripts, checks: [
    clean,
    { id: "no_board_click_trigger", pass: board.length === 0, detail: JSON.stringify(board) },
    // A canvas with no click interaction at all needs no mark; the judge scores a still-only drawing.
    { id: "prototype_marked", pass: marked.length > 0 || !interaction, detail: JSON.stringify({ interaction, frames: final.frames.map(f => ({ id: f.id, prototype: f.prototype })) }) },
    { id: "other_frames_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ] };
}

const checks: Checks = ctx => boardChecks(ctx).checks;
export default checks;
