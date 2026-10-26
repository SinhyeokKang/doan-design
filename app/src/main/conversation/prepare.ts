import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { probeShell, runProcess } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { agentEnv } from "./environment";
import { canonicalDirectory, claudeOccupancy, readRegular, readSessionTail } from "./io";
import { insideRoot, pickSession, supportedRuntime } from "./sessions";
import type { Prepare, Prepared, StartRequest } from "./service";
import type { ConversationMetadata } from "./store";
export function createPrepare(userData: string, appRuntime: string, inherited: NodeJS.ProcessEnv): Prepare {
  return async (request: StartRequest, stored?: ConversationMetadata["session"]): Promise<Prepared> => {
    const picked = request.mode === "resume" && !stored ? pickSession(readSessionTail(userData), request.root, request.canvas ?? null, () => null) : null;
    if (picked && !picked.available) throw new Error("no_session");
    const session = stored ?? (picked?.available ? picked.record : undefined);
    const runtime = session?.runtime ?? request.runtime; if (!runtime) throw new Error("no_agent");
    const probe = await probeShell(inherited); if (!probe.ok) throw new Error("cli_missing");
    const command = findOnPath(probe.path, runtime, path => { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } });
    if (!command) throw new Error("cli_missing");
    const version = await runProcess(command, ["--version"], { ...inherited, PATH: probe.path }, 5000);
    const match = version.exitCode === 0 && !version.timedOut ? version.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? null : null;
    if (!supportedRuntime(runtime, match, "0.3.310")) throw new Error(request.mode === "resume" ? "session_unavailable" : "runtime_unsupported");
    let root: string, cwd: string, configDir: string;
    try {
      root = canonicalDirectory(request.root); cwd = canonicalDirectory(session?.cwd ?? root);
      configDir = canonicalDirectory((runtime === "claude" ? probe.claudeConfigDir : probe.codexHome) || join(inherited.HOME ?? "", runtime === "claude" ? ".claude" : ".codex"));
      if (root !== request.root || (session && (canonicalDirectory(session.configDir) !== session.configDir || configDir !== session.configDir))) throw new Error("session_unavailable");
    } catch { throw new Error("session_unavailable"); }
    if (!insideRoot(root, cwd)) throw new Error("outside_root");
    if (session && runtime === "claude") {
      const occupancy = await claudeOccupancy(configDir, session.sessionId);
      if (occupancy !== "free") throw new Error(occupancy === "occupied" ? "session_in_use" : "session_unavailable");
      if (!claudeSessionExists(configDir, session.sessionId)) throw new Error("session_unavailable");
    }
    const env = agentEnv({ env: inherited, path: probe.path, configDir }, runtime, appRuntime, { root, cwd, configDir });
    if (!env) throw new Error("session_unavailable");
    return { runtime, command, configDir, cwd, env: env.env, ...(session ? { sessionId: session.sessionId } : {}), ...(picked?.available ? { lastCheckAt: picked.record.at } : {}) };
  };
}
function claudeSessionExists(config: string, id: string): boolean {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return false;
  try {
    const base = join(config, "projects"), names = readdirSync(base); if (names.length > 4096) return false;
    for (const name of names) {
      const dir = join(base, name); if (canonicalDirectory(dir) !== dir) return false;
      try { readRegular(join(dir, `${id}.jsonl`), 256 * 1024 * 1024); return true; } catch { /* A missing session in one project is not a fallback session. */ }
    }
  } catch { return false; }
  return false;
}
