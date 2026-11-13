import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Checks } from "../../lib/types.ts";
import { prototypeCalls, prototypeCanvasPath } from "../../lib/prototype.ts";

const path = ".doan/canvases/onboarding.html";
const frame = "signup-phone";
const checks: Checks = ctx => {
  const output = resolve(ctx.repo, "..", "signup-prototype.html");
  const reference = resolve(ctx.repo, "..", "reference-prototype.html");
  const viewerReference = resolve(ctx.repo, "..", "reference-canvas-viewer.html");
  const calls = prototypeCalls(ctx.calls.commands, "export");
  const asked = calls.some(call => call.prototype && call.frame === frame && call.path !== undefined
    && prototypeCanvasPath(ctx.repo, call.path) === prototypeCanvasPath(ctx.repo, path));
  const page = existsSync(output) ? readFileSync(output) : null;
  let same = false, detail = "no output file", notViewer = false, pageDetail = "no output file";
  if (page) {
    const made = ctx.doan(["export", path, "--frame", frame, "--prototype", "-o", reference]);
    try {
      same = made.code === 0 && made.json?.result?.prototype === true && existsSync(reference) && readFileSync(reference).equals(page);
      detail = made.code !== 0 ? `reference export failed: ${JSON.stringify(made.json)}` : same ? "byte-identical to doan export --prototype" : "file differs from prototype export";
    } finally { rmSync(reference, { force: true }); }
    const viewer = ctx.doan(["export", path, "-o", viewerReference]);
    try {
      const text = page.toString("utf8");
      const markers = text.includes("<title>Sign up (phone) — Prototype</title>")
        && [...text.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/g)].some(match => match[1]!.includes("Open this file in a web browser to play this prototype."));
      const differs = viewer.code === 0 && existsSync(viewerReference) && !readFileSync(viewerReference).equals(page);
      notViewer = markers && differs;
      pageDetail = viewer.code !== 0 ? `canvas viewer reference failed: ${JSON.stringify(viewer.json)}` : `prototype markers: ${markers}; differs from canvas viewer: ${differs}`;
    } finally { rmSync(viewerReference, { force: true }); }
  }
  const changed = ctx.changedFiles();
  return [
    { id: "prototype_export_command", pass: asked, detail: JSON.stringify(calls) },
    { id: "output_at_requested_path", pass: page !== null, detail: page ? `${page.length} bytes at ${output}` : `no file at ${output}` },
    { id: "output_is_prototype_export", pass: same, detail },
    { id: "output_not_canvas_viewer", pass: notViewer, detail: pageDetail },
    { id: "repo_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ];
};
export default checks;
