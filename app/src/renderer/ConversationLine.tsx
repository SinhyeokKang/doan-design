import { Clock, Hand, MessageCircle } from "lucide-react";
import { PROVIDER_NAMES } from "./agentAuthView";
import { providerLogo } from "./homeComposer";
import type { ConversationLine, ConversationStatus } from "./overviewConversation";
import { NameTip } from "./NameTip";

// The first line shared by the Overview's dropdown items and its right panel's canvas rows; the time is spelled out for
// screen readers.

export function StatusMark({ status }: { status: ConversationStatus }) {
  return <span className={`row-slot ${status.kind === "unseen" ? "ended" : status.kind}`} role="img" aria-label={status.label}>
    {status.kind === "permission" ? <Hand aria-hidden="true" /> : status.kind === "working" ? <span className="doan-spinner" aria-hidden="true" /> : status.kind === "scheduled" ? <Clock aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
  </span>;
}

export function ConversationHead({ line, name, nameClass }: { line: ConversationLine; name: string; nameClass?: string }) {
  return <span className="cv-head">
    <img className="logo" src={providerLogo(line.provider)} alt={PROVIDER_NAMES[line.provider]} />
    {/* No className key without a class: Radix's Slot would draw an empty class attribute. */}
    <NameTip text={name}><b {...(nameClass === undefined ? {} : { className: nameClass })}>{name}</b></NameTip>
    {line.status && <StatusMark status={line.status} />}
    {line.time && <small className="cv-when"><span aria-hidden="true">{line.time.text}</span><span className="sr-only">{line.time.label}</span></small>}
  </span>;
}
