import type { TrashPlanReply, TrashRefused } from "../main/canvasTrash";
import { AlertIcon } from "./AlertIcon";
import { trashToast } from "./canvasRowMessages";

// busy: the confirm shows its spinner (main's plan or the move is out); cancellable: false while the move is out;
// error: the refusal of a move that was confirmed, inside the dialog, where Move to Trash is the retry.
export interface TrashDialogView { title: string; body: string; reason: string | null; error: string | null; confirmable: boolean; busy: boolean; cancellable: boolean }
// The confirmed move: `pending` while main moves it, `failed` its refusal once it answers.
export interface TrashMove { pending: boolean; failed: TrashRefused | null }
const MOVE_IDLE: TrashMove = { pending: false, failed: null };

const WORKING = "An agent started working on this canvas. Try again when it finishes.";
const PLAN_FAILED = "Doan couldn’t get this canvas ready to move. Close and try again, or move the file to the Trash in Finder.";

// What the Move to Trash confirmation says and allows (PRODUCT §5 item 1 'Canvas row menu'). `plan` is main's
// `canvas:trashPlan` answer, null until it comes: the confirm is busy meanwhile, and only a ready plan can be
// confirmed. A plan main could not read keeps the dialog with its reason (App closes it with a toast for notListed and
// notFile). `working` is the live trashBlock: an agent that starts on the canvas while the dialog is open holds the
// confirm, as main's `busy` plan does. Main judges again on confirm; this is the display. `move`: once confirmed the
// dialog stays, busy and not cancellable, until main answers (DESIGN 'Busy action').
export function trashDialogView(stem: string, path: string, plan: TrashPlanReply | null, working: boolean, move: TrashMove = MOVE_IDLE): TrashDialogView {
  const held = working || (plan?.kind === "refused" && plan.reason === "busy");
  const reason = held ? WORKING : plan?.kind === "refused" && plan.reason === "failed" ? PLAN_FAILED : null;
  // A refusal that is about the working agent is already said by the reason line.
  const error = move.failed && !held ? trashToast(stem, move.failed) : null;
  return {
    title: `Move “${stem}” to Trash?`,
    body: `This removes ${path} from the repository. You can restore it from the Trash. Doan doesn’t commit this change.`,
    reason, error,
    confirmable: plan?.kind === "ready" && !held && !move.pending,
    busy: plan === null || move.pending,
    cancellable: !move.pending,
  };
}

// The compact alert dialog of the first run's Stop and Settings (role found by `dialog[open]`, POSTMORTEM 2026-10-30).
// Focus starts on Cancel; Escape cancels unless the move is out. An unavailable Move to Trash keeps `aria-disabled`, so
// it stays in the focus order and reads its reason; a busy one keeps its fill, with the spinner, as ConversationDeleteDialog's Delete.
export function CanvasTrashDialog({ view, cancel, confirm }: { view: TrashDialogView; cancel(): void; confirm(): void }) {
  const dismiss = () => { if (view.cancellable) cancel(); };
  const describedBy = view.error ? "canvas-trash-error" : view.reason ? "canvas-trash-reason" : undefined;
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="canvas-trash-title" aria-describedby="canvas-trash-body"
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="canvas-trash-title">{view.title}</h3><p className="doan-dialog-description selectable" id="canvas-trash-body">{view.body}</p></div></div>
    {view.reason && <p className="doan-notice" id="canvas-trash-reason"><AlertIcon /><span className="selectable">{view.reason}</span></p>}
    {view.error && <p className="doan-notice error" role="alert" id="canvas-trash-error"><AlertIcon /><span className="selectable">{view.error}</span></p>}
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus aria-disabled={view.cancellable ? undefined : true} data-disabled={view.cancellable ? undefined : ""} onClick={dismiss}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-disabled={view.confirmable ? undefined : true} aria-busy={view.busy || undefined}
        data-disabled={view.confirmable || view.busy ? undefined : ""} aria-describedby={describedBy} onClick={() => { if (view.confirmable) confirm(); }}>
        {view.busy ? <><span className="doan-spinner" aria-hidden="true" />Move to Trash</> : "Move to Trash"}</button>
    </div>
  </dialog>;
}
