import { defaultUrlTransform } from "react-markdown";

// react-markdown's default blanks a `doan:` href before the `a` component sees it, so only that scheme is let through;
// parseReplyAnchor draws anything it rejects as plain text. `javascript:` and `data:` stay blank.
export function replyUrlTransform(url: string): string {
  return url.startsWith("doan:") ? url : defaultUrlTransform(url);
}
