// design-nav task 5: thumbnails captured in the hidden window, through the
// real IPC, with the cache on disk, the 8 s rule and the window lifecycle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow, appWindowCount }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
type Reply = import("../src/main/thumbnails").ThumbnailReply;

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-thumbs-"));
const shots = join(root, ".scratch/runtime-test", `thumbnails-${Date.now()}`);
let app: ElectronApplication | undefined;
let hanging: Server | undefined;
const key = (repo: string, path: string) => createHash("sha256").update(`${repo}\n${path}`).digest("hex");
const pngSize = (bytes: Uint8Array) => { const view = Buffer.from(bytes); assert.equal(view.subarray(1, 4).toString(), "PNG"); return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) }; };
const canvas = (title: string, width: number | null, body: string) =>
  `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${title.toLowerCase()}">${width === null ? "" : `<meta name="doan:width" content="${width}">`}<link rel="stylesheet" href="../styles/tokens.css"><style>body{margin:0}</style><section data-doan-frame="hero" data-doan-title="Hero">${body}</section>`;

try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell"), repo = join(work, "repo");
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  // An image that never finishes keeps the canvas `load` pending forever.
  hanging = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "image/png" }); response.write(Buffer.from([137, 80, 78, 71])); });
  await new Promise<void>((resolve) => hanging!.listen(0, "127.0.0.1", resolve));
  const hangPort = (hanging.address() as { port: number }).port;
  await mkdir(join(repo, ".doan"), { recursive: true }); await mkdir(join(repo, "design")); await mkdir(join(repo, "styles"));
  await writeFile(join(repo, ".doan/config.json"), '{"v":1,"tokenCss":"styles/tokens.css"}');
  await writeFile(join(repo, "styles/tokens.css"), "section{background:#2050a0;height:500px}");
  await writeFile(join(repo, "design/a.html"), canvas("Alpha", 800, "<h1>Alpha</h1>"));
  await writeFile(join(repo, "design/nowidth.html"), canvas("Nowidth", null, "<h1>No width</h1>"));
  await writeFile(join(repo, "design/hang.html"), canvas("Hang", 640, `<img src="http://127.0.0.1:${hangPort}/never">`));
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo]));
  // Left from an earlier launch: an orphaned entry and a temp file go, a foreign file stays.
  const cache = join(userData, "thumbnails"), orphan = key("/gone", "design/a.html");
  await mkdir(cache);
  for (const name of [`${orphan}.png`, `${orphan}.json`, `${orphan}.png.abc.tmp`, "notes.txt"]) await writeFile(join(cache, name), "x");

  const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env });
  const page: Page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  page.on("pageerror", error => console.error("thumbnails pageerror", error));
  async function wait(check: () => Promise<boolean>, name: string, ms = 10_000) {
    const end = Date.now() + ms;
    let lastError: unknown;
    for (;;) {
      try { if (await check()) return; } catch (error) { lastError = error; }
      if (Date.now() >= end) throw lastError ?? new Error(`Timed out waiting for ${name}`);
      await page.waitForTimeout(25);
    }
  }
  // Changes are collected in the page from the first moment, so none is missed between calls.
  await page.evaluate(() => { const seen: string[] = []; Reflect.set(window, "thumbChanges", seen); window.doan.onThumbnailChanged(({ path }) => seen.push(path)); });
  const changes = () => page.evaluate(() => [...(Reflect.get(window, "thumbChanges") as string[])]);
  const get = (path: string, visible = true) => page.evaluate(([root, path, visible]) => window.doan.getThumbnail(root, path, visible), [repo, path, visible] as const) as Promise<Reply>;
  async function captured(path: string, ms = 10_000): Promise<Uint8Array> {
    const before = (await changes()).filter(changed => changed === path).length;
    const first = await get(path);
    if (first.kind === "ready") return first.png;
    assert.equal(first.kind, "pending", `${path} is queued`);
    await wait(async () => (await changes()).filter(changed => changed === path).length > before, `${path} captured`, ms);
    const reply = await get(path);
    assert.equal(reply.kind, "ready", `${path} ready after its change`);
    return reply.kind === "ready" ? reply.png : new Uint8Array();
  }
  async function staleAfter(path: string, edit: () => Promise<void>, name: string) {
    const before = (await changes()).filter(changed => changed === path).length;
    await edit();
    await wait(async () => (await changes()).filter(changed => changed === path).length > before, name);
  }

  await page.evaluate(() => new Promise<void>((resolve) => { const stop = window.doan.onFolders((entries) => { if (entries[0]?.kind === "list") { stop(); resolve(); } }); }));
  assert.equal(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content"), "default-src 'self'; frame-src http://127.0.0.1:*; img-src 'self' blob:");
  await wait(async () => (await readdir(cache)).join() === "notes.txt", "startup cleanup of orphaned and temp cache files");
  assert.equal(await appWindowCount(app), 1);

  // First capture: PNG + meta in userData, 480 px wide at 16:10.
  const first = await captured("design/a.html");
  assert.deepEqual(pngSize(first), { width: 480, height: 300 });
  const files = { png: join(cache, `${key(repo, "design/a.html")}.png`), json: join(cache, `${key(repo, "design/a.html")}.json`) };
  assert.deepEqual(new Uint8Array(await readFile(files.png)), first);
  const canvasStat = await stat(join(repo, "design/a.html"));
  const meta = JSON.parse(await readFile(files.json, "utf8"));
  assert.deepEqual({ mtimeMs: meta.mtimeMs, size: meta.size, appVersion: meta.appVersion }, { mtimeMs: canvasStat.mtimeMs, size: canvasStat.size, appVersion: await app.evaluate(({ app }) => app.getVersion()) });
  assert.match(meta.tokens, /^[0-9a-f]{64}$/);
  await writeFile(join(shots, "a-first.png"), first); console.log(`thumbnails screenshot: ${join(shots, "a-first.png")}`);
  // The renderer can show it as a blob: image under its CSP.
  assert.equal(await page.evaluate(async (bytes) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const image = new Image(); image.src = url; await image.decode(); URL.revokeObjectURL(url); return image.naturalWidth;
  }, [...first]), 480);
  assert.equal((await get("design/a.html")).kind, "ready", "a fresh cache entry is served without a capture");

  // The capture window: hidden, a data: host, not an app window.
  const capture = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().startsWith("data:")).map(window => ({ visible: window.isVisible(), frames: window.webContents.mainFrame.frames.map(frame => frame.frameTreeNodeId) })));
  assert.equal(capture.length, 1); assert.equal(capture[0]!.visible, false);
  assert.equal(await appWindowCount(app), 1);
  const firstFrame = capture[0]!.frames[0];

  // A canvas edit makes it stale; the new capture has a new iframe and a new file.
  await staleAfter("design/a.html", () => writeFile(join(repo, "design/a.html"), canvas("Alpha", 800, "<h1>Alpha edited</h1><p>changed body</p>")), "canvas edit marks the thumbnail stale");
  const second = await captured("design/a.html");
  assert.notDeepEqual(second, first, "edited canvas gives a different image");
  assert.deepEqual(new Uint8Array(await readFile(files.png)), second);
  assert.equal(JSON.parse(await readFile(files.json, "utf8")).mtimeMs, (await stat(join(repo, "design/a.html"))).mtimeMs);
  const secondFrame = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith("data:"))?.webContents.mainFrame.frames[0]?.frameTreeNodeId);
  assert.notEqual(secondFrame, firstFrame, "every capture uses a fresh iframe");

  // Token CSS restyles the folder: the thumbnail goes stale although the canvas did not change.
  await staleAfter("design/a.html", () => writeFile(join(repo, "styles/tokens.css"), "section{background:#a02050;height:500px}"), "token CSS change marks the thumbnail stale");
  const third = await captured("design/a.html");
  assert.notDeepEqual(third, second, "token change gives a different image");

  // No doan:width: never captured.
  assert.deepEqual(await get("design/nowidth.html"), { kind: "unavailable" });

  // A canvas whose load never ends is captured as painted at 8 s.
  const started = Date.now();
  const hung = await captured("design/hang.html", 20_000);
  const elapsed = Date.now() - started;
  assert.deepEqual(pngSize(hung), { width: 480, height: 300 });
  assert.ok(elapsed >= 7_500, `never-load canvas waited for the 8 s rule (${elapsed} ms)`);
  console.log(`thumbnails: never-load captured after ${elapsed} ms`);

  // The capture window stays out of the app window's lifecycle, and a hidden
  // app window pauses the queue.
  const win = await appWindow(app, page);
  await win.evaluate(window => window.close());
  await wait(async () => !await win.evaluate(window => window.isVisible()), "Close Window hides the app window");
  await staleAfter("design/a.html", () => writeFile(join(repo, "design/a.html"), canvas("Alpha", 800, "<h1>While hidden</h1>")), "edit while hidden is noticed");
  assert.equal((await get("design/a.html")).kind, "pending");
  const changedWhileHidden = (await changes()).length;
  await page.waitForTimeout(2_000);
  assert.equal((await changes()).length, changedWhileHidden, "nothing is captured while the app window is hidden");
  assert.notEqual(JSON.parse(await readFile(files.json, "utf8")).mtimeMs, (await stat(join(repo, "design/a.html"))).mtimeMs, "the cache still holds the pre-hide capture");
  await app.evaluate(({ app }) => app.emit("activate"));
  await wait(() => win.evaluate(window => window.isVisible()), "activate shows the app window");
  await wait(async () => (await changes()).length > changedWhileHidden, "capture resumes once shown");
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).length), 1, "only the app window is visible");
  assert.equal(await appWindowCount(app), 1);

  // ⌘H and doan › Hide (the `hide` role item sends `hide:`) hide the whole
  // app without the window's close handler; the queue pauses for that too.
  await app.evaluate(({ Menu }) => Menu.sendActionToFirstResponder("hide:"));
  await wait(() => app!.evaluate(({ app }) => app.isHidden()), "the app is hidden");
  await staleAfter("design/a.html", () => writeFile(join(repo, "design/a.html"), canvas("Alpha", 800, "<h1>While the app is hidden</h1>")), "edit while the app is hidden is noticed");
  assert.equal((await get("design/a.html")).kind, "pending");
  const changedWhileAppHidden = (await changes()).length;
  await page.waitForTimeout(2_000);
  assert.equal((await changes()).length, changedWhileAppHidden, "nothing is captured while the app is hidden");
  await app.evaluate(({ app }) => app.show());
  await wait(async () => !await app!.evaluate(({ app }) => app.isHidden()), "the app is shown again");
  await wait(async () => (await changes()).length > changedWhileAppHidden, "capture resumes once the app is shown");

  // The last ui-state save survives an immediate quit (flushed on will-quit).
  const state = { screen: "workspace" as const, root: repo, canvas: "design/a.html", view: { scale: 1, x: 0, y: 0 }, expanded: {}, lastByRoot: {} };
  assert.equal(await page.evaluate((state) => window.doan.saveUiState(state), state), true);

  // Removing the project removes its cache files.
  assert.equal((await page.evaluate((root) => window.doan.removeProjects([root]), repo)).kind, "removed");
  await wait(async () => (await readdir(cache)).join() === "notes.txt", "removed project's cache files are deleted");

  await app.close(); app = undefined;
  assert.deepEqual(JSON.parse(await readFile(join(userData, "ui-state.json"), "utf8")), state, "the last save is on disk after quit");
  console.log("thumbnails: PASS");
} catch (error) {
  console.error(error);
  if (app) { const page = await app.firstWindow(); await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); console.error(`thumbnails screenshot: ${join(shots, "failure.png")}`); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
  throw error;
} finally {
  try { hanging?.closeAllConnections(); hanging?.close(); await app?.close(); await rm(work, { recursive: true, force: true }); } finally { await assertRealState(beforeRealState); }
}
