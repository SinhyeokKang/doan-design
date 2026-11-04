import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ensureSpawnHelper, ptySpawner } from "./pty";

const realTimeout = setTimeout;
const pause = (ms: number) => new Promise(resolve => realTimeout(resolve, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "doan-mcp-pty-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// design 'pty: node-pty': the group is stopped with OwnedGroup(pty.pid), which is right only because forkpty's setsid
// makes the pty's child its own process group leader. This pins that fact on the real node-pty.
test("the pty child leads its own process group, and stopping it ends a descendant too", async () => {
  const spawn = ptySpawner({ packaged: false });
  const child = spawn("/bin/sh", ["-c", "sleep 60 & echo CHILD:$!; wait"], { cwd: dir, env: { PATH: "/usr/bin:/bin" } });
  let output = "";
  child.onOutput(text => { output += text; });
  for (let i = 0; i < 200 && !/CHILD:\d+/.test(output); i++) await pause(25);
  const descendant = Number(/CHILD:(\d+)/.exec(output)![1]);
  const groupOf = (pid: number) => Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim());
  const leader = groupOf(descendant);
  expect(groupOf(leader)).toBe(leader);
  expect(alive(descendant)).toBe(true);
  child.stop();
  await child.gone;
  expect(await child.exit).toBeNull();
  for (let i = 0; i < 200 && alive(descendant); i++) await pause(25);
  expect(alive(descendant)).toBe(false);
}, 20_000);

test("reports the exit code once the group is gone", async () => {
  const child = ptySpawner({ packaged: false })("/bin/sh", ["-c", "echo done; exit 3"], { cwd: dir, env: { PATH: "/usr/bin:/bin" } });
  let output = "";
  child.onOutput(text => { output += text; });
  expect(await child.exit).toBe(3);
  await child.gone;
  expect(output).toContain("done");
}, 20_000);

test("a dev tree's non-executable spawn-helper is made executable; a packaged app's is refused, never changed", () => {
  const helper = join(dir, "spawn-helper");
  writeFileSync(helper, "#!/bin/sh\n"); chmodSync(helper, 0o644);
  expect(() => ensureSpawnHelper(helper, true)).toThrow("spawn_helper_not_executable");
  expect(statSync(helper).mode & 0o777).toBe(0o644);
  ensureSpawnHelper(helper, false);
  expect(statSync(helper).mode & 0o777).toBe(0o755);
  ensureSpawnHelper(helper, true);
});
