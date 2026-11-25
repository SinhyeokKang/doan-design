import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { StorageCard, StorageField } from "./StorageChoice";

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const radios = (node: ReactNode) => all(node).filter(element => element.type === "input" && element.props.type === "radio");

// DESIGN 'Unavailable but focusable': aria-disabled, never native disabled, which would drop a focused radio's focus to the page; a
// click, an arrow key's change and Enter then choose nothing.
describe("the Doan files radios while a setup or clone runs", () => {
  for (const [name, draw] of [["StorageField", StorageField], ["StorageCard", StorageCard]] as const) {
    test(`${name}: aria-disabled, not disabled, and no choice is made`, () => {
      const change = vi.fn();
      const inputs = radios(draw({ id: "s", value: "repo", kept: false, disabled: true, change }));
      expect(inputs).toHaveLength(2);
      for (const input of inputs) {
        expect(input.props.disabled).toBeUndefined();
        expect(input.props["aria-disabled"]).toBe(true);
        (input.props.onChange as () => void)();
        const event = { key: "Enter", preventDefault: vi.fn() };
        (input.props.onKeyDown as (event: unknown) => void)(event);
      }
      expect(change).not.toHaveBeenCalled();
    });

    test(`${name}: available radios choose as before`, () => {
      const change = vi.fn();
      const [, local] = radios(draw({ id: "s", value: "repo", kept: false, disabled: false, change }));
      expect(local!.props["aria-disabled"]).toBeUndefined();
      (local!.props.onChange as () => void)();
      expect(change).toHaveBeenCalledWith("local");
    });
  }

  test("the setup panel's and clone screen's rows take the disabled roles from aria-disabled", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toContain('.storage-row:has(> input[aria-disabled="true"]) .ob-provider-label :is(strong, span) { color: var(--text-disabled); }');
    expect(css).toContain('.storage-row:has(> input[aria-disabled="true"]:checked) .ob-radio { border-color: var(--affordance-disabled); background: var(--affordance-disabled); }');
    expect(css).not.toMatch(/\.storage-(row|option)[^{]*input:disabled/);
  });
});
