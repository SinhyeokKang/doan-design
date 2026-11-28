import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { PanelsTopLeft, SwatchBook } from "lucide-react";
import type { Anchor } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { sameCanvas } from "./canvasConversationRows";
import { answerReached, CanvasCard, ConversationThread, endView, HandoffBubble, httpsUrl, metaNameKeep, openReplyLink, pressChip, SentChip, Steps, type CardContext, type ConversationThreadProps } from "./ConversationThread";
import type { ThumbnailState } from "./thumbnails";
import { threadItems, type ThreadItem } from "./threadItems";
import type { ConversationEvent } from "../main/conversation/types";
import { TooltipProvider } from "./components/ui/tooltip";

const noop = () => {};
const props = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
  items, conversationId: "c1", provider: "claude", project: "doan-design", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
  onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenHandoff: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
});
const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<TooltipProvider><ConversationThread {...props(items, patch)} /></TooltipProvider>);
const threadHtml = html;
// A card drawn alone, outside a thread: no rows, no images.
const NO_CONTEXT: CardContext = { rows: [], thumbnails: new Map(), now: 0, root: "" };
// A sent chip inside its detail tooltip.
const sentChip = (args: Parameters<typeof SentChip>[0]) => (SentChip(args) as ReactElement<{ children: ReactElement<{ onClick(): void; "aria-describedby"?: string }> }>).props.children;
const agent = (text: string, streaming = false): ThreadItem => ({ kind: "agent", key: "m1", messageId: "m1", text, streaming });

describe("agent Markdown", () => {
  test("draws paragraphs, emphasis, lists, headings, code, tables, quotes and rules", () => {
    const out = html([agent("## Title\n\nSome **bold** and *it* with `code`.\n\n- one\n  - nested\n\n1. first\n\n```\n$ doan check\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n---")]);
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain("<code>code</code>");
    expect(out).toMatch(/<ul>\s*<li>one\s*<ul>\s*<li>nested<\/li>/);
    expect(out).toContain("<ol>");
    expect(out).toContain('<div class="md-code"><pre class="doan-scroll"><code>$ doan check\n</code></pre><button type="button" class="doan-icon-button" data-ui-size="xs" aria-label="Copy code" data-state="closed" data-slot="tooltip-trigger">');
    expect(out).toContain('<div class="md-table doan-scroll"><table><thead><tr><th>A</th><th>B</th></tr></thead>');
    expect(out).toMatch(/<blockquote>\s*<p>quote<\/p>\s*<\/blockquote>/);
    expect(out).toContain("<hr/>");
  });

  test("raw HTML and images are never drawn; an image leaves its alt text", () => {
    const out = html([agent('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\nText <b>bold</b> and <iframe src="https://e.com"></iframe>\n\n![a diagram](https://example.com/d.png)')]);
    expect(out).not.toMatch(/<(script|img|iframe|b)\b/);
    // The markup shows as text instead.
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("Text &lt;b&gt;bold&lt;/b&gt;");
    expect(out).toContain("<span>a diagram</span>");
  });

  test("only https links are links; javascript:, http, file, data and relative links stay text", () => {
    const out = html([agent("[ok](https://example.com/spec) [js](javascript:alert(1)) [http](http://e.com) [file](file:///etc/passwd) [data](data:text/html,x) [rel](./a.html) [up](HTTPS://E.COM/x)")]);
    expect(out).toContain('<a href="https://example.com/spec">ok</a>');
    expect(out).toContain('<a href="https://e.com/x">up</a>');
    for (const label of ["js", "http", "file", "data", "rel"]) expect(out).toContain(`<span>${label}</span>`);
    expect(out).not.toContain("javascript:");
    expect(out.match(/<a /g)?.length).toBe(2);
  });

  test("a streaming message shows the caret; a finished one does not", () => {
    expect(html([agent("Half", true)])).toContain('<span class="caret" aria-hidden="true"></span>');
    expect(html([agent("Done.")])).not.toContain("caret");
  });

  // A caret beside the blocks is a flex-column item of .msg-agent and sits on its own line, so it ends the last text block.
  test("the streaming caret ends the last text block, whatever block the Markdown renders last", () => {
    const caret = '<span class="caret" aria-hidden="true"></span>';
    const cases: [string, RegExp][] = [
      ["Half", /<p>Half<span class="caret"[^>]*><\/span><\/p>/],
      ["First.\n\nSecond", /<p>First\.<\/p>\s*<p>Second<span class="caret"[^>]*><\/span><\/p>/],
      ["- one\n- two", /<li>two<span class="caret"[^>]*><\/span><\/li>/],
      ["- one\n  - nested", /<li>nested<span class="caret"[^>]*><\/span><\/li>/],
      ["- a\n\n- b", /<li>\s*<p>b<span class="caret"[^>]*><\/span><\/p>\s*<\/li>/],
      ["Intro\n\n## Title", /<h2>Title<span class="caret"[^>]*><\/span><\/h2>/],
      ["Some **bold**", /<p>Some <strong>bold<\/strong><span class="caret"[^>]*><\/span><\/p>/],
      ["> quote", /<blockquote>\s*<p>quote<span class="caret"[^>]*><\/span><\/p>\s*<\/blockquote>/],
      ["| A |\n|---|\n| 1 |", /<td>1<span class="caret"[^>]*><\/span><\/td>/],
      // A code block's text ends in a line break; the caret goes before it, on the code's last line.
      ["```\n$ doan check", /<pre class="doan-scroll"><code>\$ doan check<span class="caret"[^>]*><\/span>\n<\/code><\/pre>/],
    ];
    for (const [text, where] of cases) {
      const out = html([agent(text, true)]);
      expect(out, text).toMatch(where);
      expect(out.split(caret).length - 1, text).toBe(1);
      expect(html([agent(text)]), text).not.toContain("caret");
    }
  });

  test("a streaming reply with no text block yet still shows one caret", () => {
    for (const text of ["", "---"]) expect(html([agent(text, true)]).split('<span class="caret" aria-hidden="true"></span>').length - 1, text).toBe(1);
  });

  test("httpsUrl", () => {
    expect(httpsUrl("https://example.com")).toBe("https://example.com/");
    expect(httpsUrl(" javascript:alert(1)")).toBeNull();
    expect(httpsUrl(undefined)).toBeNull();
    expect(httpsUrl("/relative")).toBeNull();
  });
});

describe("thread items", () => {
  test("the person's message: plain text that keeps its line breaks, the preset line, anchors in place and sent files", () => {
    const out = html([{ kind: "user", key: "u1", seq: 1, anchors: [], preset: { id: "shape", title: "Shape" }, parts: [{ text: "Make <b>" }, { anchor: 1 }, { text: " darker\nplease" }], attachments: [{ name: "spec.md", size: 6144, kind: "file", path: "/Users/ada/spec.md" }] }]);
    expect(out).toContain('<div class="msg-user"><div class="bubble"><span class="bubble-preset">');
    expect(out).toContain("Shape</span>\nMake &lt;b&gt;<span class=\"bubble-anchor\">{{1}}</span> darker\nplease</div>");
    expect(out).toContain('<div class="msg-files"><span class="attach-chip"><span class="file-icon" aria-hidden="true">');
    expect(out).toContain("<b>spec.md</b><small>6 KB</small>");
  });
  test("a sent folder shows the folder icon, its name and Folder, never a size", () => {
    const items: ConversationThreadProps["items"] = [{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [], attachments: [{ name: "references", kind: "directory", path: "/Users/ada/Projects/Atlas/references" }] }];
    // The path is the chip's tooltip, so the chip sits in a provider as it does in the app.
    const out = renderToStaticMarkup(<TooltipProvider><ConversationThread {...props(items, { homeDirectory: "/Users/ada" })} /></TooltipProvider>);
    expect(out).toMatch(/<div class="msg-files"><span class="attach-chip" data-state="closed" data-slot="tooltip-trigger"><span class="file-icon" aria-hidden="true"><svg[^>]*lucide-folder[^>]*>.*?<\/svg><\/span><span class="attach-text"><b>references<\/b><small>Folder<\/small><\/span><\/span><\/div>/);
  });

  // The line sits in its turn, under the reply and before a failed turn's end, and a reread of the history draws it again.
  test("a turn that did not run Fast keeps its line in the turn, live and when read again", () => {
    let seq = 0;
    const ev = (payload: Record<string, unknown>) => ({ v: 1, conversationId: "c1", seq: ++seq, turnId: "t1", at: "2026-11-06T00:00:00Z", ...payload }) as ConversationEvent;
    const events = [ev({ type: "user.message", text: "Split the header", anchors: [] }), ev({ type: "turn.started" }), ev({ type: "message.done", messageId: "m1", text: "Split it." }),
      ev({ type: "fast.unused", reason: "extra_usage", turnedOff: true }), ev({ type: "turn.failed", code: "process_exited" })];
    const line = '<div class="activity"><div class="activity-head fast-note"><svg';
    for (const live of [true, false]) {
      const out = html(threadItems(events, "/r", live));
      expect(out).toContain(line);
      expect(out).toMatch(/lucide-zap[^>]*aria-hidden="true"[^>]*>.*?<\/svg><span>Fast was turned off\. Extra usage is turned off for this account\.<\/span><\/div><\/div>/);
      expect(out.indexOf("Split it.")).toBeLessThan(out.indexOf(line));
      expect(out.indexOf(line)).toBeLessThan(out.indexOf("doan-notice error thread-notice"));
    }
  });

  test("an activity line is a disclosure button; it has a spinner while the turn indicator names its tool", () => {
    const row: ThreadItem = { kind: "activity", key: "a3", running: false, head: "1 step", steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.html" }] };
    const out = html([row], { turn: { turnId: "t1", status: { kind: "tool", activity: "edit", text: "Editing a.html", step: "s3" }, at: "2026-11-06T10:00:00.000Z" } });
    expect(out).toMatch(/<button type="button" class="activity-head" aria-expanded="false"><span class="doan-spinner" aria-hidden="true"><\/span><span>Editing a.html<\/span>/);
    expect(out).not.toContain("activity-steps");
    // Without a turn indicator the row is its step count, even one drawn running.
    expect(html([{ ...row, running: true, head: "Editing a.html" }])).toMatch(/<button type="button" class="activity-head" aria-expanded="false"><span>1 step<\/span>/);
  });

  test("a folded head with known counts: the step count, a hidden separator and the total, named in words on the button", () => {
    const row: ThreadItem = { kind: "activity", key: "a3", running: false, head: "2 steps", total: { added: 12, removed: 3 },
      steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.ts", lines: { added: 12, removed: 3 } }, { key: "s4", kind: "read", verb: "Read", path: "b.ts" }] };
    expect(html([row])).toContain('<button type="button" class="activity-head" aria-expanded="false" aria-label="2 steps, 12 lines added, 3 removed"><span>2 steps</span>'
      + '<span class="head-sep" aria-hidden="true">·</span><span class="lines" role="img" aria-label="12 lines added, 3 removed"><span class="add">+12</span> <span class="del">−3</span></span><svg');
    // Singular and grouped thousands.
    const one: ThreadItem = { ...row, head: "1 step", total: { added: 12345, removed: 1 }, steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.ts", lines: { added: 12345, removed: 1 } }] };
    expect(html([one])).toContain('aria-label="1 step, 12,345 lines added, 1 removed"><span>1 step</span><span class="head-sep" aria-hidden="true">·</span><span class="lines" role="img" aria-label="12,345 lines added, 1 removed"><span class="add">+12,345</span> <span class="del">−1</span></span>');
  });

  test("a head without known counts and a running head are as before: no name, no separator, no total", () => {
    const plain: ThreadItem = { kind: "activity", key: "a3", running: false, head: "1 step", steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.ts" }] };
    expect(html([plain])).toMatch(/<button type="button" class="activity-head" aria-expanded="false"><span>1 step<\/span><svg/);
    const counted: ThreadItem = { ...plain, total: { added: 1, removed: 1 }, steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.ts", lines: { added: 1, removed: 1 } }] };
    const running = html([counted], { turn: { turnId: "t1", status: { kind: "tool", activity: "edit", text: "Editing b.ts" }, at: "2026-11-06T10:00:00.000Z" } });
    expect(running).toMatch(/<button type="button" class="activity-head" aria-expanded="false"><span class="doan-spinner" aria-hidden="true"><\/span><span>Editing b.ts<\/span><svg/);
    expect(running).not.toContain("head-sep");
  });

  test("an edit step with counts ends in one named run with a real space; a step without them is as before", () => {
    const out = renderToStaticMarkup(<Steps id="s" steps={[
      { key: "s1", kind: "edit", verb: "Edited", path: "a.ts", lines: { added: 12, removed: 3 } },
      { key: "s2", kind: "edit", verb: "Edited a file", path: null, lines: { added: 1, removed: 0 } },
      { key: "s3", kind: "edit", verb: "Edited", path: "b.ts" },
    ]} />);
    expect(out).toContain('<li><svg');
    expect(out).toMatch(/<span class="verb">Edited<\/span><span class="path">a.ts<\/span><span class="lines" role="img" aria-label="12 lines added, 3 removed"><span class="add">\+12<\/span> <span class="del">−3<\/span><\/span><\/li>/);
    expect(out).toMatch(/<span class="verb">Edited a file<\/span><span class="lines" role="img" aria-label="1 line added, 0 removed"><span class="add">\+1<\/span> <span class="del">−0<\/span><\/span><\/li>/);
    expect(out).toMatch(/<span class="verb">Edited<\/span><span class="path">b.ts<\/span><\/li>/);
  });

  // The waiting request is the answer popover's; only its title is read, and only for one that arrived live.
  test("a permission request that arrived live is read once by its title; one drawn from history is not; no choice is the default", () => {
    const ask = (seq: number): ThreadItem => ({ kind: "permission", key: "pr1", seq, requestId: "r1", summary: "Run doan check", options: [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }], status: "pending", answer: null });
    const live = html([ask(5)], { liveAfter: 4 }), history = html([ask(5)], { liveAfter: 5 });
    expect(live).toContain('<span class="sr-only" role="alert">Claude Code needs your answer</span>');
    expect(history).not.toContain('role="alert"');
    expect(live).toContain('<b id="');
    expect(live).toContain('<span class="ask-command">Run doan check</span></div>');
    expect(live).toContain('data-ui-variant="prominent" data-request="r1" data-entry="">Allow once</button>');
    expect(live).not.toContain("autofocus");
    expect(live).toMatch(/<button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*lucide-circle-stop[^>]*>.*<\/svg>Stop<\/button>/);
  });

  // What will run comes first; the agent's own words follow on their own line, and a choice that saves a rule says which.
  test("a pending permission request shows the command, then the agent's reason, then what a saving choice adds", () => {
    const out = html([{ kind: "permission", key: "pr1", seq: 5, requestId: "r1", summary: "npm test", reason: "Run the tests", status: "pending", answer: null,
      options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "always", label: "Allow with suggested permissions", kind: "allowAlways", detail: "Adds the allow rule Bash(npm test:*) in .claude/settings.local.json." }] }]);
    expect(out).toContain('<span class="ask-command">npm test</span><span class="ask-reason">Run the tests</span>'
      + '<span class="ask-saves">Allow with suggested permissions: Adds the allow rule Bash(npm test:*) in .claude/settings.local.json.</span></div>');
  });

  test("answered and expired requests shrink to one line", () => {
    const base = { kind: "permission" as const, key: "pr1", seq: 5, requestId: "r1", summary: "Run doan check", options: [] };
    expect(html([{ ...base, status: "answered", answer: { id: "a", label: "Allow once", kind: "allow" } }])).toContain('<div class="activity-head ask-answered"><span class="selectable">Allowed once · Run doan check</span></div>');
    expect(html([{ ...base, status: "expired", answer: null }])).toContain("<span class=\"selectable\">Expired without an answer · Run doan check</span>");
  });

  // The thread body is unselectable by default; secondary text opts in with `selectable` while the answer buttons stay out of it.
  test("a pending permission request's text is selectable and its buttons are not", () => {
    const out = html([{ kind: "permission", key: "pr1", seq: 5, requestId: "r1", summary: "Run doan check", options: [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }], status: "pending", answer: null }]);
    expect(out).toContain('<div class="strip-text selectable"><span class="ask-command">Run doan check</span>');
    expect(out).toMatch(/<div class="ap-actions perm">(?:(?!<\/div>).)*Allow once/);
    expect(out).not.toMatch(/<button[^>]*class="[^"]*selectable/);
    expect(out).not.toMatch(/<div class="ap-actions[^"]*selectable/);
  });

  test("an answered or expired permission line is selectable", () => {
    const base = { kind: "permission" as const, key: "pr1", seq: 5, requestId: "r1", summary: "Run doan check", options: [] };
    expect(html([{ ...base, status: "answered", answer: { id: "a", label: "Allow once", kind: "allow" } }])).toMatch(/<div class="activity-head ask-answered"><span class="selectable">Allowed once · Run doan check<\/span>/);
    expect(html([{ ...base, status: "expired", answer: null }])).toMatch(/<div class="activity-head ask-answered"><span class="selectable">Expired without an answer · Run doan check<\/span>/);
  });

  // A Stop's expiry record (`optionId: "expired"`) read back from the history.
  test("a permission request a Stop expired reads as expired, never answered", () => {
    const ev = (seq: number, payload: object) => ({ v: 1, conversationId: "c1", seq, turnId: "t1", at: "2026-11-07T00:00:00Z", ...payload }) as ConversationEvent;
    const options = [{ id: "a", label: "Allow once", kind: "allow" as const }];
    const out = html(threadItems([ev(1, { type: "user.message", text: "go", anchors: [] }), ev(2, { type: "turn.started" }),
      ev(3, { type: "permission.request", requestId: "r1", tool: "mcp", summary: "Run search on Linear", options }),
      ev(4, { type: "permission.resolved", requestId: "r1", optionId: "expired" }), ev(5, { type: "interrupted", reason: "user" })], "/r", true));
    expect(out).toContain("<span class=\"selectable\">Expired without an answer · Run search on Linear</span>");
    expect(out).not.toContain("Answered ·");
  });

  // The turn ended before it did any work, so no file warning and nothing to resend; a reopened history reads the model from
  // the stored end.
  test("a turn end's text is selectable and its end-action buttons are not", () => {
    const failed: ThreadItem = { kind: "end", key: "e3", seq: 3, end: { kind: "failed", code: "not_logged_in" } };
    const user: ThreadItem = { kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [{ text: "go" }], attachments: [] };
    const out = html([user, failed]);
    expect(out).toMatch(/<span class="strip-text selectable"><b>/);
    expect(out).toContain(">Sign in again</button>");
    expect(out).not.toMatch(/<button[^>]*class="[^"]*selectable/);
    expect(out).not.toMatch(/<span class="strip-actions[^"]*selectable/);
  });

  test("a model the account does not have says only that, with no file warning or button", () => {
    const ev = (seq: number, payload: object) => ({ v: 1, conversationId: "c1", seq, turnId: "t1", at: "2026-11-07T00:00:00Z", ...payload }) as ConversationEvent;
    const out = html(threadItems([ev(1, { type: "user.message", text: "go", anchors: [] }), ev(2, { type: "turn.started" }),
      ev(3, { type: "turn.failed", code: "model_unavailable", model: "gpt-6-astra", detail: "The 'gpt-6-astra' model is not supported." })], "/r", true), { provider: "codex" });
    expect(out).toContain('<span class="strip-text selectable"><b>gpt-6-astra isn’t available for this account.</b></span>');
    expect(out).not.toContain("changed files");
    expect(out).not.toContain("Edit and resend");
    expect(out).not.toContain("<button");
  });

  test("turn ends: Edit and resend only on the last turn's end; sign-in expiry adds Sign in again", () => {
    const failed: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "failed", code: "not_logged_in" } };
    const out = html([failed]);
    expect(out).toContain('<div class="doan-notice error thread-notice">');
    expect(out).toContain("<b>Claude Code’s sign-in expired</b><span>Sign in again, then resend your request.</span>");
    expect(out).toContain(">Sign in again</button>");
    expect(out).toContain(">Edit and resend</button>");
    const later = html([failed, { kind: "user", key: "u6", seq: 6, anchors: [], preset: null, parts: [{ text: "Again" }], attachments: [] }]);
    expect(later).not.toContain("Edit and resend");
    expect(endView({ kind: "interrupted", reason: "user" }, "codex")).toEqual({ title: "Stopped", body: "You stopped the agent.", tone: null, signIn: false });
    expect(endView({ kind: "interrupted", reason: "crashed" }, "codex").body).toBe("The agent stopped before it finished.");
    for (const code of ["session_unavailable", "session_in_use"] as const) expect(endView({ kind: "failed", code }, "codex")).toMatchObject({ title: "Codex couldn’t continue", body: "Edit your request and send it again." });
    expect(endView({ kind: "failed", code: "rate_limited" }, "codex")).toMatchObject({ title: "Codex reached a usage limit", body: "Send again after it resets." });
    // The reset time is the provider's own words after "resets ", copied as they are; any other wording has no time.
    for (const apostrophe of ["'", "’"])
      expect(endView({ kind: "failed", code: "rate_limited", detail: `You${apostrophe}ve hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)` }, "claude"))
        .toMatchObject({ title: "Claude Code reached a usage limit", body: "Resets Nov 11 at 2pm (Asia/Seoul). Send again after that." });
    for (const detail of ["Rate limit exceeded", "usage limit · resets soon", "You've hit your limit"])
      expect(endView({ kind: "failed", code: "rate_limited", detail }, "claude"), detail).toMatchObject({ body: "Send again after it resets." });
    expect(endView({ kind: "failed", code: "process_exited" }, "codex")).toMatchObject({ title: "Codex stopped unexpectedly", body: "It may have changed files before it stopped." });
  });

  // The message stays in the thread above the notice, so Edit and resend brings it back to the composer as for any failed
  // turn that began with the person's message.
  test("a message Claude Code never picked up fails with its own title, the send-again body and Edit and resend", () => {
    expect(endView({ kind: "failed", code: "prompt_unread" }, "claude")).toEqual({ title: "Claude Code didn’t pick up your message", body: "Send it again.", tone: "error", signIn: false });
    const out = html([{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [{ text: "Now make the total row sticky" }], attachments: [] },
      { kind: "end", key: "e3", seq: 3, end: { kind: "failed", code: "prompt_unread" } }]);
    expect(out).toContain('<div class="doan-notice error thread-notice">');
    expect(out).toContain("<b>Claude Code didn’t pick up your message</b><span>Send it again.</span>");
    expect(out).toContain(">Edit and resend</button>");
    expect(out).not.toContain("Sign in again");
  });

  // Only the last turn's limit end, while the connection's limit state is live, says that messages sent now go out at the
  // reset; its time wins over the time Claude's detail names.
  test("the last usage-limit end names the live reset and says messages sent now go out then", () => {
    const phrase = "at 3:00\u202fPM";
    expect(endView({ kind: "failed", code: "rate_limited" }, "claude", phrase)).toMatchObject({ title: "Claude Code reached a usage limit", body: "Resets at 3:00\u202fPM. Messages you send now go out then." });
    expect(endView({ kind: "failed", code: "rate_limited", detail: "You've hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)" }, "claude", phrase).body).toBe("Resets at 3:00\u202fPM. Messages you send now go out then.");
    expect(endView({ kind: "failed", code: "process_exited" }, "claude", phrase).body).toBe("It may have changed files before it stopped.");
    const user = (key: string, seq: number): ThreadItem => ({ kind: "user", key, seq, anchors: [], preset: null, parts: [{ text: "Tighten it" }], attachments: [] });
    const end = (key: string, seq: number): ThreadItem => ({ kind: "end", key, seq, end: { kind: "failed", code: "rate_limited" } });
    const out = html([user("u1", 1), end("e2", 2), user("u3", 3), end("e4", 4)], { limitResets: phrase });
    expect(out.match(/Messages you send now go out then\./g)?.length).toBe(1);
    expect(out).toContain("<b>Claude Code reached a usage limit</b><span>Send again after it resets.</span>");
    expect(out).toContain("<b>Claude Code reached a usage limit</b><span>Resets at 3:00\u202fPM. Messages you send now go out then.</span>");
    expect(html([user("u1", 1), end("e2", 2)])).toContain("<span>Send again after it resets.</span>");
  });

  // The failed turn's own message waits in the queue, so Edit and resend would put it out twice; it is back after Remove.
  test("Edit and resend is hidden while the failed turn's message is queued", () => {
    const items: ThreadItem[] = [{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [{ text: "Tighten it" }], attachments: [] }, { kind: "end", key: "e2", seq: 2, end: { kind: "failed", code: "rate_limited" } }];
    expect(html(items, { limitResets: "at 3:00\u202fPM", resendHidden: true })).not.toContain("Edit and resend");
    expect(html(items, { limitResets: "at 3:00\u202fPM" })).toContain(">Edit and resend</button>");
  });

  test("a crash-folded turn's end offers Edit and resend like any other end", () => {
    const out = html([{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [{ text: "Draw it" }], attachments: [] }, { kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } }]);
    expect(out).toContain("<b>Stopped</b><span>The agent stopped before it finished.</span>");
    expect(out).toContain(">Edit and resend</button>");
  });

  test("markers: promotion named by the canvas file stem, with Open turned off once the canvas is gone", () => {
    const bound: ThreadItem = { kind: "marker", key: "k5", seq: 5, marker: "bound", canvas: { path: ".doan/canvases/doan-settings.html", id: "s" } };
    expect(html([bound])).toMatch(/Moved to doan-settings<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="trigger">Open<\/button>/);
    expect(html([bound], { canvasListed: () => false })).toMatch(/Moved to doan-settings · No longer in doan-design<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="trigger" disabled="">Open<\/button>/);
  });

  // On the canvas it moved to, the thread is already there: the line says where it came from, with nothing to open.
  test("a promotion marker on the canvas panel of its own canvas says where it came from, without Open", () => {
    const bound: ThreadItem = { kind: "marker", key: "k5", seq: 5, marker: "bound", canvas: { path: ".doan/canvases/doan-settings.html", id: "s" } };
    const here = html([bound], { openCanvasId: "s" });
    expect(here).toMatch(/Moved here from doan-design Overview<\/span><\/div>/);
    expect(here).not.toContain(">Open</button>");
    expect(html([bound], { openCanvasId: "other" })).toMatch(/Moved to doan-settings<\/span><button[^>]*>Open<\/button>/);
  });

  test("the moved-here divider recognizes a canvas identified only by its path", () => {
    const canvas = { path: ".doan/canvases/poster.html" };
    const bound: ThreadItem = { kind: "marker", key: "k5", seq: 5, marker: "bound", canvas };
    expect(html([bound], { openCanvasPath: canvas.path })).toContain("Moved here from doan-design Overview");
    expect(html([bound], { openCanvasPath: ".doan/canvases/other.html" })).toContain("Moved to poster");
  });

  test("two messages with footnotes never share an id", () => {
    const out = html([agent("One[^1]\n\n[^1]: note"), { kind: "agent", key: "m2", messageId: "m2", text: "Two[^1]\n\n[^1]: note", streaming: false }]);
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map(m => m[1]!);
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => id.endsWith("footnote-label"))).toHaveLength(2);
  });

  test("no reply, the phase status and stable item keys", () => {
    const items: ThreadItem[] = [{ kind: "noReply", key: "n4" }, { kind: "activity", key: "a5", running: true, head: "Reading x", steps: [] }];
    const out = html(items, { turn: { turnId: "t1", status: { kind: "tool", activity: "read", text: "Reading x" }, at: "2026-11-06T10:00:00.000Z" } });
    expect(out).toContain('<div class="msg-agent"><p class="muted">No reply.</p></div>');
    expect(out).toContain('data-item="n4"');
    // The status says the turn indicator's stage kind, without its path.
    expect(out).toContain('<div class="sr-only" role="status">Claude Code is reading files</div>');
    expect(html(items)).toContain('<div class="sr-only" role="status"></div>');
  });
});

describe("loading and read errors", () => {
  test("nothing shows before 300ms of loading", () => {
    expect(html(null)).toBe('<div class="conversation-thread"><div class="thread-loading" role="status"></div></div>');
  });
  test("a read error replaces the thread with a notice and Retry", () => {
    const out = html("error");
    expect(out).toContain('<div class="doan-notice error thread-notice" role="alert">');
    expect(out).toContain("<span class=\"strip-text selectable\" id=\"thread-read-error-c1\"><b>Doan couldn’t read this conversation</b><span>Try again. If it keeps failing, start a new conversation.</span>");
    expect(out).toContain(">Retry</button>");
  });
});

// Tailwind's preflight and styles.css's own `ol { list-style: none; }` would hide the markers; static markup cannot show
// that, so the rules are pinned here.
test("agent reply lists keep their bullets and numbers", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const rules = [".conversation-thread .md ul { list-style: disc; }", ".conversation-thread .md ol { list-style: decimal; }", ".conversation-thread .md ul ul { list-style: circle; }"];
  for (const rule of rules) expect(css).toContain(rule);
  // After the global ol reset, so the thread's rule is the later one.
  expect(css.indexOf(rules[1]!)).toBeGreaterThan(css.indexOf("ol { list-style: none; }"));
});

// A sent message's chips, named as the composer names them.
describe("sent message chips", () => {
  const located = async () => "shown" as const;
  const user = (anchors: readonly Anchor[]): ThreadItem => ({
    kind: "user", key: "u1", seq: 1, preset: null, attachments: [], anchors,
    parts: [{ text: "Make " }, { anchor: 1 }, { text: " match " }, { anchor: 2 }, { text: " at " }, { anchor: 3 }, { text: " and " }, { anchor: 4 }],
  });
  const anchors: Anchor[] = [
    { frame: { id: "payment", title: "Payment" } },
    { element: { selector: "#pay", tag: "button", text: "Pay $42.00" }, frame: { id: "payment" } },
    { frame: { id: "payment" }, point: { frameId: "payment", dx: 12, dy: 40 } },
  ];

  test("in the canvas panel each chip is a button that names its target; a marker without its anchor stays text", () => {
    const out = html([user(anchors)], { onLocate: located, frames: [{ id: "payment", title: "Checkout payment" }] });
    expect(out).toContain('aria-label="Show Checkout payment on canvas"');
    expect(out).toContain('aria-label="Show button “Pay $42.00” on canvas"');
    expect(out).toContain('aria-label="Show Point in Checkout payment on canvas"');
    // The chip's detail is in its tooltip, not a native title.
    expect(out).toMatch(/<button type="button" class="anchor-chip" data-kind="frame" aria-label="Show Checkout payment on canvas" data-state="closed" data-slot="tooltip-trigger">/);
    expect(out).toContain('<span class="bubble-anchor">{{4}}</span>');
    expect(out).not.toContain("{{1}}");
  });

  test("without a canvas to locate in, chips are drawn but are not buttons; a canvas that cannot show disables them", () => {
    expect(html([user(anchors)])).not.toContain("<button type=\"button\" class=\"anchor-chip\"");
    expect(html([user(anchors)])).toContain('<span class="anchor-chip" data-kind="frame"');
    expect(html([user(anchors)], { onLocate: located, locateDisabled: true })).toContain('aria-disabled="true"');
  });

  test("a chip hands its anchor to onLocate, and does nothing while disabled", () => {
    const asked: unknown[] = [];
    const onLocate = async (anchor: Anchor) => { asked.push(anchor); return "shown" as const; };
    const chip = sentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate });
    chip.props.onClick();
    expect(asked).toEqual([anchors[0]]);
    const off = sentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: true, onLocate });
    off.props.onClick();
    expect(asked).toHaveLength(1);
  });

  // Only a target the canvas no longer has shows the note; a canvas that did not answer, or could not be asked, ends silently
  // (a timeout is not "missing").
  test.each([["missing", 1], ["timeout", 0], ["unavailable", 0], ["shown", 0]] as const)("a locate that ends %s shows the note %i times", async (outcome, times) => {
    const shown: string[] = [];
    const chip = sentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: async () => outcome,
      missing: { key: "m-0", shownFor: null, show: key => shown.push(key) } });
    chip.props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(shown).toHaveLength(times);
  });

  test("the note's chip is described by it", () => {
    const chip = sentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: located,
      missing: { key: "m-0", shownFor: "m-0", show: () => {} } });
    expect(chip.props["aria-describedby"]).toBe("m-0-missing");
    const other = sentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: located,
      missing: { key: "m-1", shownFor: "m-0", show: () => {} } });
    expect(other.props["aria-describedby"]).toBeUndefined();
  });
});

// A canvas chip in a sent message: named by its canvas's row now, pressed through onCanvasChip (decision: open, fit, note).
describe("sent canvas chips", () => {
  const rows: CanvasRow[] = [
    { path: ".doan/canvases/flows/pay-step.html", url: "u-c", id: "checkout" },
    { path: ".doan/canvases/drafts.html", url: "u-d", id: "drafts" },
    { path: ".doan/ds/buttons.html", url: "u-b", id: "buttons" },
  ];
  const moved: Anchor = { canvas: { path: ".doan/canvases/checkout.html", id: "checkout" } };
  const own: Anchor = { canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } };
  const ds: Anchor = { canvas: { path: ".doan/ds/buttons.html", id: "buttons" } };
  const gone: Anchor = { canvas: { path: ".doan/canvases/gone.html", id: "gone" } };
  const frame: Anchor = { frame: { id: "payment", title: "Payment" } };
  const user = (anchors: readonly Anchor[]): ThreadItem => ({
    kind: "user", key: "u1", seq: 1, preset: null, attachments: [], anchors,
    parts: anchors.flatMap((_, i) => [{ text: " and " }, { anchor: i + 1 }]),
  });
  const press = async () => null;
  const base = { marker: 1, frames: undefined, disabled: false, onLocate: undefined, rows, openCanvasId: "drafts", project: "doan-web" };
  type Chip = ReactElement<{ onClick(): void; "aria-label"?: string; children: ReactNode }>;
  const tip = (args: Parameters<typeof SentChip>[0]) => renderToStaticMarkup(<>{(SentChip(args) as ReactElement<{ detail: ReactNode }>).props.detail}</>);

  test("the button is named Open and its canvas's name now, by id, the open canvas's chip too", () => {
    const out = html([user([moved, own, gone])], { onCanvasChip: press, canvasRows: rows, openCanvasId: "drafts" });
    expect(out).toMatch(/<button type="button" class="anchor-chip" data-kind="canvas" aria-label="Open pay-step"[^>]*><svg[^>]*><\/svg><span>pay-step<\/span><\/button>/);
    expect(out).toContain('aria-label="Open drafts"');
    // A canvas the list no longer has keeps the name it was sent with.
    expect(out).toContain('aria-label="Open gone"');
  });

  test("the tooltip says where the press goes, then the path; on the open canvas's chip the path alone", () => {
    expect(tip({ ...base, anchor: moved, onCanvasChip: press })).toBe('<span class="tip-line">Open pay-step</span><span class="tip-line">.doan/canvases/flows/pay-step.html</span>');
    expect(tip({ ...base, anchor: own, onCanvasChip: press })).toBe(".doan/canvases/drafts.html");
    // Not pressable: the path alone.
    expect(tip({ ...base, anchor: moved })).toBe(".doan/canvases/flows/pay-step.html");
  });

  test("a design-system canvas takes the sidebar's design-system icon, any other the canvas icon", () => {
    const icon = (anchor: Anchor) => ((sentChip({ ...base, anchor, onCanvasChip: press }) as unknown as Chip).props.children as ReactElement[])[0]!.type;
    expect(icon(ds)).toBe(SwatchBook);
    expect(icon(moved)).toBe(PanelsTopLeft);
  });

  test("a press hands the canvas, at its path now, to onCanvasChip and never locates; missing shows the project note", async () => {
    const asked: unknown[] = [], located: unknown[] = [], shown: [string, string][] = [];
    const chip = sentChip({ ...base, anchor: moved, onLocate: async anchor => { located.push(anchor); return "shown"; },
      onCanvasChip: async canvas => { asked.push(canvas); return "missing"; }, missing: { key: "m-0", shownFor: null, show: (key, text) => shown.push([key, text]) } });
    chip.props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(asked).toEqual([{ path: ".doan/canvases/flows/pay-step.html", id: "checkout" }]);
    expect(located).toEqual([]);
    expect(shown).toEqual([["m-0", "No longer in doan-web"]]);
  });

  test("a press that opened, fitted or toasted shows no note; a canvas that cannot locate still presses", async () => {
    const shown: unknown[] = [];
    const chip = sentChip({ ...base, anchor: moved, disabled: true, onCanvasChip: async () => null, missing: { key: "m-0", shownFor: null, show: key => shown.push(key) } });
    chip.props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(shown).toEqual([]);
  });

  test("a frame chip's note keeps the canvas's words", async () => {
    const shown: [string, string][] = [];
    const chip = sentChip({ ...base, anchor: frame, onLocate: async () => "missing", missing: { key: "m-0", shownFor: null, show: (key, text) => shown.push([key, text]) } });
    chip.props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(shown).toEqual([["m-0", "No longer in the canvas"]]);
  });

  // The composer's chip press (DockedComposer) is the same function as the sent chip's.
  test("pressChip: a canvas chip asks onCanvasChip, any other onLocate; null when its kind has no handler", async () => {
    const located: unknown[] = [], asked: unknown[] = [];
    const hosts = { onLocate: async (anchor: Anchor) => { located.push(anchor); return "missing" as const; }, onCanvasChip: async (canvas: unknown) => { asked.push(canvas); return "missing" as const; } };
    await expect(pressChip(moved, "doan-web", hosts)).resolves.toBe("No longer in doan-web");
    await expect(pressChip(frame, "doan-web", hosts)).resolves.toBe("No longer in the canvas");
    expect(asked).toEqual([moved.canvas]);
    expect(located).toEqual([frame]);
    expect(pressChip(moved, "doan-web", { onLocate: hosts.onLocate })).toBeNull();
    expect(pressChip(frame, "doan-web", { onCanvasChip: hosts.onCanvasChip })).toBeNull();
    await expect(pressChip(moved, "doan-web", { onCanvasChip: async () => null })).resolves.toBeNull();
    await expect(pressChip(frame, "doan-web", { onLocate: async () => "shown" })).resolves.toBeNull();
  });

  // The Overview has no canvas to locate in: its frame chips stay plain while its canvas chips open.
  test("without onCanvasChip a canvas chip is plain; with it and without onLocate only canvas chips are buttons", () => {
    expect(html([user([moved])], { onLocate: async () => "shown", canvasRows: rows })).toContain('<span class="anchor-chip" data-kind="canvas"');
    const overview = html([user([moved, frame])], { onCanvasChip: press, canvasRows: rows, openCanvasId: null });
    expect(overview).toContain('<button type="button" class="anchor-chip" data-kind="canvas" aria-label="Open pay-step"');
    expect(overview).toContain('<span class="anchor-chip" data-kind="frame"');
  });
});

// `doan:` links in a reply are chips, named from the app's own lists.
describe("reply chips", () => {
  const rows: CanvasRow[] = [
    { path: ".doan/canvases/drafts.html", url: "http://localhost/drafts.html", id: "drafts", frames: [{ id: "editor", title: "Editor" }] },
    { path: ".doan/canvases/checkout.html", url: "http://localhost/checkout.html", id: "checkout", frames: [{ id: "payment", title: "Payment" }, { id: "editor", title: "Checkout editor" }] },
    { path: ".doan/canvases/no-id.html", url: "http://localhost/no-id.html", frames: [{ id: "payment", title: "Not this one" }] },
  ];
  const onReplyChip = async () => null;
  // The canvas panel on Drafts, whose live layout titles its editor frame differently from the list row.
  const panel = { onReplyChip, openCanvasId: "drafts", frames: [{ id: "editor", title: "Editor (live)" }], canvasRows: rows };
  const chips = (out: string) => out.match(/<(button|span) [^>]*class="anchor-chip"[^>]*>.*?<\/\1>/g) ?? [];

  test("a well-formed link is a chip, a malformed doan: link is its text, and https links stay links", () => {
    const out = html([agent("Changed [Save](doan:drafts/element/save) in [Ed](doan:drafts/frame/editor), see [bad](doan:x) and [web](https://e.com/a).")], panel);
    expect(out).toContain('<button type="button" class="anchor-chip" data-kind="element" aria-label="Show element save on canvas" data-state="closed" data-slot="tooltip-trigger">');
    expect(out).toContain('<button type="button" class="anchor-chip" data-kind="frame" aria-label="Show Editor (live) on canvas" data-state="closed" data-slot="tooltip-trigger">');
    expect(out).toContain("<span>bad</span>");
    expect(out).toContain('<a href="https://e.com/a">web</a>');
    expect(chips(out)).toHaveLength(2);
  });

  test("links in a code span or a code block are code, not chips", () => {
    const out = html([agent("Use `[Ed](doan:drafts/frame/editor)` like this:\n\n```\n[Save](doan:drafts/element/save)\n```")], panel);
    expect(chips(out)).toHaveLength(0);
    expect(out).toContain("<code>[Ed](doan:drafts/frame/editor)</code>");
  });

  // replyUrlTransform also lets a doan: image source through; only the `a` component makes chips, and images stay alt text.
  test("an image with a doan: source is its alt text, not a chip", () => {
    const out = html([agent("![Editor](doan:drafts/frame/editor)")], panel);
    expect(chips(out)).toHaveLength(0);
    expect(out).toContain("<span>Editor</span>");
    expect(out).not.toContain("doan:");
  });

  test("an autolink <doan:…> is a chip", () => {
    const out = html([agent("See <doan:drafts/frame/editor>.")], panel);
    expect(chips(out)).toHaveLength(1);
    expect(out).toContain('aria-label="Show Editor (live) on canvas"');
  });

  test("a percent-encoded Korean or spaced id becomes a chip with the decoded id", () => {
    const out = html([agent("[x](doan:drafts/element/%ED%95%9C%EA%B8%80%20id) [y](doan:drafts/element/a%2Fb)")], panel);
    expect(out).toContain('aria-label="Show element 한글 id on canvas"');
    expect(out).toContain('aria-label="Show element a/b on canvas"');
  });

  test("no doan: href ever reaches an <a>: every malformed form and the deep link are plain text", () => {
    const bad = ["doan:x", "doan:drafts/frame/", "doan:Drafts/frame/a", "doan:dra_fts/frame/a", "doan:drafts/point/a", "doan:drafts/widget/a",
      "doan:d/frame/a/b", `doan:drafts/element/${"a".repeat(201)}`, "doan:drafts/element/%E0%A4%A", "doan:drafts/element/%0A", "DOAN:drafts/frame/editor",
      "doan://open?root=%2Frepo&canvas=.doan%2Fcanvases%2Fdrafts.html"];
    const out = html([agent(bad.map((href, i) => `[t${i}](${href})`).join(" "))], panel);
    expect(chips(out)).toHaveLength(0);
    expect(out).not.toMatch(/<a\b/);
    bad.forEach((_, i) => expect(out).toContain(`<span>t${i}</span>`));
    expect(html([agent(`[ok](doan:drafts/element/${"a".repeat(200)})`)], panel)).toContain("anchor-chip");
  });

  test("a chip into the open canvas takes its live frame titles; another canvas's chip takes its own row's, never the open canvas's", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:checkout/frame/editor) [c](doan:checkout/frame/payment) [d](doan:checkout/frame/gone)")], panel);
    expect(out).toContain('aria-label="Show Editor (live) on canvas"');
    expect(out).toContain('aria-label="Open checkout and show Checkout editor"');
    expect(out).toContain('aria-label="Open checkout and show Payment"');
    expect(out).toContain('aria-label="Open checkout and show gone"');
  });

  // A chip is at most 180px, the label ellipsizes first and the suffix is never cut; it grows past 180px only for a suffix
  // that alone does not fit. Pure CSS, which jsdom does not lay out, so this pins only the structure the CSS needs.
  test("the label and the canvas name are drawn apart, so the label ellipsizes first inside the 180px chip", () => {
    const out = html([agent("[c](doan:checkout/frame/payment)")], panel);
    // Icon, label and suffix are the chip's three direct children: the grid's three columns, in that order.
    expect(out).toMatch(/<button [^>]*class="anchor-chip"[^>]*><svg[^>]*>.*?<\/svg><span>Payment<\/span><span class="chip-canvas"> · checkout<\/span><\/button>/);
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const container = ".conversation-thread .msg-agent { container-type: inline-size; }";
    const chip = ".anchor-chip:has(> span.chip-canvas) { display: inline-grid; grid-template-columns: auto minmax(1em, max-content) max-content; min-width: min-content; overflow: hidden; }";
    const suffix = ".anchor-chip span.chip-canvas { white-space: pre; margin-left: calc(-1 * var(--space-1)); max-width: calc(100cqw - 2 * var(--space-1h) - var(--size-icon-sm) - var(--space-1) - 1em); }";
    for (const rule of [container, chip, suffix]) expect(css).toContain(rule);
    // The suffix rule ties the label rule's specificity, so it must come later to keep its leading space.
    expect(css.indexOf(suffix)).toBeGreaterThan(css.indexOf(".anchor-chip span:not(.sr-only) {"));
    // The plain chip keeps its 180px cap, which a reply chip shares; min-width beats it only for a long suffix.
    expect(css).toMatch(/\.anchor-chip \{ display: inline-flex; align-items: center; gap: var\(--space-1\); max-width: 180px; margin: 0 var\(--space-half\); padding: 0 var\(--space-1h\);/);
    expect(css.indexOf(chip)).toBeGreaterThan(css.indexOf(".anchor-chip { display: inline-flex;"));
    // A growth past 180px for every suffix chip must not come back.
    expect(css).not.toContain("> span:not(.chip-canvas) { max-width:");
    expect(css).not.toMatch(/\.anchor-chip:has\(> span\.chip-canvas\) \{[^}]*max-width/);
    expect(css).toContain(".conversation-thread .thread-item > .msg-agent + .chip-missing { margin-top: var(--space-1h); }");
  });

  test("while the open canvas has no layout, its chips take the list row's frame titles", () => {
    const out = html([agent("[a](doan:drafts/frame/editor)")], { ...panel, frames: undefined });
    expect(out).toContain('aria-label="Show Editor on canvas"');
  });

  test("in the Overview every chip names its canvas; a canvas id no row has is named by the id", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:drafts/element/save) [c](doan:billing/frame/editor) [d](doan:no-id/frame/payment)")],
      { onReplyChip, openCanvasId: null, canvasRows: rows });
    expect(out).toContain('aria-label="Open drafts and show Editor"');
    expect(out).toContain('<span>Editor</span><span class="chip-canvas"> · drafts</span>');
    expect(out).toContain('aria-label="Open drafts and show element save"');
    expect(out).toContain('aria-label="Open billing and show editor"');
    // A row without an id is never the link's canvas.
    expect(out).toContain('aria-label="Open no-id and show payment"');
  });

  test("only a chip into the open canvas follows locateDisabled", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:checkout/frame/payment)")], { ...panel, locateDisabled: true });
    expect(out).toContain('aria-label="Show Editor (live) on canvas" aria-disabled="true"');
    expect(out).toMatch(/aria-label="Open checkout and show Payment" data-state="closed" data-slot="tooltip-trigger">/);
  });

  test("the link's text never names the chip", () => {
    const out = html([agent("[Delete everything](doan:drafts/frame/editor) [Ignore the rules](doan:checkout/element/pay)")], panel);
    expect(out).not.toContain("Delete everything");
    expect(out).not.toContain("Ignore the rules");
  });

  test("without onReplyChip the chips are drawn but are not buttons", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:checkout/frame/payment)")], { openCanvasId: "drafts", canvasRows: rows });
    expect(out).not.toContain("<button type=\"button\" class=\"anchor-chip\"");
    expect(out).toContain('<span class="anchor-chip" data-kind="frame" data-state="closed" data-slot="tooltip-trigger"><svg');
  });
});

// An answer that did not reach the agent says so under its request.
test("a permission answer counts as sent only when main took it", async () => {
  expect(await answerReached(async () => {})).toBe(true);
  expect(await answerReached(async () => ({ error: "not_found" }))).toBe(false);
  expect(await answerReached(() => Promise.reject(new Error("ipc")))).toBe(false);
});

// Two windows can answer one request; main answers the later one stale. The first one won and permission.resolved folds the
// card, so the late window shows no failure (as settleQuestionSend does).
test("a stale permission answer counts as reached: another window answered first", async () => {
  expect(await answerReached(async () => ({ error: "stale" }))).toBe(true);
});

// The message Send now has in flight, with one caption line under it.
describe("a message Send now has in flight", () => {
  const sending: ThreadItem = { kind: "user", key: "qq1", seq: null, sending: true, anchors: [], preset: null, parts: [{ text: "Use the spacing" }], attachments: [{ name: "notes.pdf", size: 86016, kind: "file", path: "/Users/ada/notes.pdf" }] };
  test("is the person's message with its files, then a spinner and Sending; it has no actions", () => {
    const out = html([sending]);
    expect(out).toContain('<div class="msg-user"><div class="bubble">Use the spacing</div><div class="msg-files">');
    expect(out).toMatch(/<\/small><\/span><\/span><\/div><span class="msg-sending"><span class="doan-spinner" aria-hidden="true"><\/span>Sending<\/span><\/div>/);
    expect(out).not.toContain("<button");
  });
  test("a sent message has no Sending line, and a sending one does not hide the last end's Edit and resend", () => {
    const { sending: _, ...sent } = sending as Extract<ThreadItem, { kind: "user" }>;
    expect(html([{ ...sent, key: "u1", seq: 1 }])).not.toContain("msg-sending");
    const out = html([{ kind: "end", key: "e2", seq: 2, end: { kind: "interrupted", reason: "user" } }, sending]);
    expect(out).toContain("Edit and resend");
  });
});

// Canvas cards, and the receiving conversation's handoff, which is a bubble in the person's turn instead.
describe("canvas cards and the received handoff", () => {
  const CHECKOUT = { path: ".doan/canvases/checkout-flow.html", id: "checkout" }, DRAFTS = { path: ".doan/canvases/drafts.html", id: "drafts" };
  type Card = Extract<ThreadItem, { kind: "canvasCard" }>;
  type Handoff = Extract<ThreadItem, { kind: "handoffCard" }>;
  const card = (patch: Partial<Card> = {}): Card => ({ kind: "canvasCard", key: `ct1:${CHECKOUT.path}`, canvas: CHECKOUT, drawing: false, drawn: true, ...patch });
  // Local times, as the tooltip reads them.
  const NOW = new Date(2026, 10, 25, 14, 4).getTime();
  const at = (minute: number) => new Date(2026, 10, 25, 14, minute);
  const handoff = (patch: Partial<Handoff> = {}): Handoff => ({ kind: "handoffCard", key: "u1", seq: 1, origin: { kind: "handoff", conversationId: "c0", canvas: DRAFTS }, text: "Pick up **Payment**.", at: at(-1).toISOString(), ...patch });
  const row = (canvas: { path: string; id: string }, patch: Partial<CanvasRow> = {}): CanvasRow => ({ path: canvas.path, id: canvas.id, url: "", width: 390, mtimeMs: at(2).getTime(), frames: [{ id: "a" }, { id: "b" }, { id: "c" }], ...patch });
  const ROWS = [row(CHECKOUT), row(DRAFTS)];
  // What a thread hands its cards: the root's rows, its images by path and the minute's time.
  const context = (states: [string, ThumbnailState][] = [], rows = ROWS): CardContext => ({ rows, thumbnails: new Map(states), now: NOW, root: "/w/doan-design" });
  const drawn = (element: ReactElement) => renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
  const canvasCard = (entry: Card, ctx: CardContext, listed = true) => drawn(<CanvasCard entry={entry} context={ctx} project="doan-design" provider="claude" canvasListed={() => listed} onOpen={() => {}} />);
  const running = { turn: { turnId: "t1", status: { kind: "general" as const }, at: "2026-11-16T00:00:00.000Z" } };
  // A card's Open names the canvas it opens; several cards would otherwise read as the same "Open".
  const OPEN = (label: string) => `<button type="button" class="doan-button cc-open" data-ui-size="sm" data-ui-variant="subtle" aria-label="${label}">Open</button>`;
  const svg = (icon: string) => `<svg[^>]*lucide-${icon}[^>]*aria-hidden="true"[^>]*>.*?</svg>`;
  // The banner is decorative: hidden from screen readers, with the sidebar's canvas icon until an image shows.
  const EMPTY_BANNER = `<div class="cc-banner empty"[^>]*aria-hidden="true"[^>]*><svg[^>]*lucide-panels-top-left[^>]*>.*?</svg></div>`;
  const head = (name: string, status: string, icon: string, open: string, meta: string, kind = "panels-top-left") =>
    `<div class="card-head"><span class="cc-icon">${icon}</span><span class="cc-text"><span class="cc-title"><svg[^>]*lucide-${kind}[^>]*cc-kind[^>]*aria-hidden="true"[^>]*>.*?</svg><span class="cc-name">${name}</span></span><span class="cc-status">${status}</span>${meta}</span>${open}</div>`;
  const cardMarkup = (name: string, status: string, icon: string, open = "", meta = "", banner = EMPTY_BANNER) =>
    new RegExp(`<div class="card-surface canvas-card" role="group" aria-label="${name}, ${status}"><div class="card-layout">${banner}${head(name, status, icon, open, meta)}</div></div>`);
  const SPINNER = '<span class="doan-spinner" aria-hidden="true"></span>';
  // A Drawing card keeps its meta line, empty or not, so it is as tall as Drawn.
  const NO_META = '<span class="cc-meta"></span>';
  const SEP = '<span class="sep" aria-hidden="true">·</span>';
  // The absolute time is the shared tooltip's (no native title); its words are canvasCardMeta's, pinned in canvasCardText.test.ts.
  const time = (lead: string, at: Date, text: string) => `<span>${lead} <time dateTime="${at.toISOString()}" data-state="closed" data-slot="tooltip-trigger">${text}</time></span>`;
  const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => threadHtml(items, { now: NOW, ...patch });

  test("Drawing: a labelled group with the hidden spinner, the canvas icon, the name over its status, and Open", () => {
    expect(html([card({ drawing: true })], running)).toMatch(cardMarkup("checkout-flow.html", "Drawing", SPINNER, OPEN("Open checkout-flow.html"), NO_META));
    expect(html([card({ drawing: true, handoff: { outcome: "pending" } })], running)).toMatch(cardMarkup("checkout-flow.html", "Hands off when this turn ends", SPINNER, OPEN("Open checkout-flow.html"), NO_META));
  });

  test("the spinner stops once the indicator goes: a Stop main has taken, or no running turn", () => {
    const stopped = html([card({ drawing: true })], { turn: { turnId: "t1", status: { kind: "none" }, at: "2026-11-16T00:00:00.000Z" } });
    expect(stopped).toMatch(cardMarkup("checkout-flow.html", "Drawn", svg("check"), OPEN("Open checkout-flow.html")));
    expect(stopped).not.toContain("doan-spinner");
    // A waiting request leaves no indicator, but the turn still runs.
    expect(html([card({ drawing: true })], { turn: { turnId: "t1", status: { kind: "waiting" }, at: "2026-11-16T00:00:00.000Z" } })).toContain(SPINNER);
  });

  test("end states: Drawn, Handed off, refusals, cancel and missed", () => {
    expect(html([card()])).toMatch(cardMarkup("checkout-flow.html", "Drawn", svg("check"), OPEN("Open checkout-flow.html")));
    expect(html([card({ handoff: { outcome: "started", target: { conversationId: "c2", canvas: CHECKOUT } } })]))
      .toMatch(cardMarkup("checkout-flow.html", "Handed off", svg("forward"), OPEN("Open the new conversation on checkout-flow.html")));
    expect(html([card({ drawn: false, handoff: { outcome: "refused", reason: "not_new" } })]))
      .toMatch(cardMarkup("checkout-flow.html", "Didn’t hand off. It existed before this turn started.", svg("ban"), OPEN("Open checkout-flow.html")));
    expect(html([card({ canvas: DRAFTS, drawn: false, handoff: { outcome: "refused", reason: "same_canvas" } })]))
      .toMatch(cardMarkup("drafts.html", "Didn’t hand off. It’s this conversation’s own canvas.", svg("ban")));
    expect(html([card({ handoff: { outcome: "cancelled" } })])).toMatch(cardMarkup("checkout-flow.html", "Didn’t hand off. The turn didn’t finish.", svg("ban"), OPEN("Open checkout-flow.html")));
    expect(html([card({ handoff: { outcome: "missed" } })])).toMatch(cardMarkup("checkout-flow.html", "Didn’t hand off. The agent didn’t ask to.", svg("ban"), OPEN("Open checkout-flow.html")));
  });

  test("a canvas gone since: the status gains the tail, Open goes, and neither a cached image nor meta shows", () => {
    const gone = canvasCard(card({ handoff: { outcome: "started", target: { conversationId: "c2", canvas: CHECKOUT } } }), context([[CHECKOUT.path, { kind: "ready", url: "blob:old" }]]), false);
    expect(gone).toMatch(cardMarkup("checkout-flow.html", "Handed off · No longer in doan-design", svg("forward")));
    expect(gone).not.toContain("blob:old");
  });

  // The meta says what the canvas is now: its row, found as canvasListed finds it (sameCanvas), and the root's thumbnail.
  test("a listed canvas: its image in the banner, then the frame count and the modified time with the absolute time as its tooltip", () => {
    const out = canvasCard(card(), context([[CHECKOUT.path, { kind: "ready", url: "blob:1" }]]));
    const banner = `<div class="cc-banner" data-path="${CHECKOUT.path}" aria-hidden="true"><img src="blob:1" alt=""/></div>`;
    expect(out).toMatch(cardMarkup("checkout-flow.html", "Drawn", svg("check"), OPEN("Open checkout-flow.html"),
      `<span class="cc-meta"><span>3 frames</span>${SEP}${time("Edited", at(2), "2m ago")}</span>`, banner));
  });

  test("a renamed canvas keeps its meta: the row is found by ID, not by path", () => {
    const renamed = row(CHECKOUT, { path: ".doan/canvases/checkout-v2.html", frames: [{ id: "a" }] });
    expect(html([card()], { canvasRows: [renamed], canvasListed: canvas => sameCanvas(canvas, renamed) })).toContain("<span>1 frame</span>");
  });

  test("the banner waits with the faint canvas icon before a capture, after a failed one and while the card draws", () => {
    for (const state of [undefined, { kind: "pending" as const }, { kind: "failed" as const }]) {
      const out = canvasCard(card(), context(state ? [[CHECKOUT.path, state]] : []));
      expect(out).toMatch(new RegExp(`<div class="cc-banner empty" data-path="${CHECKOUT.path}" aria-hidden="true">${svg("panels-top-left")}</div>`));
    }
    // Drawing: no image and no frame count yet; the modified time stays.
    const drawing = canvasCard(card({ drawing: true }), context([[CHECKOUT.path, { kind: "ready", url: "blob:1" }]]));
    expect(drawing).not.toContain("blob:1");
    expect(drawing).toMatch(new RegExp(`<span class="cc-meta">${time("Edited", at(2), "2m ago")}</span>`));
  });

  test("a canvas outside .doan/canvases/ names its folder first; no frames and no modified time leave what is known", () => {
    const BUTTON = { path: ".doan/ds/button.html", id: "button" };
    const out = html([card({ canvas: BUTTON })], { canvasRows: [row(BUTTON)] });
    // The folder is its own item, which can shrink and cut with an ellipsis (its full path in the tooltip while cut).
    expect(out).toMatch(new RegExp(`<span class="cc-meta"><span class="cc-folder" data-state="closed" data-slot="tooltip-trigger">.doan/ds</span>${SEP}<span>3 frames</span>${SEP}${time("Edited", at(2), "2m ago")}</span>`));
    const { mtimeMs: _, ...bare } = row(CHECKOUT, { frames: [] });
    expect(html([card()], { canvasRows: [bare] })).toContain('<span class="cc-meta"><span>No frames</span></span>');
  });

  // One line at every width, so neither the width nor the minute's new time changes a card's height (PRODUCT §5 'Canvas
  // cards'); the folder gives way first, the time last.
  test("the meta line never wraps: the folder shrinks first and cuts with an ellipsis, the time cuts last", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const rule = (selector: string) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
    const meta = rule(".conversation-thread .card-head .cc-meta");
    expect(meta).toMatch(/display: flex;/);
    expect(meta).not.toMatch(/flex-wrap: wrap;/);
    expect(meta).toMatch(/overflow: hidden;/);
    expect(rule(".conversation-thread .card-head .cc-meta > span")).toMatch(/flex: none;/);
    // A zero basis: the folder takes only the room the frames and time leave, up to its own text, never less than an ellipsis.
    const folder = rule(".conversation-thread .card-head .cc-meta .cc-folder");
    expect(folder).toMatch(/flex: 1 1 0;/);
    expect(folder).toMatch(/max-width: max-content;/);
    expect(folder).toMatch(/min-width: (?!0;)/);
    expect(folder).toMatch(/overflow: hidden;/);
    expect(folder).toMatch(/text-overflow: ellipsis;/);
    const time = rule(".conversation-thread .card-head .cc-meta > span:has(> time)");
    expect(time).toMatch(/flex: 0 1 auto;/);
    expect(time).toMatch(/min-width: 0;/);
    expect(time).toMatch(/overflow: hidden;/);
    expect(time).toMatch(/text-overflow: ellipsis;/);
  });

  test("the group's name is the file and the status only; the meta never enters it", () => {
    const out = html([card()], { canvasRows: ROWS });
    expect(out).toContain('aria-label="checkout-flow.html, Drawn"');
    expect(out).not.toMatch(/aria-label="[^"]*frames/);
  });

  // A request names a path alone, and the hosts judge and open a canvas by ID (sameCanvas): the root's row with that path
  // lends its ID, or an existing canvas reads as gone and its Open could not find it.
  test("a card that names a path alone takes the ID of the root's row with that path, for its tail and its Open", () => {
    const rows: CanvasRow[] = [{ path: CHECKOUT.path, id: CHECKOUT.id, url: "" }, { path: DRAFTS.path, id: DRAFTS.id, url: "" }];
    const listed = (canvas: { path: string; id?: string }) => rows.some(row => sameCanvas(canvas, row));
    const refused = card({ canvas: { path: CHECKOUT.path }, drawn: false, handoff: { outcome: "refused", reason: "not_new" } });
    expect(html([refused], { canvasRows: rows, canvasListed: listed }))
      .toMatch(cardMarkup("checkout-flow.html", "Didn’t hand off. It existed before this turn started.", svg("ban"), OPEN("Open checkout-flow.html"), "", EMPTY_BANNER));
    const opened: unknown[] = [];
    const element = CanvasCard({ entry: refused, context: { ...NO_CONTEXT, rows }, project: "p", provider: "claude", canvasListed: listed, onOpen: (canvas, id) => opened.push([canvas, id]) });
    (findButton(element)!.props as { onClick(): void }).onClick();
    expect(opened).toEqual([[CHECKOUT, undefined]]);
    // Without a row of that path it stays as named and reads as gone.
    expect(html([refused], { canvasRows: [rows[1]!], canvasListed: listed })).toContain("It existed before this turn started. · No longer in doan-design");
  });

  test("without onOpenHandoff no card offers Open", () => {
    const { onOpenHandoff: _, ...without } = props([card()], { now: NOW });
    expect(renderToStaticMarkup(<TooltipProvider><ConversationThread {...without} /></TooltipProvider>)).not.toContain("cc-open");
  });

  test("a turn's cards stack in one group with the draft's gap, each its own thread item keyed by turn and path", () => {
    const PAYMENT = { path: ".doan/canvases/payment.html", id: "payment" };
    const out = html([agent("Done."), card(), card({ key: `ct1:${PAYMENT.path}`, canvas: PAYMENT })]);
    expect(out).toMatch(new RegExp(`<div class="thread-item"><div class="canvas-cards"><div class="thread-item" data-item="ct1:${CHECKOUT.path}"><div class="card-surface canvas-card"[^]*?</div></div></div></div><div class="thread-item" data-item="ct1:${PAYMENT.path}"><div class="card-surface canvas-card"[^]*?</div></div></div></div></div></div>`));
    expect(out.match(/class="canvas-cards"/g)).toHaveLength(1);
    // Cards split by another item make two stacks.
    expect(html([card(), agent("Then."), card({ key: `ct2:${PAYMENT.path}`, canvas: PAYMENT })]).match(/class="canvas-cards"/g)).toHaveLength(2);
  });

  test("the status line adds the new canvases after the end's title once the turn ended, or says them alone", () => {
    const PAYMENT = { path: ".doan/canvases/payment.html", id: "payment" };
    const two = [card(), card({ key: `ct1:${PAYMENT.path}`, canvas: PAYMENT })];
    const stopped: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "interrupted", reason: "user" } };
    expect(html([stopped, ...two])).toContain('<div class="sr-only" role="status">Stopped. 2 new canvases</div>');
    expect(html([agent("Done."), ...two])).toContain('<div class="sr-only" role="status">2 new canvases</div>');
    expect(html([agent("Done."), two[0]!])).toContain('<div class="sr-only" role="status">1 new canvas</div>');
    const unavailable: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "failed", code: "model_unavailable", model: "gpt-x" } };
    expect(html([unavailable, ...two])).toContain('<div class="sr-only" role="status">gpt-x isn’t available for this account. 2 new canvases</div>');
    // While the turn runs the stage speaks, not the cards.
    expect(html([card({ drawing: true })], running)).toContain('<div class="sr-only" role="status">Claude Code is working</div>');
    // A promoted conversation's "moved to" notice follows the cards: they still count, after the end's title.
    const bound: ThreadItem = { kind: "marker", key: "k9", seq: 9, marker: "bound", canvas: CHECKOUT };
    expect(html([stopped, ...two, bound])).toContain('<div class="sr-only" role="status">Stopped. 2 new canvases</div>');
  });

  test("a Stop that hid the indicator says no new canvases before the turn's end arrives", () => {
    const PAYMENT = { path: ".doan/canvases/payment.html", id: "payment" };
    const drawing = [card({ drawing: true }), card({ key: `ct1:${PAYMENT.path}`, canvas: PAYMENT, drawing: true })];
    const stopping = { turn: { turnId: "t1", status: { kind: "none" as const }, at: "2026-11-16T00:00:00.000Z" } };
    const out = html([agent("Working."), ...drawing], stopping);
    // The cards stop drawing with the indicator, but the status line waits for the turn's end.
    expect(out).not.toContain("doan-spinner");
    expect(out).toContain('<div class="sr-only" role="status"></div>');
    const stopped: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "interrupted", reason: "user" } };
    expect(html([agent("Working."), stopped, ...drawing.map(item => ({ ...item, drawing: false }))], stopping)).toContain('<div class="sr-only" role="status">Stopped. 2 new canvases</div>');
  });

  // The received handoff: the person's bubble fill and width, a meta line naming the source, then the earlier agent's
  // text as Markdown. A labelled group that takes focus after a move; its time is the group's description, hidden on screen.
  const bubble = (entry: Handoff, listed = true, patch: Partial<Parameters<typeof HandoffBubble>[0]> = {}) =>
    drawn(<HandoffBubble entry={entry} project="doan-design" now={NOW} timeId="t" canvasListed={() => listed} onOpen={() => {}} {...patch} />);
  const PANEL_OPEN = (label: string) => `<button type="button" class="doan-button" data-ui-size="xs" data-ui-variant="panel" aria-label="${label}">Open</button>`;
  const NAME = (name: string) => `<span class="ho-name"[^>]*><span class="ho-cut">${name}</span><span class="ho-full" aria-hidden="true">${name}</span></span>`;
  const TIME = (at: Date, text: string) => `<time dateTime="${at.toISOString()}" aria-hidden="true"[^>]*>${text}</time>`;
  const GONE = (reason: string) => `<span class="ho-gone">${reason}</span>`;
  const group = (label: string, described: boolean) => `<div class="msg-user" role="group" aria-label="${label}"${described ? ' aria-describedby="t"' : ""} tabindex="-1" data-entry="">`;
  const meta = (name: string, after: string, open = "", kind = "panels-top-left") =>
    `<div class="bubble md from-agent"><div class="ho-meta">${svg("forward")}<svg[^>]*lucide-${kind}[^>]*aria-hidden="true"[^>]*>.*?</svg>${NAME(name)}${SEP}${after}${open}</div>`;

  test("the received handoff: a labelled focusable group, the meta line, then the text as agent Markdown, a {{1}} kept as typed", () => {
    const out = html([handoff({ text: "Pick up **Payment**.\n\nThe person wrote “{{1}}”." })], { canvasRows: ROWS, now: NOW });
    expect(out).toMatch(new RegExp(`${group("Handoff from drafts.html", true).replace('"t"', '"[^"]+"')}${meta("drafts.html", TIME(at(-1), "5m ago"), PANEL_OPEN("Open drafts.html"))}<p>Pick up <strong>Payment</strong>.</p>\\s*<p>The person wrote “\\{\\{1\\}\\}”.</p></div><span id="[^"]+" hidden="">5 minutes ago</span></div>`));
    // No card, no image, no frame count, no "From" or direction words.
    for (const gone of ["card-surface", "cc-banner", "frames", "From", "Handed off"]) expect(out).not.toContain(gone);
  });

  // The measured text width rounds up and the box width down, so a box exactly as wide as the name must still keep it whole.
  test("a meta name that fits by a fraction of a pixel is not cut; a narrower box cuts it in the middle", () => {
    const measure = (text: string) => Math.ceil(text.length * 5.7934);
    expect(metaNameKeep("drafts.html", 63.7265625, 63.7265625, measure)).toBeNull();
    expect(metaNameKeep("drafts.html", 80, 63.7265625, measure)).toBeNull();
    expect(metaNameKeep("drafts.html", 52.5, 63.7265625, measure)).toBe(7);
  });

  test("the same time element from just now to 1m ago, so only its words change", () => {
    const just = bubble(handoff({ at: new Date(NOW - 20_000).toISOString() }));
    const later = bubble(handoff({ at: new Date(NOW - 20_000).toISOString() }), true, { now: NOW + 60_000 });
    expect(just).toContain(">just now</time>");
    expect(later).toContain(">1m ago</time>");
    expect(later.replace(/>1m ago</, ">just now<").replace(/>1 minute ago</, ">Just now<")).toBe(just);
  });

  test("the source canvas gone: its reason in place of the time and Open, and no description", () => {
    const out = bubble(handoff(), false);
    expect(out).toMatch(new RegExp(`^${group("Handoff from drafts.html · No longer in doan-design", false)}${meta("drafts.html", GONE("No longer in doan-design"))}`));
    expect(out).not.toMatch(/<time|<button|hidden=""/);
  });

  // A project conversation's handoff: the source is the root's Overview, and Open shows the source conversation there.
  test("from the Overview: its icon and name, Open shows the source conversation; a deleted one shows its reason; unknown reads as there", () => {
    const fromOverview = handoff({ origin: { kind: "handoff", conversationId: "c0" } });
    expect(bubble(fromOverview, false, { conversationListed: () => true, onOpenOverview: () => {} }))
      .toMatch(new RegExp(`^${group("Handoff from Overview", true)}${meta("Overview", TIME(at(-1), "5m ago"), PANEL_OPEN("Open the source conversation in the Overview"), "layout-grid")}`));
    expect(bubble(fromOverview, true, { conversationListed: () => false, onOpenOverview: () => {} }))
      .toMatch(new RegExp(`^${group("Handoff from Overview · Conversation deleted", false)}${meta("Overview", GONE("Conversation deleted"), "", "layout-grid")}`));
    // Without the host's answer (the prototype window before main replies) the source counts as there.
    expect(bubble(fromOverview, false, { onOpenOverview: () => {} })).toContain(PANEL_OPEN("Open the source conversation in the Overview"));
    // Without the host's Open the line has none.
    expect(bubble(fromOverview, false, { conversationListed: () => true })).not.toContain("<button");
  });

  test("Open on a handed-off card opens the target conversation, on any other the canvas alone, on the received handoff the source conversation", () => {
    const opened: unknown[] = [];
    const onOpen = (canvas: unknown, id?: string) => opened.push([canvas, id]);
    const cardOf = (entry: Card) => CanvasCard({ entry, context: NO_CONTEXT, project: "p", provider: "claude", canvasListed: () => true, onOpen });
    const handoffEl = HandoffBubble({ entry: handoff({ text: "x" }), project: "p", now: NOW, timeId: "t", canvasListed: () => true, onOpen });
    for (const element of [cardOf(card({ handoff: { outcome: "started", target: { conversationId: "c2", canvas: CHECKOUT } } })), cardOf(card({ handoff: { outcome: "missed" } })), cardOf(card()), handoffEl]) {
      (findButton(element)!.props as { onClick(): void }).onClick();
    }
    expect(opened).toEqual([[CHECKOUT, "c2"], [CHECKOUT, undefined], [CHECKOUT, undefined], [DRAFTS, "c0"]]);
    const shown: string[] = [];
    const overviewEl = HandoffBubble({ entry: handoff({ origin: { kind: "handoff", conversationId: "c0" } }), project: "p", now: NOW, timeId: "t", canvasListed: () => false, conversationListed: () => true, onOpenOverview: id => shown.push(id) });
    (findButton(overviewEl)!.props as { onClick(): void }).onClick();
    expect(shown).toEqual(["c0"]);
  });

  test("a person's message after it is a plain bubble: only the meta line tells them apart", () => {
    const user: ThreadItem = { kind: "user", key: "u5", seq: 5, anchors: [], preset: null, parts: [{ text: "Add the declined-card state" }], attachments: [] };
    const out = html([handoff(), user], { now: NOW });
    expect(out).toContain('<div class="msg-user"><div class="bubble">Add the declined-card state</div></div>');
    expect(out.match(/class="ho-meta"/g)).toHaveLength(1);
  });
});

// The received handoff bubble's CSS: jsdom lays nothing out, so the rules are pinned.
describe("the received handoff bubble's rules", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const body = (selector: string) => {
    const at = css.indexOf(` ${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  };
  test("the bubble's Markdown wraps as Markdown, not as the person's pre-wrap text", () => {
    expect(body(".conversation-thread .bubble.from-agent")).toContain("white-space: normal;");
  });
  test("the meta line never wraps, so the bubble keeps its height as the time's words change", () => {
    expect(body(".conversation-thread .ho-meta")).toContain("white-space: nowrap;");
    expect(body(".conversation-thread .ho-meta")).toContain("border-bottom: 1px solid var(--border-standard);");
  });
  // A far larger shrink factor cuts the name first, down to 3em; only then the reason; Open never cuts.
  test("the name cuts first down to 3em, then the gone source's reason; Open and the time never cut", () => {
    expect(body(".conversation-thread .ho-meta .ho-name")).toMatch(/flex: 0 1000 auto; min-width: 3em;/);
    expect(body(".conversation-thread .ho-meta .ho-gone")).toMatch(/flex: 0 1 auto; min-width: 0;/);
    expect(body(".conversation-thread .ho-meta :is(svg, .sep, time, .doan-button)")).toContain("flex: none;");
  });
  test("a thread 275px wide or less hides the time and its dot", () => {
    expect(css).toContain(" .conversation-thread .thread { container: doan-thread / inline-size; }");
    expect(css).toContain("@container doan-thread (max-width: 275px) { .conversation-thread .ho-meta :is(time, .sep:has(+ time)) { display: none; } }");
  });
  // Without its own container a body chip's 100cqw read the thread, wider than the bubble, and the chip overflowed it.
  test("a canvas chip in the bubble's body caps at the group's width less the bubble's padding and icon margin; replies and cards keep theirs", () => {
    expect(body(".conversation-thread .msg-user:has(> .from-agent)")).toBe(" width: 100%; container-type: inline-size; ");
    expect(body(".conversation-thread .from-agent .anchor-chip span.chip-canvas"))
      .toBe(" max-width: calc(100cqw - 2 * var(--space-4) - 2 * var(--space-1h) - var(--size-icon-sm) - 2 * var(--space-1) - 1em); ");
    // A bubble's chip icon keeps a margin a reply's has not.
    expect(body(".bubble .anchor-chip svg")).toContain("margin-right: var(--space-1);");
    // The bubble's own padding is what the group's width holds beyond the bubble's content.
    expect(body(".conversation-thread .bubble")).toContain("padding: var(--space-2) var(--space-4);");
    // A reply's and a card's chips keep their own nearer containers.
    expect(css).toContain(" .conversation-thread .msg-agent { container-type: inline-size; }");
    expect(body(".conversation-thread .card-surface")).toContain("container-type: inline-size;");
    expect(css).toContain(" .anchor-chip span.chip-canvas { white-space: pre; margin-left: calc(-1 * var(--space-1)); max-width: calc(100cqw - 2 * var(--space-1h) - var(--size-icon-sm) - var(--space-1) - 1em); }");
  });
  test("focus on the group rings its bubble", () => {
    expect(body(".conversation-thread .msg-user[role=\"group\"]:focus-visible")).toContain("outline: none;");
    expect(body(".conversation-thread .msg-user[role=\"group\"]:focus-visible > .bubble")).toContain("outline: 2px solid var(--border-focus);");
  });
});
function findButton(node: unknown): ReactElement | null {
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === "button") return element;
  for (const child of [element.props.children].flat()) { const found = findButton(child); if (found) return found; }
  return null;
}

// A turn the handoff card started was not the person's message, so its end never offers Edit and resend; Sign in again
// stays, and a later turn of the person's resends.
describe("the end of a handoff card's turn", () => {
  const card: ThreadItem = { kind: "handoffCard", key: "u1", seq: 1, origin: { kind: "handoff", conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } }, text: "Continue.", at: "2026-11-25T05:00:00.000Z" };
  const failed = (code: "process_exited" | "not_logged_in", key = "e3"): ThreadItem => ({ kind: "end", key, seq: 3, end: { kind: "failed", code } });
  test("offers no Edit and resend, keeps the notice and Sign in again", () => {
    const out = html([card, failed("process_exited")]);
    expect(out).toContain("<b>Claude Code stopped unexpectedly</b>");
    expect(out).not.toContain("Edit and resend");
    const signIn = html([card, { kind: "end", key: "x1", seq: null, end: { kind: "interrupted", reason: "crashed" } }]);
    expect(signIn).not.toContain("Edit and resend");
    const expired = html([card, failed("not_logged_in")]);
    expect(expired).toContain(">Sign in again</button>");
    expect(expired).not.toContain("Edit and resend");
  });
  test("a later turn of the person's still offers it", () => {
    const user: ThreadItem = { kind: "user", key: "u5", seq: 5, anchors: [], preset: null, parts: [{ text: "Use the red" }], attachments: [] };
    expect(html([card, { kind: "agent", key: "m1", messageId: "m1", text: "Done.", streaming: false }, user, failed("process_exited", "e7")])).toContain(">Edit and resend</button>");
  });
});

test("a chip ends a preceding skill word but cannot start a following one", () => {
  const out = html([{ kind: "user", key: "skills", seq: 1, preset: null, skills: ["deploy"], attachments: [],
    anchors: [{ frame: { id: "cart", title: "Cart" } }], parts: [{ text: "/deploy" }, { anchor: 1 }, { text: "/deploy /deploy" }] }]);
  expect(out.match(/class="skill-word"/g)).toHaveLength(2);
  expect(out).toContain('<span class="skill-word">/deploy</span>');
  expect(out).toContain('/deploy <span class="skill-word">/deploy</span>');
});

// A reply link the browser does not open says so in a toast: what failed, then the address last with no period, so
// selecting it copies only the address.
describe("openReplyLink", () => {
  const url = "https://developer.mozilla.org/en-US/docs/Web/CSS/clamp";
  const text = `Couldn’t open the link in your browser. Try again, or open it at ${url}`;
  test("a browser that did not open, or a failed call, shows the failure with the address", async () => {
    const notice = vi.fn();
    await openReplyLink(async () => false, url, notice);
    expect(notice).toHaveBeenLastCalledWith(text);
    await openReplyLink(() => Promise.reject(new Error("ipc")), url, notice);
    expect(notice).toHaveBeenLastCalledWith(text);
    expect(notice).toHaveBeenCalledTimes(2);
  });
  test("an opened link shows nothing", async () => {
    const notice = vi.fn();
    await openReplyLink(async () => true, url, notice);
    expect(notice).not.toHaveBeenCalled();
  });
});

// DESIGN 'Busy action' and 'Accessible names': Retry is described by the notice's text and busy while its read runs; a
// repeat failure changes the line by a no-break space so the alert reads it again.
describe("the read error's Retry", () => {
  test("is named Retry and described by the notice text", () => {
    const out = html("error");
    const described = /<button[^>]*aria-describedby="([^"]+)"[^>]*>Retry<\/button>/.exec(out)?.[1];
    expect(described).toBeDefined();
    expect(out).toContain(`<span class="strip-text selectable" id="${described}">`);
    expect(out).not.toMatch(/<button[^>]*aria-label/);
  });
  test("is busy while the read runs", () => {
    const out = html("error", { retry: { running: true, failures: 0 } });
    expect(out).toContain('aria-busy="true"');
    expect(out).toMatch(/<span class="doan-spinner" aria-hidden="true"><\/span>Retry<\/button>/);
    expect(out).toContain("Try again. If it keeps failing, start a new conversation.</span>");
  });
  test("a repeat failure changes the line so it is read again", () => {
    expect(html("error", { retry: { running: false, failures: 1 } })).toContain("Try again. If it keeps failing, start a new conversation. </span>");
  });
});

// Blocks carry role="list"/"listitem", never ul/ol, so the marker and depth spaces are text Chromium copies.
describe("a sent list", () => {
  const user = (text: string, extra: Partial<Extract<ThreadItem, { kind: "user" }>> = {}): ThreadItem =>
    ({ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, attachments: [], parts: [{ text }], ...extra });
  // The bubble's inner markup, up to its own closing tag.
  function bubble(item: ThreadItem): string {
    const out = html([item]), start = out.indexOf('<div class="bubble">') + '<div class="bubble">'.length;
    let depth = 1;
    for (const tag of out.slice(start).matchAll(/<(\/?)div\b/g)) {
      depth += tag[1] ? -1 : 1;
      if (depth === 0) return out.slice(start, start + tag.index);
    }
    throw new Error("no bubble");
  }
  const decode = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  // Chromium's copy of a selection over the bubble: a block element starts a new line once, and a block's own last line break
  // is neither drawn nor copied. Inline spans add no break.
  function copied(markup: string): string {
    let out = "", lineBreak = false, sinceBreak = "";
    const blocks: boolean[] = [];
    const boundary = () => { if (sinceBreak.endsWith("\n")) out = out.slice(0, -1); sinceBreak = ""; if (out) lineBreak = true; };
    for (const [, close, tag, attrs, text] of markup.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+)/g)) {
      if (text !== undefined) {
        if (lineBreak) { out += "\n"; lineBreak = false; }
        const value = decode(text);
        out += value; sinceBreak += value;
        continue;
      }
      if (close) { if (blocks.pop()) boundary(); continue; }
      const block = tag === "div" || /class="bubble-text"/.test(attrs!);
      if (/\/$/.test(attrs!) || ["path", "circle", "rect", "line", "polyline"].includes(tag!)) { if (!/\/$/.test(attrs!)) blocks.push(false); continue; }
      blocks.push(block);
      if (block) boundary();
    }
    return out;
  }

  test.each([
    "- a\n- b",
    "Before:\n- a\n  - b\n    - c\n- d\nAfter",
    "1. a\n1. b\n   - c\n2. d",
    "- a\n\n- b",
    "Intro\n\n- a\n\n\nOutro",
    "- \n- b\n*  three spaces",
    "\t- tab\n  - two",
    "  - indented first line\nplain **bold** `code`\n# heading\n---",
    "9. a\n10. b\n100. c",
  ])("copying the bubble gives back the sent text: %j", text => {
    const markup = bubble(user(text));
    expect(markup).toContain('role="list"');
    expect(copied(markup)).toBe(text);
  });

  test("the copy model reads a plain message as before", () => {
    expect(copied(bubble(user("One\ntwo\n\nthree")))).toBe("One\ntwo\n\nthree");
  });

  test("items are role list blocks with the marker and depth as text spans; numbers as typed", () => {
    const markup = bubble(user("1. a\n1. b\n   - c"));
    expect(markup).not.toMatch(/<(ul|ol|li)\b/);
    expect(markup).toBe('<div class="bubble-list" role="list">'
      + '<div class="bubble-item" role="listitem"><span class="list-mark" data-kind="ol" data-mark="1.28">1. </span><span class="bubble-item-body" data-depth="0" data-mark="1.28">a</span></div>'
      + '<div class="bubble-item" role="listitem"><span class="list-mark" data-kind="ol" data-mark="1.28">1. </span><span class="bubble-item-body" data-depth="0" data-mark="1.28">b</span>'
      + '<div class="bubble-list" role="list"><div class="bubble-item" role="listitem"><span class="list-depth" data-depth="1">   </span><span class="list-mark" data-kind="ul" data-mark="0">- </span><span class="bubble-item-body" data-depth="1" data-mark="0">c</span></div></div>'
      + '</div></div>');
  });

  // The marker column fits the list's widest marker, so "9.", "10." and "100." bodies line up.
  test("a numbered list's marker column counts its widest number", () => {
    expect(bubble(user("9. a\n10. b\n100. c")).match(/data-mark="[^"]*"/g)).toEqual(Array(6).fill('data-mark="3.28"'));
  });

  test("a message without a list draws as plain text, other Markdown included", () => {
    const markup = bubble(user("**bold** `code`\n# heading\n2026. 11. 19. review"));
    expect(markup).toBe("**bold** `code`\n# heading\n2026. 11. 19. review");
  });

  test("chips and skill words stay in place inside items; a chip-led line is not an item", () => {
    const markup = bubble(user("", { skills: ["copy-check"], anchors: [{ frame: { id: "hero", title: "Hero" } }],
      parts: [{ text: "- Align " }, { anchor: 1 }, { text: " /copy-check\n" }, { anchor: 1 }, { text: " - stays" }] }));
    expect(markup).toMatch(/^<div class="bubble-list" role="list"><div class="bubble-item" role="listitem"><span class="list-mark" data-kind="ul" data-mark="0">- <\/span><span class="bubble-item-body" data-depth="0" data-mark="0">Align <span class="anchor-chip"[^>]*>.*?<span>Hero<\/span><\/span> <span class="skill-word">\/copy-check<\/span><\/span><\/div><\/div><span class="bubble-text"><span class="anchor-chip"[^>]*>.*?<span>Hero<\/span><\/span> - stays<\/span>$/);
    expect(copied(markup)).toBe("- Align Hero /copy-check\nHero - stays");
  });

  test("a chip right before an item's skill word still ends no word", () => {
    const markup = bubble(user("", { skills: ["deploy"], anchors: [{ frame: { id: "cart", title: "Cart" } }], parts: [{ text: "- /deploy" }, { anchor: 1 }, { text: "/deploy /deploy" }] }));
    expect(markup.match(/class="skill-word"/g)).toHaveLength(2);
  });

  test("the preset line keeps its own line before a list, and the bubble has no Copy button", () => {
    const out = html([user("- a", { preset: { id: "shape", title: "Shape" } })]);
    expect(out).toMatch(/Shape<\/span><div class="bubble-list" role="list">/);
    expect(bubble(user("- a"))).not.toMatch(/<button/);
  });
});

// Forced colours replace every background with Canvas and drop shadows, so a fill-only shape reads as plain text. Pure CSS
// that jsdom cannot emulate, so this pins the rules.
test("under forced colours the sent bubble, fill-only blocks and Jump to latest keep a visible edge", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const block = css.match(/@media \(forced-colors: active\) \{\n  \.conversation-thread [\s\S]*?\n\}/)?.[0] ?? "";
  expect(block).toContain(".conversation-thread :is(.bubble, .md-code, .md blockquote, .md-table, .msg-files .attach-chip) { border: 1px solid CanvasText; }");
  expect(block).toContain(".conversation-thread .jump-latest { border: 1px solid ButtonText; }");
});
