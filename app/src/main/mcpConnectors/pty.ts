import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { AuthProcess, Spawn } from "../agentAuth/manager";
import { OwnedGroup } from "../conversation/process";

type PtyModule = typeof import("node-pty");
const OUTPUT_GRACE_MS = 2000;

// npm's darwin prebuild ships node-pty's spawn-helper 0644, so a dev tree fails with "posix_spawnp failed". Only a dev
// tree is fixed here: a packaged app never changes files inside its signed bundle, and a Connect fails instead.
export function ensureSpawnHelper(path: string, packaged: boolean): void {
  try { accessSync(path, constants.X_OK); return; } catch { /* Not executable. */ }
  if (packaged) throw new Error("spawn_helper_not_executable");
  chmodSync(path, 0o755);
}

// The helper node-pty uses: the first of its own native directories holding pty.node (lib/utils.js loadNativeModule),
// under app.asar.unpacked when packaged (lib/unixTerminal.js).
function spawnHelper(): string {
  const root = dirname(createRequire(import.meta.url).resolve("node-pty/package.json"));
  const dir = ["build/Release", "build/Debug", `prebuilds/${process.platform}-${process.arch}`].map(rel => join(root, rel)).find(path => existsSync(join(path, "pty.node")));
  if (!dir) throw new Error("pty_unavailable");
  return join(dir, "spawn-helper").replace("app.asar", "app.asar.unpacked");
}

let loaded: PtyModule | null = null;
// Loaded on first use: node-pty is the one externalized native dependency, and only a Claude MCP sign-in needs it.
function ptyModule(packaged: boolean): PtyModule {
  if (!loaded) {
    ensureSpawnHelper(spawnHelper(), packaged);
    loaded = createRequire(import.meta.url)("node-pty") as PtyModule;
  }
  return loaded;
}

// `claude mcp login` refuses to run without a terminal. forkpty's setsid makes the child its own group leader (pty.test.ts),
// so the group is stopped with OwnedGroup(pid) (ARCHITECTURE §7 'Quit and process cleanup'); kill() signals one pid only.
export function ptySpawner(options: { packaged: boolean }): Spawn {
  return (command, args, { cwd, env }): AuthProcess => {
    const terminal = ptyModule(options.packaged).spawn(command, args, { name: "xterm-256color", cols: 120, rows: 30, cwd, env });
    let release!: () => void;
    const gone = new Promise<void>(resolve => { release = resolve; });
    const group = new OwnedGroup(terminal.pid, undefined, undefined, release);
    const listeners: ((text: string) => void)[] = [];
    terminal.onData(text => { for (const listener of listeners) listener(text); });
    const exit = new Promise<number | null>(resolve => {
      terminal.onExit(({ exitCode, signal }) => {
        resolve(signal ? null : exitCode);
        group.childExited();
        // A helper the CLI left in its group belongs to this attempt; it must not outlive it.
        setTimeout(() => void group.stop(), OUTPUT_GRACE_MS).unref();
      });
    });
    return {
      onOutput: listener => { listeners.push(listener); }, exit, gone,
      stop: () => { void group.stop(); },
      write: text => { try { terminal.write(text); } catch { /* The terminal already closed. */ } },
    };
  };
}
