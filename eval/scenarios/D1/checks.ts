import type { Checks } from "../../lib/types.ts";
import w1 from "../W1/checks.ts";
import { changesWithin, presetChecks } from "./presets.ts";

const checks: Checks = ctx => {
  const canvases = ctx.doan(["ls"]).json?.result?.canvases ?? [];
  const frames = canvases.reduce((n: number, c: any) => n + (c.frames?.length ?? 0), 0);
  const html = canvases.map((c: any) => ctx.read(c.path) ?? "").join("\n");
  return [
    ...presetChecks(ctx, { required: ["generate"], allowed: ["generate", "context"], transport: "shell" }),
    // W1 wants two state frames on one canvas; alternatives may be split across canvases.
    ...w1(ctx).filter(c => c.id !== "state_frames_created"),
    { id: "three_directions_drawn", pass: frames >= 3, detail: `${frames} frames across ${canvases.length} canvases` },
    { id: "pro_price_from_readme", pass: html.includes("$12"), detail: `Pro price $12 ${html.includes("$12") ? "present" : "missing"}` },
    changesWithin(ctx, path => path.startsWith(".doan/canvases/") || path.startsWith(".doan/assets/")),
  ];
};
export default checks;
