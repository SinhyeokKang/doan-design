import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, waitFor, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { settingsPage, menu, appWindow, appWindowCount }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { homeRow, enterProject, goHome }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-settings-"));
const shots = join(root, ".scratch/runtime-test", `settings-${Date.now()}`);
const before = await realState();
let app: ElectronApplication | undefined, page: Page | undefined, settings: Page | undefined;
const errors: string[] = [];
let clipboardSaved = false;
const guard = suiteGuard({ name: "settings", app: () => app, verify: () => assertRealState(before), cleanup: () => rm(work, { recursive: true, force: true }) });
const wait = waitFor;
try {
  const home = join(work, "home"), data = join(work, "data"), cli = join(work, "doan"), shell = join(work, "zsh");
  const repo = join(home, "acme"), second = join(home, "brand"), missing = join(home, "gone"), plain = join(home, "plain");
  await mkdir(data); await mkdir(join(home, ".local/bin"), { recursive: true }); await mkdir(shots, { recursive: true });
  await writeFile(join(data, "onboarding.json"), "{}");
  // Claude Code is installed (never run here) so its MCP item waits for the doan command.
  const bin = join(work, "bin"); await mkdir(bin); await writeFile(join(bin, "claude"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await writeFile(shell, `#!/bin/sh\nPATH=${bin}:/usr/bin:/bin; export PATH\neval "$2"\n`, { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const cliLink = join(home, ".local/bin/doan"); await symlink(join(work, "gone-doan"), cliLink);
  for (const project of [repo, second]) {
    await mkdir(join(project, ".doan"), { recursive: true }); await mkdir(join(project, "design")); await mkdir(join(project, "styles"));
    await writeFile(join(project, ".doan/config.json"), '{"v":1}');
    await writeFile(join(project, "styles/tokens.css"), ':root { --test-color: rgb(10, 20, 30); }');
    await writeFile(join(project, "design/canvas.html"), '<!doctype html><title>Settings canvas</title><meta name="doan:canvas" content="settings"><meta name="doan:width" content="800"><link rel="stylesheet" href="../styles/tokens.css"><style>body { color: var(--test-color, red); min-height: 600px; }</style><section data-doan-frame="hero"><p>Settings canvas</p></section>');
  }
  await mkdir(plain); await mkdir(join(repo, "assets")); await writeFile(join(work, "outside.css"), ':root {}');
  const branched = join(home, "branched");
  await mkdir(join(branched, ".doan"), { recursive: true }); await writeFile(join(branched, ".doan/config.json"), '{"v":1}');
  await exec("git", ["init", "-q", "-b", "main", branched]); await exec("git", ["-C", branched, "-c", "user.name=Settings", "-c", "user.email=settings@example.test", "commit", "-q", "--allow-empty", "-m", "init"]);
  await writeFile(join(data, "folders.json"), JSON.stringify([repo, second, plain, missing, branched]));
  const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(data, "runtime.json") };
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${data}`], env }); rememberApp(app);
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    Reflect.set(globalThis, "settingsClipboard", await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))));
  });
  clipboardSaved = true;
  page = await app.firstWindow(); page.setDefaultTimeout(15_000); page.on("pageerror", error => errors.push(String(error)));
  await page.getByRole("button", { name: "doan command: Needs attention", exact: true }).waitFor();
  const banner = page.getByRole("status", { name: "Connection problem" });
  await banner.getByText("The doan command link is broken, so agents can’t reach doan.", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Finish setting up doan" }).waitFor();
  await page.getByText("Connect Claude Code or Codex", { exact: true }).waitFor();
  await page.screenshot({ path: join(shots, "01-home.png") });
  await banner.getByRole("button", { name: "Fix…", exact: true }).click();
  settings = await settingsPage(app); settings.setDefaultTimeout(15_000); settings.on("pageerror", error => errors.push(String(error)));
  await settings.getByRole("tab", { name: "Connections", selected: true }).waitFor();
  const cliRow = settings.locator(".cn-row").filter({ has: settings.getByRole("button", { name: "doan command", exact: true }) });
  await cliRow.getByRole("button", { name: "doan command", expanded: true }).waitFor();
  await cliRow.getByText("Link is broken", { exact: true }).waitFor();
  await wait(() => cliRow.getByRole("button", { name: "Fix…" }).evaluate(node => node === document.activeElement), "banner target action focus");
  await settings.screenshot({ path: join(shots, "02-connections.png") });
  // MCP waits for the doan command: its reason sits right under the dimmed item.
  const claudeRow = settings.locator('.cn-row[data-connection="claude"]');
  await claudeRow.locator(".cn-name").click();
  assert.equal(await claudeRow.locator(".ob-notice").evaluate(node => getComputedStyle(node).paddingTop), "0px");
  await claudeRow.locator(".cn-name").click();
  await app.evaluate(({ shell }) => { shell.openExternal = async () => { throw new Error("Injected install-page failure"); }; });
  await settings.getByRole("button", { name: "Install Codex ↗", exact: true }).click();
  await settings.getByRole("alert").getByText("Couldn’t open the install page.", { exact: true }).waitFor();
  assert.equal(await cliRow.getByRole("button", { name: "Fix…" }).isEnabled(), true, "an install-page failure cannot disable connection actions");
  await cliRow.getByRole("button", { name: "Copy", exact: true }).click(); await cliRow.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'export PATH="$HOME/.local/bin:$PATH"');
  await cliRow.getByRole("button", { name: "Fix…" }).click();
  const confirm = settings.getByRole("alertdialog", { name: "Fix the doan link?" });
  await confirm.waitFor(); assert.equal(await confirm.getByRole("button", { name: "Cancel" }).evaluate(node => node === document.activeElement), true);
  await app.evaluate(({ ipcMain }, window) => {
    const send = window.webContents.send;
    const saveTab = Reflect.get(ipcMain, "_invokeHandlers").get("settings:tab-save");
    const probe = { held: false, tab: null as unknown, release: () => {}, restore: () => {
      window.webContents.send = send; ipcMain.removeHandler("settings:tab-save"); ipcMain.handle("settings:tab-save", saveTab);
    } };
    window.webContents.send = function (channel, ...args) {
      if (channel === "settings:target") { probe.held = true; probe.release = () => send.call(this, channel, ...args); }
      else send.call(this, channel, ...args);
    };
    ipcMain.removeHandler("settings:tab-save");
    ipcMain.handle("settings:tab-save", async (...args) => { const result = await saveTab(...args); if (probe.held) probe.tab = args[1]; return result; });
    Reflect.set(globalThis, "forwardedTargetProbe", probe);
  }, await appWindow(app, settings));
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), second);
  await wait(() => app!.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").held), "target held before delivery");
  await settings.waitForTimeout(250);
  assert.equal(await app.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").tab), null);
  await app.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").release());
  await wait(() => app!.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").tab !== null), "renderer processed forwarded target");
  assert.deepEqual(await app.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").tab), { tab: "connections" });
  await app.evaluate(() => Reflect.get(globalThis, "forwardedTargetProbe").restore());
  assert.equal(await confirm.isVisible(), true, "a forwarded target cannot discard a pending setup confirmation");
  assert.equal(await settings.getByRole("tab", { name: "Connections", selected: true }).count(), 1);
  await wait(async () => await (await appWindow(app!, settings!)).evaluate(window => window.getTitle()) === "Connections", "pending confirmation keeps the native tab title");
  await settings.keyboard.press("Escape"); await confirm.waitFor({ state: "hidden" }); assert.equal(await readlink(cliLink), join(work, "gone-doan"));
  await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  await settings.getByRole("tab", { name: "Connections" }).click();
  await cliRow.getByRole("button", { name: "Fix…" }).waitFor();
  await cliRow.getByRole("button", { name: "Fix…" }).click(); await confirm.getByRole("button", { name: "Fix Link" }).click();
  await cliRow.getByText("Connected", { exact: true }).waitFor(); await banner.waitFor({ state: "hidden" });
  assert.equal(await readlink(cliLink), cli);
  await settings.getByRole("tab", { name: "Projects" }).click();
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "Settings closed");
  assert.equal(await appWindowCount(app), 1); assert.equal(await (await appWindow(app, page)).evaluate(window => window.isVisible()), true);
  await page.getByRole("button", { name: "Codex: Not installed", exact: true }).click(); settings = await settingsPage(app);
  await settings.getByRole("tab", { name: "Connections", selected: true }).waitFor();
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "chip Settings closed");

  await homeRow(page, second).getByRole("button", { name: `Row menu ${second}` }).click();
  await page.getByRole("menuitem", { name: "Project Settings…", exact: true }).click(); settings = await settingsPage(app); settings.setDefaultTimeout(15_000);
  await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  await settings.getByRole("option", { name: "~/brand", selected: true }).waitFor();
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "project Settings closed");
  await menu(app, page, "Settings…"); settings = await settingsPage(app);
  await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "last tab Settings closed");

  await enterProject(page, repo); await canvasRow(page, "canvas.html").click();
  await page.locator("iframe").waitFor(); await wait(async () => (await page!.locator("iframe").contentFrame().locator("body").innerText()).includes("Settings canvas"), "canvas loaded");
  await page.locator("iframe").evaluate(node => node.setAttribute("data-settings-before", "yes"));
  await goHome(page);
  await homeRow(page, repo).getByRole("button", { name: `Row menu ${repo}` }).click(); await page.getByRole("menuitem", { name: "Project Settings…" }).click(); settings = await settingsPage(app); settings.setDefaultTimeout(15_000);
  const detail = settings.getByRole("region", { name: "acme settings", exact: true });
  await detail.getByRole("button", { name: "Change…" }).waitFor();
  async function pick(path: string) { await app!.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path); }
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => new Promise(resolve => { Reflect.set(globalThis, "settingsPickerCancel", () => resolve({ canceled: true, filePaths: [] })); });
  });
  await detail.getByRole("button", { name: "Change…" }).click();
  await wait(() => app!.evaluate(() => typeof Reflect.get(globalThis, "settingsPickerCancel") === "function"), "config picker opened");
  assert.equal(await detail.getByText("Saving…", { exact: true }).count(), 0, "picking a path is not saving config");
  assert.equal(await detail.getByRole("button", { name: "Change…" }).isDisabled(), true);
  await app.evaluate(() => Reflect.get(globalThis, "settingsPickerCancel")());
  await wait(async () => !await detail.getByRole("button", { name: "Change…" }).isDisabled(), "picker cancellation releases controls");
  await pick(join(repo, "styles/tokens.css")); await detail.getByRole("button", { name: "Change…" }).click();
  await detail.getByText("✓ Saved", { exact: true }).waitFor(); await detail.getByText("styles/tokens.css", { exact: true }).waitFor();
  await wait(async () => await page!.locator("iframe[data-settings-before]").count() === 0, "token config reloads the open canvas");
  assert.equal(JSON.parse(await readFile(join(repo, ".doan/config.json"), "utf8")).tokenCss, "styles/tokens.css");
  await pick(join(repo, "assets")); await detail.getByRole("button", { name: "Add…", exact: true }).click();
  const serve = settings.getByRole("alertdialog", { name: "Add to serve?" }); await serve.waitFor();
  assert.equal(await serve.getByRole("button", { name: "Cancel" }).evaluate(node => node === document.activeElement), true);
  assert.equal(JSON.parse(await readFile(join(repo, ".doan/config.json"), "utf8")).serve, undefined);
  await serve.getByRole("button", { name: "Add to Serve" }).click(); await detail.getByText("assets", { exact: true }).waitFor();
  const good = await readFile(join(repo, ".doan/config.json"), "utf8");
  await pick(join(work, "outside.css")); await detail.getByRole("button", { name: "Change…" }).click();
  await detail.getByRole("alert").filter({ hasText: /outside/i }).waitFor(); assert.equal(await readFile(join(repo, ".doan/config.json"), "utf8"), good);
  await settings.screenshot({ path: join(shots, "03-projects-error.png") });
  await detail.getByRole("button", { name: "Clear", exact: true }).click(); await detail.getByText("None", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "Remove", exact: true }).click(); await detail.getByText("Nothing else is served.", { exact: true }).waitFor();
  // Config reads retain the CLI's missing/timeout diagnostics, without changing config.
  await rename(cli, `${cli}.real`);
  await settings.getByRole("option", { name: "~/brand", exact: true }).click();
  await settings.getByRole("alert").filter({ hasText: /Couldn’t run doan/ }).waitFor();
  await writeFile(cli, `#!/bin/sh\nif [ "$1" = config ]; then exec /bin/sleep 11; fi\nexec "${cli}.real" "$@"\n`, { mode: 0o755 });
  await settings.getByRole("option", { name: "~/acme", exact: true }).click();
  await settings.getByRole("alert").filter({ hasText: /timed out after 10 s/ }).waitFor();
  await rm(cli); await rename(`${cli}.real`, cli);
  await settings.getByRole("option").filter({ hasText: "~/gone" }).click();
  await settings.getByRole("region", { name: "gone settings" }).getByRole("button", { name: "Locate…" }).waitFor();
  const missingRoot = settings.getByRole("region", { name: "gone settings" }).locator(".pj-sec");
  assert.equal(await missingRoot.locator(".ob-chip.warn").innerText(), "Missing");
  assert.equal(await missingRoot.locator("code").innerText(), "~/gone");
  assert.equal(await missingRoot.locator(".wt-actions").count(), 1);
  await settings.getByRole("option").filter({ hasText: "~/plain" }).click();
  await settings.getByRole("region", { name: "plain settings" }).getByRole("button", { name: "Set Up…" }).click();
  const setup = page.getByRole("dialog", { name: /Set Up Project/ });
  await setup.waitFor();
  const beforeSetup = await setup.innerText();
  await settings.getByRole("option").filter({ hasText: "~/gone" }).click();
  await settings.getByRole("region", { name: "gone settings" }).getByRole("button", { name: "Remove", exact: true }).click();
  await settings.getByRole("alert").getByText("This project changed. Try again on Home.", { exact: true }).waitFor();
  assert.equal(await setup.innerText(), beforeSetup, "forwarding cannot replace the open main dialog");
  assert.equal(await settings.getByRole("option").filter({ hasText: "~/gone" }).count(), 1, "forwarding cannot remove a project behind the modal");
  await page.keyboard.press("Escape");
  await settings.getByRole("option").filter({ hasText: "~/plain" }).click();
  await settings.getByRole("region", { name: "plain settings" }).getByRole("button", { name: "Remove", exact: true }).click();
  await settings.getByRole("option").filter({ hasText: "~/plain" }).waitFor({ state: "hidden" });
  await settings.getByRole("option", { name: "~/acme", selected: true }).waitFor();
  // A worktree row names its branch in the heading and in the region's name.
  await settings.getByRole("option").filter({ hasText: "~/branched" }).click();
  assert.equal(await settings.getByRole("region", { name: "branched (main) settings", exact: true }).locator(".pj-name").textContent(), "branched main");
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "final Settings closed");
  await menu(app, page, "Settings…"); settings = await settingsPage(app); await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  assert.equal(await appWindowCount(app), 2);
  const quitLabel = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.flatMap(item => item.submenu?.items ?? []).find(item => item.role === "quit")!.label);
  await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "settingsClipboard")); });
  clipboardSaved = false;
  const closed = app.waitForEvent("close"); await menu(app, settings, quitLabel); await closed; await closeApp(app);
  assert.equal(page.isClosed(), true); assert.equal(settings.isClosed(), true); app = undefined;
  assert.deepEqual(errors, []);
  console.log(`settings screenshots: ${shots}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: join(shots, "failure-main.png") }).catch(console.error);
  if (settings && !settings.isClosed()) await settings.screenshot({ path: join(shots, "failure-settings.png") }).catch(console.error);
  throw error;
} finally {
  try { if (app && clipboardSaved) await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "settingsClipboard")); }); } finally { await guard.finish(); }
}

console.log("settings: PASS");
