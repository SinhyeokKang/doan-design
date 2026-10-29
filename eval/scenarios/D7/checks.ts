import type { Checks } from "../../lib/types.ts";
import { canvasParts, changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const CANVAS = ".doan/canvases/inbox.html";

const checks: Checks = ctx => {
  const seed = canvasParts(ctx, CANVAS, "seed")!;
  const message = canvasParts(ctx, CANVAS)?.elements["inbox-error-message"];
  const listed = (ctx.doan(["ls"]).json?.result?.canvases ?? []).find((c: any) => c.id === "inbox")?.frames ?? [];
  const added = listed.filter((f: any) => !(f.id in seed.frames)).map((f: any) => `${f.id} ${f.title ?? ""}`);
  return [
    ...presetChecks(ctx, { required: [["harden", "clarify", "onboard"]], allowed: ["harden", "clarify", "onboard", "context"] }),
    ...preserved(ctx, CANVAS, { frames: ["inbox"] }),
    { id: "error_message_rewritten", pass: !!message && message !== seed.elements["inbox-error-message"], detail: `inbox-error-message: ${JSON.stringify(message ?? null)}` },
    { id: "loading_frame_added", pass: added.some((f: string) => /load/i.test(f)), detail: `new frames: ${added.join("; ") || "(none)"}` },
    { id: "empty_frame_added", pass: added.some((f: string) => /empty|no[ -]messages|zero/i.test(f)), detail: `new frames: ${added.join("; ") || "(none)"}` },
    checkClean(ctx),
    changesWithin(ctx, path => path === CANVAS || path.startsWith(".doan/assets/")),
  ];
};
export default checks;
