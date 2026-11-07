import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { aboutView, type AboutRead, type AboutRow } from "../main/aboutView";
import { aboutNotice, type AboutNotice, type NoticeLine } from "../main/agentSetup/notice";
import type { Provider } from "../main/agentAuth/types";
import type { PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { UpdateSnapshot } from "../main/update/types";
import { UPDATE_BLOCKED, updateView, type UpdateButton, type UpdateRowView } from "../main/update/view";
import { AlertIcon } from "./AlertIcon";
import { providerLogo } from "./homeComposer";
import { preferencesNotice } from "./SettingsNotifications";

const CHECKING = "Checking";
const TONES: Record<AboutRow["tone"], string> = { neutral: "ob-chip", ok: "ob-chip ok", warning: "ob-chip warn", error: "ob-chip err" };
const PROVIDER_ROWS = new Set<string>(["claude", "codex", "cursor", "antigravity", "copilot"]);
const AUTO_SAVE_FAILED = "Couldn’t save your automatic-check choice. Your last saved choice still applies.";
const BLOCKED_READ = `${UPDATE_BLOCKED.title}. ${UPDATE_BLOCKED.text}`;

// The Version row: the running version and the update state from main's push, with the update's actions or progress
// on the right. No part has a live role; the page's one live region reads results.
function versionRow(row: UpdateRowView | null, stateId: string, press: (button: UpdateButton) => void) {
  let trailing: ReactNode = null;
  if (row === null) trailing = <span className="settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />{CHECKING}</span>;
  else if (row.busy !== null) trailing = <span className="settings-loading"><span className="doan-spinner" aria-hidden="true" />{row.busy}</span>;
  else if (row.progress !== null) trailing = <span className="settings-value" aria-hidden="true">{`${row.progress}%`}</span>;
  else if (row.actions.length > 0) {
    const buttons = row.actions.map(button => <button key={button.action} type="button" className="doan-button"
      data-ui-variant={button.prominent ? "prominent" : "subtle"} data-ui-size="sm" aria-label={button.ariaLabel} onClick={() => press(button)}>{button.label}</button>);
    // A lone Check for Updates sits in the trailing column as the shipped rows' single control does; a pair, or an
    // action answering the line under the row, sit together in the actions group.
    trailing = row.actions.length === 1 && row.error === null ? buttons : <span className="update-msg-actions">{buttons}</span>;
  }
  return <div className="doan-preference-row" data-about="version">
    <div className="doan-preference-row-content"><span className="doan-preference-row-label">Version</span>
      {row !== null && <span className="doan-preference-row-description"><span id={stateId}>{row.description}</span>
        {row.progress !== null && <span className="usage-bar update-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.progress} aria-labelledby={stateId}>
          <i style={{ width: `${row.progress}%` }} /></span>}</span>}</div>
    {trailing !== null && <div className="doan-preference-row-trailing">{trailing}</div>}
    {row !== null && (row.notice !== null || row.error !== null) && <div className="doan-preference-row-extra">
      {row.notice !== null && <div className="doan-notice"><AlertIcon /><div className="update-reason-body"><span className="ob-notice-title">{row.notice.title}</span><span className="ob-notice-body">{row.notice.text}</span></div></div>}
      {row.error !== null && <p className="settings-msg error"><AlertIcon /><span>{row.error}</span></p>}
    </div>}
  </div>;
}

// This launch's agent setup result. Static text, not a live region: it reports
// what happened when Doan opened and does not change while the page is shown. Copy details carries the same lines.
function setupNotice(notice: AboutNotice) {
  const parts = (line: NoticeLine) => line.parts.map((part, i) => "code" in part ? <code key={i}>{part.code}</code> : part.text);
  return <div className={notice.tone === "warning" ? "doan-notice warning setup-notice" : "doan-notice setup-notice"}>
    <AlertIcon />
    <div className="setup-notice-body"><span className="ob-notice-title">{notice.title}</span>
      {notice.tone === "warning"
        ? <ul className="setup-notice-list">{notice.lines.map((line, i) => <li key={i} className="setup-notice-item">
          {line.agents !== null && <><span className="setup-notice-agents">{line.agents}</span> — </>}{parts(line)}
          {line.command && <code className="setup-notice-command">{line.command}</code>}</li>)}</ul>
        : notice.lines.map((line, i) => <span key={i} className="ob-notice-body">{parts(line)}</span>)}
    </div>
  </div>;
}

// Settings > About (PRODUCT §5 item 0 'About'): main reads the versions (aboutView decides every row's words); this page reads
// on entry and again when the window comes back, which covers returning from an install page. Copy details asks main
// to write the clipboard from its own read. The Version and automatic-check rows follow main's update push instead,
// so they stay when that read fails.
export function SettingsAbout({ actions, preferences, save }: {
  actions: HTMLElement | null;
  preferences: PreferencesSnapshot | null;
  save(patch: PreferencesPatch): Promise<PreferencesWriteReply | null>;
}) {
  const [read, setRead] = useState<AboutRead | null>(null);
  // The read itself failed (main never answered with versions), as opposed to a row main could not read.
  const [failed, setFailed] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const reads = useRef(0), inFlight = useRef(false);
  const stateId = useId();
  const [update, setUpdate] = useState<UpdateSnapshot | null>(null);
  const [autoFailed, setAutoFailed] = useState<PreferencesPatch | null>(null);
  // The live region's text; seq makes a result repeated word for word a change the region reads again.
  const [announced, setAnnounced] = useState({ text: "", seq: 0 });
  // The last push's announcement; undefined until the first push, which is never read.
  const heard = useRef<string | null | undefined>(undefined);
  const announce = (text: string) => setAnnounced(previous => ({ text, seq: previous.seq + 1 }));
  // Entry and Retry say Checking; a re-read on focus keeps the shown versions until the new ones arrive, and a read
  // already running (a CLI run in main) is not started again.
  const load = (fresh: boolean) => {
    if (!fresh && inFlight.current) return;
    const request = ++reads.current;
    inFlight.current = true;
    if (fresh) { setRead(null); setFailed(false); }
    void window.doan.readAbout().catch(() => null).then(reply => {
      if (request !== reads.current) return;
      inFlight.current = false;
      if (reply || fresh) { setRead(reply); setFailed(reply === null); }
    });
  };
  useEffect(() => {
    load(true);
    const focused = () => load(false);
    window.addEventListener("focus", focused);
    return () => { reads.current++; window.removeEventListener("focus", focused); };
  }, []);
  useEffect(() => window.doan.onUpdate(snapshot => {
    const said = updateView(snapshot, Date.now()).row.announcement;
    if (heard.current !== undefined && said !== null && said !== heard.current) announce(said);
    heard.current = said;
    setUpdate(snapshot);
  }), []);
  useEffect(() => {
    if (copy !== "copied") return;
    const timer = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copy]);
  const view = aboutView(read);
  const notice = read === null ? null : aboutNotice(read.setup.items, read.setup.home);
  const row = (item: AboutRow) => {
    const icon = PROVIDER_ROWS.has(item.id);
    return <div key={item.id} className="doan-preference-row" data-about={item.id} data-has-icon={icon ? "" : undefined}>
      {icon && <span className="doan-preference-row-icon" aria-hidden="true"><img className="logo" src={providerLogo(item.id as Provider)} alt="" /></span>}
      <div className="doan-preference-row-content"><span className="doan-preference-row-label">{item.label}</span>
        {item.description !== null && <span className="doan-preference-row-description">{item.id === "cli" ? <code>{item.description}</code> : item.description}</span>}</div>
      {item.error === null && <div className="doan-preference-row-trailing">
        {item.value === CHECKING ? <span className="settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />{CHECKING}</span>
          : item.value !== null && <span className="settings-value">{item.value}</span>}
        {item.status !== null && <span className={TONES[item.tone]}>{item.status}</span>}
      </div>}
      {item.error !== null && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>{item.error}</span></p>
        <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => load(true)}>Retry</button></div>}
      {item.id === "cli" && notice !== null && <div className="doan-preference-row-extra">{setupNotice(notice)}</div>}
    </div>;
  };
  const shown = update === null ? null : updateView(update, Date.now());
  const press = (button: UpdateButton) => {
    if (button.action === "check") void window.doan.checkForUpdates().catch(() => {});
    else if (button.action === "notes") void window.doan.openReleaseNotes().catch(() => false);
    // The gate is asked at the press; a blocked answer is the one time the reason is read.
    else void window.doan.installUpdate().catch(() => null).then(reply => { if (reply?.kind === "blocked") announce(BLOCKED_READ); });
  };
  const saveAuto = (patch: PreferencesPatch) => {
    setAutoFailed(null);
    void save(patch).catch(() => null).then(reply => { if (!reply || (!reply.ok && reply.reason !== "newer")) { setAutoFailed(patch); announce(AUTO_SAVE_FAILED); } });
  };
  const auto = shown?.autoCheck ?? null;
  const autoRow = auto !== null && <div className="doan-preference-row">
    <div className="doan-preference-row-content"><span className="doan-preference-row-label">{auto.label}</span><span className="doan-preference-row-description">{auto.description}</span></div>
    <div className="doan-preference-row-trailing"><button type="button" className="doan-switch" role="switch" aria-checked={auto.checked} aria-label={auto.label}
      disabled={preferences === null || preferences.notice === "newer"} onClick={() => saveAuto({ updates: { autoCheck: !auto.checked } })} /></div>
    {autoFailed !== null && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error"><AlertIcon /><span>{AUTO_SAVE_FAILED}</span></p>
      <span className="update-msg-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-label="Save the automatic-check choice again" onClick={() => saveAuto(autoFailed)}>Retry</button></span></div>}
  </div>;
  const copyDetails = () => { void window.doan.copyAbout().catch(() => ({ kind: "error" as const })).then(reply => setCopy(reply.kind === "success" ? "copied" : "failed")); };
  return <>
    {actions && createPortal(<button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-live="polite" onClick={copyDetails}>
      {copy === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copy === "copied" ? "Copied" : "Copy details"}</button>, actions)}
    {copy === "failed" && <p className="settings-msg error" role="alert"><AlertIcon /><span>Couldn’t copy the details. Try again.</span></p>}
    {auto !== null && preferencesNotice(preferences?.notice)}
    {failed && <div className="settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>Couldn’t read the versions.</span></p>
      <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => load(true)}>Retry</button></div>}
    <section className="settings-section" aria-labelledby="settings-about-doan">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-about-doan">Doan</h2></div></div>
      <div className="doan-settings-group" data-layout="rows">{versionRow(shown?.row ?? null, stateId, press)}{autoRow}{!failed && view.app.map(row)}</div>
    </section>
    {!failed && <section className="settings-section" aria-labelledby="settings-about-tools">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-about-tools">Agent tools</h2>
        <p className="settings-section-description">The command-line tools Doan runs for your agent connections.</p></div></div>
      <div className="doan-settings-group" data-layout="rows">{view.tools.map(row)}</div>
    </section>}
    <p className="ob-live" role="status">{announced.text}{announced.seq % 2 === 0 && announced.text !== "" ? "\u200b" : ""}</p>
  </>;
}
