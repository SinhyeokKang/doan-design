import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright";

const { rememberApp, waitFor, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, requestProject, enterProject, removeHomeProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow, appWindowCount, menu: appMenu }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/ob-"));
const home = join(work, "h"), data = join(work, "u"), bin = join(work, "b"), cli = join(work, "doan");
const shell = join(work, "zsh"), calls = join(work, "calls.jsonl");
const claudeConfig = join(home, ".claude"), codexConfig = join(home, ".codex");
const cliLink = join(home, ".local/bin/doan"), stub = join(home, ".agents/skills/doan/SKILL.md"), claudeLink = join(claudeConfig, "skills/doan");
const shots = join(root, ".scratch/runtime-test", `onboarding-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const before = await realState();
const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: claudeConfig, CODEX_HOME: codexConfig, DOAN_CLI: cli, DOAN_RUNTIME: join(data, "runtime.json") };
let app!: ElectronApplication;
let page!: Page;
let running: ElectronApplication | undefined;
const guard = suiteGuard({ name: "onboarding", app: () => running, verify: () => assertRealState(before), cleanup: () => rm(work, { recursive: true, force: true }) });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const wait = waitFor;
async function exists(path: string) { try { await readFile(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } }
const wizard = () => page.getByRole("dialog", { name: "Set Up doan", exact: true });
const button = (name: string | RegExp) => wizard().getByRole("button", { name, exact: true });
const stepButton = (name: string) => wizard().getByRole("list", { name: "Steps" }).getByRole("button").filter({ hasText: name });
// Steps 1–2 draw the Settings connection rows; the footer keeps its own Check Again.
const card = (row: "cli" | "claude" | "codex") => wizard().locator(`.cn-row[data-connection="${row}"]`);
const footerCheck = () => wizard().locator(".ob-foot").getByRole("button", { name: "Check Again", exact: true });
async function details(row: "cli" | "claude" | "codex") { const name = card(row).locator(".cn-name"); if (await name.getAttribute("aria-expanded") !== "true") await name.click(); }
async function shot(name: string) { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`screenshot: ${path}`); }
async function assertProjectPath(path: Locator, boundary: Locator, expected: string, label: string) {
  const measured = await path.evaluate(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { right: rect.right, height: rect.height, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      whiteSpace: css.whiteSpace, overflow: css.overflow, overflowWrap: css.overflowWrap, wordBreak: css.wordBreak, textOverflow: css.textOverflow, title: node.getAttribute("title") };
  });
  const edge = await boundary.evaluate(node => node.matches("dialog") ? node.getBoundingClientRect().right - parseFloat(getComputedStyle(node).paddingRight) : node.getBoundingClientRect().left);
  console.log(`project-path geometry: ${label} ${JSON.stringify({ ...measured, boundaryLeft: edge })}`);
  assert.ok(measured.right <= edge, `${label}: project path must end before buttons`);
  assert.ok(measured.scrollWidth > measured.clientWidth, `${label}: long path exercises truncation`);
  assert.equal(measured.whiteSpace, "nowrap");
  assert.equal(measured.overflow, "hidden");
  assert.equal(measured.textOverflow, "ellipsis");
  assert.equal(measured.title, expected);
}
const menu = (name: string) => appMenu(app, page, name);
async function launch() {
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${data}`], env }); rememberApp(app); running = app;
  page = await app.firstWindow(); page.setDefaultTimeout(15_000);
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    Reflect.set(globalThis, "obSavedClipboard", await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))));
  });
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), data);
}
const visible = async () => (await appWindow(app, page)).evaluate(window => window.isVisible());
async function quit() { await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "obSavedClipboard")); }); await closeApp(app); running = undefined; }
async function wizardSession() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("onboarding session not received within 15 s")); }, 15_000);
    const stop = window.doan.onOnboardingOpen(opened => { clearTimeout(timer); stop(); resolve(opened); });
  }));
}
async function ready() { await wizard().waitFor(); await wait(async () => !await footerCheck().isDisabled(), "machine read"); }
// The setup menu item is gone; a wizard comes back only on a launch without onboarding.json.
async function reopen() { await quit(); await rm(join(data, "onboarding.json"), { force: true }); await launch(); await ready(); }
async function check() { await footerCheck().click(); await wait(async () => !await footerCheck().isDisabled(), "Check Again settled"); }
async function go(name: string) { await stepButton(name).click(); }
async function closed() { await wizard().waitFor({ state: "hidden" }); }
async function pick(path: string) { await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path); }
async function open(path: string) { await pick(path); await page.evaluate(() => window.doan.openFolder()); await goHome(page); }
async function init(path: string) { await exec(cli, ["init", "--json", "--repo", path], { env }); }
async function newRepo(name: string) { const path = join(work, name); await mkdir(path, { recursive: true }); await exec("git", ["init", path], { env }); await exec("git", ["-C", path, "config", "user.name", "Onboarding Test"], { env }); await exec("git", ["-C", path, "config", "user.email", "onboarding@example.test"], { env }); return path; }
async function records(): Promise<{ agent: string; args: string[] }[]> { return (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
async function mutations() { return (await records()).filter(call => ["add", "remove"].includes(call.args[1] ?? "")); }
async function mode(agent: string, value: string) { await writeFile(join(work, `${agent}.mode`), value); }
async function shellMode(value: "normal" | "missing" | "timeout") {
  await writeFile(shell, `#!/bin/sh\n${value === "timeout" ? 'exec /bin/sleep 8' : `PATH=${value === "missing" ? '/usr/bin:/bin' : `${bin}:/usr/bin:/bin`}; export PATH\neval "$2"`}\n`, { mode: 0o755 });
}
async function connect(agent: "claude" | "codex") {
  await card(agent).getByRole("button", { name: "Connect", exact: true }).click();
  await wait(async () => !await footerCheck().isDisabled(), `${agent} connect`, 35_000);
}
async function busy() {
  await wait(() => button(/^Close/).isDisabled(), "wizard busy propagated");
  assert.equal(await button(/^Close/).isDisabled(), true);
  for (const el of await wizard().getByRole("list", { name: "Steps" }).getByRole("button").all()) assert.equal(await el.isDisabled(), true);
  for (const el of await wizard().locator(".ob-foot").getByRole("button").all()) assert.equal(await el.isDisabled(), true);
  await page.keyboard.press("Escape"); assert.equal(await wizard().isVisible(), true);
}
async function clipboardGate() {
  await app.evaluate(async ({ clipboard }) => {
    const previous = await clipboard.readText();
    const original = clipboard.writeText.bind(clipboard);
    Reflect.set(globalThis, "obClipboard", { original, previous, text: null, release: null });
    clipboard.writeText = text => new Promise<void>((resolve, reject) => {
      const gate = Reflect.get(globalThis, "obClipboard"); gate.text = text;
      gate.release = async (fail: boolean) => { if (fail) reject(new Error("Injected clipboard failure")); else { await original(text); resolve(); } };
    });
  });
}
async function releaseCopy(fail: boolean) { await wait(() => app.evaluate(() => typeof Reflect.get(globalThis, "obClipboard").release === "function"), "clipboard pending"); await app.evaluate(async ({ clipboard }, fail) => { const gate = Reflect.get(globalThis, "obClipboard"); if (await clipboard.readText() !== gate.previous) throw new Error("clipboard changed before settlement"); const release = gate.release; gate.release = null; await release(fail); gate.previous = await clipboard.readText(); }, fail); }
async function restoreCopy() { await app.evaluate(({ clipboard }) => { clipboard.writeText = Reflect.get(globalThis, "obClipboard").original; }); }
async function focusIs(locator: Locator) { return locator.evaluate(node => node === document.activeElement); }
const subject = (scope: Locator) => scope.getByRole("textbox", { name: "What do you want to design?", exact: true });
const waiting = (scope: Locator) => scope.getByRole("status").filter({ hasText: "Waiting for a canvas in design/…" });
const overview = () => page.getByRole("region", { name: "Overview", exact: true });
const openCanvas = () => page.locator(".crumbs .canvas");
const canvasHtml = (title: string) => `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${title.toLowerCase()}"><meta name="doan:width" content="800"><style>button{margin:50px;padding:30px}</style><button data-doan-id="target">Target</button>`;
// The renderer saw `root` listed with `path` (main publishes after its own read).
async function listed(root: string, path: string) {
  await wait(() => page.evaluate(([root, path]) => new Promise<boolean>(resolve => { const stop = window.doan.onFolders(entries => { stop(); resolve(entries.some(e => e.path === root && e.kind === "list" && e.canvases.some(row => row.path === path))); }); }), [root, path] as const), `${root} lists ${path}`);
}
async function setUpRepo(name: string) { const path = await newRepo(name); await init(path); return path; }
async function copyWaiting(scope: Locator, text: string) { await subject(scope).fill(text); await scope.getByRole("button", { name: "Copy", exact: true }).click(); await waiting(scope).waitFor(); }

try {
  await Promise.all([mkdir(home, { recursive: true }), mkdir(data), mkdir(bin), mkdir(shots, { recursive: true }), mkdir(claudeConfig, { recursive: true }), mkdir(codexConfig, { recursive: true })]);
  await writeFile(calls, ""); await shellMode("normal");
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const agentScript = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const agent = path.basename(process.argv[1]), args = process.argv.slice(2), work = ${JSON.stringify(work)};
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({agent,args})+'\\n');
const mode = fs.existsSync(path.join(work,agent+'.mode')) ? fs.readFileSync(path.join(work,agent+'.mode'),'utf8') : '';
const config = agent === 'claude' ? path.join(process.env.CLAUDE_CONFIG_DIR,'.claude.json') : path.join(process.env.CODEX_HOME,'config.toml');
if (mode === 'timeout') { setTimeout(() => {}, 15000); }
else if (args[1] === 'get') {
 if (mode === 'unknown') { console.log('bad-json'); }
 else if (fs.existsSync(config)) { console.log(JSON.stringify({name:'doan',enabled:true,transport:{type:'stdio',command:${JSON.stringify(cliLink)},args:['mcp']}})); }
 else { console.error("Error: No MCP server named 'doan' found."); process.exitCode=1; }
} else if (mode === 'fail') { console.error('Injected add failure'); process.exitCode=1; }
else if (args[1] === 'remove') { fs.rmSync(config,{force:true}); }
else if (args[1] === 'add') {
 const command=args[args.indexOf('--')+1];
 const save=()=>fs.writeFileSync(config,agent==='claude'?JSON.stringify({mcpServers:{doan:{command,args:['mcp']}}}):'[mcp_servers.doan]\\ncommand = '+JSON.stringify(command)+'\\nargs = ["mcp"]\\n');
 if(mode==='hold') { const timer=setInterval(()=>{if(!fs.existsSync(path.join(work,'agent.gate'))){clearInterval(timer);save();}},20); } else save();
} else { console.error('Unexpected fake agent invocation'); process.exitCode=2; }
`;
  for (const name of ["claude", "codex"]) await writeFile(join(bin, name), agentScript, { mode: 0o755 });
  console.log("onboarding: 1 lifecycle, focus and step navigation");
  await launch(); await ready();
  assert.equal(await wizard().locator(".ob-title").evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Tab"); assert.equal(await focusIs(button(/^Close/)), true);
  await page.keyboard.press("Shift+Tab"); assert.equal(await focusIs(button("Continue")), true);
  await page.keyboard.press("Tab"); assert.equal(await focusIs(button(/^Close/)), true);
  // The newest stale reply is a failed read, including before this wizard has any state.
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers");
    Reflect.set(globalThis, "obReadOriginal", handlers.get("onboarding:read"));
    ipcMain.removeHandler("onboarding:read");
    ipcMain.handle("onboarding:read", () => ({ kind: "stale" }));
  });
  await page.reload(); await ready();
  await card("cli").getByText("Couldn’t check", { exact: true }).waitFor();
  assert.equal(await card("cli").getByText("Checking…", { exact: true }).count(), 0);
  await shot("00-read-failure");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("onboarding:read"); ipcMain.handle("onboarding:read", Reflect.get(globalThis, "obReadOriginal"));
  });
  await check(); assert.equal(await card("cli").getByText("Couldn’t check", { exact: true }).count(), 0);
  await go("First prompt");
  assert.equal(await wizard().locator(".fp-none p").textContent(), "Add a project first. Your first canvas goes in its design/ folder.");
  await button("Add Project…").waitFor(); assert.equal(await subject(wizard()).count(), 0);
  assert.equal(await stepButton("Agents").getAttribute("aria-label"), null);
  assert.equal(await stepButton("Project").getAttribute("aria-label"), null);
  await go("CLI"); await button("Skip").click();
  assert.equal(await stepButton("CLI").getAttribute("aria-label"), null);
  const session = await wizardSession();
  await menu("Close Window"); await wait(async () => !await visible(), "hidden");
  await app.evaluate(({ app }) => app.emit("activate")); await wait(visible, "shown");
  assert.deepEqual(await wizardSession(), session);
  assert.equal(await stepButton("Agents").getAttribute("aria-current"), "step");
  const electron = createRequire(import.meta.url)("electron") as string;
  const second = spawn(electron, [join(root, "app"), `--user-data-dir=${data}`], { env, stdio: "ignore" });
  const secondCode = await new Promise<number | null>((resolve, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error("second instance hung")); }, 10_000); second.on("exit", code => { clearTimeout(timer); resolve(code); }); second.on("error", reject); });
  assert.equal(secondCode, 0); assert.equal(await appWindowCount(app), 1);
  assert.deepEqual(await wizardSession(), session);
  await quit(); assert.equal(await exists(join(data, "onboarding.json")), false, "quit does not dismiss");
  await launch(); await ready(); await page.keyboard.press("Escape"); await closed();
  // Exercise Home's public status projection without changing the setup machine.
  const mainWindow = await appWindow(app, page);
  await mainWindow.evaluate(win => win.webContents.send("setup:status", {
    summary: { cli: "couldnt-check", claude: "couldnt-check", codex: "couldnt-check" },
    causes: {}, checking: false, busy: false, onboardingClosed: true,
  }));
  await wait(async () => await page.locator(".conns .st").allTextContents().then(labels => labels.every(label => label === "Couldn’t check")), "Home failed first result");
  assert.equal(await page.getByRole("button", { name: "doan command: Couldn’t check", exact: true }).isEnabled(), true);
  await shot("00-home-read-failure");
  await mainWindow.evaluate(win => win.webContents.send("setup:status", {
    summary: { cli: "needs-attention", claude: "couldnt-check", codex: "couldnt-check" },
    causes: { cli: { kind: "cli-dangling" } }, checking: false, busy: true, onboardingClosed: true,
  }));
  const banner = page.getByRole("status", { name: "Connection problem" });
  await banner.getByText("Another window is running a setup step. These buttons work again when it finishes.").waitFor();
  assert.equal(await banner.getByRole("button", { name: "Check Again", exact: true }).isDisabled(), true);
  await shot("00-home-busy");
  await mainWindow.evaluate(win => win.webContents.send("setup:status", {
    summary: { cli: "needs-attention", claude: "couldnt-check", codex: "couldnt-check" },
    causes: { cli: { kind: "cli-dangling" } }, checking: true, busy: false, onboardingClosed: true,
  }));
  await banner.getByRole("button", { name: "Checking…", exact: true }).waitFor();
  assert.equal(await banner.getByText(/Another window/).count(), 0);
  await page.evaluate(() => window.doan.checkSetupAgain());
  await wait(async () => (await page.locator(".conns .st").allTextContents()).every(label => label !== "Couldn’t check" && label !== "Checking…"), "Home recovers");
  assert.deepEqual(JSON.parse(await readFile(join(data, "onboarding.json"), "utf8")), {});
  await quit(); await launch(); await page.getByRole("button", { name: "Add Project…", exact: true }).first().waitFor(); assert.equal(await wizard().count(), 0);
  await reopen(); assert.equal(await visible(), true); await button(/^Close/).click(); await closed(); await quit();
  await writeFile(join(data, "onboarding.json"), "{broken"); await launch(); await ready();
  await shot("01-first-run");

  console.log("onboarding: 2 CLI blockers, replacement and delayed PATH copy");
  await mkdir(join(home, ".local/bin"), { recursive: true }); await writeFile(cliLink, "occupied"); await check();
  await card("cli").getByText(/is in use by something else/).waitFor(); await card("cli").getByText("Path is blocked.", { exact: true }).waitFor();
  assert.deepEqual(await card("cli").locator(".cn-end button").allTextContents(), ["Check Again"]);
  assert.equal(await readFile(cliLink, "utf8"), "occupied"); await rm(cliLink); await symlink("/missing/other-doan", cliLink); await check();
  await card("cli").getByText("Link is broken.", { exact: true }).waitFor(); await shot("01b-broken-link");
  await button("Fix…").click(); let confirm = page.getByRole("alertdialog", { name: "Fix the doan link?" }); await confirm.waitFor();
  assert.equal(await confirm.locator(".ob-compare dd").first().textContent(), "/missing/other-doan (missing)");
  assert.equal(await focusIs(confirm.getByRole("button", { name: "Cancel", exact: true })), true);
  await page.keyboard.press("Escape"); await confirm.waitFor({ state: "hidden" }); assert.equal(await wizard().isVisible(), true);
  assert.equal(await readlink(cliLink), "/missing/other-doan"); await check(); await button("Fix…").click();
  await confirm.getByRole("button", { name: "Fix Link", exact: true }).click(); await wait(async () => await readlink(cliLink) === cli, "CLI replaced"); await check(); confirm = page.getByRole("alertdialog");
  await card("cli").getByText("Connected", { exact: true }).waitFor(); await details("cli");
  await card("cli").getByText("Use doan in your terminal", { exact: false }).waitFor(); await card("cli").getByText("~/.zshrc", { exact: true }).waitFor();
  await clipboardGate(); await button("Copy").click(); await button("Copying…").waitFor(); await busy();
  await releaseCopy(true); await button("Retry copy").waitFor(); assert.equal(await button(/^Close/).isDisabled(), false);
  const pathError = card("cli").getByRole("alert");
  assert.match(await pathError.getAttribute("class") ?? "", /ob-msg error/);
  await shot("01-path-copy-failed");
  await button("Retry copy").click(); await busy(); await releaseCopy(false); await button("Copied").waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'export PATH="$HOME/.local/bin:$PATH"'); await restoreCopy();
  await page.keyboard.press("Escape"); await closed(); await reopen(); confirm = page.getByRole("alertdialog");

  await rm(cliLink); await check(); await card("cli").getByRole("button", { name: "Connect", exact: true }).click(); await wait(async () => { try { return await readlink(cliLink) === cli; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } }, "missing link installed");
  console.log("onboarding: 3 agent detection, partial setup and MCP states");
  await shellMode("missing"); await go("Agents"); await check();
  for (const agent of ["claude", "codex"] as const) assert.equal(await card(agent).getByText("Not installed", { exact: true }).count(), 1); assert.equal(await wizard().getByRole("button", { name: "Connect", exact: true }).count(), 0);
  await wizard().getByRole("status").filter({ hasText: "doan works through Claude Code or Codex. Install one, then choose Check Again." }).waitFor();
  await app.evaluate(({ shell }) => { const opened: string[] = []; Reflect.set(globalThis, "obOpened", opened); shell.openExternal = async url => { opened.push(url); }; });
  await button("Install Claude Code ↗").click(); await button("Install Codex ↗").click();
  await wait(async () => (await app.evaluate(() => Reflect.get(globalThis, "obOpened").length)) === 2, "install pages opened");
  assert.deepEqual(await app.evaluate(() => Reflect.get(globalThis, "obOpened")), ["https://code.claude.com/docs/en/setup", "https://learn.chatgpt.com/docs/codex/cli"]);
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers");
    Reflect.set(globalThis, "obInstallOriginal", handlers.get("setup:open-external"));
    ipcMain.removeHandler("setup:open-external");
    ipcMain.handle("setup:open-external", () => false);
  });
  await button("Install Claude Code ↗").click();
  await wizard().getByRole("alert").filter({ hasText: "Couldn’t open the install page." }).waitFor();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("setup:open-external");
    ipcMain.handle("setup:open-external", () => { throw new Error("Injected install failure"); });
  });
  await button("Install Codex ↗").click();
  await wizard().getByRole("alert").filter({ hasText: "Injected install failure" }).waitFor();
  await shot("02-install-failure");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("setup:open-external"); ipcMain.handle("setup:open-external", Reflect.get(globalThis, "obInstallOriginal"));
  });
  await button("Install Codex ↗").click();
  await wait(async () => await wizard().getByRole("alert").count() === 0, "install retry clears error");
  const reviewFailures: string[] = [];
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("setup:open-external");
    Reflect.set(globalThis, "obInstallPending", []);
    ipcMain.handle("setup:open-external", () => new Promise((resolve, reject) => Reflect.get(globalThis, "obInstallPending").push({ resolve, reject })));
  });
  for (const failure of ["false", "reject"] as const) for (const oldFirst of [false, true]) {
    await button("Install Claude Code ↗").click(); await button("Install Codex ↗").click();
    await wait(async () => await app.evaluate(() => Reflect.get(globalThis, "obInstallPending").length) === 2, "two install requests held");
    for (const index of oldFirst ? [0, 1] : [1, 0]) {
      await app.evaluate((_electron, { index, failure }) => {
        const request = Reflect.get(globalThis, "obInstallPending")[index];
        if (index === 0 && failure === "reject") request.reject(new Error("Old install failure"));
        else request.resolve(index === 1);
      }, { index, failure });
      await pause(100);
    }
    const alerts = await wizard().getByRole("alert").allTextContents();
    console.log("install ordering", { failure, oldFirst, alerts });
    if (alerts.length) reviewFailures.push(`stale install error: ${failure}, oldFirst=${oldFirst}`);
    await app.evaluate(() => Reflect.set(globalThis, "obInstallPending", []));
  }
  // A newer failure must survive an older successful completion.
  await button("Install Claude Code ↗").click(); await button("Install Codex ↗").click();
  await wait(async () => await app.evaluate(() => Reflect.get(globalThis, "obInstallPending").length) === 2, "latest failure requests held");
  await app.evaluate(() => Reflect.get(globalThis, "obInstallPending")[1].reject(new Error("Latest install failure")));
  await wizard().getByRole("alert").filter({ hasText: "Latest install failure" }).waitFor();
  await app.evaluate(() => Reflect.get(globalThis, "obInstallPending")[0].resolve(true));
  await pause(100);
  assert.match(await wizard().getByRole("alert").textContent() ?? "", /Latest install failure/);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("setup:open-external"); ipcMain.handle("setup:open-external", Reflect.get(globalThis, "obInstallOriginal"));
  });
  await button("Install Codex ↗").click();
  await wait(async () => await wizard().getByRole("alert").count() === 0, "latest failure retry clears error");
  await shellMode("timeout"); await check(); await wizard().getByText(/didn’t answer in time/).first().waitFor();
  for (const agent of ["claude", "codex"] as const) {
    await card(agent).getByText("Couldn’t check", { exact: true }).waitFor();
    assert.equal(await card(agent).getByText("Not installed", { exact: true }).count(), 0);
  }
  await shellMode("normal"); await check();
  for (const agent of ["claude", "codex"] as const) for (const state of ["missing", "other", "blocked"]) {
    await rm(cliLink, { force: true }); await rm(join(home, ".agents"), { force: true, recursive: true }); await rm(claudeLink, { force: true });
    if (state === "other") await symlink("/missing/other", cliLink); if (state === "blocked") await writeFile(cliLink, "blocker");
    await check(); const prior = await mutations(); await connect(agent);
    assert.ok((await readFile(stub, "utf8")).includes("doan skill"));
    if (agent === "claude") assert.equal(await readlink(claudeLink), "../../.agents/skills/doan");
    assert.deepEqual(await mutations(), prior, `${agent}/${state}: no MCP mutation`);
    // main's refusal names step 1; the row words it like the dimmed MCP item.
    await card(agent).locator('.cn-say[role="alert"]').getByText("Connect the doan command first; MCP needs it.", { exact: true }).waitFor();
    assert.equal(await card(agent).getByText("Failed", { exact: true }).count(), 0);
  }
  await rm(cliLink); await symlink(cli, cliLink); await check();
  // An unreadable registration offers Check Again only, so nothing can write over it.
  await mode("codex", "unknown"); await check(); const unknownMutations = await mutations();
  await card("codex").getByText("Couldn’t check", { exact: true }).waitFor(); await card("codex").getByText(/Unreadable registration/).waitFor();
  assert.deepEqual(await card("codex").locator(".cn-end button").allTextContents(), ["Check Again"]);
  await card("codex").getByRole("button", { name: "Check Again", exact: true }).click(); await wait(async () => !await footerCheck().isDisabled(), "row Check Again settled");
  assert.deepEqual(await mutations(), unknownMutations, "unknown Codex MCP causes no mutation");
  await writeFile(join(bin, "codex"), "#!/missing/interpreter\n", { mode: 0o755 }); await check(); await card("codex").getByText(/Couldn't run Codex.*ENOENT/).waitFor();
  await writeFile(join(bin, "codex"), agentScript, { mode: 0o755 }); await mode("codex", "timeout"); await check(); await card("codex").getByText(/didn’t answer in 10 s/).waitFor(); await mode("codex", ""); await check();
  await writeFile(stub, "user edits"); await check(); await card("claude").getByText("Skill was changed.", { exact: true }).waitFor(); await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.equal(await readFile(stub, "utf8"), "user edits");
  await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor();
  await confirm.getByText(/doan 0.1.0/).waitFor(); await confirm.getByRole("button", { name: "Replace Skill", exact: true }).click();
  await wait(async () => !await footerCheck().isDisabled(), "stub replace");
  assert.ok((await readFile(stub, "utf8")).includes("doan skill"));
  await mode("codex", "fail"); await connect("codex"); await card("codex").getByText(/Injected add failure/).waitFor();
  assert.ok(await exists(stub)); assert.equal(await exists(join(codexConfig, "config.toml")), false);
  const addsBefore = (await records()).filter(call => call.agent === "codex" && call.args[1] === "add").length;
  await mode("codex", "hold"); await writeFile(join(work, "agent.gate"), ""); await card("codex").getByRole("button", { name: "Connect", exact: true }).click();
  await wait(async () => (await records()).filter(call => call.agent === "codex" && call.args[1] === "add").length > addsBefore, "fresh agent add started"); await busy(); await rm(join(work, "agent.gate"));
  await wait(async () => !await footerCheck().isDisabled(), "Connect settled"); await mode("codex", "");
  for (const agent of ["claude", "codex"]) assert.ok((await mutations()).some(call => call.agent === agent && JSON.stringify(call.args) === JSON.stringify(["mcp", "add", ...(agent === "claude" ? ["--scope", "user"] : []), "doan", "--", cliLink, "mcp"])));
  await writeFile(join(claudeConfig, ".claude.json"), JSON.stringify({ mcpServers: { doan: { command: "/other", args: [] } } })); await check();
  const prior = await mutations(); await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.deepEqual(await mutations(), prior);
  await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Replace MCP Registration", exact: true }).click();
  await wait(async () => !await footerCheck().isDisabled(), "MCP replace");
  assert.deepEqual((await mutations()).slice(-2).map(call => call.args), [["mcp", "remove", "--scope", "user", "doan"], ["mcp", "add", "--scope", "user", "doan", "--", cliLink, "mcp"]]);
  await rm(claudeLink); await symlink("/missing/skill", claudeLink); await check();
  await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.equal(await readlink(claudeLink), "/missing/skill");
  await card("claude").getByRole("button", { name: "Fix…", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Replace Link", exact: true }).click(); await wait(async () => !await footerCheck().isDisabled(), "skill link replaced"); assert.equal(await readlink(claudeLink), "../../.agents/skills/doan");
  console.log("onboarding: symlinked Claude skills and shared-directory alias");
  const skills = join(claudeConfig, "skills"), realSkills = join(home, "custom/deep/skills");
  await rm(skills, { recursive: true }); await mkdir(realSkills, { recursive: true }); await symlink(realSkills, skills);
  await check(); await connect("claude");
  assert.equal(await readlink(join(realSkills, "doan")), relative(realSkills, dirname(stub)));
  assert.equal(await realpath(claudeLink), await realpath(dirname(stub)));
  assert.equal(await readlink(skills), realSkills);
  await details("claude"); await card("claude").locator(".ob-item").filter({ hasText: "Skill link" }).getByText("Installed", { exact: true }).waitFor();
  await shot("02a-symlinked-skills");

  await rm(skills); await symlink(join(home, ".agents/skills"), skills);
  const unchangedPaths = [skills, join(home, ".agents/skills"), dirname(stub), stub, join(claudeConfig, ".claude.json")];
  const stamps = async () => Promise.all(unchangedPaths.map(async path => {
    const stat = await lstat(path);
    return { path, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, content: stat.isSymbolicLink() ? await readlink(path) : stat.isDirectory() ? await readdir(path) : await readFile(path, "utf8") };
  }));
  const aliasBefore = await stamps(), aliasMutations = await mutations();
  await check();
  await details("claude"); await card("claude").getByText("Uses the shared skill folder", { exact: true }).waitFor();
  await card("claude").locator(".ob-item").filter({ hasText: "Skill link" }).getByText("Installed", { exact: true }).waitFor();
  assert.equal(await card("claude").getByRole("button", { name: "Connect", exact: true }).count(), 0);
  await check();
  assert.deepEqual(await stamps(), aliasBefore, "recognizing the shared skills alias writes nothing");
  assert.deepEqual(await mutations(), aliasMutations, "installed MCP is not rewritten");
  assert.equal((await lstat(claudeLink)).isDirectory(), true);
  await shot("02b-shared-skills");
  await rm(skills); await mkdir(skills); await symlink("../../.agents/skills/doan", claudeLink); await check();
  await shot("02-agents-connected");

  console.log("onboarding: 4 project init, pending copy and first prompt");
  const project = await newRepo('company-monorepo/packages/applications/marketing-web-frontend/project <tag> & "quote"'); const token = join(project, "Tokens.css"); await writeFile(token, ":root { --brand: red; }");
  // Step 4's Add Project… runs Home's add flow; a repository that is not set up goes back to step 3's form.
  await go("First prompt");
  const addParent = join(work, "add-repos");
  await mkdir(addParent);
  const addA = await setUpRepo("add-repos/one"), addB = await setUpRepo("add-repos/two");
  await pick(addParent); await button("Add Project…").click();
  const checklist = () => wizard().getByRole("dialog", { name: "Add projects", exact: true });
  await checklist().waitFor();
  await wait(async () => !await checklist().getByRole("button", { name: "Add 2 Projects", exact: true }).isDisabled(), "step 4 scan finished");
  assert.equal(await checklist().getByRole("checkbox", { checked: true }).count(), 2);
  await wizard().locator(".ob-title").evaluate(node => node.focus());
  assert.equal(await checklist().evaluate(node => node.contains(document.activeElement)), true, "wizard behind scan is inert");
  await page.keyboard.press("Tab");
  assert.equal(await checklist().evaluate(node => node.contains(document.activeElement)), true);
  await app.evaluate(({ ipcMain }) => {
    Reflect.set(globalThis, "obCandidatesOriginal", Reflect.get(ipcMain, "_invokeHandlers").get("folders:add-candidates"));
    ipcMain.removeHandler("folders:add-candidates");
    ipcMain.handle("folders:add-candidates", () => new Promise((resolve, reject) => Reflect.set(globalThis, "obCandidatesPending", { resolve, reject })));
  });
  const submitCandidates = () => checklist().getByRole("button", { name: "Add 2 Projects", exact: true });
  for (const [attempt, outcome] of (["reject", "reject", "unavailable", "reject", "reject", "unavailable"] as const).entries()) {
    if (attempt < 3) await submitCandidates().click();
    else { await submitCandidates().focus(); await page.keyboard.press("Enter"); }
    await wait(async () => await submitCandidates().isDisabled(), "checklist submit pending");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await shot(`03-checklist-${attempt}-pending`);
    console.log("checklist pending focus:", await page.evaluate(() => document.activeElement?.tagName));
    await app.evaluate((_electron, outcome) => {
      const pending = Reflect.get(globalThis, "obCandidatesPending");
      if (outcome === "reject") pending.reject(new Error("Injected checklist failure"));
      else pending.resolve({ kind: "unavailable" });
    }, outcome);
    await checklist().getByRole("alert").filter({ hasText: outcome === "reject" ? "Injected checklist failure" : "This checklist is no longer available." }).waitFor();
    await wait(async () => !await submitCandidates().isDisabled(), "checklist retry enabled");
    const focused = await checklist().evaluate(node => node.contains(document.activeElement));
    console.log("checklist settled focus:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 400)));
    if (!focused) {
      reviewFailures.push(`checklist focus lost: ${outcome}`);
      await page.keyboard.press("Escape");
      console.log("checklist Escape after lost focus:", { childVisible: await checklist().isVisible(), wizardVisible: await wizard().isVisible() });
    }
    await shot(`03-checklist-${attempt}-${outcome}`);
    if (focused && attempt % 3 > 0) {
      await page.keyboard.press("Escape"); await checklist().waitFor({ state: "hidden" });
      await wait(() => focusIs(button("Add Project…")), "failed checklist Escape restores wizard focus");
      assert.equal(await wizard().isVisible(), true);
      await pick(addParent); await button("Add Project…").click(); await checklist().waitFor();
      await wait(async () => !await submitCandidates().isDisabled(), "retry checklist ready");
    }
  }
  // A deliberate focus move within the dialog must survive settlement.
  await submitCandidates().click();
  await wait(async () => await submitCandidates().isDisabled(), "checklist preservation pending");
  await checklist().getByRole("heading").evaluate(node => { node.tabIndex = -1; node.focus(); });
  await app.evaluate(() => Reflect.get(globalThis, "obCandidatesPending").reject(new Error("Injected checklist failure")));
  await wait(async () => !await submitCandidates().isDisabled(), "checklist preservation settled");
  assert.equal(await checklist().getByRole("heading").evaluate(node => node === document.activeElement), true, "preserve deliberate dialog focus");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("folders:add-candidates"); ipcMain.handle("folders:add-candidates", Reflect.get(globalThis, "obCandidatesOriginal"));
  });
  if (reviewFailures.length) throw new Error(reviewFailures.join("; "));
  await shot("03-add-scan");
  await page.keyboard.press("Escape"); await checklist().waitFor({ state: "hidden" });
  await wait(() => focusIs(button("Add Project…")), "scan cancel restores wizard focus");
  assert.equal(await wizard().isVisible(), true);
  const addPlain = join(work, "add-plain"); await mkdir(addPlain);
  await pick(addPlain); await button("Add Project…").click();
  const addConfirm = wizard().getByRole("dialog", { name: "Set up add-plain as a doan project?", exact: true });
  await addConfirm.waitFor();
  assert.equal(await focusIs(addConfirm.getByRole("button", { name: "Cancel", exact: true })), true);
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers");
    Reflect.set(globalThis, "obFolderOriginal", handlers.get("folders:confirm-folder"));
    ipcMain.removeHandler("folders:confirm-folder");
    ipcMain.handle("folders:confirm-folder", () => { throw new Error("Injected folder failure"); });
  });
  await addConfirm.getByRole("button", { name: "Set Up…", exact: true }).click();
  const folderError = addConfirm.getByRole("alert");
  await folderError.waitFor();
  assert.match(await folderError.getAttribute("class") ?? "", /ob-msg error/);
  assert.ok(!(await folderError.textContent())?.startsWith("Error:"));
  await shot("03-add-confirm");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("folders:confirm-folder"); ipcMain.handle("folders:confirm-folder", Reflect.get(globalThis, "obFolderOriginal"));
  });
  await page.keyboard.press("Escape"); await addConfirm.waitFor({ state: "hidden" });
  await wait(() => focusIs(button("Add Project…")), "confirm cancel restores wizard focus");
  await button("Add Project…").click(); await addConfirm.waitFor();
  await addConfirm.getByRole("button", { name: "Set Up…", exact: true }).click();
  await button("Set Up Project").waitFor();
  await wizard().locator(".ob-field .value").getByText(addPlain, { exact: true }).waitFor();
  await reopen(); await go("First prompt");
  const direct = await setUpRepo("direct-add");
  const brokenParent = join(work, "broken-parent"), refusedChild = join(brokenParent, "child");
  await mkdir(join(brokenParent, ".doan"), { recursive: true }); await mkdir(refusedChild);
  await writeFile(join(brokenParent, ".doan/config.json"), "{broken");
  await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, [direct, addParent, refusedChild]);
  await button("Add Project…").click(); await checklist().waitFor();
  const mixedRefusal = await wizard().locator(".ob-form > [role=alert]").textContent();
  assert.match(mixedRefusal ?? "", /config/i);
  await checklist().getByRole("button", { name: "Add 2 Projects", exact: true }).click();
  await checklist().waitFor({ state: "hidden" });
  await subject(wizard()).waitFor();
  assert.ok((await wizard().locator(".ob-sentence").textContent())?.includes(direct), "later scan preserves the first directly added project");
  assert.equal(await wizard().getByRole("alert").textContent(), mixedRefusal, "mixed refusal remains visible after the scan");
  const multiStored = JSON.parse(await readFile(join(data, "folders.json"), "utf8")) as string[];
  assert.ok(multiStored.includes(addA) && multiStored.includes(addB));
  await reopen(); await go("First prompt");
  const mixedDirect = await setUpRepo("mixed-direct"), mixedPlain = join(work, "mixed-plain"); await mkdir(mixedPlain);
  await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, [mixedDirect, mixedPlain]);
  await button("Add Project…").click();
  const mixedConfirm = wizard().getByRole("dialog", { name: "Set up mixed-plain as a doan project?", exact: true });
  await mixedConfirm.waitFor(); await mixedConfirm.getByRole("button", { name: "Set Up…", exact: true }).click();
  await button("Set Up Project").waitFor();
  await wizard().locator(".ob-field .value").getByText(mixedPlain, { exact: true }).waitFor();
  await writeFile(join(mixedDirect, "design/later.html"), canvasHtml("Later")); await listed(mixedDirect, "design/later.html");
  assert.equal(await wizard().locator(".ob-field .value").getByText(mixedPlain, { exact: true }).count(), 1, "late folder update preserves explicit setup choice");
  await reopen(); await go("First prompt");
  await pick(join(work, "missing-folder")); await button("Add Project…").click();
  await wizard().getByRole("alert").waitFor();
  assert.match(await wizard().getByRole("alert").textContent() ?? "", /folder/);
  await shot("03-add-refused");
  await pick(project); await button("Add Project…").click(); await button("Set Up Project").waitFor();
  await go("First prompt");
  assert.equal(await wizard().getByText("Not set up", { exact: true }).count(), 1);
  assert.equal(await wizard().getByText(/Add a project first/).count(), 0);
  assert.equal(await subject(wizard()).count(), 0);
  await shot("03-skipped-project");
  await button("Set Up…").click(); await button("Set Up Project").waitFor();
  // A new session has no chosen project; a duplicate must be adopted visibly.
  await reopen(); await go("First prompt"); await pick(project); await button("Add Project…").click();
  await button("Set Up Project").waitFor();
  await wizard().getByRole("status").filter({ hasText: "Already added" }).waitFor();
  await shot("03-add-duplicate");
  assert.equal(await stepButton("Project").getAttribute("aria-current"), "step");
  await assertProjectPath(wizard().locator(".ob-field .meta"), button("Open Project…"), project, "wizard");
  const projectValue = wizard().locator(".ob-field .value").first();
  assert.deepEqual(await projectValue.evaluate(node => ({ display: getComputedStyle(node).display, gap: getComputedStyle(node).gap, pathDisplay: getComputedStyle(node.querySelector(".meta")!).display })), { display: "block", gap: "normal", pathDisplay: "inline-block" }, "project values retain inline text flow rather than inheriting Inspector flex layout");
  await pick(join(work, "outside.css")); await writeFile(join(work, "outside.css"), ":root{}"); await button("Choose…").click(); await button("Set Up Project").click();
  await wizard().getByRole("alert").waitFor(); assert.equal(await exists(join(project, ".doan/config.json")), false);
  await pick(token); await button("Choose…").click();
  // Hold the real init handler before invoking it, then hold its reply after the
  // watcher has published the initialized row. No renderer result is fabricated.
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers"); const original = handlers.get("project:init");
    ipcMain.removeHandler("project:init");
    ipcMain.handle("project:init", async (...args) => {
      await new Promise<void>(resolve => Reflect.set(globalThis, "obInitStart", resolve));
      const result = await original(...args); Reflect.set(globalThis, "obInitResult", result);
      await new Promise<void>(resolve => Reflect.set(globalThis, "obInitReply", resolve)); return result;
    }); Reflect.set(globalThis, "obInitOriginal", original);
  });
  await button("Set Up Project").click(); await button("Setting Up…").waitFor(); await busy();
  await app.evaluate(() => Reflect.get(globalThis, "obInitStart")());
  await wait(() => app.evaluate(() => !!Reflect.get(globalThis, "obInitResult")), "init result");
  await wait(async () => await page.evaluate(root => new Promise<boolean>(resolve => { const stop = window.doan.onFolders(entries => { stop(); resolve(entries.some(e => e.path === root && e.kind === "list")); }); }), project), "watcher listed init");
  await app.evaluate(({ ipcMain }) => { Reflect.get(globalThis, "obInitReply")(); ipcMain.removeHandler("project:init"); ipcMain.handle("project:init", Reflect.get(globalThis, "obInitOriginal")); });
  await wizard().getByRole("heading", { name: "Ask for your first canvas" }).waitFor();
  const config = JSON.parse(await readFile(join(project, ".doan/config.json"), "utf8")); assert.equal(config.tokenCss, "Tokens.css");
  const sentenceFor = (text: string) => `Use the doan skill to make a design canvas in ${project} for ${text}.`;
  // Empty: the subject slot shows an ellipsis and Copy waits for input.
  assert.equal(await wizard().locator(".ob-sentence").textContent(), sentenceFor("…")); assert.equal(await button("Copy").isDisabled(), true);
  await subject(wizard()).fill("x".repeat(501));
  await wizard().getByRole("alert").filter({ hasText: "Use one line of plain text, up to 500 characters." }).waitFor(); await wizard().getByText("501 / 500", { exact: true }).waitFor();
  assert.equal(await wizard().locator(".ob-sentence").count(), 0); assert.equal(await button("Copy").isDisabled(), true);
  const typed = "a sign-in <b>screen</b> & SSO...";
  await subject(wizard()).fill(typed);
  await wait(async () => await wizard().locator(".ob-sentence").textContent() === sentenceFor("a sign-in <b>screen</b> & SSO"), "live preview from main");
  assert.equal(await wizard().locator(".ob-sentence mark").textContent(), "a sign-in <b>screen</b> & SSO"); assert.equal(await wizard().locator(".ob-sentence b").count(), 0); assert.equal(await wizard().locator("tag").count(), 0);
  assert.equal(await stepButton("First prompt").getAttribute("aria-label"), null);
  // Waiting shows only after the clipboard write settled; a failed write never waits.
  await clipboardGate(); await button("Copy").click(); await button("Copying…").waitFor(); await busy(); assert.equal(await waiting(wizard()).count(), 0);
  await releaseCopy(true); await button("Retry copy").waitFor(); assert.equal(await waiting(wizard()).count(), 0);
  await wizard().getByRole("alert").filter({ hasText: "Couldn’t copy. Your clipboard could not be updated. Try again." }).waitFor();
  assert.equal(await stepButton("First prompt").getAttribute("aria-label"), null); await button("Retry copy").click(); await busy(); assert.equal(await waiting(wizard()).count(), 0);
  await releaseCopy(false); await button("Copied").waitFor(); await waiting(wizard()).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), sentenceFor("a sign-in <b>screen</b> & SSO")); assert.equal(await stepButton("First prompt").getAttribute("aria-label"), "First prompt, completed"); await restoreCopy();
  // Editing while waiting keeps the wait.
  await subject(wizard()).fill(`${typed} and passkeys`); await button("Copy again").waitFor(); assert.equal(await waiting(wizard()).count(), 1);
  await shot("03-first-prompt"); await button("Done").click(); await closed();
  // The wait goes on after Done; in that workspace the new canvas opens by itself.
  await enterProject(page, project);
  let row = overview();
  await waiting(row).waitFor(); assert.equal(await row.locator(".ob-sentence").textContent(), sentenceFor("…"));
  await clipboardGate(); await subject(row).fill("a pricing page"); await row.getByRole("button", { name: "Copy", exact: true }).click(); await row.getByRole("button", { name: "Copying…", exact: true }).waitFor();
  await releaseCopy(true); await row.getByRole("button", { name: "Retry copy", exact: true }).click(); await releaseCopy(false); await row.getByRole("button", { name: "Copied", exact: true }).waitFor(); await waiting(row).waitFor(); await restoreCopy();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), sentenceFor("a pricing page"));
  await writeFile(join(project, "design/first.html"), canvasHtml("First")); await wait(async () => await openCanvas().textContent() === "First", "arrival opened in its workspace");

  console.log("onboarding: 5 sidebar setup, re-root and modal/draft preservation");
  const plain = await newRepo("company-monorepo/packages/applications/marketing-web-frontend/plain"); await open(plain); let plainRow = homeRow(page, plain); await plainRow.getByRole("button", { name: "Set Up…", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true }); await setup.waitFor();
  await assertProjectPath(setup.locator(":scope > p"), setup, plain, "setup dialog");
  assert.equal(await focusIs(setup.getByRole("button", { name: "Choose…", exact: true })), true);
  await setup.getByRole("button", { name: "Set Up Project", exact: true }).click(); await setup.waitFor({ state: "hidden" }); await enterProject(page, plain); plainRow = overview(); await subject(plainRow).waitFor();
  const noToken = JSON.parse(await readFile(join(plain, ".doan/config.json"), "utf8")); assert.equal(noToken.tokenCss, undefined);
  const terminal = await newRepo("terminal"); await open(terminal); const terminalRow = homeRow(page, terminal); await terminalRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await init(terminal); await setup.waitFor({ state: "hidden" });
  const parent = await newRepo("parent"), child = join(parent, "child"); await mkdir(child); await open(child); const childRow = homeRow(page, child); await childRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await init(parent);
  await setup.getByRole("button", { name: "Set Up Project", exact: true }).click(); await setup.waitFor({ state: "hidden" });
  let parentRow = homeRow(page, parent); await parentRow.waitFor(); await wait(() => focusIs(parentRow), "reroot focus"); assert.equal(await exists(join(child, ".doan/config.json")), false);
  await parentRow.getByRole("status").getByText(`This folder is inside ${parent}, which is already set up.`, { exact: true }).waitFor();
  await writeFile(join(parent, "design/next.html"), "<!doctype html><title>Next</title>"); await parentRow.getByText(/This folder is inside/).waitFor({ state: "hidden" });
  await enterProject(page, parent); parentRow = page.getByRole("region", { name: "Overview", exact: true }); await canvasRow(page, "next.html").waitFor();
  const changed = await newRepo("changed"); await open(changed); const changedRow = homeRow(page, changed); await changedRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await rename(changed, `${changed}-away`); await setup.waitFor({ state: "hidden" });
  const restartParent = await newRepo("restart-parent"), restartChild = join(restartParent, "child"); await mkdir(restartChild); await open(restartChild); await homeRow(page, restartChild).getByRole("button", { name: "Set Up…", exact: true }).waitFor(); await quit(); await init(restartParent); await launch();
  row = page.getByRole("region", { name: "Overview", exact: true }); parentRow = page.getByRole("region", { name: "Overview", exact: true }); plainRow = page.getByRole("region", { name: "Overview", exact: true });
  await enterProject(page, restartParent);
  await subject(overview()).waitFor(); assert.equal(await exists(join(restartChild, ".doan/config.json")), false);
  // Reopen re-asks upward after the previously stored child disappears.
  const reopenParent = await newRepo("reopen-parent"), reopenChild = join(reopenParent, "reopen-child"); await mkdir(reopenChild); await open(reopenChild);
  const reopenRow = homeRow(page, reopenChild); await reopenRow.getByRole("button", { name: "Set Up…", exact: true }).waitFor();
  await rename(reopenChild, `${reopenChild}-away`); await reopenRow.getByRole("button", { name: "Locate…", exact: true }).waitFor(); await init(reopenParent); await rename(`${reopenChild}-away`, reopenChild);
  await pick(reopenChild); await reopenRow.getByRole("button", { name: "Locate…", exact: true }).click(); await enterProject(page, reopenParent);
  await subject(overview()).waitFor(); assert.equal(await exists(join(reopenChild, ".doan/config.json")), false);
  await enterProject(page, project);
  // A relaunch forgets the wait. The wizard detects a new canvas in a project that already has one: Canvas ready, then Open closes it.
  await reopen(); await go("Project"); await pick(project); await button("Open Project…").click(); await wizard().getByRole("heading", { name: "Ask for your first canvas" }).waitFor();
  await copyWaiting(wizard(), "a second screen"); await writeFile(join(project, "design/second.html"), canvasHtml("Second"));
  const canvasReady = wizard().getByRole("status").filter({ hasText: "Canvas ready: Second" }); await canvasReady.waitFor(); await shot("03b-canvas-ready");
  await canvasReady.getByRole("button", { name: "Open", exact: true }).click(); await closed(); await wait(async () => await openCanvas().textContent() === "Second", "Canvas ready Open opened it");
  assert.deepEqual(JSON.parse(await readFile(join(data, "onboarding.json"), "utf8")), {});
  await enterProject(page, project); row = overview();
  await canvasRow(page, "first.html").click(); assert.equal(await subject(page.locator("body")).count(), 0);
  await page.frameLocator("iframe").getByRole("button", { name: "Target", exact: true }).click();
  const panel = page.getByRole("region", { name: "Comments", exact: true }); await panel.getByRole("button", { name: "New selection comment", exact: true }).click();
  const draft = panel.getByRole("textbox", { name: "New comment body" }); await draft.fill("Keep this draft");
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", project], { env })).stdout);
  assert.equal((await active()).result?.selection?.element?.doanId, "target");
  const unsaved = page.getByRole("dialog").filter({ hasText: "Keep writing" });
  // Trigger the real draft guard by opening another canvas.
  await requestProject(page, parent); await unsaved.waitFor(); const keep = unsaved.getByRole("button", { name: "Keep writing", exact: true }); await keep.focus();
  await keep.click(); assert.equal(await draft.inputValue(), "Keep this draft");
  await shot("04-draft-preserved");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();

  console.log("onboarding: 6 step 3 single pick, not-a-repository confirmation");
  const repos = join(work, "repos"); await mkdir(repos);
  const alpha = await setUpRepo("repos/alpha"), beta = await newRepo("repos/beta");
  await exec("git", ["-C", alpha, "commit", "--allow-empty", "-m", "init"], { env }); const alphaTree = join(work, "trees/alpha-feat");
  await exec("git", ["-C", alpha, "worktree", "add", "-b", "feat", alphaTree], { env });
  await reopen(); await go("Project"); await pick(repos); await button("Open Project…").click();
  const chooser = page.getByRole("dialog", { name: "Choose a repository in repos", exact: true }); await chooser.waitFor();
  assert.equal(await chooser.locator(".lead").textContent(), `${repos} isn’t a repository. Choose one repository inside it.`);
  const radios = chooser.getByRole("radiogroup", { name: "Repositories" }).getByRole("radio");
  await wait(async () => await radios.count() === 3, "repositories and worktree listed");
  assert.deepEqual(await radios.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))), ["alpha", "alpha, alpha-feat worktree", "beta"]);
  assert.equal(await chooser.getByRole("radio", { checked: true }).count(), 1);
  await shot("05-pick-one");
  await page.keyboard.press("Escape"); await chooser.waitFor({ state: "hidden" }); assert.equal(await wizard().isVisible(), true);
  // Open Project… was disabled while main answered, so the closed modal must not return focus to <body>.
  await wait(() => focusIs(button("Open Project…")), "focus returns to Open Project… after the pick-one list");
  await button("Open Project…").click(); await chooser.waitFor(); await wait(async () => await radios.count() === 3, "list again");
  await chooser.getByRole("radio", { name: "beta", exact: true }).check(); await chooser.getByRole("radio", { name: "alpha", exact: true }).check(); await chooser.getByRole("radio", { name: "beta", exact: true }).check();
  assert.equal(await chooser.getByRole("radio", { checked: true }).count(), 1);
  await chooser.getByRole("button", { name: "Choose", exact: true }).click(); await chooser.waitFor({ state: "hidden" });
  await button("Set Up Project").waitFor(); await wizard().locator(".ob-field .value").first().getByText(beta, { exact: true }).waitFor();
  const stored = async () => JSON.parse(await readFile(join(data, "folders.json"), "utf8")) as string[];
  assert.ok((await stored()).includes(beta)); assert.ok(!(await stored()).includes(alpha)); assert.ok(!(await stored()).includes(alphaTree));
  const notes = join(work, "notes"); await mkdir(notes); await pick(notes); await button("Open Project…").click();
  const notRepo = page.getByRole("dialog", { name: "Set up notes as a doan project?", exact: true }); await notRepo.waitFor();
  assert.equal(await focusIs(notRepo.getByRole("button", { name: "Cancel", exact: true })), true);
  await page.keyboard.press("Escape"); await notRepo.waitFor({ state: "hidden" }); assert.equal(await wizard().isVisible(), true); assert.ok(!(await stored()).includes(notes));
  await wait(() => focusIs(button("Open Project…")), "focus returns to Open Project… after not-a-repository");
  await button("Open Project…").click(); await notRepo.waitFor(); await notRepo.getByRole("button", { name: "Set Up…", exact: true }).click(); await notRepo.waitFor({ state: "hidden" });
  await button("Set Up Project").waitFor(); await wizard().locator(".ob-field .value").first().getByText(notes, { exact: true }).waitFor(); assert.ok((await stored()).includes(notes));
  await page.keyboard.press("Escape"); await closed();

  console.log("onboarding: 7 arrival toasts, hidden window and removal");
  const toastProject = await setUpRepo("toast-a"); await open(toastProject); await enterProject(page, toastProject);
  await copyWaiting(overview(), "a toast screen"); await goHome(page);
  await writeFile(join(toastProject, "design/toasted.html"), canvasHtml("Toasted"));
  const toast = page.locator(".toast").filter({ hasText: "New canvas in toast-a" }); await toast.waitFor(); await shot("06-arrival-toast");
  await toast.getByRole("button", { name: "Open", exact: true }).click(); await wait(async () => await openCanvas().textContent() === "Toasted", "toast Open opened it");
  const hiddenProject = await setUpRepo("hidden-b"); await open(hiddenProject); await enterProject(page, hiddenProject);
  await copyWaiting(overview(), "a hidden screen"); await menu("Close Window"); await wait(async () => !await visible(), "hidden");
  await writeFile(join(hiddenProject, "design/later.html"), canvasHtml("Later")); await listed(hiddenProject, "design/later.html");
  await app.evaluate(({ app }) => app.emit("activate")); await wait(visible, "shown");
  await page.locator(".toast").filter({ hasText: "New canvas in hidden-b" }).waitFor(); assert.equal(await openCanvas().count(), 0, "a hidden arrival does not open by itself");
  // ⌘H hides the whole app (the native hide: selector), not only the window.
  const appHidden = await setUpRepo("hidden-d"); await open(appHidden); await enterProject(page, appHidden);
  await copyWaiting(overview(), "an app hidden screen");
  await app.evaluate(({ Menu }) => Menu.sendActionToFirstResponder("hide:")); await wait(async () => !await visible(), "app hidden");
  await writeFile(join(appHidden, "design/away.html"), canvasHtml("Away")); await listed(appHidden, "design/away.html");
  assert.equal(await page.locator(".toast").filter({ hasText: "New canvas in hidden-d" }).count(), 0, "no toast while the app is hidden");
  await app.evaluate(({ app }) => app.show()); await wait(visible, "app shown");
  await page.locator(".toast").filter({ hasText: "New canvas in hidden-d" }).waitFor(); assert.equal(await openCanvas().count(), 0, "an arrival during ⌘H does not open by itself");
  const goneProject = await setUpRepo("gone-c"); await open(goneProject); await enterProject(page, goneProject);
  await copyWaiting(overview(), "a removed screen"); await removeHomeProject(page, goneProject);
  await writeFile(join(goneProject, "design/orphan.html"), canvasHtml("Orphan")); await open(goneProject); await listed(goneProject, "design/orphan.html");
  await pause(1_000); assert.equal(await page.locator(".toast").filter({ hasText: "New canvas in gone-c" }).count(), 0, "removing the project cancelled the wait");
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true);
  await quit();
} catch (error) {
  if (running) { try { console.error("onboarding active element:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500))); await shot("failure"); } catch (shotError) { console.error("onboarding screenshot failed", shotError); } }
  throw error;
} finally {
  try { if (running) { await page.evaluate(() => window.doan.setCommentDraftGuard(false)); await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "obSavedClipboard")); }); } } finally { await guard.finish(); }
}

console.log("onboarding-test: PASS");
