import type { KeyboardEvent, ReactNode, Ref } from "react";
import { ChevronDown, ChevronUp, CircleStop } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { QUESTION_LIMITS, type Question } from "../main/conversation/question";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { SKIP_FAILED_TEXT } from "./conversationStrip";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { providerLogo } from "./homeComposer";
import { otherReturn, stepButton, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import type { ThreadItem } from "./threadItems";

export type AskItem = Extract<ThreadItem, { kind: "permission" | "question" }>;

export interface AnswerPopoverProps {
  // The earliest waiting request; count: how many wait, this one included.
  item: AskItem;
  provider: Provider;
  count: number;
  // Prefix of the popover's ids and radio names, unique in the thread.
  base: string;
  collapsed: boolean;
  // Above 0, the title is read once more, in an alert keyed by this.
  announce: number;
  draft: QuestionDraft;
  // A permission request's option being sent, and whether main refused the last answer.
  pressed: string | null;
  failed: boolean;
  // The surface whose height the thread keeps clear at its end.
  rootRef?: Ref<HTMLDivElement>;
  onAnswer(optionId: string): void;
  onDraft(action: QuestionDraftAction): void;
  onNext(): void;
  onBack(): void;
  onSend(): void;
  onSkip(): void;
  onStop(): void;
  onCollapse(): void;
  onExpand(): void;
  // Esc collapsed it; focus goes on from there.
  onEscape(): void;
}

export const ANSWER_FIRST_TEXT = "Choose or type an answer first.";

// An Other reached by arrow keys only opens its input; a click or Space also moves focus there. keydown comes before the
// change and keyup after, so a flag between them tells the two apart.
let arrowing = false;
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const arrowKeys = {
  onKeyDown: (event: { key: string }) => { if (ARROWS.has(event.key)) arrowing = true; },
  onKeyUp: (event: { key: string }) => { if (ARROWS.has(event.key)) arrowing = false; },
};
const composing = (event: KeyboardEvent) => event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;

// Not modal: it never takes focus by itself and outside focus does not close it. No hooks: the draft, the fold and focus
// are the thread's, and focus finds `data-entry`.
export function AnswerPopover(props: AnswerPopoverProps) {
  const { item, provider, count, base, collapsed } = props;
  const title = `${PROVIDER_NAMES[provider]} needs your answer`, order = count > 1 ? `1 of ${count} requests` : null;
  const regionId = `${base}-ap`, titleId = `${regionId}-title`;
  const locked = item.kind === "question" ? props.draft.sending !== null : props.pressed !== null;
  const logo = <span className="strip-agent"><img className="logo" src={providerLogo(provider)} alt="" /></span>;
  // An open tooltip or an IME takes its own Esc first; either way Esc never reaches the canvas tools behind.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (collapsed || event.defaultPrevented || composing(event)) return;
    event.preventDefault();
    props.onEscape();
  };
  // Holding Return as focus lands on a button must not press it again and again (a permission allowed by accident).
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as { tagName?: string; type?: string };
    const typing = target.tagName === "INPUT" && (target.type === "text" || target.type === "password");
    if (event.repeat && (event.key === "Enter" || event.key === " ") && !typing) event.preventDefault();
  };
  return <div className={`ap${locked ? " is-locked" : ""}`} id={regionId} role="region" aria-labelledby={titleId} data-item={item.key} data-collapsed={collapsed ? "" : undefined}
    ref={props.rootRef} onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture} onPointerDown={() => { arrowing = false; }}>
    {props.announce > 0 && <span key={props.announce} className="sr-only" role="alert">{title}</span>}
    {collapsed
      ? <button type="button" className="ap-bar" aria-expanded="false" aria-controls={regionId} aria-label={order ? `${title} · ${order}` : title} onClick={props.onExpand}>
        {logo}<b id={titleId}>{title}</b>{order && <span className="ap-order">{order}</span>}<span className="bar-chev"><ChevronUp aria-hidden="true" /></span>
      </button>
      : <>
        <div className="ap-head">{logo}<b id={titleId}>{title}</b>{order ? <span className="ap-order">{order}</span> : <span />}
          <Tooltip><TooltipTrigger asChild>
            <button type="button" className="doan-icon-button" data-ui-size="sm" aria-label="Collapse" aria-expanded="true" aria-controls={regionId} onClick={props.onCollapse}><ChevronDown aria-hidden="true" /></button>
          </TooltipTrigger><TooltipContent>Collapse</TooltipContent></Tooltip>
        </div>
        {item.kind === "question" ? questionStep(item, props, locked) : permissionBody(item, props)}
      </>}
  </div>;
}

function failure(text: string): ReactNode {
  return <div className="ap-error"><p className="settings-msg error ask-error" role="alert"><AlertIcon /><span>{text}</span></p></div>;
}

function permissionBody(item: Extract<AskItem, { kind: "permission" }>, props: AnswerPopoverProps): ReactNode {
  const { pressed } = props;
  return <>
    {/* What will run leads; the agent's words about it and what a saving choice adds follow (ARCHITECTURE §7). */}
    <div className="ap-body doan-scroll" id={`${props.base}-ap-body`}><div className="strip-text selectable"><span className="ask-command">{item.summary}</span>
      {item.reason && <span className="ask-reason">{item.reason}</span>}
      {item.options.flatMap(option => option.detail ? [<span key={option.id} className="ask-saves">{`${option.label}: ${option.detail}`}</span>] : [])}</div></div>
    <div className="ap-actions perm">
      {item.options.map((option, i) => <button key={option.id} type="button" className="doan-button" data-ui-size="sm" data-ui-variant={option.kind === "allow" ? "prominent" : "subtle"}
        data-request={item.requestId} data-entry={i === 0 ? "" : undefined} aria-disabled={pressed !== null || undefined} aria-busy={pressed === option.id || undefined}
        onClick={() => { if (pressed === null) props.onAnswer(option.id); }}>{pressed === option.id && <span className="doan-spinner" aria-hidden="true" />}{option.label}</button>)}
      <button type="button" className="doan-button" data-ui-size="sm" onClick={props.onStop}><CircleStop aria-hidden="true" />Stop</button>
    </div>
    {props.failed && failure("Couldn’t send your answer. Choose again.")}
  </>;
}

function questionStep(item: Extract<AskItem, { kind: "question" }>, props: AnswerPopoverProps, locked: boolean): ReactNode {
  const { draft, base } = props, questions = item.questions, total = questions.length;
  const step = Math.min(Math.max(draft.step, 0), total - 1), question: Question | undefined = questions[step];
  const primary = stepButton(questions, draft), busy = draft.sending === "answer";
  const id = (part: string) => `${base}-${item.requestId}-${question?.id ?? ""}${part}`;
  const choice = question ? draft.choices[question.id] : undefined;
  const named = question ? (question.header ? `${question.header}: ${question.question}` : question.question) : "";
  // Entry and step focus land on the chosen option, else the first, else the answer input: focus on an unchosen radio
  // would let the next arrow key change the answer.
  const chosen = question ? (choice?.selected[0] ?? (choice?.other ? "other" : null)) : null;
  const entry = chosen ?? (question?.options.length ? 0 : null);
  const field = (alone: boolean) => question && <input className={alone ? "doan-input q-input q-text-answer" : "doan-input q-input"} type={question.secret ? "password" : "text"} placeholder="Type your answer"
    aria-label={alone ? `${question.header || question.question}: answer` : "Other answer"} maxLength={QUESTION_LIMITS.text} id={id("-other")} value={choice?.text ?? ""}
    readOnly={locked || undefined} aria-disabled={locked || undefined} data-entry={alone ? "" : undefined}
    onChange={event => props.onDraft({ type: "text", questionId: question.id, text: event.currentTarget.value })}
    onKeyDown={event => {
      if (event.key !== "Enter" || composing(event)) return;
      const press = otherReturn(questions, draft);
      if (!press) return;
      event.preventDefault();
      if (press === "next") props.onNext(); else props.onSend();
    }} />;
  const row = (q: Question, option: number | "other") => {
    const other = option === "other", checked = other ? !!choice?.other : !!choice?.selected.includes(option);
    const description = other ? undefined : q.options[option]!.description;
    // The name is the label line alone: the wrapping <label> would also put the description into it, and VoiceOver
    // would read the description twice.
    const describedBy = description ? id(`-d${option}`) : undefined, labelledBy = id(`-l${option}`);
    return <label key={option} className="doan-preference-row q-pref" data-has-icon="">
      <input type={q.multiSelect ? "checkbox" : "radio"} name={id("")} checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-disabled={locked || undefined}
        data-entry={option === entry ? "" : undefined} {...arrowKeys}
        onChange={() => {
          if (!other) { props.onDraft({ type: "choose", question: q, option }); return; }
          props.onDraft({ type: "other", question: q });
          if (!arrowing && !locked && !checked) queueMicrotask(() => document.getElementById(id("-other"))?.focus());
        }} />
      <span className="doan-preference-row-icon">{q.multiSelect ? <span className="doan-checkbox q-check" data-state={checked ? "checked" : undefined} aria-hidden="true" /> : <span className="ob-radio" aria-hidden="true" />}</span>
      <span className="doan-preference-row-content"><span className="doan-preference-row-label" id={labelledBy}>{other ? "Other" : q.options[option]!.label}</span>
        {description && <span className="doan-preference-row-description" id={describedBy}>{description}</span>}</span>
      {other && checked && <span className="doan-preference-row-extra">{field(false)}</span>}
    </label>;
  };
  // aria-disabled, as New conversation: the button keeps focus and its tooltip says what is missing. The tooltip wraps it
  // in every state, so it stays the same element as it turns on, off, or from Next into Send.
  const blocked = !primary.enabled && !locked;
  const press = <button type="button" className="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled={(!primary.enabled || busy) || undefined} aria-busy={(busy && primary.kind === "send") || undefined}
    onClick={() => { if (primary.enabled) { if (primary.kind === "next") props.onNext(); else props.onSend(); } }}>
    {busy && primary.kind === "send" && <span className="doan-spinner" aria-hidden="true" />}{primary.kind === "next" ? "Next" : "Send"}</button>;
  return <>
    <div className="ap-body doan-scroll" id={`${base}-ap-body`}>
      {question && <div className="ap-question" role={question.options.length && !question.multiSelect ? "radiogroup" : "group"} aria-label={total > 1 ? `Question ${step + 1} of ${total}, ${named}` : named}>
        <div className="ap-q">{total > 1 && <span className="ap-step">{`Question ${step + 1} of ${total}`}</span>}<span className="ap-q-text">{question.question}</span></div>
        {question.options.length ? <div className="q-opts doan-settings-group q-group">{question.options.map((_, n) => row(question, n))}{question.other && row(question, "other")}</div> : field(true)}
      </div>}
    </div>
    <div className="ap-actions">
      <span className="ap-group">
        <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-disabled={locked || undefined} onClick={() => { if (!locked) props.onSkip(); }}>{total > 1 ? "Skip all" : "Skip"}</button>
        <button type="button" className="doan-button" data-ui-size="sm" onClick={props.onStop}><CircleStop aria-hidden="true" />Stop</button>
      </span>
      <span className="ap-group end">
        {step > 0 && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-disabled={locked || undefined} onClick={() => { if (!locked) props.onBack(); }}>Back</button>}
        <Tooltip open={blocked ? undefined : false}><TooltipTrigger asChild>{press}</TooltipTrigger><TooltipContent>{ANSWER_FIRST_TEXT}</TooltipContent></Tooltip>
      </span>
    </div>
    {draft.failed && failure(draft.failed === "skip" ? SKIP_FAILED_TEXT : "Couldn’t send your answer. Try again.")}
  </>;
}
