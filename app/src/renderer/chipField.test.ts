import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { ChipField } from "./chipField";

// Electron's context-menu selectionText, which names the Look Up item, takes the selected DOM text, and the chip's
// screen-reader kind prefix is text; only user-select keeps it out.
test("the composer chip's kind prefix cannot be selected", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.anchor-chip \.sr-only \{[^}]*\buser-select: none;/);
});

// The prototype window's playing frame goes with every message outside the field: the field's place limit counts it.
test("a chip past the limit with the host's reserved places is refused", () => {
  const chips = Array.from({ length: 31 }, (_, i) => ({ kind: "chip" as const, anchor: { element: { doanId: `e${i}`, selector: `#e${i}` } } }));
  const make = (reserved?: () => { kind: "chip"; anchor: { frame: { id: string } } }[]) => {
    const value = Object.create(ChipField.prototype);
    Object.defineProperty(value, "segments", { value: chips });
    Object.assign(value, { pending: [], composing: () => false, readSelection: () => ({ anchor: 31, focus: 31 }), replace: vi.fn(),
      hooks: { scope: () => "canvas", onAnnounce: vi.fn(), ...(reserved ? { reserved } : {}) } });
    return value;
  };
  const anchor = { element: { doanId: "new", selector: "#new" } };
  expect(make().insertChip(anchor)).toBe("inserted");
  expect(make(() => [{ kind: "chip", anchor: { frame: { id: "pay" } } }]).insertChip(anchor)).toBe("limit");
  // The reserved frame chip itself is no new place.
  expect(make(() => [{ kind: "chip", anchor: { frame: { id: "pay" } } }]).insertChip({ frame: { id: "pay" } })).toBe("inserted");
});
