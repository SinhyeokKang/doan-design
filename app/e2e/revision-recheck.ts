// revision-recheck task 12: seeing what an agent resolved and checking it one
// by one. A target line locates an off-screen target and keeps the filters;
// CLI resolves raise the review notice; Review steps, Reopen and Done; Escape
// keeps the progress passed; the Go menu moves steps; hidden and restarted
// windows show the notice again without the person's own resolves; resolver
// lines, Resolved order and reopened cards; a human Resolve leaves a status
// line and moves focus; Save and reopen brings a comment back to `doan
// comments`; Home and Overview counts; Canvas changed; Comment on selection
// instead; the Opened/Changed/Reloaded bottom label. Its own temp repo,
// userData and HOME. Scenarios run in order on one project (later ones start
// from the review state earlier ones leave); each is reported on its own and
// any failure fails the module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow, menu, hideMain, showMain }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { openOverview, canvasTitle: renderedCanvasTitle, canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, enterProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-revision-recheck-"));
const shots = join(root, ".scratch/runtime-test", `revision-recheck-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
// A passing run takes a few minutes; this only ends a run that hangs.
const guard = suiteGuard({ name: "revision-recheck", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: () => rm(work, { recursive: true, force: true }), timeoutMs: 420_000 });

const SELF = "Recheck Person", WRITER = { kind: "human", name: "Writer Person" } as const;
const canvas = (id: string, title: string, body: string) => `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${id}"><meta name="doan:width" content="800">`
  + "<style>body{margin:0;background:#eee;font:14px sans-serif}section{margin:40px;width:600px;padding:20px;background:#ccc}button{display:block;margin:16px;padding:12px}</style>" + body;
const element = (frame: string, doanId: string, text: string) => ({ frame, element: { doanId, selector: `[data-doan-id="${doanId}"]`, html: `<button data-doan-id="${doanId}">${text}</button>`, text } });
const sha = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const STALE = `sha256:${"0".repeat(64)}`;
// Seeded history is days old: older than the review marker's `since`, so only
// resolves made during the run are new to review.
const day = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00.000Z`;
const event = (type: string, comment: string, at: string, by: object, extra: object = {}) => JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, at, type, comment, by, ...extra });

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

  // long: the open and resolved targets sit far below the first screen.
  await writeFile(design("long.html"), canvas("long", "Long canvas", '<section data-doan-frame="top" data-doan-title="Top" style="height:200px"><button data-doan-id="near">Near target</button></section>'
    + '<section data-doan-frame="far" data-doan-title="Far" style="margin-top:2400px"><button data-doan-id="far-a">Far A</button><button data-doan-id="far-b" style="margin-top:1600px">Far B</button></section>'));
  const longComments = { open: `cmt_${randomUUID()}`, resolved: `cmt_${randomUUID()}`, canvasLevel: `cmt_${randomUUID()}` };
  await writeFile(commentsFile("long"), [
    event("create", longComments.open, day(1), WRITER, { body: "Far A needs more contrast", target: element("far", "far-a", "Far A"), canvasHash: STALE }),
    event("create", longComments.resolved, day(2), WRITER, { body: "Far B label is cut", target: element("far", "far-b", "Far B"), canvasHash: STALE }),
    event("create", longComments.canvasLevel, day(3), WRITER, { body: "Whole canvas feels busy", target: {}, canvasHash: STALE }),
    event("resolve", longComments.resolved, day(4), { kind: "agent", name: "codex" }),
    event("resolve", longComments.canvasLevel, day(5), { kind: "human", name: "Kim Doe" }),
  ].join("\n") + "\n");

  // review: ten open comments the CLI resolves during the run.
  const reviewIds = Array.from({ length: 10 }, () => `cmt_${randomUUID()}`);
  await writeFile(design("review.html"), canvas("review", "Review canvas", '<section data-doan-frame="list" data-doan-title="List">'
    + reviewIds.map((_, index) => `<button data-doan-id="r${index + 1}" style="margin-top:${index === 0 ? 16 : 400}px">Row ${index + 1}</button>`).join("") + "</section>"));
  await writeFile(commentsFile("review"), reviewIds.map((id, index) => event("create", id, day(index + 1), WRITER, { body: `Review note ${index + 1}`, target: element("list", `r${index + 1}`, `Row ${index + 1}`), canvasHash: STALE })).join("\n") + "\n");

  // meta: resolver lines, order, a reopened card, freshness, a missing target.
  const metaHtml = canvas("meta", "Meta canvas", '<section data-doan-frame="main" data-doan-title="Main"><button data-doan-id="keep">Keep target</button><button data-doan-id="other">Other target</button></section>');
  await writeFile(design("meta.html"), metaHtml);
  const m = Object.fromEntries(["m1", "m2", "m3", "m4", "m5", "m6", "m7"].map(key => [key, `cmt_${randomUUID()}`])) as Record<"m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7", string>;
  await writeFile(commentsFile("meta"), [
    event("create", m.m1, day(1), WRITER, { body: "Meta one resolved by Kim", target: {}, canvasHash: STALE }),
    event("create", m.m2, day(2), WRITER, { body: "Meta two resolved by codex", target: element("main", "other", "Other target"), canvasHash: STALE }),
    event("create", m.m3, day(3), WRITER, { body: "Meta three resolved by claude", target: {}, canvasHash: STALE }),
    event("create", m.m4, day(4), WRITER, { body: "Meta four reopened", target: {}, canvasHash: STALE }),
    event("create", m.m5, day(5), WRITER, { body: "Meta five current", target: element("main", "keep", "Keep target"), canvasHash: sha(metaHtml) }),
    event("create", m.m6, day(6), WRITER, { body: "Meta six lost its target", target: element("main", "gone", "Gone target"), canvasHash: sha(metaHtml) }),
    event("create", m.m7, day(7), WRITER, { body: "Meta seven on the canvas", target: {}, canvasHash: sha(metaHtml) }),
    event("resolve", m.m2, day(8), { kind: "agent", name: "codex" }),
    event("resolve", m.m4, day(9), { kind: "agent", name: "codex" }),
    event("resolve", m.m1, day(10), { kind: "human", name: "Kim Doe" }),
    event("reopen", m.m4, day(11), { kind: "human", name: "Kim Doe" }),
    event("resolve", m.m3, day(12), { kind: "agent", name: "claude-code" }),
  ].join("\n") + "\n");

  await exec("git", ["init", "-q", "-b", "main", repo]);
  await exec("git", ["-C", repo, "config", "user.name", SELF]); await exec("git", ["-C", repo, "config", "user.email", "recheck@example.test"]);
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo]));
  const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };

  async function launch(): Promise<void> {
    app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env }); rememberApp(app);
    page = await app.firstWindow(); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => console.error("revision-recheck pageerror", error));
    await (await appWindow(app, page)).evaluate(window => window.setSize(1400, 900));
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
  // Holds for the whole window: a negative check cannot pass on one lucky sample.
  async function holds(check: () => Promise<boolean>, name: string, ms = 800): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) { assert.ok(await check(), name); await page.waitForTimeout(25); }
  }
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`revision-recheck screenshot: ${path}`); };
  const panel = () => page.getByRole("region", { name: "Comments", exact: true });
  const cards = () => panel().getByRole("article");
  const card = (id: string) => panel().locator(`article[data-comment="${id}"]`);
  const button = (name: string) => panel().getByRole("button", { name, exact: true });
  const frame = () => page.frameLocator(".board iframe");
  const board = () => page.locator(".board").evaluate(node => (node as HTMLElement).style.transform);
  const selected = async () => { const head = page.locator(".inspect-head .selector"); return await head.count() ? head.textContent() : null; };
  const pressed = (group: "Comment scope" | "Comment status", name: RegExp) => panel().getByRole("group", { name: group }).getByRole("button", { name }).getAttribute("aria-pressed");
  const notice = () => panel().locator(".review-banner:not([role=status]) .text");
  const reviewBar = () => panel().getByRole("region", { name: "Review", exact: true });
  const step = () => reviewBar().getByRole("status").textContent();
  const summary = () => panel().locator(".review-banner[role=status] .text");
  const focused = () => page.evaluate(() => { const node = document.activeElement as HTMLElement | null; return { tag: node?.tagName ?? null, text: node?.textContent?.trim() ?? null, comment: node?.dataset.comment ?? null, className: node?.className ?? null }; });
  const doan = async (...args: string[]) => JSON.parse((await exec(cli, [...args, "--json", "--repo", repo], { env })).stdout) as { ok: boolean; result: { comments?: { comment: string; status: string; body: string; lastResolution?: { by: { name: string }; reopenedBy: { name: string } } }[] } };
  // One CLI call per comment, so each resolve gets its own `at` and a Review step can pass one without the next.
  const agentResolve = async (...ids: string[]) => { for (const id of ids) assert.equal((await doan("comment", "resolve", id, "--agent", "codex")).ok, true, `doan resolves ${id}`); };
  // The person's own resolve, as their other device or a terminal would write it.
  const ownResolve = (canvasId: string, id: string) => appendFile(commentsFile(canvasId), event("resolve", id, new Date().toISOString(), { kind: "human", name: SELF }) + "\n");
  const lines = async (canvasId: string) => (await readFile(commentsFile(canvasId), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as { id: string; at: string; type: string; comment: string; by: { name: string }; body?: string; target?: { element?: { doanId?: string } } });
  const menuEnabled = (label: string) => app!.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label === label) return item; const child = item.submenu && find(item.submenu.items); if (child) return child; } return undefined; };
    return find(Menu.getApplicationMenu()?.items ?? [])?.enabled ?? null;
  }, label);

  async function openCanvas(file: string, title: string, ready: string): Promise<void> {
    if (!await page.getByRole("tree", { name: "Projects and canvases", exact: true }).isVisible()) await enterProject(page, repo, app!);
    await page.mouse.move(700, 20);
    if (await page.getByRole("tooltip").isVisible()) await page.keyboard.press("Escape");
    await page.getByRole("tooltip").waitFor({ state: "hidden", timeout: 2_000 });
    await canvasRow(page, file).click();
    await wait(async () => await renderedCanvasTitle(page) === title && await frame().getByRole("button", { name: ready, exact: true }).count() === 1, `${title} shown`);
    await wait(async () => await cards().count() > 0 || await panel().locator(".comments-message").count() > 0, `${title} comments read`);
  }
  async function select(name: string, doanId: string): Promise<void> {
    await wait(async () => { await frame().getByRole("button", { name, exact: true }).click({ timeout: 2_000 }); return true; }, `click ${name}`);
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
  async function filterTo(group: "Comment scope" | "Comment status", name: RegExp): Promise<void> {
    if (await pressed(group, name) !== "true") await panel().getByRole("group", { name: group }).getByRole("button", { name }).click();
    await wait(async () => await pressed(group, name) === "true", `${group} ${name}`);
  }
  async function noticeIs(text: string): Promise<void> {
    await wait(async () => await notice().count() === 1 && await notice().textContent() === text, `notice "${text}"`, 15_000);
  }
  async function stepIs(text: string): Promise<void> {
    await wait(async () => await step() === text, `step "${text}"`);
  }
  async function focusOn(check: (focus: Awaited<ReturnType<typeof focused>>) => boolean, name: string): Promise<void> {
    await wait(async () => check(await focused()), name, 3_000).catch(async error => { throw new Error(`${name}: focus is ${JSON.stringify(await focused())} (${error instanceof Error ? error.message : String(error)})`); });
  }
  // The element's box against the Canvas region, in window coordinates.
  async function onScreen(name: string): Promise<boolean> {
    const area = await page.getByRole("region", { name: "Canvas", exact: true }).boundingBox();
    const box = await frame().getByRole("button", { name, exact: true }).boundingBox();
    if (!area || !box) return false;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  }
  const highlighted = () => page.locator(".jump-highlight").count().then(count => count > 0);
  // A failed scenario can leave a draft, a dialog or a Review behind; the next one starts clean.
  async function recover(): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.locator("dialog[open]").count()) {
        const dismiss = page.locator("dialog[open]").getByRole("button", { name: /^(Discard|Keep both|Cancel)$/ });
        await (await dismiss.count() ? dismiss.first() : page.locator("dialog[open]").getByRole("button").first()).click().catch(console.error);
        continue;
      }
      const cancel = button("Cancel");
      if (await cancel.count() && await cancel.isEnabled()) { await cancel.click().catch(console.error); await page.waitForTimeout(100); continue; }
      if (await reviewBar().count()) { await reviewBar().getByRole("button", { name: "Close Review", exact: true }).click().catch(console.error); continue; }
      return;
    }
  }
  async function scenario(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
      console.log(`revision-recheck PASS: ${name}`);
    } catch (error) {
      console.error(`revision-recheck FAIL: ${name}`, error);
      failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      await shot(`failed-${name}`).catch(console.error);
      await recover().catch(console.error);
    }
  }

  await launch();
  await enterProject(page, repo, app!);

  await scenario("1-locate-off-screen", async () => {
    await openCanvas("long.html", "Long canvas", "Near target");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Open \d+$/);
    const target = card(longComments.open).locator("button.comments-target.locatable");
    await wait(async () => await target.count() === 1, "open target line is locatable");
    assert.equal(await onScreen("Far A"), false, "Far A starts off screen");
    const view = await board();
    await target.click();
    await wait(async () => await board() !== view, "the view moved to Far A");
    await wait(() => highlighted(), "Far A highlighted");
    await wait(async () => (await selected())?.includes("far-a") ?? false, "Far A selected");
    await wait(() => onScreen("Far A"), "Far A on screen");
    assert.equal(await pressed("Comment scope", /^Canvas$/), "true", "scope stays Canvas after locating an open comment");
    assert.equal(await pressed("Comment status", /^Open \d+$/), "true", "status stays Open");
    await shot("1a-located-open");

    await filterTo("Comment status", /^Resolved \d+$/);
    await wait(async () => await cards().count() === 2, "two resolved comments listed");
    assert.equal(await onScreen("Far B"), false, "Far B starts off screen");
    const before = await board();
    await card(longComments.resolved).locator("button.comments-target.locatable").click();
    await wait(async () => await board() !== before, "the view moved to Far B");
    await wait(async () => (await selected())?.includes("far-b") ?? false, "Far B selected");
    await wait(() => onScreen("Far B"), "Far B on screen");
    assert.equal(await pressed("Comment status", /^Resolved \d+$/), "true", "status stays Resolved after locating a resolved comment");
    assert.equal(await pressed("Comment scope", /^Canvas$/), "true", "scope stays Canvas");
    assert.equal(await cards().count(), 2, "the other resolved comment stays listed");
    await shot("1b-located-resolved");
    await clearSelection();
  });

  await scenario("2-review-steps", async () => {
    await openCanvas("review.html", "Review canvas", "Row 1");
    await clearSelection();
    await holds(async () => await notice().count() === 0, "no notice before anything is resolved", 600);
    await agentResolve(reviewIds[0]!, reviewIds[1]!, reviewIds[2]!);
    // First Review of this canvas on this device.
    await noticeIs("3 resolved");
    await shot("2a-notice");
    await button("Review").click();
    await stepIs("Review 1 of 3");
    assert.equal(await panel().getByRole("group", { name: "Comment status" }).count(), 0, "filters fold while reviewing");
    assert.equal(await reviewBar().getByRole("button", { name: "Previous", exact: true }).isDisabled(), true, "Previous disabled on the first step");
    await reviewBar().getByText(/^Resolved by codex · /).waitFor();
    await focusOn(focus => focus.text === "Next", "focus on Next at the first step");
    await wait(() => highlighted(), "the step target highlighted");
    assert.equal(await selected(), null, "a Review step selects nothing");
    await shot("2b-step-1");
    await reviewBar().getByRole("button", { name: "Next", exact: true }).click();
    await stepIs("Review 2 of 3");
    await focusOn(focus => focus.text === "Next", "focus on Next after a step");
    await reviewBar().getByRole("button", { name: "Reopen", exact: true }).click();
    await reviewBar().getByText("Reopened", { exact: true }).waitFor();
    await reviewBar().getByRole("button", { name: "Next", exact: true }).waitFor();
    await wait(async () => (await lines("review")).some(line => line.type === "reopen" && line.comment === reviewIds[1] && line.by.name === SELF), "the reopen is written by the Git name");
    await shot("2c-reopened");
    const view = await board();
    await reviewBar().getByRole("button", { name: "Next", exact: true }).click();
    await stepIs("Review 3 of 3");
    await wait(async () => await board() !== view && await onScreen("Row 3"), "the view moved to the step target");
    assert.equal(await selected(), null, "moving between steps selects nothing");
    await reviewBar().getByRole("button", { name: "Done", exact: true }).click();
    await wait(async () => await summary().count() === 1 && await summary().textContent() === "Reviewed 3 · Reopened 1", "Done summary");
    assert.equal(await reviewBar().count(), 0, "the bar leaves on Done");
    // A reopen renders Hand off… in the summary, and Done focuses it before ×.
    await focusOn(focus => typeof focus.className === "string" && focus.className.includes("review-handoff"), "focus on the summary's Hand off…");
    assert.equal(await notice().count(), 0, "nothing left to review");
    await shot("2d-done");
    const listed = (await doan("comments")).result.comments ?? [];
    const reopened = listed.find(comment => comment.comment === reviewIds[1]);
    assert.equal(reopened?.status, "open", "the reopened comment is back in doan comments");
    assert.equal(reopened?.lastResolution?.by.name, "codex");
    assert.equal(reopened?.lastResolution?.reopenedBy.name, SELF);
    await panel().getByRole("button", { name: "Close summary", exact: true }).click();
    await wait(async () => await summary().count() === 0, "summary closed");
  });

  await scenario("3-escape-keeps-progress-and-menu", async () => {
    await openCanvas("review.html", "Review canvas", "Row 1");
    await clearSelection();
    await agentResolve(reviewIds[3]!, reviewIds[4]!);
    await noticeIs("2 resolved since your last review");
    await button("Review").click();
    await stepIs("Review 1 of 2");
    await reviewBar().getByRole("button", { name: "Next", exact: true }).click();
    await stepIs("Review 2 of 2");
    await escape();
    await wait(async () => await reviewBar().count() === 0, "Escape closes Review");
    // Next passed step 1 only, so step 2 is still to review.
    await noticeIs("1 resolved since your last review");
    await focusOn(focus => focus.text === "Review", "focus back on the notice's Review");
    await shot("3a-escaped");

    await agentResolve(reviewIds[5]!);
    await noticeIs("2 resolved since your last review");
    assert.equal(await menuEnabled("Next Resolved Comment"), false, "Next Resolved Comment disabled outside Review");
    assert.equal(await menuEnabled("Previous Resolved Comment"), false, "Previous Resolved Comment disabled outside Review");
    await button("Review").click();
    await stepIs("Review 1 of 2");
    // Playwright keys do not reach native accelerators; the item is clicked from main.
    await menu(app!, page, "Next Resolved Comment");
    await stepIs("Review 2 of 2");
    await focusOn(focus => focus.text === "Done", "focus on Done after the menu step");
    await menu(app!, page, "Previous Resolved Comment");
    await stepIs("Review 1 of 2");
    await reviewBar().getByRole("button", { name: "Next", exact: true }).click();
    await stepIs("Review 2 of 2");
    await reviewBar().getByRole("button", { name: "Done", exact: true }).click();
    await wait(async () => await summary().textContent() === "Reviewed 2", "Done summary without reopens");
    assert.equal(await panel().locator(".review-handoff").count(), 0, "no Hand off… without reopens");
    await focusOn(focus => typeof focus.className === "string" && focus.className.includes("review-done-close"), "focus on Close summary");
    await wait(async () => await menuEnabled("Next Resolved Comment") === false, "menu disabled after Done");
    await panel().getByRole("button", { name: "Close summary", exact: true }).click();
    assert.equal(await notice().count(), 0);
  });

  await scenario("4-hidden-and-restart", async () => {
    await openCanvas("review.html", "Review canvas", "Row 1");
    await clearSelection();
    await hideMain(app!, page, "hide");
    await agentResolve(reviewIds[6]!);
    await ownResolve("review", reviewIds[7]!);
    await page.waitForTimeout(800);
    await showMain(app!, page);
    // The person's own resolve is read (it is listed as resolved) but is not counted.
    await noticeIs("1 resolved since your last review");
    await filterTo("Comment status", /^Resolved \d+$/);
    await card(reviewIds[7]!).getByText(`Resolved by ${SELF} · `, { exact: false }).waitFor();
    await filterTo("Comment status", /^Open \d+$/);
    await shot("4a-shown-again");

    await quit();
    await agentResolve(reviewIds[8]!);
    await ownResolve("review", reviewIds[9]!);
    await launch();
    await openCanvas("review.html", "Review canvas", "Row 1");
    await noticeIs("2 resolved since your last review");
    await shot("4b-restarted");
  });

  await scenario("5-home-and-overview-counts", async () => {
    await goHome(page, app!);
    const row = homeRow(page, repo);
    await wait(async () => (await row.getAttribute("aria-label"))?.includes(" · 2 resolved to review · ") ?? false, "Home row counts 2 to review");
    assert.equal(await row.locator(".wt-sum .review").textContent(), "2 resolved to review");
    await shot("5a-home");
    await enterProject(page, repo, app!);
    await openOverview(page, "proj");
    const overview = page.getByRole("region", { name: "Overview", exact: true });
    const reviewCard = overview.locator(".ocard").filter({ hasText: "Review canvas" });
    await wait(async () => await reviewCard.locator(".ocard-meta .review").textContent() === "2 resolved to review", "Overview card counts 2 to review");
    assert.equal(await overview.locator(".ocard .review").count(), 1, "only the review canvas has comments to review");
    await shot("5b-overview");
    await openCanvas("review.html", "Review canvas", "Row 1");
    await noticeIs("2 resolved since your last review");
    await button("Review").click();
    await reviewBar().getByRole("button", { name: "Next", exact: true }).click();
    await reviewBar().getByRole("button", { name: "Done", exact: true }).click();
    await wait(async () => await summary().count() === 1, "Done");
    await goHome(page, app!);
    await wait(async () => !((await row.getAttribute("aria-label"))?.includes("resolved to review") ?? true), "Home count gone after the Review");
  });

  await scenario("6-resolution-meta-and-canvas-changed", async () => {
    await openCanvas("meta.html", "Meta canvas", "Keep target");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Resolved \d+$/);
    // Newest resolve first, not creation order.
    await wait(async () => JSON.stringify(await cards().evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.comment))) === JSON.stringify([m.m3, m.m1, m.m2]), "Resolved by resolve time, newest first");
    const line = (id: string) => card(id).locator(".comments-resolution");
    assert.match(await line(m.m3).textContent() ?? "", /^Resolved by claude-code · .+ ago$/);
    assert.match(await line(m.m1).textContent() ?? "", /^Resolved by Kim Doe · .+ ago$/);
    assert.match(await line(m.m2).textContent() ?? "", /^Resolved by codex · .+ ago$/);
    assert.equal(await line(m.m1).locator("time").getAttribute("title"), day(10), "absolute resolve time in title");
    assert.equal(await panel().getByText("Canvas changed", { exact: true }).count(), 0, "no Canvas changed on resolved cards");
    await shot("6a-resolved-meta");
    await filterTo("Comment status", /^Open \d+$/);
    const reopened = card(m.m4).locator(".comments-resolution");
    await wait(async () => await reopened.count() === 2, "two lines on the reopened card");
    assert.match(await reopened.nth(0).textContent() ?? "", /^Reopened by Kim Doe · .+ ago$/);
    assert.equal(await reopened.nth(1).textContent(), "Previously resolved by codex");
    const changed = card(m.m4).getByText("Canvas changed", { exact: true });
    assert.equal(await changed.getAttribute("title"), "The canvas changed after this comment was written.");
    assert.equal(await changed.getAttribute("class"), "comments-badge", "neutral badge");
    assert.equal(await card(m.m5).getByText("Canvas changed", { exact: true }).count(), 0, "a current comment has no badge");
    await shot("6b-reopened-card");
  });

  await scenario("7-human-resolve-status-line", async () => {
    await openCanvas("meta.html", "Meta canvas", "Keep target");
    await clearSelection();
    await filterTo("Comment status", /^Open \d+$/);
    const order = await cards().evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.comment));
    const at = order.indexOf(m.m5);
    assert.ok(at >= 0 && at < order.length - 1, `m5 has a next card in ${JSON.stringify(order)}`);
    const next = order[at + 1]!;
    // R-C ⚪4: is the role=status line in the DOM before its text, or inserted with it?
    await page.evaluate(() => {
      const root = document.querySelector('[aria-label="Comments"]')!;
      const log: { kind: string; text: string | null; detail: string }[] = [];
      const statusOf = (node: Node | null) => node instanceof Element ? node.closest(".comments-status") : node?.parentElement?.closest(".comments-status") ?? null;
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) if (node instanceof Element && node.matches(".comments-status")) log.push({ kind: "status element added", text: node.textContent, detail: `children ${node.childNodes.length}` });
          const inside = statusOf(record.target);
          if (inside && !(record.type === "childList" && [...record.addedNodes].some(node => node instanceof Element && node.matches(".comments-status")))) log.push({ kind: `${record.type} inside status`, text: inside.textContent, detail: record.type === "characterData" ? `old ${JSON.stringify(record.oldValue)}` : `added ${record.addedNodes.length}` });
          for (const node of record.removedNodes) if (node instanceof Element && node.matches(".comments-status")) log.push({ kind: "status element removed", text: node.textContent, detail: "" });
        }
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
      Reflect.set(window, "rrStatus", { log, stop: () => observer.disconnect() });
    });
    await card(m.m5).getByRole("button", { name: "Resolve", exact: true }).click();
    const status = panel().locator(".comments-status[role=status]");
    await wait(async () => await status.count() === 1 && await status.textContent() === "Resolved — moved to Resolved.", "status line after Resolve");
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment === next, "focus on the next card");
    await shot("7a-resolved-line");
    await wait(async () => await status.count() === 0, "status line clears after 4 seconds", 7_000);
    const observed = await page.evaluate(() => { const probe = Reflect.get(window, "rrStatus") as { log: unknown[]; stop: () => void }; probe.stop(); return probe.log; });
    console.log(`revision-recheck R-C ⚪4 status-line mutations: ${JSON.stringify(observed)}`);

    await filterTo("Comment status", /^Resolved \d+$/);
    await card(m.m5).getByRole("button", { name: "Reopen", exact: true }).click();
    await wait(async () => await status.count() === 1 && await status.textContent() === "Reopened — moved to Open.", "status line after Reopen");
    await focusOn(focus => focus.tag === "ARTICLE" && focus.comment !== null && focus.comment !== m.m5, "focus on a remaining resolved card");
    await shot("7b-reopened-line");
  });

  await scenario("8-save-and-reopen", async () => {
    await openCanvas("meta.html", "Meta canvas", "Keep target");
    await clearSelection();
    await filterTo("Comment status", /^Resolved \d+$/);
    await card(m.m2).getByRole("button", { name: "Edit", exact: true }).click();
    const save = button("Save and reopen");
    await save.waitFor();
    assert.match(await save.getAttribute("class") ?? "", /\bprimary\b/, "Save and reopen is the primary button");
    await button("Save only").waitFor();
    await panel().getByText("Agents read open comments only.", { exact: true }).waitFor();
    await panel().getByRole("textbox", { name: "Your unsaved edit body" }).fill("Still too tight after the fix");
    const before = (await lines("meta")).length;
    await save.click();
    const status = panel().locator(".comments-status[role=status]");
    await wait(async () => await status.count() === 1 && await status.textContent() === "Reopened — moved to Open.Show", "status line with Show");
    const written = await lines("meta");
    assert.equal(written.length, before + 2, "edit and reopen appended together");
    const [edit, reopen] = written.slice(-2);
    assert.deepEqual([edit?.type, edit?.comment, edit?.body, reopen?.type, reopen?.comment, reopen?.by.name], ["edit", m.m2, "Still too tight after the fix", "reopen", m.m2, SELF]);
    assert.equal(Date.parse(reopen!.at) - Date.parse(edit!.at), 1, "reopen 1 ms after the edit");
    const listed = (await doan("comments")).result.comments?.find(comment => comment.comment === m.m2);
    assert.equal(listed?.status, "open", "back in doan comments");
    assert.equal(listed?.body, "Still too tight after the fix");
    assert.equal(listed?.lastResolution?.by.name, "codex");
    await shot("8a-saved-and-reopened");

    await agentResolve(m.m2);
    await wait(async () => !((await doan("comments")).result.comments ?? []).some(comment => comment.comment === m.m2), "resolved again: gone from doan comments");
    await filterTo("Comment status", /^Resolved \d+$/);
    const meta = card(m.m2).locator(".comments-resolution");
    await wait(async () => await meta.count() === 1 && /^Resolved by codex · /.test(await meta.textContent() ?? ""), "re-resolved card shows the new resolve only");
    assert.equal(await card(m.m2).getByText(/^Previously resolved by/).count(), 0, "no previous resolution after the re-resolve");
  });

  await scenario("9-comment-on-selection-instead", async () => {
    await openCanvas("meta.html", "Meta canvas", "Keep target");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Open \d+$/);
    const lost = card(m.m6);
    await lost.getByText("Location unavailable", { exact: true }).waitFor();
    const instead = lost.getByRole("button", { name: "Comment on selection instead", exact: true });
    assert.equal(await instead.isDisabled(), true, "disabled without a selection");
    const described = await instead.getAttribute("aria-describedby");
    assert.ok(described, "the reason is attached");
    assert.equal(await page.locator(`[id="${described}"]`).textContent(), "Select an element or frame first.");
    assert.equal(await card(m.m7).getByRole("button", { name: "Comment on selection instead", exact: true }).count(), 0, "only a lost target offers it");
    await shot("9a-disabled");
    await select("Keep target", "keep");
    await filterTo("Comment scope", /^Canvas$/);
    await wait(() => instead.isEnabled(), "enabled with a selection");
    await instead.click();
    const body = panel().getByRole("textbox", { name: "New comment body" });
    await wait(async () => await body.inputValue() === "Meta six lost its target", "the draft starts with the same body");
    await button("Save comment").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Delete the original comment?", { exact: true }).waitFor();
    await dialog.getByText(/^Your text was saved as a new comment on Element · button keep · in Main\.$/).waitFor();
    await focusOn(focus => focus.text === "Keep both", "focus starts on Keep both");
    await shot("9b-delete-original");
    await dialog.getByRole("button", { name: "Delete original", exact: true }).click();
    await wait(async () => await lost.count() === 0, "the original is gone");
    const written = await lines("meta");
    assert.ok(written.some(line => line.type === "delete" && line.comment === m.m6), "delete written");
    const replacement = written.find(line => line.type === "create" && line.body === "Meta six lost its target" && line.comment !== m.m6);
    assert.equal(replacement?.target?.element?.doanId, "keep", "the new comment is on the selection");
    assert.equal(replacement?.by.name, SELF, "written by the Git name");
    await clearSelection();
  });

  await scenario("10-bottom-label", async () => {
    const label = async () => (await page.getByRole("region", { name: "Canvas", exact: true }).getByRole("status", { name: /^(Opened|Changed|Reloaded|Moved) / }).allTextContents())[0]?.trim() ?? "";
    const firstActivity = async () => ((await page.getByRole("region", { name: "Activity", exact: true }).getByRole("listitem").allTextContents())[0] ?? "").replace(/^\d{2}:\d{2}:\d{2}/, "");
    await openCanvas("long.html", "Long canvas", "Near target");
    await openCanvas("meta.html", "Meta canvas", "Keep target");
    await clearSelection();
    await wait(async () => /^Opened \d\d:\d\d$/.test(await label()), "Opened label");
    await writeFile(design("meta.html"), metaHtml + "<!-- changed -->");
    await wait(async () => /^Changed \d\d:\d\d$/.test(await label()), "Changed label after the canvas changed");
    assert.equal(await firstActivity(), "Changed");
    await wait(async () => await frame().getByRole("button", { name: "Keep target", exact: true }).count() === 1, "reloaded canvas laid out");
    await menu(app!, page, "Reload Canvas");
    await wait(async () => /^Reloaded \d\d:\d\d$/.test(await label()), "Reloaded label after Reload Canvas");
    assert.equal(await firstActivity(), "Reloaded");
    await shot("10-bottom-label");
  });


  if (app) await quit();
} catch (error) {
  console.error(error);
  failures.push(`setup: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  if (app) { await page.screenshot({ path: join(shots, "failure.png") }).catch(console.error); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
} finally {
  await guard.finish();
}

if (failures.length) throw new Error(`revision-recheck failures:\n${failures.join("\n")}`);
console.log("revision-recheck: PASS");
