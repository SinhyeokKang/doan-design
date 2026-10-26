// agent-handoff task 9: handing chosen open comments to an agent through the
// Hand off dialog. Preview rows in Canvas order, unchecking updates Copy N,
// Selection quick select; keyboard only (Return copies, Space toggles, Escape
// closes and restores focus); the clipboard holds the preview text; Copying…
// and a failed copy inside the dialog; an agent resolving a checked comment
// while the dialog is open; Handed off kept and cleared by CLI resolves;
// resolved cards without Hand off…; the Inspector "fix this" hint and Home
// "Selected for your agent"; the Review Done summary's Hand off…; the worktree
// notice with and without a second git worktree. Its own temp repos, userData
// and HOME, and the clipboard saved and restored. Scenarios run in order on one
// project (later ones start from the comments earlier ones leave); each is
// reported on its own and any failure fails the module.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
const { rememberApp, closeApp, suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const { saveClipboard, restoreClipboard }: typeof import("./clipboard") = await import(new URL("./clipboard.ts", import.meta.url).href);
const { realState, assertRealState }: typeof import("./real-state") = await import(new URL("./real-state.ts", import.meta.url).href);
const { appWindow }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);
const { canvasRow }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, enterProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);

const beforeRealState = await realState();
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const work = await realpath(await mkdtemp("/tmp/doan-agent-handoff-"));
const shots = join(root, ".scratch/runtime-test", `agent-handoff-${Date.now()}`);
let app: ElectronApplication | undefined;
let page!: Page;
let clipboardSaved = false;
// A passing run takes a few minutes; this only ends a run that hangs.
const guard = suiteGuard({ name: "agent-handoff", app: () => app, verify: () => assertRealState(beforeRealState), cleanup: () => rm(work, { recursive: true, force: true }), timeoutMs: 420_000 });

const SELF = "Handoff Person", WRITER = { kind: "human", name: "Writer Person" } as const;
const COPY_FAILED = "Couldn’t copy. Your clipboard could not be updated. Try again.";
const INSTRUCTION_START = "Use the doan CLI or MCP tools to read the comments identified by the JSON below.";
const canvas = (id: string, title: string, body: string) => `<!doctype html><title>${title}</title><meta name="doan:canvas" content="${id}"><meta name="doan:width" content="800">`
  + "<style>body{margin:0;background:#eee;font:14px sans-serif}section{margin:40px;width:600px;padding:20px;background:#ccc}button{display:block;margin:16px;padding:12px}</style>" + body;
const element = (frame: string, doanId: string, text: string) => ({ frame, element: { doanId, selector: `[data-doan-id="${doanId}"]`, html: `<button data-doan-id="${doanId}">${text}</button>`, text } });
const STALE = `sha256:${"0".repeat(64)}`;
const day = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00.000Z`;
const event = (type: string, comment: string, at: string, by: object, extra: object = {}) => JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, at, type, comment, by, ...extra });

const failures: string[] = [];
try {
  const userData = join(work, "userData"), home = join(work, "home"), cli = join(work, "doan"), shell = join(work, "shell");
  const repo = join(work, "proj"), wtRepo = join(work, "wt"), wtSecond = join(work, "wt-feature");
  const commentsFile = (project: string, id: string) => join(project, ".doan/comments", `${id}.jsonl`);
  await mkdir(userData); await mkdir(home); await mkdir(shots, { recursive: true });
  await writeFile(join(userData, "onboarding.json"), "{}");
  await writeFile(shell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  async function project(path: string, files: Record<string, string>): Promise<void> {
    await mkdir(join(path, ".doan/comments"), { recursive: true }); await mkdir(join(path, "design"));
    await writeFile(join(path, ".doan/config.json"), '{"v":1}');
    for (const [name, text] of Object.entries(files)) await writeFile(join(path, name), text);
    await exec("git", ["init", "-q", "-b", "main", path]);
    await exec("git", ["-C", path, "config", "user.name", SELF]); await exec("git", ["-C", path, "config", "user.email", "handoff@example.test"]);
    // A commit, so `doan ls` reports the branch the context line and notice name.
    await exec("git", ["-C", path, "add", "-A"]); await exec("git", ["-C", path, "commit", "-q", "-m", "seed"]);
  }

  // hand: open comments on two elements, one canvas-level, one long line, one resolved.
  const h = Object.fromEntries(["h1", "h2", "h3", "h4", "h5", "r1"].map(key => [key, `cmt_${randomUUID()}`])) as Record<"h1" | "h2" | "h3" | "h4" | "h5" | "r1", string>;
  const body: Record<string, string> = {
    [h.h1]: "Alpha needs more contrast",
    [h.h2]: "Alpha label wraps\nSecond line of detail",
    [h.h3]: "Beta spacing is off",
    [h.h4]: "Whole canvas feels busy",
    [h.h5]: `Gamma ${"runs on and on ".repeat(12)}until the end`,
    [h.r1]: "Delta was fixed already",
  };
  const first = (id: string) => body[id]!.split("\n")[0]!;
  const n1 = `cmt_${randomUUID()}`, n2 = `cmt_${randomUUID()}`;
  body[n1] = "New note while the dialog is open"; body[n2] = "Another note after the hand-off";
  const handHtml = canvas("hand", "Hand canvas", '<section data-doan-frame="main" data-doan-title="Main">'
    + '<button data-doan-id="alpha">Alpha</button><button data-doan-id="beta">Beta</button><button data-doan-id="gamma">Gamma</button>'
    + '<button data-doan-id="delta">Delta</button><button data-doan-id="empty">Empty target</button></section>');
  // review: three the CLI resolves during the run, one left open.
  const v = Array.from({ length: 4 }, () => `cmt_${randomUUID()}`);
  const reviewHtml = canvas("review", "Review canvas", '<section data-doan-frame="list" data-doan-title="List"><button data-doan-id="row">Review row</button></section>');
  await project(repo, {
    "design/hand.html": handHtml,
    ".doan/comments/hand.jsonl": [
      event("create", h.h1, day(1), WRITER, { body: body[h.h1], target: element("main", "alpha", "Alpha"), canvasHash: STALE }),
      event("create", h.h2, day(2), WRITER, { body: body[h.h2], target: element("main", "alpha", "Alpha"), canvasHash: STALE }),
      event("create", h.h3, day(3), WRITER, { body: body[h.h3], target: element("main", "beta", "Beta"), canvasHash: STALE }),
      event("create", h.h4, day(4), WRITER, { body: body[h.h4], target: {}, canvasHash: STALE }),
      event("create", h.h5, day(5), WRITER, { body: body[h.h5], target: element("main", "gamma", "Gamma"), canvasHash: STALE }),
      event("create", h.r1, day(6), WRITER, { body: body[h.r1], target: element("main", "delta", "Delta"), canvasHash: STALE }),
      event("resolve", h.r1, day(7), WRITER),
    ].join("\n") + "\n",
    "design/review.html": reviewHtml,
    ".doan/comments/review.jsonl": v.map((id, index) => event("create", id, day(index + 1), WRITER, { body: `Review note ${index + 1}`, target: {}, canvasHash: STALE })).join("\n") + "\n",
  });
  // wt: a repository with a second git worktree that is not added to Doan.
  const wtComment = `cmt_${randomUUID()}`;
  await project(wtRepo, {
    "design/wt.html": canvas("wt", "Wt canvas", '<section data-doan-frame="main" data-doan-title="Main"><button data-doan-id="only">Only target</button></section>'),
    ".doan/comments/wt.jsonl": event("create", wtComment, day(1), WRITER, { body: "Worktree note", target: {}, canvasHash: STALE }) + "\n",
  });
  await exec("git", ["-C", wtRepo, "worktree", "add", "-q", "-b", "feature", wtSecond]);
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo, wtRepo]));
  const env = { ...process.env, HOME: home, TMPDIR: work, SHELL: shell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"), DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") };

  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env }); rememberApp(app);
  await app.evaluate(saveClipboard);
  clipboardSaved = true;
  page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  page.on("pageerror", error => console.error("agent-handoff pageerror", error));
  await (await appWindow(app, page)).evaluate(window => window.setSize(1400, 900));

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
  const shot = async (name: string) => { const path = join(shots, `${name}.png`); await page.screenshot({ path }); console.log(`agent-handoff screenshot: ${path}`); };
  const panel = () => page.getByRole("region", { name: "Comments", exact: true });
  const cards = () => panel().getByRole("article");
  const card = (id: string) => panel().locator(`article[data-comment="${id}"]`);
  const frame = () => page.frameLocator(".board iframe");
  const selected = async () => { const head = page.locator(".inspect-head .selector"); return await head.count() ? head.textContent() : null; };
  const pressed = (group: "Comment scope" | "Comment status", name: RegExp) => panel().getByRole("group", { name: group }).getByRole("button", { name }).getAttribute("aria-pressed");
  const headHandOff = () => panel().locator(".comments-head").getByRole("button", { name: "Hand off…", exact: true });
  const handedOff = () => panel().locator(".comments-head .handoff-summary");
  const dialog = () => page.getByRole("dialog", { name: "Hand off to your agent", exact: true });
  const copyButton = () => dialog().locator(".handoff-actions .comments-btn.primary");
  const quick = (name: "All" | "None" | "Selection") => dialog().getByRole("group", { name: "Quick select" }).getByRole("button", { name, exact: true });
  const row = (id: string) => dialog().locator(".handoff-row").filter({ hasText: first(id) });
  const rowBox = (id: string) => row(id).getByRole("checkbox");
  // Rows as the dialog shows them: the full body is the title, the first line the text.
  const rows = () => dialog().locator(".handoff-row").evaluateAll(nodes => nodes.map(node => ({
    body: node.querySelector(".handoff-body")?.getAttribute("title") ?? null,
    first: node.querySelector(".handoff-body")?.textContent ?? null,
    target: node.querySelector(".handoff-target")?.textContent ?? null,
    checked: (node.querySelector("input") as HTMLInputElement).checked,
    disabled: (node.querySelector("input") as HTMLInputElement).disabled,
  })));
  const checkedBodies = async () => (await rows()).filter(row => row.checked).map(row => row.body);
  const bodies = (...ids: string[]) => ids.map(id => body[id]);
  const preview = () => dialog().locator(".handoff-preview").textContent();
  const previewIds = async () => (JSON.parse((await preview() ?? "").split("\n").at(-1) ?? "{}") as { comments: string[] }).comments;
  const clipboard = () => app!.evaluate(({ clipboard }) => clipboard.readText());
  const clipboardJson = async () => JSON.parse((await clipboard()).split("\n").at(-1) ?? "{}") as { root: string; canvas: string; comments: string[] };
  const status = () => dialog().locator(".handoff-status");
  const focused = () => page.evaluate(() => { const node = document.activeElement as HTMLElement | null; return { tag: node?.tagName ?? null, text: node?.textContent?.trim() ?? null, className: node?.className ?? null }; });
  const isFocused = (locator: ReturnType<typeof headHandOff>) => locator.evaluate(node => node === document.activeElement);
  // The Tab stops from the focused control on, pressing the real Tab key between them.
  async function tabStops(count: number): Promise<string[]> {
    const stops: string[] = [];
    for (let index = 0; index < count; index++) {
      if (index > 0) await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        if (node instanceof HTMLInputElement && node.type === "checkbox") return `checkbox ${node.closest(".handoff-row")?.querySelector(".handoff-body")?.textContent ?? ""}`;
        return node?.textContent?.trim() ?? "";
      }));
    }
    return stops;
  }
  async function focusOn(check: () => Promise<boolean>, name: string): Promise<void> {
    await wait(check, name, 3_000).catch(async error => { throw new Error(`${name}: focus is ${JSON.stringify(await focused())} (${error instanceof Error ? error.message : String(error)})`); });
  }
  const agentResolve = async (...ids: string[]) => { for (const id of ids) assert.equal(JSON.parse((await exec(cli, ["comment", "resolve", id, "--agent", "codex", "--json", "--repo", repo], { env })).stdout).ok, true, `doan resolves ${id}`); };
  const addComment = (id: string) => appendFile(commentsFile(repo, "hand"), event("create", id, new Date().toISOString(), WRITER, { body: body[id], target: {}, canvasHash: STALE }) + "\n");
  const lines = async (project: string, canvasId: string) => (await readFile(commentsFile(project, canvasId), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as { type: string; comment: string; by: { name: string } });

  async function openCanvas(file: string, title: string, ready: string, where = repo): Promise<void> {
    if (await page.locator("header .repo").getAttribute("aria-label").catch(() => null) !== `${basename(where)} overview`) await enterProject(page, where);
    await page.mouse.move(700, 20);
    if (await page.getByRole("tooltip").isVisible()) await page.keyboard.press("Escape");
    await page.getByRole("tooltip").waitFor({ state: "hidden", timeout: 2_000 });
    await canvasRow(page, file).click();
    await wait(async () => await page.locator("header .canvas").textContent() === title && await frame().getByRole("button", { name: ready, exact: true }).count() === 1, `${title} shown`);
    await wait(async () => await cards().count() > 0 || await panel().locator(".comments-message").count() > 0, `${title} comments read`);
  }
  async function select(name: string, doanId: string): Promise<void> {
    await wait(async () => { await frame().getByRole("button", { name, exact: true }).click({ timeout: 2_000 }); return true; }, `click ${name}`);
    await wait(async () => (await selected())?.includes(doanId) ?? false, `${doanId} selected`);
  }
  async function clearSelection(): Promise<void> {
    if (await selected() === null) return;
    // Escape outside any text field: the controller ignores it in editable targets.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Escape");
    await wait(async () => await selected() === null, "selection cleared");
  }
  async function filterTo(group: "Comment scope" | "Comment status", name: RegExp): Promise<void> {
    if (await pressed(group, name) !== "true") await panel().getByRole("group", { name: group }).getByRole("button", { name }).click();
    await wait(async () => await pressed(group, name) === "true", `${group} ${name}`);
  }
  async function copyIs(text: string): Promise<void> {
    await wait(async () => await copyButton().textContent() === text, `button "${text}"`);
  }
  async function openHandOff(): Promise<void> {
    await headHandOff().click();
    await dialog().waitFor();
  }
  async function closed(): Promise<void> {
    await wait(async () => await dialog().count() === 0, "dialog closed");
  }
  // Holds main's clipboard write until the test settles it, so Copying… can be seen.
  async function holdClipboard(): Promise<void> {
    await app!.evaluate(({ clipboard }) => {
      const gate = { original: clipboard.writeText.bind(clipboard), release: null as null | ((fail: boolean) => Promise<void>) };
      Reflect.set(globalThis, "handoffClipboard", gate);
      clipboard.writeText = text => new Promise<void>((resolve, reject) => {
        gate.release = async fail => { gate.release = null; if (fail) reject(new Error("Injected clipboard failure")); else { await gate.original(text); resolve(); } };
      });
    });
  }
  async function releaseClipboard(fail: boolean): Promise<void> {
    await wait(() => app!.evaluate(() => typeof Reflect.get(globalThis, "handoffClipboard")?.release === "function"), "clipboard write pending");
    await app!.evaluate(async (_electron, fail) => { await Reflect.get(globalThis, "handoffClipboard").release(fail); }, fail);
  }
  async function restoreClipboardWrite(): Promise<void> {
    await app!.evaluate(({ clipboard }) => { const gate = Reflect.get(globalThis, "handoffClipboard"); if (gate) { clipboard.writeText = gate.original; Reflect.deleteProperty(globalThis, "handoffClipboard"); } });
  }
  // A failed scenario can leave the dialog, a gate or a Review behind; the next one starts clean.
  async function recover(): Promise<void> {
    await restoreClipboardWrite().catch(console.error);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await page.locator("dialog[open]").count()) {
        const dismiss = page.locator("dialog[open]").getByRole("button", { name: /^(Discard|Keep both|Cancel|Done)$/ });
        if (await dismiss.count() && await dismiss.first().isEnabled()) await dismiss.first().click().catch(console.error);
        else await page.keyboard.press("Escape");
        continue;
      }
      const review = panel().getByRole("region", { name: "Review", exact: true });
      if (await review.count()) { await review.getByRole("button", { name: "Close Review", exact: true }).click().catch(console.error); continue; }
      return;
    }
  }
  async function scenario(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
      console.log(`agent-handoff PASS: ${name}`);
    } catch (error) {
      console.error(`agent-handoff FAIL: ${name}`, error);
      failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      await shot(`failed-${name}`).catch(console.error);
      await recover().catch(console.error);
    }
  }

  await enterProject(page, repo);

  await scenario("1-dialog-preview-rows", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Open \d+$/);
    await wait(async () => await cards().count() === 5, "five open comments listed");
    const order = await cards().evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.comment!));
    const targets = await Promise.all(order.map(id => card(id).locator(".comments-target").textContent()));
    assert.equal(await handedOff().count(), 0, "nothing handed off yet");
    await openHandOff();
    assert.equal(await dialog().locator("h3").textContent(), "Hand off to your agent");
    assert.equal(await dialog().locator(".handoff-context").textContent(), "proj › ⎇ main › Hand canvas");
    // Same order and target lines as the Canvas list; only the first line shows, the title holds it all.
    assert.deepEqual(await rows(), order.map((id, index) => ({ body: body[id], first: first(id), target: targets[index], checked: true, disabled: false })));
    assert.deepEqual(order, [h.h1, h.h2, h.h3, h.h4, h.h5], "fold order");
    assert.equal(await row(h.h5).locator(".handoff-body").evaluate(node => node.scrollWidth > node.clientWidth), true, "a long line is cut to one line");
    await copyIs("Copy 5");
    await focusOn(() => isFocused(copyButton()), "focus starts on Copy 5");
    assert.equal(await quick("Selection").isDisabled(), true, "Selection needs a selection");
    assert.equal(await quick("Selection").getAttribute("title"), "Select an element or frame on the canvas first.");
    assert.equal(await dialog().locator(".handoff-notice").count(), 0, "one worktree: no notice");
    const instruction = dialog().locator("details.handoff-instruction");
    assert.equal(await instruction.evaluate(node => (node as HTMLDetailsElement).open), false, "instruction starts folded");
    await instruction.getByText("Show instruction", { exact: true }).click();
    await wait(() => dialog().locator(".handoff-preview").isVisible(), "instruction shown");
    const text = (await preview())!.split("\n");
    assert.equal(text.length, 2);
    assert.ok(text[0]!.startsWith(INSTRUCTION_START), text[0]);
    assert.deepEqual(JSON.parse(text[1]!), { root: repo, canvas: "hand", comments: [h.h1, h.h2, h.h3, h.h4, h.h5] });
    await shot("1a-dialog");
    // The tick is 5×10 inside its 2px strokes (7×12 drawn); the global border-box reset must not shrink it.
    assert.deepEqual(await rowBox(h.h1).evaluate(box => { const tick = getComputedStyle(box, "::before"); return [tick.boxSizing, tick.width, tick.height]; }), ["content-box", "5px", "10px"], "checkbox tick keeps its drawn size");

    await rowBox(h.h3).click();
    await copyIs("Copy 4");
    assert.deepEqual(await checkedBodies(), bodies(h.h1, h.h2, h.h4, h.h5));
    assert.deepEqual(await previewIds(), [h.h1, h.h2, h.h4, h.h5], "the preview follows the checks");
    await quick("None").click();
    await copyIs("Copy 0");
    assert.equal(await copyButton().isDisabled(), true, "nothing to copy");
    await dialog().getByText("Choose at least one comment.", { exact: true }).waitFor();
    assert.equal(await dialog().locator(".handoff-preview").count(), 0, "no preview without checks");
    await shot("1b-none-checked");
    await quick("All").click();
    await copyIs("Copy 5");
    assert.equal(await dialog().getByText("Choose at least one comment.", { exact: true }).count(), 0);
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    await closed();
    await focusOn(() => isFocused(headHandOff()), "focus back on the head's Hand off…");
    assert.equal(await handedOff().count(), 0, "Cancel hands nothing off");
  });

  await scenario("2-selection-fix-this-home", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    const inspector = page.getByRole("region", { name: "Inspector", exact: true });
    const hint = inspector.getByText("Your agent can read this selection — say “fix this”.", { exact: true });
    assert.equal(await hint.count(), 0, "no hint without a selection");
    await select("Alpha", "alpha");
    await hint.waitFor();
    await shot("2a-fix-this-hint");
    await openHandOff();
    assert.equal(await quick("Selection").isEnabled(), true);
    await quick("Selection").click();
    await copyIs("Copy 2");
    assert.deepEqual(await checkedBodies(), bodies(h.h1, h.h2), "Selection checks the selected element's comments");
    await shot("2b-selection-quick-select");
    await page.keyboard.press("Escape");
    await closed();

    await select("Empty target", "empty");
    await openHandOff();
    assert.equal(await quick("Selection").isDisabled(), true, "nothing open on the selection");
    assert.equal(await quick("Selection").getAttribute("title"), "No open comments on Element · button empty · in Main.");
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    await closed();

    await goHome(page);
    await homeRow(page, repo).getByText(/^Selected for your agent: /).waitFor();
    await shot("2c-home-selected");
    await enterProject(page, repo);
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    await wait(async () => await hint.count() === 0, "hint gone with the selection");
  });

  await scenario("3-keyboard-and-clipboard", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    // A selection with comments, so Selection is enabled and a Tab stop.
    await select("Alpha", "alpha");
    // The dialog keeps the selection's anchor as it was at open; the anchor reply
    // lands ~30 ms after the Inspector shows the selection, when the panel lists it.
    await wait(async () => await pressed("Comment scope", /^Selection$/) === "true" && await cards().count() === 2, "the panel lists Alpha's comments");
    await headHandOff().focus();
    await page.keyboard.press("Enter");
    await dialog().waitFor();
    await focusOn(() => isFocused(copyButton()), "focus on Copy 5");
    await quick("All").focus();
    assert.deepEqual(await tabStops(11), ["All", "None", "Selection", ...[h.h1, h.h2, h.h3, h.h4, h.h5].map(id => `checkbox ${first(id)}`), "Show instruction", "Cancel", "Copy 5"], "Tab order");
    // Return on a focused button or summary is that control's, not Copy's.
    await quick("None").focus();
    await page.keyboard.press("Enter");
    await copyIs("Copy 0");
    await quick("All").focus();
    await page.keyboard.press("Enter");
    await copyIs("Copy 5");
    await dialog().locator(".handoff-instruction summary").focus();
    await page.keyboard.press("Enter");
    await wait(() => dialog().locator(".handoff-preview").isVisible(), "Return on the summary shows the instruction");
    await holds(async () => await dialog().count() === 1 && await status().count() === 0 && await copyButton().textContent() === "Copy 5", "Return on a button or the summary does not copy", 500);
    await rowBox(h.h1).focus();
    await page.keyboard.press("Space");
    await copyIs("Copy 4");
    await page.keyboard.press("Space");
    await copyIs("Copy 5");
    const shown = await preview();
    // Return from a checkbox presses Copy, the default button.
    await page.keyboard.press("Enter");
    await wait(async () => await status().textContent() === "Copied an instruction for 5 comments. Paste it into your Claude Code or Codex session.", "copied line");
    assert.equal(await status().getAttribute("role"), "status");
    await focusOn(async () => await isFocused(copyButton()) && await copyButton().textContent() === "Done", "focus on Done");
    assert.equal(await clipboard(), shown, "the clipboard holds the preview text");
    assert.equal(await dialog().getByRole("button", { name: "Cancel", exact: true }).count(), 0, "only Done after a copy");
    assert.ok((await rows()).every(row => row.checked && row.disabled), "the copied set stays as a record");
    assert.equal(await quick("All").isDisabled(), true);
    await wait(async () => /^Handed off 5 · \d\d:\d\d:\d\d$/.test(await handedOff().textContent() ?? ""), "Handed off 5");
    await shot("3a-copied");
    await page.keyboard.press("Escape");
    await closed();
    await focusOn(() => isFocused(headHandOff()), "Escape restores focus to the head's Hand off…");

    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    const handed = await handedOff().textContent();
    const opener = card(h.h3).getByRole("button", { name: "Hand off…", exact: true });
    await opener.click();
    await dialog().waitFor();
    assert.deepEqual(await checkedBodies(), bodies(h.h3), "a card's Hand off… checks only that comment");
    await copyIs("Copy 1");
    await page.keyboard.press("Escape");
    await closed();
    await focusOn(() => isFocused(opener), "Escape restores focus to the card's Hand off…");
    assert.equal(await handedOff().textContent(), handed, "closing without a copy keeps Handed off");
  });

  await scenario("4-copying-and-clipboard-failure", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    const handed = await handedOff().textContent();
    await openHandOff();
    await rowBox(h.h4).click();
    await copyIs("Copy 4");
    await holdClipboard();
    try {
      await copyButton().click();
      await copyIs("Copying…");
      assert.equal(await copyButton().isDisabled(), true);
      assert.equal(await dialog().getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
      assert.ok((await rows()).every(row => row.disabled), "checks fixed while copying");
      assert.equal(await dialog().getAttribute("aria-busy"), "true");
      await shot("4a-copying");
      await releaseClipboard(true);
      const alert = dialog().getByRole("alert");
      await wait(async () => await alert.textContent() === COPY_FAILED, "copy failure alert");
      await copyIs("Retry copy");
      assert.deepEqual(await checkedBodies(), bodies(h.h1, h.h2, h.h3, h.h5), "checks kept after a failure");
      assert.ok((await rows()).every(row => !row.disabled));
      assert.equal(await handedOff().textContent(), handed, "a failed copy leaves Handed off alone");
      await shot("4b-copy-failed");
      await copyButton().click();
      await releaseClipboard(false);
    } finally { await restoreClipboardWrite(); }
    await wait(async () => await status().textContent() === "Copied an instruction for 4 comments. Paste it into your Claude Code or Codex session.", "copied after Retry copy");
    assert.deepEqual((await clipboardJson()).comments, [h.h1, h.h2, h.h3, h.h5]);
    await wait(async () => /^Handed off 4 · /.test(await handedOff().textContent() ?? ""), "Handed off 4");
    await copyButton().click();
    await closed();
  });

  await scenario("5-resolved-while-open", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Open \d+$/);
    const handed = await handedOff().textContent();
    const before = await clipboard();
    await openHandOff();
    await copyIs("Copy 5");
    await agentResolve(h.h5);
    await addComment(n1);
    await wait(async () => await card(n1).count() === 1 && await card(h.h5).count() === 0, "the panel read the agent's resolve and the new comment");
    await holds(async () => (await rows()).length === 5 && await copyButton().textContent() === "Copy 5", "rows stay fixed while the dialog is open", 500);
    await copyButton().click();
    await wait(async () => await dialog().getByRole("alert").textContent() === "1 comment is no longer open and was removed from the list. Review and copy again.", "refused copy line");
    assert.deepEqual((await rows()).map(row => [row.body, row.checked]), [[body[h.h1], true], [body[h.h2], true], [body[h.h3], true], [body[h.h4], true], [body[n1], false]], "the resolved row leaves, the new one joins unchecked");
    await copyIs("Copy 4");
    assert.equal(await clipboard(), before, "a refused copy writes nothing");
    assert.equal(await handedOff().textContent(), handed, "a refused copy leaves Handed off alone");
    await shot("5a-no-longer-open");
    await copyButton().click();
    await wait(async () => await copyButton().textContent() === "Done", "copied the remaining four");
    assert.deepEqual(await clipboardJson(), { root: repo, canvas: "hand", comments: [h.h1, h.h2, h.h3, h.h4] });
    await copyButton().click();
    await closed();
  });

  await scenario("6-handed-off-lifecycle", async () => {
    await openCanvas("hand.html", "Hand canvas", "Alpha");
    await clearSelection();
    await filterTo("Comment scope", /^Canvas$/);
    await filterTo("Comment status", /^Open \d+$/);
    await wait(async () => /^Handed off 4 · /.test(await handedOff().textContent() ?? ""), "Handed off 4 to start");
    await addComment(n2);
    await wait(async () => await card(n2).count() === 1, "new comment read");
    await holds(async () => /^Handed off 4 · /.test(await handedOff().textContent() ?? ""), "a new comment keeps Handed off");
    await agentResolve(h.h1);
    await wait(async () => await card(h.h1).count() === 0, "first resolve read");
    await holds(async () => /^Handed off 4 · /.test(await handedOff().textContent() ?? ""), "a partial resolve keeps Handed off");
    await shot("6a-partly-resolved");
    await agentResolve(h.h2, h.h3, h.h4);
    await wait(async () => await handedOff().count() === 0, "Handed off cleared once every handed-off comment is resolved");
    await shot("6b-all-resolved");

    await filterTo("Comment status", /^Resolved \d+$/);
    await wait(async () => await cards().count() === 6, "six resolved comments");
    assert.equal(await cards().getByRole("button", { name: "Hand off…", exact: true }).count(), 0, "resolved cards have no Hand off…");
    await filterTo("Comment status", /^Open \d+$/);
    await wait(async () => await cards().count() === 2, "two open comments");
    assert.equal(await cards().getByRole("button", { name: "Hand off…", exact: true }).count(), 2, "every open card has Hand off…");
  });

  await scenario("7-review-done-hand-off", async () => {
    await openCanvas("review.html", "Review canvas", "Review row");
    await clearSelection();
    await agentResolve(v[0]!, v[1]!, v[2]!);
    const notice = panel().locator(".review-banner:not([role=status]) .text");
    await wait(async () => await notice.textContent() === "3 resolved", "review notice", 15_000);
    const bar = panel().getByRole("region", { name: "Review", exact: true });
    await panel().getByRole("button", { name: "Review", exact: true }).click();
    await wait(async () => await bar.getByRole("status").textContent() === "Review 1 of 3", "Review 1 of 3");
    await bar.getByRole("button", { name: "Reopen", exact: true }).click();
    await bar.getByText("Reopened", { exact: true }).waitFor();
    await bar.getByRole("button", { name: "Next", exact: true }).click();
    await wait(async () => await bar.getByRole("status").textContent() === "Review 2 of 3", "Review 2 of 3");
    await bar.getByRole("button", { name: "Next", exact: true }).click();
    await wait(async () => await bar.getByRole("status").textContent() === "Review 3 of 3", "Review 3 of 3");
    await bar.getByRole("button", { name: "Done", exact: true }).click();
    const summary = panel().locator(".review-banner[role=status]");
    await wait(async () => await summary.locator(".text").textContent() === "Reviewed 3 · Reopened 1", "Done summary");
    const reopened = (await lines(repo, "review")).filter(line => line.type === "reopen").map(line => line.comment);
    assert.equal(reopened.length, 1, "one reopen written");
    const handOff = summary.getByRole("button", { name: "Hand off…", exact: true });
    await focusOn(() => isFocused(handOff), "focus on the summary's Hand off…");
    await shot("7a-done-summary");
    await page.keyboard.press("Enter");
    await dialog().waitFor();
    const reopenedBody = `Review note ${v.indexOf(reopened[0]!) + 1}`;
    assert.deepEqual((await rows()).map(row => [row.body, row.checked]).sort(), [[reopenedBody, true], ["Review note 4", false]].sort(), "the reopened comment is checked, the other open one is not");
    await copyIs("Copy 1");
    await page.keyboard.press("Enter");
    await wait(async () => await status().textContent() === "Copied an instruction for 1 comment. Paste it into your Claude Code or Codex session.", "singular copied line");
    assert.deepEqual((await clipboardJson()).comments, reopened);
    await wait(async () => /^Handed off 1 · /.test(await handedOff().textContent() ?? ""), "Handed off 1");
    await shot("7b-reopened-handed-off");
    await copyButton().click();
    await closed();
  });

  await scenario("8-worktree-notice", async () => {
    await openCanvas("wt.html", "Wt canvas", "Only target", wtRepo);
    await clearSelection();
    await openHandOff();
    assert.equal(await dialog().locator(".handoff-context").textContent(), "wt › ⎇ main › Wt canvas");
    assert.equal(await dialog().locator(".handoff-notice").textContent(), `Comments are per worktree. Your agent should work in main (${wtRepo}).`);
    // The notice is static text, not a Tab stop; Selection is disabled without a selection.
    await quick("All").focus();
    assert.deepEqual(await tabStops(6), ["All", "None", "checkbox Worktree note", "Show instruction", "Cancel", "Copy 1"], "Tab order with the notice");
    await shot("8a-worktree-notice");
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    await closed();
    // The second worktree only shows in the notice; no comment moves to it.
    assert.equal((await lines(wtRepo, "wt")).length, 1);
  });

  await app.evaluate(restoreClipboard);
  clipboardSaved = false;
  const child = app.process();
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  await closeApp(app); app = undefined;
  assert.deepEqual(await exited, { code: 0, signal: null }, "quit exits cleanly");
} catch (error) {
  console.error(error);
  failures.push(`setup: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  if (app) { await page?.screenshot({ path: join(shots, "failure.png") }).catch(console.error); }
} finally {
  try { if (app && clipboardSaved) await app.evaluate(restoreClipboard); }
  finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await guard.finish();
  }
}

if (failures.length) throw new Error(`agent-handoff failures:\n${failures.join("\n")}`);
console.log("agent-handoff: PASS");
