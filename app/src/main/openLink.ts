// Links in agent replies open in the system browser through main, never in the window (design §2.7 of buzz-conversation;
// setWindowOpenHandler still refuses every window). Only https: an agent's output is untrusted data, and a file:,
// data: or custom-scheme link could run something or reach local files.
export const MAX_LINK_LENGTH = 2048;
// The URL to open, normalized, or null when the request is malformed or the link is not https.
export function linkTarget(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("url" in value)) return null;
  const url = value.url;
  if (typeof url !== "string" || url.length > MAX_LINK_LENGTH) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  return parsed.protocol === "https:" && parsed.hostname !== "" && parsed.href.length <= MAX_LINK_LENGTH ? parsed.href : null;
}
