import type { Checks } from "../../lib/types.ts";
import { openChecks } from "../../lib/open.ts";
import { workChecks } from "../../lib/work.ts";
import { buttonLabelUpdated } from "../W3b/checks.ts";

const path = ".doan/canvases/profile.html";
// The frame's id; the prompt names its title ("Profile form"), so the agent has to map one to the other.
const frame = "profile-form";
const checks: Checks = ctx => {
  const checked = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  return [
    ...workChecks(ctx),
    ...openChecks(ctx, path, frame),
    buttonLabelUpdated(ctx, path),
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === path, detail: JSON.stringify(changed) },
    { id: "doan_check_clean", pass: checked.code === 0 && checked.json?.result?.summary?.errors === 0, detail: JSON.stringify(checked) },
  ];
};
export default checks;
