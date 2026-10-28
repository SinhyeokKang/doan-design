import { basename, isAbsolute } from "node:path";
import { supportedVersion } from "../conversation/prepare";
import { findOnPath, type ShellProbe } from "../onboarding/states";
import { PROVIDER_AUTH } from "./providers";
import type { CliRun } from "../folderState";
import type { Provider, ToolFacts } from "./types";

export interface FactsDeps {
  shell(): Promise<ShellProbe>; run(command: string, args: string[], env: NodeJS.ProcessEnv, timeout: number): Promise<CliRun>;
  executable(path: string): boolean; inherited: NodeJS.ProcessEnv;
  // The bundled doan executable that every doan-account run puts first on PATH (createAccountPrepare).
  cli: string;
}
// Concurrent provider probes share one login shell run: four at once missed the shell's 5 s answer under load (B45 live).
export function sharedShell(probe: () => Promise<ShellProbe>): () => Promise<ShellProbe> {
  let running: Promise<ShellProbe> | null = null;
  return () => running ??= probe().finally(() => { running = null; });
}
// Readiness facts read the way a run finds the CLI: the login shell's PATH, then the same version rule. Antigravity's
// server is doan's own sha-pinned download, installed on first use; a failed install surfaces as cli_install_failed.
export async function toolFacts(provider: Provider, deps: FactsDeps): Promise<ToolFacts> {
  const tools = isAbsolute(deps.cli) && basename(deps.cli) === "doan" && deps.executable(deps.cli) ? "ready" : "missing";
  if (provider === "antigravity") return { cli: "found", version: "supported", tools };
  try {
    const probe = await deps.shell();
    // An unreadable shell is not proof the CLI is missing; a retry may read it.
    if (!probe.ok) return { cli: "found", version: "unknown", tools };
    const command = findOnPath(probe.path, PROVIDER_AUTH[provider].command, deps.executable);
    if (!command) return { cli: "missing", version: "unknown", tools };
    const run = await deps.run(command, ["--version"], { ...deps.inherited, PATH: probe.path }, 5000);
    if (run.exitCode !== 0 || run.timedOut) return { cli: "found", version: "unknown", tools };
    return { cli: "found", version: supportedVersion(provider, run.stdout) ? "supported" : "unsupported", tools };
  } catch { return { cli: "found", version: "unknown", tools }; }
}
