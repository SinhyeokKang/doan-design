import type { Checks } from "../../lib/types.ts";
import { clean, element, inspect, reviewState, text } from "../R1/inspect.ts";

const checks: Checks = ctx => {
  const doc = inspect(ctx, ctx.read("doan/profile.html") ?? "");
  const changed = ctx.changedFiles();
  return [
    clean(ctx),
    { id: "reopened_request_applied", pass: text(element(doc, "save")) === "Save profile", detail: `save label: ${text(element(doc, "save"))}` },
    { id: "other_labels_unchanged", pass: text(element(doc, "heading")) === "Your profile" && text(element(doc, "cancel")) === "Cancel", detail: "heading and Cancel retain their original labels" },
    ...reviewState(ctx, "profile", ["cmt_00000000-0000-4000-8000-000000000001"]),
    { id: "scope_preserved", pass: changed.every(p => p === "doan/profile.html" || p === ".doan/comments/profile.jsonl"), detail: `changed: ${changed.join(", ")}` },
  ];
};
export default checks;
