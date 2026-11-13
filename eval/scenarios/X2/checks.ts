import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Checks } from "../../lib/types.ts";
import { prototypeCalls } from "../../lib/prototype.ts";

const path = ".doan/canvases/onboarding.html";
const frame = "signup-phone";
const checks: Checks = ctx => {
  const output = resolve(ctx.repo, "..", "signup-prototype.html");
  const reference = resolve(ctx.repo, "..", "reference-prototype.html");
  const calls = prototypeCalls(ctx.calls.commands, "export");
  const asked = calls.some(call => call.prototype && call.frame === frame && call.path !== undefined && call.output !== undefined
    && resolve(ctx.cwd, call.path) === resolve(ctx.repo, path) && resolve(ctx.cwd, call.output) === output);
  const page = existsSync(output) ? readFileSync(output) : null;
  let same = false, detail = "no output file";
  if (page) {
    const made = ctx.doan(["export", path, "--frame", frame, "--prototype", "-o", reference]);
    try {
      same = made.code === 0 && made.json?.result?.prototype === true && existsSync(reference) && readFileSync(reference).equals(page);
      detail = made.code !== 0 ? `reference export failed: ${JSON.stringify(made.json)}` : same ? "byte-identical to doan export --prototype" : "file differs from prototype export";
    } finally { rmSync(reference, { force: true }); }
  }
  const changed = ctx.changedFiles();
  return [
    { id: "prototype_export_command", pass: asked, detail: JSON.stringify(calls) },
    { id: "output_at_requested_path", pass: page !== null, detail: page ? `${page.length} bytes at ${output}` : `no file at ${output}` },
    { id: "output_is_prototype_export", pass: same, detail },
    { id: "repo_unchanged", pass: changed.length === 0, detail: JSON.stringify(changed) },
  ];
};
export default checks;
