import { createContext, forwardRef, Fragment, memo, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Archive, ArrowDown, ArrowUpRight, ChevronDown, CircleStop, Copy, Eye, FileText, Frame, MapPin, Pencil, PencilSparkles, RotateCcw, SquareMousePointer, Terminal } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor, Canvas } from "../main/conversation/types";
import { QUESTION_LIMITS, type Question, type QuestionAnswerInput } from "../main/conversation/question";
import { chipLabel, type FrameName } from "../main/conversation/messageText";
import { parseReplyAnchor, type ReplyAnchor } from "../main/conversation/replyAnchor";
import type { CanvasRow } from "../main/view";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { canvasLabel } from "./canvasTree";
import { focusAfter } from "./composerRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { formatSize, providerLogo } from "./homeComposer";
import { replyUrlTransform } from "./replyUrlTransform";
import { canSend, EMPTY_QUESTION_DRAFT, questionInput, sendBlockedText, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import { pendingAsks, questionLines, scrollFollow, waitsForPerson, type ActivityStep, type ThreadItem, type TurnEnd } from "./threadItems";

// The conversation thread (buzz-conversation design §3.3, draft frames thread-*). The host reads the history, merges
// live events and passes threadItems' result; links, copying and every action go back through callbacks, so the
// thread never reaches main itself.

export interface ConversationThreadProps {
  // Scroll position, opened activity lines and the follow state belong to one conversation; another id starts afresh.
  conversationId: string;
  // null while the history is read; "error" when main could not read it.
  items: readonly ThreadItem[] | null | "error";
  provider: Provider;
  project: string;
  // Requests with a later seq arrived while the thread was open. Only those are announced as alerts; drawing history
  // announces nothing.
  liveAfter: number;
  // Whether a promotion marker's canvas is still listed (found by ID).
  canvasListed(canvas: Canvas): boolean;
  // Resolves to main's refusal, or rejects, when the answer did not reach the agent; the request then says so.
  onAnswer(requestId: string, optionId: string): Promise<void | { error: string }> | void;
  // A question card's answer or skip (agent-questions design §7), with the same refusal rule as onAnswer.
  onAnswerQuestion?(requestId: string, answer: QuestionAnswerInput): Promise<void | { error: string }> | void;
  // The answers being chosen live in the host's store by request, so they outlive this thread's redraw for another
  // conversation (design §7); without them a card shows nothing chosen.
  questionDraft?(requestId: string): QuestionDraft;
  onQuestionDraft?(requestId: string, action: QuestionDraftAction): void;
  // Where focus goes when an answered question leaves no request waiting (composerRules.focusAfter's field).
  onFocusComposer?(): void;
  onStop(): void;
  onEditAndResend(): void;
  onSignIn(): void;
  onRetry(): void;
  onOpenCanvas(canvas: Canvas): void;
  // Only https links reach this (design §2.7); main checks again.
  onOpenLink(url: string): void;
  onCopy(text: string): Promise<boolean>;
  // The canvas panel's: a sent message's chips are buttons that show their target on the canvas (design §2 'Chip
  // locate'); without it they are drawn as plain chips. `locateDisabled` while the canvas cannot be shown. Settles
  // with how the locate ended; only "missing" shows "No longer in the canvas".
  onLocate?(anchor: Anchor): Promise<LocateOutcome>;
  locateDisabled?: boolean;
  // The open canvas's frames, which name a frame chip by its current title; undefined while it has no layout.
  frames?: readonly FrameName[] | undefined;
  // Chips in the agent's replies (agent-reply-chips design 'Rendering'): `doan:` links that point into a canvas of the
  // conversation's root. Pressing one asks the host; it settles with the locate's outcome when the chip pointed into
  // the open canvas, so "missing" shows "No longer in the canvas" under the reply. Without it reply chips are drawn as
  // plain chips.
  onReplyChip?(link: ReplyAnchor): Promise<LocateOutcome | null>;
  // The id of the canvas the thread belongs to (the canvas panel's), null in the Overview. A chip into it is named from
  // `frames` while the canvas has a layout and follows `locateDisabled`; every other chip names its canvas.
  openCanvasId?: string | null;
  // The canvas rows of the conversation's root, which name another canvas's chips and that canvas.
  canvasRows?: readonly CanvasRow[];
}
// focusItem: an entry's focus on a waiting request (design §6): a question's first option or answer input, a
// permission request's first choice. False when the item has no such control drawn.
export interface ConversationThreadHandle { scrollToItem(key: string): void; focusItem(key: string): boolean }
const ENTRY_FOCUS = ":is(.q-card input, .strip-actions button)";

export const LOADING_DELAY_MS = 300;

// How a chip locate ended: "timeout" (the canvas did not answer) and "unavailable" end silently, because neither says
// the target is gone (design §2 'Chip locate').
export type LocateOutcome = "shown" | "missing" | "timeout" | "unavailable";
export const LOCATE_MISSING_TEXT = "No longer in the canvas";
export const LOCATE_NOTE_MS = 4000;

// "No longer in the canvas" next to a chip, for 4 s or until the person's next action. The result arrives after the
// click or Enter that asked for it, so the listeners added here only see later input. Each show restarts the 4 s.
// `scroller`: the field that scrolls the chip under a note placed by it; a scroll there also counts as the next action,
// since the note would otherwise point at another line or outlive a chip scrolled out of view.
export function useLocateNote(scroller?: () => EventTarget | null): [shown: boolean, show: () => void] {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown === 0) return;
    const hide = () => setShown(0);
    const timer = setTimeout(hide, LOCATE_NOTE_MS);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    const field = scroller?.() ?? null;
    field?.addEventListener("scroll", hide);
    return () => {
      field?.removeEventListener("scroll", hide);
      clearTimeout(timer);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
    };
  }, [shown]);
  return [shown !== 0, () => setShown(n => n + 1)];
}
const COPIED_MS = 2000;

// The draft's copy (thread-states). Codes without a frame of their own read as an unexpected stop.
export function endView(end: TurnEnd, provider: Provider): { title: string; body: string; tone: "error" | null; signIn: boolean } {
  const p = PROVIDER_NAMES[provider];
  if (end.kind === "interrupted") return { title: "Stopped", body: end.reason === "user" ? "You stopped the agent." : "The agent stopped before it finished.", tone: null, signIn: false };
  if (end.code === "not_logged_in") return { title: `${p}’s sign-in expired`, body: "Sign in again, then resend your request.", tone: "error", signIn: true };
  if (end.code === "rate_limited") return { title: `${p} is rate limited`, body: "Try again later.", tone: "error", signIn: false };
  // The session could not be taken up again, so the turn ended before it did any work; the strip says the same.
  if (end.code === "session_unavailable" || end.code === "session_in_use") return { title: `${p} couldn’t continue`, body: "Edit your request and send it again.", tone: "error", signIn: false };
  return { title: `${p} stopped unexpectedly`, body: "It may have changed files before it stopped.", tone: "error", signIn: false };
}
const ANSWERED: Record<"allow" | "allowAlways" | "deny", string> = { allow: "Allowed once", allowAlways: "Always allowed", deny: "Denied" };

// Only https links open, through the host; anything else (http, javascript:, file:, a relative path) stays text.
export function httpsUrl(href: string | undefined): string | null {
  if (!href) return null;
  try { const url = new URL(href); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

interface ThreadActions { openLink(url: string): void; copy(text: string): void; replyChip(link: ReplyAnchor): Promise<LocateOutcome | null> | null }
const Actions = createContext<ThreadActions>({ openLink: () => {}, copy: () => {}, replyChip: () => null });
// What names and enables a reply chip. A context of its own, apart from the stable Actions, so a change of the open
// canvas, its frames or the list redraws the chips inside a memoized reply.
interface ReplyCanvas { openCanvasId: string | null; frames: readonly FrameName[] | undefined; rows: readonly CanvasRow[]; disabled: boolean; pressable: boolean }
const ReplyCanvasContext = createContext<ReplyCanvas>({ openCanvasId: null, frames: undefined, rows: [], disabled: false, pressable: false });
// The reply's "No longer in the canvas" note: `shownFor` is the chip it is shown for (its id describes that chip).
const ReplyNote = createContext<{ shownFor: string | null; show(key: string): void }>({ shownFor: null, show: () => {} });
function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: string; children?: unknown[] };
  return n.type === "text" ? n.value ?? "" : (n.children ?? []).map(textOf).join("");
}
// A pointer press does not take focus, so copying leaves the composer's focus, selection and IME composition alone;
// keyboard activation still focuses the button first.
export function CodeBlock({ node, children }: { node: unknown; children?: ReactNode }) {
  const { copy } = useContext(Actions);
  return <div className="md-code"><pre>{children}</pre>
    <button type="button" className="doan-icon-button" data-ui-size="xs" aria-label="Copy code" onMouseDown={event => event.preventDefault()} onClick={() => copy(textOf(node).replace(/\n$/, ""))}><Copy aria-hidden="true" /></button></div>;
}
function Link({ href, children }: { href: string | undefined; children?: ReactNode }) {
  const { openLink } = useContext(Actions);
  const url = httpsUrl(href);
  if (!url) return <span>{children}</span>;
  return <a href={url} onClick={event => { event.preventDefault(); openLink(url); }}>{children}</a>;
}
const CHIP_ICONS = { frame: Frame, element: SquareMousePointer, point: MapPin } as const;

// How a reply chip reads (agent-reply-chips design 'Rendering'). The link's text is agent output and never names the
// chip. A chip into the open canvas takes that canvas's frame titles while it has a layout; any other chip, and that
// one without a layout, takes the titles of the list row with the link's canvas id. Without exactly one such row the
// chip shows the id itself and names its canvas by the link's id.
export function replyChipView(link: ReplyAnchor, canvas: Pick<ReplyCanvas, "openCanvasId" | "frames" | "rows">): {
  kind: "frame" | "element"; label: string; title: string; canvasName: string | null; ariaLabel: string; same: boolean } {
  const same = canvas.openCanvasId !== null && canvas.openCanvasId === link.canvas;
  const rows = canvas.rows.filter(row => row.id !== undefined && row.id === link.canvas);
  const row = rows.length === 1 ? rows[0] : undefined;
  const frames = same && canvas.frames !== undefined ? canvas.frames : row?.frames ?? [];
  const view = chipLabel(link.kind === "frame" ? { frame: { id: link.id } } : { element: { doanId: link.id } }, frames);
  const kind = view.kind === "frame" ? "frame" : "element";
  if (same) return { kind, label: view.label, title: view.title, canvasName: null, ariaLabel: `Show ${view.label} on canvas`, same };
  const canvasName = row ? canvasLabel(row) : link.canvas;
  return { kind, label: view.label, title: view.title, canvasName, ariaLabel: `Open ${canvasName} and show ${view.label}`, same };
}

// A `doan:` link in a reply: a chip when it parses, else its text alone. No `doan:` href is ever put on an `<a>`.
function ReplyLink({ href, children }: { href: string; children?: ReactNode }) {
  const link = parseReplyAnchor(href);
  return link ? <ReplyChip link={link} /> : <span>{children}</span>;
}
// The sent chip's look (SentChip). Only a chip into the open canvas follows locateDisabled and can show the note;
// another canvas's chip opens that canvas and can always be pressed. Its canvas name is drawn apart, so only the
// label ellipsizes at the chip's width.
export function ReplyChip({ link }: { link: ReplyAnchor }) {
  const canvas = useContext(ReplyCanvasContext), { replyChip } = useContext(Actions), note = useContext(ReplyNote);
  const key = useId();
  const view = replyChipView(link, canvas);
  const Icon = CHIP_ICONS[view.kind];
  const body = <><Icon aria-hidden="true" /><span>{view.label}</span>{view.canvasName !== null && <span className="chip-canvas">{` · ${view.canvasName}`}</span>}</>;
  if (!canvas.pressable) return <span className="anchor-chip" data-kind={view.kind} title={view.title}>{body}</span>;
  const disabled = view.same && canvas.disabled;
  return <button type="button" className="anchor-chip" data-kind={view.kind} title={view.title} aria-label={view.ariaLabel} aria-disabled={disabled || undefined}
    aria-describedby={view.same && note.shownFor === key ? `${key}-missing` : undefined}
    onClick={() => { if (!disabled) void replyChip(link)?.then(outcome => { if (view.same && outcome === "missing") note.show(key); }); }}>{body}</button>;
}

// Agent output is untrusted (ARCHITECTURE §2's rule for comment bodies): no raw HTML (react-markdown escapes it; no
// rehype-raw), no images (their alt text stays), https links only; a `doan:` link is a reply chip or text.
const COMPONENTS: Components = {
  a: ({ href, children }) => href?.startsWith("doan:") ? <ReplyLink href={href}>{children}</ReplyLink> : <Link href={href}>{children}</Link>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  pre: ({ node, children }) => <CodeBlock node={node}>{children}</CodeBlock>,
  table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
};
const PLUGINS = [remarkGfm];
// A finished message parses once; a streaming one parses at most once per animation frame (design §0).
// remark-gfm's footnotes take fixed ids: clobberPrefix renames the notes, and the label ("footnote-label", which every
// reference names in aria-describedby) is renamed here, so two messages never share an id.
type HastNode = { properties?: Record<string, unknown>; children?: HastNode[] };
function labelPrefix(prefix: string) {
  const label = `${prefix}-footnote-label`;
  const visit = (node: HastNode) => {
    const props = node.properties;
    if (props?.id === "footnote-label") props.id = label;
    if (Array.isArray(props?.ariaDescribedBy)) props.ariaDescribedBy = props.ariaDescribedBy.map(id => id === "footnote-label" ? label : id);
    node.children?.forEach(visit);
  };
  return () => visit;
}
const MarkdownText = memo(function MarkdownText({ text, prefix }: { text: string; prefix: string }) {
  return <Markdown remarkPlugins={PLUGINS} rehypePlugins={[labelPrefix(prefix)]} remarkRehypeOptions={{ clobberPrefix: `${prefix}-` }} components={COMPONENTS} urlTransform={replyUrlTransform}>{text}</Markdown>;
});
function useFrameText(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(text);
  const latest = useRef(text), frame = useRef<number | null>(null);
  latest.current = text;
  useEffect(() => {
    if (!streaming || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setShown(latest.current); });
  }, [text, streaming]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return streaming ? shown : text;
}
// A reply, and under it the "No longer in the canvas" note of a reply chip (draft frame `panel-missing`).
function AgentMessage({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useFrameText(text, streaming), prefix = useId();
  const [noted, show] = useLocateNote();
  const [chip, setChip] = useState<string | null>(null);
  const shownFor = noted ? chip : null;
  const note = useMemo(() => ({ shownFor, show: (key: string) => { setChip(key); show(); } }), [shownFor]);
  return <ReplyNote.Provider value={note}>
    <div className="msg-agent md"><MarkdownText text={shown} prefix={prefix} />{streaming && <span className="caret" aria-hidden="true" />}</div>
    {shownFor && <span className="chip-missing" id={`${shownFor}-missing`} role="status">{LOCATE_MISSING_TEXT}</span>}
  </ReplyNote.Provider>;
}

// Why an answer did not reach main: main's refusal, or "unknown" for a rejected call; null when it reached main.
export async function answerRefusal(send: () => Promise<void | { error: string }> | void): Promise<string | null> {
  try {
    const reply = await send();
    return reply && "error" in reply ? reply.error : null;
  } catch {
    return "unknown";
  }
}
// Whether a permission answer reached main: a refusal and a rejected call both mean it did not.
export async function answerReached(send: () => Promise<void | { error: string }> | void): Promise<boolean> {
  return await answerRefusal(send) === null;
}
// A question's answer or skip: the card stays locked until question.resolved folds it. A stale refusal means main
// settled the request already, or will by its own expiry, so it waits without an error line (batch G review); any
// other refusal unlocks the card with its choices kept.
export async function settleQuestionSend(send: () => Promise<void | { error: string }> | void, edit: (action: QuestionDraftAction) => void): Promise<void> {
  const refusal = await answerRefusal(send);
  if (refusal !== null && refusal !== "stale") edit({ type: "failed" });
}

// Arrow keys choose radios as they move, so an Other reached that way only opens its input, while a click or Space on
// it also moves focus there (design §7). The keydown comes before the change it causes and the keyup after, so a flag
// between them tells the two apart; one keyboard is in use at a time, so one flag serves every card.
let arrowing = false;
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const arrowKeys = {
  onKeyDown: (event: { key: string }) => { if (ARROWS.has(event.key)) arrowing = true; },
  onKeyUp: (event: { key: string }) => { if (ARROWS.has(event.key)) arrowing = false; },
};

export interface QuestionCardProps {
  item: Extract<ThreadItem, { kind: "question" }>;
  provider: Provider;
  // Arrived while the thread was open: its title is the live alert.
  live: boolean;
  // Prefix of the card's ids and radio names, unique in the thread.
  base: string;
  draft: QuestionDraft;
  onDraft(action: QuestionDraftAction): void;
  onSend(): void;
  onSkip(): void;
  onStop(): void;
}
// A waiting question (design §7, draft frames question-card, keyboard, send-states). The permission notice without its
// "needs your answer" title: the first question is the title beside the mark, and each further question's sentence
// sits above its options. The options are Settings rows (decided rule 16); nothing in them is cut. No hooks: the
// draft is the host's, and focus goes by id.
export function QuestionCard({ item, provider, live, base, draft, onDraft, onSend, onSkip, onStop }: QuestionCardProps) {
  const locked = draft.sending !== null, ready = canSend(item.questions, draft);
  const id = (question: Question, part: string) => `${base}-${item.requestId}-${question.id}${part}`;
  const focusInput = (question: Question) => queueMicrotask(() => document.getElementById(id(question, "-other"))?.focus());
  const name = (question: Question) => question.header ? `${question.header}: ${question.question}` : question.question;
  const field = (question: Question, alone: boolean) => {
    const choice = draft.choices[question.id];
    return <input className={alone ? "doan-input q-input q-text-answer" : "doan-input q-input"} type={question.secret ? "password" : "text"} placeholder="Type your answer"
      aria-label={alone ? `${question.header || question.question}: answer` : "Other answer"} maxLength={QUESTION_LIMITS.text} id={id(question, "-other")} value={choice?.text ?? ""}
      readOnly={locked || undefined} aria-disabled={locked || undefined}
      onChange={event => onDraft({ type: "text", questionId: question.id, text: event.currentTarget.value })}
      onKeyDown={event => {
        // Return sends only when Send can, and never while an IME composes (keyCode 229 is Chromium's composing key).
        if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !ready) return;
        event.preventDefault();
        onSend();
      }} />;
  };
  const row = (question: Question, option: number | "other") => {
    const choice = draft.choices[question.id];
    const other = option === "other", checked = other ? !!choice?.other : !!choice?.selected.includes(option);
    const description = other ? undefined : question.options[option]!.description;
    const describedBy = description ? id(question, `-d${option}`) : undefined;
    return <label key={option} className="doan-preference-row q-pref" data-has-icon="">
      <input type={question.multiSelect ? "checkbox" : "radio"} name={id(question, "")} checked={checked} aria-describedby={describedBy} aria-disabled={locked || undefined} {...arrowKeys}
        onChange={() => {
          if (!other) { onDraft({ type: "choose", question, option }); return; }
          onDraft({ type: "other", question });
          if (!arrowing && !locked && !checked) focusInput(question);
        }} />
      <span className="doan-preference-row-icon">{question.multiSelect ? <span className="doan-checkbox q-check" data-state={checked ? "checked" : undefined} aria-hidden="true" /> : <span className="ob-radio" aria-hidden="true" />}</span>
      <span className="doan-preference-row-content"><span className="doan-preference-row-label">{other ? "Other" : question.options[option]!.label}</span>
        {description && <span className="doan-preference-row-description" id={describedBy}>{description}</span>}</span>
      {other && checked && <span className="doan-preference-row-extra">{field(question, false)}</span>}
    </label>;
  };
  const busy = draft.sending === "answer";
  // aria-disabled, as New conversation: Send keeps focus and its tooltip says what is missing.
  const send = <button type="button" className="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled={(!ready && !busy) || undefined} aria-busy={busy || undefined}
    onClick={() => { if (ready) onSend(); }}>{busy && <span className="doan-spinner" aria-hidden="true" />}Send</button>;
  return <div className={`doan-notice thread-notice q-card${locked ? " is-locked" : ""}`}
    onPointerDown={() => { arrowing = false; }}
    // Esc inside the card does nothing: it does not reach the panel or the page.
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
    <span className="strip-agent doan-alert-icon"><img className="logo" src={providerLogo(provider)} alt="" /></span>
    {/* Only the title is the alert: on the whole card VoiceOver would read every option. */}
    <span className="strip-text q-title" role={live ? "alert" : undefined}><b>{item.questions[0]?.question}</b></span>
    <div className="q-list">{item.questions.map((question, i) => <div key={question.id} className="q" role={question.options.length && !question.multiSelect ? "radiogroup" : "group"} aria-label={name(question)}>
      {i > 0 && <div className="q-head"><span className="q-text">{question.question}</span></div>}
      {question.options.length ? <div className="q-opts doan-settings-group q-group">{question.options.map((_, n) => row(question, n))}{question.other && row(question, "other")}</div> : field(question, true)}
    </div>)}</div>
    <span className="strip-actions">
      {ready || locked ? send : <Tooltip><TooltipTrigger asChild>{send}</TooltipTrigger><TooltipContent>{sendBlockedText(item.questions)}</TooltipContent></Tooltip>}
      <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-disabled={locked || undefined} onClick={() => { if (!locked) onSkip(); }}>Skip</button>
      <button type="button" className="doan-button" data-ui-size="sm" onClick={onStop}><CircleStop aria-hidden="true" />Stop</button>
    </span>
    {draft.failed && <span className="ask-error" role="alert">Couldn’t send your answer. Try again.</span>}
  </div>;
}

// A chip in a sent message. A marker without its anchor (a malformed history) keeps its {{n}} text.
export function SentChip({ marker, anchor, frames, disabled, onLocate, missing }: { marker: number; anchor: Anchor | undefined; frames: readonly FrameName[] | undefined; disabled: boolean;
  onLocate: ConversationThreadProps["onLocate"];
  // The message's "No longer in the canvas" note: `shownFor` is the chip it is shown for (its id describes that chip).
  missing?: { key: string; shownFor: string | null; show(key: string): void } }) {
  if (!anchor) return <span className="bubble-anchor">{`{{${marker}}}`}</span>;
  const view = chipLabel(anchor, frames);
  const Icon = CHIP_ICONS[view.kind];
  const body = <><Icon aria-hidden="true" /><span>{view.label}</span></>;
  if (!onLocate) return <span className="anchor-chip" data-kind={view.kind} title={view.title}>{body}</span>;
  // aria-disabled, so the chip stays in the Tab order and keeps its name while the canvas cannot be shown.
  return <button type="button" className="anchor-chip" data-kind={view.kind} title={view.title} aria-label={`Show ${view.label} on canvas`} aria-disabled={disabled || undefined}
    aria-describedby={missing && missing.shownFor === missing.key ? `${missing.key}-missing` : undefined}
    onClick={() => { if (!disabled) void onLocate(anchor).then(outcome => { if (outcome === "missing") missing?.show(missing.key); }); }}>{body}</button>;
}

// A sent message: its bubble, attachments and the chip locate note under the bubble (draft frame `chip-locate`). One
// Send now has in flight ends with a Sending line and has no actions (canvas-composer-polish draft frame `sending`).
function UserMessage({ entry, frames, disabled, onLocate }: { entry: Extract<ThreadItem, { kind: "user" }>; frames: readonly FrameName[] | undefined; disabled: boolean; onLocate: ConversationThreadProps["onLocate"] }) {
  const base = useId();
  const [shown, show] = useLocateNote();
  const [chip, setChip] = useState<string | null>(null);
  const shownFor = shown ? chip : null;
  const missing = (key: string) => ({ key, shownFor, show: (at: string) => { setChip(at); show(); } });
  return <div className="msg-user">
    <div className="bubble">{entry.preset && <span className="bubble-preset"><PencilSparkles aria-hidden="true" />{entry.preset.title}</span>}{entry.preset && entry.parts.length > 0 && "\n"}
      {entry.parts.map((part, i) => "text" in part ? <Fragment key={i}>{part.text}</Fragment> : <SentChip key={i} marker={part.anchor} anchor={entry.anchors[part.anchor - 1]} frames={frames}
        disabled={disabled} onLocate={onLocate} missing={missing(`${base}-${i}`)} />)}</div>
    {entry.attachments.length > 0 && <div className="msg-files">{entry.attachments.map((file, i) => <span key={i} className="attach-chip">
      <span className="file-icon" aria-hidden="true"><FileText /></span><span className="attach-text"><b>{file.name}</b><small>{formatSize(file.size)}</small></span></span>)}</div>}
    {entry.sending && <span className="msg-sending"><span className="doan-spinner" aria-hidden="true" />Sending</span>}
    {shownFor && <span className="chip-missing" id={`${shownFor}-missing`} role="status">{LOCATE_MISSING_TEXT}</span>}
  </div>;
}

const STEP_ICONS = { read: Eye, edit: Pencil, command: Terminal, other: Terminal } as const;
function Steps({ id, steps }: { id: string; steps: readonly ActivityStep[] }) {
  return <ul className="activity-steps" id={id}>{steps.map(step => {
    const Icon = STEP_ICONS[step.kind];
    return <li key={step.key}><Icon aria-hidden="true" /><span className={step.sentence ? "verb mcp-step" : "verb"}>{step.verb}</span>{step.path && <span className="path">{step.path}</span>}</li>;
  })}</ul>;
}

function lastEnd(items: readonly ThreadItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    // A message Send now has in flight is not in the history yet, so it starts no turn after the end.
    if (item.kind === "user" && !item.sending) return null;
    if (item.kind === "end") return item.key;
  }
  return null;
}
function phaseText(items: readonly ThreadItem[], provider: Provider): string {
  const p = PROVIDER_NAMES[provider];
  if (items.some(waitsForPerson)) return `${p} needs your answer`;
  const last = items.at(-1);
  if (last && ((last.kind === "activity" && last.running) || (last.kind === "agent" && last.streaming))) return `${p} is working`;
  if (last?.kind === "end") return endView(last.end, provider).title;
  return "";
}

export const ConversationThread = forwardRef<ConversationThreadHandle, ConversationThreadProps>(function ConversationThread(props, ref) {
  return <ThreadBody key={props.conversationId} {...props} handle={ref} />;
});

const ThreadBody = function ThreadBody({ handle: ref, ...props }: ConversationThreadProps & { handle: Ref<ConversationThreadHandle> }) {
  const { items, provider } = props;
  const base = useId();
  const scroller = useRef<HTMLDivElement | null>(null);
  const distance = useRef(0), opened = useRef(false);
  const [behind, setBehind] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [slow, setSlow] = useState(false);
  const [copied, setCopied] = useState(false);
  // Requests whose last answer did not reach main (design §2 'Errors'): the person chooses again.
  const [unanswered, setUnanswered] = useState<ReadonlySet<string>>(new Set());
  const answer = (requestId: string, optionId: string) => {
    setUnanswered(current => { if (!current.has(requestId)) return current; const next = new Set(current); next.delete(requestId); return next; });
    void answerReached(() => props.onAnswer(requestId, optionId)).then(reached => { if (!reached) setUnanswered(current => new Set(current).add(requestId)); });
  };
  const draftOf = (requestId: string) => props.questionDraft?.(requestId) ?? EMPTY_QUESTION_DRAFT;
  const editQuestion = (requestId: string, action: QuestionDraftAction) => props.onQuestionDraft?.(requestId, action);
  // The question last answered or skipped here: once it folds, focus moves on as after a permission answer (design §7).
  const sentFrom = useRef<string | null>(null);
  const sendQuestion = (entry: Extract<ThreadItem, { kind: "question" }>, how: "answer" | "skip") => {
    const draft = draftOf(entry.requestId);
    if (draft.sending) return;
    const answer: QuestionAnswerInput = how === "skip" ? { outcome: "skipped" } : questionInput(entry.questions, draft);
    editQuestion(entry.requestId, { type: "sending", how });
    sentFrom.current = entry.requestId;
    void settleQuestionSend(() => props.onAnswerQuestion ? props.onAnswerQuestion(entry.requestId, answer) : Promise.resolve({ error: "unknown" }), action => editQuestion(entry.requestId, action));
  };
  const focusIn = (key: string): boolean => {
    const control = scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"] ${ENTRY_FOCUS}`);
    control?.focus({ preventScroll: true });
    return !!control;
  };
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (items !== null) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [items === null]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // Follow new output only from within 24px of the bottom, measured before this update (design §3.3).
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !Array.isArray(items)) return;
    const opening = !opened.current;
    opened.current = true;
    if (scrollFollow(opening, distance.current)) { node.scrollTop = node.scrollHeight; distance.current = 0; setBehind(false); }
    else setBehind(true);
  }, [items]);
  // A folded question took the focus that was on it to the page: the next waiting request takes it, else the composer.
  // A person who moved focus elsewhere meanwhile keeps it.
  useLayoutEffect(() => {
    const from = sentFrom.current;
    if (from === null || !Array.isArray(items)) return;
    const asks = pendingAsks(items);
    if (items.some(item => item.kind === "question" && item.requestId === from && item.status === "pending")) return;
    sentFrom.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = focusAfter({ kind: "answered", requestId: from }, { pending: asks.map(ask => ask.requestId) });
    if (target.kind === "option") focusIn(asks.find(ask => ask.requestId === target.requestId)!.key);
    else props.onFocusComposer?.();
  }, [items]);
  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    distance.current = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (scrollFollow(false, distance.current)) setBehind(false);
  };
  const jump = () => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
    setBehind(false);
  };
  useImperativeHandle(ref, () => ({
    scrollToItem(key: string) {
      const node = scroller.current?.querySelector(`[data-item="${CSS.escape(key)}"]`);
      // A question card scrolls to its top: in a 280px panel a tall card's centre would leave its title out of view.
      node?.scrollIntoView({ block: node.querySelector(".q-card") ? "start" : "center", behavior: reduced() ? "auto" : "smooth" });
    },
    focusItem: focusIn,
  }), []);

  // The Markdown is memoized, so its links and Copy buttons read the latest callbacks through one stable context value.
  const actions = useRef<ThreadActions>({ openLink: () => {}, copy: () => {}, replyChip: () => null });
  actions.current.openLink = url => props.onOpenLink(url);
  actions.current.replyChip = link => props.onReplyChip?.(link) ?? null;
  actions.current.copy = text => {
    void props.onCopy(text).then(ok => {
      if (!ok) return;
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }).catch(console.error);
  };
  const context = useRef<ThreadActions>({ openLink: url => actions.current.openLink(url), copy: text => actions.current.copy(text), replyChip: link => actions.current.replyChip(link) }).current;
  const pressable = props.onReplyChip !== undefined, disabled = !!props.locateDisabled, openCanvasId = props.openCanvasId ?? null;
  const replyCanvas = useMemo<ReplyCanvas>(() => ({ openCanvasId, frames: props.frames, rows: props.canvasRows ?? [], disabled, pressable }),
    [openCanvasId, props.frames, props.canvasRows, disabled, pressable]);

  if (items === "error") return <div className="conversation-thread">
    <div className="doan-notice error thread-notice" role="alert"><AlertIcon /><span className="strip-text"><b>Doan couldn’t read this conversation</b><span>Try again. If it keeps failing, start a new conversation.</span></span>
      <span className="strip-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={props.onRetry}>Retry</button></span></div>
  </div>;
  if (items === null) return <div className="conversation-thread">{slow && <div className="thread-loading" role="status"><span className="doan-spinner" aria-hidden="true" /><span>Loading conversation</span></div>}</div>;

  const p = PROVIDER_NAMES[provider];
  const resend = lastEnd(items);
  const toggle = (key: string) => setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const item = (entry: ThreadItem): ReactNode => {
    switch (entry.kind) {
      case "user": return <UserMessage entry={entry} frames={props.frames} disabled={!!props.locateDisabled} onLocate={props.onLocate} />;
      case "agent": return <AgentMessage text={entry.text} streaming={entry.streaming} />;
      case "noReply": return <div className="msg-agent"><p className="muted">No reply.</p></div>;
      case "activity": {
        const open = expanded.has(entry.key), id = `${base}-${entry.key}`;
        return <div className="activity">
          <button type="button" className="activity-head" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => toggle(entry.key)}>
            {entry.running && <span className="doan-spinner" aria-hidden="true" />}<span>{entry.head}</span><ChevronDown className="chev" aria-hidden="true" /></button>
          {open && <Steps id={id} steps={entry.steps} />}
        </div>;
      }
      case "permission": {
        if (entry.status !== "pending") return <div className="activity"><div className="activity-head ask-answered"><span>
          {entry.status === "answered" ? `${entry.answer ? ANSWERED[entry.answer.kind] : "Answered"} · ${entry.summary}` : `Expired without an answer · ${entry.summary}`}</span></div></div>;
        const live = entry.seq > props.liveAfter;
        return <div className="doan-notice thread-notice" role={live ? "alert" : undefined}>
          <span className="strip-agent doan-alert-icon"><img className="logo" src={providerLogo(provider)} alt="" /></span>
          <span className="strip-text"><b>{`${p} needs your answer`}</b><span>{entry.summary}</span></span>
          <span className="strip-actions">
            {entry.options.map(option => <button key={option.id} type="button" className="doan-button" data-ui-size="sm" data-ui-variant={option.kind === "allow" ? "prominent" : "panel"}
              data-request={entry.requestId} onClick={() => answer(entry.requestId, option.id)}>{option.label}</button>)}
            <button type="button" className="doan-button" data-ui-size="sm" onClick={props.onStop}><CircleStop aria-hidden="true" />Stop</button>
          </span>
          {unanswered.has(entry.requestId) && <span className="ask-error" role="alert">Couldn’t send your answer. Choose again.</span>}
        </div>;
      }
      case "question": {
        if (entry.status !== "pending") return <div className="q-folded">{questionLines(entry).map((line, i) =>
          <div key={i} className="activity"><div className="activity-head ask-answered"><span title={line}>{line}</span></div></div>)}</div>;
        return <QuestionCard item={entry} provider={provider} live={entry.seq > props.liveAfter} base={base} draft={draftOf(entry.requestId)}
          onDraft={action => editQuestion(entry.requestId, action)} onSend={() => sendQuestion(entry, "answer")} onSkip={() => sendQuestion(entry, "skip")} onStop={props.onStop} />;
      }
      case "end": {
        const view = endView(entry.end, provider);
        return <div className={`doan-notice${view.tone ? ` ${view.tone}` : ""} thread-notice`}>
          {view.tone ? <AlertIcon /> : <CircleStop className="doan-alert-icon" aria-hidden="true" />}
          <span className="strip-text"><b>{view.title}</b><span>{view.body}</span></span>
          {entry.key === resend && <span className="strip-actions">
            {view.signIn && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={props.onSignIn}>Sign in again…</button>}
            <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={props.onEditAndResend}>Edit and resend</button>
          </span>}
        </div>;
      }
      case "marker": {
        if (entry.marker === "archived") return <div className="marker"><span><Archive aria-hidden="true" />Archived when another conversation became current on this canvas. Send a message to make it current again.</span></div>;
        if (entry.marker === "restored") return <div className="marker"><span><RotateCcw aria-hidden="true" />Made current again</span></div>;
        const canvas = entry.canvas!, listed = props.canvasListed(canvas), name = canvas.path.split("/").at(-1) ?? canvas.path;
        return <div className="marker"><span><ArrowUpRight aria-hidden="true" />{listed ? `Moved to ${name}` : `Moved to ${name} · No longer in ${props.project}`}</span>
          <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="trigger" disabled={!listed} onClick={() => props.onOpenCanvas(canvas)}>Open</button></div>;
      }
    }
  };

  return <Actions.Provider value={context}><ReplyCanvasContext.Provider value={replyCanvas}><div className="conversation-thread">
    <div className="thread-scroll" ref={scroller} onScroll={onScroll}>
      <div className="thread">{items.map(entry => <div key={entry.key} className="thread-item" data-item={entry.key}>{item(entry)}</div>)}</div>
    </div>
    {behind && <button type="button" className="doan-button jump-latest" data-ui-size="sm" data-ui-variant="panel" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest</button>}
    <div className="sr-only" role="status">{copied ? "Copied" : phaseText(items, provider)}</div>
  </div></ReplyCanvasContext.Provider></Actions.Provider>;
};

