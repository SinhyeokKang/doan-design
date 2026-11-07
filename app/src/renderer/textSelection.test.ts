import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function rules(selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(",").some(value => value.trim() === selector))
    .map(([, , body]) => body).join("\n");
}

test("app chrome text is not selectable", () => {
  expect(rules("body")).toMatch(/\buser-select:\s*none\s*;/);
});

test.each([".conversation-thread .bubble", ".conversation-thread .msg-agent", "input", "textarea", ".composer-input"])("%s explicitly enables text selection", selector => {
  expect(rules(selector)).toMatch(/\buser-select:\s*text\s*;/);
});
