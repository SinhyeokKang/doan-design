import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup as serverMarkup } from "react-dom/server";
import { TooltipProvider } from "./components/ui/tooltip";
// Names and details show in the shared tooltip, which needs the app's provider.
const renderToStaticMarkup = (node: ReactNode) => serverMarkup(<TooltipProvider>{node}</TooltipProvider>);
import { describe, expect, it, vi } from "vitest";
import { DrawerListbox, FrameRowMarks } from "./FrameListBody";
import type { DrawerGroup } from "./frameDrawerList";

// One listbox of link groups, each a named `role="group"`, with aria-hidden separators only between groups.
const row = (id: string, number: number, name: string, group: number, current = false) => ({ key: id, id, number, name, current, group });
const GROUPS: DrawerGroup[] = [
  { label: "Cart and 2 more", rows: [row("cart", 2, "Cart", 0), row("checkout", 3, "Checkout", 0, true), row("done", 5, "Order confirmation", 0)] },
  { label: "Welcome and 1 more", rows: [row("welcome", 7, "Welcome", 1), row("signup", 8, "Sign up", 1)] },
  { label: "Frames without links", rows: [row("account", 4, "Account", 2), row("settings", 9, "Settings", 2)] },
];
const list = (groups: DrawerGroup[], active: string | null = "checkout") =>
  renderToStaticMarkup(<DrawerListbox label="Prototype frames in Shop" groups={groups} active={active} currentWord="Playing" onKeyDown={vi.fn()} onPick={vi.fn()} onFocusRow={vi.fn()} nodes={new Map()} />);

describe("DrawerListbox", () => {
  it("names the list and each group, with a separator only between groups", () => {
    const html = list(GROUPS);
    expect(html).toMatch(/^<div role="listbox" aria-label="Prototype frames in Shop">/);
    expect([...html.matchAll(/role="group" aria-label="([^"]+)"/g)].map(match => match[1])).toEqual(["Cart and 2 more", "Welcome and 1 more", "Frames without links"]);
    expect(html.match(/<div class="doan-menu-sep" aria-hidden="true"><\/div>/g)).toHaveLength(2);
    expect(html.indexOf("doan-menu-sep")).toBeGreaterThan(html.indexOf("Order confirmation"));
    expect(html.indexOf("doan-menu-sep")).toBeLessThan(html.indexOf('aria-label="Welcome and 1 more"'));
  });

  it("has no separator for one group", () => {
    expect(list(GROUPS.slice(0, 1))).not.toContain("doan-menu-sep");
  });

  it("keeps the canvas numbers, gives the active row the one tab stop and marks the playing row with the Eye", () => {
    const html = list(GROUPS);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/<div role="option" aria-current="location" tabindex="0" class="doan-menu-item doan-frame-row"><span class="doan-frame-num">3<\/span><span class="doan-frame-name" data-state="closed" data-slot="tooltip-trigger">Checkout<\/span><span class="doan-frame-current" data-state="closed" data-slot="tooltip-trigger"><svg[^>]*class="lucide lucide-eye"[^>]*>.*?<\/svg><span class="sr-only">Playing<\/span><\/span><\/div>/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html.match(/doan-frame-current/g)).toHaveLength(1);
    expect(list(GROUPS, "settings")).toMatch(/tabindex="0" class="doan-menu-item doan-frame-row"><span class="doan-frame-num">9<\/span><span class="doan-frame-name"[^>]*>Settings</);
  });
});

describe("FrameRowMarks", () => {
  const marks = (current: string | null, prototype: boolean) => renderToStaticMarkup(<FrameRowMarks current={current} prototype={prototype} />);

  it("shows the current row as a 14 px Eye with its word for assistive technology, before the Prototype mark", () => {
    const html = marks("Viewing", true);
    expect(html).toMatch(/^<span class="doan-frame-current" data-state="closed" data-slot="tooltip-trigger"><svg[^>]*class="lucide lucide-eye"[^>]*>.*?<\/svg><span class="sr-only">Viewing<\/span><\/span>/);
    expect(html).toMatch(/<span class="doan-frame-current prototype-meta-icon" data-state="closed" data-slot="tooltip-trigger"><svg[^>]*class="lucide lucide-play"[^>]*>.*?<\/svg><span class="sr-only">Prototype<\/span><\/span>$/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("shows nothing for a row that is neither", () => {
    expect(marks(null, false)).toBe("");
    expect(marks(null, true)).toContain("lucide-play");
    expect(marks(null, true)).not.toContain("lucide-eye");
  });
});

describe("the marks' styles", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  it("draws both marks as 14 px icons in metadata ink that do not shrink, replacing the words' captions", () => {
    expect(css).toMatch(/\.doan-frame-current \{ flex: none; display: inline-flex; align-items: center; color: var\(--text-metadata\); \}/);
    expect(css).toMatch(/\.doan-frame-current svg \{ width: var\(--size-icon-sm\); height: var\(--size-icon-sm\); \}/);
    expect(css).not.toMatch(/\.doan-frame-viewing/);
  });
});
