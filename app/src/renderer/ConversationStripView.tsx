import { useRef } from "react";
import { CircleAlert, CircleCheck, CircleStop } from "lucide-react";
import type { Provider } from "../main/agentAuth/types";
import type { StripAction, StripState, StripView } from "./conversationStrip";
import { providerLogo } from "./homeComposer";

interface Props {
  conversationId: string; provider: Provider; state: StripState; view: StripView;
  onEditOnHome(): void; onDismiss(): void; onOpen(): void;
}

// The temporary Home-conversation strip at the top of the workspace body (buzz-home design §7), the shared panel
// notice with actions, until buzz-conversation's panel replaces it.
export function ConversationStrip({ conversationId, provider, state, view, onEditOnHome, onDismiss, onOpen }: Props) {
  const stop = useRef<HTMLButtonElement | null>(null);
  const run = (action: StripAction) => {
    if (action.command === "answer") {
      void window.doan.answerConversationPermission({ conversationId, requestId: state.kind === "permission" ? state.requestId : "", optionId: action.optionId }).catch(console.error);
      // The answered choices go away; Stop is the one control left in both states (design §7).
      stop.current?.focus();
    } else if (action.command === "stop") void window.doan.interruptConversation({ conversationId }).catch(console.error);
    else if (action.command === "editOnHome") onEditOnHome();
    else if (action.command === "open") onOpen();
    else onDismiss();
  };
  const mark = state.kind === "starting" ? <span className="doan-spinner" aria-hidden="true" />
    : state.kind === "failed" ? <CircleAlert className="strip-alert" aria-hidden="true" />
    : state.kind === "done" ? <CircleCheck className="strip-ok" aria-hidden="true" />
    : <img className="logo" src={providerLogo(provider)} alt="" />;
  // A permission request is announced once: its alert is a new element per request.
  return <div className="convo-strip doan-notice doan-panel" role="region" aria-label="Conversation">
    <span className="strip-agent">{mark}</span>
    <span key={view.alertKey ?? "status"} className="strip-text" role={view.live}><b>{view.title}</b>{view.body && <span>{view.body}</span>}</span>
    <span className="strip-actions">{view.actions.map(action => {
      // The draft (workspace-strip, states-strip) fills Allow and keeps the other answers, Edit on Home and Open subtle.
      const variant = action.command === "answer" ? (action.kind === "allow" ? "prominent" : "subtle") : action.command === "editOnHome" || action.command === "open" ? "subtle" : undefined;
      const key = action.command === "answer" ? `answer-${action.optionId}` : action.command;
      // data-strip-stop: App focuses Stop after a Home send's move, never a permission answer (design §4.9, §7).
      return <button key={key} ref={action.command === "stop" ? stop : undefined} data-strip-stop={action.command === "stop" ? "" : undefined} type="button" className="doan-button" data-ui-size="sm" data-ui-variant={variant} onClick={() => run(action)}>
        {action.command === "stop" && <CircleStop aria-hidden="true" />}{action.label}
      </button>;
    })}</span>
  </div>;
}
