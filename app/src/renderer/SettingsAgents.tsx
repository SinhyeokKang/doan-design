import { Fragment, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, Gauge } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { readPermissionMode } from "../main/conversation/permissionMode";
import type { NewConversationPreference, PreferencesPatch, PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { DoanApi } from "../preload";
import { agentsSettingsView, PROVIDER_NAMES, providerUnavailableReason, type AuthButton, type AuthCommand, type ProviderView } from "./agentAuthView";
import type { AgentSignIn } from "./agentSignIn";
import { AgentStepSession } from "./agentStep";
import { AlertIcon } from "./AlertIcon";
import { retryButton, useRetry } from "./ListRetryButton";
import { announcedAgain } from "./listRetry";
import { PermissionIconView, PermissionMenuItems, useOlderFold } from "./ComposerParts";
import { generationOf, modelsKey } from "./dockedSupport";
import { foldRows, olderOrder, modelPickerView, providerLogo, selectableProvider, type ModelsState } from "./homeComposer";
import { firstUsable, focusLost, NoticeView, PasteDialog, StopDialog } from "./Onboarding";
import { settingsEffortLabel, settingsEffortMenu, settingsEffortPick, settingsModelMenu, settingsModelPick } from "./newConversationSettings";
import { permissionPickerView } from "./permissionPicker";
import { preferencesNotice } from "./SettingsNotifications";
import { useActivationFocus } from "./activationFocus";

export interface SettingsAgentsProps {
  // The renderer's sign-in controller: a sign-in outlives this page.
  signIn: AgentSignIn;
  // A provider to focus and flash once; seq makes a repeated arrival distinct.
  arrival: { provider: Provider; seq: number } | null;
  // The stop dialog owns the page until it is answered.
  onLock(locked: boolean): void;
  // null until App has read preferences.json.
  preferences: PreferencesSnapshot | null;
  save(patch: PreferencesPatch): Promise<PreferencesWriteReply | null>;
  // The project Home starts with; models are listed per project, so Model reads this one. null: no healthy project.
  project: { root: string; name: string } | null;
}

// Antigravity has no install command or page: Doan downloads its sign-in server itself.
function openInstall(provider: Provider): ReturnType<DoanApi["openInstall"]> {
  return provider === "antigravity" ? Promise.resolve("failed") : window.doan.openInstall(provider);
}
function openInstallPage(provider: Provider): Promise<boolean> {
  return provider === "antigravity" ? Promise.resolve(false) : window.doan.openInstallPage(provider);
}
const groupSelector = (provider: Provider) => `.doan-preference-row[role="group"][data-provider="${provider}"]`;
const LAST_USED = "last";

// Settings > Agents (PRODUCT §5 item 0 'Agents'). The rows reuse the first-run Agent step's session and copy (agentAuthView's
// Settings context); it never starts or sends a conversation, and reads models with conversation:models.
export function SettingsAgents({ signIn, arrival, onLock, preferences, save, project }: SettingsAgentsProps) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const live = useRef({ onLock });
  live.current = { onLock };
  const locked = useRef(false);
  const [session] = useState(() => {
    const created: AgentStepSession = new AgentStepSession({
      api: window.doan, openInstall, openInstallPage, hasFocus: () => document.hasFocus(), signIn,
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
  // A sign-in finished in the browser lands with the window in the background, so the hand-off is made again on
  // activation (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
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
      handFocus(() => next.focus());
      watched.node = next;
    });
  });
  const run = (provider: Provider) => (command: AuthCommand) => {
    // The paste modal returns focus itself.
    watch.current = command === "pasteAddress" || !(document.activeElement instanceof HTMLElement) ? null : { provider, node: document.activeElement };
    void session.command(provider, command);
  };

  // An arrival from Home's picker or a toast focuses the provider's row group once its row is drawn, and flashes it
  // like an added project's sidebar row.
  const arrived = useRef(0);
  const [flash, setFlash] = useState<Provider | null>(null);
  useEffect(() => {
    if (!arrival || arrival.seq === arrived.current) return;
    const group = document.querySelector<HTMLElement>(groupSelector(arrival.provider));
    // Rows are drawn once the controller has read; an unreadable store never draws them.
    if (!group) { if (state.auth === null) arrived.current = arrival.seq; return; }
    arrived.current = arrival.seq;
    const { provider } = arrival;
    // Sign in pressed in the prototype window arrives before this window is active.
    requestAnimationFrame(() => { handFocus(() => document.querySelector<HTMLElement>(groupSelector(provider))?.focus()); watch.current = { provider, node: group }; });
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
      {view.detail !== null && <span className="doan-preference-row-description selectable" role={view.detailRole ?? undefined}>{view.detail}</span>}</div>
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

const SAVE_FAILED = "Couldn’t save your new conversation choices. Your last saved choices still apply.";

// The pickers are menus like Home's (role=menu): a listbox Select would let the Escape that closes it
// reach the page and leave Settings.
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
  const key = project && provider ? modelsKey(project.root, provider, generationOf(auth, provider)) : null;
  const listState = key ? lists[key] : undefined;
  useEffect(() => {
    if (!key || !project || !provider || !runnable || listState !== undefined) return;
    setLists(current => ({ ...current, [key]: "loading" }));
    void window.doan.listConversationModels({ root: project.root, runtime: provider }).catch(() => ({ error: "unknown" })).then(reply => setLists(current => ({ ...current, [key]: reply })));
  }, [key, runnable, listState === undefined]);
  // Only the latest save, a choice's or Retry's, owns the failure line: an earlier choice's failure that answers after
  // a later one was sent is dropped (POSTMORTEM 2026-10-25), or its Retry would send the older choice again.
  const latest = useRef(0);
  const write = (patch: PreferencesPatch) => {
    const request = ++latest.current;
    setFailed(null);
    void save(patch).then(reply => { if (request === latest.current && (!reply || (!reply.ok && reply.reason !== "newer"))) setFailed(patch); });
  };
  // The Retries keep their failure lines until their request answers (DESIGN 'Busy action'): the save's line until a
  // save goes, the models' until the list is read again (not the Loading models line).
  const saveRetry = useRetry(), modelsRetry = useRetry();
  const retrySave = (pressed: HTMLElement | null) => {
    if (!failed) return;
    const patch = failed;
    const request = ++latest.current;
    saveRetry.run(() => save(patch).then(reply => {
      const ok = !!reply && (reply.ok || reply.reason === "newer");
      if (ok && request === latest.current) setFailed(current => current === patch ? null : current);
      return ok;
    }), pressed);
  };
  const retryModels = (pressed: HTMLElement | null) => {
    if (!key || !project || !provider) return;
    const at = key;
    modelsRetry.run(() => window.doan.listConversationModels({ root: project.root, runtime: provider }).catch(() => ({ error: "unknown" })).then(reply => {
      setLists(current => ({ ...current, [at]: reply }));
      return !("error" in reply);
    }), pressed);
  };
  const choose = (next: NewConversationPreference | null) => write({ newConversation: next });

  const menu = provider ? settingsModelMenu(provider, listState, pref?.model) : null;
  const pinned = menu?.pinned ?? null;
  const fold = useOlderFold(provider && menu ? [{ provider, rows: menu.rows }] : []);
  const modelRows = menu ? foldRows(menu.rows) : null;
  const loadFailed = listState !== undefined && listState !== "loading" && "error" in listState;
  // Effort follows the chosen model, or with Default the model the project lists as its default;
  // a model that lists no efforts has no Effort row.
  const listed = listState !== undefined && listState !== "loading" && "models" in listState ? listState.models : [];
  const effortModel = pinned ?? listed.find(item => item.default)?.id ?? null;
  const effort = provider && effortModel ? modelPickerView(auth, { [provider]: listState }, { provider, model: effortModel, effort: pref?.effort ?? null }).effort : null;
  const effortLabel = effort ? settingsEffortLabel(effort) : "";
  const effortMenu = effort ? settingsEffortMenu(effort) : null;
  const status = auth?.providers.find(item => item.provider === provider);
  // Permission: the composer's menu, saved with the model and effort; a saved mode this provider
  // cannot offer reads as Default. An ACP provider offers its modes only once the project's list is read.
  const permission = provider ? permissionPickerView(provider, listState, readPermissionMode(pref?.permissionMode)) : null;
  const keepMode = pref?.permissionMode ? { permissionMode: pref.permissionMode } : {};

  // folded: the Model menu, whose older models fold under a line.
  const trigger = (label: string, aria: string, content: ReactNode, disabled: boolean, menu: ReactNode, folded?: typeof fold) => <DropdownMenu.Root {...(folded ? { onOpenChange: folded.onOpenChange } : {})}>
    <DropdownMenu.Trigger asChild disabled={disabled}><button type="button" className="doan-button settings-select" data-ui-variant="trigger" data-ui-size="sm" aria-label={`${aria}: ${label}`} disabled={disabled}>
      {content}<ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content {...(folded ? { ref: folded.contentRef } : {})} className="doan-floating doan-menu settings-menu" aria-label={aria} {...(folded ? folded.placement : { side: "bottom" as const })} align="end" sideOffset={4} collisionPadding={8}>{menu}</DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
  const radio = (value: string, label: ReactNode, selected: boolean, onKeyDown?: ReturnType<typeof fold.olderKeyDown>) => <DropdownMenu.RadioItem key={value} value={value} className="doan-menu-item" {...(onKeyDown ? { onKeyDown } : {})}>
    {label}<span className="check-slot">{selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>;
  // The Model menu's Default row: its name over the model it stands for, the check on the name line.
  const unset = (value: string, label: string, description: string | null, selected: boolean) => <DropdownMenu.RadioItem key={value} value={value} className="doan-menu-item unset-item">
    <span className="unset-copy"><span className="model-name">{label}</span>{description && <span className="sub">{description}</span>}</span>
    <span className="check-slot">{selected && <Check className="check" aria-hidden="true" />}</span></DropdownMenu.RadioItem>;
  const agents = [...connected.map(status => status.provider), ...(provider && !connected.some(status => status.provider === provider) ? [provider] : [])];
  const lastUsedAgent = "the agent you last selected or sent a message with";

  return <section className="settings-section" aria-labelledby="settings-agents-defaults">
    <div className="settings-section-header"><div className="settings-header-copy"><h2 className="settings-section-title" id="settings-agents-defaults">New conversations</h2>
      <p className="settings-section-description">Home starts a new conversation with these. A conversation keeps the agent it started with.</p></div></div>
    {preferencesNotice(preferences?.notice)}
    <div className="doan-settings-group" data-layout="rows">
      <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Agent</span><span className="doan-preference-row-description">{`Use ${lastUsedAgent}.`}</span></div>
        <div className="doan-preference-row-trailing">{trigger(provider ? name : "Last used", "Agent for new conversations",
          provider ? <><img className="logo" src={providerLogo(provider)} alt="" /><span>{name}</span></> : <span>Last used</span>, off,
          <DropdownMenu.RadioGroup value={provider ?? LAST_USED} onValueChange={value => choose(value === LAST_USED ? null : { provider: value as Provider })}>
            {radio(LAST_USED, <span className="model-name">Last used</span>, provider === null)}
            {agents.map(item => radio(item, <><img className="logo" src={providerLogo(item)} alt="" /><span className="model-name">{PROVIDER_NAMES[item]}</span></>, item === provider))}
          </DropdownMenu.RadioGroup>)}</div>
        {provider && auth && !runnable && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg warn" role="status"><AlertIcon /><span>{providerUnavailableReason(provider, status)}, so Home starts with {lastUsedAgent}.</span></p></div>}
      </div>
      {provider && <div className="doan-preference-row" data-disabled={project && (runnable || !auth) ? undefined : ""}>
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Model</span>
          {!project ? <span className="doan-preference-row-description">Add a project to choose a model. Until then, Home uses {name}’s default.</span>
            : auth && !runnable ? <span className="doan-preference-row-description">{name} can’t run right now, so its models can’t be listed.</span>
            : !loadFailed && <span className="doan-preference-row-description">Models listed for {project.name}.{listState !== "loading" && ` In a project without this model, Home uses ${name}’s default.`}</span>}</div>
        {project && listState === "loading" ? <div className="doan-preference-row-trailing"><span className="settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />Loading models</span></div>
          : !loadFailed && menu && <div className="doan-preference-row-trailing">{trigger(menu.label, "Model for new conversations", <span>{menu.label}</span>, off || !project || !runnable,
            <DropdownMenu.RadioGroup value={menu.value} onValueChange={value => { const picked = settingsModelPick(menu, value); choose(picked === null ? { provider, ...keepMode } : { provider, model: picked, ...keepMode }); }}>
              {modelRows!.current.map(item => item.kind === "model" ? radio(item.value, <span className="model-name">{item.label}</span>, item.selected)
                : <Fragment key={item.value}>{unset(item.value, item.label, item.description, item.selected)}{menu.rows.length > 1 && <DropdownMenu.Separator className="doan-menu-sep" />}</Fragment>)}
              {modelRows!.older.length > 0 && olderOrder<ReactNode>(fold.line(provider, name, modelRows!.older.length),
                fold.isOpen(provider) ? modelRows!.older.map(item => item.kind === "model" && radio(item.value, <span className="model-name">{item.label}</span>, item.selected, fold.olderKeyDown(provider))) : [], fold.placement.side)}
            </DropdownMenu.RadioGroup>, fold)}</div>}
        {project && loadFailed && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error selectable" role="alert"><AlertIcon /><span id="settings-agents-models-error">{announcedAgain(`Couldn’t load the models for ${project.name}.`, modelsRetry.failures)}</span></p>
          {retryButton({ running: modelsRetry.running, variant: "subtle", describedBy: "settings-agents-models-error", onRetry: retryModels })}</div>}
      </div>}
      {provider && effortMenu && <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Effort</span></div>
        <div className="doan-preference-row-trailing">{trigger(effortLabel, "Effort for new conversations", <><Gauge className="inline" aria-hidden="true" /><span>{effortLabel}</span></>, off,
          <DropdownMenu.RadioGroup value={effortMenu.value} onValueChange={value => { const level = settingsEffortPick(effortMenu, value); choose({ provider, ...(pinned ? { model: pinned } : {}), ...(level === null ? {} : { effort: level }), ...keepMode }); }}>
            {effortMenu.rows.map(item => radio(item.value, <span className="model-name">{item.label}</span>, item.selected))}
          </DropdownMenu.RadioGroup>)}</div>
      </div>}
      {provider && permission && <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Permission</span></div>
        <div className="doan-preference-row-trailing"><DropdownMenu.Root>
          <DropdownMenu.Trigger asChild disabled={off}><button type="button" className="doan-button settings-select" data-ui-variant="trigger" data-ui-size="sm" data-mode={permission.mode}
            aria-label={`Permission for new conversations: ${permission.trigger.ariaLabel.replace(/^Permission: /, "")}`} disabled={off}>
            <PermissionIconView name={permission.trigger.icon} className="inline" /><span>{permission.trigger.label}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu permission-popover" aria-label="Permission for new conversations" side="bottom" align="end" sideOffset={4} collisionPadding={8}>
            <PermissionMenuItems view={permission} onPick={value => choose({ provider, ...(pref?.model ? { model: pref.model } : {}), ...(pref?.effort ? { effort: pref.effort } : {}), ...(value === "default" ? {} : { permissionMode: value }) })} />
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root></div>
      </div>}
    </div>
    {failed && <div className="settings-msg-row settings-save-error"><p className="settings-msg error selectable" role="alert"><AlertIcon /><span id="settings-agents-save-error">{announcedAgain(SAVE_FAILED, saveRetry.failures)}</span></p>
      {retryButton({ running: saveRetry.running, variant: "subtle", describedBy: "settings-agents-save-error", onRetry: retrySave })}</div>}
  </section>;
}
