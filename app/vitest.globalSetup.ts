import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    doanCli: string;
  }
}

// Tests run the real CLI so the app is checked against the envelope Go
// actually prints, without depending on a `doan` the developer may not have
// on PATH (or an older one without `root`/`scope`).
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const dir = await mkdtemp(join(tmpdir(), "doan-cli-"));
  const cli = join(dir, "doan");
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  await promisify(execFile)("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: repoRoot });
  project.provide("doanCli", cli);
  return () => rm(dir, { recursive: true, force: true });
}
