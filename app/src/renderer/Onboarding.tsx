import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Folder } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { OnboardingState } from "../formats/types";
import { nextFocusIndex } from "./onboardingView";
import { noAgentReadyNotice, type AuthCommand, type Button, type Notice, type ProviderView, type pasteDialog, type stopDialog } from "./agentAuthView";
import { AgentStepSession } from "./agentStep";
import { ProjectStepSession, type ProjectError, type ProjectStepState } from "./projectStep";
import { canAdvance, initialScene, nextScene, type Scene, type SceneEvent } from "./onboardingScene";
import { projectHue, projectInitial } from "./shellNavigation";
import { tilde } from "./onboardingView";
import { AlertIcon } from "./AlertIcon";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
// Local copies of the draft's marks; sources are in public/provider-logos/README.md. Relative, so the packaged
// file:// renderer resolves them next to index.html.
const LOGOS: Record<Provider, string> = { claude: "claude.png", codex: "codex.png", cursor: "cursor.svg", antigravity: "antigravity.svg", copilot: "copilot.svg" };

// Antigravity has no install page: Doan downloads its sign-in server itself (design 'Install·Update 안내 URL').
function openInstallPage(provider: Provider): Promise<boolean> {
  return provider === "antigravity" ? Promise.resolve(false) : window.doan.openInstallPage(provider);
}
// Kept in the window's sessionStorage, which a renderer reload keeps; failures only cost the reload case.
const OWNED_KEY = "doan.onboarding.ownedSignIns";
function rememberOwned(ids: readonly string[]): void { try { sessionStorage.setItem(OWNED_KEY, JSON.stringify(ids)); } catch { /* reload case only */ } }
function recallOwned(): string[] {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(OWNED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

export function Welcome({ start }: { start: () => void }) {
  return <div className="ob-welcome-main">
    <div className="ob-atmosphere" aria-hidden="true"></div>
    <div className="ob-wordmark">doan</div>
    <h1 tabIndex={-1}>A place for your next idea.<br />Bring it to life on canvas.</h1>
    <div className="ob-welcome-action"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="lg" onClick={start}>Get started<ArrowRight aria-hidden="true" /></button></div>
  </div>;
}

// The AppShell mode capsule as a stepper, drawn with the shared buttons: the current step is the white pill, a done
// step shows a check and goes back.
export function SetupSteps({ scene, canProject, busy, go }: { scene: Scene; canProject: boolean; busy: boolean; go: (to: "agent" | "project") => void }) {
  const project = scene === "project";
  const current = <C extends string>(label: C, n: number) => <button type="button" className="doan-button current" data-ui-size="sm" data-ui-variant="subtle" aria-current="step">{n} <span>{label}</span></button>;
  return <nav className="ob-steps" aria-label="Setup steps">
    {project
      ? <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="ghost" aria-label="Agent, completed" disabled={busy} onClick={() => go("agent")}><span aria-hidden="true">✓</span> <span>Agent</span></button>
      : current("Agent", 1)}
    {project
      ? current("Project", 2)
      : <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="ghost" disabled={!canProject} onClick={() => go("project")}>2 <span>Project</span></button>}
  </nav>;
}

function ActionButton<C extends string>({ button, run, data }: { button: Button<C>; run: (command: C) => void; data?: Record<string, string> }) {
  return <>
    {button.note && <span className="ob-button-note">{button.note}</span>}
    <button type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm" data-command={button.command} aria-label={button.ariaLabel} disabled={button.disabled} {...data} onClick={() => run(button.command)}>{button.label}</button>
  </>;
}

export function NoticeView({ notice, run }: { notice: Notice; run: (command: AuthCommand) => void }) {
  return <>
    <div className={notice.role === "alert" ? "doan-notice error doan-panel" : "doan-notice doan-panel"} role={notice.role} tabIndex={-1}>
      {notice.spinner ? <span className="doan-spinner doan-alert-icon" aria-hidden="true" /> : <AlertIcon />}
      <span>{notice.title && <strong className="ob-notice-title">{notice.title}</strong>}{notice.body && <span className="ob-notice-body">{notice.body}</span>}</span>
    </div>
    {notice.note && <p className="ob-provider-help">{notice.note}</p>}
    {notice.actions.length > 0 && <div className={notice.actions.length === 1 ? "ob-state-actions submit-only" : "ob-state-actions"}>
      {notice.actions.map(button => <ActionButton key={button.command} button={button} run={run} />)}
    </div>}
  </>;
}

export function ProviderRow({ view, run }: { view: ProviderView; run: (command: AuthCommand) => void }) {
  return <div className="ob-provider" data-provider={view.provider}>
    <div className="ob-provider-row">
      <span className="ob-provider-mark" aria-hidden="true"><img src={`provider-logos/${LOGOS[view.provider]}`} alt="" /></span>
      <div className="ob-provider-label"><strong>{view.name}</strong>{view.detail !== null && <span role={view.detailRole ?? undefined}>{view.detail}</span>}</div>
      {view.button && <ActionButton button={view.button} run={run} />}
    </div>
    {view.helper && <p className="ob-provider-help">{view.helper}</p>}
    {view.notice && <NoticeView notice={view.notice} run={run} />}
    {view.paste && <p className="ob-page-help">{view.paste.prompt} <ActionButton button={view.paste.button} run={run} data={{ "data-paste": view.provider }} /></p>}
  </div>;
}

export function AgentFooter({ canContinue, busy, back, next, continueRef }: { canContinue: boolean; busy: boolean; back: () => void; next: () => void; continueRef?: (node: HTMLButtonElement | null) => void }) {
  return <div className="ob-footer">
    <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={back}><ArrowLeft aria-hidden="true" />Back</button>
    <button type="button" className="doan-button" data-ui-variant="prominent" disabled={!canContinue || busy} data-continue="" ref={continueRef} onClick={next}>Continue<ArrowRight aria-hidden="true" /></button>
  </div>;
}

// Escape answers the open child dialog only; the onboarding window behind it stays.
function dialogKeys(close: () => void) {
  return (event: { key: string; nativeEvent: { isComposing: boolean }; preventDefault(): void; stopPropagation(): void }) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (!event.nativeEvent.isComposing) close();
  };
}
const openModal = (node: HTMLDialogElement | null) => { if (node && !node.open) node.showModal(); };

export function PasteDialog({ view, value, submittable, tooLong, busy, change, submit, close }: {
  view: ReturnType<typeof pasteDialog>; value: string; submittable: boolean; tooLong: boolean; busy: boolean; change: (value: string) => void; submit: () => void; close: () => void;
}) {
  return <dialog className="doan-dialog" data-ui-size="compact" aria-labelledby="ob-paste-title" aria-busy={busy || undefined} ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <form className="ob-dialog-form" onSubmit={event => { event.preventDefault(); if (submittable) submit(); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="ob-paste-title">{view.title}</h3><p className="doan-dialog-description">{view.body}</p></div></div>
      <input className="doan-input" aria-label={view.inputLabel} placeholder={view.placeholder} value={value} autoFocus disabled={busy} onChange={event => change(event.target.value)} />
      {tooLong && <p className="ob-field-error" role="alert">This address is too long to submit.</p>}
      <div className="doan-dialog-actions">
        <button type="button" className="doan-button" data-ui-variant={view.cancel.variant} data-ui-size="sm" disabled={busy} onClick={close}>{view.cancel.label}</button>
        <button type="submit" className="doan-button" data-ui-variant={view.submit.variant} data-ui-size="sm" disabled={!submittable}>{view.submit.label}</button>
      </div>
    </form>
  </dialog>;
}

export function StopDialog({ view, busy, confirm, close }: { view: ReturnType<typeof stopDialog>; busy: boolean; confirm: () => void; close: () => void }) {
  return <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="ob-stop-title" aria-describedby="ob-stop-body" ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="ob-stop-title">{view.title}</h3><p className="doan-dialog-description" id="ob-stop-body">{view.body}</p></div></div>
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant={view.cancel.variant} data-ui-size="sm" autoFocus onClick={close}>{view.cancel.label}</button>
      <button type="button" className="doan-button" data-ui-variant={view.confirm.variant} data-ui-size="sm" disabled={busy} onClick={confirm}>{view.confirm.label}</button>
    </div>
  </dialog>;
}

// Where focus goes when the control the user just used is removed or disabled (design '이동·취소·포커스 계약'): the
// row's first usable control in DOM order (row button, notice actions, paste), else its notice, else the step heading.
export function firstUsable(view: ProviderView): AuthCommand | "notice" | null {
  const usable = [view.button, ...(view.notice?.actions ?? []), view.paste?.button].find(button => button && !button.disabled);
  return usable ? usable.command : view.notice ? "notice" : null;
}
interface FocusNode { isConnected: boolean; matches(selector: string): boolean }
// active is null when focus fell to <body>. Focus the user moved elsewhere is theirs and is released.
export function focusLost(active: FocusNode | null, watched: FocusNode): "keep" | "recover" | "release" {
  const usable = watched.isConnected && !watched.matches(":disabled");
  if (active === watched && usable) return "keep";
  if (active === null || active === watched) return "recover";
  return "release";
}

export function AgentStep({ session, heading, back, next }: { session: AgentStepSession; heading: (node: HTMLHeadingElement | null) => void; back: () => void; next: () => void }) {
  const { state } = session;
  const list = session.view();
  const continueButton = useRef<HTMLButtonElement | null>(null);
  // The row whose control the user last used, and the element holding (or last given) its focus.
  const watch = useRef<{ provider: Provider; node: HTMLElement } | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { session.enter(); }, []);
  useEffect(() => {
    const focus = state.focus;
    if (!focus) return;
    requestAnimationFrame(() => {
      if (focus.target === "continue") { continueButton.current?.focus(); return; }
      // The attempt may have ended meanwhile; the step heading is the next stable place.
      const paste = document.querySelector<HTMLElement>(`[data-paste="${focus.provider}"]`);
      (paste && !paste.matches(":disabled") ? paste : title.current)?.focus();
    });
  }, [state.focus?.seq]);
  // After every render (a snapshot, a reply, a closed stop dialog): a watched control that went away or was disabled
  // hands focus on within its row, never to <body>. A dialog keeps its own focus meanwhile.
  useEffect(() => {
    const watched = watch.current;
    if (!watched || state.dialog) return;
    requestAnimationFrame(() => {
      if (watch.current !== watched) return;
      const active = document.activeElement === document.body ? null : document.activeElement;
      const decision = focusLost(active, watched.node);
      if (decision === "release") { watch.current = null; return; }
      if (decision === "keep") return;
      const row = document.querySelector(`.ob-provider[data-provider="${watched.provider}"]`);
      const view = session.view().providers.find(p => p.provider === watched.provider);
      const target = view ? firstUsable(view) : null;
      const node = target === "notice" ? row?.querySelector<HTMLElement>(".doan-notice") : target ? row?.querySelector<HTMLElement>(`[data-command="${target}"]:not(:disabled)`) : null;
      const next = node ?? title.current;
      if (!next) return;
      next.focus();
      watched.node = next;
    });
  });
  const run = (provider: Provider) => (command: AuthCommand) => {
    // The paste modal returns focus itself (its button, else the heading).
    watch.current = command === "pasteAddress" || !(document.activeElement instanceof HTMLElement) ? null : { provider, node: document.activeElement };
    session.command(provider, command);
  };
  const stop = session.stopView(), paste = session.pasteView();
  return <>
    <div className="ob-heading">
      <h2 tabIndex={-1} ref={node => { title.current = node; heading(node); }}>Connect your agent</h2>
      <p>{list.anyReady ? "You’re connected. Add another agent or continue." : "Sign in to at least one agent to continue."}</p>
    </div>
    {list.notice && <div className="ob-list-notice"><NoticeView notice={list.notice} run={command => { if (command === "read") session.retryRead(); }} /></div>}
    {state.installError && <div className="doan-notice error doan-panel ob-list-notice" role="alert"><AlertIcon /><span>{state.installError}</span></div>}
    {list.providers.length > 0 && <div className="doan-panel ob-provider-list">{list.providers.map(view => <ProviderRow key={view.provider} view={view} run={run(view.provider)} />)}</div>}
    <p className="ob-fine">{list.anyReady ? "You can manage your connections later in Settings." : "Your agent account stays on this Mac."}</p>
    <p className="ob-live" role="status">{state.announcement?.text}</p>
    <AgentFooter canContinue={session.canContinue()} busy={state.continuing} back={back} next={next} continueRef={node => { continueButton.current = node; }} />
    {stop && <StopDialog view={stop} busy={false} confirm={() => void session.confirmStop()} close={() => session.closeDialog()} />}
    {paste && state.dialog?.kind === "paste" && <PasteDialog view={paste} value={state.dialog.value} submittable={session.pasteSubmittable()} tooLong={session.pasteTooLong()} busy={state.dialog.submitting}
      change={value => session.setPaste(value)} submit={() => void session.submitPaste()} close={() => session.closeDialog()} />}
  </>;
}

// Leaving the Agent step goes through the session first: forward cancels this window's own sign-ins (Continue and
// the Project pill alike, 2026-10-28 user), and a move whose scene changed while it waited is dropped.
export function sceneMover(agents: Pick<AgentStepSession, "continue" | "back">, move: (event: SceneEvent) => void, generation: () => number) {
  return {
    forward(): void { const at = generation(); void agents.continue().then(advanced => { if (advanced && generation() === at) move({ type: "continue" }); }); },
    back(): void { const at = generation(); void agents.back().then(() => { if (generation() === at) move({ type: "back" }); }); },
  };
}

const nameOf = (path: string) => path.replace(/\/+$/, "").split("/").at(-1) || path;
const shown = (path: string, home: string | null) => home ? tilde(path, home) : path;

// The sidebar's thumbnail rule (projectHue, first code point) at the onboarding card size.
export function ProjectThumbnail({ path }: { path: string }) {
  const name = nameOf(path);
  return <span className={`shell-thumbnail onboarding-thumbnail hue-${projectHue(name)}`} aria-hidden="true">{projectInitial(name)}</span>;
}
export function ChosenProject({ path, home }: { path: string; home: string | null }) {
  return <div className="doan-panel ob-chosen"><ProjectThumbnail path={path} /><div><strong>{nameOf(path)}</strong><p className="ob-path">{shown(path, home)}</p></div><Check aria-hidden="true" /></div>;
}
function ProjectChoice({ paths, choice, home, pick, name }: { paths: readonly string[]; choice: string | null; home: string | null; pick: (path: string) => void; name: string }) {
  return <div role="radiogroup" aria-label={name}>{paths.map(path => <label className="ob-choice" key={path}>
    <input type="radio" name={name} checked={choice === path} onChange={() => pick(path)} /><ProjectThumbnail path={path} />
    <span><strong>{nameOf(path)}</strong><small>{shown(path, home)}</small></span>
  </label>)}</div>;
}

type ProjectAction = "chooseFolder" | "retry" | "changeLocation" | "useExisting" | "backToAgents";
interface ProjectNotice { title?: string; body: string; detail?: string; note?: string; actions: Button<ProjectAction>[] }
const action = (command: ProjectAction, label: string, variant: Button["variant"] = "prominent"): Button<ProjectAction> => ({ command, label, variant, disabled: false });
// Copy from the approved draft's Project states tiles; D13 for the newer marker version.
export function projectNotice(error: ProjectError, message: string | undefined, destination: string | null): ProjectNotice {
  switch (error) {
    case "invalid_url": return { body: "Enter a GitHub repository URL, such as https://github.com/owner/repository.", actions: [] };
    case "access_failed": return { title: "Couldn’t access this repository", body: "Check your account and repository access with gh auth login, then try again.", actions: [] };
    case "remote_mismatch": return { body: "This folder belongs to a different repository.", actions: [action("chooseFolder", "Choose another folder")] };
    case "project_unavailable": case "path_unavailable":
      return { body: "This folder is no longer available. Choose it again or select another folder.", actions: [action("chooseFolder", "Choose folder")] };
    case "destination_exists": return { body: "A folder already exists at this destination. Choose another location or use the existing folder.", actions: [action("changeLocation", "Change location", "subtle"), action("useExisting", "Use existing folder")] };
    case "init_failed": return { body: "Couldn’t set up this folder. Check folder access and try again.", actions: [action("chooseFolder", "Choose another folder", "subtle"), action("retry", "Retry")] };
    case "config_invalid": return { body: "This folder’s doan configuration couldn’t be read. Fix it and retry, or choose another folder.", actions: [action("chooseFolder", "Choose another folder", "subtle"), action("retry", "Retry")] };
    case "clone_failed": return { body: "Couldn’t clone this repository. Check your connection and folder access, then retry.", ...(destination ? { detail: destination } : {}), actions: [action("changeLocation", "Change location", "subtle"), action("retry", "Retry")] };
    case "git_missing": return { body: "Install Git to clone a repository, or choose a local folder.", actions: [action("chooseFolder", "Choose local folder", "subtle"), action("retry", "Check again")] };
    case "completion_save_failed": return { body: "Your project is ready, but setup completion couldn’t be saved. Retry to finish.", actions: [] };
    case "completion_unsupported_version": return { title: "Setup was saved by a newer version of Doan", body: "Open this project with that version, or update Doan.", actions: [] };
    case "no_ready_agent": { const notice = noAgentReadyNotice(null)!; return { body: notice.body!, ...(notice.note ? { note: notice.note } : {}), actions: [action("chooseFolder", "Choose another folder", "subtle"), action("backToAgents", "Back to agents")] }; }
    // Main's fixed message (a kept clone folder names the path to remove); never tool output.
    default: return { body: message ?? "Something changed while doan was checking. Try again.", actions: [action("retry", "Retry")] };
  }
}

function ProjectNoticeView({ notice, run, id }: { notice: ProjectNotice; run: (command: ProjectAction) => void; id?: string }) {
  return <>
    <div className="doan-notice error doan-panel ob-project-notice" role="alert" tabIndex={-1} id={id}><AlertIcon />
      <span>{notice.title ? <><strong className="ob-notice-title">{notice.title}</strong><span className="ob-notice-body">{notice.body}</span></> : notice.body}</span></div>
    {notice.detail && <p className="ob-path ob-notice-detail">{notice.detail}</p>}
    {notice.note && <p className="ob-provider-help">{notice.note}</p>}
    {notice.actions.length > 0 && <div className={notice.actions.length === 1 ? "ob-state-actions submit-only" : "ob-state-actions"}>
      {notice.actions.map(button => <button key={button.command} type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm" onClick={() => run(button.command)}>{button.label}</button>)}
    </div>}
  </>;
}
function Progress({ title, body }: { title: string; body?: string }) {
  return <div className="doan-notice doan-panel ob-project-notice" role="status"><span className="doan-spinner doan-alert-icon" aria-hidden="true" /><span><strong className="ob-notice-title">{title}</strong>{body && <span className="ob-notice-body">{body}</span>}</span></div>;
}
function Footer({ back, next, label, enabled, busy }: { back: () => void; next: () => void; label: string; enabled: boolean; busy: boolean }) {
  return <div className="ob-footer">
    <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={back}><ArrowLeft aria-hidden="true" />Back</button>
    <button type="button" className="doan-button" data-ui-variant="prominent" disabled={!enabled || busy} onClick={next}>{label}<ArrowRight aria-hidden="true" /></button>
  </div>;
}

const HEADINGS = {
  choose: ["Choose your project", "Start with a folder on your Mac, or a GitHub repository."],
  found: ["Already on your Mac", "This GitHub repository matches a local project."],
  clone: ["Clone repository", "Bring this project onto your Mac."],
  ready: ["Your project is ready", "Start creating with the tools and code you already have."],
} as const;

export interface ProjectScreenProps {
  state: ProjectStepState; busy: boolean; agentReady: boolean; projects: readonly string[]; home: string | null; urlValid: boolean;
  heading: (node: HTMLHeadingElement | null) => void;
  on: {
    back(): void; backToAgents(): void; chooseFolder(): void; setUrl(url: string): void; find(): void; cancelInspect(): void; edit(): void;
    pickListed(path: string): void; useListed(): void; pickCandidate(path: string): void; select(initialize?: boolean): void;
    changeDestination(): void; useExisting(): void; clone(): void; cancelClone(): void; complete(): void; retry(): void;
  };
}
// One screen per phase (draft frames project, project-local, repository-found, repository-clone, repository-error and
// the Project states tiles). Errors sit above the footer; the footer's Back always returns to the Agent step.
export function ProjectScreen({ state, busy, agentReady, projects, home, urlValid, heading, on }: ProjectScreenProps) {
  const p = state.phase, error = state.error;
  const destination = p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" ? p.destination : null;
  const run = (command: ProjectAction) => {
    if (command === "chooseFolder") on.chooseFolder(); else if (command === "retry") on.retry(); else if (command === "changeLocation") on.changeDestination();
    else if (command === "useExisting") on.useExisting(); else on.backToAgents();
  };
  // The Project states 'No agent is ready' tile: shown as soon as no provider is ready, not only after a refused save.
  const notice = error ? projectNotice(error.code, error.message, destination) : !agentReady && (p.kind === "ready") ? projectNotice("no_ready_agent", undefined, null) : null;
  const [title, lead] = p.kind === "ready" || p.kind === "completing" ? HEADINGS.ready
    : p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" ? HEADINGS.clone
    : p.kind === "candidates" && p.url !== null ? HEADINGS.found : HEADINGS.choose;
  const urlField = (readOnly: boolean) => <>
    <label className="ob-field-label" htmlFor="ob-project-url">Repository URL</label>
    <input className="doan-input" id="ob-project-url" aria-label="GitHub repository URL" placeholder="https://github.com/owner/repository" value={state.url} readOnly={readOnly}
      aria-invalid={error?.code === "invalid_url" || undefined} aria-describedby={error && (error.code === "invalid_url" || error.code === "access_failed") ? "ob-project-error" : undefined}
      onChange={event => on.setUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !readOnly && !event.nativeEvent.isComposing) on.find(); }} />
  </>;
  const smallActions = (...buttons: [string, () => void][]) => <div className="ob-small-action">{buttons.map(([label, click]) =>
    <button key={label} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy} onClick={click}>{label}</button>)}</div>;
  let body: React.ReactNode, footer: { label: string; next: () => void; enabled: boolean } = { label: "Open doan", next: on.complete, enabled: false };

  if (p.kind === "choose" || p.kind === "inspecting") {
    const urlNotice = error && (error.code === "invalid_url" || error.code === "access_failed");
    const changed = state.inspectedUrl !== null && state.url.trim() !== state.inspectedUrl && !error;
    body = <>
      {/* An unreachable repository keeps the screen to the URL and its recovery (draft frame 'repository-error'). */}
      {error?.code !== "access_failed" && <>
      {projects.length > 0 && <div className="ob-projects">
        <div className="ob-field-label">Your projects</div>
        <ProjectChoice paths={projects} choice={state.listChoice} home={home} pick={on.pickListed} name="Your projects" />
        <div className="ob-state-actions submit-only"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={busy || state.listChoice === null} onClick={on.useListed}>Use this folder</button></div>
      </div>}
      <div className="doan-panel ob-local-option">
        <span className="ob-folder-icon"><Folder aria-hidden="true" /></span>
        <div><strong>Open a local folder</strong><p>Use a project that’s already on your Mac.</p></div>
        <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={on.chooseFolder}>Choose folder</button>
      </div>
      <div className="ob-divider"><span>or use GitHub</span></div>
      </>}
      {urlField(p.kind === "inspecting")}
      {p.kind === "inspecting" ? <>
        <Progress title="Checking repository" body={p.url} />
        <div className="ob-state-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={on.cancelInspect}>Cancel</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled>Find repository</button></div>
      </> : urlNotice ? <>
        <ProjectNoticeView notice={notice!} run={run} id="ob-project-error" />
        {error.code === "access_failed"
          ? <div className="ob-recovery">
            <button type="button" className="doan-button" data-ui-variant="subtle" onClick={on.chooseFolder}>Choose local folder</button>
            <button type="button" className="doan-button" data-ui-variant="prominent" onClick={on.retry}>Retry</button>
          </div>
          : <div className="ob-state-actions">
            <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={on.chooseFolder}>Choose local folder</button>
            <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={!urlValid} onClick={on.find}>Find repository</button>
          </div>}
      </> : changed ? <>
        <p className="ob-provider-help">Check this URL before choosing a local folder or cloning.</p>
        <div className="ob-state-actions">
          <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy} onClick={on.chooseFolder}>Choose local folder</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={busy || state.url.trim() === ""} onClick={on.find}>Find repository</button>
        </div>
      </> : <>
        {notice && <ProjectNoticeView notice={notice} run={run} />}
        <div className="ob-url-action"><button type="button" className="doan-button" data-ui-variant="prominent" disabled={busy || state.url.trim() === ""} onClick={on.find}>Find repository<ArrowRight aria-hidden="true" /></button></div>
      </>}
    </>;
  } else if (p.kind === "candidates") {
    const one = p.candidates.length === 1 ? p.candidates[0]! : null;
    body = <>
      {p.url !== null && urlField(true)}
      {one ? <ChosenProject path={one.path} home={home} /> : <>
        {p.url !== null && <p className="ob-provider-help">Choose a local folder for this repository.</p>}
        <ProjectChoice paths={p.candidates.map(c => c.path)} choice={p.choice} home={home} pick={on.pickCandidate} name="Local checkouts" />
      </>}
      {notice && <ProjectNoticeView notice={notice} run={run} />}
      {p.url !== null && <p className="ob-fine">Use your existing files and current branch.</p>}
      {p.url !== null ? smallActions(["Choose another folder", on.chooseFolder], ["Edit repository URL", on.edit]) : smallActions(["Choose another folder", on.chooseFolder])}
    </>;
    footer = { label: "Use this folder", next: () => on.select(), enabled: true };
  } else if (p.kind === "setup" || p.kind === "selecting") {
    body = <>
      {p.kind === "setup" && <section className="doan-panel ob-setup">
        <strong>Set up this folder for doan</strong>
        <p>Doan will add its project configuration and a design folder. Existing files stay in place.</p>
        <ChosenProject path={p.path} home={home} />
        {notice ? <ProjectNoticeView notice={notice} run={run} />
          : <div className="ob-state-actions submit-only"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={busy} onClick={() => on.select(true)}>Set up and continue</button></div>}
      </section>}
      {p.kind === "selecting" && <Progress title="Setting up your project" body={shown(p.path, home)} />}
    </>;
  } else if (p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled") {
    body = <>
      {urlField(true)}
      <div className="ob-field-label ob-spaced">Save to</div>
      <div className="doan-panel ob-destination"><ProjectThumbnail path={p.destination} />
        <div className="ob-destination-name"><strong>{nameOf(p.destination)}</strong><p className="ob-path">{shown(p.destination, home)}</p></div>
        <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy} onClick={on.changeDestination}>Change</button></div>
      {p.kind === "cloning" ? <>
        {p.cancelling ? <Progress title="Stopping clone and cleaning up" body="Wait before starting another clone." /> : <Progress title={`Cloning ${nameOf(p.destination)}`} body={shown(p.destination, home)} />}
        <div className={p.cancelling ? "ob-state-actions" : "ob-state-actions"}>
          {p.cancelling ? <><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled>Choose local folder</button>
            <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled>Retry</button></>
            : <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={on.cancelClone}>Cancel</button>}
        </div>
      </> : p.kind === "cloneCancelled" ? <>
        <p className="ob-provider-help">Cloning was cancelled. Choose a folder or try again.</p>
        <div className="ob-state-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={on.chooseFolder}>Choose local folder</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={on.retry}>Retry</button></div>
      </> : <>
        {notice && <ProjectNoticeView notice={notice} run={run} />}
        <p className="ob-fine">Already have this repository?</p>
        {smallActions(["Choose existing folder", on.chooseFolder], ["Edit repository URL", on.edit])}
      </>}
    </>;
    footer = { label: "Clone and continue", next: on.clone, enabled: p.kind === "clone" && p.inspectionId !== null && !error };
  } else {
    const root = p.root;
    const saveFailed = error?.code === "completion_save_failed";
    body = <>
      <ChosenProject path={root} home={home} />
      {p.kind === "completing" ? <Progress title="Saving your setup" body="Your project is ready. Finishing setup before opening Home." /> : notice && <ProjectNoticeView notice={notice} run={run} />}
      {smallActions(["Choose another folder", on.chooseFolder])}
      <p className="ob-fine">Your selected project will be ready on Home.</p>
    </>;
    footer = saveFailed ? { label: "Retry", next: on.retry, enabled: true }
      : { label: "Open doan", next: on.complete, enabled: agentReady && error?.code !== "completion_unsupported_version" };
  }
  return <>
    <div className="ob-heading"><h2 tabIndex={-1} ref={heading}>{title}</h2><p>{lead}</p></div>
    {body}
    <Footer back={on.back} next={footer.next} label={footer.label} enabled={footer.enabled} busy={busy} />
  </>;
}

// The full-window first run: Welcome → Agent → Project → Home, mounted once per main onboarding session. A CLI or MCP
// client may drive the same session; its completion closes this window too.
export function Wizard({ session, projects, homeDirectory, onClose }: { session: string; projects: readonly string[]; homeDirectory: string | null; onClose: (root: string | null) => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [agents] = useState(() => new AgentStepSession({ api: window.doan, openInstall: openInstallPage, hasFocus: () => document.hasFocus(), changed: redraw, remember: rememberOwned, recall: recallOwned }));
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const homeRef = useRef(homeDirectory);
  homeRef.current = homeDirectory;
  const closed = useRef(false);
  const finish = (root: string | null) => { if (closed.current) return; closed.current = true; onClose(root); };
  const [project] = useState(() => new ProjectStepSession({
    api: window.doan, sessionId: session, projects: () => projectsRef.current, homeDirectory: () => homeRef.current,
    requestId: () => crypto.randomUUID(), changed: redraw, completed: root => finish(root),
  }));
  const [scene, setScene] = useState(() => initialScene(false));
  const heading = useRef<HTMLElement | null>(null);
  const auth = agents.state.auth ?? null;
  const busy = project.busy();

  useEffect(() => {
    agents.start();
    project.start();
    const focused = () => agents.windowFocused();
    window.addEventListener("focus", focused);
    // Completion saved by a CLI or MCP client of this session: Home takes over here too.
    const stop = window.doan.onOnboardingSession((state: OnboardingState) => { if (state.sessionId === session && state.completed) finish(state.project?.root ?? null); });
    return () => { window.removeEventListener("focus", focused); stop(); agents.dispose(); project.dispose(); };
  }, []);
  // A scene change moves focus to its heading; Tab then enters the controls (design '이동·취소·포커스 계약').
  useEffect(() => { requestAnimationFrame(() => heading.current?.focus()); }, [scene.generation]);
  // Guarded with the session's auth at the time of the move, not of the click: a cancel wait can outlive a ready provider.
  const move = (event: SceneEvent) => setScene(current => nextScene(current, event, { auth: agents.state.auth ?? null, busy: project.busy() }));
  const generation = useRef(0);
  generation.current = scene.generation;
  const leave = sceneMover(agents, move, () => generation.current);

  // A stacked modal (the stop or paste dialog) answers its own keys.
  const stacked = useRef(false);
  stacked.current = agents.state.dialog !== null;
  const overlay = useRef<HTMLDialogElement | null>(null);
  // On the window, in capture: a button that turns disabled while it runs drops
  // focus to <body>, and keys from there must still reach the onboarding window. Capture
  // also runs before the canvas's own Escape (selection clear) listener.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("dialog") !== null && event.target.closest("dialog") !== overlay.current) return;
      // Top-level Escape neither closes onboarding nor skips a required step; nor may it reach the app behind.
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return; }
      if (stacked.current) return;
      if (event.key === "Tab" && overlay.current) {
        const nodes = Array.from(overlay.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(node => node.closest("dialog") === overlay.current);
        const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement as HTMLElement), event.shiftKey);
        if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, []);

  const welcome = scene.scene === "welcome";
  const setHeading = (node: HTMLElement | null) => { heading.current = node; };
  const p = project;
  // A modal <dialog> sits above any app dialog already open (setup, comments),
  // which would otherwise stay on top and leave both unclickable.
  return <dialog className={welcome ? "ob-overlay ob-welcome" : "ob-overlay"} aria-label="Set up doan"
    ref={node => { overlay.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => event.preventDefault()}>
    <div className="ob-chrome">
      {!welcome && <SetupSteps scene={scene.scene} canProject={canAdvance(auth)} busy={busy} go={to => { if (to === "project") leave.forward(); else move({ type: "step", to }); }} />}
    </div>
    <div className="ob-scene native-scroll">
      {welcome && <div className="ob-welcome-scene" ref={node => setHeading(node?.querySelector("h1") ?? null)}><Welcome start={() => move({ type: "start" })} /></div>}
      {scene.scene === "agent" && <AgentStep session={agents} heading={setHeading}
        back={leave.back} next={leave.forward} />}
      {scene.scene === "project" && <ProjectScreen state={p.state} busy={busy} agentReady={canAdvance(auth)} projects={projects} home={homeDirectory} urlValid={p.urlValid()} heading={setHeading} on={{
        back: () => move({ type: "back" }), backToAgents: () => move({ type: "step", to: "agent" }),
        chooseFolder: () => void p.chooseFolder(), setUrl: url => p.setUrl(url), find: () => void p.findRepository(), cancelInspect: () => p.cancelInspect(), edit: () => p.restart(),
        pickListed: path => p.pickListed(path), useListed: () => void p.useListed(), pickCandidate: path => p.pickCandidate(path), select: initialize => void p.select(initialize),
        changeDestination: () => void p.changeDestination(), useExisting: () => void p.useExisting(), clone: () => void p.clone(), cancelClone: () => void p.cancelClone(),
        complete: () => void p.complete(), retry: () => void p.retry(),
      }} />}
    </div>
  </dialog>;
}
