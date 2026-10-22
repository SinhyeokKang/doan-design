import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { initialCanvasState } from "./CanvasController";
import type { InspectRow } from "../main/inspect";
import { Inspector, RightPanel } from "./RightPanel";
import type { SelectionView } from "./selection";

// Every inspector state from the draft's `inspector-states` and `long-values` frames.
const ROWS_FIXTURE: InspectRow[] = [
  { group: "box", label: "Width", value: "250px", state: "hardcoded" },
  { group: "box", label: "Padding", value: "8px 16px", state: "token", token: "--space-2 --space-4" },
  { group: "box", label: "Margin", value: "0px", state: "default" },
  { group: "box", label: "Gap", value: "4px", state: "hardcoded" },
  { group: "typography", label: "Family", value: 'ui-sans-serif, -apple-system, "Apple SD Gothic Neo", sans-serif', state: "token", token: "--font-sans", inheritedFrom: "body" },
  { group: "colors", label: "Text", value: "#111827", state: "token", token: "--mock-ink", inheritedFrom: "div" },
  { group: "colors", label: "Background", value: "#4f46e5", state: "token", token: "--button-background", chain: ["--button-background", "--brand"], hoverState: true },
  { group: "colors", label: "Border", value: "—", state: "default" },
  { group: "effects", label: "Radius", value: "6px", state: "unknown" },
  { group: "effects", label: "Shadow", value: "0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)", state: "hardcoded" },
];

const signIn = { doanId: "sign-in", selector: '[data-doan-id="sign-in"]', html: "<button></button>" };
const element: SelectionView = {
  tag: "button",
  frame: { id: "hero", title: "Sign in", implements: "src/screens/sign-in.tsx" },
  frameIndex: 0,
  element: signIn,
  path: [{ label: "hero", selector: '[data-doan-frame="hero"]' }, { label: "form", selector: "x" }, { label: "sign-in", selector: '[data-doan-id="sign-in"]', doanId: "sign-in" }],
  interactive: "control",
};
const render = (selection: SelectionView, rows: InspectRow[] = []) => renderToStaticMarkup(<Inspector selection={selection} inspector={{ status: "ready", rows }} selectPath={() => {}} />);
const between = (html: string, from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));

describe("Inspector for an element", () => {
  const html = render(element, ROWS_FIXTURE);

  test("heads the panel with tag, selector, frame, wrapped ancestors and the ⌥ hint", () => {
    expect(html).toContain('<aside class="right native-scroll" role="region" aria-label="Inspector"><h2 class="phead">Inspector</h2><div class="inspect-head"><h3>button</h3>');
    expect(html).toContain('<span class="truncate selector" title="[data-doan-id=&quot;sign-in&quot;]">[data-doan-id=&quot;sign-in&quot;]</span>');
    expect(html).toContain('<dl class="head-kv"><dt>Frame</dt><dd>hero · Sign in</dd></dl>');
    expect(html).toContain('<nav class="ancestors" aria-label="Ancestor path"><button class="truncate" title="hero" aria-current="false">hero</button><span aria-hidden="true">›</span>');
    expect(html).toContain('<button class="truncate" title="sign-in" aria-current="true">sign-in</button></nav><p class="use-hint">⌥-click to use it</p>');
  });

  test("groups rows under Box, Typography, Colors, Effects, then Doan attributes", () => {
    const headings = [...html.matchAll(/<h3 class="ihead">([^<]+)<\/h3>/g)].map(match => match[1]);
    expect(headings).toEqual(["Box", "Typography", "Colors", "Effects", "Doan attributes"]);
  });

  test("shows each state as text, Default as a dim value titled Default", () => {
    expect(between(html, 'title="Gap"', "</div></div>")).toContain('<span class="state hardcoded" title="Hardcoded">Hardcoded</span>');
    expect(between(html, 'title="Margin"', "</div></div>")).toContain('<span class="value default"><span class="truncate" title="Default">0px</span></span>');
    expect(between(html, 'title="Margin"', '<div class="inspect-row">')).not.toContain("source-line");
    expect(between(html, 'title="Family"', "</div></div>")).toContain('<span class="truncate token" title="--font-sans">--font-sans</span><span class="state" title="Inherited from body">Inherited from body</span>');
    expect(between(html, 'title="Background"', "</div></div>")).toContain('<span class="truncate token" title="--button-background → --brand → #4f46e5">--button-background</span><span class="state" title="Hover state">Hover state</span>');
    expect(between(html, 'title="Radius"', "</div></div>")).toContain(`<span class="state" title="doan can&#x27;t tell where this value comes from">Unknown source</span>`);
  });

  test("draws Width and Height without a source line (draft)", () => {
    expect(between(html, 'title="Width"', '<div class="inspect-row">')).not.toContain("source-line");
  });

  test("shows the token names of a combined row as given, in side order", () => {
    expect(between(html, 'title="Padding"', "</div></div>")).toContain('<span class="truncate token" title="--space-2 --space-4">--space-2 --space-4</span>');
  });

  test("puts a swatch before hex colors only and keeps long values whole in the tooltip", () => {
    expect(between(html, 'title="Text"', "</span></span>")).toContain('<i class="swatch" aria-hidden="true" style="background-color:#111827"></i>');
    expect(between(html, 'title="Border"', "</div>")).not.toContain("swatch");
    expect(html).toContain('<span class="truncate" title="0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)">');
  });

  test("lists the element's id and its frame's implements under Doan attributes", () => {
    const attributes = html.slice(html.indexOf("doan-attributes"));
    expect(attributes).toContain('<span class="prop" title="data-doan-id">id</span><span class="value"><span class="truncate" title="sign-in">sign-in</span></span>');
    expect(attributes).toContain('<span class="prop" title="data-doan-implements">implements</span><span class="value"><span class="truncate" title="src/screens/sign-in.tsx">src/screens/sign-in.tsx</span></span></div><div class="source-line"><span class="state">from frame hero</span></div>');
  });

  test("shows — for a missing id or implements, and the link hint for a link", () => {
    const { doanId: _doanId, ...withoutId } = signIn;
    const bare = render({ ...element, element: withoutId, frame: { id: "hero" }, interactive: "link" });
    expect(bare).toContain('title="data-doan-id">id</span><span class="value"><span class="truncate" title="—">—</span>');
    expect(bare).toContain('title="data-doan-implements">implements</span><span class="value"><span class="truncate" title="—">—</span></span></div></div>');
    expect(bare).toContain("<dd>hero</dd>");
    expect(bare).toContain('<p class="use-hint">⌥-click to follow this link</p>');
  });

  test("writes canvas strings as text", () => {
    expect(render({ ...element, tag: "<b>x</b>" })).toContain("<h3>&lt;b&gt;x&lt;/b&gt;</h3>");
  });
});

describe("Inspector while rows are missing", () => {
  test("a failure is one line under the head, and the head and Doan attributes stay", () => {
    const html = renderToStaticMarkup(<Inspector selection={element} inspector={{ status: "failed", reason: "No element matches the selector." }} selectPath={() => {}} />);
    expect(html).toContain('</div><p class="inspect-failed">No element matches the selector.</p><section class="isec doan-attributes">');
    expect(html).toContain("<h3>button</h3>");
    expect(html).not.toContain('<h3 class="ihead">Box</h3>');
  });

  test("shows no rows while loading", () => {
    const html = renderToStaticMarkup(<Inspector selection={element} inspector={{ status: "loading" }} selectPath={() => {}} />);
    expect(html).not.toContain('<h3 class="ihead">Box</h3>');
    expect(html).not.toContain("inspect-failed");
    expect(html).toContain("Doan attributes");
  });
});

describe("Inspector for a frame", () => {
  const { element: _element, interactive: _interactive, ...frameOnly } = element;
  const html = render({ ...frameOnly, path: [{ label: "hero", selector: '[data-doan-frame="hero"]' }] });

  test("heads with the frame id, title and implements, without selector or Doan attributes", () => {
    expect(html).toContain('<h3>hero</h3><dl class="head-kv"><dt>Title</dt><dd>Sign in</dd><dt>Implements</dt><dd class="truncate" title="src/screens/sign-in.tsx">src/screens/sign-in.tsx</dd></dl>');
    expect(html).toContain('<button class="truncate" title="hero" aria-current="true">hero</button>');
    expect(html).not.toContain("selector");
    expect(html).not.toContain("Doan attributes");
  });
});

describe("Canvas info", () => {
  test("ends with the inspection hint when a canvas is open", () => {
    const row = { path: "design/a.html", id: "a", url: "u", width: 600, open: 0, resolved: 0 };
    const html = renderToStaticMarkup(<RightPanel state={{ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row } }} selectPath={() => {}} />);
    expect(html).toMatch(/aria-label="Activity">.*<\/section><p class="pempty">Click an element or frame to inspect it\. Frames are also listed in the sidebar\.<\/p><\/aside>$/);
  });
});
