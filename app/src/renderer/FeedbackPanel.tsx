import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { reopenText, resolutionText } from "../comments/resolution";
import { targetLabel } from "../comments/targetLabel";
import type { Comment } from "../formats/types";
import type { CanvasRow } from "../main/view";
import { orphanKey, type OrphanSession, type OrphanTarget } from "./CommentsSession";
import { relativeTime, ResolutionLine, SaveMessage } from "./CommentsPanel";
import { ErrorDetails } from "./ErrorDetails";
import { feedbackFocusAfterRemoval, feedbackGroups, feedbackKey, feedbackTree, ORPHANS_KEY, type FeedbackFile, type FeedbackTreeRow, type OrphanGroup } from "./feedbackGroups";
import type { ProjectRead } from "./homeCards";

export type OrphanIntent = "resolve" | "reopen" | "delete" | "retry" | "check" | "read-latest";

export interface FeedbackPanelProps {
  root: string;
  // The Overview's rows (the watcher's ls), which order the canvas groups.
  rows: readonly CanvasRow[];
  // The root's last `comments:project` read; undefined until the first lands.
  read: ProjectRead | undefined;
  orphans: Pick<OrphanSession, "mutations" | "busy" | "statusLine" | "gitMissing">;
  initialStatus?: Comment["status"];
  onRetry: () => void;
  onOrphan: (intent: OrphanIntent, at: OrphanTarget, comment: Comment) => void;
  onRetryGit: () => void;
  onOpenComment: (row: CanvasRow, comment: string, status: Comment["status"]) => void;
  onOpenCanvas: (row: CanvasRow) => void;
  onReview: (row: CanvasRow) => void;
  // The id-change notice's Show: expand that orphan file and focus its head.
  reveal?: { id: string; seq: number } | null;
  onRevealed?: () => void;
}

const NOTICE = (id: string) => `No canvas uses the ID ${id}. Give a canvas this ID again to bring these comments back, or ask your agent.`;
const READ_ONLY = "Some canvases couldn’t be read; these comments may belong to one of them.";
const NOT_AN_ID = "Not a canvas ID — doan can't show or change these comments.";
const cardKey = (key: string) => `card:${key}`;
// How long Show may wait for a read that has the old id's file, like a
// Feedback row's request (useComments ARRIVAL_MS).
export const REVEAL_MS = 5000;

function feedbackFiles(read: Extract<ProjectRead, { kind: "list" }>): FeedbackFile[] {
  return [
    ...read.canvases.map((canvas): FeedbackFile => "error" in canvas ? canvas : { id: canvas.id, comments: canvas.comments ?? [], toReview: canvas.toReview }),
    ...(read.orphanComments ?? []),
  ];
}

// project-feedback spec 'Feedback 패널' and '갈 곳 잃은 댓글'; draft frames
// `feedback-panel`, `feedback-states` and `orphan-cards`. The Overview's
// right panel: the project's comments grouped by canvas and frame, with the
// comments whose file no canvas uses first.
export function FeedbackPanel(props: FeedbackPanelProps) {
  const { root, read } = props;
  const [status, setStatus] = useState<Comment["status"]>(props.initialStatus ?? "open");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const lost = useRef<string | null>(null);
  // The card focus was in when it last left for nowhere: a card's own button
  // drops focus to <body> as it disables while saving, before the card leaves.
  const held = useRef<string | null>(null);
  // The read a card change started under; its card leaves only with a later one.
  const writing = useRef<{ read: ProjectRead | undefined } | null>(null);
  const previous = useRef<string[]>([]);
  const reveal = useRef<string | null>(null);
  // Show's request: the first read it saw (possibly one kept from an earlier
  // visit) and the element holding focus then.
  const revealWait = useRef<{ seq: number; read: ProjectRead | null; holder: Element | null } | null>(null);
  // A card's place when the person resolved or reopened it: the card after it.
  const places = useRef(new Map<string, string | null>());
  const list = read?.kind === "list" ? read : null;
  const files = list ? feedbackFiles(list) : [];
  const orphanFiles = list?.orphans ?? [];
  const view = list ? feedbackGroups(files, props.rows, orphanFiles, status) : null;
  const rows = view ? feedbackTree(view, collapsed) : [];
  const active = rows.some(row => row.key === focused) ? focused : rows[0]?.key ?? null;
  const toggle = (key: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  // Nothing to fold: a canvas head shown only for its review entry.
  const foldable = (row: FeedbackTreeRow) => row.expanded !== undefined && !(row.kind === "canvas" && row.group.kind === "comments" && row.group.frames.length === 0);
  const act = (row: FeedbackTreeRow) => {
    if (row.kind === "item") props.onOpenComment(row.canvas.row, row.row.comment, row.row.status);
    else if (row.kind === "canvas") props.onOpenCanvas(row.group.row);
    else if (row.expanded !== undefined) toggle(row.key);
  };
  const keys = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (event.target !== event.currentTarget || event.isDefaultPrevented() || event.nativeEvent.isComposing) return;
    const result = feedbackKey(rows, index, event.key);
    if (result === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (result === null) return;
    if ("focus" in result) elements.current.get(rows[result.focus]?.key ?? "")?.focus();
    else if ("toggle" in result) { const row = rows[index]; if (row && foldable(row)) toggle(result.toggle); }
    else { const row = rows[index]; if (row) act(row); }
  };
  const track = (key: string) => (element: HTMLElement | null) => {
    if (element) { elements.current.set(key, element); return; }
    // Before the DOM removal moves focus to <body>.
    if (elements.current.get(key)?.contains(document.activeElement)) lost.current = key;
    elements.current.delete(key);
  };

  // Show from the id-change notice: the file group may be in the other status.
  // Like useComments' deferred focus moves (POSTMORTEM 2026-10-23 "Pin
  // completion outlived the guarded intent"), focus the person moved meanwhile
  // ends it without a move; a failed read or REVEAL_MS ends it on the title
  // only while focus is still where Show left it.
  const waitingFocus = (wait: { holder: Element | null }) => {
    const active = document.activeElement;
    return !active || active === wait.holder || active === document.body || !active.isConnected;
  };
  const endReveal = (fallback: boolean) => {
    const wait = revealWait.current;
    revealWait.current = null;
    if (fallback && wait && waitingFocus(wait)) title.current?.focus();
    props.onRevealed?.();
  };
  useEffect(() => {
    const request = props.reveal;
    if (!request) return;
    if (revealWait.current?.seq !== request.seq) revealWait.current = { seq: request.seq, read: null, holder: document.activeElement };
    const wait = revealWait.current;
    if (!waitingFocus(wait)) { endReveal(false); return; }
    if (!read) return;
    if (wait.read === null) wait.read = read;
    // The Overview shows its last read until the one it asks for on return
    // lands, and that one may predate the id change: wait for one more read.
    // So a failure ends the request only when it is not that first read.
    if (read.kind === "failed") { if (read !== wait.read) endReveal(true); return; }
    if (!list) return;
    const find = (at: Comment["status"]) => feedbackGroups(files, props.rows, orphanFiles, at).orphans?.files.find(group => group.id === request.id);
    const here = find(status);
    const other = status === "open" ? "resolved" : "open";
    if (!here && find(other)) { setStatus(other); return; }
    if (!here && wait.read === list) return;
    setCollapsed(current => {
      const next = new Set(current);
      next.delete(ORPHANS_KEY);
      if (here) next.delete(here.key);
      return next;
    });
    reveal.current = here?.key ?? (view?.orphans ? ORPHANS_KEY : "");
    revealWait.current = null;
    props.onRevealed?.();
  }, [props.reveal?.seq, read, status]);
  useEffect(() => {
    const seq = props.reveal?.seq;
    if (seq === undefined) return;
    const timer = setTimeout(() => { if (revealWait.current?.seq === seq) endReveal(true); }, REVEAL_MS);
    return () => clearTimeout(timer);
  }, [props.reveal?.seq]);

  // An outside press is the person moving focus away, though it may leave
  // focus on <body> with no render before an agent's change removes the card
  // (useComments, R-E E-3). A press on the card's own button is not.
  useEffect(() => {
    const press = (event: Event) => {
      const key = held.current;
      if (key !== null && !elements.current.get(key)?.contains(event.target as Node | null)) held.current = null;
    };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, []);

  // Every focusable in DOM order: tree rows and orphan cards.
  const order: string[] = [];
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = order;
    const wanted = reveal.current;
    if (wanted !== null) {
      reveal.current = null;
      const target = elements.current.get(wanted) ?? title.current;
      if (target) { target.focus(); if (wanted) setFocused(wanted); }
      return;
    }
    const gone = lost.current ?? (held.current !== null && !order.includes(held.current) ? held.current : null);
    lost.current = null;
    const now = document.activeElement;
    const away = !!now && now !== document.body && now.isConnected;
    if (gone !== null && !away) {
      const next = feedbackFocusAfterRemoval(before, order, gone);
      if (next) (next.kind === "row" ? elements.current.get(next.key) : title.current)?.focus();
    }
    // Kept through <body> only while a card change is under way: its write,
    // then, if it was saved, the read after it that takes the card away.
    // Otherwise focus left on purpose and the card is forgotten (useComments'
    // card rule, POSTMORTEM 2026-10-23 recurrence R-C).
    const kept = held.current?.startsWith("card:") ? held.current.slice("card:".length) : null;
    const change = kept === null ? undefined : props.orphans.mutations.get(kept)?.status;
    const saved = (change === undefined || change === "idle" || change === "saved") && !props.orphans.gitMissing(root);
    if (props.orphans.busy) writing.current = { read };
    else if (writing.current && (writing.current.read !== read || !saved)) writing.current = null;
    const holder = document.activeElement, lostFocus = !holder || holder === document.body || !holder.isConnected;
    const card = order.find(key => key.startsWith("card:") && elements.current.get(key)?.contains(holder));
    held.current = card ?? (held.current !== null && order.includes(held.current) && lostFocus && writing.current ? held.current : null);
  });

  // Open counts in the accent; a zero (a head shown for its review entry) is not news.
  const counter = (count: number) => <span className={status === "open" && count > 0 ? "cnt hot" : "cnt"}>{count.toLocaleString("en-US")}</span>;
  const segment = (label: string, value: Comment["status"], count?: number) => <button type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{count === undefined ? label : `${label} ${count}`}</button>;
  const readFailed = (detail: string) => <div className="comments-message error" role="alert"><b>Couldn’t read comments</b><ErrorDetails className="comments-btn" detail={detail}>{(button, shown) => <><div className="comments-tools"><button type="button" className="comments-btn" onClick={props.onRetry}>Retry</button>{button}</div>{shown && <p className="detail">{shown}</p>}</>}</ErrorDetails></div>;
  const reading = <div className="comments-message" role="status"><b>Reading comments…</b></div>;
  const gitMissing = props.orphans.gitMissing(root);
  // A resolve or reopen that took its file's last card of this status takes
  // the whole file group away; its line then stands under the section head,
  // or above everything when no orphan group is left.
  const line = props.orphans.statusLine;
  const lineGroup = line && line.root === root ? view?.orphans?.files.find(group => group.id === line.canvas) : undefined;
  const homeless = line && line.root === root && view && (!lineGroup || lineGroup.kind !== "cards") ? <p className="comments-status" role="status">{line.text}</p> : null;

  const item = (row: FeedbackTreeRow, index: number, className: string, content: ReactNode, label?: string) => {
    order.push(row.key);
    return <div ref={track(row.key)} className={className} role="treeitem" aria-level={row.level} aria-expanded={row.expanded} aria-label={label} tabIndex={active === row.key ? 0 : -1}
      onFocus={event => { if (event.target === event.currentTarget) setFocused(row.key); }} onClick={event => { event.currentTarget.focus(); act(row); }} onKeyDown={event => keys(event, index)}>{content}</div>;
  };
  // A pointer's way to fold a group whose head opens a canvas; keys use ←/→.
  const twisty = (row: FeedbackTreeRow) => <span className="tw" aria-hidden="true" onClick={!foldable(row) ? undefined : event => { event.stopPropagation(); event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus(); toggle(row.key); }}>{row.expanded === undefined ? "" : row.expanded ? "▾" : "▸"}</span>;

  const orphanCards = (group: Extract<OrphanGroup, { kind: "cards" }>, readOnly: boolean) => {
    const at: OrphanTarget | null = list?.project === undefined ? null : { root, canvas: group.id, project: list.project };
    const line = props.orphans.statusLine;
    const ids = group.comments.map(comment => comment.comment);
    const shownLine = line && line.root === root && line.canvas === group.id && !ids.includes(line.comment) ? line : null;
    const lineAt = shownLine ? ids.indexOf(places.current.get(orphanKey(root, group.id, shownLine.comment)) ?? "") : -1;
    const statusLine = shownLine && <p key="status-line" className="comments-status" role="status">{shownLine.text}</p>;
    return <>
      <p className={readOnly ? "fb-note warning" : "fb-note"}>{readOnly ? READ_ONLY : NOTICE(group.id)}</p>
      {group.comments.flatMap((comment, index) => {
        const key = orphanKey(root, group.id, comment.comment);
        order.push(cardKey(key));
        return [index === lineAt && statusLine, <OrphanCard key={comment.comment} cardRef={track(cardKey(key))} comment={comment}
          focusIn={() => { held.current = cardKey(key); }} focusOut={() => { if (held.current === cardKey(key)) held.current = null; }} readOnly={readOnly} mutation={props.orphans.mutations.get(key)}
          disabled={at === null || gitMissing || props.orphans.busy}
          onIntent={intent => {
            if (!at) return;
            if (intent === "resolve" || intent === "reopen") places.current.set(key, ids[index + 1] ?? null);
            props.onOrphan(intent, at, comment);
          }} />];
      })}
      {lineAt === -1 && statusLine}
    </>;
  };

  const content = (row: FeedbackTreeRow, index: number): ReactNode => {
    switch (row.kind) {
      case "orphans":
        return <>
          {item(row, index, "row fb-orphans", <>{twisty(row)}<span className="g">Comments without a canvas</span>{counter(row.section.count)}</>)}
          {row.expanded && homeless}
          {row.expanded && gitMissing && !row.section.readOnly && <div className="comments-message warning inset" role="status"><b>Set your Git name</b>Set git user.name for this repository in your terminal, then choose Retry. Your email is optional.<p>Adding, editing, resolving, reopening and deleting stay unavailable until a name is configured. Hand off remains available.</p><div className="comments-tools"><button type="button" className="comments-btn" disabled={props.orphans.busy} onClick={props.onRetryGit}>Retry</button></div></div>}
        </>;
      case "orphanFile": {
        const group = row.group;
        const readOnly = view?.orphans?.readOnly ?? false;
        return <>
          {item(row, index, "row fb-l2", <>{twisty(row)}<span className="g">{group.id}</span>{group.kind !== "error" && counter(group.count)}</>)}
          {group.kind === "countOnly" ? <p className="fb-count"><b>{group.open} open · {group.resolved} resolved.</b> {NOT_AN_ID}</p>
            : row.expanded && (group.kind === "cards" ? orphanCards(group, readOnly) : group.kind === "pending" ? reading : readFailed(group.error))}
        </>;
      }
      case "canvas": {
        const group = row.group;
        const name = group.fileName === undefined ? group.name : `${group.name} ${group.fileName}`;
        const count = group.kind === "error" ? <span /> : counter(group.count);
        const review = group.kind === "comments" && group.toReview > 0 && <button type="button" className="fb-review" onClick={event => { event.stopPropagation(); props.onReview(group.row); }}>{group.toReview.toLocaleString("en-US")} resolved to review</button>;
        return <>
          {item(row, index, "fb-canvas", <>{twisty(row)}<span className="glyph" aria-hidden="true">◧</span><span className="g">{group.name}</span>{count}{group.fileName !== undefined && <span className="d">{group.fileName}</span>}{review}</>, name)}
          {group.kind === "countOnly" ? <p className="fb-count"><b>{group.open} open · {group.resolved} resolved.</b> {group.note}</p>
            : row.expanded && (group.kind === "pending" ? reading : group.kind === "error" ? readFailed(group.error) : null)}
        </>;
      }
      case "frame":
        return item(row, index, "row fb-l2", <>{twisty(row)}<span className={row.group.kind === "missing" ? "g missing" : "g"}>{row.group.label}</span>{counter(row.group.rows.length)}</>);
      case "item":
        return item(row, index, "fb-item", <><span className="t" title={row.row.title}>{row.row.label}</span><span className="b">{row.row.line}</span></>);
    }
  };

  const empty = view && !view.orphans && view.canvases.length === 0;
  return <section className="feedback native-scroll" role="region" aria-label="Feedback">
    <h2 ref={title} className="phead" tabIndex={-1}>Feedback</h2>
    <div className="fb-filter"><div className="comments-segment" role="group" aria-label="Comment status">{segment("Open", "open", view?.counts.open)}{segment("Resolved", "resolved", view?.counts.resolved)}</div></div>
    {!view?.orphans && homeless}
    {!read ? reading
      : read.kind === "failed" ? <div className="comments-message error" role="alert"><b>Couldn’t read comments</b><div className="comments-tools"><button type="button" className="comments-btn" onClick={props.onRetry}>Retry</button></div></div>
      : empty ? <div className="comments-message"><b>{status === "open" ? "No open comments in this project" : "No resolved comments in this project"}</b></div>
      : <div className="fb-tree" role="tree" aria-label="Feedback">{rows.map((row, index) => <div key={row.key} role="none">{content(row, index)}</div>)}</div>}
  </section>;
}

// The shared Comments card without what needs the canvas: no Edit, locate,
// Hand off or new comment (draft `orphan-cards`). Read-only shows no buttons.
function OrphanCard({ comment, readOnly, mutation, disabled, cardRef, focusIn, focusOut, onIntent }: { comment: Comment; readOnly: boolean; mutation: ReturnType<OrphanSession["mutations"]["get"]>; disabled: boolean; cardRef: (element: HTMLElement | null) => void; focusIn: () => void; focusOut: () => void; onIntent: (intent: OrphanIntent) => void }) {
  const { createdBy } = comment;
  const initials = createdBy.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase();
  const locked = disabled || (mutation !== undefined && mutation.status !== "idle" && mutation.status !== "saved");
  const target = targetLabel(comment.target, []);
  const resolution = resolutionText(comment, relativeTime), reopen = reopenText(comment, relativeTime);
  const saving = mutation?.status === "saving";
  return <article ref={cardRef} className="comments-card" tabIndex={-1} data-comment={comment.comment} aria-label={`Comment by ${createdBy.name}`} aria-busy={saving || undefined}
    onFocus={focusIn} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) focusOut(); }}>
    <div className="comments-author"><span className="comments-avatar" aria-hidden="true">{initials}</span><div className="comments-by"><b>{createdBy.name}</b>{createdBy.kind === "human" && createdBy.email && <span className="comments-email">{createdBy.email}</span>}<time dateTime={comment.createdAt} title={comment.createdAt}>{relativeTime(comment.createdAt)}</time></div></div>
    <span className="comments-target static" title={target.title}>{target.text}</span>
    <div className="comments-badges"><span className={`comments-badge ${comment.status}`}>{comment.status === "open" ? "Open" : "Resolved"}</span></div>
    {resolution && <ResolutionLine line={resolution} />}
    {reopen && <><ResolutionLine line={reopen.reopened} /><ResolutionLine line={reopen.previously} /></>}
    <p className="comments-body">{comment.body}</p>
    {!readOnly && <div className="comments-tools">
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onIntent(comment.status === "open" ? "resolve" : "reopen")}>{comment.status === "open" ? "Resolve" : "Reopen"}</button>
      <button type="button" className="comments-btn" disabled={locked} onClick={() => onIntent("delete")}>Delete</button>
    </div>}
    {!readOnly && mutation && mutation.status !== "idle" && <div className={`comments-message ${mutation.status === "failed" || mutation.status === "check-failed" || mutation.status === "deleted" ? "error" : mutation.status === "unknown" || mutation.status === "conflict" || mutation.status === "recovery-blocked" ? "warning" : ""}`} role="status">
      <SaveMessage state={mutation} />
      <div className="comments-tools">
        {(mutation.status === "unknown" || mutation.status === "check-failed" || mutation.status === "checking") && <button type="button" className="comments-btn" disabled={mutation.status === "checking"} onClick={() => onIntent("check")}>Check saved status</button>}
        {(mutation.status === "failed" || mutation.status === "retry-original") && <button type="button" className="comments-btn" disabled={disabled} onClick={() => onIntent("retry")}>{mutation.status === "retry-original" ? "Retry original save" : "Retry"}</button>}
        {mutation.status === "conflict" && <button type="button" className="comments-btn" onClick={() => onIntent("read-latest")}>Read latest state</button>}
      </div>
    </div>}
  </article>;
}
