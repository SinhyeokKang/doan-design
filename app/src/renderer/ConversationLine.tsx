import { Hand } from "lucide-react";
import { PROVIDER_NAMES } from "./agentAuthView";
import { providerLogo } from "./homeComposer";
import type { ConversationLine, ConversationStatus } from "./overviewConversation";

// The first line shared by the Overview's dropdown items and its right panel's canvas rows (buzz-project design §2.1,
// §2.3): provider logo (its name as alt text), the name, the status mark the sidebar slot draws, the short time flush
// right, spelled out for screen readers.

export function StatusMark({ status }: { status: ConversationStatus }) {
  return <span className={`row-slot ${status.kind}`} role="img" aria-label={status.label}>
    {status.kind === "permission" ? <Hand aria-hidden="true" /> : status.kind === "working" ? <span className="doan-spinner" aria-hidden="true" /> : <i />}
  </span>;
}

export function ConversationHead({ line, name, nameClass }: { line: ConversationLine; name: string; nameClass?: string }) {
  return <span className="cv-head">
    <img className="logo" src={providerLogo(line.provider)} alt={PROVIDER_NAMES[line.provider]} />
    <b className={nameClass}>{name}</b>
    {line.status && <StatusMark status={line.status} />}
    {line.time && <small className="cv-when"><span aria-hidden="true">{line.time.text}</span><span className="sr-only">{line.time.label}</span></small>}
  </span>;
}
