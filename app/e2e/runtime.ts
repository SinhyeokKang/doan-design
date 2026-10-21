// Runtime smoke for the app shell (/runtime-test). Drives the built app with
// Playwright `_electron`: opens temp repos through a replaced folder dialog,
// reads the window's DOM, fetches over the local server, restarts, and saves
// screenshots. Run with `npm --prefix app run e2e` (builds first).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";

const exec = promisify(execFile);
const appDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const realFoldersJson = join(homedir(), "Library", "Application Support", "doan", "folders.json");
const shotDir = join(repoRoot, ".scratch", "runtime-test", new Date().toISOString().replace(/[:.]/g, "-"));
const WAIT_MS = 10_000;

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

async function main(): Promise<void> {
  const before = await fingerprint(realFoldersJson);
  // realpath: macOS tmpdir is under /var -> /private/var, and the app stores real paths.
  const work = await realpath(await mkdtemp(join(tmpdir(), "doan-e2e-")));
  try {
    const cli = join(work, "bin", "doan");
    await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: repoRoot });
    const repos = await makeRepos(join(work, "repos"), cli);
    await run(cli, join(work, "userData"), repos);
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

  return { ok, worktree, broken, brokenMessage, brokenSub: join(broken, "design"), brokenDoanOnly: join(broken, "notes"), plain, sub: join(ok, "design", "sub"), link };
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
    await replaceDialog(app, repos.ok);
    await page.click("#open-folder");
    await waitFolders(page, (folders) => folders.some((f) => f.path === repos.ok && f.state === "list"), "ok repo listed after the button");
    for (const picked of [repos.broken, repos.plain, repos.sub, repos.link, repos.worktree]) {
      await openFolder(app, page, picked);
    }
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
      { path: "design/Zeta.html", title: "Zeta", open: "열린 코멘트 0", url: "" },
      { path: "design/bare.html", title: "", open: "열린 코멘트 0", url: "" },
      { path: "design/deep.html", title: "", open: "열린 코멘트 0", url: "" },
      { path: "design/foo-bar.html", title: "Foo bar", open: "열린 코멘트 0", url: "" },
      { path: "design/foo.html", title: "Foo", open: "열린 코멘트 0", url: "" },
      { path: "design/login.html", title: "Login screen", open: "열린 코멘트 1", url: "" },
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
    assert.equal(plain.status, "초기화되지 않음");
    assert.match(plain.hint, /doan init/);
    await screenshot(page, "1-opened");

    // 3. Watching: a new canvas shows up; a deleted folder becomes "not found";
    // opening it again after it comes back watches it again.
    await writeFile(join(repos.ok, "design", "added.html"), "<!doctype html><title>Added</title>\n");
    await waitFolders(page, (all) => hasCanvas(all, repos.ok, "design/added.html"), "added canvas listed");
    await rm(repos.worktree, { recursive: true, force: true });
    folders = await waitFolders(page, (all) => all.some((f) => f.path === repos.worktree && f.state === "notFound"), "deleted folder not found");
    assert.equal(byPath(folders, repos.worktree).status, "폴더를 찾을 수 없음");
    assert.equal(byPath(folders, repos.ok).state, "list");
    await cp(repos.ok, repos.worktree, { recursive: true });
    await openFolder(app, page, repos.worktree);
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
    await page.click(`section.folder[data-path="${repos.broken}"] button.close`);
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
  } catch (error) {
    await screenshot(page, "failure").catch(() => {});
    throw error;
  } finally {
    await app.close().catch(() => {});
  }
}

async function launch(cli: string, userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.DOAN_CLI = cli;
  // Chromium's --user-data-dir also moves Electron's userData, so folders.json
  // lands in the temp directory and the real one is never read or written.
  const app = await _electron.launch({ args: [appDir, `--user-data-dir=${userData}`], env });
  const page = await app.firstWindow();
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

function readFolders(page: Page): Promise<FolderView[]> {
  return page.$$eval("section.folder", (sections) =>
    sections.map((node) => {
      const section = node as HTMLElement;
      return {
        path: section.dataset.path ?? "",
        state: section.dataset.state ?? "",
        status: section.querySelector(".folder-status")?.textContent ?? "",
        hint: section.querySelector(".folder-hint")?.textContent ?? "",
        canvases: [...section.querySelectorAll("li.canvas")].map((item) => {
          const li = item as HTMLElement;
          return {
            path: li.dataset.path ?? "",
            title: li.querySelector(".canvas-title")?.textContent ?? "",
            open: li.querySelector(".canvas-open")?.textContent ?? "",
            url: li.dataset.url ?? "",
          };
        }),
      };
    }),
  );
}

async function waitFolders(page: Page, done: (folders: FolderView[]) => boolean, what: string): Promise<FolderView[]> {
  let last: FolderView[] = [];
  await waitFor(async () => done((last = await readFolders(page))), what, () => JSON.stringify(last, null, 2));
  return last;
}

async function waitFor(check: () => Promise<boolean>, what: string, detail: () => string = () => ""): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // Not there yet (file not written, window reloading); retry until the deadline.
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}\n${detail()}`);
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
