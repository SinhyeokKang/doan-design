import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { TooltipContent, TooltipProvider } from "../components/ui/tooltip";
import { moveBetweenTools } from "../toolbarKeys";
import { NO_LAYERS, type HostLayers } from "./host";
import { viewportStyles, WindowShell, type ShellConversation, type ShellProps } from "./PrototypeWindow";
import { EMPTY_DRAWER } from "./view";
import type { PrototypeView } from "../../main/prototype/ipc";
import { PROTOTYPE_HEADER_RIGHT, prototypeViewportBox } from "../../main/prototype/fit";

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html";
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 2, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "ready", mode: "fit", run: { url: A, markWidth: 390, markHeight: 844 }, frames: [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }], canGoBack: true, canGoForward: false, previousStopped: false, panel: { open: false, width: null }, canvasRow: "present", ...over,
});
const ready: HostLayers = { frames: [{ gen: 2, url: A, markWidth: 390, markHeight: 844 }], visible: 2, snapshot: null };
const noop = () => {};
const props = (over: Partial<ShellProps> = {}): ShellProps => ({ view: view(), layers: ready, readingShown: false, details: false, live: "", width: 640, menuOpen: false, exporting: false,
  onBack: noop, onExport: noop, onForward: noop, onReload: noop, onReloadPress: noop, onReloadClick: noop, onMode: noop, onMenuOpen: noop, onChoose: noop, onClose: noop, onDetails: noop, ...over });
const markup = (over: Partial<ShellProps> = {}) => renderToStaticMarkup(<TooltipProvider><WindowShell {...props(over)} /></TooltipProvider>);
const tag = (html: string, marker: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*${marker}[^>]*>`))?.[0] ?? "";

// WindowShell holds no hooks, so calling it gives its element tree; this walks children only, so no component (and no
// Radix hook) runs.
type El = ReactElement<Record<string, unknown>>;
const tree = (over: Partial<ShellProps> = {}) => WindowShell(props(over)) as El;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
// The element types and keys from the root down to the first element that matches: React keeps an element (and its
// focus) only while this path stays the same.
function path(node: ReactNode, match: (element: El) => boolean): string[] | null {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) { const found = path(child, match); if (found) return [`#${index}`, ...found]; }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  const name = typeof node.type === "string" ? node.type : (node.type as { displayName?: string; name?: string }).displayName ?? (node.type as { name?: string }).name ?? "?";
  const self = `${name}${node.key === null ? "" : `[${node.key}]`}`;
  if (match(node)) return [self];
  const below = path(node.props.children as ReactNode, match);
  return below ? [self, ...below] : null;
}
const labelled = (label: string) => (element: El) => element.type === "button" && element.props["aria-label"] === label;
const button = (node: ReactNode, label: string) => all(node).find(labelled(label))!;
const strip = (html: string) => html.replace(/<([a-z0-9]+)[^>]*>/g, "<$1>").replace(/>[^<]+</g, "><");

describe("WindowShell header", () => {
  test("Back, Forward, Reload, the frame name, then the right group's Fit, Responsive and Export, all before the content", () => {
    const html = markup();
    const order = ['aria-label="Back"', 'aria-label="Forward"', 'aria-label="Reload prototype"', 'class="shell-search pw-name"', 'class="pw-right"', 'aria-label="Fit"', 'aria-label="Responsive"', 'aria-label="Export prototype"', "<iframe"].map(marker => html.indexOf(marker));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<header class="top shell-top pw-top"><span class="traffic-space" aria-hidden="true"><\/span><div class="shell-history">/);
    // The right group is the toggle, then Export (R 140 with the conversation button).
    expect(html).toMatch(/<div class="pw-right"><div class="doan-toggle-group" role="group" aria-label="Viewport">.*?<\/div><button type="button" class="doan-icon-button" data-ui-placement="chrome" aria-label="Export prototype"/);
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

  // Focus stays on the name button when the empty drawer opens, so the button itself is described by the sentence.
  test("with no marked frame the name button is described by the drawer's sentence", () => {
    const html = markup({ view: view({ frames: [] }) });
    const id = /aria-describedby="([^"]+)"/.exec(tag(html, "pw-name"))?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`id="${id}">${EMPTY_DRAWER}</span>`);
    expect(tag(markup(), "pw-name")).not.toContain("aria-describedby");
  });

  test("with no marked frame the name opens a dialog of one line, not a listbox", () => {
    expect(tag(markup({ view: view({ frames: [] }) }), "pw-name")).toContain('aria-haspopup="dialog"');
  });

  test("before any view only the disabled history, Reload and toggle show, with nothing pressed and no Tab stop", () => {
    const html = markup({ view: null, layers: NO_LAYERS });
    expect(html).not.toContain("pw-name");
    for (const label of ["Back", "Forward", "Reload prototype", "Fit", "Responsive"]) expect(tag(html, `aria-label="${label}"`)).toContain("disabled");
    for (const label of ["Fit", "Responsive"]) {
      expect(tag(html, `aria-label="${label}"`)).toContain('aria-pressed="false"');
      expect(tag(html, `aria-label="${label}"`)).toContain('tabindex="-1"');
    }
  });
});

describe("the viewport toggle", () => {
  test("a group named Viewport of two chrome icon buttons; only the view's mode is pressed and holds the Tab stop", () => {
    for (const [mode, pressed, other] of [["fit", "Fit", "Responsive"], ["responsive", "Responsive", "Fit"]] as const) {
      const html = markup({ view: view({ mode }) });
      expect(tag(html, `aria-label="${pressed}"`)).toMatch(/class="doan-icon-button" data-ui-placement="chrome"[^>]*aria-pressed="true"[^>]*tabindex="0"/);
      expect(tag(html, `aria-label="${other}"`)).toMatch(/class="doan-icon-button" data-ui-placement="chrome"[^>]*aria-pressed="false"[^>]*tabindex="-1"/);
      expect(tag(html, `aria-label="${pressed}"`)).not.toContain("disabled");
      expect(tag(html, `aria-label="${other}"`)).not.toContain("disabled");
    }
  });

  test("its tooltips name the frame's size for Fit, and the mode alone for Responsive", () => {
    const tips = (over: Partial<ShellProps>) => all(tree(over)).filter(element => element.type === TooltipContent).map(element => element.props.children);
    expect(tips({})).toEqual(expect.arrayContaining(["Fit 390 × 844 to the window", "Responsive"]));
    expect(tips({ view: null, layers: NO_LAYERS })).toEqual(expect.arrayContaining(["Fit to the window", "Responsive"]));
  });

  test("←/→ walk between the toggle's two items only, with the shared roving move", () => {
    const group = all(tree()).find(element => element.props.role === "group" && element.props["aria-label"] === "Viewport")!;
    expect(group.props.onKeyDown).toBe(moveBetweenTools);
    expect(all(group).filter(element => element.type === "button").map(element => element.props["aria-label"])).toEqual(["Fit", "Responsive"]);
  });

  test("a click asks main for the other mode; the pressed item stays as it is", () => {
    const onMode = vi.fn();
    const shell = tree({ onMode });
    (button(shell, "Responsive").props.onClick as () => void)();
    (button(shell, "Fit").props.onClick as () => void)();
    expect(onMode).toHaveBeenCalledExactlyOnceWith("responsive");
  });

  test("a focused item stays the same element when its press changes and when the first view enables it", () => {
    for (const label of ["Fit", "Responsive", "Reload prototype"]) {
      const fit = path(tree(), labelled(label));
      expect(fit).not.toBeNull();
      expect(path(tree({ view: view({ mode: "responsive" }) }), labelled(label))).toEqual(fit);
      expect(path(tree({ view: null, layers: NO_LAYERS }), labelled(label))).toEqual(fit);
    }
  });
});

describe("pointer presses in the header", () => {
  // A pointer press leaves focus where it was (in the frame), so the keys typed next still reach the frame.
  test("Reload, Fit and Responsive keep focus on mousedown; Reload also tells the window of a primary-button press", () => {
    const onReloadPress = vi.fn();
    const shell = tree({ onReloadPress });
    for (const label of ["Reload prototype", "Fit", "Responsive"]) {
      const event = { button: 0, preventDefault: vi.fn() };
      (button(shell, label).props.onMouseDown as (event: unknown) => void)(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    expect(onReloadPress).toHaveBeenCalledOnce();
  });

  test("a right or middle press on Reload is not a Reload press", () => {
    const onReloadPress = vi.fn();
    const reload = button(tree({ onReloadPress }), "Reload prototype");
    for (const which of [1, 2]) (reload.props.onMouseDown as (event: unknown) => void)({ button: which, preventDefault: vi.fn() });
    expect(onReloadPress).not.toHaveBeenCalled();
  });

  // A click a key sends has detail 0; a pointer's counts its presses.
  test("the header's Reload says whether a pointer clicked it; the failure scene's Retry reloads as before", () => {
    const onReload = vi.fn(), onReloadClick = vi.fn();
    const shell = tree({ view: view({ phase: "init-failed" }), onReload, onReloadClick });
    const click = button(shell, "Reload prototype").props.onClick as (event: unknown) => void;
    click({ detail: 1 });
    click({ detail: 0 });
    expect(onReloadClick.mock.calls).toEqual([[true], [false]]);
    expect(all(shell).find(element => element.type === "button" && element.props.children === "Retry")!.props.onClick).toBe(onReload);
  });
});

describe("Export prototype", () => {
  test("a 32 chrome icon button with a Download glyph after the toggle, named and tipped Export prototype", () => {
    const html = markup();
    expect(tag(html, 'aria-label="Export prototype"')).toMatch(/^<button type="button" class="doan-icon-button" data-ui-placement="chrome" aria-label="Export prototype" data-state="closed" data-slot="tooltip-trigger">$/);
    expect(html).toContain('aria-label="Export prototype" data-state="closed" data-slot="tooltip-trigger"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download"');
    const tips = all(tree()).filter(element => element.type === TooltipContent).map(element => element.props.children);
    expect(tips).toContain("Export prototype");
  });

  test("before the first view it is disabled with no reason and no Tab stop", () => {
    const html = markup({ view: null, layers: NO_LAYERS });
    expect(tag(html, 'aria-label="Export prototype"')).toContain("disabled");
    expect(tag(html, 'aria-label="Export prototype"')).not.toContain("aria-disabled");
    expect(html).not.toContain("prototype-export-reason");
  });

  test("an unavailable Export keeps its Tab stop and names its reason as an sr-only description and its tooltip", () => {
    for (const [over, reason] of [
      [{ view: view({ phase: "read-failed" }) }, "Can’t read this canvas."],
      [{ view: view({ phase: "frame-unavailable" }) }, "Export isn’t available while this prototype can’t play."],
      [{ view: view({ phase: "prototype-unavailable" }) }, "Export isn’t available while this prototype can’t play."],
      [{ exporting: true }, "Exporting"],
    ] as const) {
      const html = markup(over);
      const button = tag(html, 'aria-label="Export prototype"');
      expect(button, reason).toContain('aria-disabled="true"');
      expect(button, reason).toContain('aria-describedby="prototype-export-reason"');
      expect(button, reason).not.toMatch(/ disabled/);
      expect(html, reason).toContain(`<span class="sr-only" id="prototype-export-reason">${reason}</span>`);
      expect(all(tree(over)).filter(element => element.type === TooltipContent).map(element => element.props.children), reason).toContain(reason);
    }
  });

  test("a click exports only while available", () => {
    const onExport = vi.fn();
    for (const over of [{}, { view: view({ phase: "loading" }) }, { view: view({ phase: "init-failed" }) }]) (button(tree({ ...over, onExport }), "Export prototype").props.onClick as () => void)();
    expect(onExport).toHaveBeenCalledTimes(3);
    onExport.mockClear();
    for (const over of [{ view: view({ phase: "read-failed" }) }, { exporting: true }, { view: view({ phase: "frame-unavailable" }) }]) (button(tree({ ...over, onExport }), "Export prototype").props.onClick as () => void)();
    expect(onExport).not.toHaveBeenCalled();
  });

  // POSTMORTEM 2026-11-13: a control that turns unavailable while focused must stay the same element.
  test("stays the same element whether available, unavailable, exporting or before the first view", () => {
    const at = path(tree(), labelled("Export prototype"));
    expect(at).not.toBeNull();
    for (const over of [{ exporting: true }, { view: view({ phase: "read-failed" }) }, { view: view({ phase: "frame-unavailable" }) }, { view: null, layers: NO_LAYERS }, { width: 360 }]) {
      expect(path(tree(over), labelled("Export prototype")), JSON.stringify(over)).toEqual(at);
    }
  });

  test("a pointer press keeps focus where it was", () => {
    const event = { button: 0, preventDefault: vi.fn() };
    (button(tree(), "Export prototype").props.onMouseDown as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  test("the result toast sits after the content and the header, so it never comes before Export in the Tab order", () => {
    const html = markup({ toast: <div className="toast">Exported</div> });
    expect(html.indexOf('class="toast"')).toBeGreaterThan(html.indexOf("<iframe"));
    expect(html.indexOf('class="toast"')).toBeGreaterThan(html.indexOf('aria-label="Export prototype"'));
  });
});

describe("the name's row", () => {
  test("the window's width alone decides it: first row from R + 304 (444), the second below, before any view too", () => {
    expect(tag(markup({ width: 640 }), 'class="pw')).toMatch(/^<div class="pw"/);
    expect(tag(markup({ width: 444 }), 'class="pw')).toMatch(/^<div class="pw"/);
    expect(tag(markup({ width: 443 }), 'class="pw')).toMatch(/^<div class="pw name-row"/);
    expect(tag(markup({ width: 360, view: null, layers: NO_LAYERS }), 'class="pw')).toMatch(/^<div class="pw name-row"/);
  });


  test("the capsule never moves in the tree, so focus and an open menu stay on it across rows", () => {
    const isMenu = (element: El) => (element.type as { name?: string }).name === "FrameMenu";
    const first = path(tree({ width: 640 }), isMenu);
    expect(first).not.toBeNull();
    expect(path(tree({ width: 360 }), isMenu)).toEqual(first);
  });
});

describe("Esc over a header tooltip", () => {
  const tipEscapes = (shell: El) => [
    ...all(shell).filter(element => element.type === TooltipContent).map(element => element.props.onEscapeKeyDown as (event: unknown) => void),
    // The cut name's tooltip lives in FrameMenu, which takes the same handler.
    all(shell).find(element => (element.type as { name?: string }).name === "FrameMenu")!.props.onTipEscape as (event: unknown) => void,
  ];

  test("with the frame menu open, every header tooltip's Esc also closes the menu and puts focus on the name", () => {
    const onMenuOpen = vi.fn(), focus = vi.fn();
    const escapes = tipEscapes(tree({ menuOpen: true, onMenuOpen, name: { current: { focus } as never } }));
    // Reload, Fit, Responsive, Export, the conversation button and the name.
    expect(escapes).toHaveLength(6);
    for (const escape of escapes) {
      onMenuOpen.mockClear(); focus.mockClear();
      const event = { defaultPrevented: false, preventDefault: vi.fn() };
      escape(event);
      expect(onMenuOpen).toHaveBeenCalledExactlyOnceWith(false);
      expect(focus).toHaveBeenCalledOnce();
      // Radix closes the tooltip itself on the same press.
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  test("with the menu closed, Esc closes only the tooltip", () => {
    const onMenuOpen = vi.fn(), focus = vi.fn();
    for (const escape of tipEscapes(tree({ menuOpen: false, onMenuOpen, name: { current: { focus } as never } }))) escape({ defaultPrevented: false, preventDefault: vi.fn() });
    expect(onMenuOpen).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  test("the menu's open state is the shell's, passed in", () => {
    const onMenuOpen = vi.fn();
    const menu = all(tree({ menuOpen: true, onMenuOpen })).find(element => (element.type as { name?: string }).name === "FrameMenu")!;
    expect(menu.props.open).toBe(true);
    expect(menu.props.onOpenChange).toBe(onMenuOpen);
  });
});

describe("WindowShell content", () => {
  test("the run's iframe is sandboxed to scripts and forms and takes no input under a state", () => {
    const html = markup();
    const frame = tag(html, 'class="pw-frame"');
    expect(frame).toContain('sandbox="allow-scripts allow-forms"');
    expect(frame).toContain(`src="${A}"`);
    expect(tag(html, 'class="pw-box"')).toContain("visibility:visible");
    expect(tag(html, 'class="pw-content"')).not.toContain("inert");
    expect(tag(markup({ view: view({ phase: "frame-unavailable" }) }), 'class="pw-content"')).toContain("inert");
  });

  test("a loading run stays hidden under the previous screen", () => {
    const html = markup({ view: view({ gen: 3, phase: "loading" }), layers: { frames: [{ gen: 2, url: A, markWidth: 390, markHeight: 844 }, { gen: 3, url: A, markWidth: 390, markHeight: 844 }], visible: 2, snapshot: null } });
    expect(html.match(/visibility:(visible|hidden)/g)).toEqual(["visibility:visible", "visibility:hidden"]);
  });

  test("each iframe sits in its own clip box and keeps its own run's mark as its viewport", () => {
    const html = markup({ view: view({ gen: 3, phase: "loading", run: { url: A, markWidth: 240, markHeight: 400 } }), layers: { frames: [{ gen: 2, url: A, markWidth: 390, markHeight: 844 }, { gen: 3, url: A, markWidth: 240, markHeight: 400 }], visible: 2, snapshot: null } });
    expect(html.match(/<div class="pw-box"[^>]*><iframe/g)).toHaveLength(2);
    expect(html).toMatch(/<div class="pw-content"[^>]*><div class="pw-stage"><div class="pw-box"/);
    const frames = html.match(/<iframe[^>]*>/g)!;
    expect(frames[0]).toMatch(/width:390px;height:844px/);
    expect(frames[1]).toMatch(/width:240px;height:400px/);
  });

  test("Fit grounds the panel around the frame; Responsive and no view leave the panel's own fill", () => {
    expect(tag(markup(), 'class="pw-content"')).toContain('data-mode="fit"');
    expect(tag(markup({ view: view({ mode: "responsive" }) }), 'class="pw-content"')).toContain('data-mode="responsive"');
    expect(tag(markup({ view: null, layers: NO_LAYERS }), 'class="pw-content"')).not.toContain("data-mode");
  });

  test("switching the mode keeps every element, so the iframes are only resized, never loaded again", () => {
    const loading: Partial<ShellProps> = { view: view({ gen: 3, phase: "loading" }), layers: { frames: [{ gen: 2, url: A, markWidth: 390, markHeight: 844 }, { gen: 3, url: A, markWidth: 390, markHeight: 844 }], visible: 2, snapshot: null } };
    expect(strip(markup({ ...loading, view: view({ gen: 3, phase: "loading", mode: "responsive" }) }))).toBe(strip(markup(loading)));
    expect(strip(markup({ view: view({ mode: "responsive" }) }))).toBe(strip(markup()));
  });

  test("the still image stays at the box main took it from, in either mode", () => {
    const still: HostLayers = { frames: [], visible: null, snapshot: { gen: 2, url: "blob:still", box: { x: 165, y: 0, width: 293, height: 636 } } };
    for (const mode of ["fit", "responsive"] as const) {
      const html = markup({ view: view({ phase: "init-failed", mode }), layers: still });
      expect(html).toMatch(/<div class="pw-box" style="left:165px;top:0;width:293px;height:636px[^"]*"><img class="pw-snapshot"/);
    }
  });

  test("main's still image takes the iframes' place, decorative, only while no run is on screen", () => {
    const html = markup({ view: view({ phase: "frame-unavailable" }), layers: { frames: [], visible: null, snapshot: { gen: 2, url: "blob:still", box: { x: 0, y: 0, width: 390, height: 844 } } } });
    expect(html).not.toContain("<iframe");
    expect(tag(html, "pw-snapshot")).toMatch(/src="blob:still"[^>]*alt=""/);
    // Reloading: the previous run stays on screen and live; the image waits behind nothing.
    const reloading = markup({ view: view({ gen: 3, phase: "loading" }), layers: { frames: [{ gen: 2, url: A, markWidth: 390, markHeight: 844 }, { gen: 3, url: A, markWidth: 390, markHeight: 844 }], visible: 2, snapshot: { gen: 3, url: "blob:still", box: { x: 0, y: 0, width: 390, height: 844 } } } });
    expect(reloading).not.toContain("pw-snapshot");
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

  test("while an overlay makes the content inert, Reload and the toggle stay usable in the header", () => {
    for (const phase of ["loading", "init-failed", "frame-unavailable"] as const) {
      const html = markup({ view: view({ phase }) });
      expect(tag(html, 'class="pw-content"')).toContain("inert");
      for (const label of ["Reload prototype", "Fit", "Responsive"]) {
        expect(tag(html, `aria-label="${label}"`)).toMatch(/^<button/);
        expect(tag(html, `aria-label="${label}"`)).not.toContain("disabled");
      }
      expect(html.indexOf('aria-label="Responsive"')).toBeGreaterThan(0);
      expect(html.indexOf('aria-label="Responsive"')).toBeLessThan(html.indexOf('class="pw-panel"'));
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

  test("the name's second row makes the header 56 + 36 + 8 and spans the header's insets at y56", () => {
    expect(css).toMatch(/\.pw\.name-row \{ grid-template-rows: calc\(var\(--size-chrome\) \+ 36px \+ var\(--space-2\)\) minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.pw\.name-row \.pw-name \{ top: var\(--size-chrome\); left: var\(--space-2\); right: var\(--space-2\); \}/);
  });

  test("the first-row name ends 8 before the right group, which sits 16 in from the window's edge; no narrow-window rule", () => {
    expect(css).toMatch(/\.pw-name \{[^}]*right: calc\(2 \* var\(--space-2\) \+ var\(--pw-right\)\);/);
    expect(css).toMatch(/\.pw-right \{[^}]*position: absolute; top: 0; right: var\(--space-2\);[^}]*gap: var\(--space-1\);[^}]*height: var\(--size-chrome\);/);
    expect(css).not.toMatch(/519\.98px/);
  });

  // An unavailable Export stays focusable (aria-disabled, not disabled), so the shared rules for :disabled never reach
  // it: it takes the disabled ink and not-allowed cursor itself, and no fill under the pointer or while pressed. The
  // shared chrome pressed rule counts its :is() by its most specific argument ([aria-haspopup][aria-expanded]), so the
  // Export's rule must outweigh it, not only follow it.
  test("an unavailable Export takes the disabled ink, a not-allowed cursor and no hover or pressed fill", () => {
    expect(css).toMatch(/\.pw-right > \.doan-icon-button\[aria-disabled="true"\] \{ color: var\(--text-disabled\); cursor: not-allowed; \}/);
    const none = css.match(/^([^{}\n]*\.pw-right > \.doan-icon-button\[aria-disabled="true"\]:is\(:hover, :active\)) \{ background: transparent; \}$/m)?.[1];
    expect(none).toBeDefined();
    const controls = readFileSync(new URL("../ds/controls.css", import.meta.url), "utf8");
    const chrome = [/^\s*(\.doan-icon-button\[data-ui-placement="chrome"\]:hover:not\(:disabled\)) \{ background:/m, /^\s*(\.doan-icon-button\[data-ui-placement="chrome"\]:is\(:active,[^{]*\)) \{ background:/m]
      .map(rule => controls.match(rule)?.[1]);
    expect(chrome.every(selector => selector !== undefined)).toBe(true);
    for (const selector of chrome) expect(compareSpecificity(specificity(none!), specificity(selector!)), selector).toBeGreaterThan(0);
  });

  // Main fits and captures the window by the same width, so the two must change together.
  test("the stylesheet's right group is the width main fits by", () => {
    expect(css).toContain(`:root { --pw-right: ${PROTOTYPE_HEADER_RIGHT}px; }`);
  });

  // A box that only hides its overflow still scrolls to show a focused control inside a scaled frame, which would move
  // the frame off its box. The panel's own corners are split between two clips (exportViewer.test.ts pins the shape).
  test("the content, the stage and each frame's box clip instead of hiding overflow; the frame scales from its top-left", () => {
    expect(css).toMatch(/\.pw-content \{[^}]*overflow: clip;/);
    expect(css).toMatch(/\.pw-stage \{[^}]*overflow: clip;/);
    expect(css).toMatch(/\.pw-box \{[^}]*position: absolute;[^}]*overflow: clip;/);
    expect(css).toMatch(/\.pw-frame \{[^}]*transform-origin: 0 0;/);
    expect(css).toMatch(/\.pw-content\[data-mode="fit"\] > \.pw-stage \{ background: var\(--surface-inset\); \}/);
    expect(css).toMatch(/\.pw-content\[data-mode="fit"\] \.pw-box \{ box-shadow: var\(--shadow-panel\); \}/);
  });

  // The panel no longer clips, so the overlay rounds its own corners over the panel's.
  test("the state overlay keeps the panel's corners", () => {
    expect(css).toMatch(/\.pw-panel > \.problem-overlay \{[^}]*border-radius: inherit;/);
  });
});

describe("viewportStyles", () => {
  test("clips to the whole-pixel visible box and scales the iframe at its CSS size from its top-left", () => {
    const box = prototypeViewportBox({ width: 344, height: 800 }, { width: 390, height: 844 }, "fit");
    expect(viewportStyles(box)).toEqual({ clip: { left: 0, top: 28, width: 344, height: 744 }, frame: { width: 390, height: 844, transform: `scale(${344 / 390})` } });
  });

  test("Responsive fills the panel at scale 1", () => {
    const box = prototypeViewportBox({ width: 624, height: 636 }, { width: 390, height: 844 }, "responsive");
    expect(viewportStyles(box)).toEqual({ clip: { left: 0, top: 0, width: 624, height: 636 }, frame: { width: 624, height: 636, transform: "scale(1)" } });
  });
});

// Selector specificity as CSS Selectors 4 counts it, for the selectors this file checks: ids, then classes, attributes
// and pseudo-classes, then types and pseudo-elements. :is(), :not() and :has() count their most specific argument,
// :where() nothing.
type Specificity = [number, number, number];
function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
function splitTop(list: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  return [...parts, list.slice(start)];
}
function specificity(selector: string): Specificity {
  const total: Specificity = [0, 0, 0];
  const ident = /^-?[_a-zA-Z][-_a-zA-Z0-9]*/;
  let i = 0;
  const closing = (open: string, close: string) => {
    let depth = 0, quote: string | null = null;
    for (let j = i; j < selector.length; j++) {
      const char = selector[j]!;
      if (quote !== null) { if (char === quote) quote = null; continue; }
      if (char === '"' || char === "'") quote = char;
      else if (char === open) depth++;
      else if (char === close && --depth === 0) return j;
    }
    throw new Error(`unclosed ${open} in ${selector}`);
  };
  while (i < selector.length) {
    const char = selector[i]!;
    if (char === "#") { total[0]++; i += 1 + (selector.slice(i + 1).match(ident)?.[0].length ?? 0); }
    else if (char === ".") { total[1]++; i += 1 + (selector.slice(i + 1).match(ident)?.[0].length ?? 0); }
    else if (char === "[") { total[1]++; i = closing("[", "]") + 1; }
    else if (selector.startsWith("::", i)) { total[2]++; i += 2 + (selector.slice(i + 2).match(ident)?.[0].length ?? 0); }
    else if (char === ":") {
      const name = selector.slice(i + 1).match(ident)?.[0] ?? "";
      i += 1 + name.length;
      if (selector[i] !== "(") { total[1]++; continue; }
      const end = closing("(", ")");
      const inner = selector.slice(i + 1, end);
      i = end + 1;
      if (name === "where") continue;
      if (name === "is" || name === "not" || name === "has") {
        const most = splitTop(inner).map(part => specificity(part.trim())).reduce((a, b) => (compareSpecificity(a, b) >= 0 ? a : b));
        for (const k of [0, 1, 2] as const) total[k] += most[k];
      } else total[1]++;
    } else if (/[a-zA-Z]/.test(char)) { total[2]++; i += selector.slice(i).match(ident)?.[0].length ?? 1; }
    else i++;
  }
  return total;
}

describe("specificity (the test's own helper)", () => {
  test("counts :is() and :not() by their most specific argument", () => {
    expect(specificity('.doan-icon-button[data-ui-placement="chrome"]:hover:not(:disabled)')).toEqual([0, 4, 0]);
    expect(specificity('.doan-icon-button[data-ui-placement="chrome"]:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled)')).toEqual([0, 5, 0]);
    expect(specificity('.pw-right > .doan-icon-button[aria-disabled="true"]:is(:hover, :active)')).toEqual([0, 4, 0]);
    expect(specificity("#a div::before:where(.x)")).toEqual([1, 0, 2]);
  });
});

describe("the conversation button and column", () => {
  const conv = (over: Partial<ShellConversation> = {}): ShellConversation => ({
    button: { label: "Show conversation", badge: null, name: "Show conversation" }, open: false, width: 280, bounds: { min: 280, max: 280 },
    onToggle: noop, onResize: noop, preview: noop, ...over,
  });
  const opened = conv({ open: true, button: { label: "Hide conversation", badge: null, name: "Hide conversation" } });

  test("the button ends the right group after Export, and the column comes after the content panel", () => {
    const html = markup({ conversation: conv() });
    const order = ['aria-label="Export prototype"', 'aria-label="Show conversation"', 'class="pw-panel"', "<iframe", 'class="doan-conv-column"', 'id="doan-conversation-panel"'].map(marker => html.indexOf(marker));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/aria-label="Export prototype".*?<\/button><button type="button" class="doan-icon-button pw-conv" data-ui-placement="chrome" aria-label="Show conversation" aria-expanded="false" aria-controls="doan-conversation-panel"/);
    expect(tag(html, 'aria-label="Show conversation"')).not.toContain("disabled");
  });

  test("before the first view it is already usable", () => {
    expect(tag(markup({ view: null, layers: NO_LAYERS, conversation: conv() }), 'aria-label="Show conversation"')).not.toContain("disabled");
    expect(tag(markup({ view: null, layers: NO_LAYERS }), 'aria-label="Show conversation"')).not.toContain("disabled");
  });

  test("open, it is Hide conversation with PanelRightClose; the column shows at the panel's width", () => {
    const html = markup({ conversation: opened });
    expect(tag(html, 'aria-label="Hide conversation"')).toContain('aria-expanded="true"');
    expect(tag(html, 'aria-label="Hide conversation"')).toContain('aria-controls="doan-conversation-panel"');
    expect(html).toContain("lucide-panel-right-close");
    expect(tag(markup({ conversation: conv() }), "pw-conv")).toBeTruthy();
    expect(markup({ conversation: conv() })).toContain("lucide-panel-right-open");
    expect(tag(html, 'class="pw')).toMatch(/data-panel="open"/);
    expect(tag(html, 'class="pw')).toContain("--pw-panel:280px");
    expect(tag(html, 'class="doan-conv-column"')).not.toContain("data-collapsed");
    expect(tag(html, 'role="separator"')).toMatch(/aria-label="Resize conversation panel" aria-valuenow="280" aria-valuemin="280" aria-valuemax="280"/);
  });

  test("folded, the column stays in the DOM out of reach, so aria-controls resolves", () => {
    const html = markup({ conversation: conv() });
    expect(tag(html, 'class="pw')).not.toContain("data-panel");
    expect(tag(html, 'class="doan-conv-column"')).toMatch(/data-collapsed="" inert=""/);
    expect(html).toContain('<aside class="right ov-right doan-conv-panel" id="doan-conversation-panel" role="region" aria-label="Conversation">');
  });

  test("badges: the answer dot, the working spinner and the unread bubble, with their names", () => {
    const permission = markup({ conversation: conv({ button: { label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" } }) });
    expect(tag(permission, "pw-conv")).toMatch(/aria-label="Show conversation, needs your answer"[^>]*data-badge="true"/);
    const working = markup({ conversation: conv({ button: { label: "Show conversation", badge: "working", name: "Show conversation, agent is working" } }) });
    expect(tag(working, "pw-conv")).toMatch(/aria-label="Show conversation, agent is working"/);
    expect(working).toContain('<span class="badge-working" aria-hidden="true"><span class="doan-spinner"></span></span>');
    const unseen = markup({ conversation: conv({ button: { label: "Show conversation", badge: "unseen", name: "Show conversation, conversation finished unread" } }) });
    expect(tag(unseen, "pw-conv")).toMatch(/data-badge="unseen"/);
    expect(unseen).toContain('class="badge-bubble"');
  });

  // POSTMORTEM 2026-11-13: a control that changes state is the same element, so focus on it survives.
  test("one button element across folded, open, every badge and no view", () => {
    const isConv = (element: El) => element.type === "button" && String(element.props.className).includes("pw-conv");
    const base = path(tree({ conversation: conv() }), isConv);
    expect(base).not.toBeNull();
    for (const over of [{ conversation: opened }, { conversation: conv({ button: { label: "Show conversation", badge: "working", name: "Show conversation, agent is working" } }) },
      { conversation: conv({ button: { label: "Show conversation", badge: "permission", name: "Show conversation, needs your answer" } }) },
      { view: null, layers: NO_LAYERS, conversation: conv() }] as Partial<ShellProps>[]) expect(path(tree(over), isConv)).toEqual(base);
  });

  test("a click toggles; a pointer press keeps focus where it was; nothing in the column closes it on Esc", () => {
    const onToggle = vi.fn();
    const shell = tree({ conversation: conv({ onToggle }) });
    const element = all(shell).find(candidate => candidate.type === "button" && String(candidate.props.className).includes("pw-conv"))!;
    (element.props.onClick as () => void)();
    expect(onToggle).toHaveBeenCalledOnce();
    const preventDefault = vi.fn();
    (element.props.onMouseDown as (event: unknown) => void)({ preventDefault, button: 0 });
    expect(preventDefault).toHaveBeenCalledOnce();
    const column = all(tree({ conversation: opened })).find(candidate => candidate.props.className === "doan-conv-column")!;
    expect(column.props.onKeyDown).toBeUndefined();
  });

  test("the body goes inside the aside", () => {
    const html = markup({ conversation: conv({ open: true, body: <div className="probe-body" /> }) });
    expect(html).toMatch(/id="doan-conversation-panel"[^>]*><div class="doan-conv-body"><div class="probe-body"><\/div><\/div><\/aside>/);
  });
});

describe("the conversation column's styles", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  test("open, the content panel keeps its start corners and the column its end corners, beside each other", () => {
    expect(css).toMatch(/\.pw\[data-panel="open"\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--pw-panel\)/);
    expect(css).toMatch(/\.pw\[data-panel="open"\]\s*>\s*\.pw-panel\s*\{[^}]*border-radius:\s*var\(--radius-container\) 0 0 var\(--radius-container\)/);
    expect(css).toMatch(/\.pw\s*>\s*\.doan-conv-column\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2/);
    expect(css).toMatch(/\.pw\s+\.right\.doan-conv-panel\s*\{[^}]*border-radius:\s*0 var\(--radius-container\) var\(--radius-container\) 0/);
  });
  test("without the head the thread and the new state start 16 below the column's top; the playing chip sits in the chip row", () => {
    expect(css).toMatch(/\.doan-conv-panel:not\(:has\(\.doan-conv-head\)\) \.thread-scroll\s*\{[^}]*padding-top:\s*var\(--space-4\)/);
    expect(css).toMatch(/\.composer-chips\s*>\s*\.pw-playing\s*\{/);
    expect(css).toMatch(/\.badge-working\s*\{[^}]*position:\s*absolute/);
  });
});
