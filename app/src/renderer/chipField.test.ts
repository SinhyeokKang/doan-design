import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { ChipField } from "./chipField";
import { textSegments } from "./anchorField";

// Exercise host updates without a DOM; only repair/reset can draw on this path.
function field() {
  const value = Object.create(ChipField.prototype);
  Object.assign(value, { segments: textSegments("/deploy"), names: new Set(["deploy"]), composingNow: false,
    compositionRepairPending: false, hooks: { skillNames: () => new Set(["deploy"]) }, repair: vi.fn(), reset: vi.fn(), announced: [] });
  return value;
}
test("equal segments and equal skill names from a new Set do not redraw", () => {
  const value = field();
  value.setValue(textSegments("/deploy"));
  expect(value.repair).not.toHaveBeenCalled();
});
test.each(["composingNow", "compositionRepairPending"])("a changed list waits while %s", guard => {
  const value = field(); value[guard] = true;
  value.hooks.skillNames = () => new Set(["review"]);
  value.setValue(textSegments("/deploy"));
  expect(value.repair).not.toHaveBeenCalled();
});
test("a changed list repairs and silently updates the announcement baseline", () => {
  const value = field(); value.names = new Set();
  value.setValue(textSegments("/deploy"));
  expect(value.repair).toHaveBeenCalledOnce();
  expect(value.announced).toEqual(["deploy"]);
});

test("compositionend guards synchronous host echoes until deferred repair", () => {
  vi.useFakeTimers();
  try {
    const value = field(); value.composingNow = true;
    value.flushPending = vi.fn();
    value.sync = () => { value.hooks.skillNames = () => new Set(["review"]); value.setValue(textSegments("/deploy")); };
    value.onCompositionEnd();
    expect(value.repair).not.toHaveBeenCalled();
    expect(value.compositionRepairPending).toBe(true);
    vi.runAllTimers();
    expect(value.compositionRepairPending).toBe(false);
    expect(value.repair).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
test("reset records matched names without announcing a confirmed edit", () => {
  const value = field(); delete value.reset;
  value.render = vi.fn(); value.placeCaret = vi.fn(); value.hooks.onAnnounce = vi.fn();
  value.reset(textSegments("/deploy"));
  expect(value.announced).toEqual(["deploy"]);
  expect(value.hooks.onAnnounce).not.toHaveBeenCalled();
  value.announceSkills();
  expect(value.hooks.onAnnounce).not.toHaveBeenCalled();
});

test.each(["", "Restored draft"])("a host replacement %j after compositionend is applied before deferred repair", text => {
  vi.useFakeTimers();
  try {
    const value = field(); delete value.reset;
    value.segments = textSegments("안녕");
    value.composingNow = true;
    value.render = vi.fn(segments => { value.segments = segments; });
    value.placeCaret = vi.fn(); value.hooks.onAnnounce = vi.fn();
    value.sync = vi.fn(); value.flushPending = vi.fn();
    value.onCompositionEnd();
    expect(value.compositionRepairPending).toBe(true);
    value.setValue(textSegments("안녕"));
    expect(value.render).not.toHaveBeenCalled();
    expect(value.repair).not.toHaveBeenCalled();
    value.setValue(textSegments(text));
    expect(value.segments).toEqual(textSegments(text));
    expect(value.render).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(value.segments).toEqual(textSegments(text));
  } finally { vi.useRealTimers(); }
});

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
    Object.assign(value, { segments: chips, pending: [], composingNow: false, readSelection: () => ({ anchor: 31, focus: 31 }), replace: vi.fn(),
      hooks: { scope: () => "canvas", onAnnounce: vi.fn(), ...(reserved ? { reserved } : {}) } });
    return value;
  };
  const anchor = { element: { doanId: "new", selector: "#new" } };
  expect(make().insertChip(anchor)).toBe("inserted");
  expect(make(() => [{ kind: "chip", anchor: { frame: { id: "pay" } } }]).insertChip(anchor)).toBe("limit");
  // The reserved frame chip itself is no new place.
  expect(make(() => [{ kind: "chip", anchor: { frame: { id: "pay" } } }]).insertChip({ frame: { id: "pay" } })).toBe("inserted");
});
