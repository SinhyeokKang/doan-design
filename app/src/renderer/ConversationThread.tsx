import { createContext, forwardRef, Fragment, memo, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Archive, ArrowDown, ArrowUpRight, ChevronDown, CircleStop, Copy, Eye, FileText, Frame, MapPin, Pencil, PencilSparkles, RotateCcw, SquareMousePointer, Terminal } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor, Canvas } from "../main/conversation/types";
import { chipLabel, type FrameName } from "../main/conversation/messageText";
import { PROVIDER_NAMES } from "./agentAuthView";
import { AlertIcon } from "./AlertIcon";
import { formatSize, providerLogo } from "./homeComposer";
import { scrollFollow, type ActivityStep, type ThreadItem, type TurnEnd } from "./threadItems";

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
  // The open canvas's frames, which name a frame chip by its current title.
  frames?: readonly FrameName[];
}
export interface ConversationThreadHandle { scrollToItem(key: string): void }

export const LOADING_DELAY_MS = 300;

// How a chip locate ended: "timeout" (the canvas did not answer) and "unavailable" end silently, because neither says
// the target is gone (design §2 'Chip locate').
export type LocateOutcome = "shown" | "missing" | "timeout" | "unavailable";
export const LOCATE_MISSING_TEXT = "No longer in the canvas";
export const LOCATE_NOTE_MS = 4000;

// "No longer in the canvas" next to a chip, for 4 s or until the person's next action. The result arrives after the
// click or Enter that asked for it, so the listeners added here only see later input. Each show restarts the 4 s.
export function useLocateNote(): [shown: boolean, show: () => void] {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown === 0) return;
    const hide = () => setShown(0);
    const timer = setTimeout(hide, LOCATE_NOTE_MS);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    return () => {
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

const Actions = createContext<{ openLink(url: string): void; copy(text: string): void }>({ openLink: () => {}, copy: () => {} });
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
// Agent output is untrusted (ARCHITECTURE §2's rule for comment bodies): no raw HTML (react-markdown escapes it; no
// rehype-raw), no images (their alt text stays), https links only.
const COMPONENTS: Components = {
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
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
  return <Markdown remarkPlugins={PLUGINS} rehypePlugins={[labelPrefix(prefix)]} remarkRehypeOptions={{ clobberPrefix: `${prefix}-` }} components={COMPONENTS}>{text}</Markdown>;
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
function AgentMessage({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useFrameText(text, streaming), prefix = useId();
  return <div className="msg-agent md"><MarkdownText text={shown} prefix={prefix} />{streaming && <span className="caret" aria-hidden="true" />}</div>;
}

// Whether a permission answer reached main: a refusal and a rejected call both mean it did not.
export async function answerReached(send: () => Promise<void | { error: string }> | void): Promise<boolean> {
  try {
    const reply = await send();
    return !(reply && "error" in reply);
  } catch {
    return false;
  }
}

const CHIP_ICONS = { frame: Frame, element: SquareMousePointer, point: MapPin } as const;
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

// A sent message: its bubble, attachments and the chip locate note under the bubble (draft frame `chip-locate`).
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
    {shownFor && <span className="chip-missing" id={`${shownFor}-missing`} role="status">{LOCATE_MISSING_TEXT}</span>}
  </div>;
}

const STEP_ICONS = { read: Eye, edit: Pencil, command: Terminal, other: Terminal } as const;
function Steps({ id, steps }: { id: string; steps: readonly ActivityStep[] }) {
  return <ul className="activity-steps" id={id}>{steps.map(step => {
    const Icon = STEP_ICONS[step.kind];
    return <li key={step.key}><Icon aria-hidden="true" /><span className="verb">{step.verb}</span>{step.path && <span className="path">{step.path}</span>}</li>;
  })}</ul>;
}

function lastEnd(items: readonly ThreadItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "user") return null;
    if (item.kind === "end") return item.key;
  }
  return null;
}
function phaseText(items: readonly ThreadItem[], provider: Provider): string {
  const p = PROVIDER_NAMES[provider];
  if (items.some(item => item.kind === "permission" && item.status === "pending")) return `${p} needs your answer`;
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
      node?.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    },
  }), []);

  // The Markdown is memoized, so its links and Copy buttons read the latest callbacks through one stable context value.
  const actions = useRef<{ openLink(url: string): void; copy(text: string): void }>({ openLink: () => {}, copy: () => {} });
  actions.current.openLink = url => props.onOpenLink(url);
  actions.current.copy = text => {
    void props.onCopy(text).then(ok => {
      if (!ok) return;
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }).catch(console.error);
  };
  const context = useRef({ openLink: (url: string) => actions.current.openLink(url), copy: (text: string) => actions.current.copy(text) }).current;

  if (items === "error") return <div className="conversation-thread">
    <div className="doan-notice error thread-notice" role="alert"><AlertIcon /><span className="strip-text"><b>Doan couldn’t read this conversation</b><span>Try again. If it keeps failing, start a new conversation.</span></span>
      <span className="strip-actions"><button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={props.onRetry}>Retry</button></span></div>
  </div>;
  if (items === null) return <div className="conversation-thread">{slow && <div className="thread-loading" role="status"><span className="doan-spinner" aria-hidden="true" /><span>Loading conversation…</span></div>}</div>;

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

  return <Actions.Provider value={context}><div className="conversation-thread">
    <div className="thread-scroll" ref={scroller} onScroll={onScroll}>
      <div className="thread">{items.map(entry => <div key={entry.key} className="thread-item" data-item={entry.key}>{item(entry)}</div>)}</div>
    </div>
    {behind && <button type="button" className="doan-button jump-latest" data-ui-size="sm" data-ui-variant="panel" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest</button>}
    <div className="sr-only" role="status">{copied ? "Copied" : phaseText(items, provider)}</div>
  </div></Actions.Provider>;
};

