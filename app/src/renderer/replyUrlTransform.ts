import { defaultUrlTransform } from "react-markdown";

// react-markdown's default blanks every href whose protocol is not http(s), mailto and a few others, which would drop
// a reply chip's `doan:` link before the `a` component sees it. Only the scheme is let through here; whether the link
// is a chip is `parseReplyAnchor`'s call, and anything it rejects is drawn as plain text, so no `doan:` href becomes
// an `<a>`. Every other URL keeps the default treatment (`javascript:` and `data:` stay blank).
export function replyUrlTransform(url: string): string {
  return url.startsWith("doan:") ? url : defaultUrlTransform(url);
}
