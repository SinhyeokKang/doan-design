import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PermissionPicker, SlashPresets } from "./ComposerParts";
import { TooltipProvider } from "./components/ui/tooltip";
import { permissionPickerView } from "./permissionPicker";

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

// The popover's rows are listbox options, not Radix items, so `data-highlighted` never reaches them by itself. The `/` list
// moves its one highlight with the pointer, as a Radix menu does, so a hovered row and the keyboard row never both fill.
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
