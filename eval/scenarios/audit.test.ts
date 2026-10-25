import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../lib/context.ts";
import { toolCalls } from "../lib/transcript.ts";
import { buildJudgePrompt } from "../lib/judge.ts";
import r2 from "./R2/checks.ts";
import r2b from "./R2b/checks.ts";
import r3 from "./R3/checks.ts";
import r4 from "./R4/checks.ts";
import h3 from "./H3/checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-audit-eval-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: string) {
  const repo = mkdtempSync(join(root, `${id}-`));
  cpSync(join(import.meta.dirname, id, "seed"), repo, { recursive: true });
  if (id === "W1") execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, "styles/tokens.css")]);
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(import.meta.dirname, id, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env: process.env, seedCommit: "HEAD" });
}
const shell = (command: string) => toolCalls(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } }));
for (const [id, checks] of [["R2", r2], ["R2b", r2b]] as const) {
  test(`${id} and judge recognize global flag grammar without counting flag values`, () => {
    const ctx = fixture(id);
    for (const [command, expected] of [
      ["doan --repo /tmp/r active --json", true], ["doan --repo=/tmp/r --json active", true], ['doan --repo="/tmp/my repo" active', true],
      ["/tmp/doan -repo /tmp/r -json=true active", true], ["doan --json=false active -repo=/tmp/r", true],
      ["doan -- active", true], ["doan --repo active check", false], ["doan comments --canvas active", false],
      ["echo 'doan active'", false], ["doan --unknown active", false],
    ] as const) {
      const calls = shell(command);
      assert.equal(checks({ ...ctx, calls }).find(c => c.id === "asked_doan_active")?.pass, expected, command);
      const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls });
      assert.ok(prompt.includes(`"shellInvoked":${expected}`), command);
    }
  });
  test(`${id} background shorthand and longhand share cascade order`, () => {
    const ctx = fixture(id), path = join(ctx.repo, "design/checkout.html"), good = ctx.read("design/checkout.html")!;
    const cases = [
      ['[data-doan-id="secondary"] { background-color: var(--color-primary); }', 'background: var(--color-muted)', false],
      ['[data-doan-id="secondary"] { background-color: var(--color-muted); }', 'background: var(--color-primary)', true],
      ['[data-doan-id="secondary"] { background: var(--color-muted) !important; }', 'background-color: var(--color-primary)', false],
      ['[data-doan-id="secondary"] { background: var(--color-primary) !important; }', 'background-color: var(--color-muted)', true],
      ['', 'background-color: var(--color-primary); background: var(--color-muted)', false],
      ['', 'background-color: var(--color-muted); background: var(--color-primary)', true],
      ['', 'background: var(--color-muted); background-color: var(--color-primary)', true],
      ['', 'background: var(--color-primary); background-color: var(--color-muted)', false],
    ] as const;
    for (const [css, inline, expected] of cases) {
      const html = good.replace(/(<button\b[^>]*data-doan-id="secondary"[^>]*\bstyle=")[^"]*"/, `$1${inline}"`).replace('</style>', `${css}</style>`);
      assert.notEqual(html, good);
      writeFileSync(path, html);
      assert.equal(checks(ctx).find(c => c.id === "selected_primary_background")?.pass, expected, `${css} / ${inline}`);
    }
  });
}
for (const id of ["R1", "R2", "R2b", "R3", "H1", "H2", "H4", "W1", "W2", "R4"]) {
  test(`${id} Python helper parses legitimate input without importing repo modules`, async () => {
    const ctx = fixture(id), marker = join(root, `${id}-python-marker`);
    const poison = `open(${JSON.stringify(marker)}, 'w').write('imported')\nraise RuntimeError('repo module imported')\n`;
    writeFileSync(join(ctx.repo, "json.py"), poison);
    mkdirSync(join(ctx.repo, "html"));
    writeFileSync(join(ctx.repo, "html/__init__.py"), poison);
    if (!["W1", "W2", "R4"].includes(id)) {
      const { inspect } = await import(`./${id}/inspect.ts`);
      const doc = inspect(ctx, '<button data-doan-id="test">Hello &amp; world</button>');
      assert.equal(doc.nodes[0].text, "Hello & world");
    } else {
      const { default: checks } = await import(`./${id}/checks.ts`);
      const checkId = { W1: "project_tokens_linked", W2: "comment_element_id_preserved", R4: "canvas_copy" }[id];
      assert.equal(checks(ctx).find(c => c.id === checkId)?.pass, true);
    }
    assert.equal(existsSync(marker), false);
  });
}
test("R4 follows inline and unquoted imports, stops cycles and repo escapes", () => {
  const ctx = fixture("R4"), target = "web/login.html", good = ctx.read(target)!;
  for (const start of ['<style>@import url(app.css);</style>', '<link rel="stylesheet" href="app.css">']) {
    writeFileSync(join(ctx.repo, target), good.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, "") + start);
    writeFileSync(join(ctx.repo, "web/app.css"), '@import url(tokens.css); @import "cycle.css"; .x {color:var(--color-text)}');
    writeFileSync(join(ctx.repo, "web/cycle.css"), '@import url(app.css); @import url(../../outside.css);');
    assert.equal(r4(ctx).find(c => c.id === "uses_shared_tokens")?.pass, true);
    writeFileSync(join(ctx.repo, "web/app.css"), '/* @import url(tokens.css); */ @import url(cycle.css); .x {color:var(--color-text)}');
    assert.equal(r4(ctx).find(c => c.id === "uses_shared_tokens")?.pass, false);
  }
});
test("H3 follows multiline imports and reexports but not quoted examples or comments", () => {
  const ctx = fixture("H3"), target = "web/src/components/DispatchQueue.tsx", good = ctx.read(target)!;
  const rows = good.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
  const component = good.replace(/<tbody>[\s\S]*?<\/tbody>/, '<tbody><Rows /></tbody>');
  writeFileSync(join(ctx.repo, "web/src/components/Rows.tsx"), `export function Rows() { return <>${rows}</>; }`);
  writeFileSync(join(ctx.repo, "web/src/components/barrel.ts"), 'export {\n Rows\n} from\n "./Rows";');
  for (const prefix of ['import {\n Rows\n} from\n "./Rows";', 'import {\n Rows\n} from "./barrel";']) {
    writeFileSync(join(ctx.repo, target), prefix + '\n' + component);
    assert.equal(h3(ctx).find(c => c.id === "canvas_copy_in_component")?.pass, true);
  }
  for (const prefix of ['', '// import { Rows } from "./Rows";', '/* import { Rows } from "./Rows"; */', 'const example = `import { Rows } from "./Rows";`;']) {
    writeFileSync(join(ctx.repo, target), prefix + '\n' + component);
    assert.equal(h3(ctx).find(c => c.id === "canvas_copy_in_component")?.pass, false);
  }
});
test("R3 rejects executed apply_patch delete and restore while excluding prose and results", () => {
  const ctx = fixture("R3"), patch = '*** Begin Patch\n*** Delete File: design/team.html\n*** End Patch';
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  const direct = event({ type: "custom_tool_call", name: "apply_patch", input: patch });
  const batch = event({ type: "custom_tool_call", name: "functions.exec", input: `await tools.apply_patch(${JSON.stringify(patch)});` });
  const restore = event({ type: "custom_tool_call", name: "apply_patch", input: '*** Begin Patch\n*** Add File: design/team.html\n+restored\n*** End Patch' });
  const template = event({ type: "custom_tool_call", name: "exec", input: "await tools.apply_patch(`" + patch + "`);" });
  const fn = event({ type: "function_call", name: "functions.apply_patch", arguments: JSON.stringify({ patch }) });
  for (const transcript of [direct, batch, template, fn]) {
    const result = r3({ ...ctx, calls: toolCalls(transcript + '\n' + restore) });
    assert.equal(result.find(c => c.id === "no_team_delete_or_restore")?.pass, false);
    assert.equal(result.find(c => c.id === "other_canvas_preserved")?.pass, true);
  }
  for (const transcript of [patch, event({ type: "custom_tool_call", name: "exec", input: `/* tools.apply_patch(${JSON.stringify(patch)}); */` }), event({ type: "custom_tool_call", name: "exec", input: "await tools.apply_patch(computedPatch);" }), event({ type: "custom_tool_call_output", output: patch }), event({ type: "custom_tool_call", name: "exec", input: `const example = ${JSON.stringify(`tools.apply_patch(${JSON.stringify(patch)})`)};` })]) {
    assert.equal(r3({ ...ctx, calls: toolCalls(transcript) }).find(c => c.id === "no_team_delete_or_restore")?.pass, true);
  }
});
test("R5 rubric matches the existing seed and answer fixture", () => {
  const rubric = readFileSync(join(import.meta.dirname, "R5/rubric.md"), "utf8");
  assert.match(rubric, /web\/billing\/view-c\.html/);
  assert.doesNotMatch(rubric, /receipt-detail\.html/);
});
