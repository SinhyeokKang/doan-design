import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, Info, Plus, SquarePen } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { readPermissionMode } from "../main/conversation/permissionMode";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { messageLine, type FrameName } from "../main/conversation/messageText";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import type { HomeMemory } from "../restore/uiState";
import { AlertIcon } from "./AlertIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { textSegments } from "./anchorField";
import { canvasConversationError, canvasConversationMenu, resumeHeld } from "./canvasConversation";
import { sameCanvas } from "./canvasConversationRows";
import type { CanvasRun, CanvasTarget, ResumeReply } from "./canvasRun";
import { focusFieldEnd } from "./chipField";
import { GroupIcon } from "./ComposerParts";
import { ConversationHead } from "./ConversationLine";
import { ConversationThread, LOADING_DELAY_MS, type ConversationThreadHandle, type LocateOutcome } from "./ConversationThread";
import type { ListView } from "./conversationStore";
import { stripState } from "./conversationStrip";
import { copyText } from "./copyText";
import { DockedComposer, type DockedFieldLink, type DockedOutcome, type DockedPicker, type DockedRequest } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedMode, type DockedRefusal } from "./dockedRules";
import { modelsKey, type DockedSupport } from "./dockedSupport";
import {
  attachmentLimit, defaultEffort, defaultModel, defaultProvider, fixedPreference, groupIcon, modelOption, modelPickerView, presetPlaceholder,
  selectableProvider, suggestedPresets, suggestedPrompts, type AttachmentDraft, type NewConversationDefault, type ModelsState,
} from "./homeComposer";
import { PROVIDER_NAMES } from "./agentAuthView";
import { scrollTarget } from "./overviewRun";
import type { SettingsTarget } from "./settingsSections";
import { threadItems } from "./threadItems";
import type { ComposerChoice } from "./rememberChoice";
import { defaultPermission, permissionChoices, permissionPickerView } from "./permissionPicker";

// The canvas page's conversation panel body (buzz-canvas-conversation design §2 'Conversation panel', draft frames
// panel-*): the conversation menu in the panel's title row, the thread and the docked composer. CanvasRun decides which
// conversation shows; this component draws it and makes the calls to main the thread and composer ask for, as the
// Overview's does (ProjectOverview).

export interface CanvasConversationProps {
  run: CanvasRun;
  support: DockedSupport;
  target: CanvasTarget;
  // The canvas's file name, as the canvas header shows it.
  canvasName: string;
  project: string;
  entry: FolderEntry;
  list: ListView;
  seen: ReadonlySet<string>;
  prefs: HomeMemory | null;
  defaults: NewConversationDefault | null | undefined;
  // A model or effort pick is remembered as Last used before any send (dogfooding #6).
  onRemember?(choice: ComposerChoice): void;
  now: number;
  // Why the composer keeps its draft but takes no input: the page shows a canvas outside the list, or one whose ID
  // another canvas shares (design §2 'Errors').
  blocked: string | null;
  // The open canvas's frames, which name frame chips; locate is unavailable while the canvas cannot be shown.
  frames: readonly FrameName[];
  locateDisabled: boolean;
  // Where focus goes once the panel shows what an entry asked for; each entry has its own seq.
  arrival: { focus: "permission" | "composer"; seq: number } | null;
  // An arrival was applied: the host drops it, so a panel drawn again later does not take focus for it once more.
  onArrived(seq: number): void;
  // Chip locate from the thread and from the composer's field (design §2 'Chip locate').
  onLocate(anchor: Anchor): Promise<LocateOutcome>;
  // The composer's Pick from canvas, and the page's way into its field (picker results, Add to conversation).
  pick: DockedPicker;
  composerLink: MutableRefObject<DockedFieldLink | null>;
  onSettings(target: SettingsTarget): void;
  onNotice(text: string): void;
  // The drawing project conversation's Open: its root's Overview shows it.
  onOpenProjectConversation(conversationId: string): void;
  // The canvases terminal sessions work on: the terminal session choice waits while its session is among them.
  work: readonly WorkItem[];
}

const NEW_PLACEHOLDER = "Ask, / for presets";
const REPLY_PLACEHOLDER = "Reply, / for presets";
const NEW = "";
const focusField = () => queueMicrotask(() => focusFieldEnd(document.querySelector<HTMLElement>(".doan-conv-panel .composer-input")));
// Main's turn as the composer reads it, as the Overview's: the merged events first (the list lags them), then the list.
function turnOf(events: readonly ConversationEvent[] | null, summary: ConversationSummary | undefined, live: boolean): "idle" | "running" | "waiting" {
  const kind = events && events.length ? stripState(events).kind : null;
  if (kind === "permission") return "waiting";
  if ((kind === "starting" || kind === "working") && live) return "running";
  if (summary?.phase === "waiting") return "waiting";
  return summary?.working ? "running" : "idle";
}
// "Linked by doan check at 14:02": the time of day, with the date when it was not today.
export function linkedAt(at: string | undefined, now: number): string | null {
  const time = at ? Date.parse(at) : NaN;
  if (Number.isNaN(time)) return null;
  const date = new Date(time), today = new Date(now);
  const clock = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === today.toDateString() ? clock : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clock}`;
}

// The header's New conversation button: the menu's item one click away, left of Hide conversation (dogfooding). On a new
// conversation already it only focuses the composer.
export function startNewConversation(current: string | null, select: (id: string | null) => void, focus: () => void): void {
  if (current !== null) select(null);
  focus();
}

export function CanvasConversationTitle({ run, list, canvasName, now, seen, title, current, onPicked }: {
  run: CanvasRun; list: ListView; canvasName: string; now: number; seen: ReadonlySet<string>; title: string; current: string | null; onPicked(): void;
}) {
  const target = run.target();
  const items = Array.isArray(list) && target ? canvasConversationMenu(list, target.canvas, current, now, seen) : [];
  const picked = useRef(false);
  const startNew = () => startNewConversation(current, run.select.bind(run), onPicked);
  return <><span className="ov-title-wrap doan-conv-title">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={list === "loading"}><button type="button" className="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" title={title}>
        <span>{title}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu conv-menu" aria-label={`Conversations on ${canvasName}`} align="end" sideOffset={4} collisionPadding={8}
        onCloseAutoFocus={event => { if (!picked.current) return; picked.current = false; event.preventDefault(); onPicked(); }}>
        <DropdownMenu.RadioGroup value={current ?? NEW} onValueChange={value => { picked.current = true; run.select(value === NEW ? null : value); }}>
          <DropdownMenu.RadioItem value={NEW} className={`doan-menu-item conv-new${current === null ? " current" : ""}`} textValue="New conversation"><Plus aria-hidden="true" /><span>New conversation</span></DropdownMenu.RadioItem>
          <DropdownMenu.Separator className="doan-menu-sep" />
          <DropdownMenu.Label className="doan-menu-head">{`Conversations on ${canvasName}`}</DropdownMenu.Label>
          {list === "error" ? <div className="conv-error" role="status"><span>Couldn’t read conversations</span>
            <DropdownMenu.Item className="doan-menu-item" onSelect={event => { event.preventDefault(); run.retryList(); }}>Retry</DropdownMenu.Item></div>
            : <div className="conv-list">{items.map(item => <DropdownMenu.RadioItem key={item.conversationId} value={item.conversationId} textValue={item.title}
              className={`doan-menu-item conv-item${item.selected ? " current" : ""}`}>
              <ConversationHead line={item} name={item.title} nameClass="t" />
              <span className="conv-preview">{item.preview}</span>
            </DropdownMenu.RadioItem>)}</div>}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
  </span>
  <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button doan-conv-new" aria-label="New conversation" onClick={startNew}><SquarePen aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent>New conversation</TooltipContent></Tooltip></>;
}

// The panel's title: the shown conversation's, or New conversation.
export function canvasConversationTitle(run: CanvasRun, list: ListView): { title: string; current: string | null } {
  const view = run.view();
  if (view?.kind !== "conversation") return { title: "New conversation", current: null };
  const summary = Array.isArray(list) ? list.find(c => c.conversationId === view.conversationId) : undefined;
  const first = run.store.thread(view.conversationId)?.events.find(event => event.type === "user.message");
  // Before a list names it, the first message stands in as main's title does: chips by name (messageLine).
  return { title: summary?.title || (first?.type === "user.message" ? messageLine(first.text, first.anchors) : ""), current: view.conversationId };
}

export function CanvasConversation(props: CanvasConversationProps) {
  const { run, support, target, project, list } = props;
  const store = run.store;
  const root = target.root;
  const listed = Array.isArray(list) ? list : null;
  const view = run.view() ?? { kind: "wait" as const };
  const conversationId = view.kind === "conversation" ? view.conversationId : null;
  const summary = conversationId ? listed?.find(c => c.conversationId === conversationId) : undefined;
  const thread = conversationId ? store.thread(conversationId) : null;
  const provider: Provider | null = conversationId ? summary?.provider ?? store.providerOf(conversationId) : null;
  const archived = view.kind === "conversation" && view.archived;
  // The terminal session still works in a terminal: its choice waits and a new conversation is the mode. A chosen
  // resume becomes new for good (the layout effect below), so it never comes back under a draft when the session ends.
  const held = view.kind === "new" && resumeHeld(view.resume, props.work);
  useLayoutEffect(() => { if (held) run.choose("new"); }, [held]);
  const mode: DockedMode = conversationId && provider ? { kind: archived ? "archived" : "existing", conversationId, provider }
    : view.kind === "new" ? (held ? { kind: "new", root, canvas: target.canvas } : view.mode) : { kind: "new", root, canvas: target.canvas };
  const key = draftKey(mode);
  const draft = store.drafts.get(key) ?? EMPTY_DRAFT;
  const healthy = props.entry.kind === "list";
  const live = conversationId ? store.live(root, conversationId) : false;
  // A terminal session, or a conversation an external agent started, keeps its own model and effort.
  const fixed = mode.kind === "resume" || summary?.owner === "legacy-external";

  useEffect(() => { if (!support.presets?.ok) support.readPresets(); }, []);
  useEffect(() => window.doan.onAgentAuth(snapshot => support.setAuth(snapshot)), []);

  // The composer's agent, model and effort, as the Overview's: a new conversation picks as Home does; an existing one
  // keeps its provider and starts from its own model.
  const auth = support.auth;
  const pick = support.picks[key] ?? {};
  const chosen = mode.kind === "new" ? pick.provider ?? defaultProvider(auth, props.prefs?.lastProvider, props.defaults ?? null) : mode.provider;
  const preference = mode.kind === "new" && chosen ? fixedPreference(props.defaults ?? null, chosen) : null;
  const lists: Partial<Record<Provider, ModelsState>> = Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, support.models[modelsKey(root, status.provider)]]));
  const listState = chosen ? lists[chosen] : undefined;
  const saved = mode.kind === "new" ? (chosen ? props.prefs?.models?.[chosen] : undefined) : summary?.model ? { model: summary.model, ...(summary.effort ? { effort: summary.effort } : {}) } : undefined;
  const model = chosen && !fixed ? modelOption(listState, pick.model ?? null)?.id ?? defaultModel(listState, saved, preference) : null;
  const option = modelOption(listState, model);
  const effort = fixed ? null : pick.effort !== undefined ? defaultEffort(option, pick.effort) : defaultEffort(option, saved?.model === model ? saved?.effort : undefined, preference);
  const picker = modelPickerView(auth, lists, { provider: chosen, model, effort });
  // The mode, as the model: a new conversation's from Home's rules, an existing one's its own stored mode. A terminal
  // session takes none; its fixed trigger shows instead.
  const stored = readPermissionMode(summary?.permissionMode);
  const choices = chosen && !fixed ? permissionChoices(chosen, listState) : [];
  const permission = fixed ? null : permissionPickerView(chosen, listState, mode.kind === "new"
    ? defaultPermission(choices, pick.permissionMode, chosen ? props.prefs?.permissions?.[chosen] : undefined, preference)
    : defaultPermission(choices, pick.permissionMode ?? support.started[key] ?? stored, undefined, null));
  const permissionMode = permission?.mode;
  // An existing conversation's send names the shown mode only once it is known: before the list names the
  // conversation, Default would overwrite the mode it was started in.
  const sentMode = mode.kind === "new" || summary || pick.permissionMode !== undefined ? permissionMode : undefined;
  useEffect(() => { if (mode.kind === "existing" || mode.kind === "archived") support.settlePermission(key, summary ? stored : null); }, [key, stored, summary !== undefined, pick.permissionMode]);
  const choiceTouched = Object.keys(pick).length > 0;
  // An existing conversation's stored mode is remembered only when it is picked here: a model pick alone must not
  // carry a mode (Full access included) the person chose for that conversation into new ones.
  const rememberedMode = mode.kind === "new" || pick.permissionMode !== undefined ? permissionMode : undefined;
  useEffect(() => { if (choiceTouched && chosen) props.onRemember?.({ provider: chosen, model, effort, ...(rememberedMode ? { permissionMode: rememberedMode } : {}) }); }, [choiceTouched, chosen, model, effort, rememberedMode]);
  const ready = chosen !== null && (auth?.providers ?? []).some(status => status.provider === chosen && status.account !== null && selectableProvider(status));
  useEffect(() => { if (healthy && chosen && ready && !fixed) support.readModels(root, chosen); }, [root, healthy, chosen, ready, fixed]);

  const presets = support.presets?.ok ? support.presets.result.presets : [];
  const prompts = view.kind === "new" && mode.kind === "new" && ready && healthy ? suggestedPrompts(props.entry, project, presets) : [];
  const started = draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0;

  // The thread, and an entry's scroll to its pending permission request.
  const handle = useRef<ConversationThreadHandle | null>(null);
  const items = thread?.read === "ready" ? threadItems(thread.events, root, live) : thread?.read === "error" ? "error" as const : null;
  const scroll = conversationId ? run.scrollRequest(conversationId) : null;
  const asking = summary?.phase === "waiting";
  useEffect(() => {
    if (!conversationId || !scroll || !Array.isArray(items)) return;
    const target = scrollTarget(items, asking);
    if (target.kind === "wait") return;
    run.takeScroll(conversationId);
    if (target.kind === "item") handle.current?.scrollToItem(target.key);
  }, [conversationId, scroll?.seq, Array.isArray(items) ? items.length : -1, asking]);
  // An entry's focus (design §2 'Opening the panel'): a permission entry's first choice once its request draws, else
  // the composer. Each arrival is applied once; one whose request has nothing pending falls back to the composer.
  const arrived = useRef(0);
  useEffect(() => {
    const arrival = props.arrival;
    if (!arrival || arrival.seq === arrived.current || view.kind === "wait") return;
    if (arrival.focus === "permission" && conversationId) {
      if (!Array.isArray(items)) return;
      const ask = scrollTarget(items, asking);
      if (ask.kind === "wait") return;
      arrived.current = arrival.seq;
      props.onArrived(arrival.seq);
      if (ask.kind === "item") {
        handle.current?.scrollToItem(ask.key);
        const choice = document.querySelector<HTMLElement>(`.doan-conv-panel [data-item="${CSS.escape(ask.key)}"] .strip-actions button`);
        if (choice) { choice.focus({ preventScroll: true }); return; }
      }
    } else { arrived.current = arrival.seq; props.onArrived(arrival.seq); }
    focusField();
  }, [props.arrival?.seq, view.kind, conversationId, Array.isArray(items) ? items.length : -1, asking]);

  // Attachments go through main, which checks each file; each answer lands on its chip wherever the draft is now.
  const settle = (keys: string[], results: readonly (AttachmentResult | null)[]) => {
    const { notices, images } = store.settleAttachments(keys, results);
    if (typeof URL.createObjectURL === "function") for (const image of images) support.setThumbnail(image.key, URL.createObjectURL(new Blob([new Uint8Array(image.thumbnail)], { type: "image/png" })));
    if (notices.length) props.onNotice(notices.join(" "));
  };
  const addChips = (at: string, chips: AttachmentDraft[]) => store.setDrafts(drafts => {
    const current = drafts.get(at) ?? EMPTY_DRAFT;
    return new Map(drafts).set(at, { ...current, attachments: [...current.attachments, ...chips] });
  });
  const addFiles = (files: File[], pasted: boolean) => {
    if (fixed) return;
    const at = key;
    const limit = attachmentLimit(draft.attachments.length, files.map(file => ({ pasted: false, size: file.size })));
    if (limit.notices.length) props.onNotice(limit.notices.join(" "));
    const accepted = limit.accept.map(i => files[i]!);
    if (!accepted.length) return;
    const keys = accepted.map(() => crypto.randomUUID());
    addChips(at, accepted.map((file, i) => ({ key: keys[i]!, name: file.name, kind: file.type.startsWith("image/") ? "image" : "file", pasted: false, status: "checking", size: file.size })));
    void window.doan.addAttachmentFiles(accepted).catch(() => null).then(async results => {
      if (!results) { settle(keys, keys.map(() => null)); return; }
      // A copied screenshot has no path on disk; it attaches as a pasted image instead (buzz-home design §4.8).
      const final = await Promise.all(results.map(async (result, i) => {
        const file = accepted[i]!;
        if (!pasted || result.ok || result.error !== "not_found" || !file.type.startsWith("image/")) return result;
        if (file.size > 50 * 1024 * 1024) return { ok: false as const, name: "Pasted image", error: "too_large" as const };
        return window.doan.addPastedImage(await file.arrayBuffer()).catch(() => null);
      }));
      settle(keys, final);
    });
  };
  const chooseFiles = () => {
    if (fixed) return;
    const at = key;
    void window.doan.chooseAttachments().catch(() => []).then(results => {
      const ok = results.filter(result => result.ok);
      const limit = attachmentLimit((store.drafts.get(at) ?? EMPTY_DRAFT).attachments.length, ok.map(() => ({ pasted: false, size: 0 })));
      const keep = new Set(limit.accept.map(i => ok[i]!));
      for (const result of ok) if (!keep.has(result) && result.ok) void window.doan.removeAttachment(result.attachment.id);
      const chosenFiles = results.filter(result => !result.ok || keep.has(result));
      const keys = chosenFiles.map(() => crypto.randomUUID());
      addChips(at, chosenFiles.map((result, i) => ({ key: keys[i]!, name: result.ok ? result.attachment.name : result.name, kind: "file", pasted: false, status: "checking" })));
      settle(keys, chosenFiles);
      if (limit.notices.length) props.onNotice(limit.notices.join(" "));
    });
  };

  // Send, start, resume, restore and queue. Every reply carries the panel's revision from when it was sent, so a reply
  // that lands after the person chose something else, or after another canvas opened, leaves that choice alone
  // (POSTMORTEM 2026-10-26 late replies).
  const changedModel = pick.model !== undefined || pick.effort !== undefined;
  const send = async (request: DockedRequest): Promise<DockedOutcome> => {
    const revision = run.revision();
    const sentUnder = notice;
    if (mode.kind === "new" || mode.kind === "resume") {
      const runtime = mode.kind === "resume" ? mode.provider : chosen;
      if (!runtime) return { error: "no_agent" };
      const start = mode.kind === "resume"
        ? { root, mode: "resume" as const, canvas: target.canvas, text: request.text, anchors: [...request.anchors] }
        : { root, mode: "new" as const, runtime, canvas: target.canvas, text: request.text, anchors: [...request.anchors],
          ...(model ? { model } : {}), ...(model && effort ? { effort } : {}), ...(permissionMode && permissionMode !== "default" ? { permissionMode } : {}), ...(request.attachments.length ? { attachments: request.attachments } : {}) };
      const reply = await window.doan.startConversation(start).catch(() => ({ error: "unknown" }));
      if ("error" in reply) return { error: reply.error, ...("missing" in reply && Array.isArray(reply.missing) ? { missing: reply.missing } : {}) };
      // Home's and the Overview's starts are remembered by App's run host; this one starts here.
      if (mode.kind === "new") props.onRemember?.({ provider: runtime, model: model ?? null, effort: model ? effort : null, ...(permissionMode ? { permissionMode } : {}) });
      support.clearPick(key);
      if (mode.kind === "new" && permissionMode) support.startedIn(draftKey({ kind: "existing", conversationId: reply.conversationId, provider: runtime }), permissionMode);
      run.started(target, reply.conversationId, runtime, revision);
      return { ok: true };
    }
    const reply = await window.doan.sendConversation({
      conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors],
      ...(changedModel && model && !fixed ? { model, ...(effort ? { effort } : {}) } : {}), ...(sentMode ? { permissionMode: sentMode } : {}), ...(request.attachments.length ? { attachments: request.attachments } : {}),
    }).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) return { error: reply.error, ...("missing" in reply && Array.isArray(reply.missing) ? { missing: reply.missing } : {}) };
    run.sent(target, revision, sentUnder);
    return { ok: true };
  };
  const queue = async (request: DockedRequest): Promise<DockedOutcome> => {
    if (mode.kind !== "existing" && mode.kind !== "archived") return { error: "not_running" };
    const reply = await window.doan.queueConversation({ conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors], ...(request.attachments.length ? { attachments: request.attachments } : {}) }).catch(() => ({ error: "unknown" as const }));
    if ("error" in reply) return { error: reply.error, ...("missing" in reply && Array.isArray(reply.missing) ? { missing: reply.missing as string[] } : {}) };
    store.queued(root, mode.conversationId, { id: reply.itemId, text: queuedText(request) });
    return { ok: true };
  };
  // The canvas panel's reading of a refusal (canvasConversationError): attachment_missing is the composer's own.
  const refuse = (code: string, provider: Provider): DockedRefusal => {
    const error = canvasConversationError(code, mode, provider, project);
    switch (error.kind) {
      case "busy": return { kind: "busy", busy: error.busy };
      case "blocked": return { kind: "blocked", text: error.text, ...(error.action ? { action: error.action } : {}) };
      case "notice": return { kind: "notice", text: error.text, ...(error.retry ? { retry: true } : {}), ...(error.startNew ? { startNew: true } : {}) };
      // attachments and resend never reach here: the composer marks moved files and resends not_running itself.
      default: return { kind: "notice", text: "Couldn’t send your message. Try again." };
    }
  };
  const newView = view.kind === "new" ? view : null;
  // The canvas's current conversation still works: a new conversation, or restoring an archived one, would end its
  // turn, so Send waits with the busy line whose Open shows it (design §2 'Conversation panel', 'Errors').
  const current = listed?.find(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, target.canvas));
  const restoreBusy = archived && current && (current.working || current.phase !== "ended") ? { kind: "restore" as const, open: current.conversationId } : null;
  const busy = newView?.start.busy ?? restoreBusy;
  const openConversation = (id: string) => run.select(id);

  const placeholder = draft.preset && draft.segments.length === 0 ? presetPlaceholder(draft.preset) : view.kind === "new" && mode.kind === "new" ? NEW_PLACEHOLDER : REPLY_PLACEHOLDER;
  const notice = view.kind === "wait" ? null : view.notice;
  const resume = newView?.start.offer ? newView : null;

  return <div className="doan-conv-content">
    <div className={`cp-scroll${conversationId ? "" : " end"}`}>
      {conversationId && provider ? <ConversationThread ref={handle} conversationId={conversationId} items={items} provider={provider} project={project}
        liveAfter={thread?.liveAfter ?? Number.MAX_SAFE_INTEGER} canvasListed={() => true}
        onAnswer={(requestId, optionId) => window.doan.answerConversationPermission({ conversationId, requestId, optionId })}
        onStop={() => void window.doan.interruptConversation({ conversationId }).catch(console.error)}
        onEditAndResend={() => {
          // Focus follows only while the same canvas still shows the same conversation as when it was asked for.
          const shown = run.showing();
          void store.editAndResend(conversationId).then(applied => { if (applied && shown && run.stillShowing(shown)) focusField(); });
        }}
        onSignIn={() => props.onSettings({ section: "agents", provider })}
        onRetry={() => store.retryThread(conversationId)}
        onOpenCanvas={() => {}}
        onOpenLink={url => void window.doan.openLink(url).catch(console.error)}
        onCopy={text => Promise.resolve(copyText(text))}
        onLocate={props.onLocate} locateDisabled={props.locateDisabled} frames={props.frames} />
        : view.kind === "wait" || conversationId ? <Waiting /> : <>
          {newView?.listError && <div className="doan-notice error thread-notice" role="alert"><AlertIcon /><span className="strip-text"><b>Couldn’t read conversations</b><span>Try again. You can still start a new conversation.</span></span>
            <span className="strip-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => run.retryList()}>Retry</button></span></div>}
          {resume && <ResumeChoice offer={resume.start.offer!} reply={resume.resume} now={props.now} mode={held ? "new" : resume.start.mode} held={held} onChoose={choice => { run.choose(choice); focusField(); }} />}
          {prompts.length > 0 && !started && !resume && <div className="ov-suggestions" role="group" aria-label="Suggested prompts">{prompts.map(prompt =>
            <button key={prompt.label} type="button" className="suggestion doan-button" data-ui-size="sm" data-ui-variant="quiet" title={prompt.label}
              onClick={() => { store.setDrafts(drafts => new Map(drafts).set(key, { ...(drafts.get(key) ?? EMPTY_DRAFT), preset: prompt.preset, segments: textSegments(prompt.text) })); focusField(); }}>
              <GroupIcon name={groupIcon(prompt.preset.group)} /><span>{prompt.label}</span></button>)}</div>}
        </>}
      {notice && <div className="doan-notice thread-notice canvas-notice" role="status"><Info className="doan-alert-icon" aria-hidden="true" /><span className="strip-text"><span>{notice.text}</span></span>
        <span className="strip-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel"
          aria-label={notice.kind === "drawing" ? "Open the project conversation" : "Open the current conversation"}
          onClick={() => notice.kind === "drawing" ? props.onOpenProjectConversation(notice.open) : openConversation(notice.open)}>Open</button></span></div>}
    </div>
    <div className="cp-foot">
      <DockedComposer mode={mode} project={project} homeDirectory={null} placeholder={placeholder} chipScope={canvasScope(target)}
        pick={props.pick} link={props.composerLink} onLocate={props.onLocate}
        drafts={store.drafts} onDrafts={update => store.setDrafts(update)}
        auth={auth} picker={picker} provider={chosen} effort={effort}
        onPickerOpen={() => { if (healthy && !fixed) for (const group of picker.groups) if (group.read) support.readModels(root, group.provider); }}
        onPickModel={(picked, value) => support.pick(key, { ...(mode.kind === "new" ? { provider: picked } : {}), ...(picked !== chosen ? { permissionMode: undefined } : {}), model: value === "default" ? undefined : value })}
        onPickEffort={value => support.pick(key, { effort: value })}
        permission={permission} onPickPermission={value => support.pickPermission(key, mode.kind === "existing" || mode.kind === "archived" ? mode.conversationId : null, value, summary ? stored : undefined)}
        onSettings={props.onSettings}
        presets={support.presets} suggested={suggestedPresets(props.entry, presets)}
        onPresetsOpen={() => { if (support.presets && !support.presets.ok) support.readPresets(); }} onPresetsRetry={() => support.readPresets()}
        thumbnails={support.thumbnails} onAttach={chooseFiles} onFiles={addFiles}
        onAttachmentRemoved={attachment => { if (attachment.id) void window.doan.removeAttachment(attachment.id).catch(console.error); }}
        turn={conversationId ? turnOf(thread?.events ?? null, summary, live) : "idle"} busy={busy} canvasGone={false}
        unavailable={props.blocked} locked={props.blocked !== null} held={view.kind === "wait" || (newView?.start.pending ?? false)} fixed={fixed}
        refuse={refuse} onStartNew={() => run.choose("new")}
        queued={conversationId ? store.queue(conversationId) : []}
        onSend={send} onQueue={queue}
        onStop={() => { if (conversationId) void window.doan.interruptConversation({ conversationId }).catch(console.error); }}
        onRemoveQueued={itemId => { if (conversationId) void window.doan.removeQueuedMessage({ conversationId, itemId }).then(reply => { if (!reply || !("error" in reply)) store.unqueued(conversationId, itemId); }).catch(console.error); }}
        onOpen={openConversation} />
    </div>
  </div>;
}

// A queued message's line: chips by name, as other one-line places show them; the request keeps its markers.
export function queuedText(request: DockedRequest): string {
  return messageLine(request.text, request.anchors);
}

// The chips the canvas panel's field takes and pastes as chips: the open canvas's (design §2 'Chip field').
export function canvasScope(target: CanvasTarget): string {
  return draftKey({ kind: "new", root: target.root, canvas: target.canvas });
}

// The terminal session choice (draft panel-resume): the shared choice cards with their start radio. `held`: the session
// still works in a terminal (terminal-agent-activity draft resume-disabled); its card is disabled and its line becomes
// the reason, which describes the radio.
function ResumeChoice({ offer, reply, now, mode, held, onChoose }: { offer: Provider; reply: ResumeReply | undefined; now: number; mode: "resume" | "new"; held: boolean; onChoose(choice: "resume" | "new"): void }) {
  const at = linkedAt(reply && "available" in reply && reply.available ? reply.lastCheckAt : undefined, now);
  const reason = useId();
  // Enter picks the focused card, as ProjectChoice's do.
  const enter = (event: KeyboardEvent<HTMLInputElement>, choice: "resume" | "new") => { if (event.key === "Enter") { event.preventDefault(); onChoose(choice); } };
  return <div role="radiogroup" aria-label="How to continue" className="ob-choice-list cp-resume">
    <label className="doan-panel ob-choice" data-disabled={held ? "" : undefined}><input type="radio" name="canvas-resume" checked={mode === "resume"} disabled={held} aria-describedby={held ? reason : undefined} onChange={() => onChoose("resume")} onKeyDown={event => enter(event, "resume")} /><span className="ob-radio" aria-hidden="true" />
      <span className="ob-choice-text"><strong>{`Continue the ${PROVIDER_NAMES[offer]} session from your terminal`}</strong>
        {held ? <small id={reason}>Still working in your terminal. You can continue it when it finishes.</small> : at && <small>{`Linked by doan check at ${at}`}</small>}</span></label>
    <label className="doan-panel ob-choice"><input type="radio" name="canvas-resume" checked={mode === "new"} onChange={() => onChoose("new")} onKeyDown={event => enter(event, "new")} /><span className="ob-radio" aria-hidden="true" />
      <span className="ob-choice-text"><strong>Start a new conversation</strong><small>Uses Doan’s sign-in and your Settings defaults</small></span></label>
  </div>;
}

// The list or the history is read: blank first, then the thread's own loading line (design §2 'States').
function Waiting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return <div className="conversation-thread">{slow && <div className="thread-loading" role="status"><span className="doan-spinner" aria-hidden="true" /><span>Loading conversation…</span></div>}</div>;
}
