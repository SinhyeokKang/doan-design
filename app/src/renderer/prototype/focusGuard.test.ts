import { describe, expect, test } from "vitest";
import { ColumnFocusGuard, FOCUS_GUARD_MS } from "./focusGuard";

// A run reloaded while the person types in the conversation column must not take their focus: a frame's own focus()
// or autofocus would (PoC). The host cannot tell a script's focus() from the person's click into the frame, so it
// returns focus only for a run created while focus was in the column, until 1 s after that run is ready and shown.

const frame = (name: string) => ({ name }) as unknown as HTMLIFrameElement;
const field = { name: "composer" } as unknown as HTMLElement;

describe("ColumnFocusGuard", () => {
  test("a run created while focus was in the column gives focus back when its iframe takes it", () => {
    let now = 0;
    const guard = new ColumnFocusGuard(() => now);
    const next = frame("gen 2");
    guard.created(2, next, true);
    // focusout from the composer with no relatedTarget: focus went into a cross-origin frame.
    expect(guard.left(field, null)).toBe(true);
    expect(guard.returnTo(next)).toBe(field);
    now = 5000;
    guard.shown(2);
    guard.left(field, null);
    now = 5000 + FOCUS_GUARD_MS - 1;
    expect(guard.returnTo(next)).toBe(field);
  });

  test("ends 1 s after the run is shown: a later focus() and the person's click are left alone", () => {
    let now = 0;
    const guard = new ColumnFocusGuard(() => now);
    const next = frame("gen 2");
    guard.created(2, next, true);
    now = 100; guard.shown(2);
    now = 100 + FOCUS_GUARD_MS;
    guard.left(field, null);
    expect(guard.returnTo(next)).toBeNull();
  });

  test("a run created while focus was elsewhere is never guarded", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 3");
    guard.created(3, next, false);
    guard.left(field, null);
    expect(guard.returnTo(next)).toBeNull();
  });

  test("only the guarded run's iframe: focus moving to another element or another iframe stays", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 2");
    guard.created(2, next, true);
    expect(guard.left(field, { name: "Reload" } as unknown as Element)).toBe(false);
    guard.left(field, null);
    expect(guard.returnTo(frame("gen 1"))).toBeNull();
    guard.left(field, null);
    expect(guard.returnTo(null)).toBeNull();
  });

  test("a newer run replaces the guard: it is armed by where focus was when that one was created", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const first = frame("gen 2"), second = frame("gen 3");
    guard.created(2, first, true);
    guard.created(3, second, false);
    guard.left(field, null);
    expect(guard.returnTo(first)).toBeNull();
    expect(guard.returnTo(second)).toBeNull();
  });

  test("each return needs its own focusout", () => {
    const guard = new ColumnFocusGuard(() => 0);
    const next = frame("gen 2");
    guard.created(2, next, true);
    guard.left(field, null);
    expect(guard.returnTo(next)).toBe(field);
    expect(guard.returnTo(next)).toBeNull();
  });
});
