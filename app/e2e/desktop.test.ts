import assert from "node:assert/strict";
import { test } from "node:test";
const { assertDesktopUnlocked, waitForNativeFocus, parseDesktopLock }: typeof import("./desktop") = await import(new URL("./desktop.ts", import.meta.url).href);

test("lock probe accepts only explicit boolean output", () => {
  assert.equal(parseDesktopLock("false\n"), false);
  assert.equal(parseDesktopLock("true\n"), true);
  for (const value of ["", "null", "unknown", "0"]) assert.throws(() => parseDesktopLock(value), /Invalid desktop lock state/);
});
test("locked desktop fails with recovery guidance; unlocked desktop proceeds", async () => {
  await assertDesktopUnlocked(async () => false);
  await assert.rejects(assertDesktopUnlocked(async () => true), /desktop is locked.*Unlock/);
  const failure = new Error("probe unavailable");
  await assert.rejects(assertDesktopUnlocked(async () => { throw failure; }), error => error === failure);
});
test("native focus requires all three original conditions", async () => {
  await waitForNativeFocus(async () => ({ hidden: false, visible: true, focused: true }), "close", async () => false, 0);
  for (const state of [{ hidden: true, visible: true, focused: true }, { hidden: false, visible: false, focused: true }, { hidden: false, visible: true, focused: false }]) {
    await assert.rejects(waitForNativeFocus(async () => state, "close", async () => false, 0), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Native focus timeout \(close\)/);
      assert.ok(error.message.includes(JSON.stringify(state)));
      assert.match(error.message, /locked=false/);
      return true;
    });
  }
});
test("locking during the focus wait is diagnosed without skipping the assertion", async () => {
  let reads = 0;
  await assert.rejects(waitForNativeFocus(async () => ({ hidden: false, visible: true, focused: false }), "hide", async () => ++reads > 1, 0), /locked=true.*Unlock/);
});
test("focus read and diagnostic probe errors remain visible", async () => {
  const failure = new Error("window destroyed");
  await assert.rejects(waitForNativeFocus(async () => { throw failure; }, "hide", async () => false, 0), error => error instanceof Error && error.cause === failure);
  let reads = 0;
  await assert.rejects(waitForNativeFocus(async () => ({ hidden: false, visible: true, focused: false }), "close", async () => { if (++reads > 1) throw new Error("probe failed"); return false; }, 0), /probe failed/);
});
