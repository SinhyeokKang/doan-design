import { useEffect, useRef } from "react";
import type { PreferencesSnapshot } from "../main/preferences";
import { buddyChoiceOff, buddyFailureText } from "./buddyChoice";
import type { BuddySelection } from "./buddySelection";
import type { BuddyId } from "./buddies";
import { BuddyFailureNotice, BuddyRows, focusChecked } from "./BuddyPicker";
import { preferencesNotice } from "./SettingsNotifications";

// Settings > General (.doan/canvases/buddy-choice.html 'settings-general'): today one Buddy group. A pick saves at once
// through App's buddy selection, so Home, the working notice and the accent follow without a restart. A failed save
// returns the rows to the saved buddy and shows the notice above the group, under any newer or broken notice; the
// category's live region reads it once. Leaving the category clears it.
export function SettingsGeneral({ preferences, buddy }: { preferences: PreferencesSnapshot | null; buddy: BuddySelection }) {
  // The selection object is new on every render; the latest dismiss is the one to call on leaving.
  const dismiss = useRef(buddy.dismiss);
  dismiss.current = buddy.dismiss;
  useEffect(() => () => dismiss.current(), []);
  const failure = buddy.failure;
  const retry = (picked: BuddyId) => { void buddy.select(picked).then(saved => { if (saved) requestAnimationFrame(() => focusChecked(document.querySelector(".settings-panel .buddy-rows"))); }); };
  return <>
    {preferencesNotice(preferences?.notice)}
    <section className="settings-section" aria-labelledby="settings-general-buddy">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-general-buddy">Buddy</h2>
        <p className="settings-section-description">Shown on Home and while an agent works on a canvas. It also sets the accent color.</p></div></div>
      {failure && <BuddyFailureNotice failure={failure} id="settings-buddy-error" className="settings-notice buddy-notice" retry={() => retry(failure.picked)} />}
      <div className="doan-settings-group" data-layout="rows">
        <BuddyRows name="settings-buddy" labelledBy="settings-general-buddy" selected={buddy.shown} disabled={buddyChoiceOff(preferences)} select={id => void buddy.select(id)} />
      </div>
    </section>
    <p className="ob-live" role="status">{failure ? buddyFailureText(failure) : ""}</p>
  </>;
}
