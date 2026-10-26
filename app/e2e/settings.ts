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
const { armInstallConsumer, settledInstallConsumer }: typeof import("./renderer-probe") = await import(new URL("./renderer-probe.ts", import.meta.url).href);
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-settings-"));
const shots = join(root, ".scratch/runtime-test", `settings-${Date.now()}`);
const before = await realState();
let app: ElectronApplication | undefined, page: Page | undefined, settings: Page | undefined;
const errors: string[] = [];
const regressions: string[] = [];
function check(value: boolean, message: string) { if (!value) { regressions.push(message); console.error(`REGRESSION: ${message}`); } }
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
  const branched = join(home, "branched"), branchName = `feature/${"long-branch-".repeat(16)}settings`;
  await mkdir(join(branched, ".doan"), { recursive: true }); await writeFile(join(branched, ".doan/config.json"), '{"v":1}');
  await exec("git", ["init", "-q", "-b", branchName, branched]); await exec("git", ["-C", branched, "-c", "user.name=Settings", "-c", "user.email=settings@example.test", "commit", "-q", "--allow-empty", "-m", "init"]);
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
  // The link and its target stay on one line; the full path is in title.
  const linkPath = await cliRow.locator(".ob-detail.path").evaluate(node => ({ wrap: getComputedStyle(node).whiteSpace, title: node.getAttribute("title") ?? "" }));
  assert.equal(linkPath.wrap, "nowrap", "CLI link path stays on one line"); assert.match(linkPath.title, /doan/, "CLI link path keeps its full text in title");
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
  check(await settings.getByRole("alert").evaluate((node, role) => { const icon = node.querySelector(":scope > .doan-alert-icon"); const probe = document.body.appendChild(document.createElement("span")); probe.style.color = `var(${role})`; const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(node).borderLeftWidth === "0px" && icon !== null && getComputedStyle(icon).color === expected; }, "--text-danger"), "install failure leads with the error icon, no left rule");
  assert.equal(await cliRow.getByRole("button", { name: "Fix…" }).isEnabled(), true, "an install-page failure cannot disable connection actions");
  const installCodex = settings.getByRole("button", { name: "Install Codex ↗", exact: true });
  const installClick = async () => {
    const id = await installCodex.evaluate(armInstallConsumer);
    await installCodex.click();
    return id;
  };
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("setup:open-external");
    Reflect.set(globalThis, "settingsInstallOriginal", original);
    ipcMain.removeHandler("setup:open-external");
    Reflect.set(globalThis, "settingsInstallRequests", []);
    ipcMain.handle("setup:open-external", () => new Promise((resolve, reject) => Reflect.get(globalThis, "settingsInstallRequests").push({ resolve, reject })));
  });
  // Transport rejection is distinct from shell.openExternal rejection, which
  // the real main handler maps to false (covered above).
  for (const failure of ["false", "reject"] as const) for (const oldFirst of [false, true]) {
    const ids: [number, number] = [await installClick(), await installClick()];
    await wait(() => app!.evaluate(() => Reflect.get(globalThis, "settingsInstallRequests").length === 2), "two install requests held");
    for (const index of oldFirst ? [0, 1] : [1, 0]) {
      await app.evaluate((_electron, { index, failure }) => {
        const request = Reflect.get(globalThis, "settingsInstallRequests")[index];
        if (index === 0 && failure === "reject") request.reject(new Error("Old install failure"));
        else request.resolve(index === 1);
      }, { index, failure });
      await settledInstallConsumer(settings, ids[index]!);
      assert.deepEqual(await settings.getByRole("alert").allTextContents(), [], `consumed stale install ${failure}, oldFirst=${oldFirst}, index=${index}`);
      if (oldFirst && index === 0) assert.equal(await settings.evaluate(id => Reflect.get(window, "installConsumers")[id].completed, ids[1]), false, "B remains pending after A is consumed");
    }
    await app.evaluate(() => Reflect.set(globalThis, "settingsInstallRequests", []));
  }
  const latestIds: [number, number] = [await installClick(), await installClick()];
  await wait(() => app!.evaluate(() => Reflect.get(globalThis, "settingsInstallRequests").length === 2), "latest failure requests held");
  await app.evaluate(() => Reflect.get(globalThis, "settingsInstallRequests")[1].reject(new Error("Latest install failure")));
  await settledInstallConsumer(settings, latestIds[1]);
  await settings.getByRole("alert").filter({ hasText: "Latest install failure" }).waitFor();
  await app.evaluate(() => Reflect.get(globalThis, "settingsInstallRequests")[0].resolve(true));
  await settledInstallConsumer(settings, latestIds[0]);
  assert.match(await settings.getByRole("alert").textContent() ?? "", /Latest install failure/);
  await app.evaluate(({ ipcMain, shell }) => {
    ipcMain.removeHandler("setup:open-external"); ipcMain.handle("setup:open-external", Reflect.get(globalThis, "settingsInstallOriginal"));
    shell.openExternal = async () => {};
  });
  await settledInstallConsumer(settings, await installClick());
  assert.equal(await settings.getByRole("alert").count(), 0, "consumed successful retry clears error");
  await settings.screenshot({ path: join(shots, "02-install-consumed.png") });

  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("setup:read");
    ipcMain.removeHandler("setup:read"); ipcMain.handle("setup:read", () => ({ kind: "stale" }));
    Reflect.set(globalThis, "restoreSetupRead", () => { ipcMain.removeHandler("setup:read"); ipcMain.handle("setup:read", original); });
  });
  await settings.getByRole("button", { name: "Check Again", exact: true }).first().click();
  const readFailure = settings.getByRole("alert").filter({ hasText: "Couldn’t read connections." }); await readFailure.waitFor();
  check(await readFailure.evaluate((node, role) => { const icon = node.querySelector(":scope > .doan-alert-icon"); const probe = document.body.appendChild(document.createElement("span")); probe.style.color = `var(${role})`; const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(node).borderLeftWidth === "0px" && icon !== null && getComputedStyle(icon).color === expected; }, "--text-danger"), "connection read failure leads with the error icon, no left rule");
  await settings.screenshot({ path: join(shots, "05-connections-read-error.png") });
  await app.evaluate(() => Reflect.get(globalThis, "restoreSetupRead")());
  await settings.getByRole("button", { name: "Check Again", exact: true }).first().click(); await readFailure.waitFor({ state: "hidden" });
  await wait(async () => await settings!.getByRole("button", { name: "Check Again", exact: true }).first().isEnabled(), "connection read settled before busy status");
  await (await appWindow(app, settings)).evaluate(window => window.webContents.send("setup:status", { summary: null, causes: {}, checking: false, busy: true, onboardingClosed: true }));
  const busyNotice = settings.getByRole("status").filter({ hasText: "Another window" }); await busyNotice.waitFor();
  check(await busyNotice.evaluate((node, role) => { const icon = node.querySelector(":scope > .doan-alert-icon"); const probe = document.body.appendChild(document.createElement("span")); probe.style.color = `var(${role})`; const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(node).borderLeftWidth === "0px" && icon !== null && getComputedStyle(icon).color === expected; }, "--text-warning"), "setup busy remains a warning notice");
  await (await appWindow(app, settings)).evaluate(window => window.webContents.send("setup:status", { summary: null, causes: {}, checking: false, busy: false, onboardingClosed: true }));
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
  // Fail a real Settings read, then retry it in place; keep a held read from owning navigation.
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("config:read");
    const probe = { calls: 0, fail: true, release: null as null | (() => void), restore: () => { ipcMain.removeHandler("config:read"); ipcMain.handle("config:read", original); } };
    ipcMain.removeHandler("config:read");
    ipcMain.handle("config:read", async (...args) => {
      probe.calls++;
      if (probe.fail) return { kind: "error", message: "Injected config read failure" };
      await new Promise<void>(resolve => { probe.release = resolve; });
      return original(...args);
    });
    Reflect.set(globalThis, "configReadProbe", probe);
  });
  await settings.getByRole("option", { name: "~/brand", exact: true }).click();
  await settings.getByRole("alert").filter({ hasText: "Injected config read failure" }).waitFor();
  await settings.screenshot({ path: join(shots, "06-config-read-error.png") });
  const retry = settings.getByRole("button", { name: "Retry", exact: true });
  check(await retry.count() === 1, "failed config read offers Retry in Settings");
  if (await retry.count()) {
    await app.evaluate(() => { Reflect.get(globalThis, "configReadProbe").fail = false; });
    await retry.focus(); await settings.keyboard.press("Enter");
    await wait(() => app!.evaluate(() => Reflect.get(globalThis, "configReadProbe").release !== null), "retry read held");
    check(await retry.isDisabled(), "retry cannot launch redundant reads");
    await app.evaluate(() => Reflect.get(globalThis, "configReadProbe").release());
    await settings.getByRole("region", { name: "brand settings" }).getByRole("button", { name: "Change…" }).waitFor();
    await settings.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    check(await settings.getByRole("region", { name: "brand settings" }).getByRole("button", { name: "Change…" }).evaluate(node => node === document.activeElement), "successful config Retry restores lost focus to Change");
    check(await settings.getByText("Injected config read failure").count() === 0, "successful retry clears its old read error");
    check(await app.evaluate(() => Reflect.get(globalThis, "configReadProbe").calls) === 2, "retry performs exactly one additional read");
    await app.evaluate(() => { Reflect.get(globalThis, "configReadProbe").fail = true; });
    await settings.getByRole("option", { name: "~/acme", exact: true }).click();
    await settings.getByRole("alert").filter({ hasText: "Injected config read failure" }).waitFor();
    await settings.getByRole("option", { name: "~/brand", exact: true }).click();
    await settings.getByRole("alert").filter({ hasText: "Injected config read failure" }).waitFor();
    await app.evaluate(() => { const probe = Reflect.get(globalThis, "configReadProbe"); probe.fail = false; probe.release = null; });
    await retry.focus(); await settings.keyboard.press("Enter");
    await wait(() => app!.evaluate(() => Reflect.get(globalThis, "configReadProbe").release !== null), "second retry held");
    await settings.getByRole("option", { name: "~/brand", selected: true }).focus();
    await app.evaluate(() => Reflect.get(globalThis, "configReadProbe").release());
    await settings.getByRole("region", { name: "brand settings" }).getByRole("button", { name: "Change…" }).waitFor();
    await settings.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await settings.getByRole("option", { name: "~/brand", selected: true }).evaluate(node => node === document.activeElement), true, "Retry cannot steal focus the user moved to a surviving project row");
  }
  await app.evaluate(() => Reflect.get(globalThis, "configReadProbe").restore());
  await settings.getByRole("option", { name: "~/acme", exact: true }).click();
  await detail.getByRole("button", { name: "Change…" }).waitFor();
  await app.evaluate(({ ipcMain }, heldRoot) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("config:read");
    const probe = { release: null as null | (() => void), restore: () => { ipcMain.removeHandler("config:read"); ipcMain.handle("config:read", original); } };
    ipcMain.removeHandler("config:read"); ipcMain.handle("config:read", async (...args) => {
      if (args[1].root !== heldRoot) return original(...args);
      await new Promise<void>(resolve => { probe.release = resolve; });
      return { kind: "error", message: "Stale previous project error" };
    }); Reflect.set(globalThis, "staleConfigReadProbe", probe);
  }, second);
  await settings.getByRole("option", { name: "~/brand", exact: true }).click();
  await wait(() => app!.evaluate(() => Reflect.get(globalThis, "staleConfigReadProbe").release !== null), "plain read held");
  assert.equal(await settings.getByRole("tab", { name: "Connections" }).isEnabled(), true, "plain reads do not own the pane");
  await settings.getByRole("option", { name: "~/acme", exact: true }).click();
  await detail.getByRole("button", { name: "Change…" }).waitFor();
  await app.evaluate(() => Reflect.get(globalThis, "staleConfigReadProbe").release());
  await settings.waitForTimeout(150);
  assert.equal(await settings.getByText("Stale previous project error").count(), 0, "old selection read cannot overwrite the current project");
  await app.evaluate(() => Reflect.get(globalThis, "staleConfigReadProbe").restore());
  async function pick(path: string) { await app!.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path); }
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => new Promise(resolve => { Reflect.set(globalThis, "settingsPickerCancel", () => resolve({ canceled: true, filePaths: [] })); });
  });
  await detail.getByRole("button", { name: "Change…" }).click();
  await wait(() => app!.evaluate(() => typeof Reflect.get(globalThis, "settingsPickerCancel") === "function"), "config picker opened");
  assert.equal(await detail.getByText("Saving…", { exact: true }).count(), 0, "picking a path is not saving config");
  assert.equal(await detail.getByRole("button", { name: "Change…" }).isDisabled(), true);
  check(await settings.getByRole("tab", { name: "Connections" }).isDisabled(), "picker owns the Settings tab");
  check(await settings.getByRole("option", { name: "~/brand", exact: true }).isDisabled(), "picker owns the local project selection");
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
  await wait(async () => await detail.getByRole("button", { name: "Add…", exact: true }).isEnabled(), "config controls released");
  await settings.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  check(await detail.getByRole("button", { name: "Add…", exact: true }).evaluate(node => node === document.activeElement), "serve settlement restores lost action focus");
  const good = await readFile(join(repo, ".doan/config.json"), "utf8");
  await pick(join(work, "outside.css")); await detail.getByRole("button", { name: "Change…" }).click();
  await detail.getByRole("alert").filter({ hasText: /outside/i }).waitFor(); assert.equal(await readFile(join(repo, ".doan/config.json"), "utf8"), good);
  await settings.screenshot({ path: join(shots, "03-projects-error.png") });
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("config:read");
    ipcMain.removeHandler("config:read"); ipcMain.handle("config:read", () => ({ kind: "error", message: "Injected follow-up read failure" }));
    Reflect.set(globalThis, "restoreFollowupRead", () => { ipcMain.removeHandler("config:read"); ipcMain.handle("config:read", original); });
  });
  await detail.getByRole("button", { name: "Clear", exact: true }).focus(); await settings.keyboard.press("Enter"); await detail.getByText("None", { exact: true }).waitFor();
  await detail.getByRole("alert").filter({ hasText: "Injected follow-up read failure" }).waitFor();
  assert.equal(await detail.getByText("assets", { exact: true }).isVisible(), true, "failed follow-up read keeps last config");
  await wait(async () => await detail.getByRole("button", { name: "Change…" }).isEnabled(), "clear settled");
  await settings.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  check(await detail.getByRole("button", { name: "Change…" }).evaluate(node => node === document.activeElement), "clearing token CSS returns lost focus to Change");
  await app.evaluate(() => Reflect.get(globalThis, "restoreFollowupRead")());
  if (await retry.count()) { await retry.click(); await settings.getByText("Injected follow-up read failure").waitFor({ state: "hidden" }); }

  await detail.getByRole("button", { name: "Remove", exact: true }).focus(); await settings.keyboard.press("Enter"); await detail.getByText("Nothing else is served.", { exact: true }).waitFor();
  await wait(async () => await detail.getByRole("button", { name: "Add…", exact: true }).isEnabled(), "config controls released");
  await settings.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  check(await detail.getByRole("button", { name: "Add…", exact: true }).evaluate(node => node === document.activeElement), "removing the last Serve row returns focus to Add");
  // Hold a write while external targets and local navigation compete for its owner.
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("config:write");
    const probe = { release: null as null | (() => void), restore: () => { ipcMain.removeHandler("config:write"); ipcMain.handle("config:write", original); } };
    ipcMain.removeHandler("config:write"); ipcMain.handle("config:write", async (...args) => {
      await new Promise<void>(resolve => { probe.release = resolve; }); return original(...args);
    }); Reflect.set(globalThis, "configWriteProbe", probe);
  });
  await pick(join(repo, "styles/tokens.css")); await detail.getByRole("button", { name: "Change…" }).click();
  await detail.getByText("Saving…", { exact: true }).waitFor();
  check(await settings.getByRole("tab", { name: "Connections" }).isDisabled(), "write owns the Settings tab");
  check(await settings.getByRole("option", { name: "~/brand", exact: true }).isDisabled(), "write owns local project selection");
  await settings.getByRole("option", { name: "~/brand", exact: true }).evaluate(node => { if (node instanceof HTMLButtonElement) node.click(); });
  await settings.getByRole("tab", { name: "Connections" }).evaluate(node => { if (node instanceof HTMLButtonElement) node.click(); });
  check(await detail.count() === 1, "local row and tab attempts preserve the held write");
  await page.evaluate(() => window.doan.openSettings({ tab: "connections" }));
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), second);
  await settings.waitForTimeout(150);
  check(await detail.count() === 1, "external targets do not unmount a held config write");
  await app.evaluate(() => Reflect.get(globalThis, "configWriteProbe").release());
  await settings.getByRole("option", { name: "~/brand", selected: true }).waitFor();
  await wait(() => settings!.getByRole("option", { name: "~/brand", selected: true }).evaluate(node => node === document.activeElement), "latest queued project retains focus after write settlement");
  await app.evaluate(() => Reflect.get(globalThis, "configWriteProbe").restore());
  await settings.getByRole("option", { name: "~/acme", exact: true }).click();
  await detail.getByRole("button", { name: "Add…", exact: true }).waitFor();
  await pick(join(repo, "assets")); await detail.getByRole("button", { name: "Add…", exact: true }).click(); await serve.waitFor();
  check(await settings.getByRole("tab", { name: "Connections" }).isDisabled(), "serve confirmation owns the tab");
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), second);
  await page.evaluate(() => window.doan.openSettings({ tab: "connections" }));
  await settings.waitForTimeout(150);
  check(await serve.isVisible(), "external targets preserve the serve confirmation");
  await settings.screenshot({ path: join(shots, "07-serve-confirmation.png") });
  if (await serve.isVisible()) await settings.keyboard.press("Escape");
  await settings.getByRole("tab", { name: "Connections", selected: true }).waitFor();
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), repo);
  await detail.getByRole("button", { name: "Change…" }).waitFor();
  await pick(join(repo, "assets")); await detail.getByRole("button", { name: "Add…", exact: true }).click(); await serve.waitFor();
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), second);
  await settings.waitForTimeout(150);
  check(await serve.isVisible(), "serve approval retains its owner before applying the queued target");
  if (await serve.isVisible()) {
    await serve.getByRole("button", { name: "Add to Serve" }).click();
    await settings.getByRole("option", { name: "~/brand", selected: true }).waitFor();
    assert.deepEqual(JSON.parse(await readFile(join(repo, ".doan/config.json"), "utf8")).serve, ["assets"]);
  }
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), repo);
  await detail.getByRole("button", { name: "Change…" }).waitFor();
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
  await settings.getByRole("alert").waitFor();
  check((await settings.getByRole("alert").innerText()).includes("Couldn’t open this action."), "forward refusal does not diagnose a changed project");
  assert.equal(await setup.innerText(), beforeSetup, "forwarding cannot replace the open main dialog");
  assert.equal(await settings.getByRole("option").filter({ hasText: "~/gone" }).count(), 1, "forwarding cannot remove a project behind the modal");
  await page.keyboard.press("Escape");
  await settings.getByRole("option").filter({ hasText: "~/plain" }).click();
  await settings.getByRole("region", { name: "plain settings" }).getByRole("button", { name: "Remove", exact: true }).click();
  await settings.getByRole("option").filter({ hasText: "~/plain" }).waitFor({ state: "hidden" });
  await settings.getByRole("option", { name: "~/acme", selected: true }).waitFor();
  // A worktree row names its branch in the heading and in the region's name.
  await settings.getByRole("option").filter({ hasText: "~/branched" }).click();
  const branchDetail = settings.getByRole("region", { name: `branched (${branchName}) settings`, exact: true });
  assert.equal(await branchDetail.locator(".pj-name").textContent(), `branched ${branchName}`);
  check(await branchDetail.evaluate(node => node.scrollWidth <= node.clientWidth), "long branch cannot overflow the Settings detail");
  check(await settings.getByRole("option").filter({ hasText: "~/branched" }).locator(".name").getAttribute("title") === branchName, "truncated branch retains its full text");
  await branchDetail.getByRole("button", { name: "Change…" }).scrollIntoViewIfNeeded();
  check(await branchDetail.getByRole("button", { name: "Change…" }).evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), "long branch leaves config actions in the viewport");
  await settings.screenshot({ path: join(shots, "04-long-branch.png") });
  await writeFile(join(branched, ".doan/config.json"), '{"v":2}');
  const detailsAction = settings.getByRole("region").getByRole("button", { name: /Details/ });
  await detailsAction.waitFor();
  check(await detailsAction.innerText() === "Open Details in Main", "Settings Details label describes forwarding to main");
  await homeRow(page, branched).getByText("Config error", { exact: true }).waitFor();
  await detailsAction.click();
  await page.locator(".toast").waitFor();
  const forwardedDetails = await page.locator(".toast .msg").innerText();
  await homeRow(page, branched).getByRole("button", { name: "Details", exact: true }).click();
  assert.equal(forwardedDetails, await homeRow(page, branched).locator(".wt-detail").innerText());
  assert.equal(await settings.getByRole("region").getByText(/unsupported config version/i).count(), 0, "Settings retains its narrow project projection");
  await menu(app, settings, "Close Window"); await wait(async () => settings!.isClosed(), "final Settings closed");
  await menu(app, page, "Settings…"); settings = await settingsPage(app); await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  assert.equal(await appWindowCount(app), 2);
  const quitLabel = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.flatMap(item => item.submenu?.items ?? []).find(item => item.role === "quit")!.label);
  await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "settingsClipboard")); });
  clipboardSaved = false;
  const closed = app.waitForEvent("close"); await menu(app, settings, quitLabel); await closed; await closeApp(app);
  assert.equal(page.isClosed(), true); assert.equal(settings.isClosed(), true); app = undefined;
  assert.deepEqual(errors, []);
  assert.deepEqual(regressions, [], "Settings UX regressions");
  console.log(`settings screenshots: ${shots}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: join(shots, "failure-main.png") }).catch(console.error);
  if (settings && !settings.isClosed()) await settings.screenshot({ path: join(shots, "failure-settings.png") }).catch(console.error);
  throw error;
} finally {
  try { if (app && clipboardSaved) await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "settingsClipboard")); }); } finally { await guard.finish(); }
}

console.log("settings: PASS");
