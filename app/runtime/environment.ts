import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// An allowlist: provider API keys, GH/Copilot tokens and config-dir overrides in the developer's shell
// would otherwise sign the probed app in as the developer.
const INHERITED = new Set(["PATH", "USER", "LOGNAME", "LANG", "TERM", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "__CF_USER_TEXT_ENCODING",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy"]);
function inheritable(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => INHERITED.has(name) || name.startsWith("LC_")));
}

// userData alone does not isolate login-shell discovery or agent setup writes.
export async function isolatedEnv(userData: string, cli: string): Promise<NodeJS.ProcessEnv> {
  const home = join(dirname(userData), "home");
  const shell = join(dirname(userData), "fake-shell");
  await mkdir(home, { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await writeFile(join(userData, "onboarding.json"), "{}\n");
  return {
    ...inheritable(process.env), HOME: home, TMPDIR: dirname(userData), SHELL: shell,
    CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"),
    DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json"),
  };
}
