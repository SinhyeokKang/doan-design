import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ArrowUpRight, Check, ChevronDown, FolderOpen, GitBranch, Plus, Settings, SquarePen } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { readPermissionMode } from "../main/conversation/permissionMode";
import { sendNowShown } from "../main/conversation/steerSupport";
import type { ConversationSummary } from "../main/conversation/summary";
import type { AttachmentResult } from "../main/attachments";
import type { Canvas, ConversationEvent } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { HomeMemory } from "../restore/uiState";
import { AlertIcon } from "./AlertIcon";
import { plainText, textSegments } from "./anchorField";
import { startNewConversation, steerPhaseOf } from "./CanvasConversationPanel";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { canvasLabel } from "./canvasTree";
import { focusFieldEnd } from "./chipField";
import { GroupIcon } from "./ComposerParts";
import { ConversationDeleteItem, type DeleteTarget } from "./ConversationDeleteDialog";
import { ConversationHead } from "./ConversationLine";
import { ConversationThread, LOADING_DELAY_MS, type ConversationThreadHandle, type LocateOutcome } from "./ConversationThread";
import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import { asksPerson, stripState } from "./conversationStrip";
import { copyText } from "./copyText";
import { DockedComposer, type DockedOutcome, type DockedRequest } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedBusy, type DockedMode } from "./dockedRules";
import { modelsKey, type DockedSupport } from "./dockedSupport";
import { cardRow, ROW_ACTION_LABELS, type RowAction } from "./homeCards";
import {
  attachmentLimit, defaultEffort, defaultModel, defaultProvider, fixedPreference, groupIcon, modelOption, modelPickerView, presetPlaceholder,
  selectableProvider, suggestedPresets, suggestedPrompts, type AttachmentDraft, type ModelsState, type NewConversationDefault,
} from "./homeComposer";
import type { LastRequest } from "./homeConversations";
import type { StartInput, StartOutcome } from "./HomeComposerView";
import { projectConversationMenu } from "./overviewConversation";
import { scrollTarget, type ListView, type OverviewRun } from "./overviewRun";
import { displayPath } from "./projectDisplay";
import { projectHue, projectInitial } from "./shellNavigation";
import type { SettingsTarget } from "./settingsSections";
import { threadItems, withSending } from "./threadItems";
import type { ComposerChoice } from "./rememberChoice";
import { defaultPermission, permissionChoices, permissionPickerView } from "./permissionPicker";

// The project Overview as the project conversation screen (buzz-project design §2.1, §2.2, §2.5): the header with the
// project, its worktree chip and the conversation dropdown, the thread and the docked composer. OverviewRun decides
// which conversation shows; this component draws it and makes the calls to main the thread and composer ask for.

export interface ProjectOverviewProps {
  run: OverviewRun;
  support: DockedSupport;
  root: string;
  project: string;
  entry: FolderEntry;
  // The project's worktrees (the sidebar card's rows): two or more make the branch chip a worktree menu.
  worktrees: readonly FolderEntry[];
  homeDirectory: string | null;
  // The duplicate-ID notice (App's), under the header.
  notice: string | null;
  // Home's reason when the open Overview's project turned into a problem (spec decision 12); Send waits on it.
  unavailable: string | null;
  list: ListView;
  // HomeRun's pending seen marks, so a status never flashes back between a mark and the next read.
  seen: ReadonlySet<string>;
  // The project conversation that holds this root (HomeRun's running map).
  holder: { conversationId: string } | null;
  prefs: HomeMemory | null;
  defaults: NewConversationDefault | null | undefined;
  // A model or effort pick is remembered as Last used before any send (dogfooding #6).
  onRemember?(choice: ComposerChoice): void;
  now: number;
  onWorktree(root: string): void;
  // A promoted conversation's canvas, opened with that conversation in its panel.
  onOpenCanvas(canvas: Canvas, conversationId?: string): void;
  // A chip in an agent's reply (agent-reply-chips): the host opens its canvas and moves to its target.
  onReplyChip?(link: ReplyAnchor): Promise<LocateOutcome | null>;
  onRetryList(): void;
  onStart(request: StartInput, last: LastRequest): Promise<StartOutcome>;
  // A send in an existing conversation, through HomeRun so the new canvas its turn makes opens (spec decision 6).
  onSendConversation(provider: Provider, request: Parameters<Window["doan"]["sendConversation"]>[0]): Promise<void | { error: string; missing?: string[] }>;
  // A problem worktree's repair actions in the branch chip's menu, as the sidebar's project menu runs them.
  onAction(name: RowAction, root: string): void;
  onProjectSettings(root: string): void;
  onSettings(target: SettingsTarget): void;
  onNotice?(text: string): void;
  // A row's Delete in the title menu: the host asks for confirmation and returns focus to `trigger` (design §3.4). False
  // when it does not open the alert (another modal, a locked page), so the closing menu returns focus as usual.
  onDeleteConversation?(target: DeleteTarget, trigger: HTMLElement | null): boolean;
}

const NEW_PLACEHOLDER = "Ask or describe what to design, / for presets";
const REPLY_PLACEHOLDER = "Reply, / for presets";
const NEW = "";
// One empty list for a project without one, so the thread's memoized chip data keeps its identity across renders.
const NO_ROWS: readonly CanvasRow[] = [];

// A worktree row in the branch chip's menu does what the sidebar's does (design §2.1): a listed or reading worktree
// opens its Overview; a problem one turns the menu to its repair actions. Show in Finder and Project Settings are
// fixed items there, and removing the project stays in the sidebar.
export function worktreeChoice(row: FolderEntry): { kind: "open" } | { kind: "repair"; actions: RowAction[] } {
  if (row.kind === "list" || row.kind === "loading") return { kind: "open" };
  return { kind: "repair", actions: cardRow(row, null, null).actions.filter(action => action !== "remove" && action !== "showInFinder") };
}

// The canvas a conversation names, as main matches it: an ID on either side matches by ID only, else the path.
export function sameCanvas(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}
const focusField = () => queueMicrotask(() => focusFieldEnd(document.querySelector<HTMLElement>(".ov-main .composer-input")));
// Main's turn as the composer reads it: the merged events first (the list lags them), then the list's work flag.
function turnOf(events: readonly ConversationEvent[] | null, summary: ConversationSummary | undefined, live: boolean): "idle" | "running" | "waiting" {
  const kind = events && events.length ? stripState(events).kind : null;
  if (kind !== null && asksPerson(kind)) return "waiting";
  if ((kind === "starting" || kind === "working") && live) return "running";
  if (summary?.phase === "waiting") return "waiting";
  return summary?.working ? "running" : "idle";
}

export function ProjectOverview(props: ProjectOverviewProps) {
  const { run, support, root, project, list } = props;
  const listed = Array.isArray(list) ? list : null;
  const view = run.view(root);
  // A failed first read leaves nothing to wait for: the column is a new conversation (design §2.5).
  const conversationId = view.kind === "conversation" ? view.conversationId : null;
  const waiting = view.kind === "wait" && list !== "error";
  const summary = conversationId ? listed?.find(c => c.conversationId === conversationId) : undefined;
  const thread = conversationId ? run.thread(conversationId) : null;
  const provider: Provider | null = conversationId ? summary?.provider ?? run.providerOf(conversationId) : null;
  const mode: DockedMode = conversationId && provider ? { kind: "existing", conversationId, provider } : { kind: "new", root };
  const key = draftKey(mode);
  const draft = run.drafts.get(key) ?? EMPTY_DRAFT;
  const healthy = props.entry.kind === "list" && !props.unavailable;
  const live = conversationId ? run.live(root, conversationId) : false;

  // Presets are read once for the run; accounts come from main's snapshots.
  useEffect(() => { if (!support.presets?.ok) support.readPresets(); }, []);
  useEffect(() => window.doan.onAgentAuth(snapshot => support.setAuth(snapshot)), []);

  // The composer's agent, model and effort, as Home decides them for a new conversation; an existing one keeps its
  // provider and starts from its own model.
  const auth = support.auth;
  const pick = support.picks[key] ?? {};
  const chosen = mode.kind === "new" ? pick.provider ?? defaultProvider(auth, props.prefs?.lastProvider, props.defaults ?? null) : mode.provider;
  const fixed = mode.kind === "new" && chosen ? fixedPreference(props.defaults ?? null, chosen) : null;
  const lists: Partial<Record<Provider, ModelsState>> = Object.fromEntries((auth?.providers ?? []).map(status => [status.provider, support.models[modelsKey(root, status.provider)]]));
  const listState = chosen ? lists[chosen] : undefined;
  const saved = mode.kind === "new" ? (chosen ? props.prefs?.models?.[chosen] : undefined) : summary?.model ? { model: summary.model, ...(summary.effort ? { effort: summary.effort } : {}) } : undefined;
  const model = chosen ? modelOption(listState, pick.model ?? null)?.id ?? defaultModel(listState, saved, fixed) : null;
  const option = modelOption(listState, model);
  const effort = pick.effort !== undefined ? defaultEffort(option, pick.effort) : defaultEffort(option, saved?.model === model ? saved?.effort : undefined, fixed);
  const picker = modelPickerView(auth, lists, { provider: chosen, model, effort });
  // The mode, as the model: a new conversation's from Home's rules, an existing one's its own stored mode.
  const stored = readPermissionMode(summary?.permissionMode);
  const choices = chosen ? permissionChoices(chosen, listState) : [];
  const permission = permissionPickerView(chosen, listState, mode.kind === "new"
    ? defaultPermission(choices, pick.permissionMode, chosen ? props.prefs?.permissions?.[chosen] : undefined, fixed)
    : defaultPermission(choices, pick.permissionMode ?? support.started[key] ?? stored, undefined, null));
  const permissionMode = permission?.mode;
  // An existing conversation's send names the shown mode only once it is known: before the list names the
  // conversation, Default would overwrite the mode it was started in.
  const sentMode = mode.kind === "new" || summary || pick.permissionMode !== undefined ? permissionMode : undefined;
  useEffect(() => { if (mode.kind !== "new") support.settlePermission(key, summary ? stored : null); }, [key, stored, summary !== undefined, pick.permissionMode]);
  const choiceTouched = Object.keys(pick).length > 0;
  // An existing conversation's stored mode is remembered only when it is picked here: a model pick alone must not
  // carry a mode (Full access included) the person chose for that conversation into new ones.
  const rememberedMode = mode.kind === "new" || pick.permissionMode !== undefined ? permissionMode : undefined;
  useEffect(() => { if (choiceTouched && chosen) props.onRemember?.({ provider: chosen, model, effort, ...(rememberedMode ? { permissionMode: rememberedMode } : {}) }); }, [choiceTouched, chosen, model, effort, rememberedMode]);
  const ready = chosen !== null && (auth?.providers ?? []).some(status => status.provider === chosen && status.account !== null && selectableProvider(status));
  useEffect(() => { if (healthy && chosen && ready) support.readModels(root, chosen); }, [root, healthy, chosen, ready]);

  const presets = support.presets?.ok ? support.presets.result.presets : [];
  const prompts = mode.kind === "new" && !waiting && ready && healthy ? suggestedPrompts(props.entry, project, presets) : [];
  const started = draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0;

  // The thread
  const handle = useRef<ConversationThreadHandle | null>(null);
  const items = thread?.read === "ready" ? withSending(threadItems(thread.events, root, live), conversationId ? run.sending(conversationId) : []) : thread?.read === "error" ? "error" as const : null;
  // An entry's scroll, also for the conversation already shown; it waits for the request's item when the list told
  // of it before its event arrived.
  const scroll = conversationId ? run.scrollRequest(conversationId) : null;
  const asking = summary?.phase === "waiting";
  useEffect(() => {
    if (!conversationId || !scroll || !Array.isArray(items)) return;
    const target = scrollTarget(items, asking);
    if (target.kind === "wait") return;
    run.takeScroll(conversationId);
    if (target.kind !== "item") return;
    handle.current?.scrollToItem(target.key);
    // A question's entry also focuses its first option or answer input (agent-questions design §6); a permission
    // request's entry only scrolls here.
    if (items.some(item => item.key === target.key && item.kind === "question")) handle.current?.focusItem(target.key);
  }, [conversationId, scroll?.seq, Array.isArray(items) ? items.length : -1, asking]);
  const canvasListed = (canvas: Canvas) => props.entry.kind === "list" && props.entry.canvases.some(row => sameCanvas(canvas, row));
  const editAndResend = (id: string) => { void run.editAndResend(root, id).then(focus => { if (focus) focusField(); }); };

  // Attachments go through main, which checks each file; each answer lands on its chip wherever the draft is now.
  const settle = (keys: string[], results: readonly (AttachmentResult | null)[]) => {
    const { notices, images } = run.settleAttachments(keys, results);
    if (typeof URL.createObjectURL === "function") for (const image of images) support.setThumbnail(image.key, URL.createObjectURL(new Blob([new Uint8Array(image.thumbnail)], { type: "image/png" })));
    if (notices.length) props.onNotice?.(notices.join(" "));
  };
  const addChips = (at: string, chips: AttachmentDraft[]) => run.setDrafts(drafts => {
    const current = drafts.get(at) ?? EMPTY_DRAFT;
    return new Map(drafts).set(at, { ...current, attachments: [...current.attachments, ...chips] });
  });
  const addFiles = (files: File[], pasted: boolean) => {
    const at = key;
    const limit = attachmentLimit(draft.attachments.length, files.map(file => ({ pasted: false, size: file.size })));
    if (limit.notices.length) props.onNotice?.(limit.notices.join(" "));
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
    const at = key;
    void window.doan.chooseAttachments().catch(() => []).then(results => {
      const ok = results.filter(result => result.ok);
      const limit = attachmentLimit((run.drafts.get(at) ?? EMPTY_DRAFT).attachments.length, ok.map(() => ({ pasted: false, size: 0 })));
      const keep = new Set(limit.accept.map(i => ok[i]!));
      for (const result of ok) if (!keep.has(result) && result.ok) void window.doan.removeAttachment(result.attachment.id);
      const chosen = results.filter(result => !result.ok || keep.has(result));
      const keys = chosen.map(() => crypto.randomUUID());
      addChips(at, chosen.map((result, i) => ({ key: keys[i]!, name: result.ok ? result.attachment.name : result.name, kind: "file", pasted: false, status: "checking" })));
      settle(keys, chosen);
      if (limit.notices.length) props.onNotice?.(limit.notices.join(" "));
    });
  };

  // Send, queue and the rest of the composer's calls.
  const changedModel = pick.model !== undefined || pick.effort !== undefined;
  const send = async (request: DockedRequest): Promise<DockedOutcome> => {
    if (mode.kind === "new") {
      if (!chosen) return { error: "no_agent" };
      const start: StartInput = {
        root, mode: "newDesign", runtime: chosen, text: request.text,
        ...(model ? { model } : {}), ...(model && effort ? { effort } : {}), ...(permissionMode && permissionMode !== "default" ? { permissionMode } : {}), ...(request.attachments.length ? { attachments: request.attachments } : {}),
      };
      const last: LastRequest = { root, text: plainText(draft.segments), preset: draft.preset, attachments: [...draft.attachments], provider: chosen, model, effort };
      const revision = run.revision(root);
      const outcome = await props.onStart(start, last);
      if ("ok" in outcome && outcome.conversationId) {
        support.clearPick(key);
        if (permissionMode) support.startedIn(draftKey({ kind: "existing", conversationId: outcome.conversationId, provider: chosen }), permissionMode);
        run.started(root, outcome.conversationId, chosen, revision);
      }
      return "ok" in outcome ? { ok: true } : outcome;
    }
    const revision = run.revision(root);
    const reply = await props.onSendConversation(mode.provider, {
      conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors],
      ...(changedModel && model ? { model, ...(effort ? { effort } : {}) } : {}), ...(sentMode ? { permissionMode: sentMode } : {}), ...(request.attachments.length ? { attachments: request.attachments } : {}),
    }).catch(() => ({ error: "unknown" }));
    if (reply && "error" in reply) return reply;
    run.sent(root, mode.conversationId, revision);
    return { ok: true };
  };
  const queue = async (request: DockedRequest): Promise<DockedOutcome> => {
    if (mode.kind === "new") return { error: "not_running" };
    const reply = await window.doan.queueConversation({ conversationId: mode.conversationId, text: request.text, anchors: [...request.anchors], ...(request.attachments.length ? { attachments: request.attachments } : {}) }).catch(() => ({ error: "unknown" as const }));
    if ("error" in reply) return { error: reply.error, ...("missing" in reply && Array.isArray(reply.missing) ? { missing: reply.missing as string[] } : {}) };
    // The row keeps the request's text; the request itself is kept for the thread, where Send now moves it.
    run.queued(root, mode.conversationId, { id: reply.itemId, text: request.text, message: { text: request.text, anchors: request.anchors, attachments: request.files ?? [] } });
    return { ok: true };
  };
  const busy: DockedBusy | null = props.holder && props.holder.conversationId !== conversationId
    ? { kind: "project", open: props.holder.conversationId || null } : null;
  const openOther = (id: string) => { run.request(root, id, null); };

  // The header
  const menuItems = listed ? projectConversationMenu(listed, props.now, props.seen) : [];
  const firstMessage = thread?.events.find(event => event.type === "user.message");
  const title = conversationId ? summary?.title || (firstMessage?.type === "user.message" ? firstMessage.text : "") : "New conversation";
  const picked = useRef(false);
  // The title menu's trigger, where focus returns after a Delete's confirmation; `deleting` keeps the closing menu from
  // taking focus back while the alert opens.
  const titleTrigger = useRef<HTMLButtonElement | null>(null);
  const deleting = useRef(false);
  // Controlled, so a Delete tooltip's Escape closes the menu too.
  const [menuOpen, setMenuOpen] = useState(false);
  const choose = (value: string) => {
    picked.current = true;
    run.select(root, value === NEW ? null : value);
  };
  const branchOf = (row: FolderEntry) => cardRow(row, null, null).summary?.branch ?? null;
  const branch = branchOf(props.entry);
  const worktreePicked = useRef(false);
  // The problem worktree whose repair actions the chip's menu shows, as the sidebar's menu does.
  const [repair, setRepair] = useState<string | null>(null);
  const repairRow = repair ? props.worktrees.find(row => row.path === repair) : undefined;
  const repairChoice = repairRow ? worktreeChoice(repairRow) : null;
  const chipLabel = branch ?? root.split("/").at(-1) ?? root;

  // The column shows the new conversation state (design §2.5: a failed first read is one too).
  const showsNew = conversationId === null && !waiting;
  const moved = view.kind === "new" ? view.moved : null;
  const movedCanvas = moved && canvasLabel({ path: moved.canvas.path, url: "" });
  const placeholder = draft.preset && draft.segments.length === 0 ? presetPlaceholder(draft.preset) : mode.kind === "new" ? NEW_PLACEHOLDER : REPLY_PLACEHOLDER;

  return <section className="ov ov-main" role="region" aria-label="Overview">
    <header className="ov-head">
      <span className="ov-project">
        <span className={`shell-thumbnail hue-${projectHue(project)}`} aria-hidden="true">{projectInitial(project)}</span>
        <span className="ov-project-name">{project}</span>
        {props.worktrees.length > 1 ? <DropdownMenu.Root onOpenChange={open => { if (open) setRepair(null); }}>
          <DropdownMenu.Trigger asChild><button type="button" className="doan-chip shell-branch wt-chip" data-ui-variant="translucent" aria-label={`Worktree: ${chipLabel}`}>
            <GitBranch aria-hidden="true" /><span>{chipLabel}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu shell-project-menu wt-menu" aria-label="Worktrees" align="start" sideOffset={4} collisionPadding={8}
            onCloseAutoFocus={event => { if (worktreePicked.current) { worktreePicked.current = false; event.preventDefault(); } }}>
            <DropdownMenu.Label className="doan-menu-head">Worktrees</DropdownMenu.Label>
            {props.worktrees.map(row => {
              const chip = row.kind === "list" || row.kind === "loading" ? undefined : cardRow(row, null, null).chip;
              const marked = row.path === (repair ?? root);
              return <DropdownMenu.Item key={row.path} className="doan-menu-item shell-worktree" aria-current={marked ? "true" : undefined}
                onSelect={event => {
                  if (worktreeChoice(row).kind === "repair") { event.preventDefault(); setRepair(row.path); return; }
                  if (row.path === root) return;
                  worktreePicked.current = true; props.onWorktree(row.path);
                }}>
                <GitBranch aria-hidden="true" /><span><span>{branchOf(row) ?? row.path.split("/").at(-1)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>
                {chip ? <span className="shell-problem">{chip}</span> : marked && <Check aria-hidden="true" />}
              </DropdownMenu.Item>;
            })}
            {repairRow && repairChoice?.kind === "repair" && <>
              <DropdownMenu.Separator className="doan-menu-sep" />
              <DropdownMenu.Item className="doan-menu-item" onSelect={() => props.onAction("showInFinder", repairRow.path)}><FolderOpen aria-hidden="true" />{ROW_ACTION_LABELS.showInFinder}</DropdownMenu.Item>
              <DropdownMenu.Item className="doan-menu-item" onSelect={() => props.onProjectSettings(repairRow.path)}><Settings aria-hidden="true" />Project Settings</DropdownMenu.Item>
              {repairChoice.actions.map(action => <DropdownMenu.Item key={action} className="doan-menu-item" onSelect={() => props.onAction(action, repairRow.path)}>{ROW_ACTION_LABELS[action]}</DropdownMenu.Item>)}
            </>}
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
          : branch && <span className="doan-chip shell-branch" data-ui-variant="translucent"><GitBranch aria-hidden="true" /><span>{branch}</span></span>}
      </span>
      <span className="ov-sep" aria-hidden="true">/</span>
      <span className="ov-title-wrap">
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild disabled={list === "loading"}><button ref={titleTrigger} type="button" className="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" title={title}>
            <span>{title}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu conv-menu" aria-label="Project conversations" align="start" sideOffset={4} collisionPadding={8}
            onCloseAutoFocus={event => {
              if (deleting.current) { deleting.current = false; event.preventDefault(); return; }
              if (!picked.current) return; picked.current = false; event.preventDefault(); focusField();
            }}>
            <DropdownMenu.RadioGroup value={conversationId ?? NEW} onValueChange={choose}>
              <DropdownMenu.RadioItem value={NEW} className={`doan-menu-item conv-new${conversationId === null ? " current" : ""}`} textValue="New conversation"><Plus aria-hidden="true" /><span>New conversation</span></DropdownMenu.RadioItem>
              <DropdownMenu.Separator className="doan-menu-sep" />
              <DropdownMenu.Label className="doan-menu-head">{`Conversations in ${project}`}</DropdownMenu.Label>
              {list === "error" ? <div className="conv-error" role="status"><span>Couldn’t read conversations</span>
                <DropdownMenu.Item className="doan-menu-item" onSelect={event => { event.preventDefault(); props.onRetryList(); }}>Retry</DropdownMenu.Item></div>
                : <div className="conv-list">{menuItems.map(item => <div key={item.conversationId} className="conv-row">
                  <DropdownMenu.RadioItem value={item.conversationId} textValue={item.title}
                    className={`doan-menu-item conv-item${item.conversationId === conversationId ? " current" : ""}`}>
                    <ConversationHead line={item} name={item.title} nameClass="t" />
                    <span className="conv-preview">{item.preview}</span>
                  </DropdownMenu.RadioItem>
                  <ConversationDeleteItem conversationId={item.conversationId} title={item.title} deletable={item.deletable} onDelete={() => {
                    deleting.current = props.onDeleteConversation?.({ conversationId: item.conversationId, root, title: item.title, provider: item.provider, from: "overview" }, titleTrigger.current) === true;
                  }} onEscape={() => setMenuOpen(false)} />
                </div>)}</div>}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </span>
      {/* The title menu's New conversation one click away, at the header's end so it does not move with the title. */}
      <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button ov-new-conv" aria-label="New conversation" aria-disabled={showsNew || undefined}
        onClick={() => startNewConversation(conversationId, showsNew, id => run.select(root, id), focusField)}><SquarePen aria-hidden="true" /></button></TooltipTrigger>
        <TooltipContent>New conversation</TooltipContent></Tooltip>
    </header>
    {props.notice && <div className="doan-notice ov-notice" role="status"><AlertIcon /><span className="grow-text">{props.notice}</span></div>}
    <div className="ov-scroll">
      {conversationId && provider ? <ConversationThread ref={handle} conversationId={conversationId} items={items} provider={provider} project={project}
        liveAfter={thread?.liveAfter ?? Number.MAX_SAFE_INTEGER} canvasListed={canvasListed}
        onAnswer={(requestId, optionId) => window.doan.answerConversationPermission({ conversationId, requestId, optionId })}
        onAnswerQuestion={(requestId, answer) => window.doan.answerConversationQuestion({ conversationId, requestId, ...answer })}
        questionDraft={requestId => run.store.questionDraft(conversationId, requestId)} onQuestionDraft={(requestId, action) => run.store.editQuestion(conversationId, requestId, action)}
        onFocusComposer={focusField}
        onStop={() => void window.doan.interruptConversation({ conversationId }).catch(console.error)}
        onEditAndResend={() => editAndResend(conversationId)}
        onSignIn={() => props.onSettings({ section: "agents", provider })}
        onRetry={() => run.retryThread(conversationId)}
        onOpenCanvas={canvas => props.onOpenCanvas(canvas, conversationId)}
        onOpenLink={url => void window.doan.openLink(url).catch(console.error)}
        onCopy={text => Promise.resolve(copyText(text))}
        {...(props.onReplyChip ? { onReplyChip: props.onReplyChip } : {})} openCanvasId={null} canvasRows={props.entry.kind === "list" ? props.entry.canvases : NO_ROWS} />
        : waiting || conversationId ? <Waiting /> : <div className="ov-col ov-new">
          {moved && <div className="doan-notice moved" role="status"><ArrowUpRight className="doan-alert-icon" aria-hidden="true" /><span className="grow-text moved-text" title={`${moved.title} moved to ${movedCanvas}.`}>
            <span className="moved-title">{moved.title}</span><span className="moved-rest">{` moved to ${movedCanvas}.`}</span></span>
            <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => props.onOpenCanvas(moved.canvas, moved.conversationId)}>Open</button></div>}
          {prompts.length > 0 && !started && <div className="ov-suggestions" role="group" aria-label="Suggested prompts">{prompts.map(prompt =>
            <button key={prompt.label} type="button" className="suggestion" title={prompt.label}
              onClick={() => { run.setDrafts(drafts => new Map(drafts).set(key, { ...(drafts.get(key) ?? EMPTY_DRAFT), preset: prompt.preset, segments: textSegments(prompt.text) })); focusField(); }}>
              <span className="suggestion-icon"><GroupIcon name={groupIcon(prompt.preset.group)} /></span><span className="suggestion-label">{prompt.label}</span><ArrowUpRight className="suggestion-go" aria-hidden="true" /></button>)}</div>}
        </div>}
    </div>
    <div className="ov-foot"><div className="ov-col">
      <DockedComposer mode={mode} project={project} homeDirectory={props.homeDirectory} placeholder={placeholder}
        drafts={run.drafts} onDrafts={update => run.setDrafts(update)}
        auth={auth} picker={picker} provider={chosen} effort={effort}
        onPickerOpen={() => { if (healthy) for (const group of picker.groups) if (group.read) support.readModels(root, group.provider); }}
        onPickModel={(picked, value) => support.pick(key, { ...(mode.kind === "new" ? { provider: picked } : {}), ...(picked !== chosen ? { permissionMode: undefined } : {}), model: value === "default" ? undefined : value })}
        onPickEffort={value => support.pick(key, { effort: value })}
        permission={permission} onPickPermission={value => support.pickPermission(key, mode.kind === "new" ? null : mode.conversationId, value, summary ? stored : undefined)}
        onSettings={props.onSettings}
        presets={support.presets} suggested={suggestedPresets(props.entry, presets)}
        onPresetsOpen={() => { if (support.presets && !support.presets.ok) support.readPresets(); }} onPresetsRetry={() => support.readPresets()}
        thumbnails={support.thumbnails} onAttach={chooseFiles} onFiles={addFiles}
        onAttachmentRemoved={attachment => { if (attachment.id) void window.doan.removeAttachment(attachment.id).catch(console.error); }}
        turn={conversationId ? turnOf(thread?.events ?? null, summary, live) : "idle"} busy={busy} canvasGone={false} unavailable={props.unavailable}
        queued={conversationId ? run.queue(conversationId) : []}
        sendNow={!!conversationId && !!provider && sendNowShown({ provider, phase: steerPhaseOf(thread?.events ?? null, summary, live), sending: false })}
        onSendQueuedNow={itemId => conversationId ? run.store.sendQueuedNow(conversationId, itemId) : Promise.resolve({ error: "not_running" })}
        onSend={send} onQueue={queue}
        onStop={() => { if (conversationId) void window.doan.interruptConversation({ conversationId }).catch(console.error); }}
        onRemoveQueued={async itemId => {
          if (!conversationId) return false;
          const reply = await window.doan.removeQueuedMessage({ conversationId, itemId }).catch(error => { console.error(error); return { error: "unknown" }; });
          if (reply && "error" in reply) return false;
          run.unqueued(conversationId, itemId);
          return true;
        }}
        onOpen={openOther} />
    </div></div>
  </section>;
}

// The list or the history is read: blank first, then the thread's own loading line (design §2.5).
function Waiting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return <div className="conversation-thread">{slow && <div className="thread-loading" role="status"><span className="doan-spinner" aria-hidden="true" /><span>Loading conversation</span></div>}</div>;
}
