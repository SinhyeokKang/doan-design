import type { Checks } from "../../lib/types.ts";
import { noOpen } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";

const path = ".doan/canvases/landing.html";
const compact = (html: string) => html.replace(/\s+/g, " ").replace(/> </g, "><").trim();

const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const seed = ctx.seed(path), final = ctx.read(path);
  // Only the headline text changes; whitespace between tags may differ.
  const expected = seed === null ? null : compact(seed.replace(">Design faster<", ">Design together<"));
  return [
    ...workChecks(ctx),
    noOpen(ctx),
    { id: "headline_updated", pass: expected !== null && final !== null && compact(final) === expected, detail: final === null ? "canvas missing" : "" },
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
