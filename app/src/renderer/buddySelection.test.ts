import { expect, test } from "vitest";
import type { PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import { DEFAULT_PREFERENCES } from "../main/preferences";
import { failedSave, INITIAL_PICK, pickBuddy, settleBuddy, shownBuddy, type BuddyPick } from "./buddySelection";
import type { BuddyId } from "./buddies";

const snap = (buddy?: BuddyId, notice: PreferencesSnapshot["notice"] = null): PreferencesSnapshot => ({ preferences: buddy ? { ...DEFAULT_PREFERENCES, buddy } : DEFAULT_PREFERENCES, notice });
const ok = (buddy: BuddyId): PreferencesWriteReply => ({ ok: true, snapshot: snap(buddy) });
const refused = (kept?: BuddyId): PreferencesWriteReply => ({ ok: false, reason: "write_failed", snapshot: snap(kept) });

test("a save failed when IPC answers null or main refuses it", () => {
  expect(failedSave(null)).toBe(true);
  expect(failedSave(refused("puri"))).toBe(true);
  expect(failedSave({ ok: false, reason: "newer", snapshot: snap() })).toBe(true);
  expect(failedSave(ok("puri"))).toBe(false);
});

test("before any pick the shown buddy is the snapshot's, or the first paint's until the snapshot comes", () => {
  expect(shownBuddy(INITIAL_PICK, null, "popo")).toBe("popo");
  expect(shownBuddy(INITIAL_PICK, snap("dori"), "popo")).toBe("dori");
  expect(shownBuddy(INITIAL_PICK, snap(), "popo")).toBe("doany");
});

test("a pick shows at once; its success follows the saved snapshot and clears a failure", () => {
  const picked = pickBuddy(INITIAL_PICK, "popo");
  expect(shownBuddy(picked, snap(), "doany")).toBe("popo");
  const failedBefore: BuddyPick = { ...picked, failure: { picked: "dori", kept: "doany" } };
  const done = settleBuddy(failedBefore, picked.seq, "popo", ok("popo"), snap());
  expect(done.failure).toBeNull();
  expect(shownBuddy(done, snap("popo"), "doany")).toBe("popo");
});

test("a failed pick goes back to the saved buddy and names both", () => {
  const picked = pickBuddy(INITIAL_PICK, "popo");
  const back = settleBuddy(picked, picked.seq, "popo", refused("dori"), snap("dori"));
  expect(shownBuddy(back, snap("dori"), "doany")).toBe("dori");
  expect(back.failure).toEqual({ picked: "popo", kept: "dori" });
  // IPC null: App's snapshot is the saved buddy.
  const lost = settleBuddy(picked, picked.seq, "popo", null, snap("puri"));
  expect(shownBuddy(lost, snap("puri"), "doany")).toBe("puri");
  expect(lost.failure).toEqual({ picked: "popo", kept: "puri" });
  // No snapshot yet and nothing saved: Doany stays.
  expect(settleBuddy(picked, picked.seq, "popo", null, null).failure).toEqual({ picked: "popo", kept: "doany" });
});

test("only the latest pick's reply shows: A's failure after B was picked is ignored", () => {
  const a = pickBuddy(INITIAL_PICK, "popo");
  const b = pickBuddy(a, "dori");
  const late = settleBuddy(b, a.seq, "popo", refused(), snap());
  expect(late).toBe(b);
  expect(shownBuddy(late, snap(), "doany")).toBe("dori");
  // An older success is ignored too; the newer reply decides.
  expect(settleBuddy(b, a.seq, "popo", ok("popo"), snap("popo"))).toBe(b);
  const done = settleBuddy(b, b.seq, "dori", ok("dori"), snap("popo"));
  expect(shownBuddy(done, snap("dori"), "doany")).toBe("dori");
});
