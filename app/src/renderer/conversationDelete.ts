import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import { PROVIDER_NAMES } from "./agentAuthView";

// main judges again when the person confirms.

export const DELETE_TOOLTIP = "Delete conversation";
export type DeleteAvailability = { available: true } | { available: false; reason: string };

// The reason names the state, as the canvas menu's does.
export function deleteAvailability(c: Pick<ConversationSummary, "phase" | "working">): DeleteAvailability {
  if (c.phase === "waiting") return { available: false, reason: "The agent is waiting for your answer." };
  if (c.working || c.phase === "running") return { available: false, reason: "The agent is working on this conversation." };
  return { available: true };
}

const TITLE_CHARS = 60;
// A title can run to 32,768 code units over several lines; one line is quoted, cut by code point so a surrogate pair is
// never split.
export function quoted(title: string): string | null {
  const chars = [...title.replace(/\s*[\r\n]+\s*/g, " ").trim()];
  if (chars.length === 0) return null;
  return `“${chars.slice(0, TITLE_CHARS).join("")}${chars.length > TITLE_CHARS ? "…" : ""}”`;
}

export function deleteItemLabel(title: string): string {
  return `Delete ${quoted(title) ?? "this conversation"}`;
}

// Drafts, returned queues and scheduled messages are discarded with it, so they never go out.
export function deleteDialogView(title: string, provider: Provider, hasDraft: boolean, queued = 0): { title: string; body: string } {
  const name = quoted(title);
  const body = `Doan deletes this conversation from this device. ${PROVIDER_NAMES[provider]}’s own session files stay. You can’t undo this.`;
  const rows = queued === 1 ? "queued message" : "queued messages";
  const discarded = hasDraft && queued > 0 ? `Its unsent message and ${rows} are discarded too.`
    : queued > 0 ? `Its ${rows} ${queued === 1 ? "is" : "are"} discarded too.`
    : hasDraft ? "Its unsent message is discarded too." : null;
  return { title: name ? `Delete ${name}?` : "Delete this conversation?", body: discarded ? `${body} ${discarded}` : body };
}

// busy: it started working, or the app is quitting. Anything else is a failure to try again.
export function deleteRefusalText(code: string, title: string): string {
  const name = quoted(title);
  if (code === "not_found") return name ? `${name} was already deleted.` : "This conversation was already deleted.";
  const failed = `Couldn’t delete ${name ?? "this conversation"}.`;
  return code === "busy" ? `${failed} The agent started working on it.` : `${failed} Try again.`;
}
