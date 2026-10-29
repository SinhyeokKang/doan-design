import type { Checks } from "../../lib/types.ts";
import { presetChecks } from "../D1/presets.ts";

const checks: Checks = ctx => {
  const changed = ctx.changedFiles();
  return [
    ...presetChecks(ctx, { required: [["critique", "audit"]], allowed: ["critique", "audit", "context"] }),
    { id: "no_changes", pass: changed.length === 0, detail: `changed: ${changed.join(", ") || "(none)"}` },
  ];
};
export default checks;
