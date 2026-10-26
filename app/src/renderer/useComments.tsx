import type { FolderEntry } from "../main/view";
import { commentContext } from "./projectDisplay";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CommentsSession, OrphanSession, orphanKey, type OrphanTarget, type ReviewMove } from "./CommentsSession";
import { CommentsPanel, UnsavedCommentDialog, UncertainCommentDialog, DeleteCommentDialog, relativeTime, revealComposer, type CommentIntent } from "./CommentsPanel";
import { MEASURE_ANSWER_MS, type CanvasController, type CanvasState } from "./CanvasController";
import { shownAnchors, type AnchorSnapshot } from "./commentAnchors";
import { editableTarget, mainSelection, selectionIdentity } from "./selection";
import { outdated, projectList, type ListFilter } from "../comments/projection";
import { continueEnabled, draftScope, guardsSelectionChange } from "../comments/draft";
import { nextFocus, sortResolved } from "../comments/resolution";
import { targetLabel } from "../comments/targetLabel";
import { handoffSummary, worktreeNotice } from "../comments/handoff";
import type { Comment, Target } from "../formats/types";
import { idChangeNotice } from "../comments/orphans";
import type { OrphanIntent } from "./FeedbackPanel";
import { canvasLabel } from "./canvasTree";
import { HandOffDialog, handoffContext } from "./HandOffDialog";

// A focus move that waits for anchors. `context` is the canvas and selection it
// belongs to; `holder` held focus after the last render that kept it.
type Deferred = { since: AnchorSnapshot | null; context?: string; holder?: Element | null };

// What a Feedback row asked for once its canvas opened: its comment in the
// row's status, or Review. `since`: the anchors seen before the open.
export type CommentArrival = { root: string; path: string } & ({ comment: string; status: Comment["status"] } | { review: true });

// `reviewed`: main raised a canvas's review marker (Home and Overview counts follow).
// `home`: the home directory, for the paths the Hand off worktree notice names.
// `showOrphans`: the id-change notice's Show, to that id's comments in Feedback.
export function useComments(state: CanvasState, controller: RefObject<CanvasController | null>, showWorkspace: () => void, entries: FolderEntry[], reviewed?: (root: string) => void, home: string | null = null, showOrphans?: (root: string, id: string) => void) {
  const [, render] = useState(0);
  const [session] = useState(() => new CommentsSession(window.doan, () => render(n => n + 1)));
  const [anchors, setAnchors] = useState<AnchorSnapshot | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ scope: "canvas", status: "open" });
  const [orphans] = useState(() => new OrphanSession(window.doan, () => render(n => n + 1)));
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
    saved: (Deferred & { comment: string }) | null; pin: (Deferred & { node: string }) | null }>({ editing: false, opener: null, cancelled: false, saving: false, saved: null, pin: null });
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
  // Each card an action came from, with the card that followed it then, so a
  // status line takes the place of its own card that left (design status-lines),
  // also while a second action is under way (R-C ⚪2).
  const places = useRef(new Map<string, string | null>());
  useEffect(() => {
    // The answer to a card's locate keeps the list the person was reading
    // (feature revision-recheck); the controller ends that with the answer.
    const exempt = selected !== null && state.located;
    if (!exempt) setFilter(current => selected !== null ? { scope: "selection", status: current.status, node: null } : { scope: "canvas", status: current.status });
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
  // Open cards keep the created order; resolved ones read as a history of resolves.
  const shown = filter.status === "resolved" ? sortResolved(scoped("resolved")) : scoped("open");
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
  function remember(id: string) {
    const ids = shown.map(c => c.comment), at = ids.indexOf(id), kept = session.statusLine?.comment;
    for (const key of places.current.keys()) if (key !== kept) places.current.delete(key);
    places.current.set(id, at === -1 ? null : ids[at + 1] ?? null);
  }
  function intent(action: CommentIntent, id: string) {
    // Only actions that can end in a Resolve or Reopen; a locate meanwhile keeps it.
    if (["resolve", "reopen", "check", "retry", "confirm-reviewed"].includes(action)) remember(id);
    if (action === "edit") { opened(); session.edit(id); }
    else if (action === "comment-instead") { opened(); void session.commentInstead(id); }
    else if (action === "resolve" || action === "reopen" || action === "delete") void session.mutate(action, id);
    else if (action === "check") void session.cardRetry(id, true);
    else if (action === "retry") void session.cardRetry(id, false);
    else if (action === "read-latest") void session.read(true, id);
    else if (action === "confirm-reviewed") void session.confirmCard(id);
    else if (action === "locate") {
      const node = snapshot?.lookup.nodes.get(id);
      const comment = comments.find(c => c.comment === id);
      if (!snapshot || !node || !comment) return;
      controller.current?.locate(node, snapshot.lookup.generation, comment);
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
      const saved = after.saved = after.saving ? { comment: session.savedComment, since: latest } : null;
      after.saving = false; session.savedComment = null;
      // The reread list's anchors may never answer; the title keeps focus then.
      if (saved) setTimeout(() => { if (focusAfter.current.saved === saved) focusAfter.current.saved = null; }, MEASURE_ANSWER_MS);
    }
    if (!after.saved && !after.pin && !closed) return;
    // A deferred move belongs to the action that asked for it, like a pin's
    // completion (POSTMORTEM 2026-10-23): a composer, editor or dialog owning
    // focus, another canvas or selection, or focus moved elsewhere ends it.
    const context = JSON.stringify([root, canvas, selected]);
    const owned = editing || session.beginning || !!session.deleteConfirmation || !!session.handoff;
    const active = document.activeElement;
    const stale = (request: Deferred) => owned || (request.context !== undefined && request.context !== context) ||
      (request.holder !== undefined && active !== request.holder && !!active && active !== document.body && active.isConnected);
    if (after.saved && stale(after.saved)) after.saved = null;
    if (after.pin && stale(after.pin)) after.pin = null;
    const place = () => {
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
      if (cancelled && opener && opener !== document.body && opener.isConnected && !opener.hasAttribute("disabled")) opener.focus();
      else if (cancelled || !active || active === document.body || !active.isConnected) heading.current?.focus();
    };
    place();
    // Read after this run's own moves, so the title taking focus is not "elsewhere".
    const holder = document.activeElement;
    for (const request of [after.saved, after.pin]) if (request) { request.context = context; request.holder = holder; }
  });
  // Show after Save and reopen lists Open, and the next render focuses that
  // card (else the title, as the Show button itself is gone); it ends there.
  const showing = useRef<string | null>(null);
  useEffect(() => {
    const comment = showing.current;
    if (comment === null) return;
    showing.current = null;
    const card = Array.from(panelElement.current?.querySelectorAll<HTMLElement>("article.comments-card") ?? []).find(card => card.dataset.comment === comment);
    (card ?? heading.current)?.focus();
  });
  // A card holding focus that leaves the list (the person's Resolve or Reopen,
  // or an agent's change) hands focus to the next card, else the previous one,
  // else the title (design status-lines). Never <body>, and never a button: a
  // second Enter must not resolve the next comment. A list the person changed
  // (canvas, selection, filter) or focus they moved elsewhere is left alone.
  const held = useRef<{ comment: string; order: string[]; context: string } | null>(null);
  const listContext = JSON.stringify([root, canvas, selected, filter.scope, filter.status]);
  // A press outside the card is the person moving focus away, though it may
  // leave focus on <body> and no render follows before an agent's change
  // removes the card (R-E E-3). A press on the card's own button is not.
  useEffect(() => {
    const press = (event: Event) => {
      const last = held.current, target = event.target as Node | null;
      const cards = Array.from(panelElement.current?.querySelectorAll<HTMLElement>("article.comments-card") ?? []);
      if (last && !cards.some(card => card.dataset.comment === last.comment && card.contains(target))) held.current = null;
    };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, []);
  useEffect(() => {
    const cards = Array.from(panelElement.current?.querySelectorAll<HTMLElement>("article.comments-card") ?? []);
    const ids = cards.map(card => card.dataset.comment ?? "");
    if (!held.current && ids.length === 0) return;
    const last = held.current?.context === listContext ? held.current : null;
    const active = document.activeElement;
    // Focus drops to <body> when the card's own button disables while it saves.
    const lost = !active || active === document.body || !active.isConnected;
    if (last && lost && !ids.includes(last.comment)) {
      const next = nextFocus(last.order.filter(id => id === last.comment || ids.includes(id)), last.comment);
      (next.kind === "card" ? cards.find(card => card.dataset.comment === next.comment) : heading.current)?.focus();
    }
    const holder = document.activeElement, card = holder ? cards.find(card => card.contains(holder)) : undefined;
    // Kept through <body> only while a card change is under way, the one that
    // disabled the button; otherwise focus left on purpose and the card is
    // forgotten (POSTMORTEM 2026-10-23 recurrence rule, R-C ⚪1).
    held.current = card ? { comment: card.dataset.comment ?? "", order: ids, context: listContext }
      : last && lost && session.busy && ids.includes(last.comment) ? { ...last, order: ids } : null;
  });
  // feature revision-recheck Review. Its texts come from the session as its
  // methods leave it, not an earlier render (POSTMORTEM 2026-10-25).
  session.onReviewed = reviewed ?? null;
  useEffect(() => window.doan.onWindowVisible?.(visible => {
    // Resolves while the window was hidden show in the notice once it is back.
    if (visible && session.identity) { void session.readMarker(); void session.read(); }
  }), [session]);
  // Where focus goes after the render a Review action leads to (design review-bar, review-done).
  const reviewFocus = useRef<"step" | "closed" | "done" | null>(null);
  const run = current ? session.review : null;
  const pending = current && list && !readError ? session.pendingReview() : [];
  const noticeShown = !run && pending.length > 0;
  // The step's target on the canvas: moved to and highlighted, never selected (RR3).
  const jump = () => {
    const review = session.review, step = review?.state.steps[review.state.cursor];
    if (!review || !step) return;
    const latest = latestAnchors.current;
    const lookup = latest && latest.lookup.root === review.root && latest.lookup.canvas === review.canvas ? latest.lookup : null;
    const node = step.mark === "deleted" ? undefined : lookup?.nodes.get(step.comment);
    const found = node !== undefined && !!lookup && controller.current?.jumpToNode(node, lookup.generation) === true;
    session.markNotFound(found || step.mark === "deleted" ? null : step.comment);
    reviewFocus.current = "step";
  };
  const moveReview = (move: ReviewMove) => {
    const before = session.review?.state.cursor;
    session.moveReview(move);
    if (move === "close") reviewFocus.current = "closed";
    else if (session.reviewDone && !session.review) reviewFocus.current = "done";
    else if (session.review && session.review.state.cursor !== before) jump();
  };
  const startReview = () => { if (session.startReview()) jump(); };
  const closeSummary = () => { session.closeDone(); reviewFocus.current = "closed"; };
  useEffect(() => {
    controller.current?.setEscapeHandler?.(() => {
      if (!session.review) return false;
      moveReview("close");
      return true;
    });
    return () => controller.current?.setEscapeHandler?.(null);
  });
  useEffect(() => {
    const target = reviewFocus.current;
    if (target === null) return;
    reviewFocus.current = null;
    const find = (selector: string) => panelElement.current?.querySelector?.<HTMLElement>(selector) ?? null;
    if (target === "step") find(".review-next")?.focus();
    else if (target === "done") (find(".review-handoff") ?? find(".review-done-close") ?? heading.current)?.focus();
    // A disabled Review (an editor is open) cannot take focus; the title does.
    else ((noticeShown ? find(".review-start:not(:disabled)") : null) ?? heading.current)?.focus();
  });
  // project-feedback: a Feedback row opened this canvas. Runs once the session
  // reads this canvas: lists the row's status in Canvas scope, then, with the
  // anchors measured after the open (none without a document), goes to the
  // target and focuses its card. Review asks for the marker and the Git name
  // first. Never raises the marker itself (spec PF3).
  const arrival = useRef<(CommentArrival & { since: AnchorSnapshot | null }) | null>(null);
  useEffect(() => {
    const request = arrival.current;
    if (!request) return;
    if (!open || open.folder !== request.root || open.canvas !== request.path) { if (open) arrival.current = null; return; }
    if (!current || !identity) return;
    const done = (focus: HTMLElement | null | undefined) => { arrival.current = null; (focus ?? heading.current)?.focus(); };
    if (readError) { done(null); return; }
    if (!list) return;
    if ("review" in request) {
      if (!session.marker || session.author.status === "loading") return;
      arrival.current = null;
      if (session.startReview()) jump(); else heading.current?.focus();
      return;
    }
    const comment = list.comments.find(c => c.comment === request.comment);
    if (!comment) { done(null); return; }
    if (filter.scope !== "canvas" || filter.status !== request.status) { setFilter({ scope: "canvas", status: request.status }); return; }
    const latest = latestAnchors.current;
    const fresh = !!latest && latest !== request.since && latest.lookup.root === identity.root && latest.lookup.canvas === identity.canvas;
    if (fresh ? latest.status === "pending" : state.status !== "noWidth" && state.status !== "failed") return;
    const node = fresh && latest.status === "answered" ? latest.lookup.nodes.get(comment.comment) : undefined;
    if (node !== undefined && latest) controller.current?.locate(node, latest.lookup.generation, comment);
    done(Array.from(panelElement.current?.querySelectorAll<HTMLElement>("article.comments-card") ?? []).find(card => card.dataset.comment === comment.comment));
  });
  // The button an orphan Delete came from, for focus when its dialog closes.
  const deleteOpener = useRef<HTMLElement | null>(null);
  const afterOrphanDelete = () => {
    const opener = deleteOpener.current;
    deleteOpener.current = null;
    (opener?.isConnected && !opener.hasAttribute("disabled") ? opener : document.querySelector?.<HTMLElement>(".feedback .phead"))?.focus();
  };
  const step = run?.state.steps[run.state.cursor];
  const stepComment = step && (comments.find(c => c.comment === step.comment) ?? session.reviewComment(step.comment));
  // A step the person reopened keeps showing the resolve it reviewed.
  const resolvedBy = stepComment?.resolvedBy ?? stepComment?.lastResolution?.by, resolvedAt = stepComment?.resolvedAt ?? stepComment?.lastResolution?.at;
  const stepTarget = stepComment && targetLabel(stepComment.target, frames);
  const reviewBar = run && step && stepComment && stepTarget ? {
    step: run.state.cursor + 1, total: run.state.steps.length, target: stepTarget.text, targetTitle: stepTarget.title, body: stepComment.body,
    resolution: resolvedBy && resolvedAt ? { text: `Resolved by ${resolvedBy.name} · ${relativeTime(resolvedAt)}`, at: resolvedAt } : null,
    mark: step.mark, ...(step.reopenedBy ? { reopenedBy: step.reopenedBy.name } : {}), notFound: run.notFound === step.comment,
    writesDisabled: session.busy || session.beginning || !!draft || !!writeBlocked || session.author.status !== "ready",
    onPrevious: () => moveReview("previous"), onNext: () => moveReview("next"), onDone: () => moveReview("done"), onClose: () => moveReview("close"),
    // Focus goes to Next only for a change that started (it sets busy at once),
    // so a refused Reopen leaves no focus request for a later render.
    onReopen: () => { remember(step.comment); void session.reopenStep(); if (session.busy) reviewFocus.current = "step"; },
    onEditReopen: () => intent("edit", step.comment),
  } : null;
  const resolvedEdit = draft?.origin.kind === "edit" && draft.origin.expected.status === "resolved" ? draft.origin.comment : null;
  const replacedOn = session.deleteConfirmation?.replacedOn;
  // feature agent-handoff. The selection is the one the dialog opens with (Selection quick select).
  const handoffOpener = useRef<HTMLElement | null>(null);
  const handOff = (checked: "all" | readonly string[]) => {
    const selection = state.selection && !state.unlisted ? state.selection : null;
    const selectionTarget: Target = selection ? { ...(selection.frame ? { frame: selection.frame.id } : {}), ...(selection.element ? { element: selection.element } : {}) } : {};
    const opener = document.activeElement as HTMLElement | null;
    if (session.openHandoff(checked, frames, selection ? { node: snapshot?.selected ?? null, label: targetLabel(selectionTarget, frames).text, context: lookup, lookup } : null)) handoffOpener.current = opener;
  };
  const closeHandOff = () => {
    session.closeHandoff();
    const opener = handoffOpener.current;
    handoffOpener.current = null;
    (opener && opener !== document.body && opener.isConnected && !opener.hasAttribute("disabled") ? opener : heading.current)?.focus();
  };
  // Gated like the list: the render before session.open() for another canvas still holds this one's dialog.
  const handoff = session.handoff && session.handoff.root === root && session.handoff.canvas === canvas ? session.handoff : null;
  const handedOff = current ? session.handedOff() : null;
  const openEntry = entries.find(entry => entry.path === root);
  const lostId = open && openEntry?.kind === "list" ? idChangeNotice(state.idChangedFrom, openEntry.orphans) : null;
  return {
    session,
    // Opens a comment's editor; a resolved one's offers Save and reopen (for the Review bar's Edit and reopen…).
    editComment: (id: string) => intent("edit", id),
    // For the Go menu: enabled while this is true; ignored from a text field.
    reviewing: !!run,
    reviewStep: (move: "next" | "previous") => {
      const review = session.review;
      if (!review || editableTarget(document.activeElement)) return;
      // At the last step Next is Done, and the menu item follows the button.
      moveReview(move === "next" && review.state.cursor === review.state.steps.length - 1 ? "done" : move);
    },
    closeReview: () => session.closeReview(),
    // A Feedback row opened its canvas (project-feedback design §3).
    openAt: (request: CommentArrival) => { arrival.current = { ...request, since: latestAnchors.current }; },
    orphans,
    orphanIntent: (intent: OrphanIntent, at: OrphanTarget, comment: Comment) => {
      const key = orphanKey(at.root, at.canvas, comment.comment);
      if (intent === "delete") { deleteOpener.current = document.activeElement as HTMLElement | null; void orphans.mutate("delete", at, comment); }
      else if (intent === "resolve" || intent === "reopen") void orphans.mutate(intent, at, comment);
      else if (intent === "retry") void orphans.retry(key, at, comment);
      else if (intent === "check") void orphans.check(key);
      else orphans.readLatest(key);
    },
    panel: (open || draft) && <CommentsPanel filter={currentFilter} selectionAvailable={state.selection !== null && !state.unlisted} selectionNode={snapshot?.selected ?? null}
      counts={{ open: scoped("open").length, resolved: scoped("resolved").length }} canvasOpenCount={comments.filter(c => c.status === "open").length}
      read={readError ? { status: "failed", message: readError } : list ? { status: "ready", comments: shown, warnings: list.warnings } : { status: "loading" }}
      freshness={new Map(comments.map(c => [c.comment, outdated(c.canvasHash, list?.canvasHash ?? null)]))}
      missingLocations={snapshot?.status === "answered" ? new Set(comments.filter(c => (c.target.frame || c.target.element) && !snapshot.lookup.nodes.has(c.comment)).map(c => c.comment)) : null}
      author={session.author} identityCause={identityCause} canvasId={canvas ?? ""} frames={frames} writeBlocked={writeBlocked} createBlocked={createBlocked} createError={session.createError} widthInvalid={widthInvalid} busy={session.busy || (session.beginning && !draft)}
      handedOff={handedOff && handoffSummary(handedOff.ids.length, handedOff.at)} mutations={session.mutations} headingRef={heading} panelRef={panelElement}
      statusLine={current && session.statusLine ? { ...session.statusLine, before: places.current.get(session.statusLine.comment) ?? null } : null}
      onShowStatus={comment => { focusAfter.current.pin = null; focusAfter.current.saved = null; showing.current = comment; setFilter(current => ({ ...current, status: "open" })); intent("locate", comment); }}
      reviewNotice={noticeShown ? { count: pending.length, firstSeen: session.marker?.lastReviewedAt === undefined, blocked: !!draft || session.beginning, onStart: startReview } : null}
      idNotice={lostId && showOrphans && open ? { text: lostId.text, onShow: () => showOrphans(open.folder, lostId.id) } : null}
      reviewBar={reviewBar} reviewDone={current && session.reviewDone ? { text: session.reviewDone.text, onClose: closeSummary,
        ...(session.reviewDone.reopened.length ? { onHandOff: () => handOff(session.reviewDone?.reopened ?? []) } : {}) } : null}
      onFilter={next => { focusAfter.current.pin = null; focusAfter.current.saved = null; setFilter(next); }} onCreate={scope => { opened(); void session.create(scope); }} onComment={intent} onHandOff={comment => handOff(comment === null ? "all" : [comment])} onRead={() => { void session.read(); }} onRetryAuthor={() => { void session.retryAuthor(); }}
      editor={draft ? { mode: draft.origin.kind, target: session.target, frames: draftFrames, body: draft.body, state: session.saveView, blocked: editorBlocked, inputRef: input,
        onBody: body => session.body(body),
        onSave: () => { focusAfter.current.saving = true; if (resolvedEdit !== null) remember(resolvedEdit); void session.save(resolvedEdit !== null); },
        saveOnly: resolvedEdit === null ? null : () => { focusAfter.current.saving = true; void session.save(); },
        onCancel: () => { session.answer("discard"); if (!session.draft.draft) focusAfter.current.cancelled = true; }, onKeepDraft: focus,
        onCheck: () => { focusAfter.current.saving = true; void session.check(); }, onRetryOriginal: () => { focusAfter.current.saving = true; void session.retry(); }, onReadLatest: () => { void session.read(true); }, continue: continueEditor } : null} />,
    dialog: (draft && uncertain ? <UncertainCommentDialog key={uncertain.id} kind={uncertain.kind}
      context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)}
      onStay={() => { showWorkspace(); session.answerUncertain(uncertain.id, false); }}
      onQuit={() => session.answerUncertain(uncertain.id, true)} restoreEditorFocus={focus} /> : session.deleteConfirmation ? <DeleteCommentDialog comment={session.deleteConfirmation.comment} {...(replacedOn ? { replacedOn: targetLabel(replacedOn, frames).text } : {})} onCancel={() => { session.cancelDelete(); heading.current?.focus(); }} onConfirm={() => { void session.confirmDelete(); heading.current?.focus(); }} /> : draft && session.draft.transition && <UnsavedCommentDialog target={session.target} frames={draftFrames} context={commentContext(entries, draft.origin.root, session.identity?.path ?? draft.origin.canvas)} canSave={canSave}
      busy={session.saveView.status === "saving" || session.saveView.status === "checking"} discardBlocked={session.draft.request !== null}
      {...(editorBlocked ? { reason: editorBlocked } : {})} onContinue={() => { showWorkspace?.(); session.answer("continue"); }} onDiscard={() => session.answer("discard")} onSave={() => { focusAfter.current.saving = false; void session.save(); }} restoreEditorFocus={focus} />
      || handoff && open && <HandOffDialog key={handoff.id} dialog={handoff} context={handoffContext(entries, handoff.root, canvasLabel(open.row))} notice={openEntry ? worktreeNotice(openEntry, home) : null}
        onToggle={id => session.toggleHandoff(id)} onQuick={kind => session.quickHandoff(kind)} onCopy={() => { void session.copyHandoff(); }} onClose={closeHandOff} />)
      || orphans.deleteConfirmation && <DeleteCommentDialog key={orphans.deleteConfirmation.request.requestID} comment={orphans.deleteConfirmation.comment} onCancel={() => { orphans.cancelDelete(); afterOrphanDelete(); }} onConfirm={() => { void orphans.confirmDelete(); afterOrphanDelete(); }} />,
  };
}
