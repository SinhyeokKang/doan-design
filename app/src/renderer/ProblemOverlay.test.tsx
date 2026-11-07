import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { FolderEntry } from "../main/view";
import { ProblemOverlay } from "./ProblemOverlay";
import { problemView, type ProblemOverlayView } from "./problemView";

// problem-project-overlay design §4.2-§4.4 and the confirmed draft (.doan/canvases/problem-project.html).
const view = (entry: FolderEntry, shown: Parameters<typeof problemView>[3]["shown"] = null, slow = false) => problemView(entry, "acme-web", "/Users/ada", { slow, shown })!;
const draw = (overlayView: ProblemOverlayView, props: Partial<Parameters<typeof ProblemOverlay>[0]> = {}) =>
  renderToStaticMarkup(<ProblemOverlay view={overlayView} details={false} pressed={null} announcement="" onAction={vi.fn()} {...props} />);
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const block = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`))?.[0] ?? "";

test("the scene: icon, a focusable heading described by its line, the path as a code chip, then the actions with the prominent one first", () => {
  const html = draw(view({ path: "/Users/ada/code/acme-web", kind: "notFound" }));
  expect(html).toMatch(/^<div class="problem-overlay"><div class="problem-scene" role="group" aria-labelledby="([^"]+)"><svg[^>]*class="lucide lucide-folder-x problem-icon"[^>]*aria-hidden="true"/);
  const heading = html.match(/<h2 id="([^"]+)" tabindex="-1" aria-describedby="([^"]+)">acme-web is missing<\/h2>/)!;
  expect(heading).not.toBeNull();
  expect(html).toContain(`aria-labelledby="${heading[1]}"`);
  expect(html).toContain(`<p id="${heading[2]}"><code>~/code/acme-web</code> was moved or deleted.</p>`);
  // The live region is always there, and nothing focusable sits between the heading and the primary action.
  expect(html).toMatch(/<\/h2><p id="[^"]+">.*?<\/p><\/div><p class="sr-only" role="status" aria-live="polite"><\/p><div class="problem-actions"><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm">Locate<\/button><button type="button" class="doan-button ghost" data-ui-size="sm">Remove from Doan<\/button><\/div>/);
  expect(html).not.toContain("Go Home");
});

test("Config error: the config file as a code chip, Show in Finder subtle, Details a toggle with its arrow and the message block", () => {
  const error = view({ path: "/Users/ada/code/acme-web", kind: "error", message: "unexpected end of JSON input" });
  const closed = draw(error);
  expect(closed).toContain("<code>.doan/config.json</code> has an error. Fix it, then retry.</p>");
  expect(closed).toContain('data-ui-variant="subtle" data-ui-size="sm">Show in Finder</button>');
  expect(closed).toContain('<button type="button" class="doan-button ghost" data-ui-size="sm" aria-expanded="false">Details ▸</button>');
  expect(closed).not.toContain("problem-detail");
  const open = draw(error, { details: true, detail: "unexpected end of JSON input" });
  expect(open).toContain('aria-expanded="true">Details ▾</button>');
  expect(open).toContain('</div><pre class="problem-detail">unexpected end of JSON input</pre></div></div>');
});

test("busy: every action is aria-disabled and stays focusable; the pressed one shows a spinner; the live region reads what it is given", () => {
  const busy = view({ path: "/Users/ada/code/acme-web", kind: "loading" }, { kind: "problem", entryKind: "error" });
  const html = draw(busy, { pressed: "retry", announcement: "Doan couldn’t read acme-web’s configuration" });
  expect(html).toContain('<button type="button" class="doan-button problem-busy" data-ui-variant="prominent" data-ui-size="sm" aria-disabled="true"><span class="doan-spinner" aria-hidden="true"></span>Retry</button>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-disabled="true">Show in Finder</button>');
  expect(html).not.toContain("disabled=\"\"");
  expect(html).toContain('<p class="sr-only" role="status" aria-live="polite">Doan couldn’t read acme-web’s configuration</p>');
});

test("reading: the opaque panel with a status line and no scene", () => {
  const html = draw(view({ path: "/Users/ada/code/acme-web", kind: "loading" }, null, true));
  expect(html).toBe('<div class="problem-overlay reading"><p class="problem-reading" role="status"><span class="doan-spinner" aria-hidden="true"></span>Reading project</p></div>');
});

test("a pressed action reaches onAction; a busy one does not", () => {
  const onAction = vi.fn();
  const buttons = (overlayView: ProblemOverlayView) => {
    const tree = ProblemOverlay({ view: overlayView, details: false, pressed: null, announcement: "", onAction });
    const found: { onClick(): void }[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as unknown as { type: unknown; props: { onClick?: () => void; children?: unknown } };
      if (element.type === "button" && element.props.onClick) found.push(element.props as { onClick(): void });
      const props = element.props;
      walk(props.children);
    };
    walk(tree);
    return found;
  };
  buttons(view({ path: "/a", kind: "cliError", reason: "x" }))[0]!.onClick();
  expect(onAction).toHaveBeenCalledWith("retry");
  onAction.mockClear();
  buttons(view({ path: "/a", kind: "loading" }, { kind: "problem", entryKind: "cliError" }))[0]!.onClick();
  expect(onAction).not.toHaveBeenCalled();
});

test("overlay CSS: above the panel handles (4), under the toast (6); blur with an opaque fallback; the heading is never hidden", () => {
  const overlay = block(".workspace > .problem-overlay");
  expect(overlay).toMatch(/z-index: 5;/);
  expect(overlay).toMatch(/grid-column: 2 \/ 4;/);
  expect(overlay).toMatch(/background: color-mix\(in srgb, var\(--surface-panel\) 60%, transparent\);/);
  expect(overlay).toMatch(/backdrop-filter: blur\(var\(--blur-sm\)\);/);
  expect(overlay).toMatch(/overflow-y: auto;/);
  expect(css).toMatch(/\.doan-panel-handle \{[^}]*z-index: 4;/);
  expect(css).toMatch(/\n\.toast \{[^}]*z-index: 6;/);
  expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{ \.workspace > \.problem-overlay \{ background: var\(--surface-panel\); -webkit-backdrop-filter: none; backdrop-filter: none; \} \}/);
  expect(block(".workspace > .problem-overlay.reading")).toMatch(/background: var\(--surface-panel\);[^}]*backdrop-filter: none;/);
  expect(block(".workspace.with-strip > .problem-overlay")).toMatch(/grid-row: -3 \/ -1;/);
  expect(block(".workspace.overlaid > .strip-slot")).toMatch(/z-index: 6;/);
  // The heading takes programmatic focus (POSTMORTEM 2026-11-03): no rule hides it.
  for (const rule of css.match(/[^}\n]*problem[^{}]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/display: none|visibility: hidden/);
  expect(block(".problem-scene .problem-icon")).toMatch(/width: 32px;[^}]*height: 32px;[^}]*stroke-width: 1\.5;/);
});

// The overlay takes the right column's cell in the content row, so the right column, which has no placement of its
// own, was auto-placed into a new row under the sidebar and the content row shrank by its height (found by /design-sync).
test("overlay CSS: the right column (Overview list or canvas conversations) keeps its cell under the overlay; the scene reads in the onboarding scene's body type", () => {
  expect(block(".workspace.overlaid > :is(.right-stack, .doan-conv-column)")).toMatch(/grid-column: 3;/);
  expect(block(".workspace.overlaid:not(.with-strip) > :is(.right-stack, .doan-conv-column)")).toMatch(/grid-row: -2;/);
  expect(block(".workspace > .problem-overlay")).toMatch(/font-size: var\(--type-body-sm-size\);[^}]*line-height: var\(--type-body-sm-line-height\);/);
});

test("the old status band's rules are gone; the hidden sidebar's margin and motion rules cover the overlay; the sidebar's problem icon is subtle", () => {
  expect(css).not.toMatch(/\.ws-(recovery|status|detail)|with-status/);
  expect(css).toMatch(/:root\[data-sidebar="hidden"\] :is\([^)]*\.workspace > \.problem-overlay[^)]*\) \{ margin-left: 0; \}/);
  expect(css).toMatch(/:root\[data-sidebar-motion\] :is\([^)]*\.workspace > \.problem-overlay[^)]*\) \{ transition: margin-left/);
  expect(block(".row-slot.problem")).toMatch(/color: var\(--text-subtle\);/);
  // The shared rules still serve other screens.
  expect(css).toContain(".shell-problem {");
  expect(css).toContain(".shell-empty");
});
