import { DropdownMenu } from "radix-ui";
import { Trash2 } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { AlertIcon } from "./AlertIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { DELETE_TOOLTIP, deleteItemLabel, type DeleteAvailability } from "./conversationDelete";
import type { DockedDraft } from "./dockedRules";

// From a title menu, the shown conversation's deletion focuses that screen's composer; from the Conversations list
// (`canvasList`) focus goes to `after`; from the sidebar to the tree row `after`, else `canvasRow`.
export type ListFocus = { kind: "row"; key: string } | { kind: "title" };
export type DeleteTarget = { conversationId: string; root: string; title: string; provider: Provider }
  & ({ from: "overview" | "canvas" } | { from: "canvasList"; after: ListFocus } | { from: "sidebar"; after: string; canvasRow: string });

// A menu item beside the row's radio item, so pressing it never picks the row. `onEscape` closes the menu: the highlighted
// button's tooltip is the top dismissable layer, so without it the first Escape closes only the tooltip.
export function ConversationDeleteItem({ conversationId, title, deletable, onDelete, onEscape }: {
  conversationId: string; title: string; deletable: DeleteAvailability; onDelete(): void; onEscape(): void;
}) {
  // Conversation ids are opaque ids (letters, digits, hyphens), safe in an id; one menu is open at a time.
  const reasonId = `conv-delete-reason-${conversationId}`;
  const reason = deletable.available ? null : deletable.reason;
  return <>
    <Tooltip><TooltipTrigger asChild>
      <DropdownMenu.Item className="doan-icon-button conv-delete" textValue="" aria-label={deleteItemLabel(title)}
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

// Found by `dialog[open]` and its role (POSTMORTEM 2026-10-30). While the request is out the alert refuses its cancel:
// cancelling would stop nothing, and the store has one deleting mark per conversation.
export function ConversationDeleteDialog({ view, reason, pending, cancel, confirm }: {
  view: { title: string; body: string }; reason: string | null; pending: boolean; cancel(): void; confirm(): void;
}) {
  const confirmable = reason === null && !pending;
  const dismiss = () => { if (!pending) cancel(); };
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="conversation-delete-title" aria-describedby="conversation-delete-body"
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); dismiss(); }}
    // A keyboard Delete opens the alert while its tooltip still exits, and that layer prevents the next Escape, so no cancel
    // event would follow. The keydown cancels, and preventing it keeps the native cancel from firing twice.
    onKeyDown={event => { if (event.key !== "Escape" || event.nativeEvent.isComposing) return; event.preventDefault(); dismiss(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="conversation-delete-title">{view.title}</h3><p className="doan-dialog-description" id="conversation-delete-body">{view.body}</p></div></div>
    {reason && <p className="doan-notice" id="conversation-delete-reason"><AlertIcon /><span className="selectable">{reason}</span></p>}
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus aria-disabled={pending || undefined} data-disabled={pending ? "" : undefined} onClick={dismiss}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-disabled={confirmable ? undefined : true} aria-busy={pending || undefined}
        data-disabled={confirmable || pending ? undefined : ""} aria-describedby={reason ? "conversation-delete-reason" : undefined}
        onClick={() => { if (confirmable) confirm(); }}>{pending && <span className="doan-spinner" aria-hidden="true" />}Delete</button>
    </div>
  </dialog>;
}
