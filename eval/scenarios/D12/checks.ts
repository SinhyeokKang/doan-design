import type { Checks } from "../../lib/types.ts";
import { changesWithin, presetChecks } from "../D1/presets.ts";

const checks: Checks = ctx => {
  let config: any = null;
  try { config = JSON.parse(ctx.read(".doan/config.json") ?? "null"); } catch { /* reported below */ }
  return [
    ...presetChecks(ctx, { required: [], allowed: ["context"] }),
    { id: "doan_initialized", pass: config?.tokenCss === "styles/tokens.css" && config?.serve === undefined, detail: JSON.stringify(config) },
    changesWithin(ctx, path => path === ".doan/config.json" || path === ".gitattributes"),
  ];
};
export default checks;
