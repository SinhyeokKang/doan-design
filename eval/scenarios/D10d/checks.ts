import type { Checks } from "../../lib/types.ts";
import w1 from "../W1/checks.ts";
import { changesWithin, presetChecks } from "../D1/presets.ts";

// A proposed token may appear in DESIGN.md as an open item, so only the
// canvas's var() references are checked automatically; the judge reads the rest.
const VAR = /var\(\s*(--[a-z0-9-]+)/g;

const checks: Checks = ctx => {
  let config: any = null;
  try { config = JSON.parse(ctx.read(".doan/config.json") ?? "null"); } catch { /* reported below */ }
  const defined = [...new Set((ctx.read("styles/tokens.css") ?? "").match(/--[a-z0-9-]+(?=\s*:)/g) ?? [])];
  const documented = defined;
  const design = ctx.read("DESIGN.md") ?? "";
  const listing = ctx.doan(["ls"]);
  const listed: { id: string; path: string }[] = listing.json?.result?.canvases ?? [];
  const documents = listed.filter(c => c.path.startsWith(".doan/ds/")).map(c => ctx.read(c.path) ?? "");
  const canvas = documents.join("\n");
  const missing = (text: string) => documented.filter(name => !new RegExp(`${name}(?![a-z0-9-])`).test(text));
  const local = canvas.match(/--[a-z0-9-]+(?=\s*:)/g) ?? [];
  const invented = [...new Set([...canvas.matchAll(VAR)].map(m => m[1]))].filter(name => !defined.includes(name) && !local.includes(name));
  return [
    ...presetChecks(ctx, { required: ["context", "document"], allowed: ["context", "document"] }),
    { id: "doan_initialized", pass: config?.tokenCss === "styles/tokens.css" && config?.serve === undefined, detail: JSON.stringify(config) },
    { id: "rules_document_written", pass: design.trim() !== "", detail: design ? `${design.length} chars` : "DESIGN.md missing" },
    { id: "design_system_canvas", pass: listing.code === 0 && documents.length > 0, detail: JSON.stringify(listed) },
    ...w1(ctx).filter(c => c.id !== "state_frames_created"),
    { id: "tokens_in_both", pass: design !== "" && canvas !== "" && missing(design).length + missing(canvas).length === 0, detail: `missing in DESIGN.md: ${missing(design).join(", ") || "(none)"}; missing on canvas: ${missing(canvas).join(", ") || "(none)"}` },
    { id: "canvas_uses_defined_tokens", pass: invented.length === 0, detail: `undefined var() references: ${invented.join(", ") || "(none)"}` },
    changesWithin(ctx, path => path === "DESIGN.md" || path === ".gitattributes" || path === ".doan/config.json" || path.startsWith(".doan/canvases/") || path.startsWith(".doan/assets/") || path.startsWith(".doan/ds/")),
  ];
};
export default checks;
