import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { watchCanvasDirs } from "../../lib/canvas-watch.ts";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-W13-checks-")));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/landing.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");

before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// `act` runs while the canvas folders are watched, as the agent does in a real run.
async function run(kind: "seed" | "pass" | "fail", act: (repo: string) => void = () => {}, watched = true) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, ".doan/assets/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  const log = `${repo}.canvas-names.jsonl`;
  const watch = watched ? await watchCanvasDirs(repo, log) : null;
  try {
    if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
    act(repo);
  } finally {
    // An open watch keeps the test process alive after a failed step.
    await watch?.stop();
  }
  const ctx = createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD", ...(watched ? { canvasLog: log } : {}) });
  return checks(ctx).filter(c => !c.pass).map(c => c.id).sort();
}

test("W13 seed has no animation, and pass animates the canvas without other canvas folder files", async () => {
  assert.deepEqual(await run("seed"), ["canvas_animated"]);
  assert.deepEqual(await run("pass"), []);
});

test("W13 fail fixture leaves a render copy that shares the canvas id", async () => {
  assert.deepEqual(await run("fail"), ["canvas_folders_only_target", "doan_check_clean"]);
});

// The copy is gone before doan check runs, so only the watch sees it.
test("W13 rejects a copy written into a canvas folder and removed again", async () => {
  const copy = (dir: string, name: string) => (repo: string) => {
    mkdirSync(join(repo, dir), { recursive: true });
    writeFileSync(join(repo, dir, name), pass);
    rmSync(join(repo, dir, name));
  };
  assert.deepEqual(await run("pass", copy(".doan/canvases", "zz-motion-test.html")), ["canvas_folders_only_target"]);
  assert.deepEqual(await run("pass", copy(".doan/ds", "landing-copy.html")), ["canvas_folders_only_target"]);
});

test("W13 counts the animation only in the canvas or a stylesheet, not in a page left in the assets", async () => {
  const seed = readFileSync(join(import.meta.dirname, "seed", canvasPath), "utf8");
  assert.deepEqual(await run("pass", repo => {
    writeFileSync(join(repo, canvasPath), seed);
    writeFileSync(join(repo, ".doan/assets/motion-test.html"), pass);
  }), ["canvas_animated"]);
  assert.deepEqual(await run("pass", repo => {
    writeFileSync(join(repo, canvasPath), seed);
    writeFileSync(join(repo, ".doan/assets/landing.css"), `${readFileSync(join(repo, ".doan/assets/landing.css"), "utf8")}.hero h1 { animation: rise 600ms both; }\n@keyframes rise { from { opacity: 0; } }\n`);
  }), []);
});

// Only a listed canvas shares the id; other names in the folder reload open canvases, which the guide does not forbid
// for in-place edits (sed -i and perl -pi write such temp files beside the canvas on macOS).
test("W13 leaves names the app does not list to the judge", async () => {
  const touch = (name: string) => (repo: string) => {
    writeFileSync(join(repo, ".doan/canvases", name), pass);
    rmSync(join(repo, ".doan/canvases", name));
  };
  assert.deepEqual(await run("pass", touch(".!4242!landing.html")), []);
  assert.deepEqual(await run("pass", touch("XXNYpMI1")), []);
  assert.deepEqual(await run("pass", touch(".zz-motion-test.html")), []);
});

test("W13 accepts a copy outside .doan/ and an atomic save beside the canvas", async () => {
  assert.deepEqual(await run("pass", repo => {
    const outside = mkdtempSync(join(root, "render-"));
    writeFileSync(join(outside, "motion-test.html"), pass.replace("<head>", `<head><base href="file://${repo}/.doan/canvases/">`));
  }), []);
  assert.deepEqual(await run("pass", repo => {
    const temp = join(repo, `${canvasPath}.tmp.4242.1a2b3c`);
    writeFileSync(temp, pass);
    renameSync(temp, join(repo, canvasPath));
  }), []);
});

test("W13 fails when no canvas folder watch ran", async () => {
  assert.deepEqual(await run("pass", () => {}, false), ["canvas_folders_only_target"]);
});
