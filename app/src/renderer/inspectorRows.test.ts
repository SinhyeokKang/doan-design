import { expect, test } from "vitest";
import { inspectRows, type InspectInput, type InspectRow } from "../main/inspect";
import fixture from "../main/inspect.fixture.json";
import { acceptInspect, inspectRequestFor, NO_STYLES, rowCopyText, rowDisplay, rowKey, rowTooltip, SPLIT_ROWS, type InspectFlight, type InspectPanel, type InspectReply, type InspectTarget, type RowView } from "./inspectorRows";

// Hand-made rows: on Padding, Margin and Radius the resolver lists `sides`
// and sets `token` only when all share it.
const row = (over: Partial<InspectRow> & Pick<InspectRow, "group" | "label" | "value">): InspectRow => ({ state: "hardcoded", ...over });
const sides = (values: string[], tokens: (string | undefined)[] = []) => ["top", "right", "bottom", "left"].map((side, i) => ({ side, value: values[i] ?? "0", ...(tokens[i] ? { token: tokens[i] } : {}) }));
const corners = (values: string[]) => ["top-left", "top-right", "bottom-right", "bottom-left"].map((side, i) => ({ side, value: values[i] ?? "0" }));

const only = (rows: InspectRow[]): RowView => {
  const view = rowDisplay(rows).groups.flatMap(group => group.rows);
  expect(view).toHaveLength(1);
  return view[0]!;
};

test("each row has a stable group:property key", () => {
  expect(rowKey({ group: "box", label: "Padding" })).toBe("box:padding");
  expect(rowKey({ group: "typography", label: "Line height" })).toBe("typography:line-height");
  expect(rowKey({ group: "colors", label: "Background" })).toBe("colors:background");
  expect(rowKey({ group: "layout", label: "Columns" })).toBe("layout:columns");
  expect(only([row({ group: "box", label: "Gap", value: "12px" })]).key).toBe("box:gap");
});

test("the split rows are the rows main's resolver splits by side or corner", () => {
  // Real resolver output: a renamed label or `sides` on another row in main fails here instead of dropping wording.
  for (const [name, input] of Object.entries(fixture as unknown as Record<string, InspectInput>)) {
    const split = inspectRows(input).filter(r => r.sides !== undefined).map(rowKey);
    expect(new Set(split), name).toEqual(SPLIT_ROWS);
  }
});

test("a token row shows its chip, copies the token and has the computed value first in its tooltip", () => {
  const padding = row({ group: "box", label: "Padding", value: "24px", state: "token", token: "--space-6", sides: sides(["24px", "24px", "24px", "24px"], ["--space-6", "--space-6", "--space-6", "--space-6"]) });
  const view = only([padding]);
  expect(view.token).toBe("--space-6");
  expect(view.tip).toEqual(["24px"]);
  expect(view.copy).toBe("--space-6");
  expect(rowCopyText(padding)).toBe("--space-6");
  expect(view.spoken).toBe("Padding, 24px, token --space-6");
});

test("a row without a token shows and copies its value, with no caption and no tooltip", () => {
  const size = row({ group: "typography", label: "Size", value: "15px" });
  const view = only([size]);
  expect(view.token).toBeUndefined();
  expect(view.text).toBe("15px");
  expect(view.tip).toEqual([]);
  expect(view.copy).toBe("15px");
  expect(rowCopyText(size)).toBe("15px");
  expect(view.spoken).toBe("Size, 15px");
  expect(only([row({ group: "typography", label: "Size", value: "15px", state: "unknown" })]).text).toBe("15px");
});

test("default rows are left out, and a list of only defaults says so", () => {
  const rows = [row({ group: "box", label: "Width", value: "342px", state: "default" }), row({ group: "box", label: "Height", value: "52px" })];
  expect(rowDisplay(rows).groups.flatMap(group => group.rows.map(view => view.label))).toEqual(["Height"]);
  expect(rowDisplay(rows).empty).toBeUndefined();
  const none = rowDisplay([row({ group: "box", label: "Width", value: "342px", state: "default" }), row({ group: "colors", label: "Border", value: "—", state: "default" })]);
  expect(none).toEqual({ groups: [], empty: NO_STYLES });
  expect(NO_STYLES).toBe("The canvas sets no styles here.");
  expect(rowDisplay([])).toEqual({ groups: [], empty: NO_STYLES });
});

test("a color token's swatch sits in its chip; a color value's beside the text", () => {
  const token = only([row({ group: "colors", label: "Text", value: "#111827", state: "token", token: "--color-ink" })]);
  expect(token).toMatchObject({ token: "--color-ink", swatch: "#111827" });
  const value = only([row({ group: "colors", label: "Background", value: "#f3f4f6cc" })]);
  expect(value).toMatchObject({ text: "#f3f4f6cc", swatch: "#f3f4f6cc" });
  expect(value.token).toBeUndefined();
  expect(only([row({ group: "colors", label: "Background", value: "transparent" })]).swatch).toBe("transparent");
});

test("only a hex or transparent color gets a swatch, and only in Colors", () => {
  for (const value of ["red", "rgb(0, 0, 0)", "url(x)", "#12345", "#1234567", "#11182", "var(--x)", "#111827; background: url(x)", "—"]) {
    expect(only([row({ group: "colors", label: "Text", value })]).swatch).toBeUndefined();
  }
  expect(only([row({ group: "box", label: "Width", value: "#111827" })]).swatch).toBeUndefined();
  expect(only([row({ group: "colors", label: "Text", value: "#ABCDEF" })]).swatch).toBe("#ABCDEF");
});

test("a split row whose sides use different tokens shows its value and lists each side's token in the tooltip", () => {
  const padding = row({ group: "box", label: "Padding", value: "8px 16px", state: "token", sides: sides(["8px", "16px", "8px", "16px"], ["--space-2", "--space-4", "--space-2", "--space-4"]) });
  const view = only([padding]);
  expect(view.token).toBeUndefined();
  expect(view.text).toBe("8px 16px");
  expect(view.copy).toBe("8px 16px");
  expect(rowCopyText(padding)).toBe("8px 16px");
  expect(view.tip).toEqual(["Top and bottom 8px (--space-2), left and right 16px (--space-4)"]);
});

test("a split row where only some sides use a token shows its value", () => {
  const margin = row({ group: "box", label: "Margin", value: "8px 0 0", state: "hardcoded", sides: sides(["8px", "0", "0", "0"], ["--space-2"]) });
  const view = only([margin]);
  expect(view.token).toBeUndefined();
  expect(view.tip).toEqual(["Top 8px (--space-2), right 0, bottom 0, left 0"]);
  // Even a row naming a token is shown as a value when its sides disagree.
  const mixed = row({ group: "box", label: "Padding", value: "8px", state: "token", token: "--space-2", sides: sides(["8px", "8px", "8px", "8px"], ["--space-2", "--space-2", "--gap-s", "--space-2"]) });
  expect(only([mixed]).token).toBeUndefined();
  expect(rowCopyText(mixed)).toBe("8px");
});

test("a split value set on one side only is named by that side", () => {
  const margin = only([row({ group: "box", label: "Margin", value: "8px 0 0", sides: sides(["8px", "0", "0", "0"]) })]);
  expect(margin.text).toBe("Top 8px");
  expect(margin.copy).toBe("Top 8px");
  expect(margin.tip).toEqual(["Top 8px, right 0, bottom 0, left 0"]);
  expect(only([row({ group: "box", label: "Padding", value: "0 0 8px", sides: sides(["0px", "0px", "8px", "0px"]) })]).text).toBe("Bottom 8px");
  expect(only([row({ group: "radius", label: "Radius", value: "8px 0 0", sides: corners(["8px", "0", "0", "0"]) })]).text).toBe("Top left 8px");
  // Other shorthands stay as the resolver wrote them.
  expect(only([row({ group: "box", label: "Padding", value: "20px 24px", sides: sides(["20px", "24px", "20px", "24px"]) })]).text).toBe("20px 24px");
  const even = only([row({ group: "box", label: "Padding", value: "24px", sides: sides(["24px", "24px", "24px", "24px"]) })]);
  expect(even.text).toBe("24px");
  expect(even.tip).toEqual([]);
});

test("a split row without sides is never a chip (fail closed), and sides only count on Padding, Margin and Radius", () => {
  for (const [group, label] of [["box", "Padding"], ["box", "Margin"], ["radius", "Radius"]] as const) {
    const view = only([row({ group, label, value: "8px", state: "token", token: "--space-2" })]);
    expect(view.token).toBeUndefined();
    expect(view.text).toBe("8px");
    expect(view.copy).toBe("8px");
  }
  // Other rows have no sides; a token is their chip.
  expect(only([row({ group: "box", label: "Gap", value: "8px", state: "token", token: "--space-2" })]).token).toBe("--space-2");
  // Sides on any other row are not read: no side name and no per-side line.
  const gap = only([row({ group: "box", label: "Gap", value: "8px 0", sides: [{ side: "row", value: "8px" }, { side: "column", value: "0" }] })]);
  expect(gap.text).toBe("8px 0");
  expect(gap.tip).toEqual([]);
  const border = only([row({ group: "colors", label: "Border", value: "#111827 — — —", sides: sides(["#111827", "—", "—", "—"]) })]);
  expect(border.text).toBe("#111827 — — —");
  expect(border.tip).toEqual([]);
});

test("the per-side line pairs opposite sides as the draft does when the value is a two-value shorthand", () => {
  expect(only([row({ group: "box", label: "Padding", value: "20px 24px", sides: sides(["20px", "24px", "20px", "24px"]) })]).tip).toEqual(["Top and bottom 20px, left and right 24px"]);
  expect(only([row({ group: "box", label: "Padding", value: "8px 16px", state: "token", sides: sides(["8px", "16px", "8px", "16px"], ["--space-2", "--space-4", "--space-2", "--space-4"]) })]).tip).toEqual(["Top and bottom 8px (--space-2), left and right 16px (--space-4)"]);
  expect(only([row({ group: "radius", label: "Radius", value: "8px 0", sides: corners(["8px", "0", "8px", "0"]) })]).tip).toEqual(["Top left and bottom right 8px, top right and bottom left 0"]);
  // Anything else lists each side in order.
  expect(only([row({ group: "box", label: "Margin", value: "8px 16px 4px", sides: sides(["8px", "16px", "4px", "16px"]) })]).tip).toEqual(["Top 8px, right 16px, bottom 4px, left 16px"]);
  expect(only([row({ group: "box", label: "Padding", value: "0 0 8px", sides: sides(["0", "0", "8px", "0"]) })]).tip).toEqual(["Top 0, right 0, bottom 8px, left 0"]);
});

test("the tooltip runs cut text, value, chain, sides, inherited", () => {
  const family = row({ group: "typography", label: "Family", value: "Inter, system-ui, sans-serif", state: "token", token: "--font-sans", chain: ["--font-sans", "--font-inter"], inheritedFrom: "Payment" });
  const view = only([family]);
  expect(view.tip).toEqual(["Inter, system-ui, sans-serif", "--font-sans → --font-inter", "Inherited from Payment"]);
  expect(rowTooltip(view, false)).toEqual(view.tip);
  expect(rowTooltip(view, true)).toEqual(["--font-sans", ...view.tip]);
  const radius = only([row({ group: "radius", label: "Radius", value: "8px 8px 0 0", sides: corners(["8px", "8px", "0", "0"]), inheritedFrom: "Card" })]);
  expect(radius.tip).toEqual(["Top left 8px, top right 8px, bottom right 0, bottom left 0", "Inherited from Card"]);
  expect(rowTooltip(radius, true)).toEqual(["8px 8px 0 0", ...radius.tip]);
});

test("an inherited row without a token still says where it comes from", () => {
  const color = only([row({ group: "colors", label: "Text", value: "#111827", inheritedFrom: "Payment" })]);
  expect(color.tip).toEqual(["Inherited from Payment"]);
  expect(color.text).toBe("#111827");
});

test("groups and rows follow the panel's order, and empty groups are left out", () => {
  const rows: InspectRow[] = [
    row({ group: "layout", label: "Align", value: "center" }),
    row({ group: "shadow", label: "Shadow", value: "0 1px 2px #0000001a" }),
    row({ group: "radius", label: "Radius", value: "8px" }),
    row({ group: "colors", label: "Background", value: "#ffffff" }),
    row({ group: "colors", label: "Text", value: "#111827" }),
    row({ group: "typography", label: "Family", value: "Inter" }),
    row({ group: "typography", label: "Line height", value: "22px" }),
    row({ group: "typography", label: "Weight", value: "500" }),
    row({ group: "typography", label: "Size", value: "15px" }),
    row({ group: "box", label: "Height", value: "40px" }),
    row({ group: "box", label: "Width", value: "300px" }),
    row({ group: "box", label: "Margin", value: "4px" }),
    row({ group: "box", label: "Gap", value: "12px" }),
    row({ group: "box", label: "Padding", value: "8px" }),
    row({ group: "layout", label: "Justify", value: "start" }),
    row({ group: "layout", label: "Wrap", value: "wrap" }),
    row({ group: "layout", label: "Columns", value: "1fr 1fr" }),
    row({ group: "layout", label: "Direction", value: "row" }),
    row({ group: "layout", label: "Display", value: "flex" }),
  ];
  const view = rowDisplay(rows);
  expect(view.groups.map(group => [group.title, group.rows.map(r => r.label)])).toEqual([
    ["Box", ["Padding", "Gap", "Margin", "Width", "Height"]],
    ["Typography", ["Size", "Weight", "Line height", "Family"]],
    ["Colors", ["Text", "Background"]],
    ["Radius", ["Radius"]],
    ["Shadow", ["Shadow"]],
    ["Layout", ["Display", "Direction", "Columns", "Wrap", "Justify", "Align"]],
  ]);
  const some = rowDisplay([row({ group: "shadow", label: "Shadow", value: "none", state: "default" }), row({ group: "radius", label: "Radius", value: "4px" })]);
  expect(some.groups.map(group => group.group)).toEqual(["radius"]);
});

const canvas = { root: "/repo/a", path: ".doan/canvases/pay.html" };
const card: InspectTarget = { canvas, selector: "[data-doan-id=\"card\"]" };
const button: InspectTarget = { canvas, selector: "[data-doan-id=\"pay\"]" };
const idle: InspectFlight = { seq: 0, target: null, same: false };

test("nothing is asked while the inspector is closed, yields to a narrow window, or has no selection", () => {
  for (const input of [{ visible: false, accepted: card }, { visible: true, accepted: null }, { visible: false, accepted: null }]) {
    const next = inspectRequestFor({ ...input, flight: idle, again: false });
    expect(next.send).toBeNull();
    expect(next.flight).toEqual(idle);
  }
});

test("a selection only sent to the canvas is not asked for: the request follows the accepted one", () => {
  // The person clicked the button, but the page still holds the card; the card's answered request stands.
  const asked = { seq: 1, target: card, same: false };
  expect(inspectRequestFor({ visible: true, accepted: card, flight: asked, again: false })).toEqual({ flight: asked, send: null });
  // Once the button is accepted it is asked for.
  const next = inspectRequestFor({ visible: true, accepted: button, flight: asked, again: false });
  expect(next.send).toEqual({ seq: 2, target: button, same: false });
  expect(next.flight).toEqual(next.send);
});

test("becoming visible asks once, and staying visible does not ask again", () => {
  const first = inspectRequestFor({ visible: true, accepted: card, flight: idle, again: false });
  expect(first.send).toEqual({ seq: 1, target: card, same: false });
  expect(inspectRequestFor({ visible: true, accepted: card, flight: first.flight, again: false }).send).toBeNull();
});

test("hiding while reading forgets the request, so its reply is dropped and showing again asks anew", () => {
  const asked = inspectRequestFor({ visible: true, accepted: card, flight: idle, again: false }).flight;
  const hidden = inspectRequestFor({ visible: false, accepted: card, flight: asked, again: false });
  expect(hidden.send).toBeNull();
  expect(hidden.flight).toEqual({ seq: 1, target: null, same: false });
  const reply: InspectReply = { seq: 1, ...card, ok: true, rows: [] };
  expect(acceptInspect({ kind: "reading", rows: null }, hidden.flight, reply)).toBeNull();
  const shown = inspectRequestFor({ visible: true, accepted: card, flight: hidden.flight, again: false });
  expect(shown.send).toEqual({ seq: 2, target: card, same: false });
});

test("the same selection asked again (reload, Retry) is a same-selection read; a new selection is not", () => {
  const asked = { seq: 3, target: card, same: false };
  expect(inspectRequestFor({ visible: true, accepted: card, flight: asked, again: true }).send).toEqual({ seq: 4, target: card, same: true });
  // The same canvas id at a new path.
  const moved = { canvas: { root: "/repo/a", path: ".doan/canvases/billing/pay.html" }, selector: card.selector };
  expect(inspectRequestFor({ visible: true, accepted: moved, flight: asked, again: true }).send).toEqual({ seq: 4, target: moved, same: true });
  // Nothing was shown yet for this selection: a plain read.
  expect(inspectRequestFor({ visible: true, accepted: card, flight: idle, again: true }).send).toEqual({ seq: 1, target: card, same: false });
  expect(inspectRequestFor({ visible: true, accepted: button, flight: asked, again: false }).send).toEqual({ seq: 4, target: button, same: false });
  // Another canvas with the same anchor is another selection.
  const other = { canvas: { root: "/repo/a", path: ".doan/canvases/cart.html" }, selector: card.selector };
  expect(inspectRequestFor({ visible: true, accepted: other, flight: asked, again: false }).send).toEqual({ seq: 4, target: other, same: false });
});

// Main's reply echoes the request it answers (`{selector, canvas, seq}`) beside `ok` and `rows` or `reason`.
const padding = row({ group: "box", label: "Padding", value: "8px" });
const gap = row({ group: "box", label: "Gap", value: "12px" });
const reading: InspectPanel = { kind: "reading", rows: null };
const flight: InspectFlight = { seq: 5, target: card, same: false };
const reply = (over: Partial<{ seq: number; selector: string; canvas: { root: string; path: string } }> = {}): InspectReply => ({ seq: 5, ...card, ok: true, rows: [padding], ...over });
const failure = (reason: "not-shown" | "not-found" | "unavailable", over: Partial<{ seq: number }> = {}): InspectReply => ({ seq: 5, ...card, ok: false, reason, ...over });

test("the reply to the request in flight shows its rows", () => {
  expect(acceptInspect(reading, flight, reply())).toEqual({ panel: { kind: "rows", rows: [padding] }, again: false, flight });
});

test("a late reply is dropped: an older seq, another selection, another canvas", () => {
  const shown: InspectPanel = { kind: "rows", rows: [gap] };
  expect(acceptInspect(shown, flight, reply({ seq: 4 }))).toBeNull();
  expect(acceptInspect(shown, flight, reply({ selector: button.selector }))).toBeNull();
  expect(acceptInspect(shown, flight, reply({ canvas: { root: "/repo/a", path: ".doan/canvases/cart.html" } }))).toBeNull();
  expect(acceptInspect(shown, flight, reply({ canvas: { root: "/repo/b", path: canvas.path } }))).toBeNull();
  expect(acceptInspect(shown, { ...flight, target: null }, reply())).toBeNull();
});

test("a refusal without the request's echo is never taken as the answer", () => {
  // Main refuses a request it cannot parse with a bare reply; it answers nothing in flight.
  expect(acceptInspect(reading, flight, { ok: false, reason: "unavailable" })).toBeNull();
  expect(acceptInspect({ kind: "rows", rows: [gap] }, flight, { ok: false, reason: "unavailable" })).toBeNull();
  expect(acceptInspect(reading, { ...flight, target: null }, { ok: false, reason: "unavailable" })).toBeNull();
});

test("a node CDP cannot find is the empty state, not a failure", () => {
  expect(acceptInspect(reading, flight, failure("not-found"))).toEqual({ panel: { kind: "empty" }, again: false, flight });
});

test("a canvas not yet shown asks again once without a failure, keeping what the panel shows", () => {
  const first = acceptInspect(reading, flight, failure("not-shown"));
  expect(first).toEqual({ panel: reading, again: true, flight: { ...flight, notShown: true } });
  const kept: InspectPanel = { kind: "reading", rows: [gap] };
  expect(acceptInspect(kept, { ...flight, same: true }, failure("not-shown"))).toEqual({ panel: kept, again: true, flight: { ...flight, same: true, notShown: true } });
});

test("a second not-shown in a row for the same selection and canvas is a failure with Retry", () => {
  const first = acceptInspect(reading, flight, failure("not-shown"))!;
  // The caller asks again on the next accepted selection or shown-document change, not from the reply.
  const again = inspectRequestFor({ visible: true, accepted: card, flight: first.flight, again: true });
  expect(again.send).toEqual({ seq: 6, target: card, same: true, notShown: true });
  const second = acceptInspect(reading, again.flight, failure("not-shown", { seq: 6 }));
  expect(second).toEqual({ panel: { kind: "failed" }, again: false, flight: { seq: 6, target: card, same: true } });
  const retry = inspectRequestFor({ visible: true, accepted: card, flight: second!.flight, again: true });
  expect(retry.send).toEqual({ seq: 7, target: card, same: true });
  expect(acceptInspect({ kind: "failed" }, retry.flight, failure("not-shown", { seq: 7 }))?.again).toBe(true);
});

test("a not-shown for another selection or canvas does not count toward the failure", () => {
  const first = acceptInspect(reading, flight, failure("not-shown"))!;
  const other = { canvas: { root: "/repo/a", path: ".doan/canvases/cart.html" }, selector: card.selector };
  for (const accepted of [button, other]) {
    const next = inspectRequestFor({ visible: true, accepted, flight: first.flight, again: false });
    expect(next.send).toEqual({ seq: 6, target: accepted, same: false });
    expect(acceptInspect(reading, next.flight, { seq: 6, ...accepted, ok: false, reason: "not-shown" })?.again).toBe(true);
  }
  // Hiding forgets it too.
  const hidden = inspectRequestFor({ visible: false, accepted: card, flight: first.flight, again: false }).flight;
  expect(inspectRequestFor({ visible: true, accepted: card, flight: hidden, again: false }).send).toEqual({ seq: 6, target: card, same: false });
  // An answer in between resets the count.
  const answered = acceptInspect(reading, { seq: 6, target: card, same: true, notShown: true }, reply({ seq: 6 }))!;
  expect(answered.flight).toEqual({ seq: 6, target: card, same: true });
});

test("an unavailable debugger is a failure with Retry", () => {
  expect(acceptInspect(reading, flight, failure("unavailable"))).toEqual({ panel: { kind: "failed" }, again: false, flight });
});

test("a same-selection read keeps the previous rows until its reply replaces them", () => {
  const kept: InspectPanel = { kind: "reading", rows: [gap] };
  const same = { ...flight, same: true };
  expect(acceptInspect(kept, same, reply({ seq: 4 }))).toBeNull();
  expect(acceptInspect(kept, same, reply())).toEqual({ panel: { kind: "rows", rows: [padding] }, again: false, flight: same });
});
