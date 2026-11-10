import { useRef, useState } from "react";
import type { PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { BuddyId } from "./buddies";

// Choosing a buddy: the pick shows at once (data-buddy, the row, Home) and saves; only the latest pick's reply is
// shown, so a late reply for an earlier pick never undoes a newer one (POSTMORTEM 2026-10-25 'An older install failure
// replaced newer feedback'). App owns this, not the Buddy step, so a reply that lands after first run closed still
// applies. Nothing saves until someone picks.

// shown null: nothing picked since the last reply, so the saved snapshot decides.
export interface BuddyFailure { picked: BuddyId; kept: BuddyId }
export interface BuddyPick { shown: BuddyId | null; seq: number; failure: BuddyFailure | null }
export const INITIAL_PICK: BuddyPick = { shown: null, seq: 0, failure: null };

// IPC answers null when main could not be reached; that is a failure, as Settings > Notifications reads it.
export function failedSave(reply: PreferencesWriteReply | null): boolean { return !reply || !reply.ok; }

// Before the snapshot arrives the window keeps the buddy main opened it with.
export function shownBuddy(pick: BuddyPick, snapshot: PreferencesSnapshot | null, firstPaint: BuddyId): BuddyId {
  return pick.shown ?? (snapshot ? snapshot.preferences.buddy ?? "doany" : firstPaint);
}

// A failure notice stays until a save succeeds or the screen dismisses it (leaving the step); Retry selects the
// failed pick again.
export function pickBuddy(pick: BuddyPick, id: BuddyId): BuddyPick { return { shown: id, seq: pick.seq + 1, failure: pick.failure }; }

// snapshot: App's, the saved choices when IPC gives no reply. A refusal carries main's own snapshot.
export function settleBuddy(pick: BuddyPick, seq: number, picked: BuddyId, reply: PreferencesWriteReply | null, snapshot: PreferencesSnapshot | null): BuddyPick {
  if (seq !== pick.seq) return pick;
  if (!failedSave(reply)) return { shown: null, seq, failure: null };
  return { shown: null, seq, failure: { picked, kept: (reply?.snapshot ?? snapshot)?.preferences.buddy ?? "doany" } };
}

export interface BuddySelection {
  shown: BuddyId;
  failure: BuddyFailure | null;
  // Resolves true when this pick saved; a later pick's reply decides what shows.
  select(id: BuddyId): Promise<boolean>;
  // Whether the latest pick saved, waiting for it while it runs: Continue goes on only after it.
  settled(): Promise<boolean>;
  dismiss(): void;
}

// save is App's savePreferences, which also takes the reply's snapshot as App's own.
export function useBuddySelection(preferences: PreferencesSnapshot | null, save: (patch: PreferencesPatch) => Promise<PreferencesWriteReply | null>, firstPaint: BuddyId): BuddySelection {
  const [pick, setPick] = useState(INITIAL_PICK);
  // Mirrors the state synchronously, so a reply compares against the latest pick, not the one its render saw.
  const current = useRef(INITIAL_PICK);
  const snapshot = useRef(preferences);
  snapshot.current = preferences;
  const latest = useRef<Promise<boolean>>(Promise.resolve(true));
  const update = (next: BuddyPick) => { current.current = next; setPick(next); };
  const select = (id: BuddyId) => {
    const next = pickBuddy(current.current, id);
    update(next);
    const saved = save({ buddy: id }).catch(() => null).then(reply => {
      update(settleBuddy(current.current, next.seq, id, reply, snapshot.current));
      return !failedSave(reply);
    });
    latest.current = saved;
    return saved;
  };
  return {
    shown: shownBuddy(pick, preferences, firstPaint),
    failure: pick.failure,
    select,
    settled: () => latest.current,
    dismiss: () => { if (current.current.failure) update({ ...current.current, failure: null }); },
  };
}
