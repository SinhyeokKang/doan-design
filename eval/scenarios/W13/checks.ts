import { classifyDesignChange } from "../../lib/design-change.ts";
import type { Checks } from "../../lib/types.ts";

const canvas = ".doan/canvases/landing.html";
const MOTION = /@keyframes|(?:^|[\s;{])animation(?:-name)?\s*:|\.animate\s*\(/;

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  // The canvas or a stylesheet beside it may carry the animation; only files the agent changed count.
  const edited = ctx.changedFiles().filter(path => path === canvas || path.startsWith(".doan/assets/"));
  const animated = edited.filter(path => MOTION.test(ctx.read(path) ?? ""));
  // The app's own reading of the same names (shell.ts): any listed canvas but the target is a second canvas while it
  // exists, and any other name reloads every open canvas. Claude Code's `<name>.tmp.*` save beside the canvas is
  // part of the canvas save there too.
  const names = ctx.canvasNames();
  const unique = names === null ? null : [...new Set(names)];
  const change = unique === null ? null : classifyDesignChange(unique.includes(null) ? null : (unique as string[]).sort());
  const onlyTarget = change !== null && !change.bumpServed && change.revPaths.every(path => path === canvas);
  return [
    { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_animated", pass: animated.length > 0, detail: JSON.stringify({ edited, animated }) },
    { id: "canvas_folders_only_target", pass: onlyTarget, detail: names === null ? "no canvas folder watch" : JSON.stringify({ names: unique, change }) },
  ];
};
export default checks;
