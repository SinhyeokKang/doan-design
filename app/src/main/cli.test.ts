import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, inject, onTestFinished, test, vi } from "vitest";
import { spawn } from "node:child_process";

vi.mock("node:child_process", async importOriginal => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
import { cliCommand, cliEnv, EXPORT_TIMEOUT_MS, readFolder, runConfig, runDesignSkill, runExport, runLs, runInit } from "./cli";
// The Set Up dialog's line, so the real CLI's refusal is checked as the person reads it.
import { initMessage } from "../renderer/onboardingView";
import { designSkillGetRequest, interpretGet, interpretList } from "./designSkills";
import { configReply } from "./configBridge";
import { folderState, initOutcome } from "./folderState";

const cli = inject("doanCli");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-cli-test-")));
let count = 0;

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function dir(): string {
  const path = join(tmp, `d${count++}`);
  mkdirSync(path);
  return path;
}

function repo(canvases: Record<string, string> = { "a.html": "<!doctype html><title>A</title>" }): string {
  const root = dir();
  mkdirSync(join(root, ".doan"), { recursive: true });
  writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
  mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  for (const [name, html] of Object.entries(canvases)) writeFileSync(join(root, ".doan/canvases", name), html);
  return root;
}

function fakeCli(body: string): string {
  const path = join(dir(), "doan");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("cliCommand", () => {
  test("prefers DOAN_CLI, then `doan` on PATH", () => {
    expect(cliCommand({ DOAN_CLI: "/opt/doan" })).toBe("/opt/doan");
    expect(cliCommand({})).toBe("doan");
    expect(cliCommand({ DOAN_CLI: "" })).toBe("doan");
  });
});

describe("readFolder with the real CLI", () => {
  test("lists a repo's canvases", async () => {
    const root = repo();
    const view = await readFolder(cli, root);
    expect(view).toMatchObject({ kind: "list", root, scope: [".doan/canvases"] });
    expect(view.kind === "list" && view.canvases).toEqual([expect.objectContaining({ path: ".doan/canvases/a.html", title: "A" })]);
  });

  // The temp folder belongs to no Git repository: ls says Keep out of Git there needs a new one (storageReason not_git).
  test("reports a folder without config as uninitialized, outside Git", async () => {
    expect(await readFolder(cli, dir())).toEqual({ kind: "uninitialized", notGit: true });
  });

  test("passes a config error message through", async () => {
    const root = repo();
    writeFileSync(join(root, ".doan", "config.json"), "[]");
    const view = await readFolder(cli, root);
    // The CLI names the config it failed on, which makes this a Config error.
    expect(view).toEqual({ kind: "error", message: expect.any(String), config: join(realpathSync(root), ".doan", "config.json") });
  });

  // A failure that is not about the config file (an unreadable canvas folder) is a CLI error with the CLI's message.
  test.skipIf(process.getuid?.() === 0)("an unreadable canvas folder is a CLI error, not a Config error", async () => {
    const root = repo();
    const sub = join(root, ".doan", "canvases", "sub");
    mkdirSync(sub);
    chmodSync(sub, 0o000);
    try {
      const view = await readFolder(cli, root);
      expect(view).toMatchObject({ kind: "cliError", code: "internal_error", reason: expect.stringContaining("permission denied") });
      expect(view).not.toHaveProperty("config");
    } finally { chmodSync(sub, 0o755); }
  });

  test("collects stdout past 1 MiB", async () => {
    const title = "word ".repeat(20_000);
    const canvases = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}.html`, `<!doctype html><title>${title}</title>`]));
    const root = repo(canvases);
    const run = await runLs(cli, { repo: root });
    expect(run.stdout.length).toBeGreaterThan(1024 * 1024);
    const view = await readFolder(cli, root);
    expect(view.kind === "list" && view.canvases.length).toBe(12);
  });
});

describe("runLs", () => {
  test("from a subfolder without --repo reports the repo root", async () => {
    const root = repo();
    const sub = join(root, ".doan/canvases", "deep");
    mkdirSync(sub);
    const state = folderState(await runLs(cli, { cwd: sub }));
    expect(state).toMatchObject({ kind: "list", root });
  });

  test("passes --json and --repo, and the CLI cannot read stdin", async () => {
    const out = join(dir(), "args");
    // A shell builtin checks EOF without a PATH lookup or an extra cat process.
    const fake = fakeCli(`if IFS= read -r line; then exit 97; fi; printf '%s\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"root":"/r","scope":[],"canvases":[]}}'`);
    // This is an argument/stdin contract check, not a two-second performance bound.
    const pending = runLs(fake, { repo: "/some/repo" });
    expect(spawn).toHaveBeenLastCalledWith(fake, ["ls", "--json", "--repo", "/some/repo"], { cwd: undefined, env: expect.any(Object), stdio: ["ignore", "pipe", "pipe"] });
    const run = await pending;
    expect(run.timedOut).toBe(false);
    expect(run.exitCode).toBe(0);
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["ls", "--json", "--repo", "/some/repo"]);
    expect(folderState(run).kind).toBe("list");
  });

  test("a missing CLI is a CLI error with a reason", async () => {
    const state = folderState(await runLs(join(tmp, "nope", "doan"), { repo: repo() }));
    expect(state.kind).toBe("cliError");
    expect(state.kind === "cliError" && state.reason).toMatch(/ENOENT/);
  });

  test("a hung CLI is killed at the timeout", async () => {
    const fake = fakeCli("sleep 30");
    const started = Date.now();
    const run = await runLs(fake, { repo: repo() }, 300);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(run.timedOut).toBe(true);
    expect(folderState(run).kind).toBe("cliError");
  });
});

describe("CLI environment", () => {
  test("the CLI sees the launchd keys, not the launching terminal's session or tools", async () => {
    const out = join(dir(), "env.txt");
    const fake = fakeCli(`/usr/bin/env > '${out}'; echo '{"v":1,"ok":true,"result":{"root":"/r","scope":[],"canvases":[]}}'`);
    const terminal = { ORCA_TERMINAL_HANDLE: "term_1", CLAUDE_CODE_SESSION_ID: "s", CODEX_THREAD_ID: "t", CLAUDE_CONFIG_DIR: "/orca/claude", TERM_PROGRAM: "Orca", FOO: "bar", HTTPS_PROXY: "http://proxy:8080", SSH_AUTH_SOCK: "/tmp/agent.sock" };
    const saved = Object.fromEntries(Object.keys(terminal).map(name => [name, process.env[name]]));
    Object.assign(process.env, terminal);
    try { await runLs(fake, { repo: dir() }); } finally {
      for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    const seen = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").map(line => line.split(/=(.*)/s).slice(0, 2)));
    expect(seen).toMatchObject({ HOME: process.env.HOME, HTTPS_PROXY: "http://proxy:8080", SSH_AUTH_SOCK: "/tmp/agent.sock" });
    for (const name of ["ORCA_TERMINAL_HANDLE", "CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "CLAUDE_CONFIG_DIR", "TERM_PROGRAM", "FOO"]) expect(seen).not.toHaveProperty(name);
  });
});

// The CLI's git (git init for Keep out of Git) is found as clone finds it: the login shell's PATH and the inherited
// DEVELOPER_DIR, under their own names (ARCHITECTURE §7 'First-run onboarding' Clone).
describe("the CLI's git environment", () => {
  test("names the login shell's PATH and the inherited DEVELOPER_DIR, and only what is known", () => {
    expect(cliEnv("/login/bin:/usr/bin", { PATH: "/app/bin", DEVELOPER_DIR: "/Dev" })).toEqual({ PATH: "/login/bin:/usr/bin", DEVELOPER_DIR: "/Dev" });
    expect(cliEnv("/login/bin", { PATH: "/app/bin" })).toEqual({ PATH: "/login/bin" });
    // A login shell that could not be read names no git, as clone finds none then: the CLI answers git_missing rather
    // than run a git from the app's own PATH (PRODUCT §3 'Launch environment').
    expect(cliEnv(null, { PATH: "/app/bin", DEVELOPER_DIR: "" })).toEqual({ PATH: "" });
    expect(cliEnv(null, { PATH: "/app/bin", DEVELOPER_DIR: "/Dev" })).toEqual({ PATH: "", DEVELOPER_DIR: "/Dev" });
  });

  test("the real CLI finds no git when the login shell could not be read", async () => {
    const root = dir();
    expect(initOutcome(await runInit(cli, root, null, "local", { gitInit: true, env: cliEnv(null, {}) }))).toMatchObject({ kind: "error", code: "git_missing" });
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  test("init and config run with it, and a bare doan is still found on the app's own PATH", async () => {
    const out = join(dir(), "env");
    const fake = fakeCli(`printf '%s\\n%s\\n' "$PATH" "$DEVELOPER_DIR" > '${out}'; printf '%s\\n' "$@" >> '${out}'; echo '{"v":1,"ok":true,"result":{"initialized":true,"repo":"/r","created":[]}}'`);
    const env = { PATH: "/login/bin", DEVELOPER_DIR: "/Dev" };
    expect(initOutcome(await runInit(fake, "/r", null, "local", { gitInit: true, env }))).toEqual({ kind: "success" });
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["/login/bin", "/Dev", "init", "--json", "--repo", "/r", "--storage", "local", "--git-init"]);
    await runConfig(fake, "/r", ["--storage", "local", "--git-init"], env);
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["/login/bin", "/Dev", "config", "--json", "--repo", "/r", "--storage", "local", "--git-init"]);
    const saved = process.env.PATH;
    process.env.PATH = `${join(fake, "..")}:${saved ?? ""}`;
    try { await runInit("doan", "/r", null, "local", { gitInit: true, env }); } finally { process.env.PATH = saved; }
    expect(readFileSync(out, "utf8").trim().split("\n")[0]).toBe("/login/bin");
  });
});

describe("readFolder before running the CLI", () => {
  // The errno code tells a vanished folder (ENOENT, ENOTDIR) from one that could not be checked.
  test.each([
    ["a missing path", () => join(tmp, "gone"), "ENOENT"],
    ["a file", () => {
      const file = join(dir(), "file");
      writeFileSync(file, "");
      return file;
    }, "ENOTDIR"],
    ["a path under a file", () => {
      const file = join(dir(), "file");
      writeFileSync(file, "");
      return join(file, "repo");
    }, "ENOTDIR"],
  ])("%s is folder not found and the CLI never runs", async (_label, path, code) => {
    const marker = join(dir(), "ran");
    const fake = fakeCli(`touch '${marker}'`);
    expect(await readFolder(fake, path())).toEqual({ kind: "notFound", code });
    expect(existsSync(marker)).toBe(false);
  });

  test.skipIf(process.getuid?.() === 0)("a folder that cannot be checked keeps its errno code", async () => {
    const parent = dir();
    const root = join(parent, "repo");
    mkdirSync(root);
    chmodSync(parent, 0o000);
    try {
      expect(await readFolder(fakeCli("exit 1"), root)).toEqual({ kind: "notFound", code: "EACCES" });
    } finally {
      chmodSync(parent, 0o755);
    }
  });
});

test("packaged cliCommand never falls back to PATH and DOAN_CLI wins", () => {
  expect(cliCommand({}, true, "/Applications/doan.app/Contents/Resources")).toBe("/Applications/doan.app/Contents/Resources/bin/doan");
  expect(cliCommand({ DOAN_CLI: "/tmp/doan" }, true, "/bundle")).toBe("/tmp/doan");
  expect(cliCommand({}, false, "/bundle")).toBe("doan");
});

 test("runInit uses JSON, ignored stdin and exact argument boundaries", async () => {
  const out = join(dir(), "args");
  const fake = fakeCli(`cat >/dev/null; printf '%s\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"initialized":true,"repo":"/ignored","created":[]}}'`);
  expect(initOutcome(await runInit(fake, "/some repo", "/some repo/a.css"))).toEqual({ kind: "success" });
  expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["init", "--json", "--repo", "/some repo", "--token-css", "/some repo/a.css"]);
});
test("runInit settles timeout and spawn errors", async () => {
  expect(initOutcome(await runInit(fakeCli("sleep 30"), dir(), null, null, { timeoutMs: 50 }))).toMatchObject({ kind: "cliError", reason: "timed out after 10 s" });
  expect(initOutcome(await runInit(join(tmp, "missing"), dir(), null))).toMatchObject({ kind: "cliError", reason: expect.stringContaining("ENOENT") });
});

// The real CLI's refusal of a local setup outside Git reads as the draft's sentence in the Set Up dialog.
test("a local setup outside Git is refused by the real CLI with the draft's words", async () => {
  const outcome = initOutcome(await runInit(cli, dir(), null, "local"));
  expect(outcome).toEqual({ kind: "error", code: "local_not_git", message: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git.", guidance: "Choose Include in Git, or run git init here first." });
  expect(initMessage(outcome)).toBe("This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run git init here first.");
});

// The real CLI creates the repository with --git-init: switching a project outside Git to Keep out of Git creates it,
// and switching back keeps both that repository and Doan's .gitattributes line, as every switch keeps the line.
// git runs under a temporary HOME so the developer's own Git configuration plays no part.
test("Include in Git, then Keep out of Git, then Include in Git keeps .gitattributes and the new .git", async () => {
  const root = dir();
  const home = process.env.HOME;
  process.env.HOME = dir();
  onTestFinished(() => { process.env.HOME = home; });
  expect(initOutcome(await runInit(cli, root, null))).toEqual({ kind: "success" });
  const attributes = readFileSync(join(root, ".gitattributes"), "utf8");
  expect(configReply(root, await runConfig(cli, root, []))).toMatchObject({ storage: "repo", storageReason: "not_git" });
  const kept = configReply(root, await runConfig(cli, root, ["--storage", "local", "--git-init"]));
  expect(kept).toMatchObject({ kind: "config", storage: "local", repositoryCreated: true });
  expect(kept).not.toHaveProperty("storageReason");
  expect(existsSync(join(root, ".git", "HEAD"))).toBe(true);
  const back = configReply(root, await runConfig(cli, root, ["--storage", "repo"]));
  expect(back).toMatchObject({ kind: "config", storage: "repo" });
  expect(back).not.toHaveProperty("repositoryCreated");
  expect(back).not.toHaveProperty("storageReason");
  expect(existsSync(join(root, ".git", "HEAD"))).toBe(true);
  expect(readFileSync(join(root, ".gitattributes"), "utf8")).toBe(attributes);
});

test("runConfig reads and writes through the real CLI with absolute paths", async () => {
  const root = repo();
  writeFileSync(join(root, "tokens.css"), ":root{}");
  mkdirSync(join(root, "styles"));
  // The temp repo is no Git repository: the CLI reports repo with the reason Keep out of Git can't be chosen.
  const notGit = { storage: "repo", storageReason: "not_git" };
  expect(configReply(root, await runConfig(cli, root, []))).toEqual({ kind: "config", root, tokenCss: null, serve: [], changed: false, ...notGit });
  expect(configReply(root, await runConfig(cli, root, ["--token-css", join(root, "tokens.css"), "--add-serve", join(root, "styles")])))
    .toEqual({ kind: "config", root, tokenCss: "tokens.css", serve: ["styles"], changed: true, ...notGit });
  expect(configReply(root, await runConfig(cli, root, ["--remove-serve", join(root, "styles"), "--clear-token-css"])))
    .toEqual({ kind: "config", root, tokenCss: null, serve: [], changed: true, ...notGit });
  const outside = configReply(root, await runConfig(cli, root, ["--add-serve", tmp]));
  expect(outside).toMatchObject({ kind: "error", message: expect.stringContaining("outside the repository") });
  writeFileSync(join(root, ".doan", "config.json"), "{broken");
  expect(configReply(root, await runConfig(cli, root, ["--clear-token-css"]))).toMatchObject({ kind: "error" });
  expect(readFileSync(join(root, ".doan", "config.json"), "utf8")).toBe("{broken");
});

describe("runDesignSkill", () => {
  test("lists with --json only, and the CLI cannot read stdin", async () => {
    const out = join(dir(), "args");
    const fake = fakeCli(`if IFS= read -r line; then exit 97; fi; printf '%s\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"version":"dev","presets":[]}}'`);
    const run = await runDesignSkill(fake);
    expect(spawn).toHaveBeenLastCalledWith(fake, ["design-skill", "--json"], { cwd: undefined, env: expect.any(Object), stdio: ["ignore", "pipe", "pipe"] });
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["design-skill", "--json"]);
    expect(interpretList(run)).toEqual({ v: 1, ok: true, result: { version: "dev", presets: [] } });
  });

  test.each(["clarify", "--repo", "-h", "a b", ""])("passes the id %j only as the positional after --", async id => {
    const out = join(dir(), "args");
    const fake = fakeCli(`printf '[%s]\\n' "$@" > '${out}'; echo '{"v":1,"ok":false,"error":{"code":"usage_error","message":"m","nextSteps":[]}}'; exit 2`);
    const run = await runDesignSkill(fake, id);
    expect(spawn).toHaveBeenLastCalledWith(fake, ["design-skill", "--json", "--", id], { cwd: undefined, env: expect.any(Object), stdio: ["ignore", "pipe", "pipe"] });
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["[design-skill]", "[--json]", "[--]", `[${id}]`]);
    expect(interpretGet(run, id)).toMatchObject({ ok: false, error: { code: "usage_error" } });
  });

  test("an id spawn cannot pass (NUL) is an app failure, not a rejected call", async () => {
    const marker = join(dir(), "ran");
    const fake = fakeCli(`touch '${marker}'`);
    const id = designSkillGetRequest({ id: "clarify\u0000" });
    expect(id).toBe("clarify\u0000");
    const reply = interpretGet(await runDesignSkill(fake, id ?? ""), id ?? "");
    expect(reply).toEqual({ v: 1, ok: false, error: { code: "cli_error", reason: "unavailable", message: expect.any(String), nextSteps: [] } });
    expect(existsSync(marker)).toBe(false);
  });

  test("settles timeout and spawn errors as app failures", async () => {
    expect(interpretList(await runDesignSkill(fakeCli("sleep 30"), undefined, 50))).toMatchObject({ ok: false, error: { code: "cli_error", reason: "timeout" } });
    expect(interpretGet(await runDesignSkill(join(tmp, "missing"), "clarify"), "clarify")).toMatchObject({ ok: false, error: { code: "cli_error", reason: "unavailable" } });
  });
});

// `doan export` with its own timeout; a fake stands in because the CLI command was not yet implemented when this test was added.
describe("runExport", () => {
  test("passes the listed path, the chosen file with --force, the root and --json, and the CLI cannot read stdin", async () => {
    const out = join(dir(), "args");
    const fake = fakeCli(`if IFS= read -r line; then exit 97; fi; printf '[%s]\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"external":[]}}'`);
    const run = await runExport(fake, "/repo", ".doan/canvases/a b.html", "/Users/me/Desktop/a b.html");
    expect(spawn).toHaveBeenLastCalledWith(fake, ["export", ".doan/canvases/a b.html", "-o", "/Users/me/Desktop/a b.html", "--force", "--repo", "/repo", "--json"], { cwd: undefined, env: expect.any(Object), stdio: ["ignore", "pipe", "pipe"] });
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["[export]", "[.doan/canvases/a b.html]", "[-o]", "[/Users/me/Desktop/a b.html]", "[--force]", "[--repo]", "[/repo]", "[--json]"]);
    expect(run).toMatchObject({ exitCode: 0, timedOut: false });
  });

  // The frame ID goes in the flag's own argument: an ID such as "--" or "-o" can never read as a separator or a flag.
  test("a prototype export names its frame with --frame=<id> and --prototype", async () => {
    const out = join(dir(), "args");
    const fake = fakeCli(`printf '[%s]\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"external":[],"prototype":true}}'`);
    await runExport(fake, "/repo", ".doan/canvases/a.html", "/tmp/a.html", { frame: "--" });
    expect(spawn).toHaveBeenLastCalledWith(fake, ["export", ".doan/canvases/a.html", "--frame=--", "--prototype", "-o", "/tmp/a.html", "--force", "--repo", "/repo", "--json"], expect.any(Object));
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["[export]", "[.doan/canvases/a.html]", "[--frame=--]", "[--prototype]", "[-o]", "[/tmp/a.html]", "[--force]", "[--repo]", "[/repo]", "[--json]"]);
  });

  test("has a longer timeout than the other calls and is killed at it", async () => {
    expect(EXPORT_TIMEOUT_MS).toBeGreaterThan(10_000);
    const run = await runExport(fakeCli("sleep 30"), "/repo", ".doan/canvases/a.html", "/tmp/a.html", { timeoutMs: 100 });
    expect(run.timedOut).toBe(true);
  });

  test("a missing CLI or an argument spawn cannot pass settles as a spawn error, not a rejection", async () => {
    expect((await runExport(join(tmp, "missing"), "/repo", ".doan/canvases/a.html", "/tmp/a.html")).spawnError).toMatch(/ENOENT/);
    expect((await runExport(fakeCli("true"), "/repo", ".doan/canvases/a.html", "/tmp/a\u0000.html")).spawnError).toEqual(expect.any(String));
  });
});
