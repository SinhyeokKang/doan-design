import type { Checks } from "../../lib/types.ts";
import d2 from "../D2/checks.ts";
import { canvasParts } from "../D1/presets.ts";

// D2 with the duplicate toggle worded unambiguously ("Email me when a client
// pays an invoice"), so merging it is required rather than a judgment call.
const checks: Checks = ctx => {
  const text = canvasParts(ctx, ".doan/canvases/settings.html")?.frames.notifications?.text ?? "";
  const paid = text.match(/\bis paid\b|\bpays an invoice\b/gi) ?? [];
  return [
    ...d2(ctx),
    { id: "duplicate_paid_merged", pass: paid.length === 1, detail: `paid-invoice mentions in Notifications: ${paid.length}` },
  ];
};
export default checks;
