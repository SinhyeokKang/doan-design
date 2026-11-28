import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, SquarePen } from "lucide-react";
import { AlertIcon } from "../AlertIcon";
import type { RevealPayload } from "../../main/prototype/ipc";
import type { FolderEntry } from "../../main/view";
import { CanvasConversation, startNewConversation } from "../CanvasConversationPanel";
import { canvasConversationMenu, canvasUnlistedText, DUPLICATE_CANVAS_TEXT, titleMenuOrder } from "../canvasConversation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipEscape } from "../components/ui/tooltip";
import { ConversationDeleteItem, type DeleteTarget } from "../ConversationDeleteDialog";
import { ConversationHead } from "../ConversationLine";
import { announcedAgain } from "../listRetry";
import { LIST_FAILED_TEXT, listRetryItem } from "../ListRetryButton";
import type { PrototypeConversationCalls, PrototypeConversationRun } from "./conversationRun";
import { NameTip } from "../NameTip";
import { useThumbnailHub } from "../thumbnails";

// The prototype panel's thread chips, Sign in and Open buttons belong to the main window: they go to main as a reveal, which brings the main window
// forward to act there; this window waits for nothing back.

export function PrototypeConversationPanel({ run, calls, now, onNotice = () => {} }: {
  run: PrototypeConversationRun; calls: PrototypeConversationCalls; now: number; onNotice?(text: string): void;
}) {
  // Main answers this window's thumbnails for the playing root only.
  const thumbnailHub = useThumbnailHub(calls);
  const view = run.currentView(), target = run.target();
  if (!view || !target) return null;
  const entry: FolderEntry = run.entry() ?? { path: view.root, kind: "loading" };
  // Named as the main window names its group (homeCards.ts `groupProjects`): by the main worktree's folder, else the root's.
  const named = entry.kind === "list" ? entry.git?.main ?? view.root : view.root;
  const project = named.split("/").filter(Boolean).at(-1) ?? named;
  const settings = run.settings();
  const blocked = target.lost === "gone" ? canvasUnlistedText(project) : target.lost === "duplicate" ? DUPLICATE_CANVAS_TEXT : null;
  const reveal = (request: RevealPayload) => { void calls.reveal(request).catch(console.error); };
  // A chip names the conversation it was sent in; in the new conversation state there is none for main to check.
  const shownId = () => { const shown = run.run.view(); return shown?.kind === "conversation" ? shown.conversationId : null; };
  return <CanvasConversation calls={run.bodyCalls} run={run.run} support={run.support} target={target} canvasName={view.canvas} project={project}
    entry={entry} list={run.list()} seen={run.seen()} prefs={settings?.home ?? null} defaults={settings ? settings.newConversation : undefined}
    onRemember={choice => { void calls.rememberChoice(choice).catch(console.error); }}
    now={now} blocked={blocked} frames={view.frames} locateDisabled={false} arrival={null} onArrived={() => {}}
    onLocate={async anchor => {
      const conversationId = shownId();
      if (conversationId === null) return "unavailable";
      reveal({ kind: "chip", conversationId, anchor });
      return "shown";
    }}
    // A canvas chip needs no conversation: the main window matches its id against the playing root's list.
    onCanvasChip={async canvas => { reveal({ kind: "canvas", canvas }); return null; }} canvasChipFits={false}
    onReplyChip={async link => {
      const conversationId = shownId();
      if (conversationId !== null) reveal({ kind: "reply", conversationId, link });
      return null;
    }}
    // Sign in names its provider; "Sign in to an agent" and "Manage agents" open Settings > Agents at its top.
    onSettings={settingsTarget => reveal({ kind: "settings", ...(settingsTarget.provider ? { provider: settingsTarget.provider } : {}) })}
    onNotice={onNotice}
    // A handoff card from the Overview: the main window shows its source conversation there. This window lists only the
    // canvas's conversations, so whether the source still exists is main's answer (the run's).
    onOpenOverview={conversationId => reveal({ kind: "conversation", conversationId })}
    conversationListed={conversationId => run.conversationListed(conversationId)}
    onOpenHandoff={(canvas, conversationId) => reveal({ kind: "handoff", canvas, ...(conversationId ? { conversationId } : {}) })}
    work={run.work()} playing={run.playing()} thumbnailHub={thumbnailHub} />;
}

// The menu's value for New conversation: conversation ids are never empty.
const NEW = "";

// While the list is read or the canvas is blocked the trigger is `aria-disabled`, not `disabled`, so it stays focusable as the
// target on opening the panel. While open the rows keep their order and a new conversation goes last.
export function PrototypeHeadMenu({ run, now, onPicked, onDelete }: {
  run: PrototypeConversationRun; now: number;
  // A row or New conversation was chosen and the menu closed: focus goes on to the composer.
  onPicked(): void;
  // A row's Delete: the host asks for confirmation and returns focus to `trigger`. False when it opens no alert.
  onDelete(target: DeleteTarget, trigger: HTMLElement | null): boolean;
}) {
  const shown = run.shown(), list = run.list(), target = run.target(), title = run.headTitle();
  const unavailable = shown.kind === "list_loading" || shown.kind === "blocked";
  // The rows' order as drawn while open (at opening, then each row added at the end), null while closed.
  const [frozen, setFrozen] = useState<readonly string[] | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const picked = useRef(false);
  const deleting = useRef(false);
  // A menu the canvas became blocked under closes for good, rather than opening again by itself once it is back.
  useEffect(() => { if (unavailable && frozen !== null) setFrozen(null); }, [unavailable, frozen]);
  const setOpen = (open: boolean) => {
    if (!open) { setFrozen(null); return; }
    if (unavailable) return;
    setFrozen(Array.isArray(list) && target ? titleMenuOrder(list, target.canvas, null) : []);
  };
  // titleMenuOrder sorts by activity whatever the order does not name, so a row added while open keeps its place too. Kept during the
  // render (state adjusted while rendering), so no frame draws the rows in another order first.
  const drawn = frozen !== null && Array.isArray(list) && target ? titleMenuOrder(list, target.canvas, frozen) : frozen;
  if (frozen !== null && drawn !== null && drawn.join("\n") !== frozen.join("\n")) setFrozen(drawn);
  const current = shown.kind === "conversation" ? shown.conversationId : null;
  const items = Array.isArray(list) && target ? canvasConversationMenu(list, target.canvas, current, now, run.seen(), drawn) : [];
  const select = (id: string | null) => run.run.select(id);
  const isNew = run.run.view()?.kind === "new";
  const canvasName = run.currentView()?.canvas ?? "";
  return <><span className="ov-title-wrap doan-conv-title">
    <DropdownMenu.Root open={frozen !== null && !unavailable} onOpenChange={setOpen}>
      <NameTip text={title}><DropdownMenu.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-disabled={unavailable || undefined}>
        <span>{title}</span><ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger></NameTip>
      <TooltipEscape value={() => setOpen(false)}><DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu conv-menu" aria-label={`Conversations on ${canvasName}`} align="end" sideOffset={4} collisionPadding={8}
        onCloseAutoFocus={event => {
          if (deleting.current) { deleting.current = false; event.preventDefault(); return; }
          if (!picked.current) return; picked.current = false; event.preventDefault(); onPicked();
        }}>
        <DropdownMenu.RadioGroup value={current ?? NEW} onValueChange={value => { picked.current = true; select(value === NEW ? null : value); }}>
          <DropdownMenu.RadioItem value={NEW} className={`doan-menu-item conv-new${current === null ? " current" : ""}`} textValue="New conversation"><SquarePen aria-hidden="true" /><span>New conversation</span></DropdownMenu.RadioItem>
          <DropdownMenu.Separator className="doan-menu-sep" />
          <DropdownMenu.Label className="doan-menu-head">{`Conversations on ${canvasName}`}</DropdownMenu.Label>
          {list === "error" ? <div className="conv-error" role="status"><AlertIcon /><span>{announcedAgain(LIST_FAILED_TEXT, run.listRetry().failures)}</span>
            {listRetryItem(run.listRetry(), () => run.retry())}</div>
            : <div className="conv-list">{items.map(item => <div key={item.conversationId} className="conv-row">
              <DropdownMenu.RadioItem value={item.conversationId} textValue={item.title} className={`doan-menu-item conv-item${item.selected ? " current" : ""}`}>
                <ConversationHead line={item} name={item.title} nameClass="t" />
                <span className="conv-preview">{item.preview}</span>
              </DropdownMenu.RadioItem>
              {target && <ConversationDeleteItem conversationId={item.conversationId} title={item.title} deletable={item.deletable} onDelete={() => {
                deleting.current = onDelete({ conversationId: item.conversationId, root: target.root, title: item.title, provider: item.provider, from: "canvas" }, trigger.current);
              }} onEscape={() => setOpen(false)} />}
            </div>)}</div>}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal></TooltipEscape>
    </DropdownMenu.Root>
  </span>
  <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button doan-conv-new" aria-label="New conversation" aria-disabled={isNew || undefined} onClick={() => startNewConversation(current, isNew, select, onPicked)}><SquarePen aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent>New conversation</TooltipContent></Tooltip></>;
}
