import { commandWords, doanCommand } from "../../lib/transcript.ts";
import type { Checks } from "../../lib/types.ts";
import { clean, element, hasToken, inspect, styles } from "./inspect.ts";

const checks: Checks = ctx => {
  const path = "design/checkout.html";
  const doc = inspect(ctx, ctx.read(path) ?? "");
  const seed = inspect(ctx, ctx.seed(path) ?? "");
  const cta = element(doc, "secondary");
  const background = styles(doc, cta)["background-color"];
  // Compare structure, attributes, direct text and static styles outside the selected element.
  const snapshot = (d: typeof doc) => d.nodes.filter(n => n.tag !== "style").map(n => {
    const attrs = { ...n.attrs };
    const selected = attrs["data-doan-id"] === "secondary";
    delete attrs.style; delete attrs.class;
    const children = d.nodes.filter(child => child.parent === d.nodes.indexOf(n));
    let ownText = n.text;
    for (const child of children) ownText = ownText.replace(child.text, "");
    return { tag: n.tag, parent: d.nodes.slice(0, n.parent + 1).filter(p => p.tag !== "style").length - 1, attrs: Object.fromEntries(Object.entries(attrs).sort()), text: ownText.replace(/\s+/g, " ").trim(), styles: selected ? {} : Object.fromEntries(Object.entries(styles(d, n)).sort()) };
  });
  const invoked = ctx.calls.commands.flatMap(commandWords).some(words => doanCommand(words) === "active") || ctx.calls.mcpTools.includes("mcp__doan__active");
  return [
    clean(ctx),
    { id: "asked_doan_active", pass: invoked, detail: invoked ? "doan active or MCP active invoked; success is not established by invocation evidence" : "no doan active or MCP active invocation found in the available transcript" },
    { id: "selected_primary_background", pass: !!cta && hasToken(background, "--color-primary"), detail: `selected background: ${background ?? "(missing)"}` },
    { id: "other_elements_unchanged", pass: JSON.stringify(snapshot(doc)) === JSON.stringify(snapshot(seed)), detail: "non-selected structure, copy, attributes and static declarations match the seed" },
    { id: "only_canvas_changed", pass: ctx.changedFiles().length === 1 && ctx.changedFiles()[0] === path, detail: `changed: ${ctx.changedFiles().join(", ") || "(none)"}` },
  ];
};
export default checks;
