import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const cliPath = fileURLToPath(new URL("../build/bin/doan", import.meta.url));

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(new URL("../build/bin/", import.meta.url), { recursive: true });
run("go", ["build", "-ldflags", `-X github.com/SinhyeokKang/doan-design/cli/internal/cli.Version=${version}`, "-o", cliPath, "./cli/cmd/doan"], repoRoot, { ...process.env, GOOS: "darwin", GOARCH: "arm64" });
run("electron-vite", ["build"], appDir);
run("electron-builder", ["--mac", "dir", "--arm64"], appDir, { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
