import { useRef, useState } from "react";
import type { PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { BuddyId } from "./buddies";
import { cooldownEnd } from "./buddyCooldown";

// Choosing a buddy: the pick shows at once (data-buddy, the row, Home) and saves; only the latest pick's reply is
// shown, so a late reply for an earlier pick never undoes a newer one (POSTMORTEM 2026-10-25 'An older install failure
// replaced newer feedback'). App owns this, not the Buddy step, so a reply that lands after first run closed still
// applies. Nothing saves until someone picks.

// shown null: nothing picked since the last reply, so the saved snapshot decides. cooldown: the failed save was a
// Settings > General switch, so its Retry sends a change time too.
export interface BuddyFailure { picked: BuddyId; kept: BuddyId; cooldown?: true }
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
export function settleBuddy(pick: BuddyPick, seq: number, picked: BuddyId, reply: PreferencesWriteReply | null, snapshot: PreferencesSnapshot | null, cooldown = false): BuddyPick {
  if (seq !== pick.seq) return pick;
  if (!failedSave(reply)) return { shown: null, seq, failure: null };
  return { shown: null, seq, failure: { picked, kept: (reply?.snapshot ?? snapshot)?.preferences.buddy ?? "doany", ...(cooldown ? { cooldown: true as const } : {}) } };
}

export interface BuddySelection {
  shown: BuddyId;
  failure: BuddyFailure | null;
  // When the buddy lock of the saved change time ends (it may already have); null with no change time.
  lockedUntil: number | null;
  // Resolves true when this pick saved; a later pick's reply decides what shows. changedAt: a Settings > General
  // switch, saved in the same patch so the buddy and its lock are written together or not at all.
  select(id: BuddyId, changedAt?: string): Promise<boolean>;
  // While a save runs, whether the latest pick saved (Continue goes on only after it); with none running, true.
  settled(): Promise<boolean>;
  // The existing-user buddy screen's Continue: a pick still saving is waited for, as settled() does; with no buddy in
  // the file the buddy on screen (Doany at first) is saved now, since that screen must leave a buddy key behind.
  commit(): Promise<boolean>;
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
  // Saves still running: a failure that already answered is not one to wait for, so Continue then goes on with the
  // buddy that stays.
  const running = useRef(0);
  // The change time and when this run first read it: kept per value, so a render or a reopened Settings page does not
  // move the end of a lock whose time is in the future.
  const seen = useRef<{ value: string; at: number } | null>(null);
  const changedAt = preferences?.preferences.buddyChangedAt;
  const changedTime = changedAt === undefined ? NaN : Date.parse(changedAt);
  let lockedUntil: number | null = null;
  if (changedAt !== undefined && !Number.isNaN(changedTime)) {
    const at = seen.current?.value === changedAt ? seen.current.at : (seen.current = { value: changedAt, at: Date.now() }).at;
    lockedUntil = cooldownEnd(changedTime, at);
  }
  const update = (next: BuddyPick) => { current.current = next; setPick(next); };
  const select = (id: BuddyId, changedAt?: string) => {
    // A confirmed switch shows once it is saved: while the alert waits, the rows, Home and the accent keep the saved
    // buddy (draft frame general-confirm-saving).
    const picked = pickBuddy(current.current, id);
    const next = changedAt === undefined ? picked : { ...picked, shown: current.current.shown };
    update(next);
    running.current++;
    const saved = save(changedAt === undefined ? { buddy: id } : { buddy: id, buddyChangedAt: changedAt }).catch(() => null).then(reply => {
      running.current--;
      update(settleBuddy(current.current, next.seq, id, reply, snapshot.current, changedAt !== undefined));
      return !failedSave(reply);
    });
    latest.current = saved;
    return saved;
  };
  return {
    shown: shownBuddy(pick, preferences, firstPaint),
    failure: pick.failure,
    lockedUntil,
    select,
    settled: () => running.current > 0 ? latest.current : Promise.resolve(true),
    commit: () => {
      if (current.current.shown !== null) return latest.current;
      if (snapshot.current?.preferences.buddy === undefined) return select(shownBuddy(current.current, snapshot.current, firstPaint));
      return Promise.resolve(true);
    },
    dismiss: () => { if (current.current.failure) update({ ...current.current, failure: null }); },
  };
}
