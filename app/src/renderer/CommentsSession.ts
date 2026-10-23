import { beginDraft, transitionDraft, type DraftState } from "../comments/draft";
import type { ExpectedComment, MutationIntent } from "../comments/events";
import type { CopyScope } from "../comments/projection";
import type { Comment, Target } from "../formats/types";
import type { BeginResult, CommentIdentity, CommentList, CommentReply, CommentRequest, MutationRequest, SavedStatus } from "../main/comments/service";
import type { DoanApi } from "../preload";
import type { AuthorView, CopyView, SaveView } from "./CommentsPanel";

type Api = Pick<DoanApi, "commentsList" | "commentsAuthor" | "commentsBegin" | "commentsMutate" | "commentsStatus" | "commentsCopy" | "setCommentDraftGuard">;
const emptyDraft = (): DraftState => ({ draft: null, transition: null, request: null, error: null });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Comments operation failed.";
export function expectedComment(c: Comment): ExpectedComment {
  return { body: c.body, status: c.status, updatedAt: c.updatedAt, ...(c.resolvedAt === undefined ? {} : { resolvedAt: c.resolvedAt }) };
}
function same(a: CommentIdentity | null, b: CommentIdentity | null): boolean {
  return a?.root === b?.root && a?.canvas === b?.canvas && a?.path === b?.path;
}
function value<T>(reply: CommentReply<T>, request: CommentRequest): T {
  if (!reply.identity || !same(reply.identity, request) || reply.identity.requestID !== request.requestID) throw new Error("Stale comments response.");
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

// Main owns write authority. This session owns only displayed state, immutable
// pending payloads, and the promise which holds a controllable UI transition.
export class CommentsSession {
  identity: CommentIdentity | null = null;
  list: CommentList | null = null;
  readError: string | null = null;
  author: AuthorView = { status: "loading" };
  draft = emptyDraft();
  target: Target = {};
  saveView: SaveView = { status: "idle" };
  copies = new Map<string, CopyView>();
  mutations = new Map<string, SaveView>();
  busy = false;
  beginning = false;
  private revision = 0;
  private readRevision = 0;
  private authorRevision = 0;
  private origin: BeginResult | null = null;
  private draftIdentity: CommentIdentity | null = null;
  private project = 0;
  private pending: MutationRequest | null = null;
  private cardPending = new Map<string, MutationRequest>();
  private destination: ((allowed: boolean) => void) | null = null;
  constructor(private api: Api, private changed: () => void) {}
  private emit() { this.changed(); }
  private cancelDestination() {
    this.draft = { ...this.draft, transition: null };
    this.destination?.(false); this.destination = null;
  }
  private request(identity = this.identity): CommentRequest {
    if (!identity) throw new Error("No canvas open.");
    return { ...identity, requestID: crypto.randomUUID() };
  }
  async open(identity: CommentIdentity | null) {
    if (same(identity, this.identity)) return;
    this.revision++;
    this.identity = identity;
    this.list = null; this.readError = null; this.copies = new Map(); this.mutations = new Map();
    if (this.draft.draft && !same(identity, this.draftIdentity)) this.invalidate("The original project or canvas is no longer open.");
    this.emit();
    if (identity) await Promise.all([this.read(), this.retryAuthor()]);
  }
  async read(review = false) {
    if (!this.identity) return;
    const rev = this.revision, read = ++this.readRevision, request = this.request();
    try {
      const list = value(await this.api.commentsList(request), request);
      if (rev !== this.revision || read !== this.readRevision) return;
      this.list = list; this.readError = null;
      const draft = this.draft.draft;
      if (draft?.origin.kind === "edit" && same(this.draftIdentity, this.identity) && !this.pending) {
        const id = draft.origin.comment;
        const current = list.comments.find(c => c.comment === id);
        if (!current) this.saveView = { status: "deleted" };
        else if (review) {
          this.draft = { ...this.draft, draft: { ...draft, origin: { ...draft.origin, expected: expectedComment(current) } } };
          this.saveView = { status: "reviewed", latest: current };
        } else if (JSON.stringify(expectedComment(current)) !== JSON.stringify(draft.origin.expected)) this.saveView = { status: "conflict" };
      }
    } catch (error) { if (rev === this.revision && read === this.readRevision) this.readError = errorText(error); }
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
    } catch (error) {
      if (rev !== this.revision || tag !== this.authorRevision) return;
      const message = errorText(error);
      this.author = /user.name|Git user name|Git name/i.test(message) ? { status: "missing" } : { status: "failed", message };
    }
    this.emit();
  }
  async create(scope: "canvas" | "selection") {
    if (!this.identity || !this.list || this.draft.draft || this.busy || this.beginning || this.author.status !== "ready") return;
    const rev = this.revision, request = this.request();
    this.beginning = true; this.emit();
    try {
      const origin = value(await this.api.commentsBegin({ ...request, scope }), request);
      if (rev !== this.revision || this.draft.draft) return;
      // Establish main's guard before exposing an editable draft.
      await this.api.setCommentDraftGuard(true);
      if (rev !== this.revision) { await this.api.setCommentDraftGuard(false); return; }
      this.origin = origin; this.project = origin.project; this.draftIdentity = { ...this.identity };
      this.target = structuredClone(origin.target);
      this.draft = beginDraft(crypto.randomUUID(), { kind: "create", ...this.identity, generation: 0, canvasHash: origin.hash, target: origin.target }, "");
      this.saveView = { status: "idle" };
    } catch (error) { if (rev === this.revision) this.readError = errorText(error); }
    finally { this.beginning = false; this.emit(); }
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
    this.destination?.(false); this.destination = null;
    this.draft = transitionDraft(this.draft, { type: "invalidate", reason }).state; this.emit();
  }
  documentLost() {
    if (this.draft.draft?.origin.kind !== "create") return;
    this.destination?.(false); this.destination = null;
    this.draft = transitionDraft(this.draft, { type: "document-lost" }).state; this.emit();
  }
  guard(): boolean | Promise<boolean> {
    if (this.beginning || this.busy || this.draft.request) return false;
    if (!this.draft.draft) return true;
    this.destination?.(false);
    const result = new Promise<boolean>(resolve => { this.destination = resolve; });
    this.draft = transitionDraft(this.draft, { type: "move", destination: crypto.randomUUID() }).state;
    this.emit(); return result;
  }
  answer(choice: "continue" | "discard") {
    if (this.draft.request) {
      if (choice === "continue") { this.draft = { ...this.draft, transition: null }; this.destination?.(false); this.destination = null; this.emit(); }
      return;
    }
    this.draft = transitionDraft(this.draft, { type: "answer", choice }).state;
    this.destination?.(choice === "discard"); this.destination = null;
    if (choice === "discard") { this.pending = null; void this.api.setCommentDraftGuard(false); }
    this.emit();
  }
  async save() {
    const draft = this.draft.draft;
    if (!draft || !this.draftIdentity || this.pending || this.author.status !== "ready" || ["conflict", "deleted"].includes(this.saveView.status)) return;
    const requestID = crypto.randomUUID();
    const result = transitionDraft(this.draft, { type: "save", request: requestID });
    if (result.effect.type !== "save") return;
    this.draft = result.state;
    const intent: MutationIntent = draft.origin.kind === "create" ? { type: "create", body: draft.body } : { type: "edit", comment: draft.origin.comment, expected: draft.origin.expected, body: draft.body };
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
    if (status.state === "saved") {
      this.draft = transitionDraft(this.draft, { type: "saved", request: request.requestID, draft: this.draft.draft.id, outcome: "saved" }).state;
      this.pending = null; this.saveView = { status: "idle" };
      await this.api.setCommentDraftGuard(false);
      this.destination?.(true); this.destination = null;
      await this.read();
    } else if (status.recovery === "child-exit-required") this.saveView = { status: "recovery-blocked", message: status.error ?? "Confirm externally that the directory child exited, then restart the app." };
    else this.saveView = { status: status.state === "absent" ? "retry-original" : "unknown" };
    if (status.state !== "saved") this.cancelDestination();
    this.emit();
  }
  async check() {
    if (!this.pending || this.saveView.status === "recovery-blocked" || this.saveView.status === "checking") return;
    const request = this.pending; this.saveView = { status: "checking" }; this.emit();
    try { const { root, path, canvas, requestID } = request; await this.settle(value(await this.api.commentsStatus({ root, path, canvas, requestID }), request), request); }
    catch (error) { this.saveView = { status: "check-failed", message: errorText(error) }; this.emit(); }
  }
  async retry() { if (this.pending && this.saveView.status === "retry-original") await this.submit(this.pending); }
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
      if (!response.ok) { this.mutations.set(id, { status: "failed", message: response.error }); }
      else {
        const status = value(response, request);
        this.mutations.set(id, status.recovery ? { status: "recovery-blocked", message: status.error ?? "Confirm child exit externally, then restart the app." } : { status: status.state === "saved" ? "saved" : status.state === "absent" ? "retry-original" : "unknown" });
        if (status.state === "saved") { this.cardPending.delete(id); await this.read(); }
      }
    } catch (error) { if (rev === this.revision) this.mutations.set(id, check ? { status: "check-failed", message: errorText(error) } : { status: "unknown" }); }
    finally { this.busy = false; this.emit(); }
  }
}
