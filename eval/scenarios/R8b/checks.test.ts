import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r8-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const CANVAS = ".doan/canvases/drafts.html";
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// The seed committed, then the pass fixture (or `fixture`) laid over it, then `edit` applied to the canvas.
function setup(edit: (html: string) => string = html => html, fixture: "pass" | "fail" = "pass") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", fixture), repo, { recursive: true });
  const path = join(repo, CANVAS);
  const html = readFileSync(path, "utf8"), edited = edit(html);
  writeFileSync(path, edited);
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const failed = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);
// Replaces exactly one occurrence, so a fixture change cannot silently miss.
const swap = (from: string, to: string) => (html: string) => {
  assert.equal(html.split(from).length, 2, `expected one ${from}`);
  return html.replace(from, to);
};
const at = (left: number, top: number) => swap("left: 360px; top: 290px;", `left: ${left}px; top: ${top}px;`);

test("R8b pass fixture passes every check", () => {
  assert.deepEqual(failed(setup()), []);
});
test("R8b fail fixture fails the stale selection and the offset", () => {
  const ids = failed(setup(undefined, "fail"));
  for (const id of ["element_anchor_applied", "stale_selection_unchanged", "badge_at_point_offset"]) assert.ok(ids.includes(id), `${id} in ${ids}`);
});
test("R8b doan_check_clean fails on a duplicate frame id", () => {
  assert.deepEqual(failed(setup(swap('<section data-doan-frame="preview"', '<section data-doan-frame="editor"'))).includes("doan_check_clean"), true);
});
test("R8b only_canvas_changed fails when another file changes", () => {
  const ctx = setup();
  writeFileSync(join(ctx.repo, "NOTES.md"), "Renamed Save.\n");
  assert.deepEqual(failed(ctx), ["only_canvas_changed"]);
});
test("R8b element_anchor_applied fails when the anchored button keeps its text", () => {
  assert.deepEqual(failed(setup(swap(">Save draft<", ">Save<"))), ["element_anchor_applied"]);
});
test("R8b element_anchor_applied reads the anchored label with its markup", () => {
  // The label wrapped in markup inside the button is the same label, and that markup is not an added element.
  assert.deepEqual(failed(setup(swap(">Save draft<", "><span>Save draft</span><"))), []);
  assert.deepEqual(failed(setup(swap(">Save draft<", "><span>Save</span> <span>draft</span><"))), []);
  assert.match(checks(setup(swap(">Save draft<", "><span>Save draft</span><"))).find(c => c.id === "seed_structure_kept")!.detail, /added besides the badge: \(none\)/);
  // A wrong label fails whether or not it is wrapped.
  assert.deepEqual(failed(setup(swap(">Save draft<", "><span>Draft saved</span><"))), ["element_anchor_applied"]);
  assert.deepEqual(failed(setup(swap(">Save draft<", "><span>Save</span><"))), ["element_anchor_applied"]);
});
test("R8b stale_selection_unchanged fails when the doan active selection is renamed", () => {
  assert.deepEqual(failed(setup(swap(">Publish<", ">Publish now<"))), ["stale_selection_unchanged", "other_identities_unchanged", "seed_structure_kept"]);
});
test("R8b other_identities_unchanged fails on a moved, renamed or dropped id", () => {
  assert.ok(failed(setup(swap(' data-doan-id="share"', ' data-doan-id="share-link"'))).includes("other_identities_unchanged"));
  assert.ok(failed(setup(swap('<h1 data-doan-id="preview-title">', '<h2 data-doan-id="preview-title">'))).includes("other_identities_unchanged"));
  assert.ok(failed(setup(swap('      <button data-doan-id="save">Save draft</button>\n    </div>', '    </div>\n    <button data-doan-id="save">Save draft</button>'))).includes("other_identities_unchanged"));
});
test("R8b seed_structure_kept fails on reordered seed elements and allows added notes", () => {
  const reorder = (html: string) => {
    const title = '    <h1 data-doan-id="editor-title">Quarterly update</h1>\n', body = '    <p data-doan-id="editor-body">Revenue grew in every region this quarter.</p>\n';
    return swap(title + body, body + title)(html);
  };
  assert.deepEqual(failed(setup(reorder)), ["seed_structure_kept"]);
  // Guide rule G notes, outside the frames (as Claude placed one) or inside the point's frame (as Codex did).
  assert.deepEqual(failed(setup(swap("</body>", '  <p data-doan-id="design-note">Not in code yet: the "Save draft" copy and the Draft badge.</p>\n</body>'))), []);
  assert.deepEqual(failed(setup(swap('data-doan-id="draft-badge">Draft</span>\n', 'data-doan-id="draft-badge">Draft</span>\n    <small data-doan-id="design-note">Design only: "Save draft" copy and Draft badge.</small>\n'))), []);
  const detail = checks(setup(swap("</body>", "  <p>Note</p>\n</body>"))).find(c => c.id === "seed_structure_kept")!.detail;
  assert.match(detail, /added besides the badge: \(outside frames\): \["p",null,"Note"\]/);
});
test("R8b badge_in_point_frame fails for a badge in the other frame or two badges", () => {
  const moved = (html: string) => swap('    <span class="badge" data-doan-id="draft-badge">Draft</span>\n', "")(html).replace("    </div>\n", '    </div>\n    <span class="badge" data-doan-id="draft-badge">Draft</span>\n');
  assert.ok(failed(setup(moved)).includes("badge_in_point_frame"));
  assert.ok(failed(setup(swap('data-doan-id="draft-badge">Draft</span>', 'data-doan-id="draft-badge">Draft</span><span class="badge">Draft</span>'))).includes("badge_in_point_frame"));
});
test("R8b badge_at_point_offset uses the frame origin and the padding tolerance", () => {
  // Measured from the frame's content box: off by the 16px padding, still at the spot.
  assert.deepEqual(failed(setup(at(376, 306))), []);
  // Centered on the point.
  assert.deepEqual(failed(setup(at(340, 280))), []);
  assert.deepEqual(failed(setup(at(377, 290))), ["badge_at_point_offset"]);
  assert.deepEqual(failed(setup(at(360, 307))), ["badge_at_point_offset"]);
  // Page coordinates: the point's frame starts 544px from the page's left edge.
  assert.deepEqual(failed(setup(at(360 - 544, 290))), ["badge_at_point_offset"]);
  // In flow after the existing content.
  assert.deepEqual(failed(setup(swap("position: absolute; left: 360px; top: 290px;", ""))), ["badge_at_point_offset"]);
});
