import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import type { ToolCalls } from "../../lib/transcript.ts";
import checks from "./checks.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-W14-checks-")));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const target = ".doan/canvases/pricing.html";
const shared = ".doan/assets/cards.css";
const unrelated = ".doan/canvases/archive.html";
const argv = ["check", target, shared, "--json"];

before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

function run(kind: "seed" | "pass" | "fail", calls: ToolCalls = { commands: [], mcpTools: [], doan: [{ argv, code: 0 }] }, act: (repo: string) => void = () => {}) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, ".doan/assets/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
  act(repo);
  const ctx = createContext({ repo, agent: "fixture", transcript: "", calls, cli, env, seedCommit: "HEAD" });
  return { ctx, failed: checks(ctx).filter(c => !c.pass).map(c => c.id).sort() };
}

test("W14 pass checks both CSS consumers while leaving the unrelated error outside scope", () => {
  const { ctx, failed } = run("pass");
  assert.deepEqual(failed, []);
  assert.deepEqual(ctx.changedFiles(), [shared, target].sort());
  const scoped = ctx.doan(["check", target, shared]);
  assert.equal(scoped.code, 0);
  assert.equal(scoped.json.result.summary.canvases, 2);
  assert.equal(ctx.doan(["check"]).code, 4);
  assert.equal(ctx.read(unrelated), ctx.seed(unrelated));
});

test("W14 seed has an error in the unrelated canvas and still needs both requested edits", () => {
  const { ctx, failed } = run("seed", { commands: [], mcpTools: [], doan: [] });
  assert.equal(ctx.doan(["check", unrelated]).code, 4);
  assert.deepEqual(failed, ["card_padding_token", "edited_canvas_and_css", "pricing_button_copy", "scoped_check_invoked"]);
});

test("W14 fail fixture fixes the unrelated canvas to make a whole-repo check pass", () => {
  const { ctx, failed } = run("fail", { commands: [], mcpTools: [], doan: [{ argv: ["check", "--json"], code: 0 }] });
  assert.equal(ctx.doan(["check"]).code, 0);
  assert.deepEqual(failed, ["card_padding_token", "pricing_button_copy", "scoped_check_invoked", "unrelated_canvas_unchanged"]);
});

test("W14 requires both edited paths across accepted check invocations", () => {
  for (const args of [["check"], ["check", target], ["check", shared], ["check", target, shared, "x.md"], ["check", target, shared, "--frame", "plans"], ["work", "done", target, shared]]) {
    assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv: args, code: 0 }] }).failed, ["scoped_check_invoked"], args.join(" "));
  }
  assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv: ["check", target], code: 0 }, { argv: ["check", shared], code: 0 }] }).failed, []);
});

test("W14 counts only successful scoped check calls", () => {
  for (const code of [2, 4, -1]) {
    assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv, code }, { argv: ["check"], code: 0 }] }).failed, ["scoped_check_invoked"]);
    assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv: ["check", target], code: 0 }, { argv: ["check", shared], code }] }).failed, ["scoped_check_invoked"]);
  }
});

test("W14 accepts normalized paths and flags without treating their values as operands", () => {
  assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv: ["check", "--repo", ".", `./${target}`, "--json", shared], code: 0 }] }).failed, []);
  assert.deepEqual(run("pass", { commands: [], mcpTools: [], doan: [{ argv: ["check", target, "--repo", shared], code: 0 }] }).failed, ["scoped_check_invoked"]);
  const { ctx } = run("pass");
  const absolute = { commands: [], mcpTools: [], doan: [{ argv: ["check", join(ctx.repo, target), join(ctx.repo, shared)], code: 0 }] };
  assert.deepEqual(checks({ ...ctx, calls: absolute }).filter(c => !c.pass), []);
});

test("W14 requires recorded success rather than echoed or unconfirmed command text", () => {
  assert.deepEqual(run("pass", { commands: [`echo 'doan ${argv.join(" ")}'`], mcpTools: [] }).failed, ["scoped_check_invoked"]);
  assert.deepEqual(run("pass", { commands: [`doan ${argv.join(" ")}`], mcpTools: [] }).failed, ["scoped_check_invoked"]);
  assert.deepEqual(run("pass", { commands: [`doan ${argv.join(" ")}`], mcpTools: [], doan: [] }).failed, ["scoped_check_invoked"]);
});

test("W14 detects any unrelated canvas edit and errors reached only by the shared CSS", () => {
  assert.deepEqual(run("pass", undefined, repo => writeFileSync(join(repo, unrelated), `${readFileSync(join(repo, unrelated), "utf8")}\n`)).failed, ["unrelated_canvas_unchanged"]);
  assert.deepEqual(run("pass", undefined, repo => writeFileSync(join(repo, shared), ".card { color: var(--missing); }\n")).failed, ["card_padding_token", "scoped_check_clean"]);
  assert.deepEqual(run("pass", undefined, repo => {
    const companion = join(repo, ".doan/canvases/team.html");
    writeFileSync(companion, readFileSync(companion, "utf8").replace('content="1200"', 'content="wide"'));
  }).failed, ["scoped_check_clean"]);
});

test("W14 requires each requested file to change", () => {
  for (const path of [target, shared]) {
    assert.deepEqual(run("pass", undefined, repo => writeFileSync(join(repo, path), readFileSync(join(import.meta.dirname, "seed", path)))).failed, [path === target ? "pricing_button_copy" : "card_padding_token", "edited_canvas_and_css"].sort());
  }
});

test("W14 rejects whitespace-only edits and requested content placed only in comments", () => {
  assert.deepEqual(run("pass", undefined, repo => {
    for (const path of [target, shared]) writeFileSync(join(repo, path), `${readFileSync(join(import.meta.dirname, "seed", path), "utf8")}\n`);
  }).failed, ["card_padding_token", "pricing_button_copy"]);
  assert.deepEqual(run("pass", undefined, repo => {
    writeFileSync(join(repo, target), `${readFileSync(join(import.meta.dirname, "seed", target), "utf8")}<!-- <a data-doan-id="plan-cta">Start free trial</a> -->\n`);
    writeFileSync(join(repo, shared), `${readFileSync(join(import.meta.dirname, "seed", shared), "utf8")}/* .card { padding: var(--space-6); } */\n`);
  }).failed, ["card_padding_token", "pricing_button_copy"]);
});

test("W14 content checks tolerate markup, attributes and whitespace formatting", () => {
  assert.deepEqual(run("pass", undefined, repo => {
    const html = readFileSync(join(repo, target), "utf8").replace('data-doan-id="plan-cta">Start free trial', "data-doan-id = 'plan-cta'>\n <span>Start</span> free\n trial ");
    writeFileSync(join(repo, target), html);
    const css = readFileSync(join(repo, shared), "utf8").replace(".card { padding: var(--space-6);", ".card\n{\n padding : var( --space-6 ) ;");
    writeFileSync(join(repo, shared), css);
  }).failed, []);
});

test("W14 does not count the requested copy on another element or padding on another selector", () => {
  assert.deepEqual(run("pass", undefined, repo => {
    writeFileSync(join(repo, target), readFileSync(join(repo, target), "utf8").replace('data-doan-id="plan-cta">Start free trial', 'data-doan-id="plan-cta">Buy now').replace("</main>", '<p data-doan-id="other-copy">Start free trial</p></main>'));
    writeFileSync(join(repo, shared), readFileSync(join(import.meta.dirname, "seed", shared), "utf8") + ".other { padding: var(--space-6); }\n");
  }).failed, ["card_padding_token", "pricing_button_copy"]);
});

test("W14 resolves absolute paths through a repository root alias before comparing", () => {
  const { ctx } = run("pass");
  const alias = `${ctx.repo}-alias`;
  symlinkSync(ctx.repo, alias, "dir");
  const aliasedArgs = ["check", join(alias, target), join(alias, shared), "--repo", alias, "--json"];
  const result = ctx.run(cli, aliasedArgs);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(checks({ ...ctx, calls: { commands: [], mcpTools: [], doan: [{ argv: aliasedArgs, code: result.code }] } }).filter(c => !c.pass), []);
});
