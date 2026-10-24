import type { Checks } from "../../lib/types.ts";
import { clean, element, hasToken, inspect, reviewState, styles, text } from "./inspect.ts";

const checks: Checks = ctx => {
  const doc = inspect(ctx, ctx.read("design/profile.html") ?? "");
  const listing = ctx.doan(["ls"]);
  const saved = doc.nodes.filter(n => n.attrs["data-doan-frame"] && n.attrs["data-doan-frame"] !== "profile" && n.attrs["data-doan-title"] === "Profile saved" && text(n).includes("Your profile is up to date."));
  return [
    clean(ctx),
    { id: "save_label_applied", pass: text(element(doc, "save")) === "Save profile", detail: `save label: ${text(element(doc, "save"))}` },
    { id: "actions_gap_applied", pass: hasToken(styles(doc, element(doc, "actions")).gap, "--space-6"), detail: `actions gap: ${styles(doc, element(doc, "actions")).gap ?? "(missing)"}` },
    { id: "success_frame_added", pass: saved.length === 1 && listing.code === 0, detail: `${saved.length} new success frames titled Profile saved with the requested message` },
    { id: "resolved_instruction_untouched", pass: text(element(doc, "heading")) === "Your profile", detail: `heading: ${text(element(doc, "heading"))}` },
    ...reviewState(ctx, "profile", [1, 2, 3].map(n => `cmt_00000000-0000-4000-8000-00000000000${n}`)),
    { id: "scope_preserved", pass: ctx.changedFiles().every(p => p === "design/profile.html" || p === ".doan/comments/profile.jsonl"), detail: `changed: ${ctx.changedFiles().join(", ")}` },
  ];
};
export default checks;
