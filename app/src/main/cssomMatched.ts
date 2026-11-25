// The sandbox has no debugger, so the matched declarations are reconstructed here for inspectRows.
import {
  candidates,
  cascadeWinner,
  inspectRows,
  inspectRowDefinitions,
  type CdpProperty,
  type CdpRuleMatch,
  type CdpStyle,
  type InspectInput,
  type InspectRow,
  type MatchedStyles,
} from "./inspect";

// Every CSS shorthand a canvas may plausibly author; only used to map a pending-substitution longhand ("" value)
// back to the shorthand that holds the var() text.
const SHORTHANDS =
  "margin padding border border-top border-right border-bottom border-left border-color border-style border-width border-block border-inline border-block-start border-block-end border-inline-start border-inline-end border-block-color border-inline-color border-block-style border-inline-style border-block-width border-inline-width border-radius border-image font font-variant font-synthesis background background-position mask flex flex-flow gap grid-gap grid grid-template grid-area grid-row grid-column place-content place-items place-self inset inset-block inset-inline overflow outline list-style columns column-rule text-decoration text-emphasis transition animation offset margin-block margin-inline padding-block padding-inline scroll-margin scroll-padding container contain-intrinsic-size white-space text-wrap overscroll-behavior marker -webkit-text-stroke".split(
    " ",
  );

const longhandCache = new Map<string, string[]>();
function longhandsOf(shorthand: string): string[] {
  let list = longhandCache.get(shorthand);
  if (!list) {
    const s = document.createElement("div").style;
    s.setProperty(shorthand, "initial");
    list = Array.from(s);
    longhandCache.set(shorthand, list);
  }
  return list;
}

function pendingShorthand(style: CSSStyleDeclaration, longhand: string): string | null {
  for (const name of SHORTHANDS) {
    if (style.getPropertyValue(name) !== "" && longhandsOf(name).includes(longhand)) return name;
  }
  return null;
}

// Every entry carries `text`, so inspect.ts treats them as authored declarations (CDP's authored list).
function styleOf(style: CSSStyleDeclaration | undefined | null): CdpStyle {
  const cssProperties: CdpProperty[] = [];
  if (!style) return { cssProperties };
  const done = new Set<string>();
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    const value = style.getPropertyValue(name);
    const important = style.getPropertyPriority(name) === "important";
    // Chromium reports a longhand a shorthand reset implicitly as "initial" (CDP keeps the authored `background: none`);
    // a pending-substitution longhand (var() in its shorthand) as "". Both go back to the shorthand when one holds them.
    if (value !== "" && value !== "initial") {
      cssProperties.push({ name, value, important, text: "" });
      continue;
    }
    const shorthand = pendingShorthand(style, name);
    if (value === "initial" && shorthand === null) {
      cssProperties.push({ name, value, important, text: "" });
      continue;
    }
    if (shorthand === null) {
      // A later longhand can erase the shorthand text. Keep its place in the cascade:
      // otherwise an older declaration would supply a token for the applied value.
      cssProperties.push({ name, value: "", important, text: "", longhandProperties: [{ name, value: "" }] });
    } else if (!done.has(shorthand)) {
      done.add(shorthand);
      cssProperties.push({
        name: shorthand,
        value: style.getPropertyValue(shorthand),
        important: style.getPropertyPriority(shorthand) === "important",
        text: "",
        longhandProperties: longhandsOf(shorthand).map((n) => ({ name: n, value: "" })),
      });
    }
  }
  return { cssProperties };
}

function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0,
    quote = "",
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter((s) => s !== "");
}

type Spec = [number, number, number];
const ZERO: Spec = [0, 0, 0];
const cmp = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const maxSpec = (list: Spec[]) => list.reduce((m, s) => (cmp(s, m) > 0 ? s : m), ZERO);
const LEGACY_PSEUDO_ELEMENT = /^(before|after|first-line|first-letter)$/i;

export function specificity(selector: string): Spec {
  const s: Spec = [0, 0, 0];
  let i = 0;
  const n = selector.length;
  const ident = () => {
    const start = i;
    while (i < n && /[\w\-\\ -￿]/.test(selector[i]!)) {
      if (selector[i] === "\\") i++;
      i++;
    }
    return selector.slice(start, i);
  };
  const group = (): string => {
    let depth = 0;
    const start = i + 1;
    for (; i < n; i++) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")" && --depth === 0) {
        i++;
        return selector.slice(start, i - 1);
      }
    }
    return selector.slice(start);
  };
  const add = (t: Spec) => {
    s[0] += t[0];
    s[1] += t[1];
    s[2] += t[2];
  };
  while (i < n) {
    const c = selector[i]!;
    if (c === "#") {
      i++;
      ident();
      s[0]++;
    } else if (c === ".") {
      i++;
      ident();
      s[1]++;
    } else if (c === "[") {
      while (i < n && selector[i] !== "]") {
        if (selector[i] === '"' || selector[i] === "'") {
          const q = selector[i++];
          while (i < n && selector[i] !== q) i++;
        }
        i++;
      }
      i++;
      s[1]++;
    } else if (c === ":" && selector[i + 1] === ":") {
      i += 2;
      ident();
      if (selector[i] === "(") group();
      s[2]++;
    } else if (c === ":") {
      i++;
      const name = ident().toLowerCase();
      if (selector[i] === "(") {
        const arg = group();
        if (name === "where") {
          /* zero */
        } else if (name === "is" || name === "not" || name === "has" || name === "matches" || name === "-webkit-any")
          add(maxSpec(splitTop(arg, ",").map(specificity)));
        else if (name === "nth-child" || name === "nth-last-child") {
          s[1]++;
          const of = /\sof\s/i.exec(arg);
          if (of) add(maxSpec(splitTop(arg.slice(of.index + of[0].length), ",").map(specificity)));
        } else if (name === "host" || name === "host-context") {
          s[1]++;
          add(specificity(arg));
        } else s[1]++;
      } else if (LEGACY_PSEUDO_ELEMENT.test(name)) s[2]++;
      else s[1]++;
    } else if (c === "*") i++;
    else if (/[a-zA-Z_\-\\ -￿]/.test(c)) {
      ident();
      if (selector[i] === "|") {
        i++;
        if (selector[i] === "*") i++;
        else ident();
      }
      s[2]++;
    } else if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n && selector[i] !== q) i++;
      i++;
    } else i++;
  }
  return s;
}

// Replaces each nesting `&` outside strings and attribute brackets.
function expandNested(own: string, parent: string): string {
  const is = `:is(${parent})`;
  let out = "",
    quote = "",
    bracket = 0,
    found = false;
  for (let i = 0; i < own.length; i++) {
    const c = own[i]!;
    if (quote) {
      out += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === "[") bracket++;
    if (c === "]") bracket--;
    if (c === "&" && bracket === 0) {
      out += is;
      found = true;
      continue;
    }
    out += c;
  }
  return found ? out : `${is} ${own}`;
}

interface Entry {
  style: CSSStyleDeclaration;
  match: string[]; // full selectors used with element.matches, one per listed selector
  shown: string[]; // the selector texts reported (the rule's own text, as CDP does)
  layer: string | null;
  order: number;
  scopeMarkers?: string[];
  containers: number[]; // indexes into the container conditions
}

interface LayerNode {
  key: string;
  children: Map<string, LayerNode>;
}

interface Collected {
  entries: Entry[];
  layerRank: Map<string | null, number>;
  conditions: string[];
  scopeCSS: string[];
  unreadable: CSSStyleSheet[];
}

function decodeData(href: string): string | null {
  const m = /^data:([^,]*),(.*)$/s.exec(href);
  if (!m) return null;
  try {
    if (/;base64$/i.test(m[1]!)) return new TextDecoder().decode(Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0)));
    return decodeURIComponent(m[2]!);
  } catch {
    return null;
  }
}

type Lead = { layers: string[] } | { href: string; layer: string | null; supports: string | null; media: string };

// The statements that may precede a sheet's rules (@charset, @layer statements, @import), which a constructed sheet
// (replaceSync) drops or refuses: read from the text, in order.
function leading(text: string): Lead[] {
  const out: Lead[] = [];
  let i = 0;
  const skip = () => {
    for (;;) {
      while (/\s/.test(text[i] ?? "")) i++;
      if (text.startsWith("/*", i)) {
        const e = text.indexOf("*/", i + 2);
        i = e < 0 ? text.length : e + 2;
      } else return;
    }
  };
  const statement = () => {
    // to the next top-level ";"
    let depth = 0,
      quote = "",
      start = i;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) {
        i++;
        return text.slice(start, i - 1);
      } else if (c === "{" && depth === 0) return null;
    }
    return null;
  };
  const unquote = (v: string) => {
    v = v.trim();
    if (/^["']/.test(v)) v = v.slice(1, -1);
    return v.replace(/\\(.)/g, "$1");
  };
  for (;;) {
    skip();
    const m = /^@(charset|layer|import)\b/i.exec(text.slice(i, i + 10));
    if (!m) return out;
    const save = i;
    i += m[0].length;
    const body = statement();
    if (body === null) {
      i = save;
      return out;
    } // a @layer block: the rules start here
    const kind = m[1]!.toLowerCase();
    if (kind === "layer")
      out.push({
        layers: body
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      });
    else if (kind === "import") {
      let rest = body.trim(),
        href = "";
      if (/^url\(/i.test(rest)) {
        let d = 0,
          k = 0;
        for (; k < rest.length; k++) {
          if (rest[k] === "(") d++;
          else if (rest[k] === ")" && --d === 0) break;
        }
        href = unquote(rest.slice(4, k));
        rest = rest.slice(k + 1).trim();
      } else {
        const q = rest[0]!;
        let k = 1;
        for (; k < rest.length && rest[k] !== q; k++) if (rest[k] === "\\") k++;
        href = unquote(rest.slice(0, k + 1));
        rest = rest.slice(k + 1).trim();
      }
      let layer: string | null = null,
        supports: string | null = null;
      const lm = /^layer(\(([^)]*)\))?/i.exec(rest);
      if (lm) {
        layer = (lm[2] ?? "").trim();
        rest = rest.slice(lm[0].length).trim();
      }
      if (/^supports\(/i.test(rest)) {
        let d = 0,
          k = 0;
        for (; k < rest.length; k++) {
          if (rest[k] === "(") d++;
          else if (rest[k] === ")" && --d === 0) break;
        }
        supports = rest.slice(9, k);
        rest = rest.slice(k + 1).trim();
      }
      out.push({ href, layer, supports, media: rest });
    }
  }
}

function collectRules(doc: Document, ancestors: Element[]): Collected {
  const scopeCSS: string[] = [];
  // Canvas custom properties must keep their own values while the probe is installed.
  const markerPrefix = `--doan-scope-${Math.random().toString(36).slice(2)}`;
  const entries: Entry[] = [];
  const unreadable: CSSStyleSheet[] = [];
  const conditions: string[] = [];
  let order = 0,
    anon = 0;
  const root: LayerNode = { key: "", children: new Map() };
  const nodes = new Map<string, LayerNode>([["", root]]);
  const layerOf = (parent: string | null, name: string): string => {
    let key = parent ?? "";
    for (const part of name === "" ? [`\u0000anon${anon++}`] : name.split(".")) {
      const node = nodes.get(key)!;
      const next = key === "" ? part : `${key}.${part}`;
      if (!node.children.has(part)) {
        const child = { key: next, children: new Map() };
        node.children.set(part, child);
        nodes.set(next, child);
      }
      key = next;
    }
    return key;
  };
  interface Ctx {
    layer: string | null;
    containers: number[];
    parent: string | null;
    sheetRoot: Element;
    scope?: { headers: string[]; selectors: { selector: string; marker: string }[] };
  }
  const sheet = (s: CSSStyleSheet, ctx: Ctx, href: string | null = s.href) => {
    if (s.disabled) return;
    let rules: CSSRuleList;
    try {
      rules = s.cssRules;
    } catch {
      const text = href === null ? null : decodeData(href);
      if (text === null) {
        unreadable.push(s);
        return;
      }
      fromText(text, ctx);
      return;
    }
    walk(rules, ctx);
  };
  const imported = (
    href: string,
    media: string,
    supports: string | null,
    layerName: string | null | undefined,
    ctx: Ctx,
    s: CSSStyleSheet | null,
  ) => {
    if (media && !matchMedia(media).matches) return;
    if (supports && !CSS.supports(supports)) return;
    const layer = layerName === null || layerName === undefined ? ctx.layer : layerOf(ctx.layer, layerName);
    if (s) sheet(s, { ...ctx, layer }, href);
    else {
      const text = decodeData(href);
      if (text !== null) {
        fromText(text, { ...ctx, layer });
      }
    }
  };
  const fromText = (text: string, ctx: Ctx) => {
    for (const lead of leading(text)) {
      if ("layers" in lead) lead.layers.forEach((n) => layerOf(ctx.layer, n));
      else imported(lead.href, lead.media, lead.supports, lead.layer, ctx, null);
    }
    const c = new CSSStyleSheet();
    c.replaceSync(text);
    walk(c.cssRules, ctx);
  };
  // The browser matches selectors inside their original @scope context, limits and :scope included. Restricting the
  // innermost scope to the one possible root at each document depth lets its marker report the winning root's proximity.
  const scoped = (rule: CSSScopeRule, ctx: Ctx) => {
    const { start, end } = rule;
    const contextual = ctx.parent !== null || ctx.scope !== undefined || /:scope|[&\\]/i.test(start ?? "");
    const roots = ancestors.flatMap((node, depth) =>
      (start === null ? node === ctx.sheetRoot : contextual || matches(node, start)) ? [depth] : []);

    const atDepth = (depth: number) => `:where(:root${" > *".repeat(depth)})`;
    const boundary = start ?? (roots.length ? atDepth(roots[0]!) : ":not(*)");
    const header = (selector: string) => `@scope (${selector})${end ? ` to (${end})` : ""}`;
    const outer = [...(ctx.scope?.headers ?? [])];
    if (ctx.parent) outer.push(ctx.parent);
    const scope: NonNullable<Ctx["scope"]> = { headers: [...outer, header(boundary)], selectors: [] };
    walk(rule.cssRules, { ...ctx, parent: null, scope });
    if (!scope.selectors.length) return;
    for (const depth of roots) {
      const root = roots.length === 1 ? boundary : splitTop(boundary, ",").map(s => s + atDepth(depth)).join(", ");
      const body = scope.selectors.map(({ selector, marker }) => `${selector} { ${marker}: ${depth} }`).join("\n");
      const css = `${header(root)} { ${body} }`;
      scopeCSS.push(outer.reduceRight((inner, group) => `${group} { ${inner} }`, css));
    }
  };
  const addEntry = (entry: Entry, ctx: Ctx) => {
    const scope = ctx.scope;
    if (scope) {
      entry.scopeMarkers = entry.match.map((selector, index) => {
        const marker = `${markerPrefix}-${entry.order}-${index}`;
        scopeCSS.push(`:where(*) { ${marker}: initial }`);
        scope.selectors.push({ selector, marker });
        return marker;
      });
    }
    entries.push(entry);
  };
  const walk = (rules: CSSRuleList, ctx: Ctx) => {
    for (const r of Array.from(rules)) {
      const kind = r.constructor.name;
      if (kind === "CSSImportRule") {
        const ir = r as CSSImportRule & { layerName?: string | null; supportsText?: string | null };
        imported(ir.href, ir.media.mediaText, ir.supportsText ?? null, ir.layerName, ctx, ir.styleSheet);
      } else if (kind === "CSSLayerStatementRule") {
        for (const name of (r as CSSLayerStatementRule).nameList) layerOf(ctx.layer, name);
      } else if (kind === "CSSLayerBlockRule") {
        walk((r as CSSLayerBlockRule).cssRules, { ...ctx, layer: layerOf(ctx.layer, (r as CSSLayerBlockRule).name) });
      } else if (kind === "CSSMediaRule") {
        if (matchMedia((r as CSSMediaRule).media.mediaText).matches) walk((r as CSSMediaRule).cssRules, ctx);
      } else if (kind === "CSSSupportsRule") {
        if (CSS.supports((r as CSSSupportsRule).conditionText)) walk((r as CSSSupportsRule).cssRules, ctx);
      } else if (kind === "CSSScopeRule") {
        scoped(r as CSSScopeRule, ctx);
      } else if (kind === "CSSContainerRule") {
        const text = (r as CSSContainerRule).conditionText;
        let index = conditions.indexOf(text);
        if (index === -1) index = conditions.push(text) - 1;
        walk((r as CSSContainerRule).cssRules, { ...ctx, containers: [...ctx.containers, index] });
      } else if (kind === "CSSStyleRule") {
        const sr = r as CSSStyleRule;
        const own = splitTop(sr.selectorText, ",");
        const match = ctx.parent === null ? own : own.map((s) => expandNested(s, ctx.parent!));
        addEntry({ style: sr.style, match, shown: own, layer: ctx.layer, order: order++, containers: ctx.containers }, ctx);
        // CSSStyleRule gained child rules with native nesting; earlier engines expose the style alone.
        const nested = (sr as Partial<CSSGroupingRule>).cssRules;
        if (nested?.length) walk(nested, { ...ctx, parent: match.join(", ") });
      } else if (kind === "CSSNestedDeclarations") {
        if (ctx.parent !== null || ctx.scope)
          addEntry({
            style: (r as CSSStyleRule).style,
            match: [ctx.parent === null ? ":where(:scope)" : `:is(${ctx.parent})`],
            shown: [ctx.parent ?? "&"],
            layer: ctx.layer,
            order: order++,
            containers: ctx.containers,
          }, ctx);
      }
    }
  };
  const topLevel = (s: CSSStyleSheet) => sheet(s, {
    layer: null, containers: [], parent: null, sheetRoot: s.ownerNode?.parentElement ?? doc.documentElement,
  });
  for (const s of doc.styleSheets) {
    if (s.media.mediaText && !matchMedia(s.media.mediaText).matches) continue;
    topLevel(s);
  }
  for (const s of doc.adoptedStyleSheets) topLevel(s);
  // Children before their parent's own rules; unlayered (the root) last.
  const layerRank = new Map<string | null, number>();
  let rank = 0;
  const visit = (node: LayerNode) => {
    for (const child of node.children.values()) visit(child);
    layerRank.set(node.key === "" ? null : node.key, rank++);
  };
  visit(root);
  return { entries, layerRank, conditions, scopeCSS, unreadable };
}

// Container queries have no script API; the engine evaluates them through a probe sheet: every element gets
// --doan-cq-N: 0, and 1 inside the condition.
function matchProbe(doc: Document, { conditions, scopeCSS }: Collected): () => void {
  if (!conditions.length && !scopeCSS.length) return () => {};
  const probe = new CSSStyleSheet();
  const zero = conditions.map((_, i) => `--doan-cq-${i}: 0`).join(";");
  const containers = conditions.map((c, i) => `@container ${c} { :where(*) { --doan-cq-${i}: 1 } }`);
  probe.replaceSync([`:where(*) { ${zero} }`, ...containers, ...scopeCSS].join("\n"));
  const before = [...doc.adoptedStyleSheets];
  doc.adoptedStyleSheets = [...before, probe];
  return () => {
    doc.adoptedStyleSheets = before;
  };
}

// The user-agent rules that set the inherited properties inspect.ts follows (color, font-*, line-height).
// A UA winner is "default"; without these, an inherited author value would be reported instead.
const UA: [string, string[]][] = [
  [":any-link", ["color"]],
  ["h1, h2, h3, h4, h5, h6", ["font-size", "font-weight"]],
  ["b, strong, th, optgroup", ["font-weight"]],
  ["small, sub, sup, big, rt", ["font-size"]],
  ["code, kbd, samp, pre, tt, xmp, plaintext, listing", ["font-family"]],
  ["input, textarea, select, button", ["color", "font-size", "font-family", "font-weight", "line-height"]],
  ["mark, hr, dialog, [popover]", ["color"]],
];

const SIZE_ATTR = /^(img|svg|video|iframe|embed|object|td|th|table|hr|col|rect|image|foreignobject)$/i;

function attributesStyle(el: Element): CdpStyle | undefined {
  if (!SIZE_ATTR.test(el.localName)) return undefined;
  const cssProperties: CdpProperty[] = [];
  for (const name of ["width", "height"]) {
    const v = el.getAttribute(name);
    if (v !== null && v.trim() !== "" && !Number.isNaN(parseFloat(v)))
      cssProperties.push({ name, value: /^[\d.]+$/.test(v.trim()) ? `${v.trim()}px` : v.trim() });
  }
  return cssProperties.length ? { cssProperties } : undefined;
}

function matches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

type Level = { inlineStyle?: CdpStyle; attributesStyle?: CdpStyle; matchedCSSRules: CdpRuleMatch[] };
function levelOf(el: Element, c: Collected): Level {
  const cs = c.conditions.length || c.scopeCSS.length ? getComputedStyle(el) : null;
  const hits: { m: CdpRuleMatch; spec: Spec; rank: number; depth: number; order: number }[] = [];
  for (const e of c.entries) {
    if (e.containers.some((i) => cs!.getPropertyValue(`--doan-cq-${i}`).trim() !== "1")) continue;
    const idx: number[] = [];
    let depth = -1;
    let spec: Spec | null = null;
    for (const [i, sel] of e.match.entries()) {
      let rootDepth = -1;
      if (e.scopeMarkers) {
        const value = cs!.getPropertyValue(e.scopeMarkers[i]!).trim();
        if (!value) continue;
        rootDepth = Number(value);
      } else if (!matches(el, sel)) continue;
      idx.push(i);
      const sp = specificity(sel);
      if (spec === null || cmp(sp, spec) > 0) {
        spec = sp;
        depth = rootDepth;
      } else if (cmp(sp, spec) === 0) depth = Math.max(depth, rootDepth);
    }
    if (spec === null) continue;
    const rule: CdpRuleMatch["rule"] = {
      origin: "regular",
      selectorList: { text: e.shown.join(", "), selectors: e.shown.map((text) => ({ text })) },
      style: styleOf(e.style),
    };
    if (e.layer !== null) rule.layers = [{ text: e.layer }];
    hits.push({ m: { matchingSelectors: idx, rule }, spec, depth, rank: c.layerRank.get(e.layer) ?? 0, order: e.order });
  }
  hits.sort((a, b) => a.rank - b.rank || cmp(a.spec, b.spec) || a.depth - b.depth || a.order - b.order);
  const ua: CdpRuleMatch[] = UA.filter(([sel]) => matches(el, sel)).map(([sel, props]) => ({
    matchingSelectors: [0],
    rule: {
      origin: "user-agent",
      selectorList: { text: sel, selectors: [{ text: sel }] },
      style: { cssProperties: props.map((name) => ({ name, value: "ua" })) },
    },
  }));
  const out: { inlineStyle?: CdpStyle; attributesStyle?: CdpStyle; matchedCSSRules: CdpRuleMatch[] } = {
    matchedCSSRules: [...ua, ...hits.map((h) => h.m)],
  };
  const inline = "style" in el && el.style instanceof CSSStyleDeclaration ? el.style : null;
  if (inline && inline.length) out.inlineStyle = styleOf(inline);
  const attrs = attributesStyle(el);
  if (attrs) out.attributesStyle = attrs;
  return out;
}

function ancestorLabel(el: Element): string {
  const frame = el.getAttribute("data-doan-frame");
  if (frame !== null) return el.getAttribute("data-doan-title")?.trim() || frame || el.localName;
  return el.getAttribute("data-doan-id") || el.localName;
}

const ROW_PROPS = [...inspectRowDefinitions.flatMap(row => row.props), ...["top", "right", "bottom", "left"].map(side => `border-${side}-width`)];
const propsByLabel = new Map(inspectRowDefinitions.map(row => [row.label, row.props]));

function customNames(c: Collected, el: Element): Set<string> {
  const from = (into: Set<string>, style: CSSStyleDeclaration) => {
    for (const name of style) if (name.startsWith("--") && !name.startsWith("--doan-cq-")) into.add(name);
  };
  const names = new Set<string>();
  for (const entry of c.entries) from(names, entry.style);
  const add = (s: CSSStyleDeclaration) => from(names, s);
  for (let a: Element | null = el; a; a = a.parentElement) {
    const s = "style" in a && a.style instanceof CSSStyleDeclaration ? a.style : null;
    if (s) add(s);
  }
  const cs = getComputedStyle(el);
  for (let i = 0; i < cs.length; i++) {
    const n = cs.item(i);
    if (n.startsWith("--") && !n.startsWith("--doan-cq-")) names.add(n);
  }
  return names;
}

function cssomMatched(el: Element, c: Collected, parents: Element[]): MatchedStyles {
  const matched: MatchedStyles = levelOf(el, c);
  matched.inherited = parents.map(parent => {
    const { inlineStyle, matchedCSSRules } = levelOf(parent, c);
    return inlineStyle ? { inlineStyle, matchedCSSRules } : { matchedCSSRules };
  });
  return matched;
}

function inspectInput(el: Element, c: Collected, parents: Element[]): InspectInput {
  const cs = getComputedStyle(el);
  const computed = ROW_PROPS.map((name) => ({ name, value: cs.getPropertyValue(name) }));
  for (const name of customNames(c, el)) computed.push({ name, value: cs.getPropertyValue(name) });
  return { matched: cssomMatched(el, c, parents), computed, ancestors: parents.map(ancestorLabel) };
}

function valueOnly(row: InspectRow): void {
  row.state = "hardcoded";
  delete row.token;
  delete row.chain;
  delete row.inheritedFrom;
  delete row.sides;
  delete row.hoverState;
}

function lostShorthand(row: InspectRow, matched: MatchedStyles): boolean {
  if (row.state !== "unknown") return false;
  const levels = row.inheritedFrom === undefined ? [matched] : [matched, ...(matched.inherited ?? [])];
  return propsByLabel.get(row.label)?.some(prop => {
    for (const level of levels) {
      const winner = cascadeWinner(candidates(level, prop));
      if (winner) return winner.unmapped === true && winner.value === "";
    }
    return false;
  }) === true;
}

// Disabling a sheet can replace its CSSAnimation objects. Duplicate animation names on one target
// match from the end of the CSS animation list, including animations on its pseudo-elements.
function preserveAnimationTimes(doc: Document): () => void {
  const animations = () => doc.getAnimations().filter((a): a is CSSAnimation => a instanceof CSSAnimation);
  const snapshots = animations().map(animation => {
    const effect = animation.effect as KeyframeEffect;
    return { animation, target: effect.target, pseudo: effect.pseudoElement, name: animation.animationName,
      time: animation.currentTime, rate: animation.playbackRate, state: animation.playState };
  });
  if (!snapshots.length) return () => {};
  return () => {
    const restored = animations().reverse();
    for (const previous of snapshots.reverse()) {
      const index = restored.findIndex(a => {
        const effect = a.effect as KeyframeEffect;
        return effect.target === previous.target && effect.pseudoElement === previous.pseudo && a.animationName === previous.name;
      });
      if (index < 0) continue;
      const next = restored.splice(index, 1)[0]!;
      if (next === previous.animation) continue;
      next.playbackRate = previous.rate;
      if (previous.state === "paused") next.pause();
      else if (previous.state === "finished") next.finish();
      else if (previous.state === "running" && next.playState !== "running") next.play();
      if (previous.time !== null) next.currentTime = previous.time;
    }
  };
}

// Values a sheet the page cannot read (cross-origin, no CORS) changes: read with those sheets switched off. Such a
// row shows the applied value only (no token): `state` hardcoded.
function externalOverride(el: Element, rows: InspectRow[], unreadable: CSSStyleSheet[]): void {
  if (unreadable.length === 0) return;
  // Computed (not used) values where the engine has Typed OM, so a layout change (width: auto, a % padding) caused
  // by the sheet elsewhere does not read as the sheet setting this element's property.
  const read = (): string[] => {
    const map = typeof el.computedStyleMap === "function" ? el.computedStyleMap() : null;
    const cs = getComputedStyle(el);
    return [...ROW_PROPS, "color"].map((p) => {
      if (map) {
        try {
          return String(map.get(p));
        } catch {
          /* fall through */
        }
      }
      return cs.getPropertyValue(p);
    });
  };
  const before = read();
  // CSSOM exposes no winning declaration for an opaque sheet. Suppress transitions during the comparison
  // and flush the restored styles before letting transitions run again, all within the selection task.
  const guard = new CSSStyleSheet();
  guard.replaceSync("*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }");
  const doc = el.ownerDocument;
  const restoreAnimations = preserveAnimationTimes(doc);
  const original = [...doc.adoptedStyleSheets];
  doc.adoptedStyleSheets = [...original, guard];
  let without: string[];
  try {
    for (const sheet of unreadable) sheet.disabled = true;
    without = read();
  } finally {
    for (const sheet of unreadable) sheet.disabled = false;
    try {
      void getComputedStyle(el).color;
      restoreAnimations();
    } finally {
      doc.adoptedStyleSheets = original;
    }
  }
  const colorAt = ROW_PROPS.length;
  const changed = new Set(
    ROW_PROPS.filter((p, i) => {
      if (before[i] === without[i]) return false;
      // A border color that follows `color` (currentColor) changes with it.
      if (p.startsWith("border-") && p.endsWith("-color") && before[i] === before[colorAt] && without[i] === without[colorAt]) return false;
      return true;
    }),
  );
  for (const row of rows) {
    if (row.value === "—" || !propsByLabel.get(row.label)?.some((p) => changed.has(p))) continue;
    valueOnly(row);
  }
}

export function inspectElement(element: Element): InspectRow[] {
  const doc = element.ownerDocument;
  if (typeof CSSStyleSheet !== "function" || typeof CSSStyleSheet.prototype.replaceSync !== "function" || !(doc as Partial<Document>).adoptedStyleSheets) {
    const style = getComputedStyle(element);
    const computed = ROW_PROPS.map(name => ({ name, value: style.getPropertyValue(name) }));
    const rows = inspectRows({ matched: {}, computed, ancestors: [] });
    for (const row of rows) if (row.value !== "—") valueOnly(row);
    return rows;
  }
  const parents: Element[] = [];
  for (let a = element.parentElement; a; a = a.parentElement) parents.push(a);
  const collected = collectRules(doc, [element, ...parents].reverse());
  const restore = matchProbe(doc, collected);
  try {
    const input = inspectInput(element, collected, parents);
    const rows = inspectRows(input);
    for (const row of rows) if (lostShorthand(row, input.matched)) valueOnly(row);
    externalOverride(element, rows, collected.unreadable);
    return rows;
  } finally {
    restore();
  }
}
