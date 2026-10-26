import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication } from "playwright";
const { intrinsicButton }: typeof import("./intrinsic") = await import(new URL("./intrinsic.ts", import.meta.url).href);
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, enterProject, requestProject, removeHomeProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { hoverTooltip }: typeof import("./tooltip") = await import(new URL("./tooltip.ts", import.meta.url).href);
const { appWindow, hideMain, showMain }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { nestedRadius }: typeof import("../src/renderer/ds/checks") = await import(new URL("../src/renderer/ds/checks.ts", import.meta.url).href);
const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-home-"));
const shots = join(root, ".scratch/runtime-test", `projects-home-${Date.now()}`);
let app: ElectronApplication | undefined;
const guard = suiteGuard({ name: "projects-home", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: () => rm(work, { recursive: true, force: true }) });
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
  const repo = join(home, "acme"), branch = join(home, "billing"), detached = join(work, "review");
  await configured(repo); await git(repo, ["init", "-b", "main"]); await git(repo, ["config", "user.name", "Home Test"]); await git(repo, ["config", "user.email", "home@example.test"]); await git(repo, ["add", "."]); await git(repo, ["commit", "-m", "fixture"]);
  await git(repo, ["worktree", "add", "-b", "billing", branch]); await git(repo, ["worktree", "add", "--detach", detached]);
  const mono = join(work, "mono"), monoBranch = join(work, "mono-branch");
  await configured(join(mono, "web")); await git(mono, ["init", "-b", "main"]); await git(mono, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "add", "."]); await git(mono, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "commit", "-m", "fixture"]); await git(mono, ["worktree", "add", "-b", "feature", monoBranch]);
  const plain = join(work, "plain"), empty = join(work, "notes"), parent = join(home, "projects"), candidate = join(parent, "candidate"), notSetup = join(parent, "not-setup");
  await configured(plain); await mkdir(empty); await configured(candidate); await git(candidate, ["init"]); await mkdir(notSetup); await git(notSetup, ["init"]);
  const readyRepo = join(parent, "ready"), readyTree = join(work, "ready-tree");
  await configured(readyRepo); await git(readyRepo, ["init", "-b", "main"]); await git(readyRepo, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "add", "."]); await git(readyRepo, ["-c", "user.name=Home Test", "-c", "user.email=home@example.test", "commit", "-m", "fixture"]); await git(readyRepo, ["worktree", "add", "-b", "ready-branch", readyTree]);
  const uncheckedRepo = join(parent, "unchecked-ready"); await configured(uncheckedRepo); await git(uncheckedRepo, ["init"]);
  const wrapped = join(work, "doan-wrapper.mjs"), failure = join(work, "fail-cli"), slow = join(work, "slow-cli");
  // `slow` holds a path whose saved-folder read (`ls --repo`) takes 2 s.
  await writeFile(wrapped, `#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync(${JSON.stringify(failure)}) && process.argv.includes(${JSON.stringify(candidate)})) process.exit(1);
if (existsSync(${JSON.stringify(slow)}) && process.argv.includes(readFileSync(${JSON.stringify(slow)}, 'utf8'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
const result = spawnSync(${JSON.stringify(cli)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  env.DOAN_CLI = wrapped;
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env }); rememberApp(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  page.on("pageerror", error => console.error("projects-home pageerror", error));
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`projects-home screenshot: ${path}`); };
  async function menu(label: string) {
    const deadline = Date.now() + 10_000;
    while (true) {
      const clicked = await app!.evaluate(({ Menu }, [label, window]) => {
        const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label === label) return item; const child = item.submenu && find(item.submenu.items); if (child) return child; } return undefined; };
        const item = find(Menu.getApplicationMenu()!.items); if (!item?.enabled) return false;
        item.click(undefined, window, undefined); return true;
      }, [label, await appWindow(app!, page)] as const);
      if (clicked) return;
      assert.ok(Date.now() < deadline, `Disabled or missing menu ${label}`);
      await page.waitForTimeout(20);
    }
  }

  async function wait(check: () => Promise<boolean>, name: string) {
    const end = Date.now() + 10_000;
    let lastError: unknown;
    for (;;) {
      try { if (await check()) return; } catch (error) { lastError = error; }
      if (Date.now() >= end) throw lastError ?? new Error(`Timed out waiting for ${name}`);
      await page.waitForTimeout(20);
    }
  }
  async function add(paths: string[]) { await app!.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, paths); await menu("Add Project…"); }
  async function addPaths(paths: string[]) { await app!.evaluate(async ({ ipcMain }, [paths, win]) => { const handler = Reflect.get(ipcMain, "_invokeHandlers").get("folders:add-paths"); await handler({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, { paths }); }, [paths, await appWindow(app!, page)] as const); }
  const presentation: Record<string, boolean> = {};
  const checklist = page.getByRole("dialog", { name: "Add projects", exact: true });
  await page.getByText("Add a project to see its design canvases.", { exact: true }).waitFor(); await shot("01-empty");
  assert.equal(await page.locator(".empty .kbd").evaluate(node => getComputedStyle(node).color === getComputedStyle(node.parentElement!).color), true, "primary shortcut uses the primary ink");
  assert.equal(await page.locator(".empty .kbd").evaluate(node => getComputedStyle(node).opacity), "1", "the shortcut is not dimmed");
  await add([repo]); await checklist.waitFor();
  assert.equal(await checklist.getByRole("checkbox", { name: "billing worktree", exact: true }).isChecked(), false);
  await checklist.getByRole("checkbox", { name: "billing worktree", exact: true }).check();
  await checklist.getByRole("checkbox", { name: "review worktree", exact: true }).check();
  await checklist.getByRole("button", { name: "Add Worktrees", exact: true }).click(); await checklist.waitFor({ state: "hidden" });
  await add([join(mono, "web"), join(monoBranch, "web"), plain]);
  await checklist.waitFor(); await checklist.getByRole("button", { name: /^(Not Now|Cancel)$/ }).click();
  await homeRow(page, plain).and(page.getByRole("button", { name: /^Project / })).waitFor();
  const acmeCard = page.getByRole("region", { name: "acme", exact: true });
  await acmeCard.getByText("3 worktrees", { exact: true }).waitFor();
  await acmeCard.getByText(/^detached [0-9a-f]{7}$/).waitFor();
  await page.getByRole("region", { name: "web", exact: true }).getByText("2 worktrees", { exact: true }).waitFor();
  assert.equal(await homeRow(page, plain).getByText(/detached|main/).count(), 0);
  await homeRow(page, plain).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show in Finder", exact: true }).waitFor();
  assert.equal(await page.getByRole("menu").getByRole("separator").count(), 2, "row menu separates reveal, settings and remove");
  assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allTextContents(), ["Show in Finder", "Project Settings…", "Remove from doan"]); await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).waitFor(); await page.keyboard.press("Escape");
  await wait(async () => homeRow(page, plain).evaluate(node => node === document.activeElement), "pointer row menu restores focus");
  presentation.multiHighlight = await page.getByRole("region", { name: "web", exact: true }).evaluate(node => getComputedStyle(node).boxShadow !== "none");
  presentation.singular = !(await homeRow(page, repo).innerText()).includes("1 canvases");
  await homeRow(page, repo).focus(); await page.keyboard.press("Tab");
  presentation.cardTab = await page.getByRole("region", { name: "web", exact: true }).evaluate(node => node.contains(document.activeElement));
  await homeRow(page, repo).focus(); await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Show in Finder", exact: true }).waitFor();
  presentation.rowKeyboardMenu = await page.getByRole("menuitem", { name: "Show in Finder", exact: true }).isVisible();
  await page.keyboard.press("Escape");
  await wait(async () => homeRow(page, repo).evaluate(node => node === document.activeElement), "keyboard row menu restores focus");
  await homeRow(page, repo).focus(); await page.keyboard.press("ArrowDown");
  assert.equal(await homeRow(page, branch).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("ContextMenu"); await page.getByRole("menuitem", { name: "Show in Finder", exact: true }).waitFor(); await page.keyboard.press("Escape");
  await wait(async () => homeRow(page, branch).evaluate(node => node === document.activeElement), "closing the row menu restores keyboard focus");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "acme overview", exact: true }).waitFor(); await goHome(page);
  assert.match(await homeRow(page, repo).getAttribute("aria-label") ?? "", /main.*1 canvas.*0 open comments/);
  presentation.textDrop = await page.evaluate(() => { const data = new DataTransfer(); data.setData("text/plain", "text"); const event = new DragEvent("drop", { dataTransfer: data, cancelable: true }); window.dispatchEvent(event); return !event.defaultPrevented; });
  await shot("02-home");
  const pathTooltip = await hoverTooltip(page, homeRow(page, repo).getByText("~/acme", { exact: true }));
  presentation.tooltipPadding = await pathTooltip.evaluate(node => { const css = getComputedStyle(node.closest('[data-slot="tooltip-content"]')!); return css.padding === "4px 8px"; });
  assert.equal(await pathTooltip.textContent(), repo);
  await page.mouse.move(500, 20);
  await add([candidate]); await homeRow(page, candidate).waitFor();
  const beforeCandidates: string[] = JSON.parse(await readFile(join(userData, "folders.json"), "utf8"));
  await add([parent]); await checklist.waitFor();
  await checklist.getByText("~/projects", { exact: true }).waitFor();
  const already = checklist.getByRole("checkbox", { name: "candidate", exact: true }); await already.waitFor(); assert.equal(await already.isDisabled(), true);
  const pending = checklist.getByRole("checkbox", { name: "not-setup", exact: true }); await pending.waitFor();
  await wait(async () => !await checklist.getByRole("checkbox", { name: "ready", exact: true }).isDisabled(), "ready candidate read completes");
  assert.equal(await checklist.getByRole("checkbox", { name: "ready", exact: true }).isChecked(), true);
  assert.equal(await checklist.getByRole("checkbox", { name: "ready-tree worktree", exact: true }).isChecked(), false);
  const unchecked = checklist.getByRole("checkbox", { name: "unchecked-ready", exact: true });
  await wait(async () => !await unchecked.isDisabled(), "unchecked ready candidate read completes");
  assert.equal(await unchecked.isChecked(), true); await unchecked.uncheck();
  await pending.check(); await checklist.getByRole("button", { name: "Add 2 Projects", exact: true }).click(); await checklist.waitFor({ state: "hidden" });
  assert.equal(await homeRow(page, parent).count(), 0); await homeRow(page, notSetup).getByText("Not set up", { exact: true }).waitFor();
  const afterCandidates: string[] = JSON.parse(await readFile(join(userData, "folders.json"), "utf8"));
  assert.deepEqual(afterCandidates.filter(path => !beforeCandidates.includes(path)).sort(), [notSetup, readyRepo].sort(), "only checked candidate paths are saved");
  await homeRow(page, readyRepo).waitFor(); assert.equal(await homeRow(page, uncheckedRepo).count(), 0); assert.equal(await homeRow(page, readyTree).count(), 0);
  // Reduced motion keeps the dialogs' fade but drops their travel; the confirmation hands
  // over to Project Setup, and closing that returns focus to the row.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialogFrame = (dialog: Element) => { const s = getComputedStyle(dialog), r = dialog.getBoundingClientRect(); return { transform: s.transform, travels: s.transitionProperty.split(", ").includes("transform"), top: Math.round(r.top), centred: Math.abs(r.top - (innerHeight - r.bottom)) <= 1 }; };
  await add([empty]); const confirm = page.getByRole("dialog", { name: "Set up notes as a doan project?", exact: true }); await confirm.waitFor();
  assert.deepEqual({ ...await confirm.evaluate(dialogFrame), top: undefined }, { transform: "none", travels: false, top: undefined, centred: true }, "compact confirmation: centred, no travel under reduced motion");
  await shot("03-confirm");
  assert.match(await confirm.innerText(), /doan will add it as a project that is not set up yet, then open the setup form/);
  await confirm.getByRole("button", { name: "Set Up…", exact: true }).click(); const setup = page.getByRole("dialog", { name: "Set Up Project", exact: true }); await setup.waitFor();
  assert.deepEqual({ ...await setup.evaluate(dialogFrame), centred: undefined }, { transform: "none", travels: false, top: 128, centred: undefined }, "standard dialog hangs 128px from the top with no travel");
  assert.equal(await confirm.count(), 0, "Project Setup replaces the confirmation");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await setup.evaluate(dialogFrame).then(m => m.travels), true, "the same dialog travels when motion is allowed");
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: (() => { const data = new DataTransfer(); data.items.add(new File([""], "fixture")); return data; })() })));
  assert.equal(await page.getByRole("region", { name: "Drop folders to add", exact: true }).count(), 0);
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await homeRow(page, empty).getByText("Not set up", { exact: true }).waitFor();
  assert.equal(await homeRow(page, empty).evaluate(row => row === document.activeElement), true);
  await add([plain]); await homeRow(page, plain).waitFor(); await wait(async () => await homeRow(page, plain).evaluate(row => row.closest(".card")?.classList.contains("flash") === true), "duplicate highlight");
  const saved = JSON.parse(await readFile(join(userData, "folders.json"), "utf8"));
  await removeHomeProject(page, plain); const toast = page.getByRole("status").filter({ hasText: "Files stay on disk." }); await toast.waitFor(); await shot("04-toast");
  await toast.hover(); await page.waitForTimeout(8200); assert.equal(await toast.isVisible(), true);
  await toast.getByRole("button", { name: "Undo", exact: true }).focus(); await page.keyboard.press("Enter"); await homeRow(page, plain).waitFor();
  const undoFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label"), visibleHome: !!document.activeElement?.closest(".home-shell"), rect: document.activeElement?.getBoundingClientRect().toJSON() }));
  console.log("keyboard Undo focus", undoFocus);
  assert.equal(undoFocus.visibleHome, true, "keyboard Undo returns focus to a surviving Home control");
  assert.equal(await page.locator(".workspace").getAttribute("inert"), "", "Undo does not reopen a workspace");
  assert.deepEqual(JSON.parse(await readFile(join(userData, "folders.json"), "utf8")), saved);
  await removeHomeProject(page, plain); await toast.waitFor(); await menu("Undo Remove"); await homeRow(page, plain).waitFor();
  // Count completed production invalidations, not merely queued IPC sends.
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("folders:forget-removal");
    const probe = { original, completed: [] as string[] }; Reflect.set(globalThis, "removalExpiryProbe", probe);
    ipcMain.removeHandler("folders:forget-removal");
    ipcMain.handle("folders:forget-removal", async (...args) => {
      const result = await original(...args); probe.completed.push(args[1].removalId); return result;
    });
  });
  try {
    for (const kind of ["close", "hide"] as const) {
      for (const action of ["undo", "expire"] as const) {
        const beforeRemoval = JSON.parse(await readFile(join(userData, "folders.json"), "utf8"));
        await removeHomeProject(page, plain); await toast.waitFor();
        await page.mouse.move(5, 5); await homeRow(page, repo).focus();
        await page.waitForTimeout(2200);
        await hideMain(app, page, kind);
        await page.waitForTimeout(8300);
        const beforeExpiry = await app.evaluate(() => Reflect.get(globalThis, "removalExpiryProbe").completed.length);
        const resumed = performance.now();
        const expiryDeadline = resumed + 7000;
        await showMain(app, page);
        assert.equal(await toast.isVisible(), true, `${kind} preserves Undo beyond eight hidden seconds`);
        // Delay observation deliberately: screenshot/IPC latency must not extend the expiry budget.
        if (action === "expire") await page.waitForTimeout(2200);
        assert.equal(await toast.isVisible(), true, `${kind} retains usable time after return`);
        await shot(`04-native-${kind}-${action}`);
        if (action === "undo") {
          await toast.getByRole("button", { name: "Undo", exact: true }).click();
          await homeRow(page, plain).waitFor();
          assert.deepEqual(JSON.parse(await readFile(join(userData, "folders.json"), "utf8")), beforeRemoval);
        } else {
          const remaining = expiryDeadline - performance.now();
          assert.ok(remaining > 0, `${kind} observation exceeded the absolute expiry deadline`);
          await toast.waitFor({ state: "hidden", timeout: remaining });
          assert.ok(performance.now() <= expiryDeadline, `${kind} expires within seven seconds of native return`);
          console.log(`projects-home ${kind} expiry observed ${Math.round(performance.now() - resumed)}ms after native return`);
          await wait(() => app!.evaluate((_electron, count) => Reflect.get(globalThis, "removalExpiryProbe").completed.length === count + 1, beforeExpiry), "expiry invalidation completed");
          const id: string = await app.evaluate(() => Reflect.get(globalThis, "removalExpiryProbe").completed.at(-1));
          assert.deepEqual(await page.evaluate(id => window.doan.restoreProjects(id), id), { kind: "unavailable" });
          await page.waitForTimeout(500);
          assert.equal(await app.evaluate((_electron, id) => Reflect.get(globalThis, "removalExpiryProbe").completed.filter((value: string) => value === id).length, id), 1);
          await add([plain]); await homeRow(page, plain).waitFor();
        }
      }
    }
  } finally {
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("folders:forget-removal"); ipcMain.handle("folders:forget-removal", Reflect.get(globalThis, "removalExpiryProbe").original); });
  }
  await enterProject(page, repo); await canvasRow(page, "shared.html").click(); await page.frameLocator("iframe").getByRole("button", { name: "Target", exact: true }).click();
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env })).stdout);
  const before = await active(); assert.equal(before.result.selection.element.doanId, "target"); const frame = await page.locator("iframe").elementHandle(); assert.ok(frame);
  await menu("Actual Size");
  const transform = await page.locator(".board").evaluate(node => getComputedStyle(node).transform);
  await menu("Home"); await homeRow(page, repo).getByText(/^Selected for your agent:/).waitFor(); assert.deepEqual(await active(), before);
  assert.equal(await frame.evaluate(node => node.isConnected), true);
  assert.equal(await page.locator(".workspace").evaluate(node => getComputedStyle(node).visibility), "hidden");
  assert.equal(await page.locator(".workspace").getAttribute("inert"), "");
  await enterProject(page, repo); assert.equal(await page.locator(".board").evaluate(node => getComputedStyle(node).transform), transform);
  await page.getByRole("button", { name: "Reload canvas", exact: true }).focus();
  await add([repo]); await homeRow(page, repo).waitFor(); await enterProject(page, repo);
  assert.equal(await page.getByRole("button", { name: "Reload canvas", exact: true }).evaluate(node => node === document.activeElement), true, "duplicate add retains workspace focus");
  await menu("Home"); await homeRow(page, repo).waitFor();
  await wait(async () => acmeCard.evaluate(node => getComputedStyle(node).boxShadow === "none"), "previous duplicate highlight expires");
  await add([repo]); await wait(async () => acmeCard.evaluate(node => getComputedStyle(node).boxShadow !== "none"), "duplicate highlight renders"); await enterProject(page, repo);
  assert.equal(await page.getByRole("button", { name: "Reload canvas", exact: true }).evaluate(node => node === document.activeElement), true, "duplicate while already Home retains workspace focus");
  const panel = page.getByRole("region", { name: "Comments", exact: true }); await panel.getByRole("button", { name: "Comment on selection", exact: true }).click();
  const draft = panel.getByRole("textbox", { name: "New comment body", exact: true }); await draft.fill("Retain this draft");
  await goHome(page); await removeHomeProject(page, repo);
  const guard = page.getByRole("dialog").filter({ hasText: "Keep writing" }); await guard.waitFor(); assert.match(await guard.textContent() ?? "", /Your unsaved comment belongs to acme \(main\) › shared\.html\./); assert.equal(await guard.locator(".comments-target").textContent(), "To: Element · button target · in Hero");
  await guard.getByRole("button", { name: "Keep writing", exact: true }).click(); assert.equal(await draft.inputValue(), "Retain this draft"); assert.equal(await draft.evaluate(node => node === document.activeElement), true);
  await page.getByRole("button", { name: "Switch worktree", exact: true }).click(); presentation.radio = await page.getByRole("menuitemradio", { name: /^main /, checked: true }).isVisible(); await page.getByRole("menuitemradio", { name: /^billing / }).click(); await guard.waitFor();
  await guard.getByRole("button", { name: "Discard", exact: true }).click(); await canvasRow(page, "shared.html").and(page.locator(".is-open")).waitFor();
  await wait(async () => !await panel.getByRole("button", { name: "Comment on canvas", exact: true }).isDisabled(), "worktree canvas and author ready");
  await shot("05-workspace");
  await page.getByRole("button", { name: "Switch worktree", exact: true }).click();
  // The menu over the canvas is the floating material: blurred, with rows concentric to it.
  const floating = await page.locator('.menu[aria-label="Worktrees"]').evaluate(menu => {
    const root = getComputedStyle(document.documentElement), px = (name: string) => parseFloat(root.getPropertyValue(name));
    return { blur: getComputedStyle(menu).backdropFilter, outer: px("--radius-container"), inset: px("--space-1"), row: parseFloat(getComputedStyle(menu.querySelector(".doan-menu-item")!).borderTopLeftRadius), width: menu.getBoundingClientRect().width };
  });
  assert.ok(floating.width <= 320, `the worktree menu keeps the 320px menu cap (${floating.width}px)`);
  assert.notEqual(floating.blur, "none", "the worktree menu over the canvas blurs what is under it");
  assert.equal(floating.row, nestedRadius(floating.outer, floating.inset, 1), "menu rows take the nested corner of the menu");
  await page.getByRole("menuitemradio", { name: /^main / }).click();
  await canvasRow(page, "shared.html").and(page.locator(".is-open")).waitFor();
  assert.equal(await page.locator(".board").evaluate(node => getComputedStyle(node).transform), transform);
  assert.equal((await active()).result.selection, undefined);
  await writeFile(join(repo, ".doan/config.json"), "bad");
  const workspaceConfig = page.getByRole("status").filter({ has: page.getByRole("button", { name: "Details", exact: true }) });
  await workspaceConfig.getByText("Config error", { exact: true }).waitFor(); await shot("08-workspace-config");
  const finder = workspaceConfig.getByRole("button", { name: "Show in Finder", exact: true });
  const natural = await finder.evaluate(intrinsicButton);
  assert.equal(natural.actual, natural.natural, "status buttons keep their intrinsic height");
  const parentStyle = await finder.evaluate(node => {
    const parent = node.parentElement!, previous = parent.getAttribute("style");
    parent.style.alignItems = "stretch";
    parent.style.minHeight = `${node.getBoundingClientRect().height + 8}px`;
    return previous;
  });
  try {
    const stretched = await finder.evaluate(intrinsicButton);
    assert.throws(() => assert.equal(stretched.actual, stretched.natural), "the intrinsic-height check detects flex stretch");
  } finally {
    await finder.evaluate((node, previous) => { if (previous === null) node.parentElement!.removeAttribute("style"); else node.parentElement!.setAttribute("style", previous); }, parentStyle);
  }
  const restored = await finder.evaluate(intrinsicButton);
  assert.equal(restored.actual, restored.natural, "stretch control restores the original DOM style");
  await workspaceConfig.getByRole("button", { name: "Details", exact: true }).click(); await page.getByRole("region", { name: "Project status", exact: true }).getByText(/^Cannot read config:/).waitFor(); await shot("09-workspace-details");
  const detailsBounds = await workspaceConfig.getByRole("button", { name: "Details", exact: true }).boundingBox(), homeBounds = await workspaceConfig.getByRole("button", { name: "Go Home", exact: true }).boundingBox();
  assert.ok(homeBounds && detailsBounds && Math.abs(homeBounds.y + homeBounds.height / 2 - detailsBounds.y - detailsBounds.height / 2) < 1, "Go Home stays on the action line when details expand");
  await rm(join(repo, ".doan/config.json"));
  await page.getByRole("status").getByText("The project acme is not set up. Use Set Up… on Home.", { exact: true }).waitFor(); await shot("10-workspace-notsetup");
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}'); await canvasRow(page, "shared.html").waitFor();
  await goHome(page); await rename(plain, `${plain}-moved`); await homeRow(page, plain).getByText("Missing", { exact: true }).waitFor();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, `${plain}-moved`);
  await homeRow(page, plain).getByRole("button", { name: "Locate…", exact: true }).focus(); await page.keyboard.press("Enter"); await homeRow(page, `${plain}-moved`).waitFor();
  const homeLocateFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label"), visible: !!document.activeElement?.closest(".home-shell"), rect: document.activeElement?.getBoundingClientRect().toJSON() }));
  console.log("Home Locate focus", homeLocateFocus);
  assert.equal(homeLocateFocus.visible, true, "Locate keeps keyboard focus in the surviving Home screen");
  await writeFile(join(candidate, ".doan/config.json"), "bad"); await homeRow(page, candidate).getByText("Config error", { exact: true }).waitFor();
  await app.evaluate(({ shell }) => { shell.showItemInFolder = path => { Reflect.set(globalThis, "revealedHome", path); }; });
  await homeRow(page, candidate).getByRole("button", { name: "Show in Finder", exact: true }).click(); assert.equal(await app.evaluate(() => Reflect.get(globalThis, "revealedHome")), candidate);
  await homeRow(page, candidate).getByRole("button", { name: "Details", exact: true }).click(); assert.ok(await homeRow(page, candidate).getByRole("paragraph").textContent());
  await shot("06-problems");
  presentation.detailsIndicator = (await homeRow(page, candidate).getByRole("button", { name: "Details", exact: true }).textContent()) === "Details ▾";
  await writeFile(failure, "fail"); await homeRow(page, candidate).getByRole("button", { name: "Retry", exact: true }).click(); await homeRow(page, candidate).getByText("CLI error", { exact: true }).waitFor();
  await rm(failure); await homeRow(page, candidate).getByRole("button", { name: "Retry", exact: true }).click(); await homeRow(page, candidate).getByText("Config error", { exact: true }).waitFor(); await writeFile(join(candidate, ".doan/config.json"), '{"v":1}'); await homeRow(page, candidate).and(page.getByRole("button", { name: /^Project / })).waitFor();
  await enterProject(page, branch); await rename(branch, `${branch}-moved`); await page.getByRole("status").filter({ has: page.getByRole("button", { name: "Locate…", exact: true }) }).waitFor(); assert.equal(await page.getByRole("region", { name: "Home", exact: true }).count(), 0);
  await page.getByRole("status").getByText("~/billing", { exact: true }).waitFor();
  presentation.statusActionGap = await page.locator(".ws-status .wt-actions").evaluate(node => getComputedStyle(node).gap === "10px");
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, `${branch}-moved`);
  await page.getByRole("status").filter({ has: page.getByRole("button", { name: "Locate…", exact: true }) }).getByRole("button", { name: "Locate…", exact: true }).click();
  await wait(async () => (await page.getByRole("button", { name: "billing-moved overview", exact: true }).count()) > 0, "Locate retains the moved workspace");
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).count(), 0);
  const workspaceLocateFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label"), visible: !!document.activeElement?.closest(".workspace") && !document.activeElement?.closest("[inert]"), rect: document.activeElement?.getBoundingClientRect().toJSON() }));
  console.log("workspace Locate focus", workspaceLocateFocus);
  assert.equal(workspaceLocateFocus.visible, true, "Locate keeps focus in the surviving workspace");
  const file = join(work, "file.txt"); await writeFile(file, "not a directory"); await addPaths([file]); await page.getByRole("status").getByText("Only folders can be added.", { exact: true }).waitFor();
  await addPaths([plain + "-moved"]); await homeRow(page, plain + "-moved").waitFor();
  await acmeCard.getByText("3 worktrees", { exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: (() => { const data = new DataTransfer(); data.items.add(new File([""], "fixture")); return data; })() })));
  await page.getByRole("region", { name: "Drop folders to add", exact: true }).waitFor(); await shot("07-drop");
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragleave", { dataTransfer: (() => { const data = new DataTransfer(); data.items.add(new File([""], "fixture")); return data; })() })));
  await acmeCard.getByText("acme", { exact: true }).click({ button: "right" }); await page.getByRole("menuitem", { name: "Remove all", exact: true }).click();
  await page.getByRole("status").getByText("acme and 2 worktrees removed. Files stay on disk.", { exact: true }).waitFor();
  assert.equal(await acmeCard.count(), 0); await menu("Undo Remove"); await homeRow(page, repo).waitFor();
  assert.deepEqual(presentation, { tooltipPadding: true, detailsIndicator: true, statusActionGap: true, multiHighlight: true, singular: true, cardTab: true, rowKeyboardMenu: true, textDrop: true, radio: true });
  const many = join(work, "many");
  for (let index = 0; index < 14; index++) { const path = join(many, `repo-${String(index).padStart(2, "0")}`); await mkdir(path, { recursive: true }); await git(path, ["init"]); }
  await add([many]); await checklist.waitFor();
  const lastCandidate = checklist.getByRole("checkbox", { name: "repo-13", exact: true });
  await wait(async () => !await lastCandidate.isDisabled(), "all candidates checked");
  const list = checklist.getByRole("group", { name: "Repositories", exact: true });
  await list.hover(); await page.mouse.wheel(0, 1600); await page.waitForTimeout(250);
  const lastRect = await lastCandidate.boundingBox(), listRect = await list.boundingBox();
  assert.ok(lastRect && listRect && lastRect.y >= listRect.y && lastRect.y + lastRect.height <= listRect.y + listRect.height, "wheel exposes the last checklist candidate");
  await page.mouse.click(lastRect.x + lastRect.width / 2, lastRect.y + lastRect.height / 2);
  assert.equal(await lastCandidate.isChecked(), true);
  await checklist.getByRole("button", { name: "Cancel", exact: true }).click();
  const addedProject = join(home, "added-project"); await configured(addedProject);
  // The toast's Open is clicked while the added project is still being read.
  await enterProject(page, repo); await writeFile(slow, addedProject); await add([addedProject]);
  const addedToast = page.getByRole("status").filter({ hasText: "Added added-project" }); await addedToast.getByRole("button", { name: "Open", exact: true }).waitFor(); await shot("11-added-toast");
  await addedToast.getByRole("button", { name: "Open", exact: true }).click(); await page.getByRole("button", { name: "added-project overview", exact: true }).waitFor(); await rm(slow);
  const mixedProject = join(home, "mixed-project"); await configured(mixedProject);
  await goHome(page); await add([addedProject, mixedProject]); await homeRow(page, mixedProject).waitFor();
  assert.equal(await page.getByRole("region", { name: "mixed-project", exact: true }).evaluate(node => getComputedStyle(node).boxShadow !== "none"), true, "mixed additions highlight new cards");
  assert.equal(await page.getByRole("region", { name: "added-project", exact: true }).evaluate(node => getComputedStyle(node).boxShadow !== "none"), true, "mixed additions highlight duplicate cards");
  await homeRow(page, detached).focus(); await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Remove from doan", exact: true }).click();
  await homeRow(page, detached).waitFor({ state: "detached" });
  await acmeCard.getByRole("button", { name: "Project menu acme", exact: true }).focus(); await page.keyboard.press("Tab");
  assert.equal(await homeRow(page, repo).evaluate(node => node === document.activeElement), true, "Tab reaches the first remaining row after focused-row removal");
  await enterProject(page, repo);
  assert.equal(await page.locator(".board iframe").count(), 0, "Undo Remove does not restore a remembered canvas");
  await canvasRow(page, "shared.html").click();
  await wait(async () => !await panel.getByRole("button", { name: "Comment on canvas", exact: true }).isDisabled(), "canvas author ready for missing draft");
  await panel.getByRole("button", { name: "Comment on canvas", exact: true }).click(); await draft.fill("Retained missing-project draft");
  await rename(repo, `${repo}-missing`);
  await page.getByRole("region", { name: "Project status", exact: true }).getByText("Missing", { exact: true }).waitFor();
  await goHome(page); await removeHomeProject(page, mixedProject); await homeRow(page, mixedProject).waitFor({ state: "detached" });
  assert.equal(await guard.count(), 0, "unrelated removal does not guard the retained draft");
  for (const all of [false, true]) {
    if (all) { await acmeCard.getByRole("button", { name: "Project menu acme", exact: true }).click(); await page.getByRole("menuitem", { name: "Remove all", exact: true }).click(); }
    else await homeRow(page, repo).getByRole("button", { name: "Remove", exact: true }).click();
    await guard.waitFor(); await guard.getByRole("button", { name: "Keep writing", exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "Home", exact: true }).count(), 0);
    assert.equal(await draft.inputValue(), "Retained missing-project draft"); assert.equal(await draft.isVisible(), true);
    await goHome(page);
  }
  await homeRow(page, repo).getByRole("button", { name: "Remove", exact: true }).click(); await guard.waitFor(); await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await homeRow(page, repo).waitFor({ state: "detached" });

} catch (error) {
  console.error(error);
  if (app) { const page = await app.firstWindow(); await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); console.error(`projects-home screenshot: ${join(shots, "failure.png")}`); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
  throw error;
} finally {
  await guard.finish();
}

console.log("projects-home: PASS");
