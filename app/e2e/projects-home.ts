import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication } from "playwright";
const { homeRow, goHome, enterProject, requestProject, removeHomeProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { hoverTooltip }: typeof import("./tooltip") = await import(new URL("./tooltip.ts", import.meta.url).href);
const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-home-"));
const shots = join(root, ".scratch/runtime-test", `projects-home-${Date.now()}`);
let app: ElectronApplication | undefined;
try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell");
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const html = '<!doctype html><title>Shared</title><meta name="doan:canvas" content="shared"><meta name="doan:width" content="800"><style>body{margin:0;background:#eee;min-height:600px}button{margin:50px;padding:30px}</style><section data-doan-frame="hero" data-doan-title="Hero"><button data-doan-id="target">Target</button></section>';
  async function configured(path: string) { await mkdir(join(path, ".doan"), { recursive: true }); await mkdir(join(path, "design"), { recursive: true }); await writeFile(join(path, ".doan/config.json"), '{"v":1}'); await writeFile(join(path, "design/shared.html"), html); }
  async function git(path: string, args: string[]) { await exec("git", ["-C", path, ...args], { env }); }
  const repo = join(work, "acme"), branch = join(work, "billing"), detached = join(work, "review");
  await configured(repo); await git(repo, ["init", "-b", "main"]); await git(repo, ["config", "user.name", "Home Test"]); await git(repo, ["config", "user.email", "home@example.test"]); await git(repo, ["add", "."]); await git(repo, ["commit", "-m", "fixture"]);
  await git(repo, ["worktree", "add", "-b", "billing", branch]); await git(repo, ["worktree", "add", "--detach", detached]);
  const mono = join(work, "mono"), monoBranch = join(work, "mono-branch");
  await configured(join(mono, "web")); await git(mono, ["init", "-b", "main"]); await git(mono, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "add", "."]); await git(mono, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "commit", "-m", "fixture"]); await git(mono, ["worktree", "add", "-b", "feature", monoBranch]);
  const plain = join(work, "plain"), empty = join(work, "notes"), parent = join(work, "projects"), candidate = join(parent, "candidate"), notSetup = join(parent, "not-setup");
  await configured(plain); await mkdir(empty); await configured(candidate); await git(candidate, ["init"]); await mkdir(notSetup); await git(notSetup, ["init"]);
  const wrapped = join(work, "doan-wrapper.mjs"), failure = join(work, "fail-cli");
  await writeFile(wrapped, `#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync(${JSON.stringify(failure)}) && process.argv.includes(${JSON.stringify(candidate)})) process.exit(1);
const result = spawnSync(${JSON.stringify(cli)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  env.DOAN_CLI = wrapped;
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env });
  const page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  page.on("pageerror", error => console.error("projects-home pageerror", error));
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`projects-home screenshot: ${path}`); };
  async function menu(label: string) {
    const deadline = Date.now() + 10_000;
    while (true) {
      const clicked = await app!.evaluate(({ Menu, BrowserWindow }, label) => {
        const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label === label) return item; const child = item.submenu && find(item.submenu.items); if (child) return child; } return undefined; };
        const item = find(Menu.getApplicationMenu()!.items); if (!item?.enabled) return false;
        item.click(undefined, BrowserWindow.getAllWindows()[0], undefined); return true;
      }, label);
      if (clicked) return;
      assert.ok(Date.now() < deadline, `Disabled or missing menu ${label}`);
      await page.waitForTimeout(20);
    }
  }

  async function wait(check: () => Promise<boolean>, name: string) { const end = Date.now() + 10_000; while (!await check()) { assert.ok(Date.now() < end, name); await page.waitForTimeout(20); } }
  async function add(paths: string[]) { await app!.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, paths); await menu("Add Project…"); }
  async function addPaths(paths: string[]) { await app!.evaluate(async ({ ipcMain, BrowserWindow }, paths) => { const win = BrowserWindow.getAllWindows()[0]!; const handler = Reflect.get(ipcMain, "_invokeHandlers").get("folders:add-paths"); await handler({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, { paths }); }, paths); }
  const presentation: Record<string, boolean> = {};
  const checklist = page.getByRole("dialog", { name: "Add projects", exact: true });
  await page.getByText("Add a project to see its design canvases.", { exact: true }).waitFor(); await shot("01-empty");
  assert.equal(await page.locator(".empty .kbd").evaluate(node => getComputedStyle(node).color === getComputedStyle(node.parentElement!).color), true, "primary shortcut uses the primary ink");
  assert.equal(await page.locator(".empty .kbd").evaluate(node => getComputedStyle(node).opacity), "0.6");
  await add([repo]); await checklist.waitFor();
  assert.equal(await checklist.getByRole("checkbox", { name: "billing worktree", exact: true }).isChecked(), false);
  await checklist.getByRole("checkbox", { name: "billing worktree", exact: true }).check();
  await checklist.getByRole("checkbox", { name: "review worktree", exact: true }).check();
  await checklist.getByRole("button", { name: "Add Worktrees", exact: true }).click(); await checklist.waitFor({ state: "hidden" });
  await add([join(mono, "web"), join(monoBranch, "web"), plain]);
  await checklist.waitFor(); await checklist.getByRole("button", { name: /^(Not Now|Cancel)$/ }).click();
  await page.getByRole("button", { name: `Project ${plain}`, exact: true }).waitFor();
  const acmeCard = page.getByRole("region", { name: "acme", exact: true });
  await acmeCard.getByText("3 worktrees", { exact: true }).waitFor();
  await acmeCard.getByText(/^detached [0-9a-f]{7}$/).waitFor();
  await page.getByRole("region", { name: "web", exact: true }).getByText("2 worktrees", { exact: true }).waitFor();
  assert.equal(await homeRow(page, plain).getByText(/detached|main/).count(), 0);
  await homeRow(page, plain).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show in Finder", exact: true }).waitFor();
  assert.equal(await page.getByRole("menu").getByRole("separator").count(), 1, "row menu separates reveal and remove"); await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).waitFor(); await page.keyboard.press("Escape");
  await shot("02-home");
  const pathTooltip = await hoverTooltip(page, homeRow(page, repo).getByText(repo, { exact: true }));
  presentation.tooltipPadding = await pathTooltip.evaluate(node => { const css = getComputedStyle(node.closest('[data-slot="tooltip-content"]')!); return css.padding === "6px 12px"; });
  await page.mouse.move(500, 20);
  await add([candidate]); await homeRow(page, candidate).waitFor();
  await add([parent]); await checklist.waitFor();
  const already = checklist.getByRole("checkbox", { name: "candidate", exact: true }); await already.waitFor(); assert.equal(await already.isDisabled(), true);
  const pending = checklist.getByRole("checkbox", { name: "not-setup", exact: true }); await pending.waitFor();
  await pending.check(); await checklist.getByRole("button", { name: "Add 1 Project", exact: true }).click(); await checklist.waitFor({ state: "hidden" });
  assert.equal(await homeRow(page, parent).count(), 0); await homeRow(page, notSetup).getByText("Not set up", { exact: true }).waitFor();
  await add([empty]); const confirm = page.getByRole("dialog", { name: "Set up notes as a doan project?", exact: true }); await confirm.waitFor(); await shot("03-confirm");
  assert.match(await confirm.innerText(), /doan will add it as a project that is not set up yet, then open the setup form/);
  await confirm.getByRole("button", { name: "Set Up…", exact: true }).click(); const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true }); await setup.waitFor();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: (() => { const data = new DataTransfer(); data.items.add(new File([""], "fixture")); return data; })() })));
  assert.equal(await page.getByRole("region", { name: "Drop folders to add", exact: true }).count(), 0);
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await homeRow(page, empty).getByText("Not set up", { exact: true }).waitFor();
  assert.equal(await homeRow(page, empty).evaluate(row => row === document.activeElement), true);
  await add([plain]); await homeRow(page, plain).waitFor(); await wait(async () => await homeRow(page, plain).evaluate(row => row.closest(".card")?.classList.contains("flash") === true), "duplicate highlight");
  const saved = JSON.parse(await readFile(join(userData, "folders.json"), "utf8"));
  await removeHomeProject(page, plain); const toast = page.getByRole("status").filter({ hasText: "Files stay on disk." }); await toast.waitFor(); await shot("04-toast");
  await toast.hover(); await page.waitForTimeout(8200); assert.equal(await toast.isVisible(), true);
  await toast.getByRole("button", { name: "Undo", exact: true }).click(); await homeRow(page, plain).waitFor(); assert.deepEqual(JSON.parse(await readFile(join(userData, "folders.json"), "utf8")), saved);
  await removeHomeProject(page, plain); await toast.waitFor(); await menu("Undo Remove"); await homeRow(page, plain).waitFor();
  await enterProject(page, repo); await page.getByRole("treeitem", { name: "shared.html", exact: true }).click(); await page.frameLocator("iframe").getByRole("button", { name: "Target", exact: true }).click();
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env })).stdout);
  const before = await active(); assert.equal(before.result.selection.element.doanId, "target"); const frame = await page.locator("iframe").elementHandle(); assert.ok(frame);
  await menu("Actual Size");
  const transform = await page.locator(".board").evaluate(node => getComputedStyle(node).transform);
  await menu("Home"); await homeRow(page, repo).getByText(/^Selected:/).waitFor(); assert.deepEqual(await active(), before);
  assert.equal(await frame.evaluate(node => node.isConnected), true);
  assert.equal(await page.locator(".workspace").evaluate(node => getComputedStyle(node).visibility), "hidden");
  assert.equal(await page.locator(".workspace").getAttribute("inert"), "");
  await enterProject(page, repo); assert.equal(await page.locator(".board").evaluate(node => getComputedStyle(node).transform), transform);
  const panel = page.getByRole("region", { name: "Comments", exact: true }); await panel.getByRole("button", { name: "New selection comment", exact: true }).click();
  const draft = panel.getByRole("textbox", { name: "New comment body", exact: true }); await draft.fill("Retain this draft");
  await goHome(page); await removeHomeProject(page, repo);
  const guard = page.getByRole("dialog").filter({ hasText: "Keep writing" }); await guard.waitFor(); assert.match(await guard.textContent() ?? "", /acme.*shared.html/);
  await guard.getByRole("button", { name: "Keep writing", exact: true }).click(); assert.equal(await draft.inputValue(), "Retain this draft"); assert.equal(await draft.evaluate(node => node === document.activeElement), true);
  await page.getByRole("button", { name: "Switch worktree", exact: true }).click(); await page.getByRole("menuitem", { name: /^billing / }).click(); await guard.waitFor();
  await guard.getByRole("button", { name: "Discard", exact: true }).click(); await page.getByRole("treeitem", { name: "shared.html", exact: true }).and(page.locator('[aria-current="true"]')).waitFor();
  await wait(async () => !await panel.getByRole("button", { name: "New canvas comment", exact: true }).isDisabled(), "worktree canvas and author ready");
  await shot("05-workspace");
  await page.getByRole("button", { name: "Switch worktree", exact: true }).click(); await page.getByRole("menuitem", { name: /^main / }).click();
  await page.getByRole("treeitem", { name: "shared.html", exact: true }).and(page.locator('[aria-current="true"]')).waitFor();
  assert.equal(await page.locator(".board").evaluate(node => getComputedStyle(node).transform), transform);
  assert.equal((await active()).result.selection, undefined);
  await goHome(page); await rename(plain, `${plain}-moved`); await homeRow(page, plain).getByText("Missing", { exact: true }).waitFor();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, `${plain}-moved`);
  await homeRow(page, plain).getByRole("button", { name: "Locate…", exact: true }).click(); await homeRow(page, `${plain}-moved`).waitFor();
  await writeFile(join(candidate, ".doan/config.json"), "bad"); await homeRow(page, candidate).getByText("Config error", { exact: true }).waitFor();
  await app.evaluate(({ shell }) => { shell.showItemInFolder = path => { Reflect.set(globalThis, "revealedHome", path); }; });
  await homeRow(page, candidate).getByRole("button", { name: "Show in Finder", exact: true }).click(); assert.equal(await app.evaluate(() => Reflect.get(globalThis, "revealedHome")), candidate);
  await homeRow(page, candidate).getByRole("button", { name: "Details", exact: true }).click(); assert.ok(await homeRow(page, candidate).getByRole("paragraph").textContent());
  await shot("06-problems");
  presentation.detailsIndicator = (await homeRow(page, candidate).getByRole("button", { name: "Details", exact: true }).textContent()) === "Details ▾";
  await writeFile(failure, "fail"); await homeRow(page, candidate).getByRole("button", { name: "Retry", exact: true }).click(); await homeRow(page, candidate).getByText("CLI error", { exact: true }).waitFor();
  await rm(failure); await homeRow(page, candidate).getByRole("button", { name: "Retry", exact: true }).click(); await homeRow(page, candidate).getByText("Config error", { exact: true }).waitFor(); await writeFile(join(candidate, ".doan/config.json"), '{"v":1}'); await page.getByRole("button", { name: `Project ${candidate}`, exact: true }).waitFor();
  await enterProject(page, branch); await rename(branch, `${branch}-moved`); await page.getByRole("status").filter({ hasText: "Missing" }).waitFor(); assert.equal(await page.getByRole("region", { name: "Home", exact: true }).count(), 0);
  presentation.statusActionGap = await page.locator(".ws-status .wt-actions").evaluate(node => getComputedStyle(node).gap === "10px");
  const file = join(work, "file.txt"); await writeFile(file, "not a directory"); await addPaths([file]); await page.getByRole("status").getByText("Only folders can be added.", { exact: true }).waitFor();
  await addPaths([plain + "-moved"]); await homeRow(page, plain + "-moved").waitFor();
  await acmeCard.getByText("3 worktrees", { exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: (() => { const data = new DataTransfer(); data.items.add(new File([""], "fixture")); return data; })() })));
  await page.getByRole("region", { name: "Drop folders to add", exact: true }).waitFor(); await shot("07-drop");
  await page.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: new DataTransfer() })));
  await acmeCard.getByText("acme", { exact: true }).click({ button: "right" }); await page.getByRole("menuitem", { name: "Remove all", exact: true }).click();
  await page.getByRole("status").getByText("acme and 2 worktrees removed. Files stay on disk.", { exact: true }).waitFor();
  assert.equal(await acmeCard.count(), 0); await menu("Undo Remove"); await homeRow(page, repo).waitFor();
  assert.deepEqual(presentation, { tooltipPadding: true, detailsIndicator: true, statusActionGap: true });
  console.log("projects-home: PASS");
} catch (error) {
  if (app) { const page = await app.firstWindow(); await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); console.error(`projects-home screenshot: ${join(shots, "failure.png")}`); }
  throw error;
} finally {
  try { await app?.close(); await rm(work, { recursive: true, force: true }); } finally { await assertRealState(beforeRealState); }
}
