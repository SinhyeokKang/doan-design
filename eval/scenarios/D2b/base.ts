import type { Checks } from "../../lib/types.ts";
import { canvasParts, changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const CANVAS = ".doan/canvases/settings.html";

const checks: Checks = ctx => {
  const seed = canvasParts(ctx, CANVAS, "seed")!;
  const notifications = canvasParts(ctx, CANVAS)?.frames.notifications;
  const choices = [/paid|pays/i, /overdue/i, /view/i];
  return [
    ...presetChecks(ctx, { required: ["distill"], allowed: ["distill", "context"] }),
    ...preserved(ctx, CANVAS, { allIds: false, frames: ["profile", "danger-zone"] }),
    { id: "notifications_simplified", pass: notifications !== undefined && notifications.html !== seed.frames.notifications.html && notifications.text.length < seed.frames.notifications.text.length, detail: `text length ${seed.frames.notifications.text.length} -> ${notifications?.text.length ?? "frame missing"}` },
    { id: "notification_choices_kept", pass: notifications !== undefined && choices.every(re => re.test(notifications.text)), detail: notifications?.text ?? "frame missing" },
    checkClean(ctx),
    changesWithin(ctx, path => path === CANVAS),
  ];
};
export default checks;
