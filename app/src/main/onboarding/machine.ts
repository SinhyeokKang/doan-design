import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { basename, isAbsolute } from "node:path";
import type { CliRun } from "../folderState";
import { launchEnv } from "../launchEnv";
import { parseShellProbe, type ShellProbe } from "./states";

// PoC 7a: 83 ms. Leave room for cold startup.
export const SHELL_TIMEOUT_MS = 5000;
const OUTPUT_LIMIT = 1024 * 1024;

export function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeout: number, nonce?: string): Promise<CliRun> {
  return new Promise(resolveRun => {
    let stdout = "", stderr = "", settled = false;
    const child = spawn(command, args, { env, cwd: env.HOME, stdio: ["ignore", "pipe", "pipe"] });
    const finish = (result: Partial<CliRun>) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolveRun({ stdout, stderr, exitCode: null, timedOut: false, ...result });
    };
    const kill = () => { try { child.kill("SIGKILL"); } catch { /* Settlement cannot depend on kill success. */ } };
    const timer = setTimeout(() => { kill(); finish({ timedOut: true }); }, timeout);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      stdout += data;
      if (stdout.length > OUTPUT_LIMIT) { kill(); finish({ spawnError: "Process output exceeded the limit." }); }
      else if (nonce && parseShellProbe(stdout, nonce).ok) { kill(); finish({ exitCode: 0 }); }
    });
    child.stderr.on("data", (data: string) => { stderr += data; if (stderr.length > OUTPUT_LIMIT) { kill(); finish({ spawnError: "Process output exceeded the limit." }); } });
    child.once("error", error => finish({ spawnError: error.message }));
    // A daemon can inherit a pipe. Waiting for close would strand the caller.
    child.once("exit", code => finish({ exitCode: code }));
  });
}

function shellName(env: NodeJS.ProcessEnv, fallback = () => userInfo().shell): string {
  try { return env.SHELL || fallback() || ""; } catch { return ""; }
}
export async function probeShell(inherited: NodeJS.ProcessEnv, fallback?: () => string): Promise<ShellProbe> {
  const env = launchEnv(inherited);
  const shell = shellName(env, fallback);
  if (!isAbsolute(shell)) return { ok: false, reason: "No executable login shell is available." };
  const nonce = randomUUID().replaceAll("-", "");
  const script = `printf '\\nDOAN_PROBE_${nonce}_BEGIN\\n%s\\n%s\\n%s\\n%s\\nDOAN_PROBE_${nonce}_END\\n' "$PATH" "$CLAUDE_CONFIG_DIR" "$CODEX_HOME" "$CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION"`;
  const result = await runProcess(shell, [ ["zsh", "bash"].includes(basename(shell)) ? "-lic" : "-lc", script ], env, SHELL_TIMEOUT_MS, nonce);
  if (result.timedOut || result.spawnError || result.exitCode !== 0) return { ok: false, reason: result.spawnError ?? (result.timedOut ? `Your login shell (${shell}) didn’t answer in time.` : "Login shell failed.") };
  return parseShellProbe(result.stdout, nonce);
}
