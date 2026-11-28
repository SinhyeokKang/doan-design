import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, Info, SquarePen } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { readPermissionMode } from "../main/conversation/permissionMode";
import { sendNowShown } from "../main/conversation/steerSupport";
import { AlertIcon } from "./AlertIcon";
import { liveReset, localClock, waitsForReset } from "./limitReset";
import type { AttachmentResult } from "../main/attachments";
import type { Anchor, Canvas } from "../main/conversation/types";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import { messageLine, type FrameName } from "../main/conversation/messageText";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { ThumbnailHub } from "./thumbnails";
import type { WorkItem } from "../main/workState";
import type { HomeMemory } from "../restore/uiState";
import type { DoanApi } from "../preload";
import { requestTitleText, stripRequestLines } from "../main/conversation/requestLines";
import { useProjectSkills, type SkillsCalls } from "./useProjectSkills";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipEscape } from "./components/ui/tooltip";
import { textSegments } from "./anchorField";
import { canvasConversationError, canvasConversationMenu, resumeHeld, titleMenuOrder } from "./canvasConversation";
import { sameCanvas } from "./canvasConversationRows";
import { canvasKey, type CanvasRun, type CanvasTarget, type CanvasView, type ResumeReply } from "./canvasRun";
import { useActivationFocus } from "./activationFocus";
import { focusFieldEnd } from "./chipField";
import { CommandCardNotice, focusPicker, SuggestionButton, type CanvasPress } from "./ComposerParts";
import { commandTurnLabel, firstTitleMessage, threadCommands, type CommandCardTarget } from "./commandView";
import { ConversationDeleteItem, type DeleteTarget } from "./ConversationDeleteDialog";
import { announcedAgain } from "./listRetry";
import { LIST_FAILED_TEXT, listFailedNotice, listRetryItem } from "./ListRetryButton";
import { ConversationHead } from "./ConversationLine";
import { ReplaceDraftDialog } from "./ReplaceDraftDialog";
import type { ReplaceDraftConfirm } from "./homeConversations";
import { ConversationLoading, ConversationThread, openReplyLink, type CanvasChipPress, type ConversationThreadHandle, type LocateOutcome } from "./ConversationThread";
import { dropAttachment, steerPhaseOf, type ConversationStore, type ListView, type QueuedMessage } from "./conversationStore";
import type { PanelArrival } from "./rightPanelOpen";
import { copyText } from "./copyText";
import { contextRing } from "./contextWindow";
import { useRingUsage } from "./ContextRing";
import { DockedComposer, type DockedFieldLink, type DockedOutcome, type DockedPicker, type DockedRequest } from "./DockedComposer";
import { carryDraft, composerTurn, draftKey, EMPTY_DRAFT, waitingAsk, type DockedMode, type DockedRefusal } from "./dockedRules";
import { generationOf, modelsKey, type DockedSupport } from "./dockedSupport";
import {
  attachRefusal, MAX_ATTACHMENTS, attachmentLimit, chosenAttachments, defaultEffort, defaultFast, defaultModel, fastToSend, defaultProvider, fixedPreference, MAX_PASTED_BYTES, modelOption, modelPickerView,
  selectableProvider, sendRefusal, suggestedPresets, suggestedPrompts, type AttachmentDraft, type NewConversationDefault, type ModelsState,
} from "./homeComposer";
import { PROVIDER_NAMES } from "./agentAuthView";
import { entryTarget } from "./overviewRun";
import type { SettingsTarget } from "./settingsSections";
import { threadItems, withSending } from "./threadItems";
import { stopBackground, threadTurn, turnOf } from "./turnStatus";
import type { ComposerChoice } from "./rememberChoice";
import { defaultPermission, permissionChoices, permissionPickerView } from "./permissionPicker";
import type { PlayingFrameChip } from "./prototype/conversation";
import { NameTip } from "./NameTip";

// CanvasRun decides which conversation shows; this body draws it and makes the calls to main, as ProjectOverview does. It
// has no head: the main window's panel puts its title menu, New and Hide above it.

// The body's calls to main: `window.doan` in the main window, the same members of `window.doanPrototype` in the
// prototype window, which has no `window.doan`.
export type ConversationCalls = SkillsCalls & Pick<DoanApi, "onAgentAuth" | "startConversation" | "sendConversation" | "queueConversation" |
  "removeQueuedMessage" | "interruptConversation" | "answerConversationPermission" | "answerConversationQuestion" | "openLink" |
  "chooseAttachments" | "addAttachmentFiles" | "addPastedImage" | "addPastedText" | "droppedPath" | "removeAttachment" | "releaseAttachments" |
  "readAgentUsage" | "onAgentUsage" | "onWindowVisible">;

export interface CanvasConversationProps {
  calls: ConversationCalls;
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
  // A model or effort pick is remembered as Last used before any send.
  onRemember?(choice: ComposerChoice): void;
  now: number;
  // Why the composer keeps its draft but takes no input: the page shows a canvas outside the list, or one whose ID
  // another canvas shares.
  blocked: string | null;
  // The open canvas's frames, which name frame chips (undefined while it has no layout); locate is unavailable while
  // the canvas cannot be shown.
  frames: readonly FrameName[] | undefined;
  locateDisabled: boolean;
  // Where focus goes once the panel shows what an entry asked for; each entry has its own seq.
  arrival: PanelArrival | null;
  // An arrival was applied: the host drops it, so a panel drawn again later does not take focus for it once more.
  onArrived(seq: number): void;
  // Chip locate from the thread and from the composer's field.
  onLocate(anchor: Anchor): Promise<LocateOutcome>;
  // A chip in an agent's reply: the host locates it on this canvas or opens another canvas.
  onReplyChip?(link: ReplyAnchor): Promise<LocateOutcome | null>;
  // A canvas chip's press, sent or in the composer: the host fits this canvas or opens another. canvasChipFits false:
  // every press opens in another window (the prototype window), so this canvas's chip does not Fit in place either.
  onCanvasChip?: CanvasChipPress;
  canvasChipFits?: boolean;
  // The person chose what the panel shows (a conversation, New).
  onChoose?(): void;
  // The composer's Pick from canvas, and the page's way into its field (pick results); a host without a board has neither.
  pick?: DockedPicker;
  composerLink?: MutableRefObject<DockedFieldLink | null>;
  // A canvas capture runs: the composer takes no canvas chip until it ends.
  capturing?: boolean;
  // Sign in and the composer's settings actions.
  onSettings(target: SettingsTarget): void;
  onNotice(text: string): void;
  // A canvas card's or handoff card's Open: that canvas of this root with its panel on that conversation, or the canvas alone.
  onOpenHandoff?(canvas: Canvas, conversationId?: string): void;
  // A handoff card from the Overview: Open shows its source conversation in this root's Overview.
  onOpenOverview?(conversationId: string): void;
  // Whether a conversation of this root still exists, for a handoff card from the Overview; without it the source counts
  // as there (the prototype window lists only the canvas's conversations), as it does while the list is read or failed.
  conversationListed?(conversationId: string): boolean;
  // The canvases terminal sessions work on: the terminal session choice waits while its session is among them.
  work: readonly WorkItem[];
  // The page's canvas press signal, for the composer's preset lists (the app's document never sees a canvas press).
  canvasPress?: CanvasPress | undefined;
  // The prototype window's playing frame, pinned on its composer and put first in every message.
  playing?: PlayingFrameChip | null;
  // The window's thumbnails, for the thread's canvas and handoff cards.
  thumbnailHub?: ThumbnailHub;
}

const NEW_PLACEHOLDER = "Ask, / for presets";
const REPLY_PLACEHOLDER = "Reply, / for presets";
const NEW = "";
// One empty list for a project without one, so the thread's memoized chip data keeps its identity across renders.
const NO_ROWS: readonly CanvasRow[] = [];
// steerPhaseOf lives with the store, which also reads it when main answers Send now; exported here for its importers.
export { steerPhaseOf };
// The composer refuses attachments (Attach, paste, drop, Capture area) when it continues a terminal session or shows an
// external agent's conversation. A resume held while its terminal works is a new conversation.
export function composerFixed(view: CanvasView, list: ListView, work: readonly WorkItem[]): boolean {
  if (view.kind === "new") return view.mode.kind === "resume" && !resumeHeld(view.resume, work);
  return view.kind === "conversation" && Array.isArray(list) && list.find(c => c.conversationId === view.conversationId)?.owner === "legacy-external";
}
// Main's answers onto their chips, wherever the draft is now; image thumbnails go to the composers' cache. Refusals go
// to `notice` as one line. The toolbar's Capture area settles its chip here too (App).
export function settleChips(store: ConversationStore, support: DockedSupport, keys: string[], results: readonly (AttachmentResult | null)[], notice: (text: string) => void): void {
  const { notices, images } = store.settleAttachments(keys, results);
  if (typeof URL.createObjectURL === "function") for (const image of images) support.setThumbnail(image.key, URL.createObjectURL(new Blob([new Uint8Array(image.thumbnail)], { type: "image/png" })));
  if (notices.length) notice(notices.join(" "));
}
// "Linked by doan check at 14:02": the time of day, with the date when it was not today.
export function linkedAt(at: string | undefined, now: number): string | null {
  const time = at ? Date.parse(at) : NaN;
  if (Number.isNaN(time)) return null;
  const date = new Date(time), today = new Date(now);
  const clock = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === today.toDateString() ? clock : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clock}`;
}

// The header's New conversation button. On the new conversation state it is aria-disabled, still focusable with its
// tooltip, and does nothing; while the list is read it focuses the composer.
export function startNewConversation(current: string | null, isNew: boolean, select: (id: string | null) => void, focus: () => void): void {
  if (isNew) return;
  if (current !== null) select(null);
  focus();
}

export function CanvasConversationTitle({ run, list, canvasName, now, seen, title, current, onPicked, onChoose, onDelete }: {
  run: CanvasRun; list: ListView; canvasName: string; now: number; seen: ReadonlySet<string>; title: string; current: string | null; onPicked(): void;
  // The person chose what the panel shows, before the run hears it.
  onChoose?(): void;
  // A row's Delete: the host asks for confirmation and returns focus to `trigger`.
  // False when it does not open the alert, so the closing menu returns focus as usual.
  onDelete?(target: DeleteTarget, trigger: HTMLElement | null): boolean;
}) {
  const target = run.target();
  // Controlled, so a Delete tooltip's Escape closes the menu too.
  const [menuOpen, setMenuOpen] = useState(false);
  // While the list is read the trigger is unavailable but stays focusable (aria-disabled, not Radix disabled, which
  // would drop a focused trigger's focus): the menu is held closed, and one open when the read began closes for good.
  const loading = list === "loading";
  useEffect(() => { if (loading) setMenuOpen(false); }, [loading]);
  // The order drawn last while the menu is open: rows keep their places, and a conversation that appears goes at the
  // end (titleMenuOrder) and keeps that place on later updates, so a row never moves under the pointer.
  const frozen = useRef<string[] | null>(null);
  frozen.current = menuOpen && Array.isArray(list) && target ? titleMenuOrder(list, target.canvas, frozen.current) : menuOpen ? frozen.current : null;
  const items = Array.isArray(list) && target ? canvasConversationMenu(list, target.canvas, current, now, seen, frozen.current) : [];
  const picked = useRef(false);
  // The trigger focus returns to after a Delete's confirmation; `deleting` keeps the closing menu from taking focus back
  // while the alert opens.
  const trigger = useRef<HTMLButtonElement | null>(null);
  const deleting = useRef(false);
  const select = (id: string | null) => { onChoose?.(); run.select(id); };
  const isNew = run.view()?.kind === "new";
  const startNew = () => startNewConversation(current, isNew, select, onPicked);
  return <><span className="ov-title-wrap doan-conv-title">
    <DropdownMenu.Root open={menuOpen && !loading} onOpenChange={open => setMenuOpen(open && !loading)}>
      <NameTip text={title}><DropdownMenu.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-disabled={loading || undefined}>
        <span>{title}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger></NameTip>
      <TooltipEscape value={() => setMenuOpen(false)}><DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu conv-menu" aria-label={`Conversations on ${canvasName}`} align="end" sideOffset={4} collisionPadding={8}
        onCloseAutoFocus={event => {
          if (deleting.current) { deleting.current = false; event.preventDefault(); return; }
          if (!picked.current) return; picked.current = false; event.preventDefault(); onPicked();
        }}>
        <DropdownMenu.RadioGroup value={current ?? NEW} onValueChange={value => { picked.current = true; select(value === NEW ? null : value); }}>
          <DropdownMenu.RadioItem value={NEW} className={`doan-menu-item conv-new${current === null ? " current" : ""}`} textValue="New conversation"><SquarePen aria-hidden="true" /><span>New conversation</span></DropdownMenu.RadioItem>
          <DropdownMenu.Separator className="doan-menu-sep" />
          <DropdownMenu.Label className="doan-menu-head">{`Conversations on ${canvasName}`}</DropdownMenu.Label>
          {list === "error" ? <div className="conv-error" role="status"><AlertIcon /><span>{announcedAgain(LIST_FAILED_TEXT, run.listRetry().failures)}</span>
            {listRetryItem(run.listRetry(), () => run.retryList())}</div>
            : <div className="conv-list">{items.map(item => <div key={item.conversationId} className="conv-row">
              <DropdownMenu.RadioItem value={item.conversationId} textValue={item.title} className={`doan-menu-item conv-item${item.selected ? " current" : ""}`}>
                <ConversationHead line={item} name={item.title} nameClass="t" />
                <span className="conv-preview">{item.preview}</span>
              </DropdownMenu.RadioItem>
              {target && <ConversationDeleteItem conversationId={item.conversationId} title={item.title} deletable={item.deletable} onDelete={() => {
                deleting.current = onDelete?.({ conversationId: item.conversationId, root: target.root, title: item.title, provider: item.provider, from: "canvas" }, trigger.current) === true;
              }} onEscape={() => setMenuOpen(false)} />}
            </div>)}</div>}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal></TooltipEscape>
    </DropdownMenu.Root>
  </span>
  <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button doan-conv-new" aria-label="New conversation" aria-disabled={isNew || undefined} onClick={startNew}><SquarePen aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent>New conversation</TooltipContent></Tooltip></>;
}

// The panel's title: the shown conversation's, or New conversation.
export function canvasConversationTitle(run: CanvasRun, list: ListView): { title: string; current: string | null } {
  const view = run.view();
  if (view?.kind !== "conversation") return { title: "New conversation", current: null };
  const summary = Array.isArray(list) ? list.find(c => c.conversationId === view.conversationId) : undefined;
  const provider = summary?.provider ?? run.store.providerOf(view.conversationId);
  const events = run.store.thread(view.conversationId)?.events ?? [];
  // Before a list names it, the first message stands in as main's title does. A command names nothing, so "Conversation"
  // stands in once the history shows only commands; while it is read the title stays empty.
  const first = provider ? firstTitleMessage(provider, events) : undefined;
  const untitled = events.some(event => event.type === "user.message") ? "Conversation" : "";
  return { title: summary?.title || (first ? messageLine(requestTitleText(first.text), first.anchors) : untitled), current: view.conversationId };
}

export function CanvasConversation(props: CanvasConversationProps) {
  const { calls, run, support, target, project, list } = props;
  const store = run.store;
  const root = target.root;
  const fitCanvasId = props.canvasChipFits === false ? null : target.canvas.id ?? null;
  // Edit and resend's "Replace your draft?" while it asks, for the conversation it was pressed in.
  const [replacing, setReplacing] = useState<{ conversationId: string; confirm: ReplaceDraftConfirm } | null>(null);
  const listed = Array.isArray(list) ? list : null;
  const view = run.view() ?? { kind: "wait" as const };
  const conversationId = view.kind === "conversation" ? view.conversationId : null;
  const unavailable = props.blocked;
  const summary = conversationId ? listed?.find(c => c.conversationId === conversationId) : undefined;
  const thread = conversationId ? store.thread(conversationId) : null;
  // A streamed delta does not redraw the host (ConversationStore.event), so the thread is redrawn from its own
  // subscription; an event merged between this render and the subscription is drawn as it starts.
  const [, redrawThread] = useState(0);
  const drawnThread = useRef(thread); drawnThread.current = thread;
  useEffect(() => {
    if (!conversationId) return;
    const stop = store.subscribeThread(conversationId, () => redrawThread(n => n + 1));
    if (store.thread(conversationId) !== drawnThread.current) redrawThread(n => n + 1);
    return stop;
  }, [store, conversationId]);
  const provider: Provider | null = conversationId ? summary?.provider ?? store.providerOf(conversationId) : null;
  // The terminal session still works in a terminal: its choice waits and a new conversation is the mode. A chosen
  // resume becomes new for good (the layout effect below), so it never comes back under a draft when the session ends.
  const held = view.kind === "new" && resumeHeld(view.resume, props.work);
  useLayoutEffect(() => { if (held) run.choose("new"); }, [held]);
  const workKey = JSON.stringify(props.work);
  useEffect(() => { run.recheckResume(); }, [workKey]);
  const mode: DockedMode = conversationId && provider ? { kind: "existing", conversationId, provider }
    : view.kind === "new" ? (held ? { kind: "new", root, canvas: target.canvas } : view.mode) : { kind: "new", root, canvas: target.canvas };
  const key = draftKey(mode);
  const draft = store.drafts.get(key) ?? EMPTY_DRAFT;
  const healthy = props.entry.kind === "list";
  const live = conversationId ? store.live(root, conversationId) : false;
  const fixed = composerFixed(view, list, props.work);

  useEffect(() => { if (!support.presets?.ok) support.readPresets(); }, []);
  useEffect(() => calls.onAgentAuth(snapshot => support.setAuth(snapshot)), []);
  // The context ring's drawer: a conversation on the person's CLI profile shows no Doan connection's usage. Until the
  // list holds its summary the owner is unknown, so a legacy conversation's first frame neither shows a row nor reads.
  const ringUsage = useRingUsage(calls, summary === undefined || summary.owner === "legacy-external");
  // The body's own composer: the panel around it differs by window.
  const body = useRef<HTMLDivElement | null>(null);
  const focusField = () => queueMicrotask(() => focusFieldEnd(body.current?.querySelector<HTMLElement>(".composer-input") ?? null));
  // Arrivals and replies can land with the window behind, so their focus is made again on activation (POSTMORTEM
  // 2026-11-17), and only while the same canvas shows the same conversation.
  const handFocus = useActivationFocus();
  const shownNow = () => { const target = run.target(); return target ? `${canvasKey(target)}\n${run.showing()?.conversationId ?? ""}` : null; };
  const editAndResend = (id: string) => {
    const shown = run.showing();
    void store.editAndResend(id).then(applied => { if (applied && shown && run.stillShowing(shown)) handFocus(() => { if (run.stillShowing(shown)) focusField(); }); });
  };

  // The composer's agent, model and effort, as the Overview's: a new conversation picks as Home does; an existing one
  // keeps its provider and starts from its own model.
  const auth = support.auth;
  const pick = support.picks[key] ?? {};
  const chosen = mode.kind === "new" ? pick.provider ?? defaultProvider(auth, props.prefs?.lastProvider, props.defaults ?? null) : mode.provider;
  const preference = mode.kind === "new" && chosen ? fixedPreference(props.defaults ?? null, chosen) : null;
  const lists: Partial<Record<Provider, ModelsState>> = Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, support.models[modelsKey(root, status.provider, status.generation)]]));
  const listState = chosen ? lists[chosen] : undefined;
  const saved = mode.kind === "new" ? (chosen ? props.prefs?.models?.[chosen] : undefined) : summary?.model ? { model: summary.model, ...(summary.effort ? { effort: summary.effort } : {}) } : undefined;
  const model = chosen && !fixed ? modelOption(listState, pick.model ?? null)?.id ?? defaultModel(listState, saved, preference) : null;
  const option = modelOption(listState, model);
  const effort = fixed ? null : pick.effort !== undefined ? defaultEffort(option, pick.effort) : defaultEffort(option, saved?.model === model ? saved.effort : undefined, preference);
  // Fast, as effort: a new conversation's from its provider's Last used, an existing one's its own stored choice.
  const fast = pick.fast ?? (mode.kind === "new" ? defaultFast(props.prefs, chosen) : summary?.fast === true);
  const picker = modelPickerView(auth, lists, { provider: chosen, model, effort, fast });
  // The mode, as the model: a new conversation's from Home's rules, an existing one's its own stored mode. A terminal
  // session takes none; its fixed trigger shows instead.
  const stored = readPermissionMode(summary?.permissionMode);
  const choices = chosen && !fixed ? permissionChoices(chosen, listState) : [];
  const permission = fixed ? null : permissionPickerView(chosen, listState, mode.kind === "new"
    ? defaultPermission(choices, pick.permissionMode, chosen ? props.prefs?.permissions?.[chosen] : undefined, preference)
    : defaultPermission(choices, pick.permissionMode ?? support.started[key] ?? stored, undefined, null), mode.kind === "new" ? undefined : summary?.claudeRunMode);
  // The run mode for the composer's status line: undefined until the list names the conversation (DockedComposer).
  const runMode = mode.kind === "new" ? null : summary ? summary.claudeRunMode ?? null : undefined;
  const permissionMode = permission?.mode;
  // An existing conversation's send names the shown mode only once it is known: before the list names the
  // conversation, Default would overwrite the mode it was started in.
  const sentMode = mode.kind === "new" || summary || pick.permissionMode !== undefined ? permissionMode : undefined;
  useEffect(() => { if (mode.kind === "existing") support.settlePermission(key, summary ? stored : null); }, [key, stored, summary !== undefined, pick.permissionMode]);
  const choiceTouched = Object.keys(pick).length > 0;
  // An existing conversation's stored mode is remembered only when it is picked here: a model pick alone must not
  // carry a mode (Full access included) the person chose for that conversation into new ones.
  const rememberedMode = mode.kind === "new" || pick.permissionMode !== undefined ? permissionMode : undefined;
  // Only a model picked here is marked: the shown one may be the provider's default (preferenceAfterPick).
  const modelPicked = { ...(pick.model !== undefined && pick.model === model ? { modelPicked: true as const } : {}), ...(pick.effort !== undefined ? { effortPicked: true as const } : {}) };
  useEffect(() => { if (choiceTouched && chosen) props.onRemember?.({ provider: chosen, model, effort, ...modelPicked, ...(rememberedMode ? { permissionMode: rememberedMode } : {}) }); }, [choiceTouched, chosen, model, effort, rememberedMode, pick.model, pick.effort]);
  const ready = chosen !== null && (auth?.providers ?? []).some(status => status.provider === chosen && status.account !== null && selectableProvider(status));
  // A new connection of the provider has a list of its own to read.
  const generation = chosen ? generationOf(auth, chosen) : 0;
  const projectSkills = useProjectSkills(calls, root, chosen, conversationId ? composerTurn(thread?.events ?? null, summary, live) : "idle", generation, conversationId);
  useEffect(() => { if (healthy && chosen && ready && !fixed) support.readModels(root, chosen); }, [root, healthy, chosen, ready, fixed, generation]);

  const presets = support.presets?.ok ? support.presets.result.presets : [];
  const prompts = view.kind === "new" && mode.kind === "new" && ready && healthy ? suggestedPrompts(props.entry, project, presets) : [];
  const started = draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0;

  // The thread, and an entry's request, which opens the answer popover.
  const handle = useRef<ConversationThreadHandle | null>(null);
  const commands = conversationId && provider && thread ? threadCommands(provider, thread.events, store.boundaries(conversationId)) : null;
  const items = thread?.read === "ready" ? withSending(threadItems(thread.events, root, live, commands ?? undefined), conversationId ? store.sending(conversationId) : []) : thread?.read === "error" || thread?.read === "retrying" ? "error" as const : null;
  // A command turn takes no message into it (main refuses Send now), so its rows wait for it to end.
  const lastTurn = thread ? turnOf(thread.events, live) : null;
  const commandRuns = !!lastTurn && !lastTurn.ended && !!commands?.turns.has(lastTurn.turnId);
  const card = store.card(key);
  const cardAction = (target: CommandCardTarget) => {
    if (target === "agentsSettings") props.onSettings({ section: "agents", ...(chosen ? { provider: chosen } : {}) });
    else focusPicker(body.current, target);
  };
  const dismissCard = () => { store.showCard(key, null); focusField(); };
  const scroll = conversationId ? run.scrollRequest(conversationId) : null;
  const asking = summary?.phase === "waiting";
  // A badge or sidebar entry (the prototype window's badge too): the popover opens on the earliest request and takes focus.
  useEffect(() => {
    if (!conversationId || !scroll || !Array.isArray(items)) return;
    const target = entryTarget(items, asking);
    if (target.kind === "wait") return;
    run.takeScroll(conversationId);
    if (target.kind !== "item") return;
    store.expandPopover(conversationId);
    const shown = shownNow();
    handFocus(() => { if (shownNow() === shown) handle.current?.focusItem(target.key); });
  }, [conversationId, scroll?.seq, Array.isArray(items) ? items.length : -1, asking]);
  // An entry's focus: a permission's first choice once its request draws, a question's first option or input, else the
  // composer. Each arrival is applied once; one with nothing pending falls back to the composer.
  const arrived = useRef(0);
  // The canvas this render's view belongs to. Read here, not in the effect: the page's layout effect shows a newly
  // opened canvas before this effect runs, while the view and items below are still the canvas left behind.
  const viewTarget = run.target();
  useEffect(() => {
    const arrival = props.arrival;
    if (!arrival || arrival.seq === arrived.current || view.kind === "wait") return;
    // The item that takes focus, else the composer.
    let item: string | null = null;
    if (arrival.focus === "permission" && conversationId) {
      if (!Array.isArray(items)) return;
      const ask = entryTarget(items, asking);
      if (ask.kind === "wait") return;
      arrived.current = arrival.seq;
      props.onArrived(arrival.seq);
      if (ask.kind === "item") {
        store.expandPopover(conversationId);
        item = ask.key;
      }
    } else if (arrival.focus === "handoff" && arrival.handoff) {
      // After a handoff's move: the receiving thread's card, once its history draws. The render that brings the arrival
      // still shows the canvas left behind (the run shows the new one after it), whose thread has no card.
      const to = arrival.handoff, shown = viewTarget;
      if (!shown || shown.root !== to.root || !sameCanvas(shown.canvas, to.canvas)) return;
      // Waits while the history reads; an unreadable one gives focus to the composer.
      if (conversationId === to.conversationId && items === null) return;
      arrived.current = arrival.seq;
      props.onArrived(arrival.seq);
      const card = conversationId === to.conversationId && Array.isArray(items) ? items.find(item => item.kind === "handoffCard") : undefined;
      if (card) {
        handle.current?.scrollToItem(card.key);
        item = card.key;
      }
    } else { arrived.current = arrival.seq; props.onArrived(arrival.seq); }
    const shown = shownNow();
    handFocus(() => {
      if (shownNow() !== shown) return;
      if (item === null || !handle.current?.focusItem(item)) focusField();
    });
  }, [props.arrival?.seq, view.kind, conversationId, Array.isArray(items) ? items.length : -1, asking]);

  // Attachments go through main, which checks each file; each answer lands on its chip wherever the draft is now.
  // Refusals go to the composer's own notice (`report`), as Home's go under its composer.
  const settle = (keys: string[], results: readonly (AttachmentResult | null)[], report: (text: string) => void) => settleChips(store, support, keys, results, report);
  const addChips = (at: string, chips: AttachmentDraft[]) => store.setDrafts(drafts => {
    const current = drafts.get(at) ?? EMPTY_DRAFT;
    return new Map(drafts).set(at, { ...current, attachments: [...current.attachments, ...chips] });
  });
  const addFiles = (files: File[], pasted: boolean, report: (text: string) => void) => {
    if (fixed) return;
    const at = key;
    const limit = attachmentLimit(draft.attachments.length, files.map(file => ({ pasted: false, size: file.size })));
    if (limit.notices.length) report(limit.notices.join(" "));
    const accepted = limit.accept.map(i => files[i]!);
    if (!accepted.length) return;
    const keys = accepted.map(() => crypto.randomUUID());
    addChips(at, accepted.map((file, i) => ({ key: keys[i]!, name: file.name, kind: file.type.startsWith("image/") ? "image" : "file", pasted: false, status: "checking", size: file.size })));
    void calls.addAttachmentFiles(accepted).catch(() => null).then(async results => {
      if (!results) { settle(keys, keys.map(() => null), report); return; }
      // A copied screenshot has no path on disk; it attaches as a pasted image instead. A Finder item main no longer
      // finds keeps main's answer: a folder named x.png has File.type image/png too.
      const final = await Promise.all(results.map(async (result, i) => {
        const file = accepted[i]!;
        if (!pasted || result.ok || result.error !== "not_found" || !file.type.startsWith("image/") || calls.droppedPath(file) !== null) return result;
        if (file.size > MAX_PASTED_BYTES) return { ok: false as const, name: "Pasted image", error: "too_large" as const };
        // A page-made image whose bytes can't be read settles with the rest of its batch.
        const bytes = await file.arrayBuffer().catch(() => null);
        if (!bytes) return result;
        return calls.addPastedImage(bytes).catch(() => null);
      }));
      settle(keys, final, report);
    });
  };
  const addPastedText = async (text: string, meta: { lines: number; excerpt: string }, report: (text: string) => void): Promise<boolean> => {
    if (fixed) return false;
    const at = key;
    // The store reserves the place immediately; a second paste can arrive before the next render.
    if ((store.drafts.get(at) ?? EMPTY_DRAFT).attachments.length >= MAX_ATTACHMENTS) { report(attachRefusal("limit", "Pasted text", "pastedText")); return false; }
    const chip = crypto.randomUUID();
    addChips(at, [{ key: chip, name: "Pasted text", kind: "file", pasted: true, status: "checking", ...meta }]);
    const result = await calls.addPastedText(text, meta).catch(() => null);
    settle([chip], [result], report);
    return !!result?.ok && [...store.drafts.values()].some(draft => draft.attachments.some(a => a.key === chip && a.status === "ready"));
  };
  const chooseFiles = (report: (text: string) => void) => {
    if (fixed) return;
    const at = key;
    void calls.chooseAttachments().catch(() => []).then(results => {
      const { chosen: chosenFiles, release, notices } = chosenAttachments((store.drafts.get(at) ?? EMPTY_DRAFT).attachments.length, results);
      for (const id of release) void calls.removeAttachment(id);
      const keys = chosenFiles.map(() => crypto.randomUUID());
      addChips(at, chosenFiles.map((result, i) => ({ key: keys[i]!, name: result.ok ? result.attachment.name : result.name, kind: "file", pasted: false, status: "checking" })));
      settle(keys, chosenFiles, report);
      if (notices.length) report(notices.join(" "));
    });
  };

  // Every reply carries the panel's revision from when it was sent, so a reply that lands after the person chose something
  // else, or after another canvas opened, leaves that choice alone (POSTMORTEM 2026-10-26).
  const changedModel = pick.model !== undefined || pick.effort !== undefined;
  const changedFast = fastToSend(pick.fast, fixed ? null : chosen, picker.effort?.fast ?? null);
  const send = async (request: DockedRequest): Promise<DockedOutcome> => {
    const revision = run.revision();
    if (mode.kind === "new" || mode.kind === "resume") {
      const runtime = mode.kind === "resume" ? mode.provider : chosen;
      if (!runtime) return { error: "no_agent" };
      const start = mode.kind === "resume"
        ? { root, mode: "resume" as const, canvas: target.canvas, text: request.text, anchors: [...request.anchors] }
        : { root, mode: "new" as const, runtime, canvas: target.canvas, text: request.text, anchors: [...request.anchors],
          ...(model ? { model } : {}), ...(model && effort ? { effort } : {}), ...(picker.effort?.fast?.on ? { fast: true } : {}), ...(permissionMode && permissionMode !== "default" ? { permissionMode } : {}), ...(request.attachments.length ? { attachments: request.attachments } : {}) };
      const sending = run.startSending(target);
      const reply = await calls.startConversation(start).catch(() => ({ error: "unknown" })).finally(sending);
      if ("error" in reply) return sendRefusal(reply);
      store.markSent(reply.conversationId, request.text, 0);
      // Home's and the Overview's starts are remembered by App's run host; this one starts here.
      if (mode.kind === "new") props.onRemember?.({ provider: runtime, model: model ?? null, effort: model ? effort : null, ...modelPicked, ...(permissionMode ? { permissionMode } : {}) });
      support.clearPick(key);
      if (mode.kind === "new" && permissionMode) support.startedIn(draftKey({ kind: "existing", conversationId: reply.conversationId, provider: runtime }), permissionMode);
      run.started(target, reply.conversationId, runtime, revision);
      // The panel shows the started conversation, by this reply or a list read that came first, unless the person chose
      // something else meanwhile; only then does a command's leftover follow it.
      const view = run.view();
      const follows = view?.kind === "conversation" && view.conversationId === reply.conversationId;
      return { ok: true, ...(follows ? { conversationId: reply.conversationId } : {}) };
    }
    // A message that waits for the usage limit's reset carries no picker change; the picks stay for the next send.
    const waits = waitsForReset(summary);
    const unmark = store.markSent(mode.conversationId, request.text);
    const reply = await calls.sendConversation({
      conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors],
      ...(waits ? {} : { ...(changedModel && model && !fixed ? { model, ...(effort ? { effort } : {}) } : {}), ...changedFast, ...(sentMode ? { permissionMode: sentMode } : {}) }), ...(request.attachments.length ? { attachments: request.attachments } : {}),
    }).catch(() => ({ error: "unknown" }));
    if (reply && ("error" in reply || "scheduled" in reply)) unmark();
    if (reply && "error" in reply) return sendRefusal(reply);
    if (reply && "scheduled" in reply) {
      store.queued(root, mode.conversationId, queuedMessage(reply.scheduled.itemId, request));
      return { ok: true, itemId: reply.scheduled.itemId };
    }
    return { ok: true };
  };
  const queue = async (request: DockedRequest): Promise<DockedOutcome> => {
    if (mode.kind !== "existing") return { error: "not_running" };
    const reply = await calls.queueConversation({ conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors], ...(request.attachments.length ? { attachments: request.attachments } : {}) }).catch(() => ({ error: "unknown" as const }));
    if ("error" in reply) return sendRefusal(reply);
    store.queued(root, mode.conversationId, queuedMessage(reply.itemId, request));
    return { ok: true, itemId: reply.itemId };
  };
  // The canvas panel's reading of a refusal (canvasConversationError): attachment_missing is the composer's own.
  const refuse = (code: string, provider: Provider, resets: string | null): DockedRefusal => {
    const error = canvasConversationError(code, mode, provider, project, [], resets);
    switch (error.kind) {
      case "blocked": return { kind: "blocked", text: error.text, ...(error.action ? { action: error.action } : {}) };
      case "notice": {
        return { kind: "notice", text: error.text, ...(error.retry ? { retry: true } : {}), ...(error.startNew ? { startNew: true } : {}) };
      }
      // attachments and resend never reach here: the composer marks moved files and resends not_running itself.
      default: return { kind: "notice", text: "Couldn’t send your message. Try again." };
    }
  };
  const newView = view.kind === "new" ? view : null;
  // A refused terminal session switches to the new conversation that shares its field; a conversation another sign-in
  // owns leaves for a new one on this canvas, taking the refused draft along.
  const startNewAfterRefusal = () => {
    if (mode.kind !== "existing") { run.choose("new"); return; }
    store.setDrafts(drafts => carryDraft(drafts, key, draftKey({ kind: "new", root, canvas: target.canvas })));
    props.onChoose?.(); run.select(null);
  };

  // A preset's line and the suggestion stand in for it inside the composer (dockedRules composerPlaceholder).
  const placeholder = view.kind === "new" && mode.kind === "new" ? NEW_PLACEHOLDER : REPLY_PLACEHOLDER;
  // A held session a terminal process holds is not offered to run, but its choice shows, waiting.
  const offer = newView?.start.offer ?? (held && newView?.resume && "runtime" in newView.resume ? newView.resume.runtime ?? null : null);
  const resume = offer ? newView : null;

  return <div className="doan-conv-content" ref={body}>
    <div className={`cp-scroll${conversationId ? "" : " end"}`}>
      {conversationId && provider ? <ConversationThread ref={handle} conversationId={conversationId} items={items} provider={provider} project={project} visibility={calls}
        liveAfter={thread?.liveAfter ?? Number.MAX_SAFE_INTEGER} turn={thread && Array.isArray(items) ? threadTurn(thread.events, items, live, store.stageOf(conversationId), root, summary?.stopping === true, turnId => commands && commandTurnLabel(provider, commands, turnId)) : null}
        card={card} onCardAction={cardAction} onCardDismiss={dismissCard}
        background={summary?.background ?? null} onStopBackground={turnId => stopBackground({ conversationId, turnId }, request => calls.interruptConversation(request)).then(failed => { if (failed) props.onNotice(failed); return failed === null; })} canvasListed={canvas => props.entry.kind === "list" && props.entry.canvases.some(row => sameCanvas(canvas, row))}
        onAnswer={(requestId, optionId) => calls.answerConversationPermission({ conversationId, requestId, optionId })}
        onAnswerQuestion={(requestId, answer) => calls.answerConversationQuestion({ conversationId, requestId, ...answer })}
        questionDraft={requestId => store.questionDraft(conversationId, requestId)} onQuestionDraft={(requestId, action) => store.editQuestion(conversationId, requestId, action)}
        popoverCollapsed={waiting => store.popoverCollapsed(conversationId, waiting)} onCollapse={waiting => store.collapsePopover(conversationId, waiting)} onExpand={() => store.expandPopover(conversationId)}
        onFocusComposer={focusField}
        onStop={() => void calls.interruptConversation({ conversationId }).catch(console.error)}
        onEditAndResend={() => {
          const confirm = store.editAndResendConfirm(conversationId);
          if (confirm) setReplacing({ conversationId, confirm }); else editAndResend(conversationId);
        }}
        onSignIn={() => props.onSettings({ section: "agents", provider })}
        limitResets={liveReset(summary?.limitResetsAt, props.now, localClock())} resendHidden={store.resendHidden(conversationId)}
        onRetry={() => store.retryThread(conversationId)} retry={thread ? { running: thread.read === "retrying", failures: thread.failures ?? 0 } : undefined}
        onOpenCanvas={() => {}} {...(props.onOpenHandoff ? { onOpenHandoff: props.onOpenHandoff } : {})} {...(props.onOpenOverview ? { onOpenOverview: props.onOpenOverview } : {})}
        {...(props.conversationListed ? { conversationListed: props.conversationListed } : {})}
        onOpenLink={url => void openReplyLink(target => calls.openLink(target), url, props.onNotice)}
        onCopy={async text => { const ok = copyText(text); if (ok) props.onNotice("Copied code"); return ok; }}
        onLocate={props.onLocate} locateDisabled={props.locateDisabled} frames={props.frames}
        {...(props.onReplyChip ? { onReplyChip: props.onReplyChip } : {})} {...(props.onCanvasChip ? { onCanvasChip: props.onCanvasChip } : {})} fitCanvasId={fitCanvasId} openCanvasId={target.canvas.id ?? null} openCanvasPath={target.canvas.path} canvasRows={props.entry.kind === "list" ? props.entry.canvases : NO_ROWS}
        now={props.now} {...(props.thumbnailHub ? { thumbnails: { hub: props.thumbnailHub, root } } : {})}
        localSends={store.localSends(conversationId)} onSpendSends={marks => store.spendSends(conversationId, marks)} stopping={summary?.stopping === true} />
        : view.kind === "wait" || conversationId ? <ConversationLoading /> : <>
          {newView?.listError && listFailedNotice(run.listRetry(), () => run.retryList())}
          {card && <CommandCardNotice card={card} onAction={cardAction} onDismiss={dismissCard} />}
          {resume && <ResumeChoice offer={offer!} reply={resume.resume} now={props.now} mode={held ? "new" : resume.start.mode} held={held} onChoose={choice => { run.choose(choice); focusField(); }} />}
          {/* In place of the choice: a terminal session Doan could not check is not offered, and this says why. */}
          {!resume && newView?.start.reason && <div className="doan-notice thread-notice" role="status"><Info className="doan-alert-icon" aria-hidden="true" /><span className="strip-text selectable"><span>{newView.start.reason}</span></span></div>}
          {prompts.length > 0 && !started && !resume && <div className="ov-suggestions" role="group" aria-label="Suggested prompts">{prompts.map(prompt =>
            <SuggestionButton key={prompt.label} prompt={prompt} onPick={() => { store.setDrafts(drafts => new Map(drafts).set(key, { ...(drafts.get(key) ?? EMPTY_DRAFT), preset: prompt.preset, segments: textSegments(prompt.text) })); focusField(); }} />)}</div>}
        </>}
    </div>
    <div className="cp-foot">
      <DockedComposer skills={projectSkills.skills} passthrough={projectSkills.passthrough} onSkillsWanted={projectSkills.read} onCard={next => store.showCard(key, next)} card={card} mode={mode} project={project} homeDirectory={null} placeholder={placeholder} suggestion={summary ? summary.suggestion ?? null : undefined} chipScope={canvasScope(target)}
        {...(props.pick ? { pick: props.pick } : {})} capturing={!!props.capturing} canvasChips={{ place: "canvas", root: target.root, canvases: props.entry.kind === "list" ? props.entry.canvases : NO_ROWS }} {...(props.composerLink ? { link: props.composerLink } : {})} onLocate={props.onLocate} onCanvasChip={props.onCanvasChip} fitCanvasId={fitCanvasId} canvasPress={props.canvasPress}
        drafts={store.drafts} onDrafts={update => store.setDrafts(update)}
        auth={auth} picker={picker} provider={chosen} effort={effort}
        onPickerOpen={() => { if (healthy && !fixed) for (const group of picker.groups) if (group.read) support.readModels(root, group.provider); }}
        onPickModel={(picked, value) => support.pick(key, { ...(mode.kind === "new" ? { provider: picked } : {}), ...(picked !== chosen ? { permissionMode: undefined, fast: undefined } : {}),
          // A picked level belongs to the model it was picked for (Home keeps one per provider and model).
          ...(picked !== chosen || (value ?? null) !== model ? { effort: undefined } : {}), model: value ?? undefined })}
        onPickEffort={value => support.pick(key, { effort: value })} onPickFast={on => { support.pick(key, { fast: on }); if (chosen) props.onRemember?.({ provider: chosen, model, effort, ...modelPicked, fast: on }); }}
        permission={permission} runMode={runMode} onPickPermission={value => support.pickPermission(key, mode.kind === "existing" ? mode.conversationId : null, value, summary ? stored : undefined)}
        onSettings={props.onSettings}
        presets={support.presets} suggested={suggestedPresets(props.entry, presets)}
        onPresetsOpen={() => { if (support.presets && !support.presets.ok) support.readPresets(); }} onPresetsRetry={() => support.retryPresets()}
        thumbnails={support.thumbnails} onAttach={chooseFiles} onFiles={addFiles} onPastedText={addPastedText}
        onAttachmentRemoved={attachment => dropAttachment(calls, attachment)}
        turn={conversationId ? composerTurn(thread?.events ?? null, summary, live) : "idle"} asks={conversationId ? waitingAsk(thread?.events ?? null) : null} canvasGone={false} context={thread ? contextRing(thread.events, commands?.usageStale) : null} usage={ringUsage}
        unavailable={unavailable} locked={unavailable !== null} playing={props.playing ?? null} held={view.kind === "wait" || (newView?.start.pending ?? false)} fixed={fixed}
        stepAside={{ waiting: asking, notice: !conversationId && view.kind !== "wait" && !!resume }}
        refuse={refuse} onStartNew={startNewAfterRefusal}
        queued={conversationId ? store.queue(conversationId) : []}
        // Rows waiting for the usage limit's reset have no Send now: nothing runs to take them.
        limitResetsAt={summary?.limitResetsAt ?? null} scheduledFor={summary?.scheduledAt ?? null}
        sendNow={!!conversationId && !!provider && !summary?.scheduledAt && !commandRuns && sendNowShown({ provider, phase: steerPhaseOf(thread?.events ?? null, summary, live), sending: false })}
        onSendQueuedNow={itemId => conversationId ? store.sendQueuedNow(conversationId, itemId) : Promise.resolve({ error: "not_running" })}
        onSend={send} onQueue={queue}
        onStop={() => { if (conversationId) void calls.interruptConversation({ conversationId }).catch(console.error); }}
        onRemoveQueued={async itemId => {
          if (!conversationId) return false;
          const reply = await calls.removeQueuedMessage({ conversationId, itemId }).catch(error => { console.error(error); return { error: "unknown" }; });
          if (reply && "error" in reply) return false;
          store.unqueued(conversationId, itemId);
          return true;
        }}
      />
    </div>
    {replacing && <ReplaceDraftDialog confirm={replacing.confirm} onKeep={() => { setReplacing(null); focusField(); }}
      onReplace={() => { setReplacing(null); editAndResend(replacing.conversationId); }} />}
  </div>;
}

// A queued message's line: chips by name, as other one-line places show them; the request keeps its markers.
export function queuedText(request: DockedRequest): string {
  return messageLine(stripRequestLines(request.text), request.anchors);
}
// The row shows the line; the request itself is kept for the thread, where Send now moves the message.
export function queuedMessage(itemId: string, request: DockedRequest): QueuedMessage {
  return { id: itemId, text: queuedText(request), message: { text: request.text, anchors: request.anchors, attachments: request.files ?? [] }, ...(request.command ? { command: true as const } : {}) };
}

// The chips the canvas panel's field takes and pastes as chips: the open canvas's.
export function canvasScope(target: CanvasTarget): string {
  return draftKey({ kind: "new", root: target.root, canvas: target.canvas });
}

// `held`: the session still works in a terminal; its card is disabled and its line becomes the reason, which describes
// the radio.
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
