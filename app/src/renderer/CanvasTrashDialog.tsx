import type { TrashPlanReply } from "../main/canvasTrash";
import { AlertIcon } from "./AlertIcon";

export interface TrashDialogView { title: string; body: string; reason: string | null; confirmable: boolean }

// What the Move to Trash confirmation says and allows (canvas-row-menu design 'Alert Dialog', '문구'). `plan` is main's
// `canvas:trashPlan` answer, null until it comes: only then does the body name the comments, and only a ready plan
// can be confirmed. `working` is the live trashBlock: an agent that starts on the canvas while the dialog is open
// holds the confirm, as main's `busy` plan does. Main judges again on confirm; this is the display.
export function trashDialogView(stem: string, path: string, plan: TrashPlanReply | null, working: boolean): TrashDialogView {
  const comments = plan?.kind === "ready" && plan.comments;
  const busy = working || (plan?.kind === "refused" && plan.reason === "busy");
  return {
    title: `Move “${stem}” to Trash?`,
    body: comments
      ? `This removes ${path} and its comments from the repository. You can restore them from the Trash. Doan doesn’t commit this change.`
      : `This removes ${path} from the repository. You can restore it from the Trash. Doan doesn’t commit this change.`,
    reason: busy ? "An agent started working on this canvas. Try again when it finishes." : null,
    confirmable: plan?.kind === "ready" && !busy,
  };
}

// The compact alert dialog of the first run's Stop and Settings (role found by `dialog[open]`, POSTMORTEM 2026-10-30).
// Focus starts on Cancel; Escape cancels. Ids are fixed: App shows one at a time. An unavailable Move to Trash keeps
// `aria-disabled`, so it stays in the focus order and reads its reason.
export function CanvasTrashDialog({ view, cancel, confirm }: { view: TrashDialogView; cancel(): void; confirm(): void }) {
  return <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="canvas-trash-title" aria-describedby="canvas-trash-body"
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); cancel(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="canvas-trash-title">{view.title}</h3><p className="doan-dialog-description" id="canvas-trash-body">{view.body}</p></div></div>
    {view.reason && <p className="doan-notice" id="canvas-trash-reason"><AlertIcon /><span>{view.reason}</span></p>}
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus onClick={cancel}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" aria-disabled={view.confirmable ? undefined : true} data-disabled={view.confirmable ? undefined : ""}
        aria-describedby={view.reason ? "canvas-trash-reason" : undefined} onClick={() => { if (view.confirmable) confirm(); }}>Move to Trash</button>
    </div>
  </dialog>;
}
