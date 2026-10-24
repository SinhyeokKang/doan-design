import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";
import { applyVisibility, cardFacts, focusAfterRemoval, overviewSections, ProjectOverview, thumbnailView, type ThumbnailState } from "./ProjectOverview";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, width: 1440, frames: [], open: 0, resolved: 0, url: `http://127.0.0.1/${path}`, ...extra });
const rows = [
  row("design/tokens.html", { title: "Design tokens" }),
  row("design/2026-10-checkout-revamp.html", { title: "Checkout revamp (Oct 2026)" }),
  row("design/checkout/cart.html", { title: "Cart" }),
  row("design/settings/team/members.html", { title: "Team members" }),
  row("design/settings/billing.html", { title: "Billing & plans" }),
];
const render = (canvases: CanvasRow[], thumbnails: ReadonlyMap<string, ThumbnailState> = new Map()) =>
  renderToStaticMarkup(<TooltipProvider><ProjectOverview root="/code/acme-web" rows={canvases} thumbnails={thumbnails} onVisible={() => {}} open={() => {}} /></TooltipProvider>);

test("sections run root first, then folders in tree order, each with its direct canvases in tree order", () => {
  expect(overviewSections(rows).map(section => [section.key, section.canvases.map(canvas => canvas.name)])).toEqual([
    ["design", ["Checkout revamp (Oct 2026)", "Design tokens"]],
    ["design/checkout", ["Cart"]],
    ["design/settings", ["Billing & plans"]],
    ["design/settings/team", ["Team members"]],
  ]);
  // A folder holding only folders has no section of its own.
  expect(overviewSections([row("design/a/b/c.html")]).map(section => section.key)).toEqual(["design/a/b"]);
  expect(overviewSections([])).toEqual([]);
});

test("card facts count static frames, singular and capped, and show open comments only above zero", () => {
  const frames = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `f${index}` }));
  expect(cardFacts(row("design/a.html", { frames: frames(4) }))).toEqual({ frames: "4 frames" });
  expect(cardFacts(row("design/a.html", { frames: frames(1) }))).toEqual({ frames: "1 frame" });
  expect(cardFacts(row("design/a.html", { frames: frames(0) }))).toEqual({ frames: "0 frames" });
  expect(cardFacts(row("design/a.html", { frames: frames(1000), framesTruncated: true, open: 3 }))).toEqual({ frames: "1,000+ frames", open: "3 open" });
  expect(cardFacts(row("design/a.html", { frames: frames(1000) }))).toEqual({ frames: "1,000 frames" });
  // A canvas `doan ls` could not parse has no frame count.
  const { id: _id, ...broken } = row("design/a.html", { open: 2 });
  expect(cardFacts(broken)).toEqual({ open: "2 open" });
});

test("thumbnail view: unreadable beats a missing width, which beats the capture state", () => {
  const { id: _id, ...broken } = row("design/a.html");
  const { width: _width, ...noWidth } = row("design/a.html");
  expect(thumbnailView(broken, { kind: "ready", url: "blob:x" })).toEqual({ kind: "broken" });
  expect(thumbnailView(noWidth, { kind: "failed" })).toEqual({ kind: "noWidth" });
  expect(thumbnailView(row("design/a.html"), undefined)).toEqual({ kind: "pending" });
  expect(thumbnailView(row("design/a.html"), { kind: "failed" })).toEqual({ kind: "failed" });
  expect(thumbnailView(row("design/a.html"), { kind: "ready", url: "blob:x" })).toEqual({ kind: "ready", url: "blob:x" });
});

test("focus goes to the next remaining card, else the previous one", () => {
  expect(focusAfterRemoval(["a", "b", "c"], ["a", "c"], "b")).toBe("c");
  expect(focusAfterRemoval(["a", "b", "c", "d"], ["a", "d"], "b")).toBe("d");
  expect(focusAfterRemoval(["a", "b", "c"], ["a", "b"], "c")).toBe("b");
  expect(focusAfterRemoval(["a", "b"], [], "a")).toBeNull();
  // Still there, or never known: nothing to move.
  expect(focusAfterRemoval(["a", "b"], ["a", "b"], "a")).toBeNull();
  expect(focusAfterRemoval(["a"], ["b"], "x")).toBeNull();
});

test("visibility changes report a new set only when it changed", () => {
  const visible = applyVisibility(new Set(), [{ path: "a", visible: true }, { path: "b", visible: true }]);
  expect(visible && [...visible]).toEqual(["a", "b"]);
  expect(applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: true }, { path: "c", visible: false }])).toBeNull();
  const after = applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: false }]);
  expect(after && [...after]).toEqual(["b"]);
});

test("the overview shows each thumbnail state, the parse-failure card and folder headings with counts", () => {
  const { id: _id, title: _title, ...broken } = row("design/checkout/legacy-checkout.html", { mtimeMs: Date.now() });
  const { width: _width, ...noWidth } = rows[0]!;
  const html = render([noWidth, rows[1]!, rows[2]!, broken, { ...rows[4]!, open: 2, frames: [{ id: "plans" }] }], new Map<string, ThumbnailState>([
    ["design/2026-10-checkout-revamp.html", { kind: "ready", url: "blob:thumb" }],
    ["design/settings/billing.html", { kind: "failed" }],
  ]));
  expect(html).toContain('aria-label="Overview"');
  expect(html).toMatch(/<div class="sec">design <span class="r">2<\/span><\/div>/);
  expect(html).toMatch(/<div class="sec">design\/checkout <span class="r">2<\/span><\/div>/);
  expect(html).toContain("Add <code>doan:width</code> to preview");
  expect(html).toContain('<img src="blob:thumb" alt=""');
  expect(html).toContain('class="thumb pending"');
  expect(html).toContain("Preview unavailable");
  expect(html).toContain('<p class="thumb-msg warn">Can&#x27;t read this canvas — run doan check</p>');
  expect(html).toContain('<span class="ocard-title">legacy-checkout</span>');
  expect(html).toContain("1 frame · ");
  expect(html).toContain('<span class="hot">2 open</span>');
  // Zero open comments are not shown.
  expect(html).not.toContain("0 open");
  expect(html.match(/<button[^>]*class="ocard"/g)).toHaveLength(5);
});

test("a workspace without canvases shows the empty state with Copy first prompt", () => {
  const html = render([]);
  expect(html).toContain("<b>No canvases in design/ yet</b>");
  expect(html).toMatch(/<button[^>]*class="btn"[^>]*>Copy first prompt<\/button>/);
  expect(html).toContain("Replace &lt;what you want to design&gt; before sending.");
  expect(html).not.toContain("ocard");
});
