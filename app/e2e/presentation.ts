// Standalone production/dev presentation checks; build the app before running.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright";
import { resolveConfig } from "electron-vite";
import { createServer, type ViteDevServer } from "vite";
const { rememberApp, waitFor, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow, settingsPage }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { enterProject, goHome, removeHomeProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { hoverTooltip }: typeof import("./tooltip") = await import(new URL("./tooltip.ts", import.meta.url).href);
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const dev = process.argv.includes("--dev");
const shots = join(root, ".scratch/runtime-test", `presentation-${dev ? "dev" : "production"}-${Date.now()}`);
const before = await realState();
const work = await realpath(await mkdtemp("/tmp/doan-presentation-"));
let app: ElectronApplication | undefined, server: ViteDevServer | undefined;
const failures: string[] = [], messages: string[] = [], errors: string[] = [];
const guard = suiteGuard({ name: "presentation", app: () => app, verify: () => assertRealState(before), cleanup: async () => { await server?.close(); await rm(work, { recursive: true, force: true }); } });
function check(ok: boolean, name: string, actual: unknown) {
  console.log(`${ok ? "PASS" : "REGRESSION"}: ${name} ${JSON.stringify(actual)}`);
  if (!ok) failures.push(name);
}
async function styles(node: Locator) {
  return node.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { text: el.textContent, color: s.color, background: s.backgroundColor, radius: s.borderRadius,
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], outline: [s.outlineColor, s.outlineWidth, s.outlineOffset],
      border: s.borderColor, scheme: s.colorScheme, display: s.display, gap: s.gap, opacity: s.opacity, z: s.zIndex,
      x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, scroll: el.scrollWidth, client: el.clientWidth };
  });
}
async function token(page: Page, name: string) {
  return page.evaluate(name => { const el = document.createElement("span"); el.style.color = `var(${name})`; document.body.append(el); const color = getComputedStyle(el).color; el.remove(); return color; }, name);
}
async function shot(page: Page, name: string) { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`screenshot: ${path}`); }
async function focus(page: Page, node: Locator, label: string) {
  const unfocused = await styles(node); await page.keyboard.press("Tab"); await node.focus();
  // One outer ring for every button, primary or not.
  const measured = await styles(node), expected = await token(page, "--border-focus");
  check(await node.evaluate(el => el.matches(":focus-visible")) && measured.outline[0] === expected && measured.outline[1] === "2px" && measured.outline[2] === "2px", label, measured);
  check(unfocused.width === measured.width && unfocused.height === measured.height, `${label} geometry unchanged`, measured);
}
async function reason(page: Page, label: string) {
  const row = page.locator('.cn-row[data-connection="cli"]');
  if (await row.locator(".cn-name").getAttribute("aria-expanded") !== "true") await row.locator(".cn-name").click();
  const child = row.locator(".ob-reason code"); await child.waitFor();
  const m = await styles(child);
  check(m.color === await token(page, "--text-standard") && m.background === await token(page, "--surface-panel") && m.radius === "4px" && JSON.stringify(m.padding) === JSON.stringify(["0px", "4px", "0px", "4px"]), `${label} actual reason code`, m);
  const shared = await styles(row);
  check(shared.display === "grid" && shared.gap === "4px 12px" && shared.padding[0] === "12px", `${label} shared connection CSS`, shared);
  check(await page.locator("html").evaluate(el => getComputedStyle(el).colorScheme) === "light", `${label} renderer light`, await styles(page.locator("html")));
}
// Field borders change colour over 150ms; poll until no transition is running (getAnimations
// flushes style first) so each check reads the settled value, including one that must stay
// put after blur.
async function settled(node: Locator) {
  await waitFor(() => node.evaluate(el => el.getAnimations().length === 0), "field border transition");
}
async function firstPrompt(page: Page, label: string) {
  const input = page.locator(".fp-input"); await input.waitFor();
  await input.fill("a".repeat(501));
  await settled(input);
  const invalid = await styles(input);
  // The field shows focus and errors with its own border, never an outline ring.
  check(await input.getAttribute("aria-invalid") === "true" && await input.evaluate(el => getComputedStyle(el).outlineStyle) === "none" && invalid.border === await token(page, "--border-danger") && await page.locator(".fp-error").isVisible(), `${label} invalid focus`, invalid);
  const disabled = page.locator(".ob-prompt .btn.primary");
  const disabledStyles = await styles(disabled);
  check(await disabled.isDisabled() && disabledStyles.opacity === "1" && disabledStyles.color === await token(page, "--text-disabled") && disabledStyles.background === await token(page, "--affordance-disabled"), `${label} disabled primary preserved`, disabledStyles);
  await shot(page, `${label}-invalid-focus`);
  await input.press("Tab");
  await settled(input);
  check((await styles(input)).border === await token(page, "--border-danger"), `${label} invalid blur border`, await styles(input));
  await input.fill("a sign-in screen");
  await settled(input);
  check(await input.getAttribute("aria-invalid") === null && (await styles(input)).border === await token(page, "--border-prominent"), `${label} valid focus`, await styles(input));
  await focus(page, page.locator(".ob-prompt .btn.primary"), `${label} primary focus`);
  await shot(page, `${label}-focus`);
}
try {
  const home = join(work, "home"), data = join(work, "data"), cli = join(work, "doan"), shell = join(work, "shell");
  const repo = join(home, "acme"), empty = join(home, "empty"), removed = join(home, "removed");
  const branch = `feature/${"unbroken".repeat(28)}`, tree = join(home, "worktree");
  await mkdir(join(home, ".local/bin"), { recursive: true }); await mkdir(data); await mkdir(shots, { recursive: true });
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await symlink(join(work, "missing-cli"), join(home, ".local/bin/doan"));
  for (const path of [repo, empty, removed]) {
    await mkdir(join(path, ".doan"), { recursive: true }); await mkdir(join(path, "design"));
    await writeFile(join(path, ".doan/config.json"), '{"v":1}');
  }
  await exec("git", ["init", "-q", "-b", branch, repo]);
  await exec("git", ["-C", repo, "config", "user.name", "Presentation"]); await exec("git", ["-C", repo, "config", "user.email", "presentation@example.test"]);
  await exec("git", ["-C", repo, "add", ".doan/config.json"]);
  await exec("git", ["-C", repo, "commit", "-qm", "init"]);
  await exec("git", ["-C", repo, "worktree", "add", "-qb", "second", tree]);
  const title = "UnbrokenCanvasTitle".repeat(15);
  await writeFile(join(repo, "design/canvas.html"), `<!doctype html><title>${title}</title><meta name="doan:canvas" content="presentation"><meta name="doan:width" content="800"><style>section{color:rgb(1,2,3)}@media(prefers-color-scheme:dark){section{color:rgb(4,5,6)}}body{margin:0;background:#eee;min-height:900px}section{margin:80px;width:500px;height:300px;background:#ddd}</style><section data-doan-frame="hero">Presentation frame</section>`);
  await writeFile(join(repo, "design/no-width.html"), '<!doctype html><title>No width</title><meta name="doan:canvas" content="no-width"><p>No width</p>');
  await writeFile(join(data, "folders.json"), JSON.stringify([repo, tree, empty, removed]));
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const env = { ...process.env, HOME: home, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(data, "runtime.json") };
  if (dev) {
    const config = await resolveConfig({ root: join(root, "app"), configFile: join(root, "app/electron.vite.config.ts") }, "serve", "development");
    assert.ok(config.config?.renderer);
    server = await createServer({ ...config.config.renderer, root: join(root, "app/src/renderer") }); await server.listen();
    const url = server.resolvedUrls?.local[0]; assert.ok(url); Object.assign(env, { ELECTRON_RENDERER_URL: url.replace(/\/$/, "") });
    console.log(`DEV renderer: ${url}`);
  } else {
    for (const name of ["index", "settings"]) {
      const html = await readFile(join(root, `app/out/renderer/${name}.html`), "utf8");
      check(/<link[^>]+rel="stylesheet"/.test(html), `${name} production stylesheet link`, html);
    }
  }
  app = rememberApp(await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${data}`], env }));
  app.on("window", page => { page.on("console", message => { if (/content security policy|refused to/i.test(message.text())) messages.push(message.text()); }); page.on("pageerror", error => errors.push(String(error))); });
  const page = await app.firstWindow(); page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (/content security policy|refused to/i.test(message.text())) messages.push(message.text()); });
  await page.reload();
  const wizard = page.getByRole("dialog", { name: "Set Up doan", exact: true }); await wizard.waitFor();
  await reason(page, "main"); await shot(page, "main-connections");
  await wizard.getByRole("list", { name: "Steps" }).getByRole("button").filter({ hasText: "Project" }).click();
  // Choose a known empty project through the native picker boundary.
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, empty);
  await wizard.getByRole("button", { name: "Open Project…", exact: true }).click();
  await firstPrompt(page, "wizard");
  await wizard.getByRole("button", { name: /^Close/ }).click(); await wizard.waitFor({ state: "hidden" });
  await page.evaluate(() => window.doan.openSettings({ tab: "connections" }));
  const settings = await settingsPage(app); settings.setDefaultTimeout(15_000);
  await reason(settings, "settings"); await shot(settings, "settings-connections");
  await settings.locator('.cn-row[data-connection="cli"]').getByRole("button", { name: "Fix…", exact: true }).click();
  const confirm = settings.getByRole("alertdialog"); await confirm.waitFor();
  await focus(settings, confirm.locator(".btn.primary"), "settings primary focus"); await shot(settings, "settings-primary");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(project => window.doan.openSettings({ tab: "projects", project }), repo);
  await settings.getByRole("tab", { name: "Projects", selected: true }).waitFor();
  await (await appWindow(app, settings)).evaluate(window => window.setContentSize(640, 650));
  await settings.locator(".pj-name .meta").waitFor();
  const branchBox = await styles(settings.locator(".pj-name .meta")), detail = await styles(settings.locator(".pj-detail"));
  check(branchBox.text?.includes(branch) === true && branchBox.height > 20 && detail.scroll <= detail.client, "640px unbroken branch wraps without overflow", { branchBox, detail });
  for (const name of ["Change…", "Add…"]) {
    const button = settings.locator(".pj-detail").getByRole("button", { name, exact: true }); await button.waitFor();
    const m = await styles(button); check(m.right <= 640 && m.x >= 0 && await button.isVisible(), `640px ${name} accessible`, m);
  }
  await shot(settings, "settings-unbroken-branch");
  check(messages.length === 0, `${dev ? "DEV" : "production"} entry stylesheet CSP`, messages);
  await (await appWindow(app, settings)).evaluate(window => window.close());
    await enterProject(page, empty, app!); await firstPrompt(page, "overview");
    await enterProject(page, repo, app!);
    const cardTitle = page.locator(".ocard-title").filter({ hasText: title }); await cardTitle.waitFor();
    check(await cardTitle.getAttribute("title") === title && (await styles(cardTitle)).scroll > (await styles(cardTitle)).client, "Overview truncated title retains full value", await styles(cardTitle));
    await canvasRow(page, "canvas.html").click();
    const frame = page.locator("iframe").contentFrame(); await frame.locator("section").waitFor();
    await page.locator(".zctl:not(.disabled)").waitFor();
    // A dark macOS appearance reaches pages through nativeTheme, which main pins
    // light. Force that path to dark: the canvas must still prefer light, because the
    // renderer's light color-scheme on the iframe element decides an iframe's preference
    // (measured 2026-10-26). page.emulateMedia cannot stand in for the OS: it overrides
    // every frame's media, the canvas included.
    const canvasScheme = async () => {
      await frame.locator("section").evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      return frame.locator("section").evaluate(el => ({
        dark: matchMedia("(prefers-color-scheme: dark)").matches,
        light: matchMedia("(prefers-color-scheme: light)").matches,
        color: getComputedStyle(el).color,
      }));
    };
    const reloadCanvas = async () => {
      const previous = await page.locator("iframe").elementHandle(); assert.ok(previous);
      await page.getByRole("button", { name: "Reload canvas", exact: true }).click();
      await waitFor(async () => !await previous.evaluate(el => el.isConnected), "recreated canvas iframe");
      await frame.locator("section").waitFor(); await page.locator(".zctl:not(.disabled)").waitFor();
    };
    // Playwright emulates a light preference by default, which would hide nativeTheme;
    // drop it so the probe sees what a real launch sees.
    await page.emulateMedia({ colorScheme: null });
    const light = JSON.stringify({ dark: false, light: true, color: "rgb(1, 2, 3)" });
    const themeSource = await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
    const initialScheme = await canvasScheme();
    check(themeSource === "light" && JSON.stringify(initialScheme) === light, "canvas media preference light", { themeSource, initialScheme });
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = "dark"; });
    await waitFor(() => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), "app follows a dark nativeTheme");
    const darkScheme = await canvasScheme();
    await reloadCanvas();
    const darkRecreated = await canvasScheme();
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = "light"; });
    check([darkScheme, darkRecreated].every(value => JSON.stringify(value) === light), "canvas stays light under a dark appearance", { darkScheme, darkRecreated });
    const embedding = await page.locator("iframe").evaluate(el => ({ scheme: getComputedStyle(el).colorScheme, sandbox: el.getAttribute("sandbox") }));
    check(embedding.scheme === "light" && await page.locator("html").evaluate(el => getComputedStyle(el).colorScheme) === "light", "renderer and canvas element light", embedding);
    console.log("media probe engine", await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome })));
    await shot(page, "canvas-media-preference");
  if (!dev) {
    for (const [label, trigger] of [["Fit", page.getByRole("button", { name: "Fit", exact: true })]] as const) {
      await hoverTooltip(page, trigger);
      const content = page.locator('[data-slot="tooltip-content"]'); const m = await styles(content);
      check(JSON.stringify(m.padding) === JSON.stringify(["4px", "8px", "4px", "8px"]), `${label} four-sided tooltip padding`, m);
      await shot(page, `tooltip-${label}`); await page.keyboard.press("Escape");
    }
    await focus(page, page.getByRole("button", { name: "Fit", exact: true }), "ordinary focus");
    await focus(page, page.getByRole("button", { name: "Reload canvas", exact: true }), "ghost focus");
    for (const width of [960, 1238]) {
    await (await appWindow(app, page)).evaluate((window, width) => window.setContentSize(width, 780), width);
    await page.getByRole("tree", { name: "Projects and canvases", exact: true }).locator(".shell-project").filter({ has: page.locator('[aria-current="location"]') }).getByRole("button", { name: / menu$/ }).click();
    const menu = page.locator('.shell-project-menu'); await menu.waitFor();
    console.log("menu injected styles", JSON.stringify((await page.locator("style").allTextContents()).map(text => ({ text, sha256: createHash("sha256").update(text).digest("base64") }))));
    const m = await styles(menu); const viewport = await page.evaluate(() => innerWidth);
    check(m.x >= 0 && m.right <= viewport && m.scroll <= m.client, "worktree menu bounded", m);
    await shot(page, `worktree-menu-${width}`); await page.keyboard.press("Escape");
    }
    const panel = page.getByRole("region", { name: "Comments", exact: true });
    // Nothing is selected yet, so the Selection segment is disabled and must read as disabled.
    const selectionSegment = panel.getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Selection", exact: true });
    const segment = await styles(selectionSegment);
    check(await selectionSegment.isDisabled() && segment.color === await token(page, "--text-disabled"), "disabled Selection segment colour", segment);
    await frame.locator("section").click();
    await panel.getByRole("button", { name: "Comment on selection", exact: true }).click();
    await panel.getByRole("textbox", { name: "New comment body" }).fill("Presentation pin");
    await focus(page, panel.getByRole("button", { name: "Save comment", exact: true }), "comments primary focus");
    await panel.getByRole("button", { name: "Save comment", exact: true }).click();
    await page.locator(".comment-pin").waitFor();
    check((await styles(page.locator(".comment-pin"))).z === "2", "ordinary pin order preserved", await styles(page.locator(".comment-pin")));
    // Move the actual rendered pin to chrome boundaries, preserving production stacking.
    for (const chrome of [".canvas-notices", ".zctl"]) {
      await page.evaluate(chrome => {
        const pin = document.querySelector<HTMLElement>(".comment-pin"), target = document.querySelector<HTMLElement>(chrome), overlay = document.querySelector(".overlay");
        if (!pin || !target || !overlay) throw new Error("Missing pin or chrome");
        if (chrome === ".canvas-notices") { const notice = document.createElement("div"); notice.className = "canvas-notice"; notice.textContent = "Presentation stacking probe"; target.append(notice); }
        const t = target.getBoundingClientRect(), o = overlay.getBoundingClientRect();
        pin.style.left = `${t.left + t.width / 2 - o.left}px`; pin.style.top = `${t.top + t.height / 2 - o.top}px`;
      }, chrome);
      await page.keyboard.press("Tab"); await page.locator(".comment-pin").focus();
      const stacking = await page.locator(".comment-pin").evaluate((pin, chrome) => {
        const r = pin.getBoundingClientRect(), all = Array.from(document.querySelectorAll("*"));
        // Notices deliberately ignore pointer events; inspect paint order with that temporarily enabled.
        const target = document.querySelector<HTMLElement>(chrome)!; const old = target.style.pointerEvents; target.style.pointerEvents = "auto";
        const hits = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2); target.style.pointerEvents = old;
        const chromeIndex = hits.findIndex(el => el === target || target.contains(el)), pinIndex = hits.indexOf(pin);
        return { top: hits[0]?.className, above: chromeIndex >= 0 && pinIndex > chromeIndex, chromeIndex, pinIndex, z: getComputedStyle(pin).zIndex, nodes: all.length };
      }, chrome);
      check(stacking.above && stacking.z === "3", `focused pin below ${chrome}`, stacking); await shot(page, `pin-${chrome.slice(1)}`);
    }
    await removeHomeProject(page, removed, app!); await enterProject(page, repo, app!); await canvasRow(page, "canvas.html").click();
    const toast = page.locator(".toast"); await toast.waitFor(); await toast.hover(); await toast.locator("button").focus();
    for (const width of [960, 1238]) {
      await (await appWindow(app, page)).evaluate((window, width) => window.setContentSize(width, 780), width);
      for (const long of [false, true]) {
        await toast.evaluate((el, long) => { el.querySelector(".msg")!.textContent = long ? "Removed a project with a deliberately long presentation label" : "Removed project"; el.querySelector("button")!.textContent = long ? "Restore removed project" : "Undo"; }, long);
        const t = await styles(toast), z = await styles(page.locator(".zctl"));
        const overlap = t.x < z.right && t.right > z.x && t.y < z.bottom && t.bottom > z.y;
        check(!overlap, `toast clears zoom ${width} ${long ? "long" : "short"}`, { t, z, overlap });
        check(Math.abs(t.x + t.width / 2 - width / 2) < 1, "toast remains window centered", t);
        await shot(page, `toast-${width}-${long ? "long" : "short"}`);
      }
    }
    await canvasRow(page, "no-width.html").click();
    const status = page.locator(".canvas-status > p"); await status.waitFor();
    await status.evaluate(el => { el.textContent = "UnbrokenError".repeat(45); });
    const s = await styles(status); check(s.scroll <= s.client && s.height > 40, "unbroken canvas status wraps", s);
    await shot(page, "canvas-status-long");
    await goHome(page, app!);
    if (await toast.isVisible()) check(await toast.evaluate(el => getComputedStyle(el).bottom) === "20px", "Home toast keeps window-bottom placement", await styles(toast));
  }
  // Baseline Radix menu scroll locking injects this exact blocked style; retain
  // every warning in evidence, and fail on any new CSP violation.
  const knownMenuStyle = "sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo=";
  check(messages.every(message => !dev && message.startsWith("Applying inline style violates") && message.includes(knownMenuStyle)), "no new CSP warnings beyond baseline menu style", messages);
  check(errors.length === 0, "renderer page errors", errors);
  console.log("all CSP messages (including later menu interactions)", JSON.stringify(messages));
  await writeFile(join(shots, "result.json"), JSON.stringify({ dev, failures, messages, errors }, null, 2));
  assert.deepEqual(failures, [], "presentation regressions");
} catch (error) {
  console.error("presentation failure", error);
  console.error("presentation diagnostics", JSON.stringify(messages));
  if (app) for (const page of app.windows().filter(page => !page.isClosed() && !page.url().startsWith("about:"))) {
    try { console.error("window", page.url()); await shot(page, `failure-${app.windows().indexOf(page)}`); }
    catch (diagnosticError) { console.error("failure screenshot unavailable", diagnosticError); }
  }
  throw error;
} finally { await guard.finish(); }
console.log(`presentation ${dev ? "DEV" : "production"}: PASS`);
