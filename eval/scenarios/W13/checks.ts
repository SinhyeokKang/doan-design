import { classifyDesignChange } from "../../lib/design-change.ts";
import type { Checks } from "../../lib/types.ts";

const canvas = ".doan/canvases/landing.html";
const MOTION = /@keyframes|(?:^|[\s;{])animation(?:-name)?\s*:|\.animate\s*\(/;

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  // The canvas or a stylesheet in its assets may carry the animation; only files the agent changed count, and a page
  // left in the assets (a render copy, say) does not.
  const edited = ctx.changedFiles().filter(path => path === canvas || (path.startsWith(".doan/assets/") && path.endsWith(".css")));
  const animated = edited.filter(path => MOTION.test(ctx.read(path) ?? ""));
  // The app's own reading of the same names (shell.ts): a listed canvas other than the target is a second canvas while
  // it exists. Other names (an in-place `sed -i` temp file, a dot-prefixed copy) only reload open canvases; the judge
  // weighs a dot-prefixed copy against the guide.
  const names = ctx.canvasNames();
  const unique = names === null ? null : [...new Set(names)];
  const change = unique === null ? null : classifyDesignChange(unique.includes(null) ? null : (unique as string[]).sort());
  const onlyTarget = change !== null && change.revPaths.every(path => path === canvas) && !(unique ?? []).includes(null);
  return [
    { id: "doan_check_clean", pass: check.json?.ok === true && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "canvas_animated", pass: animated.length > 0, detail: JSON.stringify({ edited, animated }) },
    { id: "canvas_folders_only_target", pass: onlyTarget, detail: names === null ? "no canvas folder watch" : JSON.stringify({ names: unique, change }) },
  ];
};
export default checks;
