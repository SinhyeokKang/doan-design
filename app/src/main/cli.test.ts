import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, inject, test } from "vitest";
import { cliCommand, readFolder, runLs, runInit } from "./cli";
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
  mkdirSync(join(root, ".doan"));
  writeFileSync(join(root, ".doan", "config.json"), '{"v":1}');
  mkdirSync(join(root, "design"));
  for (const [name, html] of Object.entries(canvases)) writeFileSync(join(root, "design", name), html);
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
    expect(view).toMatchObject({ kind: "list", root, scope: ["design"] });
    expect(view.kind === "list" && view.canvases).toEqual([expect.objectContaining({ path: "design/a.html", title: "A" })]);
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
    const sub = join(root, "design", "deep");
    mkdirSync(sub);
    const state = folderState(await runLs(cli, { cwd: sub }));
    expect(state).toMatchObject({ kind: "list", root });
  });

  test("passes --json and --repo, and the CLI cannot read stdin", async () => {
    const out = join(dir(), "args");
    // `cat` would block until the timeout if stdin were an open pipe.
    const fake = fakeCli(`cat >/dev/null; printf '%s\\n' "$@" > '${out}'; echo '{"v":1,"ok":true,"result":{"root":"/r","scope":[],"canvases":[]}}'`);
    const run = await runLs(fake, { repo: "/some/repo" }, 2_000);
    expect(run.timedOut).toBe(false);
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
