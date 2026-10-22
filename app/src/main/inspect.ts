// Pure inspector logic over CDP `CSS.getMatchedStylesForNode` and
// `CSS.getComputedStyleForNode` output (select-inspect, PoC 2). CDP finds the
// matched rules and orders them; what it leaves to us is importance, the
// shorthand part behind each longhand, var() and token chains, inheritance,
// and the display form. Electron-free so it is tested with recorded output.
//
// Known gaps, shared with the script method PoC 2 measured: the `inherit`
// keyword (reported as unknown), variables invalid at computed-value time
// (unknown), var() resolved with the selected element's custom properties
// even for an inherited declaration, logical properties read as horizontal-tb
// left-to-right, and `:not(:hover)` counted as a hover state. An author
// declaration through a property not mapped here is unknown, never default.

export type InspectGroup = "box" | "typography" | "colors" | "effects";
export type InspectState = "token" | "hardcoded" | "unknown" | "default";

export interface InspectRow {
  group: InspectGroup;
  label: string;
  value: string;
  state: InspectState;
  // Space-separated when the sides of a combined row use different tokens.
  token?: string;
  // The declared token first, then each token it points at.
  chain?: string[];
  inheritedFrom?: string;
  hoverState?: boolean;
}

export type InspectResult = { ok: true; rows: InspectRow[] } | { ok: false; reason: string };

// The subset of CDP types read here.
export interface CdpProperty {
  name: string;
  value: string;
  important?: boolean;
  disabled?: boolean;
  parsedOk?: boolean;
  text?: string;
  longhandProperties?: { name: string; value: string }[];
}
export interface CdpStyle {
  cssProperties: CdpProperty[];
  shorthandEntries?: { name: string; value: string; important?: boolean }[];
}
export interface CdpRuleMatch {
  matchingSelectors?: number[];
  rule: {
    origin: string;
    selectorList: { text: string; selectors: { text: string }[] };
    layers?: { text: string }[];
    style: CdpStyle;
  };
}
export interface MatchedStyles {
  inlineStyle?: CdpStyle;
  attributesStyle?: CdpStyle;
  matchedCSSRules?: CdpRuleMatch[];
  inherited?: { inlineStyle?: CdpStyle; matchedCSSRules?: CdpRuleMatch[] }[];
}
export interface InspectInput {
  matched: MatchedStyles;
  computed: { name: string; value: string }[];
  // Tag names of the ancestors, nearest first; `matched.inherited[i]` is `ancestors[i]`.
  ancestors: string[];
}

export interface LonghandSource {
  state: InspectState;
  token?: string;
  chain?: string[];
  inheritedFrom?: string;
  hoverState?: boolean;
}

const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
const INHERITED = new Set(["color", "font-family", "font-size", "line-height", "font-weight"]);
const CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const STATE_PSEUDO = /:(hover|active|focus|focus-visible|focus-within)(?![\w-])/;

type Part =
  | { kind: "box"; index: number }
  | { kind: "pair"; index: number }
  | { kind: "radius"; index: number }
  | { kind: "border" }
  | { kind: "font"; which: "weight" | "size" | "lineHeight" | "family" }
  | { kind: "background" };

// longhand -> shorthands that can set it, with how to find its part.
const SHORTHANDS: Record<string, { name: string; part: Part }[]> = {};
const add = (longhand: string, name: string, part: Part) => { (SHORTHANDS[longhand] ??= []).push({ name, part }); };
// Logical longhands as horizontal-tb, left-to-right.
const LOGICAL: Record<string, string> = {};
const LOGICAL_SIDE = { top: "block-start", right: "inline-end", bottom: "block-end", left: "inline-start" } as const;
SIDES.forEach((side, index) => {
  for (const box of ["padding", "margin"]) {
    add(`${box}-${side}`, box, { kind: "box", index });
    const axis = side === "top" || side === "bottom" ? "block" : "inline";
    add(`${box}-${side}`, `${box}-${axis}`, { kind: "pair", index: side === "top" || side === "left" ? 0 : 1 });
    LOGICAL[`${box}-${LOGICAL_SIDE[side]}`] = `${box}-${side}`;
  }
  const color = `border-${side}-color`;
  add(color, "border-color", { kind: "box", index });
  for (const name of ["border", `border-${side}`, `border-${LOGICAL_SIDE[side]}`]) add(color, name, { kind: "border" });
  LOGICAL[`border-${LOGICAL_SIDE[side]}-color`] = color;
});
for (const [axis, sides] of [["block", ["top", "bottom"]], ["inline", ["left", "right"]]] as const) {
  sides.forEach((side, index) => {
    add(`border-${side}-color`, `border-${axis}-color`, { kind: "pair", index });
    add(`border-${side}-color`, `border-${axis}`, { kind: "border" });
  });
}
CORNERS.forEach((corner, index) => add(`border-${corner}-radius`, "border-radius", { kind: "radius", index }));
const LOGICAL_CORNER = { "top-left": "start-start", "top-right": "start-end", "bottom-right": "end-end", "bottom-left": "end-start" } as const;
for (const corner of CORNERS) LOGICAL[`border-${LOGICAL_CORNER[corner]}-radius`] = `border-${corner}-radius`;
LOGICAL["inline-size"] = "width";
LOGICAL["block-size"] = "height";
for (const name of ["gap", "grid-gap"]) {
  add("row-gap", name, { kind: "pair", index: 0 });
  add("column-gap", name, { kind: "pair", index: 1 });
}
add("font-weight", "font", { kind: "font", which: "weight" });
add("font-size", "font", { kind: "font", which: "size" });
add("line-height", "font", { kind: "font", which: "lineHeight" });
add("font-family", "font", { kind: "font", which: "family" });
add("background-color", "background", { kind: "background" });

interface Declaration {
  value: string;
  important: boolean;
  shorthand?: { name: string; part: Part };
  // Set through a property this file does not map, so its source is unknown.
  unmapped?: boolean;
}

function clean(value: string): string {
  return value.replace(/\s*!\s*important\s*$/i, "").trim();
}

// The winning declaration for `prop` inside one style block. CDP lists the
// authored declarations (with `text`) followed by their expanded longhands; a
// block with no `text` at all (user-agent, attribute styles) lists only longhands.
function blockDeclaration(style: CdpStyle | undefined, prop: string): Declaration | null {
  if (!style) return null;
  const live = style.cssProperties.filter((p) => p.disabled !== true && p.parsedOk !== false);
  const authored = live.some((p) => p.text !== undefined) ? live.filter((p) => p.text !== undefined) : live;
  const shorthands = SHORTHANDS[prop] ?? [];
  let normal: Declaration | null = null;
  let important: Declaration | null = null;
  const take = (decl: Declaration) => {
    if (decl.important) important = decl;
    else normal = decl;
  };
  const physical = (name: string) => LOGICAL[name] ?? name;
  for (const p of authored) {
    const name = physical(p.name);
    const shorthand = shorthands.find((s) => s.name === p.name);
    if (name === prop && p.value !== "") take({ value: clean(p.value), important: p.important === true });
    else if (shorthand && p.value !== "") take({ value: clean(p.value), important: p.important === true, shorthand });
    // `all` resets every property but custom ones; its value is always a CSS-wide keyword.
    else if (p.name === "all" && !prop.startsWith("--")) take({ value: clean(p.value), important: p.important === true });
    else if ((p.longhandProperties ?? []).some((l) => physical(l.name) === prop)) take({ value: clean(p.value), important: p.important === true, unmapped: true });
    else if (name === prop && p.value === "") {
      // A longhand left empty by a var() shorthand (pending substitution).
      const entry = (style.shorthandEntries ?? []).find((e) => shorthands.some((s) => s.name === e.name));
      const found = entry && shorthands.find((s) => s.name === entry.name);
      if (entry && found) take({ value: clean(entry.value), important: entry.important === true, shorthand: found });
    }
  }
  const found: Declaration | null = important ?? normal;
  if (found !== null || authored === live) return found;
  // CDP expanded some authored shorthand this file does not map into `prop`.
  const derived = live.find((p) => p.text === undefined && physical(p.name) === prop);
  return derived ? { value: clean(derived.value), important: derived.important === true, unmapped: true } : null;
}

interface Candidate extends Declaration {
  ua: boolean;
  inline: boolean;
  layer: string | null;
  selector: string;
}

function selectorOf(match: CdpRuleMatch): string {
  const { selectors, text } = match.rule.selectorList;
  const picked = (match.matchingSelectors ?? []).map((i) => selectors[i]?.text).filter((s): s is string => s !== undefined);
  return picked.length > 0 ? picked.join(", ") : text;
}

// Candidates in CDP's ascending cascade order: rules (user-agent first, layers
// already ordered), attribute styles just above the user-agent rules, then the
// style attribute.
function candidates(level: { inlineStyle?: CdpStyle; attributesStyle?: CdpStyle; matchedCSSRules?: CdpRuleMatch[] }, prop: string): Candidate[] {
  const out: Candidate[] = [];
  const rules = level.matchedCSSRules ?? [];
  const firstAuthor = rules.findIndex((m) => m.rule.origin !== "user-agent");
  const attributes = blockDeclaration(level.attributesStyle, prop);
  const pushAttributes = () => { if (attributes) out.push({ ...attributes, ua: false, inline: false, layer: null, selector: "" }); };
  rules.forEach((match, index) => {
    if (index === firstAuthor) pushAttributes();
    const decl = blockDeclaration(match.rule.style, prop);
    if (!decl) return;
    const layers = match.rule.layers ?? [];
    out.push({ ...decl, ua: match.rule.origin === "user-agent", inline: false, layer: layers.length > 0 ? layers.map((l) => l.text).join(".") : null, selector: selectorOf(match) });
  });
  if (firstAuthor === -1) pushAttributes();
  const inline = blockDeclaration(level.inlineStyle, prop);
  if (inline) out.push({ ...inline, ua: false, inline: true, layer: null, selector: "" });
  return out;
}

// CDP gives normal-declaration order; importance reverses origins and layers.
function cascadeWinner(list: Candidate[]): Candidate | null {
  const important = list.filter((c) => c.important);
  if (important.length === 0) return list.at(-1) ?? null;
  const ua = important.filter((c) => c.ua);
  if (ua.length > 0) return ua.at(-1) ?? null;
  const inline = important.filter((c) => c.inline);
  if (inline.length > 0) return inline.at(-1) ?? null;
  const layered = important.filter((c) => c.layer !== null);
  if (layered.length > 0) {
    const first = layered[0]?.layer;
    return layered.filter((c) => c.layer === first).at(-1) ?? null;
  }
  return important.at(-1) ?? null;
}

function levelOf(matched: MatchedStyles, level: number) {
  return level === 0 ? matched : matched.inherited?.[level - 1];
}

// ---- values -------------------------------------------------------------

function closeParen(value: string, open: number): number {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

function splitComma(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

interface Resolved {
  text: string;
  used: string[];
  // False when a variable has no value and no fallback (invalid at computed-value time).
  ok: boolean;
}

export function resolveVars(value: string, vars: ReadonlyMap<string, string>): Resolved {
  let text = "";
  const used: string[] = [];
  let ok = true;
  let i = 0;
  for (;;) {
    const start = value.indexOf("var(", i);
    if (start === -1) {
      text += value.slice(i);
      break;
    }
    text += value.slice(i, start);
    const end = closeParen(value, start + 3);
    if (end === -1) return { text: text + value.slice(start), used, ok: false };
    const [rawName = "", ...rest] = splitComma(value.slice(start + 4, end));
    const name = rawName.trim();
    const own = vars.get(name);
    if (own !== undefined && own.trim() !== "") {
      used.push(name);
      text += own.trim();
    } else if (rest.length > 0) {
      const fallback = resolveVars(rest.join(",").trim(), vars);
      used.push(...fallback.used);
      ok &&= fallback.ok;
      text += fallback.text;
    } else ok = false;
    i = end + 1;
  }
  return { text, used, ok };
}

interface Piece {
  text: string;
  tokens: string[];
  ok: boolean;
}

// Top-level words of a value; "/" and "," are pieces of their own. Quotes and
// parentheses keep their contents together.
function words(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  const flush = () => { if (current !== "") out.push(current); current = ""; };
  for (const ch of value) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === "\"" || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (depth === 0 && /\s/.test(ch)) flush();
    else if (depth === 0 && (ch === "/" || ch === ",")) {
      flush();
      out.push(ch);
    } else current += ch;
  }
  flush();
  return out;
}

// A variable can stand for several words (`--pair: 8px 16px`), so each word is
// resolved and split again, keeping the token it came from.
function pieces(value: string, vars: ReadonlyMap<string, string>): Piece[] {
  const out: Piece[] = [];
  for (const word of words(value)) {
    if (!word.includes("var(")) {
      out.push({ text: word, tokens: [], ok: true });
      continue;
    }
    const resolved = resolveVars(word, vars);
    for (const text of words(resolved.text)) out.push({ text, tokens: resolved.used, ok: resolved.ok });
    if (!resolved.ok && resolved.text.trim() === "") out.push({ text: "", tokens: resolved.used, ok: false });
  }
  return out;
}

const LENGTH = /^(-?[\d.]+(e-?\d+)?[a-z%]+|0|(calc|min|max|clamp)\(.*\))$/i;
const BORDER_WIDTH = /^(thin|medium|thick)$/i;
const BORDER_STYLE = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/i;
const FONT_SIZE = /^([\d.]+[a-z%]+|(xx?-|xxx-)?(small|large)|medium|smaller|larger|(calc|min|max|clamp)\(.*\))$/i;
const FONT_WEIGHT = /^(\d+|bold|bolder|lighter)$/i;
const SYSTEM_FONT = /^(caption|icon|menu|message-box|small-caption|status-bar)$/i;
const BACKGROUND_WORD = /^(none|repeat|no-repeat|repeat-x|repeat-y|space|round|scroll|fixed|local|border-box|padding-box|content-box|text|top|bottom|left|right|center|auto|cover|contain)$/i;
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;

function isColorWord(text: string): boolean {
  if (text.startsWith("#") || COLOR_FUNCTION.test(text)) return true;
  if (/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(/i.test(text)) return false;
  return /^[a-z-]+$/i.test(text) && !BACKGROUND_WORD.test(text);
}

// The pieces of a shorthand that set one longhand: an empty list means the
// shorthand left it at its initial value; null means the part cannot be found.
function partOf(list: Piece[], part: Part): Piece[] | null {
  const values = list.filter((p) => p.text !== "/" && p.text !== ",");
  const positional = (from: Piece[], index: number) => {
    const n = from.length;
    if (n < 1 || n > 4) return null;
    const pick = n === 1 ? 0 : n === 2 ? index % 2 : n === 3 ? (index === 3 ? 1 : index) : index;
    const piece = from[pick];
    return piece ? [piece] : null;
  };
  switch (part.kind) {
    case "box":
      return positional(values, part.index);
    case "radius": {
      const slash = list.findIndex((p) => p.text === "/");
      return positional(slash === -1 ? values : list.slice(0, slash), part.index);
    }
    case "pair": {
      if (values.length < 1 || values.length > 2) return null;
      const piece = values[part.index] ?? values[0];
      return piece ? [piece] : null;
    }
    case "border": {
      const color = values.filter((p) => !LENGTH.test(p.text) && !BORDER_WIDTH.test(p.text) && !BORDER_STYLE.test(p.text));
      return color.length <= 1 ? color : null;
    }
    case "background": {
      const lastComma = list.map((p) => p.text).lastIndexOf(",");
      const layer = list.slice(lastComma + 1).filter((p) => p.text !== "/");
      const color = layer.filter((p) => isColorWord(p.text));
      return color.length <= 1 ? color : null;
    }
    case "font": {
      if (values.length === 1 && SYSTEM_FONT.test(values[0]?.text ?? "")) return values;
      const slash = list.findIndex((p) => p.text === "/");
      const size = slash > 0 ? slash - 1 : list.findIndex((p) => p.text !== "," && FONT_SIZE.test(p.text));
      if (size < 0) return null;
      const familyStart = slash > 0 ? slash + 2 : size + 1;
      switch (part.which) {
        case "size":
          return list.slice(size, size + 1);
        case "lineHeight":
          return slash > 0 ? list.slice(slash + 1, slash + 2) : [];
        case "family": {
          const family = list.slice(familyStart);
          return family.length > 0 ? family : null;
        }
        case "weight":
          return list.slice(0, size).filter((p) => FONT_WEIGHT.test(p.text));
      }
    }
  }
}

function sourceOfValue(decl: Declaration, vars: ReadonlyMap<string, string>): Pick<LonghandSource, "state" | "token"> {
  if (decl.unmapped) return { state: "unknown" };
  if (CSS_WIDE.has(decl.value.toLowerCase())) return { state: "unknown" };
  if (!decl.value.includes("var(")) return { state: "hardcoded" };
  if (decl.shorthand === undefined) {
    const resolved = resolveVars(decl.value, vars);
    if (!resolved.ok) return { state: "unknown" };
    return resolved.used[0] !== undefined ? { state: "token", token: resolved.used[0] } : { state: "hardcoded" };
  }
  const part = partOf(pieces(decl.value, vars), decl.shorthand.part);
  if (part === null || part.some((p) => !p.ok)) return { state: "unknown" };
  const token = part.flatMap((p) => p.tokens)[0];
  return token !== undefined ? { state: "token", token } : { state: "hardcoded" };
}

const VAR_ONLY = /^var\(\s*(--[^\s,)]+)\s*(,.*)?\)$/s;

// `--a: var(--b)` declared on the element or an ancestor, followed up to 8 steps.
function tokenChain(matched: MatchedStyles, token: string, fromLevel: number): string[] {
  const chain = [token];
  let name = token;
  let level = fromLevel;
  const depth = (matched.inherited?.length ?? 0) + 1;
  while (chain.length < 8) {
    let next: string | undefined;
    for (; level < depth; level++) {
      const at = levelOf(matched, level);
      const winner = at ? cascadeWinner(candidates(at, name)) : null;
      if (winner) {
        next = VAR_ONLY.exec(winner.value)?.[1];
        break;
      }
    }
    if (next === undefined || chain.includes(next)) break;
    chain.push(next);
    name = next;
  }
  return chain;
}

export function longhandSource(input: InspectInput, prop: string): LonghandSource {
  const { matched } = input;
  let level = 0;
  let winner = cascadeWinner(candidates(matched, prop));
  if (winner === null && INHERITED.has(prop)) {
    const ancestors = matched.inherited ?? [];
    for (let i = 0; i < ancestors.length && winner === null; i++) {
      const at = ancestors[i];
      winner = at ? cascadeWinner(candidates(at, prop)) : null;
      level = i + 1;
    }
  }
  if (winner === null || winner.ua) return { state: "default" };
  const vars = new Map(input.computed.filter((c) => c.name.startsWith("--")).map((c) => [c.name, c.value]));
  const found: LonghandSource = sourceOfValue(winner, vars);
  if (found.token !== undefined) {
    const chain = tokenChain(matched, found.token, level);
    if (chain.length > 1) found.chain = chain;
  }
  if (level > 0) {
    const tag = input.ancestors[level - 1];
    if (tag !== undefined) found.inheritedFrom = tag;
  }
  if (STATE_PSEUDO.test(winner.selector)) found.hoverState = true;
  return found;
}

// ---- rows ---------------------------------------------------------------

export function colorHex(value: string): string {
  const match = /^rgba?\(\s*([^)]*)\)$/i.exec(value.trim());
  if (!match) return value;
  const parts = (match[1] ?? "").split(/[\s,/]+/).filter((p) => p !== "");
  if (parts.length < 3 || parts.length > 4) return value;
  const channel = (p: string) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const rgb = parts.slice(0, 3).map(channel);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if ([...rgb, alpha].some((n) => Number.isNaN(n))) return value;
  if (alpha <= 0) return "transparent";
  const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${rgb.map(hex).join("")}${alpha < 1 ? hex(alpha * 255) : ""}`;
}

export function collapseBox(values: readonly string[]): string {
  const [top = "", right = "", bottom = "", left = ""] = values;
  if (right === left) {
    if (top === bottom) return top === right ? top : `${top} ${right}`;
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}

// design.md 'length caps': one inspector value or token name is at most 500
// UTF-16 units. Values come straight from the canvas's CSS through CDP, so
// main cuts them before they cross IPC.
const VALUE_LIMIT = 500;

function cap(text: string): string {
  if (text.length <= VALUE_LIMIT) return text;
  let end = VALUE_LIMIT - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return `${text.slice(0, end)}…`;
}

const RANK: Record<InspectState, number> = { default: 0, token: 1, hardcoded: 2, unknown: 3 };

const ROWS: { group: InspectGroup; label: string; props: string[]; color?: boolean }[] = [
  { group: "box", label: "Width", props: ["width"] },
  { group: "box", label: "Height", props: ["height"] },
  { group: "box", label: "Padding", props: SIDES.map((s) => `padding-${s}`) },
  { group: "box", label: "Margin", props: SIDES.map((s) => `margin-${s}`) },
  { group: "box", label: "Gap", props: ["row-gap", "column-gap"] },
  { group: "typography", label: "Family", props: ["font-family"] },
  { group: "typography", label: "Size", props: ["font-size"] },
  { group: "typography", label: "Line height", props: ["line-height"] },
  { group: "typography", label: "Weight", props: ["font-weight"] },
  { group: "colors", label: "Text", props: ["color"], color: true },
  { group: "colors", label: "Background", props: ["background-color"], color: true },
  { group: "colors", label: "Border", props: SIDES.map((s) => `border-${s}-color`), color: true },
  { group: "effects", label: "Radius", props: CORNERS.map((c) => `border-${c}-radius`) },
  { group: "effects", label: "Shadow", props: ["box-shadow"] },
];

function combine(values: string[]): string {
  if (values.length === 4) return collapseBox(values);
  if (values.length === 2) return values[0] === values[1] ? values[0] ?? "" : values.join(" ");
  return values[0] ?? "";
}

export function inspectRows(input: InspectInput): InspectRow[] {
  const computed = new Map(input.computed.map((c) => [c.name, c.value]));
  return ROWS.map(({ group, label, props, color }) => {
    let shown = props;
    let values = props.map((p) => computed.get(p) ?? "");
    if (color) values = values.map(colorHex);
    if (label === "Border") {
      // A zero-width side has no visible color; with no visible side the row is a dash.
      const visible = SIDES.map((s) => parseFloat(computed.get(`border-${s}-width`) ?? "0") > 0);
      if (!visible.includes(true)) return { group, label, value: "—", state: "default" };
      shown = props.filter((_, i) => visible[i]);
      const colors = values.filter((_, i) => visible[i]);
      values = colors.every((c) => c === colors[0]) ? [colors[0] ?? ""] : values.map((v, i) => (visible[i] ? v : "—"));
    }
    const sources = shown.map((p) => longhandSource(input, p));
    const state = sources.reduce<InspectState>((worst, s) => (RANK[s.state] > RANK[worst] ? s.state : worst), "default");
    const row: InspectRow = { group, label, value: cap(combine(values)), state };
    if (state === "token") {
      const tokens = [...new Set(sources.flatMap((s) => (s.token !== undefined ? [s.token] : [])))];
      row.token = cap(tokens.join(" "));
      const chain = tokens.length === 1 ? sources.find((s) => s.chain)?.chain : undefined;
      if (chain) row.chain = chain.map(cap);
    }
    const inherited = sources.length === 1 ? sources[0]?.inheritedFrom : undefined;
    if (inherited !== undefined) row.inheritedFrom = cap(inherited);
    if (sources.some((s) => s.hoverState)) row.hoverState = true;
    return row;
  });
}
