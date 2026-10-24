// Actual App interactions, isolated like runtime.ts; no presentation adapter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron, type ElectronApplication } from "playwright";
const { canvasRow, frameRows }: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);
const { homeRow, goHome, requestProject, enterProject, removeHomeProject }: typeof import("./home") = await import(new URL("./home.ts", import.meta.url).href);
const { appWindow }: typeof import("./windows") = await import(new URL("./windows.ts", import.meta.url).href);

const root = fileURLToPath(new URL("../..", import.meta.url));
const shots = join(root, ".scratch/U2/runtime");
const paths = ["folders.json", "runtime.json"].map(n => join(homedir(), "Library/Application Support/doan", n));
const fingerprint = (p: string) => readFile(p).then(b => createHash("sha256").update(b).digest("hex"), () => "absent");
const before = await Promise.all(paths.map(fingerprint));
const work = await realpath(await mkdtemp("/tmp/doan-comments-ui-"));
const exec = promisify(execFile);
async function waitGate(check: () => Promise<boolean>) {
  const until = Date.now() + 10_000;
  let lastError: unknown;
  for (;;) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    if (Date.now() >= until) throw lastError ?? new Error("Timed out waiting for the controlled IPC gate");
    // A canvas rewrite can detach the frame between locator resolution and evaluation.
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
let app: ElectronApplication | undefined;
let clipboardSaved = false;
try {
  const repo = join(work, "repo"), userData = join(work, "userData"), cli = join(work, "doan");
  await mkdir(join(repo, ".doan"), { recursive: true }); await mkdir(join(repo, "design")); await mkdir(userData); await mkdir(shots, { recursive: true });
  await writeFile(join(repo, ".doan/config.json"), '{"v":1}');
  await exec("git", ["init", repo]); await exec("git", ["-C", repo, "config", "user.name", "UI Author"]); await exec("git", ["-C", repo, "config", "user.email", "ui@example.test"]);
  const html = (id: string) => `<!doctype html><title>${id}</title><meta name="doan:canvas" content="${id}"><meta name="doan:width" content="800"><style>body{margin:0;min-height:700px;background:#eee}section{margin:50px;width:400px;height:230px;background:#ccc;padding:20px}button{margin:30px;padding:20px}a{display:block;margin:20px}</style><section data-doan-frame="hero" data-doan-id="hero"><button data-doan-id="child">Child target</button></section><a href="b.html">Other canvas</a>`;
  await writeFile(join(repo, "design/a.html"), html("a")); await writeFile(join(repo, "design/b.html"), html("b"));
  const originRepo = join(work, "origin"), destinationRepo = join(work, "destination");
  for (const project of [originRepo, destinationRepo]) {
    await mkdir(join(project, ".doan"), { recursive: true }); await mkdir(join(project, "design"));
    await writeFile(join(project, ".doan/config.json"), '{"v":1}');
    await writeFile(join(project, "design/shared.html"), html("shared"));
    await exec("git", ["init", project]); await exec("git", ["-C", project, "config", "user.name", "Boundary Author"]);
    await exec("git", ["-C", project, "config", "user.email", "boundary@example.test"]);
  }
  await writeFile(join(userData, "folders.json"), JSON.stringify([repo, originRepo, destinationRepo]));
  await exec("go", ["build", "-o", cli, "./cli/cmd/doan"], { cwd: root });
  const home = join(work, "home"), fakeShell = join(work, "fake-shell");
  await mkdir(home);
  await writeFile(fakeShell, '#!/bin/sh\nPATH=/usr/bin:/bin; export PATH\neval "$2"\n', { mode: 0o755 });
  await writeFile(join(userData, "onboarding.json"), "{}\n");
  app = await _electron.launch({ args: [join(root, "app"), `--user-data-dir=${userData}`], env: { ...process.env,
    HOME: home, TMPDIR: work, SHELL: fakeShell, CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex"),
    DOAN_CLI: cli, DOAN_RUNTIME: join(userData, "runtime.json") } });
  await app.evaluate(async ({ clipboard, ClipboardItem }) => { const items = await clipboard.read(); Reflect.set(globalThis, "savedClipboardU2", await Promise.all(items.map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))))); });
  clipboardSaved = true;
  const page = await app.firstWindow(); page.setDefaultTimeout(10_000);
  page.on("pageerror", error => console.error("pageerror", error));
  const panel = page.getByRole("region", { name: "Comments", exact: true });
  const cards = panel.getByRole("article");
  const presentationFailures: string[] = [];
  function presentation(name: string, actual: unknown, expected: unknown) {
    try { assert.deepEqual(actual, expected); }
    catch { presentationFailures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  }
  const shot = async (name: string) => { await page.screenshot({ path: join(shots, `${name}.png`) }); console.log(`comments-ui: ${name} PASS`); };
  // Equal canvas IDs and paths must never collapse identity across project roots.
  // Both rows read the same; the top bar's project button says which root they belong to.
  const originRow = canvasRow(page, "shared.html");
  const destinationRow = canvasRow(page, "shared.html");
  const inProject = (name: string) => waitGate(async () => await page.locator("header .repo").getAttribute("aria-label") === `${name} overview`);
  const boundaryBody = panel.getByRole("textbox", { name: "New comment body" });
  const boundaryDialog = page.getByRole("dialog");
  const originLog = join(originRepo, ".doan/comments/shared.jsonl");
  const destinationLog = join(destinationRepo, ".doan/comments/shared.jsonl");
  const logBytes = (path: string) => readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
  await enterProject(page, originRepo);
  await inProject("origin"); await originRow.click();
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).click();
  const unicodeBody = '원래 대상 🧪 e\u0301 <img src=x onerror="window.HOSTILE=true">';
  await boundaryBody.fill(unicodeBody);
  presentation("Comments heading weight", await panel.getByRole("heading", { name: "Comments", exact: true }).evaluate(el => getComputedStyle(el).fontWeight), "700");
  presentation("Comment action layout", await panel.getByRole("button", { name: "Save comment", exact: true }).evaluate(el => {
    const s = getComputedStyle(el); return [s.display, s.gap, s.whiteSpace, s.alignItems];
  }), ["flex", "6px", "nowrap", "center"]);
  presentation("Editor target spacing", await panel.locator("label").evaluate(el => {
    const range = document.createRange(); range.selectNode(el.firstChild!);
    return Math.round(el.querySelector(".comments-target")!.getBoundingClientRect().top - range.getBoundingClientRect().bottom);
  }), 8);
  const originFrame = await page.locator("iframe").elementHandle(); assert.ok(originFrame);
  await requestProject(page, destinationRepo); await boundaryDialog.waitFor();
  presentation("Unsaved dialog width", await boundaryDialog.evaluate(el => el.getBoundingClientRect().width), 410);
  presentation("Unsaved dialog heading weight", await boundaryDialog.getByRole("heading").evaluate(el => getComputedStyle(el).fontWeight), "700");
  assert.equal(await originFrame.evaluate(el => el.isConnected), true);
  await boundaryDialog.getByRole("button", { name: "Keep writing", exact: true }).click();
  assert.equal(await boundaryBody.inputValue(), unicodeBody);
  await inProject("origin"); assert.equal(await originRow.evaluate(row => row.classList.contains("is-open")), true);
  assert.equal(await logBytes(originLog), ""); assert.equal(await logBytes(destinationLog), "");
  await shot("00a-cross-root-continue");
  await requestProject(page, destinationRepo); await boundaryDialog.getByRole("button", { name: "Save and continue", exact: true }).click();
  await inProject("destination"); await destinationRow.click();
  await waitGate(async () => await destinationRow.evaluate(row => row.classList.contains("is-open")));
  await panel.getByText("No open comments here", { exact: true }).waitFor();
  const savedBytes = await logBytes(originLog), saved = JSON.parse(savedBytes.trim());
  assert.equal(saved.body, unicodeBody); assert.deepEqual(saved.target, {}); assert.equal(saved.by.kind, "human");
  assert.equal(await logBytes(destinationLog), "");
  const cliRead = JSON.parse((await exec(cli, ["comments", "--canvas", "shared", "--repo", originRepo, "--json"])).stdout);
  assert.equal(cliRead.result.comments[0].body, unicodeBody);
  await enterProject(page, originRepo);
  await inProject("origin"); await originRow.click(); await cards.filter({ hasText: unicodeBody }).waitFor();
  assert.equal(await cards.locator("img").count(), 0); assert.equal(await page.evaluate(() => Reflect.get(window, "HOSTILE")), undefined);
  const roundTripFrame = await page.locator("iframe").elementHandle(); assert.ok(roundTripFrame);
  await exec(cli, ["comment", "resolve", saved.comment, "--agent", "codex", "--repo", originRepo, "--json"]);
  await panel.getByRole("button", { name: /^Resolved 1$/ }).click();
  await cards.filter({ hasText: unicodeBody }).getByRole("button", { name: "Reopen", exact: true }).waitFor();
  assert.equal(await roundTripFrame.evaluate(el => el.isConnected), true, "CLI resolve retained iframe");
  assert.ok((await logBytes(originLog)).startsWith(savedBytes), "CLI append preserved human create bytes");
  await shot("00b-cross-root-save-cli-roundtrip");
  await panel.getByRole("button", { name: /^Open 0$/ }).click();
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).click(); await boundaryBody.fill("Discard across roots");
  const beforeDiscard = await logBytes(originLog);
  await requestProject(page, destinationRepo); await boundaryDialog.getByRole("button", { name: "Discard", exact: true }).click();
  await inProject("destination"); await destinationRow.click();
  await waitGate(async () => await destinationRow.evaluate(row => row.classList.contains("is-open")));
  assert.equal(await boundaryBody.count(), 0); assert.equal(await logBytes(originLog), beforeDiscard); assert.equal(await logBytes(destinationLog), "");
  await shot("00c-cross-root-discard");
  // Existing management is independent of whether its saved DOM target survives.
  await page.frameLocator("iframe").getByRole("button", { name: "Child target" }).click();
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await boundaryBody.fill("Missing DOM target");
  await panel.getByRole("button", { name: "Save comment", exact: true }).click(); await cards.filter({ hasText: "Missing DOM target" }).waitFor();
  const targetBytes = await logBytes(destinationLog), targetEvent = JSON.parse(targetBytes.trim());
  await writeFile(join(destinationRepo, "design/shared.html"), html("shared").replace('<button data-doan-id="child">Child target</button>', ""));
  await waitGate(async () => await page.frameLocator("iframe").locator("section").evaluate(el => el.childElementCount === 0));
  assert.equal(await page.frameLocator("iframe").getByRole("button", { name: "Child target" }).count(), 0);
  await panel.getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Canvas", exact: true }).click();
  await cards.getByText("Location unavailable", { exact: true }).waitFor();
  await cards.getByText("Outdated", { exact: true }).waitFor();
  await cards.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("textbox", { name: "Your unsaved edit body" }).fill("Edited missing target"); await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await cards.filter({ hasText: "Edited missing target" }).waitFor();
  const afterMissing = await logBytes(destinationLog); assert.ok(afterMissing.startsWith(targetBytes));
  const missingRead = JSON.parse((await exec(cli, ["comments", "--canvas", "shared", "--repo", destinationRepo, "--json"])).stdout).result.comments[0];
  assert.deepEqual(missingRead.target, targetEvent.target); assert.equal(missingRead.canvasHash, targetEvent.canvasHash);
  await cards.getByRole("button", { name: "Copy", exact: true }).click(); await cards.getByRole("button", { name: "Copied", exact: true }).waitFor();
  await shot("00d-missing-dom-management");
  // Invalid or duplicated canvas IDs block writes without changing saved bytes.
  const blocked = panel.getByRole("alert").filter({ hasText: "A valid, unique canvas ID is required." });
  for (const invalid of [html("BAD_ID"), html("shared").replace('<meta name="doan:canvas" content="shared">', "")]) {
    await writeFile(join(destinationRepo, "design/shared.html"), invalid); await blocked.waitFor();
    assert.equal(await panel.getByRole("button", { name: /^New (canvas|selection) comment$/ }).isDisabled(), true);
    assert.equal(await logBytes(destinationLog), afterMissing);
  }
  await writeFile(join(destinationRepo, "design/shared.html"), html("shared"));
  await blocked.waitFor({ state: "hidden" });
  await writeFile(join(destinationRepo, "design/duplicate.html"), html("shared"));
  await panel.getByRole("alert").filter({ hasText: "Canvas identity is missing, changed or duplicated." }).first().waitFor();
  assert.equal(await panel.getByRole("button", { name: /^New (canvas|selection) comment$/ }).isDisabled(), true);
  assert.equal(await logBytes(destinationLog), afterMissing);
  await shot("00e-invalid-duplicate-id");

  await enterProject(page, repo);
  await canvasRow(page, "a.html").click();
  await page.waitForFunction(() => !!document.querySelector("iframe")?.contentWindow);
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === "New canvas comment" && !b.disabled));
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).click();
  const createBody = panel.getByRole("textbox", { name: "New comment body" });
  await createBody.fill('<script>window.HOSTILE = true</script> Canvas note');
  await panel.getByRole("button", { name: "Save comment", exact: true }).click();
  await cards.filter({ hasText: "Canvas note" }).waitFor();
  assert.equal(await page.evaluate(() => Reflect.get(window, "HOSTILE")), undefined);
  assert.equal(await cards.locator("script").count(), 0);
  await shot("01-create-text");
  const originalFrame = await page.locator("iframe").elementHandle(); assert.ok(originalFrame);
  await cards.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("textbox", { name: "Your unsaved edit body" }).fill("Edited canvas note");
  await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await cards.filter({ hasText: "Edited canvas note" }).waitFor();
  assert.equal(await originalFrame.evaluate(el => el.isConnected), true, "comment-only edit retained iframe");
  await cards.getByRole("button", { name: "Resolve", exact: true }).click();
  await panel.getByRole("button", { name: /^Resolved 1$/ }).click();
  await cards.getByRole("button", { name: "Reopen", exact: true }).waitFor();
  assert.equal(await cards.getByRole("button", { name: "Copy", exact: true }).isDisabled(), true);
  await cards.getByRole("button", { name: "Reopen", exact: true }).click();
  await panel.getByRole("button", { name: /^Open 1$/ }).click();
  await cards.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await shot("02-edit-resolve-reopen");
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Child target" }).click();
  await panel.getByRole("button", { name: "New selection comment", exact: true }).waitFor();
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click();
  await createBody.fill("Child note");
  await canvasRow(page, "b.html").click();
  const dialog = page.getByRole("dialog"); await dialog.waitFor();
  assert.equal(await page.locator("iframe").getAttribute("title"), "design/a.html");
  await dialog.getByRole("button", { name: "Keep writing", exact: true }).click();
  await createBody.waitFor(); assert.equal(await createBody.inputValue(), "Child note");
  await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
  await canvasRow(page, "b.html").click();
  await dialog.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("iframe")?.title === "design/b.html");
  await canvasRow(page, "a.html").click();
  await panel.getByRole("button", { name: /^Open 2$/ }).waitFor();
  await frame.getByRole("button", { name: "Child target" }).click();
  await cards.filter({ hasText: "Child note" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".comments-card").length === 1 && document.querySelector(".comments-card")?.textContent?.includes("Child note"));
  assert.equal(await cards.count(), 1, "selection excludes canvas comment");
  await cards.getByRole("button", { name: "Copy", exact: true }).click();
  await cards.getByRole("button", { name: "Copied", exact: true }).waitFor();
  let copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  const one = JSON.parse(copied.split("\n").at(-1) ?? "{}"); assert.equal(one.comments.length, 1);
  await panel.getByRole("button", { name: "Copy all open", exact: true }).click();
  await panel.getByText("Copied all open comments on this canvas.", { exact: true }).waitFor();
  copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  const all = JSON.parse(copied.split("\n").at(-1) ?? "{}"); assert.equal(all.comments.length, 2); assert.equal(all.root, repo);
  await shot("03-original-target-and-copy-scopes");
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("Discard me");
  await frame.locator("section").click({ position: { x: 350, y: 170 } });
  await dialog.waitFor(); assert.equal(await page.getByRole("region", { name: "Inspector", exact: true }).locator("h3").first().textContent(), "button");
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("region", { name: "Inspector", exact: true }).getByRole("heading", { name: "hero", exact: true }).waitFor();
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("Frame note"); await panel.getByRole("button", { name: "Save comment", exact: true }).click();
  await cards.filter({ hasText: "Frame note" }).waitFor(); assert.equal(await cards.count(), 1, "frame selection excludes child");
  await shot("04-preselection-discard");
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("Reload protected");
  await page.getByRole("button", { name: "Reload canvas", exact: true }).click(); await dialog.waitFor();
  await dialog.press("Escape"); await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
  assert.equal(await createBody.inputValue(), "Reload protected");
  const beforeConfirmedReload = await page.locator("iframe").elementHandle(); assert.ok(beforeConfirmedReload);
  await page.getByRole("button", { name: "Reload canvas", exact: true }).click(); await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("textarea"));
  await waitGate(async () => !await beforeConfirmedReload.evaluate(el => el.isConnected));
  // Reanchoring publishes Selection again; choose Canvas only after that reply.
  await page.waitForFunction(() => { const mark = document.querySelector<HTMLElement>(".overlay > .mark.selected"); return !!mark && !mark.hidden; });
  await panel.getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Canvas", exact: true }).click();
  await panel.getByRole("button", { name: /^Open 3$/ }).waitFor();
  await shot("05-reload-continue-discard");
  // External edits flow through the watcher without replacing the document.
  const file = join(repo, ".doan/comments/a.jsonl");
  const bytes = await readFile(file, "utf8"); const events = bytes.trim().split("\n").map(line => JSON.parse(line));
  const canvasId = events.find(e => e.type === "create" && !e.target.frame && !e.target.element).comment;
  const canvasCard = cards.filter({ hasText: "Edited canvas note" }); await canvasCard.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("textbox", { name: "Your unsaved edit body" }).fill("My concurrent edit");
  await writeFile(file, bytes + JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, type: "edit", comment: canvasId, body: "External body", by: { kind: "human", name: "External" }, at: new Date(Date.now() + 1000).toISOString() }) + "\n");
  await panel.getByText("This comment changed elsewhere", { exact: true }).waitFor();
  await panel.getByRole("button", { name: "Read latest state", exact: true }).click();
  await panel.getByRole("button", { name: "Save reviewed changes", exact: true }).click();
  await cards.filter({ hasText: "My concurrent edit" }).waitFor();
  await shot("06-external-conflict");
  // Width-only invalidity retains existing management and copy.
  await writeFile(join(repo, "design/a.html"), html("a").replace('<meta name="doan:width" content="800">', ""));
  await panel.getByText("Missing or invalid board width.", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: "New canvas comment", exact: true }).isDisabled(), true);
  const manage = cards.filter({ hasText: "My concurrent edit" });
  assert.equal(await manage.getByRole("button", { name: "Edit", exact: true }).isEnabled(), true);
  await manage.getByRole("button", { name: "Edit", exact: true }).click(); await panel.getByRole("textbox", { name: "Your unsaved edit body" }).fill("Managed without width"); await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await cards.filter({ hasText: "Managed without width" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^\d+ open comments?$/ }).count(), 0, "invalid width hides pins");
  const widthCard = cards.filter({ hasText: "Managed without width" });
  await widthCard.getByRole("button", { name: "Copy", exact: true }).click(); await widthCard.getByRole("button", { name: "Copied", exact: true }).waitFor();
  await panel.getByTitle("All open comments on this canvas, regardless of the visible filter", { exact: true }).click();
  await panel.getByText("Copied all open comments on this canvas.", { exact: true }).waitFor();
  await widthCard.getByRole("button", { name: "Resolve", exact: true }).click();
  await panel.getByRole("button", { name: /^Resolved 1$/ }).click();
  await widthCard.getByRole("button", { name: "Reopen", exact: true }).click();
  await panel.getByRole("button", { name: /^Open 3$/ }).click();
  await widthCard.getByRole("button", { name: "Edit", exact: true }).waitFor();
  const beforeDelete = await readFile(file, "utf8");
  await cards.filter({ hasText: "Managed without width" }).getByRole("button", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete this comment?", exact: true });
  await deletion.waitFor(); assert.equal(await readFile(file, "utf8"), beforeDelete, "initial Delete click does not append");
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await readFile(file, "utf8"), beforeDelete, "cancelled delete does not append");
  await cards.filter({ hasText: "Managed without width" }).getByRole("button", { name: "Delete", exact: true }).click();
  await deletion.getByRole("button", { name: "Delete comment", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".comments-card")].some(card => card.textContent?.includes("Managed without width")));
  assert.equal((await readFile(file, "utf8")).trim().split("\n").length, beforeDelete.trim().split("\n").length + 1);
  await shot("07-width-management-delete");
  await writeFile(join(repo, "design/a.html"), html("a"));
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "New canvas comment" && !b.disabled));
  // Missing local identity, followed by a real git-config change and Retry.
  await exec("git", ["-C", repo, "config", "user.name", ""]);
  await canvasRow(page, "b.html").click();
  await panel.getByText("Set your Git name", { exact: true }).waitFor();
  presentation("Recovery button line height", await panel.getByRole("button", { name: "Retry", exact: true }).evaluate(el => getComputedStyle(el).lineHeight), "normal");
  assert.equal(await panel.getByRole("button", { name: "New canvas comment", exact: true }).isDisabled(), true);
  await exec("git", ["-C", repo, "config", "user.name", "UI Author"]);
  await panel.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "New canvas comment" && !b.disabled));
  await canvasRow(page, "a.html").click();
  await frame.getByRole("button", { name: "Child target" }).click();
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("All transitions protected");
  const keep = async () => { await dialog.waitFor(); await dialog.getByRole("button", { name: "Keep writing", exact: true }).click(); assert.equal(await createBody.inputValue(), "All transitions protected"); await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA"); };
  const selectionBeforeJump = JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env: { ...process.env, DOAN_RUNTIME: join(userData, "runtime.json") } })).stdout);
  await frameRows(page).first().click();
  assert.equal(await dialog.count(), 0, "frame jump does not guard a draft");
  assert.equal(await createBody.inputValue(), "All transitions protected");
  assert.deepEqual(JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env: { ...process.env, DOAN_RUNTIME: join(userData, "runtime.json") } })).stdout), selectionBeforeJump, "jump keeps doan active unchanged");
  await frameRows(page).first().press("Space"); await keep();
  await frameRows(page).first().dblclick(); await keep();
  // The slot shows on hover (or keyboard focus), as a pointer user reaches it.
  await frameRows(page).first().hover();
  await frameRows(page).first().getByRole("button", { name: /^Select / }).click(); await keep();
  await canvasRow(page, "a.html").click();
  assert.equal(await dialog.count(), 0, "same canvas keeps the draft and selection");
  assert.deepEqual(JSON.parse((await exec(cli, ["active", "--json", "--repo", repo], { env: { ...process.env, DOAN_RUNTIME: join(userData, "runtime.json") } })).stdout), selectionBeforeJump);
  await canvasRow(page, "b.html").click(); await keep();
  // Restore the old guard checks' viewport after the new frame jumps.
  await page.getByRole("button", { name: "Fit", exact: true }).click();

  await frame.locator("body").click({ position: { x: 650, y: 500 } }); await keep();
  await page.mouse.move(600, 20);
  if (await page.getByRole("tooltip").count()) { await page.keyboard.press("Escape"); await page.getByRole("tooltip").waitFor({ state: "hidden" }); }
  await page.getByRole("button", { name: "Reload canvas", exact: true }).focus(); await page.keyboard.press("Escape"); await keep();
  await page.getByRole("navigation", { name: "Ancestor path" }).getByRole("button").first().click(); await keep();
  await page.getByRole("button", { name: /^1 open comments?$/ }).first().click(); await keep();
  const linkBox = await frame.getByRole("link", { name: "Other canvas" }).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const boardBox = await page.locator("iframe").evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / el.clientWidth }; });
  await page.keyboard.down("Alt"); await page.mouse.click(boardBox.x + (linkBox.x + 8) * boardBox.scale, boardBox.y + (linkBox.y + 8) * boardBox.scale); await page.keyboard.up("Alt"); await keep();
  assert.equal(await page.locator("iframe").getAttribute("title"), "design/a.html");
  await removeHomeProject(page, repo); await keep();
  await app.evaluate(({ app }) => app.quit()); await keep();
  // Close Window hides the existing window without losing the editor.
  const appWin = await appWindow(app, page);
  await appWin.evaluate(window => window.close());
  assert.equal(await appWin.evaluate(window => window.isVisible()), false);
  await app.evaluate(({ app }) => app.emit("activate"));
  assert.equal(await createBody.inputValue(), "All transitions protected");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await shot("08-author-and-transition-guards");
  // Replace only Electron handlers to model transport/service failures; all
  // user actions still enter the actual mounted App and production preload.
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers");
    Reflect.set(globalThis, "commentMutationOriginal", handlers.get("comments:mutate"));
    ipcMain.removeHandler("comments:mutate");
    ipcMain.handle("comments:mutate", (_event, request) => ({ ok: false, identity: request, error: "Injected permission failure" }));
  });
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("Failed save body");
  await canvasRow(page, "b.html").click(); await dialog.getByRole("button", { name: "Save and continue", exact: true }).click();
  await panel.getByText("Injected permission failure", { exact: false }).waitFor();
  assert.equal(await createBody.inputValue(), "Failed save body"); assert.equal(await createBody.getAttribute("readonly"), null);
  await createBody.fill("Unknown save body");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("comments:mutate");
    ipcMain.handle("comments:mutate", async (...args) => {
      await Reflect.get(globalThis, "commentMutationOriginal")(...args);
      return { ok: true, identity: args[1], value: { state: "unknown" } };
    });
  });
  const beforeUnknown = (await readFile(file, "utf8")).trim().split("\n").length;
  await panel.getByRole("button", { name: "Save comment", exact: true }).click();
  await panel.getByText("Save status is unknown", { exact: true }).waitFor();
  presentation("Recovery message spans panel content", await panel.getByText("Save status is unknown", { exact: true }).evaluate(el => {
    const message = el.parentElement!, panel = el.closest(".comments-panel")!;
    // The header shares the panel's content edges, excluding its native scrollbar.
    const content = panel.querySelector(".comments-head")!.getBoundingClientRect();
    const rect = message.getBoundingClientRect();
    return { directChild: message.parentElement === panel, leftInset: rect.left - content.left, rightInset: content.right - rect.right };
  }), { directChild: true, leftInset: 0, rightInset: 0 });
  assert.equal(await createBody.getAttribute("readonly"), "");
  await panel.getByRole("button", { name: "Check saved status", exact: true }).click();
  await cards.filter({ hasText: "Unknown save body" }).waitFor();
  assert.equal((await readFile(file, "utf8")).trim().split("\n").length, beforeUnknown + 1, "lost response adds exactly one event");
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("comments:mutate"); ipcMain.handle("comments:mutate", Reflect.get(globalThis, "commentMutationOriginal")); });
  await shot("09-save-failure-and-confirmation");
  // Clipboard rejection goes through the awaited main service dependency.
  await app.evaluate(({ clipboard }) => { Reflect.set(globalThis, "clipboardWriteOriginal", clipboard.writeText); clipboard.writeText = async () => { throw new Error("Injected clipboard rejection"); }; });
  await cards.filter({ hasText: "Unknown save body" }).getByRole("button", { name: "Copy", exact: true }).click();
  await panel.getByText("Injected clipboard rejection", { exact: true }).waitFor();
  await app.evaluate(({ clipboard }) => { clipboard.writeText = Reflect.get(globalThis, "clipboardWriteOriginal"); });
  await cards.filter({ hasText: "Unknown save body" }).getByRole("button", { name: "Retry copy", exact: true }).click();
  await cards.filter({ hasText: "Unknown save body" }).getByRole("button", { name: "Copied", exact: true }).waitFor();
  await shot("10-clipboard-failure-retry");
  // Same DOM frame/element grouping and external no-reload invalidation.
  const beforeExternal = await page.locator("iframe").elementHandle(); assert.ok(beforeExternal);
  let currentEvents = (await readFile(file, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const frameCreate = currentEvents.find(event => event.type === "create" && event.target.frame === "hero" && !event.target.element);
  const equivalent = { ...frameCreate, id: `evt_${randomUUID()}`, comment: `cmt_${randomUUID()}`, body: "Equivalent frame element", target: { element: { doanId: "hero", selector: '[data-doan-id="hero"]', html: "<section/>" } }, at: new Date(Math.max(Date.now(), ...currentEvents.map(event => Date.parse(event.at))) + 1).toISOString() };
  await writeFile(file, await readFile(file, "utf8") + JSON.stringify(equivalent) + "\n");
  await page.waitForFunction(() => document.querySelectorAll('button.comment-pin[aria-label="2 open comments"]').length === 2);
  await frameRows(page).first().press("Space");
  await cards.filter({ hasText: "Equivalent frame element" }).waitFor();
  assert.equal(await cards.count(), 2, "same DOM frame and element group excludes child");
  assert.equal(await beforeExternal.evaluate(el => el.isConnected), true, "external comment event retained iframe");
  await shot("11-same-dom-group-and-no-reload");
  const measuredPin = page.getByRole("button", { name: "2 open comments", exact: true }).first();
  await page.keyboard.press("Tab"); await measuredPin.focus();
  presentation("Focused pin ring", await measuredPin.evaluate(el => {
    const s = getComputedStyle(el); return [s.outlineWidth, s.outlineOffset, s.outlineColor === getComputedStyle(document.body).color, s.zIndex];
  }), ["2px", "2px", true, "3"]);
  // External deletion keeps an edit visible but makes saving impossible.
  await cards.filter({ hasText: "Equivalent frame element" }).getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("textbox", { name: "Your unsaved edit body" }).fill("Keep deleted body");
  await writeFile(file, await readFile(file, "utf8") + JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, comment: equivalent.comment, type: "delete", by: { kind: "human", name: "External" }, at: new Date(Date.parse(equivalent.at) + 1).toISOString() }) + "\n");
  await panel.getByText("This comment was deleted", { exact: true }).waitFor();
  presentation("Deleted recovery has no empty action gap", await panel.getByText("This comment was deleted", { exact: true }).evaluate(el => el.parentElement!.querySelectorAll(".comments-tools:empty").length), 0);
  assert.equal(await panel.getByRole("textbox", { name: "Your unsaved edit body" }).inputValue(), "Keep deleted body");
  assert.equal(await panel.getByRole("button", { name: "Save changes", exact: true }).isDisabled(), true);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await shot("12-external-delete");
  // Hold a real Resolve invocation, append an external edit, then let main
  // validate the stale expected state. This is an actual file conflict.
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers"); const original = handlers.get("comments:mutate");
    const gate = { original, entered: false, release: () => {} }; Reflect.set(globalThis, "cardConflictGate", gate);
    ipcMain.removeHandler("comments:mutate"); ipcMain.handle("comments:mutate", async (...args) => {
      gate.entered = true; await new Promise<void>(resolve => { gate.release = resolve; }); return original(...args);
    });
  });
  await cards.filter({ hasText: "Frame note" }).getByRole("button", { name: "Resolve", exact: true }).click();
  await waitGate(() => app!.evaluate(() => Reflect.get(globalThis, "cardConflictGate").entered));
  currentEvents = (await readFile(file, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  await writeFile(file, await readFile(file, "utf8") + JSON.stringify({ v: 1, id: `evt_${randomUUID()}`, comment: frameCreate.comment, type: "edit", body: "Changed before resolve", by: { kind: "human", name: "External" }, at: new Date(Math.max(Date.now(), ...currentEvents.map(event => Date.parse(event.at))) + 1).toISOString() }) + "\n");
  await app.evaluate(({ ipcMain }) => { const gate = Reflect.get(globalThis, "cardConflictGate"); ipcMain.removeHandler("comments:mutate"); ipcMain.handle("comments:mutate", gate.original); gate.release(); });
  await panel.getByText("This comment changed elsewhere", { exact: true }).waitFor();
  presentation("Card conflict warning rule", await panel.getByText("This comment changed elsewhere", { exact: true }).evaluate(el => {
    const s = getComputedStyle(el.parentElement!); return [s.borderLeftWidth, s.borderLeftColor];
  }), ["2px", "rgb(232, 176, 75)"]);
  await cards.filter({ hasText: "Changed before resolve" }).getByRole("button", { name: "Read latest state", exact: true }).click();
  const beforeReviewedResolve = await readFile(file, "utf8");
  await cards.filter({ hasText: "Changed before resolve" }).getByRole("button", { name: "Confirm reviewed change", exact: true }).click();
  await panel.getByRole("button", { name: /^Resolved 1$/ }).click();
  await cards.filter({ hasText: "Changed before resolve" }).getByRole("button", { name: "Reopen", exact: true }).waitFor();
  assert.equal((await readFile(file, "utf8")).trim().split("\n").length, beforeReviewedResolve.trim().split("\n").length + 1);
  await cards.filter({ hasText: "Changed before resolve" }).getByRole("button", { name: "Reopen", exact: true }).click();
  await panel.getByRole("button", { name: /^Open 1$/ }).click();
  await cards.filter({ hasText: "Changed before resolve" }).waitFor();
  await shot("13-card-conflict-review");
  // Confirmed absence permits only the frozen original request and payload.
  await app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers"); Reflect.set(globalThis, "commentStatusOriginal", handlers.get("comments:status"));
    const requests: unknown[] = []; Reflect.set(globalThis, "absentRequests", requests);
    ipcMain.removeHandler("comments:mutate");
    ipcMain.handle("comments:mutate", (...args) => { requests.push(args[1]); return requests.length === 1 ? { ok: true, identity: args[1], value: { state: "unknown" } } : Reflect.get(globalThis, "commentMutationOriginal")(...args); });
    ipcMain.removeHandler("comments:status"); ipcMain.handle("comments:status", (_event, request) => ({ ok: true, identity: request, value: { state: "absent" } }));
  });
  await panel.getByRole("button", { name: "New selection comment", exact: true }).click(); await createBody.fill("Frozen retry body");
  await panel.getByRole("button", { name: "Save comment", exact: true }).click();
  await panel.getByRole("button", { name: "Check saved status", exact: true }).click();
  await panel.getByRole("button", { name: "Retry original save", exact: true }).waitFor();
  presentation("Confirmed absence uses a neutral message", await panel.getByText("The comment was not saved", { exact: true }).evaluate(el => getComputedStyle(el.parentElement!).borderLeftWidth), "0px");
  await panel.getByRole("button", { name: "Retry original save", exact: true }).click();
  await cards.filter({ hasText: "Frozen retry body" }).waitFor();
  const requests = await app.evaluate(() => Reflect.get(globalThis, "absentRequests")); assert.deepEqual(requests[0], requests[1]);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("comments:mutate"); ipcMain.handle("comments:mutate", Reflect.get(globalThis, "commentMutationOriginal"));
    ipcMain.removeHandler("comments:status"); ipcMain.handle("comments:status", Reflect.get(globalThis, "commentStatusOriginal"));
  });
  await shot("13-frozen-absence-retry");
  await panel.getByRole("group", { name: "Comment scope" }).getByRole("button", { name: "Canvas", exact: true }).click();
  const invalidDate = { ...frameCreate, id: `evt_${randomUUID()}`, comment: `cmt_${randomUUID()}`, body: "Calendar-invalid timestamp stays visible", target: {}, at: "2026-10-23T00:00:60.000Z" };
  await writeFile(file, await readFile(file, "utf8") + JSON.stringify(invalidDate) + "\n");
  await cards.filter({ hasText: invalidDate.body }).waitFor();
  assert.equal(await cards.filter({ hasText: invalidDate.body }).locator("time").textContent(), invalidDate.at);
  await shot("14-calendar-invalid-readable");
  // Hold an actual old-canvas read across real sidebar navigation.
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("comments:list");
    const gate = { original, held: false, released: false, release: () => {} }; Reflect.set(globalThis, "commentReadGate", gate);
    ipcMain.removeHandler("comments:list"); ipcMain.handle("comments:list", async (...args) => {
      const result = await original(...args);
      if (args[1].canvas === "a" && !gate.held) { gate.held = true; await new Promise<void>(resolve => { gate.release = resolve; }); gate.released = true; }
      return result;
    });
  });
  await writeFile(file, await readFile(file, "utf8") + "\n");
  await waitGate(() => app!.evaluate(() => Reflect.get(globalThis, "commentReadGate").held));
  await canvasRow(page, "b.html").click();
  await panel.getByText("No open comments here", { exact: true }).waitFor();
  await app.evaluate(() => Reflect.get(globalThis, "commentReadGate").release());
  await waitGate(() => app!.evaluate(() => Reflect.get(globalThis, "commentReadGate").released));
  assert.equal(await cards.count(), 0); assert.equal(await page.locator("iframe").getAttribute("title"), "design/b.html");
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("comments:list"); ipcMain.handle("comments:list", Reflect.get(globalThis, "commentReadGate").original); });
  await shot("15-stale-panel-reply");
  await app.evaluate(({ ipcMain }) => {
    const original = Reflect.get(ipcMain, "_invokeHandlers").get("comments:list");
    Reflect.set(globalThis, "presentationRead", { original, release: () => {} });
    ipcMain.removeHandler("comments:list"); ipcMain.handle("comments:list", async (...args) => {
      await new Promise<void>(resolve => { Reflect.get(globalThis, "presentationRead").release = resolve; });
      return original(...args);
    });
  });
  await canvasRow(page, "a.html").click();
  await panel.getByText("Loading comments…", { exact: true }).waitFor();
  presentation("Loading message hierarchy", await panel.getByText("Loading comments…", { exact: true }).evaluate(el => {
    const s = getComputedStyle(el); return [s.fontSize, s.fontWeight];
  }), ["12px", "700"]);
  await app.evaluate(({ ipcMain }) => {
    const gate = Reflect.get(globalThis, "presentationRead"); gate.release();
    ipcMain.removeHandler("comments:list"); ipcMain.handle("comments:list", gate.original);
  });
  await cards.filter({ hasText: invalidDate.body }).waitFor();
  await canvasRow(page, "a.html").click();
  await cards.filter({ hasText: invalidDate.body }).waitFor();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("comments:mutate");
    ipcMain.handle("comments:mutate", (_event, request) => ({ ok: true, identity: request, value: { state: "unknown", recovery: "child-exit-required", error: "Confirm the child exited externally, then restart the app." } }));
  });
  await panel.getByRole("button", { name: "New canvas comment", exact: true }).click(); await createBody.fill("Quarantined draft");
  await panel.getByRole("button", { name: "Save comment", exact: true }).click();
  await panel.getByText("Save recovery is blocked", { exact: true }).waitFor();
  assert.equal(await createBody.inputValue(), "Quarantined draft"); assert.equal(await createBody.getAttribute("readonly"), "");
  assert.equal(await panel.getByRole("button", { name: "Retry original save", exact: true }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: "Check saved status", exact: true }).count(), 0);
  await shot("16-unrecoverable-unknown");
  assert.deepEqual(presentationFailures, [], "Measured comment presentation regressions");
  console.log("comments-ui-test: PASS (actual App CRUD, draft transitions, clipboard and watcher)");
} catch (error) {
  console.error(error);
  if (app) await (await app.firstWindow()).screenshot({ path: join(shots, "failure.png") }).catch(() => {});
  throw error;
} finally {
  if (app) {
    if (clipboardSaved) await app.evaluate(async ({ clipboard }) => { await clipboard.write(Reflect.get(globalThis, "savedClipboardU2")); });
    await (await app.firstWindow()).evaluate(() => window.doan.setCommentDraftGuard(false)).catch(() => {});
    await app.close();
  }
  await rm(work, { recursive: true, force: true });
  assert.deepEqual(await Promise.all(paths.map(fingerprint)), before, "real app userData unchanged");
}
