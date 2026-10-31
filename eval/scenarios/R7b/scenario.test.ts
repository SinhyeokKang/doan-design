import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createContext } from "../../lib/context.ts";
import { loadScenario } from "../../lib/scenario.ts";
import { toolCalls } from "../../lib/transcript.ts";
import { prepareWorkspace, type Workspace } from "../../lib/workspace.ts";
import r7b, { COLOR, LABEL, TERMS } from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r7b-"));
const cli = join(root, "doan");
const opened: Workspace[] = [];
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(async () => {
  for (const ws of opened) await ws.dispose();
  rmSync(root, { recursive: true, force: true });
});
const scenario = () => loadScenario(join(import.meta.dirname, ".."), "R7b");
async function fixture(kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const ws = await prepareWorkspace({ scenario: scenario(), agent: "fixture", cli, stub: "stub\n" });
  opened.push(ws);
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), ws.repo, { recursive: true });
  transcript ??= kind === "seed" ? "" : readFileSync(join(import.meta.dirname, `fixtures/${kind}.transcript.txt`), "utf8");
  return createContext({ repo: ws.repo, cwd: ws.cwd, agent: "fixture", transcript, cli, env: ws.env, seedCommit: ws.seedCommit });
}
type Ctx = Awaited<ReturnType<typeof fixture>>;
const failed = (ctx: Ctx) => r7b(ctx).filter(c => !c.pass).map(c => c.id);
const shell = (command: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } });
const edit = (ctx: Ctx, from: string, to: string) => {
  const path = join(ctx.repo, ".doan/canvases/signup.html"), html = readFileSync(path, "utf8");
  assert.ok(html.includes(from), from);
  writeFileSync(path, html.replace(from, to));
};

test("R7b seed attaches two open comments to the selection and one to another element", async () => {
  const ctx = await fixture("seed");
  assert.equal(ctx.doan(["check"]).json.result.summary.errors, 0);
  const result = ctx.doan(["comments", "--canvas", "signup"]).json.result;
  assert.deepEqual(result.warnings, []);
  const selection = scenario().selectionValue as any;
  const attached = result.comments.filter((c: any) => c.target.element?.doanId === selection.element.doanId && c.target.element?.html === selection.element.html);
  assert.deepEqual(attached.map((c: any) => c.comment), [LABEL, COLOR]);
  assert.deepEqual(result.comments.map((c: any) => [c.comment, c.status, c.outdated]), [LABEL, COLOR, TERMS].map(id => [id, "open", false]));
  // The selected button is not the first candidate, and the prompt names no target.
  const seed = ctx.seed(".doan/canvases/signup.html")!;
  assert.ok(seed.includes(selection.element.html));
  assert.notEqual([...seed.matchAll(/<button data-doan-id="([^"]+)"/g)][0][1], "submit");
  assert.equal(scenario().promptTemplate, "Fix this.\n");
  assert.ok(failed(ctx).length > 0);
});

test("R7b pass fixture passes and the fail fixture fails for fixing the comment on another element", async () => {
  assert.deepEqual(failed(await fixture("pass")), []);
  assert.deepEqual(failed(await fixture("fail")), ["signup_agent_resolves_only", "unattached_comment_left_open", "other_elements_unchanged"]);
});

test("R7b requires shell active and comments calls", async () => {
  const ctx = await fixture("pass");
  const failedFor = (transcript: string) => r7b({ ...ctx, transcript, calls: toolCalls(transcript) }).filter(c => !c.pass).map(c => c.id);
  const comments = shell("doan comments --canvas signup --json");
  for (const transcript of ["Guide: doan active --json", shell("echo 'doan active'")])
    assert.deepEqual(failedFor(`${transcript}\n${comments}`), ["asked_doan_active"], transcript);
  for (const transcript of ["Guide: doan comments --canvas signup", shell("echo 'doan comments'"), shell("doan ls --json")])
    assert.deepEqual(failedFor(`${shell("doan active --json")}\n${transcript}`), ["read_doan_comments"], transcript);
  for (const transcript of [`${shell("doan active --json")}\n${comments}`, `${shell("doan --repo /tmp/r active")}\n${shell("doan --json comments")}`])
    assert.deepEqual(failedFor(transcript), [], transcript);
});

test("R7b rejects resolving an attached comment it did not apply", async () => {
  const ctx = await fixture("pass");
  edit(ctx, "background: var(--color-primary); color: var(--color-on-primary)", "background: var(--color-muted); color: var(--color-text)");
  assert.deepEqual(failed(ctx), ["attached_color_applied"]);
});

test("R7b accepts the primary background from a stylesheet rule and nested label markup", async () => {
  const ctx = await fixture("pass");
  edit(ctx, 'style="background: var(--color-primary); color: var(--color-on-primary); padding: var(--space-4)">Create account', 'class="primary" style="color: var(--color-on-primary); padding: var(--space-4)"><span>Create account</span>');
  edit(ctx, "</style>", '  .primary { background: var(--color-primary); }\n  </style>');
  assert.deepEqual(failed(ctx), []);
});
