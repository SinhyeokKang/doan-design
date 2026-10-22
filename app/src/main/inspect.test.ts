import { expect, test } from "vitest";
import { collapseBox, colorHex, inspectRows, longhandSource, type InspectInput, type InspectRow } from "./inspect";
import fixture from "./inspect.fixture.json";

// inspect.fixture.json is real CDP output (Electron 45, Chrome 156) for the
// PoC 2 cases page (`.scratch/poc2-inspect/repo/design/cases.html` and
// `cases.css`), trimmed to the inspected properties. The expected states below
// are PoC 2's hand-written ground truth (`cases.mjs` EXPECT); "#c9:hover" and
// "#c9c:hover" were captured with the pointer over the element.
const cases = fixture as unknown as Record<string, InspectInput>;
const source = (id: string, prop: string) => {
  const input = cases[id];
  if (!input) throw new Error(`no fixture ${id}`);
  const found = longhandSource(input, prop);
  return found.state === "token" ? `token:${found.token}` : found.state;
};

const EXPECT: Record<string, Record<string, string>> = {
  "#c1": { color: "token:--brand", "background-color": "token:--bg", "border-top-left-radius": "token:--radius", "box-shadow": "token:--shadow", width: "token:--space-4", height: "hardcoded", "border-top-color": "default", "padding-top": "default" },
  "#c2": { "background-color": "token:--red-600" },
  "#c2x": { color: "hardcoded" },
  "#c2b": { color: "token:--red-600" },
  "#c3": { "padding-top": "token:--space-2", "padding-right": "token:--space-4", "padding-bottom": "token:--space-2", "padding-left": "token:--space-4", "margin-top": "token:--space-2", "margin-right": "hardcoded", "margin-bottom": "token:--space-3", "margin-left": "hardcoded", "border-top-color": "token:--border", "border-left-color": "token:--border", "font-weight": "token:--w-bold", "font-size": "token:--text-lg", "line-height": "token:--lh", "font-family": "token:--font-sans", "border-top-left-radius": "token:--radius", "border-top-right-radius": "hardcoded", "border-bottom-right-radius": "token:--radius" },
  "#c3b": { "padding-top": "token:--space-4", "padding-right": "token:--gutter", "padding-left": "token:--gutter", "row-gap": "token:--space-2", "column-gap": "token:--space-4", "border-top-color": "token:--brand", "border-right-color": "token:--border" },
  "#c3c": { "padding-top": "hardcoded", "padding-right": "token:--space-2", "background-color": "token:--brand", "margin-top": "token:--space-r", width: "token:--half" },
  "#c4": { color: "token:--muted", "font-family": "token:--font-sans", "font-size": "token:--text-lg", "line-height": "token:--lh", "font-weight": "token:--w-bold" },
  "#c5m": { color: "token:--brand" },
  "#c5s": { "background-color": "token:--brand" },
  "#c5l": { color: "token:--brand" },
  "#c5c": { color: "token:--fg" },
  "#c5n": { color: "token:--fg", "background-color": "token:--muted", "border-top-color": "token:--brand" },
  "#c5i": { color: "token:--brand" },
  "#c7": { color: "token:--brand", "padding-left": "token:--space-4", "background-color": "token:--red-600" },
  "#c8": { color: "token:--brand-alias" },
  "#c10": { color: "default", "margin-top": "default", "font-size": "default", "font-weight": "default" },
  "#c10b": { "background-color": "default", "padding-top": "default", color: "default" },
  "#c13": { color: "token:--brand" },
  "#c14": { color: "token:--brand" },
  "#c15": { color: "token:--brand" },
  "#c11": { color: "token:--brand", "padding-top": "token:--space-2", "margin-left": "hardcoded", "border-top-color": "token:--brand" },
  "#c9:hover": { "background-color": "token:--brand", color: "token:--fg" },
  "#c9c:hover": { color: "token:--brand" },
};

test.each(Object.entries(EXPECT))("PoC 2 ground truth %s", (id, props) => {
  for (const [prop, expected] of Object.entries(props)) expect(source(id, prop), `${id} ${prop}`).toBe(expected);
});

test("the inherit keyword is reported as unknown, a documented gap", () => {
  // Truth is the inherited `--muted`; following `inherit` is not implemented.
  expect(source("#c16", "color")).toBe("unknown");
});

test("inherited values name the ancestor tag", () => {
  const input = cases["#c4"];
  if (!input) throw new Error("no fixture");
  expect(longhandSource(input, "color")).toMatchObject({ state: "token", token: "--muted", inheritedFrom: "div" });
  expect(longhandSource(input, "font-family")).toMatchObject({ inheritedFrom: "div" });
  // Non-inherited properties never walk up.
  expect(longhandSource(input, "padding-top")).toEqual({ state: "default" });
});

test("a winning selector with a state pseudo-class is a hover state", () => {
  const hover = cases["#c9:hover"];
  const parent = cases["#c9c:hover"];
  if (!hover || !parent) throw new Error("no fixture");
  expect(longhandSource(hover, "background-color").hoverState).toBe(true);
  expect(longhandSource(hover, "color").hoverState).toBeUndefined();
  expect(longhandSource(parent, "color").hoverState).toBe(true);
});

test("token chains follow custom properties that point at other tokens", () => {
  const input = cases["#c8"];
  if (!input) throw new Error("no fixture");
  expect(longhandSource(input, "color")).toMatchObject({ token: "--brand-alias", chain: ["--brand-alias", "--brand", "--indigo-600"] });
  const plain = cases["#c1"];
  if (!plain) throw new Error("no fixture");
  expect(longhandSource(plain, "background-color").chain).toBeUndefined();
});

// Synthetic CDP-shaped input for cases the PoC page does not cover.
type Decl = { name: string; value: string; important?: boolean };
function rule(selector: string, decls: Decl[], options: { origin?: string; layers?: string[] } = {}) {
  const authored = options.origin === "user-agent"
    ? decls.map((d) => ({ name: d.name, value: d.value, ...(d.important ? { important: true } : {}) }))
    : decls.map((d) => ({ name: d.name, value: d.important ? `${d.value} !important` : d.value, important: d.important ?? false, disabled: false, implicit: false, text: `${d.name}: ${d.value};` }));
  return {
    matchingSelectors: [0],
    rule: {
      origin: options.origin ?? "regular",
      selectorList: { text: selector, selectors: [{ text: selector }] },
      layers: (options.layers ?? []).map((text) => ({ text })),
      style: { cssProperties: authored, shorthandEntries: [] },
    },
  };
}
function input(rules: ReturnType<typeof rule>[], computed: Record<string, string>, extra: Partial<InspectInput> = {}): InspectInput {
  return {
    ancestors: ["body", "html"],
    matched: { matchedCSSRules: rules, inherited: [{ matchedCSSRules: [] }, { matchedCSSRules: [] }] },
    computed: Object.entries(computed).map(([name, value]) => ({ name, value })),
    ...extra,
  };
}

test("an important declaration beats a later normal one, inline important beats all", () => {
  const rules = [rule(".a", [{ name: "color", value: "var(--x)", important: true }]), rule("#b", [{ name: "color", value: "red" }])];
  const computed = { "--x": "#111111", "--y": "#222222", color: "rgb(17, 17, 17)" };
  expect(longhandSource(input(rules, computed), "color")).toMatchObject({ state: "token", token: "--x" });
  const inline = { cssProperties: [{ name: "color", value: "var(--y) !important", important: true, text: "color: var(--y) !important" }] };
  const withInline = input(rules, computed);
  withInline.matched.inlineStyle = inline;
  expect(longhandSource(withInline, "color")).toMatchObject({ token: "--y" });
});

test("within one block the last declaration wins unless an earlier one is important", () => {
  const computed = { "--x": "1px", "--y": "2px", "padding-top": "1px" };
  const later = rule(".a", [{ name: "padding-top", value: "var(--x)" }, { name: "padding-top", value: "var(--y)" }]);
  expect(longhandSource(input([later], computed), "padding-top")).toMatchObject({ token: "--y" });
  const important = rule(".a", [{ name: "padding-top", value: "var(--x)", important: true }, { name: "padding-top", value: "var(--y)" }]);
  expect(longhandSource(input([important], computed), "padding-top")).toMatchObject({ token: "--x" });
});

test("important declarations in layers win in reverse layer order", () => {
  const rules = [
    rule(".a", [{ name: "color", value: "var(--first)", important: true }], { layers: ["base"] }),
    rule(".a", [{ name: "color", value: "var(--second)", important: true }], { layers: ["comp"] }),
    rule(".a", [{ name: "color", value: "var(--plain)", important: true }]),
  ];
  const computed = { "--first": "#000000", "--second": "#000000", "--plain": "#000000", color: "rgb(0, 0, 0)" };
  expect(longhandSource(input(rules, computed), "color")).toMatchObject({ token: "--first" });
  expect(longhandSource(input(rules.slice(2), computed), "color")).toMatchObject({ token: "--plain" });
});

test("a user-agent important declaration beats the author", () => {
  const rules = [rule("input", [{ name: "color", value: "fieldtext", important: true }], { origin: "user-agent" }), rule(".a", [{ name: "color", value: "var(--x)", important: true }])];
  expect(longhandSource(input(rules, { "--x": "#000000", color: "rgb(0, 0, 0)" }), "color")).toEqual({ state: "default" });
});

test("var() fallbacks: an undefined variable falls back, a literal fallback is hardcoded, none is unknown", () => {
  const computed = { "--set": "4px", "padding-top": "4px" };
  const one = (value: string) => longhandSource(input([rule(".a", [{ name: "padding-top", value }])], computed), "padding-top");
  expect(one("var(--missing, var(--set))")).toMatchObject({ state: "token", token: "--set" });
  expect(one("var(--missing, 4px)")).toEqual({ state: "hardcoded" });
  expect(one("var(--set, var(--missing))")).toMatchObject({ state: "token", token: "--set" });
  // Invalid at computed-value time: a documented gap, never a wrong token.
  expect(one("var(--missing)")).toEqual({ state: "unknown" });
  // Names are case-sensitive.
  expect(one("var(--SET)")).toEqual({ state: "unknown" });
});

test("CSS-wide keywords are unknown rather than hardcoded", () => {
  for (const keyword of ["inherit", "initial", "unset", "revert", "revert-layer"]) {
    expect(longhandSource(input([rule(".a", [{ name: "padding-top", value: keyword }])], {}), "padding-top").state, keyword).toBe("unknown");
  }
});

test("shorthands map each longhand to its part", () => {
  const computed = { "--a": "1px", "--b": "2px", "--c": "red", "--w": "600", "--s": "14px", "--f": "\"Inter Display\", sans-serif", "--pair": "8px 16px" };
  const of = (decl: Decl, prop: string) => {
    const found = longhandSource(input([rule(".a", [decl])], computed), prop);
    return found.state === "token" ? found.token : found.state;
  };
  expect(of({ name: "padding", value: "var(--a) var(--b) 3px" }, "padding-left")).toBe("--b");
  expect(of({ name: "padding", value: "var(--a) var(--b) 3px" }, "padding-bottom")).toBe("hardcoded");
  expect(of({ name: "padding", value: "var(--pair)" }, "padding-right")).toBe("--pair");
  expect(of({ name: "margin", value: "var(--a) auto" }, "margin-left")).toBe("hardcoded");
  expect(of({ name: "border", value: "var(--a) solid var(--c)" }, "border-left-color")).toBe("--c");
  expect(of({ name: "border-top", value: "var(--c) 1px" }, "border-top-color")).toBe("--c");
  expect(of({ name: "border-top", value: "var(--c) 1px" }, "border-left-color")).toBe("default");
  expect(of({ name: "border-color", value: "red var(--c)" }, "border-right-color")).toBe("--c");
  expect(of({ name: "border-radius", value: "var(--a) 0 / 4px" }, "border-bottom-right-radius")).toBe("--a");
  expect(of({ name: "gap", value: "var(--a)" }, "column-gap")).toBe("--a");
  expect(of({ name: "font", value: "var(--w) var(--s)/1.4 var(--f)" }, "font-family")).toBe("--f");
  expect(of({ name: "font", value: "var(--w) var(--s)/1.4 var(--f)" }, "line-height")).toBe("hardcoded");
  expect(of({ name: "font", value: "italic var(--w) var(--s) \"My Font\", serif" }, "font-weight")).toBe("--w");
  expect(of({ name: "font", value: "italic var(--w) var(--s) \"My Font\", serif" }, "font-family")).toBe("hardcoded");
  expect(of({ name: "background", value: "url(a.png) no-repeat var(--c)" }, "background-color")).toBe("--c");
  expect(of({ name: "background", value: "url(a.png) no-repeat" }, "background-color")).toBe("hardcoded");
  expect(of({ name: "padding-inline", value: "var(--a) var(--b)" }, "padding-right")).toBe("--b");
  expect(of({ name: "margin-block", value: "var(--a)" }, "margin-bottom")).toBe("--a");
  expect(of({ name: "padding-inline-start", value: "var(--a)" }, "padding-left")).toBe("--a");
});

test("a shorthand with var() whose part cannot be found is unknown", () => {
  // `font` needs a size; without one the mapping cannot place the variables.
  const found = longhandSource(input([rule(".a", [{ name: "font", value: "var(--w) var(--x)" }])], { "--w": "600", "--x": "bold" }), "font-family");
  expect(found.state).toBe("unknown");
});

test("colorHex writes rgb as hex, keeps alpha, and names full transparency", () => {
  expect(colorHex("rgb(79, 70, 229)")).toBe("#4f46e5");
  expect(colorHex("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
  expect(colorHex("rgba(0, 0, 0, 0)")).toBe("transparent");
  expect(colorHex("rgb(255 255 255 / 0.25)")).toBe("#ffffff40");
  expect(colorHex("rgba(10, 20, 30, 1)")).toBe("#0a141e");
  expect(colorHex("oklch(0.6 0.2 270)")).toBe("oklch(0.6 0.2 270)");
});

test("collapseBox writes the shortest four-value form", () => {
  expect(collapseBox(["1px", "1px", "1px", "1px"])).toBe("1px");
  expect(collapseBox(["0px", "12px", "0px", "12px"])).toBe("0px 12px");
  expect(collapseBox(["1px", "2px", "3px", "2px"])).toBe("1px 2px 3px");
  expect(collapseBox(["1px", "2px", "3px", "4px"])).toBe("1px 2px 3px 4px");
});

const row = (rows: InspectRow[], label: string) => {
  const found = rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row ${label}`);
  return found;
};

test("rows follow the draft's groups and labels", () => {
  const input3 = cases["#c3"];
  if (!input3) throw new Error("no fixture");
  const rows = inspectRows(input3);
  expect(rows.map((r) => [r.group, r.label])).toEqual([
    ["box", "Width"], ["box", "Height"], ["box", "Padding"], ["box", "Margin"], ["box", "Gap"],
    ["typography", "Family"], ["typography", "Size"], ["typography", "Line height"], ["typography", "Weight"],
    ["colors", "Text"], ["colors", "Background"], ["colors", "Border"],
    ["effects", "Radius"], ["effects", "Shadow"],
  ]);
  expect(row(rows, "Padding")).toMatchObject({ value: "8px 16px", state: "token", token: "--space-2 --space-4" });
  // Mixed token and literal sides: the worst side decides.
  expect(row(rows, "Margin")).toMatchObject({ value: "8px 0px 12px", state: "hardcoded" });
  expect(row(rows, "Margin").token).toBeUndefined();
  expect(row(rows, "Border")).toMatchObject({ value: "#e5e7eb", state: "token", token: "--border" });
  expect(row(rows, "Radius")).toMatchObject({ value: "6px 0px", state: "hardcoded" });
  expect(row(rows, "Family")).toMatchObject({ value: "\"Helvetica Neue\", Arial, sans-serif", state: "token", token: "--font-sans" });
  expect(row(rows, "Size")).toMatchObject({ value: "18px", token: "--text-lg" });
  expect(row(rows, "Weight")).toMatchObject({ value: "700", token: "--w-bold" });
  expect(row(rows, "Background")).toMatchObject({ value: "transparent", state: "default" });
  expect(row(rows, "Shadow")).toMatchObject({ value: "none", state: "default" });
  expect(row(rows, "Gap")).toMatchObject({ value: "normal", state: "default" });
});

test("rows carry inheritance, hover state and chains", () => {
  const inherited = cases["#c4"];
  const hover = cases["#c9:hover"];
  const alias = cases["#c8"];
  if (!inherited || !hover || !alias) throw new Error("no fixture");
  expect(row(inspectRows(inherited), "Text")).toMatchObject({ value: "#6b7280", state: "token", token: "--muted", inheritedFrom: "div" });
  expect(row(inspectRows(hover), "Background")).toMatchObject({ value: "#4f46e5", state: "token", token: "--brand", hoverState: true });
  expect(row(inspectRows(alias), "Text")).toMatchObject({ token: "--brand-alias", chain: ["--brand-alias", "--brand", "--indigo-600"] });
});

test("the border row is a dash when every border width is 0", () => {
  const rules = [rule(".a", [{ name: "border-color", value: "var(--c)" }])];
  const computed: Record<string, string> = { "--c": "#ff0000" };
  for (const side of ["top", "right", "bottom", "left"]) {
    computed[`border-${side}-color`] = "rgb(255, 0, 0)";
    computed[`border-${side}-width`] = "0px";
  }
  expect(row(inspectRows(input(rules, computed)), "Border")).toEqual({ group: "colors", label: "Border", value: "—", state: "default" });
  computed["border-left-width"] = "1px";
  expect(row(inspectRows(input(rules, computed)), "Border")).toMatchObject({ value: "#ff0000", state: "token", token: "--c" });
});

test("a row's state is the worst of its longhands", () => {
  const computed = { "--a": "1px", "padding-top": "1px", "padding-right": "2px", "padding-bottom": "1px", "padding-left": "2px" };
  const states = (decls: Decl[]) => row(inspectRows(input([rule(".a", decls)], computed)), "Padding").state;
  expect(states([{ name: "padding-top", value: "var(--a)" }])).toBe("token");
  expect(states([{ name: "padding-top", value: "var(--a)" }, { name: "padding-left", value: "2px" }])).toBe("hardcoded");
  expect(states([{ name: "padding-top", value: "var(--a)" }, { name: "padding-left", value: "inherit" }])).toBe("unknown");
  expect(states([])).toBe("default");
});
