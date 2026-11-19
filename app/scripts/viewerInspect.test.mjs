import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("both exported inspector scripts match their TypeScript sources", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("./viewerInspect.mjs", import.meta.url)), "--check"]);
});

test("the generator rejects a reader that uses an unextracted canvas local", () => {
  const app = fileURLToPath(new URL("../", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "doan-reader-test-"));
  try {
    const fixture = join(root, "app");
    mkdirSync(join(fixture, "src/main"), { recursive: true });
    mkdirSync(join(fixture, "scripts"));
    mkdirSync(join(root, "cli/internal/export/viewer"), { recursive: true });
    for (const name of ["node_modules", "src/renderer", "src/shared"]) symlinkSync(join(app, name), join(fixture, name));
    for (const name of ["inspect.ts", "cssomMatched.ts"]) symlinkSync(join(app, "src/main", name), join(fixture, "src/main", name));
    const original = readFileSync(join(app, "src/main/canvasScript.ts"), "utf8");
    const changed = original.replace("  const isRoot =", "  const isReady = () => true;\n  const isRoot =").replace("el === document.documentElement ||", "isReady() && el === document.documentElement ||");
    expect(changed).toContain("isReady() &&");
    writeFileSync(join(fixture, "src/main/canvasScript.ts"), changed);
    const script = join(fixture, "scripts/viewerInspect.mjs");
    copyFileSync(join(app, "scripts/viewerInspect.mjs"), script);
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unextracted canvas reader dependency: isReady");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
