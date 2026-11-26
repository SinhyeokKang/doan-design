import { createContext, forwardRef, Fragment, memo, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type Ref, type RefObject } from "react";
import { flushSync } from "react-dom";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, ArrowUpRight, Ban, Check, ChevronDown, CircleStop, Copy, Eye, FileText, Folder, Forward, Frame, LayoutGrid, MapPin, PanelsTopLeft, Pencil, PencilSparkles, SquareMousePointer, Terminal, Zap } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor, Canvas, EditLines } from "../main/conversation/types";
import { editHeadName, editLinesLabel } from "./editLinesLabel";
import type { QuestionAnswerInput } from "../main/conversation/question";
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
import { focusAfter, type FocusAction } from "./composerRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { isCut, NameTip } from "./NameTip";
import { CommandCardNotice } from "./ComposerParts";
import type { CommandCard, CommandCardTarget } from "./commandView";
import { handoffMetaView, handoffNameTip } from "./handoffView";
import { useThumbnails, type ThumbnailHub, type ThumbnailState } from "./thumbnails";
import { providerLogo, sentFileView, splitRequest } from "./homeComposer";
import { replyUrlTransform } from "./replyUrlTransform";
import { EMPTY_QUESTION_DRAFT, questionDraft, questionInput, type QuestionDraft, type QuestionDraftAction } from "./questionDraft";
import { AnswerPopover, popoverCramped, popoverFloor, type AskItem } from "./AnswerPopover";
import { useActivationFocus } from "./activationFocus";
import type { VisibleCalls } from "./visibleClock";
import { anchorParts, pendingAsks, questionLines, sameItem, scrollFollow, waitsForPerson, type ActivityStep, type MessagePart, type ThreadItem, type TurnEnd } from "./threadItems";
import { entering, FOLLOW_START, followBand, followResize, followStep, judgedBehind, nextFollow, revealBoundary, revealStep, timeMs, WHEEL_HOLD_MS, type FollowEvent, type FollowState, type LocalSend, type RevealPhase } from "./threadMotion";
import { bubbleBlocks, type BubbleList } from "./composerLists";
import { activityRun, backgroundLine, drawingCards, elapsedText, settle, SETTLE_MS, turnAnnouncement, turnText, type Settled, type ThreadTurn, type TurnStatus } from "./turnStatus";

// The host reads the history, merges live events and passes threadItems' result; links, copying and every action go back
// through callbacks, so the thread never reaches main itself.

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
  // Whether a promotion marker's canvas, a canvas card's canvas or handoff target, or a received handoff's source is still listed
  // (found by ID).
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
  // The answer popover's fold, kept by the host's store per conversation: whether it is collapsed over these waiting
  // requests, collapsing over them, and opening (which also clears a fold left when nothing waits).
  popoverCollapsed?(waiting: readonly string[]): boolean;
  onCollapse?(waiting: readonly string[]): void;
  onExpand?(): void;
  onStop(): void;
  onEditAndResend(): void;
  onSignIn(): void;
  onRetry(): void;
  // The read error's Retry: running while its read is out (the notice stays), failures the Retries that failed in a row.
  retry?: ListRetry | undefined;
  onOpenCanvas(canvas: Canvas): void;
  // A canvas card's or received handoff's Open: that canvas with its panel on the given conversation, or the canvas alone
  // for a canvas card without a started handoff. Without it neither offers Open.
  onOpenHandoff?(canvas: Canvas, conversationId?: string): void;
  // A received handoff from the Overview (a project conversation's handoff): Open shows its source conversation in the
  // root's Overview. Without it that handoff offers no Open.
  onOpenOverview?(conversationId: string): void;
  // Whether the source conversation of a received handoff from the Overview still exists; absent, it counts as there.
  conversationListed?(conversationId: string): boolean;
  // Only https links reach this; main checks again.
  onOpenLink(url: string): void;
  onCopy(text: string): Promise<boolean>;
  // Shortens a sent folder's path in its tooltip to ~; null or absent shows it whole.
  homeDirectory?: string | null;
  // The canvas panel's: a sent message's chips show their target on the canvas; without it they are plain chips. Settles with
  // how the locate ended; only "missing" shows "No longer in the canvas".
  onLocate?(anchor: Anchor): Promise<LocateOutcome>;
  locateDisabled?: boolean;
  // The conversation's Doan connection is at its usage limit until this reset (limitReset.ts resetTimeText): the last
  // turn's usage-limit end says messages sent now go out then.
  limitResets?: string | null;
  // The last turn's own message waits in the queue for the reset, so Edit and resend would send it twice.
  resendHidden?: boolean;
  // The open canvas's frames, which name a frame chip by its current title; undefined while it has no layout.
  frames?: readonly FrameName[] | undefined;
  // Pressing a `doan:` reply chip asks the host; it settles with the locate's outcome when the chip pointed into the open
  // canvas, so "missing" shows the note under the reply. Without it reply chips are plain chips.
  onReplyChip?(link: ReplyAnchor): Promise<LocateOutcome | null>;
  // The id of the canvas the thread belongs to (the canvas panel's), null in the Overview. A chip into it is named from
  // `frames` while the canvas has a layout and follows `locateDisabled`; every other chip names its canvas.
  openCanvasId?: string | null;
  openCanvasPath?: string;
  // The canvas rows of the conversation's root, which name another canvas's chips and that canvas, and give the canvas
  // cards their meta.
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
  // The card of a built-in command Doan does not run, sent from this conversation's composer, at the thread's end for this run.
  card?: CommandCard | null;
  onCardAction?(target: CommandCardTarget): void;
  onCardDismiss?(): void;
  // Messages this window sent (conversationStore localSends): the history's message for one enters with the rise. The
  // thread hands back the marks it drew a message for, which the store then drops.
  localSends?: readonly LocalSend[];
  onSpendSends?(marks: readonly LocalSend[]): void;
  // Main is stopping the turn: a reply still revealing shows whole at once.
  stopping?: boolean;
}
// focusItem: the request the answer popover shows (its chosen or first option, its answer input, or a permission request's
// first choice), opening the popover first, or after a handoff's move the received handoff's group itself. False when the
// item has no such control drawn.
export interface ConversationThreadHandle { scrollToItem(key: string): void; focusItem(key: string): boolean }
const ENTRY_FOCUS = ":is([data-entry], .ap-bar)";

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

// The locate note shows for 4 s or until the next action; the result arrives after the click or Enter that asked, so these listeners see
// only later input. A scroll of `scroller` counts too, or the note would point at another line.
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

// Codes without their own copy read as an unexpected stop. resend: false when the turn never began (body "" draws no second
// line). resets: the live usage-limit reset, last turn only; it wins over the time Claude's detail names.
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
// The text a reply received, while it reveals only part of it; null otherwise.
const Received = createContext<string | null>(null);
// The fenced code block starting at `at` in `text`, as far as it arrived; null when no fence starts there.
export function codeToCopy(text: string, at: number): string | null {
  const open = /^( {0,3})(`{3,}|~{3,})[^\n]*\n/.exec(text.slice(at));
  if (!open) return null;
  const fence = open[2]!, indent = new RegExp(`^ {0,${open[1]!.length}}`), lines: string[] = [];
  for (const row of text.slice(at + open[0].length).split("\n")) {
    const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(row)?.[1];
    if (close && close[0] === fence[0] && close.length >= fence.length) break;
    lines.push(row.replace(indent, ""));
  }
  return lines.join("\n").replace(/\n$/, "");
}
function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: string; children?: unknown[] };
  return n.type === "text" ? n.value ?? "" : (n.children ?? []).map(textOf).join("");
}
// A pointer press does not take focus, so copying leaves the composer's focus, selection and IME composition alone;
// keyboard activation still focuses the button first.
export function CodeBlock({ node, children }: { node: unknown; children?: ReactNode }) {
  const { copy } = useContext(Actions), reply = useContext(ReplyId), received = useContext(Received);
  // A revealing reply draws part of its code; Copy takes the block's whole received code from the same offset.
  const code = () => {
    const at = (node as { position?: { start?: { offset?: number } } } | null)?.position?.start?.offset;
    return (received !== null && at !== undefined ? codeToCopy(received, at) : null) ?? textOf(node).replace(/\n$/, "");
  };
  return <div className="md-code"><pre className="doan-scroll">{children}</pre>
    <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button" data-ui-size="xs" aria-label="Copy code" onMouseDown={event => event.preventDefault()} onClick={() => copy(code(), reply)}><Copy aria-hidden="true" /></button></TooltipTrigger>
      <TooltipContent>Copy code</TooltipContent></Tooltip></div>;
}
function Link({ href, children }: { href: string | undefined; children?: ReactNode }) {
  const { openLink } = useContext(Actions);
  const url = httpsUrl(href);
  if (!url) return <span>{children}</span>;
  return <a href={url} onClick={event => { event.preventDefault(); openLink(url); }}>{children}</a>;
}
const CHIP_ICONS = { frame: Frame, element: SquareMousePointer, point: MapPin } as const;

// The link's text is agent output and never names the chip. A chip into the open canvas takes its frame titles while it has a
// layout; otherwise the titles of the one list row with the link's canvas id, else the id itself.
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
// Only a chip into the open canvas follows locateDisabled and can show the note; another canvas's chip can always be pressed.
// Its canvas name is drawn apart, so only the label ellipsizes.
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

// Agent output is untrusted (ARCHITECTURE §3 'Selection'): no raw HTML (react-markdown escapes it; no rehype-raw), no images,
// https links only; a `doan:` link is a reply chip or text.
const COMPONENTS: Components = {
  a: ({ href, children }) => href?.startsWith("doan:") ? <ReplyLink href={href}>{children}</ReplyLink> : <Link href={href}>{children}</Link>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  pre: ({ node, children }) => <CodeBlock node={node}>{children}</CodeBlock>,
  table: ({ children }) => <div className="md-table doan-scroll"><table>{children}</table></div>,
};
const PLUGINS = [remarkGfm];
// remark-gfm's footnotes take fixed ids: clobberPrefix renames the notes, and the label (which every reference names in
// aria-describedby) is renamed here, so two messages never share an id.
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
// The streaming caret goes inside the last text block: beside the blocks, .msg-agent's flex column would put it on its own
// line. A code block's text ends in the line break mdast-util-to-hast adds, so the caret goes before it.
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
// Wraps the text of each run still fading in a span at its age's opacity. Offsets come from the hast positions, so text
// whose source differs from what it draws (escapes, entities, inline code's backticks) fades a few characters off.
function fadeRuns(runs: readonly RevealRun[], now: number, source: string) {
  const young = runs.filter(run => now - run.at < FADE_MS);
  const offset = (node: HastNode) => (node as { position?: { start?: { offset?: number } } }).position?.start?.offset;
  return () => (root: HastNode) => {
    if (young.length === 0) return;
    // A code element carries its fence's position, so inside pre it takes the pre's content start instead.
    const walk = (node: HastNode, inherited: number | null, inPre = false) => {
      let start = inPre ? inherited : offset(node) ?? inherited;
      // A fenced block's text starts on the line after its fence.
      if (node.tagName === "pre" && start !== null) { const line = source.indexOf("\n", start); start = line < 0 ? null : line + 1; }
      const kids = node.children;
      if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i]!;
        if (child.type !== "text") { walk(child, child.tagName === "code" ? start : null, node.tagName === "pre"); continue; }
        const at = offset(child) ?? start, value = child.value ?? "";
        if (at === null || at + value.length <= young[0]!.from) continue;
        const parts: HastNode[] = [];
        let cut = 0;
        for (const run of young) {
          const from = Math.min(Math.max(run.from - at, cut), value.length), to = Math.min(Math.max(run.to - at, from), value.length);
          if (to <= from) continue;
          if (from > cut) parts.push({ type: "text", value: value.slice(cut, from) });
          // A code line's break stays outside, so the streaming caret goes before it, on that line.
          const piece = value.slice(from, to), end = piece.endsWith("\n") ? piece.length - 1 : piece.length;
          if (end > 0) parts.push({ type: "element", tagName: "span", properties: { className: ["reveal-run"], style: `opacity:${fadeOpacity(now - run.at).toFixed(3)}` }, children: [{ type: "text", value: piece.slice(0, end) }] });
          if (end < piece.length) parts.push({ type: "text", value: "\n" });
          cut = to;
        }
        if (cut === 0) continue;
        if (cut < value.length) parts.push({ type: "text", value: value.slice(cut) });
        kids.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    };
    walk(root, null);
  };
}
const NO_RUNS: readonly RevealRun[] = [];
const MarkdownText = memo(function MarkdownText({ text, prefix, streaming, runs = NO_RUNS, now = 0 }: { text: string; prefix: string; streaming: boolean; runs?: readonly RevealRun[]; now?: number }) {
  const plugins = [labelPrefix(prefix), ...runs.length ? [fadeRuns(runs, now, text)] : [], ...streaming ? [streamingCaret] : []];
  return <Markdown remarkPlugins={PLUGINS} rehypePlugins={plugins} remarkRehypeOptions={{ clobberPrefix: `${prefix}-` }} components={COMPONENTS} urlTransform={replyUrlTransform}>{text}</Markdown>;
});

// The reveal's fade runs over --time-thread-enter with a cubic ease-out; the opacity is drawn from each run's
// age, so a render for any other reason never restarts a fade.
export const FADE_MS = 400;
export function fadeOpacity(age: number): number {
  const t = Math.min(1, Math.max(0, age / FADE_MS));
  return 1 - (1 - t) ** 3;
}
// A run of text shown in one frame (at), fading in. arrivals: when the text grew to each length, for the oldest hidden
// character's age. doneAt: when message.done came, for the finishing tail. at: the last frame.
export interface RevealRun { from: number; to: number; at: number }
export interface RevealState { shown: number; runs: readonly RevealRun[]; arrivals: readonly { end: number; at: number }[]; doneAt: number | null; at: number | null }
// flush: a Stop, a failure or an interrupt (an end item follows), any other item after the reply, a selection in it.
export type RevealMode = "streaming" | "done" | "flush";
export const revealStart = (shown: number): RevealState => ({ shown, runs: [], arrivals: [], doneAt: null, at: null });
export function revealMode(streaming: boolean, flush: boolean): RevealMode {
  return flush ? "flush" : streaming ? "streaming" : "done";
}
// One frame of a reply's reveal. Reduced motion and a flush show the text received whole, with no new fade; a large
// gap since the last frame (a hidden window) catches up in one frame.
export function revealFrame(state: RevealState, text: string, mode: RevealMode, now: number, reduced: boolean): RevealState {
  const target = text.length, runs = state.runs.filter(run => now - run.at < FADE_MS);
  if (reduced) return { shown: target, runs: [], arrivals: [], doneAt: state.doneAt, at: now };
  const last = state.arrivals.at(-1)?.end ?? state.shown;
  const arrivals = [...state.arrivals.filter(arrival => arrival.end > state.shown), ...target > last ? [{ end: target, at: now }] : []];
  const doneAt = mode === "done" ? state.doneAt ?? now : null;
  let shown = state.shown;
  if (shown < target) {
    if (mode === "flush") shown = target;
    else {
      const hidden = arrivals.find(arrival => arrival.end > state.shown);
      const phase: RevealPhase = mode === "done" ? { finishing: now - doneAt! } : "streaming";
      const step = revealStep(state.shown, target, hidden ? now - hidden.at : 0, state.at === null ? 16 : now - state.at, phase);
      shown = revealBoundary(text, state.shown, step, mode === "done");
    }
  }
  const grew = mode !== "flush" && shown > state.shown;
  return { shown, runs: grew ? [...runs, { from: state.shown, to: shown, at: now }] : runs, arrivals: arrivals.filter(arrival => arrival.end > shown), doneAt, at: now };
}
const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// The thread's motion its replies share. revealed: the rAF time of a frame that showed more, in which the follow sticks
// to the bottom instead of easing.
interface ThreadMotion { revealed(at: number): void; reduced(): boolean }
const Motion = createContext<ThreadMotion>({ revealed: () => {}, reduced: prefersReduced });
// A reply mounts at `start` (replyStart). Each frame renders the whole reply synchronously (flushSync), so the follow
// measures its new height before the frame paints.
function useReveal(text: string, streaming: boolean, flush: boolean, start: number, host: RefObject<HTMLElement | null>): { length: number; runs: readonly RevealRun[]; now: number } | null {
  const motion = useContext(Motion);
  const [state, setState] = useState(() => revealStart(start));
  const [selected, setSelected] = useState(false);
  const mode = revealMode(streaming, flush || selected), reduced = motion.reduced();
  // Shown whole now, so a later reveal goes on from the end instead of drawing less.
  if ((mode === "flush" || reduced) && state.shown < text.length) setState({ ...state, shown: text.length, arrivals: [] });
  // The loop's own state between renders (a frame that shows nothing new renders nothing); a state set here wins.
  const current = useRef(state), adopted = useRef(state), latest = useRef({ text, mode });
  if (adopted.current !== state) { adopted.current = state; current.current = state; }
  latest.current = { text, mode };
  const fading = (at: number | null) => at !== null && state.runs.some(run => at - run.at < FADE_MS);
  const active = mode !== "flush" && !reduced && (streaming || state.shown < text.length || fading(state.at));
  useEffect(() => {
    if (!active) return;
    let frame = requestAnimationFrame(function tick(now) {
      const before = current.current, next = revealFrame(before, latest.current.text, latest.current.mode, now, motion.reduced());
      current.current = next;
      const young = next.runs.some(run => now - run.at < FADE_MS);
      if (next.shown !== before.shown) motion.revealed(now);
      if (next.shown !== before.shown || young || before.runs.length !== next.runs.length) flushSync(() => setState(next));
      frame = latest.current.mode === "streaming" || next.shown < latest.current.text.length || young ? requestAnimationFrame(tick) : 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [active, motion]);
  // Rendering every frame would undo a selection inside the reply, so selecting shows it whole.
  useEffect(() => {
    if (!active || selected) return;
    const change = () => {
      const selection = document.getSelection(), node = host.current;
      if (node && selection && !selection.isCollapsed && (node.contains(selection.anchorNode) || node.contains(selection.focusNode))) setSelected(true);
    };
    document.addEventListener("selectionchange", change);
    return () => document.removeEventListener("selectionchange", change);
  }, [active, selected, host]);
  if (mode === "flush" || reduced || (!streaming && state.shown >= text.length && !fading(state.at))) return null;
  return { length: Math.min(state.shown, text.length), runs: state.runs, now: state.at ?? 0 };
}
// A reply, and under it a reply chip's "No longer in the canvas" note. className and children: the received handoff's
// bubble is the same Markdown under its meta line. flush: show what arrived whole.
function AgentMessage({ text, streaming, flush = false, start = text.length, className = "msg-agent md", children }: { text: string; streaming: boolean; flush?: boolean; start?: number; className?: string; children?: ReactNode }) {
  const host = useRef<HTMLDivElement | null>(null);
  const reveal = useReveal(text, streaming, flush, start, host), prefix = useId();
  const [noted, show] = useLocateNote();
  const [chip, setChip] = useState<string | null>(null);
  const shownFor = noted ? chip : null;
  const note = useMemo(() => ({ shownFor, show: (key: string) => { setChip(key); show(); } }), [shownFor]);
  const copyFailed = useContext(CopyFailed) === prefix;
  return <ReplyId.Provider value={prefix}><ReplyNote.Provider value={note}>
    {/* One tree whether or not it reveals: a changed parent would remount the Markdown and drop a selection in it. */}
    <div className={className} ref={host}>{children}<Received.Provider value={reveal ? text : null}>
      <MarkdownText text={reveal ? text.slice(0, reveal.length) : text} prefix={prefix} streaming={streaming} runs={reveal?.runs ?? NO_RUNS} now={reveal?.now ?? 0} /></Received.Provider></div>
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
// The card stays locked until question.resolved folds it. A stale refusal means main settled the request (or will by its own
// expiry), so it waits without an error line; any other refusal unlocks the card with its choices kept.
export async function settleQuestionSend(send: () => Promise<void | { error: string }> | void, edit: (action: QuestionDraftAction) => void): Promise<void> {
  const refusal = await answerRefusal(send);
  if (refusal !== null && refusal !== "stale") edit({ type: "failed" });
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

// The marker column in ch, without measuring: markers draw in plain figures, so each digit counts its own Geist width
// (a "0" is 1ch) and ". " 0.7ch, each rounded up so the column never cuts into the text.
const DIGIT_CH: Record<string, number> = { "0": 1, "1": 0.58, "2": 0.94, "3": 0.93, "4": 0.93, "5": 0.95, "6": 0.9, "7": 0.79, "8": 0.92, "9": 0.9 };
function markColumn(block: BubbleList): number {
  if (block.list !== "ol") return 0;
  const width = (marker: string) => [...marker.slice(0, -2)].reduce((sum, digit) => sum + (DIGIT_CH[digit] ?? 1), 0.7);
  return Math.round(Math.max(...block.items.map(item => width(item.marker))) * 100) / 100;
}

// A sent message: its bubble, attachments and the chip locate note. One Send now has in flight ends with a Sending line and
// has no actions.
function UserMessage({ entry, frames, disabled, onLocate, home, entryAge: age }: { entry: Extract<ThreadItem, { kind: "user" }>; frames: readonly FrameName[] | undefined; disabled: boolean; onLocate: ConversationThreadProps["onLocate"]; home: string | null; entryAge: number | null }) {
  const base = useId();
  // How far its entry had run when this element mounted: a history message replacing the Sending one goes on from there.
  // Under a frame is this render's own delay, not an entry already under way.
  const [entryAge] = useState(() => age === null ? null : age < 16 ? 0 : Math.round(age));
  const enter = entryAge !== null && entryAge < FADE_MS;
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
  // Lists are role="list" blocks, not ul/ol: Chromium leaves an ul/ol marker out of copied text, and the person copies what
  // they sent, markers and depth spaces included.
  const list = (block: BubbleList, depth: number, mark = markColumn(block)): ReactNode => <div className="bubble-list" role="list">{block.items.map((item, i) => <div key={i} className="bubble-item" role="listitem">
    {item.lead && <span className="list-depth" data-depth={depth}>{item.lead}</span>}
    <span className="list-mark" data-kind={block.list} data-mark={mark}>{item.marker}</span>
    <span className="bubble-item-body" data-depth={depth} data-mark={mark}>{inline(item.parts)}</span>
    {item.children.map((child, n) => <Fragment key={n}>{list(child, depth + 1)}</Fragment>)}
  </div>)}</div>;
  return <div className={enter ? "msg-user thread-enter" : "msg-user"} style={enter && entryAge ? { animationDelay: `-${entryAge}ms` } : undefined}>
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
// The meta line: folder · frames · the modified time. A drawing card keeps the line, empty or not, so it is as
// tall as once drawn.
function CardMeta({ meta, keep }: { meta: CanvasCardMeta; keep: boolean }) {
  const time = meta.edited;
  // A deep folder can be wider than the column: it shrinks and cuts, its full path in the tooltip while cut.
  const parts = [...(meta.folder === null ? [] : [<NameTip text={meta.folder}><span className="cc-folder">{meta.folder}</span></NameTip>]),
    ...(meta.frames === null ? [] : [<span>{meta.frames}</span>]),
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
      <span className="cc-text"><CardName name={view.name} /><span className="cc-status">{view.status}</span><CardMeta meta={meta} keep={drawing} /></span>
      {open && onOpen && <button type="button" className="doan-button cc-open" data-ui-size="sm" data-ui-variant="subtle" aria-label={open.label} onClick={() => onOpen(open.canvas, open.conversationId)}>Open</button>}
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
// A long name is cut in the middle, keeping its extension, with the full name in the tooltip. The title row's width is set
// by the card's grid column, not by the name, so measuring it never loops.
function CardName({ name }: { name: string }) {
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
  return <span className="cc-title" ref={title}><PanelsTopLeft className="cc-kind" aria-hidden="true" />
    {shown === name ? label : <Tooltip><TooltipTrigger asChild>{label}</TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>}</span>;
}
// The meta name's cut: none while its box is as wide as the whole name's laid-out text (whole), since the measured width
// is rounded up and the box's down, and a name that fits by a fraction would otherwise be cut. The slack is under one
// 1/64 px layout step.
export function metaNameKeep(name: string, width: number, whole: number, measure: (text: string) => number): number | null {
  return width >= whole - 0.01 ? null : fitKeep(name, Math.floor(width), measure);
}
// The source's name on the meta line, cut in the middle as a card's name is. A hidden copy of the whole name keeps the
// line's widest size, so the bubble can grow back as the thread widens and the cut never feeds its own width.
function MetaName({ name, title }: { name: string; title: string | null }) {
  const node = useRef<HTMLButtonElement | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  useLayoutEffect(() => {
    const box = node.current, shown = box?.firstElementChild, full = box?.lastElementChild;
    if (!box || !(shown instanceof HTMLElement) || !full || typeof ResizeObserver === "undefined") return;
    // A range over the whole copy's text reads its laid-out width; the copy's own box is clipped to the name's box.
    const style = getComputedStyle(shown), range = document.createRange();
    range.selectNodeContents(full);
    const observer = new ResizeObserver(() => setKeep(metaNameKeep(name, box.getBoundingClientRect().width, range.getBoundingClientRect().width, text => textWidth(text, style))));
    observer.observe(box);
    return () => observer.disconnect();
  }, [name]);
  const timeHidden = () => {
    const time = node.current?.parentElement?.querySelector("time");
    return !!time && getComputedStyle(time).display === "none";
  };
  return <Tooltip open={tip !== null} onOpenChange={open => setTip(open ? handoffNameTip(name, title, { cut: isCut(node.current), timeHidden: timeHidden() }) : null)}>
    <TooltipTrigger asChild ref={node}><span className="ho-name"><span className="ho-cut">{keep === null ? name : middleCut(name, keep)}</span><span className="ho-full" aria-hidden="true">{name}</span></span></TooltipTrigger>
    <TooltipContent>{tip}</TooltipContent>
  </Tooltip>;
}
// The received handoff: the person's bubble with a meta line naming the source, then the earlier agent's text as Markdown.
// It takes focus after a move, so it is a labelled group; the time is its description, hidden on screen so it is read once.
// timeId: the description's id, unique in the thread.
export function HandoffBubble({ entry, project, now, timeId, canvasListed, conversationListed, onOpen, onOpenOverview }: { entry: Extract<ThreadItem, { kind: "handoffCard" }>; project: string; now: number;
  timeId: string; canvasListed(canvas: Canvas): boolean; conversationListed?: ((conversationId: string) => boolean) | undefined;
  onOpen?: ((canvas: Canvas, conversationId: string) => void) | undefined; onOpenOverview?: ((conversationId: string) => void) | undefined }) {
  const source = entry.origin.canvas, conversationId = entry.origin.conversationId;
  const view = handoffMetaView(entry.origin, project, source ? canvasListed(source) : conversationListed?.(conversationId) ?? null, entry.at, now);
  const open = view.open === null ? null : source ? onOpen && (() => onOpen(source, conversationId)) : onOpenOverview && (() => onOpenOverview(conversationId));
  const Kind = view.kind === "canvas" ? PanelsTopLeft : LayoutGrid, time = view.time;
  return <div className="msg-user" role="group" aria-label={view.label} aria-describedby={time ? timeId : undefined} tabIndex={-1} data-entry="">
    <AgentMessage text={entry.text} streaming={false} className="bubble md from-agent">
      <div className="ho-meta"><Forward aria-hidden="true" /><Kind aria-hidden="true" /><MetaName name={view.name} title={time?.title ?? null} />
        <span className="sep" aria-hidden="true">·</span>
        {time ? <Tooltip><TooltipTrigger asChild><time dateTime={time.dateTime} aria-hidden="true">{time.text}</time></TooltipTrigger><TooltipContent>{time.title}</TooltipContent></Tooltip>
          : <span className="ho-gone">{view.reason}</span>}
        {open && <button type="button" className="doan-button" data-ui-size="xs" data-ui-variant="panel" aria-label={view.open ?? undefined} onClick={open}>Open</button>}
      </div>
    </AgentMessage>
    {time && <span id={timeId} hidden>{time.words}</span>}
  </div>;
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
// The banners the thread's cards draw with a listed canvas's row, by card key. A card still drawing shows no image, so
// its canvas, mid-write, is not asked for.
export function cardBanners(items: readonly ThreadItem[], rows: readonly CanvasRow[], listed: (canvas: Canvas) => boolean,
  drawing: (item: Extract<ThreadItem, { kind: "canvasCard" }>) => boolean): CardBanner[] {
  return items.flatMap(item => {
    const canvas = item.kind === "canvasCard" && !drawing(item) ? cardCanvas(item, rows) : undefined;
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
// received handoff began did not (the earlier agent wrote it), so its text never becomes the person's draft.
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
// Changes only with the settled stage kind. It alone announces the background line (the line has no live region), Stopping included.
// `ended`: history's cards, since a Stop ends their spinners before the turn's end arrives, and the count waits for it.
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

// The turn indicator has no live region or focus. Its own timer redraws only this line each second, so the thread's items do not run every
// second; it stops while hidden and counts again from `at` (POSTMORTEM 2026-10-25: document visibility is not native visibility).
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

// Where a reply's reveal starts: at the text it has when it mounts again (an open, a folded panel unfolding, a switch
// back), so it never types again; at 0 when it first appears while the thread is open.
export function replyStart(prev: readonly ThreadItem[], entry: Extract<ThreadItem, { kind: "agent" }>): number {
  return prev.length > 0 && !prev.some(item => item.key === entry.key) ? 0 : entry.text.length;
}
// A reply shows whole once something follows it: a later item (a card it would push away, an activity row, an end), a
// notice under the thread, or a Stop.
export function flushesReply(entry: ThreadItem, drawn: readonly ThreadItem[], after: { stopping: boolean; notice: boolean }): boolean {
  return after.stopping || after.notice || entry.key !== drawn.at(-1)?.key;
}

// When each user message this thread drew began its entry (entering), by key. A history message that replaces a
// Sending one drawn in the previous render (same words and chips) takes that one's start, so the entry runs once.
export function entryTimes(prev: readonly ThreadItem[], items: readonly ThreadItem[], localSends: readonly LocalSend[], times: ReadonlyMap<string, number>, now: number): ReadonlyMap<string, number> {
  const fresh = entering(prev, items, localSends), drawn = new Set(prev.map(item => item.key));
  const added: [string, number][] = [];
  for (const key of fresh) if (!times.has(key)) added.push([key, now]);
  for (const item of items) {
    if (item.kind !== "user" || item.sending || drawn.has(item.key) || times.has(item.key) || fresh.has(item.key)) continue;
    const from = prev.find(q => q.kind === "user" && q.sending === true && times.has(q.key) && sameItem(q.parts, item.parts) && sameItem(q.anchors, item.anchors));
    if (from) added.push([item.key, times.get(from.key)!]);
  }
  return added.length ? new Map([...times, ...added]) : times;
}

// The thread item or the popover (its data-item key) holding focus, if focus is inside the thread.
function focusedItem(root: HTMLElement | null): string | null {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!root || !active || !root.contains(active)) return null;
  return active.closest("[data-item]")?.getAttribute("data-item") ?? null;
}

// The current frame's time, which a ResizeObserver callback shares with that frame's rAF callbacks.
const frameTime = () => typeof document !== "undefined" ? document.timeline.currentTime : null;
const NO_SENDS: readonly LocalSend[] = [];
const JUMP_ROOM = 56;
// Keys that edit text or press a control there rather than scroll the thread.
const OWN_KEYS = "input, textarea, select, button, [contenteditable]";

export const ConversationThread = forwardRef<ConversationThreadHandle, ConversationThreadProps>(function ConversationThread(props, ref) {
  return <ThreadBody key={props.conversationId} {...props} handle={ref} />;
});

// The host re-renders the thread on every streamed delta, so an item draws again only when its data or deps (compared by
// value) changed. `draw` is left out: a kept item's handlers reach the host through ThreadBody's `latest`.
export const ThreadEntry = memo(function ThreadEntry({ entry, draw }: { entry: ThreadItem; deps: readonly unknown[]; draw: (entry: ThreadItem) => ReactNode }) {
  return <div className="thread-item" data-item={entry.key}>{draw(entry)}</div>;
}, (a, b) => sameItem(a.deps, b.deps) && sameItem(a.entry, b.entry));

const ThreadBody = function ThreadBody({ handle: ref, ...props }: ConversationThreadProps & { handle: Ref<ConversationThreadHandle> }) {
  const { items, provider } = props;
  const latest = useRef(props);
  latest.current = props;
  const base = useId();
  const scroller = useRef<HTMLDivElement | null>(null), root = useRef<HTMLDivElement | null>(null);
  // content: the thread's own height; inset: the popover's height, kept clear at the thread's end (--ap-inset).
  const distance = useRef(0), opened = useRef(false), contentHeight = useRef(0), inset = useRef(0);
  // The follow (threadMotion nextFollow): easeTo is the bottom an eased follow heads for, wrote the scrollTop it last
  // wrote, so a scroll event of its own is told from the person's.
  const follow = useRef<FollowState>(FOLLOW_START), easeTo = useRef<number | null>(null), wrote = useRef<number | null>(null);
  // seenTop: the scrollTop the follow last read, to tell a browser clamp from the person's move. keyDown: a scroll key
  // pressed anywhere outside a field, which becomes this thread's input only if this thread then scrolls.
  const seenTop = useRef(0), keyDown = useRef<{ key: string; at: number; top: number } | null>(null);
  const loop = useRef(0), lastFrame = useRef<number | null>(null), revealedAt = useRef(-Infinity);
  const motion = useRef<ThreadMotion>({ revealed: at => { revealedAt.current = at; }, reduced: prefersReduced }).current;
  // Set only on a change: the follow writes a scroll every frame, and a same-value set can still render the thread.
  const [behind, setBehindState] = useState(false), behindNow = useRef(false);
  // Jump to latest rides above the popover; where the popover leaves less than its height and margins (32 + 2 × 12) in
  // the thread area, it would sit on the panel's head, so it stays away.
  const [jumpFits, setJumpFits] = useState(true);
  const setBehind = (value: boolean) => { if (behindNow.current !== value) { behindNow.current = value; setBehindState(value); } };
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  // From the hub at once: a thread remounted for another conversation draws its banners with the images already there.
  const [images, setImages] = useState<ReadonlyMap<string, ThumbnailState>>(() => props.thumbnails?.hub.items(props.thumbnails.root) ?? NO_IMAGES);
  // The card last answered, skipped or stopped here and the focusAfter rule for it: once that card folds, by any
  // status, its button is gone and focus moves on by the rule (ARCHITECTURE §7 'Renderer primitives' 'Thread focus').
  const folding = useRef<{ requestId: string; action: FocusAction } | null>(null);
  // A card can fold with no press here (the CLI cancels it or the turn ends); focus in it, or unsent Other text, moves on as
  // after an answer. Focus is read before this commit replaces the card; the drafts are the last commit's.
  const focusedKey = focusedItem(root.current);
  const shown = useRef<readonly { requestId: string; key: string; unsent: boolean }[]>([]);
  const stop = (requestId: string) => { folding.current = { requestId, action: { kind: "stopped" } }; latest.current.onStop(); };
  // Requests whose last answer did not reach main: the person chooses again. pressing: the option sent for a request,
  // which locks its others until main answers; a refusal unlocks it and opens a collapsed popover.
  const [unanswered, setUnanswered] = useState<ReadonlySet<string>>(new Set());
  const [pressing, setPressing] = useState<ReadonlyMap<string, string>>(new Map());
  const answer = (requestId: string, optionId: string) => {
    if (pressing.has(requestId)) return;
    folding.current = { requestId, action: { kind: "answered", requestId } };
    setPressing(current => new Map(current).set(requestId, optionId));
    setUnanswered(current => { if (!current.has(requestId)) return current; const next = new Set(current); next.delete(requestId); return next; });
    void answerReached(() => latest.current.onAnswer(requestId, optionId)).then(reached => {
      if (reached) return;
      setPressing(current => { const next = new Map(current); next.delete(requestId); return next; });
      setUnanswered(current => new Set(current).add(requestId));
      latest.current.onExpand?.();
    });
  };
  const draftOf = (requestId: string) => latest.current.questionDraft?.(requestId) ?? EMPTY_QUESTION_DRAFT;
  const editQuestion = (requestId: string, action: QuestionDraftAction) => latest.current.onQuestionDraft?.(requestId, action);
  const sendQuestion = (entry: Extract<ThreadItem, { kind: "question" }>, how: "answer" | "skip") => {
    const draft = draftOf(entry.requestId);
    if (draft.sending) return;
    const answer: QuestionAnswerInput = how === "skip" ? { outcome: "skipped" } : questionInput(entry.questions, draft);
    editQuestion(entry.requestId, { type: "sending", how });
    folding.current = { requestId: entry.requestId, action: { kind: "answered", requestId: entry.requestId } };
    void settleQuestionSend(() => latest.current.onAnswerQuestion ? latest.current.onAnswerQuestion(entry.requestId, answer) : Promise.resolve({ error: "unknown" }),
      action => { editQuestion(entry.requestId, action); if (action.type === "failed") latest.current.onExpand?.(); });
  };
  // The answer popover shows the earliest waiting request; its fold is the host's.
  const asks: AskItem[] = Array.isArray(items) ? items.filter(waitsForPerson) : [];
  const ask = asks[0] ?? null, waitingIds = asks.map(item => item.requestId);
  const collapsed = ask !== null && (props.popoverCollapsed?.(waitingIds) ?? false);
  const popoverNow = useRef<{ key: string | null; collapsed: boolean }>({ key: null, collapsed: false }), waitingNow = useRef(waitingIds);
  waitingNow.current = waitingIds;
  popoverNow.current = { key: ask?.key ?? null, collapsed };
  // Focus the popover takes once it draws as asked: open after an entry or the bar, at the new step after Next or Back,
  // or the bar after Collapse. A render before the host's fold or draft moved does not take it.
  const popoverFocus = useRef<{ key: string; open: boolean; step?: number } | null>(null);
  // The popover's running collapse or expand; a new one cancels it so two never fight over the height.
  const motions = useRef<Animation[]>([]);
  // Cancel events arrive a frame later, so the surface's clip is restored here and a run's handlers act only while it is
  // still the current one.
  const stopMotion = () => {
    for (const run of motions.current) run.cancel();
    motions.current = [];
    if (popover.current?.style.overflow === "hidden") popover.current.style.overflow = "";
  };
  // The head and buttons always show (popoverFloor): past the cap the popover rises, at most to the panel's top. Left off
  // while the height runs, which the overflow clip marks.
  const holdChrome = (node: HTMLElement) => {
    if (node.style.overflow === "hidden") return;
    const body = node.querySelector<HTMLElement>(":scope > .ap-body"), style = body ? getComputedStyle(body) : null;
    const chrome = [...node.querySelectorAll<HTMLElement>(":scope > .ap-head, :scope > .ap-actions, :scope > .ap-error, :scope > .ap-bar")].map(part => part.offsetHeight);
    const panel = node.closest(".doan-conv-panel, .ov-main"), area = node.parentElement;
    const room = panel && area ? area.getBoundingClientRect().bottom - panel.getBoundingClientRect().top : Infinity;
    const fit = { chrome, bodyPadding: style ? Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) : 0, room };
    const value = `${popoverFloor(fit)}px`, cramped = popoverCramped(fit);
    if (node.style.minHeight !== value) node.style.minHeight = value;
    if (node.hasAttribute("data-cramped") !== cramped) {
      node.toggleAttribute("data-cramped", cramped);
      // An expand's run holds the floor off, so focus may already be on a choice the cramped scroll now hides.
      const focused = document.activeElement;
      if (cramped && focused && node.contains(focused)) focused.scrollIntoView({ block: "nearest" });
    }
  };
  // The body and buttons fade out first, then the fold draws the bar and its height runs (the layout effect below).
  const collapse = (andThen: "bar" | "composer") => {
    if (!ask) return;
    const ids = waitingIds, key = ask.key, node = popover.current;
    const fold = () => {
      // A request that came during the fade keeps it open (the fade is undone); one that ended leaves the rest to fold.
      const now = waitingNow.current;
      if (now.some(id => !ids.includes(id))) { stopMotion(); return; }
      latest.current.onCollapse?.(now);
      // The bar drawn is the request shown now, which may not be the one pressed if that one ended during the fade.
      if (andThen === "bar") popoverFocus.current = { key: popoverNow.current.key ?? key, open: false };
    };
    // Esc hands focus over at once, so a key pressed during the fade never reaches a control that is fading out.
    if (andThen === "composer") handFocus(() => latest.current.onFocusComposer?.());
    if (!node || motion.reduced() || typeof node.animate !== "function") { fold(); return; }
    stopMotion();
    const duration = timeMs(getComputedStyle(node).getPropertyValue("--time-fast"));
    const fades = [...node.querySelectorAll(".ap-body, .ap-actions, .ap-error")].map(part => part.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: "forwards" }));
    motions.current = fades;
    void Promise.all(fades.map(fade => fade.finished)).then(fold, () => {});
  };
  const expand = (key: string) => { popoverFocus.current = { key, open: true }; latest.current.onExpand?.(); };
  const expandRef = useRef(expand);
  expandRef.current = expand;
  const moveStep = (entry: Extract<ThreadItem, { kind: "question" }>, action: QuestionDraftAction) => {
    const step = questionDraft(draftOf(entry.requestId), action).step;
    if (step === draftOf(entry.requestId).step) return;
    editQuestion(entry.requestId, action);
    popoverFocus.current = { key: entry.key, open: true, step };
  };
  // A new request shown, and a new request opening a collapsed popover, are read once; a request drawn from the history
  // at first is not.
  const [seen, setSeen] = useState<{ key: string | null; collapsed: boolean; count: number; announce: number }>({ key: null, collapsed: false, count: 0, announce: 0 });
  let announce = seen.announce;
  if (seen.key !== (ask?.key ?? null) || seen.collapsed !== collapsed || seen.count !== asks.length) {
    const changed = ask !== null && ask.key !== seen.key && (seen.key !== null || ask.seq > props.liveAfter);
    const reopened = ask !== null && ask.key === seen.key && seen.collapsed && !collapsed && asks.length > seen.count;
    if (changed || reopened) announce += 1;
    setSeen({ key: ask?.key ?? null, collapsed, count: asks.length, announce });
  }
  const focusIn = (key: string): boolean => {
    const control = root.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"] ${ENTRY_FOCUS}`);
    control?.focus({ preventScroll: true });
    // The thread does not scroll for it; a cramped popover's own scroll brings the choice out from under its head.
    if (control?.closest(".ap[data-cramped]")) control.scrollIntoView({ block: "nearest" });
    return !!control;
  };
  // The stage after settle is derived while rendering, so the indicator shows from the render the message enters. It belongs to
  // one turn: a next turn starts from nothing even when no render showed the earlier one's end.
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

  // Messages this window sent enter once, in the render they first show; a remount starts with nothing entering.
  const prevItems = useRef<readonly ThreadItem[]>([]), entered = useRef<ReadonlyMap<string, number>>(new Map());
  const renderedAt = performance.now();
  if (Array.isArray(items)) entered.current = entryTimes(prevItems.current, items, props.localSends ?? NO_SENDS, entered.current, renderedAt);
  const entryAge = (key: string) => { const at = entered.current.get(key); return at === undefined ? null : renderedAt - at; };
  useLayoutEffect(() => {
    if (!Array.isArray(items)) return;
    prevItems.current = items;
    const marks = latest.current.localSends ?? NO_SENDS;
    const spent = marks.filter(mark => items.some(item => item.kind === "user" && item.seq !== null && item.seq > mark.after &&
      sameItem(anchorParts(splitRequest(mark.text, item.attachments.length).body), item.parts)));
    if (spent.length) latest.current.onSpendSends?.(spent);
  }, [items]);

  // The follow: one rAF loop that eases toward the bottom and, after the person's wheel or scroll key, waits out its
  // inertia or animation before following again. Growth is seen by a ResizeObserver, since a revealing reply grows
  // without new items.
  const bottomOf = (node: HTMLElement) => node.scrollHeight - node.clientHeight;
  const bandOf = (node: HTMLElement) => followBand(node.clientHeight - inset.current);
  const write = (node: HTMLElement, top: number) => {
    node.scrollTop = top;
    wrote.current = seenTop.current = node.scrollTop;
    distance.current = bottomOf(node) - node.scrollTop;
  };
  // The person's scroll never shrinks the extent, so an extent now below the last scrollTop read means the browser
  // clamped it (content or the end inset shrank), even if growth since keeps the view off the bottom. The frame, a scroll
  // event or the observer may read it first; seenTop makes it count once. A move of the person's that no read saw
  // before the clamp counts as clamp too (accepted).
  // Says whether scrollTop moved since the last read by anything but a clamp.
  const clampSeen = (node: HTMLElement): boolean => {
    const top = node.scrollTop, last = seenTop.current;
    seenTop.current = top;
    if (top < last - 0.5 && bottomOf(node) < last - 0.5) { apply({ type: "clamp", by: last - top }); return false; }
    return Math.abs(top - last) >= 0.5;
  };
  const apply = (event: FollowEvent) => {
    const before = follow.current;
    follow.current = nextFollow(before, event);
    if (!follow.current.pinned) { easeTo.current = null; return; }
    if (before.pinned) return;
    setBehind(false);
    // Following again once the person's input ends goes back to the bottom.
    const node = scroller.current;
    if (!node || event.type !== "frame" || event.distance <= 0) return;
    if (motion.reduced()) write(node, bottomOf(node));
    else { easeTo.current = bottomOf(node); run(); }
  };
  const tick = (now: number) => {
    loop.current = 0;
    const node = scroller.current;
    if (!node) return;
    const dt = lastFrame.current === null ? 16 : now - lastFrame.current;
    lastFrame.current = now;
    clampSeen(node);
    if (easeTo.current !== null && follow.current.pinned) {
      const step = followStep(node.scrollTop, easeTo.current, dt, bottomOf(node));
      write(node, step.pos);
      if (step.done) easeTo.current = null;
    }
    distance.current = bottomOf(node) - node.scrollTop;
    const was = follow.current;
    apply({ type: "frame", at: now, distance: distance.current, top: node.scrollTop });
    if (judgedBehind(was, follow.current, distance.current, bandOf(node))) setBehind(true);
    // apply() may have scheduled the next frame already: one loop id, so unmount cancels it.
    if (easeTo.current !== null || (!follow.current.pinned && now - follow.current.inputAt < WHEEL_HOLD_MS * 2)) run();
    else lastFrame.current = null;
  };
  const run = () => { if (loop.current === 0) loop.current = requestAnimationFrame(tick); };
  const contentOf = (node: HTMLElement) => node.firstElementChild?.getBoundingClientRect().height ?? 0;
  // The popover's height becomes the end inset first, so the scroll extent read next already holds it.
  const resized = () => {
    const node = scroller.current;
    if (!node || !opened.current) return;
    const now = performance.now();
    if (popover.current) holdChrome(popover.current);
    const insetNow = popover.current?.isConnected === false ? 0 : popover.current?.offsetHeight ?? 0;
    if (insetNow !== inset.current) root.current?.style.setProperty("--ap-inset", `${insetNow}px`);
    const fits = insetNow === 0 || node.clientHeight - insetNow >= JUMP_ROOM;
    if (fits !== jumpFits) setJumpFits(fits);
    const before = { content: contentHeight.current, inset: inset.current, distance: distance.current };
    clampSeen(node);
    const after = { content: contentOf(node), inset: insetNow, distance: bottomOf(node) - node.scrollTop };
    contentHeight.current = after.content;
    inset.current = insetNow;
    const change = followResize(follow.current, { reduced: motion.reduced(), revealing: revealedAt.current === frameTime(), easing: easeTo.current !== null, now, top: node.scrollTop, band: bandOf(node), before, after });
    follow.current = change.state;
    if (change.move === "snap") { easeTo.current = null; write(node, bottomOf(node)); }
    else if (change.move === "ease") { easeTo.current = bottomOf(node); run(); }
    else distance.current = after.distance;
    if (change.behind !== null) setBehind(change.behind);
  };
  const latestFollow = useRef({ resized, apply, run });
  latestFollow.current = { resized, apply, run };
  // The thread opens at its bottom at once.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !Array.isArray(items) || opened.current) return;
    opened.current = true;
    contentHeight.current = contentOf(node);
    write(node, bottomOf(node));
  }, [items]);
  const ready = Array.isArray(items);
  // The popover is watched by the follow's observer while it is drawn; this callback stays the same across renders.
  const popover = useRef<HTMLDivElement | null>(null), observer = useRef<ResizeObserver | null>(null);
  const popoverRef = useRef((node: HTMLDivElement | null) => {
    if (popover.current) observer.current?.unobserve(popover.current);
    popover.current = node;
    if (node) observer.current?.observe(node);
    else latestFollow.current.resized();
  }).current;
  useEffect(() => {
    const node = scroller.current, content = node?.firstElementChild;
    if (!ready || !node || !content) return;
    const calls = () => latestFollow.current;
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => calls().resized());
    observer.current = watch;
    watch?.observe(content);
    watch?.observe(node);
    if (popover.current) watch?.observe(popover.current);
    // The person's input: a wheel on the thread that can leave the bottom, a press on the scroller itself (its
    // scrollbar), a scroll key outside a field or control that scrolls this thread (focus often stays outside it after a
    // click on reply text; onScroll claims the key). A press ends anywhere: a scrollbar drag is often released outside
    // the scroller, or outside the window (blur).
    const wheel = (event: WheelEvent) => {
      if (event.deltaY >= 0 && follow.current.pinned) return;
      calls().apply({ type: "input", kind: "wheel", at: performance.now(), top: node.scrollTop });
      calls().run();
    };
    const pointer = (event: PointerEvent) => { if (event.target === node) calls().apply({ type: "pointer", down: true, top: node.scrollTop }); };
    const release = () => {
      if (!follow.current.pressed) return;
      calls().apply({ type: "pointer", down: false });
      calls().run();
    };
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest(OWN_KEYS)) return;
      keyDown.current = { key: event.key, at: performance.now(), top: node.scrollTop };
    };
    const ended = () => {
      calls().apply({ type: "scrollend" });
      calls().run();
    };
    const selection = () => {
      const chosen = document.getSelection();
      const active = !!chosen && !chosen.isCollapsed && (node.contains(chosen.anchorNode) || node.contains(chosen.focusNode));
      if (active === follow.current.selecting) return;
      calls().apply({ type: "selection", active });
      if (!active) calls().run();
    };
    node.addEventListener("wheel", wheel, { passive: true });
    node.addEventListener("pointerdown", pointer);
    for (const type of ["pointerup", "pointercancel", "blur"]) window.addEventListener(type, release);
    window.addEventListener("keydown", key, true);
    node.addEventListener("scrollend", ended);
    document.addEventListener("selectionchange", selection);
    return () => {
      watch?.disconnect();
      observer.current = null;
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("pointerdown", pointer);
      for (const type of ["pointerup", "pointercancel", "blur"]) window.removeEventListener(type, release);
      window.removeEventListener("keydown", key, true);
      node.removeEventListener("scrollend", ended);
      document.removeEventListener("selectionchange", selection);
    };
  }, [ready]);
  useEffect(() => () => { if (loop.current !== 0) cancelAnimationFrame(loop.current); }, []);
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
  // React moves the card stack past a request that folds, and moving a focused control's ancestor drops its focus to the page.
  // Focus goes back to the same card's Open, unless the person moved it or the card is gone.
  const cardFocused = focusedKey !== null && Array.isArray(items) && items.some(item => item.kind === "canvasCard" && item.key === focusedKey) ? focusedKey : null;
  useLayoutEffect(() => {
    if (cardFocused === null || (document.activeElement && document.activeElement !== document.body)) return;
    handFocus(() => scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(cardFocused)}"] .cc-open`)?.focus({ preventScroll: true }));
  });
  useLayoutEffect(() => {
    shown.current = Array.isArray(items) ? pendingAsks(items).map(ask => ({ ...ask, unsent: Object.values(draftOf(ask.requestId).choices).some(choice => choice.text.trim() !== "") })) : [];
  });
  // An open popover, or none, leaves no fold in the host: a request that ended without a resolved event (a turn's end)
  // would otherwise keep one.
  useLayoutEffect(() => { if (Array.isArray(items) && !collapsed) latest.current.onExpand?.(); });
  useLayoutEffect(() => {
    const want = popoverFocus.current;
    if (!want) return;
    if (want.key !== ask?.key) { popoverFocus.current = null; return; }
    if (collapsed === want.open || (want.step !== undefined && (ask.kind !== "question" || draftOf(ask.requestId).step !== want.step))) return;
    popoverFocus.current = null;
    // A cramped popover scrolls the body itself, so its own scroll goes back to the top.
    const surface = popover.current;
    if (want.step !== undefined) (surface?.hasAttribute("data-cramped") ? surface : surface?.querySelector(".ap-body"))?.scrollTo({ top: 0 });
    handFocus(() => focusIn(want.key));
  });
  // Collapse and expand run the surface's height between the popover and the bar; the end inset follows it each frame.
  const shape = ask === null ? null : collapsed ? "bar" : "open";
  const drawnShape = useRef(shape);
  useLayoutEffect(() => { if (popover.current) holdChrome(popover.current); });
  useLayoutEffect(() => {
    const was = drawnShape.current, node = popover.current;
    drawnShape.current = shape;
    if (!node || !was || !shape || was === shape || motion.reduced() || typeof node.animate !== "function") return;
    const token = (name: string) => getComputedStyle(node).getPropertyValue(name).trim();
    const duration = timeMs(token("--time-thread-enter"));
    stopMotion();
    const target = node.offsetHeight;
    node.style.overflow = "hidden";
    node.style.minHeight = "";
    const run = node.animate([{ height: `${inset.current}px` }, { height: `${target}px` }], { duration, easing: token("--ease-settle") || "ease" });
    run.onfinish = run.oncancel = () => { if (!motions.current.includes(run)) return; node.style.overflow = ""; holdChrome(node); };
    // Opening: the body and buttons appear last, once the height has run.
    const fades = shape === "open" ? [...node.querySelectorAll(".ap-body, .ap-actions, .ap-error")].map(part => part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: timeMs(token("--time-fast")), delay: duration, fill: "backwards" })) : [];
    motions.current = [run, ...fades];
  }, [shape, motion]);
  // A scroll the follow did not write is the person's (or a clamp); a frame then judges whether it follows again. Scroll
  // anchoring is off on the scroller (styles.css), or it would move the view as a reply grows above.
  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    const moved = clampSeen(node);
    distance.current = bottomOf(node) - node.scrollTop;
    if (wrote.current === null || Math.abs(node.scrollTop - wrote.current) >= 1) {
      const pressed = keyDown.current;
      keyDown.current = null;
      if (pressed && performance.now() - pressed.at < WHEEL_HOLD_MS) apply({ type: "input", kind: "key", ...pressed });
      apply({ type: "scroll", distance: distance.current, top: node.scrollTop, moved });
      run();
    }
    if (scrollFollow(distance.current, bandOf(node))) setBehind(false);
  };
  // Through the same follow: a native smooth scroll heads for the old bottom and can stop short of it.
  const jump = () => {
    const node = scroller.current;
    if (!node) return;
    apply({ type: "jump" });
    setBehind(false);
    if (motion.reduced()) write(node, bottomOf(node));
    else { easeTo.current = bottomOf(node); run(); }
  };
  useImperativeHandle(ref, () => ({
    scrollToItem(key: string) {
      const node = scroller.current?.querySelector(`[data-item="${CSS.escape(key)}"]`);
      // Not following: the follow's next write would cancel this smooth scroll and pull the item back down.
      if (node) latestFollow.current.apply({ type: "item", at: performance.now() });
      // A received handoff scrolls to its top: in a 280px panel a tall bubble's centre would leave its meta line out of view.
      node?.scrollIntoView({ block: node.querySelector(".from-agent") ? "start" : "center", behavior: prefersReduced() ? "auto" : "smooth" });
    },
    // A request is focused only in the popover, which shows the earliest one: a collapsed popover opens first.
    focusItem(key: string) {
      const now = popoverNow.current;
      if (Array.isArray(latest.current.items) && latest.current.items.some(item => item.key === key && waitsForPerson(item))) {
        if (key !== now.key) return false;
        if (now.collapsed) { expandRef.current(key); return true; }
      }
      return focusIn(key);
    },
  }), []);

  // The Markdown is memoized, so its links and Copy buttons read the latest callbacks through one stable context value.
  const actions = useRef<ThreadActions>({ openLink: () => {}, copy: () => {}, replyChip: () => null });
  actions.current.openLink = url => props.onOpenLink(url);
  actions.current.replyChip = link => props.onReplyChip?.(link) ?? null;
  actions.current.copy = (text, reply) => {
    void props.onCopy(text).catch(() => false).then(ok => {
      if (!ok) { setCopyFailed(reply); return; }
      setCopyFailed(null);
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
      case "user": return [props.frames, !!props.locateDisabled, !!props.onLocate, props.homeDirectory ?? null, entered.current.get(entry.key) ?? null];
      case "agent": return [flushes(entry)];
      case "activity": return [expanded.has(entry.key)];
      case "end": return [provider, entry.key === last?.key, entry.key === last?.key && last.resend, entry.key === last?.key ? props.limitResets ?? null : null, entry.key === last?.key && !!props.resendHidden];
      case "canvasCard": {
        const canvas = cardCanvas(entry, rows);
        return [provider, props.project, canvas, props.canvasListed(canvas), !!props.onOpenHandoff, ...metaDeps(canvas)];
      }
      case "handoffCard": {
        const source = entry.origin.canvas;
        return [props.project, source ? props.canvasListed(source) : props.conversationListed?.(entry.origin.conversationId) ?? null, source ? !!props.onOpenHandoff : !!props.onOpenOverview, minute];
      }
      case "marker": return [props.project, props.canvasListed(entry.canvas), openCanvasId, props.openCanvasPath];
      default: return [];
    }
  };
  const flushes = (entry: ThreadItem) => flushesReply(entry, drawn, { stopping: props.stopping === true, notice: !!props.card });
  const toggle = (key: string) => setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const item = (entry: ThreadItem): ReactNode => {
    switch (entry.kind) {
      case "user": return <UserMessage entry={entry} frames={props.frames} disabled={!!props.locateDisabled} onLocate={props.onLocate && locate} home={props.homeDirectory ?? null} entryAge={entryAge(entry.key)} />;
      case "agent": return <AgentMessage text={entry.text} streaming={entry.streaming} flush={flushes(entry)} start={replyStart(prevItems.current, entry)} />;
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
      // A waiting request is the popover's; the thread keeps its folded line once it ends.
      case "permission": {
        if (entry.status === "pending") return null;
        return <div className="activity"><div className="activity-head ask-answered"><span className="selectable">
          {entry.status === "answered" ? `${entry.answer ? ANSWERED[entry.answer.kind] : "Answered"} · ${entry.summary}` : `Expired without an answer · ${entry.summary}`}</span></div></div>;
      }
      case "question":
        if (entry.status === "pending") return null;
        return <div className="q-folded">{questionLines(entry).map((line, i) =>
          <div key={i} className="activity"><div className="activity-head ask-answered"><NameTip text={line}><span className="selectable">{line}</span></NameTip></div></div>)}</div>;
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
      case "handoffCard": return <HandoffBubble entry={entry} project={props.project} now={minute} timeId={`${base}-${entry.key}-time`} canvasListed={listed}
        conversationListed={props.conversationListed && conversationListed} onOpen={props.onOpenHandoff && openHandoff} onOpenOverview={props.onOpenOverview && openOverview} />;
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

  return <Actions.Provider value={context}><ReplyCanvasContext.Provider value={replyCanvas}><CopyFailed.Provider value={copyFailed}><Motion.Provider value={motion}><div className="conversation-thread" ref={root}>
    {props.thumbnails && <CardThumbnails hub={props.thumbnails.hub} root={props.thumbnails.root} banners={cardBanners(drawn, rows, props.canvasListed, card => canvasCardText(card, { project: props.project, provider, listed: props.canvasListed }).icon === "spinner")} scroller={scroller} onImages={setImages} />}
    <div className="thread-scroll doan-scroll" ref={scroller} onScroll={onScroll}>
      <div className="thread">{stacks(drawn.filter(entry => !waitsForPerson(entry))).map(run => run.length === 1 && run[0]!.kind !== "canvasCard"
        ? <ThreadEntry key={run[0]!.key} entry={run[0]!} deps={depsOf(run[0]!)} draw={item} />
        // A run of cards stacks closer than thread items do; each card stays its own item.
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
      <div className="thread-end" aria-hidden="true" />
    </div>
    {behind && jumpFits && <button type="button" className="doan-button jump-latest" data-ui-size="sm" data-ui-variant="panel" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest</button>}
    {ask && <AnswerPopover item={ask} provider={provider} count={asks.length} base={base} collapsed={collapsed} announce={announce}
      draft={ask.kind === "question" ? draftOf(ask.requestId) : EMPTY_QUESTION_DRAFT} pressed={pressing.get(ask.requestId) ?? null} failed={unanswered.has(ask.requestId)} rootRef={popoverRef}
      onAnswer={optionId => answer(ask.requestId, optionId)} onDraft={action => editQuestion(ask.requestId, action)}
      onNext={() => { if (ask.kind === "question") moveStep(ask, { type: "next", questions: ask.questions }); }} onBack={() => { if (ask.kind === "question") moveStep(ask, { type: "back" }); }}
      onSend={() => { if (ask.kind === "question") sendQuestion(ask, "answer"); }} onSkip={() => { if (ask.kind === "question") sendQuestion(ask, "skip"); }} onStop={() => stop(ask.requestId)}
      onCollapse={() => collapse("bar")} onExpand={() => expand(ask.key)} onEscape={() => collapse("composer")} />}
    <div className="sr-only" role="status">{phaseText(drawn, items, provider, settled.shown, line !== null)}</div>
  </div></Motion.Provider></CopyFailed.Provider></ReplyCanvasContext.Provider></Actions.Provider>;
};

