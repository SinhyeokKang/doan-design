import type { Checks } from "../../lib/types.ts";
import { canvasParts, changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const CANVAS = ".doan/canvases/settings.html";

const checks: Checks = ctx => {
  const label = canvasParts(ctx, CANVAS)?.elements["profile-save"];
  return [
    ...presetChecks(ctx, { required: [], allowed: [] }),
    { id: "save_label_changed", pass: label === "Save changes", detail: `profile-save: ${JSON.stringify(label ?? null)}` },
    ...preserved(ctx, CANVAS, { frames: ["notifications", "danger-zone"], texts: "all", except: ["profile-save"] }),
    checkClean(ctx),
    changesWithin(ctx, path => path === CANVAS),
  ];
};
export default checks;
