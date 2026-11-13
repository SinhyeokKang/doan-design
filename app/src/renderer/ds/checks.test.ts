import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { accentPlaces, buddyIds, contrastPairs, cssVarUsage, edgeStripes, legacyAliases, legacyNames, nestedRadius, paletteAccentPlaces, rootTokens, type ContrastPair, type SourceFile } from "./checks";

const renderer = new URL("../", import.meta.url);

function rendererSources(): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`); continue; }
      if (!/\.(css|ts|tsx)$/.test(entry.name) || /\.test\.tsx?$|\.d\.ts$/.test(entry.name)) continue;
      files.push({ path: `${prefix}${entry.name}`, text: readFileSync(new URL(entry.name, dir), "utf8") });
    }
  };
  walk(renderer, "");
  return files;
}

function only<T>(list: T[]): T {
  expect(list).toHaveLength(1);
  return list[0]!;
}

const tokensCss = () => readFileSync(new URL("tokens.css", renderer), "utf8");

// The design's accent places, as exact selectors (or a TS file): a descendant of an
// allowed row is a new place and has to be listed here on purpose. The .side .row
// selectors read violet itself, not the chosen buddy's accent.
const violetAllowed = [
  ".side .row:hover",
  '.side .row[aria-current="location"]',
  // Everything drawn inside the current row takes the row's ink.
  '.side .row[aria-current="location"] :is(.g, .glyph, .d, .tw)',
  // Home's Send, the shared accent icon button (doan-home approved draft, 2026-10-29 user).
  '.doan-icon-button[data-ui-variant="accent"]',
  '.doan-icon-button[data-ui-variant="accent"]:hover:not(:disabled)',
  '.doan-icon-button[data-ui-variant="accent"]:is(:active, [aria-haspopup][aria-expanded="true"], [data-state="open"]):not(:disabled)',
  // The rest of Home's accent places: Send's spinner ink, the chosen
  // preset chip, the suggested prompts' group icons, the Home-only glow around the composer (dogfooding moved it from a panel-wide ellipse), the drop outline and the sidebar status slot.
  ".composer-send .doan-spinner",
  ".preset-chip",
  ".suggestion svg",
  // The suggested prompt's icon tile (suggested-prompt-variants C, confirmed 2026-11-03).
  ".suggestion-icon",
  // The project and canvas names inside a suggested sentence: the anchor chip's values as an inline highlight
  // (confirmed draft 2026-11-06).
  ".suggestion-value",
  ".skill-word",
  ".preset-item .suggestion-icon svg",
  ".preset-popover .group-tabs button svg",
  ".home-composer .composer",
  ".drop-target",
  ".row-slot.permission",
  ".row-slot.unseen i",
  ".row-slot.ended",
  // The Fast icon on the Effort trigger, the Effort menu's Fast row and the thread's Fast-not-used line (confirmed draft 2026-11-06).
  ".composer-effort .fast-icon",
  ".fast-slot",
  ".conversation-thread .activity-head.fast-note svg",
  // The person's message in the conversation thread: a light accent bubble and its preset line (confirmed draft 2026-10-31).
  ".conversation-thread .bubble",
  ".conversation-thread .bubble-preset",
  // The canvas conversation panel's resize bar, shown on hover, drag and focus (malmoi's
  // resizer; confirmed draft 2026-11-01).
  ".doan-panel-handle::after",
  // The agent indicator on the canvas: the edge glow (confirmed draft 2026-11-01). The notice's accent dot is now Doany the artist, an image (doany-artist draft).
  ".doan-agent-glow",
  // Inline anchor chips in the composer field: light accent fill, dark accent ink (confirmed draft 2026-11-01).
  ".anchor-chip",
  // The chosen buddy card in first run's Cover Flow row: its 2px ring in the accent icon colour and the Home
  // composer's glow (buddy-choice draft).
  ".buddy-card:has(input:checked)",
  // The dot on the folded conversation panel's open button, the sidebar slot's unseen dot (confirmed draft open-badge).
  '.doan-icon-button[data-badge="true"]::after',
  // The unread finished conversation's speech bubble: the folded buttons' badge and the sidebar slot (`.row-slot.ended`).
  ".badge-bubble",
  // The canvas jump highlight (chip locate, Frames drawer, Quick Open, deep link): a 3px accent gradient line drawn
  // by the masked ::before and an accent glow, readable over any canvas.
  ".mark.jump-highlight",
  ".mark.jump-highlight::before",
  // Its working-frame variant: the travelling gradient and the breathing glow.
  ".mark.jump-highlight.working::before",
  "@keyframes doan-work-glow",
  // Select's canvas text range: the accent at 30 % alpha over the glyphs (canvas-text-copy draft, confirmed 2026-11-13).
  ".text-range > .text-rect",
];

function compareAllowed(found: string[], allowed: string[]) {
  return {
    unexpected: found.filter(place => !allowed.includes(place)),
    missing: allowed.filter(place => !found.includes(place)),
  };
}

// Role pairs the light system must keep readable. Translucent backgrounds are
// composited over both white and black by contrastPairs itself.
// Non-text 3:1 covers what identifies a component: border-prominent and focus rings.
// Decorative hairlines (border-standard, about 1.2:1 on white) and text fields edged by their
// inset fill (about 1.1:1) are left out on purpose (decided 2026-10-26): a hairline only
// separates, and a field shows its border-prominent edge once focused.
const rolePairs: ContrastPair[] = [
  ...["--surface-panel", "--surface-popover", "--surface-inset", "--bg-app", "--surface-elevated-glass", "--surface-navigation-selected", "--affordance-floating-hover", "--affordance-subtle-hover", "--affordance-sidebar-hover"]
    .flatMap(bg => [{ fg: "--text-standard", bg, kind: "body" as const }, { fg: "--text-subtle", bg, kind: "body" as const }, { fg: "--text-metadata", bg, kind: "meta" as const }]),
  { fg: "--text-on-prominent", bg: "--affordance-prominent", kind: "body" },
  { fg: "--text-on-prominent", bg: "--affordance-prominent-hover", kind: "body" },
  // Send and the docked composer's Stop and Queue are icon-only, so their ink is non-text 3:1 on every fill state.
  { fg: "--text-on-accent", bg: "--affordance-accent", kind: "nontext" },
  { fg: "--text-on-accent", bg: "--affordance-accent-hover", kind: "nontext" },
  { fg: "--text-on-accent", bg: "--affordance-accent-pressed", kind: "nontext" },
  // Accent chips: step 11 text on step 3.
  { fg: "--text-accent-subtle", bg: "--surface-accent-subtle", kind: "body" },
  // Accent icons, dots and outlines on the darkest surface they sit on, a pressed sidebar row.
  { fg: "--text-accent", bg: "--affordance-backdrop-pressed", over: "--bg-app", kind: "nontext" },
  { fg: "--text-sidebar-selected", bg: "--surface-sidebar-selected", kind: "body" },
  { fg: "--text-comment", bg: "--surface-comment", kind: "body" },
  { fg: "--text-danger", bg: "--surface-panel", kind: "body" },
  { fg: "--text-warning", bg: "--surface-panel", kind: "body" },
  { fg: "--text-success", bg: "--surface-panel", kind: "body" },
  // Status pills: each status text on its own fill.
  { fg: "--text-danger", bg: "--affordance-danger", kind: "body" },
  { fg: "--text-warning", bg: "--affordance-warning", kind: "body" },
  { fg: "--text-success", bg: "--affordance-success", kind: "body" },
  // Tooltip and canvas dimension capsules share the prominent fill; pressed is the lightest step.
  { fg: "--text-on-prominent", bg: "--affordance-prominent-pressed", kind: "body" },
  { fg: "--affordance-prominent", bg: "--surface-panel", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-panel", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-inset", kind: "nontext" },
  { fg: "--border-focus", bg: "--bg-app", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-navigation-selected", kind: "nontext" },
  { fg: "--border-prominent", bg: "--surface-panel", kind: "nontext" },
  { fg: "--text-disabled", bg: "--surface-panel", kind: "disabled" },
];

describe("contrastPairs", () => {
  const css = `:root {
    --white: #fff; --black: #000000; --gray: #888; --gray-2: rgb(136 136 136);
    --glass: rgb(255 255 255 / 50%); --veil: #00000080; --mixed: color-mix(in srgb, var(--white) 50%, black);
    --role-bg: var(--white); --role-fg: var(--gray); --faint: #eeeeee;
  }`;

  test("computes WCAG ratios and APCA-W3 Lc values for opaque pairs", () => {
    const r = only(contrastPairs(css, [{ fg: "--gray", bg: "--white", kind: "body" }]));
    expect(r.wcag).toBeCloseTo(3.545, 2);
    expect(r.apca).toBeCloseTo(63.056, 2);
    const reverse = only(contrastPairs(css, [{ fg: "--white", bg: "--gray", kind: "body" }]));
    expect(reverse.apca).toBeCloseTo(-68.541, 2);
    const dark = contrastPairs(":root { --a: #aaa; --b: #000; }", [{ fg: "--b", bg: "--a", kind: "body" }, { fg: "--a", bg: "--b", kind: "body" }]);
    expect(dark[0]!.apca).toBeCloseTo(58.146, 2);
    expect(dark[1]!.apca).toBeCloseTo(-56.241, 2);
  });

  test("returns zero Lc for near-identical colours and 21:1 for black on white", () => {
    const same = only(contrastPairs(css, [{ fg: "--gray", bg: "--gray-2", kind: "body" }]));
    expect(same.apca).toBe(0);
    expect(same.wcag).toBeCloseTo(1, 5);
    const max = only(contrastPairs(css, [{ fg: "--black", bg: "--white", kind: "body" }]));
    expect(max.wcag).toBeCloseTo(21, 5);
  });

  test("resolves var() chains and color-mix in srgb", () => {
    const chain = only(contrastPairs(css, [{ fg: "--role-fg", bg: "--role-bg", kind: "body" }]));
    expect(chain.apca).toBeCloseTo(63.056, 2);
    const mix = only(contrastPairs(css, [{ fg: "--mixed", bg: "--white", kind: "nontext" }]));
    expect(mix.fgHex).toBe("#808080");
  });

  test("applies body, meta, nontext and disabled thresholds", () => {
    const results = contrastPairs(css, [
      { fg: "--gray", bg: "--white", kind: "body" },
      { fg: "--gray", bg: "--white", kind: "meta" },
      { fg: "--gray", bg: "--white", kind: "nontext" },
      { fg: "--faint", bg: "--white", kind: "nontext" },
      { fg: "--faint", bg: "--white", kind: "disabled" },
      { fg: "--black", bg: "--white", kind: "body" },
    ]);
    expect(results.map(r => r.ok)).toEqual([false, true, true, false, true, true]);
  });

  test("composites translucent backgrounds over both white and black", () => {
    const results = contrastPairs(css, [{ fg: "--black", bg: "--glass", kind: "nontext" }]);
    expect(results.map(r => r.backdrop)).toEqual(["white", "black"]);
    expect(results.map(r => r.bgHex)).toEqual(["#ffffff", "#808080"]);
    expect(results[1]!.ok).toBe(true);
    const veil = contrastPairs(css, [{ fg: "--white", bg: "--veil", kind: "body" }]);
    expect(veil.map(r => r.bgHex)).toEqual(["#7f7f7f", "#000000"]);
    expect(veil[0]!.ok).toBe(false);
  });

  test("composites a translucent foreground over its resolved background", () => {
    const r = only(contrastPairs(css, [{ fg: "--veil", bg: "--white", kind: "nontext" }]));
    expect(r.fgHex).toBe("#7f7f7f");
  });

  test("throws on undefined or unparseable tokens instead of passing them", () => {
    expect(() => contrastPairs(css, [{ fg: "--missing", bg: "--white", kind: "body" }])).toThrow(/--missing/);
    expect(() => contrastPairs(":root { --odd: hsl(0 0% 0%); --w: #fff; }", [{ fg: "--odd", bg: "--w", kind: "body" }])).toThrow(/--odd/);
  });

  test("composites a translucent background over the token named by `over` instead of white and black", () => {
    const r = only(contrastPairs(css, [{ fg: "--black", bg: "--veil", over: "--gray", kind: "nontext" }]));
    expect(r.backdrop).toBe("--gray");
    expect(r.bgHex).toBe("#444444");
  });

  test("resolves through a buddy's :root[data-buddy] overrides when one is given", () => {
    const themed = `${css}\n:root { --buddy-9: var(--black); --fill: var(--buddy-9); }\n:root[data-buddy="puri"] { --buddy-9: var(--gray); }`;
    const pair: ContrastPair = { fg: "--fill", bg: "--white", kind: "nontext" };
    expect(only(contrastPairs(themed, [pair])).fgHex).toBe("#000000");
    expect(only(contrastPairs(themed, [pair], "puri")).fgHex).toBe("#888888");
  });
});

describe("rootTokens", () => {
  const css = `:root { --a: #000; --buddy-9: var(--a); }
    :root[data-buddy="puri"] { --buddy-9: #111; --only-puri: #222; }
    :root[data-buddy="popo"] { --buddy-9: #333; }
    :root, .light { --b: #444; }
    .x { --c: #555; }`;

  test("reads only plain :root blocks by default, so a buddy block never leaks into the default", () => {
    const tokens = rootTokens(css);
    expect(tokens.get("--buddy-9")).toBe("var(--a)");
    expect(tokens.get("--b")).toBe("#444");
    expect(tokens.has("--only-puri")).toBe(false);
    expect(tokens.has("--c")).toBe(false);
  });

  test("lays one buddy's block over the plain :root and ignores the others", () => {
    const tokens = rootTokens(css, "puri");
    expect(tokens.get("--buddy-9")).toBe("#111");
    expect(tokens.get("--only-puri")).toBe("#222");
    expect(tokens.get("--a")).toBe("#000");
    expect(rootTokens(css, "popo").get("--buddy-9")).toBe("#333");
    expect(rootTokens(css, "popo").has("--only-puri")).toBe(false);
  });

  test("buddyIds lists the :root[data-buddy] themes once each, in source order", () => {
    expect(buddyIds(`${css}\n:root[data-buddy="puri"] { --buddy-3: #fff; }`)).toEqual(["puri", "popo"]);
  });
});

describe("cssVarUsage", () => {
  test("reports variables used in CSS and TS without a :root or @theme definition", () => {
    const files: SourceFile[] = [
      { path: "tokens.css", text: ":root { --a: red; --b: var(--a); }\n.x { --local: 1px; }" },
      { path: "styles.css", text: "@theme inline {\n  --color-a: var(--a);\n}\n.y { color: var(--color-a); border-color: var(--nope); }\n.z { width: var(--local); }" },
      { path: "pin.ts", text: 'el.style.cssText = `background: var(--b); color: var(--gone, #fff)`;' },
    ];
    expect(cssVarUsage(files)).toEqual([
      { path: "styles.css", line: 4, name: "--nope" },
      { path: "styles.css", line: 5, name: "--local" },
      { path: "pin.ts", line: 1, name: "--gone" },
    ]);
  });

  test("allows runtime --tw-* and --radix-* variables and ignores comments", () => {
    const files: SourceFile[] = [
      { path: "a.css", text: "/* var(--commented) */\n.m { transform-origin: var(--radix-tooltip-content-transform-origin); --tw-x: var(--tw-y); }" },
    ];
    expect(cssVarUsage(files)).toEqual([]);
  });

  test("counts :root definitions inside selector lists and at-rules", () => {
    const files: SourceFile[] = [
      { path: "a.css", text: "@media (min-width: 1px) { :root, .light { --m: 1px; } }\n.k { margin: var(--m); }" },
    ];
    expect(cssVarUsage(files)).toEqual([]);
  });
});

describe("legacyAliases", () => {
  const all = ["bg", "panel", "panel-2", "raised", "line", "line-2", "text", "text-2", "text-3", "text-4", "accent", "accent-ink", "accent-soft", "accent-line", "board-bg", "board-dot", "ok", "warn", "err", "shadow-1", "shadow-2", "tl-red", "tl-yellow", "tl-green", "font-sans"];
  // The first :root block is the palette; roles come after it.
  const roles = ":root { --grey-1: #fff; }\n:root { --role: var(--grey-1); }";
  const aliases = (except: string[] = []) => `:root { ${all.filter(name => !except.includes(name)).map(name => `--${name}: var(--role);`).join(" ")} }`;

  test("accepts every legacy name as a var() alias of a role in the same file", () => {
    expect(legacyAliases(`${roles}\n${aliases()}`)).toEqual([]);
  });

  test("reports missing names, literal values, undefined targets and alias chains", () => {
    // Built with ref() so the legacy-alias grep over the renderer stays empty.
    const ref = (name: string) => `var(${name})`;
    const css = `${roles}\n${aliases(["bg", "panel", "text", "ok"])}\n:root { --panel: #171717; --text: ${ref("--undefined-role")}; --ok: ${ref("--panel")}; }`;
    expect(legacyAliases(css)).toEqual([
      "--bg is missing",
      "--panel is not a var() alias: #171717",
      "--text points to undefined --undefined-role",
      "--ok points to legacy name --panel",
    ]);
  });

  test("reports an alias that skips the roles and points at a palette step", () => {
    const css = `${roles}\n${aliases(["accent-ink"])}\n:root { --accent-ink: var(--grey-1); }`;
    expect(legacyAliases(css)).toEqual(["--accent-ink points to palette step --grey-1"]);
  });
});

describe("accentPlaces", () => {
  const tokens = `:root { --violet-9: #973be1; --grey-1: #fff; }
    :root { --fill-accent: var(--violet-9); --fill-accent-hover: color-mix(in srgb, var(--fill-accent) 90%, black); --plain: var(--grey-1); }
    :root { --legacy: var(--fill-accent); }`;

  test("lists every selector or TS file whose var() chain reaches the violet palette", () => {
    const files: SourceFile[] = [
      { path: "styles.css", text: '.side .row[aria-current="location"], .side .row[aria-current="location"]::before { background: var(--fill-accent); }\n.side .row:hover { background: var(--fill-accent-hover); }\n.plain { color: var(--plain); }\n@media (hover: hover) { .x:hover { color: var(--violet-9); } }' },
      { path: "Marks.ts", text: "mark.style.background = 'var(--legacy)';" },
      { path: "Other.ts", text: "const x = 'var(--plain)';" },
    ];
    expect(accentPlaces(files, tokens)).toEqual([
      '.side .row[aria-current="location"]',
      '.side .row[aria-current="location"]::before',
      ".side .row:hover",
      ".x:hover",
      "Marks.ts",
    ]);
  });

  test("treats @theme mappings as a place so violet never reaches shadcn names", () => {
    expect(accentPlaces([{ path: "styles.css", text: "@theme inline { --color-primary: var(--fill-accent); }" }], tokens)).toEqual(["@theme"]);
  });

  test("returns nothing when no violet role is read", () => {
    expect(accentPlaces([{ path: "a.css", text: ".a { color: var(--plain); }" }], tokens)).toEqual([]);
  });

  // Doany's accent is violet, so the switch layer points there by default and each buddy's block re-points it.
  const buddyTokens = `:root { --violet-9: #973be1; --violet-5: #e9ddf9; --puri-9: #55bc98; --puri-icon: #158b6a; --grey-1: #fff; --grey-8: #808080; }
    :root { --buddy-9: var(--violet-9); --buddy-icon: var(--violet-9); }
    :root[data-buddy="puri"] { --buddy-9: var(--puri-9); --buddy-icon: var(--puri-icon); }
    :root { --fill-accent: var(--buddy-9); --text-accent: var(--buddy-icon); --fixed-violet: var(--violet-9); --border-focus: var(--grey-8); --plain: var(--grey-1); }
    :root { --accent: var(--grey-8); --accent-line: var(--border-focus); --accent-soft: var(--plain); }`;

  test("follows every buddy palette and the --buddy-* switch, not names that merely look like an accent", () => {
    const files: SourceFile[] = [{ path: "styles.css", text: [
      ".send { background: var(--fill-accent); }",
      ".dot { background: var(--text-accent); }",
      ".raw { color: var(--buddy-9); }",
      ".friend { color: var(--puri-9); }",
      ".welcome { background: var(--fixed-violet); }",
      ".legacy { color: var(--accent); border-color: var(--accent-line); background: var(--accent-soft); }",
    ].join("\n") }];
    expect(accentPlaces(files, buddyTokens)).toEqual([".send", ".dot", ".raw", ".friend", ".welcome"]);
  });

  test("counts a role that reaches a friend palette only inside that buddy's block", () => {
    const css = `:root { --violet-9: #973be1; --puri-9: #55bc98; --grey-1: #fff; }
      :root { --buddy-3: var(--grey-1); --chip: var(--buddy-3); }
      :root[data-buddy="puri"] { --buddy-3: var(--puri-9); }`;
    expect(accentPlaces([{ path: "a.css", text: ".chip { background: var(--chip); }" }], css)).toEqual([".chip"]);
  });

  test("reports @theme when a shadcn mapping reaches any buddy palette or the switch", () => {
    expect(accentPlaces([{ path: "styles.css", text: "@theme inline { --color-primary: var(--buddy-9); }" }], buddyTokens)).toEqual(["@theme"]);
    expect(accentPlaces([{ path: "styles.css", text: "@theme inline { --color-ring: var(--puri-icon); }" }], buddyTokens)).toEqual(["@theme"]);
  });

  test("paletteAccentPlaces lists only places that read an accent palette step around the switch", () => {
    const files: SourceFile[] = [{ path: "styles.css", text: [
      ".send { background: var(--fill-accent); }",
      ".welcome { background: var(--fixed-violet); }",
      ".welcome::before { background: var(--violet-5); }",
      ".friend { color: var(--puri-9); }",
      ".raw { color: var(--buddy-9); }",
    ].join("\n") }];
    expect(paletteAccentPlaces(files, buddyTokens)).toEqual([".welcome", ".welcome::before", ".friend"]);
  });
});

describe("edgeStripes", () => {
  test("reports thick or coloured start-side borders and inset stripes, with their line", () => {
    const files: SourceFile[] = [{ path: "a.css", text: [
      ".msg.error { border-left: 2px solid var(--border-danger); padding-left: 8px; }",
      ".note { border-inline-start: 1px solid var(--text-warning); }",
      ".card { box-shadow: inset 3px 0 0 var(--border-prominent), var(--shadow-xs); }",
      ".pane { border-left-width: 2px; }",
      ".tip { border-left-color: var(--border-focus); }",
    ].join("\n") }];
    expect(edgeStripes(files)).toEqual([
      { path: "a.css", line: 1, selector: ".msg.error", declaration: "border-left: 2px solid var(--border-danger)" },
      { path: "a.css", line: 2, selector: ".note", declaration: "border-inline-start: 1px solid var(--text-warning)" },
      { path: "a.css", line: 3, selector: ".card", declaration: "box-shadow: inset 3px 0 0 var(--border-prominent), var(--shadow-xs)" },
      { path: "a.css", line: 4, selector: ".pane", declaration: "border-left-width: 2px" },
      { path: "a.css", line: 5, selector: ".tip", declaration: "border-left-color: var(--border-focus)" },
    ]);
  });

  test("reports a thin pseudo-element bar at the start edge and start borders set through shorthands", () => {
    const files: SourceFile[] = [{ path: "a.css", text: [
      '.row[aria-current="true"]::before { content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background: var(--border-prominent); }',
      ".note { border-width: 0 0 0 3px; border-style: solid; }",
      ".card { border-left: medium solid var(--border-standard); }",
    ].join("\n") }];
    expect(edgeStripes(files)).toEqual([
      { path: "a.css", line: 1, selector: '.row[aria-current="true"]::before', declaration: "width: 2px" },
      { path: "a.css", line: 2, selector: ".note", declaration: "border-width: 0 0 0 3px" },
      { path: "a.css", line: 3, selector: ".card", declaration: "border-left: medium solid var(--border-standard)" },
    ]);
  });

  test("allows a 1px neutral divider, a cleared border and other sides", () => {
    const files: SourceFile[] = [{ path: "a.css", text: [
      ".dock { border-inline-start: 1px solid var(--border-standard); }",
      ".split { border-left: 1px solid var(--border-prominent); }",
      ".flat { border-left: 0; border-inline-start: none; }",
      ".box { border: 2px solid var(--border-danger); border-top: 3px solid red; box-shadow: inset 0 0 0 1px var(--border-standard), inset 0 -1px 0 red; }",
      ".scroll::-webkit-scrollbar { width: 8px; }",
      ".tick::before { content: \"\"; width: 5px; height: 10px; border: solid currentColor; }",
      ".chip::after { content: \"\"; position: absolute; inset: 0; background: var(--surface-inset); }",
      ".frame { border-width: 1px; }",
    ].join("\n") }, { path: "a.ts", text: "el.style.borderLeft = '4px solid red';" }];
    expect(edgeStripes(files)).toEqual([]);
  });
});

describe("nestedRadius", () => {
  test("subtracts inset and border from the outer radius", () => {
    expect(nestedRadius(24, 4, 1)).toBe(19);
    expect(nestedRadius(16, 2, 1)).toBe(13);
  });

  test("never goes below zero", () => {
    expect(nestedRadius(4, 8, 1)).toBe(0);
    expect(nestedRadius(0, 0, 0)).toBe(0);
  });
});

// These read the real renderer sources; they turn green as the tokens,
// the design system stylesheet and the accent mapping land.
describe("renderer sources", () => {
  test("legacyAliases: tokens.css keeps the 25 legacy names as role aliases", () => {
    expect(legacyAliases(tokensCss())).toEqual([]);
  });

  test("cssVarUsage: every var() in renderer CSS and TS is defined", () => {
    expect(cssVarUsage(rendererSources())).toEqual([]);
  });

  // Doany is the plain :root (no data-buddy attribute); the friends each have a block.
  const everyBuddy = () => [undefined, ...buddyIds(tokensCss())];

  test("tokens.css has a :root[data-buddy] block for each friend buddy", () => {
    expect(buddyIds(tokensCss())).toEqual(["puri", "dungdung", "popo", "dori"]);
  });

  test("a :root[data-buddy] block sets only the --buddy-* switch, never a role or a legacy --accent* name", () => {
    const plain = rootTokens(tokensCss());
    expect(legacyNames.filter(name => name.startsWith("--buddy-"))).toEqual([]);
    for (const buddy of buddyIds(tokensCss())) {
      const themed = rootTokens(tokensCss(), buddy);
      const changed = [...themed.keys()].filter(name => themed.get(name) !== plain.get(name));
      expect(changed.length, buddy).toBeGreaterThan(0);
      expect(changed.filter(name => !name.startsWith("--buddy-")), buddy).toEqual([]);
    }
  });

  test("contrastPairs: role pairs clear their thresholds for every buddy", () => {
    for (const buddy of everyBuddy()) {
      const failing = contrastPairs(tokensCss(), rolePairs, buddy).filter(result => !result.ok);
      expect(failing, buddy ?? "doany").toEqual([]);
    }
  });

  test("contrastPairs: the ink on the accent fill is white when white clears 3:1 on 9, hover and pressed, the standard ink otherwise", () => {
    const fills = ["--affordance-accent", "--affordance-accent-hover", "--affordance-accent-pressed"];
    const inks = Object.fromEntries(everyBuddy().map(buddy => {
      const whitePasses = contrastPairs(tokensCss(), fills.map(bg => ({ fg: "--neutral-1", bg, kind: "nontext" as const })), buddy).every(result => result.ok);
      const expected = whitePasses ? "--neutral-1" : "--text-standard";
      const ink = only(contrastPairs(tokensCss(), [{ fg: "--text-on-accent", bg: "--affordance-accent", kind: "nontext" }], buddy)).fgHex;
      const want = only(contrastPairs(tokensCss(), [{ fg: expected, bg: "--affordance-accent", kind: "nontext" }], buddy)).fgHex;
      expect(ink, buddy ?? "doany").toBe(want);
      return [buddy ?? "doany", whitePasses ? "white" : "standard"];
    }));
    expect(inks).toEqual({ doany: "white", puri: "standard", dungdung: "standard", popo: "white", dori: "white" });
  });

  test("accentPlaces: the buddy accent is read only by the allowed places", () => {
    const found = accentPlaces(rendererSources().filter(file => file.path !== "tokens.css"), tokensCss());
    expect(compareAllowed(found, violetAllowed)).toEqual({ unexpected: [], missing: [] });
    expect(found).not.toContain("@theme");
  });

  test("paletteAccentPlaces: nothing reads a buddy palette directly but the three .side .row selectors (Welcome reads no accent)", () => {
    const found = paletteAccentPlaces(rendererSources().filter(file => file.path !== "tokens.css"), tokensCss());
    expect([...found].sort()).toEqual([
      ".side .row:hover",
      '.side .row[aria-current="location"]',
      '.side .row[aria-current="location"] :is(.g, .glyph, .d, .tw)',
    ].sort());
  });

  test("preset tab accents cannot match Quick Open tabs", () => {
    const tabAccents = violetAllowed.filter(selector => selector.includes("group-tabs"));
    expect(tabAccents).toEqual([".preset-popover .group-tabs button svg"]);
  });

  test("edgeStripes: no message, notice, card or row is marked by a start-side stripe", () => {
    expect(edgeStripes(rendererSources())).toEqual([]);
  });

  test("nestedRadius: floating menu rows derive their corner from the tokens", () => {
    const px = (name: string) => {
      const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(tokensCss());
      expect(match, name).not.toBeNull();
      return Number(match![1]);
    };
    expect(nestedRadius(px("--radius-container"), px("--space-1"), 1)).toBe(19);
    expect(nestedRadius(px("--radius-row"), px("--space-half"), 1)).toBe(13);
  });
});
