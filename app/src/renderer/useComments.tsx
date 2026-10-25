import type { FolderEntry } from "../main/view";
import { commentContext } from "./projectDisplay";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CommentsSession } from "./CommentsSession";
import { CommentsPanel, UnsavedCommentDialog, UncertainCommentDialog, DeleteCommentDialog, revealComposer, type CommentIntent } from "./CommentsPanel";
import type { CanvasController, CanvasState } from "./CanvasController";
import { shownAnchors, type AnchorSnapshot } from "./commentAnchors";
import { mainSelection, selectionIdentity } from "./selection";
import { outdated, projectList, type ListFilter } from "../comments/projection";
import { continueEnabled, draftScope, guardsSelectionChange } from "../comments/draft";
import type { Target } from "../formats/types";

export function useComments(state: CanvasState, controller: RefObject<CanvasController | null>, showWorkspace: () => void, entries: FolderEntry[]) {
  const [, render] = useState(0);
  const [session] = useState(() => new CommentsSession(window.doan, () => render(n => n + 1)));
  const [anchors, setAnchors] = useState<AnchorSnapshot | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ scope: "canvas", status: "open" });
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The controller's own snapshot, which a retained answer stands in for.
  const latestAnchors = useRef<AnchorSnapshot | null>(null);
  const open = state.open;
  const root = open?.folder, path = open?.canvas, canvas = open?.row.id;
  const draft = session.draft.draft;
  const uncertain = session.uncertainTransition;
  useEffect(() => {
    const current = session.identity;
    // The same canvas at another path (a followed move) keeps filters and anchors.
    if (path && current && current.root === root && current.canvas === canvas) { void session.rename(path); return; }
    setAnchors(null); setFilter({ scope: "canvas", status: "open" });
    void session.open(root && path && canvas ? { root, path, canvas } : null);
  }, [session, root, path, canvas]);
  useEffect(() => {
    controller.current?.setFollowGuard(() => session.canFollow());
    return () => controller.current?.setFollowGuard(null);
  }, [session, controller]);
  useEffect(() => { if (session.identity) void session.read(); }, [session, state.layout?.document, open?.row.width]);
  useEffect(() => window.doan.onCommentsInvalidated(change => { if (change.root === session.identity?.root) void session.read(); }), [session]);
  useEffect(() => window.doan.onCommentTransition(request => {
    const root = session.draft.draft?.origin.root ?? session.identity?.root;
    const relevant = request.kind === "quit" || request.roots.includes(root ?? "");
    void Promise.resolve(relevant ? session.guard(request.kind === "quit" ? "quit" : "move") : true).then(allow => window.doan.answerCommentTransition({ id: request.id, allow })).catch(console.error);
  }), [session]);
  useEffect(() => {
    controller.current?.setTransitionGuard(destination => destination === "selection" ? session.guardSelection() : session.guard());
    return () => controller.current?.setTransitionGuard(null);
  }, [session, controller]);
  useEffect(() => {
    const identity = session.identity;
    if (!identity || !session.list) return;
    controller.current?.setComments({ root: identity.root, canvas: identity.canvas, comments: session.list.comments }, {
      changed: snapshot => { latestAnchors.current = snapshot; setAnchors(previous => shownAnchors(previous, snapshot)); },
      guard: () => session.guardSelection(),
      open: destination => {
        focusAfter.current.pin = { node: destination.node, since: latestAnchors.current };
        setFilter({ scope: "selection", status: "open", node: destination.node });
      },
      focusFallback: () => heading.current?.focus(),
    });
  }, [session, session.list, controller]);
  const selectionGuarded = session.beginning || guardsSelectionChange(session.draft, "selection");
  useEffect(() => { controller.current?.setDraftGuard(!!draft || session.beginning, selectionGuarded); }, [controller, !!draft, session.beginning, selectionGuarded]);
  useEffect(() => {
    const start = () => { session.composing = true; };
    const end = () => { session.composing = false; };
    window.addEventListener("compositionstart", start, true);
    window.addEventListener("compositionend", end, true);
    return () => { window.removeEventListener("compositionstart", start, true); window.removeEventListener("compositionend", end, true); };
  }, [session]);
  const previousDocument = useRef<string | undefined>(undefined);
  const panelElement = useRef<HTMLElement>(null);
  // Where focus goes when the composer closes or a pin opens its comments.
  const focusAfter = useRef<{ editing: boolean; opener: HTMLElement | null; cancelled: boolean; saving: boolean;
    saved: { comment: string; since: AnchorSnapshot | null } | null; pin: { node: string; since: AnchorSnapshot | null } | null }>({ editing: false, opener: null, cancelled: false, saving: false, saved: null, pin: null });
  // A reload of the same row ends the document when it starts, not when its
  // layout arrives, so a draft is already `reloaded` if that layout never comes;
  // a draft begun during that wait is lost when the load fails.
  const loading = state.status === "loading" || state.reloading;
  useEffect(() => {
    const document = state.layout?.document;
    if (previousDocument.current !== undefined && (document !== previousDocument.current || loading || state.status === "failed" || !state.hasFrame)) session.documentLost(loading);
    previousDocument.current = document;
  }, [state.layout?.document, state.status, loading, state.hasFrame, session]);
  useEffect(() => { if (state.notice && draft?.origin.kind === "create" && (draft.origin.target.frame || draft.origin.target.element)) session.documentLost(); }, [state.notice, draft?.id, session]);
  useEffect(() => {
    const field = input.current;
    if (!draft || session.draft.transition || uncertain || !field) return;
    field.focus({ preventScroll: true });
    revealComposer(field);
    // A continued draft keeps its text; the caret goes after it.
    if (session.continued === draft.id) { session.continued = null; field.setSelectionRange(field.value.length, field.value.length); }
  }, [draft?.id, session.saveView.status, session.draft.transition, uncertain]);
  // A reload or a move finds the same selection again; only a new one
  // overrides the scope a person picked (feature revision-continuity L-13).
  const selected = open && state.selection ? selectionIdentity(mainSelection(open, state.selection)) : null;
  useEffect(() => {
    setFilter(current => selected !== null ? { scope: "selection", status: current.status, node: null } : { scope: "canvas", status: current.status });
    // A retained answer was measured for the previous selection; listing it
    // for a new one would show another element's comments (R-B8).
    const latest = latestAnchors.current;
    if (latest?.status === "pending") setAnchors(latest);
  }, [selected]);
  const identity = session.identity;
  // session.open() for a newly opened row runs in an effect, so the render
  // before it still holds the previous canvas's read results (R-W 🟡1).
  const current = !!identity && identity.root === root && identity.canvas === canvas;
  const list = current ? session.list : null, readError = current ? session.readError : null;
  const comments = list?.comments ?? [];
  const snapshot = anchors && identity && anchors.lookup.root === identity.root && anchors.lookup.canvas === identity.canvas ? anchors : null;
  const lookup = snapshot?.lookup ?? { root: identity?.root ?? "", canvas: identity?.canvas ?? "", generation: 0, nodes: new Map<string, string>() };
  const currentFilter: ListFilter = filter.scope === "selection" ? { ...filter, node: snapshot?.selected ?? null } : filter;
  const scoped = (status: "open" | "resolved") => projectList(comments, lookup, lookup, { ...currentFilter, status });
  // An open row without an id never reaches main, so the renderer names that cause itself.
  const identityCause = open && !canvas ? "missing" : current ? session.identityCause : null;
  const writeBlocked = !identity || identityCause ? "A valid, unique canvas ID is required." : null;
  const frames = state.layout?.frames ?? open?.row.frames ?? [];
  // Another canvas's frames could lend a draft's frame id the wrong title.
  const draftFrames = draft && draft.origin.root === root && draft.origin.canvas === canvas ? frames : [];
  const createBlocked = state.unlisted || !state.hasFrame || state.status !== null ? "The original canvas document is unavailable." : null;
  const widthInvalid = !!open && open.row.width === undefined;
  const editorBlocked = draft?.blocked ?? (draft?.origin.kind === "create" ? createBlocked : null);
  const focus = () => input.current?.focus();
  const opened = () => { focusAfter.current.opener = document.activeElement as HTMLElement | null; };
  function intent(action: CommentIntent, id: string) {
    if (action === "edit") { opened(); session.edit(id); }
    else if (action === "resolve" || action === "reopen" || action === "delete") void session.mutate(action, id);
    else if (action === "check") void session.cardRetry(id, true);
    else if (action === "retry") void session.cardRetry(id, false);
    else if (action === "read-latest") void session.read(true, id);
    else if (action === "confirm-reviewed") void session.confirmCard(id);
    else if (action === "locate") {
      const node = snapshot?.lookup.nodes.get(id);
      const comment = comments.find(c => c.comment === id);
      if (node && comment?.status === "open") void controller.current?.activatePin(node);
      else if (node && comment?.target.element) controller.current?.selectPath({ label: "Comment target", ...comment.target.element });
      else if (node && comment?.target.frame) controller.current?.selectPath({ label: "Comment target", selector: `[data-doan-frame="${CSS.escape(comment.target.frame)}"]` });
    }
  }
  const continueView = continueEnabled(session.draft, { canvas: { status: state.status, unlisted: state.unlisted, hasFrame: state.hasFrame, reloading: state.reloading },
    reanchoring: state.reanchoring, author: session.author.status, selection: state.selection !== null && !state.unlisted });
  // After a missing selection offered "Continue on canvas", picking a new element
  // keeps it for that draft (design/revision-continuity.html, selection-gone 2b).
  const offering = !!draft && continueView.kind === "disabled" && continueView.canvas;
  useEffect(() => { if (offering && draft) session.canvasOffered = draft.id; }, [session, offering, draft?.id]);
  const continueEditor = draft?.origin.kind === "create" && continueView.kind !== "hidden" ? (() => {
    const scope = draftScope(draft.origin), selection = state.selection;
    const preview: Target = scope === "canvas" || !selection ? {} : { ...(selection.frame ? { frame: selection.frame.id } : {}), ...(selection.element ? { element: selection.element } : {}) };
    const canvasEnabled = continueView.kind === "enabled" || (continueView.kind === "disabled" && continueView.canvas);
    return { enabled: continueView.kind === "enabled", reason: continueView.kind === "disabled" ? continueView.reason : null, preview,
      canvas: scope === "selection" && (offering || session.canvasOffered === draft.id) ? { enabled: canvasEnabled } : null,
      starting: !session.beginning || !session.continuing ? null : session.continuing === scope ? "current" as const : "canvas" as const,
      error: session.continueError,
      onContinue: () => { void session.continueDraft(scope); }, onCanvas: () => { void session.continueDraft("canvas"); } };
  })() : null;
  const canSave = !!draft && !session.draft.request && !!draft.body.trim() && !editorBlocked && !writeBlocked && !session.readError && session.author.status === "ready" && !["conflict", "deleted"].includes(session.saveView.status);
  // design/comments-readability.html (composer-small, panel-details): Save →
  // the saved card, Cancel → the opening button, a pin → its first card once
  // the list for it renders; otherwise the title. Focus never stays on <body>.
  const editing = !!draft;
  useEffect(() => {
    const after = focusAfter.current, closed = after.editing && !editing;
    after.editing = editing;
    const cards = () => Array.from(panelElement.current?.querySelectorAll<HTMLElement>("article.comments-card") ?? []);
    const latest = latestAnchors.current;
    // A Selection list shows a card only after the anchors asked for since
    // `since` answer; no rendered document means no answer will come.
    const listed = (since: AnchorSnapshot | null) => !latest || latest.status === "none" || (latest !== since && latest.status === "answered" && snapshot === latest);
    if (session.savedComment !== null) {
      // Save and continue in the draft dialog leaves focus to its destination.
      after.saved = after.saving ? { comment: session.savedComment, since: latest } : null;
      after.saving = false; session.savedComment = null;
    }
    const saved = after.saved;
    if (saved) {
      const card = cards().find(card => card.dataset.comment === saved.comment);
      if (card || listed(saved.since)) { after.saved = null; after.opener = null; (card ?? heading.current)?.focus(); return; }
    }
    const pin = after.pin;
    if (pin && listed(pin.since)) {
      after.pin = null;
      if (latest?.status === "answered") ((latest.selected === pin.node ? cards()[0] : undefined) ?? heading.current)?.focus();
      return;
    }
    if (!closed) return;
    const { opener, cancelled } = after;
    after.opener = null; after.cancelled = false;
    const active = document.activeElement;
    if (cancelled && opener && opener !== document.body && opener.isConnected && !opener.hasAttribute("disabled")) opener.focus();
    else if (cancelled || !active || active === document.body || !active.isConnected) heading.current?.focus();
  });
  return {
    session,
    panel: (open || draft) && <CommentsPanel filter={currentFilter} selectionAvailable={state.selection !== null && !state.unlisted} selectionNode={snapshot?.selected ?? null}
      counts={{ open: scoped("open").length, resolved: scoped("resolved").length }} canvasOpenCount={comments.filter(c => c.status === "open").length}
      read={readError ? { status: "failed", message: readError } : list ? { status: "ready", comments: scoped(filter.status), warnings: list.warnings } : { status: "loading" }}
      freshness={new Map(comments.map(c => [c.comment, outdated(c.canvasHash, list?.canvasHash ?? null)]))}
      missingLocations={snapshot?.status === "answered" ? new Set(comments.filter(c => (c.target.frame || c.target.element) && !snapshot.lookup.nodes.has(c.comment)).map(c => c.comment)) : null}
      author={session.author} identityCause={identityCause} canvasId={canvas ?? ""} frames={frames} writeBlocked={writeBlocked} createBlocked={createBlocked} createError={session.createError} widthInvalid={widthInvalid} busy={session.busy || (session.beginning && !draft)}
      copies={session.copies} allCopy={session.copies.get("all") ?? { status: "idle" }} mutations={session.mutations} headingRef={heading} panelRef={panelElement}
      onFilter={next => { focusAfter.current.pin = null; setFilter(next); }} onCreate={scope => { opened(); void session.create(scope); }} onComment={intent} onCopy={scope => { void session.copy(scope); }} onRead={() => { void session.read(); }} onRetryAuthor={() => { void session.retryAuthor(); }}
      editor={draft ? { mode: draft.origin.kind, target: session.target, frames: draftFrames, body: draft.body, state: session.saveView, blocked: editorBlocked, inputRef: input,
        onBody: body => session.body(body), onSave: () => { focusAfter.current.saving = true; void session.save(); },
        onCancel: () => { session.answer("discard"); if (!session.draft.draft) focusAfter.current.cancelled = true; }, onKeepDraft: focus,
        onCheck: () => { focusAfter.current.saving = true; void session.check(); }, onRetryOriginal: () => { focusAfter.current.saving = true; void session.retry(); }, onReadLatest: () => { void session.read(true); }, continue: continueEditor } : null} />,
    dialog: draft && uncertain ? <UncertainCommentDialog key={uncertain.id} kind={uncertain.kind}
      context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)}
      onStay={() => { showWorkspace(); session.answerUncertain(uncertain.id, false); }}
      onQuit={() => session.answerUncertain(uncertain.id, true)} restoreEditorFocus={focus} /> : session.deleteConfirmation ? <DeleteCommentDialog comment={session.deleteConfirmation.comment} onCancel={() => { session.cancelDelete(); heading.current?.focus(); }} onConfirm={() => { void session.confirmDelete(); heading.current?.focus(); }} /> : draft && session.draft.transition && <UnsavedCommentDialog target={session.target} frames={draftFrames} context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)} canSave={canSave}
      busy={session.saveView.status === "saving" || session.saveView.status === "checking"} discardBlocked={session.draft.request !== null}
      {...(editorBlocked ? { reason: editorBlocked } : {})} onContinue={() => { showWorkspace?.(); session.answer("continue"); }} onDiscard={() => session.answer("discard")} onSave={() => { focusAfter.current.saving = false; void session.save(); }} restoreEditorFocus={focus} />,
  };
}
