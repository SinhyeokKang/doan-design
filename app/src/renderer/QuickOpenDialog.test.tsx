import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { activeIndex, optionId, projectWhere, quickOpenKey, QuickOpen, QuickOpenList } from "./QuickOpenDialog";
import { groupResults, resultKey, searchIndex, searchMatch, type SearchFolder, type SearchResult } from "./quickOpen";
import { projectHue } from "./shellNavigation";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, open: 0, resolved: 0, url: "u", ...extra });
const git = (branch: string) => ({ common: "/code/acme-web/.git", main: "/code/acme-web", branch, worktrees: [] });
const entries: FolderEntry[] = [
  { kind: "list", path: "/code/acme-web", servedRev: 0, git: git("main"), canvases: [row(".doan/canvases/settings/billing.html", { title: "Billing & plans", frames: [{ id: "plans" }, { id: "card-declined", title: "Card declined" }] }), row(".doan/canvases/tokens.html", { title: "Design tokens" })] },
  { kind: "list", path: "/code/worktrees/feat-billing/acme-web", servedRev: 0, git: git("feat-billing"), canvases: [row(".doan/canvases/settings/billing.html", { title: "Billing & plans" })] },
  { kind: "list", path: "/Users/alex/Documents/brand-kit", servedRev: 0, canvases: [row(".doan/canvases/research/card-decline-patterns.html", { title: "Card decline patterns" })] },
  { kind: "loading", path: "/code/reading" },
];
const render = (currentRoot: string | null) => renderToStaticMarkup(<QuickOpen entries={entries} currentRoot={currentRoot} pick={() => {}} close={() => {}} />);
const options = (html: string) => [...html.matchAll(/role="option"[^>]*aria-label="([^"]*)"/g)].map(match => match[1]!);
const optionIds = (html: string) => [...html.matchAll(/role="option" id="([^"]+)"/g)].map(match => match[1]!);
const rows = (list: readonly FolderEntry[], query: string, currentRoot: string | null) =>
  groupResults(searchMatch(searchIndex(list as readonly SearchFolder[]), query, currentRoot, () => undefined), projectWhere(list)).flatMap(group => group.rows);

test("a modal dialog with a combobox over a listbox, the placeholder and no key hint", () => {
  const html = render("/code/acme-web");
  expect(html).toMatch(/^<dialog class="doan-dialog qo" data-ui-presentation="search" aria-label="Quick Open"/);
  expect(html).toMatch(/<input[^>]*role="combobox"[^>]*>/);
  expect(html).toContain('aria-label="Search canvases and frames"');
  expect(html).toContain('placeholder="Search canvases and frames"');
  expect(html).toContain('aria-expanded="true"');
  const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
  expect(html).toContain(`role="listbox" id="${controls}"`);
  expect(html).toContain('aria-label="Results"');
  expect(html).toContain(`aria-activedescendant="${optionIds(html)[0]}"`);
  expect(html).not.toContain("qo-foot");
  expect(html).not.toContain("doan-kbd");
  expect(html).not.toContain(">esc<");
});

test("filter tabs: All, Canvases and Frames, All chosen and the one Tab stop, each controlling the results", () => {
  const html = render("/code/acme-web");
  const listbox = html.match(/role="listbox" id="([^"]+)"/)?.[1];
  expect(html).toContain('role="tablist" aria-label="Result types"');
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>.*?<\/button>/g)].map(match => match[0]);
  expect(tabs.map(tab => tab.replace(/<[^>]+>/g, ""))).toEqual(["All", "Canvases", "Frames"]);
  expect(tabs.map(tab => tab.match(/aria-selected="(\w+)"/)?.[1])).toEqual(["true", "false", "false"]);
  expect(tabs.map(tab => tab.match(/tabindex="(-?\d)"/)?.[1])).toEqual(["0", "-1", "-1"]);
  for (const tab of tabs) expect(tab).toContain(`aria-controls="${listbox}"`);
  // The list scrolls but is not a Tab stop: the input and the tab list are.
  expect(html).toMatch(/role="listbox"[^>]*tabindex="-1"/);
});

test("an empty query lists the current project's canvases in a workspace and every project's on Home", () => {
  expect(options(render("/code/acme-web"))).toEqual([
    "Billing &amp; plans — settings/billing.html · acme-web · main",
    "Design tokens — tokens.html · acme-web · main",
  ]);
  expect(options(render(null))).toEqual([
    "Billing &amp; plans — settings/billing.html · acme-web · main",
    "Design tokens — tokens.html · acme-web · main",
    "Billing &amp; plans — settings/billing.html · acme-web · feat-billing",
    "Card decline patterns — research/card-decline-patterns.html · brand-kit",
  ]);
  // The first row is active.
  expect(render(null)).toMatch(/role="option" id="[^"]+" aria-selected="true"/);
  expect(render(null).match(/role="option"[^>]*aria-selected="true"/g)).toHaveLength(1);
});

test("result rows: an icon, the name with its matched letters underlined, and a second line with the canvas path or canvas and number", () => {
  const frame: SearchResult = { kind: "frame", root: "/code/acme-web", path: ".doan/canvases/settings/billing.html", canvasLabel: "Billing & plans", label: "Card declined", frameId: "card-declined", frameIndex: 3 };
  const canvas: SearchResult = { kind: "canvas", root: "/code/acme-web", path: ".doan/canvases/reports/team-scorecard.html", canvasLabel: "Team scorecard", label: "Team scorecard" };
  const groups = groupResults([frame, canvas], projectWhere(entries));
  const html = renderToStaticMarkup(<QuickOpenList id="r" query="card" groups={groups} active={0} pick={() => {}} activate={() => {}} />);
  const [first, second] = [...html.matchAll(/<div class="qo-item"[^>]*>.*?<\/span><\/span><\/span><\/div>/g)].map(match => match[0]);
  expect(first).toContain('aria-label="Card declined — Billing &amp; plans › 4 · acme-web · main"');
  expect(first).toMatch(/<span class="qo-icon" aria-hidden="true"><svg[^>]*lucide-hash/);
  expect(first).toContain('<span class="qo-name" title="Card declined"><mark class="qo-match">Card</mark> declined</span>');
  expect(first).toContain('<span class="qo-detail"><span class="qo-context" title="Billing &amp; plans › 4">Billing &amp; plans › 4</span></span>');
  expect(second).toContain('aria-label="Team scorecard — reports/team-scorecard.html · acme-web · main"');
  expect(second).toMatch(/<span class="qo-icon" aria-hidden="true"><svg[^>]*lucide-palette/);
  expect(second).toContain('<span class="qo-name" title="Team scorecard">Team score<mark class="qo-match">card</mark></span>');
  expect(second).toContain('title="reports/team-scorecard.html">reports/team-scorecard.html</span>');
});

test("projects are named by their repository with the branch; a folder outside git by its name", () => {
  expect([...projectWhere(entries)]).toEqual([
    ["/code/acme-web", { name: "acme-web", title: "acme-web · main" }],
    ["/code/worktrees/feat-billing/acme-web", { name: "acme-web", title: "acme-web · feat-billing" }],
    ["/Users/alex/Documents/brand-kit", { name: "brand-kit", title: "brand-kit" }],
    ["/code/reading", { name: "reading", title: "reading" }],
  ]);
});

test("results are grouped by project under a title of the thumbnail and project name", () => {
  const html = render(null);
  const groups = [...html.matchAll(/<div class="qo-group" role="group" aria-labelledby="([^"]+)"><div class="qo-group-title" id="([^"]+)">(.*?)<\/div>/g)];
  expect(groups.map(group => group[1] === group[2])).toEqual([true, true, true]);
  expect(groups.map(group => group[3])).toEqual([
    `<span class="shell-thumbnail hue-${projectHue("acme-web")}" aria-hidden="true">A</span><span class="qo-group-name">acme-web · main</span>`,
    `<span class="shell-thumbnail hue-${projectHue("acme-web")}" aria-hidden="true">A</span><span class="qo-group-name">acme-web · feat-billing</span>`,
    `<span class="shell-thumbnail hue-${projectHue("brand-kit")}" aria-hidden="true">B</span><span class="qo-group-name">brand-kit</span>`,
  ]);
  // Titles are not headings: a listbox and its groups own only options.
  expect(html).not.toMatch(/<h\d/);
});

test("same-named folders outside git get different group title ids", () => {
  const same: FolderEntry[] = [
    { kind: "list", path: "/a/design", servedRev: 0, canvases: [row(".doan/canvases/card.html")] },
    { kind: "list", path: "/b/design", servedRev: 0, canvases: [row(".doan/canvases/card.html")] },
  ];
  const html = renderToStaticMarkup(<QuickOpen entries={same} currentRoot={null} pick={() => {}} close={() => {}} />);
  const ids = [...html.matchAll(/class="qo-group-title" id="([^"]+)"/g)].map(match => match[1]);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

test("option ids and the active row follow the screen order of the groups", () => {
  const a1: SearchResult = { kind: "canvas", root: "/a", path: ".doan/canvases/one.html", canvasLabel: "one", label: "one" };
  const b1: SearchResult = { kind: "canvas", root: "/b", path: ".doan/canvases/one.html", canvasLabel: "one", label: "one" };
  const a2: SearchResult = { kind: "canvas", root: "/a", path: ".doan/canvases/two.html", canvasLabel: "two", label: "two" };
  const names = new Map([["/a", { name: "a", title: "a" }], ["/b", { name: "b", title: "b" }]]);
  const groups = groupResults([a1, b1, a2], names);
  const screen = groups.flatMap(group => group.rows);
  // ↓ from the last row of the first group lands on the second group's first row.
  const step = quickOpenKey("ArrowDown", 1, screen.length);
  expect(step).toEqual({ kind: "move", active: 2 });
  const html = renderToStaticMarkup(<QuickOpenList id="r" query="" groups={groups} active={2} pick={() => {}} activate={() => {}} />);
  expect(optionIds(html)).toEqual([optionId("r", a1), optionId("r", a2), optionId("r", b1)]);
  expect(html).toContain(`role="option" id="${optionId("r", b1)}" aria-selected="true"`);
  expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
});

test("option ids come from the result key: stable across lists, distinct down to the frame index", () => {
  const frame = (frameIndex: number): SearchResult => ({ kind: "frame", root: "/a", path: ".doan/canvases/one.html", canvasLabel: "one", label: "dup", frameId: "dup", frameIndex });
  expect(optionId("r", frame(0))).toBe(optionId("r", { ...frame(0) }));
  expect(optionId("r", frame(0))).not.toBe(optionId("r", frame(1)));
  expect(optionId("r", frame(0))).toMatch(/^r-[\w-]+$/);
});

test("the active row stays on the same result when the entries change, and falls back to the first row when it is gone", () => {
  const before = rows(entries, "", null);
  const key = resultKey(before[2]!);
  const added: FolderEntry[] = entries.map(entry => entry.kind === "list" && entry.path === "/code/acme-web"
    ? { ...entry, canvases: [row(".doan/canvases/added.html", { title: "Added" }), ...entry.canvases] } : entry);
  const after = rows(added, "", null);
  expect(activeIndex(after, key)).toBe(3);
  expect(resultKey(after[activeIndex(after, key)]!)).toBe(key);
  const removed = entries.filter(entry => entry.path !== "/code/worktrees/feat-billing/acme-web");
  expect(activeIndex(rows(removed, "", null), key)).toBe(0);
  expect(activeIndex(after, null)).toBe(0);
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
  const html = renderToStaticMarkup(<QuickOpenList id="r" query="zzz" groups={[]} active={0} pick={() => {}} activate={() => {}} />);
  expect(html).toContain('<p class="qo-none" role="status">No canvases or frames match</p>');
  expect(html).not.toContain('role="option"');
});

test("empty query distinguishes no available canvases from no search matches", () => {
  const empty = renderToStaticMarkup(<QuickOpen entries={[]} currentRoot={null} pick={() => {}} close={() => {}} />);
  expect(empty).toContain("No canvases to show");
  const reading = renderToStaticMarkup(<QuickOpen entries={[{ kind: "loading", path: "/repo" }]} currentRoot="/repo" pick={() => {}} close={() => {}} />);
  expect(reading).toContain("Project is still being read");
  const problem = renderToStaticMarkup(<QuickOpen entries={[{ kind: "notFound", path: "/repo" }]} currentRoot="/repo" pick={() => {}} close={() => {}} />);
  expect(problem).toContain("Project is unavailable. Fix it from its menu in the sidebar.");
});
