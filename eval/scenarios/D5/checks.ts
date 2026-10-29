import type { Checks } from "../../lib/types.ts";
import { changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const CANVAS = ".doan/canvases/settings.html";

const checks: Checks = ctx => {
  const html = ctx.read(CANVAS) ?? "";
  const motion = html.match(/@keyframes|\banimation(?:-[a-z]+)?\s*:|\btransition(?:-[a-z]+)?\s*:/gi) ?? [];
  return [
    ...presetChecks(ctx, { required: ["quieter"], allowed: ["quieter", "colorize", "typeset", "context"] }),
    ...preserved(ctx, CANVAS, { texts: "all" }),
    { id: "canvas_restyled", pass: html !== "" && html !== ctx.seed(CANVAS), detail: html === ctx.seed(CANVAS) ? "canvas unchanged" : "canvas changed" },
    { id: "no_motion_added", pass: motion.length === 0, detail: motion.join(", ") || "(none)" },
    checkClean(ctx),
    changesWithin(ctx, path => path === CANVAS),
  ];
};
export default checks;
