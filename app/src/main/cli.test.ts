import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, inject, test, vi } from "vitest";
import { spawn } from "node:child_process";

vi.mock("node:child_process", async importOriginal => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
import { cliCommand, readFolder, runConfig, runDesignSkill, runLs, runInit } from "./cli";
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

  test("reports a folder without config as uninitialized", async () => {
    expect(await readFolder(cli, dir())).toEqual({ kind: "uninitialized" });
  });

  test("passes a config error message through", async () => {
    const root = repo();
    writeFileSync(join(root, ".doan", "config.json"), "[]");
    const view = await readFolder(cli, root);
    expect(view.kind).toBe("error");
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
    const controller = new AbortController();
    // This is an argument/stdin contract check, not a two-second performance bound.
    const pending = runLs(fake, { repo: "/some/repo" }, undefined, controller.signal);
    try {
      expect(spawn).toHaveBeenLastCalledWith(fake, ["ls", "--json", "--repo", "/some/repo"], { cwd: undefined, stdio: ["ignore", "pipe", "pipe"] });
      const run = await pending;
      expect(run.timedOut).toBe(false);
      expect(run.exitCode).toBe(0);
      expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["ls", "--json", "--repo", "/some/repo"]);
      expect(folderState(run).kind).toBe("list");
    } finally {
      controller.abort();
      await pending;
    }
  });

  test("a missing CLI is a CLI error with a reason", async () => {
    const state = folderState(await runLs(join(tmp, "nope", "doan"), { repo: repo() }));
    expect(state.kind).toBe("cliError");
    expect(state.kind === "cliError" && state.reason).toMatch(/ENOENT/);
  });

  // A cancelled scan ends its remaining runs (design '판정' step 3②).
  test("an aborted run is killed at once and is not a timeout", async () => {
    const marker = join(dir(), "after");
    const fake = fakeCli(`sleep 30; touch '${marker}'`);
    const controller = new AbortController();
    const started = Date.now();
    const pending = runLs(fake, { repo: repo() }, 20_000, controller.signal);
    setTimeout(() => controller.abort(), 100);
    const run = await pending;
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(run.timedOut).toBe(false);
    expect(folderState(run).kind).toBe("cliError");
  });

  test("a signal aborted before the run never starts the CLI", async () => {
    const marker = join(dir(), "ran");
    const fake = fakeCli(`touch '${marker}'`);
    const controller = new AbortController();
    controller.abort();
    const run = await runLs(fake, { repo: repo() }, 2_000, controller.signal);
    expect(folderState(run).kind).toBe("cliError");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(existsSync(marker)).toBe(false);
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

describe("readFolder before running the CLI", () => {
  test.each([
    ["a missing path", () => join(tmp, "gone")],
    ["a file", () => {
      const file = join(dir(), "file");
      writeFileSync(file, "");
      return file;
    }],
  ])("%s is folder not found and the CLI never runs", async (_label, path) => {
    const marker = join(dir(), "ran");
    const fake = fakeCli(`touch '${marker}'`);
    expect(await readFolder(fake, path())).toEqual({ kind: "notFound" });
    expect(existsSync(marker)).toBe(false);
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
  expect(initOutcome(await runInit(fakeCli("sleep 30"), dir(), null, 50))).toMatchObject({ kind: "cliError", reason: "timed out after 10 s" });
  expect(initOutcome(await runInit(join(tmp, "missing"), dir(), null))).toMatchObject({ kind: "cliError", reason: expect.stringContaining("ENOENT") });
});

test("runConfig reads and writes through the real CLI with absolute paths", async () => {
  const root = repo();
  writeFileSync(join(root, "tokens.css"), ":root{}");
  mkdirSync(join(root, "styles"));
  expect(configReply(root, await runConfig(cli, root, []))).toEqual({ kind: "config", root, tokenCss: null, serve: [], changed: false });
  expect(configReply(root, await runConfig(cli, root, ["--token-css", join(root, "tokens.css"), "--add-serve", join(root, "styles")])))
    .toEqual({ kind: "config", root, tokenCss: "tokens.css", serve: ["styles"], changed: true });
  expect(configReply(root, await runConfig(cli, root, ["--remove-serve", join(root, "styles"), "--clear-token-css"])))
    .toEqual({ kind: "config", root, tokenCss: null, serve: [], changed: true });
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
    expect(spawn).toHaveBeenLastCalledWith(fake, ["design-skill", "--json"], { cwd: undefined, stdio: ["ignore", "pipe", "pipe"] });
    expect(readFileSync(out, "utf8").trim().split("\n")).toEqual(["design-skill", "--json"]);
    expect(interpretList(run)).toEqual({ v: 1, ok: true, result: { version: "dev", presets: [] } });
  });

  test.each(["clarify", "--repo", "-h", "a b", ""])("passes the id %j only as the positional after --", async id => {
    const out = join(dir(), "args");
    const fake = fakeCli(`printf '[%s]\\n' "$@" > '${out}'; echo '{"v":1,"ok":false,"error":{"code":"usage_error","message":"m","nextSteps":[]}}'; exit 2`);
    const run = await runDesignSkill(fake, id);
    expect(spawn).toHaveBeenLastCalledWith(fake, ["design-skill", "--json", "--", id], { cwd: undefined, stdio: ["ignore", "pipe", "pipe"] });
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
