import { X } from "lucide-react";
import { useId } from "react";
import type { ReviewStep } from "../comments/review";

// The Review surfaces under the Comments head (doan/revision-recheck.html,
// frames review-notice, review-bar, review-done). The panel works out the
// texts; these only lay them out.

const count = (n: number) => n.toLocaleString("en-US");

export interface ReviewNoticeView {
  count: number;
  // No last review of this canvas on this device yet.
  firstSeen: boolean;
  // A draft is open; Review would leave it behind.
  blocked: boolean;
  onStart: () => void;
}
export function ReviewNotice({ count: n, firstSeen, blocked, onStart }: ReviewNoticeView) {
  const reasonId = useId();
  const lead = `${count(n)} resolved`;
  return <>
    <div className="review-banner">
      <span className="text" title={firstSeen ? lead : `${lead} since your last review`}><b>{lead}</b>{!firstSeen && " since your last review"}</span>
      <button type="button" className="comments-btn review-start doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={blocked} aria-describedby={blocked ? reasonId : undefined} onClick={onStart}>Review</button>
    </div>
    {blocked && <p className="comments-helper review-help" id={reasonId}>Finish or cancel your comment to start Review.</p>}
  </>;
}

export interface ReviewBarView {
  // 1-based.
  step: number;
  total: number;
  target: string;
  targetTitle: string;
  body: string;
  // "Resolved by codex · 3 minutes ago" with the absolute time for `title`.
  resolution: { text: string; at: string } | null;
  mark: ReviewStep["mark"];
  reopenedBy?: string;
  notFound: boolean;
  // Another comment change or a draft holds writes; moving between steps stays.
  writesDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
  onReopen: () => void;
  onEditReopen: () => void;
  onClose: () => void;
}
export function ReviewBar(props: ReviewBarView) {
  const { mark } = props;
  const last = props.step === props.total;
  // A step reopened elsewhere or deleted is not the person's to act on; only moving on is left.
  const gone = mark === "reopenedElsewhere" || mark === "deleted";
  const flag = mark === "reopened" ? "Reopened" : mark === "reopenedElsewhere" ? (props.reopenedBy === undefined ? "Reopened" : `Reopened by ${props.reopenedBy}`) : mark === "deleted" ? "Deleted" : null;
  return <div className="review-bar" role="region" aria-label="Review">
    <div className="review-step"><output role="status">{`Review ${count(props.step)} of ${count(props.total)}`}</output><button type="button" className="review-close doan-icon-button" aria-label="Close Review" onClick={props.onClose}><X aria-hidden="true" /></button></div>
    <span className="comments-target" title={props.targetTitle}>{props.target}</span>
    <p className="review-excerpt">{props.body}</p>
    {!gone && props.resolution && <p className="review-meta"><time dateTime={props.resolution.at} title={props.resolution.at}>{props.resolution.text}</time></p>}
    {flag && <p className="review-flag">{flag}</p>}
    {props.notFound && !gone && <p className="review-flag warn">Not found in the current canvas</p>}
    {mark === "resolved" && <div className="review-actions">
      <button type="button" className="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={props.writesDisabled} onClick={props.onReopen}>Reopen</button>
      <button type="button" className="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={props.writesDisabled} onClick={props.onEditReopen}>Edit and reopen…</button>
    </div>}
    <div className="review-nav">
      {props.total > 1 && !gone && <button type="button" className="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={props.step === 1} onClick={props.onPrevious}>Previous</button>}
      <button type="button" className="comments-btn primary review-next doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={last ? props.onDone : props.onNext}>{last ? "Done" : "Next"}</button>
    </div>
  </div>;
}

export interface ReviewDoneView {
  text: string;
  onClose: () => void;
  // Given once the agent-handoff dialog exists to open with the reopened comments.
  onHandOff?: () => void;
}
export function ReviewDone({ text, onClose, onHandOff }: ReviewDoneView) {
  return <div className="review-banner" role="status">
    <span className="text" title={text}>{text}</span>
    {onHandOff && <button type="button" className="comments-btn review-handoff doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={onHandOff}>Hand off…</button>}
    <button type="button" className="review-close review-done-close doan-icon-button" aria-label="Close summary" onClick={onClose}><X aria-hidden="true" /></button>
  </div>;
}
