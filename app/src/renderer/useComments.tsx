import type { FolderEntry } from "../main/view";
import { commentContext } from "./projectDisplay";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CommentsSession } from "./CommentsSession";
import { CommentsPanel, UnsavedCommentDialog, UncertainCommentDialog, DeleteCommentDialog, type CommentIntent } from "./CommentsPanel";
import type { CanvasController, CanvasState } from "./CanvasController";
import type { AnchorSnapshot } from "./commentAnchors";
import { outdated, projectList, type ListFilter } from "../comments/projection";

export function useComments(state: CanvasState, controller: RefObject<CanvasController | null>, showWorkspace: () => void, entries: FolderEntry[]) {
  const [, render] = useState(0);
  const [session] = useState(() => new CommentsSession(window.doan, () => render(n => n + 1)));
  const [anchors, setAnchors] = useState<AnchorSnapshot | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ scope: "canvas", status: "open" });
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const open = state.open;
  const root = open?.folder, path = open?.canvas, canvas = open?.row.id;
  const draft = session.draft.draft;
  const uncertain = session.uncertainTransition;
  useEffect(() => {
    setAnchors(null); setFilter({ scope: "canvas", status: "open" });
    void session.open(root && path && canvas ? { root, path, canvas } : null);
  }, [session, root, path, canvas]);
  useEffect(() => { if (session.identity) void session.read(); }, [session, state.layout?.document, open?.row.width]);
  useEffect(() => window.doan.onCommentsInvalidated(change => { if (change.root === session.identity?.root) void session.read(); }), [session]);
  useEffect(() => window.doan.onCommentTransition(request => {
    const root = session.draft.draft?.origin.root ?? session.identity?.root;
    const relevant = request.kind === "quit" || request.roots.includes(root ?? "");
    void Promise.resolve(relevant ? session.guard(request.kind === "quit" ? "quit" : "move") : true).then(allow => window.doan.answerCommentTransition({ id: request.id, allow })).catch(console.error);
  }), [session]);
  useEffect(() => {
    controller.current?.setTransitionGuard(() => session.guard());
    return () => controller.current?.setTransitionGuard(null);
  }, [session, controller]);
  useEffect(() => {
    const identity = session.identity;
    if (!identity || !session.list) return;
    controller.current?.setComments({ root: identity.root, canvas: identity.canvas, comments: session.list.comments }, {
      changed: snapshot => setAnchors(snapshot),
      guard: () => session.guard(),
      open: destination => setFilter({ scope: "selection", status: "open", node: destination.node }),
      focusFallback: () => heading.current?.focus(),
    });
  }, [session, session.list, controller]);
  useEffect(() => { controller.current?.setDraftGuard(!!draft || session.beginning); }, [controller, !!draft, session.beginning]);
  useEffect(() => {
    const start = () => { session.composing = true; };
    const end = () => { session.composing = false; };
    window.addEventListener("compositionstart", start, true);
    window.addEventListener("compositionend", end, true);
    return () => { window.removeEventListener("compositionstart", start, true); window.removeEventListener("compositionend", end, true); };
  }, [session]);
  const previousDocument = useRef<string | undefined>(undefined);
  useEffect(() => {
    const document = state.layout?.document;
    if (previousDocument.current !== undefined && (document !== previousDocument.current || state.status === "loading" || !state.hasFrame)) session.documentLost();
    previousDocument.current = document;
  }, [state.layout?.document, state.status, state.hasFrame, session]);
  useEffect(() => { if (state.notice && draft?.origin.kind === "create" && (draft.origin.target.frame || draft.origin.target.element)) session.documentLost(); }, [state.notice, draft?.id, session]);
  useEffect(() => { if (draft && !session.draft.transition && !uncertain) input.current?.focus(); }, [draft?.id, session.saveView.status, session.draft.transition, uncertain]);
  useEffect(() => {
    setFilter(current => state.selection ? { scope: "selection", status: current.status, node: null } : { scope: "canvas", status: current.status });
  }, [state.selection]);
  const identity = session.identity;
  const comments = session.list?.comments ?? [];
  const snapshot = anchors && identity && anchors.lookup.root === identity.root && anchors.lookup.canvas === identity.canvas ? anchors : null;
  const lookup = snapshot?.lookup ?? { root: identity?.root ?? "", canvas: identity?.canvas ?? "", generation: 0, nodes: new Map<string, string>() };
  const currentFilter: ListFilter = filter.scope === "selection" ? { ...filter, node: snapshot?.selected ?? null } : filter;
  const scoped = (status: "open" | "resolved") => projectList(comments, lookup, lookup, { ...currentFilter, status });
  const writeBlocked = !identity ? "A valid, unique canvas ID is required." : session.readError;
  const createBlocked = state.unlisted || !state.hasFrame || state.status !== null ? "The original canvas document is unavailable." : null;
  const widthInvalid = !!open && open.row.width === undefined;
  const editorBlocked = draft?.blocked ?? (draft?.origin.kind === "create" ? createBlocked : null);
  const focus = () => input.current?.focus();
  function intent(action: CommentIntent, id: string) {
    if (action === "edit") session.edit(id);
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
  const canSave = !!draft && !session.draft.request && !!draft.body.trim() && !editorBlocked && !writeBlocked && session.author.status === "ready" && !["conflict", "deleted"].includes(session.saveView.status);
  return {
    session,
    panel: (open || draft) && <CommentsPanel filter={currentFilter} selectionAvailable={state.selection !== null && !state.unlisted} selectionNode={snapshot?.selected ?? null}
      counts={{ open: scoped("open").length, resolved: scoped("resolved").length }} canvasOpenCount={comments.filter(c => c.status === "open").length}
      read={session.readError ? { status: "failed", message: session.readError } : session.list ? { status: "ready", comments: scoped(filter.status), warnings: session.list.warnings } : { status: "loading" }}
      freshness={new Map(comments.map(c => [c.comment, outdated(c.canvasHash, session.list?.canvasHash ?? null)]))}
      missingLocations={new Set(comments.filter(c => (c.target.frame || c.target.element) && !snapshot?.lookup.nodes.has(c.comment)).map(c => c.comment))}
      author={session.author} writeBlocked={writeBlocked} createBlocked={createBlocked} widthInvalid={widthInvalid} busy={session.busy || session.beginning}
      copies={session.copies} allCopy={session.copies.get("all") ?? { status: "idle" }} mutations={session.mutations} headingRef={heading}
      onFilter={setFilter} onCreate={scope => { void session.create(scope); }} onComment={intent} onCopy={scope => { void session.copy(scope); }} onRead={() => { void session.read(); }} onRetryAuthor={() => { void session.retryAuthor(); }}
      editor={draft ? { mode: draft.origin.kind, target: session.target, body: draft.body, state: session.saveView, blocked: editorBlocked, inputRef: input,
        onBody: body => session.body(body), onSave: () => { void session.save(); }, onCancel: () => session.answer("discard"), onKeepDraft: focus,
        onCheck: () => { void session.check(); }, onRetryOriginal: () => { void session.retry(); }, onReadLatest: () => { void session.read(true); } } : null} />,
    dialog: draft && uncertain ? <UncertainCommentDialog key={uncertain.id} kind={uncertain.kind}
      context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)}
      onStay={() => { showWorkspace(); session.answerUncertain(uncertain.id, false); }}
      onQuit={() => session.answerUncertain(uncertain.id, true)} restoreEditorFocus={focus} /> : session.deleteConfirmation ? <DeleteCommentDialog comment={session.deleteConfirmation.comment} onCancel={() => { session.cancelDelete(); heading.current?.focus(); }} onConfirm={() => { void session.confirmDelete(); heading.current?.focus(); }} /> : draft && session.draft.transition && <UnsavedCommentDialog target={session.target} context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)} canSave={canSave}
      busy={session.saveView.status === "saving" || session.saveView.status === "checking"} discardBlocked={session.draft.request !== null}
      {...(editorBlocked ? { reason: editorBlocked } : {})} onContinue={() => { showWorkspace?.(); session.answer("continue"); }} onDiscard={() => session.answer("discard")} onSave={() => { void session.save(); }} restoreEditorFocus={focus} />,
  };
}
