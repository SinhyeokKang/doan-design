import { object } from "./sessions";
// A longer suggestion is dropped, not cut: a cut one would say something the agent did not suggest.
export const PROMPT_SUGGESTION_LIMIT = 1000;
// Control characters and bidi controls go first, so a word they separated keeps a single space.
const REMOVED = /[\u0000-\u0008\u000e-\u001f\u007f-\u0084\u0086-\u009f\u202a-\u202e\u2066-\u2069]/g;
const FOLDED = /[\u0009-\u000d \u0085\u00a0\u2028\u2029]+/g;
// The text of Claude Code's prompt_suggestion frame (SDKPromptSuggestionMessage) as one line for the composer's
// placeholder, or null when the frame is something else or leaves nothing to show.
export function promptSuggestionText(raw: unknown): string | null {
  if (!object(raw) || raw.type !== "prompt_suggestion" || typeof raw.suggestion !== "string") return null;
  const text = raw.suggestion.replace(REMOVED, "").replace(FOLDED, " ").trim();
  return text && text.length <= PROMPT_SUGGESTION_LIMIT ? text : null;
}
