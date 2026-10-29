import type { Checks } from "../../lib/types.ts";
import w1 from "../W1/checks.ts";
import { changesWithin, presetChecks } from "../D1/presets.ts";

const checks: Checks = ctx => {
  let config: any = null;
  try { config = JSON.parse(ctx.read(".doan/config.json") ?? "null"); } catch { /* reported below */ }
  const canvases = ctx.doan(["ls"]).json?.result?.canvases ?? [];
  const frames = canvases.reduce((n: number, c: any) => n + (c.frames?.length ?? 0), 0);
  return [
    ...presetChecks(ctx, { required: ["generate"], allowed: ["generate", "context", "shape"] }),
    { id: "doan_initialized", pass: config?.tokenCss === "styles/tokens.css" && config?.serve === undefined, detail: JSON.stringify(config) },
    // W1 wants two state frames on one canvas; alternatives may be split across canvases.
    ...w1(ctx).filter(c => c.id !== "state_frames_created"),
    { id: "two_alternatives_drawn", pass: frames >= 2, detail: `${frames} frames across ${canvases.length} canvases` },
    changesWithin(ctx, path => path.startsWith(".doan/") || path === ".gitattributes"),
  ];
};
export default checks;
