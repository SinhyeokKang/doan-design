import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";

export function projectTree(page: Page): Locator {
  return page.getByRole("tree", { name: "Projects and canvases", exact: true });
}

export function canvasKeySelector(path: string, root?: string): string {
  const full = path.startsWith("design/");
  const key = root && full ? `${root}\n${path}` : full ? `\n${path}` : `/${path}`;
  const quote = (key: string) => key.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ").replace(/\r/g, "\\d ");
  const prefix = root && !full ? `[data-key^="${quote(`${root}\n`)}"]` : "";
  return `${prefix}[data-key${root && full ? "" : "$"}="${quote(key)}"]`;
}

export function canvasRow(page: Page, path: string, root?: string): Locator {
  const tree = projectTree(page);
  // Several projects can remain expanded; default to the viewed project's group.
  const scope = root ? tree : tree.locator('.shell-project').filter({ has: page.locator('[aria-current="location"]') });
  const row = scope.getByRole("treeitem", { name: (path.split("/").at(-1) ?? path).replace(/\.html$/, ""), exact: true });
  return row.and(page.locator(canvasKeySelector(path, root)));
}

export async function openOverview(page: Page, project?: string): Promise<void> {
  const scope = project ? projectTree(page).getByRole("treeitem", { name: project, exact: true })
    : projectTree(page).locator('.shell-project').filter({ has: page.locator('[aria-current="location"]') });
  await scope.getByRole("button", { name: project ? `${project} menu` : / menu$/, exact: !!project }).click();
  await page.getByRole("menuitem", { name: "Overview", exact: true }).click();
}

export async function canvasTitle(page: Page): Promise<string> {
  return page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("head title").textContent().then(title => title ?? "");
}

interface CanvasIdentity { key: string; src: string }
interface QuickOption { glyph: string; name: string; context: string; where: string }

function currentCanvasOption(identity: CanvasIdentity, local: readonly QuickOption[]): QuickOption {
  const path = identity.key.slice(identity.key.lastIndexOf("\n") + 1);
  const matches = local.filter(row => row.glyph === "◧" && row.context === ` — ${path.replace(/^design\//, "")}`);
  if (local.length >= 50 || matches.length !== 1) throw new Error(`Quick Open cannot prove canvas identity ${JSON.stringify(identity)}: current-root paths ${JSON.stringify(local)}`);
  return matches[0]!;
}

export function frameOptionIndex(identity: CanvasIdentity, index: number, local: readonly QuickOption[], global: readonly QuickOption[], frames: readonly QuickOption[]): number {
  const current = currentCanvasOption(identity, local);
  const canvases = global.filter(row => row.glyph === "◧" && row.name === current.name && row.where === current.where);
  const matches = frames.flatMap((row, at) => row.glyph === "#" && row.context === ` — ${current.name} › ${index + 1}` && row.where === current.where ? [at] : []);
  // Frame results expose title/index and project display text, but no full path.
  // Prove that this visible combination maps to only the current canvas first.
  if (global.length >= 50 || frames.length >= 50 || canvases.length !== 1 || canvases[0]!.context !== current.context || matches.length !== 1) {
    throw new Error(`Quick Open cannot prove frame identity ${JSON.stringify({ identity, index, current, canvases, frames })}`);
  }
  return matches[0]!;
}

async function canvasIdentity(page: Page): Promise<CanvasIdentity> {
  const key = await projectTree(page).locator('[aria-level="2"][aria-current="location"]').getAttribute("data-key");
  const src = await page.locator('[role="region"][aria-label="Canvas"] iframe').getAttribute("src");
  assert.ok(key && src, "frame jump requires a listed current canvas and iframe source");
  return { key, src };
}

export async function jumpFrame(page: Page, index: number): Promise<void> {
  const identity = await canvasIdentity(page);
  const iframe = await page.locator('[role="region"][aria-label="Canvas"] iframe').elementHandle();
  assert.ok(iframe);
  const frame = page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("[data-doan-frame]").nth(index);
  const label = await frame.getAttribute("data-doan-title") || await frame.getAttribute("data-doan-frame");
  if (!label) throw new Error("Quick Open cannot search a frame without an id or title");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Open", exact: true });
  const input = dialog.getByRole("combobox", { name: "Search canvases and frames", exact: true });
  const read = () => dialog.getByRole("option").evaluateAll(options => options.map(option => ({
    glyph: option.querySelector(".glyph")?.textContent ?? "",
    name: option.querySelector(".t")?.textContent ?? "",
    context: option.querySelector(".c")?.textContent ?? "",
    where: option.querySelector(".w")?.textContent ?? "",
  })));
  await input.fill("");
  const local = await read();
  const current = currentCanvasOption(identity, local);
  await input.fill(current.name);
  const global = await read();
  await input.fill(label);
  const frames = await read();
  const at = frameOptionIndex(identity, index, local, global, frames);
  await dialog.getByRole("option").nth(at).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await canvasIdentity(page), identity, "frame jump preserves root and full canvas path/source");
  assert.equal(await iframe.evaluate(node => node.isConnected), true, "frame jump preserves the iframe document");
}

export async function selectFrame(page: Page, index: number): Promise<void> {
  await jumpFrame(page, index);
  // The top-left inset of these fixtures is empty frame background, not a child.
  await page.frameLocator('[role="region"][aria-label="Canvas"] iframe').locator("[data-doan-frame]").nth(index).click({ position: { x: 2, y: 2 } });
}
