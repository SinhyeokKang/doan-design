import { afterEach, expect, test, vi } from "vitest";
const race = vi.hoisted(() => ({ target: "", staged: false, fired: false, observations: 0, afterStage: null as (() => void) | null }));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    symlinkSync: (...args: Parameters<typeof fs.symlinkSync>) => {
      fs.symlinkSync(...args);
      if (String(args[1]).includes(".doan-")) { race.staged = true; const hook = race.afterStage; race.afterStage = null; hook?.(); }
    },
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      fs.writeFileSync(...args);
      if (String(args[0]).includes(".doan-")) { race.staged = true; const hook = race.afterStage; race.afterStage = null; hook?.(); }
    },
    lstatSync: (...args: Parameters<typeof fs.lstatSync>) => {
      try { return fs.lstatSync(...args); }
      catch (error) {
        // Insert a competing file after the final missing observation was taken.
        if (race.staged && !race.fired && args[0] === race.target && ++race.observations === 3) {
          race.fired = true; fs.writeFileSync(race.target, "keep", { flag: "wx" });
        }
        throw error;
      }
    },
  };
});
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createMachine } from "./machine";
let temp: string;
afterEach(() => { rmSync(temp, { recursive: true, force: true }); race.target = ""; race.staged = false; race.fired = false; race.observations = 0; race.afterStage = null; });
test.each(["cli", "stub"])("missing %s never replaces a file appearing during the last check", async target => {
  temp = realpathSync(mkdtempSync("/tmp/doan-race-"));
  const home = join(temp, "home"); mkdirSync(home); mkdirSync(join(home, "bin"));
  const cli = join(temp, "doan"), shell = join(temp, "zsh");
  writeFileSync(cli, "cli");
  writeFileSync(shell, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', { mode: 0o755 });
  writeFileSync(join(home, "bin/claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const m = createMachine({ command: cli, env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, version: "0.1.0" });
  if (target === "stub") await m.run({ step: "cli", expected: (await m.read("1")).expected });
  race.staged = false;
  race.target = join(home, target === "cli" ? ".local/bin/doan" : ".agents/skills/doan/SKILL.md");
  const result = await m.run({ step: target === "cli" ? "cli" : "connect", ...(target === "stub" ? { agent: "claude" } : {}), expected: (await m.read("2")).expected });
  expect(race.fired).toBe(true);
  expect(readFileSync(race.target, "utf8")).toBe("keep");
  expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("Check Again") });
});

test("a CLI link that changes while the stub is written is a changed result, not step 1 not done", async () => {
  temp = realpathSync(mkdtempSync("/tmp/doan-race-"));
  const home = join(temp, "home"); mkdirSync(home); mkdirSync(join(home, "bin"));
  const cli = join(temp, "doan"), shell = join(temp, "zsh");
  writeFileSync(cli, "cli");
  writeFileSync(shell, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', { mode: 0o755 });
  writeFileSync(join(home, "bin/claude"), '#!/bin/sh\necho "$*" >> "$HOME/calls"\n', { mode: 0o755 });
  const m = createMachine({ command: cli, env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, version: "0.1.0" });
  await m.run({ step: "cli", expected: (await m.read("1")).expected });
  race.afterStage = () => rmSync(join(home, ".local/bin/doan"));
  expect(await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected })).toEqual({ kind: "stale" });
  expect(existsSync(join(home, "calls"))).toBe(false);
});


test("an ancestor swapped after staging is stale and leaves both destinations untouched", async () => {
  temp = realpathSync(mkdtempSync("/tmp/doan-race-"));
  const home = join(temp, "home"), first = join(temp, "first"), second = join(temp, "second");
  mkdirSync(join(home, ".local"), { recursive: true }); mkdirSync(first); mkdirSync(second);
  const parent = join(home, ".local/bin"); symlinkSync(first, parent);
  const cli = join(temp, "doan"), shell = join(temp, "zsh");
  writeFileSync(cli, "cli"); writeFileSync(shell, '#!/bin/sh\neval "$2"\n', { mode: 0o755 });
  const m = createMachine({ command: cli, env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, version: "0.1.0" });
  const state = await m.read("1");
  race.afterStage = () => { race.fired = true; rmSync(parent); symlinkSync(second, parent); };
  expect(await m.run({ step: "cli", expected: state.expected })).toEqual({ kind: "stale" });
  expect(race.fired).toBe(true);
  expect(readdirSync(first)).toEqual([]); expect(readdirSync(second)).toEqual([]);
});
