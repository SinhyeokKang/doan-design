import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W16-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/projects.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const seed = readFileSync(join(import.meta.dirname, "seed", canvasPath), "utf8");
const mark = ' data-doan-prototype="1280x800"';
const hidden = "  .details { display: none; }\n";

before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

function setup(kind: "seed" | "pass" | "fail" = "pass", edit: Record<string, string> = {}) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, ".doan/assets/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
  for (const [path, text] of Object.entries(edit)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id).sort();
const withCanvas = (html: string, extra: Record<string, string> = {}) => failures(setup("pass", { [canvasPath]: html, ...extra }));
// The seed with the details rule replaced: motion left on the board, no prototype mark.
const onBoard = (css: string) => seed.replace(hidden, `  ${css}\n`);

test("W16 seed has no motion, pass expands once in the marked frame, fail replays from the board", () => {
  assert.deepEqual(failures(setup("seed")), ["motion_shown"]);
  assert.deepEqual(failures(setup("pass")), []);
  assert.deepEqual(failures(setup("fail")), ["no_board_click_trigger"]);
});

test("W16 accepts board motion that loops or follows hover, and a one-shot board motion for the judge", () => {
  assert.deepEqual(withCanvas(onBoard(".details { overflow: hidden; animation: grow 2.4s ease-in-out infinite; } @keyframes grow { 0%, 100% { max-height: 0; } 50% { max-height: 200px; } }")), []);
  assert.deepEqual(withCanvas(onBoard(".details { max-height: 0; overflow: hidden; transition: max-height 300ms ease-out; } .card:hover .details { max-height: 200px; }")), []);
  // A motion that runs once on load is left on the board; the rubric scores it partial.
  assert.deepEqual(withCanvas(onBoard(".details { animation: grow 480ms ease-out both; } @keyframes grow { from { opacity: 0; } }")), []);
  assert.deepEqual(withCanvas(seed.replace(hidden, "").replace("</body>", "<script>document.querySelector('[data-doan-id=\"atlas-details\"]').animate([{ opacity: 0 }, { opacity: 1 }], 480);</script>\n</body>")), []);
});

test("W16 rejects still states without any motion", () => {
  const expanded = seed.replace(hidden, "").replace("</body>", '<section data-doan-frame="project-list-open" data-doan-title="Project list (expanded)"><p>Expanded</p></section>\n</body>');
  assert.deepEqual(withCanvas(expanded), ["motion_shown"]);
  assert.deepEqual(withCanvas(onBoard("/* .details { transition: max-height 300ms; } */ .details { display: block; }")), ["motion_shown"]);
  // A mark alone is not motion.
  assert.deepEqual(withCanvas(seed.replace(hidden, "").replace('data-doan-title="Project list"', `data-doan-title="Project list"${mark}`)), ["motion_shown"]);
});

test("W16 rejects a replay control or a click-only state on the board", () => {
  const motion = ".details { max-height: 0; overflow: hidden; transition: max-height 300ms ease-out; } .card.is-open .details { max-height: 200px; }";
  const replay = onBoard(motion).replace('<p data-doan-id="atlas-team">', '<button type="button" data-doan-id="atlas-replay">Replay</button>\n<p data-doan-id="atlas-team">');
  assert.deepEqual(withCanvas(replay.replace("</body>", "<script>document.querySelector('[data-doan-id=\"atlas-replay\"]').addEventListener('click', e => e.target.closest('.card').classList.toggle('is-open'));</script>\n</body>")), ["no_board_click_trigger"]);
  assert.deepEqual(withCanvas(onBoard(`${motion} .card:focus .details { max-height: 200px; }`)), ["no_board_click_trigger"]);
  assert.deepEqual(withCanvas(onBoard(`${motion} .card:active .details { max-height: 200px; }`)), ["no_board_click_trigger"]);
  // The same replay control inside the marked frame is the prototype's.
  assert.deepEqual(withCanvas(replay.replace('data-doan-title="Project list"', `data-doan-title="Project list"${mark}`).replace("</body>", "<script>document.querySelector('[data-doan-id=\"atlas-replay\"]').addEventListener('click', e => e.target.closest('.card').classList.toggle('is-open'));</script>\n</body>")), []);
});

test("W16 reads motion from a linked stylesheet", () => {
  const linked = seed.replace(hidden, "").replace('<link rel="stylesheet" href="../assets/tokens.css">', '<link rel="stylesheet" href="../assets/tokens.css">\n<link rel="stylesheet" href="../assets/projects.css">');
  assert.deepEqual(withCanvas(linked, { ".doan/assets/projects.css": ".details { transition: max-height 300ms; }\n.card:hover .details { max-height: 200px; }\n" }), []);
  assert.deepEqual(withCanvas(linked, { ".doan/assets/projects.css": ".details { max-height: 200px; }\n" }), ["motion_shown"]);
});

test("W16 needs the other frames byte-identical", () => {
  assert.deepEqual(withCanvas(pass.replace('<p data-doan-id="empty-copy">No projects yet.', '<p data-doan-id="empty-copy">No projects yet!')), ["other_frames_unchanged"]);
});
