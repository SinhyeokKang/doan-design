import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TooltipProvider } from "../components/ui/tooltip";
import { NO_LAYERS, type HostLayers } from "./host";
import { WindowShell, type ShellProps } from "./PrototypeWindow";
import type { ShownView } from "./view";

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html";
const view = (over: Partial<ShownView> = {}): ShownView => ({
  gen: 2, frame: "checkout", title: "Checkout", phase: "ready", run: { url: A, markWidth: 390 }, frames: [{ id: "checkout", title: "Checkout", size: "390x844" }], canGoBack: true, canGoForward: false, ...over,
});
const ready: HostLayers = { frames: [{ gen: 2, url: A }], visible: 2, snapshot: null };
const noop = () => {};
const markup = (over: Partial<ShellProps> = {}) => renderToStaticMarkup(<TooltipProvider><WindowShell view={view()} layers={ready} readingShown={false} details={false} live=""
  onBack={noop} onForward={noop} onReload={noop} onChoose={noop} onClose={noop} onDetails={noop} {...over} /></TooltipProvider>);
const tag = (html: string, marker: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*${marker}[^>]*>`))?.[0] ?? "";

describe("WindowShell header", () => {
  test("Back, Forward, Reload, then the frame name, all before the content", () => {
    const html = markup();
    const order = ['aria-label="Back"', 'aria-label="Forward"', 'aria-label="Reload prototype"', 'class="shell-search pw-name"', "<iframe"].map(marker => html.indexOf(marker));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<header class="top shell-top pw-top"><span class="traffic-space" aria-hidden="true"><\/span><div class="shell-history">/);
  });

  test("disables the history direction without an entry; Reload stays", () => {
    const html = markup();
    expect(tag(html, 'aria-label="Back"')).not.toContain("disabled");
    expect(tag(html, 'aria-label="Forward"')).toContain("disabled");
    expect(tag(html, 'aria-label="Reload prototype"')).not.toContain("disabled");
  });

  test("the name button shows the playing frame's name and opens a list", () => {
    const html = markup();
    expect(tag(html, "pw-name")).toContain('aria-haspopup="listbox"');
    expect(html).toContain('<span class="pw-name-text">Checkout</span>');
    expect(tag(html, "pw-name")).not.toContain("title=");
  });

  test("before any view only the disabled history and Reload show", () => {
    const html = markup({ view: null, layers: NO_LAYERS });
    expect(html).not.toContain("pw-name");
    for (const label of ["Back", "Forward", "Reload prototype"]) expect(tag(html, `aria-label="${label}"`)).toContain("disabled");
  });
});

describe("WindowShell content", () => {
  test("the run's iframe is sandboxed to scripts and forms and takes no input under a state", () => {
    const html = markup();
    const frame = tag(html, 'class="pw-frame"');
    expect(frame).toContain('sandbox="allow-scripts allow-forms"');
    expect(frame).toContain(`src="${A}"`);
    expect(frame).toContain("visibility:visible");
    expect(tag(html, 'class="pw-content"')).not.toContain("inert");
    expect(tag(markup({ view: view({ phase: "frame-unavailable" }) }), 'class="pw-content"')).toContain("inert");
  });

  test("a loading run stays hidden under the previous screen", () => {
    const html = markup({ view: view({ gen: 3, phase: "loading" }), layers: { frames: [{ gen: 2, url: A }, { gen: 3, url: A }], visible: 2, snapshot: null } });
    expect(html.match(/visibility:(visible|hidden)/g)).toEqual(["visibility:visible", "visibility:hidden"]);
  });

  test("main's still image takes the iframe's place, decorative", () => {
    const html = markup({ view: view({ phase: "frame-unavailable" }), layers: { frames: [], visible: null, snapshot: { gen: 2, url: "blob:still" } } });
    expect(html).not.toContain("<iframe");
    expect(tag(html, "pw-snapshot")).toMatch(/src="blob:still"[^>]*alt=""/);
  });

  test("the polite live region is always mounted, outside the overlay", () => {
    for (const over of [{}, { view: view({ phase: "loading" }) }, { view: null }] as Partial<ShellProps>[]) {
      expect(markup(over)).toMatch(/<p class="sr-only" role="status" aria-live="polite">[^<]*<\/p><\/div>$/);
    }
    expect(markup({ live: "Frame unavailable. Gone." })).toContain('aria-live="polite">Frame unavailable. Gone.</p>');
  });
});

describe("WindowShell states", () => {
  test("loading shows the reading line on the blur only once it is due", () => {
    expect(markup({ view: view({ phase: "loading" }) })).not.toContain("problem-overlay");
    const html = markup({ view: view({ phase: "loading" }), readingShown: true });
    expect(html).toContain('<div class="problem-overlay reading"><p class="problem-reading"><span class="doan-spinner" aria-hidden="true"></span>Loading prototype</p></div>');
    // The live region speaks; the line itself has no status role.
    expect(tag(html, "problem-reading")).not.toContain("role=");
  });

  test("a failure has an h2 title the scene names, Retry, Close and Details", () => {
    const html = markup({ view: view({ phase: "read-failed", detail: "EACCES: permission denied" }) });
    expect(html).toContain('<div class="problem-scene" role="group" aria-labelledby="prototype-state-heading">');
    expect(html).toContain('<h2 id="prototype-state-heading" tabindex="-1" aria-describedby="prototype-state-line">Couldn’t open this prototype</h2>');
    expect(html).toContain('<p id="prototype-state-line" class="selectable">Doan couldn’t read the canvas file for this frame.</p>');
    expect([...html.matchAll(/<button[^>]*class="doan-button[^"]*"[^>]*>([^<]*)/g)].map(match => match[1])).toEqual(["Retry", "Close", "Details ▸"]);
    expect(html).toMatch(/data-ui-variant="prominent" data-ui-size="sm">Retry/);
    expect(html).toMatch(/data-ui-variant="subtle" data-ui-size="sm">Close/);
    expect(html).not.toContain("problem-detail");
    const open = markup({ view: view({ phase: "read-failed", detail: "EACCES: permission denied" }), details: true });
    expect(open).toContain('aria-expanded="true">Details ▾');
    expect(open).toContain('<pre class="problem-detail selectable">EACCES: permission denied</pre>');
  });

  test("a lost frame or mark offers Close only, and the header stays outside the overlay", () => {
    for (const phase of ["frame-unavailable", "prototype-unavailable"] as const) {
      const html = markup({ view: view({ phase }) });
      expect([...html.matchAll(/<button[^>]*class="doan-button[^"]*"[^>]*>([^<]*)/g)].map(match => match[1])).toEqual(["Close"]);
      expect(html.indexOf("pw-name")).toBeLessThan(html.indexOf("problem-overlay"));
    }
  });

  test("a running prototype has no overlay", () => {
    expect(markup()).not.toContain("problem-overlay");
  });
});

describe("prototype window styles", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  test("the overlay covers the content panel only, opaque under Reduce transparency", () => {
    expect(css).toMatch(/\.pw-panel > \.problem-overlay \{[^}]*position: absolute; inset: 0;[^}]*background: color-mix\(in srgb, var\(--surface-panel\) 60%, transparent\);[^}]*backdrop-filter: blur\(var\(--blur-sm\)\);/);
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{ \.pw-panel > \.problem-overlay \{ background: var\(--surface-panel\);/);
  });

  test("the panel sits 8px inside the window under a --size-chrome header, as fit.ts sizes the window", () => {
    expect(css).toMatch(/\.pw \{[^}]*grid-template-rows: var\(--size-chrome\) minmax\(0, 1fr\); padding: 0 var\(--space-2\) var\(--space-2\);/);
  });
});
