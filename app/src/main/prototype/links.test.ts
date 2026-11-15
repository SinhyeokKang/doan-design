import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { linkGroups } from "./links";

interface LinkCase {
  name: string;
  frames: { id: string; prototype: string | null }[];
  gotos: { value: string; frames: string[] }[];
  groups: string[][];
}

const fixture: { groups: LinkCase[]; placements: LinkCase[] } = JSON.parse(
  readFileSync(new URL("../../../../schema/fixtures/prototype-links/cases.json", import.meta.url), "utf8"),
);

describe("linkGroups shared fixture", () => {
  for (const section of ["groups", "placements"] as const) {
    describe(section, () => {
      test("has cases", () => {
        expect(fixture[section].length).toBeGreaterThan(0);
      });

      test.each(fixture[section])("$name", ({ frames, gotos, groups }) => {
        expect(linkGroups(frames.map(({ id, prototype }) => prototype === null ? { id } : { id, prototype }), gotos)).toEqual(groups);
      });
    });
  }
});
