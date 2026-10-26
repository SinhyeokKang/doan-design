import { beginDraft, guardsSelectionChange, transitionDraft, type DraftState } from "../comments/draft";
import type { ExpectedComment, MutationIntent } from "../comments/events";
import type { CopyScope } from "../comments/projection";
import { reviewState, reviewSummary, startReview, toReview, type ReviewMarker, type ReviewState } from "../comments/review";
import type { Comment, Target } from "../formats/types";
import type { CanvasIdentityCause } from "../main/comments/identity";
import type { BeginResult, CommentIdentity, CommentList, CommentReply, CommentRequest, MutationRequest, SavedStatus } from "../main/comments/service";
import type { DoanApi } from "../preload";
import type { AuthorView, CopyView, SaveView } from "./CommentsPanel";

// The review marker calls are optional so sessions built without them (tests) read none.
type Api = Pick<DoanApi, "commentsList" | "commentsAuthor" | "commentsBegin" | "commentsMutate" | "commentsStatus" | "commentsCopy" | "setCommentDraftGuard"> &
  Partial<Pick<DoanApi, "reviewMarker" | "raiseReviewMarker">>;
const emptyDraft = (): DraftState => ({ draft: null, transition: null, request: null, error: null });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Comments operation failed.";
// How long the line left in a resolved or reopened card's place stays (feature revision-recheck).
export const STATUS_LINE_MS = 4000;
const statusText = { resolve: "Resolved — moved to Resolved.", reopen: "Reopened — moved to Open." } as const;
export function expectedComment(c: Comment): ExpectedComment {
  return { body: c.body, status: c.status, updatedAt: c.updatedAt, ...(c.resolvedAt === undefined ? {} : { resolvedAt: c.resolvedAt }) };
}
function same(a: CommentIdentity | null, b: CommentIdentity | null): boolean {
  return a?.root === b?.root && a?.canvas === b?.canvas && a?.path === b?.path;
}
// A Review and its marker belong to the canvas, which keeps its id across a move.
function sameCanvas(a: Pick<CommentIdentity, "root" | "canvas"> | null, b: Pick<CommentIdentity, "root" | "canvas"> | null): boolean {
  return !!a && !!b && a.root === b.root && a.canvas === b.canvas;
}
export type ReviewMove = "next" | "previous" | "done" | "close";
// `comments`: the last copy of each step's comment, so a step deleted
// meanwhile still shows its target and text. `notFound`: the step whose
// target the canvas could not find when Review moved there.
export interface ReviewRun { root: string; canvas: string; state: ReviewState; comments: Map<string, Comment>; notFound: string | null }
class RefusedIdentity extends Error {
  constructor(message: string, readonly identityCause: CanvasIdentityCause) { super(message); }
}
function value<T>(reply: CommentReply<T>, request: CommentRequest): T {
  if (!reply.identity || !same(reply.identity, request) || reply.identity.requestID !== request.requestID) throw new Error("Stale comments response.");
  if (!reply.ok) throw reply.cause ? new RefusedIdentity(reply.error, reply.cause) : new Error(reply.error);
  return reply.value;
}

// Main owns write authority. This session owns only displayed state, immutable
// pending payloads, and the promise which holds a controllable UI transition.
export class CommentsSession {
  identity: CommentIdentity | null = null;
  list: CommentList | null = null;
  readError: string | null = null;
  // Why main refused this canvas's identity on the last read, if it did.
  identityCause: CanvasIdentityCause | null = null;
  createError: string | null = null;
  // A failed continue keeps the blocked draft; its error is separate from a create failure.
  continueError: string | null = null;
  author: AuthorView = { status: "loading" };
  draft = emptyDraft();
  target: Target = {};
  saveView: SaveView = { status: "idle" };
  copies = new Map<string, CopyView>();
  mutations = new Map<string, SaveView>();
  busy = false;
  beginning = false;
  // The scope of the continue being started, while `beginning`.
  continuing: "canvas" | "selection" | null = null;
  // The draft id a continue produced, so the editor puts the caret at the end once.
  continued: string | null = null;
  // The comment a save just wrote, once the list has been read again, so the
  // panel moves focus to its card once (cleared by the panel).
  savedComment: string | null = null;
  // The draft id whose missing selection offered "Continue on canvas" (set by the editor).
  canvasOffered: string | null = null;
  composing = false;
  uncertainTransition: { id: string; kind: "quit" | "blocked" } | null = null;
  // `replacedOn`: the target of the new comment that replaced this one (Comment on selection instead).
  deleteConfirmation: { request: MutationRequest; comment: Comment; replacedOn?: Target } | null = null;
  // Left where a card was after the person's own Resolve or Reopen moved it to
  // the other list; `show` after Save and reopen, which leaves from the editor.
  statusLine: { comment: string; text: string; show?: true } | null = null;
  // The Git name the author read returned; the person's own resolves are not theirs to review.
  self: string | null = null;
  // This canvas's device-local last review time (main's review-state.json).
  marker: ReviewMarker | null = null;
  review: ReviewRun | null = null;
  // Left after Done until closed, another canvas, or a resolve this Review did not see.
  reviewDone: { text: string; reopened: string[]; seen: ReadonlySet<string> } | null = null;
  // Told after main raised a canvas's marker, so Home and Overview counts follow.
  onReviewed: ((root: string) => void) | null = null;
  private markerRevision = 0;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private beginRevision = 0;
  private readRevision = 0;
  private authorRevision = 0;
  private origin: BeginResult | null = null;
  private draftIdentity: CommentIdentity | null = null;
  private project = 0;
  private pending: MutationRequest | null = null;
  private cardPending = new Map<string, MutationRequest>();
  // The create draft written to replace a comment whose target is gone.
  private replacing: { draft: string; comment: string } | null = null;
  private destination: ((allowed: boolean) => void) | null = null;
  constructor(private api: Api, private changed: () => void) {}
  private emit() { this.changed(); }
  private cancelDestination() {
    this.uncertainTransition = null;
    this.draft = { ...this.draft, transition: null };
    this.destination?.(false); this.destination = null;
  }
  private cancelBegin() {
    // Release before a new begin can acquire the guard. Late IPC completions
    // must never release it on behalf of the obsolete document.
    if (this.beginning && !this.draft.draft) void this.api.setCommentDraftGuard(false);
    this.beginRevision++; this.beginning = false; this.continuing = null;
  }
  private showStatus(comment: string, type: keyof typeof statusText, show = false) {
    clearTimeout(this.statusTimer);
    this.statusLine = { comment, text: statusText[type], ...(show ? { show: true as const } : {}) };
    this.statusTimer = setTimeout(() => { this.statusTimer = undefined; this.statusLine = null; this.emit(); }, STATUS_LINE_MS);
  }
  // The line stands for a place in this document's list; another canvas or a
  // replaced document has no such place.
  private clearStatus() { clearTimeout(this.statusTimer); this.statusTimer = undefined; this.statusLine = null; }
  private request(identity = this.identity): CommentRequest {
    if (!identity) throw new Error("No canvas open.");
    return { ...identity, requestID: crypto.randomUUID() };
  }
  async open(identity: CommentIdentity | null) {
    if (same(identity, this.identity)) return;
    this.revision++;
    this.cancelBegin();
    this.identity = identity;
    this.list = null; this.readError = null; this.identityCause = null; this.createError = null; this.continueError = null; this.copies = new Map(); this.mutations = new Map(); this.deleteConfirmation = null;
    this.clearStatus();
    // Another canvas ends Review; the progress passed is already raised.
    if (!sameCanvas(identity, this.review)) this.review = null;
    this.reviewDone = null; this.marker = null; this.markerRevision++;
    if (this.draft.draft && !same(identity, this.draftIdentity)) this.invalidate("The original project or canvas is no longer open.");
    this.emit();
    if (identity) await Promise.all([this.read(), this.retryAuthor(), this.readMarker()]);
  }
  // The open canvas moved to `path` with the same id: the same comments, so
  // the list, filters and anchors stay. The bumped revision drops replies for
  // the old path; an edit draft without a request follows to save there.
  async rename(path: string) {
    if (!this.identity || this.identity.path === path) return;
    this.revision++;
    this.cancelBegin();
    this.identity = { ...this.identity, path };
    if (this.draft.draft?.origin.kind === "edit" && !this.draft.request && this.draftIdentity) this.draftIdentity = { ...this.draftIdentity, path };
    this.createError = null; this.continueError = null; this.copies = new Map();
    this.emit();
    await Promise.all([this.read(), this.author.status === "loading" ? this.retryAuthor() : undefined]);
  }
  // Requests carry the path main checks, so a move is followed only when none
  // is in flight or still left for the person to finish (feature
  // revision-continuity R2). Judged by the card's shown state: `cardPending`
  // keeps finished entries (and survives `open()`), which must not block forever.
  canFollow(): boolean {
    const finished = ["idle", "saved", "deleted"];
    return !this.pending && !this.draft.request && !this.busy && !this.deleteConfirmation &&
      [...this.mutations.values()].every(state => finished.includes(state.status));
  }
  async read(review = false, card?: string) {
    if (!this.identity) return;
    const rev = this.revision, read = ++this.readRevision, request = this.request();
    try {
      const list = value(await this.api.commentsList(request), request);
      if (rev !== this.revision || read !== this.readRevision) return;
      this.list = list; this.readError = null; this.identityCause = null;
      this.reviewRead(list.comments);
      if (review) for (const [id, state] of this.mutations) {
        if (state.status !== "conflict" || (card !== undefined && card !== id)) continue;
        const current = list.comments.find(c => c.comment === id), pending = this.cardPending.get(id);
        if (!current) this.mutations.set(id, { status: "deleted" });
        else if ((pending?.intent.type === "resolve" && current.status === "resolved") || (pending?.intent.type === "reopen" && current.status === "open")) {
          this.mutations.set(id, { status: "idle" }); this.cardPending.delete(id);
        } else this.mutations.set(id, { status: "reviewed", latest: current });
      }
      const draft = this.draft.draft;
      if (draft?.origin.kind === "edit" && same(this.draftIdentity, this.identity) && !this.pending) {
        const id = draft.origin.comment;
        const current = list.comments.find(c => c.comment === id);
        if (!current) this.saveView = { status: "deleted" };
        else if (review) {
          this.project = list.project;
          this.draft = { ...this.draft, draft: { ...draft, blocked: null, origin: { ...draft.origin, expected: expectedComment(current) } } };
          this.saveView = { status: "reviewed", latest: current };
        } else if (JSON.stringify(expectedComment(current)) !== JSON.stringify(draft.origin.expected)) this.saveView = { status: "conflict" };
      }
    } catch (error) {
      if (rev === this.revision && read === this.readRevision) {
        this.readError = errorText(error);
        this.identityCause = error instanceof RefusedIdentity ? error.identityCause : null;
      }
    }
    this.emit();
  }
  async retryAuthor() {
    if (!this.identity) return;
    const rev = this.revision, tag = ++this.authorRevision, request = this.request();
    this.author = { status: "loading" }; this.emit();
    try {
      const author = value(await this.api.commentsAuthor(request), request);
      if (rev !== this.revision || tag !== this.authorRevision) return;
      this.author = { status: author.kind === "human" && author.name.trim() ? "ready" : "missing" };
      this.self = author.kind === "human" && author.name.trim() ? author.name : null;
    } catch (error) {
      if (rev !== this.revision || tag !== this.authorRevision) return;
      const message = errorText(error);
      this.author = /user.name|Git user name|Git name/i.test(message) ? { status: "missing" } : { status: "failed", message };
      this.self = null;
    }
    this.emit();
  }
  async create(scope: "canvas" | "selection", body = "", replaces?: string) {
    if (!this.identity || !this.list || this.draft.draft || this.busy || this.beginning || this.author.status !== "ready") return;
    const begin = ++this.beginRevision, request = this.request();
    this.beginning = true; this.createError = null; this.emit();
    try {
      const origin = value(await this.api.commentsBegin({ ...request, scope }), request);
      if (begin !== this.beginRevision || this.draft.draft) return;
      // Establish main's guard before exposing an editable draft.
      await this.api.setCommentDraftGuard(true);
      if (begin !== this.beginRevision) return;
      this.origin = origin; this.project = origin.project; this.draftIdentity = { ...this.identity };
      this.target = structuredClone(origin.target);
      this.draft = beginDraft(crypto.randomUUID(), { kind: "create", ...this.identity, generation: 0, canvasHash: origin.hash, target: origin.target }, body);
      this.replacing = replaces === undefined || !this.draft.draft ? null : { draft: this.draft.draft.id, comment: replaces };
      this.saveView = { status: "idle" };
    } catch (error) { if (begin === this.beginRevision) this.createError = errorText(error); }
    finally { if (begin === this.beginRevision) this.beginning = false; this.emit(); }
  }
  // A new begin on the current version for a create draft blocked as `reloaded`.
  // Main's guard stays true for the blocked draft throughout: an obsolete or
  // failed continue leaves that draft, so nothing here ever releases it.
  async continueDraft(scope: "canvas" | "selection") {
    const draft = this.draft.draft;
    if (!this.identity || !draft || draft.origin.kind !== "create" || draft.lost !== "reloaded" || this.draft.request || this.busy || this.beginning || this.author.status !== "ready") return;
    const begin = ++this.beginRevision, request = this.request(), identity = { ...this.identity };
    this.beginning = true; this.continuing = scope; this.continueError = null; this.emit();
    try {
      const origin = value(await this.api.commentsBegin({ ...request, scope }), request);
      if (begin !== this.beginRevision || this.draft.draft?.id !== draft.id) return;
      await this.api.setCommentDraftGuard(true);
      if (begin !== this.beginRevision) return;
      const result = transitionDraft(this.draft, { type: "continue", id: crypto.randomUUID(), origin: { kind: "create", ...identity, generation: 0, canvasHash: origin.hash, target: origin.target } });
      if (result.effect.type !== "focus-editor") return;
      this.origin = origin; this.project = origin.project; this.draftIdentity = identity;
      this.target = structuredClone(origin.target);
      this.draft = result.state; this.continued = result.state.draft?.id ?? null;
      if (this.replacing?.draft === draft.id && this.continued) this.replacing = { ...this.replacing, draft: this.continued };
      this.saveView = { status: "idle" };
    } catch (error) { if (begin === this.beginRevision) this.continueError = errorText(error); }
    finally { if (begin === this.beginRevision) { this.beginning = false; this.continuing = null; } this.emit(); }
  }
  // A comment is not re-attached (PRODUCT §5 item 5): the person writes the same
  // body anew on the selection and then decides about the original.
  async commentInstead(id: string) {
    const comment = this.list?.comments.find(c => c.comment === id);
    if (comment?.status === "open") await this.create("selection", comment.body, id);
  }
  edit(id: string) {
    if (!this.identity || !this.list || this.draft.draft || this.busy || this.author.status !== "ready") return;
    const comment = this.list.comments.find(c => c.comment === id);
    if (!comment) return;
    this.project = this.list.project; this.draftIdentity = { ...this.identity }; this.origin = null;
    this.target = structuredClone(comment.target);
    this.draft = beginDraft(crypto.randomUUID(), { kind: "edit", root: this.identity.root, canvas: this.identity.canvas, comment: id, expected: expectedComment(comment) }, comment.body);
    this.saveView = { status: "idle" };
    void this.api.setCommentDraftGuard(true).catch(error => this.invalidate(errorText(error)));
    this.emit();
  }
  body(body: string) { this.draft = transitionDraft(this.draft, { type: "body", body }).state; this.emit(); }
  invalidate(reason: string) {
    this.cancelDestination();
    this.draft = transitionDraft(this.draft, { type: "invalidate", reason }).state; this.emit();
  }
  // `loading`: the canvas is still loading, so the new document is not known yet.
  documentLost(loading = false) {
    this.cancelBegin(); this.clearStatus();
    this.createError = null; this.continueError = null; this.emit();
    if (this.draft.draft?.origin.kind !== "create") return;
    this.cancelDestination();
    const identity = this.identity && { root: this.identity.root, canvas: this.identity.canvas };
    this.draft = transitionDraft(this.draft, { type: "document-lost", identity, loading }).state; this.emit();
  }
  private stablePending() {
    return this.draft.request !== null && ["unknown", "check-failed", "recovery-blocked"].includes(this.saveView.status);
  }
  guard(kind: "move" | "quit" = "move"): boolean | Promise<boolean> {
    if (this.uncertainTransition) this.cancelDestination();
    if (this.composing || this.beginning || this.busy) { this.emit(); return false; }
    if (this.draft.request) {
      if (!this.stablePending()) { this.emit(); return false; }
      this.cancelDestination();
      this.uncertainTransition = { id: crypto.randomUUID(), kind: kind === "quit" ? "quit" : "blocked" };
      const result = kind === "quit" ? new Promise<boolean>(resolve => { this.destination = resolve; }) : false;
      this.emit(); return result;
    }
    if (!this.draft.draft) return true;
    this.cancelDestination();
    const result = new Promise<boolean>(resolve => { this.destination = resolve; });
    this.draft = transitionDraft(this.draft, { type: "move", destination: crypto.randomUUID() }).state;
    this.emit(); return result;
  }
  // A selection change inside the open canvas. A draft blocked as `reloaded`
  // cannot be saved and keeps its body, so the change is not asked about.
  guardSelection(): boolean | Promise<boolean> {
    if (this.draft.draft && !guardsSelectionChange(this.draft, "selection") && !this.composing && !this.beginning && !this.busy) return true;
    return this.guard();
  }
  answerUncertain(id: string, quit: boolean) {
    const transition = this.uncertainTransition;
    if (!transition || transition.id !== id) return;
    if (quit && (transition.kind !== "quit" || !this.stablePending() || this.composing || this.beginning || this.busy)) return;
    // Approve only this intent. The immutable request and main's guard survive.
    const resolve = this.destination;
    this.destination = null; this.uncertainTransition = null;
    resolve?.(quit); this.emit();
  }
  answer(choice: "continue" | "discard") {
    if (this.draft.request) {
      if (choice === "continue") { this.draft = { ...this.draft, transition: null }; this.destination?.(false); this.destination = null; this.emit(); }
      return;
    }
    // A continue still starting belongs to the discarded draft.
    if (choice === "discard") this.cancelBegin();
    this.draft = transitionDraft(this.draft, { type: "answer", choice }).state;
    this.destination?.(choice === "discard"); this.destination = null;
    if (choice === "discard") { this.pending = null; void this.api.setCommentDraftGuard(false); }
    this.emit();
  }
  // `reopen`: Save and reopen on a resolved comment, one append of edit and reopen.
  async save(reopen = false) {
    const draft = this.draft.draft;
    if (!draft || !this.draftIdentity || this.pending || this.author.status !== "ready" || ["conflict", "deleted"].includes(this.saveView.status)) return;
    const requestID = crypto.randomUUID();
    const result = transitionDraft(this.draft, { type: "save", request: requestID });
    if (result.effect.type !== "save") return;
    this.draft = result.state;
    const intent: MutationIntent = draft.origin.kind === "create" ? { type: "create", body: draft.body }
      : { type: reopen && draft.origin.expected.status === "resolved" ? "edit-reopen" : "edit", comment: draft.origin.comment, expected: draft.origin.expected, body: draft.body };
    this.pending = structuredClone({ ...this.draftIdentity, project: this.project, requestID, intent, ...(this.origin ? { origin: this.origin.origin } : {}) });
    await this.submit(this.pending);
  }
  private async submit(request: MutationRequest) {
    this.saveView = { status: "saving" }; this.emit();
    try {
      const response = await this.api.commentsMutate(request);
      if (!response.ok && response.identity && same(response.identity, request) && response.identity.requestID === request.requestID) {
        if (request !== this.pending || !this.draft.draft) return;
        this.draft = transitionDraft(this.draft, { type: "saved", request: request.requestID, draft: this.draft.draft.id, outcome: "failed", error: response.error }).state;
        this.pending = null;
        this.saveView = /no longer exists/.test(response.error) ? { status: "deleted" } : /Comment changed/.test(response.error) ? { status: "conflict" } : { status: "failed", message: response.error };
        this.cancelDestination(); this.emit(); return;
      }
      await this.settle(value(response, request), request);
    }
    catch (error) {
      // Transport failures have no proof that append did not happen.
      this.saveView = { status: "unknown" }; this.cancelDestination(); this.emit();
    }
  }
  private async settle(status: SavedStatus, request: MutationRequest) {
    if (request !== this.pending || !this.draft.draft) return;
    if (this.uncertainTransition) this.cancelDestination();
    if (status.state === "saved") {
      const origin = this.draft.draft.origin, rev = this.revision, target = structuredClone(this.target);
      const replacing = this.replacing?.draft === this.draft.draft.id ? this.replacing.comment : null;
      if (replacing !== null) this.replacing = null;
      this.draft = transitionDraft(this.draft, { type: "saved", request: request.requestID, draft: this.draft.draft.id, outcome: "saved" }).state;
      this.pending = null; this.saveView = { status: "idle" };
      await this.api.setCommentDraftGuard(false);
      this.destination?.(true); this.destination = null;
      if (origin.kind === "edit" && request.intent.type === "edit-reopen") this.reviewReopened(origin.comment);
      await this.read();
      this.savedComment = status.comment ?? (origin.kind === "edit" ? origin.comment : null);
      if (rev === this.revision && origin.kind === "edit" && request.intent.type === "edit-reopen") this.showStatus(origin.comment, "reopen", true);
      const original = rev === this.revision && replacing !== null ? this.list?.comments.find(c => c.comment === replacing) : undefined;
      if (original && this.list) this.deleteConfirmation = { request: { ...this.request(), project: this.list.project, intent: { type: "delete", comment: original.comment, expected: expectedComment(original) } }, comment: structuredClone(original), replacedOn: target };
    } else if (status.recovery === "child-exit-required") this.saveView = { status: "recovery-blocked", message: status.error ?? "Confirm externally that the directory child exited, then restart the app." };
    else this.saveView = { status: status.state === "absent" ? "retry-original" : "unknown" };
    if (status.state !== "saved") this.cancelDestination();
    this.emit();
  }
  async check() {
    if (!this.pending || this.saveView.status === "recovery-blocked" || this.saveView.status === "checking") return;
    this.cancelDestination();
    const request = this.pending; this.saveView = { status: "checking" }; this.emit();
    try { const { root, path, canvas, requestID } = request; await this.settle(value(await this.api.commentsStatus({ root, path, canvas, requestID }), request), request); }
    catch (error) { this.saveView = { status: "check-failed", message: errorText(error) }; this.emit(); }
  }
  async retry() { if (this.pending && this.saveView.status === "retry-original") { this.cancelDestination(); await this.submit(this.pending); } }
  async copy(scope: CopyScope) {
    if (!this.identity || !this.list || this.readError) return;
    const rev = this.revision, request = this.request(), key = scope.kind === "all" ? "all" : scope.comment;
    this.copies.set(key, { status: "copying" }); this.emit();
    try { value(await this.api.commentsCopy({ ...request, scope }), request); if (rev === this.revision) this.copies.set(key, { status: "copied" }); }
    catch (error) { if (rev === this.revision) this.copies.set(key, { status: "failed", message: errorText(error) }); }
    this.emit();
  }
  async mutate(type: "delete" | "resolve" | "reopen", id: string) {
    if (!this.identity || !this.list || this.busy || this.draft.draft || this.author.status !== "ready") return;
    const c = this.list.comments.find(c => c.comment === id); if (!c) return;
    const request: MutationRequest = { ...this.request(), project: this.list.project, intent: { type, comment: id, expected: expectedComment(c) } };
    if (type === "delete") { this.deleteConfirmation = { request, comment: structuredClone(c) }; this.emit(); return; }
    this.cardPending.set(id, request); await this.cardSubmit(id, request, false);
  }
  cancelDelete() { this.deleteConfirmation = null; this.emit(); }
  async confirmDelete() {
    const pending = this.deleteConfirmation; this.deleteConfirmation = null; this.emit();
    if (!pending || !same(pending.request, this.identity)) return;
    this.cardPending.set(pending.comment.comment, pending.request);
    await this.cardSubmit(pending.comment.comment, pending.request, false);
  }
  async confirmCard(id: string) {
    const state = this.mutations.get(id), previous = this.cardPending.get(id);
    if (state?.status !== "reviewed" || !previous || !this.list || !same(previous, this.identity) || previous.intent.type === "create" || previous.intent.type === "edit" || previous.intent.type === "edit-reopen") return;
    const request: MutationRequest = { ...this.request(), project: this.list.project, intent: { type: previous.intent.type, comment: id, expected: expectedComment(state.latest) } };
    if (request.intent.type === "delete") { this.deleteConfirmation = { request, comment: structuredClone(state.latest) }; this.emit(); return; }
    this.cardPending.set(id, request); await this.cardSubmit(id, request, false);
  }
  async cardRetry(id: string, check: boolean) {
    const request = this.cardPending.get(id), status = this.mutations.get(id)?.status;
    if (!request || this.busy || status === "recovery-blocked" || (!check && status !== "retry-original" && status !== "failed")) return;
    await this.cardSubmit(id, request, check);
  }
  private async cardSubmit(id: string, request: MutationRequest, check: boolean) {
    const rev = this.revision; this.busy = true; this.mutations.set(id, { status: check ? "checking" : "saving" }); this.emit();
    try {
      const { root, path, canvas, requestID } = request;
      const response = check ? await this.api.commentsStatus({ root, path, canvas, requestID }) : await this.api.commentsMutate(request);
      if (rev !== this.revision) return;
      if (!response.ok) {
        if (!response.identity || !same(response.identity, request) || response.identity.requestID !== request.requestID) throw new Error("Stale comments response.");
        this.mutations.set(id, /no longer exists/.test(response.error) ? { status: "deleted" } : /Comment changed|Comment status changed/.test(response.error) ? { status: "conflict" } : { status: "failed", message: response.error });
      }
      else {
        const status = value(response, request), type = request.intent.type;
        // "Comment saved … No duplicate was added." answers a status check; a
        // change that simply succeeded has nothing to say on the card.
        this.mutations.set(id, status.recovery ? { status: "recovery-blocked", message: status.error ?? "Confirm child exit externally, then restart the app." } : { status: status.state === "saved" ? (check || type === "delete" ? "saved" : "idle") : status.state === "absent" ? "retry-original" : "unknown" });
        if (status.state === "saved") {
          this.cardPending.delete(id);
          if (type === "reopen") this.reviewReopened(id);
          await this.read();
          if (rev === this.revision && (type === "resolve" || type === "reopen")) this.showStatus(id, type);
        }
      }
    } catch (error) { if (rev === this.revision) this.mutations.set(id, check ? { status: "check-failed", message: errorText(error) } : { status: "unknown" }); }
    finally { this.busy = false; this.emit(); }
  }
  // feature revision-recheck Review. The notice and the bar read these fields
  // as each method leaves them, never an earlier render's copy (POSTMORTEM
  // 2026-10-25 "Navigation feedback read the previous React snapshot").
  async readMarker() {
    const identity = this.identity;
    if (!identity) return;
    const tag = ++this.markerRevision;
    let marker: ReviewMarker | null = null;
    try { marker = await this.api.reviewMarker?.(identity.root, identity.canvas) ?? null; } catch (error) { console.error(error); }
    if (tag !== this.markerRevision || !sameCanvas(identity, this.identity)) return;
    this.marker = marker; this.emit();
  }
  // Empty until the list, the marker and the Git name are known: counting
  // before the name would list the person's own resolves for a moment.
  pendingReview(): Comment[] {
    if (!this.list || this.readError || !this.marker || this.author.status === "loading") return [];
    return toReview(this.list.comments, this.marker, this.self);
  }
  startReview(): boolean {
    const identity = this.identity;
    if (!identity || this.review || this.draft.draft || this.beginning) return false;
    const comments = this.pendingReview(), state = startReview(comments);
    if (!state) return false;
    this.review = { root: identity.root, canvas: identity.canvas, state, comments: new Map(comments.map(c => [c.comment, structuredClone(c)])), notFound: null };
    this.reviewDone = null;
    this.emit(); return true;
  }
  moveReview(move: ReviewMove) {
    const run = this.review;
    if (!run) return;
    const state = reviewState(run.state, { type: move });
    if (state === run.state) return;
    this.raiseMarker(run, state.reviewedTo);
    if (state.phase === "reviewing") this.review = { ...run, state, notFound: null };
    else {
      this.review = null;
      if (state.phase === "done") { const summary = reviewSummary(state); this.reviewDone = { ...summary, seen: new Set(state.steps.map(step => step.comment)) }; }
    }
    this.emit();
  }
  // Going Home ends Review like another canvas; the progress passed stays.
  closeReview() { if (this.review) { this.review = null; this.emit(); } }
  closeDone() { if (this.reviewDone) { this.reviewDone = null; this.emit(); } }
  markNotFound(comment: string | null) { if (this.review && this.review.notFound !== comment) { this.review = { ...this.review, notFound: comment }; this.emit(); } }
  reviewComment(id: string): Comment | undefined { return this.review?.comments.get(id); }
  async reopenStep() {
    const run = this.review, step = run?.state.steps[run.state.cursor];
    if (step?.mark === "resolved") await this.mutate("reopen", step.comment);
  }
  // Called once main confirmed the person's own Reopen, right before the
  // reread: that read bumps the read revision in the same turn, so no read
  // issued before the write can reach the Review afterwards (R-F F-2).
  private reviewReopened(id: string) {
    const run = this.review;
    if (!run || !sameCanvas(run, this.identity) || run.state.steps[run.state.cursor]?.comment !== id) return;
    this.review = { ...run, state: reviewState(run.state, { type: "reopen" }) };
  }
  private reviewRead(comments: readonly Comment[]) {
    const run = this.review;
    if (run && sameCanvas(run, this.identity)) {
      let state = reviewState(run.state, { type: "changed", comments });
      state = reviewState(state, { type: "arrived", comments: this.pendingReview() });
      const known = new Map(run.comments);
      for (const comment of comments) if (state.steps.some(step => step.comment === comment.comment)) known.set(comment.comment, structuredClone(comment));
      this.review = { ...run, state, comments: known };
    }
    const done = this.reviewDone;
    if (done && this.pendingReview().some(c => !done.seen.has(c.comment))) this.reviewDone = null;
  }
  // The local marker moves at once, as main only raises; main's answer then
  // replaces it unless a newer read or raise started since.
  private raiseMarker(run: ReviewRun, to: string | undefined) {
    if (to === undefined || (run.state.reviewedTo !== undefined && run.state.reviewedTo >= to)) return;
    const marker = this.marker;
    if (marker && sameCanvas(run, this.identity) && to > (marker.lastReviewedAt ?? marker.since)) this.marker = { ...marker, lastReviewedAt: to };
    const tag = ++this.markerRevision;
    const raised = this.api.raiseReviewMarker?.(run.root, run.canvas, to);
    void raised?.then(next => {
      if (next && tag === this.markerRevision && sameCanvas(run, this.identity)) { this.marker = next; this.emit(); }
      this.onReviewed?.(run.root);
    }).catch(console.error);
  }
}
