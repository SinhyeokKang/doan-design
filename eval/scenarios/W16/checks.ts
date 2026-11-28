import type { Checks } from "../../lib/types.ts";
import { boardChecks } from "../W15/checks.ts";

// The seed has no motion, so any motion in the final canvas is the agent's.
const CSS_MOTION = /@keyframes|(?:^|[\s;{])(?:animation(?:-name)?|transition(?:-property)?)\s*:/;
const JS_MOTION = /\.animate\s*\(|\.style\.(?:animation|transition)\b/;
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// W15's canvas checks without its prototype requirement: the motion may sit in a marked frame or on the board,
// and the judge weighs where.
const checks: Checks = ctx => {
  const { checks: board, css, scripts, styleAttributes } = boardChecks(ctx);
  const motion = [
    ...css.filter(text => CSS_MOTION.test(uncomment(text))).map(() => "css"),
    ...styleAttributes.filter(text => CSS_MOTION.test(uncomment(text))).map(() => "style attribute"),
    ...scripts.filter(text => JS_MOTION.test(text)).map(() => "script"),
  ];
  return [
    ...board.filter(check => check.id !== "prototype_marked"),
    { id: "motion_shown", pass: motion.length > 0, detail: JSON.stringify(motion) },
  ];
};
export default checks;
