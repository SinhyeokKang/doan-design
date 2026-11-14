import { describe, expect, test } from "vitest";
import { ColumnFocusGuard, FOCUS_GUARD_MS } from "./focusGuard";

// A run reloaded while the person types in the conversation column must not take their focus: a frame's own focus()
// or autofocus would. The host cannot tell a script's focus() from the person's click into the frame, so it returns
// focus only for a run created while focus was in the column, until 1 s after that run is ready and shown.

const frame = (name: string) => ({ name }) as unknown as HTMLIFrameElement;
const field = { name: "composer" } as unknown as HTMLElement;
// The run iframes by gen, as the host holds them.
const frames = (entries: [number, HTMLIFrameElement][]) => { const map = new Map(entries); return (gen: number) => map.get(gen) ?? null; };

describe("ColumnFocusGuard", () => {
  test("a run created while focus was in the column gives focus back when its iframe takes it", () => {
    let now = 0;
    const guard = new ColumnFocusGuard(() => now);
    const next = frame("gen 2"), of = frames([[2, next]]);
    guard.created(2, true);
    // focusout from the composer with no relatedTarget: focus went into a cross-origin frame.
    expect(guard.left(field, null)).toBe(true);
    expect(guard.returnTo(next, of)).toBe(field);
    now = 5000;
    guard.shown(2);
    guard.left(field, null);
    now = 5000 + FOCUS_GUARD_MS - 1;
    expect(guard.returnTo(next, of)).toBe(field);
  });

  test("ends 1 s after the run is shown: a later focus() and the person's click are left alone", () => {
    let now = 0;
    const guard = new ColumnFocusGuard(() => now);
    const next = frame("gen 2");
    guard.created(2, true);
    now = 100; guard.shown(2);
    now = 100 + FOCUS_GUARD_MS;
    guard.left(field, null);
    expect(guard.returnTo(next, frames([[2, next]]))).toBeNull();
  });

  test("a run created while focus was elsewhere is never guarded", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 3");
    guard.created(3, false);
    guard.left(field, null);
    expect(guard.returnTo(next, frames([[3, next]]))).toBeNull();
  });

  test("only the guarded run's iframe: focus moving to another element or another iframe stays", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 2"), of = frames([[1, frame("gen 1")], [2, next]]);
    guard.created(2, true);
    expect(guard.left(field, { name: "Reload" } as unknown as Element)).toBe(false);
    guard.left(field, null);
    expect(guard.returnTo(of(1), of)).toBeNull();
    guard.left(field, null);
    expect(guard.returnTo(null, of)).toBeNull();
  });

  test("a newer run replaces the guard: it is armed by where focus was when that one was created", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const first = frame("gen 2"), second = frame("gen 3"), of = frames([[2, first], [3, second]]);
    guard.created(2, true);
    guard.created(3, false);
    guard.left(field, null);
    expect(guard.returnTo(first, of)).toBeNull();
    expect(guard.returnTo(second, of)).toBeNull();
  });

  test("each return needs its own focusout", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 2"), of = frames([[2, next]]);
    guard.created(2, true);
    guard.left(field, null);
    expect(guard.returnTo(next, of)).toBe(field);
    expect(guard.returnTo(next, of)).toBeNull();
  });
});
