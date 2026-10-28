import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-H3-checks-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function setup(pass = false, transcript = "") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (pass) cpSync(join(import.meta.dirname, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env: process.env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);

test("H3 accepts Notice string props but rejects comment-only cutoff copy", () => {
  const ctx = setup(true), target = "web/src/components/DispatchQueue.tsx";
  const good = 'import { Notice } from "./Notice";\n' + ctx.read(target)!.replace(
    '<p>Pickup closes at 16:30.</p>', '<Notice message="Pickup closes at 16:30." />');
  writeFileSync(join(ctx.repo, target), good);
  assert.deepEqual(failures(ctx), []);
  writeFileSync(join(ctx.repo, target), good.replace('message="Pickup closes at 16:30."', 'message="Missing cutoff"') + '\n/* "Pickup closes at 16:30." */\n// "Pickup closes at 16:30."\n');
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
});

test("H3 rejects an untouched target and comment-only copy", () => {
  const ctx = setup();
  assert.ok(failures(ctx).includes("target_function_implemented"));
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
  writeFileSync(join(ctx.repo, "web/src/components/DispatchQueue.tsx"), ctx.seed("web/src/components/DispatchQueue.tsx")! + "\n/* Ready for dispatch; Print packing slips */\n");
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
});
test("H3 accepts tokenized CSS and inline styles, rejects direct color and protected changes", () => {
  const ctx = setup(true);
  assert.deepEqual(failures(ctx), []);
  const target = "web/src/components/DispatchQueue.tsx";
  const good = ctx.read(target)!;
  writeFileSync(join(ctx.repo, target), good.replace('<main className="dispatch-queue">', '<main className="dispatch-queue" style={{ color: "var(--color-text)" }}>'));
  assert.deepEqual(failures(ctx), []);
  writeFileSync(join(ctx.repo, target), good.replace('<main className="dispatch-queue">', '<main className="dispatch-queue" style={{ color: "rgb(1, 2, 3)" }}>'));
  assert.ok(failures(ctx).includes("no_new_direct_colors"));
  writeFileSync(join(ctx.repo, target), good);
  writeFileSync(join(ctx.repo, ".doan/canvases/dispatch.html"), ctx.seed(".doan/canvases/dispatch.html")! + "\n");
  assert.ok(failures(ctx).includes("design_and_review_unchanged"));
});
test("H3 accepts semantic text and data-driven package rows", () => {
  const ctx = setup(true), target = "web/src/components/DispatchQueue.tsx", good = ctx.read(target)!;
  writeFileSync(join(ctx.repo, target), good.replace('Pickup closes at 16:30.', 'Pickup closes at <time dateTime="16:30">16:30</time>.'));
  assert.deepEqual(failures(ctx), []);
  const data = 'const orders = [{ id: "PK-2048", destination: "North studio", packages: 2 }, { id: "PK-2051", destination: "Harbor office", packages: 1 }, { id: "PK-2054", destination: "West workshop", packages: 4 }];\n';
  const rows = '{orders.map(o => <tr key={o.id}><td>{o.id}</td><td>{o.destination}</td><td>{o.packages} {o.packages === 1 ? "box" : "boxes"}</td></tr>)}';
  writeFileSync(join(ctx.repo, target), data + good.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${rows}</tbody>`));
  assert.deepEqual(failures(ctx), []);
  writeFileSync(join(ctx.repo, target), ctx.read(target)!.replace('North studio', 'Invented destination'));
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
});
