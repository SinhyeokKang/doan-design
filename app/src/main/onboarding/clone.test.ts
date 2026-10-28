import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { cloneArgs, cloneEnv, cloneFailure, locateGit, runClone, type CloneProcess } from "./clone";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) { try { execFileSync("chmod", ["-R", "u+rwx", dir]); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); }
});
function temp(): string { const dir = mkdtempSync(join(tmpdir(), "doan-clone-test-")); dirs.push(dir); return dir; }
const root = process.getuid?.() === 0;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, stdio: "ignore" });
function sourceRepo(): string {
  const dir = temp();
  git(dir, "init", "-q");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}
const env = cloneEnv(process.env, process.env.PATH ?? "/usr/bin:/bin");
const signal = () => new AbortController();
// A clone process the test controls; `gone` follows exit unless the test holds it.
function fake(onStart: (target: string) => void, code: Promise<number | null>, stderr = "") {
  let target = "";
  const spawn = (_command: string, args: string[]): CloneProcess => {
    target = args.at(-1)!; onStart(target);
    return { exit: code, gone: code.then(() => undefined), stop: () => {}, stderr: () => stderr };
  };
  return { spawn, target: () => target };
}

describe("runClone", () => {
  it("clones through a temporary sibling and leaves only the destination", async () => {
    const source = sourceRepo(), parent = temp(), destination = join(parent, "studio");
    expect(await runClone({ git: "git", url: source, destination, env, signal: signal().signal })).toEqual({ kind: "cloned", destination });
    expect(readFileSync(join(destination, "README.md"), "utf8")).toBe("hello\n");
    expect(readdirSync(parent)).toEqual(["studio"]);
  });

  it("never replaces a destination made while it cloned, and keeps what is there", async () => {
    const parent = temp(), destination = join(parent, "studio");
    const run = fake(target => { mkdirSync(join(target, "x"), { recursive: true }); mkdirSync(destination); writeFileSync(join(destination, "mine.txt"), "keep"); }, Promise.resolve(0));
    expect(await runClone({ git: "git", url: "u", destination, env, signal: signal().signal, spawn: run.spawn })).toEqual({ kind: "failed", code: "destination_exists" });
    expect(readFileSync(join(destination, "mine.txt"), "utf8")).toBe("keep");
    expect(readdirSync(parent)).toEqual(["studio"]);
  });

  it("refuses an empty destination made meanwhile too, instead of renaming over it", async () => {
    const parent = temp(), destination = join(parent, "studio");
    const run = fake(() => mkdirSync(destination), Promise.resolve(0));
    expect(await runClone({ git: "git", url: "u", destination, env, signal: signal().signal, spawn: run.spawn })).toEqual({ kind: "failed", code: "destination_exists" });
    expect(readdirSync(destination)).toEqual([]);
    expect(readdirSync(parent)).toEqual(["studio"]);
  });

  it("classifies a local auth failure without keeping its output, and removes the partial clone", async () => {
    const parent = temp(), destination = join(parent, "studio");
    const run = fake(target => writeFileSync(join(target, "partial"), "x"), Promise.resolve(128), "remote: Repository not found.\nfatal: Authentication failed for 'https://token@github.com/acme/studio.git/'");
    const result = await runClone({ git: "git", url: "u", destination, env, signal: signal().signal, spawn: run.spawn });
    expect(result).toEqual({ kind: "failed", code: "repository_unreachable" });
    expect(JSON.stringify(result)).not.toMatch(/token|github/);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("reports a real non-interactive failure for a missing repository without waiting for input", async () => {
    const parent = temp(), destination = join(parent, "studio");
    const started = Date.now();
    const result = await runClone({ git: "git", url: join(parent, "missing.git"), destination, env, signal: signal().signal });
    expect(result).toMatchObject({ kind: "failed" });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("stops the whole process group on cancel and cleans up only after it is gone", async () => {
    const parent = temp(), destination = join(parent, "studio"), bin = temp(), pidFile = join(bin, "pid");
    const script = join(bin, "git");
    // Leaves a background helper in its group, as a credential helper or ssh can.
    writeFileSync(script, `#!/bin/sh\nfor last; do :; done\necho partial > "$last/partial"\nsleep 30 &\necho $! > "${pidFile}"\nwait\n`, { mode: 0o755 });
    const controller = signal();
    const running = runClone({ git: script, url: "u", destination, env, signal: controller.signal });
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise(resolve => setTimeout(resolve, 20));
    const helper = Number(readFileSync(pidFile, "utf8"));
    controller.abort();
    expect(await running).toEqual({ kind: "cancelled" });
    expect(() => process.kill(helper, 0)).toThrow();
    expect(readdirSync(parent)).toEqual([]);
  });

  it("keeps the temporary directory until every process of the group is gone", async () => {
    const parent = temp(), destination = join(parent, "studio");
    let release!: () => void;
    const gone = new Promise<void>(resolve => { release = resolve; });
    const spawn = (_c: string, args: string[]): CloneProcess => {
      writeFileSync(join(args.at(-1)!, "partial"), "x");
      return { exit: Promise.resolve(128), gone, stop: () => {}, stderr: () => "" };
    };
    const running = runClone({ git: "git", url: "u", destination, env, signal: signal().signal, spawn });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readdirSync(parent)).toHaveLength(1);
    release();
    expect(await running).toEqual({ kind: "failed", code: "clone_failed" });
    expect(readdirSync(parent)).toEqual([]);
  });

  it("discards a clone that finished after its cancel was accepted", async () => {
    const parent = temp(), destination = join(parent, "studio"), controller = signal();
    let finish!: (code: number) => void;
    const run = fake(target => writeFileSync(join(target, "README.md"), "x"), new Promise<number | null>(resolve => { finish = resolve; }));
    const running = runClone({ git: "git", url: "u", destination, env, signal: controller.signal, spawn: run.spawn });
    await new Promise(resolve => setTimeout(resolve, 20));
    controller.abort(); finish(0);
    expect(await running).toEqual({ kind: "cancelled" });
    expect(readdirSync(parent)).toEqual([]);
  });

  test.skipIf(root)("says so when the partial clone cannot be removed", async () => {
    const parent = temp(), destination = join(parent, "studio");
    const run = fake(target => { mkdirSync(join(target, "locked")); writeFileSync(join(target, "locked", "f"), "x"); chmodSync(join(target, "locked"), 0o500); }, Promise.resolve(1));
    expect(await runClone({ git: "git", url: "u", destination, env, signal: signal().signal, spawn: run.spawn })).toEqual({ kind: "failed", code: "cleanup_failed" });
    expect(existsSync(destination)).toBe(false);
  });
});

describe("clone invocation", () => {
  it("turns hooks off and keeps the URL after --", () => {
    const args = cloneArgs("-oProxyCommand=x", "/tmp/t");
    expect(args).toContain("core.hooksPath=/dev/null");
    expect(args.slice(args.indexOf("--"))).toEqual(["--", "-oProxyCommand=x", "/tmp/t"]);
  });

  it("never waits for a prompt and keeps SSH host key checks", () => {
    const built = cloneEnv({ HOME: "/Users/ada", GIT_ASKPASS: "/x", SSH_ASKPASS: "/y", GIT_DIR: "/z", PATH: "/old" }, "/opt/homebrew/bin:/usr/bin");
    expect(built).toMatchObject({ HOME: "/Users/ada", PATH: "/opt/homebrew/bin:/usr/bin", GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" });
    expect(built).not.toHaveProperty("GIT_ASKPASS");
    expect(built).not.toHaveProperty("SSH_ASKPASS");
    expect(built).not.toHaveProperty("GIT_DIR");
    expect(built.GIT_SSH_COMMAND).not.toMatch(/StrictHostKeyChecking/);
  });

  it("classifies access failures apart from other clone failures", () => {
    for (const text of ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", "git@github.com: Permission denied (publickey).", "Host key verification failed.", "fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com"]) expect(cloneFailure(text), text).toBe("repository_unreachable");
    expect(cloneFailure("fatal: write error: No space left on device")).toBe("clone_failed");
  });
});

describe("locateGit", () => {
  const where = (files: string[], real: Record<string, string> = {}, developer: string | null = null) => ({
    path: "/opt/homebrew/bin:/usr/bin", executable: (p: string) => files.includes(p), realpath: (p: string) => real[p] ?? p, developerDir: () => developer,
  });
  it("uses the login shell's git", () => {
    expect(locateGit(where(["/opt/homebrew/bin/git", "/usr/bin/git"]))).toBe("/opt/homebrew/bin/git");
    expect(locateGit({ ...where([]), path: null })).toBeNull();
    expect(locateGit(where([]))).toBeNull();
  });
  it("treats the macOS shim as missing git unless a developer directory has git, so no installer window opens", () => {
    expect(locateGit(where(["/usr/bin/git"]))).toBeNull();
    expect(locateGit(where(["/usr/bin/git", "/Library/Developer/CommandLineTools/usr/bin/git"]))).toBe("/usr/bin/git");
    expect(locateGit(where(["/usr/bin/git", "/Applications/Xcode.app/Contents/Developer/usr/bin/git"], {}, "/Applications/Xcode.app/Contents/Developer"))).toBe("/usr/bin/git");
  });
});
