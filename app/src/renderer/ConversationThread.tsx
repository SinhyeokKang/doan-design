import { createContext, forwardRef, Fragment, memo, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, ArrowUpRight, Ban, Check, ChevronDown, CircleStop, Copy, Eye, FileText, Folder, Forward, Frame, LayoutGrid, MapPin, PanelsTopLeft, Pencil, PencilSparkles, SquareMousePointer, Terminal, Zap } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor, Canvas, EditLines } from "../main/conversation/types";
import { editHeadName, editLinesLabel } from "./editLinesLabel";
import { QUESTION_LIMITS, type Question, type QuestionAnswerInput } from "../main/conversation/question";
import { chipLabel, type FrameName } from "../main/conversation/messageText";
import { parseReplyAnchor, type ReplyAnchor } from "../main/conversation/replyAnchor";
import type { CanvasRow } from "../main/view";
import { skillWords, skillTextParts } from "./skillWords";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { retryButton } from "./ListRetryButton";
import { announcedAgain, LIST_RETRY_IDLE, type ListRetry } from "./listRetry";
import { canvasCardMeta, canvasCardText, middleCut, newCanvasesText, trailingCards, type CanvasCardMeta } from "./canvasCardText";
import { sameCanvas } from "./canvasConversationRows";
import { canvasLabel, canvasStem } from "./canvasTree";
import { SKIP_FAILED_TEXT } from "./conversationStrip";
import { focusAfter, type FocusAction } from "./composerRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { NameTip } from "./NameTip";
import { CommandCardNotice } from "./ComposerParts";
import type { CommandCard, CommandCardTarget } from "./commandView";
import { handoffCardView } from "./handoffView";
import { useThumbnails, type ThumbnailHub, type ThumbnailState } from "./thumbnails";
import { providerLogo, sentFileView } from "./homeComposer";
import { replyUrlTransform } from "./replyUrlTransform";
import { canSend, EMPTY_QUESTION_DRAFT, questionInput, sendBlockedText, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import { useActivationFocus } from "./activationFocus";
import type { VisibleCalls } from "./visibleClock";
import { pendingAsks, questionLines, sameItem, scrollFollow, threadScroll, waitsForPerson, type ActivityStep, type MessagePart, type ThreadItem, type TurnEnd } from "./threadItems";
import { bubbleBlocks, type BubbleList } from "./composerLists";
import { activityRun, backgroundLine, drawingCards, elapsedText, settle, SETTLE_MS, turnAnnouncement, turnText, type Settled, type ThreadTurn, type TurnStatus } from "./turnStatus";

// The conversation thread (draft frames thread-*). The host reads the history, merges
// live events and passes threadItems' result; links, copying and every action go back through callbacks, so the
// thread never reaches main itself.

export interface ConversationThreadProps {
  // Scroll position, opened activity lines and the follow state belong to one conversation; another id starts afresh.
  conversationId: string;
  // null while the history is read; "error" when main could not read it.
  items: readonly ThreadItem[] | null | "error";
  provider: Provider;
  project: string;
  // The window's native visibility (`window.doan`, or the prototype window's calls), which pauses the turn timer.
  visibility: VisibleCalls;
  // Requests with a later seq arrived while the thread was open. Only those are announced as alerts; drawing history
  // announces nothing.
  liveAfter: number;
  // Whether an earlier build's promotion marker's canvas, a canvas card's canvas or handoff target, or a handoff card's source is still
  // listed (found by ID).
  canvasListed(canvas: Canvas): boolean;
  // Resolves to main's refusal, or rejects, when the answer did not reach the agent; the request then says so.
  onAnswer(requestId: string, optionId: string): Promise<void | { error: string }> | void;
  // A question card's answer or skip, with the same refusal rule as onAnswer.
  onAnswerQuestion?(requestId: string, answer: QuestionAnswerInput): Promise<void | { error: string }> | void;
  // The answers being chosen live in the host's store by request, so they outlive this thread's redraw for another
  // conversation; without them a card shows nothing chosen.
  questionDraft?(requestId: string): QuestionDraft;
  onQuestionDraft?(requestId: string, action: QuestionDraftAction): void;
  // Where focus goes when an answered question leaves no request waiting (composerRules.focusAfter's field).
  onFocusComposer?(): void;
  onStop(): void;
  onEditAndResend(): void;
  onSignIn(): void;
  onRetry(): void;
  // The read error's Retry: running while its read is out (the notice stays), failures the Retries that failed in a row.
  retry?: ListRetry | undefined;
  onOpenCanvas(canvas: Canvas): void;
  // A canvas card's or handoff card's Open: that canvas with its panel on the given conversation, or the canvas alone
  // for a canvas card without a started handoff. Without it neither offers Open.
  onOpenHandoff?(canvas: Canvas, conversationId?: string): void;
  // A handoff card from the Overview (a project conversation's handoff): Open shows its source conversation in the
  // root's Overview. Without it that card offers no Open.
  onOpenOverview?(conversationId: string): void;
  // Whether the source conversation of a handoff card from the Overview still exists; absent, it counts as there.
  conversationListed?(conversationId: string): boolean;
  // Only https links reach this; main checks again.
  onOpenLink(url: string): void;
  onCopy(text: string): Promise<boolean>;
  // Shortens a sent folder's path in its tooltip to ~; null or absent shows it whole.
  homeDirectory?: string | null;
  // The canvas panel's: a sent message's chips are buttons that show their target on the canvas;
  // without it they are drawn as plain chips. `locateDisabled` while the canvas cannot be shown. Settles
  // with how the locate ended; only "missing" shows "No longer in the canvas".
  onLocate?(anchor: Anchor): Promise<LocateOutcome>;
  locateDisabled?: boolean;
  // The conversation's Doan connection is at its usage limit until this reset (limitReset.ts resetTimeText): the last
  // turn's usage-limit end says messages sent now go out then.
  limitResets?: string | null;
  // The last turn's own message waits in the queue for the reset, so Edit and resend would send it twice.
  resendHidden?: boolean;
  // The open canvas's frames, which name a frame chip by its current title; undefined while it has no layout.
  frames?: readonly FrameName[] | undefined;
  // Chips in the agent's replies: `doan:` links that point into a canvas of the
  // conversation's root. Pressing one asks the host; it settles with the locate's outcome when the chip pointed into
  // the open canvas, so "missing" shows "No longer in the canvas" under the reply. Without it reply chips are drawn as
  // plain chips.
  onReplyChip?(link: ReplyAnchor): Promise<LocateOutcome | null>;
  // The id of the canvas the thread belongs to (the canvas panel's), null in the Overview. A chip into it is named from
  // `frames` while the canvas has a layout and follows `locateDisabled`; every other chip names its canvas.
  openCanvasId?: string | null;
  openCanvasPath?: string;
  // The canvas rows of the conversation's root, which name another canvas's chips and that canvas, and give the canvas
  // and handoff cards their meta.
  canvasRows?: readonly CanvasRow[];
  // The host's clock; the cards' times follow it once a minute.
  now: number;
  // The window's hub and the conversation's root, for the cards' images; without it the banners stay empty.
  thumbnails?: { hub: ThumbnailHub; root: string };
  // The last turn's indicator state (turnStatus) and start; without it no turn indicator shows.
  turn?: ThreadTurn | null;
  // Background work the done turn turnId left running (the list's `background`), and the line's Stop: it settles true
  // once main stopped that work, false when it could not (the host says so in a toast).
  background?: { turnId: string; stopping?: true } | null;
  onStopBackground?(turnId: string): Promise<boolean>;
  // The card of a built-in Doan does not run, sent from this conversation's composer: at the thread's end for this run.
  card?: CommandCard | null;
  onCardAction?(target: CommandCardTarget): void;
  onCardDismiss?(): void;
}
// focusItem: an entry's focus on a waiting request: a question's first option or answer input, a
// permission request's first choice; after a handoff's move, the handoff card itself. False
// when the item has no such control drawn.
export interface ConversationThreadHandle { scrollToItem(key: string): void; focusItem(key: string): boolean }
const ENTRY_FOCUS = ":is(.q-card input, .strip-actions button, .handoff-card)";

export const LOADING_DELAY_MS = 300;

export function ConversationLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return <div className="conversation-thread"><div className="thread-loading" role="status">{slow && <><span className="doan-spinner" aria-hidden="true" /><span>Loading conversation</span></>}</div></div>;
}

// How a chip locate ended: "timeout" (the canvas did not answer) and "unavailable" end silently, because neither says
// the target is gone.
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

// The draft's copy (thread-states). Codes without a frame of their own read as an unexpected stop. resend: false when
// the turn never began, so there is no request worth resending as it was (body "" draws no second line). resets: the
// connection's live usage-limit reset as limitReset.ts words it, given for the last turn only; it wins over the time
// Claude's detail names, since messages sent now wait for it.
export function endView(end: TurnEnd, provider: Provider, resets: string | null = null): { title: string; body: string; tone: "error" | null; signIn: boolean; resend?: false } {
  const p = PROVIDER_NAMES[provider];
  if (end.kind === "interrupted") return { title: "Stopped", body: end.reason === "user" ? "You stopped the agent." : "The agent stopped before it finished.", tone: null, signIn: false };
  // The provider had no such model for this account; the turn did no work, so no file warning.
  if (end.code === "model_unavailable" && end.model) return { title: `${end.model} isn’t available for this account.`, body: "", tone: "error", signIn: false, resend: false };
  if (end.code === "not_logged_in") return { title: `${p}’s sign-in expired`, body: "Sign in again, then resend your request.", tone: "error", signIn: true };
  if (end.code === "rate_limited") {
    if (resets) return { title: `${p} reached a usage limit`, body: `Resets ${resets}. Messages you send now go out then.`, tone: "error", signIn: false };
    const when = end.detail ? RESETS.exec(end.detail.trim())?.[1] : undefined;
    return { title: `${p} reached a usage limit`, body: when ? `Resets ${when}. Send again after that.` : "Send again after it resets.", tone: "error", signIn: false };
  }
  // The session could not be taken up again, so the turn ended before it did any work; the strip says the same.
  if (end.code === "session_unavailable" || end.code === "session_in_use") return { title: `${p} couldn’t continue`, body: "Edit your request and send it again.", tone: "error", signIn: false };
  // The prompt was never read, so the message stays in the thread and Edit and resend brings it back.
  if (end.code === "prompt_unread") return { title: `${p} didn’t pick up your message`, body: "Send it again.", tone: "error", signIn: false };
  return { title: `${p} stopped unexpectedly`, body: "It may have changed files before it stopped.", tone: "error", signIn: false };
}
// Only Claude's recorded wording is read ("You've hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)"); the time is
// copied as written, since its format and time zone are the provider's. Any other wording shows no time.
const RESETS = /^You['’]ve hit your weekly limit · resets (.+)$/;
const ANSWERED: Record<"allow" | "allowAlways" | "deny", string> = { allow: "Allowed once", allowAlways: "Always allowed", deny: "Denied" };

// Only https links open, through the host; anything else (http, javascript:, file:, a relative path) stays text.
export function httpsUrl(href: string | undefined): string | null {
  if (!href) return null;
  try { const url = new URL(href); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

// A reply link the browser did not open (the host's openLink answered false or failed) is told in the host's toast, in
// the star card's form: the address last with no period, so selecting it copies only the address.
export async function openReplyLink(open: (url: string) => Promise<boolean>, url: string, notice: (text: string) => void): Promise<void> {
  const opened = await open(url).catch(() => false);
  if (!opened) notice(`Couldn’t open the link in your browser. Try again, or open it at ${url}`);
}

// copy: `reply` is the reply whose code block was copied, where a failed copy says so.
interface ThreadActions { openLink(url: string): void; copy(text: string, reply: string | null): void; replyChip(link: ReplyAnchor): Promise<LocateOutcome | null> | null }
const Actions = createContext<ThreadActions>({ openLink: () => {}, copy: () => {}, replyChip: () => null });
// The reply a code block sits in, and the reply whose last Copy failed (thread state, so another reply's success clears it).
const ReplyId = createContext<string | null>(null);
const CopyFailed = createContext<string | null>(null);
const COPY_FAILED_TEXT = "Couldn’t copy the code. Select it and copy it yourself.";
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
  const { copy } = useContext(Actions), reply = useContext(ReplyId);
  return <div className="md-code"><pre className="doan-scroll">{children}</pre>
    <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button" data-ui-size="xs" aria-label="Copy code" onMouseDown={event => event.preventDefault()} onClick={() => copy(textOf(node).replace(/\n$/, ""), reply)}><Copy aria-hidden="true" /></button></TooltipTrigger>
      <TooltipContent>Copy code</TooltipContent></Tooltip></div>;
}
function Link({ href, children }: { href: string | undefined; children?: ReactNode }) {
  const { openLink } = useContext(Actions);
  const url = httpsUrl(href);
  if (!url) return <span>{children}</span>;
  return <a href={url} onClick={event => { event.preventDefault(); openLink(url); }}>{children}</a>;
}
const CHIP_ICONS = { frame: Frame, element: SquareMousePointer, point: MapPin } as const;

// How a reply chip reads. The link's text is agent output and never names the
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
  // The chip's detail (what it points at) is information only the tooltip carries, so it shows on every hover.
  if (!canvas.pressable) return <ChipTip detail={view.title}><span className="anchor-chip" data-kind={view.kind}>{body}</span></ChipTip>;
  const disabled = view.same && canvas.disabled;
  return <ChipTip detail={view.title}><button type="button" className="anchor-chip" data-kind={view.kind} aria-label={view.ariaLabel} aria-disabled={disabled || undefined}
    aria-describedby={view.same && note.shownFor === key ? `${key}-missing` : undefined}
    onClick={() => { if (!disabled) void replyChip(link)?.then(outcome => { if (view.same && outcome === "missing") note.show(key); }); }}>{body}</button></ChipTip>;
}

// Agent output is untrusted, as the selection's `html`/`text` are (ARCHITECTURE §3 'Selection'): no raw
// HTML (react-markdown escapes it; no rehype-raw), no images (their alt text stays), https links only; a `doan:` link
// is a reply chip or text.
const COMPONENTS: Components = {
  a: ({ href, children }) => href?.startsWith("doan:") ? <ReplyLink href={href}>{children}</ReplyLink> : <Link href={href}>{children}</Link>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  pre: ({ node, children }) => <CodeBlock node={node}>{children}</CodeBlock>,
  table: ({ children }) => <div className="md-table doan-scroll"><table>{children}</table></div>,
};
const PLUGINS = [remarkGfm];
// A finished message parses once; a streaming one parses at most once per animation frame.
// remark-gfm's footnotes take fixed ids: clobberPrefix renames the notes, and the label ("footnote-label", which every
// reference names in aria-describedby) is renamed here, so two messages never share an id.
type HastNode = { type?: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };
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
// The streaming caret follows the reply's last character (turn-activity.html frame `states`, tile 6): it goes inside
// the last text block, never beside the blocks, where .msg-agent's flex column would put it on its own line. Containers
// are entered down to their last child; an element whose last child is text or inline content takes the caret. A code
// block's text ends in the line break mdast-util-to-hast adds, so the caret goes before it, on the code's last line.
// With no text block yet (an empty reply, or one ending in a rule) the caret stays after the blocks.
const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "thead", "tbody", "tr", "td", "th", "section"]);
const caret = (): HastNode => ({ type: "element", tagName: "span", properties: { className: ["caret"], ariaHidden: "true" }, children: [] });
// Line breaks between blocks are whitespace text nodes, not content.
const lastContent = (node: HastNode) => node.children?.filter(child => child.type !== "text" || child.value?.trim()).at(-1);
const enters = (host: HastNode, child: HastNode | undefined): child is HastNode =>
  child?.type === "element" && (BLOCKS.has(child.tagName ?? "") || (host.tagName === "pre" && child.tagName === "code"));
function streamingCaret() {
  return (root: HastNode) => {
    let host = root;
    for (let last = lastContent(host); enters(host, last); last = lastContent(host)) host = last;
    const children = host.children ??= [];
    const end = children.at(-1);
    if (host.tagName === "code" && end?.type === "text" && end.value?.endsWith("\n")) children.splice(-1, 1, { type: "text", value: end.value.slice(0, -1) }, caret(), { type: "text", value: "\n" });
    else children.push(caret());
  };
}
const MarkdownText = memo(function MarkdownText({ text, prefix, streaming }: { text: string; prefix: string; streaming: boolean }) {
  return <Markdown remarkPlugins={PLUGINS} rehypePlugins={streaming ? [labelPrefix(prefix), streamingCaret] : [labelPrefix(prefix)]} remarkRehypeOptions={{ clobberPrefix: `${prefix}-` }} components={COMPONENTS} urlTransform={replyUrlTransform}>{text}</Markdown>;
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
// className: a handoff card's body is the same Markdown without the reply's own block.
function AgentMessage({ text, streaming, className = "msg-agent md" }: { text: string; streaming: boolean; className?: string }) {
  const shown = useFrameText(text, streaming), prefix = useId();
  const [noted, show] = useLocateNote();
  const [chip, setChip] = useState<string | null>(null);
  const shownFor = noted ? chip : null;
  const note = useMemo(() => ({ shownFor, show: (key: string) => { setChip(key); show(); } }), [shownFor]);
  const copyFailed = useContext(CopyFailed) === prefix;
  return <ReplyId.Provider value={prefix}><ReplyNote.Provider value={note}>
    <div className={className}><MarkdownText text={shown} prefix={prefix} streaming={streaming} /></div>
    {shownFor && <span className="chip-missing" id={`${shownFor}-missing`} role="status">{LOCATE_MISSING_TEXT}</span>}
    {copyFailed && <p className="settings-msg error copy-failed" role="alert"><AlertIcon /><span>{COPY_FAILED_TEXT}</span></p>}
  </ReplyNote.Provider></ReplyId.Provider>;
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
// Whether a permission answer reached main: a refusal and a rejected call both mean it did not. A stale refusal is
// not a failure: another window answered first (or main expired the request), and permission.resolved folds the card.
export async function answerReached(send: () => Promise<void | { error: string }> | void): Promise<boolean> {
  const refusal = await answerRefusal(send);
  return refusal === null || refusal === "stale";
}
// A question's answer or skip: the card stays locked until question.resolved folds it. A stale refusal means main
// settled the request already, or will by its own expiry, so it waits without an error line; any
// other refusal unlocks the card with its choices kept.
export async function settleQuestionSend(send: () => Promise<void | { error: string }> | void, edit: (action: QuestionDraftAction) => void): Promise<void> {
  const refusal = await answerRefusal(send);
  if (refusal !== null && refusal !== "stale") edit({ type: "failed" });
}

// Arrow keys choose radios as they move, so an Other reached that way only opens its input, while a click or Space on
// it also moves focus there. The keydown comes before the change it causes and the keyup after, so a flag
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
// A waiting question (draft frames question-card, keyboard, send-states). The permission notice without its
// "needs your answer" title: the first question is the title beside the mark, and each further question's sentence
// sits above its options. The options are Settings rows; nothing in them is cut. No hooks: the
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
    // The name is the label line alone: the wrapping <label> would also put the description into it, and VoiceOver
    // would read the description twice.
    const describedBy = description ? id(question, `-d${option}`) : undefined, labelledBy = id(question, `-l${option}`);
    return <label key={option} className="doan-preference-row q-pref" data-has-icon="">
      <input type={question.multiSelect ? "checkbox" : "radio"} name={id(question, "")} checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-disabled={locked || undefined} {...arrowKeys}
        onChange={() => {
          if (!other) { onDraft({ type: "choose", question, option }); return; }
          onDraft({ type: "other", question });
          if (!arrowing && !locked && !checked) focusInput(question);
        }} />
      <span className="doan-preference-row-icon">{question.multiSelect ? <span className="doan-checkbox q-check" data-state={checked ? "checked" : undefined} aria-hidden="true" /> : <span className="ob-radio" aria-hidden="true" />}</span>
      <span className="doan-preference-row-content"><span className="doan-preference-row-label" id={labelledBy}>{other ? "Other" : question.options[option]!.label}</span>
        {description && <span className="doan-preference-row-description" id={describedBy}>{description}</span>}</span>
      {other && checked && <span className="doan-preference-row-extra">{field(question, false)}</span>}
    </label>;
  };
  const busy = draft.sending === "answer";
  // aria-disabled, as New conversation: Send keeps focus and its tooltip says what is missing. While sending it is busy
  // too (aria-busy), keeping its fill with the spinner, as every busy confirm does.
  const send = <button type="button" className="doan-button q-send" data-ui-size="sm" data-ui-variant="prominent" aria-disabled={(!ready || busy) || undefined} aria-busy={busy || undefined}
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
    {draft.failed && <p className="settings-msg error ask-error" role="alert"><AlertIcon /><span>{draft.failed === "skip" ? SKIP_FAILED_TEXT : "Couldn’t send your answer. Try again."}</span></p>}
  </div>;
}

function ChipTip({ detail, children }: { detail: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{detail}</TooltipContent></Tooltip>;
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
  if (!onLocate) return <ChipTip detail={view.title}><span className="anchor-chip" data-kind={view.kind}>{body}</span></ChipTip>;
  // aria-disabled, so the chip stays in the Tab order and keeps its name while the canvas cannot be shown.
  return <ChipTip detail={view.title}><button type="button" className="anchor-chip" data-kind={view.kind} aria-label={`Show ${view.label} on canvas`} aria-disabled={disabled || undefined}
    aria-describedby={missing && missing.shownFor === missing.key ? `${missing.key}-missing` : undefined}
    onClick={() => { if (!disabled) void onLocate(anchor).then(outcome => { if (outcome === "missing") missing?.show(missing.key); }); }}>{body}</button></ChipTip>;
}

// Chromium neither draws nor copies the last line break of a block, so a text block that ends in a blank line (or is
// one) before a list gets one more.
function endsInBlankLine(parts: readonly MessagePart[]): boolean {
  const last = parts[parts.length - 1];
  return !last || ("text" in last && last.text.endsWith("\n"));
}

// The list's marker column, in ch, for the bubble's hanging indent: at least as wide as its widest marker so the bodies
// line up, without measuring. Markers draw in plain figures (styles.css), so each digit counts its own width in Geist,
// in ch (a "0", the widest, is 1ch; a "1" is 0.58ch), and ". " 0.7ch; each is rounded up, so the column never cuts into
// the text. "- " and "* " fit the --space-3 minimum (0).
const DIGIT_CH: Record<string, number> = { "0": 1, "1": 0.58, "2": 0.94, "3": 0.93, "4": 0.93, "5": 0.95, "6": 0.9, "7": 0.79, "8": 0.92, "9": 0.9 };
function markColumn(block: BubbleList): number {
  if (block.list !== "ol") return 0;
  const width = (marker: string) => [...marker.slice(0, -2)].reduce((sum, digit) => sum + (DIGIT_CH[digit] ?? 1), 0.7);
  return Math.round(Math.max(...block.items.map(item => width(item.marker))) * 100) / 100;
}

// A sent message: its bubble, attachments and the chip locate note under the bubble (draft frame `chip-locate`). One
// Send now has in flight ends with a Sending line and has no actions (canvas-composer-polish draft frame `sending`).
function UserMessage({ entry, frames, disabled, onLocate, home }: { entry: Extract<ThreadItem, { kind: "user" }>; frames: readonly FrameName[] | undefined; disabled: boolean; onLocate: ConversationThreadProps["onLocate"]; home: string | null }) {
  const base = useId();
  const [shown, show] = useLocateNote();
  const [chip, setChip] = useState<string | null>(null);
  const shownFor = shown ? chip : null;
  const missing = (key: string) => ({ key, shownFor, show: (at: string) => { setChip(at); show(); } });
  const skills = new Set(entry.skills ?? []);
  // Chips are numbered in drawing order, which is the order of the message, so each keeps its note id across renders.
  let chips = 0;
  const inline = (parts: readonly MessagePart[]) => parts.map((part, i) => {
    if (!("text" in part)) return <SentChip key={i} marker={part.anchor} anchor={entry.anchors[part.anchor - 1]} frames={frames}
      disabled={disabled} onLocate={onLocate} missing={missing(`${base}-${chips++}`)} />;
    // An anchor ends the preceding word but cannot start the next one.
    const previous = parts[i - 1], prefix = previous && !("text" in previous) ? "x" : "";
    const runs = skillWords(prefix + part.text, skills);
    return <Fragment key={i}>{skillTextParts(part.text, prefix.length, runs).map((piece, index) =>
      piece.skill ? <span key={index} className="skill-word">{piece.text}</span> : <Fragment key={index}>{piece.text}</Fragment>)}</Fragment>;
  });
  const blocks = bubbleBlocks(entry.parts), listed = blocks.some(block => block.kind === "list");
  // Lists are role="list" blocks, not ul/ol: Chromium leaves an ul/ol marker out of copied text, and the person copies
  // what they sent, markers and depth spaces included. A message without a list draws as plain text, as before.
  const list = (block: BubbleList, depth: number, mark = markColumn(block)): ReactNode => <div className="bubble-list" role="list">{block.items.map((item, i) => <div key={i} className="bubble-item" role="listitem">
    {item.lead && <span className="list-depth" data-depth={depth}>{item.lead}</span>}
    <span className="list-mark" data-kind={block.list} data-mark={mark}>{item.marker}</span>
    <span className="bubble-item-body" data-depth={depth} data-mark={mark}>{inline(item.parts)}</span>
    {item.children.map((child, n) => <Fragment key={n}>{list(child, depth + 1)}</Fragment>)}
  </div>)}</div>;
  return <div className="msg-user">
    <div className="bubble">{entry.preset && <span className="bubble-preset"><PencilSparkles aria-hidden="true" />{entry.preset.title}</span>}{entry.preset && entry.parts.length > 0 && !listed && "\n"}
      {listed ? blocks.map((block, i) => block.kind === "list" ? <Fragment key={i}>{list(block, 0)}</Fragment>
        : <span key={i} className="bubble-text">{inline(block.parts)}{i < blocks.length - 1 && endsInBlankLine(block.parts) && "\n"}</span>)
        : inline(entry.parts)}</div>
    {entry.attachments.length > 0 && <div className="msg-files">{entry.attachments.map((file, i) => {
      const view = sentFileView(file, home);
      const chip = <span className="attach-chip" aria-description={file.excerpt}>
        <span className="file-icon" aria-hidden="true">{view.folder ? <Folder /> : <FileText />}</span><span className="attach-text"><b>{view.label}</b><small>{view.meta}</small></span></span>;
      return <Fragment key={i}>{view.tooltip ? <Tooltip><TooltipTrigger asChild>{chip}</TooltipTrigger><TooltipContent>{view.tooltip}</TooltipContent></Tooltip> : chip}</Fragment>;
    })}</div>}
    {entry.sending && <span className="msg-sending"><span className="doan-spinner" aria-hidden="true" />Sending</span>}
    {shownFor && <span className="chip-missing" id={`${shownFor}-missing`} role="status">{LOCATE_MISSING_TEXT}</span>}
  </div>;
}

// role="img" names the run without the name entering copied text, as an sr-only span would.
function EditLinesRun({ lines }: { lines: EditLines }) {
  const label = editLinesLabel(lines), [added, removed] = label.text.split(" ");
  return <span className="lines" role="img" aria-label={label.name}><span className="add">{added}</span> <span className="del">{removed}</span></span>;
}
const STEP_ICONS = { read: Eye, edit: Pencil, command: Terminal, other: Terminal } as const;
export function Steps({ id, steps }: { id: string; steps: readonly ActivityStep[] }) {
  return <ul className="activity-steps selectable" id={id}>{steps.map(step => {
    const Icon = STEP_ICONS[step.kind];
    return <li key={step.key}><Icon aria-hidden="true" /><span className={step.sentence ? "verb mcp-step" : "verb"}>{step.verb}</span>{step.path && <span className="path">{step.path}</span>}{step.lines && <EditLinesRun lines={step.lines} />}</li>;
  })}</ul>;
}

const CARD_ICONS = { check: Check, forward: Forward, ban: Ban } as const;
// What a thread hands each card: the root's rows, its images by path, and the time, which the thread moves once a minute.
export interface CardContext { rows: readonly CanvasRow[]; thumbnails: ReadonlyMap<string, ThumbnailState>; now: number; root: string }
// A card's canvas row, found as the hosts' canvasListed finds it (sameCanvas, so a renamed canvas keeps it); none once
// that canvas reads as gone, so its image and meta go with its Open.
function cardRow(canvas: Canvas, rows: readonly CanvasRow[], listed: (canvas: Canvas) => boolean): CanvasRow | undefined {
  return listed(canvas) ? rows.find(row => sameCanvas(canvas, row)) : undefined;
}
// The canvas a canvas card's status and meta follow: a started handoff's target, else its own (with the row's ID).
function cardCanvas(entry: Extract<ThreadItem, { kind: "canvasCard" }>, rows: readonly CanvasRow[]): Canvas {
  return entry.handoff?.outcome === "started" ? entry.handoff.target.canvas : withRowId(entry.canvas, rows);
}
// The canvas's image across the card (aria-hidden: decoration). Without one, the sidebar's canvas icon, faint, at the
// same height. data-path names the canvas whose visibility the thread reports.
function CardBanner({ thumb, path }: { thumb: CanvasCardMeta["thumb"]; path: string | undefined }) {
  if (thumb.kind === "ready") return <div className="cc-banner" data-path={path} aria-hidden="true"><img src={thumb.url} alt="" /></div>;
  return <div className="cc-banner empty" data-path={path} aria-hidden="true"><PanelsTopLeft aria-hidden="true" /></div>;
}
// The meta line: folder · frames · the modified or handoff time. A drawing card keeps the line, empty or not, so it is as
// tall as once drawn.
function CardMeta({ meta, keep }: { meta: CanvasCardMeta; keep: boolean }) {
  const time = meta.edited ?? meta.handedOff;
  const parts = [...[meta.folder, meta.frames].flatMap(text => text === null ? [] : [<span>{text}</span>]),
    ...(time ? [<span>{`${time.lead} `}<Tooltip><TooltipTrigger asChild><time dateTime={time.dateTime}>{time.text}</time></TooltipTrigger><TooltipContent>{time.title}</TooltipContent></Tooltip></span>] : [])];
  if (parts.length === 0 && !keep) return null;
  return <span className="cc-meta">{parts.map((part, i) => <Fragment key={i}>{i > 0 && <span className="sep" aria-hidden="true">·</span>}{part}</Fragment>)}</span>;
}
// A canvas of a turn. The status changes in place (the card's key holds), so focus on Open stays. No live region: the
// thread's status line says the new canvases once the turn ends.
export function CanvasCard({ entry, context, project, provider, canvasListed, onOpen }: { entry: Extract<ThreadItem, { kind: "canvasCard" }>; context: CardContext; project: string; provider: Provider;
  canvasListed(canvas: Canvas): boolean; onOpen?: ((canvas: Canvas, conversationId?: string) => void) | undefined }) {
  const view = canvasCardText({ ...entry, canvas: withRowId(entry.canvas, context.rows) }, { project, provider, listed: canvasListed }), open = view.open;
  const Icon = view.icon === "spinner" ? null : CARD_ICONS[view.icon];
  // entry.drawing is the turn running, true for an existing canvas's request too; only a spinning card draws.
  const drawing = view.icon === "spinner";
  const row = cardRow(cardCanvas(entry, context.rows), context.rows, canvasListed);
  const meta = canvasCardMeta(row, row && context.thumbnails.get(row.path), context.now, context.root, { drawing });
  return <div className="card-surface canvas-card" role="group" aria-label={view.label}><div className="card-layout">
    <CardBanner thumb={meta.thumb} path={row?.path} />
    <div className="card-head">
      <span className="cc-icon">{Icon ? <Icon aria-hidden="true" /> : <span className="doan-spinner" aria-hidden="true" />}</span>
      <span className="cc-text"><CardName name={view.name} kind="canvas" /><span className="cc-status">{view.status}</span><CardMeta meta={meta} keep={drawing} /></span>
      {open && onOpen && <button type="button" className="doan-button cc-open" data-ui-size="sm" data-ui-variant="trigger" aria-label={open.label} onClick={() => onOpen(open.canvas, open.conversationId)}>Open</button>}
    </div>
  </div></div>;
}
// A handoff request names a path alone, while listing and Open find a canvas by its ID once its row has one
// (sameCanvas), so an existing canvas would read as gone: the root's one row with that path lends its ID.
function withRowId(canvas: Canvas, rows: readonly CanvasRow[]): Canvas {
  if (canvas.id !== undefined) return canvas;
  const same = rows.filter(row => row.path === canvas.path);
  return same.length === 1 && same[0]!.id !== undefined ? { path: canvas.path, id: same[0]!.id } : canvas;
}
// The text width the name's computed font gives, for the middle cut; CSS can only cut a line's end.
let measuring: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, style: CSSStyleDeclaration): number {
  measuring ??= document.createElement("canvas").getContext("2d");
  if (!measuring) return 0;
  measuring.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  measuring.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  return Math.ceil(measuring.measureText(text).width);
}
// The most characters a middle cut of `name` keeps within `width`; null when the name fits whole (or nothing laid out).
function fitKeep(name: string, width: number, measure: (text: string) => number): number | null {
  if (width <= 0 || measure(name) <= width) return null;
  let low = 1, high = name.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(middleCut(name, mid)) <= width) low = mid; else high = mid - 1;
  }
  return low;
}
// The card's name never wraps: a long one is cut in the middle, keeping its extension, with the full name in the tooltip
// (the card's and Open's accessible names already hold it). The title row's width is set by the card's grid column,
// not by the name, so measuring it never loops.
function CardName({ name, kind }: { name: string; kind: "canvas" | "overview" }) {
  const title = useRef<HTMLSpanElement | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = title.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const label = node.lastElementChild;
      if (!(label instanceof HTMLElement)) return;
      const style = getComputedStyle(label);
      setKeep(fitKeep(name, Math.floor(node.getBoundingClientRect().right - label.getBoundingClientRect().left), text => textWidth(text, style)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [name]);
  const shown = keep === null ? name : middleCut(name, keep);
  // Only a cut name has a tooltip. The name is no control, so changing its wrapper moves no focus.
  const label = <span className="cc-name">{shown}</span>;
  const Kind = kind === "canvas" ? PanelsTopLeft : LayoutGrid;
  return <span className="cc-title" ref={title}><Kind className="cc-kind" aria-hidden="true" />
    {shown === name ? label : <Tooltip><TooltipTrigger asChild>{label}</TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>}</span>;
}
// The receiving conversation's first message: the canvas card's surface and head row naming the source in bold, then the
// earlier agent's text as its Markdown, apart from the person's bubble. The card takes focus after a move, so it is a
// labelled group. Its source is a canvas, or for a project conversation's handoff the root's Overview (no banner), whose
// Open shows the source conversation there.
export function HandoffCard({ entry, context, project, canvasListed, conversationListed, onOpen, onOpenOverview }: { entry: Extract<ThreadItem, { kind: "handoffCard" }>; context: CardContext; project: string;
  canvasListed(canvas: Canvas): boolean; conversationListed?: ((conversationId: string) => boolean) | undefined;
  onOpen?: ((canvas: Canvas, conversationId: string) => void) | undefined; onOpenOverview?: ((conversationId: string) => void) | undefined }) {
  const source = entry.origin.canvas, conversationId = entry.origin.conversationId;
  const listed = source ? canvasListed(source) : conversationListed?.(conversationId) ?? true;
  const view = handoffCardView(entry.origin, project, listed);
  const open = !listed ? null : source ? onOpen && (() => onOpen(source, conversationId)) : onOpenOverview && (() => onOpenOverview(conversationId));
  const row = source && cardRow(source, context.rows, canvasListed);
  const meta = canvasCardMeta(row, row && context.thumbnails.get(row.path), context.now, context.root, { handedOffAt: entry.at });
  return <div className="card-surface handoff-card" role="group" aria-label={view.label} tabIndex={-1}><div className="card-layout">
    {source && <CardBanner thumb={meta.thumb} path={row?.path} />}
    <div className="card-head">
      <span className="cc-icon"><Forward aria-hidden="true" /></span>
      <span className="cc-text"><CardName name={view.name} kind={view.kind} /><span className="cc-status">{view.status}</span><CardMeta meta={meta} keep={false} /></span>
      {open && <button type="button" className="doan-button cc-open" data-ui-size="sm" data-ui-variant="trigger" aria-label={view.openLabel} onClick={open}>Open</button>}
    </div>
    <AgentMessage text={entry.text} streaming={false} className="handoff-body md selectable" />
  </div></div>;
}

// The thread's one viewer of its root's images: it asks for the canvases its cards show and reports which banners are on
// screen. A component of its own, so the thread body keeps no thumbnail hooks; its images go back up through onImages.
function CardThumbnails({ hub, root, banners, scroller, onImages }: { hub: ThumbnailHub; root: string; banners: readonly CardBanner[];
  scroller: { readonly current: HTMLElement | null }; onImages(images: ReadonlyMap<string, ThumbnailState>): void }) {
  const rows = [...new Map(banners.map(banner => [banner.row.path, banner.row])).values()];
  // A row's width decides whether it can be captured, so it is part of what is asked.
  const key = rows.map(row => `${row.path}\t${row.width ?? ""}`).join("\n");
  const held = useRef({ key, rows });
  if (held.current.key !== key) held.current = { key, rows };
  const { thumbnails, onVisible } = useThumbnails(hub, root, held.current.rows);
  useEffect(() => { onImages(thumbnails); }, [thumbnails, onImages]);
  const watched = bannerWatchKey(banners);
  useEffect(() => {
    const field = scroller.current;
    if (!field || watched === "") return;
    return watchBanners(field, onVisible);
  }, [watched, scroller, onVisible]);
  return null;
}
export interface CardBanner { key: string; row: CanvasRow }
// When the watcher starts over: by card, since a later card of a canvas already shown has its own banner, and by path,
// since a renamed canvas keeps its card and the observer reports only changes of intersection.
export function bannerWatchKey(banners: readonly CardBanner[]): string {
  return banners.map(banner => `${banner.key}\t${banner.row.path}`).join("\n");
}
// The banners the thread's cards draw with a listed canvas's row, by card key.
export function cardBanners(items: readonly ThreadItem[], rows: readonly CanvasRow[], listed: (canvas: Canvas) => boolean): CardBanner[] {
  return items.flatMap(item => {
    const canvas = item.kind === "canvasCard" ? cardCanvas(item, rows) : item.kind === "handoffCard" ? item.origin.canvas : undefined;
    const row = canvas && cardRow(canvas, rows, listed);
    return row ? [{ key: item.key, row }] : [];
  });
}
// Reports the paths with a banner on screen in `field`, again whenever that set changes, and [] once stopped. Several
// cards can show one canvas, so a path stays visible while any of its banners is.
export function watchBanners(field: HTMLElement, report: (paths: readonly string[]) => void, Observer: typeof IntersectionObserver = IntersectionObserver): () => void {
  const shown = new Map<Element, string>();
  let reported = "";
  const observer = new Observer(changes => {
    for (const change of changes) {
      if (change.isIntersecting) shown.set(change.target, (change.target as HTMLElement).dataset.path ?? "");
      else shown.delete(change.target);
    }
    const paths = [...new Set(shown.values())].sort();
    if (paths.join("\n") === reported) return;
    reported = paths.join("\n");
    report(paths);
  }, { root: field });
  for (const banner of field.querySelectorAll<HTMLElement>(".cc-banner[data-path]")) observer.observe(banner);
  return () => { observer.disconnect(); report([]); };
}

// The last turn's end, which offers the end actions. resend: that turn began with the person's message; a turn the
// handoff card began did not (the earlier agent wrote it), so its text never becomes the person's draft.
function lastEnd(items: readonly ThreadItem[]): { key: string; resend: boolean } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    // A message Send now has in flight is not in the history yet, so it starts no turn after the end.
    if (item.kind === "user" && !item.sending) return null;
    if (item.kind === "end") {
      let j = i - 1;
      while (j >= 0 && items[j]!.kind !== "user" && items[j]!.kind !== "handoffCard") j--;
      return { key: item.key, resend: items[j]?.kind !== "handoffCard" };
    }
  }
  return null;
}
// The running turn reads as the indicator's settled stage kind, so it changes only when that kind does. The background
// line is no live region: this status says it once as it appears, and the same words while it stays (Stopping too).
// Once the turn ended, its new canvases follow the end's title, or are said alone after a turn without one. `ended` holds
// the cards as the history has them: a Stop hides the indicator and stops their spinners before the turn's end arrives,
// and the count waits for that end.
function phaseText(items: readonly ThreadItem[], ended: readonly ThreadItem[], provider: Provider, shown: TurnStatus, background: boolean): string {
  const p = PROVIDER_NAMES[provider];
  if (items.some(waitsForPerson)) return `${p} needs your answer`;
  const stage = turnAnnouncement(shown, p);
  if (stage) return stage;
  if (background) return "Background work is still running";
  const last = items[trailingCards(items).start - 1], title = last?.kind === "end" ? endView(last.end, provider).title : "", cards = newCanvasesText(ended);
  if (!cards) return title;
  return title ? `${title}${title.endsWith(".") ? "" : "."} ${cards}` : cards;
}

// The turn indicator (draft frame `states`): in the reply's place at the thread's end, one
// line of the stage's words under a sweep and the time since the turn started. It is no live region and takes no
// focus; the time is hidden from screen readers. Its own timer redraws only this line each second, so the thread's
// items and scroll effect do not run every second. The timer stops while the document is hidden or the window is closed
// or the app hidden, and the time is counted again from `at` once it shows (POSTMORTEM 2026-10-25: document visibility
// is not native visibility). It differs from useVisibleClock only in waking on the turn's whole seconds.
export function TurnIndicator({ text, at, provider, visibility }: { text: string; at: string; provider: Provider; visibility: VisibleCalls }) {
  const [, tick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nativeVisible = true;
    const stop = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    // Wakes on the next whole second of the turn's time, so the shown second never lags behind it.
    const schedule = () => {
      stop();
      if (document.hidden || !nativeVisible) return;
      const since = Date.now() - Date.parse(at);
      timer = setTimeout(() => { tick(n => n + 1); schedule(); }, Number.isFinite(since) && since > 0 ? 1000 - since % 1000 : 1000);
    };
    const shown = () => { if (document.hidden || !nativeVisible) stop(); else { tick(n => n + 1); schedule(); } };
    schedule();
    document.addEventListener("visibilitychange", shown);
    const off = visibility.onWindowVisible(visible => { nativeVisible = visible; shown(); });
    return () => { stop(); off(); document.removeEventListener("visibilitychange", shown); };
  }, [at, visibility]);
  return <div className="ti ti-reply"><img className="logo" src={providerLogo(provider)} alt="" />
    <span className="ti-text ti-shimmer">{text}</span><span className="ti-time" aria-hidden="true">{elapsedText(Date.now() - Date.parse(at))}</span></div>;
}
const NO_TURN: TurnStatus = { kind: "none" };
const NO_IMAGES: ReadonlyMap<string, ThumbnailState> = new Map();
const NO_ROWS: readonly CanvasRow[] = [];
// The thread's items with each run of canvas cards together; every other item alone.
function stacks(items: readonly ThreadItem[]): ThreadItem[][] {
  const runs: ThreadItem[][] = [];
  for (const item of items) {
    const run = runs.at(-1);
    if (item.kind === "canvasCard" && run?.[0]?.kind === "canvasCard") run.push(item); else runs.push([item]);
  }
  return runs;
}
// The background line's thread item key, which no history item takes (their keys start with a kind letter and a seq).
const BACKGROUND_KEY = "background";

// The thread item (its data-item key) holding focus, if focus is inside the thread.
function focusedItem(scroller: HTMLElement | null): string | null {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!scroller || !active || !scroller.contains(active)) return null;
  return active.closest("[data-item]")?.getAttribute("data-item") ?? null;
}

export const ConversationThread = forwardRef<ConversationThreadHandle, ConversationThreadProps>(function ConversationThread(props, ref) {
  return <ThreadBody key={props.conversationId} {...props} handle={ref} />;
});

// One thread item. Its host re-renders the thread on every streamed delta, so an item draws again only when its own data
// or what it reads from outside that data (deps, compared by value) changed. `draw` is left out of the comparison: a
// kept item's handlers come from an earlier render, so they reach the host through ThreadBody's `latest`.
export const ThreadEntry = memo(function ThreadEntry({ entry, draw }: { entry: ThreadItem; deps: readonly unknown[]; draw: (entry: ThreadItem) => ReactNode }) {
  return <div className="thread-item" data-item={entry.key}>{draw(entry)}</div>;
}, (a, b) => sameItem(a.deps, b.deps) && sameItem(a.entry, b.entry));

const ThreadBody = function ThreadBody({ handle: ref, ...props }: ConversationThreadProps & { handle: Ref<ConversationThreadHandle> }) {
  const { items, provider } = props;
  const latest = useRef(props);
  latest.current = props;
  const base = useId();
  const scroller = useRef<HTMLDivElement | null>(null);
  const distance = useRef(0), opened = useRef(false), shownHeight = useRef(0);
  const [behind, setBehind] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const [images, setImages] = useState<ReadonlyMap<string, ThumbnailState>>(NO_IMAGES);
  // The card last answered, skipped or stopped here and the focusAfter rule for it: once that card folds, by any
  // status, its button is gone and focus moves on by the rule (ARCHITECTURE §7 'Renderer primitives' 'Thread focus').
  const folding = useRef<{ requestId: string; action: FocusAction } | null>(null);
  // A card can also fold with no press here: the agent's CLI cancels it or the turn ends. When focus was
  // in it, or its Other field held text not sent, it is the card folding, and focus moves on as after an answer. Focus is
  // read as this render begins, before its commit replaces the card's controls; the drafts are those of the last commit,
  // since the store drops a question's draft with the resolution that folds it.
  const focusedKey = focusedItem(scroller.current);
  const shown = useRef<readonly { requestId: string; key: string; unsent: boolean }[]>([]);
  const stop = (requestId: string) => { folding.current = { requestId, action: { kind: "stopped" } }; latest.current.onStop(); };
  // Requests whose last answer did not reach main: the person chooses again.
  const [unanswered, setUnanswered] = useState<ReadonlySet<string>>(new Set());
  const answer = (requestId: string, optionId: string) => {
    folding.current = { requestId, action: { kind: "answered", requestId } };
    setUnanswered(current => { if (!current.has(requestId)) return current; const next = new Set(current); next.delete(requestId); return next; });
    void answerReached(() => latest.current.onAnswer(requestId, optionId)).then(reached => { if (!reached) setUnanswered(current => new Set(current).add(requestId)); });
  };
  const draftOf = (requestId: string) => latest.current.questionDraft?.(requestId) ?? EMPTY_QUESTION_DRAFT;
  const editQuestion = (requestId: string, action: QuestionDraftAction) => latest.current.onQuestionDraft?.(requestId, action);
  const sendQuestion = (entry: Extract<ThreadItem, { kind: "question" }>, how: "answer" | "skip") => {
    const draft = draftOf(entry.requestId);
    if (draft.sending) return;
    const answer: QuestionAnswerInput = how === "skip" ? { outcome: "skipped" } : questionInput(entry.questions, draft);
    editQuestion(entry.requestId, { type: "sending", how });
    folding.current = { requestId: entry.requestId, action: { kind: "answered", requestId: entry.requestId } };
    void settleQuestionSend(() => latest.current.onAnswerQuestion ? latest.current.onAnswerQuestion(entry.requestId, answer) : Promise.resolve({ error: "unknown" }), action => editQuestion(entry.requestId, action));
  };
  const focusIn = (key: string): boolean => {
    const control = scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"] ${ENTRY_FOCUS}`);
    control?.focus({ preventScroll: true });
    return !!control;
  };
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The indicator's stage after settle, kept as state derived while rendering: an immediate change shows in
  // the same render, so the indicator is there from the render the person's message enters.
  // It belongs to one turn: a next turn starts from nothing, even when no render showed the earlier one's end (a queue
  // starting it at once), so an earlier turn's shown or pending stage never shows beside it.
  const turnId = props.turn?.turnId ?? null;
  const [held, setHeld] = useState<{ turnId: string | null; settled: Settled } | null>(null);
  const settled = settle(held?.turnId === turnId ? held.settled : null, props.turn?.status ?? NO_TURN, Date.now());
  if (settled !== held?.settled) setHeld({ turnId, settled });
  const [, wake] = useState(0);
  useEffect(() => {
    if (!settled.pending) return;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, SETTLE_MS - (Date.now() - settled.since)));
    return () => clearTimeout(timer);
  }, [settled]);
  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The turn whose background work this thread's Stop asked main to stop, until main answers.
  const [stoppingTurn, setStoppingTurn] = useState<string | null>(null);
  // Main answers a Stop at once while another host's Stop of the same work is under way; should that one fail, main
  // shows the line without `stopping` again, and this press must not hold Stopping while the work runs on.
  const mainStopping = props.background?.stopping === true;
  const [mainWasStopping, setMainWasStopping] = useState(mainStopping);
  if (mainWasStopping !== mainStopping) {
    setMainWasStopping(mainStopping);
    if (!mainStopping && stoppingTurn !== null && stoppingTurn === props.background?.turnId) setStoppingTurn(null);
  }
  // The line belongs to its done turn while that is the thread's last: the person's next message (a Send now in flight
  // too) or a turn still running takes the place in the render it enters.
  const line = Array.isArray(items) ? backgroundLine({
    background: props.background,
    sending: props.turn?.turnId !== props.background?.turnId || props.turn?.status.kind !== "none" || items.some(item => item.kind === "user" && item.sending === true),
    stopping: stoppingTurn !== null && stoppingTurn === props.background?.turnId,
  }) : null;
  const stopLine = (turnId: string, stopping: boolean) => {
    const stopBackground = latest.current.onStopBackground;
    if (stopping || !stopBackground) return;
    setStoppingTurn(turnId);
    void stopBackground(turnId).catch(() => false).then(ok => { if (!ok) setStoppingTurn(current => current === turnId ? null : current); });
  };
  // The line went while its Stop held focus (read as this render began): the button left the page, and focus goes to
  // the composer field instead of the page body. Stopping keeps the button, so focus stays on it.
  const lineFocused = focusedKey === BACKGROUND_KEY;
  // These recoveries can run with the window in the background (a turn ended or stopped from a terminal), so they are
  // made again when the window activates (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
  useLayoutEffect(() => {
    if (line || !lineFocused) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    handFocus(() => props.onFocusComposer?.());
  });

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // Follow new output only from within 24px of the bottom, measured before this update.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !Array.isArray(items)) return;
    const opening = !opened.current;
    opened.current = true;
    const drew = node.scrollHeight !== shownHeight.current;
    shownHeight.current = node.scrollHeight;
    const next = threadScroll(opening, drew, distance.current);
    if (next === "bottom") { node.scrollTop = node.scrollHeight; distance.current = 0; setBehind(false); }
    else if (next === "behind") setBehind(true);
  }, [items]);
  // A folded card took the focus that was on it to the page: by its rule, the next waiting request or the composer
  // takes it. A person who moved focus elsewhere meanwhile keeps it.
  useLayoutEffect(() => {
    if (!Array.isArray(items)) return;
    const asks = pendingAsks(items);
    const gone = folding.current === null && shown.current.find(ask => !asks.some(a => a.requestId === ask.requestId) && (ask.key === focusedKey || ask.unsent));
    if (gone) folding.current = { requestId: gone.requestId, action: { kind: "answered", requestId: gone.requestId } };
    const fold = folding.current;
    if (fold === null) return;
    if (asks.some(ask => ask.requestId === fold.requestId)) return;
    folding.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = focusAfter(fold.action, { pending: asks.map(ask => ask.requestId) });
    const key = target.kind === "option" ? asks.find(ask => ask.requestId === target.requestId)!.key : null;
    handFocus(() => { if (key !== null) focusIn(key); else props.onFocusComposer?.(); });
  }, [items]);
  // A turn's cards sit above a request still waiting and below it once it folds, so React moves the card stack past
  // the request; moving a focused control's ancestor drops its focus to the page. Focus goes back to the same card's
  // Open, unless the person moved it elsewhere or the card is gone.
  const cardFocused = focusedKey !== null && Array.isArray(items) && items.some(item => item.kind === "canvasCard" && item.key === focusedKey) ? focusedKey : null;
  useLayoutEffect(() => {
    if (cardFocused === null || (document.activeElement && document.activeElement !== document.body)) return;
    handFocus(() => scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(cardFocused)}"] .cc-open`)?.focus({ preventScroll: true }));
  });
  useLayoutEffect(() => {
    shown.current = Array.isArray(items) ? pendingAsks(items).map(ask => ({ ...ask, unsent: Object.values(draftOf(ask.requestId).choices).some(choice => choice.text.trim() !== "") })) : [];
  });
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
      // A question or handoff card scrolls to its top: in a 280px panel a tall card's centre would leave its title out of view.
      node?.scrollIntoView({ block: node.querySelector(".q-card, .handoff-card") ? "start" : "center", behavior: reduced() ? "auto" : "smooth" });
    },
    focusItem: focusIn,
  }), []);

  // The Markdown is memoized, so its links and Copy buttons read the latest callbacks through one stable context value.
  const actions = useRef<ThreadActions>({ openLink: () => {}, copy: () => {}, replyChip: () => null });
  actions.current.openLink = url => props.onOpenLink(url);
  actions.current.replyChip = link => props.onReplyChip?.(link) ?? null;
  actions.current.copy = (text, reply) => {
    void props.onCopy(text).catch(() => false).then(ok => {
      if (!ok) { setCopyFailed(reply); return; }
      setCopyFailed(null);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  };
  const context = useRef<ThreadActions>({ openLink: url => actions.current.openLink(url), copy: (text, reply) => actions.current.copy(text, reply), replyChip: link => actions.current.replyChip(link) }).current;
  const pressable = props.onReplyChip !== undefined, disabled = !!props.locateDisabled, openCanvasId = props.openCanvasId ?? null;
  const replyCanvas = useMemo<ReplyCanvas>(() => ({ openCanvasId, frames: props.frames, rows: props.canvasRows ?? [], disabled, pressable }),
    [openCanvasId, props.frames, props.canvasRows, disabled, pressable]);

  if (items === "error") return <div className="conversation-thread">
    <div className="doan-notice error thread-notice" role="alert"><AlertIcon /><span className="strip-text selectable" id={`thread-read-error-${props.conversationId}`}><b>Doan couldn’t read this conversation</b><span>{announcedAgain("Try again. If it keeps failing, start a new conversation.", (props.retry ?? LIST_RETRY_IDLE).failures)}</span></span>
      <span className="strip-actions">{retryButton({ running: (props.retry ?? LIST_RETRY_IDLE).running, variant: "panel", describedBy: `thread-read-error-${props.conversationId}`, onRetry: () => props.onRetry() })}</span></div>
  </div>;
  if (items === null) return <ConversationLoading />;

  const p = PROVIDER_NAMES[provider];
  const last = lastEnd(items);
  // The last activity row reads the indicator's settled status, so the two say the same in every render. Only Claude
  // Code and Codex write an activity as its tool starts; the ACP agents write it once the tool completed.
  const drawn = drawingCards(activityRun(items, settled.shown, provider !== "claude" && provider !== "codex" ? props.turn?.status ?? NO_TURN : null), settled.shown);
  // A kept item's handlers read the host's latest callbacks (ThreadEntry); its deps name what it draws from outside its data.
  const locate: ConversationThreadProps["onLocate"] = anchor => latest.current.onLocate!(anchor);
  const listed = (canvas: Canvas) => latest.current.canvasListed(canvas);
  const openHandoff = (canvas: Canvas, conversationId?: string) => latest.current.onOpenHandoff?.(canvas, conversationId);
  const openOverview = (conversationId: string) => latest.current.onOpenOverview?.(conversationId);
  const conversationListed = (conversationId: string) => latest.current.conversationListed?.(conversationId) ?? true;
  // The cards' times move once a minute, not with each tick of the host's clock.
  const minute = Math.floor(props.now / 60_000) * 60_000;
  const rows = props.canvasRows ?? NO_ROWS;
  const cardContext: CardContext = { rows, thumbnails: images, now: minute, root: props.thumbnails?.root ?? "" };
  // What a card's meta reads from outside its data: its row, its image and the minute.
  const metaDeps = (canvas: Canvas | undefined) => {
    const row = canvas && cardRow(canvas, rows, props.canvasListed);
    return [row ?? null, row ? images.get(row.path) ?? null : null, minute];
  };
  const depsOf = (entry: ThreadItem): readonly unknown[] => {
    switch (entry.kind) {
      case "user": return [props.frames, !!props.locateDisabled, !!props.onLocate, props.homeDirectory ?? null];
      case "activity": return [expanded.has(entry.key)];
      case "permission": return [provider, entry.seq > props.liveAfter, unanswered.has(entry.requestId)];
      case "question": return entry.status === "pending" ? [provider, entry.seq > props.liveAfter, draftOf(entry.requestId)] : [];
      case "end": return [provider, entry.key === last?.key, entry.key === last?.key && last.resend, entry.key === last?.key ? props.limitResets ?? null : null, entry.key === last?.key && !!props.resendHidden];
      case "canvasCard": {
        const canvas = cardCanvas(entry, rows);
        return [provider, props.project, canvas, props.canvasListed(canvas), !!props.onOpenHandoff, ...metaDeps(canvas)];
      }
      case "handoffCard": {
        const source = entry.origin.canvas;
        return source ? [props.project, props.canvasListed(source), !!props.onOpenHandoff, ...metaDeps(source)] : [props.project, props.conversationListed?.(entry.origin.conversationId) ?? true, !!props.onOpenOverview, minute];
      }
      case "marker": return [props.project, props.canvasListed(entry.canvas), openCanvasId, props.openCanvasPath];
      default: return [];
    }
  };
  const toggle = (key: string) => setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const item = (entry: ThreadItem): ReactNode => {
    switch (entry.kind) {
      case "user": return <UserMessage entry={entry} frames={props.frames} disabled={!!props.locateDisabled} onLocate={props.onLocate && locate} home={props.homeDirectory ?? null} />;
      case "agent": return <AgentMessage text={entry.text} streaming={entry.streaming} />;
      case "noReply": return <div className="msg-agent"><p className="muted">No reply.</p></div>;
      case "fast": return <div className="activity"><div className="activity-head fast-note"><Zap aria-hidden="true" /><span>{entry.text}</span></div></div>;
      case "activity": {
        const open = expanded.has(entry.key), id = `${base}-${entry.key}`;
        return <div className="activity">
          <button type="button" className="activity-head" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={entry.total && editHeadName(entry.steps.length, entry.total)} onClick={() => toggle(entry.key)}>
            {entry.running && <span className="doan-spinner" aria-hidden="true" />}<span>{entry.head}</span>
            {entry.total && <><span className="head-sep" aria-hidden="true">·</span><EditLinesRun lines={entry.total} /></>}<ChevronDown className="chev" aria-hidden="true" /></button>
          {open && <Steps id={id} steps={entry.steps} />}
        </div>;
      }
      case "permission": {
        if (entry.status !== "pending") return <div className="activity"><div className="activity-head ask-answered"><span className="selectable">
          {entry.status === "answered" ? `${entry.answer ? ANSWERED[entry.answer.kind] : "Answered"} · ${entry.summary}` : `Expired without an answer · ${entry.summary}`}</span></div></div>;
        const live = entry.seq > props.liveAfter;
        return <div className="doan-notice thread-notice" role={live ? "alert" : undefined}>
          <span className="strip-agent doan-alert-icon"><img className="logo" src={providerLogo(provider)} alt="" /></span>
          {/* What will run leads; the agent's words about it and what a saving choice adds follow (ARCHITECTURE §7). */}
          <span className="strip-text selectable"><b>{`${p} needs your answer`}</b><span className="ask-command">{entry.summary}</span>
            {entry.reason && <span className="ask-reason">{entry.reason}</span>}
            {entry.options.flatMap(option => option.detail ? [<span key={option.id} className="ask-saves">{`${option.label}: ${option.detail}`}</span>] : [])}</span>
          <span className="strip-actions">
            {entry.options.map(option => <button key={option.id} type="button" className="doan-button" data-ui-size="sm" data-ui-variant={option.kind === "allow" ? "prominent" : "panel"}
              data-request={entry.requestId} onClick={() => answer(entry.requestId, option.id)}>{option.label}</button>)}
            <button type="button" className="doan-button" data-ui-size="sm" onClick={() => stop(entry.requestId)}><CircleStop aria-hidden="true" />Stop</button>
          </span>
          {unanswered.has(entry.requestId) && <p className="settings-msg error ask-error" role="alert"><AlertIcon /><span>Couldn’t send your answer. Choose again.</span></p>}
        </div>;
      }
      case "question": {
        if (entry.status !== "pending") return <div className="q-folded">{questionLines(entry).map((line, i) =>
          <div key={i} className="activity"><div className="activity-head ask-answered"><NameTip text={line}><span className="selectable">{line}</span></NameTip></div></div>)}</div>;
        return <QuestionCard item={entry} provider={provider} live={entry.seq > props.liveAfter} base={base} draft={draftOf(entry.requestId)}
          onDraft={action => editQuestion(entry.requestId, action)} onSend={() => sendQuestion(entry, "answer")} onSkip={() => sendQuestion(entry, "skip")} onStop={() => stop(entry.requestId)} />;
      }
      case "end": {
        const isLast = entry.key === last?.key;
        const view = endView(entry.end, provider, isLast ? props.limitResets ?? null : null);
        const resend = isLast && last.resend && view.resend !== false && !props.resendHidden;
        return <div className={`doan-notice${view.tone ? ` ${view.tone}` : ""} thread-notice`}>
          {view.tone ? <AlertIcon /> : <CircleStop className="doan-alert-icon" aria-hidden="true" />}
          <span className="strip-text selectable"><b>{view.title}</b>{view.body && <span>{view.body}</span>}</span>
          {isLast && (view.signIn || resend) && <span className="strip-actions">
            {view.signIn && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => latest.current.onSignIn()}>Sign in again</button>}
            {resend && <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={() => latest.current.onEditAndResend()}>Edit and resend</button>}
          </span>}
        </div>;
      }
      case "canvasCard": return <CanvasCard entry={entry} context={cardContext} project={props.project} provider={provider} canvasListed={listed} onOpen={props.onOpenHandoff && openHandoff} />;
      case "handoffCard": return <HandoffCard entry={entry} context={cardContext} project={props.project} canvasListed={listed} conversationListed={conversationListed}
        onOpen={props.onOpenHandoff && openHandoff} onOpenOverview={props.onOpenOverview && openOverview} />;
      case "boundary": return <div className="context-boundary" role="separator" aria-label={entry.label}><span>{entry.label}</span></div>;
      case "marker": {
        const canvas = entry.canvas, listed = props.canvasListed(canvas), name = canvasStem(canvas.path);
        // On the panel of the canvas it moved to, "Moved to" and Open would point at the screen already shown.
        if (canvas.id !== undefined ? canvas.id === openCanvasId : openCanvasId === null && canvas.path === props.openCanvasPath) return <div className="marker"><span><ArrowUpRight aria-hidden="true" />{`Moved here from ${props.project} Overview`}</span></div>;
        return <div className="marker"><span><ArrowUpRight aria-hidden="true" />{listed ? `Moved to ${name}` : `Moved to ${name} · No longer in ${props.project}`}</span>
          <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="trigger" disabled={!listed} onClick={() => latest.current.onOpenCanvas(canvas)}>Open</button></div>;
      }
    }
  };

  return <Actions.Provider value={context}><ReplyCanvasContext.Provider value={replyCanvas}><CopyFailed.Provider value={copyFailed}><div className="conversation-thread">
    {props.thumbnails && <CardThumbnails hub={props.thumbnails.hub} root={props.thumbnails.root} banners={cardBanners(items, rows, props.canvasListed)} scroller={scroller} onImages={setImages} />}
    <div className="thread-scroll doan-scroll" ref={scroller} onScroll={onScroll}>
      <div className="thread">{stacks(drawn).map(run => run.length === 1 && run[0]!.kind !== "canvasCard"
        ? <ThreadEntry key={run[0]!.key} entry={run[0]!} deps={depsOf(run[0]!)} draw={item} />
        // A run of cards stacks closer than thread items do (the draft's gap); each card stays its own item.
        : <div key={`stack:${run[0]!.key}`} className="thread-item"><div className="canvas-cards">{run.map(card => <ThreadEntry key={card.key} entry={card} deps={depsOf(card)} draw={item} />)}</div></div>)}
        {props.turn && settled.shown.kind !== "none" && settled.shown.kind !== "waiting" &&
          <div className="thread-item"><TurnIndicator text={props.turn.label ?? turnText(settled.shown, p)} at={props.turn.at} provider={provider} visibility={props.visibility} /></div>}
        {props.card && <div className="thread-item"><CommandCardNotice card={props.card} onAction={target => latest.current.onCardAction?.(target)} onDismiss={() => latest.current.onCardDismiss?.()} /></div>}
        {line && <div className="thread-item" data-item={BACKGROUND_KEY}><div className="bg-line">
          <Terminal className="bg-icon" aria-hidden="true" /><span className="bg-text">Background work is still running. It stops when you send your next message or press Stop.</span>
          {/* aria-disabled rather than disabled while stopping, so a keyboard press keeps focus on it. */}
          <button type="button" className="doan-button bg-stop" data-ui-size="xs" data-ui-variant="subtle" aria-label={line.stopping ? "Stopping background work" : "Stop background work"}
            aria-disabled={line.stopping || undefined} data-disabled={line.stopping ? "" : undefined} onClick={() => stopLine(line.turnId, line.stopping)}>
            {line.stopping ? <span className="doan-spinner" aria-hidden="true" /> : <CircleStop aria-hidden="true" />}{line.stopping ? "Stopping" : "Stop"}</button>
        </div></div>}</div>
    </div>
    {behind && <button type="button" className="doan-button jump-latest" data-ui-size="sm" data-ui-variant="panel" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest</button>}
    <div className="sr-only" role="status">{copied ? "Copied" : phaseText(drawn, items, provider, settled.shown, line !== null)}</div>
  </div></CopyFailed.Provider></ReplyCanvasContext.Provider></Actions.Provider>;
};

