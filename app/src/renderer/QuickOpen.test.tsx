import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { projectWhere, quickOpenKey, QuickOpen, QuickOpenList, resultParts } from "./QuickOpen";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, open: 0, resolved: 0, url: "u", ...extra });
const git = (branch: string) => ({ common: "/code/acme-web/.git", main: "/code/acme-web", branch, worktrees: [] });
const entries: FolderEntry[] = [
  { kind: "list", path: "/code/acme-web", servedRev: 0, git: git("main"), canvases: [row("design/settings/billing.html", { title: "Billing & plans", frames: [{ id: "plans" }, { id: "card-declined", title: "Card declined" }] }), row("design/tokens.html", { title: "Design tokens" })] },
  { kind: "list", path: "/code/worktrees/feat-billing/acme-web", servedRev: 0, git: git("feat-billing"), canvases: [row("design/settings/billing.html", { title: "Billing & plans" })] },
  { kind: "list", path: "/Users/alex/Documents/brand-kit", servedRev: 0, canvases: [row("design/research/card-decline-patterns.html", { title: "Card decline patterns" })] },
  { kind: "loading", path: "/code/reading" },
];
const render = (currentRoot: string | null) => renderToStaticMarkup(<QuickOpen entries={entries} currentRoot={currentRoot} pick={() => {}} close={() => {}} />);
const options = (html: string) => [...html.matchAll(/role="option"[^>]*>(.*?)<\/div>/g)].map(match => match[1]!.replace(/<[^>]+>/g, ""));

test("a modal dialog with a combobox over a listbox, the placeholder and the key hint", () => {
  const html = render("/code/acme-web");
  expect(html).toMatch(/^<dialog class="qo" aria-label="Quick Open"/);
  expect(html).toMatch(/<input[^>]*role="combobox"[^>]*>/);
  expect(html).toContain('placeholder="Search canvases and frames"');
  expect(html).toContain('aria-expanded="true"');
  const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
  expect(html).toContain(`role="listbox" id="${controls}"`);
  expect(html).toContain(`aria-activedescendant="${controls}-0"`);
  expect(html).toContain('<div class="qo-foot">↑↓ to move · ↩ to open · esc to close</div>');
});

test("an empty query lists the current project's canvases in a workspace and every project's on Home", () => {
  expect(options(render("/code/acme-web"))).toEqual([
    "◧Billing &amp; plans — settings/billing.html · acme-web · main",
    "◧Design tokens — tokens.html · acme-web · main",
  ]);
  expect(options(render(null))).toEqual([
    "◧Billing &amp; plans — settings/billing.html · acme-web · main",
    "◧Design tokens — tokens.html · acme-web · main",
    "◧Billing &amp; plans — settings/billing.html · acme-web · feat-billing",
    "◧Card decline patterns — research/card-decline-patterns.html · brand-kit",
  ]);
  // The first row is active.
  expect(render(null)).toMatch(/role="option" id="[^"]+-0" aria-selected="true"/);
});

test("result rows: a frame names its canvas and number, a canvas its path under design/", () => {
  const where = projectWhere(entries);
  expect(resultParts({ kind: "frame", root: "/code/acme-web", path: "design/settings/billing.html", canvasLabel: "Billing & plans", label: "Card declined", frameId: "card-declined", frameIndex: 3 }, where))
    .toEqual({ glyph: "#", name: "Card declined", context: " — Billing & plans › 4", where: " · acme-web · main" });
  expect(resultParts({ kind: "canvas", root: "/Users/alex/Documents/brand-kit", path: "design/research/card-decline-patterns.html", canvasLabel: "Card decline patterns", label: "Card decline patterns" }, where))
    .toEqual({ glyph: "◧", name: "Card decline patterns", context: " — research/card-decline-patterns.html", where: " · brand-kit" });
});

test("projects are named by their repository with the branch; a folder outside git by its name", () => {
  expect([...projectWhere(entries)]).toEqual([
    ["/code/acme-web", "acme-web · main"],
    ["/code/worktrees/feat-billing/acme-web", "acme-web · feat-billing"],
    ["/Users/alex/Documents/brand-kit", "brand-kit"],
    ["/code/reading", "reading"],
  ]);
});

test("keys: arrows move and wrap, Enter picks, Escape closes", () => {
  expect(quickOpenKey("ArrowDown", 0, 3)).toEqual({ kind: "move", active: 1 });
  expect(quickOpenKey("ArrowDown", 2, 3)).toEqual({ kind: "move", active: 0 });
  expect(quickOpenKey("ArrowUp", 0, 3)).toEqual({ kind: "move", active: 2 });
  expect(quickOpenKey("ArrowUp", 0, 0)).toBeNull();
  expect(quickOpenKey("Enter", 1, 3)).toEqual({ kind: "pick" });
  expect(quickOpenKey("Enter", 0, 0)).toBeNull();
  expect(quickOpenKey("Escape", 0, 0)).toEqual({ kind: "close" });
  expect(quickOpenKey("a", 0, 3)).toBeNull();
});

test("no match shows the spec's sentence instead of options", () => {
  const html = renderToStaticMarkup(<QuickOpenList id="r" results={[]} active={0} where={new Map()} pick={() => {}} activate={() => {}} />);
  expect(html).toContain('<p class="qo-none" role="status">No canvases or frames match</p>');
  expect(html).not.toContain('role="option"');
});
