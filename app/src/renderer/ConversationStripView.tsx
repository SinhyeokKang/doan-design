import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, CircleStop } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import { useActivationFocus } from "./activationFocus";
import { AlertIcon } from "./AlertIcon";
import { answerRefusal } from "./ConversationThread";
import { focusAfterStop, stripErrorText, stripSendFailed, stripStacks, type StripAction, type StripSendError, type StripState, type StripView } from "./conversationStrip";
import { providerLogo } from "./homeComposer";
import { NameTip } from "./NameTip";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

interface Props {
  conversationId: string; provider: Provider; state: StripState; view: StripView;
  onEditOnHome(): void; onDismiss(): void;
}

// The temporary Home-conversation strip at the top of the workspace body, the shared panel
// notice with actions, until the conversation panel replaces it.
export function ConversationStrip({ conversationId, provider, state, view, onEditOnHome, onDismiss }: Props) {
  const stop = useRef<HTMLButtonElement | null>(null);
  const dismiss = useRef<HTMLButtonElement | null>(null);
  // Whether Stop held focus when it left the page. React detaches a ref before it removes the node, so the node is
  // still the active element then; afterwards Chromium has already moved focus to the body.
  const stopLeftFocused = useRef(false);
  const stopRef = useRef((node: HTMLButtonElement | null) => {
    stop.current = node;
    if (!node) return;
    return () => { stopLeftFocused.current = document.activeElement === node; stop.current = null; };
  }).current;
  // A turn that ends while Stop has focus takes Stop away; focus moves to Dismiss instead of the page, again on activation
  // since it can end while the person is in another app (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
  useEffect(() => {
    if (!stopLeftFocused.current) return;
    stopLeftFocused.current = false;
    const active = document.activeElement;
    if (!stop.current && focusAfterStop(view.actions) === "dismiss" && (!active || active === document.body)) handFocus(() => dismiss.current?.focus());
  });
  const [sendError, setSendError] = useState<StripSendError | null>(null);
  // Only the latest press's reply speaks: an earlier one's late refusal must not bring the line back.
  const lastSend = useRef(0);
  const send = (requestId: string, how: StripSendError["how"], call: () => Promise<void | { error: string }>) => {
    const n = ++lastSend.current;
    setSendError(null);
    void answerRefusal(call).then(refusal => { if (n === lastSend.current && stripSendFailed(how, refusal)) setSendError({ requestId, how }); });
  };
  const errorText = stripErrorText(sendError, state);
  // Measured, not wrapped by CSS: a wrapped row would keep the one-line negative margins that .stacked takes away.
  const strip = useRef<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(false);
  const actionsKey = view.actions.map(action => action.label).join("\n");
  // The working line changes with every activity, so it stays ellipsized rather than move the strip's height during a turn.
  const stackingBody = state.kind === "working" ? null : view.body;
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = getComputedStyle(node), row = node.querySelector(".strip-actions");
      const buttons = row ? Array.from(row.children) : [];
      const gap = parseFloat(style.columnGap) || 0, rowGap = row ? parseFloat(getComputedStyle(row).columnGap) || 0 : 0;
      setStacked(stripStacks({
        content: node.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0),
        icon: node.querySelector(".strip-agent")?.getBoundingClientRect().width ?? 0,
        gap,
        title: textWidth(node.querySelector(".strip-text > b")),
        body: stackingBody === null ? 0 : textWidth(node.querySelector(".strip-text > span")),
        actions: buttons.reduce((sum, button) => sum + button.getBoundingClientRect().width, 0) + rowGap * Math.max(0, buttons.length - 1),
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [actionsKey, view.title, stackingBody]);
  const run = (action: StripAction) => {
    if (action.command === "answer") {
      if (state.kind === "permission") send(state.requestId, "answer", () => window.doan.answerConversationPermission({ conversationId, requestId: state.requestId, optionId: action.optionId }));
      // The answered choices go away; Stop is the one control left while the turn runs.
      stop.current?.focus();
    } else if (action.command === "skip") {
      if (state.kind === "question") send(state.requestId, "skip", () => window.doan.answerConversationQuestion({ conversationId, requestId: state.requestId, outcome: "skipped" }));
      // As after a permission answer: Stop is the one control left while the turn runs.
      stop.current?.focus();
    } else if (action.command === "stop") {
      // Stop is the next press too: the line goes, and no earlier press's reply can bring it back.
      lastSend.current++;
      setSendError(null);
      void window.doan.interruptConversation({ conversationId }).catch(console.error);
    }
    else if (action.command === "editOnHome") onEditOnHome();
    else onDismiss();
  };
  const mark = state.kind === "starting" ? <span className="doan-spinner" aria-hidden="true" />
    : state.kind === "failed" ? <CircleAlert className="strip-alert" aria-hidden="true" />
    : state.kind === "done" ? <CircleCheck className="strip-ok" aria-hidden="true" />
    : <img className="logo" src={providerLogo(provider)} alt="" />;
  // A permission request or a question is announced once: its alert is a new element per request.
  // The state's tone colours the strip's text and its mark, as on every notice.
  const tone = state.kind === "failed" ? " error" : state.kind === "done" ? " ok" : "";
  return <div ref={strip} className={`convo-strip doan-notice${tone}${stacked ? " stacked" : ""}`} role="region" aria-label="Conversation">
    <span className="strip-agent doan-alert-icon">{mark}</span>
    <span className="strip-main">
      <span key={view.alertKey ?? "status"} className="strip-text" role={view.live}><b>{view.title}</b>
        {/* A permission request's one ellipsized line is what will run; the name tooltip shows the whole of it while it is cut. */}
        {view.body && (state.kind === "permission" ? <NameTip text={view.body}><span>{view.body}</span></NameTip> : <span>{view.body}</span>)}</span>
      {errorText && <span className="strip-error" role="alert"><AlertIcon />{errorText}</span>}
    </span>
    <span className="strip-actions">{view.actions.map(action => {
      // Allow is filled; the other answers, Skip and Edit on Home rest on the panel white, since the strip's inset fill is
      // subtle's own grey.
      const variant = action.command === "answer" ? (action.kind === "allow" ? "prominent" : "panel") : action.command === "editOnHome" || action.command === "skip" ? "panel" : undefined;
      const key = action.command === "answer" ? `answer-${action.optionId}` : action.command;
      // data-strip-stop: App focuses Stop after a Home send's move, never a permission answer.
      const button = <button key={key} ref={action.command === "stop" ? stopRef : action.command === "dismiss" ? dismiss : undefined} data-strip-stop={action.command === "stop" ? "" : undefined} type="button" className="doan-button" data-ui-size="sm" data-ui-variant={variant} onClick={() => run(action)}>
        {action.command === "stop" && <CircleStop aria-hidden="true" />}{action.label}
      </button>;
      // The strip has one line for the request, so what a saving choice adds is in its button's tooltip.
      return action.command === "answer" && action.detail
        ? <Tooltip key={key}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>{action.detail}</TooltipContent></Tooltip> : button;
    })}</span>
  </div>;
}

// The text's own width: stacked, the title box is as wide as the strip and its scrollWidth is too.
function textWidth(node: Element | null): number {
  if (!node) return 0;
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width;
}

// One strip instance per conversation: its Stop-focus memory must not carry over when the project's strip switches to
// another conversation.
export function KeyedConversationStrip(props: Props) {
  return <ConversationStrip key={props.conversationId} {...props} />;
}
