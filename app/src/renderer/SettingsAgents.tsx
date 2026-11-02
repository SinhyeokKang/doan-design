import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, Gauge } from "lucide-react";
import type { AuthStatusDto, Provider } from "../main/agentAuth/types";
import { readPermissionMode } from "../main/conversation/permissionMode";
import type { NewConversationPreference, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import { agentsSettingsView, PROVIDER_NAMES, type AuthButton, type AuthCommand, type ProviderView } from "./agentAuthView";
import type { AgentSignIn } from "./agentSignIn";
import { AgentStepSession } from "./agentStep";
import { AlertIcon } from "./AlertIcon";
import { PermissionIconView, PermissionMenuItems } from "./ComposerParts";
import { modelPickerView, providerLogo, selectableProvider, type ModelsState } from "./homeComposer";
import { firstUsable, focusLost, NoticeView, PasteDialog, StopDialog } from "./Onboarding";
import { permissionPickerView } from "./permissionPicker";
import { preferencesNotice } from "./SettingsNotifications";

export interface SettingsAgentsProps {
  // The renderer's sign-in controller: a sign-in outlives this page (design 'App 수준 로그인 컨트롤러').
  signIn: AgentSignIn;
  // A provider to focus and flash once; seq makes a repeated arrival distinct.
  arrival: { provider: Provider; seq: number } | null;
  // The stop dialog owns the page until it is answered (design '잠금').
  onLock(locked: boolean): void;
  // null until App has read preferences.json.
  preferences: PreferencesSnapshot | null;
  save(patch: PreferencesPatch): Promise<PreferencesWriteReply | null>;
  // The project Home starts with; models are listed per project, so Model reads this one. null: no healthy project.
  project: { root: string; name: string } | null;
}

// Antigravity has no install page: Doan downloads its sign-in server itself.
function openInstall(provider: Provider): Promise<boolean> {
  return provider === "antigravity" ? Promise.resolve(false) : window.doan.openInstallPage(provider);
}
const groupSelector = (provider: Provider) => `.doan-preference-row[role="group"][data-provider="${provider}"]`;
const LAST_USED = "last", DEFAULT = "default";

// Settings > Agents (buzz-settings design 'Agents'): the provider rows over the renderer's sign-in controller, and the
// new-conversation defaults. The rows reuse the first-run Agent step's session and copy; agentAuthView's Settings
// context is the only difference. It never starts or sends a conversation; models are read with conversation:models.
export function SettingsAgents({ signIn, arrival, onLock, preferences, save, project }: SettingsAgentsProps) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const live = useRef({ onLock });
  live.current = { onLock };
  const locked = useRef(false);
  const [session] = useState(() => {
    const created: AgentStepSession = new AgentStepSession({
      api: window.doan, openInstall, hasFocus: () => document.hasFocus(), signIn,
      // Reported as the session changes, not after a render: a move between the two must already see the lock.
      changed: () => {
        redraw();
        const next = created.state.dialog?.kind === "stop";
        if (next !== locked.current) { locked.current = next; live.current.onLock(next); }
      },
    });
    return created;
  });
  useEffect(() => {
    session.start();
    session.enter();
    // Returning from a browser or an install page reads again and checks what was installed (first run's rule).
    const focused = () => session.windowFocused();
    window.addEventListener("focus", focused);
    return () => {
      window.removeEventListener("focus", focused);
      session.dispose();
      if (locked.current) { locked.current = false; live.current.onLock(false); }
    };
  }, []);
  const { state } = session;
  const list = agentsSettingsView(state.auth, state.contexts, { autoCheck: true });

  // The row whose control the person used, or the row an arrival focused. A control that goes away or is disabled hands
  // focus on within its row, else to the row group, which also follows the row into the other section.
  const watch = useRef<{ provider: Provider; node: HTMLElement } | null>(null);
  useEffect(() => {
    const watched = watch.current;
    if (!watched || state.dialog) return;
    requestAnimationFrame(() => {
      if (watch.current !== watched) return;
      const active = document.activeElement === document.body ? null : document.activeElement;
      const decision = focusLost(active, watched.node);
      if (decision === "release") { watch.current = null; return; }
      if (decision === "keep") return;
      const group = document.querySelector<HTMLElement>(groupSelector(watched.provider));
      const view = agentsSettingsView(session.state.auth, session.state.contexts, { autoCheck: true }).sections.flatMap(section => section.providers).find(p => p.provider === watched.provider);
      const target = view ? firstUsable(view) : null;
      const node = target === "notice" ? group?.querySelector<HTMLElement>(".doan-notice") : target ? group?.querySelector<HTMLElement>(`[data-command="${target}"]:not(:disabled)`) : null;
      const next = node ?? group;
      if (!next) return;
      next.focus();
      watched.node = next;
    });
  });
  const run = (provider: Provider) => (command: AuthCommand) => {
    // The paste modal returns focus itself.
    watch.current = command === "pasteAddress" || !(document.activeElement instanceof HTMLElement) ? null : { provider, node: document.activeElement };
    session.command(provider, command);
  };

  // An arrival from Home's picker or a toast focuses the provider's row group once its row is drawn, and flashes it
  // like an added project's sidebar row (design 'Agents').
  const arrived = useRef(0);
  const [flash, setFlash] = useState<Provider | null>(null);
  useEffect(() => {
    if (!arrival || arrival.seq === arrived.current) return;
    const group = document.querySelector<HTMLElement>(groupSelector(arrival.provider));
    // Rows are drawn once the controller has read; an unreadable store never draws them.
    if (!group) { if (state.auth === null) arrived.current = arrival.seq; return; }
    arrived.current = arrival.seq;
    const { provider } = arrival;
    requestAnimationFrame(() => { group.focus(); watch.current = { provider, node: group }; });
    setFlash(provider);
  });
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(timer);
  }, [flash, arrival?.seq]);

  const action = (provider: Provider, button: AuthButton, data?: Record<string, string>) => <button key={button.command} type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm"
    data-command={button.command} aria-label={button.ariaLabel} disabled={button.disabled} {...data} onClick={() => run(provider)(button.command)}>{button.label}</button>;
  const row = (view: ProviderView) => <div key={view.provider} className="doan-preference-row" data-has-icon="" role="group" aria-label={view.name} tabIndex={-1}
    data-provider={view.provider} data-flash={flash === view.provider ? "" : undefined}>
    <span className="doan-preference-row-icon" aria-hidden="true"><img className="logo" src={providerLogo(view.provider)} alt="" /></span>
    <div className="doan-preference-row-content"><span className="doan-preference-row-label">{view.name}</span>
      {view.detail !== null && <span className="doan-preference-row-description" role={view.detailRole ?? undefined}>{view.detail}</span>}</div>
    {(view.button || view.signOut) && <div className="doan-preference-row-trailing">{view.button && action(view.provider, view.button)}{view.signOut && action(view.provider, view.signOut)}</div>}
    {view.helper && <p className="doan-preference-row-extra settings-help">{view.helper}</p>}
    {view.notice && <div className="doan-preference-row-extra"><NoticeView notice={view.notice} run={run(view.provider)} /></div>}
    {view.paste && <p className="doan-preference-row-extra ob-page-help">{view.paste.prompt} {action(view.provider, view.paste.button, { "data-paste": view.provider })}</p>}
  </div>;
  // A paste modal that closed hands focus back to its line, else the row group.
  useEffect(() => {
    const focus = state.focus;
    if (focus?.target !== "paste" || !focus.provider) return;
    const provider = focus.provider;
    requestAnimationFrame(() => {
      const paste = document.querySelector<HTMLElement>(`[data-paste="${provider}"]`);
      (paste && !paste.matches(":disabled") ? paste : document.querySelector<HTMLElement>(groupSelector(provider)))?.focus();
    });
  }, [state.focus?.seq]);

  const stop = session.stopView(), paste = session.pasteView();
  return <>
    {list.notice && <div className="settings-notice"><NoticeView notice={list.notice} run={command => { if (command === "read") session.retryRead(); }} /></div>}
    {state.installError && <div className="doan-notice error" role="alert"><AlertIcon /><span>{state.installError}</span></div>}
    {list.sections.map(section => <section key={section.id} className="settings-section" aria-labelledby={`settings-agents-${section.id}`}>
      <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id={`settings-agents-${section.id}`}>{section.title}</h2></div></div>
      <div className="doan-settings-group" data-layout="rows">{section.providers.map(row)}</div>
    </section>)}
    <NewConversations auth={state.auth} preferences={preferences} save={save} project={project} />
    <p className="ob-live" role="status">{state.announcement?.text}</p>
    {stop && <StopDialog view={stop} busy={false} confirm={() => void session.confirmStop()} close={() => session.closeDialog()} />}
    {paste && state.dialog?.kind === "paste" && <PasteDialog view={paste} value={state.dialog.value} submittable={session.pasteSubmittable()} tooLong={session.pasteTooLong()} busy={state.dialog.submitting}
      change={value => session.setPaste(value)} submit={() => void session.submitPaste()} close={() => session.closeDialog()} />}
  </>;
}

// Why a fixed default cannot start a conversation, by the same causes as Home's picker (providerShortStatus).
function unavailable(name: string, status: AuthStatusDto | undefined): string {
  if (!status || status.account === null) return `${name} isn’t signed in`;
  const r = status.readiness;
  if (!r.ready && r.cause === "reauth_required" && status.phase === "reauthRequired") return `${name}’s sign-in expired`;
  if (!r.ready && (r.cause === "version_unsupported" || r.cause === "version_incompatible")) return `${name} needs an update`;
  return `${name} isn’t available right now`;
}

const SAVE_FAILED = "Couldn’t save your new conversation choices. Your last saved choices still apply.";

// The defaults Home starts a new input with (design 'New conversations'). Last used hides Model and Effort, which then
// follow the conversation sent last. The pickers are menus like Home's (role=menu): a listbox Select would let the
// Escape that closes it reach the page and leave Settings.
function NewConversations({ auth, preferences, save, project }: Pick<SettingsAgentsProps, "preferences" | "save" | "project"> & { auth: AgentSignIn["state"]["auth"] }) {
  const [lists, setLists] = useState<Record<string, ModelsState>>({});
  const [failed, setFailed] = useState<PreferencesPatch | null>(null);
  const pref = preferences?.preferences.newConversation ?? null;
  // A file from a newer Doan is kept and not overwritten; changes wait until that Doan is back.
  const off = preferences === null || preferences.notice === "newer";
  const provider = pref?.provider ?? null;
  const connected = (auth?.providers ?? []).filter(status => status.account !== null);
  const runnable = provider !== null && connected.some(status => status.provider === provider && selectableProvider(status));
  const name = provider ? PROVIDER_NAMES[provider] : "";
  const key = project && provider ? `${project.root}\n${provider}` : null;
  const listState = key ? lists[key] : undefined;
  useEffect(() => {
    if (!key || !project || !provider || !runnable || listState !== undefined) return;
    setLists(current => ({ ...current, [key]: "loading" }));
    void window.doan.listConversationModels({ root: project.root, runtime: provider }).catch(() => ({ error: "unknown" })).then(reply => setLists(current => ({ ...current, [key]: reply })));
  }, [key, runnable, listState === undefined]);
  const write = (patch: PreferencesPatch) => {
    setFailed(null);
    void save(patch).then(reply => { if (!reply || (!reply.ok && reply.reason !== "newer")) setFailed(patch); });
  };
  const choose = (next: NewConversationPreference | null) => write({ newConversation: next });

  const picker = provider ? modelPickerView(auth, { [provider]: listState }, { provider, model: pref?.model ?? null, effort: pref?.effort ?? null }) : null;
  const models = picker?.groups.find(group => group.provider === provider)?.rows ?? [];
  const model = models.find(item => item.kind === "model" && item.selected);
  const modelLabel = model?.label ?? "Default";
  const loadFailed = listState !== undefined && listState !== "loading" && "error" in listState;
  // Effort follows the chosen model, or with Default the model the project lists as its default (spec 'New
  // conversations'); a model that lists no efforts has no Effort row.
  const listed = listState !== undefined && listState !== "loading" && "models" in listState ? listState.models : [];
  const effortModel = model?.kind === "model" ? model.id : listed.find(item => item.default)?.id ?? null;
  const effort = provider && effortModel ? modelPickerView(auth, { [provider]: listState }, { provider, model: effortModel, effort: pref?.effort ?? null }).effort : null;
  const status = auth?.providers.find(item => item.provider === provider);
  // Permission (permission-mode U1): the composer's menu, saved with the model and effort; a saved mode this provider
  // cannot offer reads as Default. An ACP provider offers its modes only once the project's list is read.
  const permission = provider ? permissionPickerView(provider, listState, readPermissionMode(pref?.permissionMode)) : null;
  const keepMode = pref?.permissionMode ? { permissionMode: pref.permissionMode } : {};

  const trigger = (label: string, aria: string, content: ReactNode, disabled: boolean, menu: ReactNode) => <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild disabled={disabled}><button type="button" className="doan-button settings-select" data-ui-variant="trigger" data-ui-size="sm" aria-label={`${aria}: ${label}`} disabled={disabled}>
      {content}<ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu settings-menu" aria-label={aria} side="bottom" align="end" sideOffset={4} collisionPadding={8}>{menu}</DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
  const radio = (value: string, label: ReactNode, selected: boolean) => <DropdownMenu.RadioItem key={value} value={value} className="doan-menu-item">
    {label}<span className="check-slot">{selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>;
  const agents = [...connected.map(status => status.provider), ...(provider && !connected.some(status => status.provider === provider) ? [provider] : [])];

  return <section className="settings-section" aria-labelledby="settings-agents-defaults">
    <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-agents-defaults">New conversations</h2>
      <p className="settings-section-description">Home starts a new conversation with these. A conversation keeps the agent it started with.</p></div></div>
    {preferencesNotice(preferences?.notice)}
    <div className="doan-settings-group" data-layout="rows">
      <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Agent</span><span className="doan-preference-row-description">Choose Last used to start with the agent you sent with last.</span></div>
        <div className="doan-preference-row-trailing">{trigger(provider ? name : "Last used", "Agent for new conversations",
          provider ? <><img className="logo" src={providerLogo(provider)} alt="" /><span>{name}</span></> : <span>Last used</span>, off,
          <DropdownMenu.RadioGroup value={provider ?? LAST_USED} onValueChange={value => choose(value === LAST_USED ? null : { provider: value as Provider })}>
            {radio(LAST_USED, <span className="model-name">Last used</span>, provider === null)}
            {agents.map(item => radio(item, <><img className="logo" src={providerLogo(item)} alt="" /><span className="model-name">{PROVIDER_NAMES[item]}</span></>, item === provider))}
          </DropdownMenu.RadioGroup>)}</div>
        {provider && auth && !runnable && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg warn" role="status"><AlertIcon /><span>{unavailable(name, status)}, so Home starts with the agent you sent with last.</span></p></div>}
      </div>
      {provider && <div className="doan-preference-row" data-disabled={project && (runnable || !auth) ? undefined : ""}>
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Model</span>
          {!project ? <span className="doan-preference-row-description">Add a project to choose a model. Until then, Home uses {name}’s default.</span>
            : auth && !runnable ? <span className="doan-preference-row-description">{name} can’t run right now, so its models can’t be listed.</span>
            : !loadFailed && <span className="doan-preference-row-description">Models listed for {project.name}.{listState !== "loading" && ` In a project without this model, Home uses ${name}’s default.`}</span>}</div>
        {project && listState === "loading" ? <div className="doan-preference-row-trailing"><span className="settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />Loading models</span></div>
          : !loadFailed && <div className="doan-preference-row-trailing">{trigger(modelLabel, "Model for new conversations", <span>{modelLabel}</span>, off || !project || !runnable,
            <DropdownMenu.RadioGroup value={model?.kind === "model" ? model.id : DEFAULT} onValueChange={value => choose(value === DEFAULT ? { provider, ...keepMode } : { provider, model: value, ...keepMode })}>
              {models.map(item => item.kind === "model" ? radio(item.id, <span className="model-name">{item.label}</span>, item.selected) : radio(DEFAULT, <span className="model-name">Default</span>, item.selected))}
            </DropdownMenu.RadioGroup>)}</div>}
        {project && loadFailed && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>Couldn’t load the models for {project.name}.</span></p>
          <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => setLists(current => { const next = { ...current }; delete next[key!]; return next; })}>Retry</button></div>}
      </div>}
      {provider && effort && <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Effort</span></div>
        <div className="doan-preference-row-trailing">{trigger(effort.label, "Effort for new conversations", <><Gauge className="inline" aria-hidden="true" /><span>{effort.label}</span></>, off,
          <DropdownMenu.RadioGroup value={effort.options.find(item => item.selected)?.id ?? DEFAULT} onValueChange={value => choose({ provider, ...(model?.kind === "model" ? { model: model.id } : {}), ...(value === DEFAULT ? {} : { effort: value }), ...keepMode })}>
            {radio(DEFAULT, <span className="model-name">Default</span>, !effort.options.some(item => item.selected))}
            {effort.options.map(item => radio(item.id, <span className="model-name">{item.label}</span>, item.selected))}
          </DropdownMenu.RadioGroup>)}</div>
      </div>}
      {provider && permission && <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Permission</span></div>
        <div className="doan-preference-row-trailing"><DropdownMenu.Root>
          <DropdownMenu.Trigger asChild disabled={off}><button type="button" className="doan-button settings-select" data-ui-variant="trigger" data-ui-size="sm" data-mode={permission.mode}
            aria-label={`Permission for new conversations: ${permission.trigger.ariaLabel.replace(/^Permission: /, "")}`} disabled={off}>
            <PermissionIconView name={permission.trigger.icon} className="inline" /><span>{permission.trigger.label}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu permission-popover" data-ui-size="compact" aria-label="Permission for new conversations" side="bottom" align="end" sideOffset={4} collisionPadding={8}>
            <PermissionMenuItems view={permission} onPick={value => choose({ provider, ...(pref?.model ? { model: pref.model } : {}), ...(pref?.effort ? { effort: pref.effort } : {}), ...(value === "default" ? {} : { permissionMode: value }) })} />
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root></div>
      </div>}
    </div>
    {failed && <div className="settings-msg-row settings-save-error"><p className="settings-msg error" role="alert"><AlertIcon /><span>{SAVE_FAILED}</span></p>
      <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => write(failed)}>Retry</button></div>}
  </section>;
}
