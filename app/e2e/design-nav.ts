// design-nav tasks 8–10: the Overview (cards by folder, thumbnail states, the
// empty state, a removed canvas, visible cards first), Quick Open (menu on Home
// and in a workspace, another worktree through the draft guard, duplicate ids,
// a frame missing from the rendered canvas, Escape) and restore across real
// relaunches. Its own temp repos, userData and HOME.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { enterProject, goHome }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-design-nav-"));
const shots = join(root, ".scratch/runtime-test", `design-nav-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
// A passing run takes about a minute; this only ends a run that hangs.
const watchdog = setTimeout(() => { console.error("design-nav: FAIL\nno result after 240 s"); app?.process().kill("SIGKILL"); process.exit(1); }, 240_000);

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

  async function launch(): Promise<void> {
    app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env });
    page = await app.firstWindow(); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => console.error("design-nav pageerror", error));
  }
  async function quit(): Promise<void> {
    const process = app!.process();
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => process.once("exit", (code, signal) => resolve({ code, signal })));
    await app!.close(); app = undefined;
    assert.deepEqual(await exited, { code: 0, signal: null }, "quit exits cleanly, including during thumbnail capture");
  }
  async function relaunch(): Promise<void> {
    await quit();
    await launch();
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
  const canvasTitle = () => page.locator("header .canvas").textContent();
  const iframe = () => page.getByRole("region", { name: "Canvas", exact: true }).locator("iframe");
  const loaded = async (title: string) => { await wait(async () => await canvasTitle() === title && await iframe().isVisible(), `${title} shown`); };
  const current = () => page.getByRole("tree", { name: "Canvases", exact: true }).locator('[aria-current="location"]').getAttribute("aria-label");
  async function quickOpen(query: string): Promise<void> {
    await menu("Quick Open…");
    await dialog().waitFor();
    await page.keyboard.type(query);
  }

  await launch();
  await page.evaluate(() => { const seen: string[] = []; Reflect.set(window, "thumbChanges", seen); window.doan.onThumbnailChanged(({ path }) => seen.push(path)); });
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();

  // Task 8 — visible cards are captured first; a card leaving moves focus on.
  await enterProject(page, gallery);
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
  await enterProject(page, empty);
  await overview().getByText("No canvases in design/ yet", { exact: true }).waitFor();
  await overview().getByRole("textbox", { name: "What do you want to design?", exact: true }).waitFor();
  await shot("2-empty-overview");

  // Task 8 — cards by folder, the doan:width hint, a card opens its canvas.
  await enterProject(page, acme);
  await overview().waitFor();
  assert.deepEqual(await overview().locator(".sec").allTextContents(), ["design 1", "design/misc 1", "design/settings 3"]);
  assert.equal(await card("Design tokens").locator(".thumb-msg").textContent(), "Add doan:width to preview");
  assert.equal(await card("Billing & plans").locator(".ocard-meta").textContent().then(text => text?.split(" · ")[0]), "5 frames");
  const cdp = await page.context().newCDPSession(page);
  const ax = await cdp.send("Accessibility.getFullAXTree");
  const tokenCard = ax.nodes.find(node => node.role?.value === "button" && node.name?.value === "Design tokens tokens.html");
  assert.ok(tokenCard, "the card name leads with title and file name");
  assert.match(tokenCard.description?.value ?? "", /^Add doan:width to preview 1 frame/);
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
  await wait(() => panel.getByRole("button", { name: "New canvas comment", exact: true }).isEnabled(), "comments ready");
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).click();
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
  await wait(async () => await page.locator("header .branch .bn").textContent() === "feat-billing", "entered the feat-billing worktree");
  await loaded("Billing & plans");
  await wait(async () => await current() === "4 Card declined", "moved to the Card declined frame");
  // A clicked row keeps focus; its Select slot shows only for keyboard focus, so the hovered row's is the only one up.
  await page.getByRole("treeitem", { name: "4 Card declined", exact: true }).click();
  await page.getByRole("treeitem", { name: "1 Plans", exact: true }).hover();
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".side .ra")].filter(slot => getComputedStyle(slot).display !== "none").map(slot => slot.closest('[role="treeitem"]')?.getAttribute("aria-label"))), ["1 Plans"]);

  // Task 9 — a duplicate id goes to its first frame; a frame the canvas removed gets the toast.
  await quickOpen("second dup");
  await wait(async () => (await options())[0]?.startsWith("#Second dup") ?? false, "second dup result");
  await page.keyboard.press("Enter");
  await loaded("Duplicates");
  await wait(async () => await current() === "1 First dup", "a duplicate id opens its first frame");
  await quickOpen("ghost frame");
  await wait(async () => (await options())[0]?.startsWith("#Ghost frame") ?? false, "ghost frame result");
  await page.keyboard.press("Enter");
  await loaded("Ghost");
  await toast("This frame is not in the rendered canvas");
  await shot("6-frame-not-rendered");

  // Task 9 — on Home: every project's canvases, picking enters the workspace.
  await goHome(page);
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

  // A frame without id or title: its "(no id)" label resolves to --text-3, unlike a named frame's.
  await enterProject(page, acme);
  await canvasRow(page, "notes.html").click();
  await loaded("Notes");
  const labelColor = (name: string) => page.getByRole("treeitem", { name, exact: true }).locator(".g").evaluate(node => getComputedStyle(node).color);
  const text3 = await page.locator(".side").evaluate(side => { const probe = side.appendChild(document.createElement("span")); probe.style.color = "var(--text-3)"; const color = getComputedStyle(probe).color; probe.remove(); return color; });
  assert.equal(await labelColor("2 (no id)"), text3, "an id-less frame's label is --text-3");
  assert.notEqual(await labelColor("1 one"), text3, "a named frame's label is brighter than --text-3");

  // Task 10 — relaunch restores the canvas, its view and the tree, not the selection.
  const active = async () => JSON.parse((await exec(cli, ["active", "--json", "--repo", acme], { env })).stdout);
  const inspector = () => page.getByRole("region", { name: "Inspector", exact: true });
  await enterProject(page, acme);
  await canvasRow(page, "billing.html").click();
  await loaded("Billing & plans");
  await page.getByRole("treeitem", { name: "misc", exact: true }).click();
  await wait(async () => await page.getByRole("treeitem", { name: "misc", exact: true }).getAttribute("aria-expanded") === "false", "misc collapsed");
  await menu("Zoom In");
  const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
  await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2);
  await page.mouse.wheel(0, 160);
  const board = () => page.locator(".board").evaluate(node => (node as HTMLElement).style.transform);
  await wait(async () => (await board()).startsWith("translate") && !(await board()).includes("translate(0px, 0px)"), "panned");
  await page.getByRole("treeitem", { name: "1 Plans", exact: true }).hover();
  await page.getByRole("button", { name: "Select Plans", exact: true }).click();
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
  await launch();
  await loaded("Billing & plans");
  await wait(async () => await board() === view, `restored view ${view}`);
  assert.equal(await page.getByRole("treeitem", { name: "misc", exact: true }).getAttribute("aria-expanded"), "false", "tree expansion restored");
  assert.equal(await inspector().count(), 0, "no selection after restore");
  assert.equal((await active()).result?.selection, undefined, "doan active is empty after restore");
  await shot("9-restored");

  // Home at quit starts on Home, without loading the workspace.
  await goHome(page);
  await relaunch();
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("iframe").count(), 0, "the hidden workspace is not loaded");

  // The last canvas is gone: its project's Overview with a toast.
  await enterProject(page, acme);
  await loaded("Billing & plans");
  await quit();
  await rm(join(acme, "design/settings/billing.html"));
  await launch();
  await overview().waitFor();
  await toast("billing is no longer in design/");
  await shot("10-canvas-gone");

  // The project folder is gone: Home.
  await enterProject(page, brand);
  await overview().waitFor();
  await quit();
  await rm(brand, { recursive: true, force: true });
  await launch();
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true, "a gone project restores to Home");

  // A broken ui-state.json starts on Home.
  await enterProject(page, gallery);
  await quit();
  assert.equal(JSON.parse(await readFile(join(userData, "ui-state.json"), "utf8")).root, gallery);
  await writeFile(join(userData, "ui-state.json"), "{broken");
  await launch();
  await page.getByRole("region", { name: "Home", exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole("region", { name: "Home", exact: true }).isVisible(), true, "a broken ui-state.json starts on Home");
  console.log("design-nav: restore PASS");
  await quit();
  console.log("design-nav: PASS");
} catch (error) {
  console.error(error);
  if (app) { await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); console.error(`design-nav screenshot: ${join(shots, "failure.png")}`); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
  throw error;
} finally {
  clearTimeout(watchdog);
  try { await app?.close(); await rm(work, { recursive: true, force: true }); } finally { await assertRealState(beforeRealState); }
}
