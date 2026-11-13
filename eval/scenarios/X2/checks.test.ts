import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import checks from "./checks.ts";
import type { CheckContext } from "../../lib/types.ts";

const path = ".doan/canvases/onboarding.html";
const command = `doan export ${path} --frame signup-phone --prototype -o ../signup-prototype.html`;

test("X2 requires the requested prototype command, matching CLI output and unchanged repository", () => {
  const dir = mkdtempSync("/tmp/doan-X2-checks-");
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const failures = (commands: string[], output: string | null, changed: string[] = []) => {
    const target = join(dir, "signup-prototype.html");
    rmSync(target, { force: true });
    if (output !== null) writeFileSync(target, output);
    return checks({ repo, cwd: repo, calls: { commands }, changedFiles: () => changed,
      doan(args: string[]) {
        assert.deepEqual(args.slice(0, 6), ["export", path, "--frame", "signup-phone", "--prototype", "-o"]);
        writeFileSync(args[6]!, "prototype page");
        return { code: 0, json: { result: { prototype: true } } };
      },
    } as CheckContext).filter(c => !c.pass).map(c => c.id);
  };
  try {
    assert.deepEqual(failures([command], "prototype page"), []);
    assert.deepEqual(failures([command.replace(" --prototype", "")], "prototype page"), ["prototype_export_command"]);
    assert.deepEqual(failures([command.replace("signup-phone", "signup-desktop")], "prototype page"), ["prototype_export_command"]);
    assert.deepEqual(failures([command.replace("../signup-prototype.html", "elsewhere.html")], "prototype page"), ["prototype_export_command"]);
    assert.deepEqual(failures([command], null), ["output_at_requested_path", "output_is_prototype_export"]);
    assert.deepEqual(failures([command], "hand-made page"), ["output_is_prototype_export"]);
    assert.deepEqual(failures([command], "prototype page", [path]), ["repo_unchanged"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
