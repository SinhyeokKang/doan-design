import { expect, test } from "vitest";
import cases from "../../../schema/fixtures/project-thumb/cases.json";
import { projectHue, projectInitial } from "./shellNavigation";

test.each(cases)("project thumbnail for '$name' matches the export viewer", ({ name, hue, initial }) => {
  expect(projectHue(name)).toBe(hue);
  expect(projectInitial(name)).toBe(initial);
});
