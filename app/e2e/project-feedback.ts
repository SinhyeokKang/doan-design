// project-feedback task 9: the Overview's Feedback panel and the read errors
// around it. Home's "N without a canvas"; Feedback groups, order, Open/Resolved,
// tree keys, row click and Enter (filter, scope, located target, card focus)
// and "N resolved to review"; an unreadable comment file and an unreadable
// canvas file (tree rows, Details, Overview card, read-only orphans); an open
// canvas's id change (notice, its draft guard, Show, restoring the id);
// Resolve, Reopen and Delete on comments without a canvas; a canvas restored
// between the panel's read and Resolve. Its own temp repo, userData and HOME.
// Scenarios run in order on one project and each is reported on its own; any
// failure fails the module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, enterProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-project-feedback-"));
const shots = join(root, ".scratch/runtime-test", `project-feedback-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
// Files a scenario made unreadable; given their mode back even when it fails.
const locked = new Set<string>();
async function unlockAll(): Promise<void> {
  for (const path of locked) { await chmod(path, 0o644).catch(error => console.error("project-feedback: restoring mode failed", path, error)); locked.delete(path); }
}
const guard = suiteGuard({ name: "project-feedback", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: async () => { await unlockAll(); await rm(work, { recursive: true, force: true }); }, timeoutMs: 480_000 });

const SELF = "Feedback Person", WRITER = { kind: "human", name: "Writer Person" } as const, KIM = { kind: "human", name: "Kim Doe" } as const;
const canvas = (id: string, title: string, body: string) => `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${id}"><meta name="doan:width" content="800">`
  + "<style>body{margin:0;background:#eee;font:14px sans-serif}section{margin:40px;width:600px;padding:20px;background:#ccc}button{display:block;margin:16px;padding:12px}</style>" + body;
const element = (frame: string, doanId: string, text: string) => ({ frame, element: { doanId, selector: `[data-doan-id="${doanId}"]`, html: `<button data-doan-id="${doanId}">${text}</button>`, text } });
const STALE = `sha256:${"0".repeat(64)}`;
// Seeded history is days old: older than the review marker's `since`, so only
// resolves made during the run are new to review.
const day = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00.000Z`;
const event = (type: string, comment: string, at: string, by: object, extra: object = {}) => JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, at, type, comment, by, ...extra });
const create = (comment: string, hour: number, body: string, target: object = {}) => event("create", comment, day(hour), WRITER, { body, target, canvasHash: STALE });
const ids = <K extends string>(...keys: K[]) => Object.fromEntries(keys.map(key => [key, `cmt_${randomUUID()}`])) as Record<K, string>;

const failures: string[] = [];
try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell"), repo = join(work, "proj");
  const design = (path: string) => join(repo, "design", path);
  const commentsFile = (id: string) => join(repo, ".doan/comments", `${id}.jsonl`);
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await mkdir(join(repo, ".doan/comments"), { recursive: true }); await mkdir(join(repo, "design"));
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');

  // alpha: every frame group kind, a far target, and one comment to review.
  await writeFile(design("alpha.html"), canvas("alpha", "Alpha canvas", '<section data-doan-frame="main" data-doan-title="Main"><button data-doan-id="a1">Alpha one</button><button data-doan-id="a2">Alpha two</button></section>'
    + '<section data-doan-frame="side" data-doan-title="Side" style="margin-top:2400px"><button data-doan-id="b1">Side far</button></section>'));
  const a = ids("whole", "main", "side", "resolved", "review", "lost");
  await writeFile(commentsFile("alpha"), [
    create(a.main, 1, "Alpha main note", element("main", "a1", "Alpha one")),
    create(a.side, 2, "Alpha side note\nsecond line stays in the title", element("side", "b1", "Side far")),
    create(a.whole, 3, "Alpha whole note"),
    create(a.resolved, 4, "Alpha resolved note", element("main", "a2", "Alpha two")),
    event("resolve", a.resolved, day(5), KIM),
    create(a.review, 6, "Alpha review note", element("main", "a2", "Alpha two")),
    create(a.lost, 7, "Alpha lost frame note", element("old", "x", "X")),
  ].join("\n") + "\n");
  const plain = (id: string, title: string, doanId: string) => canvas(id, title, `<section data-doan-frame="main" data-doan-title="Main"><button data-doan-id="${doanId}">${title} target</button></section>`);
  const b = ids("one", "two"), g = ids("one"), d = ids("open", "resolved"), e = ids("one", "two"), x = ids("one"), o = ids("open", "resolved"), n = ids("one");
  const betaComments = [create(b.one, 1, "Beta one note", element("main", "bt", "Beta canvas target")), create(b.two, 2, "Beta two note", element("main", "bt", "Beta canvas target"))].join("\n") + "\n";
  await writeFile(design("beta.html"), plain("beta", "Beta canvas", "bt")); await writeFile(commentsFile("beta"), betaComments);
  const gammaHtml = plain("gamma", "Gamma canvas", "gm");
  await writeFile(design("gamma.html"), gammaHtml); await writeFile(commentsFile("gamma"), create(g.one, 1, "Gamma note", element("main", "gm", "Gamma canvas target")) + "\n");
  const deltaHtml = plain("delta", "Delta canvas", "dt");
  await writeFile(design("delta.html"), deltaHtml);
  await writeFile(commentsFile("delta"), [create(d.open, 1, "Delta open note", element("main", "dt", "Delta canvas target")), create(d.resolved, 2, "Delta resolved note"), event("resolve", d.resolved, day(3), KIM)].join("\n") + "\n");
  const epsHtml = (id: string) => plain(id, "Epsilon canvas", "ep");
  await writeFile(design("eps.html"), epsHtml("eps"));
  await writeFile(commentsFile("eps"), [create(e.one, 1, "Eps one note"), create(e.two, 2, "Eps two note")].join("\n") + "\n");
  // An invalid id: ls lists the row without one, with its file's counts.
  await writeFile(design("bad.html"), plain("Bad_Id", "Bad canvas", "bd")); await writeFile(commentsFile("Bad_Id"), create(x.one, 1, "Bad id note") + "\n");
  // Comments without a canvas from the start: a kebab id and one that is not a canvas id.
  await writeFile(commentsFile("gone"), [create(o.open, 1, "Gone open note"), create(o.resolved, 2, "Gone resolved note"), event("resolve", o.resolved, day(3), KIM)].join("\n") + "\n");
  await writeFile(commentsFile("Old_Name"), create(n.one, 1, "Old name note") + "\n");

  await exec("git", ["init", "-q", "-b", "main", repo]);
  await exec("git", ["-C", repo, "config", "user.name", SELF]); await exec("git", ["-C", repo, "config", "user.email", "feedback@example.test"]);
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo]));
  const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };

  async function launch(): Promise<void> {
    app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env }); rememberApp(app);
    page = await app.firstWindow(); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => console.error("project-feedback pageerror", error));
    await size(1400, 900);
  }
  async function size(width: number, height: number): Promise<void> {
    await (await appWindow(app!, page)).evaluate((window, [width, height]) => window.setSize(width!, height!), [width, height]);
  }
  async function quit(): Promise<void> {
    const child = app!.process();
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
    await closeApp(app); app = undefined;
    assert.deepEqual(await exited, { code: 0, signal: null }, "quit exits cleanly");
  }
  // Retries failed observations too: a canvas reload can detach the frame
  // between a locator's lookup and its evaluation (POSTMORTEM 2026-10-25).
  async function wait(check: () => Promise<boolean>, name: string, ms = 10_000): Promise<void> {
    const end = Date.now() + ms;
    let lastError: unknown;
    for (;;) {
      try { if (await check()) return; } catch (error) { lastError = error; }
      if (Date.now() >= end) throw lastError ?? new Error(`Timed out waiting for ${name}`);
      await page.waitForTimeout(25);
    }
  }
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`project-feedback screenshot: ${path}`); };
  const doan = async <T>(...args: string[]) => JSON.parse((await exec(cli, [...args, "--json", "--repo", repo], { env })).stdout) as { ok: boolean; result: T };
  type Orphan = { id: string; comments?: { open: number; resolved: number }; uncertain: boolean };
  const orphanCounts = async (id: string) => (await doan<{ orphans: Orphan[] }>("ls")).result.orphans.find(orphan => orphan.id === id)?.comments ?? null;
  const lines = async (id: string) => (await readFile(commentsFile(id), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as { type: string; comment: string; by: { kind: string; name: string } });
  // Same bytes, then the mode: the write wakes the watcher, which a mode change alone may not.
  async function lock(path: string): Promise<void> { await writeFile(path, await readFile(path)); await chmod(path, 0o000); locked.add(path); }
  async function unlock(path: string): Promise<void> { await chmod(path, 0o644); locked.delete(path); await writeFile(path, await readFile(path)); }

  const panel = () => page.getByRole("region", { name: "Comments", exact: true });
  const cards = () => panel().getByRole("article");
  const card = (id: string) => panel().locator(`article[data-comment="${id}"]`);
  const pressed = (group: "Comment scope" | "Comment status", name: RegExp) => panel().getByRole("group", { name: group }).getByRole("button", { name }).getAttribute("aria-pressed");
  const frame = () => page.frameLocator(".board iframe");
  const selected = async () => { const head = page.locator(".inspect-head .selector"); return await head.count() ? head.textContent() : null; };
  const reviewBar = () => panel().getByRole("region", { name: "Review", exact: true });
  const feedback = () => page.getByRole("region", { name: "Feedback", exact: true });
  const tree = () => feedback().getByRole("tree", { name: "Feedback", exact: true });
  const fbSegment = (name: RegExp) => feedback().getByRole("group", { name: "Comment status" }).getByRole("button", { name });
  const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const itemNamed = (text: string) => page.getByRole("treeitem").filter({ has: page.locator(".g, .b", { hasText: exactly(text) }) });
  const treeItem = (text: string) => tree().locator(itemNamed(text));
  // A treeitem's wrapper, which also holds its notes, messages and cards.
  const treeGroup = (text: string) => tree().locator('[role="none"]').filter({ has: itemNamed(text) });
  const orphanCard = (id: string) => tree().locator(`article[data-comment="${id}"]`);
  // [level, text, count, expanded] per treeitem in DOM order.
  const treeRows = () => tree().evaluate(node => [...node.querySelectorAll('[role="treeitem"]')].map(item => [Number(item.getAttribute("aria-level")), item.querySelector(".g, .b")?.textContent ?? "", item.querySelector(".cnt")?.textContent ?? "", item.getAttribute("aria-expanded") ?? "-"].join(" | ")));
  const focused = () => page.evaluate(() => { const node = document.activeElement as HTMLElement | null; return { tag: node?.tagName ?? null, role: node?.getAttribute("role") ?? null, text: node?.querySelector?.(".g, .b")?.textContent ?? node?.textContent?.trim() ?? null, comment: node?.dataset.comment ?? node?.closest<HTMLElement>("article")?.dataset.comment ?? null, className: node?.className ?? null }; });
  async function focusOn(check: (focus: Awaited<ReturnType<typeof focused>>) => boolean, name: string): Promise<void> {
    await wait(async () => check(await focused()), name, 5_000).catch(async error => { throw new Error(`${name}: focus is ${JSON.stringify(await focused())} (${error instanceof Error ? error.message : String(error)})`); });
  }
  async function onScreen(name: string): Promise<boolean> {
    const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
    const box = await frame().getByRole("button", { name, exact: true }).boundingBox();
    if (!area || !box) return false;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  }
  async function overview(): Promise<void> {
    if (!await page.getByRole("tree", { name: "Canvases", exact: true }).isVisible()) await enterProject(page, repo);
    if (!await page.getByRole("region", { name: "Overview", exact: true }).isVisible()) await page.getByRole("button", { name: "proj overview", exact: true }).click();
    await page.getByRole("region", { name: "Overview", exact: true }).waitFor();
    await feedback().waitFor();
  }
  async function openCanvas(file: string, title: string, ready: string): Promise<void> {
    if (!await page.getByRole("tree", { name: "Canvases", exact: true }).isVisible()) await enterProject(page, repo);
    await page.mouse.move(700, 20);
    if (await page.getByRole("tooltip").isVisible()) await page.keyboard.press("Escape");
    await page.getByRole("tooltip").waitFor({ state: "hidden", timeout: 2_000 });
    await canvasRow(page, file).click();
    await wait(async () => await page.locator("header .canvas").textContent() === title && await frame().getByRole("button", { name: ready, exact: true }).count() === 1, `${title} shown`);
  }
  async function filterTo(group: "Comment scope" | "Comment status", name: RegExp): Promise<void> {
    if (await pressed(group, name) !== "true") await panel().getByRole("group", { name: group }).getByRole("button", { name }).click();
    await wait(async () => await pressed(group, name) === "true", `${group} ${name}`);
  }
  async function fbStatus(name: "Open" | "Resolved"): Promise<void> {
    const button = fbSegment(new RegExp(`^${name}( \\d+)?$`));
    if (await button.getAttribute("aria-pressed") !== "true") await button.click();
    await wait(async () => await button.getAttribute("aria-pressed") === "true", `Feedback ${name}`);
  }
  // A failed scenario can leave a dialog, a draft or a Review behind; the next one starts clean.
  async function recover(): Promise<void> {
    await unlockAll();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.locator("dialog[open]").count()) {
        const dismiss = page.locator("dialog[open]").getByRole("button", { name: /^(Discard|Cancel)$/ });
        await (await dismiss.count() ? dismiss.first() : page.locator("dialog[open]").getByRole("button").first()).click().catch(console.error);
        continue;
      }
      const cancel = panel().getByRole("button", { name: "Cancel", exact: true });
      if (await cancel.count() && await cancel.isEnabled()) { await cancel.click().catch(console.error); await page.waitForTimeout(100); continue; }
      if (await reviewBar().count()) { await reviewBar().getByRole("button", { name: "Close Review", exact: true }).click().catch(console.error); continue; }
      return;
    }
  }
  async function scenario(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
      console.log(`project-feedback PASS: ${name}`);
    } catch (error) {
      console.error(`project-feedback FAIL: ${name}`, error);
      failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      await shot(`failed-${name}`).catch(console.error);
      await recover().catch(console.error);
    }
  }

  await launch();
  await enterProject(page, repo);

  await scenario("7-home-summary", async () => {
    await goHome(page);
    const row = homeRow(page, repo);
    const sum = row.locator(".wt-sum");
    await wait(async () => (await row.getAttribute("aria-label"))?.includes(" · 6 canvases · 12 open comments · 2 without a canvas · ") ?? false, "Home row label counts 2 without a canvas");
    assert.match(await sum.textContent() ?? "", /^6 canvases · 12 open · 2 without a canvas · /);
    assert.equal(await sum.locator("span", { hasText: "without a canvas" }).getAttribute("class"), null, "the orphan item is a plain span");
    await wait(async () => !await row.evaluate(node => node.classList.contains("narrow")), "wide row");
    const sameLine = () => row.evaluate(node => { const label = node.querySelector(".wt-label")!.getBoundingClientRect(), sum = node.querySelector(".wt-sum")!.getBoundingClientRect(); return sum.top < label.bottom; });
    assert.equal(await sameLine(), true, "wide: the summary sits beside the branch");
    await shot("7a-home-wide");
    await size(960, 900);
    try {
      await wait(() => row.evaluate(node => node.classList.contains("narrow")), "narrow row");
      await wait(async () => !await sameLine(), "narrow: the summary moves under the branch");
      assert.match(await sum.textContent() ?? "", /^6 canvases · 12 open · 2 without a canvas · /);
      await shot("7b-home-narrow");
    } finally { await size(1400, 900); }
    await wait(async () => !await row.evaluate(node => node.classList.contains("narrow")), "wide again");
  });

  await scenario("4-feedback-groups-keys-and-rows", async () => {
    // One agent resolve after the marker: Alpha's review entry.
    assert.equal((await doan("comment", "resolve", a.review, "--agent", "codex")).ok, true);
    await overview();
    const openTree = [
      "1 | Comments without a canvas | 2 | true",
      "2 | Old_Name | 1 | -", "2 | gone | 1 | true",
      "1 | Alpha canvas | 4 | true",
      "2 | Whole canvas | 1 | true", "3 | Alpha whole note |  | -",
      "2 | Main | 1 | true", "3 | Alpha main note |  | -",
      "2 | Side | 1 | true", "3 | Alpha side note |  | -",
      "2 | old (not in canvas) | 1 | true", "3 | Alpha lost frame note |  | -",
      "1 | Bad canvas | 1 | -",
      "1 | Beta canvas | 2 | true", "2 | Main | 2 | true", "3 | Beta one note |  | -", "3 | Beta two note |  | -",
      "1 | Delta canvas | 1 | true", "2 | Main | 1 | true", "3 | Delta open note |  | -",
      "1 | Epsilon canvas | 2 | true", "2 | Whole canvas | 2 | true", "3 | Eps one note |  | -", "3 | Eps two note |  | -",
      "1 | Gamma canvas | 1 | true", "2 | Main | 1 | true", "3 | Gamma note |  | -",
    ];
    await wait(async () => JSON.stringify(await treeRows()) === JSON.stringify(openTree), "Open tree", 15_000)
      .catch(async error => { throw new Error(`Open tree is ${JSON.stringify(await treeRows().catch(() => null))} (${error instanceof Error ? error.message : String(error)})`); });
    assert.equal(await fbSegment(/^Open/).textContent(), "Open 13");
    assert.equal(await fbSegment(/^Resolved/).textContent(), "Resolved 4");
    // Canvas groups follow the Overview's card order.
    const cardTitles = await page.getByRole("region", { name: "Overview", exact: true }).locator(".ocard-title").allTextContents();
    const groupTitles = (await treeRows()).filter(line => line.startsWith("1 | ") && !line.includes("without a canvas")).map(line => line.split(" | ")[1]);
    assert.deepEqual(groupTitles, cardTitles.filter(title => groupTitles.includes(title)), "Feedback canvas order is the Overview's");
    assert.equal(await tree().locator(".fb-count").first().textContent(), "1 open · 0 resolved. Not a canvas ID — doan can't show or change these comments.");
    assert.equal(await tree().locator(".fb-count").nth(1).textContent(), "1 open · 0 resolved. This canvas needs a unique, valid ID — run doan check");
    assert.equal(await tree().locator(".fb-note").first().textContent(), "No canvas uses the ID gone. Give a canvas this ID again to bring these comments back, or ask your agent.");
    assert.equal(await treeItem("Alpha canvas").getByRole("button").textContent(), "1 resolved to review");
    assert.equal(await treeItem("Alpha side note").locator(".t").getAttribute("title") !== null, true, "an item keeps its full target in the title");
    await shot("4a-feedback-open");

    await fbStatus("Resolved");
    const resolvedTree = [
      "1 | Comments without a canvas | 1 | true", "2 | gone | 1 | true",
      "1 | Alpha canvas | 2 | true", "2 | Main | 2 | true", "3 | Alpha review note |  | -", "3 | Alpha resolved note |  | -",
      "1 | Delta canvas | 1 | true", "2 | Whole canvas | 1 | true", "3 | Delta resolved note |  | -",
    ];
    await wait(async () => JSON.stringify(await treeRows()) === JSON.stringify(resolvedTree), "Resolved tree")
      .catch(async error => { throw new Error(`Resolved tree is ${JSON.stringify(await treeRows().catch(() => null))}`); });
    assert.equal(await orphanCard(o.resolved).getByRole("button", { name: "Reopen", exact: true }).count(), 1);
    await shot("4b-feedback-resolved");
    await fbStatus("Open");
    await wait(async () => (await treeRows()).length === openTree.length, "back to Open");

    // Keys pressed for real on the tree.
    const rowsNow = async () => (await treeRows()).length;
    await tree().getByRole("treeitem").first().focus();
    await focusOn(focus => focus.text === "Comments without a canvas", "first row focused");
    await page.keyboard.press("ArrowDown"); await focusOn(focus => focus.text === "Old_Name", "↓ to Old_Name");
    await page.keyboard.press("ArrowUp"); await focusOn(focus => focus.text === "Comments without a canvas", "↑ back to the first row");
    await page.keyboard.press("End"); await focusOn(focus => focus.text === "Gamma note", "End to the last row");
    await page.keyboard.press("Home"); await focusOn(focus => focus.text === "Comments without a canvas", "Home to the first row");
    await page.keyboard.press("ArrowLeft");
    await wait(async () => await treeItem("Comments without a canvas").getAttribute("aria-expanded") === "false" && await rowsNow() === openTree.length - 2, "← folds the section");
    await page.keyboard.press("ArrowRight");
    await wait(async () => await treeItem("Comments without a canvas").getAttribute("aria-expanded") === "true" && await rowsNow() === openTree.length, "→ unfolds the section");
    await page.keyboard.press("ArrowRight"); await focusOn(focus => focus.text === "Old_Name", "→ moves to the first child");
    await page.keyboard.press("ArrowLeft"); await focusOn(focus => focus.text === "Comments without a canvas", "← moves to the parent");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await focusOn(focus => focus.text === "gone", "↓↓ to gone");
    await page.keyboard.press("Tab");
    await focusOn(focus => focus.tag === "BUTTON" && focus.text === "Resolve" && focus.comment === o.open, "Tab reaches the orphan card's Resolve");
    await page.keyboard.press("Shift+Tab"); await focusOn(focus => focus.text === "gone", "Shift+Tab back to gone");
    await page.keyboard.press("ArrowDown"); await focusOn(focus => focus.text === "Alpha canvas", "↓ to Alpha");
    await page.keyboard.press("Tab");
    await focusOn(focus => focus.tag === "BUTTON" && focus.text === "1 resolved to review", "Tab reaches Alpha's review entry");
    await page.keyboard.press("Shift+Tab"); await focusOn(focus => focus.text === "Alpha canvas", "Shift+Tab back to Alpha");
    await page.keyboard.press("ArrowLeft");
    await wait(async () => await treeItem("Alpha canvas").getAttribute("aria-expanded") === "false" && await rowsNow() === openTree.length - 8, "← folds Alpha");
    await page.keyboard.press("ArrowRight");
    await wait(async () => await treeItem("Alpha canvas").getAttribute("aria-expanded") === "true" && await rowsNow() === openTree.length, "→ unfolds Alpha");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await focusOn(focus => focus.text === "Alpha whole note", "↓↓ to Alpha's whole-canvas comment");
    await page.keyboard.press("Enter");
    await wait(async () => await page.locator("header .canvas").textContent() === "Alpha canvas", "Enter opens Alpha");
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment === a.whole, "Enter: focus on the whole-canvas card");
    assert.equal(await pressed("Comment status", /^Open \d+$/), "true");
    assert.equal(await pressed("Comment scope", /^Canvas$/), "true");
    await shot("4c-enter-opened");

    // Row click: the filter follows the row even when it was elsewhere, and the far target is located.
    await filterTo("Comment status", /^Resolved \d+$/);
    await overview();
    await treeItem("Alpha side note").click();
    await wait(async () => await page.locator("header .canvas").textContent() === "Alpha canvas", "row click opens Alpha");
    await wait(async () => (await selected())?.includes("b1") ?? false, "the row's target is selected", 15_000);
    await wait(() => onScreen("Side far"), "the far target is on screen");
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment === a.side, "row click: focus on its card");
    assert.equal(await pressed("Comment status", /^Open \d+$/), "true", "status follows the row");
    assert.equal(await pressed("Comment scope", /^Canvas$/), "true", "scope is Canvas");
    await shot("4d-row-click-located");

    await overview();
    await fbStatus("Resolved");
    await treeItem("Alpha resolved note").click();
    await wait(async () => (await selected())?.includes("a2") ?? false, "the resolved row's target is selected", 15_000);
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment === a.resolved, "resolved row: focus on its card");
    assert.equal(await pressed("Comment status", /^Resolved \d+$/), "true", "status follows the resolved row");
    assert.equal(await pressed("Comment scope", /^Canvas$/), "true");

    // "N resolved to review" starts Review on that canvas.
    await overview();
    await treeItem("Alpha canvas").getByRole("button", { name: "1 resolved to review", exact: true }).click();
    await wait(async () => await reviewBar().count() === 1, "Review started");
    assert.equal(await reviewBar().getByRole("status").first().textContent(), "Review 1 of 1");
    await shot("4e-review");
    await reviewBar().getByRole("button", { name: "Close Review", exact: true }).click();
    await wait(async () => await reviewBar().count() === 0, "Review closed");
  });

  await scenario("1-unreadable-comment-file", async () => {
    await overview();
    await lock(commentsFile("beta"));
    const beta = canvasRow(page, "beta.html");
    const hint = page.getByRole("tree", { name: "Canvases", exact: true }).locator("p.tree-hint.warn").filter({ hasText: "Couldn’t read this canvas’s comments — run doan check" });
    await wait(async () => await beta.locator(".warn-mark").count() === 1 && await hint.count() === 1, "Beta row shows the warning", 15_000);
    const describedBy = await beta.getAttribute("aria-describedby");
    assert.ok(describedBy, "the row is described");
    assert.equal(await hint.getAttribute("id"), describedBy, "aria-describedby points at the sentence");
    const details = hint.getByRole("button", { name: "Details", exact: true });
    assert.equal(await details.getAttribute("aria-expanded"), "false");
    await details.click();
    await wait(async () => await details.getAttribute("aria-expanded") === "true", "Details opened");
    assert.equal(await page.locator("p.tree-detail").textContent(), "unreadable_comments: Cannot read .doan/comments/beta.jsonl: permission denied");
    // The tree and the other canvases stay.
    assert.equal(await canvasRow(page, "alpha.html").locator(".warn-mark").count(), 0);
    assert.equal(await canvasRow(page, "alpha.html").getByRole("img", { name: /open comments?$/ }).count(), 1, "Alpha keeps its count");
    // Feedback: only Beta's group is a read failure, with its message indented to the group.
    const failed = treeGroup("Beta canvas").locator(".comments-message.error");
    await wait(async () => await failed.count() === 1, "Beta group read failure");
    assert.match(await failed.textContent() ?? "", /^Couldn’t read comments/);
    assert.equal(await failed.evaluate(node => getComputedStyle(node).marginLeft), "26px", "group message keeps the tree indent");
    assert.equal(await treeItem("Alpha canvas").count(), 1);
    await shot("1a-unreadable-comments");
    await openCanvas("beta.html", "Beta canvas", "Beta canvas target");
    await panel().getByRole("alert").filter({ hasText: "Couldn’t read comments" }).waitFor();
    await goHome(page);
    assert.equal(await homeRow(page, repo).locator(".ob-chip").count(), 0, "the project is not a Config error");
    await enterProject(page, repo);
    await unlock(commentsFile("beta"));
    await wait(async () => await beta.locator(".warn-mark").count() === 0, "Beta row recovers", 15_000);
  });

  await scenario("2-unreadable-canvas-file", async () => {
    await overview();
    await lock(design("gamma.html"));
    const gamma = canvasRow(page, "gamma.html");
    const hint = page.getByRole("tree", { name: "Canvases", exact: true }).locator("p.tree-hint.warn").filter({ hasText: "Can't read this canvas — run doan check" });
    await wait(async () => await gamma.locator(".warn-mark").count() === 1 && await hint.count() === 1, "Gamma row shows the warning", 15_000);
    assert.equal(await hint.getAttribute("id"), await gamma.getAttribute("aria-describedby"));
    await hint.getByRole("button", { name: "Details", exact: true }).click();
    await wait(async () => await page.locator("p.tree-detail").textContent() === "unreadable_canvas: Cannot read design/gamma.html: permission denied", "canvas Details");
    const ocard = page.getByRole("region", { name: "Overview", exact: true }).locator('.ocard[data-path="design/gamma.html"]');
    await wait(async () => await ocard.locator(".thumb-msg.warn").textContent() === "Can't read this canvas — run doan check", "Overview card sentence");
    // Comments without a canvas may belong to the unreadable canvas: read-only.
    await wait(async () => await tree().locator(".fb-note.warning").count() > 0, "read-only note");
    assert.equal(await tree().locator(".fb-note.warning").first().textContent(), "Some canvases couldn’t be read; these comments may belong to one of them.");
    assert.equal(await orphanCard(o.open).getByRole("button").count(), 0, "read-only orphan cards have no buttons");
    assert.equal(await treeItem("Gamma canvas").count(), 0, "an unreadable canvas has no group");
    await shot("2a-unreadable-canvas");
    await unlock(design("gamma.html"));
    await wait(async () => await gamma.locator(".warn-mark").count() === 0 && await orphanCard(o.open).getByRole("button", { name: "Resolve", exact: true }).count() === 1, "Gamma recovers and orphans are writable", 15_000);
  });

  await scenario("3-id-change", async () => {
    await openCanvas("eps.html", "Epsilon canvas", "Epsilon canvas target");
    await wait(async () => await cards().count() === 2, "Epsilon comments listed");
    const notice = () => panel().locator(".comments-message.notice");
    await writeFile(design("eps.html"), epsHtml("eps-new"));
    await wait(async () => await notice().count() === 1 && (await notice().textContent())?.startsWith("2 comments still use the old ID eps and no longer show here.") === true, "plural notice", 15_000);
    assert.equal(await notice().getByRole("button", { name: "Show", exact: true }).count(), 1);
    await shot("3a-notice-plural");
    await appendFile(commentsFile("eps"), event("delete", e.two, new Date().toISOString(), { kind: "human", name: SELF }) + "\n");
    await wait(async () => (await notice().textContent())?.startsWith("1 comment still uses the old ID eps and no longer shows here.") === true, "singular notice", 15_000);
    // Show with an unsaved draft: the guard first.
    await panel().getByRole("button", { name: "Comment on canvas", exact: true }).click();
    await panel().getByRole("textbox", { name: "New comment body" }).fill("Draft before Show");
    await notice().getByRole("button", { name: "Show", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep writing", exact: true }).click();
    assert.equal(await panel().getByRole("textbox", { name: "New comment body" }).inputValue(), "Draft before Show");
    assert.equal(await page.locator("header .canvas").textContent(), "Epsilon canvas", "Keep writing stays");
    await notice().getByRole("button", { name: "Show", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard", exact: true }).click();
    await page.getByRole("region", { name: "Overview", exact: true }).waitFor();
    await focusOn(focus => focus.role === "treeitem" && focus.text === "eps", "Show focuses the eps group head");
    assert.equal(await treeItem("eps").getAttribute("aria-expanded"), "true");
    assert.equal(await treeItem("Comments without a canvas").getAttribute("aria-expanded"), "true");
    assert.equal(await orphanCard(e.one).count(), 1, "the old id's comment is shown");
    await shot("3b-show");
    // Restoring the id: the notice goes and the comment is back on the canvas.
    await openCanvas("eps.html", "Epsilon canvas", "Epsilon canvas target");
    await wait(async () => await notice().count() === 1, "notice kept while the id is still changed");
    await writeFile(design("eps.html"), epsHtml("eps"));
    await wait(async () => await notice().count() === 0 && await cards().count() === 1, "notice gone after restoring the id", 15_000);
    assert.equal(await card(e.one).count(), 1);
  });

  await scenario("5-orphan-resolve-reopen-delete", async () => {
    await overview();
    await unlink(design("delta.html"));
    await wait(async () => await orphanCard(d.open).getByRole("button", { name: "Resolve", exact: true }).count() === 1, "Delta's comments are without a canvas", 15_000);
    assert.equal(await treeGroup("delta").locator(".fb-note").textContent(), "No canvas uses the ID delta. Give a canvas this ID again to bring these comments back, or ask your agent.");
    assert.deepEqual(await orphanCounts("delta"), { open: 1, resolved: 1 });
    await orphanCard(d.open).getByRole("button", { name: "Resolve", exact: true }).click();
    await feedback().getByRole("status").filter({ hasText: "Resolved — moved to Resolved." }).waitFor();
    await wait(async () => JSON.stringify(await orphanCounts("delta")) === JSON.stringify({ open: 0, resolved: 2 }), "ls counts after Resolve");
    await focusOn(focus => focus.tag !== "BODY", "focus stays in the panel after the card left");
    let written = await lines("delta");
    assert.deepEqual({ type: written.at(-1)?.type, comment: written.at(-1)?.comment, kind: written.at(-1)?.by.kind, name: written.at(-1)?.by.name }, { type: "resolve", comment: d.open, kind: "human", name: SELF });
    await shot("5a-orphan-resolved");

    await fbStatus("Resolved");
    await wait(async () => await orphanCard(d.open).getByRole("button", { name: "Reopen", exact: true }).count() === 1, "resolved orphan card");
    assert.match(await orphanCard(d.open).locator(".comments-resolution").first().textContent() ?? "", /^Resolved by Feedback Person · /);
    await orphanCard(d.open).getByRole("button", { name: "Reopen", exact: true }).click();
    await feedback().getByRole("status").filter({ hasText: "Reopened — moved to Open." }).waitFor();
    await wait(async () => JSON.stringify(await orphanCounts("delta")) === JSON.stringify({ open: 1, resolved: 1 }), "ls counts after Reopen");
    written = await lines("delta");
    assert.equal(written.at(-1)?.type, "reopen");

    await orphanCard(d.resolved).getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this comment?" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(await orphanCounts("delta"), { open: 1, resolved: 1 }, "Cancel deletes nothing");
    await orphanCard(d.resolved).getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete comment", exact: true }).click();
    await wait(async () => JSON.stringify(await orphanCounts("delta")) === JSON.stringify({ open: 1, resolved: 0 }), "ls counts after Delete");
    written = await lines("delta");
    assert.deepEqual({ type: written.at(-1)?.type, comment: written.at(-1)?.comment }, { type: "delete", comment: d.resolved });
    await wait(async () => await orphanCard(d.resolved).count() === 0, "deleted card leaves");
    await shot("5b-orphan-deleted");
    await fbStatus("Open");
  });

  await scenario("6-canvas-back-before-resolve", async () => {
    await overview();
    await fbStatus("Open");
    const REFUSED = "These comments are no longer without a canvas, or the project could not be read fully.";
    // Starts from Delta's comments without a canvas, as scenario 5 leaves them.
    await unlink(design("delta.html")).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
    let seen: { text: string; marginLeft: string; paddingTop: string } | null = null, before = "";
    for (let attempt = 1; attempt <= 3 && !seen; attempt++) {
      const resolve = orphanCard(d.open).getByRole("button", { name: "Resolve", exact: true });
      await wait(async () => await resolve.isEnabled(), "Delta's orphan Resolve ready", 15_000);
      // The card's save message can leave with the card on the next read; record it as it shows.
      await page.evaluate(id => {
        Reflect.set(window, "orphanMessage", null);
        const observer = new MutationObserver(() => {
          const node = document.querySelector<HTMLElement>(`.fb-tree article[data-comment="${id}"] .comments-message`);
          if (!node || !node.textContent?.includes("Couldn’t save comment")) return;
          const style = getComputedStyle(node);
          Reflect.set(window, "orphanMessage", { text: node.textContent, marginLeft: style.marginLeft, paddingTop: style.paddingTop });
          observer.disconnect();
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        Reflect.set(window, "orphanObserver", observer);
      }, d.open);
      before = await readFile(commentsFile("delta"), "utf8");
      await writeFile(design("delta.html"), deltaHtml);
      const clicked = await resolve.click({ timeout: 1_000 }).then(() => true, () => false);
      if (clicked) await wait(async () => await page.evaluate(() => Reflect.get(window, "orphanMessage") !== null), "refusal shown", 10_000).catch(() => {});
      seen = await page.evaluate(() => { (Reflect.get(window, "orphanObserver") as MutationObserver | undefined)?.disconnect(); return Reflect.get(window, "orphanMessage") as { text: string; marginLeft: string; paddingTop: string } | null; });
      if (!seen) {
        console.log(`project-feedback: attempt ${attempt} lost the race to the re-read (clicked: ${clicked}); deleting the canvas again`);
        await unlink(design("delta.html"));
        await wait(async () => await orphanCard(d.open).count() === 1, "Delta's comments are without a canvas again", 15_000);
      }
    }
    assert.ok(seen, "the Resolve reached main after the canvas came back");
    assert.ok(seen.text.startsWith(`Couldn’t save comment${REFUSED}`), `refusal text: ${seen.text}`);
    // A card's own message keeps the Comments card look, not the tree's group indent.
    assert.deepEqual({ marginLeft: seen.marginLeft, paddingTop: seen.paddingTop }, { marginLeft: "0px", paddingTop: "12px" }, "card message style inside the tree");
    await wait(async () => await treeItem("delta").count() === 0 && await treeItem("Delta canvas").count() === 1, "the comments move to Delta's canvas group", 15_000);
    assert.equal(await treeItem("Delta open note").count(), 1);
    assert.equal(await readFile(commentsFile("delta"), "utf8"), before, "the refused Resolve wrote nothing");
    await shot("6-canvas-back");
  });

  // V1c: a press on a blank area ends a Feedback row's wait, Show's wait and a
  // remembered orphan card, though focus stays on <body> (POSTMORTEM R-C/R-E).
  await scenario("8-blank-press-ends-waits", async () => {
    // Clicks a point in `region` whose element is not focusable, and reports
    // what the press found: its target and whether `theta`'s group was listed.
    async function blankPress(region: ReturnType<Page["getByRole"]>, name: string): Promise<{ theta: boolean; selected: boolean }> {
      const point = await region.evaluate(node => {
        const box = node.getBoundingClientRect();
        for (let y = box.bottom - 6; y > box.top; y -= 12) for (let x = box.left + 6; x < box.right; x += 12) {
          const hit = document.elementFromPoint(x, y);
          if (hit && node.contains(hit) && !hit.closest("button, a, input, textarea, select, iframe, article, [tabindex], [contenteditable]")) return { x, y };
        }
        return null;
      });
      assert.ok(point, `${name}: a blank point`);
      await page.evaluate(() => window.addEventListener("pointerdown", event => {
        const target = event.target as HTMLElement;
        const theta = [...document.querySelectorAll(".fb-tree [role=treeitem]")].some(item => item.querySelector(".g, .b")?.textContent === "theta");
        Reflect.set(window, "blankPress", { blank: !target.closest("button, a, input, textarea, select, iframe, article, [tabindex], [contenteditable]"), theta, selected: !!document.querySelector(".inspect-head .selector") });
      }, { capture: true, once: true }));
      await page.mouse.click(point.x, point.y);
      const seen = await page.evaluate(() => Reflect.get(window, "blankPress") as { blank: boolean; theta: boolean; selected: boolean } | undefined);
      assert.ok(seen?.blank, `${name}: the press landed on a blank element`);
      return seen;
    }
    const atBody = (name: string) => focusOn(focus => focus.tag === "BODY", name);

    // A canvas that takes each anchors query 0.4 s late (the canvas script
    // checks event.source, so the query is redispatched, not window.parent
    // replaced), so a Feedback row's request is still waiting meanwhile.
    const late = '<script>{const mine=new WeakSet();addEventListener("message",e=>{if(mine.has(e)||!e.data||e.data.type!=="anchors-query")return;e.stopImmediatePropagation();setTimeout(()=>{const r=new MessageEvent("message",{data:e.data,origin:e.origin,source:e.source});mine.add(r);dispatchEvent(r);},400);},true);}</script>';
    const z = ids("one"), s = ids("one", "two");
    await writeFile(design("zeta.html"), canvas("zeta", "Zeta canvas", '<section data-doan-frame="main" data-doan-title="Main"><button data-doan-id="z1">Zeta target</button></section>' + late));
    await writeFile(commentsFile("zeta"), create(z.one, 1, "Zeta note", element("main", "z1", "Zeta target")) + "\n");
    await overview();
    await fbStatus("Open");
    await wait(async () => await treeItem("Zeta note").count() === 1, "Zeta's comment listed", 15_000);
    const laidOut = () => wait(() => page.locator(".board").evaluate(node => (node as HTMLElement).style.visibility !== "hidden"), "Zeta laid out", 10_000);
    // Control: with no press the late anchors still locate the target.
    await treeItem("Zeta note").click();
    await wait(async () => (await selected())?.includes("z1") ?? false, "control: the late anchors locate the target", 10_000);
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment === z.one, "control: focus on its card");
    // The row click, then a blank press on the Canvas before the anchors answer.
    await overview();
    await treeItem("Zeta note").click();
    await wait(async () => await page.locator("header .canvas").textContent() === "Zeta canvas", "row click opens Zeta");
    assert.equal((await blankPress(page.getByRole("region", { name: "Canvas", exact: true }), "Canvas")).selected, false, "the press landed before the anchors located the target");
    await laidOut();
    await page.waitForTimeout(1_500);
    assert.equal((await selected())?.includes("z1") ?? false, false, "a blank press: the late anchors locate nothing");
    await atBody("a blank press: no card focus");
    await shot("8a-row-blank-press");

    // Show, then a blank press on the Overview before the read with the old id lands.
    await writeFile(design("theta.html"), plain("theta", "Theta canvas", "th"));
    await writeFile(commentsFile("theta"), create(ids("one").one, 1, "Theta note", element("main", "th", "Theta canvas target")) + "\n");
    await openCanvas("theta.html", "Theta canvas", "Theta canvas target");
    await wait(async () => await cards().count() === 1, "Theta comment listed", 15_000);
    await writeFile(design("theta.html"), plain("theta-new", "Theta canvas", "th"));
    const notice = () => panel().locator(".comments-message.notice");
    await wait(async () => (await notice().textContent())?.startsWith("1 comment still uses the old ID theta") === true, "Theta notice", 15_000);
    let raced = false;
    for (let attempt = 1; attempt <= 3 && !raced; attempt++) {
      if (attempt > 1) {
        await openCanvas("theta.html", "Theta canvas", "Theta canvas target");
        await wait(async () => await notice().count() === 1, "Theta notice again", 15_000);
      }
      await notice().getByRole("button", { name: "Show", exact: true }).click();
      const shown = Date.now();
      const overviewRegion = page.getByRole("region", { name: "Overview", exact: true });
      await overviewRegion.waitFor();
      const press = await blankPress(overviewRegion, "Overview");
      if (press.theta) { console.log(`project-feedback: attempt ${attempt} lost the race to the read; showing again`); continue; }
      raced = true;
      await wait(async () => await treeItem("theta").count() === 1, "the read with theta lands", 15_000);
      await page.waitForTimeout(300);
      await atBody("Show after a blank press: no head focus");
      await page.waitForTimeout(Math.max(0, shown + 5_500 - Date.now()));
      await atBody("Show after a blank press: its time moves nothing");
    }
    assert.ok(raced, "the blank press landed before the read");
    await shot("8b-show-blank-press");

    // An orphan card's button held focus, a blank press, then an agent resolves it.
    await writeFile(commentsFile("stray"), [create(s.one, 1, "Stray one note"), create(s.two, 2, "Stray two note")].join("\n") + "\n");
    await overview();
    await fbStatus("Open");
    const strayResolve = (id: string) => orphanCard(id).getByRole("button", { name: "Resolve", exact: true });
    await wait(async () => await strayResolve(s.one).isEnabled() && await strayResolve(s.two).isEnabled(), "stray cards", 15_000);
    const agentResolve = (id: string) => appendFile(commentsFile("stray"), event("resolve", id, new Date().toISOString(), { kind: "agent", name: "codex" }) + "\n");
    await strayResolve(s.one).focus();
    await blankPress(feedback(), "Feedback");
    await atBody("the press leaves focus on <body>");
    await agentResolve(s.one);
    await wait(async () => await orphanCard(s.one).count() === 0, "the agent's resolve takes the card away", 15_000);
    await page.waitForTimeout(300);
    await atBody("a blank press: the card's leaving moves nothing");
    // Control: still on its button, the card's leaving hands focus on.
    await strayResolve(s.two).focus();
    await agentResolve(s.two);
    await wait(async () => await orphanCard(s.two).count() === 0, "the agent's second resolve", 15_000);
    await focusOn(focus => focus.tag !== "BODY", "control: focus moves on when the card holding it leaves");
    await shot("8c-orphan-blank-press");
  });

  if (app) await quit();
} catch (error) {
  console.error(error);
  failures.push(`setup: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  if (app) { await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
} finally {
  await unlockAll();
  await guard.finish();
}

if (failures.length) throw new Error(`project-feedback failures:\n${failures.join("\n")}`);
console.log("project-feedback: PASS");
