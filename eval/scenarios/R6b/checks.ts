import type { Checks } from "../../lib/types.ts";
import { clean, element, inspect, reviewState, text } from "../R1/inspect.ts";

// "Save" is the create-time label and "Save changes" the rejected agent change.
// Replacing them catches unchanged re-resolution, not understanding of lastResolution:
// an agent reading only the body could also judge "Save changes" too vague.
const REJECTED = ["save", "save changes"];

const checks: Checks = ctx => {
  const doc = inspect(ctx, ctx.read("design/profile.html") ?? "");
  const label = text(element(doc, "save"));
  const changed = ctx.changedFiles();
  return [
    clean(ctx),
    { id: "rejected_label_replaced", pass: !REJECTED.includes(label.toLowerCase()) && label.split(" ").length >= 2, detail: `save label: ${label}` },
    { id: "other_labels_unchanged", pass: text(element(doc, "heading")) === "Your profile" && text(element(doc, "cancel")) === "Cancel", detail: "heading and Cancel retain their original labels" },
    ...reviewState(ctx, "profile", ["cmt_00000000-0000-4000-8000-000000000001"]),
    { id: "scope_preserved", pass: changed.every(p => p === "design/profile.html" || p === ".doan/comments/profile.jsonl"), detail: `changed: ${changed.join(", ")}` },
  ];
};
export default checks;
