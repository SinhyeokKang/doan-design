import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { accentPlaces, contrastPairs, cssVarUsage, legacyAliases, nestedRadius, type ContrastPair, type SourceFile } from "./checks";

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

// Each allowed place is a selector prefix (or a TS file) from the design's violet rows;
// every place found must start with one, and every one must be used.
const violetAllowed = ['.side .row[aria-current="location"]', ".side .row:hover", ".comments-btn.primary.submit", "CommentPins.ts"];

function compareAllowed(found: string[], allowed: string[]) {
  return {
    unexpected: found.filter(place => !allowed.some(prefix => place.startsWith(prefix))),
    missing: allowed.filter(prefix => !found.some(place => place.startsWith(prefix))),
  };
}

// Role pairs the light system must keep readable. Translucent backgrounds are
// composited over both white and black by contrastPairs itself.
const rolePairs: ContrastPair[] = [
  ...["--surface-panel", "--surface-popover", "--surface-inset", "--bg-app", "--surface-elevated-glass", "--surface-navigation-selected", "--affordance-floating-hover", "--affordance-subtle-hover", "--affordance-sidebar-hover"]
    .flatMap(bg => [{ fg: "--text-standard", bg, kind: "body" as const }, { fg: "--text-subtle", bg, kind: "body" as const }, { fg: "--text-metadata", bg, kind: "meta" as const }]),
  { fg: "--text-on-prominent", bg: "--affordance-prominent", kind: "body" },
  { fg: "--text-on-prominent", bg: "--affordance-prominent-hover", kind: "body" },
  { fg: "--text-on-accent", bg: "--affordance-accent", kind: "body" },
  { fg: "--text-on-accent", bg: "--affordance-accent-hover", kind: "body" },
  { fg: "--text-on-accent", bg: "--affordance-accent-pressed", kind: "body" },
  { fg: "--text-sidebar-selected", bg: "--surface-sidebar-selected", kind: "body" },
  { fg: "--text-comment", bg: "--surface-comment", kind: "body" },
  { fg: "--text-danger", bg: "--surface-panel", kind: "body" },
  { fg: "--text-warning", bg: "--surface-panel", kind: "body" },
  { fg: "--text-success", bg: "--surface-panel", kind: "body" },
  // Tooltip and canvas dimension capsules share the prominent fill.
  { fg: "--text-on-prominent", bg: "--affordance-prominent", kind: "body" },
  { fg: "--affordance-prominent", bg: "--surface-panel", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-panel", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-inset", kind: "nontext" },
  { fg: "--border-focus", bg: "--bg-app", kind: "nontext" },
  { fg: "--border-focus", bg: "--surface-navigation-selected", kind: "nontext" },
  { fg: "--border-prominent", bg: "--surface-panel", kind: "nontext" },
  // Pins sit on arbitrary canvases: the dark rim carries light canvases, the white halo dark ones.
  { fg: "--border-pin", bg: "--halo-pin", kind: "nontext" },
  { fg: "--border-pin", bg: "--affordance-accent", kind: "nontext" },
  { fg: "--halo-pin", bg: "--neutral-12", kind: "nontext" },
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
  const roles = ":root { --role: #fff; }";
  const aliases = (except: string[] = []) => `:root { ${all.filter(name => !except.includes(name)).map(name => `--${name}: var(--role);`).join(" ")} }`;

  test("accepts every legacy name as a var() alias of a role in the same file", () => {
    expect(legacyAliases(`${roles}\n${aliases()}`)).toEqual([]);
  });

  test("reports missing names, literal values, undefined targets and alias chains", () => {
    const css = `${roles}\n${aliases(["bg", "panel", "text", "ok"])}\n:root { --panel: #171717; --text: var(--undefined-role); --ok: var(--panel); }`;
    expect(legacyAliases(css)).toEqual([
      "--bg is missing",
      "--panel is not a var() alias: #171717",
      "--text points to undefined --undefined-role",
      "--ok points to legacy name --panel",
    ]);
  });
});

describe("accentPlaces", () => {
  test("lists every selector or TS file that reads a violet role or palette step", () => {
    const files: SourceFile[] = [
      { path: "styles.css", text: '.side .row[aria-current="location"], .side .row[aria-current="location"]::before { background: var(--surface-sidebar-selected); }\n.side .row:hover { background: var(--affordance-sidebar-hover); }\n.plain { color: var(--text-standard); }\n@media (hover: hover) { .x:hover { color: var(--violet-9); } }' },
      { path: "CommentPins.ts", text: "pin.style.background = 'var(--affordance-accent)';" },
      { path: "Other.ts", text: "const x = 'var(--text-subtle)';" },
    ];
    expect(accentPlaces(files)).toEqual([
      '.side .row[aria-current="location"]',
      '.side .row[aria-current="location"]::before',
      ".side .row:hover",
      ".x:hover",
      "CommentPins.ts",
    ]);
  });

  test("treats @theme mappings as a place so violet never reaches shadcn names", () => {
    expect(accentPlaces([{ path: "styles.css", text: "@theme inline { --color-primary: var(--affordance-accent); }" }])).toEqual(["@theme"]);
  });

  test("returns nothing when no violet role is read", () => {
    expect(accentPlaces([{ path: "a.css", text: ".a { color: var(--accent); }" }])).toEqual([]);
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

// These read the real renderer sources; they turn green as the tokens (A3),
// the design system stylesheet (A4) and the accent mapping (A6) land.
describe("renderer sources", () => {
  test("legacyAliases: tokens.css keeps the 25 legacy names as role aliases", () => {
    expect(legacyAliases(tokensCss())).toEqual([]);
  });

  test("cssVarUsage: every var() in renderer CSS and TS is defined", () => {
    expect(cssVarUsage(rendererSources())).toEqual([]);
  });

  test("contrastPairs: role pairs clear their thresholds", () => {
    const failing = contrastPairs(tokensCss(), rolePairs).filter(result => !result.ok);
    expect(failing).toEqual([]);
  });

  test("accentPlaces: violet is read only by the allowed places", () => {
    const found = accentPlaces(rendererSources().filter(file => file.path !== "tokens.css"));
    expect(compareAllowed(found, violetAllowed)).toEqual({ unexpected: [], missing: [] });
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
