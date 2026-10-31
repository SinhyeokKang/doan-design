import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUNDLED_STUB = readFileSync(join(__dirname, "SKILL.md"), "utf8");
// The stub shipped from c994913 until design presets; existing installs hold these bytes.
const PRESET_LESS_STUB = readFileSync(join(__dirname, "fixtures/SKILL-c994913.md"), "utf8");
test("the bundled stub points to design presets through the guide without listing them", () => {
  for (const text of ["doan skill", "doan design-skill", "doan design-skill <id>", "[doan:skill] end of guide"]) expect(BUNDLED_STUB).toContain(text);
  for (const preset of ["clarify", "context", "polish"]) expect(BUNDLED_STUB).not.toContain(preset);
  expect(BUNDLED_STUB).not.toBe(PRESET_LESS_STUB);
});
// Without `doan skill` the guide's failure rule is unreachable, so the stub must carry it (U-010).
test("the bundled stub says what to do when `doan skill` fails", () => {
  for (const text of ["If `doan skill` fails", "were not applied", "open Doan from Applications", "Settings… > About", "other Doan binaries", "Doan's source files", "Doan app's conversation instructions"]) expect(BUNDLED_STUB).toContain(text);
  expect(BUNDLED_STUB.split("\n").length).toBeLessThanOrEqual(20);
});
test("the bundled stub reaches Doan only through the shell", () => {
  expect(BUNDLED_STUB.toLowerCase()).not.toContain("mcp");
});
