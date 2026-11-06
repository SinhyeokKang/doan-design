import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DropdownMenu } from "radix-ui";
import { EffortPicker, IconTip, PermissionPicker, presetBody, PresetsButton, SlashPresets } from "./ComposerParts";
import type { ModelPickerView } from "./homeComposer";
import { TooltipProvider } from "./components/ui/tooltip";
import { permissionPickerView } from "./permissionPicker";

// Hooks run as plain state only while `on`, so a component can be called directly and its handlers driven; markup tests
// keep React's own hooks.
const hooks = vi.hoisted(() => ({ on: false, states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useId: () => hooks.on ? "fast-id" : react.useId(),
    useEffect: (effect: () => unknown, deps?: unknown[]) => hooks.on ? void hooks.effects.push(effect) : react.useEffect(effect as () => void, deps),
    useRef: (value: unknown) => { if (!hooks.on) return react.useRef(value); const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useState: (value: unknown) => {
      if (!hooks.on) return react.useState(value);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[index]) : next; }];
    },
  };
});

// Dogfooding: a preset row showed its title and group; it now reads as a card, the title over its one-line description.
test("a preset row is its title over its description", () => {
  const view = { kind: "list" as const, tabs: [], summary: "1 preset", sections: [{ title: null, rows: [{ id: "shape", title: "Shape a feature", description: "Work out a feature's purpose and flow.", scope: "feature brief", tooltip: "Work out a feature's purpose and flow. (/shape)", group: "Start" }] }] };
  const html = renderToStaticMarkup(<SlashPresets view={view} query="" listId="l" highlight={0} onHighlight={() => {}} onChoose={() => {}} onRetry={() => {}} />);
  expect(html).toContain('<span class="preset-text"><span class="preset-title">Shape a feature</span><span class="preset-desc">Work out a feature&#x27;s purpose and flow.</span></span>');
  expect(html).not.toContain('class="sub"');
  // The list scrolls with the app's thin scrollbar, like every other dropdown.
  expect(html).toContain('<div class="popover-list doan-scroll" role="listbox"');
});

// permission-mode spec decision 5: Full access shows its name, a warning icon and the warning ink (data-mode), never
// colour alone.
test("the permission trigger shows the mode's icon and label; Full access warns", () => {
  const html = (mode: "default" | "bypass", size?: "xs") => renderToStaticMarkup(<TooltipProvider><PermissionPicker view={permissionPickerView("codex", undefined, mode)!} disabled={false} onPick={() => {}} {...(size ? { size } : {})} /></TooltipProvider>);
  expect(html("default")).toMatch(/<button type="button" class="composer-permission doan-button" data-ui-size="sm" data-ui-variant="trigger" data-mode="default" aria-label="Permission: Default"[^>]*><svg[^>]*lucide-shield[^-][^>]*>.*?<\/svg><span class="label">Default<\/span><svg[^>]*chev/);
  expect(html("bypass", "xs")).toMatch(/data-ui-size="xs" data-ui-variant="trigger" data-mode="bypass" aria-label="Permission: Full access, no approval requests"[^>]*><svg[^>]*lucide-shield-alert/);
  expect(html("bypass")).toContain('<span class="label">Full access</span>');
});

// The popover's rows are listbox options, not Radix items, so `data-highlighted` never reaches them by itself. The pointer moves
// the one highlight: in the `/` list through its highlight, in the popover through focus (the frame list does the same).
function optionRows(node: ReactNode, found: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) node.forEach(child => optionRows(child, found));
  else if (isValidElement<Record<string, unknown>>(node)) {
    if (typeof node.type === "function" && node.type.name === "PresetOption") found.push(node);
    else optionRows(node.props.children as ReactNode, found);
  }
  return found;
}
test("the / list highlights the row under the pointer", () => {
  const row = (id: string) => ({ id, title: id, description: "", scope: "feature brief", tooltip: id, group: "Start" });
  const view = { kind: "list" as const, tabs: [], summary: "2 presets", sections: [{ title: null, rows: [row("a"), row("b")] }] };
  const highlighted: number[] = [];
  const list = SlashPresets({ view, query: "", listId: "l", highlight: 0, onChoose: () => {}, onRetry: () => {}, onHighlight: index => highlighted.push(index) });
  const rows = optionRows(list.props.children);
  expect(rows).toHaveLength(2);
  const second = (rows[1]!.type as (props: unknown) => ReactElement<Record<string, unknown>>)(rows[1]!.props);
  (second.props.onPointerMove as () => void)();
  expect(highlighted).toEqual([1]);
});

// The popover opens with focus in its search box. Moving the pointer over rows must not take that focus (typed letters and
// Space would go to a row); only once focus is on a row does the pointer carry it, like the frame list.
test("a popover preset row takes focus from the pointer only when focus is already in the list", () => {
  const row = (id: string) => ({ id, title: id, description: "", scope: "feature brief", tooltip: id, group: "Start" });
  const view = { kind: "list" as const, tabs: [], summary: "2 presets", sections: [{ title: null, rows: [row("a"), row("b")] }] };
  const list = presetBody(view, false, { listId: "l", highlight: 0, onChoose: () => {}, onRetry: () => {} }) as ReactElement<Record<string, unknown>>;
  const rows = optionRows(list.props.children as ReactNode);
  const second = (rows[1]!.type as (props: unknown) => ReactElement<Record<string, unknown>>)(rows[1]!.props);
  const move = second.props.onPointerMove as (event: unknown) => void;
  const search = {}, first = {};
  const focused: unknown[] = [];
  const listbox = { contains: (node: unknown) => node === first || node === node2 };
  const node2 = { ownerDocument: { activeElement: search as unknown }, closest: (selector: string) => selector === '[role="listbox"]' ? listbox : null, focus: (options: unknown) => focused.push(options) };

  // Focus in the search box: no focus() call.
  move({ currentTarget: node2 });
  expect(focused).toEqual([]);
  // Focus on another row of the list (after ArrowDown): the pointer carries it, without the keyboard ring.
  node2.ownerDocument.activeElement = first;
  move({ currentTarget: node2 });
  expect(focused).toEqual([{ preventScroll: true, focusVisible: false }]);
  // Already on this row: nothing to do.
  node2.ownerDocument.activeElement = node2;
  move({ currentTarget: node2 });
  expect(focused).toHaveLength(1);
});

// Every element's props in a tree drawn without React, keeping each element's type beside its props.
function propsOf(node: ReactNode, found: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach(child => propsOf(child, found));
  else if (isValidElement<Record<string, unknown>>(node)) { found.push({ type: node.type, props: node.props }); propsOf(node.props.children as ReactNode, found); }
  return found;
}

// A press in the canvas iframe never reaches the app's document, so the canvas's own press signal
// closes the Presets popover. Radix returns focus to the trigger after a close it did not see as an outside press; the
// press went to the canvas, so focus must stay there.
test("the canvas's press signal closes an open Presets popover without returning focus to the Presets button", () => {
  hooks.on = true; hooks.states = []; hooks.refs = []; hooks.effects = [];
  try {
    const listeners = new Set<() => void>();
    const canvasPress = vi.fn((listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; });
    const picked = vi.fn();
    const draw = () => {
      hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
      const tree = propsOf(PresetsButton({ reply: undefined, project: "p", suggested: [], listId: "l", disabled: false, onOpen: () => {}, onChoose: () => {}, onRetry: () => {}, onPicked: picked, canvasPress }));
      return { root: tree[0]!.props, content: tree.find(item => typeof item.props.onCloseAutoFocus === "function")!.props };
    };
    const runEffects = () => hooks.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");

    // Closed: nothing listens to the canvas.
    draw(); let cleanups = runEffects();
    expect(listeners.size).toBe(0);
    cleanups.forEach(cleanup => cleanup());

    (draw().root.onOpenChange as (open: boolean) => void)(true);
    draw(); cleanups = runEffects();
    expect(listeners.size).toBe(1);
    for (const listener of [...listeners]) listener();
    const { root, content } = draw();
    expect(root.open).toBe(false);
    cleanups.forEach(cleanup => cleanup());
    expect(listeners.size).toBe(0);
    const autoFocus = { preventDefault: vi.fn() };
    (content.onCloseAutoFocus as (event: unknown) => void)(autoFocus);
    expect(autoFocus.preventDefault).toHaveBeenCalled();
    expect(picked).not.toHaveBeenCalled();

    // A later close Radix makes itself (Escape) returns focus as before.
    (draw().root.onOpenChange as (open: boolean) => void)(true);
    (draw().root.onOpenChange as (open: boolean) => void)(false);
    const escape = { preventDefault: vi.fn() };
    (draw().content.onCloseAutoFocus as (event: unknown) => void)(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();
  } finally { hooks.on = false; }
});

// fast-mode B2 (design §1, decisions 9–11): the Fast row under the Effort levels and the trigger's Fast icon.
type EffortView = NonNullable<ModelPickerView["effort"]>;
const effortView = (fast: EffortView["fast"], ariaLabel = "Effort: High"): EffortView => ({
  label: "High", ariaLabel, menuLabel: "Effort for GPT-6.1 Sol", title: "Effort · GPT-6.1 Sol",
  options: [{ id: "low", label: "Low", selected: false }, { id: "high", label: "High", selected: true }], fast,
});
function effortTree(view: EffortView, onPick = vi.fn(), onPickFast = vi.fn(), size?: "xs") {
  hooks.on = true; hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  try { return propsOf(EffortPicker({ view, effort: "high", disabled: false, onPick, onPickFast, ...(size ? { size } : {}) })); } finally { hooks.on = false; }
}

test("Fast on puts the accent Fast icon on the trigger at both sizes, with its name as the tooltip", () => {
  const on = effortView({ on: true, description: "2x speed, increased usage" }, "Effort: High, Fast on");
  for (const size of [undefined, "xs"] as const) {
    const html = renderToStaticMarkup(<TooltipProvider><EffortPicker view={on} effort="high" disabled={false} onPick={() => {}} {...(size ? { size } : {})} /></TooltipProvider>);
    expect(html).toMatch(/aria-label="Effort: High, Fast on"[^>]*><svg[^>]*lucide-gauge[^>]*>.*?<\/svg><span class="label">High<\/span><svg[^>]*lucide-zap[^>]*fast-icon[^>]*aria-hidden="true"[^>]*>.*?<\/svg><svg[^>]*chev/);
    expect(effortTree(on, vi.fn(), vi.fn(), size).find(item => item.type === IconTip)?.props.label).toBe("Effort: High, Fast on");
  }
  const off = effortView({ on: false, description: "2x speed, increased usage" }, "Effort: High, Fast off");
  expect(renderToStaticMarkup(<TooltipProvider><EffortPicker view={off} effort="high" disabled={false} onPick={() => {}} /></TooltipProvider>)).not.toContain("lucide-zap");
  expect(effortTree(off).find(item => item.type === IconTip)?.props.label).toBe("Effort: High, Fast off");
  // Without Fast, Home's trigger keeps no tooltip, as before; the docked one keeps its own.
  expect(effortTree(effortView(null)).some(item => item.type === IconTip)).toBe(false);
  expect(effortTree(effortView(null), vi.fn(), vi.fn(), "xs").find(item => item.type === IconTip)?.props.label).toBe("Effort: High");
});

test("the Fast row is a checkbox item under a separator; switching it keeps the menu open, a level closes it", () => {
  const onPick = vi.fn(), onPickFast = vi.fn();
  const tree = effortTree(effortView({ on: false, description: "2x speed, increased usage" }), onPick, onPickFast);
  expect(tree.find(item => item.type === DropdownMenu.Content)?.props.className).toBe("doan-floating doan-menu effort-popover has-fast");
  const kinds = tree.map(item => item.type);
  expect(kinds.indexOf(DropdownMenu.Separator)).toBeGreaterThan(kinds.indexOf(DropdownMenu.RadioGroup));
  const row = tree.find(item => item.type === DropdownMenu.CheckboxItem)!.props;
  // Its name is the Fast span alone; the description stays a description (review R 🟢2).
  expect(row).toMatchObject({ className: "doan-menu-item fast-item", checked: false, disabled: false, "aria-labelledby": "fast-id-name", "aria-describedby": "fast-id-description" });
  // Radix closes a menu and moves focus on an item's select unless it is prevented; the switch's own change still runs.
  const select = { preventDefault: vi.fn() };
  (row.onSelect as (event: unknown) => void)(select);
  expect(select.preventDefault).toHaveBeenCalled();
  (row.onCheckedChange as (on: boolean) => void)(true);
  expect(onPickFast).toHaveBeenCalledWith(true);
  // The levels keep Radix's own select, which closes the menu.
  for (const item of tree.filter(entry => entry.type === DropdownMenu.RadioItem)) expect(item.props.onSelect).toBeUndefined();
  // The Fast icon leads, then the name over its description, then the drawn switch; no check mark.
  const html = renderToStaticMarkup(<>{row.children as ReactNode}</>);
  expect(html).toMatch(/^<span class="fast-slot" aria-hidden="true"><svg[^>]*lucide-zap[^>]*>.*?<\/svg><\/span><span class="fast-copy"><span class="model-name" id="fast-id-name">Fast<\/span><span class="sub" id="fast-id-description">2x speed, increased usage<\/span><\/span><span class="fast-switch" aria-hidden="true"><\/span>$/);
  expect(html).not.toContain("check");
});

test("an unavailable Fast row is disabled and says why; without Fast the menu stays 200 wide with no row", () => {
  const unavailable = effortTree(effortView({ on: false, description: "Extra usage is turned off for this account.", unavailable: "extra_usage" }));
  expect(unavailable.find(item => item.type === DropdownMenu.CheckboxItem)?.props).toMatchObject({ checked: false, disabled: true });
  expect(renderToStaticMarkup(<>{unavailable.find(item => item.type === DropdownMenu.CheckboxItem)!.props.children as ReactNode}</>)).toContain("Extra usage is turned off for this account.");
  const none = effortTree(effortView(null));
  expect(none.find(item => item.type === DropdownMenu.Content)?.props.className).toBe("doan-floating doan-menu effort-popover");
  expect(none.some(item => item.type === DropdownMenu.CheckboxItem || item.type === DropdownMenu.Separator)).toBe(false);
});

// review R 🟡4: the app's Vitest has no DOM (ARCHITECTURE §7 'Home tests without a DOM' adds no jsdom), so a mounted
// Radix menu cannot be driven here; the real-app probe (/design-sync, /runtime-test) checks open state and focus.
// What the row relies on is pinned against the installed Radix menu instead: a click, Enter or Space all reach the
// item's select, which closes the menu only when the select event is not prevented, and a checkbox item still toggles
// when it is. Nothing in that path moves focus, so focus stays on the row while the menu stays open.
test("the installed Radix menu keeps a prevented select open and still toggles a checkbox item", () => {
  const source = readFileSync(createRequire(import.meta.url).resolve("@radix-ui/react-menu"), "utf8");
  expect(source).toMatch(/SELECTION_KEYS = \["Enter", " "\]/);
  expect(source).toMatch(/if \(SELECTION_KEYS\.includes\(event\.key\)\) \{\s*event\.currentTarget\.click\(\);/);
  expect(source).toMatch(/onClick: \(0, import_primitive\.composeEventHandlers\)\(props\.onClick, handleSelect\)|onClick: composeEventHandlers\(props\.onClick, handleSelect\)/);
  expect(source).toMatch(/if \(itemSelectEvent\.defaultPrevented\) \{\s*isPointerDownRef\.current = false;\s*\} else \{\s*rootContext\.onClose\(\);/);
  expect(source).toMatch(/role: "menuitemcheckbox"[\s\S]*?onSelect: \(0, import_primitive\.composeEventHandlers\)\(\s*checkboxItemProps\.onSelect,\s*\(\) => onCheckedChange\?\.\(isIndeterminate\(checked\) \? true : !checked\),\s*\{ checkForDefaultPrevented: false \}|role: "menuitemcheckbox"[\s\S]*?onSelect: composeEventHandlers\(\s*checkboxItemProps\.onSelect,\s*\(\) => onCheckedChange\?\.\(isIndeterminate\(checked\) \? true : !checked\),\s*\{ checkForDefaultPrevented: false \}/);
});
