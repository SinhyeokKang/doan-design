import { useId, type KeyboardEvent, type Ref } from "react";
import type { Comment, Target, Warning } from "../formats/types";
import type { ListFilter } from "../comments/projection";
import { targetLabel } from "../comments/targetLabel";
import { reopenText, resolutionText, type NamedLine } from "../comments/resolution";
import { ReviewBar, ReviewDone, ReviewNotice, type ReviewBarView, type ReviewDoneView, type ReviewNoticeView } from "./ReviewBar";
import { READ_FAILED_EDITOR, WARNINGS_TITLE, commentsPanelState, emptyListText, identityText, warningFileText, warningGroups, warningText, type IdentityCause } from "../comments/panelText";

// Frame ids with their titles, from the ls row or the rendered canvas, to name comment targets.
export type TargetFrames = ReadonlyArray<{ id: string; title?: string }>;

export type CopyView = { status: "idle" | "copying" | "copied" } | { status: "failed"; message: string };
export type AuthorView = { status: "ready" | "loading" | "missing" } | { status: "failed"; message: string };
export type CommentIntent = "locate" | "edit" | "resolve" | "reopen" | "delete" | "retry" | "check" | "read-latest" | "confirm-reviewed" | "comment-instead";
export type SaveView =
  | { status: "idle" | "saving" | "unknown" | "checking" | "retry-original" | "conflict" | "deleted" | "saved" }
  | { status: "failed" | "check-failed" | "recovery-blocked"; message: string }
  | { status: "reviewed"; latest: Comment };
export interface CommentEditorProps {
  mode: "create" | "edit";
  target: Target;
  // The draft's own canvas's frames; empty while another canvas is shown.
  frames: TargetFrames;
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
  // Present while a new comment is blocked as `reloaded` (comments/draft.ts).
  continue?: ContinueEditor | null;
  // Present for a resolved comment: Save then reopens it, and this saves only.
  saveOnly?: (() => void) | null;
}
export interface ContinueEditor {
  enabled: boolean;
  // Why the button is disabled; it takes the place of the preview line.
  reason: string | null;
  // Where "Continue on current version" would continue.
  preview: Target;
  // "Continue on canvas", once a missing selection has offered it.
  canvas: { enabled: boolean } | null;
  starting: "current" | "canvas" | null;
  error: string | null;
  onContinue: () => void;
  onCanvas: () => void;
}
export interface CommentsPanelProps {
  filter: ListFilter;
  selectionAvailable: boolean;
  selectionNode?: string | null;
  counts: { open: number; resolved: number };
  canvasOpenCount: number;
  read: { status: "loading" } | { status: "failed"; message: string } | { status: "ready"; comments: readonly Comment[]; warnings: readonly Warning[] };
  freshness: ReadonlyMap<string, "same" | "outdated" | "unknown">;
  // Null without a rendered document to look in: no badge and no locate.
  missingLocations: ReadonlySet<string> | null;
  author: AuthorView;
  // A refused canvas identity replaces the rest of the panel with one block.
  identityCause: IdentityCause;
  canvasId: string;
  frames: TargetFrames;
  writeBlocked: string | null;
  createBlocked: string | null;
  createError?: string | null;
  widthInvalid: boolean;
  busy: boolean;
  copies: ReadonlyMap<string, CopyView>;
  allCopy: CopyView;
  mutations?: ReadonlyMap<string, SaveView>;
  // Left in a card's place after the person's Resolve or Reopen moved it to
  // the other list; `before` is the card that followed it, null when it was last.
  statusLine?: { comment: string; text: string; before: string | null; show?: boolean } | null;
  // Show on the line after Save and reopen: list Open and focus that card.
  onShowStatus?: (comment: string) => void;
  // feature revision-recheck Review: the notice, the bar while it runs (the
  // filter rows collapse), and the summary Done leaves.
  reviewNotice?: ReviewNoticeView | null;
  reviewBar?: ReviewBarView | null;
  reviewDone?: ReviewDoneView | null;
  editor: CommentEditorProps | null;
  headingRef?: Ref<HTMLHeadingElement>;
  panelRef?: Ref<HTMLElement>;
  onFilter: (filter: ListFilter) => void;
  onCreate: (scope: ListFilter["scope"]) => void;
  onComment: (intent: CommentIntent, comment: string) => void;
  onCopy: (key: "all" | string) => void;
  onRead: () => void;
  onRetryAuthor: () => void;
}

export function relativeTime(at: string): string {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return at;
  const seconds = Math.round((parsed - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
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
  const editorBlocked = editor && (props.writeBlocked ?? (read.status === "failed" ? READ_FAILED_EDITOR : null) ?? (props.busy ? "A comment change is in progress." : null) ?? (author.status !== "ready" ? "A Git name is required before saving." : null) ?? (editor.mode === "create" && props.widthInvalid ? "Run doan check in a terminal to diagnose the canvas. A readable width is required to add comments and show pins." : null) ?? editor.blocked);
  const state = commentsPanelState(props.identityCause, read, author);
  const editorView = editor && <CommentEditor {...editor} blocked={editor.continue ? editor.blocked : editorBlocked || null} />;
  if (state.kind === "identity") {
    const text = identityText(state.cause, props.canvasId);
    return <section ref={props.panelRef} className="comments-panel native-scroll" aria-label="Comments">
      <h3 ref={props.headingRef} className="comments-title alone" tabIndex={-1}>Comments</h3>
      {editorView}
      <div className="comments-message error" role="alert"><b>{text.title}</b>{text.body}</div>
    </section>;
  }
  const elsewhere = filter.scope === "selection" ? Math.max(0, props.canvasOpenCount - props.counts.open) : 0;
  const shown = read.status === "ready" ? read.comments : [];
  const line = props.statusLine && !shown.some(c => c.comment === props.statusLine?.comment) ? props.statusLine : null;
  const lineAt = line ? shown.findIndex(c => c.comment === line.before) : -1;
  const statusLine = line && <p key="status-line" className="comments-status" role="status">{line.text}{line.show && <button type="button" onClick={() => props.onShowStatus?.(line.comment)}>Show</button>}</p>;
  const instead = props.createBlocked !== null || props.widthInvalid ? "blocked" : props.selectionAvailable ? "ready" : "no-selection";
  const empty = emptyListText(filter.scope, filter.status, elsewhere);
  // The title is the panel's own child so it can stay stuck while the head
  // scrolls away (a sticky h3 inside the head leaves with it).
  return <section ref={props.panelRef} className="comments-panel native-scroll" aria-label="Comments">
    <h3 ref={props.headingRef} className="comments-title" tabIndex={-1}>Comments</h3>
    <div className="comments-head">
      {!props.reviewBar && <>
      <div className="comments-segment" role="group" aria-label="Comment scope">
        <button type="button" aria-pressed={filter.scope === "selection"} disabled={!props.selectionAvailable || props.widthInvalid} title={props.selectionAvailable ? undefined : "Select an element or frame in the canvas"} onClick={() => props.onFilter({ scope: "selection", node: props.selectionNode ?? null, status: filter.status })}>Selection</button>
        <button type="button" aria-pressed={filter.scope === "canvas"} onClick={() => props.onFilter({ scope: "canvas", status: filter.status })}>Canvas</button>
      </div>
      <div className="comments-segment" role="group" aria-label="Comment status">
        <button type="button" aria-pressed={filter.status === "open"} onClick={() => props.onFilter({ ...filter, status: "open" })}>Open {props.counts.open}</button>
        <button type="button" aria-pressed={filter.status === "resolved"} onClick={() => props.onFilter({ ...filter, status: "resolved" })}>Resolved {props.counts.resolved}</button>
      </div>
      </>}
      <div className="comments-tools">
        <button type="button" className="comments-btn" disabled={read.status !== "ready" || props.canvasOpenCount === 0 || props.allCopy.status === "copying"} title="All open comments on this canvas, regardless of the visible filter" onClick={() => props.onCopy("all")}>{copyLabel(props.allCopy, true)}</button>
        <button type="button" className="comments-btn" disabled={createDisabled} onClick={() => props.onCreate(filter.scope)}>{filter.scope === "canvas" ? "Comment on canvas" : "Comment on selection"}</button>
      </div>
      {props.createError && <p className="comments-helper" role="alert">Couldn’t start comment: {props.createError}</p>}
      {props.allCopy.status === "copied" && <p className="comments-helper" role="status">Copied all open comments on this canvas.</p>}
      {props.allCopy.status === "failed" && <p className="comments-helper" role="alert">{props.allCopy.message}</p>}
    </div>
    {editorView}
    {props.widthInvalid && <div className="comments-message warning"><b>Could not read a valid board width.</b>Existing comments are still available. Run doan check in a terminal to diagnose the canvas. A readable width is required to add comments and show pins.</div>}
    {props.writeBlocked && <div className="comments-message error" role="alert"><b>Comments are read-only</b>{props.writeBlocked}</div>}
    {props.createBlocked && <div className="comments-message warning">{props.createBlocked}</div>}
    {state.authorBlock && <div className="comments-message warning" role="status">
      <b>{author.status === "loading" ? "Checking Git name…" : author.status === "missing" ? "Set your Git name" : "Couldn’t read Git identity"}</b>
      {author.status === "failed" ? author.message : "Set git user.name for this repository in your terminal, then choose Retry. Your email is optional."}
      <p>Adding, editing, resolving, reopening and deleting stay unavailable until a name is configured. Copy remains available.</p>
      <div className="comments-tools"><button type="button" className="comments-btn" disabled={author.status === "loading"} onClick={props.onRetryAuthor}>Retry</button></div>
    </div>}
    {/* Under the error and canvas-ID blocks (design review-notice, banner order); the bar is a panel child so it sticks under the title. */}
    {props.reviewDone && <ReviewDone {...props.reviewDone} />}
    {props.reviewBar ? <ReviewBar {...props.reviewBar} /> : props.reviewNotice && <ReviewNotice {...props.reviewNotice} />}
    {read.status === "loading" ? <div className="comments-message" role="status"><b>Loading comments…</b></div>
      : read.status === "failed" ? <div className="comments-message error" role="alert"><b>Couldn’t read comments</b>{read.message}<div className="comments-tools"><button type="button" className="comments-btn" onClick={props.onRead}>Retry</button></div></div>
        : <>
          {read.warnings.length > 0 && <div className="comments-message warning comments-warnings"><b>{WARNINGS_TITLE}</b>
            <ul>{warningGroups(read.warnings).map(group => <li key={group.code}>{warningText(group.code)}<span className="lines">{group.label}</span></li>)}</ul>
            <p className="file">{warningFileText(props.canvasId)}</p>
          </div>}
          {read.comments.length === 0 && statusLine}
          {read.comments.length === 0 && <div className="comments-message"><b>{empty.title}</b>{empty.body}</div>}
          {read.comments.flatMap((comment, index) => [index === lineAt && statusLine, <CommentCard key={comment.comment} comment={comment} frames={props.frames} freshness={props.freshness.get(comment.comment) ?? "unknown"} locationMissing={props.missingLocations?.has(comment.comment) ?? null} disabled={writesDisabled || editor !== null} busy={props.busy} copy={props.copies.get(comment.comment) ?? { status: "idle" }} mutation={props.mutations?.get(comment.comment)} instead={instead} onComment={props.onComment} onCopy={props.onCopy} />])}
          {read.comments.length > 0 && lineAt === -1 && statusLine}
        </>}
  </section>;
}

export interface CommentCardProps {
  comment: Comment;
  frames: TargetFrames;
  freshness: "same" | "outdated" | "unknown";
  // Null: no rendered document, so the target line is text without locate.
  locationMissing: boolean | null;
  disabled: boolean;
  busy: boolean;
  copy: CopyView;
  mutation?: SaveView | undefined;
  // Whether "Comment on selection instead" can start a new comment now.
  instead?: "ready" | "no-selection" | "blocked";
  onComment: (intent: CommentIntent, comment: string) => void;
  onCopy: (key: "all" | string) => void;
}
export function CommentCard({ comment, frames, freshness, locationMissing, disabled, busy, copy, mutation, instead = "blocked", onComment, onCopy }: CommentCardProps) {
  const { createdBy } = comment;
  const initials = createdBy.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase();
  const locked = disabled || busy || (mutation !== undefined && mutation.status !== "idle" && mutation.status !== "saved");
  const target = targetLabel(comment.target, frames);
  const resolution = resolutionText(comment, relativeTime), reopen = reopenText(comment, relativeTime);
  const reasonId = useId();
  return <article className="comments-card" tabIndex={-1} data-comment={comment.comment} aria-label={`Comment by ${createdBy.name}`} aria-busy={busy || mutation?.status === "saving"}>
    <div className="comments-author"><span className="comments-avatar" aria-hidden="true">{initials}</span><div className="comments-by"><b>{createdBy.name}</b>{createdBy.kind === "human" && createdBy.email && <span className="comments-email">{createdBy.email}</span>}<time dateTime={comment.createdAt} title={comment.createdAt}>{relativeTime(comment.createdAt)}</time></div></div>
    {locationMissing === false && target.locatableHint
      ? <button type="button" className="comments-target locatable" title={`Show on canvas\n${target.title}`} onClick={() => onComment("locate", comment.comment)}>{target.text}</button>
      // A span, not a disabled button: the global button:disabled opacity would fade it.
      : <span className="comments-target" title={target.title}>{target.text}</span>}
    {/* A resolved card's canvas is expected to have changed since, so freshness is not news there (feature revision-recheck Q3). */}
    <div className="comments-badges"><span className={`comments-badge ${comment.status}`}>{comment.status === "open" ? "Open" : "Resolved"}</span>{comment.status === "open" && freshness !== "same" && (freshness === "outdated" ? <span className="comments-badge" title="The canvas changed after this comment was written.">Canvas changed</span> : <span className="comments-badge">Freshness unknown</span>)}{locationMissing && <><span className="comments-badge warning">Location unavailable</span><span className="comments-badge-note">Not found in the current canvas.</span></>}</div>
    {resolution && <ResolutionLine line={resolution} />}
    {reopen && <><ResolutionLine line={reopen.reopened} /><ResolutionLine line={reopen.previously} /></>}
    <p className="comments-body">{comment.body}</p>
    <div className="comments-tools">
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment("edit", comment.comment)}>Edit</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment(comment.status === "open" ? "resolve" : "reopen", comment.comment)}>{comment.status === "open" ? "Resolve" : "Reopen"}</button>
      <button type="button" className="comments-btn" disabled={comment.status === "resolved" || copy.status === "copying"} onClick={() => onCopy(comment.comment)}>{copyLabel(copy)}</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onComment("delete", comment.comment)}>Delete</button>
    </div>
    {/* An explicit human action on a target that is gone; comments are never re-attached (feature revision-recheck Q6). */}
    {comment.status === "open" && locationMissing && <>
      <div className="comments-tools instead"><button type="button" className="comments-btn" disabled={locked || instead !== "ready"} aria-describedby={instead === "no-selection" ? reasonId : undefined} onClick={() => onComment("comment-instead", comment.comment)}>Comment on selection instead</button></div>
      {instead === "no-selection" && <p className="comments-helper" id={reasonId}>Select an element or frame first.</p>}
    </>}
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

function ResolutionLine({ line }: { line: NamedLine }) {
  const text = <>{line.lead}<b>{line.name}</b>{line.tail}</>;
  return <p className="comments-resolution">{line.at === undefined ? text : <time dateTime={line.at} title={line.at}>{text}</time>}</p>;
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

// Focusing the input alone can leave Save below a short panel; the composer
// then goes right under the sticky title (design composer-small).
export function revealComposer(field: HTMLElement): void {
  const panel = field.closest<HTMLElement>(".comments-panel"), composer = field.closest<HTMLElement>(".comments-composer");
  if (!panel || !composer) return;
  const title = panel.querySelector<HTMLElement>(".comments-title")?.offsetHeight ?? 0;
  const top = composer.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  if (top < panel.scrollTop + title || top + composer.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = top - title;
}

export function CommentEditor(props: CommentEditorProps) {
  const { state, continue: next } = props;
  const target = targetLabel(props.target, props.frames);
  const reasonId = useId();
  const locked = pending(state) || state.status === "saved";
  const cannotSave = locked || !!props.blocked || !props.body.trim() || state.status === "conflict" || state.status === "deleted";
  const label = props.mode === "create" ? "New comment" : "Your unsaved edit";
  // Esc closes an edit editor before Review and the selection, so it is consumed
  // even when Cancel is unavailable. A new comment's composer keeps its text on Esc.
  const escape = props.mode === "edit" ? (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (!locked && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) props.onCancel();
  } : undefined;
  return <><div className="comments-composer" aria-busy={state.status === "saving" || state.status === "checking"} onKeyDown={escape}>
    <label>{label}<span className="comments-target" title={target.title}>To: {target.text}</span><textarea ref={props.inputRef} aria-label={`${label} body`} value={props.body} readOnly={locked} onChange={event => { if (!locked) props.onBody(event.currentTarget.value); }} /></label>
    <div className="comments-tools">
      <button type="button" className="comments-btn" disabled={state.status === "saving" || state.status === "saved"} onClick={locked ? props.onKeepDraft : props.onCancel}>{locked ? "Keep draft" : "Cancel"}</button>
      {next?.canvas && <button key="continue-canvas" type="button" className="comments-btn" disabled={!next.canvas.enabled || next.starting !== null} onClick={next.onCanvas}>{next.starting === "canvas" ? "Starting…" : "Continue on canvas"}</button>}
      {next ? <button key="continue" type="button" className="comments-btn primary" disabled={!next.enabled || next.starting !== null} aria-describedby={next.reason === null ? undefined : reasonId} onClick={next.onContinue}>{next.starting === "current" ? "Starting…" : "Continue on current version"}</button>
        : state.status === "retry-original" ? <button key="retry-original" type="button" className="comments-btn primary" disabled={!!props.blocked} onClick={props.onRetryOriginal}>Retry original save</button> : <>
          {props.saveOnly && <button key="save-only" type="button" className="comments-btn" disabled={cannotSave} onClick={props.saveOnly}>Save only</button>}
          <button key="save" type="button" className="comments-btn primary" disabled={cannotSave} onClick={props.onSave}>{state.status === "saving" ? "Saving…" : props.saveOnly ? "Save and reopen" : state.status === "reviewed" ? "Save reviewed changes" : props.mode === "edit" ? "Save changes" : "Save comment"}</button>
        </>}
    </div>
    {props.saveOnly && <p className="comments-helper">Agents read open comments only.</p>}
    {props.blocked && <p className="comments-helper" role="status">{props.blocked}</p>}
    {next && (next.reason === null ? <p className="comments-helper">Continues on {targetLabel(next.preview, props.frames).text}.</p> : <p className="comments-helper" id={reasonId}>{next.reason}</p>)}
    {next?.error && <p className="comments-helper" role="alert">Couldn’t continue on the current version: {next.error.replace(/\.$/, "")}. Your text is kept.</p>}
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
  frames: TargetFrames;
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
    <p>Your unsaved comment belongs to {props.context}. {props.canSave ? "Save it before moving, discard it, or keep writing here." : "Saving is unavailable. Discard the draft to continue or keep writing on the original draft."}</p>
    <p className="comments-target">To: {targetLabel(props.target, props.frames).text}</p>
    {props.reason && <p role="status">{props.reason}</p>}
    <div className="comments-tools">
      <button type="button" className="comments-btn" autoFocus disabled={props.busy} onClick={keepWriting}>Keep writing</button>
      <button type="button" className="comments-btn" disabled={props.busy || props.discardBlocked} onClick={props.onDiscard}>Discard</button>
      <button type="button" className="comments-btn primary" disabled={!props.canSave || props.busy} onClick={props.onSave}>{props.busy ? "Saving…" : "Save and continue"}</button>
    </div>
  </dialog>;
}


// `replacedOn`: the target label of the new comment that took this one's text;
// the dialog then asks about the original (feature revision-recheck Q6).
export function DeleteCommentDialog({ comment, replacedOn, onCancel, onConfirm }: { comment: Comment; replacedOn?: string; onCancel: () => void; onConfirm: () => void }) {
  let dialog: HTMLDialogElement | null = null;
  const cancel = () => { dialog?.close(); onCancel(); };
  const title = replacedOn === undefined ? "Delete this comment?" : "Delete the original comment?";
  return <dialog className="comments-dialog" aria-label={title} ref={node => { dialog = node; if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); cancel(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) cancel();
    }}>
    <h3>{title}</h3>
    {replacedOn === undefined ? <><p className="comments-body">{comment.body}</p><p>This comment will be removed and cannot be restored.</p></>
      : <p>Your text was saved as a new comment on {replacedOn}.</p>}
    <div className="comments-tools"><button type="button" className="comments-btn" autoFocus onClick={cancel}>{replacedOn === undefined ? "Cancel" : "Keep both"}</button>
      <button type="button" className={replacedOn === undefined ? "comments-btn" : "comments-btn danger"} onClick={() => { dialog?.close(); onConfirm(); }}>{replacedOn === undefined ? "Delete comment" : "Delete original"}</button></div>
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
    {props.kind === "quit" ? <p>If you quit, this draft is lost. Quitting does not tell Doan whether the save finished, and restarting does not confirm it either. Check the comment after you reopen Doan.</p>
      : <p>You cannot leave this draft in {props.context} because its save status could not be confirmed. Your original input is kept.</p>}
    <div className="comments-tools">
      <button type="button" className="comments-btn" autoFocus onClick={stay}>{props.kind === "quit" ? "Stay" : "Keep draft"}</button>
      {props.kind === "quit" && <button type="button" className="comments-btn" onClick={props.onQuit}>Quit anyway</button>}
    </div>
  </dialog>;
}
