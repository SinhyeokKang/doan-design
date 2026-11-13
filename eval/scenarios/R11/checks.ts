import { handoffsForCanvases } from "../../lib/handoff.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const targets = [
  { path: ".doan/canvases/profile-mobile.html", copy: ["Sign-in email: ada@example.com", "Save"] },
  { path: ".doan/canvases/billing-mobile.html", copy: ["Invoices are sent on the first of each month.", "Update card"] },
];
const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const paths = targets.map(target => target.path);
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_two_new_canvases_added", pass: changed.length === 2 && paths.every(path => changed.includes(path) && ctx.seed(path) === null && ctx.read(path) !== null), detail: `changed: ${changed.join(", ") || "(none)"}` },
    ...targets.map(({ path, copy }) => {
      const html = ctx.read(path) ?? "";
      return { id: path.includes("profile-mobile") ? "profile_mobile_content" : "billing_mobile_content", pass: /<meta\s+name="doan:width"\s+content="390"/.test(html) && copy.every(text => html.includes(text)), detail: `${path}: requires 390 px width and ${JSON.stringify(copy)}` };
    }),
    ...handoffsForCanvases(ctx, paths),
    noOpen(ctx),
  ];
};
export default checks;
