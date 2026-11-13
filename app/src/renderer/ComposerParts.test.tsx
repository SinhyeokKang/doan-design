import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DropdownMenu } from "radix-ui";
import { AgentPicker, EffortPicker, IconTip, PermissionPicker, useOlderFold, presetBody, PresetsButton, SendButton, SlashPresets } from "./ComposerParts";
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
    useLayoutEffect: (effect: () => unknown, deps?: unknown[]) => hooks.on ? void hooks.effects.push(effect) : react.useLayoutEffect(effect as () => void, deps),
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
  const view = { kind: "list" as const, tabs: [], summary: "1 preset", sections: [{ title: null, rows: [{ kind: "preset" as const, key: "preset:shape", icon: "compass", id: "shape", title: "Shape a feature", description: "Work out a feature's purpose and flow.", scope: "feature brief", tooltip: "Work out a feature's purpose and flow. (/shape)", group: "Start" }] }] };
  const html = renderToStaticMarkup(<SlashPresets view={view} query="" listId="l" highlight={0} onHighlight={() => {}} onChoose={() => {}} onRetry={() => {}} />);
  expect(html).toContain('<span class="preset-text"><span class="preset-title">Shape a feature</span><span class="preset-desc">Work out a feature&#x27;s purpose and flow.</span></span>');
  expect(html).not.toContain('class="sub"');
  // The list scrolls with the app's thin scrollbar, like every other dropdown.
  expect(html).toContain('<div class="popover-list doan-scroll" role="listbox"');
});

// Full access shows its name, a warning icon and the warning ink (data-mode), never
// colour alone.
test("the permission trigger shows the mode's icon and label; Full access warns", () => {
  const html = (mode: "default" | "bypass", size?: "xs") => renderToStaticMarkup(<TooltipProvider><PermissionPicker view={permissionPickerView("codex", undefined, mode)!} disabled={false} onPick={() => {}} {...(size ? { size } : {})} /></TooltipProvider>);
  expect(html("default")).toMatch(/<button type="button" class="composer-permission doan-button" data-ui-size="sm" data-ui-variant="trigger" data-mode="default" aria-label="Permission: Ask first"[^>]*><svg[^>]*lucide-shield[^-][^>]*>.*?<\/svg><span class="label">Ask first<\/span><svg[^>]*chev/);
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
  const row = (id: string) => ({ kind: "preset" as const, key: `preset:${id}`, icon: "compass", id, title: id, description: "", scope: "feature brief", tooltip: id, group: "Start" });
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
  const row = (id: string) => ({ kind: "preset" as const, key: `preset:${id}`, icon: "compass", id, title: id, description: "", scope: "feature brief", tooltip: id, group: "Start" });
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

// the Fast row under the Effort levels and the trigger's Fast icon.
type EffortView = NonNullable<ModelPickerView["effort"]>;
const effortView = (fast: EffortView["fast"], ariaLabel = "Effort: High"): EffortView => ({
  label: "High", ariaLabel, placeholder: false, menuLabel: "Effort for GPT-6.1 Sol", title: "Effort · GPT-6.1 Sol",
  unset: { label: "Default", description: "Medium for this model", selected: false },
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
  // Its name is the Fast span alone; the description stays a description.
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
  expect(none.some(item => item.type === DropdownMenu.CheckboxItem)).toBe(false);
  // Only the Default row's own separator.
  expect(none.filter(item => item.type === DropdownMenu.Separator)).toHaveLength(1);
});

// the menu opens with a Default row that goes back to
// sending no level, checked while nothing is chosen.
test("the effort menu opens with a Default row over its line; picking it passes an empty level", () => {
  const onPick = vi.fn();
  const unset = { ...effortView(null), label: "Medium", ariaLabel: "Effort: Medium, default", unset: { label: "Default" as const, description: "Medium for this model", selected: true },
    options: [{ id: "low", label: "Low", selected: false }, { id: "high", label: "High", selected: false }] };
  hooks.on = true; hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  let tree: ReturnType<typeof propsOf>;
  try { tree = propsOf(EffortPicker({ view: unset, effort: null, disabled: false, onPick })); } finally { hooks.on = false; }
  const group = tree.find(item => item.type === DropdownMenu.RadioGroup)!;
  expect(group.props.value).toBe("");
  const items = tree.filter(item => item.type === DropdownMenu.RadioItem);
  expect(items.map(item => item.props.value)).toEqual(["", "low", "high"]);
  expect(items[0]!.props.className).toBe("doan-menu-item unset-item");
  const row = renderToStaticMarkup(<>{items[0]!.props.children as ReactNode}</>);
  expect(row).toMatch(/^<span class="unset-copy"><span class="model-name">Default<\/span><span class="sub">Medium for this model<\/span><\/span><span class="check-slot"><svg[^>]*check/);
  // A separator parts the Default row from the levels; no level shows a check.
  const kinds = tree.map(item => item.type);
  expect(kinds.indexOf(DropdownMenu.Separator)).toBeGreaterThan(tree.indexOf(items[0]!));
  expect(kinds.indexOf(DropdownMenu.Separator)).toBeLessThan(tree.indexOf(items[1]!));
  expect(items.slice(1).every(item => !renderToStaticMarkup(<>{item.props.children as ReactNode}</>).includes("lucide-check"))).toBe(true);
  (group.props.onValueChange as (value: string) => void)("");
  expect(onPick).toHaveBeenCalledWith("");
  // A chosen level unchecks the Default row.
  const picked = effortTree(effortView(null));
  expect(renderToStaticMarkup(<>{picked.filter(item => item.type === DropdownMenu.RadioItem)[0]!.props.children as ReactNode}</>)).not.toContain("lucide-check");
});

test("a trigger with no value draws its drawer's name as a placeholder", () => {
  const html = (view: EffortView) => renderToStaticMarkup(<TooltipProvider><EffortPicker view={view} effort={null} disabled={false} onPick={() => {}} /></TooltipProvider>);
  expect(html({ ...effortView(null), label: "Effort", ariaLabel: "Effort: default", placeholder: true })).toContain('<span class="label placeholder">Effort</span>');
  expect(html({ ...effortView(null), label: "Medium", ariaLabel: "Effort: Medium, default" })).toContain('<span class="label">Medium</span>');
});

// AgentPicker keeps the Older models fold in hooks, so it is called with them as plain state. fresh: start from no state.
function agentTree(p: { picker: ModelPickerView; onPick(provider: string, value: string | null): void; size?: "xs" }, fresh = false) {
  if (fresh) { hooks.states = []; hooks.refs = []; }
  hooks.on = true; hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  try { return propsOf(AgentPicker({ picker: p.picker, auth: undefined, disabled: false, onOpen: () => {}, onPick: p.onPick, onSettings: () => {}, ...(p.size ? { size: p.size } : {}) })); } finally { hooks.on = false; }
}

// the default row carries a small Default after its name; a trigger with no
// model names its drawer in the placeholder ink.
const agentPicker = (trigger: ModelPickerView["trigger"]): ModelPickerView => ({
  trigger, effort: null,
  groups: [{ provider: "codex", name: "Codex", selectable: true, cause: null, note: null, read: false, rows: [
    { kind: "model", id: "gpt-6-luna", label: "GPT-6-Luna", effort: true, selected: false, isDefault: true },
    { kind: "model", id: "gpt-5.6-terra", label: "GPT-5.6-Terra", effort: true, selected: true, isDefault: false },
  ] }],
});
test("the model menu marks the default row, and an unchosen trigger reads Model as a placeholder", () => {
  const draw = (trigger: ModelPickerView["trigger"]) => agentTree({ picker: agentPicker(trigger), onPick: () => {} }, true);
  const tree = draw({ provider: "codex", label: "GPT-5.6-Terra", ariaLabel: "Agent: Codex, model GPT-5.6-Terra", placeholder: false, isDefault: false });
  const rows = tree.filter(item => item.type === DropdownMenu.RadioItem).map(item => renderToStaticMarkup(<>{item.props.children as ReactNode}</>));
  expect(rows[0]).toMatch(/^<span class="model-name">GPT-6-Luna<span class="model-default">Default<\/span><\/span>/);
  expect(rows[1]).toMatch(/^<span class="model-name">GPT-5.6-Terra<\/span>/);
  expect(rows[1]).not.toContain("model-default");
  const label = (node: ReturnType<typeof draw>) => renderToStaticMarkup(<>{node.find(item => item.type === "button")!.props.children as ReactNode}</>);
  expect(label(tree)).toContain('<span class="label">GPT-5.6-Terra</span>');
  expect(label(draw({ provider: "codex", label: "Model", ariaLabel: "Agent: Codex, model not chosen", placeholder: true, isDefault: false }))).toContain('<span class="label placeholder">Model</span>');
});

// the app's Vitest has no DOM (ARCHITECTURE §7 'Home tests without a DOM' adds no jsdom), so a mounted
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

// the pre-list Default row passes null; a model row passes its id, even Claude Code's
// "default".
test("the agent picker passes null for the pre-list Default row and a model row's own id", () => {
  const onPick = vi.fn();
  const picker: ModelPickerView = {
    trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5, default", placeholder: false, isDefault: true }, effort: null,
    groups: [
      { provider: "claude", name: "Claude Code", selectable: true, cause: null, note: null, read: false, rows: [{ kind: "model", id: "default", label: "Opus 5.5", effort: true, selected: true, isDefault: true }] },
      { provider: "codex", name: "Codex", selectable: true, cause: null, note: "Loading models", read: false, rows: [{ kind: "default", label: "Default", selected: false }] },
    ],
  };
  const groups = agentTree({ picker, onPick }, true).filter(item => item.type === DropdownMenu.RadioGroup);
  (groups[0]!.props.onValueChange as (value: string) => void)("default");
  expect(onPick).toHaveBeenLastCalledWith("claude", "default");
  (groups[1]!.props.onValueChange as (value: string) => void)("default");
  expect(onPick).toHaveBeenLastCalledWith("codex", null);
});

// a group's older models fold under an "Older models" line.
const OLDER_PICKER = (selected: string | null): ModelPickerView => ({
  trigger: { provider: "codex", label: "GPT-6.1-Sol", ariaLabel: "Agent: Codex, model GPT-6.1-Sol", placeholder: false, isDefault: true }, effort: null,
  groups: [
    { provider: "claude", name: "Claude Code", selectable: true, cause: null, note: null, read: false, rows: [{ kind: "model", id: "default", label: "Opus 5.5", effort: true, selected: false, isDefault: true }] },
    { provider: "codex", name: "Codex", selectable: true, cause: null, note: null, read: false, rows: [
      { kind: "model", id: "gpt-6.1-sol", label: "GPT-6.1-Sol", effort: true, selected: selected === "gpt-6.1-sol", isDefault: true },
      { kind: "model", id: "gpt-6-sol", label: "GPT-6-Sol", effort: true, selected: selected === "gpt-6-sol", isDefault: false, older: true },
      { kind: "model", id: "gpt-6-astra", label: "GPT-6-Astra", effort: true, selected: false, isDefault: false },
      { kind: "model", id: "gpt-5.6-terra", label: "GPT-5.6-Terra", effort: true, selected: false, isDefault: false, older: true },
    ] },
    { provider: "copilot", name: "GitHub Copilot", selectable: true, cause: null, note: "Models unavailable", read: false, rows: [{ kind: "default", label: "Default", selected: false }] },
  ],
});
const radioIds = (tree: ReturnType<typeof propsOf>) => tree.filter(item => item.type === DropdownMenu.RadioItem).map(item => item.props.value);
const olderLine = (tree: ReturnType<typeof propsOf>) => tree.filter(item => item.type === DropdownMenu.Item && String(item.props.className).includes("older-row"));
// Opens the menu as Radix would and runs the effects the open schedules, then draws again.
function openAgentMenu(picker: ModelPickerView, size?: "xs") {
  const first = agentTree({ picker, onPick: () => {}, ...(size ? { size } : {}) }, true);
  (first.find(item => item.type === DropdownMenu.Root)!.props.onOpenChange as (open: boolean) => void)(true);
  agentTree({ picker, onPick: () => {}, ...(size ? { size } : {}) });
  hooks.on = true;
  try { for (const effect of hooks.effects.splice(0)) effect(); } finally { hooks.on = false; }
  return agentTree({ picker, onPick: () => {}, ...(size ? { size } : {}) });
}

test("a group with older models shows its current models, then an Older models line with the count, at both sizes", () => {
  for (const size of [undefined, "xs"] as const) {
    const tree = openAgentMenu(OLDER_PICKER("gpt-6.1-sol"), size);
    expect(radioIds(tree)).toEqual(["default", "gpt-6.1-sol", "gpt-6-astra", "default"]);
    const lines = olderLine(tree);
    // Only Codex lists older models; the pre-list Default row and a group without older models draw no line.
    expect(lines).toHaveLength(1);
    expect(lines[0]!.props).toMatchObject({ className: "doan-menu-item older-row", textValue: "Older models", "aria-label": "Older models (Codex), 2", "aria-expanded": false });
    expect(lines[0]!.props.value).toBeUndefined();
    expect(renderToStaticMarkup(<>{lines[0]!.props.children as ReactNode}</>)).toMatch(/^<span class="model-name">Older models<\/span><span class="count">2<\/span><span class="check-slot"><svg[^>]*lucide-chevron-down[^>]*aria-hidden="true"/);
    // The line sits after the group's current rows, inside the group.
    const group = tree.filter(item => item.type === DropdownMenu.RadioGroup)[1]!;
    const children = propsOf(group.props.children as ReactNode);
    expect(children.indexOf(children.find(item => item.type === DropdownMenu.Item)!)).toBeGreaterThan(children.findIndex(item => item.props.value === "gpt-6-astra"));
  }
});

test("pressing the line unfolds the older models under it without closing the menu, and pressing again folds them", () => {
  openAgentMenu(OLDER_PICKER("gpt-6.1-sol"));
  const select = { preventDefault: vi.fn() };
  (olderLine(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }))[0]!.props.onSelect as (event: unknown) => void)(select);
  expect(select.preventDefault).toHaveBeenCalled();
  const open = agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} });
  expect(radioIds(open)).toEqual(["default", "gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-5.6-terra", "default"]);
  expect(olderLine(open)[0]!.props["aria-expanded"]).toBe(true);
  (olderLine(open)[0]!.props.onSelect as (event: unknown) => void)({ preventDefault: () => {} });
  expect(radioIds(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }))).toEqual(["default", "gpt-6.1-sol", "gpt-6-astra", "default"]);
});

test("→ unfolds and ← folds on the line; ← on an older row folds its group", () => {
  openAgentMenu(OLDER_PICKER("gpt-6.1-sol"));
  const key = (k: string) => ({ key: k, preventDefault: vi.fn() });
  const line = () => olderLine(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }))[0]!.props;
  const right = key("ArrowRight");
  (line().onKeyDown as (event: unknown) => void)(right);
  expect(right.preventDefault).toHaveBeenCalled();
  expect(line()["aria-expanded"]).toBe(true);
  const row = agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }).find(item => item.type === DropdownMenu.RadioItem && item.props.value === "gpt-6-sol")!;
  (row.props.onKeyDown as (event: unknown) => void)(key("ArrowLeft"));
  expect(line()["aria-expanded"]).toBe(false);
  (line().onKeyDown as (event: unknown) => void)(key("ArrowRight"));
  (line().onKeyDown as (event: unknown) => void)(key("ArrowLeft"));
  expect(line()["aria-expanded"]).toBe(false);
  // A current row's ← is Radix's own.
  expect(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }).find(item => item.props.value === "gpt-6.1-sol")!.props.onKeyDown).toBeUndefined();
});

test("a chosen older model opens the menu with its group unfolded and checked; picking an older row passes its id", () => {
  let tree = openAgentMenu(OLDER_PICKER("gpt-6-sol"));
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  try {
    (tree.find(item => item.type === DropdownMenu.Content)!.props.ref as (node: unknown) => void)({ dataset: { side: "top" }, querySelector: () => null });
    tree = agentTree({ picker: OLDER_PICKER("gpt-6-sol"), onPick: () => {} });
    hooks.on = true; try { hooks.effects.splice(0).forEach(effect => effect()); } finally { hooks.on = false; }
    frames.splice(0).forEach(callback => callback(0));
    tree = agentTree({ picker: OLDER_PICKER("gpt-6-sol"), onPick: () => {} });
  } finally { vi.unstubAllGlobals(); }
  expect(olderLine(tree)[0]!.props["aria-expanded"]).toBe(true);
  expect(radioIds(tree)).toContain("gpt-6-sol");
  const onPick = vi.fn();
  const group = agentTree({ picker: OLDER_PICKER("gpt-6-sol"), onPick }).filter(item => item.type === DropdownMenu.RadioGroup)[1]!;
  expect(group.props.value).toBe("gpt-6-sol");
  (group.props.onValueChange as (value: string) => void)("gpt-5.6-terra");
  expect(onPick).toHaveBeenLastCalledWith("codex", "gpt-5.6-terra");
});

test("the line keeps one key whether its group is folded or not, so focus stays on it", () => {
  openAgentMenu(OLDER_PICKER("gpt-6.1-sol"));
  const before = olderLine(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }));
  (before[0]!.props.onSelect as (event: unknown) => void)({ preventDefault: () => {} });
  const keyOf = (tree: ReturnType<typeof propsOf>) => {
    const group = tree.filter(item => item.type === DropdownMenu.RadioGroup)[1]!;
    return (group.props.children as ReactElement[]).flat().find(child => isValidElement(child) && String((child.props as { className?: string }).className).includes("older-row"))?.key;
  };
  const folded = keyOf(openAgentMenu(OLDER_PICKER("gpt-6.1-sol")));
  expect(folded).toBeTruthy();
  const tree = agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} });
  (olderLine(tree)[0]!.props.onSelect as (event: unknown) => void)({ preventDefault: () => {} });
  expect(keyOf(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }))).toBe(folded);
});

test("closing the menu forgets what was unfolded", () => {
  openAgentMenu(OLDER_PICKER("gpt-6.1-sol"));
  const tree = agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} });
  (olderLine(tree)[0]!.props.onSelect as (event: unknown) => void)({ preventDefault: () => {} });
  (agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }).find(item => item.type === DropdownMenu.Root)!.props.onOpenChange as (open: boolean) => void)(false);
  expect(olderLine(agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} }))[0]!.props["aria-expanded"]).toBe(false);
});


test("a model menu waits to lock until a toggle and releases the side on reopen", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  try {
    const draw = () => agentTree({ picker: OLDER_PICKER("gpt-6.1-sol"), onPick: () => {} });
    const initial = openAgentMenu(OLDER_PICKER("gpt-6.1-sol"));
    const content = (tree = draw()) => tree.find(item => item.type === DropdownMenu.Content)!;
    const node = { dataset: { side: "bottom" }, querySelector: () => null };
    (content(initial).props.ref as (node: unknown) => void)(node);
    frames.splice(0).forEach(callback => callback(0));
    expect(content().props.avoidCollisions).toBe(true);
    expect(content().props.style).toBeUndefined();
    const line = olderLine(draw())[0]!;
    (line.props.onSelect as (event: unknown) => void)({ preventDefault() {} });
    expect(content().props).toMatchObject({ side: "bottom", avoidCollisions: false });
    const close = draw().find(item => item.type === DropdownMenu.Root)!;
    (close.props.onOpenChange as (open: boolean) => void)(false);
    expect(content().props.avoidCollisions).toBe(true);
    (draw().find(item => item.type === DropdownMenu.Root)!.props.onOpenChange as (open: boolean) => void)(true);
    node.dataset.side = "top";
    (content().props.ref as (node: unknown) => void)(node);
    const before = olderLine(draw())[0]!;
    (before.props.onSelect as (event: unknown) => void)({ preventDefault() {} });
    expect(content().props).toMatchObject({ side: "top", avoidCollisions: false });
    expect(olderLine(draw())[0]!.props["aria-expanded"]).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

test("a checked older group waits for settled placement before unfolding, then reveals in that order", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const groups = [{ provider: "codex", rows: [{ older: true as const, selected: true }] }];
  const draw = (fresh = false) => {
    if (fresh) { hooks.states = []; hooks.refs = []; }
    hooks.on = true; hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
    try { return useOlderFold(groups, "top"); } finally { hooks.on = false; }
  };
  const effects = () => { hooks.on = true; try { hooks.effects.splice(0).forEach(effect => effect()); } finally { hooks.on = false; } };
  const shown = vi.fn();
  const node = { dataset: { side: "top" }, querySelector: () => ({ scrollIntoView: shown }) };
  try {
    let fold = draw(true); fold.onOpenChange(true); fold = draw(); fold.contentRef(node as unknown as HTMLDivElement); effects();
    const key = (fold.line("codex", "Codex", 1) as ReactElement).key;
    expect(draw().isOpen("codex")).toBe(false);
    node.dataset.side = "bottom";
    frames.splice(0).forEach(callback => callback(0));
    expect(shown).not.toHaveBeenCalled();
    fold = draw(); effects();
    expect(fold.isOpen("codex")).toBe(true);
    expect(fold.placement).toMatchObject({ side: "bottom", avoidCollisions: false });
    expect((fold.line("codex", "Codex", 1) as ReactElement).key).toBe(key);
    shown.mockClear(); frames.splice(0).forEach(callback => callback(0));
    expect(shown).toHaveBeenCalledWith({ block: "nearest" });
  } finally { vi.unstubAllGlobals(); }
});

// At the usage limit the Queue button keeps its name; the reset time is its sr-only description, tied by
// aria-describedby, never a native title (usage-limit-resume draft, queue-button).
test("Queue's reset description is an sr-only span inside the button, not a title", () => {
  const out = renderToStaticMarkup(<TooltipProvider><SendButton action="queue" enabled sending={false} onSend={() => {}} description={"Sends when the limit resets at 3:00\u202fPM."} tip={"Queue — sends when the limit resets at 3:00\u202fPM"} /></TooltipProvider>);
  expect(out).toMatch(/<button[^>]*aria-label="Queue"[^>]*aria-describedby="([^"]+)"[^>]*>.*<span id="\1" class="sr-only">Sends when the limit resets at 3:00\u202fPM\.<\/span><\/button>/);
  expect(out).not.toContain("title=");
});
