import { noHandoff } from "../../lib/handoff.ts";
import { noOpen } from "../../lib/open.ts";
import type { Checks } from "../../lib/types.ts";

const SOURCE = ".doan/canvases/account.html";

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const html = ctx.read(SOURCE) ?? "";
  return [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_source_edited", pass: changed.length === 1 && changed[0] === SOURCE, detail: `changed: ${changed.join(", ") || "(none)"}` },
    { id: "profile_title_renamed", pass: /data-doan-id="profile-title"[^>]*>\s*Your profile\s*</.test(html), detail: `the Profile title in ${SOURCE}` },
    // The turn prompt offers handoff and send, and the person named `invoices` without asking for either.
    noHandoff(ctx),
    noOpen(ctx),
  ];
};
export default checks;
