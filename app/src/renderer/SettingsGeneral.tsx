import { useEffect, useRef, useState } from "react";
import type { PreferencesSnapshot } from "../main/preferences";
import { buddyChoiceOff, buddyFailureText } from "./buddyChoice";
import { cooldownClock, cooldownRemaining, nextTick } from "./buddyCooldown";
import type { BuddyFailure, BuddySelection } from "./buddySelection";
import { buddy as registry, type BuddyId } from "./buddies";
import { BuddyFailureNotice, BuddyRows, focusChecked } from "./BuddyPicker";
import { Buddy } from "./Doany";
import { SettingsDialog } from "./SettingsDialog";
import { preferencesNotice } from "./SettingsNotifications";

const ROWS = ".settings-panel .buddy-rows";
const LOCK = ".settings-panel .buddy-lock";
const TIME_ID = "settings-buddy-time", RULE_ID = "settings-buddy-rule";

const focusRow = (id: BuddyId) => requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`${ROWS} input[value="${id}"]`)?.focus());

// Settings > General (.doan/canvases/buddy-choice.html 'settings-general', .doan/canvases/buddy-change-cooldown.html):
// today one Buddy group. Another buddy's row opens an alert first, and the switch saves with its change time through
// App's buddy selection, so Home, the working notice and the accent follow without a restart. While the alert is open
// the page is locked (`onLock`). A saved switch covers the rows for 24 hours (PRODUCT §5 item 0 'General'): the current
// buddy over a countdown. A failed save shows the notice above the group, under any newer or broken notice; the
// category's live region reads it once. Leaving the category clears it.
export function SettingsGeneral({ preferences, buddy, onLock }: { preferences: PreferencesSnapshot | null; buddy: BuddySelection; onLock(locked: boolean): void }) {
  // The selection object is new on every render; the latest dismiss is the one to call on leaving.
  const dismiss = useRef(buddy.dismiss);
  dismiss.current = buddy.dismiss;
  useEffect(() => () => dismiss.current(), []);
  const [asking, setAsking] = useState<{ id: BuddyId; pending: boolean } | null>(null);
  // Bumped to redraw the countdown; the time itself is read on each render, so a late timer still shows the right one.
  const [, setTick] = useState(0);
  // Focus moves to the buddy once the overlay it waits for is drawn.
  const landOnLock = useRef(false);
  // Focus was on the buddy when the lock ran out, so it goes to the checked row rather than falling to <body>.
  const leftLock = useRef(false);
  const off = buddyChoiceOff(preferences);
  const remaining = off || buddy.lockedUntil === null ? null : cooldownRemaining(buddy.lockedUntil, Date.now());
  const locked = remaining !== null;

  // The saved snapshot and the closed alert can land in separate renders; focus waits for both, as the page behind a
  // modal alert cannot take it.
  const settled = asking === null;
  useEffect(() => {
    if (locked && settled && landOnLock.current) { landOnLock.current = false; document.querySelector<HTMLButtonElement>(`${LOCK} .doany`)?.focus(); }
    if (!locked && leftLock.current) { leftLock.current = false; focusChecked(document.querySelector(ROWS)); }
  }, [locked, settled]);
  // A redraw on each second boundary, and at once when the window shows or takes focus: a timer can wake late after
  // sleep. A hidden window still redraws on its timer; nothing reads it until it shows.
  useEffect(() => {
    if (remaining === null) return;
    const redraw = () => { leftLock.current = !!document.activeElement?.closest(LOCK); setTick(tick => tick + 1); };
    const timer = setTimeout(redraw, nextTick(remaining));
    document.addEventListener("visibilitychange", redraw);
    window.addEventListener("focus", redraw);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", redraw); window.removeEventListener("focus", redraw); };
  });

  const request = (id: BuddyId) => {
    if (asking || locked) return;
    setAsking({ id, pending: false });
    onLock(true);
  };
  const answer = (allow: boolean) => {
    if (!asking || asking.pending) return;
    const { id } = asking;
    if (!allow) { setAsking(null); onLock(false); focusRow(id); return; }
    setAsking({ id, pending: true });
    void buddy.select(id, new Date().toISOString()).then(saved => {
      setAsking(null);
      onLock(false);
      if (saved) landOnLock.current = true; else focusRow(id);
    });
  };
  // Retry saves the confirmed pick again without asking; a Settings switch sends a fresh change time.
  const retry = (failed: BuddyFailure) => {
    const saving = failed.cooldown ? buddy.select(failed.picked, new Date().toISOString()) : buddy.select(failed.picked);
    void saving.then(saved => {
      if (!saved) return;
      if (failed.cooldown) landOnLock.current = true;
      else requestAnimationFrame(() => focusChecked(document.querySelector(ROWS)));
    });
  };
  const failure = buddy.failure;
  const name = asking ? registry(asking.id).name : "";
  return <>
    {preferencesNotice(preferences?.notice)}
    <section className="settings-section" aria-labelledby="settings-general-buddy">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-general-buddy">Buddy</h2>
        <p className="settings-section-description">Shown on Home and while an agent works on a canvas. It also sets the accent color.</p></div></div>
      {failure && <BuddyFailureNotice failure={failure} id="settings-buddy-error" className="settings-notice buddy-notice" retry={() => retry(failure)} />}
      <div className={locked ? "doan-settings-group buddy-locked" : "doan-settings-group"} data-layout="rows">
        <BuddyRows name="settings-buddy" labelledBy="settings-general-buddy" selected={buddy.shown} disabled={off} inert={locked} request={request} />
        {/* The countdown and its line describe the buddy, so they are read once when focus reaches it; a live role on
            the countdown would read it every second. */}
        {locked && <div className="buddy-lock">
          <Buddy buddy={buddy.shown} size={96} describedBy={`${TIME_ID} ${RULE_ID}`} />
          <div className="ob-heading problem-heading">
            <h3 id={TIME_ID}>{cooldownClock(remaining)}</h3>
            <p id={RULE_ID}>Until you can change your buddy again. Your buddy stays for 24 hours after each change.</p>
          </div>
        </div>}
      </div>
    </section>
    {asking && <SettingsDialog title={`Switch to ${name}?`} description="You can’t change your buddy again for 24 hours." verb={`Switch to ${name}`} pending={asking.pending} answer={answer} />}
    <p className="ob-live" role="status">{failure ? buddyFailureText(failure) : ""}</p>
  </>;
}
