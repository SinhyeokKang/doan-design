import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// userData alone does not isolate login-shell discovery or agent setup writes.
export async function isolatedEnv(userData: string, cli: string): Promise<NodeJS.ProcessEnv> {
  const home = join(dirname(userData), "home");
  const shell = join(dirname(userData), "fake-shell");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await writeFile(join(userData, "onboarding.json"), "{}\n");
  return {
    ...process.env, HOME: home, TMPDIR: dirname(userData), SHELL: shell,
    CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"),
    DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json"),
  };
}
