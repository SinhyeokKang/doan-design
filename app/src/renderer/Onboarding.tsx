import { useEffect, useReducer, useRef, useState, type DragEvent, type RefObject } from "react";
import { ArrowLeft, ArrowRight, Check, Folder } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { OnboardingState } from "../formats/types";
import { nextFocusIndex } from "./onboardingView";
import { noAgentReadyNotice, type AuthCommand, type Button, type Notice, type ProviderView, type pasteDialog, type stopDialog } from "./agentAuthView";
import { AgentStepSession } from "./agentStep";
import { agentSignIn } from "./agentSignIn";
import { projectFooter, projectNoticeCode, ProjectStepSession, setUpLabel, type ProjectError, type ProjectStepState, type ProjectUse } from "./projectStep";
import { canAdvance, initialScene, nextScene, type Scene, type SceneEvent } from "./onboardingScene";
import { projectHue, projectInitial } from "./shellNavigation";
import { tilde } from "./onboardingView";
import { AlertIcon } from "./AlertIcon";
import { Doany } from "./Doany";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
// Local copies of the draft's marks; sources are in public/provider-logos/README.md. Relative, so the packaged
// file:// renderer resolves them next to index.html.
const LOGOS: Record<Provider, string> = { claude: "claude.png", codex: "codex.png", cursor: "cursor.svg", antigravity: "antigravity.svg", copilot: "copilot.svg" };

// Antigravity has no install page: Doan downloads its sign-in server itself (design 'Install·Update 안내 URL').
function openInstallPage(provider: Provider): Promise<boolean> {
  return provider === "antigravity" ? Promise.resolve(false) : window.doan.openInstallPage(provider);
}

export function Welcome({ start }: { start: () => void }) {
  return <div className="ob-welcome-main">
    <div className="ob-atmosphere" aria-hidden="true"></div>
    <Doany size={142.5} />
    <div className="ob-wordmark">Doan</div>
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
      <button type="button" className="doan-button" data-ui-variant={view.confirm.variant} data-ui-size="sm" disabled={busy} data-consent="" onClick={confirm}>{view.confirm.label}</button>
    </div>
  </dialog>;
}

// Where focus goes when the control the user just used is removed or disabled (design '이동·취소·포커스 계약'): the
// row's first usable control in DOM order (row button, notice actions, paste), else its notice, else the step heading.
// Sign out acts at once, so recovery never lands on it (D24).
export function firstUsable(view: ProviderView): AuthCommand | "notice" | null {
  const usable = [view.button, ...(view.notice?.actions ?? []), view.paste?.button].find(button => button && !button.disabled && button.command !== "signOut");
  return usable ? usable.command : view.notice ? "notice" : null;
}
interface FocusNode { isConnected: boolean; matches(selector: string): boolean }
// D24: automatic focus never lands on a button that writes or consents (data-consent); the caller falls back to the
// heading. The user's own Tab still reaches it.
export function recoveryControl<T extends Pick<FocusNode, "matches">>(first: T | null): T | null { return first && !first.matches("[data-consent]") ? first : null; }
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
// D23 (2026-10-29 user): each choice is a card like the chosen project, the selected one with its check. A native
// radio keeps arrow keys and Space; Enter picks too.
export function ProjectChoice({ paths, choice, home, pick, name }: {
  paths: readonly string[]; choice: string | null; home: string | null; pick: (path: string) => void; name: string;
}) {
  return <div role="radiogroup" aria-label={name} className="ob-choice-list">{paths.map(path => <label className="doan-panel ob-choice" key={path}>
    <input type="radio" name={name} checked={choice === path} onChange={() => pick(path)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); pick(path); } }} />
    <ProjectThumbnail path={path} />
    <span className="ob-choice-text"><strong>{nameOf(path)}</strong><small>{shown(path, home)}</small></span>
    {choice === path && <Check aria-hidden="true" />}
  </label>)}</div>;
}

type ProjectAction = "chooseFolder" | "chooseExisting" | "edit" | "retry" | "changeLocation" | "useExisting" | "backToAgents";
interface ProjectNotice { title?: string; body: string; detail?: string; note?: string; actions: Button<ProjectAction>[] }
const action = (command: ProjectAction, label: string, variant: Button["variant"] = "prominent"): Button<ProjectAction> => ({ command, label, variant, disabled: false });
// Copy from the approved draft's Project states tiles; D13 for the newer marker version.
// fromUrl: the screen belongs to a GitHub URL, so a folder chosen there must be that repository's (D20).
// insideProject: the name of the doan project a clone destination sits in (main refuses it as path_unavailable).
// folder: the chosen folder a mismatch is about; on the clone screen "This folder" would read as the destination (D28).
export function projectNotice(error: ProjectError, message: string | undefined, destination: string | null, fromUrl = false, insideProject: string | null = null, folder: string | null = null): ProjectNotice {
  // Every folder chosen from a URL screen is checked against that repository (D21).
  const choose: ProjectAction = fromUrl ? "chooseExisting" : "chooseFolder";
  switch (error) {
    case "invalid_url": return { body: "Enter a GitHub repository URL, such as https://github.com/owner/repository.", actions: [] };
    case "access_failed": return { title: "Couldn’t access this repository", body: "Check your account and repository access with gh auth login, then try again.", actions: [] };
    case "remote_mismatch": return { body: `${folder !== null ? nameOf(folder) : "This folder"} belongs to a different repository.`, actions: fromUrl
      ? [action("edit", "Edit repository URL", "subtle"), action("chooseExisting", "Choose another folder")] : [action("chooseFolder", "Choose another folder")] };
    case "project_unavailable": case "path_unavailable":
      // D26 copy: the destination never existed, so "no longer available" would not explain it.
      if (insideProject !== null) return { body: `This location is inside the Doan project ${insideProject}. Choose a location outside it.`, actions: [action("changeLocation", "Change location")] };
      return { body: "This folder is no longer available. Choose it again or select another folder.", actions: [action(choose, "Choose folder")] };
    case "destination_exists": return { body: "A folder already exists at this destination. Choose another location or use the existing folder.", actions: [action("changeLocation", "Change location", "subtle"), action("useExisting", "Use existing folder")] };
    case "init_failed": return { body: "Couldn’t set up this folder. Check folder access and try again.", actions: [action(choose, "Choose another folder", "subtle"), action("retry", "Retry")] };
    case "config_invalid": return { body: "This folder’s Doan configuration couldn’t be read. Fix it and retry, or choose another folder.", actions: [action(choose, "Choose another folder", "subtle"), action("retry", "Retry")] };
    case "clone_failed": return { body: "Couldn’t clone this repository. Check your connection and folder access, then retry.", ...(destination ? { detail: destination } : {}), actions: [action("changeLocation", "Change location", "subtle"), action("retry", "Retry")] };
    case "git_missing": return { body: "Install Git to clone a repository, or choose a local folder.", actions: [action(choose, "Choose local folder", "subtle"), action("retry", "Check again")] };
    case "completion_save_failed": return { body: "Your project is ready, but setup completion couldn’t be saved. Retry to finish.", actions: [] };
    case "completion_unsupported_version": return { title: "Setup was saved by a newer version of Doan", body: "Open this project with that version, or update Doan.", actions: [] };
    case "no_ready_agent": { const notice = noAgentReadyNotice(null)!; return { body: notice.body!, ...(notice.note ? { note: notice.note } : {}), actions: [action("backToAgents", "Back to agents")] }; }
    // Main's fixed message (a kept clone folder names the path to remove); never tool output.
    default: return { body: message ?? "Something changed while Doan was checking. Try again.", actions: [action("retry", "Retry")] };
  }
}

function ProjectNoticeView({ notice, run, id }: { notice: ProjectNotice; run: (command: ProjectAction) => void; id?: string }) {
  return <>
    <div className="doan-notice error doan-panel ob-project-notice" role="alert" tabIndex={-1} id={id}><AlertIcon />
      <span>{notice.title ? <><strong className="ob-notice-title">{notice.title}</strong><span className="ob-notice-body">{notice.body}</span></> : notice.body}</span></div>
    {notice.detail && <p className="ob-path ob-notice-detail">{notice.detail}</p>}
    {notice.note && <p className="ob-provider-help">{notice.note}</p>}
    {notice.actions.length > 0 && <div className={notice.actions.length === 1 ? "ob-state-actions submit-only" : "ob-state-actions"}>
      {notice.actions.map(button => <button key={button.command} type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm" data-consent={button.command === "retry" ? "" : undefined} onClick={() => run(button.command)}>{button.label}</button>)}
    </div>}
  </>;
}
function Progress({ title, body }: { title: string; body?: string }) {
  return <div className="doan-notice doan-panel ob-project-notice" role="status" tabIndex={-1}><span className="doan-spinner doan-alert-icon" aria-hidden="true" /><span><strong className="ob-notice-title">{title}</strong>{body && <span className="ob-notice-body">{body}</span>}</span></div>;
}
// First run's Back carries its arrow; the page's Cancel leaves the page and has none (draft footers).
function Footer({ use, footer, back, next }: { use: ProjectUse; footer: NonNullable<ReturnType<typeof projectFooter>>; back: () => void; next: () => void }) {
  return <div className={use === "addPage" ? "ob-footer add-footer" : "ob-footer"}>
    <button type="button" className="doan-button" data-ui-variant="subtle" disabled={footer.back.disabled} onClick={back}>{use === "onboarding" && <ArrowLeft aria-hidden="true" />}{footer.back.label}</button>
    {footer.primary && <button type="button" className="doan-button" data-ui-variant="prominent" disabled={footer.primary.disabled} data-consent="" onClick={next}>{footer.primary.label}<ArrowRight aria-hidden="true" /></button>}
  </div>;
}

export interface ProjectDrop {
  notice: string | null;
  allowed(): boolean;
  // A new drag clears the last notice.
  started(): void;
  dropped(items: { isDirectory: boolean; path: string }[]): void;
}
// The 'Open a local folder' card takes a dropped folder on the page and in first run (buzz-add-projects design '폴더
// 드롭'). A drop elsewhere is the window's, which only refuses it.
export function LocalFolderCard({ busy, choose, drop }: { busy: boolean; choose: () => void; drop?: ProjectDrop }) {
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  // A drop outside the card or a window that loses focus ends the drag without a leave on the card.
  useEffect(() => {
    const clear = () => { depth.current = 0; setDropping(false); };
    window.addEventListener("blur", clear);
    window.addEventListener("drop", clear);
    return () => { window.removeEventListener("blur", clear); window.removeEventListener("drop", clear); };
  }, []);
  const files = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const handlers = drop && {
    onDragEnter: (event: DragEvent) => {
      if (!files(event)) return;
      event.preventDefault();
      if (depth.current++ === 0) drop.started();
      setDropping(drop.allowed());
    },
    onDragOver: (event: DragEvent) => {
      if (!files(event)) return;
      event.preventDefault();
      const allowed = drop.allowed();
      event.dataTransfer.dropEffect = allowed ? "copy" : "none";
      if (!allowed) setDropping(false);
    },
    onDragLeave: (event: DragEvent) => { if (files(event) && --depth.current <= 0) { depth.current = 0; setDropping(false); } },
    onDrop: (event: DragEvent) => {
      if (!files(event)) return;
      event.preventDefault();
      depth.current = 0; setDropping(false);
      if (!drop.allowed()) return;
      // String items can sit among the files; only file items line up with `files`.
      const items = Array.from(event.dataTransfer.items ?? []).filter(item => item.kind === "file");
      drop.dropped(Array.from(event.dataTransfer.files).map((file, i) => ({ isDirectory: !!items[i]?.webkitGetAsEntry?.()?.isDirectory, path: window.doan.droppedPath(file) ?? "" })));
    },
  };
  return <div className="doan-panel ob-local-option" {...handlers}>
    {dropping && <div className="drop-target"><span className="sr-only" role="status">Drop to add this folder</span></div>}
    <span className="ob-folder-icon"><Folder aria-hidden="true" /></span>
    <div><strong>Open a local folder</strong><p>Use a project that’s already on your Mac.</p></div>
    <button type="button" className="doan-button" data-ui-variant="subtle" disabled={busy} onClick={choose}>Choose folder</button>
  </div>;
}

// Where the Project step puts focus that its own change removed or disabled (design '이동·취소·포커스 계약'): the error,
// else the progress, else the first usable action. Focus the user still holds is never moved.
// urlRequested: the user just chose Edit repository URL (or left a clone for its URL), so the field is where they go.
export function projectFocusTarget(state: ProjectStepState, agentReady: boolean, urlRequested = false): "url" | "alert" | "status" | "action" {
  if (urlRequested && state.phase.kind === "choose") return "url";
  if (state.error || (!agentReady && state.phase.kind === "ready")) return "alert";
  return ["inspecting", "checking", "selecting", "cloning", "completing"].includes(state.phase.kind) ? "status" : "action";
}

type FocusTarget = FocusNode & { focus(): void };
interface ScopeNode { querySelector(selector: string): FocusTarget | null }
// The node the Project step's focus goes to after a change (design '포커스'): the button that opened a folder sheet
// that closed on the same screen, the URL field when it was asked for, else projectFocusTarget's, else the heading.
// null: the person holds focus somewhere usable, which is never moved.
export function projectFocusNode(input: {
  opened: { node: FocusTarget; phase: string } | null; asked: boolean; root: ScopeNode | null; active: FocusTarget | null; body: unknown;
  heading: FocusTarget | null; state: ProjectStepState; agentReady: boolean; busy: boolean;
}): FocusTarget | null {
  const { opened, root, active, state } = input;
  if (opened && !input.busy && opened.phase === state.phase.kind && opened.node.isConnected && !opened.node.matches(":disabled")) return opened.node;
  if (input.asked && projectFocusTarget(state, true, true) === "url") return root?.querySelector("#ob-project-url") ?? null;
  if (!root || (active && active !== input.body && active.isConnected && !active.matches(":disabled"))) return null;
  const target = projectFocusTarget(state, input.agentReady);
  const node = target === "action" ? recoveryControl(root.querySelector(".ob-scene button:not(:disabled), .ob-scene input:not(:disabled)"))
    // A drop notice tells what a drop did and never takes focus, so the error after it is the one announced.
    : root.querySelector(`.ob-scene .ob-project-notice[role="${target}"]:not(.ob-drop-notice)`);
  return node ?? input.heading;
}
// Within the Project step, a phase change that took the focused control away hands focus on, never to <body>; first
// run and the page share it. `scope` holds the step's .ob-scene.
export function useProjectFocus(session: ProjectStepSession, scope: RefObject<ScopeNode | null>, heading: RefObject<FocusTarget | null>, agentReady: () => boolean, active: boolean) {
  const phase = `${session.state.phase.kind}:${session.state.error?.code ?? ""}:${session.busy()}:${session.picking()}`;
  // The button that opened a folder sheet gets focus back when the sheet closes and the screen did not change.
  const picker = useRef<{ node: FocusTarget; phase: string } | null>(null);
  // Edit repository URL (and Back from a cancelled or failed clone) lead to the URL field.
  const urlRequested = useRef(false);
  useEffect(() => {
    if (!active || session.picking()) return;
    requestAnimationFrame(() => {
      const opened = picker.current;
      if (opened && !session.busy()) picker.current = null;
      const asked = urlRequested.current;
      urlRequested.current = false;
      const active = document.activeElement;
      projectFocusNode({ opened, asked, root: scope.current, active: active instanceof HTMLElement ? active : null, body: document.body, heading: heading.current,
        state: session.state, agentReady: agentReady(), busy: session.busy() })?.focus();
    });
  }, [phase]);
  return {
    toUrl: () => { urlRequested.current = true; session.restart(); },
    openPicker: (open: () => void) => {
      const node = document.activeElement;
      picker.current = node instanceof HTMLElement ? { node, phase: session.state.phase.kind } : null;
      open();
    },
  };
}

const HEADINGS = {
  choose: ["Choose your project", "Start with a folder on your Mac, or a GitHub repository."],
  add: ["Add a project", "Start with a folder on your Mac, or a GitHub repository."],
  found: ["Already on your Mac", "This GitHub repository matches a local project."],
  clone: ["Clone repository", "Bring this project onto your Mac."],
  ready: ["Your project is ready", "Start creating with the tools and code you already have."],
} as const;

export interface ProjectScreenProps {
  state: ProjectStepState; busy: boolean; agentReady: boolean; projects: readonly string[]; home: string | null; urlValid: boolean;
  heading: (node: HTMLHeadingElement | null) => void;
  // First run by default; the Add Projects page differs only by design '온보딩과의 공유'.
  use?: ProjectUse;
  // The heading's id, when a landmark is named by it (the page's panel).
  headingId?: string;
  drop?: ProjectDrop;
  on: {
    back(): void; backToAgents(): void; chooseFolder(): void; chooseExisting(): void; setUrl(url: string): void; find(): void; cancelInspect(): void; edit(): void;
    pickListed(path: string): void; useListed(): void; pickCandidate(path: string): void; select(): void; setUp(inspectionId: string): void;
    changeDestination(): void; useExisting(): void; clone(): void; cancelClone(): void; complete(): void; retry(): void;
  };
}
// One screen per phase (draft frames project, project-local, repository-found, repository-clone, repository-error and
// the Project states tiles). Errors sit above the footer; first run's Back returns to the Agent step, the page's Cancel
// to the screen it was opened from.
export function ProjectScreen({ state, busy, agentReady, projects, home, urlValid, heading, on, use = "onboarding", headingId, drop }: ProjectScreenProps) {
  const p = state.phase, error = state.error;
  const destination = p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" ? p.destination : null;
  const run = (command: ProjectAction) => {
    if (command === "chooseFolder") on.chooseFolder(); else if (command === "chooseExisting") on.chooseExisting(); else if (command === "edit") on.edit();
    else if (command === "retry") on.retry(); else if (command === "changeLocation") on.changeDestination();
    else if (command === "useExisting") on.useExisting(); else on.backToAgents();
  };
  // The Project states 'No agent is ready' tile: shown as soon as no provider is ready, not only after a refused save.
  const fromUrl = p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" || ((p.kind === "candidates" || p.kind === "setup") && p.url !== null);
  // A clone destination under a registered project is what main refuses as path_unavailable on the clone screen.
  const container = p.kind === "clone" && destination !== null ? projects.find(root => destination.startsWith(`${root.replace(/\/+$/, "")}/`)) ?? null : null;
  const code = projectNoticeCode(use, state, agentReady);
  const notice = code === null ? null : code === error?.code ? projectNotice(code, error.message, destination, fromUrl, container && nameOf(container), error.path ?? null) : projectNotice(code, undefined, null);
  // D28: a notice's recovery actions and the screen's own never repeat; the notice keeps its copy. Use existing folder
  // already answers 'Already have this repository?'.
  const offered = new Set(notice?.actions.map(button => button.command) ?? []);
  const repeats = (command: ProjectAction) => offered.has(command) || (command === "chooseExisting" && offered.has("useExisting"));
  const [title, lead] = p.kind === "ready" || p.kind === "completing" ? HEADINGS.ready
    : p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" ? HEADINGS.clone
    : (p.kind === "candidates" || p.kind === "setup") && p.url !== null ? HEADINGS.found : use === "addPage" ? HEADINGS.add : HEADINGS.choose;
  const urlField = (readOnly: boolean) => <>
    <label className="ob-field-label" htmlFor="ob-project-url">Repository URL</label>
    <input className="doan-input" id="ob-project-url" aria-label="GitHub repository URL" placeholder="https://github.com/owner/repository" value={state.url} readOnly={readOnly}
      aria-invalid={error?.code === "invalid_url" || undefined} aria-describedby={error && (error.code === "invalid_url" || error.code === "access_failed") ? "ob-project-error" : undefined}
      onChange={event => on.setUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !readOnly && !event.nativeEvent.isComposing) on.find(); }} />
  </>;
  const smallActions = (...buttons: [string, ProjectAction][]) => { const kept = buttons.filter(([, command]) => !repeats(command));
    return kept.length > 0 && <div className="ob-small-action">{kept.map(([label, command]) =>
      <button key={label} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy} onClick={() => run(command)}>{label}</button>)}</div>; };
  let body: React.ReactNode;

  if (p.kind === "choose" || p.kind === "inspecting") {
    const urlNotice = error && (error.code === "invalid_url" || error.code === "access_failed");
    const changed = state.inspectedUrl !== null && state.url.trim() !== state.inspectedUrl && !error;
    body = <>
      {/* An unreachable repository keeps the screen to the URL and its recovery (draft frame 'repository-error'). */}
      {error?.code !== "access_failed" && <>
      {use === "onboarding" && projects.length > 0 && <div className="ob-projects">
        <div className="ob-field-label">Your projects</div>
        <ProjectChoice paths={projects} choice={state.listChoice} home={home} pick={on.pickListed} name="Your projects" />
        <div className="ob-state-actions submit-only"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={busy || state.listChoice === null} onClick={on.useListed}>Use this folder</button></div>
      </div>}
      <LocalFolderCard busy={busy} choose={on.chooseFolder} {...(drop ? { drop } : {})} />
      {drop?.notice && <div className="doan-notice error doan-panel ob-project-notice ob-drop-notice" role="alert" tabIndex={-1}><AlertIcon /><span>{drop.notice}</span></div>}
      <div className="ob-divider"><span>or use GitHub</span></div>
      </>}
      {urlField(p.kind === "inspecting")}
      {p.kind === "inspecting" ? <>
        <Progress title="Checking repository" body={p.url} />
        {/* The page's footer Cancel leaves the page; this one stops the check. */}
        <div className="ob-state-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-label={use === "addPage" ? "Cancel check" : undefined} onClick={on.cancelInspect}>Cancel</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled>Find repository</button></div>
      </> : urlNotice ? <>
        <ProjectNoticeView notice={notice!} run={run} id="ob-project-error" />
        {error.code === "access_failed"
          ? <div className="ob-recovery">
            <button type="button" className="doan-button" data-ui-variant="subtle" onClick={on.chooseFolder}>Choose local folder</button>
            <button type="button" className="doan-button" data-ui-variant="prominent" data-consent="" onClick={on.retry}>Retry</button>
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
        <ProjectChoice paths={p.candidates.map(c => c.path)} choice={p.choice} home={home} pick={on.pickCandidate} name="Repositories in this folder" />
      </>}
      {notice && <ProjectNoticeView notice={notice} run={run} />}
      {p.url !== null && <p className="ob-fine">Use your existing files and current branch.</p>}
      {p.url !== null ? smallActions(["Choose another folder", "chooseExisting"], ["Edit repository URL", "edit"]) : smallActions(["Choose another folder", "chooseFolder"])}
    </>;
  } else if (p.kind === "checking") {
    body = <Progress title="Checking this folder" body={shown(p.path, home)} />;
  } else if (p.kind === "setup" || p.kind === "selecting") {
    body = <>
      {/* From a URL the screen keeps that repository: its URL, another folder of it, or a different URL (D25). */}
      {p.kind === "setup" && p.url !== null && urlField(true)}
      {p.kind === "setup" && <section className="doan-panel ob-setup">
        <strong>Set up this folder for Doan</strong>
        <p>Doan will add its project configuration and a design folder. Existing files stay in place.</p>
        <ChosenProject path={p.path} home={home} />
        {notice ? <ProjectNoticeView notice={notice} run={run} />
          : <div className="ob-state-actions submit-only"><button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={busy} data-consent="" onClick={() => on.setUp(p.inspectionId)}>{setUpLabel(use)}</button></div>}
      </section>}
      {p.kind === "setup" && p.url !== null && smallActions(["Choose another folder", "chooseExisting"], ["Edit repository URL", "edit"])}
      {/* The page's footer only leaves it, so the page offers another folder here; first run keeps its shipped panel. */}
      {p.kind === "setup" && p.url === null && use === "addPage" && smallActions(["Choose another folder", "chooseFolder"])}
      {p.kind === "selecting" && <Progress title="Setting up your project" body={shown(p.path, home)} />}
    </>;
  } else if (p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled") {
    body = <>
      {urlField(true)}
      <div className="ob-field-label ob-spaced">Save to</div>
      <div className="doan-panel ob-destination"><ProjectThumbnail path={p.destination} />
        <div className="ob-destination-name"><strong>{nameOf(p.destination)}</strong><p className="ob-path">{shown(p.destination, home)}</p></div>
        {!offered.has("changeLocation") && <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={busy} onClick={on.changeDestination}>Change</button>}</div>
      {p.kind === "cloning" ? <>
        {p.cancelling ? <Progress title="Stopping clone and cleaning up" body="Wait before starting another clone." /> : <Progress title={`Cloning ${nameOf(p.destination)}`} body={shown(p.destination, home)} />}
        <div className="ob-state-actions">
          {p.cancelling ? <><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled>Choose local folder</button>
            <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled>Retry</button></>
            : <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={p.operationId === null} onClick={on.cancelClone}>Cancel</button>}
        </div>
        {/* The page's locked header and sidebar, and first run's disabled Back and steps, do not say why by themselves. */}
        <p className="ob-fine">Stay on this page until the clone finishes, or cancel it.</p>
      </> : p.kind === "cloneCancelled" ? <>
        <div className="doan-notice doan-panel ob-project-notice" role="status" tabIndex={-1}><AlertIcon /><span>Cloning was cancelled. Choose a folder or try again.</span></div>
        <div className="ob-state-actions"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={on.chooseExisting}>Choose local folder</button>
          <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-consent="" onClick={on.retry}>Retry</button></div>
        {smallActions(["Edit repository URL", "edit"])}
      </> : <>
        {notice && <ProjectNoticeView notice={notice} run={run} />}
        {!repeats("chooseExisting") && <p className="ob-fine">Already have this repository?</p>}
        {smallActions(["Choose existing folder", "chooseExisting"], ["Edit repository URL", "edit"])}
      </>}
    </>;
  } else {
    const root = p.root;
    body = <>
      <ChosenProject path={root} home={home} />
      {p.kind === "completing" ? <Progress title="Saving your setup" body="Your project is ready. Finishing setup before opening Home." /> : notice && <ProjectNoticeView notice={notice} run={run} />}
      {smallActions(["Choose another folder", "chooseFolder"])}
      <p className="ob-fine">Your selected project will be ready on Home.</p>
    </>;
  }
  const footer = projectFooter(use, state, { busy, agentReady });
  const next = () => { const action = footer?.primary?.action; if (action === "select") on.select(); else if (action === "clone") on.clone(); else if (action === "retry") on.retry(); else on.complete(); };
  return <>
    <div className="ob-heading"><h2 tabIndex={-1} ref={heading} id={headingId}>{title}</h2><p>{lead}</p></div>
    {body}
    {footer && <Footer use={use} footer={footer} back={on.back} next={next} />}
  </>;
}

// First run's steps scroll as one surface under the step capsule, so the thin scroll bar sits at the window's right
// edge, not beside the 560px column; the Add Projects page's panel plays the same part (buzz-add-projects design
// '온보딩과의 공유' 2).
export function SceneScroll({ children }: { children: React.ReactNode }) {
  return <div className="ob-scroll doan-scroll"><div className="ob-scene">{children}</div></div>;
}

// The full-window first run: Welcome → Agent → Project → Home, mounted once per main onboarding session. A CLI or MCP
// client may drive the same session; its completion closes this window too.
export function Wizard({ session, projects, homeDirectory, onClose, mainCheckout }: { session: string; projects: readonly string[]; homeDirectory: string | null; onClose: (root: string | null) => void; mainCheckout: (path: string) => boolean }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [agents] = useState(() => new AgentStepSession({ api: window.doan, openInstall: openInstallPage, hasFocus: () => document.hasFocus(), changed: redraw, signIn: agentSignIn() }));
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const homeRef = useRef(homeDirectory);
  homeRef.current = homeDirectory;
  const mainRef = useRef(mainCheckout);
  mainRef.current = mainCheckout;
  const closed = useRef(false);
  const finish = (root: string | null) => { if (closed.current) return; closed.current = true; onClose(root); };
  const [project] = useState(() => new ProjectStepSession({
    api: window.doan, sessionId: session, projects: () => projectsRef.current, homeDirectory: () => homeRef.current, mainCheckout: path => mainRef.current(path),
    requestId: () => crypto.randomUUID(), changed: redraw, completed: root => finish(root),
  }));
  const [scene, setScene] = useState(() => initialScene(false));
  const heading = useRef<HTMLElement | null>(null);
  const auth = agents.state.auth ?? null;
  const busy = project.busy();
  const anyReady = canAdvance(auth);
  useEffect(() => { project.agentsReady(anyReady); }, [anyReady]);

  useEffect(() => {
    agents.start();
    project.start();
    const focused = () => agents.windowFocused();
    window.addEventListener("focus", focused);
    // Completion saved by a CLI or MCP client of this session: Home takes over here too.
    const done = (state: OnboardingState) => { if (state.sessionId === session && state.completed) finish(state.project?.root ?? null); };
    const stop = window.doan.onOnboardingSession(done);
    // A completion published between App's start and this subscription is read once here.
    void window.doan.readOnboardingSession({ sessionId: session }).then(reply => { if (reply.ok && "sessionId" in reply.result) done(reply.result); }, () => {});
    return () => { window.removeEventListener("focus", focused); stop(); agents.dispose(); project.dispose(); };
  }, []);
  // A scene change moves focus to its heading; Tab then enters the controls (design '이동·취소·포커스 계약').
  useEffect(() => { requestAnimationFrame(() => heading.current?.focus()); }, [scene.generation]);
  const overlay = useRef<HTMLDialogElement | null>(null);
  const { toUrl, openPicker } = useProjectFocus(project, overlay, heading, () => canAdvance(agents.state.auth ?? null), scene.scene === "project");
  // Guarded with the session's auth at the time of the move, not of the click: a cancel wait can outlive a ready provider.
  const move = (event: SceneEvent) => setScene(current => nextScene(current, event, { auth: agents.state.auth ?? null, busy: project.busy() }));
  const generation = useRef(0);
  generation.current = scene.generation;
  const leave = sceneMover(agents, move, () => generation.current);

  // A stacked modal (the stop or paste dialog) answers its own keys.
  const stacked = useRef(false);
  stacked.current = agents.state.dialog !== null;
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
        const active = document.activeElement;
        const index = nodes.indexOf(active as HTMLElement);
        const before = index < 0 && active && overlay.current.contains(active) ? nodes.filter(node => node.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING).length : null;
        const next = nextFocusIndex(nodes.length, index, event.shiftKey, before);
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
  return <dialog className={welcome ? "ob-overlay ob-welcome" : "ob-overlay"} aria-label="Set up Doan"
    ref={node => { overlay.current = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => event.preventDefault()}>
    <div className="ob-chrome">
      {!welcome && <SetupSteps scene={scene.scene} canProject={canAdvance(auth)} busy={busy} go={to => { if (to === "project") leave.forward(); else move({ type: "step", to }); }} />}
    </div>
    <SceneScroll>
      {welcome && <div className="ob-welcome-scene" ref={node => setHeading(node?.querySelector("h1") ?? null)}><Welcome start={() => move({ type: "start" })} /></div>}
      {scene.scene === "agent" && <AgentStep session={agents} heading={setHeading}
        back={leave.back} next={leave.forward} />}
      {scene.scene === "project" && <ProjectScreen state={p.state} busy={busy} agentReady={canAdvance(auth)} projects={projects} home={homeDirectory} urlValid={p.urlValid()} heading={setHeading}
        drop={{ notice: p.dropNotice, allowed: () => p.canDrop(), started: () => p.dragStarted(), dropped: items => void p.drop(items) }} on={{
        back: () => { if (p.backToUrl()) toUrl(); else move({ type: "back" }); }, backToAgents: () => move({ type: "step", to: "agent" }),
        chooseFolder: () => openPicker(() => void p.chooseFolder()), chooseExisting: () => openPicker(() => void p.chooseExisting()), setUrl: url => p.setUrl(url), find: () => void p.findRepository(), cancelInspect: () => p.cancelInspect(), edit: toUrl,
        pickListed: path => p.pickListed(path), useListed: () => void p.useListed(), pickCandidate: path => p.pickCandidate(path), select: () => void p.select(), setUp: inspectionId => void p.setUp(inspectionId),
        changeDestination: () => openPicker(() => void p.changeDestination()), useExisting: () => void p.useExisting(), clone: () => void p.clone(), cancelClone: () => void p.cancelClone(),
        complete: () => void p.complete(), retry: () => void p.retry(),
      }} />}
    </SceneScroll>
  </dialog>;
}
