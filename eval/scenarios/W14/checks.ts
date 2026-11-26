import { resolve } from "node:path";
import { doanInvocations } from "../../lib/call-log.ts";
import { doanCommand, doanPositionals } from "../../lib/transcript.ts";
import type { Checks } from "../../lib/types.ts";

const target = ".doan/canvases/pricing.html";
const shared = ".doan/assets/cards.css";
const unrelated = ".doan/canvases/archive.html";
const editedPaths = [target, shared];

const checks: Checks = ctx => {
  const changed = ctx.changedFiles();
  const check = ctx.doan(["check", ...editedPaths]);
  const invocations = doanInvocations(ctx.calls).words.filter(words => doanCommand(words) === "check");
  const invoked = invocations.some(words => {
    const paths = doanPositionals(words)?.slice(1).map(path => resolve(ctx.repo, path)) ?? [];
    return editedPaths.every(path => paths.includes(resolve(ctx.repo, path)));
  });
  const seed = ctx.seed(unrelated);
  return [
    { id: "unrelated_canvas_unchanged", pass: seed !== null && ctx.read(unrelated) === seed, detail: unrelated },
    { id: "edited_canvas_and_css", pass: editedPaths.every(path => changed.includes(path)), detail: JSON.stringify(changed) },
    { id: "scoped_check_invoked", pass: invoked, detail: JSON.stringify(invocations) },
    { id: "scoped_check_clean", pass: check.code === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
  ];
};
export default checks;
