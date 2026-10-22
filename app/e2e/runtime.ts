// Runtime smoke for the app shell and the canvas view (/runtime-test). Drives
// the built app with Playwright `_electron`: opens temp repos through a
// replaced folder dialog, reads the window's DOM, fetches over the local
// server, restarts, opens canvases (zoom, pan, frame jumps, live reload,
// in-canvas links) and saves screenshots. Run with `npm --prefix app run e2e`
// (builds first).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Frame, type Locator, type Page } from "playwright";

const exec = promisify(execFile);
const appDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const realFoldersJson = join(homedir(), "Library", "Application Support", "doan", "folders.json");
const shotDir = join(repoRoot, ".scratch", "runtime-test", new Date().toISOString().replace(/[:.]/g, "-"));
const WAIT_MS = 10_000;
const CLOSE_MS = 5_000;
// A passing run takes under a minute; this only ends a run that hangs.
const RUN_MS = 300_000;

interface CanvasView {
  path: string;
  title: string;
  open: string;
  url: string;
}

interface FolderView {
  path: string;
  state: string;
  status: string;
  hint: string;
  canvases: CanvasView[];
}

const shots: string[] = [];
// The app being driven and the temp dir, for the watchdog.
let running: ElectronApplication | undefined;
let work: string | undefined;

async function main(): Promise<void> {
  const watchdog = setTimeout(() => {
    console.error(`runtime-test: FAIL\nno result after ${RUN_MS / 1000} s`);
    running?.process().kill("SIGKILL");
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
    process.exit(1);
  }, RUN_MS);
  try {
    await runAll();
  } finally {
    clearTimeout(watchdog);
  }
}

async function runAll(): Promise<void> {
  const before = await fingerprint(realFoldersJson);
  // realpath: macOS tmpdir is under /var -> /private/var, and the app stores real paths.
  work = await realpath(await mkdtemp(join(tmpdir(), "doan-e2e-")));
  try {
    const cli = join(work, "bin", "doan");
    await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: repoRoot });
    const repos = await makeRepos(join(work, "repos"), cli);
    const gatedCli = join(work, "bin", "doan-gated.mjs");
    await writeFile(gatedCli, `#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
while (existsSync(${JSON.stringify(`${gatedCli}.gate`)})) await new Promise(resolve => setTimeout(resolve, 25));
const result = spawnSync(${JSON.stringify(cli)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
    await chmod(gatedCli, 0o755);
    await run(gatedCli, join(work, "userData"), repos);
  } finally {
    await rm(work, { recursive: true, force: true });
    const after = await fingerprint(realFoldersJson);
    assert.equal(after, before, `the real ${realFoldersJson} changed`);
  }
}

interface Repos {
  ok: string;
  worktree: string;
  broken: string;
  brokenMessage: string;
  brokenSub: string;
  brokenDoanOnly: string;
  plain: string;
  sub: string;
  link: string;
  canvas: string;
}

const COMMENT = {
  v: 1,
  id: "evt_00000000-0000-4000-8000-000000000001",
  at: "2026-10-21T10:00:00.000Z",
  type: "create",
  comment: "cmt_00000000-0000-4000-8000-000000000001",
  by: { kind: "human", name: "Sam" },
  body: "Please adjust spacing.",
  canvasHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  target: {},
};

async function makeRepos(dir: string, cli: string): Promise<Repos> {
  const ok = join(dir, "ok");
  await mkdir(join(ok, ".doan", "comments"), { recursive: true });
  await mkdir(join(ok, "design", "sub"), { recursive: true });
  await writeFile(join(ok, ".doan", "config.json"), '{"v":1}\n');
  await writeFile(
    join(ok, "design", "login.html"),
    '<!doctype html><html><head><title>Login screen</title><meta name="doan:canvas" content="login"><meta name="doan:width" content="1280"></head><body><p>login canvas</p></body></html>\n',
  );
  await writeFile(join(ok, "design", "bare.html"), "<!doctype html><p>no id, title or width</p>\n");
  // Deeper than the HTML parser's 512-element stack: `doan ls` lists it with path only.
  await writeFile(join(ok, "design", "deep.html"), "<div>".repeat(600));
  // Path byte order differs from locale order (`Zeta` first) and from id order
  // (`foo-bar.html` before `foo.html`), so a renderer that re-sorts fails step 2.
  await writeFile(join(ok, "design", "Zeta.html"), "<!doctype html><title>Zeta</title>\n");
  await writeFile(join(ok, "design", "foo.html"), '<!doctype html><title>Foo</title><meta name="doan:canvas" content="foo">\n');
  await writeFile(join(ok, "design", "foo-bar.html"), '<!doctype html><title>Foo bar</title><meta name="doan:canvas" content="foo-bar">\n');
  await writeFile(join(ok, ".doan", "comments", "login.jsonl"), `${JSON.stringify(COMMENT)}\n`);
  await writeFile(join(ok, ".env"), "SECRET=1\n");

  // A second checkout of the same repo has its own root, so it is its own folder.
  const worktree = join(dir, "ok-worktree");
  await cp(ok, worktree, { recursive: true });

  const broken = join(dir, "broken");
  await mkdir(join(broken, ".doan"), { recursive: true });
  await mkdir(join(broken, "design"));
  // `.doan/` without config.json is not a repo root for the CLI.
  await mkdir(join(broken, "notes", ".doan", "comments"), { recursive: true });
  await writeFile(join(broken, ".doan", "config.json"), "{\n");
  const brokenMessage = await cliErrorMessage(cli, broken);

  const plain = join(dir, "plain");
  await mkdir(plain);

  const link = join(dir, "link-to-ok");
  await symlink(ok, link);

  const canvas = join(dir, "canvas");
  await makeCanvasRepo(canvas);

  return { ok, worktree, broken, brokenMessage, brokenSub: join(broken, "design"), brokenDoanOnly: join(broken, "notes"), plain, sub: join(ok, "design", "sub"), link, canvas };
}

const CANVAS_CONFIG = '{"v":1,"tokenCss":"tokens.css"}\n';
const MAIN_HEIGHT = 3000;
const SHRUNK_HEIGHT = 1200;
const LONG_HEIGHT = 2500;
const NEXT_HEIGHT = 300;
const NARROW_WIDTH = 375;
const VH_TALL = 3000;
const VH_SHORT = 300;

function canvasHtml(id: string, width: number | null, style: string, body: string): string {
  const meta = width === null ? "" : `<meta name="doan:width" content="${width}">`;
  return `<!doctype html><html><head><meta name="doan:canvas" content="${id}">${meta}<title>${id}</title><link rel="stylesheet" href="../tokens.css"><style>html,body{margin:0}${style}</style></head><body>${body}</body></html>\n`;
}

// Frames: a titled one with an id-less frame inside, an inner scroller, one
// taller than the viewport, and a repeated id. Heights add up to MAIN_HEIGHT.
function mainCanvas(tall: boolean): string {
  const style = "section{display:block;position:relative;box-sizing:border-box;border:1px solid #888}#scroller{position:absolute;left:100px;top:100px;width:400px;height:200px;overflow:auto}#scroller div{height:1000px}";
  const body = [
    '<section data-doan-frame="hero" data-doan-title="Hero" style="height:400px"><div data-doan-frame="" style="position:absolute;left:600px;top:100px;width:200px;height:100px"></div></section>',
    '<section data-doan-frame="scroller-box" style="height:400px"><div id="scroller"><div>scroll me</div></div></section>',
    tall ? '<section data-doan-frame="tall" style="height:1800px"></section>' : "",
    '<section data-doan-frame="dup" style="height:200px"></section>',
    '<section data-doan-frame="dup" style="height:200px"></section>',
  ].join("");
  return canvasHtml("main", 1200, style, body);
}

function vhCanvas(height: number): string {
  return canvasHtml("vh", 1200, "body{min-height:100vh}", `<div data-doan-frame="vh" style="height:${height}px"></div>`);
}

async function makeCanvasRepo(repo: string): Promise<void> {
  await mkdir(join(repo, ".doan", "comments"), { recursive: true });
  await mkdir(join(repo, "design"));
  await writeFile(join(repo, ".doan", "config.json"), CANVAS_CONFIG);
  await writeFile(join(repo, "tokens.css"), ":root{--space:8px}\n");
  const design = join(repo, "design");
  await writeFile(join(design, "main.html"), mainCanvas(true));
  await writeFile(join(design, "vh.html"), vhCanvas(VH_TALL));
  await writeFile(join(design, "narrow.html"), canvasHtml("narrow", NARROW_WIDTH, "", '<div data-doan-frame="only" style="height:600px"></div>'));
  await writeFile(join(design, "noframes.html"), canvasHtml("noframes", 800, "", '<div style="height:300px">no frames</div>'));
  await writeFile(join(design, "nowidth.html"), canvasHtml("nowidth", null, "", "<p>no width</p>"));
  await writeFile(join(design, "gone.html"), canvasHtml("gone", 800, "", '<div style="height:300px">deleted later</div>'));
  await writeFile(join(design, "long.html"), canvasHtml("long", 1200, "", `<div data-doan-frame="long" style="height:${LONG_HEIGHT}px"><a id="next" href="next.html">next</a></div>`));
  await writeFile(join(design, "next.html"), canvasHtml("next", 1200, "body{min-height:100vh}", `<div data-doan-frame="next" style="height:${NEXT_HEIGHT}px"></div>`));
}

// The expected text is whatever the CLI says, so this test does not pin CLI wording.
async function cliErrorMessage(cli: string, repo: string): Promise<string> {
  try {
    await exec(cli, ["ls", "--json", "--repo", repo]);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    return (JSON.parse(stdout) as { error: { message: string } }).error.message;
  }
  throw new Error(`expected doan ls to fail for ${repo}`);
}

async function run(cli: string, userData: string, repos: Repos): Promise<void> {
  let { app, page } = await launch(cli, userData);
  try {
    // 1. Open the repos through the dialog.
    await emptyControls(page);
    const disabledStyles = await page.getByRole("button", { name: "Zoom out", exact: true }).evaluate(button => ({
      group: getComputedStyle(button.parentElement!.parentElement!).opacity,
      button: getComputedStyle(button).opacity,
    }));
    assert.deepEqual(disabledStyles, { group: "0.4", button: "1" }, "disabled zoom is dimmed once");
    assert.equal(await page.getByRole("button", { name: "Reload canvas", exact: true }).evaluate(button => getComputedStyle(button).opacity), "0.4", "disabled Reload opacity");
    assert.equal(await page.getByRole("button", { name: "Reload canvas", exact: true }).evaluate(button => getComputedStyle(button.closest("header")!).lineHeight), "normal", "top bar does not inherit preflight line height");
    await replaceDialog(app, repos.ok);
    await page.getByRole("button", { name: "Open Project…", exact: true }).first().click();
    await waitFolders(page, (folders) => folders.some((f) => f.path === repos.ok && f.state === "list"), "ok repo listed after the button");
    for (const picked of [repos.broken, repos.plain, repos.sub, repos.link, repos.worktree]) {
      await openFolder(app, page, picked);
    }
    const project = page.getByRole("treeitem", { name: "ok", exact: true });
    const projectTypography = await project.evaluate(item => {
      const glyph = item.firstElementChild!.firstElementChild!;
      return { lineHeight: getComputedStyle(glyph.nextElementSibling!).lineHeight, glyphHeight: glyph.getBoundingClientRect().height };
    });
    assert.deepEqual(projectTypography, { lineHeight: "normal", glyphHeight: 16 }, "project text and glyph retain their natural line height");
    const axSession = await page.context().newCDPSession(page);
    for (const collapsed of [false, true]) {
      if (collapsed) {
        await project.focus();
        await page.keyboard.press("ArrowLeft");
      }
      assert.equal(await project.getAttribute("aria-expanded"), String(!collapsed), "project state before AX inspection");
      const { nodes } = await axSession.send("Accessibility.getFullAXTree");
      assert.deepEqual(nodes.filter(node => !node.ignored && node.role?.value === "StaticText" && ["◧", "▾", "▸"].includes(node.name?.value)), [], `decorative glyphs are absent from the accessibility tree (${collapsed ? "collapsed" : "expanded"})`);
    }
    await page.keyboard.press("ArrowRight");
    assert.equal(await project.getAttribute("aria-expanded"), "true", "restore the project after AX inspection");
    await axSession.detach();
    const opened = [repos.ok, repos.broken, repos.plain, repos.worktree];
    let folders = await waitFolders(page, (all) => sameList(all.map((f) => f.path), opened) && all.every((f) => f.state !== "loading"), "four folders, subfolder and symlink deduped");
    assert.deepEqual(JSON.parse(await readFile(join(userData, "folders.json"), "utf8")), opened);
    // A subfolder of a broken repo has no root to store: refused with the CLI's
    // message, also when it holds a `.doan/` without config.json.
    await recordMessageBoxes(app);
    await openFolder(app, page, repos.brokenSub);
    await openFolder(app, page, repos.brokenDoanOnly);
    assert.deepEqual(await app.evaluate(() => (globalThis as { doanMessages?: string[] }).doanMessages), [repos.brokenMessage, repos.brokenMessage]);
    assert.ok(sameList((await readFolders(page)).map((f) => f.path), opened), "refused folder not added");

    // 2. What each folder shows.
    const expectedOk: CanvasView[] = [
      { path: "design/Zeta.html", title: "Zeta", open: "0 open comments", url: "" },
      { path: "design/bare.html", title: "", open: "0 open comments", url: "" },
      { path: "design/deep.html", title: "", open: "0 open comments", url: "" },
      { path: "design/foo-bar.html", title: "Foo bar", open: "0 open comments", url: "" },
      { path: "design/foo.html", title: "Foo", open: "0 open comments", url: "" },
      { path: "design/login.html", title: "Login screen", open: "1 open comments", url: "" },
    ];
    for (const path of [repos.ok, repos.worktree]) {
      const folder = byPath(folders, path);
      assert.equal(folder.state, "list");
      assert.deepEqual(folder.canvases.map((c) => ({ ...c, url: "" })), expectedOk, `canvases of ${path}`);
    }
    const broken = byPath(folders, repos.broken);
    assert.equal(broken.state, "error");
    assert.equal(broken.status, repos.brokenMessage);
    const plain = byPath(folders, repos.plain);
    assert.equal(plain.state, "uninitialized");
    assert.equal(plain.status, "Not initialized");
    assert.match(plain.hint, /doan init/);
    await screenshot(page, "1-opened");

    // 3. Watching: a new canvas shows up; a deleted folder becomes "not found";
    // opening it again after it comes back watches it again.
    await writeFile(join(repos.ok, "design", "added.html"), "<!doctype html><title>Added</title>\n");
    await waitFolders(page, (all) => hasCanvas(all, repos.ok, "design/added.html"), "added canvas listed");
    await rm(repos.worktree, { recursive: true, force: true });
    folders = await waitFolders(page, (all) => all.some((f) => f.path === repos.worktree && f.state === "notFound"), "deleted folder not found");
    assert.equal(byPath(folders, repos.worktree).status, "Not found");
    assert.equal(byPath(folders, repos.ok).state, "list");
    await page.getByRole("treeitem", { name: "ok-worktree", exact: true }).getByRole("button", { name: "Reopen", exact: true }).click();
    await waitFolders(page, all => byPath(all, repos.worktree).state === "notFound", "Reopen still missing");
    await cp(repos.ok, repos.worktree, { recursive: true });
    await reopenObserved(page, "ok-worktree", cli);
    await waitFolders(page, (all) => all.some((f) => f.path === repos.worktree && f.state === "list"), "re-opened folder listed");
    await writeFile(join(repos.worktree, "design", "again.html"), "<!doctype html><title>Again</title>\n");
    await waitFolders(page, (all) => hasCanvas(all, repos.worktree, "design/again.html"), "re-opened folder watched");

    // 4. The local server serves the canvas and nothing outside the scope.
    const login = byPath(await readFolders(page), repos.ok).canvases.find((c) => c.path === "design/login.html");
    assert.ok(login?.url, "login canvas has a serving url");
    const canvas = await fetch(login.url);
    assert.equal(canvas.status, 200);
    assert.equal(canvas.headers.get("access-control-allow-origin"), "null");
    assert.match(await canvas.text(), /login canvas/);
    const env = await fetch(login.url.replace(/design\/login\.html$/, ".env"));
    assert.equal(env.status, 404);
    assert.equal(env.headers.get("access-control-allow-origin"), null);

    // 5. Closing a folder survives a restart; the rest stay.
    await page.getByRole("button", { name: "Close project broken", exact: true }).click();
    const kept = [repos.ok, repos.plain, repos.worktree];
    await waitFolders(page, (all) => sameList(all.map((f) => f.path), kept), "closed folder gone");
    await waitFor(async () => sameList(JSON.parse(await readFile(join(userData, "folders.json"), "utf8")) as string[], kept), "folders.json saved");
    await app.close();
    ({ app, page } = await launch(cli, userData));
    folders = await waitFolders(page, (all) => sameList(all.map((f) => f.path), kept) && all.every((f) => f.state !== "loading"), "folders after restart");
    assert.equal(byPath(folders, repos.ok).state, "list");
    assert.equal(byPath(folders, repos.plain).state, "uninitialized");
    assert.equal(byPath(folders, repos.worktree).state, "list");

    // 6. Screenshot.
    await screenshot(page, "2-restarted");

    await canvasView(app, page, repos);
  } catch (error) {
    await screenshot(page, "failure").catch(() => {});
    throw error;
  } finally {
    await close(app);
  }
}

// close() waits for the process to exit, which a stuck app never does.
async function close(app: ElectronApplication): Promise<void> {
  const closed = await Promise.race([app.close().then(() => true, () => true), sleep(CLOSE_MS).then(() => false)]);
  if (!closed) app.process().kill("SIGKILL");
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
  // #viewport, the origin of screen coordinates, in page coordinates.
  left: number;
  top: number;
  vw: number;
  vh: number;
  frameWidth: number;
  frameHeight: number;
  boardShown: boolean;
  status: string;
  statusText: string;
  zoom: string;
  updated: string;
  error: string | null;
  unlisted: boolean;
}

interface FrameButton {
  current: boolean;
}

interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COMMENT_MAIN = { ...COMMENT, id: "evt_00000000-0000-4000-8000-000000000002", comment: "cmt_00000000-0000-4000-8000-000000000002" };
// Long enough for the watcher debounce, a `doan ls` run and an iframe load.
const QUIET_MS = 1500;

// Canvas view steps (ARCHITECTURE §3, Canvas view). Positions inside the iframe
// come from the canvas's own rects (board px) and the board transform:
// Playwright's boundingBox() ignores the board scale inside the iframe.
async function canvasView(app: ElectronApplication, page: Page, repos: Repos): Promise<void> {
  // C1. Before a canvas is picked, then loading, then the board.
  assert.equal((await readView(page)).status, "empty");
  assert.equal((await readView(page)).statusText, "Pick a canvas from the list");
  await openFolder(app, page, repos.canvas);
  await waitFolders(page, (all) => hasCanvas(all, repos.canvas, "design/main.html"), "canvas repo listed");
  const rows = byPath(await readFolders(page), repos.canvas).canvases;
  const url = (path: string): string => rows.find((c) => c.path === path)?.url ?? assert.fail(`no url for ${path}`);
  const loadingText = await canvasButton(page, repos.canvas, "design/main.html").evaluate(async node => {
    (node as HTMLElement).click();
    await Promise.resolve();
    const status = [...document.querySelectorAll('[role="region"][aria-label="Canvas"] [role="status"]')].find(status => status.textContent === "Loading…");
    const spinner = status?.querySelector('[aria-hidden="true"]');
    const rect = spinner?.getBoundingClientRect();
    return { text: status?.textContent, spinner: rect ? { width: rect.width, height: rect.height } : null };
  });
  assert.deepEqual(loadingText, { text: "Loading…", spinner: { width: 18, height: 18 } }, "loading status keeps its hidden 18px spinner and text");
  let state = await waitLoaded(page, "main canvas shown");
  assert.deepEqual(await currentCanvases(page), [`${repos.canvas}\ndesign/main.html`]);
  assert.equal(await page.getAttribute('[role="region"][aria-label="Canvas"] iframe', "sandbox"), "allow-scripts");
  assert.deepEqual(await panelValues(page), { Path: "design/main.html", ID: "main", Width: "1200 px", Frames: "6", Open: "0", Resolved: "0" });
  assert.deepEqual(await activityKinds(page), ["Opened"]);
  await treeKeyboard(page, repos.canvas);


  // C2. Width from doan:width; height is the content height.
  assert.equal(state.frameWidth, 1200);
  let canvas = await canvasFrame(page);
  assert.equal(await canvas.evaluate(() => innerWidth), 1200);
  assert.ok(Math.abs(state.frameHeight - MAIN_HEIGHT) <= 1, `height ${state.frameHeight}`);

  // C3. Fit: board width to the viewport width, never above 100%.
  assertFit(state, 1200);
  assert.equal(state.zoom, `${Math.round(state.scale * 100)}%`);
  await settledScreenshot(page, "3-canvas");
  await canvasButton(page, repos.canvas, "design/narrow.html").click();
  state = await waitLoaded(page, "narrow canvas shown");
  assertFit(state, NARROW_WIDTH);
  assert.equal(state.scale, 1);
  await openCanvas(page, repos.canvas, "design/main.html");
  canvas = await canvasFrame(page);

  // C4. Input. A plain wheel over the iframe pans as far as over the margin.
  const fitted = await readView(page);
  const hero = await frameRect(canvas, 0);
  await wheelAt(page, toPage(fitted, { x: hero.x + 50, y: hero.y + 50 }), 0, 100);
  const overFrame = await waitView(page, (v) => v.y !== fitted.y, "pan over the iframe");
  assert.ok(near(overFrame.x, fitted.x) && near(overFrame.y, fitted.y - 100) && overFrame.scale === fitted.scale, "pan over the iframe by the wheel delta");
  await wheelAt(page, { x: fitted.left + 4, y: fitted.top + 200 }, 0, 100);
  const overMargin = await waitView(page, (v) => v.y !== overFrame.y, "pan over the margin");
  assert.ok(near(overMargin.y - overFrame.y, overFrame.y - fitted.y) && near(overMargin.x, overFrame.x), "same distance over the margin");

  // A ctrl wheel over the iframe zooms around the cursor.
  // Inside the second frame, beside the scroller, and still on screen after the pans.
  const cursor = toPage(overMargin, { x: 800, y: 600 });
  const before = toBoard(overMargin, cursor);
  await page.keyboard.down("Control");
  await wheelAt(page, cursor, 0, -50);
  await page.keyboard.up("Control");
  const zoomed = await waitView(page, (v) => v.scale !== overMargin.scale, "ctrl wheel zoom");
  assert.ok(near(zoomed.scale / overMargin.scale, 1.25), `factor ${zoomed.scale / overMargin.scale}`);
  const after = toBoard(zoomed, cursor);
  assert.ok(Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2, `zoom kept the cursor point: ${JSON.stringify({ before, after })}`);

  // An inner scroller under the cursor scrolls itself, the board stays.
  const scroller = await canvas.evaluate(() => {
    const rect = (document.getElementById("scroller") as HTMLElement).getBoundingClientRect();
    return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
  });
  await wheelAt(page, toPage(zoomed, { x: scroller.x + scroller.width / 2, y: scroller.y + scroller.height / 2 }), 0, 100);
  await waitFor(async () => (await canvas.evaluate(() => (document.getElementById("scroller") as HTMLElement).scrollTop)) > 0, "inner scroller scrolled");
  await sleep(300);
  assertSameView(await readView(page), zoomed, "board kept while the scroller scrolls");

  // Menu items run from main: Playwright keys do not reach the native menu.
  await menu(app, "Zoom In");
  const menuZoomed = await waitView(page, (v) => v.scale !== zoomed.scale, "menu zoom in");
  assert.ok(near(menuZoomed.scale / zoomed.scale, 1.25));
  const center = { x: menuZoomed.left + menuZoomed.vw / 2, y: menuZoomed.top + menuZoomed.vh / 2 };
  const centerBefore = toBoard(zoomed, center);
  const centerAfter = toBoard(menuZoomed, center);
  assert.ok(Math.abs(centerAfter.x - centerBefore.x) <= 1 && Math.abs(centerAfter.y - centerBefore.y) <= 1, "menu zoom around the center");
  await menu(app, "Actual Size");
  const actual = await waitView(page, (v) => v.scale === 1, "actual size");
  assert.equal(actual.zoom, "100%");
  await menu(app, "Fit");
  assertFit(await waitView(page, (v) => v.scale !== 1, "menu fit"), 1200);
  // A pinch over the sidebar must not zoom the app page either.
  await page.keyboard.down("Control");
  await wheelAt(page, { x: 100, y: 300 }, 0, -100);
  await page.keyboard.up("Control");
  await sleep(200);
  assert.equal(await zoomFactor(app), 1);

  // C5. A window resize keeps the scale and the board point at the top-left.
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const sized = await waitView(page, (v) => v.scale !== fitted.scale, "toolbar zoom in");
  await setWindowSize(app, 1200, 820);
  const resized = await waitView(page, (v) => v.vw !== sized.vw, "viewport resized");
  assertSameView(resized, sized, "view kept on resize");
  await setWindowSize(app, 1238, 780);
  await waitView(page, (v) => v.vw === sized.vw && v.vh === sized.vh, "viewport restored");

  // C6. Frame jumps.
  const frames = page.getByRole("region", { name: "Frames", exact: true });
  assert.equal(await frames.getByRole("button").count(), 6);
  for (const [index, name] of ["# hero Hero", "# (no id)", "# scroller-box", "# tall", "# dup", "# dup"].entries()) {
    assert.equal(await frames.getByRole("button").nth(index).and(frames.getByRole("button", { name, exact: true })).count(), 1, `frame ${index} name`);
  }
  const frameColors = await frames.getByRole("button").evaluateAll(buttons => {
    const muted = buttons[1]!.querySelectorAll("span")[1]!;
    const named = buttons[0]!.querySelectorAll("span")[1]!;
    const token = getComputedStyle(document.documentElement).getPropertyValue("--text-3").trim();
    const probe = document.createElement("span");
    probe.style.color = token;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { muted: getComputedStyle(muted).color, named: getComputedStyle(named).color, expected };
  });
  assert.equal(frameColors.muted, frameColors.expected, "id-less frame label uses the resolved text-3 token");
  assert.notEqual(frameColors.muted, frameColors.named, "id-less frame label differs from named frame");
  const tall = await frameRect(canvas, 3);
  let jumped = await jump(page, 3, sized);
  assert.ok(near(jumped.y + tall.y * jumped.scale, 32), "a tall frame is aligned to the top");
  assertInside(jumped, tall, true);
  const dupA = await frameRect(canvas, 4);
  const dupB = await frameRect(canvas, 5);
  const atA = await jump(page, 4, jumped);
  assertInside(atA, dupA, false);
  const atB = await jump(page, 5, atA);
  assertInside(atB, dupB, false);
  assert.notEqual(atA.y, atB.y, "repeated ids jump to their own frames");
  jumped = await jump(page, 0, atB);
  assertInside(jumped, hero, false);
  assert.deepEqual((await frameButtons(page)).map((b) => b.current), [true, false, false, false, false, false]);
  await settledScreenshot(page, "4-frame");
  await openCanvas(page, repos.canvas, "design/noframes.html");
  await waitFor(async () => (await page.getByRole("region", { name: "Frames", exact: true }).getByRole("paragraph").textContent()) === "This canvas has no data-doan-frame", "no-frames notice");
  assert.equal(await page.getByRole("region", { name: "Frames", exact: true }).getByRole("paragraph").evaluate(hint => hint.childElementCount), 0, "no-frame hint is plain text without a code chip");
  await openCanvas(page, repos.canvas, "design/main.html");

  // C7. Live reload keeps the view; only served changes of this folder reload.
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const kept = await waitView(page, (v) => v.scale !== fitted.scale, "zoomed before reload");
  await markCanvas(page);
  const replacedIframe = await page.getByRole("region", { name: "Canvas", exact: true }).locator("iframe").elementHandle();
  assert.ok(replacedIframe);
  await sleep(1100);
  await writeFile(join(repos.canvas, "design", "main.html"), mainCanvas(false));
  await waitFor(async () => !(await marked(page)), "canvas reloaded after an edit");
  const reloaded = await waitView(page, (v) => Math.abs(v.frameHeight - SHRUNK_HEIGHT) <= 1, "height shrinks after the edit");
  assertSameView(reloaded, kept, "view kept on reload");
  assert.equal(await replacedIframe.evaluate(node => node.isConnected), false, "live reload detaches the previous iframe");
  assert.equal(await page.getByRole("region", { name: "Canvas", exact: true }).locator("iframe").evaluate((node, previous) => node !== previous, replacedIframe), true, "live reload creates a different iframe node");
  await replacedIframe.dispose();
  assert.notEqual(reloaded.updated, kept.updated);
  assert.match(reloaded.updated, /^Updated \d\d:\d\d:\d\d$/);
  assert.equal((await activityKinds(page))[0], "Reloaded");
  assert.ok((await activityKinds(page)).includes("Opened"));

  await markCanvas(page);
  await sleep(1100);
  // Atomic save: a new file renamed over the old one.
  await writeFile(join(repos.canvas, "tokens.css.tmp"), ":root{--space:12px}\n");
  await rename(join(repos.canvas, "tokens.css.tmp"), join(repos.canvas, "tokens.css"));
  await waitFor(async () => !(await marked(page)), "canvas reloaded after a token CSS save");
  const afterTokens = await waitLoaded(page, "canvas after a token CSS save");
  assert.notEqual(afterTokens.updated, reloaded.updated);

  await markCanvas(page);
  await writeFile(join(repos.canvas, ".doan", "comments", "main.jsonl"), `${JSON.stringify(COMMENT_MAIN)}\n`);
  await waitFolders(page, (all) => byPath(all, repos.canvas).canvases.some((c) => c.path === "design/main.html" && c.open === "1 open comments"), "comment counted");
  await writeFile(join(repos.ok, "design", "other.html"), "<!doctype html><title>Other</title>\n");
  await waitFolders(page, (all) => hasCanvas(all, repos.ok, "design/other.html"), "other folder re-read");
  await sleep(QUIET_MS);
  assert.ok(await marked(page), "no reload for a comment or another folder");
  assert.equal((await readView(page)).updated, afterTokens.updated);

  // A 100vh canvas whose content shrinks: the replaced document, which sees the
  // reset to 150 too, must not hand its old height to the new one.
  await openCanvas(page, repos.canvas, "design/vh.html");
  await waitView(page, (v) => Math.abs(v.frameHeight - VH_TALL) <= 1, "100vh canvas at its content height");
  await writeFile(join(repos.canvas, "design", "vh.html"), vhCanvas(VH_SHORT));
  await waitView(page, (v) => Math.abs(v.frameHeight - VH_SHORT) <= 1, "100vh canvas shrinks after a live reload");

  // C8. Screen states.
  await canvasButton(page, repos.canvas, "design/nowidth.html").click();
  state = await waitView(page, (v) => v.status === "noWidth", "no-width notice");
  assert.equal(state.updated, "");
  const noWidthHeading = page.getByRole("region", { name: "Canvas", exact: true }).getByRole("status").locator("b");
  assert.equal(await noWidthHeading.count(), 1, "no-width heading has exactly one emphasized element");
  assert.equal(await noWidthHeading.textContent(), "Missing or invalid board width.", "no-width heading remains emphasized");
  assert.equal(
    state.statusText,
    'Missing or invalid board width. Ask the agent to add <meta name="doan:width" content="1440"> to <head>. Run doan check in a terminal to verify.',
  );
  assert.equal(await page.$('[role="region"][aria-label="Canvas"] iframe'), null);
  for (const name of ["Zoom out", "Zoom in", "Fit"]) assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
  await openCanvas(page, repos.canvas, "design/gone.html");
  await rm(join(repos.canvas, "design", "gone.html"));
  state = await waitView(page, (v) => v.status === "missing", "deleted canvas notice");
  assert.equal(state.statusText, "design/gone.html is no longer in the list. It was deleted or moved.");
  assert.equal(await page.$('[role="region"][aria-label="Canvas"] iframe'), null);
  assert.deepEqual(await currentCanvases(page), []);

  await openCanvas(page, repos.canvas, "design/main.html");
  await markCanvas(page);
  const shown = await readView(page);
  await writeFile(join(repos.canvas, ".doan", "config.json"), "{\n");
  state = await waitView(page, (v) => v.error !== null, "error line on a broken config");
  assert.equal(state.error, byPath(await readFolders(page), repos.canvas).status);
  assert.ok(state.boardShown);
  assertSameView(state, shown, "view kept on a folder error");
  await sleep(QUIET_MS);
  assert.ok(await marked(page), "no reload while the folder fails");
  await writeFile(join(repos.canvas, ".doan", "config.json"), CANVAS_CONFIG);
  await waitFor(async () => !(await marked(page)), "reload after the folder recovers");
  assert.equal((await waitLoaded(page, "canvas after recovery")).error, null);

  // No layout within 5 s: the failure state, then Reload. The canvas
  // swallows its own layouts until `quietUntil`, so the first load fails and
  // the retry, at least 5 s later, loads. The deadline is written again just
  // before the click, so a slow folder list cannot use it up.
  const quietPath = join(repos.canvas, "design", "quiet.html");
  const quietCanvas = (until: number) => canvasHtml("quiet", 800, "", `<script>if (Date.now() < ${until}) window.parent = { postMessage() {} };</script><div style="height:400px">quiet</div>`);
  await writeFile(quietPath, quietCanvas(0));
  await waitFolders(page, (all) => hasCanvas(all, repos.canvas, "design/quiet.html"), "quiet canvas listed");
  const quietUntil = Date.now() + 4500;
  await writeFile(quietPath, quietCanvas(quietUntil));
  await canvasButton(page, repos.canvas, "design/quiet.html").click();
  assert.ok(Date.now() < quietUntil - 1000, "quiet canvas opened well before its quiet time ends");
  state = await waitView(page, (v) => v.status === "failed", "failure state after 5 s without a layout");
  assert.equal(await page.getByRole("region", { name: "Canvas", exact: true }).getByRole("status").filter({ hasText: "Couldn’t load the canvas" }).textContent(), "Couldn’t load the canvasRun doan check in a terminalReload");
  assert.equal(state.boardShown, false);
  assert.equal(state.updated, "");
  assert.deepEqual(await activityKinds(page), []);
  assert.ok(Date.now() > quietUntil);
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await waitLoaded(page, "canvas back after Reload");
  assert.deepEqual(await activityKinds(page), ["Reloaded"]);

  // C9. Links inside the canvas.
  await openCanvas(page, repos.canvas, "design/long.html");
  state = await readView(page);
  assert.ok(Math.abs(state.frameHeight - LONG_HEIGHT) <= 1, `long height ${state.frameHeight}`);
  canvas = await canvasFrame(page);
  await canvas.evaluate(() => (document.getElementById("next") as HTMLAnchorElement).click());
  await waitFor(async () => sameList(await currentCanvases(page), [`${repos.canvas}\ndesign/next.html`]), "sidebar marks the linked canvas");
  // The linked document inherits the iframe height; the reset lets it shrink.
  state = await waitView(page, (v) => Math.abs(v.frameHeight - NEXT_HEIGHT) <= 1, "linked 100vh canvas shrinks to its content");
  assert.equal(state.unlisted, false);
  assert.equal(await canvasFrameUrl(app), url("design/next.html"));

  // A link to a listed canvas makes it the open one: its width applies and
  // reloads load it.
  await clickLink(canvas, url("design/narrow.html"));
  await waitFor(async () => sameList(await currentCanvases(page), [`${repos.canvas}\ndesign/narrow.html`]), "sidebar marks the linked narrow canvas");
  await waitView(page, (v) => v.frameWidth === NARROW_WIDTH, "iframe width follows the linked canvas");

  const token = /^(http:\/\/127\.0\.0\.1:\d+\/t\/[^/]+)\//.exec(url("design/narrow.html"))?.[1] ?? assert.fail("token base");
  const otherKey = byPath(await readFolders(page), repos.ok).canvases.find((c) => c.path === "design/login.html")?.url ?? assert.fail("other folder url");
  assert.notEqual(otherKey.slice(0, otherKey.indexOf("/design/")), url("design/narrow.html").slice(0, url("design/narrow.html").indexOf("/design/")));
  for (const target of [`${token}x/`, otherKey]) {
    await clickLink(canvas, target);
    await sleep(QUIET_MS);
    assert.equal(await canvasFrameUrl(app), url("design/narrow.html"), `link to ${target} refused`);
  }

  // A canvas that sent itself to about:blank is a document without the canvas
  // script, and it still cannot leave its folder key.
  await canvas.evaluate(() => {
    location.href = "about:blank";
  });
  await waitFor(async () => (await canvasFrameUrl(app)) === "about:blank", "canvas on about:blank");
  await waitNoCanvasDocument(page, "about:blank shown as an unlisted document");
  await canvas.evaluate((target) => {
    location.href = target;
  }, otherKey);
  await sleep(QUIET_MS);
  assert.equal(await canvasFrameUrl(app), "about:blank", "about:blank to another folder key refused");
  await menu(app, "Reload Canvas");
  await waitFor(async () => (await canvasFrameUrl(app)) === url("design/narrow.html"), "reload after about:blank loads the linked canvas");
  state = await waitLoaded(page, "canvas back after about:blank");
  assert.equal(state.unlisted, false);
  canvas = await canvasFrame(page);

  // A link blocked by the window's CSP leaves an error page; a reload brings the canvas back.
  await clickLink(canvas, "https://example.com/");
  await waitNoCanvasDocument(page, "CSP-blocked link shown as an unlisted document");
  await menu(app, "Reload Canvas");
  await waitFor(async () => (await canvasFrameUrl(app)) === url("design/narrow.html"), "reload after a blocked link");
  state = await waitLoaded(page, "canvas back after reload");
  await waitFor(async () => sameList(await currentCanvases(page), [`${repos.canvas}\ndesign/narrow.html`]), "mark back on the open canvas");

  // A forged layout moves only the display, never the iframe.
  // The canvas's next real layout hides the notice again within a frame, so
  // an observer records that the forged one was taken.
  await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-label="Canvas"]');
    if (!region) throw new Error("Missing canvas region");
    const seen: { shown: boolean } = { shown: false };
    (window as { doanSeenUnlisted?: { shown: boolean } }).doanSeenUnlisted = seen;
    new MutationObserver(() => {
      if ([...region.querySelectorAll('[role="status"]')].some(node => node.textContent === "This page is not a listed canvas")) seen.shown = true;
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
  canvas = await canvasFrame(page);
  await canvas.evaluate((href) => parent.postMessage({ type: "layout", href, height: 500, viewport: innerHeight, frames: [], truncated: false }, "*"), otherKey);
  await waitFor(() => page.evaluate(() => (window as { doanSeenUnlisted?: { shown: boolean } }).doanSeenUnlisted?.shown === true), "forged href shown as an unlisted document");
  await sleep(QUIET_MS);
  assert.equal(await canvasFrameUrl(app), url("design/narrow.html"), "forged layout did not navigate");
  assert.equal(await page.getAttribute('[role="region"][aria-label="Canvas"] iframe', "src"), url("design/narrow.html"));

  // A link to a listed canvas without doan:width makes it the open one but
  // keeps the drawn width, and the zoom commands still act on that board.
  await clickLink(canvas, url("design/nowidth.html"));
  await waitFor(async () => sameList(await currentCanvases(page), [`${repos.canvas}\ndesign/nowidth.html`]), "sidebar marks the linked canvas without a width");
  const drawn = await readView(page);
  assert.equal(drawn.frameWidth, NARROW_WIDTH, "width kept after a link to a canvas without a width");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const buttonZoomed = await waitView(page, (v) => v.scale !== drawn.scale, "toolbar zoom in after a link to a canvas without a width");
  await menu(app, "Zoom In");
  await waitView(page, (v) => v.scale !== buttonZoomed.scale, "menu zoom in after a link to a canvas without a width");
  await menu(app, "Fit");
  assertFit(await waitView(page, (v) => near(v.scale, Math.min(1, (v.vw - 64) / NARROW_WIDTH)), "fit to the drawn width"), NARROW_WIDTH);

  // C10. Security on the app's own main frame.
  assert.equal(await page.evaluate(() => Notification.requestPermission()), "denied");
  assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: "geolocation" })).state), "denied");
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
  assert.ok(csp?.includes("frame-src http://127.0.0.1:*"), `CSP ${csp}`);
  assert.equal(await zoomFactor(app), 1);
  await windowLifetime(app, page, repos);
}


async function reopenObserved(page: Page, name: string, cli: string): Promise<void> {
  const project = page.getByRole("treeitem", { name, exact: true });
  const gate = `${cli}.gate`;
  await writeFile(gate, "hold CLI read\n");
  try {
    await project.getByRole("button", { name: "Reopen", exact: true }).click();
    await project.getByText("Reading…", { exact: true }).waitFor();
    await sleep(100);
    assert.equal(await project.getByText("Reading…", { exact: true }).isVisible(), true);
  } finally { await rm(gate, { force: true }); }
}

async function emptyControls(page: Page): Promise<void> {
  assert.equal(await page.getByRole("status", { name: "Zoom", exact: true }).textContent(), "—");
  const panel = page.getByRole("region", { name: "Canvas info", exact: true });
  await panel.getByText("No canvas open", { exact: true }).waitFor();
  for (const name of ["Reload canvas", "Zoom out", "Zoom in", "Fit"]) assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
}

async function panelValues(page: Page): Promise<Record<string, string>> {
  const panel = page.getByRole("region", { name: "Canvas info", exact: true });
  const terms = await panel.getByRole("term").allTextContents();
  const values = await panel.getByRole("definition").allTextContents();
  return Object.fromEntries(terms.map((term, index) => [term, values[index] ?? ""]));
}

async function activityKinds(page: Page): Promise<string[]> {
  const rows = await page.getByRole("region", { name: "Activity", exact: true }).getByRole("listitem").allTextContents();
  return rows.map(text => text.replace(/^\d{2}:\d{2}:\d{2}/, ""));
}

async function treeKeyboard(page: Page, folder: string): Promise<void> {
  const before = await currentCanvases(page);
  const main = canvasButton(page, folder, "design/main.html");
  await main.focus();
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await currentCanvases(page), before, "arrows only move focus");
  await page.keyboard.press("ArrowUp");
  assert.equal(await main.evaluate(node => node === document.activeElement), true, "ArrowUp returns focus");
  assert.deepEqual(await currentCanvases(page), before, "ArrowUp does not open a canvas");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.getByRole("treeitem", { name: "canvas", exact: true }).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.getByRole("treeitem", { name: "canvas", exact: true }).getAttribute("aria-expanded"), "false");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("treeitem", { name: "canvas", exact: true }).getAttribute("aria-expanded"), "true");
  await main.focus();
  await page.keyboard.press("Enter");
  await waitLoaded(page, "Enter opens focused canvas");
  const beforeSpace = (await activityKinds(page)).length;
  await page.keyboard.press("Space");
  await waitLoaded(page, "Space opens focused canvas");
  await waitFor(async () => (await activityKinds(page)).length === beforeSpace + 1, "Space records a successful open");
  await writeFile(join(folder, "design", "keyboard.html"), canvasHtml("keyboard", 600, "", "<p>keyboard</p>"));
  await waitFolders(page, all => hasCanvas(all, folder, "design/keyboard.html"), "tree updated");
  assert.equal(await main.evaluate(node => node === document.activeElement), true, "list refresh preserves focus");
}

async function windowLifetime(app: ElectronApplication, page: Page, repos: Repos): Promise<void> {
  await openCanvas(page, repos.canvas, "design/main.html");
  const view = await readView(page);
  const activities = await activityKinds(page);
  const id = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.id);
  for (const viaMenu of [true, false]) {
    await app.evaluate(({ BrowserWindow, Menu }, viaMenu) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (viaMenu) {
        const close = Menu.getApplicationMenu()?.items.find(item => item.label === "File")?.submenu?.items.find(item => item.label === "Close Window");
        if (!close) throw new Error("Missing Close Window");
        close.click(undefined, window, undefined);
      } else window?.close();
    }, viaMenu);
    await waitFor(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 1 && !BrowserWindow.getAllWindows()[0]?.isVisible()), "window hidden, process alive");
    await writeFile(join(repos.canvas, "tokens.css"), `:root{--space:${viaMenu ? 13 : 14}px}\n`);
    await sleep(QUIET_MS);
    await app.evaluate(({ app }) => app.emit("activate"));
    await waitFor(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]?.id === id && BrowserWindow.getAllWindows()[0]?.isVisible() === true, id), "same window visible after activate");
    assertSameView(await waitLoaded(page, "canvas after hidden edit"), view, "hidden window preserves view");
    assert.deepEqual(await currentCanvases(page), [`${repos.canvas}\ndesign/main.html`]);
    assert.ok((await activityKinds(page)).length > activities.length);
    assert.equal((await activityKinds(page))[0], "Reloaded");
  }
  await menu(app, "Enter Full Screen");
  await waitFor(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() === true), "entered fullscreen");
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const close = Menu.getApplicationMenu()?.items.find(item => item.label === "File")?.submenu?.items.find(item => item.label === "Close Window");
    close?.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  });
  await waitFor(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() === false), "fullscreen window hidden");
  await app.evaluate(({ app }) => app.emit("activate"));
  await waitFor(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]?.id === id && BrowserWindow.getAllWindows()[0]?.isVisible() === true, id), "fullscreen window returns on activate");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setFullScreen(false));
  await waitFor(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() === false), "left fullscreen");
  console.log("fullscreen close/activate: same window returned");
  await screenshot(page, "5-restored");
  await page.getByRole("button", { name: "Close project canvas", exact: true }).click();
  await emptyControls(page);
  assert.equal((await readView(page)).statusText, "Pick a canvas from the list");
  await openFolder(app, page, repos.canvas);
  await waitFolders(page, all => hasCanvas(all, repos.canvas, "design/main.html"), "canvas reopened");
  await openCanvas(page, repos.canvas, "design/main.html");
  await rename(repos.canvas, `${repos.canvas}-moved`);
  await waitView(page, view => view.statusText === "The project canvas is gone or moved. Reopen it from the sidebar.", "project gone message");
  await emptyControls(page);
  await page.getByRole("button", { name: "Close project canvas", exact: true }).click();
  await waitFolders(page, all => all.every(folder => folder.path !== repos.canvas), "Close removes the missing project");
}

function canvasButton(page: Page, folder: string, canvas: string): Locator {
  return page.getByRole("treeitem", { name: basename(folder), exact: true }).getByRole("treeitem", { name: canvas.replace(/^design\//, ""), exact: true });
}

async function openCanvas(page: Page, folder: string, canvas: string): Promise<ViewState> {
  await canvasButton(page, folder, canvas).click();
  return waitLoaded(page, `${canvas} shown`);
}

async function waitLoaded(page: Page, what: string): Promise<ViewState> {
  return waitView(page, (v) => v.boardShown && v.status === "" && v.frameHeight !== 150, what);
}

// The unlisted line, no frame list and no sidebar mark.
async function waitNoCanvasDocument(page: Page, what: string): Promise<void> {
  await waitFor(async () => (await readView(page)).unlisted && (await frameButtons(page)).length === 0 && (await currentCanvases(page)).length === 0, what);
}

async function readView(page: Page): Promise<ViewState> {
  const viewport = page.getByRole("region", { name: "Canvas", exact: true });
  const notices = await viewport.getByRole("status").allTextContents();
  const statusText = notices.find(text => /^(Loading…|Couldn’t load|Missing or invalid|Pick a canvas|No projects yet|The project |design\/)/.test(text)) ?? "";
  const zoom = await viewport.getByRole("status", { name: /^Zoom(?: \d+%)?$/ }).textContent() ?? "";
  const updated = (await viewport.getByRole("status", { name: /^Updated / }).allTextContents())[0]?.trim() ?? "";
  const geometry = await viewport.evaluate(viewport => {
    const iframe = viewport.querySelector("iframe");
    const board = iframe?.parentElement;
    const matrix = new DOMMatrix(board ? getComputedStyle(board).transform : undefined);
    const rect = viewport.getBoundingClientRect();
    const frameRect = iframe?.getBoundingClientRect();
    return {
      x: matrix.e, y: matrix.f, scale: matrix.a,
      left: rect.left, top: rect.top, vw: viewport.clientWidth, vh: viewport.clientHeight,
      frameWidth: frameRect ? frameRect.width / matrix.a : 0,
      frameHeight: frameRect ? frameRect.height / matrix.a : 0,
    };
  });
  const status = !statusText ? "" : statusText === "Loading…" ? "loading" : statusText.startsWith("Couldn’t load") ? "failed" : statusText.startsWith("Missing or invalid") ? "noWidth" : statusText === "Pick a canvas from the list" || statusText.startsWith("No projects yet") ? "empty" : "missing";
  return {
    ...geometry, status, statusText, zoom, updated,
    boardShown: await viewport.locator("iframe").isVisible(),
    error: notices.find(text => text !== statusText && text !== zoom && text.trim() !== updated && text !== "This page is not a listed canvas") ?? null,
    unlisted: notices.includes("This page is not a listed canvas"),
  };
}

async function waitView(page: Page, done: (view: ViewState) => boolean, what: string): Promise<ViewState> {
  let last: ViewState | undefined;
  await waitFor(async () => done((last = await readView(page))), what, () => JSON.stringify(last));
  return last as ViewState;
}

async function currentCanvases(page: Page): Promise<string[]> {
  const rows = await page.getByRole("treeitem").and(page.locator('[aria-current="true"]')).all();
  const result: string[] = [];
  for (const row of rows) {
    const projectName = await row.evaluate(item => item.parentElement?.closest('[role="treeitem"][aria-level="1"]')?.getAttribute("aria-label") ?? "");
    const project = page.getByRole("treeitem", { name: projectName, exact: true });
    const folder = await tooltipPath(page, project, projectName, projectName);
    const name = await row.getAttribute("aria-label") ?? "";
    const fullPath = await tooltipPath(page, row, name, `${folder}/${name}`);
    result.push(`${folder}\n${fullPath.slice(folder.length + 1)}`);
  }
  return result;
}

async function frameButtons(page: Page): Promise<FrameButton[]> {
  return page.getByRole("region", { name: "Frames", exact: true }).getByRole("button").evaluateAll(buttons => buttons.map(button => ({ current: button.getAttribute("aria-current") === "true" })));
}

async function jump(page: Page, index: number, from: ViewState): Promise<ViewState> {
  await page.getByRole("region", { name: "Frames", exact: true }).getByRole("button").nth(index).click();
  const view = await waitView(page, v => v.x !== from.x || v.y !== from.y || v.scale !== from.scale, `jump to frame ${index}`);
  await waitFor(async () => (await frameButtons(page))[index]?.current === true, `frame ${index} selected after React commit`);
  return view;
}

async function canvasFrame(page: Page): Promise<Frame> {
  const frame = await (await page.$('[role="region"][aria-label="Canvas"] iframe'))?.contentFrame();
  assert.ok(frame, "canvas iframe has a frame");
  return frame;
}

// The frame's URL as main sees it, which is what navigation rules act on.
function canvasFrameUrl(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.mainFrame.frames[0]?.url ?? "");
}

function frameRect(canvas: Frame, index: number): Promise<BoardRect> {
  return canvas.evaluate((i) => {
    const rect = (document.querySelectorAll("[data-doan-frame]")[i] as HTMLElement).getBoundingClientRect();
    return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
  }, index);
}

// A canvas-started navigation, as a link inside the canvas would make it.
async function clickLink(canvas: Frame, href: string): Promise<void> {
  await canvas.evaluate((target) => {
    const link = document.createElement("a");
    link.href = target;
    document.body.append(link);
    link.click();
  }, href);
}

// Survives only until the canvas document is replaced.
async function markCanvas(page: Page): Promise<void> {
  await (await canvasFrame(page)).evaluate(() => {
    (window as { doanE2e?: boolean }).doanE2e = true;
  });
}

async function marked(page: Page): Promise<boolean> {
  return (await canvasFrame(page)).evaluate(() => (window as { doanE2e?: boolean }).doanE2e === true);
}

async function menu(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu, BrowserWindow }, name) => {
    const view = Menu.getApplicationMenu()?.items.find((item) => item.label === "View");
    const item = view?.submenu?.items.find((entry) => entry.label === name || (name === "Enter Full Screen" && entry.role === "togglefullscreen"));
    if (!item) throw new Error(`no menu item ${name}`);
    if (name === "Enter Full Screen") {
      if (item.role !== "togglefullscreen") throw new Error("Missing togglefullscreen menu role");
      // Shared desktops may keep another app focused; exercise the real transition directly.
      BrowserWindow.getAllWindows()[0]?.setFullScreen(true);
    } else item.click(item, BrowserWindow.getAllWindows()[0], undefined);
  }, label);
}

function zoomFactor(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor() ?? 0);
}

async function setWindowSize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height), { width, height });
}

async function wheelAt(page: Page, point: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(dx, dy);
}

// Board px to page px.
function toPage(view: ViewState, point: { x: number; y: number }): { x: number; y: number } {
  return { x: view.left + view.x + point.x * view.scale, y: view.top + view.y + point.y * view.scale };
}

function toBoard(view: ViewState, point: { x: number; y: number }): { x: number; y: number } {
  return { x: (point.x - view.left - view.x) / view.scale, y: (point.y - view.top - view.y) / view.scale };
}

function assertFit(view: ViewState, width: number): void {
  const scale = Math.min(1, (view.vw - 64) / width);
  assert.ok(near(view.scale, scale), `fit scale ${view.scale}, expected ${scale}`);
  assert.ok(near(view.x, (view.vw - width * scale) / 2), `fit x ${view.x}`);
  assert.ok(near(view.y, 32), `fit y ${view.y}`);
}

function assertSameView(actual: ViewState, expected: ViewState, what: string): void {
  assert.deepEqual([actual.x, actual.y, actual.scale], [expected.x, expected.y, expected.scale], what);
}

// The computed transform keeps about six significant digits.
function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-3 * Math.max(1, Math.abs(expected));
}

// The frame lies in the viewport; a tall one only needs its top inside.
function assertInside(view: ViewState, rect: BoardRect, tall: boolean): void {
  const left = view.x + rect.x * view.scale;
  const top = view.y + rect.y * view.scale;
  const right = left + rect.width * view.scale;
  const bottom = top + rect.height * view.scale;
  const slack = 0.5;
  assert.ok(left >= -slack && right <= view.vw + slack && top >= -slack && (tall || bottom <= view.vh + slack), `frame on screen: ${JSON.stringify({ left, top, right, bottom, view })}`);
  if (!tall) assert.ok(near((top + bottom) / 2, view.vh / 2), "a short frame is centered");
}

// The canvas iframe paints in its own process; right after a view change the
// screenshot can catch the board before the canvas's next frame lands.
async function settledScreenshot(page: Page, name: string): Promise<void> {
  await sleep(500);
  await screenshot(page, name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launch(cli: string, userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.DOAN_CLI = cli;
  // Chromium's --user-data-dir also moves Electron's userData, so folders.json
  // lands in the temp directory and the real one is never read or written.
  const app = await _electron.launch({ args: [appDir, `--user-data-dir=${userData}`], env });
  running = app;
  const page = await app.firstWindow();
  page.setDefaultTimeout(2000);
  assert.equal(await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")), userData);
  return { app, page };
}

async function replaceDialog(app: ElectronApplication, picked: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, picked);
}

async function recordMessageBoxes(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const messages: string[] = [];
    (globalThis as { doanMessages?: string[] }).doanMessages = messages;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.find((arg) => typeof arg === "object" && arg !== null && "message" in arg) as { detail?: string };
      messages.push(options.detail ?? "");
      return { response: 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
}

// Awaits the same call the button makes, so each open has finished (including
// its folders.json write) before the next starts.
async function openFolder(app: ElectronApplication, page: Page, picked: string): Promise<void> {
  await replaceDialog(app, picked);
  await page.evaluate(() => window.doan.openFolder());
}

const tooltipPaths = new WeakMap<Page, Map<string, string>>();

async function tooltipPath(page: Page, row: Locator, name: string, key: string): Promise<string> {
  let paths = tooltipPaths.get(page);
  if (!paths) { paths = new Map(); tooltipPaths.set(page, paths); }
  const cached = paths.get(key);
  if (cached) return cached;
  await row.getByText(name, { exact: true }).hover();
  const tooltip = page.getByRole("tooltip");
  await tooltip.waitFor({ timeout: 1000 });
  const path = (await tooltip.textContent()) ?? "";
  assert.ok(path.startsWith("/"), `absolute path tooltip: ${path}`);
  paths.set(key, path);
  await page.keyboard.press("Escape");
  await page.mouse.move(500, 100);
  await tooltip.waitFor({ state: "hidden", timeout: 1000 });
  return path;
}

async function readFolders(page: Page): Promise<FolderView[]> {
  // Serving URLs are not UI content; read them through the public subscription.
  const entries = await page.evaluate(() => new Promise<import("../src/main/view").FolderEntry[]>(resolve => {
    const stop = window.doan.onFolders(entries => { stop(); resolve(entries); });
  }));
  const projects = await page.getByRole("tree", { name: "Projects" }).getByRole("treeitem", { level: 1 }).all();
  const result: FolderView[] = [];
  for (const project of projects) {
    const name = await project.getAttribute("aria-label") ?? "";
    const path = await tooltipPath(page, project, name, name);
    const chip = (await project.getByText(/^(Error|CLI error|Not found|Not initialized)$/).allTextContents())[0] ?? "";
    const hint = (await project.getByRole("paragraph").allTextContents())[0] ?? "";
    const state = chip === "Error" ? "error" : chip === "CLI error" ? "cliError" : chip === "Not found" ? "notFound" : chip === "Not initialized" ? "uninitialized" : hint === "Reading…" ? "loading" : "list";
    const entry = entries.find(entry => entry.path === path);
    const canvases: CanvasView[] = [];
    for (const row of await project.getByRole("treeitem", { level: 2 }).all()) {
      const name = await row.getAttribute("aria-label") ?? "";
      const fullPath = await tooltipPath(page, row, name, `${path}/${name}`);
      const canvas = fullPath.slice(path.length + 1);
      const count = row.getByRole("img", { name: /^\d+ open comments$/ });
      const open = await count.getAttribute("aria-label") ?? "";
      const countText = await count.textContent() ?? "";
      const text = await row.evaluate(node => {
        const content = node.cloneNode(true) as HTMLElement;
        // Decorative glyph text would shift the title slice.
        content.querySelectorAll('[aria-hidden="true"]').forEach(icon => icon.remove());
        return content.textContent ?? "";
      });
      const title = text.slice(name.length, text.length - countText.length).trim();
      canvases.push({ path: canvas, title, open, url: entry?.kind === "list" ? entry.canvases.find(row => row.path === canvas)?.url ?? "" : "" });
    }
    result.push({ path, state, status: state === "error" ? hint : chip, hint, canvases });
  }
  return result;
}

async function waitFolders(page: Page, done: (folders: FolderView[]) => boolean, what: string): Promise<FolderView[]> {
  let last: FolderView[] = [];
  await waitFor(async () => done((last = await readFolders(page))), what, () => JSON.stringify(last, null, 2));
  return last;
}

async function waitFor(check: () => Promise<boolean>, what: string, detail: () => string = () => ""): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  let lastError: unknown;
  for (;;) {
    try {
      // A check that never settles (a stuck renderer, a frame mid-navigation)
      // must not outlive the deadline.
      if (await Promise.race([check(), sleep(Math.max(0, deadline - Date.now())).then(() => false)])) return;
    } catch (error) {
      lastError = error;
      // Not there yet (file not written, window reloading); retry until the deadline.
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}\n${detail()}\n${String(lastError ?? "")}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function byPath(folders: FolderView[], path: string): FolderView {
  const folder = folders.find((f) => f.path === path);
  assert.ok(folder, `folder ${path} is shown`);
  return folder;
}

function hasCanvas(folders: FolderView[], path: string, canvas: string): boolean {
  return folders.some((f) => f.path === path && f.canvases.some((c) => c.path === canvas));
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await mkdir(shotDir, { recursive: true });
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path });
  shots.push(path);
}

async function fingerprint(file: string): Promise<string> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return "absent";
  }
}

main().then(
  () => {
    console.log("runtime-test: PASS");
    for (const path of shots) console.log(`screenshot: ${path}`);
  },
  (error: unknown) => {
    console.error("runtime-test: FAIL");
    console.error(error);
    for (const path of shots) console.error(`screenshot: ${path}`);
    process.exitCode = 1;
  },
);
