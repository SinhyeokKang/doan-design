import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r9-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

const FRAME = "[Billing](doan:account/frame/billing-form)";
const ELEMENT = "[Save](doan:account/element/save-profile)";
// The seed committed, the pass fixture laid over it, then a transcript (the final answer) for the checks.
function setup(transcript: string, fixture: "pass" | "fail" = "pass") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", fixture), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env, seedCommit: "HEAD" });
}
const failed = (answer: string) => checks(setup(answer)).filter(c => !c.pass).map(c => c.id);

test("R9 pass fixture passes every check", () => {
  const ctx = setup(`Changed ${FRAME} and ${ELEMENT}.`);
  assert.deepEqual(checks(ctx).filter(c => !c.pass), []);
});
test("R9 fail fixture fails the link checks and the doan:// link", () => {
  const ctx = setup(`See [Billing](doan://open?root=/r&canvas=account&frame=billing-form) and [Save](doan:account/element/save).`);
  assert.deepEqual(checks(ctx).filter(c => !c.pass).map(c => c.id), ["doan_links_well_formed", "links_name_real_targets", "frame_link_present", "element_link_present", "heading_change_linked", "button_change_linked"]);
});
test("R9 reads a Claude result event and the Codex stdout before its banner", () => {
  const answer = `Changed ${FRAME} and ${ELEMENT}.`;
  assert.deepEqual(checks(setup(JSON.stringify({ type: "result", result: answer }))).filter(c => !c.pass), []);
  assert.deepEqual(checks(setup(`${answer}\nOpenAI Codex v0.1\nbanner`)).filter(c => !c.pass), []);
});
const NONE = ["links_name_real_targets", "frame_link_present", "element_link_present", "heading_change_linked", "button_change_linked"];
test("R9 links inside inline code or a code block are not links", () => {
  assert.deepEqual(failed(`Changed \`${FRAME}\` and \`${ELEMENT}\`.`), NONE);
  assert.deepEqual(failed(`Changed:\n\`\`\`\n${FRAME}\n${ELEMENT}\n\`\`\`\n`), NONE);
  assert.deepEqual(failed(`Changed:\n\`\`\`\n${FRAME}\n${ELEMENT}\n`), NONE);
  // A backtick left open in one paragraph does not hide the links in the next.
  assert.deepEqual(failed(`Ran \`doan check\n\nChanged ${FRAME} and ${ELEMENT}.`), []);
  // Code beside real links does not disturb them.
  assert.deepEqual(failed(`Ran \`doan check\`. Changed ${FRAME} and ${ELEMENT}; \`doan:x\` stays text.`), []);
});
test("R9 doan_links_well_formed fails for any doan: text the app would not draw as a link", () => {
  for (const extra of ["[x](doan:x)", "[x](doan:Account/frame/billing-form)", "[x](doan:account/point/billing-form)", "[x](doan://open?root=/r&canvas=account)", "doan:account/frame/billing-form", "[x](DOAN:account/frame/billing-form)", "[x](doan:account/frame/a/b)"]) {
    assert.ok(failed(`${FRAME} ${ELEMENT} ${extra}`).includes("doan_links_well_formed"), extra);
  }
});
test("R9 doan_links_well_formed ignores a doan: string in a link's text or in prose", () => {
  assert.deepEqual(failed(`[doan:account/frame/billing-form](doan:account/frame/billing-form) ${ELEMENT}`), []);
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} The doan: scheme names a place; doan:x is not a place.`), []);
  // One drawn link does not excuse a second, bare copy of the same text.
  assert.ok(failed(`${FRAME} ${ELEMENT} doan:account/frame/billing-form`).includes("doan_links_well_formed"));
});
test("R9 accepts autolinks, an angle-bracket destination and other real targets", () => {
  assert.deepEqual(failed(`<doan:account/frame/billing-form> and [Save](<doan:account/element/save-profile>)`), []);
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} and also [heading](doan:account/element/billing-title)`), []);
});
test("R9 links_name_real_targets fails for another canvas, a guessed id or the wrong kind", () => {
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} [x](doan:other/frame/billing-form)`), ["links_name_real_targets"]);
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} [x](doan:account/element/save)`), ["links_name_real_targets"]);
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} [x](doan:account/element/billing-form)`), ["links_name_real_targets"]);
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} [x](doan:account/frame/save-profile)`), ["links_name_real_targets"]);
});
test("R9 needs a frame link and an element link with real ids", () => {
  assert.deepEqual(failed("Changed the Billing heading and the Save button."), NONE);
  assert.deepEqual(failed(`${FRAME} [Profile](doan:account/frame/profile-form)`), ["element_link_present"]);
  assert.deepEqual(failed(`[Heading](doan:account/element/billing-title) ${ELEMENT}`), ["frame_link_present"]);
  assert.deepEqual(failed(`${FRAME} [Profile](doan:account/frame/profile-form) ${ELEMENT}`), []);
});
test("R9 each edited place is linked by its element or its containing frame", () => {
  // Heading: billing-form, or a real element inside it. Button: save-profile, or profile-form.
  assert.deepEqual(failed(`[Heading](doan:account/element/billing-title) [Profile](doan:account/frame/profile-form)`), []);
  assert.deepEqual(failed(`${FRAME} [Update](doan:account/element/update-card)`), ["button_change_linked"]);
  assert.deepEqual(failed(`[Profile](doan:account/frame/profile-form) ${ELEMENT}`), ["heading_change_linked"]);
  // A real element of the other frame does not stand for the heading.
  assert.deepEqual(failed(`[Title](doan:account/element/profile-title) [Profile](doan:account/frame/profile-form)`), ["heading_change_linked"]);
  // Extra links to real targets are fine.
  assert.deepEqual(failed(`${FRAME} ${ELEMENT} [Note](doan:account/element/billing-note)`), []);
});
test("R9 percent-encoded ids are read decoded", () => {
  assert.deepEqual(failed(`[Billing](doan:account/frame/billing%2Dform) [Save](doan:account/element/save%2Dprofile)`), []);
});
test("R9 edits_applied and only_canvas_changed fail on the seed and on another file", () => {
  const ctx = setup(`${FRAME} ${ELEMENT}`);
  cpSync(join(dir, "seed", ".doan/canvases/account.html"), join(ctx.repo, ".doan/canvases/account.html"));
  assert.ok(checks(ctx).some(c => c.id === "edits_applied" && !c.pass));
  const other = setup(`${FRAME} ${ELEMENT}`);
  writeFileSync(join(other.repo, "notes.txt"), "x");
  assert.ok(checks(other).some(c => c.id === "only_canvas_changed" && !c.pass));
});
test("R9 doan_check_clean fails on a duplicate frame id", () => {
  const ctx = setup(`${FRAME} ${ELEMENT}`);
  const path = join(ctx.repo, ".doan/canvases/account.html");
  writeFileSync(path, ctx.read(".doan/canvases/account.html")!.replace('data-doan-frame="profile-form"', 'data-doan-frame="billing-form"'));
  assert.ok(checks(ctx).some(c => c.id === "doan_check_clean" && !c.pass));
});
test("R9 no_doan_open fails when the agent ran doan open", () => {
  const ctx = setup(`${FRAME} ${ELEMENT}`);
  const calls = { commands: ["doan open .doan/canvases/account.html"] } as unknown as typeof ctx.calls;
  assert.ok(checks({ ...ctx, calls }).some(c => c.id === "no_doan_open" && !c.pass));
});
