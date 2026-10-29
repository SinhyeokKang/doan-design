import type { Checks } from "../../lib/types.ts";
import { canvasParts, changesWithin, checkClean, preserved, presetChecks } from "../D1/presets.ts";

const CANVAS = ".doan/canvases/checkout.html";

const checks: Checks = ctx => {
  const seed = canvasParts(ctx, CANVAS, "seed")!;
  const final = canvasParts(ctx, CANVAS);
  const rewritten = ["card-error", "zip-error"].filter(id => final?.elements[id] && final.elements[id] !== seed.elements[id]);
  return [
    ...presetChecks(ctx, { required: ["clarify"], allowed: ["clarify", "context"], transport: "mcp" }),
    ...preserved(ctx, CANVAS, { frames: ["summary"], texts: ["payment-heading", "card-label", "zip-label", "pay-button"] }),
    { id: "error_messages_rewritten", pass: rewritten.length === 2, detail: `rewritten: ${rewritten.join(", ") || "(none)"}; now ${JSON.stringify({ card: final?.elements["card-error"], zip: final?.elements["zip-error"] })}` },
    checkClean(ctx),
    changesWithin(ctx, path => path === CANVAS),
  ];
};
export default checks;
