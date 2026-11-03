import { DropdownMenu } from "radix-ui";
import { Trash2 } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { AlertIcon } from "./AlertIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { DELETE_TOOLTIP, type DeleteAvailability } from "./conversationDelete";
import type { DockedDraft } from "./dockedRules";

// What a title menu row's Delete hands the host: the conversation, and the screen whose menu it came from (the shown
// conversation's deletion moves focus to that screen's composer).
export interface DeleteTarget { conversationId: string; root: string; title: string; provider: Provider; from: "overview" | "canvas" }

// A title menu row's Delete (conversation-delete design §3.3, draft frames row-button, row-unavailable): a menu item
// beside the row's radio item, not inside it, so pressing it never picks the row and the arrow keys reach it after its
// row. An unavailable one stays in the arrow order with `aria-disabled` and reads its reason, which its tooltip shows.
// `onEscape` closes the menu: the highlighted button's tooltip is the top dismissable layer, so without it the first
// Escape would close only the tooltip.
export function ConversationDeleteItem({ conversationId, title, deletable, onDelete, onEscape }: {
  conversationId: string; title: string; deletable: DeleteAvailability; onDelete(): void; onEscape(): void;
}) {
  // Conversation ids are opaque ids (letters, digits, hyphens), safe in an id; one menu is open at a time.
  const reasonId = `conv-delete-reason-${conversationId}`;
  const reason = deletable.available ? null : deletable.reason;
  return <>
    <Tooltip><TooltipTrigger asChild>
      <DropdownMenu.Item className="doan-icon-button conv-delete" textValue="" aria-label={`Delete “${title}”`}
        {...(reason ? { "aria-disabled": true, "aria-describedby": reasonId } : {})}
        onSelect={event => { if (reason) { event.preventDefault(); return; } onDelete(); }}>
        <Trash2 aria-hidden="true" />
      </DropdownMenu.Item>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{reason ?? DELETE_TOOLTIP}</TooltipContent></Tooltip>
    {reason && <span className="sr-only" id={reasonId}>{reason}</span>}
  </>;
}

// A draft the person would lose with the conversation: text or a chip, a preset or an attachment.
export function unsentDraft(draft: DockedDraft | undefined): boolean {
  return !!draft && (draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0);
}

// The confirmation (design §3.4, draft frame delete-dialog): the compact alert dialog of Move to Trash (CanvasTrashDialog),
// found by `dialog[open]` and its role (POSTMORTEM 2026-10-30). Focus starts on Cancel; Escape cancels. `reason`: the
// conversation started working while the alert was open (main judges again on confirm); `pending`: the request is out.
// Either keeps Delete `aria-disabled`, in the focus order. While the request is out the alert is busy and refuses its
// cancel (PRODUCT item 3 'Deep links'): cancelling would stop nothing, and the store has one deleting mark per conversation.
export function ConversationDeleteDialog({ view, reason, pending, cancel, confirm }: {
  view: { title: string; body: string }; reason: string | null; pending: boolean; cancel(): void; confirm(): void;
}) {
  const confirmable = reason === null && !pending;
  const dismiss = () => { if (!pending) cancel(); };
  return <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="conversation-delete-title" aria-describedby="conversation-delete-body"
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="conversation-delete-title">{view.title}</h3><p className="doan-dialog-description" id="conversation-delete-body">{view.body}</p></div></div>
    {reason && <p className="doan-notice" id="conversation-delete-reason"><AlertIcon /><span>{reason}</span></p>}
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus aria-disabled={pending || undefined} data-disabled={pending ? "" : undefined} onClick={dismiss}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-disabled={confirmable ? undefined : true} data-disabled={confirmable ? undefined : ""}
        aria-describedby={reason ? "conversation-delete-reason" : undefined} onClick={() => { if (confirmable) confirm(); }}>Delete</button>
    </div>
  </dialog>;
}
