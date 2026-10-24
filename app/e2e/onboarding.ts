import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright";

const { hoverTooltip }: typeof import("./tooltip") = await import(new URL("./tooltip.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);

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
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check: () => Promise<boolean>, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (!await check()) { if (Date.now() > end) throw new Error(`onboarding timeout: ${what}`); await pause(30); }
}
async function exists(path: string) { try { await readFile(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } }
const wizard = () => page.getByRole("dialog", { name: "Set Up doan", exact: true });
const button = (name: string | RegExp) => wizard().getByRole("button", { name, exact: true });
const stepButton = (name: string) => wizard().getByRole("list", { name: "Steps" }).getByRole("button").filter({ hasText: name });
const card = (agent: "claude" | "codex") => wizard().locator(".ob-card").filter({ has: page.locator(".ob-agent").filter({ hasText: agent === "claude" ? "Claude Code" : "Codex" }) });
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
async function menu(name: string) {
  await app.evaluate(({ Menu, BrowserWindow }, label) => {
    const item = Menu.getApplicationMenu()?.items.flatMap(item => item.submenu?.items ?? []).find(item => item.label === label);
    if (!item) throw new Error(`Missing menu item ${label}`);
    item.click(item, BrowserWindow.getAllWindows()[0], undefined);
  }, name);
}
async function launch() {
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${data}`], env }); running = app;
  page = await app.firstWindow(); page.setDefaultTimeout(15_000);
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    Reflect.set(globalThis, "obSavedClipboard", await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))))));
  });
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), data);
}
async function quit() { await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "obSavedClipboard")); }); await app.close(); running = undefined; }
async function wizardSession() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("onboarding session not received within 15 s")); }, 15_000);
    const stop = window.doan.onOnboardingOpen(opened => { clearTimeout(timer); stop(); resolve(opened); });
  }));
}
async function ready() { await wizard().waitFor(); await wait(async () => !await button("Check Again").isDisabled(), "machine read"); }
async function reopen() { await menu("Set Up doan…"); await ready(); }
async function check() { await button("Check Again").click(); await wait(async () => !await button("Check Again").isDisabled(), "Check Again settled"); }
async function go(name: string) { await stepButton(name).click(); }
async function closed() { await wizard().waitFor({ state: "hidden" }); }
async function pick(path: string) { await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path); }
async function open(path: string) { await pick(path); await page.getByRole("button", { name: "Open Project…", exact: true }).click(); }
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
  await wait(async () => !await button("Check Again").isDisabled(), `${agent} connect`, 35_000);
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
  await go("First prompt");
  assert.equal(await stepButton("Agents").getAttribute("aria-label"), null);
  assert.equal(await stepButton("Project").getAttribute("aria-label"), null);
  await go("CLI"); await button("Skip").click();
  assert.equal(await stepButton("CLI").getAttribute("aria-label"), null);
  const session = await wizardSession();
  await menu("Close Window"); await wait(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0]!.isVisible()), "hidden");
  await app.evaluate(({ app }) => app.emit("activate")); await wait(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), "shown");
  assert.deepEqual(await wizardSession(), session);
  assert.equal(await stepButton("Agents").getAttribute("aria-current"), "step");
  for (const hidden of [false, true]) {
    if (hidden) { await menu("Close Window"); await wait(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0]!.isVisible()), "hidden before menu reopen"); }
    await reopen();
    await wait(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), "menu shows wizard window");
    assert.deepEqual(await wizardSession(), session, `menu preserves ${hidden ? "hidden" : "visible"} wizard session`);
    assert.equal(await stepButton("Agents").getAttribute("aria-current"), "step");
  }
  const electron = createRequire(import.meta.url)("electron") as string;
  const second = spawn(electron, [join(root, "app"), `--user-data-dir=${data}`], { env, stdio: "ignore" });
  const secondCode = await new Promise<number | null>((resolve, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error("second instance hung")); }, 10_000); second.on("exit", code => { clearTimeout(timer); resolve(code); }); second.on("error", reject); });
  assert.equal(secondCode, 0); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.deepEqual(await wizardSession(), session);
  await quit(); assert.equal(await exists(join(data, "onboarding.json")), false, "quit does not dismiss");
  await launch(); await ready(); await page.keyboard.press("Escape"); await closed();
  assert.deepEqual(JSON.parse(await readFile(join(data, "onboarding.json"), "utf8")), {});
  await quit(); await launch(); await page.getByRole("button", { name: "Open Project…", exact: true }).waitFor(); assert.equal(await wizard().count(), 0);
  await menu("Close Window"); await reopen(); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), true); await button(/^Close/).click(); await closed(); await quit();
  await writeFile(join(data, "onboarding.json"), "{broken"); await launch(); await ready();
  await shot("01-first-run");

  console.log("onboarding: 2 CLI blockers, replacement and delayed PATH copy");
  await mkdir(join(home, ".local/bin"), { recursive: true }); await writeFile(cliLink, "occupied"); await check();
  await wizard().getByText(/is in use by something else/).waitFor(); assert.equal(await button("Install").isDisabled(), true);
  assert.equal(await readFile(cliLink, "utf8"), "occupied"); await rm(cliLink); await symlink("/missing/other-doan", cliLink); await check();
  await button("Replace…").click(); const confirm = page.getByRole("alertdialog"); await confirm.waitFor();
  assert.equal(await focusIs(confirm.getByRole("button", { name: "Cancel", exact: true })), true);
  await page.keyboard.press("Escape"); await confirm.waitFor({ state: "hidden" }); assert.equal(await wizard().isVisible(), true);
  assert.equal(await readlink(cliLink), "/missing/other-doan"); await check(); await button("Replace…").click();
  await confirm.getByRole("button", { name: "Replace Link", exact: true }).click(); await wait(async () => await readlink(cliLink) === cli, "CLI replaced"); await check();
  await wizard().getByText("Not on PATH", { exact: true }).waitFor(); await wizard().getByText("~/.zshrc", { exact: true }).waitFor();
  await clipboardGate(); await button("Copy").click(); await button("Copying…").waitFor(); await busy();
  await releaseCopy(true); await button("Retry copy").waitFor(); assert.equal(await button(/^Close/).isDisabled(), false);
  await button("Retry copy").click(); await busy(); await releaseCopy(false); await button("Copied").waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'export PATH="$HOME/.local/bin:$PATH"'); await restoreCopy();
  await page.keyboard.press("Escape"); await closed(); await reopen();

  await rm(cliLink); await check(); await button("Install").click(); await wait(async () => { try { return await readlink(cliLink) === cli; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } }, "missing link installed");
  console.log("onboarding: 3 agent detection, partial setup and MCP states");
  await shellMode("missing"); await go("Agents"); await check();
  for (const agent of ["claude", "codex"] as const) assert.equal(await card(agent).getByText("Not installed", { exact: true }).count(), 1); assert.equal(await wizard().getByRole("button", { name: "Connect", exact: true }).count(), 0);
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
    await card(agent).getByText("Install the CLI link in step 1 before connecting MCP.", { exact: true }).waitFor();
    assert.equal(await card(agent).getByText("Failed", { exact: true }).count(), 0);
  }
  await rm(cliLink); await symlink(cli, cliLink); await check();
  await mode("codex", "unknown"); await check(); const unknown = await card("codex").textContent(), unknownMutations = await mutations(); await connect("codex");
  assert.deepEqual(await mutations(), unknownMutations, "unknown Codex MCP causes no mutation");
  assert.equal(await card("codex").textContent(), unknown); await card("codex").getByText(/Unreadable registration/).waitFor();
  await writeFile(join(bin, "codex"), "#!/missing/interpreter\n", { mode: 0o755 }); await check(); await card("codex").getByText(/Couldn't run Codex.*ENOENT/).waitFor();
  await writeFile(join(bin, "codex"), agentScript, { mode: 0o755 }); await mode("codex", "timeout"); await check(); await card("codex").getByText(/didn’t answer in 10 s/).waitFor(); await mode("codex", ""); await check();
  await writeFile(stub, "user edits"); await check(); await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.equal(await readFile(stub, "utf8"), "user edits");
  await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor();
  await confirm.getByText(/doan 0.1.0/).waitFor(); await confirm.getByRole("button", { name: "Replace Skill", exact: true }).click();
  await wait(async () => !await button("Check Again").isDisabled(), "stub replace");
  assert.ok((await readFile(stub, "utf8")).includes("doan skill"));
  await mode("codex", "fail"); await connect("codex"); await card("codex").getByText(/Injected add failure/).waitFor();
  assert.ok(await exists(stub)); assert.equal(await exists(join(codexConfig, "config.toml")), false);
  const addsBefore = (await records()).filter(call => call.agent === "codex" && call.args[1] === "add").length;
  await mode("codex", "hold"); await writeFile(join(work, "agent.gate"), ""); await card("codex").getByRole("button", { name: "Connect", exact: true }).click();
  await wait(async () => (await records()).filter(call => call.agent === "codex" && call.args[1] === "add").length > addsBefore, "fresh agent add started"); await busy(); await rm(join(work, "agent.gate"));
  await wait(async () => !await button("Check Again").isDisabled(), "Connect settled"); await mode("codex", "");
  for (const agent of ["claude", "codex"]) assert.ok((await mutations()).some(call => call.agent === agent && JSON.stringify(call.args) === JSON.stringify(["mcp", "add", ...(agent === "claude" ? ["--scope", "user"] : []), "doan", "--", cliLink, "mcp"])));
  await writeFile(join(claudeConfig, ".claude.json"), JSON.stringify({ mcpServers: { doan: { command: "/other", args: [] } } })); await check();
  const prior = await mutations(); await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.deepEqual(await mutations(), prior);
  await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Replace MCP Registration", exact: true }).click();
  await wait(async () => !await button("Check Again").isDisabled(), "MCP replace");
  assert.deepEqual((await mutations()).slice(-2).map(call => call.args), [["mcp", "remove", "--scope", "user", "doan"], ["mcp", "add", "--scope", "user", "doan", "--", cliLink, "mcp"]]);
  await rm(claudeLink); await symlink("/missing/skill", claudeLink); await check();
  await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await check(); assert.equal(await readlink(claudeLink), "/missing/skill");
  await card("claude").getByRole("button", { name: "Connect", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Replace Link", exact: true }).click(); await wait(async () => !await button("Check Again").isDisabled(), "skill link replaced"); assert.equal(await readlink(claudeLink), "../../.agents/skills/doan");
  console.log("onboarding: symlinked Claude skills and shared-directory alias");
  const skills = join(claudeConfig, "skills"), realSkills = join(home, "custom/deep/skills");
  await rm(skills, { recursive: true }); await mkdir(realSkills, { recursive: true }); await symlink(realSkills, skills);
  await check(); await connect("claude");
  assert.equal(await readlink(join(realSkills, "doan")), relative(realSkills, dirname(stub)));
  assert.equal(await realpath(claudeLink), await realpath(dirname(stub)));
  assert.equal(await readlink(skills), realSkills);
  await card("claude").getByText("Installed", { exact: true }).waitFor();
  await shot("02a-symlinked-skills");

  await rm(skills); await symlink(join(home, ".agents/skills"), skills);
  const unchangedPaths = [skills, join(home, ".agents/skills"), dirname(stub), stub, join(claudeConfig, ".claude.json")];
  const stamps = async () => Promise.all(unchangedPaths.map(async path => {
    const stat = await lstat(path);
    return { path, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, content: stat.isSymbolicLink() ? await readlink(path) : stat.isDirectory() ? await readdir(path) : await readFile(path, "utf8") };
  }));
  const aliasBefore = await stamps(), aliasMutations = await mutations();
  await check();
  await card("claude").getByText("Uses the shared skill folder", { exact: true }).waitFor();
  await card("claude").getByText("Installed", { exact: true }).waitFor();
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
  await go("Project"); await pick(project); await button("Open Project…").click(); await button("Set Up Project").waitFor();
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
  await wizard().getByRole("heading", { name: "Send your first prompt" }).waitFor();
  const config = JSON.parse(await readFile(join(project, ".doan/config.json"), "utf8")); assert.equal(config.tokenCss, "Tokens.css");
  const sentence = `Use the doan skill to make a design canvas in ${project} for <what you want to design>.`;
  assert.equal(await wizard().locator(".ob-sentence").textContent(), sentence); assert.equal(await wizard().locator("tag").count(), 0);
  assert.equal(await stepButton("First prompt").getAttribute("aria-label"), null);
  await clipboardGate(); await button("Copy").click(); await button("Copying…").waitFor(); await busy(); await releaseCopy(true); await button("Retry copy").waitFor();
  assert.equal(await stepButton("First prompt").getAttribute("aria-label"), null); await button("Retry copy").click(); await busy(); await releaseCopy(false); await button("Copied").waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), sentence); assert.equal(await stepButton("First prompt").getAttribute("aria-label"), "First prompt, completed"); await restoreCopy();
  await shot("03-first-prompt"); await button("Done").click(); await closed();
  let row = page.getByRole("treeitem", { name: basename(project), exact: true });
  const copy = row.getByRole("button", { name: "Copy first prompt", exact: true }); await copy.waitFor();
  assert.equal(await (await hoverTooltip(page, copy)).textContent(), sentence); await page.keyboard.press("Escape"); assert.equal(await (await hoverTooltip(page, copy)).textContent(), sentence); await page.keyboard.press("Escape");
  await clipboardGate(); await copy.click(); await row.getByRole("button", { name: "Copying…", exact: true }).waitFor(); await releaseCopy(true); await row.getByRole("button", { name: "Retry copy", exact: true }).click(); await releaseCopy(false); await row.getByRole("button", { name: "Copied", exact: true }).waitFor(); await restoreCopy();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), sentence);

  console.log("onboarding: 5 sidebar setup, re-root and modal/draft preservation");
  const plain = await newRepo("company-monorepo/packages/applications/marketing-web-frontend/plain"); await open(plain); let plainRow = page.getByRole("treeitem", { name: "plain", exact: true }); await plainRow.getByRole("button", { name: "Set Up…", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true }); await setup.waitFor();
  await assertProjectPath(setup.locator(":scope > p"), setup, plain, "setup dialog");
  assert.equal(await focusIs(setup.getByRole("button", { name: "Choose…", exact: true })), true);
  await reopen(); await button(/^Close/).click(); await closed(); assert.equal(await setup.isVisible(), true); assert.equal(await focusIs(setup.getByRole("button", { name: "Choose…", exact: true })), true);
  await setup.getByRole("button", { name: "Set Up Project", exact: true }).click(); await setup.waitFor({ state: "hidden" }); await plainRow.getByRole("button", { name: "Copy first prompt", exact: true }).waitFor();
  const noToken = JSON.parse(await readFile(join(plain, ".doan/config.json"), "utf8")); assert.equal(noToken.tokenCss, undefined);
  const terminal = await newRepo("terminal"); await open(terminal); const terminalRow = page.getByRole("treeitem", { name: "terminal", exact: true }); await terminalRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await init(terminal); await setup.waitFor({ state: "hidden" });
  const parent = await newRepo("parent"), child = join(parent, "child"); await mkdir(child); await open(child); const childRow = page.getByRole("treeitem", { name: "child", exact: true }); await childRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await init(parent);
  await setup.getByRole("button", { name: "Set Up Project", exact: true }).click(); await setup.waitFor({ state: "hidden" });
  let parentRow = page.getByRole("treeitem", { name: "parent", exact: true }); await parentRow.waitFor(); await wait(() => focusIs(parentRow), "reroot focus"); assert.equal(await exists(join(child, ".doan/config.json")), false);
  await parentRow.getByText(`This folder is inside ${parent}, which is already set up.`, { exact: true }).waitFor();
  await writeFile(join(parent, "design/next.html"), "<!doctype html><title>Next</title>"); await parentRow.getByRole("treeitem", { name: "next.html", exact: true }).waitFor(); await parentRow.getByText(/This folder is inside/).waitFor({ state: "hidden" });
  const changed = await newRepo("changed"); await open(changed); const changedRow = page.getByRole("treeitem", { name: "changed", exact: true }); await changedRow.getByRole("button", { name: "Set Up…", exact: true }).click(); await rename(changed, `${changed}-away`); await setup.waitFor({ state: "hidden" });
  const restartParent = await newRepo("restart-parent"), restartChild = join(restartParent, "child"); await mkdir(restartChild); await open(restartChild); await page.getByRole("treeitem", { name: "child", exact: true }).getByRole("button", { name: "Set Up…", exact: true }).waitFor(); await quit(); await init(restartParent); await launch();
  row = page.getByRole("treeitem", { name: basename(project), exact: true }); parentRow = page.getByRole("treeitem", { name: "parent", exact: true }); plainRow = page.getByRole("treeitem", { name: "plain", exact: true });
  await page.getByRole("treeitem", { name: "restart-parent", exact: true }).getByRole("button", { name: "Copy first prompt", exact: true }).waitFor(); assert.equal(await exists(join(restartChild, ".doan/config.json")), false);
  // Reopen re-asks upward after the previously stored child disappears.
  const reopenParent = await newRepo("reopen-parent"), reopenChild = join(reopenParent, "reopen-child"); await mkdir(reopenChild); await open(reopenChild); const reopenRow = page.getByRole("treeitem", { name: "reopen-child", exact: true }); await reopenRow.getByRole("button", { name: "Set Up…", exact: true }).waitFor(); await rename(reopenChild, `${reopenChild}-away`); await reopenRow.getByRole("button", { name: "Reopen", exact: true }).waitFor(); await init(reopenParent); await rename(`${reopenChild}-away`, reopenChild); await reopenRow.getByRole("button", { name: "Reopen", exact: true }).click(); await page.getByRole("treeitem", { name: "reopen-parent", exact: true }).getByRole("button", { name: "Copy first prompt", exact: true }).waitFor(); assert.equal(await exists(join(reopenChild, ".doan/config.json")), false);
  await row.focus(); await reopen(); await go("Project"); await pick(project); await button("Open Project…").click(); await wizard().getByRole("heading", { name: "Send your first prompt" }).waitFor(); await button("Done").click(); await closed(); assert.equal(await focusIs(row), true);
  const html = '<!doctype html><title>First</title><meta name="doan:canvas" content="first"><meta name="doan:width" content="800"><style>button{margin:50px;padding:30px}</style><button data-doan-id="target">Target</button>';
  await writeFile(join(project, "design/first.html"), html); await row.getByRole("treeitem", { name: "first.html", exact: true }).click(); assert.equal(await row.getByRole("button", { name: "Copy first prompt", exact: true }).count(), 0);
  await page.frameLocator("iframe").getByRole("button", { name: "Target", exact: true }).click();
  const panel = page.getByRole("region", { name: "Comments", exact: true }); await panel.getByRole("button", { name: "New selection comment", exact: true }).click();
  const draft = panel.getByRole("textbox", { name: "New comment body" }); await draft.fill("Keep this draft");
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", project], { env })).stdout);
  const selected = await active(); assert.equal(selected.result?.selection?.element?.doanId, "target"); await reopen(); await page.keyboard.press("Escape"); await closed(); assert.equal(await draft.inputValue(), "Keep this draft"); assert.deepEqual(await active(), selected); assert.equal(await focusIs(draft), true);
  const unsaved = page.getByRole("dialog").filter({ hasText: "Keep writing" });
  // Trigger the real draft guard by opening another canvas.
  await parentRow.getByRole("treeitem", { name: "next.html", exact: true }).click(); await unsaved.waitFor(); const keep = unsaved.getByRole("button", { name: "Keep writing", exact: true }); await keep.focus();
  await reopen(); await button(/^Close/).click(); await closed(); assert.equal(await unsaved.isVisible(), true); assert.equal(await focusIs(keep), true); await keep.click(); assert.equal(await draft.inputValue(), "Keep this draft");
  await shot("04-draft-preserved");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await quit();
} catch (error) {
  if (running) { try { console.error("onboarding active element:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500))); await shot("failure"); } catch (shotError) { console.error("onboarding screenshot failed", shotError); } }
  throw error;
} finally {
  try { if (running) { await page.evaluate(() => window.doan.setCommentDraftGuard(false)); await quit(); } } finally { await rm(work, { recursive: true, force: true }); await assertRealState(before); }
}

console.log("onboarding-test: PASS");
