import { useRef, useState, type ReactNode } from "react";
import type { NotificationPreferences, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import { AlertIcon } from "./AlertIcon";
import { retryButton, useRetry } from "./ListRetryButton";
import { announcedAgain } from "./listRetry";

type EventKey = "approval" | "finished" | "failed";
const EVENTS: readonly { key: EventKey; label: string; description: string }[] = [
  { key: "approval", label: "Approval requests", description: "An agent is waiting for you to allow or deny an action, or to answer a question." },
  { key: "finished", label: "Finished", description: "An agent finished its turn." },
  { key: "failed", label: "Couldn’t finish", description: "An agent stopped because of an error. Stops you make aren’t announced." },
];
const PERMISSION = {
  idle: { role: "note", error: false, text: "If no notification appears, allow Doan in System Settings › Notifications." },
  sent: { role: "status", error: false, text: "Test notification sent. If you didn’t see it, allow Doan in System Settings › Notifications." },
  failed: { role: "alert", error: true, text: "Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications." },
} as const;
const SAVE_FAILED = "Couldn’t save your notification choices. Your last saved choices still apply.";

// The preferences.json read notice: unreadable means defaults until the next change moves the file aside; newer is kept,
// nothing saved. className places it (first run's Buddy step shows it as a panel notice).
export function preferencesNotice(notice: PreferencesSnapshot["notice"] | undefined, className = "settings-notice"): ReactNode {
  if (notice === "broken") return <div className={`doan-notice error ${className}`} role="alert"><AlertIcon /><span className="selectable">Doan couldn’t read its saved settings, so defaults apply.</span></div>;
  if (notice === "newer") return <div className={`doan-notice ${className}`} role="status"><AlertIcon /><span className="selectable"><strong className="ob-notice-title">These settings were saved by a newer version of Doan</strong>
    <span className="ob-notice-body">Defaults apply here, and changes aren’t saved. Update Doan to use them.</span></span></div>;
  return null;
}

// PRODUCT §5 item 0 'Notifications'. Main decides when to notify; this page saves the choices and asks main for a test
// notification or its fixed System Settings URL. A switch shows the saved choice, so a failed save leaves it where it was.
export function SettingsNotifications({ preferences, save }: { preferences: PreferencesSnapshot | null; save(patch: PreferencesPatch): Promise<PreferencesWriteReply | null> }) {
  const [failed, setFailed] = useState<{ key: keyof NotificationPreferences; patch: PreferencesPatch } | null>(null);
  const [test, setTest] = useState<keyof typeof PERMISSION>("idle");
  const notifications = preferences?.preferences.notifications ?? null;
  const off = preferences === null || preferences.notice === "newer";
  // Only the latest save, a switch's or Retry's, owns the failure line: a reply to an earlier one that comes after a
  // later save was sent is dropped (POSTMORTEM 2026-10-25), so it cannot put a failure under another switch.
  const latest = useRef(0);
  const write = (key: keyof NotificationPreferences, patch: PreferencesPatch) => {
    const request = ++latest.current;
    setFailed(null);
    void save(patch).then(reply => { if (request === latest.current && (!reply || (!reply.ok && reply.reason !== "newer"))) setFailed({ key, patch }); });
  };
  // Retry keeps the line while its save is out (DESIGN 'Busy action'); only a save that went clears it. It is a save
  // too, so it takes a request number: a switch pressed meanwhile makes its reply stale.
  const retrying = useRetry();
  const retry = (pressed: HTMLElement | null) => {
    if (!failed) return;
    const { patch } = failed;
    const request = ++latest.current;
    retrying.run(() => save(patch).then(reply => {
      const ok = !!reply && (reply.ok || reply.reason === "newer");
      if (ok && request === latest.current) setFailed(current => current?.patch === patch ? null : current);
      return ok;
    }), pressed);
  };
  const opening = useRetry();
  const linkFailed = opening.failures > 0;
  const sendTest = () => { void window.doan.sendTestNotification().catch(() => null).then(reply => setTest(reply?.kind === "sent" ? "sent" : "failed")); };
  const sw = (key: keyof NotificationPreferences, label: string, disabled: boolean) => <button type="button" className="doan-switch" role="switch" aria-checked={notifications?.[key] ?? true} aria-label={label}
    disabled={disabled} onClick={() => write(key, { notifications: { [key]: !(notifications?.[key] ?? true) } })} />;
  const error = (key: keyof NotificationPreferences) => failed?.key === key && <div className="doan-preference-row-extra settings-msg-row">
    <p className="settings-msg error selectable" role="alert"><AlertIcon /><span id={`settings-notifications-error-${key}`}>{announcedAgain(SAVE_FAILED, retrying.failures)}</span></p>
    {retryButton({ running: retrying.running, variant: "subtle", describedBy: `settings-notifications-error-${key}`, onRetry: retry })}</div>;
  const enabled = notifications?.enabled ?? true, hint = PERMISSION[test];
  return <>
    {preferencesNotice(preferences?.notice)}
    <section className="settings-section" aria-labelledby="settings-notifications-delivery">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-notifications-delivery">Delivery</h2></div></div>
      <div className="doan-settings-group" data-layout="rows">
        <div className="doan-preference-row">
          <div className="doan-preference-row-content"><span className="doan-preference-row-label">Desktop notifications</span><span className="doan-preference-row-description">Notifications can appear when the main window is inactive, except for the conversation you’re viewing in a prototype.</span></div>
          <div className="doan-preference-row-trailing">{sw("enabled", "Desktop notifications", off)}</div>
          {error("enabled")}
        </div>
        {enabled && <div className="doan-preference-row-extra settings-permission">
          {/* The notice's two actions stack on their own row inside it, panel on its inset fill (DESIGN 'Notices'). */}
          <div className={hint.error ? "doan-notice error stacked" : "doan-notice stacked"}><AlertIcon /><span className="ob-notice-text selectable" role={hint.role}>{hint.text}</span>
            <div className="ob-notice-actions">
              <button type="button" className="doan-button" data-ui-variant="panel" data-ui-size="sm" onClick={sendTest}>Send test notification</button>
              <button type="button" className="doan-button" data-ui-variant="panel" data-ui-size="sm" aria-busy={opening.running || undefined} aria-disabled={opening.running || undefined}
                aria-describedby={linkFailed ? "settings-notifications-open-error" : undefined} onClick={() => opening.run(() => window.doan.openNotificationSettings())}>
                {opening.running && <span className="doan-spinner" aria-hidden="true" />}Open System Settings ↗</button>
            </div>
            {linkFailed && <p className="settings-msg error selectable basis-full" role="alert" id="settings-notifications-open-error"><AlertIcon />
              <span>{announcedAgain("Couldn’t open System Settings. On your Mac, go to System Settings › Notifications › Doan.", opening.failures - 1)}</span></p>}
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
