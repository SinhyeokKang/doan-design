import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import checks from "./checks.ts";
import type { CheckContext } from "../../lib/types.ts";

const path = ".doan/canvases/onboarding.html";
const prototype = '<title>Sign up (phone) — Prototype</title><noscript><p class="proto-line"><span>Open this file in a web browser to play this prototype.</span></p></noscript>';
const viewer = '<title>Onboarding</title><main>Canvas viewer</main>';
const command = `doan export ${path} --frame signup-phone --prototype -o ../signup-prototype.html`;

function withOutput(run: (failures: (commands: string[], output: string | null, changed?: string[], reference?: string, cwd?: string) => string[], repo: string, dir: string) => void) {
  const dir = mkdtempSync("/tmp/doan-X2-checks-");
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const failures = (commands: string[], output: string | null, changed: string[] = [], reference = prototype, cwd = repo) => {
    const target = join(dir, "signup-prototype.html");
    rmSync(target, { force: true });
    if (output !== null) writeFileSync(target, output);
    return checks({ repo, cwd, calls: { commands }, changedFiles: () => changed,
      doan(args: string[]) {
        const isPrototype = args.includes("--prototype");
        assert.deepEqual(args.slice(0, -1), isPrototype ? ["export", path, "--frame", "signup-phone", "--prototype", "-o"] : ["export", path, "-o"]);
        writeFileSync(args.at(-1)!, isPrototype ? reference : viewer);
        return { code: 0, json: { result: { prototype: isPrototype } } };
      },
    } as CheckContext).filter(c => !c.pass).map(c => c.id);
  };
  try { run(failures, repo, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("X2 accepts delivered exports, including export-then-copy and --repo from another cwd", () => withOutput((failures, repo, dir) => {
  assert.deepEqual(failures([command], prototype), []);
  assert.deepEqual(failures([command.replace(" --prototype", "")], prototype), ["prototype_export_command"]);
  assert.deepEqual(failures([command.replace("signup-phone", "signup-desktop")], prototype), ["prototype_export_command"]);
  assert.deepEqual(failures([command.replace("../signup-prototype.html", "/tmp/export-first.html")], prototype), []);
  assert.deepEqual(failures([command], null), ["output_at_requested_path", "output_is_prototype_export", "output_not_canvas_viewer"]);
  assert.deepEqual(failures([command], "hand-made page"), ["output_is_prototype_export", "output_not_canvas_viewer"]);
  assert.deepEqual(failures([command], prototype, [path]), ["repo_unchanged"]);
  assert.deepEqual(failures([`doan --repo ${repo} export ${path} --frame signup-phone --prototype -o /tmp/out.html`], prototype, [], prototype, dir), []);
  assert.deepEqual(failures([command.replace(path, join(repo, path))], prototype, [], prototype, dir), []);
}));

test("X2 rejects viewer bytes even when the prototype CLI reference regresses to the viewer", () => withOutput(failures => {
  assert.deepEqual(failures([command], viewer, [], viewer), ["output_not_canvas_viewer"]);
  const missingTitle = prototype.replace("Sign up (phone) — Prototype", "Onboarding");
  assert.deepEqual(failures([command], missingTitle, [], missingTitle), ["output_not_canvas_viewer"]);
  const missingNotice = prototype.replace("Open this file in a web browser to play this prototype.", "");
  assert.deepEqual(failures([command], missingNotice, [], missingNotice), ["output_not_canvas_viewer"]);
}));

test("X2 accepts an absolute canvas path through a repository symlink alias", () => withOutput((failures, repo, dir) => {
  mkdirSync(join(repo, ".doan/canvases"), { recursive: true });
  writeFileSync(join(repo, path), "canvas");
  const alias = join(dir, "alias");
  symlinkSync(repo, alias);
  assert.deepEqual(failures([command.replace(path, join(alias, path))], prototype), []);
  assert.deepEqual(failures([command.replace(path, join(alias, ".doan/canvases/other.html"))], prototype), ["prototype_export_command"]);
}));
