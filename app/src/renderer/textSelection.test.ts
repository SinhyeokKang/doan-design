import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function selections(selector: string): string[] {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(",").some(value => value.trim() === selector))
    .map(([, , body]) => body).join("\n");
  return [...rules.matchAll(/(?:^|[;{}])\s*user-select\s*:\s*([^;}]+)/g)]
    .map(([, value]) => value!.trim());
}

test("app chrome text is not selectable", () => {
  expect(selections("body").at(-1)).toBe("none");
});

test.each([".conversation-thread .bubble", ".conversation-thread .msg-agent", "input", "textarea", ".composer-input"])("%s explicitly enables text selection", selector => {
  const values = selections(selector);
  expect(values.at(-1)).toBe("text");
  expect(values).not.toContain("none");
});

test.each(["input:disabled", "textarea:disabled"])("%s disables text selection", selector => {
  expect(selections(selector).at(-1)).toBe("none");
});
