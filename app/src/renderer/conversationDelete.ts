import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import { PROVIDER_NAMES } from "./agentAuthView";

// Deleting a conversation from the title menus (conversation-delete design §3.1): whether its row's Delete can be
// used, the confirm alert's words and the refusal toast. main judges again when the person confirms.

export const DELETE_TOOLTIP = "Delete conversation";
export type DeleteAvailability = { available: true } | { available: false; reason: string };

// The same states the list's status marks show; the reason reads as the canvas menu's does, naming the state.
export function deleteAvailability(c: Pick<ConversationSummary, "phase" | "working">): DeleteAvailability {
  if (c.phase === "waiting") return { available: false, reason: "The agent is waiting for your answer." };
  if (c.working || c.phase === "running") return { available: false, reason: "The agent is working on this conversation." };
  return { available: true };
}

const TITLE_CHARS = 60;
// A title comes from the first message and can run to 32,768 code units over several lines; the alert and the toast
// quote one line of it. Cut by code point so a surrogate pair is never split.
function quoted(title: string): string | null {
  const chars = [...title.replace(/\s*[\r\n]+\s*/g, " ").trim()];
  if (chars.length === 0) return null;
  return `“${chars.slice(0, TITLE_CHARS).join("")}${chars.length > TITLE_CHARS ? "…" : ""}”`;
}

// The row Delete's accessible name, quoting the title as the alert and the toast do.
export function deleteItemLabel(title: string): string {
  return `Delete ${quoted(title) ?? "this conversation"}`;
}

// hasDraft: the conversation's composer draft or a queue main gave back, both discarded with it.
export function deleteDialogView(title: string, provider: Provider, hasDraft: boolean): { title: string; body: string } {
  const name = quoted(title);
  const body = `Doan deletes this conversation from this device. ${PROVIDER_NAMES[provider]}’s own session files stay. You can’t undo this.`;
  return { title: name ? `Delete ${name}?` : "Delete this conversation?", body: hasDraft ? `${body} Its unsent message is discarded too.` : body };
}

// main's refusal codes: busy (it started working, or the app is quitting, when the window closes anyway), not_found;
// anything else is a failure to try again.
export function deleteRefusalText(code: string, title: string): string {
  const name = quoted(title);
  if (code === "not_found") return name ? `${name} was already deleted.` : "This conversation was already deleted.";
  const failed = `Couldn’t delete ${name ?? "this conversation"}.`;
  return code === "busy" ? `${failed} The agent started working on it.` : `${failed} Try again.`;
}
