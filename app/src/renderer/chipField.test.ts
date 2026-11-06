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
