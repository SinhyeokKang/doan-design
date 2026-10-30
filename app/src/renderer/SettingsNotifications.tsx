import { useState, type ReactNode } from "react";
import type { NotificationPreferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import { AlertIcon } from "./AlertIcon";

type EventKey = "approval" | "finished" | "failed";
const EVENTS: readonly { key: EventKey; label: string; description: string }[] = [
  { key: "approval", label: "Approval requests", description: "An agent is waiting for you to allow or deny an action." },
  { key: "finished", label: "Finished", description: "An agent finished its turn." },
  { key: "failed", label: "Couldn’t finish", description: "An agent stopped because of an error. Stops you make aren’t announced." },
];
const PERMISSION = {
  idle: { role: "note", error: false, text: "If no notification appears, allow Doan in System Settings › Notifications." },
  sent: { role: "status", error: false, text: "Test notification sent. If you didn’t see it, allow Doan in System Settings › Notifications." },
  failed: { role: "alert", error: true, text: "Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications." },
} as const;
const SAVE_FAILED = "Couldn’t save your notification choices. Your last saved choices still apply.";

// The read-stage notice over the categories that save preferences.json (buzz-settings design '포맷 변경'): an
// unreadable file applies defaults until the next change moves it aside; a newer one is kept and nothing is saved.
export function preferencesNotice(notice: PreferencesSnapshot["notice"] | undefined): ReactNode {
  if (notice === "broken") return <div className="doan-notice error doan-panel settings-notice" role="alert"><AlertIcon /><span>Doan couldn’t read its saved settings, so defaults apply.</span></div>;
  if (notice === "newer") return <div className="doan-notice doan-panel settings-notice" role="status"><AlertIcon /><span><strong className="ob-notice-title">These settings were saved by a newer version of Doan</strong>
    <span className="ob-notice-body">Defaults apply here, and changes aren’t saved. Update Doan to use them.</span></span></div>;
  return null;
}

// Settings > Notifications (design 'Notifications'). Main decides when to notify; this page only saves the choices and
// asks main for a test notification or its fixed System Settings URL. A switch shows the saved choice, so a failed save
// leaves it where it was.
export function SettingsNotifications({ preferences, save }: { preferences: PreferencesSnapshot | null; save(patch: PreferencesPatch): Promise<PreferencesWriteReply | null> }) {
  const [failed, setFailed] = useState<{ key: keyof NotificationPreferences; patch: PreferencesPatch } | null>(null);
  const [test, setTest] = useState<keyof typeof PERMISSION>("idle");
  const notifications = preferences?.preferences.notifications ?? null;
  const off = preferences === null || preferences.notice === "newer";
  const write = (key: keyof NotificationPreferences, value: boolean) => {
    const patch: PreferencesPatch = { notifications: { [key]: value } };
    setFailed(null);
    void save(patch).then(reply => { if (!reply || (!reply.ok && reply.reason !== "newer")) setFailed({ key, patch }); });
  };
  const retry = () => { if (!failed) return; const { patch } = failed; setFailed(null); void save(patch).then(reply => { if (!reply || (!reply.ok && reply.reason !== "newer")) setFailed({ key: failed.key, patch }); }); };
  const sendTest = () => { void window.doan.sendTestNotification().catch(() => null).then(reply => setTest(reply?.kind === "sent" ? "sent" : "failed")); };
  const sw = (key: keyof NotificationPreferences, label: string, disabled: boolean) => <button type="button" className="doan-switch" role="switch" aria-checked={notifications?.[key] ?? true} aria-label={label}
    disabled={disabled} onClick={() => write(key, !(notifications?.[key] ?? true))} />;
  const error = (key: keyof NotificationPreferences) => failed?.key === key && <div className="doan-preference-row-extra settings-msg-row">
    <p className="settings-msg error" role="alert"><AlertIcon /><span>{SAVE_FAILED}</span></p>
    <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={retry}>Retry</button></div>;
  const enabled = notifications?.enabled ?? true, hint = PERMISSION[test];
  return <>
    {preferencesNotice(preferences?.notice)}
    <section className="settings-section" aria-labelledby="settings-notifications-delivery">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-notifications-delivery">Delivery</h2></div></div>
      <div className="doan-settings-group" data-layout="rows">
        <div className="doan-preference-row">
          <div className="doan-preference-row-content"><span className="doan-preference-row-label">Desktop notifications</span><span className="doan-preference-row-description">Only while Doan isn’t the active window. Clicking one opens the conversation.</span></div>
          <div className="doan-preference-row-trailing">{sw("enabled", "Desktop notifications", off)}</div>
          {error("enabled")}
        </div>
        {enabled && <div className="doan-preference-row-extra settings-permission">
          <div className={hint.error ? "doan-notice error doan-panel" : "doan-notice doan-panel"} role={hint.role}><AlertIcon /><span>{hint.text}</span></div>
          <div className="ob-state-actions">
            <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={sendTest}>Send test notification</button>
            <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => void window.doan.openNotificationSettings().catch(console.error)}>Open System Settings ↗</button>
          </div>
        </div>}
      </div>
    </section>
    <section className="settings-section" aria-labelledby="settings-notifications-events">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-notifications-events">Notify me about</h2>
        {!enabled && <p className="settings-section-description">Turn on desktop notifications to choose these.</p>}</div></div>
      <div className="doan-settings-group" data-layout="rows">{EVENTS.map(event => <div key={event.key} className="doan-preference-row" data-disabled={enabled ? undefined : ""}>
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">{event.label}</span><span className="doan-preference-row-description">{event.description}</span></div>
        <div className="doan-preference-row-trailing">{sw(event.key, event.label, off || !enabled)}</div>
        {error(event.key)}
      </div>)}</div>
    </section>
  </>;
}
