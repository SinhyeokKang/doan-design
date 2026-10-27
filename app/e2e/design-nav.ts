// design-nav tasks 8–10: the Overview (cards by folder, thumbnail states, the
// empty state, a removed canvas, visible cards first), Quick Open (menu on Home
// and in a workspace, another worktree through the draft guard, duplicate ids,
// a frame missing from the rendered canvas, Escape) and restore across real
// relaunches. Its own temp repos, userData and HOME.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { openOverview, canvasTitle: renderedCanvasTitle, canvasRow, jumpFrame, selectFrame }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { enterProject, goHome }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-design-nav-"));
const shots = join(root, ".scratch/runtime-test", `design-nav-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
// A passing run takes about a minute; this only ends a run that hangs.
const guard = suiteGuard({ name: "design-nav", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: () => rm(work, { recursive: true, force: true }), timeoutMs: 240_000 });

const canvas = (id: string, title: string, width: number | null, frames: [string, string?][], extra = "") =>
  `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${id}">${width === null ? "" : `<meta name="doan:width" content="${width}">`}<style>body{margin:0}section{height:360px;margin:40px;background:#ddd}</style>${frames.map(([frame, label]) => `<section data-doan-frame="${frame}"${label ? ` data-doan-title="${label}"` : ""}>${label ?? frame}</section>`).join("")}${extra}`;

try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell");
  const acme = join(work, "acme-web"), feat = join(work, "feat-billing"), brand = join(work, "brand-kit"), empty = join(work, "empty"), gallery = join(work, "gallery");
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  for (const repo of [acme, brand, empty, gallery]) { await mkdir(join(repo, ".doan"), { recursive: true }); await mkdir(join(repo, "design")); await writeFile(join(repo, ".doan/config.json"), '{"v":1}'); }
  await mkdir(join(acme, "design/settings")); await mkdir(join(acme, "design/misc")); await mkdir(join(brand, "design/research"));
  await writeFile(join(acme, "design/tokens.html"), canvas("tokens", "Design tokens", null, [["swatch"]]));
  await writeFile(join(acme, "design/settings/billing.html"), canvas("billing", "Billing & plans", 800, [["plans", "Plans"], ["upgrade", "Upgrade"], ["card-form", "Card form"], ["card-declined", "Card declined"], ["invoice-sent", "Invoice sent"]]));
  await writeFile(join(acme, "design/settings/dupes.html"), canvas("dupes", "Duplicates", 800, [["dup", "First dup"], ["dup", "Second dup"]]));
  // `doan ls` reads the frame statically; the canvas's own script removes it before layout.
  await writeFile(join(acme, "design/settings/ghost.html"), canvas("ghost", "Ghost", 800, [["intro", "Intro"], ["ghost", "Ghost frame"]], "<script>document.querySelector('[data-doan-frame=ghost]').remove()</script>"));
  await writeFile(join(acme, "design/misc/notes.html"), canvas("notes", "Notes", 800, [["one"], [""]]));
  await writeFile(join(brand, "design/research/card-decline-patterns.html"), canvas("patterns", "Card decline patterns", 800, [["grid"]]));
  for (let index = 1; index <= 24; index++) { const name = String(index).padStart(2, "0"); await writeFile(join(gallery, `design/g${name}.html`), canvas(`g${name}`, `Gallery ${name}`, 800, [["hero"]], `<h1 style="font:80px sans-serif">${name}</h1>`)); }
  await exec("git", ["init", "-q", "-b", "main", acme]);
  await exec("git", ["-C", acme, "config", "user.name", "Nav Author"]); await exec("git", ["-C", acme, "config", "user.email", "nav@example.test"]);
  await exec("git", ["-C", acme, "add", "."]); await exec("git", ["-C", acme, "commit", "-q", "-m", "fixture"]);
  await exec("git", ["-C", acme, "worktree", "add", "-q", "-b", "feat-billing", feat]);
  await writeFile(join(userData, "folders.json"), JSON.stringify([acme, feat, brand, empty, gallery]));
  const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };

  const folderGate = join(work, "initial-folders.gate"), gatedCli = join(work, "gated-cli.mjs");
  await writeFile(gatedCli, `#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
while (existsSync(${JSON.stringify(folderGate)})) await new Promise(resolve => setTimeout(resolve, 20));
const result = spawnSync(${JSON.stringify(cli)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  let traceRestore = false;
  let stateBeforeLaunch = "";
  const stateVersion = async () => { const info = await stat(join(userData, "ui-state.json")).catch(() => null); return info ? `${info.ino}:${info.mtimeMs}` : "absent"; };
  async function launch(delayFolders = false): Promise<void> {
    stateBeforeLaunch = await stateVersion();
    if (delayFolders) await writeFile(folderGate, "held");
    app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env: { ...env, DOAN_CLI: delayFolders ? gatedCli : cli } }); rememberApp(app);
    page = await app.firstWindow(); page.setDefaultTimeout(10_000);
    if (traceRestore) {
      console.log("normal restore trace attached", page.frames().map(frame => frame.url()));
      page.on("framenavigated", frame => console.log("normal restore frame navigation", frame.url()));
      page.on("requestfailed", request => console.log("normal restore request failed", request.url(), request.failure()));
      page.on("response", response => console.log("normal restore response", response.status(), response.url()));
      await page.evaluate(() => {
        addEventListener("message", event => {
          if (event.data?.type === "layout") console.log("normal restore layout", JSON.stringify({ href: event.data.href, document: event.data.document, viewport: event.data.viewport, frames: event.data.frames?.length, current: event.source === document.querySelector<HTMLIFrameElement>(".board iframe")?.contentWindow }));
        });
      });
      page.on("console", message => { if (message.text().startsWith("normal restore layout")) console.log(message.text()); });
    }
    page.on("pageerror", error => console.error("design-nav pageerror", error));
    if (delayFolders) {
      await page.getByRole("region", { name: "Home", exact: true }).waitFor();
      await page.waitForTimeout(750);
      await rm(folderGate);
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { stop(); reject(new Error("Initial folder results never reached the renderer")); }, 10_000);
        const stop = window.doan.onFolders(entries => {
          if (entries.length && entries.every(entry => entry.kind !== "loading")) {
            clearTimeout(timer); stop(); requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }
        });
      }));
    }
  }
  async function quit(): Promise<void> {
    const process = app!.process();
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => process.once("exit", (code, signal) => resolve({ code, signal })));
    await closeApp(app); app = undefined;
    assert.deepEqual(await exited, { code: 0, signal: null }, "quit exits cleanly, including during thumbnail capture");
  }
  async function relaunch(delayFolders = false): Promise<void> {
    await quit();
    await launch(delayFolders);
  }
  async function wait(check: () => Promise<boolean>, name: string, ms = 10_000) {
    const end = Date.now() + ms;
    let lastError: unknown;
    for (;;) {
      try { if (await check()) return; } catch (error) { lastError = error; }
      if (Date.now() >= end) throw lastError ?? new Error(`Timed out waiting for ${name}`);
      await page.waitForTimeout(25);
    }
  }
  async function menu(label: string) {
    const window = await appWindow(app!, page);
    await wait(() => app!.evaluate(({ Menu }, [label, window]) => {
      const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label === label) return item; const child = item.submenu && find(item.submenu.items); if (child) return child; } return undefined; };
      const item = find(Menu.getApplicationMenu()!.items); if (!item?.enabled) return false;
      item.click(undefined, window, undefined); return true;
    }, [label, window] as const), `menu ${label}`);
  }
  const menuEnabled = (label: string) => app!.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label === label) return item; const child = item.submenu && find(item.submenu.items); if (child) return child; } return undefined; };
    return find(Menu.getApplicationMenu()!.items)?.enabled;
  }, label);
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`design-nav screenshot: ${path}`); };
  const overview = () => page.getByRole("region", { name: "Overview", exact: true });
  const card = (title: string) => overview().getByRole("button", { name: new RegExp(`^${title.replace(/[&()]/g, "\\$&")} `) });
  const dialog = () => page.getByRole("dialog", { name: "Quick Open", exact: true });
  const options = () => dialog().getByRole("option").allTextContents();
  const toast = (text: string) => page.locator(".toast .msg", { hasText: text }).waitFor();
  const canvasTitle = () => renderedCanvasTitle(page);
  const iframe = () => page.getByRole("region", { name: "Canvas", exact: true }).locator("iframe");
  const loaded = async (title: string) => { await wait(async () => await canvasTitle() === title && await iframe().isVisible(), `${title} shown`); };
  const frameVisible = async (index: number) => {
    const frame = await page.frameLocator(".board iframe").locator("[data-doan-frame]").nth(index).boundingBox();
    const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
    return !!frame && !!area && frame.y >= area.y && frame.y + frame.height <= area.y + area.height;
  };
  async function quickOpen(query: string): Promise<void> {
    await menu("Quick Open…");
    await dialog().waitFor();
    await page.keyboard.type(query);
  }

  await launch();
  // UX N: keep startup reads pending until a real, newer user navigation commits.
  const navigationFailures: string[] = [];
  async function navigationCheck(name: string, run: () => Promise<void>) {
    if (process.env.DOAN_NAV_CASES && !process.env.DOAN_NAV_CASES.split(",").includes(name)) return;
    try { await run(); console.log(`navigation regression PASS: ${name}`); }
    catch (error) { console.error(`navigation regression FAIL: ${name}`, error); navigationFailures.push(`${name}: ${String(error)}`); await shot(`N-failed-${name}`); }
  }
  const listedEntries = await page.evaluate(() => new Promise<import("../src/main/view").FolderEntry[]>(resolve => {
    const stop = window.doan.onFolders(entries => { if (entries.length === 5 && entries.every(entry => entry.kind === "list")) { stop(); resolve(entries); } });
  }));
  const restoreCdp = await page.context().newCDPSession(page);
  const rendererScripts: { scriptId: string; url: string }[] = [];
  restoreCdp.on("Debugger.scriptParsed", script => { if (script.url.includes("/assets/index-") && script.url.endsWith(".js")) rendererScripts.push(script); });
  await restoreCdp.send("Debugger.enable");
  const rendererScript = rendererScripts.at(-1);
  assert.ok(rendererScript, "the actual App renderer script was parsed");
  const { scriptSource } = await restoreCdp.send("Debugger.getScriptSource", { scriptId: rendererScript.scriptId });
  const readStart = scriptSource.indexOf("window.doan.readUiState()");
  assert.ok(readStart >= 0);
  const firstThen = scriptSource.indexOf(".then((state)", readStart);
  const finalThen = scriptSource.indexOf(".then((state)", firstThen + 1);
  assert.ok(finalThen > firstThen);
  // A false conditional breakpoint is a test-only logpoint in the actual
  // final consumer. The subsequent page task cannot run until it returns.
  const guarded = scriptSource.indexOf("if (active && !restoreCancelled.current)", finalThen);
  const callbackBody = guarded >= 0 && guarded < finalThen + 200 ? guarded : scriptSource.indexOf("state,", finalThen);
  assert.ok(callbackBody > finalThen && callbackBody < finalThen + 200);
  const lineNumber = scriptSource.slice(0, callbackBody).split("\n").length - 1;
  const columnNumber = callbackBody - scriptSource.lastIndexOf("\n", callbackBody) - 1;
  const consumerBreakpoint = await restoreCdp.send("Debugger.setBreakpointByUrl", {
    url: rendererScript.url, lineNumber, columnNumber,
    condition: '(globalThis.restoreReadProbe ??= { consumed: 0 }).consumed++, false',
  });
  assert.ok(consumerBreakpoint.locations.length, "the consumer logpoint resolves in the production bundle");
  console.log("startup read consumer logpoint", { lineNumber, columnNumber, source: scriptSource.split("\n")[lineNumber] });
  for (const held of ["ui", "folders"] as const) {
    if (process.env.DOAN_NAV_CASES && !process.env.DOAN_NAV_CASES.split(",").includes(`late-${held}-restore`)) continue;
    await navigationCheck(`late-${held}-restore`, async () => {
      await app!.evaluate(({ ipcMain }, [entries, savedRoot, freshRoot, held]) => {
        const handlers = Reflect.get(ipcMain, "_invokeHandlers");
        const probe = { ui: handlers.get("ui-state:get"), folders: handlers.get("folders:get"), releases: [] as (() => void)[], reads: 0 };
        Reflect.set(globalThis, "navigationProbe", probe);
        const saved = { screen: "workspace", root: savedRoot, expanded: { [savedRoot]: ["design/settings"], [freshRoot]: [] }, lastByRoot: { [freshRoot]: { canvas: "design/stale.html", view: { scale: 1, tx: 0, ty: 0 } } } };
        ipcMain.removeHandler("ui-state:get");
        ipcMain.handle("ui-state:get", () => { probe.reads++; return held === "ui" ? new Promise(resolve => probe.releases.push(() => resolve(saved))) : saved; });
        ipcMain.removeHandler("folders:get");
        ipcMain.handle("folders:get", () => held === "folders" ? entries.map(entry => entry.path === savedRoot ? { path: entry.path, kind: "loading" } : entry) : entries);
      }, [listedEntries, acme, brand, held] as const);
      await page.reload();
      await page.getByRole("region", { name: "Home", exact: true }).waitFor();
      await enterProject(page, brand, app!); await overview().waitFor();
      await card("Card decline patterns").click(); await loaded("Card decline patterns");
      await goHome(page, app!); await page.getByRole("region", { name: "Home", exact: true }).waitFor();
      if (held === "folders") await page.evaluate(root => {
        const element = document.querySelector(".home-shell");
        if (!element) throw new Error("Home must be committed before arming the folder consumer probe");
        const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
        if (!key) throw new Error("Missing App fiber");
        type Hook = { memoizedState?: { current?: { updateEntries?: (entries: { path: string; kind: string }[]) => void } }; next?: Hook };
        type Fiber = { memoizedState?: Hook; return?: Fiber };
        let controller: { updateEntries: (entries: { path: string; kind: string }[]) => void } | undefined;
        for (let fiber = Reflect.get(element, key) as Fiber | undefined; fiber; fiber = fiber.return) {
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            const candidate = hook.memoizedState?.current;
            if (typeof candidate?.updateEntries === "function") controller = candidate as typeof controller;
          }
        }
        if (!controller) throw new Error("Missing actual CanvasController");
        const original = controller.updateEntries;
        const probe = { consumed: 0, restore: () => { controller.updateEntries = original; } };
        Reflect.set(window, "restoreFolderProbe", probe);
        controller.updateEntries = function (entries) {
          original.call(this, entries);
          if (entries.some(entry => entry.path === root && entry.kind === "list")) probe.consumed++;
        };
      }, acme);
      const expectedReads = await app!.evaluate(({ BrowserWindow }, [entries, held]) => {
        const probe = Reflect.get(globalThis, "navigationProbe");
        if (!probe.reads) throw new Error("No initial ui read was held");
        if (held === "ui") probe.releases.splice(0).forEach((release: () => void) => release());
        else BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries);
        return probe.reads;
      }, [listedEntries, held] as const);
      await page.waitForFunction(([held, expected]) => Reflect.get(window, held === "ui" ? "restoreReadProbe" : "restoreFolderProbe")?.consumed >= (held === "ui" ? expected : 1), [held, expectedReads] as const);
      console.log("startup consumer completed", held, await page.evaluate(held => Reflect.get(window, held === "ui" ? "restoreReadProbe" : "restoreFolderProbe").consumed, held));
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true, "late startup restore cannot replace newer Home intent");
      await enterProject(page, brand, app!); await loaded("Card decline patterns");
      assert.equal(await canvasTitle(), "Card decline patterns", "new navigation memory survives restore");
      assert.equal(await page.getByRole("treeitem", { name: "brand-kit", exact: true }).getAttribute("aria-expanded"), "true", "viewed project expansion survives restore");
    });
    await app!.evaluate(({ ipcMain }) => {
      const probe = Reflect.get(globalThis, "navigationProbe");
      ipcMain.removeHandler("ui-state:get"); ipcMain.handle("ui-state:get", probe.ui);
      ipcMain.removeHandler("folders:get"); ipcMain.handle("folders:get", probe.folders);
    });
  }
  await restoreCdp.send("Debugger.removeBreakpoint", { breakpointId: consumerBreakpoint.breakpointId });
  await restoreCdp.send("Debugger.disable");
  await restoreCdp.detach();
  await page.reload();
  await navigationCheck("unhealthy-overview", async () => {
    await goHome(page, app!); await enterProject(page, empty, app!); await overview().waitFor();
    const problems: import("../src/main/view").FolderEntry[] = [
      { path: empty, kind: "loading" }, { path: empty, kind: "error", message: "fixture config failure" },
      { path: empty, kind: "notFound" }, { path: empty, kind: "uninitialized" }, { path: empty, kind: "cliError", reason: "fixture CLI failure" },
    ];
    for (const problem of problems) {
      await app!.evaluate(({ BrowserWindow }, [entries, problem]) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries.map(entry => entry.path === problem.path ? problem : entry)), [listedEntries, problem] as const);
      await page.getByRole("region", { name: "Project status", exact: true }).waitFor();
      await wait(async () => !(await overview().isVisible()), `${problem.kind} replaces Overview`);
      assert.equal(await page.getByText("Pick a canvas from the list", { exact: true }).isVisible(), false);
      const message = await page.locator(".canvas-status").textContent();
      console.log("unhealthy Overview", problem.kind, message);
      assert.ok(message?.trim());
      if (problem.kind === "cliError") await shot("N-unhealthy-overview");
      await app!.evaluate(({ BrowserWindow }, entries) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries), listedEntries);
      await overview().waitFor();
    }
  });
  await app!.evaluate(({ BrowserWindow }, entries) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries), listedEntries);
  const publishEntries = async (entries: import("../src/main/view").FolderEntry[]) => app!.evaluate(({ BrowserWindow }, entries) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries), entries);
  const publishAdded = async (paths: string[]) => app!.evaluate(({ BrowserWindow }, paths) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders:add-outcome", { added: paths, duplicate: null, messages: [], scanId: null, confirms: [] }), paths);
  const activeFocus = () => page.evaluate(() => {
    const node = document.activeElement;
    return { tag: node?.tagName, text: node?.textContent?.slice(0, 120), label: node?.getAttribute("aria-label"), hidden: !!node?.closest('[inert], [aria-hidden="true"]'), rect: node?.getBoundingClientRect().toJSON() };
  });
  for (const loading of [false, true]) await navigationCheck(`added-problem-${loading ? "delayed" : "immediate"}`, async () => {
    await publishEntries(listedEntries); await goHome(page, app!); await enterProject(page, brand, app!);
    const path = join(work, "added-problem");
    await publishEntries([...listedEntries, { kind: loading ? "loading" : "uninitialized", path }]);
    await publishAdded([path]);
    await page.locator(".toast").getByRole("button", { name: "Open", exact: true }).click();
    if (loading) await publishEntries([...listedEntries, { kind: "uninitialized", path }]);
    await page.getByRole("region", { name: "Home", exact: true }).waitFor();
    const row = page.locator(`.home-body [data-path="${path}"]`);
    assert.equal(await row.evaluate(node => !!node.closest(".card.flash")), true, "problem Added target is highlighted on Home");
    await row.getByRole("button", { name: "Set Up…", exact: true }).waitFor();
    await shot(`N-added-problem-${loading}`);
  });
  await publishEntries(listedEntries);
  await navigationCheck("multiple-added-count", async () => {
    await goHome(page, app!); await enterProject(page, brand, app!);
    await publishAdded([acme, empty]);
    await page.locator(".toast .msg").getByText("Added 2 projects", { exact: true }).waitFor();
    await page.locator(".toast").getByRole("button", { name: "Open", exact: true }).click();
    await overview().waitFor();
    assert.equal(await page.getByRole("button", { name: "empty menu", exact: true }).count(), 1);
  });
  await navigationCheck("quick-open-native-focus", async () => {
    await goHome(page, app!); await enterProject(page, brand, app!);
    const origin = page.getByRole("button", { name: "brand-kit menu", exact: true });
    await origin.focus(); await quickOpen(""); await page.keyboard.press("Escape");
    assert.equal(await origin.evaluate(node => node === document.activeElement), true, "native close keeps a valid origin");
    console.log("Quick Open native close focus", await activeFocus());
  });
  await navigationCheck("workspace-setup-close-focus", async () => {
    await goHome(page, app!); await enterProject(page, empty, app!);
    await rm(join(empty, ".doan/config.json"));
    const status = page.getByRole("region", { name: "Project status", exact: true });
    await status.getByRole("button", { name: "Set Up…", exact: true }).click();
    const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true });
    await setup.waitFor(); await page.keyboard.press("Escape"); await setup.waitFor({ state: "hidden" });
    console.log("workspace setup close focus", await activeFocus());
    assert.equal(await status.getByRole("button", { name: "Set Up…", exact: true }).evaluate(node => node === document.activeElement), true);
    await status.getByRole("button", { name: "Set Up…", exact: true }).click(); await setup.waitFor();
    await writeFile(join(empty, ".doan/config.json"), '{"v":1}');
    await setup.waitFor({ state: "hidden" }); await overview().waitFor();
    console.log("workspace external setup focus", await activeFocus());
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.workspace') && !document.activeElement?.closest('[inert]')), true);
    await shot("N-workspace-setup-focus");
  });
  await writeFile(join(empty, ".doan/config.json"), '{"v":1}');
  await publishEntries(listedEntries);
  await navigationCheck("focused-toast-replacement", async () => {
    await goHome(page, app!); await enterProject(page, brand, app!);
    const origin = page.getByRole("button", { name: "brand-kit menu", exact: true });
    await origin.focus(); await publishAdded([acme]);
    await page.locator(".toast button").focus();
    await publishAdded([empty]);
    await page.locator(".toast .msg").getByText("Added empty", { exact: true }).waitFor();
    console.log("focused toast replacement", await activeFocus());
    assert.equal(await origin.evaluate(node => node === document.activeElement), true);
    await origin.focus(); await publishAdded([acme]);
    assert.equal(await origin.evaluate(node => node === document.activeElement), true, "an unfocused toast does not move focus");
  });
  await navigationCheck("modal-toast-replacement-focus", async () => {
    await goHome(page, app!); await enterProject(page, brand, app!);
    await page.getByRole("button", { name: "brand-kit menu", exact: true }).focus();
    await publishAdded([acme]); await page.locator(".toast button").focus();
    await quickOpen("");
    await publishAdded([empty]);
    const input = dialog().getByRole("combobox");
    assert.equal(await input.evaluate(node => node === document.activeElement), true, "replacement cannot steal modal focus");
    await page.keyboard.press("Escape"); await dialog().waitFor({ state: "hidden" });
    console.log("removed Quick Open origin focus", await activeFocus());
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest(".workspace") && !document.activeElement?.closest("[inert]")), true, "a removed origin falls back to the current visible screen");
  });
  await navigationCheck("modal-toast-remaining-time", async () => {
    await goHome(page, app!); await enterProject(page, brand, app!);
    await page.mouse.move(5, 5);
    await page.getByRole("button", { name: "brand-kit menu", exact: true }).focus();
    await publishAdded([acme]); await page.locator(".toast").waitFor();
    const born = performance.now();
    await page.waitForTimeout(2500);
    await quickOpen("");
    const paused = performance.now();
    await page.waitForTimeout(8500);
    assert.equal(await page.locator(".toast").count(), 1, "modal preserves an inaccessible toast beyond eight seconds");
    await page.keyboard.press("Escape");
    const resumed = performance.now();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(".toast").count(), 1, "resume retains usable time");
    const deadline = resumed + 8000 - (paused - born) + 700;
    await page.locator(".toast").waitFor({ state: "hidden", timeout: Math.max(1, deadline - performance.now()) });
    console.log("modal toast clock", { beforePause: paused - born, pausedFor: resumed - paused, expiredAfterResume: performance.now() - resumed });
  });
  if (await dialog().isVisible()) await page.keyboard.press("Escape");
  await navigationCheck("workspace-retry-focus", async () => {
    await publishEntries(listedEntries); await goHome(page, app!); await enterProject(page, empty, app!); await overview().waitFor();
    await app!.evaluate(({ ipcMain }) => {
      Reflect.set(globalThis, "retryOriginal", Reflect.get(ipcMain, "_invokeHandlers").get("folders:reopen"));
      ipcMain.removeHandler("folders:reopen"); ipcMain.handle("folders:reopen", () => {});
    });
    try {
      await publishEntries(listedEntries.map(entry => entry.path === empty ? { path: empty, kind: "cliError", reason: "fixture" } : entry));
      const retry = page.getByRole("region", { name: "Project status", exact: true }).getByRole("button", { name: "Retry", exact: true });
      await retry.focus(); await page.keyboard.press("Enter");
      await publishEntries(listedEntries); await overview().waitFor();
      console.log("Retry replaced focus", await activeFocus());
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.workspace') && document.activeElement !== document.body), true);
      await publishEntries(listedEntries.map(entry => entry.path === empty ? { path: empty, kind: "cliError", reason: "fixture" } : entry));
      await retry.focus(); await page.keyboard.press("Enter");
      const destination = page.getByRole("button", { name: "empty menu", exact: true });
      await destination.focus(); await publishEntries(listedEntries); await overview().waitFor();
      assert.equal(await destination.evaluate(node => node === document.activeElement), true, "Retry completion preserves deliberately moved focus");
    } finally {
      await app!.evaluate(({ ipcMain }) => { ipcMain.removeHandler("folders:reopen"); ipcMain.handle("folders:reopen", Reflect.get(globalThis, "retryOriginal")); });
    }
  });
  await navigationCheck("stale-quick-open", async () => {
    await publishEntries(listedEntries); await goHome(page, app!); await enterProject(page, acme, app!);
    await openOverview(page, "acme-web"); await overview().waitFor();
    await card("Billing & plans").click(); await loaded("Billing & plans");
    const panel = page.getByRole("region", { name: "Comments", exact: true });
    await wait(() => panel.getByRole("button", { name: "Comment on canvas", exact: true }).isEnabled(), "stale Open draft ready");
    await panel.getByRole("button", { name: "Comment on canvas", exact: true }).click();
    await panel.getByRole("textbox", { name: "New comment body" }).fill("Keep the draft until the chosen transition is approved");
    await quickOpen("Card decline patterns"); await page.keyboard.press("Enter");
    const discard = page.getByRole("button", { name: "Discard", exact: true }); await discard.waitFor();
    await publishEntries(listedEntries.map(entry => entry.path === brand ? { kind: "cliError", path: brand, reason: "held failure" } : entry));
    await discard.click();
    await page.locator(".toast .msg").getByText("Project is unavailable. Check its status on Home and try again.", { exact: true }).waitFor();
    await loaded("Billing & plans");
    await shot("N-stale-quick-open");
    await publishEntries(listedEntries);
  });
  for (const outcome of ["id", "url", "cliError", "missing-path", "removed"] as const) {
    await navigationCheck(`waiting-open-${outcome}`, async () => {
      await publishEntries(listedEntries); await goHome(page, app!); await enterProject(page, acme, app!);
      await openOverview(page, "acme-web"); await overview().waitFor();
      await card("Billing & plans").click(); await loaded("Billing & plans");
      const panel = page.getByRole("region", { name: "Comments", exact: true });
      await wait(() => panel.getByRole("button", { name: "Comment on canvas", exact: true }).isEnabled(), "draft ready");
      await panel.getByRole("button", { name: "Comment on canvas", exact: true }).click();
      await panel.getByRole("textbox", { name: "New comment body" }).fill("Guard the cross-root Open");
      await page.evaluate(targetRoot => {
        const element = document.querySelector(".workspace")!;
        const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
        if (!key) throw new Error("Missing App fiber");
        type Entry = import("../src/main/view").FolderEntry;
        type Controller = import("../src/renderer/CanvasController").CanvasController;
        type Hook = { memoizedState?: { current?: Controller }; next?: Hook };
        type Fiber = { memoizedState?: Hook; return?: Fiber };
        let controller: Controller | undefined;
        for (let fiber = Reflect.get(element, key) as Fiber | undefined; fiber; fiber = fiber.return) {
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            if (typeof hook.memoizedState?.current?.updateEntries === "function") controller = hook.memoizedState.current;
          }
        }
        if (!controller) throw new Error("Missing controller");
        controller.remember(targetRoot, null);
        const original = controller.updateEntries, workspace = controller.openWorkspace, canvas = controller.openCanvas;
        const probe = { updating: false, consumed: 0, callbacks: [] as { kind: string; updating: boolean }[],
          waiting: () => !!Reflect.get(controller!, "waitingWorkspace"),
          restore: () => { controller!.updateEntries = original; controller!.openWorkspace = workspace; controller!.openCanvas = canvas; } };
        const observe = (callback: ((entry: Entry | undefined) => void) | undefined) => callback && ((entry: Entry | undefined) => {
          callback(entry);
          probe.callbacks.push({ kind: entry?.kind ?? "removed", updating: probe.updating });
        });
        controller.updateEntries = function (entries) { probe.updating = true; try { original.call(this, entries); probe.consumed++; } finally { probe.updating = false; } };
        controller.openWorkspace = function (root, entered, same, unavailable) { workspace.call(this, root, entered, same, observe(unavailable)); };
        controller.openCanvas = function (root, row, frame, target) { canvas.call(this, root, row, frame, target?.unavailable ? { ...target, unavailable: observe(target.unavailable)! } : target); };
        Reflect.set(window, "openConsumption", probe);
      }, brand);
      await quickOpen("Card decline patterns"); await page.keyboard.press("Enter");
      const discard = page.getByRole("button", { name: "Discard", exact: true }); await discard.waitFor();
      const identity = outcome === "id" || outcome === "url";
      const latest = listedEntries.flatMap(entry => entry.path !== brand ? [entry] : outcome === "removed" ? []
        : outcome === "cliError" ? [{ kind: "cliError" as const, path: brand, reason: "held failure" }]
        : entry.kind === "list" ? [{ ...entry, canvases: outcome === "missing-path" ? [] : entry.canvases.map(row => ({ ...row, [outcome]: row[outcome as "id" | "url"] + "-changed" })) }] : [entry]);
      await publishEntries(identity ? latest : listedEntries.map(entry => entry.path === brand ? { kind: "loading", path: brand } : entry));
      await page.waitForFunction(() => Reflect.get(window, "openConsumption").consumed > 0);
      await discard.click();
      if (!identity) {
        await page.waitForFunction(() => Reflect.get(window, "openConsumption").waiting());
        await publishEntries(latest);
      }
      await page.waitForFunction(() => Reflect.get(window, "openConsumption").callbacks.length > 0);
      const consumed = await page.evaluate(() => Reflect.get(window, "openConsumption").callbacks);
      console.log("waiting Open actual callback consumption", outcome, consumed);
      const expected = identity ? "Canvas changed while opening. Choose it again from the Sidebar or Quick Open."
        : outcome === "missing-path" ? "card-decline-patterns is no longer in design/" : "Project is unavailable. Check its status on Home and try again.";
      await page.locator(".toast .msg").getByText(expected, { exact: true }).waitFor();
      const actual = await page.locator(".toast .msg").textContent();
      await shot(`Nfix-open-${outcome}`);
      await page.evaluate(() => Reflect.get(window, "openConsumption").restore());
      assert.equal(actual, expected);
      assert.deepEqual(consumed, [{ kind: outcome === "removed" ? "removed" : outcome === "cliError" ? "cliError" : "list", updating: !identity }]);
      if (identity || outcome === "missing-path") { await overview().waitFor(); assert.equal(await iframe().count(), 0); }
      else assert.equal(await canvasTitle(), "Billing & plans");
    });
    await page.evaluate(() => Reflect.get(window, "openConsumption")?.restore());
  }
  await navigationCheck("workspace-setup-success-focus", async () => {
    await goHome(page, app!); await enterProject(page, empty, app!);
    await rm(join(empty, ".doan/config.json"));
    const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true });
    await page.getByRole("region", { name: "Project status", exact: true }).getByRole("button", { name: "Set Up…", exact: true }).click();
    await setup.getByRole("button", { name: "Set Up Project", exact: true }).click();
    await setup.waitFor({ state: "hidden" }); await overview().waitFor();
    console.log("workspace setup success focus", await activeFocus());
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.workspace') && !document.activeElement?.closest('[inert]')), true);
  });
  await navigationCheck("workspace-setup-reroot-focus", async () => {
    await goHome(page, app!); await enterProject(page, empty, app!);
    await rm(join(empty, ".doan/config.json"));
    const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true });
    await page.getByRole("region", { name: "Project status", exact: true }).getByRole("button", { name: "Set Up…", exact: true }).click();
    await setup.waitFor();
    await app!.evaluate(({ BrowserWindow }, [entries, from, root]) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith("file:") && win.webContents.getURL().includes("index.html"))!.webContents.send("folders", entries.filter(entry => entry.path !== from), { from, root }), [listedEntries, empty, brand] as const);
    await setup.waitFor({ state: "hidden" });
    console.log("workspace setup re-root focus", await activeFocus());
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.workspace') && !document.activeElement?.closest('[inert]')), true);
    await writeFile(join(empty, ".doan/config.json"), '{"v":1}'); await publishEntries(listedEntries);
  });
  await navigationCheck("width-copy-and-quick-open-presentation", async () => {
    await publishEntries(listedEntries); await goHome(page, app!); await enterProject(page, acme, app!);
    await openOverview(page, "acme-web"); await overview().waitFor();
    await card("Design tokens").click();
    const status = page.locator(".canvas-status");
    await status.getByText("Could not read a valid board width.", { exact: true }).waitFor();
    assert.equal(await status.textContent(), "Could not read a valid board width. Run doan check in a terminal to diagnose the canvas.");
    await quickOpen("card decl");
    assert.equal(await dialog().locator(".qo-list.native-scroll").count(), 1);
    const fields = await dialog().locator(".qo-item .t, .qo-item .c, .qo-item .w").evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, title: node.getAttribute("title"), width: node.getBoundingClientRect().width, scroll: node.scrollWidth })));
    assert.ok(fields.length > 0);
    for (const field of fields) assert.equal(field.title, field.text);
    console.log("Quick Open full text fields", fields);
    await shot("N-quick-open-fields"); await page.keyboard.press("Escape");
  });
  await navigationCheck("first-run-wizard-home-focus", async () => {
    await quit();
    await rm(join(userData, "onboarding.json"));
    await writeFile(join(userData, "ui-state.json"), JSON.stringify({ screen: "home", expanded: {}, lastByRoot: {} }));
    await launch();
    const wizard = page.getByRole("dialog", { name: "Set Up doan", exact: true });
    await wizard.waitFor(); await page.keyboard.press("Escape"); await wizard.waitFor({ state: "hidden" });
    console.log("first-run Home wizard focus", await activeFocus());
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.home-shell') && !document.activeElement?.closest('[inert]')), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.home-shell')), true, "Tab continues on the visible Home screen");
    await shot("N-first-run-home-focus");
  });
  if (navigationFailures.length) throw new Error(navigationFailures.join("\n"));
  if (process.env.DOAN_NAV_REGRESSION_ONLY === "1") {
    await quit();
  } else {
  await goHome(page, app!);
  await page.evaluate(() => { const seen: string[] = []; Reflect.set(window, "thumbChanges", seen); window.doan.onThumbnailChanged(({ path }) => seen.push(path)); });
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();

  // Task 8 — visible cards are captured first; a card leaving moves focus on.
  await enterProject(page, gallery, app!);
  await overview().waitFor();
  const onScreen = await overview().evaluate(region => {
    const box = region.getBoundingClientRect();
    return [...region.querySelectorAll<HTMLElement>(".ocard")].filter(card => { const rect = card.getBoundingClientRect(); return rect.bottom > box.top && rect.top < box.bottom; }).map(card => card.dataset.path);
  });
  assert.ok(onScreen.length > 0 && onScreen.length < 24, `some cards are off screen (${onScreen.length} on screen)`);
  await wait(async () => (await page.evaluate(() => (Reflect.get(window, "thumbChanges") as string[]).length)) > 0, "first thumbnail captured");
  const first = await page.evaluate(() => (Reflect.get(window, "thumbChanges") as string[])[0]);
  assert.ok(onScreen.includes(first), `the first capture (${first}) is a card on screen`);
  await wait(async () => (await card("Gallery 01").locator("img").getAttribute("src"))?.startsWith("blob:") ?? false, "a captured card shows its image");
  await card("Gallery 02").focus();
  await rm(join(gallery, "design/g02.html"));
  await wait(async () => await card("Gallery 02").count() === 0, "removed card leaves the overview");
  assert.equal(await card("Gallery 03").evaluate(node => node === document.activeElement), true, "focus moves to the next card");
  await shot("1-gallery-overview");

  // Task 8 — a workspace without canvases.
  await enterProject(page, empty, app!);
  await overview().getByText("No canvases in design/ yet", { exact: true }).waitFor();
  await overview().getByRole("textbox", { name: "What do you want to design?", exact: true }).waitFor();
  await shot("2-empty-overview");

  // Task 8 — cards by folder, the doan:width hint, a card opens its canvas.
  await enterProject(page, acme, app!);
  await overview().waitFor();
  assert.deepEqual(await overview().locator(".sec").allTextContents(), ["design 1", "design/misc 1", "design/settings 3"]);
  assert.equal(await card("Design tokens").locator(".thumb-msg").textContent(), "Preview needs a valid doan:width — run doan check");
  assert.equal(await card("Billing & plans").locator(".ocard-meta").textContent().then(text => text?.split(" · ")[0]), "5 frames");
  const cdp = await page.context().newCDPSession(page);
  const ax = await cdp.send("Accessibility.getFullAXTree");
  const tokenCard = ax.nodes.find(node => node.role?.value === "button" && node.name?.value === "Design tokens tokens.html");
  assert.ok(tokenCard, "the card name leads with title and file name");
  assert.match(tokenCard.description?.value ?? "", /^Preview needs a valid doan:width — run doan check 1 frame/);
  const billingCard = ax.nodes.find(node => node.role?.value === "button" && node.name?.value === "Billing & plans billing.html");
  assert.ok(billingCard, "a capturable card has the same title-first name");
  assert.match(billingCard.description?.value ?? "", /5 frames/);
  await writeFile(join(shots, "overview-card-ax.json"), JSON.stringify([tokenCard, billingCard], null, 2));
  await cdp.detach();
  await shot("3-acme-overview");
  await card("Billing & plans").click();
  await loaded("Billing & plans");

  // Task 9 — Quick Open from the menu; disabled while open; Escape returns focus.
  const opener = canvasRow(page, "billing.html");
  await opener.focus();
  await menu("Quick Open…");
  await dialog().waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Search canvases and frames" }).evaluate(node => node === document.activeElement), true);
  await wait(async () => await menuEnabled("Quick Open…") === false, "Quick Open… disabled while the dialog is open");
  assert.deepEqual((await options()).map(text => text.split(" — ")[0]), ["◧Notes", "◧Billing & plans", "◧Duplicates", "◧Ghost", "◧Design tokens"], "empty query lists the current project's canvases in doan ls order");
  await shot("4-quick-open-empty");
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached" });
  assert.equal(await opener.evaluate(node => node === document.activeElement), true, "Escape returns focus to where Quick Open was opened");
  await wait(async () => await menuEnabled("Quick Open…") === true, "Quick Open… enabled again");

  // Task 9 — another worktree's frame, through the draft guard.
  const panel = page.getByRole("region", { name: "Comments", exact: true });
  await wait(() => panel.getByRole("button", { name: "Comment on canvas", exact: true }).isEnabled(), "comments ready");
  await panel.getByRole("button", { name: "Comment on canvas", exact: true }).click();
  await panel.getByRole("textbox", { name: "New comment body" }).fill("Draft before Quick Open");
  await quickOpen("card decl");
  await wait(async () => (await options()).length === 3, "card decl results");
  const results = await options();
  assert.match(results[0]!, /^#Card declined — Billing & plans › 4 · acme-web · main$/);
  assert.match(results[1]!, /^#Card declined — Billing & plans › 4 · acme-web · feat-billing$/);
  assert.match(results[2]!, /^◧Card decline patterns — research\/card-decline-patterns\.html · brand-kit$/);
  await shot("5-quick-open-results");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await wait(async () => await page.getByRole("treeitem", { name: "acme-web", exact: true }).locator(".shell-branch").textContent() === "feat-billing", "entered the feat-billing worktree");
  await loaded("Billing & plans");
  await wait(() => frameVisible(3), "moved to the Card declined frame");
  await jumpFrame(page, 0);
  await wait(() => frameVisible(0), "Quick Open jumps to Plans without a frame tree");

  // Task 9 — duplicate IDs retain the requested index; a removed frame gets the toast.
  await quickOpen("second dup");
  await wait(async () => (await options())[0]?.startsWith("#Second dup") ?? false, "second dup result");
  await page.keyboard.press("Enter");
  await loaded("Duplicates");
  await wait(() => frameVisible(1), "a duplicate id opens the requested frame index");
  await quickOpen("ghost frame");
  await wait(async () => (await options())[0]?.startsWith("#Ghost frame") ?? false, "ghost frame result");
  await page.keyboard.press("Enter");
  await loaded("Ghost");
  await toast("This frame is not in the rendered canvas");
  await shot("6-frame-not-rendered");

  // Task 9 — on Home: every project's canvases, picking enters the workspace.
  await goHome(page, app!);
  await quickOpen("");
  await wait(async () => (await options()).length > 10, "Home lists every project's canvases");
  assert.ok((await options()).some(text => text.endsWith("· brand-kit")) && (await options()).some(text => text.endsWith("· acme-web · feat-billing")));
  await shot("7-quick-open-home");
  await page.keyboard.type("patterns");
  await wait(async () => (await options()).length === 1, "patterns result");
  await page.keyboard.press("Enter");
  await loaded("Card decline patterns");

  // Task 8 — the open canvas is deleted: back to the Overview with a toast.
  await rm(join(brand, "design/research/card-decline-patterns.html"));
  await overview().waitFor();
  await toast("Card decline patterns was removed from design/");
  await shot("8-removed-toast");
  console.log("design-nav: overview and quick open PASS");

  // Anonymous frames remain rendered even though the shell no longer lists frames.
  await enterProject(page, acme, app!);
  await canvasRow(page, "notes.html").click();
  await loaded("Notes");
  assert.deepEqual(await page.frameLocator(".board iframe").locator("[data-doan-frame]").evaluateAll(rows => rows.map(row => row.getAttribute("data-doan-frame"))), ["one", ""]);

  // Task 10 — relaunch restores the canvas, its view and the tree, not the selection.
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", acme], { env })).stdout);
  const inspector = () => page.getByRole("region", { name: "Inspector", exact: true });
  await enterProject(page, acme, app!);
  await canvasRow(page, "billing.html").click();
  await loaded("Billing & plans");
  const otherProject = page.getByRole("treeitem", { name: "brand-kit", exact: true });
  await otherProject.focus(); await otherProject.press("ArrowLeft");
  assert.equal(await otherProject.getAttribute("aria-expanded"), "false", "unviewed project collapsed");
  await menu("Zoom In");
  const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
  await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2);
  await page.mouse.wheel(0, 160);
  const board = () => page.locator(".board").evaluate(node => (node as HTMLElement).style.transform);
  await wait(async () => (await board()).startsWith("translate") && !(await board()).includes("translate(0px, 0px)"), "panned");
  await selectFrame(page, 0);
  await inspector().waitFor();
  assert.equal((await active()).result?.selection?.frame?.id, "plans", "doan active has the selection before quit");
  // The last pan, then a renderer kept busy through the quit: a value it had
  // not sent by then (a renderer-side batch, say) is never saved.
  const view = await page.locator(".area").evaluate(area => {
    area.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true }));
    setTimeout(() => { const end = Date.now() + 2000; while (Date.now() < end); });
    return (document.querySelector(".board") as HTMLElement).style.transform;
  });
  await quit();
  const saved = JSON.parse(await readFile(join(userData, "ui-state.json"), "utf8"));
  assert.equal(saved.canvas, "design/settings/billing.html");
  assert.equal("selection" in saved, false, "ui-state.json has no selection");
  console.log("normal restore saved state", JSON.stringify(saved));
  traceRestore = true;
  await launch();
  traceRestore = false;
  await loaded("Billing & plans");
  await wait(async () => await board() === view, `restored view ${view}`);
  assert.equal(await page.getByRole("treeitem", { name: "brand-kit", exact: true }).getAttribute("aria-expanded"), "false", "project expansion restored");
  assert.equal(await inspector().count(), 0, "no selection after restore");
  assert.equal((await active()).result?.selection, undefined, "doan active is empty after restore");
  console.log("normal restore completed", await page.evaluate(() => ({ iframe: document.querySelector<HTMLIFrameElement>(".board iframe")?.src, status: document.querySelector(".canvas-status")?.textContent, frames: document.querySelectorAll('.side [role="treeitem"]').length })));
  await shot("9-restored");

  // App.save only runs after restore is done; a new atomic state write is a
  // positive renderer commit checkpoint, unlike the initial Home paint.
  const restoreCommitted = () => wait(async () => await stateVersion() !== stateBeforeLaunch, "renderer restore committed ui-state");
  // Home at quit starts on Home, without loading the workspace.
  await goHome(page, app!);
  await relaunch(true);
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await restoreCommitted();
  assert.equal(await page.locator("iframe").count(), 0, "the hidden workspace is not loaded");

  // The last canvas is gone: its project's Overview with a toast.
  await enterProject(page, acme, app!);
  await loaded("Billing & plans");
  await quit();
  await rm(join(acme, "design/settings/billing.html"));
  await launch();
  await overview().waitFor();
  await toast("billing is no longer in design/");
  await shot("10-canvas-gone");

  // The project folder is gone: Home.
  await enterProject(page, brand, app!);
  await overview().waitFor();
  await quit();
  await rm(brand, { recursive: true, force: true });
  await launch(true);
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await restoreCommitted();
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true, "a gone project restores to Home");

  // A broken ui-state.json starts on Home.
  await enterProject(page, gallery, app!);
  await quit();
  assert.equal(JSON.parse(await readFile(join(userData, "ui-state.json"), "utf8")).root, gallery);
  await writeFile(join(userData, "ui-state.json"), "{broken");
  await launch(true);
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await restoreCommitted();
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true, "a broken ui-state.json starts on Home");
  // Add metadata edge cases late so earlier fixture counts and restore gates stay fixed.
  await app!.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("thumbnails:get");
    const probe = { original, requested: [] as string[] }; Reflect.set(globalThis, "metadataThumbnailProbe", probe);
    ipcMain.removeHandler("thumbnails:get"); ipcMain.handle("thumbnails:get", (...args) => {
      probe.requested.push(args[1].path); return original(...args);
    });
  });
  try {
    await writeFile(join(empty, "design/no-id.html"), canvas("unused", "Missing ID", 800, [["hero", "Known hero"]]).replace('<meta name="doan:canvas" content="unused">', ""));
    await writeFile(join(empty, "design/bad-id.html"), canvas("invalid id!", "Invalid ID", 800, [["hero", "Known hero"], ["footer", "Known footer"]]));
    await writeFile(join(empty, "design/no-width.html"), canvas("no-width", "Missing width", null, [["hero"]]));
    await enterProject(page, empty, app!); await overview().waitFor();
    for (const [title, path, facts] of [["Missing ID", "design/no-id.html", "1 frame"], ["Invalid ID", "design/bad-id.html", "2 frames"]]) {
      await wait(async () => card(title!).locator("img").evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), `${title} displays decoded thumbnail`);
      assert.ok((await app!.evaluate(() => Reflect.get(globalThis, "metadataThumbnailProbe").requested)).includes(path));
      assert.match(await card(title!).innerText(), new RegExp(facts!));
    }
    await card("Missing width").getByText("Preview needs a valid doan:width — run doan check", { exact: true }).waitFor();
    await shot("11-metadata-thumbnails");
    // doan ls drops a malformed id, so the app cannot tell an invalid id from a missing one.
    for (const title of ["Missing ID", "Invalid ID"]) {
      await card(title).click(); await loaded(title);
      const comments = page.getByRole("region", { name: "Comments", exact: true });
      await comments.getByRole("alert").filter({ hasText: "This canvas has no ID" }).waitFor();
      assert.equal(await comments.getByRole("group", { name: "Comment scope" }).count(), 0, `${title} shows no filters`);
      assert.equal(await comments.getByRole("button", { name: /^Comment on (canvas|selection)$/ }).count(), 0, `${title} cannot create comments`);
      assert.equal(await comments.getByRole("textbox", { name: "New comment body" }).count(), 0);
      await shot(`12-${title.replaceAll(" ", "-").toLowerCase()}-comments`);
      await openOverview(page, "empty"); await overview().waitFor();
    }
    assert.equal((await app!.evaluate(() => Reflect.get(globalThis, "metadataThumbnailProbe").requested)).includes("design/no-width.html"), false, "missing width never requests capture after overview and canvas processing");
  } finally {
    await app!.evaluate(({ ipcMain }) => { ipcMain.removeHandler("thumbnails:get"); ipcMain.handle("thumbnails:get", Reflect.get(globalThis, "metadataThumbnailProbe").original); });
  }
  console.log("design-nav: restore PASS");
  await quit();

  }
} catch (error) {
  console.error(error);
  if (app) console.error("navigation failure diagnostics", await page.evaluate(async () => {
    const iframe = document.querySelector<HTMLIFrameElement>(".board iframe");
    const entries = await new Promise<import("../src/main/view").FolderEntry[]>(resolve => { const stop = window.doan.onFolders(value => { stop(); resolve(value); }); });
    return { iframe: iframe?.src, status: document.querySelector(".canvas-status")?.textContent, entries, resources: performance.getEntriesByType("resource").map(item => item.name), saved: await window.doan.readUiState() };
  }).catch(String));
  if (app) { await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); console.error(`design-nav screenshot: ${join(shots, "failure.png")}`); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
  throw error;
} finally {
  await guard.finish();
}

console.log("design-nav: PASS");
