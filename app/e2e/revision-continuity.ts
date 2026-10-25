// revision-continuity task 9: reviewing continues while an agent edits the
// project. Another canvas changing (plain write, atomic rename) leaves a new
// comment writable; the open canvas changing offers "Continue on current
// version"; a moved canvas is followed by its id, a duplicate id returns to the
// Overview, scope and Escape survive saves, a no-width canvas hides "Location
// unavailable", a blank in-canvas click with nothing selected asks nothing, a
// root switch after a move is a normal Open, and a canvas moved while the app
// was closed is restored. Its own temp repos, userData and HOME. Each scenario is reported on its own so one
// failure does not hide the rest; any failure fails the module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow, menu }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { enterProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-revision-continuity-"));
const shots = join(root, ".scratch/runtime-test", `revision-continuity-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
// A passing run takes about a minute; this only ends a run that hangs.
const guard = suiteGuard({ name: "revision-continuity", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: () => rm(work, { recursive: true, force: true }), timeoutMs: 300_000 });

const RELOADED = "The canvas reloaded while you were writing. Your text is kept — continue on the current version to save it.";
const SELECTION_GONE = "Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.";
// `rev` changes the bytes without changing what is rendered.
const canvas = (id: string, title: string, options: { width?: number | null; other?: boolean; rev?: string } = {}) =>
  `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${id}">${options.width === null ? "" : `<meta name="doan:width" content="${options.width ?? 800}">`}`
  + "<style>body{margin:0;min-height:700px;background:#eee;font:14px sans-serif}section{margin:50px;width:500px;height:300px;background:#ccc;padding:20px}button{display:block;margin:20px;padding:16px}</style>"
  + `<section data-doan-frame="hero" data-doan-title="Hero"><button data-doan-id="child">Child target</button>${options.other === false ? "" : '<button data-doan-id="other">Other target</button>'}</section>`
  + (options.rev ? `<!-- rev ${options.rev} -->` : "");

const failures: string[] = [];
try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell"), repo = join(work, "proj"), other = join(work, "other");
  const design = (path: string) => join(repo, "design", path);
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  await mkdir(join(repo, ".doan"), { recursive: true });
  for (const dir of ["sub", "moved", "misc", ".stash"]) await mkdir(design(dir), { recursive: true });
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');
  await writeFile(design("a.html"), canvas("a", "A canvas"));
  await writeFile(design("b.html"), canvas("b", "B canvas"));
  await writeFile(design("sub/m.html"), canvas("m", "Moving canvas"));
  await writeFile(design("moved/keep.html"), canvas("keep", "Keep canvas"));
  await writeFile(design("misc/n.html"), canvas("n", "Notes canvas"));
  await writeFile(design("x.html"), canvas("x", "X canvas"));
  // Unlisted (dot segment) until scenario 4 renames it into the list.
  await writeFile(design(".stash/x2.html"), canvas("x", "X copy"));
  await writeFile(design("w.html"), canvas("w", "Wide canvas"));
  await writeFile(design("r.html"), canvas("r", "Restored canvas"));
  await writeFile(design("sub/s.html"), canvas("s", "Switch canvas"));
  // The other root's open canvas sits at the move's source path (R-B7fix 🟡1).
  await mkdir(join(other, "design/sub"), { recursive: true }); await mkdir(join(other, ".doan"));
  await writeFile(join(other, ".doan/config.json"), '{"v":1}');
  await writeFile(join(other, "design/sub/s.html"), canvas("s-other", "Other switch canvas"));
  await exec("git", ["init", "-q", "-b", "main", repo]);
  await exec("git", ["-C", repo, "config", "user.name", "Continuity Author"]); await exec("git", ["-C", repo, "config", "user.email", "continuity@example.test"]);
  await exec("git", ["init", "-q", "-b", "main", other]);
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo, other]));
  const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };

  async function launch(): Promise<void> {
    app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env }); rememberApp(app);
    page = await app.firstWindow(); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => console.error("revision-continuity pageerror", error));
    await (await appWindow(app, page)).evaluate(window => window.setSize(1400, 900));
    // Renderer-document probes only, so iframe replacement cannot detach them.
    await page.evaluate(() => {
      Reflect.set(window, "rcLoads", 0);
      document.addEventListener("load", event => { if (event.target instanceof HTMLIFrameElement) Reflect.set(window, "rcLoads", Reflect.get(window, "rcLoads") + 1); }, true);
      window.doan.onFolders(entries => Reflect.set(window, "rcEntries", entries));
    });
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
  async function retry(action: () => Promise<void>, name: string): Promise<void> {
    await wait(async () => { await action(); return true; }, name);
  }
  // Holds for the whole window: a negative check cannot pass on one lucky sample.
  async function holds(check: () => Promise<boolean>, name: string, ms = 800): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) { assert.ok(await check(), name); await page.waitForTimeout(25); }
  }
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`revision-continuity screenshot: ${path}`); };
  const panel = () => page.getByRole("region", { name: "Comments", exact: true });
  const cards = () => panel().getByRole("article");
  const createBody = () => panel().getByRole("textbox", { name: "New comment body" });
  const editBody = () => panel().getByRole("textbox", { name: "Your unsaved edit body" });
  const button = (name: string) => panel().getByRole("button", { name, exact: true });
  const continueButton = () => button("Continue on current version");
  const draftDialog = () => page.locator("dialog[open]");
  const overview = () => page.getByRole("region", { name: "Overview", exact: true });
  const frame = () => page.frameLocator(".board iframe");
  const iframePath = () => page.locator(".board iframe").getAttribute("title");
  const loads = async () => Number(await page.evaluate(() => Reflect.get(window, "rcLoads")));
  const selected = async () => { const head = page.locator(".inspect-head .selector"); return await head.count() ? head.textContent() : null; };
  const board = () => page.locator(".board").evaluate(node => (node as HTMLElement).style.transform);
  const scopePressed = (name: "Canvas" | "Selection") => panel().getByRole("group", { name: "Comment scope" }).getByRole("button", { name, exact: true }).getAttribute("aria-pressed");
  const folderExpanded = (name: string) => page.getByRole("treeitem", { name, exact: true }).getAttribute("aria-expanded");
  const row = (path: string) => page.evaluate(([repo, path]) => {
    const entry = (Reflect.get(window, "rcEntries") as import("../src/main/view").FolderEntry[] | undefined)?.find(item => item.path === repo);
    return entry?.kind === "list" ? entry.canvases.find(canvas => canvas.path === path) ?? null : null;
  }, [repo, path] as const);
  const log = (id: string) => readFile(join(repo, ".doan/comments", `${id}.jsonl`), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
  const savedBodies = async (id: string) => (await log(id)).split("\n").filter(Boolean).map(line => JSON.parse(line) as { body?: string; target?: { element?: { doanId?: string } } });

  async function openCanvas(file: string, title: string): Promise<void> {
    if (!await page.getByRole("tree", { name: "Canvases", exact: true }).isVisible()) await enterProject(page, repo);
    // A row's tooltip left open under the pointer (the list changed beneath it) covers the next row.
    // Radix keeps it until Escape (tooltip.ts); no draft is open at a scenario's start.
    await page.mouse.move(700, 20);
    if (await page.getByRole("tooltip").isVisible()) await page.keyboard.press("Escape");
    await page.getByRole("tooltip").waitFor({ state: "hidden", timeout: 2_000 });
    await canvasRow(page, file).click();
    await wait(async () => await page.locator("header .canvas").textContent() === title && await frame().getByRole("button", { name: "Child target", exact: true }).count() === 1, `${title} shown`);
  }
  async function select(name: string, doanId: string): Promise<void> {
    await retry(() => frame().getByRole("button", { name, exact: true }).click({ timeout: 2_000 }), `click ${name}`);
    await wait(async () => (await selected())?.includes(doanId) ?? false, `${doanId} selected`);
  }
  // Escape outside any text field: the controller ignores it in editable targets.
  async function escape(): Promise<void> {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Escape");
  }
  async function clearSelection(): Promise<void> {
    if (await selected() === null) return;
    await escape();
    await wait(async () => await selected() === null, "selection cleared");
  }
  async function saveNew(body: string): Promise<void> {
    await button("Save comment").click();
    await cards().filter({ hasText: body.split("\n")[0]! }).first().waitFor();
  }
  // A failed scenario can leave a draft or dialog behind; the next one starts clean.
  async function recover(): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await draftDialog().count()) {
        const discard = draftDialog().getByRole("button", { name: "Discard", exact: true });
        await (await discard.count() ? discard : draftDialog().getByRole("button").first()).click().catch(console.error);
        continue;
      }
      const cancel = button("Cancel");
      if (await cancel.count() && await cancel.isEnabled()) { await cancel.click().catch(console.error); await page.waitForTimeout(100); continue; }
      return;
    }
  }
  async function scenario(name: string, run: () => Promise<void>): Promise<void> {
    if (process.env.DOAN_RC_CASES && !process.env.DOAN_RC_CASES.split(",").includes(name)) return;
    try {
      await run();
      console.log(`revision-continuity PASS: ${name}`);
    } catch (error) {
      console.error(`revision-continuity FAIL: ${name}`, error);
      failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      await shot(`failed-${name}`).catch(console.error);
      await recover().catch(console.error);
    }
  }

  // Samples every animation frame across a reload of the open canvas (T-11): the
  // list must never be empty and "Location unavailable" must never appear. Pins
  // may drop for a frame or two by design (§7: they redraw after the new layout),
  // so they and the iframe height are only logged.
  async function traceReload(label: string, change: () => Promise<void>): Promise<void> {
    await page.evaluate(() => {
      const sample = () => {
        const panel = document.querySelector('[aria-label="Comments"]');
        const iframe = document.querySelector<HTMLIFrameElement>(".board iframe");
        return {
          cards: panel?.querySelectorAll("article").length ?? 0,
          unavailable: [...panel?.querySelectorAll(".comments-badge.warning") ?? []].filter(badge => badge.textContent === "Location unavailable").length,
          pins: document.querySelectorAll(".comment-pin").length,
          iframeHeight: iframe ? Math.round(iframe.getBoundingClientRect().height) : null,
        };
      };
      const trace = { on: true, samples: [] as ReturnType<typeof sample>[], baseline: sample() };
      Reflect.set(window, "rcTrace", trace);
      const tick = () => { if (!trace.on) return; trace.samples.push(sample()); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const before = await loads();
    await change();
    await wait(async () => await loads() > before, `${label} reloaded`);
    await page.waitForTimeout(1_000);
    const result = await page.evaluate(() => {
      const trace = Reflect.get(window, "rcTrace") as { on: boolean; baseline: { cards: number; unavailable: number; pins: number; iframeHeight: number | null }; samples: { cards: number; unavailable: number; pins: number; iframeHeight: number | null }[] };
      trace.on = false;
      const { baseline, samples } = trace;
      return {
        baseline, frames: samples.length, last: samples.at(-1),
        emptyList: samples.filter(sample => baseline.cards > 0 && sample.cards === 0).length,
        pinsDropped: samples.filter(sample => baseline.pins > 0 && sample.pins === 0).length,
        unavailable: samples.filter(sample => sample.unavailable > baseline.unavailable).length,
        minIframeHeight: Math.min(...samples.map(sample => sample.iframeHeight ?? Infinity)),
      };
    });
    console.log(`revision-continuity T-11 ${label}: ${JSON.stringify(result)}`);
    assert.ok(result.baseline.cards > 0, `${label}: comments listed before the reload`);
    assert.equal(result.emptyList, 0, `${label}: frames with an empty comment list`);
    assert.equal(result.unavailable, 0, `${label}: frames with "Location unavailable"`);
  }

  await launch();
  await enterProject(page, repo);

  let aRev = 0;
  const touchA = (options: { other?: boolean } = {}) => writeFile(design("a.html"), canvas("a", "A canvas", { ...options, rev: String(++aRev) }));

  await scenario("1-other-canvas-change", async () => {
    await openCanvas("a.html", "A canvas");
    await button("New canvas comment").click();
    const body = "Written while b changes";
    await createBody().fill(body);
    const iframe = await page.locator(".board iframe").elementHandle(); assert.ok(iframe);
    const loadsBefore = await loads();
    const changes: [string, () => Promise<void>][] = [
      ["plain write", () => writeFile(design("b.html"), canvas("b", "B plain"))],
      // Claude Code Write/Edit (tasks 1): a sibling temp name, then a rename.
      ["Claude-style rename", async () => { const temp = design(`b.html.tmp.${process.pid}.a1b2c3d4e5f6`); await writeFile(temp, canvas("b", "B claude")); await rename(temp, design("b.html")); }],
      ["dot temp rename", async () => { const temp = design(`.b.html.tmp-${process.pid}`); await writeFile(temp, canvas("b", "B dot")); await rename(temp, design("b.html")); }],
    ];
    for (const [kind, change] of changes) {
      const title = kind === "plain write" ? "B plain" : kind === "Claude-style rename" ? "B claude" : "B dot";
      await change();
      await wait(async () => (await row("design/b.html"))?.title === title, `${kind} listed`);
      // The open canvas would reload right after the same folder update.
      await holds(async () => await loads() === loadsBefore && await iframe.evaluate(node => node.isConnected), `${kind}: the open canvas did not reload`, 600);
    }
    assert.equal(await createBody().inputValue(), body);
    assert.equal(await panel().getByText(RELOADED, { exact: true }).count(), 0, "no reloaded notice");
    await saveNew(body);
    assert.ok((await savedBodies("a")).some(event => event.body === body), "the comment is in a.jsonl");
    await shot("1-other-canvas-change");
  });

  await scenario("2-continue-on-current-version", async () => {
    await openCanvas("a.html", "A canvas");
    await select("Child target", "child");
    await button("New selection comment").click();
    const body = "First line\nsecond line kept";
    await createBody().fill(body);
    await touchA();
    await panel().getByRole("status").filter({ hasText: RELOADED }).waitFor();
    assert.equal(await button("Save comment").count(), 0, "Continue takes the primary place");
    await wait(() => continueButton().isEnabled(), "continue enabled once the selection is found");
    await panel().getByText("Continues on Element · child.", { exact: true }).waitFor();
    await shot("2a-blocked");
    await continueButton().click();
    await button("Save comment").waitFor();
    assert.equal(await createBody().inputValue(), body);
    assert.equal(await panel().locator(".comments-composer .comments-target").textContent(), "To: Element · child");
    await wait(() => page.evaluate(() => { const node = document.activeElement; return node instanceof HTMLTextAreaElement && node.selectionStart === node.value.length && node.selectionEnd === node.value.length; }), "focus at the end of the body");
    await saveNew(body);
    const saved = (await savedBodies("a")).find(event => event.body === body);
    assert.equal(saved?.target?.element?.doanId, "child");
    await shot("2a-continued");

    // The selected element is gone in the new version: pick another one without a dialog, then continue.
    await select("Other target", "other");
    await button("New selection comment").click();
    const gone = "Selection removed under me";
    await createBody().fill(gone);
    await touchA({ other: false });
    await panel().getByRole("status").filter({ hasText: RELOADED }).waitFor();
    await panel().getByText(SELECTION_GONE, { exact: true }).waitFor();
    await button("Continue on canvas").waitFor();
    assert.equal(await continueButton().isDisabled(), true, "no selection to continue on");
    await shot("2b-selection-gone");
    await select("Child target", "child");
    await holds(async () => await draftDialog().count() === 0, "a same-canvas selection change asks nothing", 400);
    assert.equal(await createBody().inputValue(), gone);
    await wait(() => continueButton().isEnabled(), "continue enabled on the new selection");
    await continueButton().click();
    await button("Save comment").waitFor();
    assert.equal(await panel().locator(".comments-composer .comments-target").textContent(), "To: Element · child");
    await saveNew(gone);
    assert.equal((await savedBodies("a")).find(event => event.body === gone)?.target?.element?.doanId, "child");
    await touchA();
  });

  await scenario("2c-continue-failure-keeps-focus", async () => {
    // Injected in main: the natural begin failures found here (no width, a
    // lost selection) disable the button instead of failing a click.
    await openCanvas("a.html", "A canvas");
    await clearSelection();
    await button("New canvas comment").click();
    const body = "Retry after a failed continue";
    await createBody().fill(body);
    await touchA();
    await wait(() => continueButton().isEnabled(), "continue enabled");
    await app!.evaluate(({ ipcMain }) => {
      const handlers = Reflect.get(ipcMain, "_invokeHandlers") as Map<string, unknown>;
      Reflect.set(globalThis, "rcBegin", handlers.get("comments:begin"));
      ipcMain.removeHandler("comments:begin");
      ipcMain.handle("comments:begin", () => { throw new Error("Forced begin failure"); });
    });
    try {
      await continueButton().click();
      await panel().getByRole("alert").filter({ hasText: /^Couldn’t continue on the current version: .*Forced begin failure.*\. Your text is kept\.$/ }).waitFor();
      await wait(() => continueButton().isEnabled(), "continue enabled again for a retry");
      assert.equal(await createBody().inputValue(), body);
      const focus = await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        return { tag: node?.tagName, label: node?.getAttribute("aria-label") ?? node?.textContent, usable: !!node && node !== document.body && node.isConnected && !node.matches(":disabled") && !!node.closest(".workspace") };
      });
      console.log("revision-continuity: focus after a failed continue", JSON.stringify(focus));
      assert.ok(focus.usable, `focus after a failed continue is usable, got ${JSON.stringify(focus)}`);
      await shot("2c-continue-failed");
    } finally {
      await app!.evaluate(({ ipcMain }) => { ipcMain.removeHandler("comments:begin"); ipcMain.handle("comments:begin", Reflect.get(globalThis, "rcBegin")); });
    }
    await continueButton().click();
    await button("Save comment").waitFor();
    await saveNew(body);
  });

  await scenario("t11-selection-reload", async () => {
    await openCanvas("a.html", "A canvas");
    await select("Child target", "child");
    if (await scopePressed("Selection") !== "true") await panel().getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Selection", exact: true }).click();
    await wait(async () => await cards().count() > 0, "selection comments listed");
    await traceReload("selection scope", () => touchA());
  });

  await scenario("5-canvas-scope-kept", async () => {
    await openCanvas("a.html", "A canvas");
    await select("Child target", "child");
    await panel().getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Canvas", exact: true }).click();
    await wait(async () => await scopePressed("Canvas") === "true", "Canvas scope");
    await traceReload("canvas scope", () => touchA());
    await wait(async () => (await selected())?.includes("child") ?? false, "selection found again");
    await holds(async () => await scopePressed("Canvas") === "true", "Canvas scope stays after the canvas saved", 500);
  });

  await scenario("6-escape-without-selection", async () => {
    await openCanvas("a.html", "A canvas");
    await clearSelection();
    await button("New canvas comment").click();
    const body = "Escape keeps me quietly";
    await createBody().fill(body);
    await escape();
    await holds(async () => await draftDialog().count() === 0, "Escape with no selection opens no dialog", 600);
    assert.equal(await createBody().inputValue(), body);
    await recover();
  });

  await scenario("6b-blank-canvas-click-without-selection", async () => {
    await openCanvas("a.html", "A canvas");
    // The canvas's own background (html/body, outside any frame) is blank:
    // with no draft it clears a selection, so the click below does reach the canvas.
    const blank = () => frame().locator("body").click({ position: { x: 20, y: 20 }, timeout: 2_000 });
    await select("Child target", "child");
    await retry(blank, "blank click");
    await wait(async () => await selected() === null, "a blank in-canvas click clears the selection");
    await button("New canvas comment").click();
    const body = "Blank click keeps me quietly";
    await createBody().fill(body);
    await retry(blank, "blank click with a draft");
    await holds(async () => await draftDialog().count() === 0, "a blank in-canvas click with no selection opens no dialog", 600);
    assert.equal(await createBody().inputValue(), body);
    assert.equal(await selected(), null);
    await recover();
  });

  await scenario("3-move-follows-the-canvas", async () => {
    await openCanvas("m.html", "Moving canvas");
    await page.getByRole("treeitem", { name: "misc", exact: true }).click();
    await page.getByRole("treeitem", { name: "moved", exact: true }).click();
    await wait(async () => await folderExpanded("misc") === "false" && await folderExpanded("moved") === "false", "folders collapsed");
    // The open canvas's own row, collapsed by hand, stays collapsed too (R-B7 🟡2).
    await page.getByRole("button", { name: "Collapse Moving canvas", exact: true }).click();
    await wait(async () => await canvasRow(page, "m.html").getAttribute("aria-expanded") === "false", "open canvas row collapsed");
    await select("Child target", "child");
    await button("New selection comment").click();
    await createBody().fill("Before the move");
    await saveNew("Before the move");
    await cards().filter({ hasText: "Before the move" }).getByRole("button", { name: "Edit", exact: true }).click();
    await editBody().fill("Edited across the move");
    await menu(app!, page, "Zoom In");
    const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
    await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2);
    await page.mouse.wheel(0, 120);
    await wait(async () => (await board()).startsWith("translate") && !(await board()).includes("translate(0px, 0px)"), "panned");
    const view = await board();
    const loadsBefore = await loads();
    await rename(design("sub/m.html"), design("moved/m2.html"));
    await wait(async () => await iframePath() === "design/moved/m2.html" && await loads() > loadsBefore, "the moved canvas loads at its new path");
    await wait(async () => (await selected())?.includes("child") ?? false, "selection found again");
    const problems: string[] = [];
    const check = async (what: string, run: () => Promise<void>) => { try { await run(); } catch (error) { problems.push(`${what}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`); } };
    await check("no Overview, no removal toast", async () => {
      assert.equal(await overview().isVisible(), false);
      assert.equal(await page.locator(".toast .msg", { hasText: "was removed from design/" }).count(), 0);
      assert.equal(await page.locator("header .canvas").textContent(), "Moving canvas");
    });
    await check("view kept", async () => assert.equal(await board(), view));
    await check("open row moved", () => wait(async () => await canvasRow(page, "m2.html").evaluate(node => node.classList.contains("is-open")), "m2.html is the open row"));
    await check("new ancestor expanded", () => wait(async () => await folderExpanded("moved") === "true", "moved expanded"));
    await check("collapsed folder kept", async () => assert.equal(await folderExpanded("misc"), "false"));
    await check("collapsed canvas row kept", () => holds(async () => await canvasRow(page, "m2.html").getAttribute("aria-expanded") === "false", "m2.html row stays collapsed", 300));
    await check("doan active has the new path", () => wait(async () => {
      const active = JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env })).stdout) as { result?: { selection?: { canvas: { path: string } } } };
      return active.result?.selection?.canvas.path === "design/moved/m2.html";
    }, "doan active path"));
    await check("edit draft saves", async () => {
      assert.equal(await editBody().inputValue(), "Edited across the move");
      await button("Save changes").click();
      await cards().filter({ hasText: "Edited across the move" }).waitFor();
      assert.ok((await log("m")).includes("Edited across the move"));
    });
    await shot("3-moved");
    await check("Activity shows Moved", async () => {
      await clearSelection();
      const activity = page.getByRole("region", { name: "Activity", exact: true });
      await activity.getByText("Moved", { exact: true }).waitFor();
      await activity.getByText("· from m.html", { exact: true }).waitFor();
    });
    await shot("3-moved-activity");
    if (problems.length) throw new Error(problems.join("; "));
  });

  await scenario("3b-root-switch-after-move", async () => {
    await openCanvas("s.html", "Switch canvas");
    await page.getByRole("button", { name: "Collapse Switch canvas", exact: true }).click();
    await wait(async () => await canvasRow(page, "s.html").getAttribute("aria-expanded") === "false", "open canvas row collapsed");
    await rename(design("sub/s.html"), design("sub/s2.html"));
    await wait(async () => await iframePath() === "design/sub/s2.html", "the renamed canvas is followed");
    await holds(async () => await canvasRow(page, "s2.html").getAttribute("aria-expanded") === "false", "the moved row stays collapsed", 300);
    await enterProject(page, other);
    await canvasRow(page, "s.html").click();
    await wait(async () => await page.locator("header .canvas").textContent() === "Other switch canvas", "the other root's canvas at the move source shown");
    await enterProject(page, repo);
    await wait(async () => await page.locator("header .canvas").textContent() === "Switch canvas" && await iframePath() === "design/sub/s2.html", "the remembered canvas restored");
    await wait(async () => await canvasRow(page, "s2.html").getAttribute("aria-expanded") === "true", "a normal Open after the root switch expands the row");
    await shot("3b-root-switch");
  });

  await scenario("4-move-duplicate-id", async () => {
    await openCanvas("x.html", "X canvas");
    await rename(design("x.html"), design("x1.html"));
    await rename(design(".stash/x2.html"), design("x2.html"));
    const text = "X canvas moved, but 2 canvases now use the ID x. Run doan check in a terminal.";
    await overview().waitFor();
    await page.locator(".canvas-notice[role=status]", { hasText: text }).waitFor();
    await page.locator(".toast .msg", { hasText: text }).waitFor();
    await shot("4-duplicate-id");
  });

  await scenario("7-no-width-location", async () => {
    await openCanvas("w.html", "Wide canvas");
    await select("Child target", "child");
    await button("New selection comment").click();
    await createBody().fill("Wide element note");
    await saveNew("Wide element note");
    await writeFile(design("w.html"), canvas("w", "Wide canvas", { width: null }));
    await wait(async () => { const listed = await row("design/w.html"); return listed !== null && listed.width === undefined; }, "w.html listed without width");
    if (await scopePressed("Canvas") !== "true") await panel().getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Canvas", exact: true }).click();
    await wait(async () => await scopePressed("Canvas") === "true", "Canvas scope");
    await wait(async () => await cards().filter({ hasText: "Wide element note" }).count() === 1, "the element comment is listed");
    await holds(async () => await panel().getByText("Location unavailable", { exact: true }).count() === 0, "no Location unavailable without a rendered document", 1_000);
    await shot("7-no-width");
  });

  await scenario("8-restore-after-move", async () => {
    await openCanvas("r.html", "Restored canvas");
    await menu(app!, page, "Zoom In");
    await wait(async () => (await board()).includes("scale") && !(await board()).endsWith("scale(1)"), "zoomed");
    const view = await board();
    await quit();
    await rename(design("r.html"), design("misc/r-new.html"));
    await launch();
    await wait(async () => await page.locator("header .canvas").textContent() === "Restored canvas" && await iframePath() === "design/misc/r-new.html", "restored at the new path");
    await wait(async () => await board() === view, `restored view ${view}`);
    assert.equal(await page.locator(".toast .msg", { hasText: "is no longer in design/" }).count(), 0);
    await shot("8-restored");
  });

  if (app) await quit();
} catch (error) {
  console.error(error);
  failures.push(`setup: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  if (app) { await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
} finally {
  await guard.finish();
}

if (failures.length) throw new Error(`revision-continuity failures:\n${failures.join("\n")}`);
console.log("revision-continuity: PASS");
