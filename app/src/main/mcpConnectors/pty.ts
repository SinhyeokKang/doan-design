import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { AuthProcess, Spawn } from "../agentAuth/manager";
import { OwnedGroup } from "../conversation/process";

type PtyModule = typeof import("node-pty");
const OUTPUT_GRACE_MS = 2000;

// node-pty's spawn-helper must be executable. npm's darwin prebuild ships it 0644, so a dev tree (npm run dev, Vitest)
// fails with "posix_spawnp failed"; electron-builder's rebuild for the packaged app makes it 0755 (mcp-connectors
// design 'pty: node-pty'). Only a dev tree is fixed here: a packaged app never changes files inside its signed bundle,
// and a Connect fails with this reason instead.
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
// Loaded on first use, not at app start: node-pty is the one externalized dependency (native code), and only a
// Claude MCP sign-in needs it. In the packaged app the require goes through app.asar and Electron serves the
// unpacked native files.
function ptyModule(packaged: boolean): PtyModule {
  if (!loaded) {
    ensureSpawnHelper(spawnHelper(), packaged);
    loaded = createRequire(import.meta.url)("node-pty") as PtyModule;
  }
  return loaded;
}

// `claude mcp login` refuses to run without a terminal. The pty's child is its own process group leader (forkpty
// calls setsid; pty.test.ts pins it), so the attempt's whole group is stopped with OwnedGroup(pid), as every process
// Doan starts is (ARCHITECTURE §7 'Quit and process cleanup'); node-pty's kill() signals that one pid only.
// Output mixes terminal control sequences and serves diagnostics only; links arrive through the BROWSER hook.
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
