import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { brandCandidates, type BrandCandidate } from "./candidates";

interface BrandCase { name: string; text: string; expected: BrandCandidate[] }

const fixture = JSON.parse(readFileSync(new URL("../../../schema/fixtures/brand/cases.json", import.meta.url), "utf8")) as { cases: BrandCase[] };

// The fixture counts code points; JS indexes count UTF-16 units.
const codePoints = (text: string, index: number) => Array.from(text.slice(0, index)).length;

describe("shared brand fixtures", () => {
  test("fixtures exist", () => expect(fixture.cases.length).toBeGreaterThan(0));
  for (const c of fixture.cases) {
    test(c.name, () => {
      expect(brandCandidates(c.text).map(found => ({ ...found, index: codePoints(c.text, found.index) }))).toEqual(c.expected);
    });
  }
});
