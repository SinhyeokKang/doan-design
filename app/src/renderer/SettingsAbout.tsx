import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { aboutView, type AboutRead, type AboutRow } from "../main/aboutView";
import { aboutNotice, type AboutNotice, type NoticeLine } from "../main/agentSetup/notice";
import type { Provider } from "../main/agentAuth/types";
import { AlertIcon } from "./AlertIcon";
import { providerLogo } from "./homeComposer";

const CHECKING = "Checking";
const TONES: Record<AboutRow["tone"], string> = { neutral: "ob-chip", ok: "ob-chip ok", warning: "ob-chip warn", error: "ob-chip err" };
const PROVIDER_ROWS = new Set<string>(["claude", "codex", "cursor", "antigravity", "copilot"]);

// This launch's agent setup result (zero-setup-agents design 'About 알림'). Static text, not a live region: it reports
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

// Settings > About (design 'About'): main reads the versions (aboutView decides every row's words); this page reads
// on entry and again when the window comes back, which covers returning from an install page. Copy details asks main
// to write the clipboard from its own read.
export function SettingsAbout({ actions }: { actions: HTMLElement | null }) {
  const [read, setRead] = useState<AboutRead | null>(null);
  // The read itself failed (main never answered with versions), as opposed to a row main could not read.
  const [failed, setFailed] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const reads = useRef(0), inFlight = useRef(false);
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
  const copyDetails = () => { void window.doan.copyAbout().catch(() => ({ kind: "error" as const })).then(reply => setCopy(reply.kind === "success" ? "copied" : "failed")); };
  return <>
    {actions && createPortal(<button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-live="polite" onClick={copyDetails}>
      {copy === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copy === "copied" ? "Copied" : "Copy details"}</button>, actions)}
    {copy === "failed" && <p className="settings-msg error" role="alert"><AlertIcon /><span>Couldn’t copy the details. Try again.</span></p>}
    {failed && <div className="settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>Couldn’t read the versions.</span></p>
      <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => load(true)}>Retry</button></div>}
    {!failed && <>
    <section className="settings-section" aria-labelledby="settings-about-doan">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-about-doan">Doan</h2></div></div>
      <div className="doan-settings-group" data-layout="rows">{view.app.map(row)}</div>
    </section>
    <section className="settings-section" aria-labelledby="settings-about-tools">
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-about-tools">Agent tools</h2>
        <p className="settings-section-description">The command-line tools Doan runs for your agent connections.</p></div></div>
      <div className="doan-settings-group" data-layout="rows">{view.tools.map(row)}</div>
    </section>
    </>}
  </>;
}
