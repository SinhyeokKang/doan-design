import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PermissionPicker, SlashPresets } from "./ComposerParts";
import { TooltipProvider } from "./components/ui/tooltip";
import { permissionPickerView } from "./permissionPicker";

// Dogfooding: a preset row showed its title and group; it now reads as a card, the title over its one-line description.
test("a preset row is its title over its description", () => {
  const view = { kind: "list" as const, tabs: [], summary: "1 preset", sections: [{ title: null, rows: [{ id: "shape", title: "Shape a feature", description: "Work out a feature's purpose and flow.", scope: "feature brief", tooltip: "Work out a feature's purpose and flow. (/shape)", group: "Start" }] }] };
  const html = renderToStaticMarkup(<SlashPresets view={view} query="" listId="l" highlight={0} onChoose={() => {}} onRetry={() => {}} />);
  expect(html).toContain('<span class="preset-text"><span class="preset-title">Shape a feature</span><span class="preset-desc">Work out a feature&#x27;s purpose and flow.</span></span>');
  expect(html).not.toContain('class="sub"');
});

// permission-mode spec decision 5: Full access shows its name, a warning icon and the warning ink (data-mode), never
// colour alone.
test("the permission trigger shows the mode's icon and label; Full access warns", () => {
  const html = (mode: "default" | "bypass", size?: "xs") => renderToStaticMarkup(<TooltipProvider><PermissionPicker view={permissionPickerView("codex", undefined, mode)!} disabled={false} onPick={() => {}} {...(size ? { size } : {})} /></TooltipProvider>);
  expect(html("default")).toMatch(/<button type="button" class="composer-permission doan-button" data-ui-size="sm" data-ui-variant="trigger" data-mode="default" aria-label="Permission: Default"[^>]*><svg[^>]*lucide-shield[^-][^>]*>.*?<\/svg><span class="label">Default<\/span><svg[^>]*chev/);
  expect(html("bypass", "xs")).toMatch(/data-ui-size="xs" data-ui-variant="trigger" data-mode="bypass" aria-label="Permission: Full access, no approval requests"[^>]*><svg[^>]*lucide-shield-alert/);
  expect(html("bypass")).toContain('<span class="label">Full access</span>');
});
