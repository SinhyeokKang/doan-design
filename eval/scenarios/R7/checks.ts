import { commandWords, doanCommand } from "../../lib/transcript.ts";
import type { Checks } from "../../lib/types.ts";
import { reviewState, text } from "../R1/inspect.ts";
import { clean, element, hasToken, inspect, styles } from "../R2b/inspect.ts";

export const LABEL = "cmt_4c9e2a71-6f3d-4b58-8a1e-2d7c5b9f0e11";
export const COLOR = "cmt_8e1b5d93-2a7c-4f06-b9d4-6c3a1e8f2d12";
export const TERMS = "cmt_a2f7c4e8-9b1d-4e63-a5c0-7e4d2b6a9f13";

const checks: Checks = ctx => {
  const path = "doan/signup.html";
  const doc = inspect(ctx, ctx.read(path) ?? "");
  const seed = inspect(ctx, ctx.seed(path) ?? "");
  const submit = element(doc, "submit");
  const background = styles(doc, submit)["background-color"];
  // Every other anchored element keeps its tag, attributes, text and static styles.
  const others = (d: typeof doc) => d.nodes.filter(n => n.attrs["data-doan-id"] && n.attrs["data-doan-id"] !== "submit")
    .map(n => ({ tag: n.tag, attrs: Object.fromEntries(Object.entries(n.attrs).sort()), text: text(n), styles: Object.fromEntries(Object.entries(styles(d, n)).sort()) }));
  const open: string[] = (ctx.doan(["comments", "--canvas", "signup"]).json?.result?.comments ?? []).map((c: { comment: string }) => c.comment);
  const invoked = ctx.calls.commands.flatMap(commandWords).some(words => doanCommand(words) === "active") || ctx.calls.mcpTools.includes("mcp__doan__active");
  const changed = ctx.changedFiles();
  return [
    clean(ctx),
    { id: "asked_doan_active", pass: invoked, detail: invoked ? "doan active or MCP active invoked; success is not established by invocation evidence" : "no doan active or MCP active invocation found in the available transcript" },
    { id: "attached_label_applied", pass: text(submit) === "Create account", detail: `submit label: ${text(submit) || "(missing)"}` },
    { id: "attached_color_applied", pass: !!submit && hasToken(background, "--color-primary"), detail: `submit background: ${background ?? "(missing)"}` },
    ...reviewState(ctx, "signup", [LABEL, COLOR]),
    { id: "unattached_comment_left_open", pass: open.includes(TERMS), detail: `open comments: ${open.join(", ") || "(none)"}` },
    { id: "other_elements_unchanged", pass: JSON.stringify(others(doc)) === JSON.stringify(others(seed)), detail: "every anchored element other than Submit matches the seed, including the Terms link" },
    { id: "scope_preserved", pass: changed.every(p => p === path || p === ".doan/comments/signup.jsonl"), detail: `changed: ${changed.join(", ")}` },
  ];
};
export default checks;
