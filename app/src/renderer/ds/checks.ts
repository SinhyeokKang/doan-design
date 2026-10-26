// Static checks over the renderer's own stylesheets and token file. They read
// repository text only, so tests can pin the design system without a browser.

export interface SourceFile { path: string; text: string }

interface Declaration { prop: string; value: string; valueStart: number }
interface Block { prelude: string; declarations: Declaration[] }

// Blank comments in place so offsets, and therefore line numbers, stay true.
function stripComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
}

function lineAt(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

function blocks(css: string): Block[] {
  const text = stripComments(css);
  const out: Block[] = [], stack: Block[] = [];
  let start = 0, parens = 0;
  const declare = (end: number) => {
    const segment = text.slice(start, end), colon = segment.indexOf(":");
    const top = stack[stack.length - 1];
    if (!top || colon < 0) return;
    const prop = segment.slice(0, colon).trim(), raw = segment.slice(colon + 1);
    const value = raw.trim();
    if (prop) top.declarations.push({ prop, value, valueStart: start + colon + 1 + raw.indexOf(value) });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const close = text.indexOf(ch, i + 1); i = close < 0 ? text.length : close; continue; }
    if (ch === "(") parens++;
    else if (ch === ")") parens = Math.max(0, parens - 1);
    if (parens > 0) continue;
    if (ch === "{") {
      const block = { prelude: text.slice(start, i).trim().replace(/\s+/g, " "), declarations: [] };
      stack.push(block); out.push(block); start = i + 1;
    } else if (ch === ";") { declare(i); start = i + 1; }
    else if (ch === "}") { declare(i); stack.pop(); start = i + 1; }
  }
  return out;
}

// Splits on commas outside parentheses, brackets and strings.
function splitTopLevel(text: string) {
  const parts: string[] = [];
  let depth = 0, start = 0, quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

const isRoot = (prelude: string) => splitTopLevel(prelude).some(selector => selector.startsWith(":root"));
const isTheme = (prelude: string) => prelude.startsWith("@theme");

function rootTokens(css: string) {
  const tokens = new Map<string, string>();
  for (const block of blocks(css)) {
    if (!isRoot(block.prelude)) continue;
    for (const d of block.declarations) if (d.prop.startsWith("--")) tokens.set(d.prop, d.value);
  }
  return tokens;
}

const varPattern = /var\(\s*(--[\w-]+)/g;
const runtimeVariable = (name: string) => name.startsWith("--tw-") || name.startsWith("--radix-");

export interface VarUse { path: string; line: number; name: string }

/** Lists `var(--*)` reads with no `:root` or `@theme` definition in any of the files. */
export function cssVarUsage(files: SourceFile[]): VarUse[] {
  const defined = new Set<string>();
  const parsed = files.map(file => ({ file, blocks: file.path.endsWith(".css") ? blocks(file.text) : [] }));
  for (const { blocks: list } of parsed) {
    for (const block of list) {
      if (!isRoot(block.prelude) && !isTheme(block.prelude)) continue;
      for (const d of block.declarations) if (d.prop.startsWith("--")) defined.add(d.prop);
    }
  }
  const uses: VarUse[] = [];
  const report = (path: string, text: string, index: number, name: string) => {
    if (!defined.has(name) && !runtimeVariable(name)) uses.push({ path, line: lineAt(text, index), name });
  };
  for (const { file, blocks: list } of parsed) {
    if (!file.path.endsWith(".css")) {
      for (const match of file.text.matchAll(varPattern)) report(file.path, file.text, match.index, match[1]!);
      continue;
    }
    for (const block of list) {
      for (const d of block.declarations) {
        for (const match of d.value.matchAll(varPattern)) report(file.path, file.text, d.valueStart + match.index, match[1]!);
      }
    }
  }
  return uses;
}

export const legacyNames = ["bg", "panel", "panel-2", "raised", "line", "line-2", "text", "text-2", "text-3", "text-4", "accent", "accent-ink", "accent-soft", "accent-line", "board-bg", "board-dot", "ok", "warn", "err", "shadow-1", "shadow-2", "tl-red", "tl-yellow", "tl-green", "font-sans"].map(name => `--${name}`);

/** Lists problems with the legacy names, which must stay as aliases of roles in the same file. */
export function legacyAliases(tokensCss: string): string[] {
  const tokens = rootTokens(tokensCss), problems: string[] = [];
  for (const name of legacyNames) {
    const value = tokens.get(name);
    if (value === undefined) { problems.push(`${name} is missing`); continue; }
    const target = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)?.[1];
    if (!target) problems.push(`${name} is not a var() alias: ${value}`);
    else if (!tokens.has(target)) problems.push(`${name} points to undefined ${target}`);
    else if (legacyNames.includes(target)) problems.push(`${name} points to legacy name ${target}`);
  }
  return problems;
}

export const citrusRoles = ["--surface-sidebar-selected", "--text-sidebar-selected", "--affordance-sidebar-hover", "--affordance-accent", "--affordance-accent-hover", "--affordance-accent-pressed", "--text-on-accent", "--surface-comment", "--text-comment", "--border-pin"];
const readsCitrus = (text: string) => [...text.matchAll(varPattern)].some(match => citrusRoles.includes(match[1]!) || match[1]!.startsWith("--citrus-"));

/** Lists, in source order, each selector (or TS file, or `@theme`) that reads a citrus role. */
export function accentPlaces(files: SourceFile[]): string[] {
  const places: string[] = [];
  const add = (place: string) => { if (!places.includes(place)) places.push(place); };
  for (const file of files) {
    if (!file.path.endsWith(".css")) {
      if (readsCitrus(file.text)) add(file.path.split("/").pop()!);
      continue;
    }
    for (const block of blocks(file.text)) {
      if (!block.declarations.some(d => readsCitrus(d.value))) continue;
      if (isTheme(block.prelude)) add("@theme");
      else for (const selector of splitTopLevel(block.prelude)) add(selector);
    }
  }
  return places;
}

/** The inner corner that stays concentric with an outer one: max(0, outer − inset − border). */
export function nestedRadius(outer: number, inset: number, border: number) {
  return Math.max(0, outer - inset - border);
}

interface Rgba { r: number; g: number; b: number; a: number }

const white: Rgba = { r: 255, g: 255, b: 255, a: 1 }, black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const named: Record<string, Rgba | undefined> = { transparent: { r: 0, g: 0, b: 0, a: 0 }, white, black };

function channel(text: string, max: number) {
  return text.endsWith("%") ? (Number(text.slice(0, -1)) / 100) * max : Number(text);
}

function parseColor(value: string, resolve: (name: string) => Rgba): Rgba | undefined {
  const v = value.trim().toLowerCase();
  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (reference) return resolve(reference[1]!);
  if (named[v]) return named[v];
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const [r = "", g = "", b = "", a = "ff"] = hex.length <= 4 ? [...hex].map(d => d + d) : hex.match(/../g)!;
    return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), a: parseInt(a, 16) / 255 };
  }
  const rgb = /^rgba?\((.*)\)$/.exec(v)?.[1];
  if (rgb) {
    const [colours = "", alpha] = rgb.split("/");
    const parts = colours.split(/[\s,]+/).filter(Boolean);
    const a = alpha ?? (parts.length === 4 ? parts.pop() : undefined);
    if (parts.length !== 3) return undefined;
    const [r = 0, g = 0, b = 0] = parts.map(part => channel(part, 255));
    return { r, g, b, a: a === undefined ? 1 : channel(a.trim(), 1) };
  }
  const mix = /^color-mix\(\s*in srgb\s*,(.*)\)$/.exec(v)?.[1];
  if (mix) {
    const args = splitTopLevel(mix).map(arg => {
      const percent = /\s(\d+(?:\.\d+)?)%$/.exec(arg);
      const colour = parseColor(percent ? arg.slice(0, percent.index) : arg, resolve);
      return colour && { colour, p: percent ? Number(percent[1]) / 100 : undefined };
    });
    const [first, second] = args;
    if (args.length !== 2 || !first || !second) return undefined;
    let p1 = first.p ?? (second.p === undefined ? 0.5 : 1 - second.p);
    let p2 = second.p ?? 1 - p1;
    const sum = p1 + p2;
    p1 /= sum; p2 /= sum;
    // CSS Color 5 mixes premultiplied channels, then scales alpha when the percentages sum below 100%.
    const a = first.colour.a * p1 + second.colour.a * p2;
    const mixChannel = (key: "r" | "g" | "b") => a === 0 ? 0 : (first.colour[key] * first.colour.a * p1 + second.colour[key] * second.colour.a * p2) / a;
    return { r: mixChannel("r"), g: mixChannel("g"), b: mixChannel("b"), a: a * Math.min(1, sum) };
  }
  return undefined;
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mixChannel = (key: "r" | "g" | "b") => Math.round(top[key] * top.a + bottom[key] * (1 - top.a));
  return { r: mixChannel("r"), g: mixChannel("g"), b: mixChannel("b"), a: 1 };
}

const hexOf = (c: Rgba) => `#${[c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

function relativeLuminance(c: Rgba) {
  const linear = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

// APCA-W3 0.0.98G: simple 2.4 power curve, soft black clamp, then the
// polarity-specific exponents. Returns Lc (negative for light text on dark).
function apcaLc(text: Rgba, background: Rgba) {
  const y = (c: Rgba) => 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4;
  const clamp = (v: number) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const t = clamp(y(text)), b = clamp(y(background));
  if (Math.abs(b - t) < 0.0005) return 0;
  if (b > t) {
    const sapc = (b ** 0.56 - t ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (b ** 0.65 - t ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

export type ContrastKind = "body" | "meta" | "nontext" | "disabled";
export interface ContrastPair { fg: string; bg: string; kind: ContrastKind }
export interface ContrastResult extends ContrastPair {
  backdrop: "white" | "black" | null;
  fgHex: string; bgHex: string; wcag: number; apca: number; ok: boolean;
}

const meets: Record<ContrastKind, (wcag: number, lc: number) => boolean> = {
  body: (wcag, lc) => wcag >= 4.5 && Math.abs(lc) >= 60,
  meta: (_, lc) => Math.abs(lc) >= 45,
  nontext: wcag => wcag >= 3,
  // Unavailable controls are exempt: low contrast is how they read as unavailable.
  disabled: () => true,
};

/** Measures each token pair; a translucent background yields one result per backdrop (white, black). */
export function contrastPairs(tokensCss: string, pairs: ContrastPair[]): ContrastResult[] {
  const tokens = rootTokens(tokensCss);
  const resolve = (name: string, seen: string[] = []): Rgba => {
    const value = tokens.get(name);
    if (value === undefined) throw new Error(`${[...seen, name].join(" → ")} is not defined`);
    if (seen.includes(name)) throw new Error(`${[...seen, name].join(" → ")} is circular`);
    const colour = parseColor(value, next => resolve(next, [...seen, name]));
    if (!colour) throw new Error(`${name} has an unsupported colour: ${value}`);
    return colour;
  };
  return pairs.flatMap(pair => {
    const fg = resolve(pair.fg), bg = resolve(pair.bg);
    const backdrops = bg.a < 1 ? (["white", "black"] as const) : [null];
    return backdrops.map(backdrop => {
      const ground = over(bg, backdrop === "black" ? black : white);
      const ink = over(fg, ground);
      const wcag = (Math.max(relativeLuminance(ink), relativeLuminance(ground)) + 0.05) / (Math.min(relativeLuminance(ink), relativeLuminance(ground)) + 0.05);
      const apca = apcaLc(ink, ground);
      return { ...pair, backdrop, fgHex: hexOf(ink), bgHex: hexOf(ground), wcag, apca, ok: meets[pair.kind](wcag, apca) };
    });
  });
}
