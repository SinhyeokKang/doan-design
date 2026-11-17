import { finalAnswer, withoutCode } from "../../lib/answer.ts";
import type { Checks } from "../../lib/types.ts";
import { inspect } from "./inspect.ts";

const checks: Checks = ctx => {
  const target = ".doan/canvases/dashboard.html";
  const before = inspect(ctx, ctx.seed(target) ?? "");
  const after = inspect(ctx, ctx.read(target) ?? "");
  const changed = ctx.changedFiles();
  const frame = (doc: typeof after, index: number): string | undefined => {
    for (let i = index; i >= 0; i = doc.nodes[i]!.parent) {
      if (doc.nodes[i]!.attrs["data-doan-frame"]) return doc.nodes[i]!.attrs["data-doan-frame"];
    }
  };
  const ids = (doc: typeof after, attr: string) => doc.nodes.flatMap(n => n.attrs[attr] ? [n.attrs[attr]] : []);
  const frames = ids(before, "data-doan-frame");
  const anchors = ["export", "activity-title", "workload-note"];
  const identities = after.nodes.some(n => n.tag === "meta" && n.attrs.name === "doan:canvas" && n.attrs.content === "dashboard") &&
    frames.every(id => ids(after, "data-doan-frame").filter(x => x === id).length === 1) &&
    anchors.every(id => {
      const old = before.nodes.findIndex(n => n.attrs["data-doan-id"] === id);
      const matches = after.nodes.flatMap((n, i) => n.attrs["data-doan-id"] === id ? [i] : []);
      return matches.length === 1 && frame(after, matches[0]!) === frame(before, old);
    });
  const check = ctx.doan(["check"]);
  // Only the final answer is what the user is asked; a question the agent raised mid-run and went past is not one,
  // and neither is a question mark in code.
  const response = withoutCode(finalAnswer(ctx.transcript));
  // The judge evaluates the question's relevance and the quality/bounds of edits.
  const question = /[?？]/.test(response) || /\b(?:please|could you)\s+(?:clarify|confirm|specify|choose)\b/i.test(response);
  const dashboardChanged = changed.includes(target) && after.nodes.length > 0;
  const scoped = changed.every(p => p === target || ((p.startsWith(".doan/canvases/") || p.startsWith(".doan/assets/")) && p.endsWith(".css") && ctx.seed(p) === null));
  return [
    { id: "clarified_or_edited", pass: (changed.length === 0 && question) || dashboardChanged, detail: `changed: ${changed.join(", ") || "none"}; assistant scope question: ${question}` },
    { id: "dashboard_scope_only", pass: scoped && ctx.read(".doan/canvases/settings.html") === ctx.seed(".doan/canvases/settings.html"), detail: `changed paths: ${changed.join(", ") || "none"}` },
    { id: "identities_preserved", pass: identities, detail: "dashboard canvas, original frames and anchor elements retain their identities and frame membership" },
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: JSON.stringify(check.json?.result?.summary) },
  ];
};
export default checks;
