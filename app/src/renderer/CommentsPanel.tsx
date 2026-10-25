import type { Ref } from "react";
import type { Comment, Target, Warning } from "../formats/types";
import type { CopyScope, ListFilter } from "../comments/projection";

export type CopyView = { status: "idle" | "copying" | "copied" } | { status: "failed"; message: string };
export type AuthorView = { status: "ready" | "loading" | "missing" } | { status: "failed"; message: string };
export type CommentIntent = "locate" | "edit" | "resolve" | "reopen" | "delete" | "retry" | "check" | "read-latest" | "confirm-reviewed";
export type SaveView =
  | { status: "idle" | "saving" | "unknown" | "checking" | "retry-original" | "conflict" | "deleted" | "saved" }
  | { status: "failed" | "check-failed" | "recovery-blocked"; message: string }
  | { status: "reviewed"; latest: Comment };
export interface CommentEditorProps {
  mode: "create" | "edit";
  target: Target;
  body: string;
  state: SaveView;
  blocked: string | null;
  inputRef?: Ref<HTMLTextAreaElement>;
  onBody: (body: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeepDraft: () => void;
  onCheck: () => void;
  onRetryOriginal: () => void;
  onReadLatest: () => void;
}
export interface CommentsPanelProps {
  filter: ListFilter;
  selectionAvailable: boolean;
  selectionNode?: string | null;
  counts: { open: number; resolved: number };
  canvasOpenCount: number;
  read: { status: "loading" } | { status: "failed"; message: string } | { status: "ready"; comments: readonly Comment[]; warnings: readonly Warning[] };
  freshness: ReadonlyMap<string, "same" | "outdated" | "unknown">;
  missingLocations: ReadonlySet<string>;
  author: AuthorView;
  writeBlocked: string | null;
  createBlocked: string | null;
  createError?: string | null;
  widthInvalid: boolean;
  busy: boolean;
  copies: ReadonlyMap<string, CopyView>;
  allCopy: CopyView;
  mutations?: ReadonlyMap<string, SaveView>;
  editor: CommentEditorProps | null;
  headingRef?: Ref<HTMLHeadingElement>;
  onFilter: (filter: ListFilter) => void;
  onCreate: (scope: ListFilter["scope"]) => void;
  onComment: (intent: CommentIntent, comment: string) => void;
  onCopy: (scope: CopyScope) => void;
  onRead: () => void;
  onRetryAuthor: () => void;
}

function relativeTime(at: string): string {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return at;
  const seconds = Math.round((parsed - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

function targetText(target: Target): string {
  if (target.element) return `Element · ${target.element.doanId ?? target.element.selector}`;
  return target.frame ? `Frame · ${target.frame}` : "Canvas";
}
function pending(state: SaveView): boolean {
  return ["saving", "unknown", "checking", "check-failed", "retry-original", "recovery-blocked"].includes(state.status);
}
function copyLabel(copy: CopyView, all = false): string {
  return copy.status === "copying" ? "Copying…" : copy.status === "copied" ? "Copied" : copy.status === "failed" ? "Retry copy" : all ? "Copy all open" : "Copy";
}

export function CommentsPanel(props: CommentsPanelProps) {
  const { filter, read, author, editor } = props;
  const writesDisabled = props.busy || props.writeBlocked !== null || author.status !== "ready";
  const createDisabled = writesDisabled || props.createBlocked !== null || props.widthInvalid || editor !== null || read.status !== "ready" || (filter.scope === "selection" && !props.selectionAvailable);
  const editorBlocked = editor && (props.writeBlocked ?? (props.busy ? "A comment change is in progress." : null) ?? (author.status !== "ready" ? "A Git name is required before saving." : null) ?? (editor.mode === "create" && props.widthInvalid ? "Run doan check in a terminal to diagnose the canvas. A readable width is required to add comments and show pins." : null) ?? editor.blocked);
  return <section className="comments-panel native-scroll" aria-label="Comments">
    <div className="comments-head">
      <h3 ref={props.headingRef} tabIndex={-1}>Comments</h3>
      <div className="comments-segment" role="group" aria-label="Comment scope">
        <button type="button" aria-pressed={filter.scope === "selection"} disabled={!props.selectionAvailable || props.widthInvalid} onClick={() => props.onFilter({ scope: "selection", node: props.selectionNode ?? null, status: filter.status })}>Selection</button>
        <button type="button" aria-pressed={filter.scope === "canvas"} onClick={() => props.onFilter({ scope: "canvas", status: filter.status })}>Canvas</button>
      </div>
      <div className="comments-segment" role="group" aria-label="Comment status">
        <button type="button" aria-pressed={filter.status === "open"} onClick={() => props.onFilter({ ...filter, status: "open" })}>Open {props.counts.open}</button>
        <button type="button" aria-pressed={filter.status === "resolved"} onClick={() => props.onFilter({ ...filter, status: "resolved" })}>Resolved {props.counts.resolved}</button>
      </div>
      <div className="comments-tools">
        <button type="button" className="comments-btn" disabled={read.status !== "ready" || props.canvasOpenCount === 0 || props.allCopy.status === "copying"} title="All open comments on this canvas, regardless of the visible filter" onClick={() => props.onCopy({ kind: "all" })}>{copyLabel(props.allCopy, true)}</button>
        <button type="button" className="comments-btn" disabled={createDisabled} onClick={() => props.onCreate(filter.scope)}>{filter.scope === "canvas" ? "New canvas comment" : "New selection comment"}</button>
      </div>
      {props.createError && <p className="comments-helper" role="alert">Couldn’t start comment: {props.createError}</p>}
      {props.allCopy.status === "copied" && <p className="comments-helper" role="status">Copied all open comments on this canvas.</p>}
      {props.allCopy.status === "failed" && <p className="comments-helper" role="alert">{props.allCopy.message}</p>}
    </div>
    {props.widthInvalid && <div className="comments-message warning"><b>Could not read a valid board width.</b>Existing comments are still available. Run doan check in a terminal to diagnose the canvas. A readable width is required to add comments and show pins.</div>}
    {props.writeBlocked && <div className="comments-message error" role="alert"><b>Comments are read-only</b>{props.writeBlocked}</div>}
    {props.createBlocked && <div className="comments-message warning">{props.createBlocked}</div>}
    {author.status !== "ready" && <div className="comments-message warning" role="status">
      <b>{author.status === "loading" ? "Checking Git name…" : author.status === "missing" ? "Set your Git name" : "Couldn’t read Git identity"}</b>
      {author.status === "failed" ? author.message : "Set git user.name for this repository in your terminal, then choose Retry. Your email is optional."}
      <p>Editing, resolving, reopening and deleting stay unavailable until a name is configured. Copy remains available.</p>
      <div className="comments-tools"><button type="button" className="comments-btn" disabled={author.status === "loading"} onClick={props.onRetryAuthor}>Retry</button></div>
    </div>}
    {read.status === "loading" ? <div className="comments-message" role="status"><b>Loading comments…</b></div>
      : read.status === "failed" ? <div className="comments-message error" role="alert"><b>Couldn’t read comments</b>{read.message}<div className="comments-tools"><button type="button" className="comments-btn" onClick={props.onRead}>Retry</button></div></div>
        : <>
          {read.warnings.length > 0 && <div className="comments-message warning"><b>Some events could not be read</b><ul>{read.warnings.map((warning, i) => <li key={i}>{warning.code === "unknown_version" && <>This record was written by a newer version of Doan. </>}{warning.code} · line {warning.line}</li>)}</ul></div>}
          {read.comments.length === 0 && <div className="comments-message"><b>{filter.status === "open" ? "No open comments here" : "No resolved comments here"}</b>{filter.scope === "selection" && props.canvasOpenCount > props.counts.open ? `There are ${props.canvasOpenCount - props.counts.open} open comments elsewhere on this canvas; Copy all open includes them.` : "Leave a note on this target."}</div>}
          {read.comments.map(comment => <CommentCard key={comment.comment} comment={comment} freshness={props.freshness.get(comment.comment) ?? "unknown"} locationMissing={props.missingLocations.has(comment.comment)} disabled={writesDisabled || editor !== null} busy={props.busy} copy={props.copies.get(comment.comment) ?? { status: "idle" }} mutation={props.mutations?.get(comment.comment)} onComment={props.onComment} onCopy={props.onCopy} />)}
        </>}
    {editor && <CommentEditor {...editor} blocked={editorBlocked || null} />}
  </section>;
}

export interface CommentCardProps {
  comment: Comment;
  freshness: "same" | "outdated" | "unknown";
  locationMissing: boolean;
  disabled: boolean;
  busy: boolean;
  copy: CopyView;
  mutation?: SaveView | undefined;
  onComment: (intent: CommentIntent, comment: string) => void;
  onCopy: (scope: CopyScope) => void;
}
export function CommentCard({ comment, freshness, locationMissing, disabled, busy, copy, mutation, onComment, onCopy }: CommentCardProps) {
  const { createdBy } = comment;
  const initials = createdBy.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase();
  const locked = disabled || busy || (mutation !== undefined && mutation.status !== "idle" && mutation.status !== "saved");
  return <article className="comments-card" aria-label={`Comment by ${createdBy.name}`} aria-busy={busy || mutation?.status === "saving"}>
    <div className="comments-author"><span className="comments-avatar" aria-hidden="true">{initials}</span><div className="comments-by"><b>{createdBy.name}</b>{createdBy.kind === "human" && createdBy.email && <span className="comments-email">{createdBy.email}</span>}<time dateTime={comment.createdAt} title={comment.createdAt}>{relativeTime(comment.createdAt)}</time></div></div>
    <button type="button" className="comments-target" disabled={locationMissing || (!comment.target.frame && !comment.target.element)} onClick={() => onComment("locate", comment.comment)}>{targetText(comment.target)}</button>
    <div className="comments-badges"><span className={`comments-badge ${comment.status}`}>{comment.status === "open" ? "Open" : "Resolved"}</span>{freshness !== "same" && <span className="comments-badge warning">{freshness === "outdated" ? "Outdated" : "Freshness unknown"}</span>}{locationMissing && <span className="comments-badge warning">Location unavailable</span>}</div>
    <p className="comments-body">{comment.body}</p>
    <div className="comments-tools">
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment("edit", comment.comment)}>Edit</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment(comment.status === "open" ? "resolve" : "reopen", comment.comment)}>{comment.status === "open" ? "Resolve" : "Reopen"}</button>
      <button type="button" className="comments-btn" disabled={comment.status === "resolved" || copy.status === "copying"} onClick={() => onCopy({ kind: "one", comment: comment.comment })}>{copyLabel(copy)}</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment("delete", comment.comment)}>Delete</button>
    </div>
    {comment.status === "resolved" && <p className="comments-helper">Reopen this comment before copying.</p>}
    {copy.status === "copied" && <p className="comments-helper" role="status">Copied</p>}
    {copy.status === "failed" && <p className="comments-helper" role="alert">{copy.message}</p>}
    {mutation && mutation.status !== "idle" && <div className={`comments-message ${mutation.status === "failed" || mutation.status === "check-failed" || mutation.status === "deleted" ? "error" : mutation.status === "unknown" || mutation.status === "conflict" || mutation.status === "recovery-blocked" ? "warning" : ""}`} role="status">
      <SaveMessage state={mutation} />
      <div className="comments-tools">
        {(mutation.status === "unknown" || mutation.status === "check-failed" || mutation.status === "checking") && <button type="button" className="comments-btn" disabled={mutation.status === "checking"} onClick={() => onComment("check", comment.comment)}>Check saved status</button>}
        {(mutation.status === "failed" || mutation.status === "retry-original") && <button type="button" className="comments-btn" disabled={disabled || busy} onClick={() => onComment("retry", comment.comment)}>{mutation.status === "retry-original" ? "Retry original save" : "Retry"}</button>}
        {mutation.status === "reviewed" && <button type="button" className="comments-btn" disabled={disabled || busy} onClick={() => onComment("confirm-reviewed", comment.comment)}>Confirm reviewed change</button>}
        {mutation.status === "conflict" && <button type="button" className="comments-btn" onClick={() => onComment("read-latest", comment.comment)}>Read latest state</button>}
      </div>
    </div>}
  </article>;
}

function SaveMessage({ state }: { state: SaveView }) {
  switch (state.status) {
    case "idle": return null;
    case "saving": return <><b>Saving…</b>Your input is kept until saving finishes.</>;
    case "failed": return <><b>Couldn’t save comment</b>{state.message}</>;
    case "recovery-blocked": return <><b>Save recovery is blocked</b>{state.message} Your original input is kept; saving and retry remain disabled.</>;
    case "unknown": return <><b>Save status is unknown</b>The response was lost. Check whether this comment was saved before trying again.</>;
    case "checking": return <><b>Checking saved status…</b>Your draft is kept. Do not submit another copy.</>;
    case "check-failed": return <><b>Couldn’t confirm saved status</b>{state.message} Your input is kept; saving remains disabled.</>;
    case "retry-original": return <><b>The comment was not saved</b>Retry the original save with this preserved text.</>;
    case "conflict": return <><b>This comment changed elsewhere</b>Your input is kept. Read the latest state before saving again.</>;
    case "reviewed": return <><b>Latest saved comment · {state.latest.status === "open" ? "Open" : "Resolved"}</b><p className="comments-body">{state.latest.body}</p></>;
    case "deleted": return <><b>This comment was deleted</b>Your input is kept for reference. It cannot be saved to the deleted comment.</>;
    case "saved": return <><b>Comment saved</b>The original comment is in the file. No duplicate was added.</>;
  }
}

export function CommentEditor(props: CommentEditorProps) {
  const { state } = props;
  const locked = pending(state) || state.status === "saved";
  const cannotSave = locked || !!props.blocked || !props.body.trim() || state.status === "conflict" || state.status === "deleted";
  const label = props.mode === "create" ? "New comment" : "Your unsaved edit";
  return <><div className="comments-composer" aria-busy={state.status === "saving" || state.status === "checking"}>
    <label>{label}<span className="comments-target">To: {targetText(props.target)}</span><textarea ref={props.inputRef} aria-label={`${label} body`} value={props.body} readOnly={locked} onChange={event => { if (!locked) props.onBody(event.currentTarget.value); }} /></label>
    <div className="comments-tools">
      <button type="button" className="comments-btn" disabled={state.status === "saving" || state.status === "saved"} onClick={locked ? props.onKeepDraft : props.onCancel}>{locked ? "Keep draft" : "Cancel"}</button>
      {state.status === "retry-original" ? <button type="button" className="comments-btn primary" disabled={!!props.blocked} onClick={props.onRetryOriginal}>Retry original save</button> : <button type="button" className="comments-btn primary" disabled={cannotSave} onClick={props.onSave}>{state.status === "saving" ? "Saving…" : state.status === "reviewed" ? "Save reviewed changes" : props.mode === "edit" ? "Save changes" : "Save comment"}</button>}
    </div>
    {props.blocked && <p className="comments-helper" role="status">{props.blocked}</p>}
    {props.blocked && props.mode === "edit" && !locked && <button type="button" className="comments-btn" onClick={props.onReadLatest}>Read latest state</button>}
    </div>
    {state.status !== "idle" && <div className={`comments-message ${state.status === "failed" || state.status === "check-failed" || state.status === "deleted" ? "error" : state.status === "unknown" || state.status === "conflict" || state.status === "recovery-blocked" ? "warning" : ""}`} role="status"><SaveMessage state={state} />
      {(state.status === "unknown" || state.status === "check-failed" || state.status === "checking" || state.status === "conflict") && <div className="comments-tools">
        {(state.status === "unknown" || state.status === "check-failed" || state.status === "checking") && <button type="button" className="comments-btn" disabled={state.status === "checking"} onClick={props.onCheck}>{state.status === "check-failed" ? "Retry status check" : "Check saved status"}</button>}
        {state.status === "conflict" && <button type="button" className="comments-btn" onClick={props.onReadLatest}>Read latest state</button>}
      </div>}
    </div>}
  </>;
}

export interface UnsavedCommentDialogProps {
  target: Target;
  context: string;
  canSave: boolean;
  busy: boolean;
  discardBlocked?: boolean;
  reason?: string;
  onContinue: () => void;
  onDiscard: () => void;
  onSave: () => void;
  restoreEditorFocus: () => void;
}
export function UnsavedCommentDialog(props: UnsavedCommentDialogProps) {
  let dialog: HTMLDialogElement | null = null;
  const keepWriting = () => {
    if (props.busy) return;
    dialog?.close();
    props.onContinue();
    props.restoreEditorFocus();
  };
  return <dialog className="comments-dialog" aria-label={props.canSave ? "Save your comment first?" : "Keep this draft?"} aria-busy={props.busy}
    ref={node => { dialog = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); keepWriting(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) keepWriting();
    }}>
    <h3>{props.canSave ? "Save your comment first?" : "Keep this draft?"}</h3>
    <p>Your unsaved comment belongs to {targetText(props.target)} in {props.context}. {props.canSave ? "Save it before moving, discard it, or keep writing here." : "Saving is unavailable. Discard the draft to continue or keep writing on the original draft."}</p>
    {props.reason && <p role="status">{props.reason}</p>}
    <div className="comments-tools">
      <button type="button" className="comments-btn" autoFocus disabled={props.busy} onClick={keepWriting}>Keep writing</button>
      <button type="button" className="comments-btn" disabled={props.busy || props.discardBlocked} onClick={props.onDiscard}>Discard</button>
      <button type="button" className="comments-btn primary" disabled={!props.canSave || props.busy} onClick={props.onSave}>{props.busy ? "Saving…" : "Save and continue"}</button>
    </div>
  </dialog>;
}


export function DeleteCommentDialog({ comment, onCancel, onConfirm }: { comment: Comment; onCancel: () => void; onConfirm: () => void }) {
  let dialog: HTMLDialogElement | null = null;
  const cancel = () => { dialog?.close(); onCancel(); };
  return <dialog className="comments-dialog" aria-label="Delete this comment?" ref={node => { dialog = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); cancel(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) cancel();
    }}>
    <h3>Delete this comment?</h3>
    <p className="comments-body">{comment.body}</p>
    <p>This comment will be removed and cannot be restored.</p>
    <div className="comments-tools"><button type="button" className="comments-btn" autoFocus onClick={cancel}>Cancel</button>
      <button type="button" className="comments-btn" onClick={() => { dialog?.close(); onConfirm(); }}>Delete comment</button></div>
  </dialog>;
}


export function UncertainCommentDialog(props: {
  kind: "quit" | "blocked";
  context: string;
  onStay: () => void;
  onQuit: () => void;
  restoreEditorFocus: () => void;
}) {
  let dialog: HTMLDialogElement | null = null;
  const stay = () => { dialog?.close(); props.onStay(); props.restoreEditorFocus(); };
  return <dialog className="comments-dialog" aria-label="Save status could not be confirmed"
    ref={node => { dialog = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); stay(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) stay();
    }}>
    <h3>Save status could not be confirmed</h3>
    {props.kind === "quit" ? <>
      <p>If you quit, the memory-only draft will be lost. This draft belongs to {props.context}.</p>
      <p>Quitting or restarting does not confirm that the comment was saved or that a directory child exited.</p>
    </> : <p>You cannot leave this draft in {props.context} because its save status could not be confirmed. Your original input is kept.</p>}
    <div className="comments-tools">
      <button type="button" className="comments-btn" autoFocus onClick={stay}>{props.kind === "quit" ? "Stay" : "Keep draft"}</button>
      {props.kind === "quit" && <button type="button" className="comments-btn" onClick={props.onQuit}>Quit anyway</button>}
    </div>
  </dialog>;
}
