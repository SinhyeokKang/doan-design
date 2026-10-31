import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ConversationThread, endView, httpsUrl, type ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

const noop = () => {};
const props = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
  items, conversationId: "c1", provider: "claude", project: "doan-design", liveAfter: 0, canvasListed: () => true,
  onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
});
const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<ConversationThread {...props(items, patch)} />);
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
    expect(out).toContain('<div class="md-code"><pre><code>$ doan check\n</code></pre><button type="button" class="doan-icon-button" data-ui-size="xs" aria-label="Copy code">');
    expect(out).toContain('<div class="md-table"><table><thead><tr><th>A</th><th>B</th></tr></thead>');
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

  test("httpsUrl", () => {
    expect(httpsUrl("https://example.com")).toBe("https://example.com/");
    expect(httpsUrl(" javascript:alert(1)")).toBeNull();
    expect(httpsUrl(undefined)).toBeNull();
    expect(httpsUrl("/relative")).toBeNull();
  });
});

describe("thread items", () => {
  test("the person's message: plain text that keeps its line breaks, the preset line, anchors in place and sent files", () => {
    const out = html([{ kind: "user", key: "u1", seq: 1, preset: { id: "shape", title: "Shape" }, parts: [{ text: "Make <b>" }, { anchor: 1 }, { text: " darker\nplease" }], attachments: [{ name: "spec.md", size: 6144, kind: "file" }] }]);
    expect(out).toContain('<div class="msg-user"><div class="bubble"><span class="bubble-preset">');
    expect(out).toContain("Shape</span>\nMake &lt;b&gt;<span class=\"bubble-anchor\">{{1}}</span> darker\nplease</div>");
    expect(out).toContain('<div class="msg-files"><span class="attach-chip"><span class="file-icon" aria-hidden="true">');
    expect(out).toContain("<b>spec.md</b><small>6 KB</small>");
  });

  test("an activity line is a disclosure button; a running one has a spinner", () => {
    const out = html([{ kind: "activity", key: "a3", running: true, head: "Editing a.html", steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.html" }] }]);
    expect(out).toMatch(/<button type="button" class="activity-head" aria-expanded="false"><span class="doan-spinner" aria-hidden="true"><\/span><span>Editing a.html<\/span>/);
    expect(out).not.toContain("activity-steps");
  });

  test("a permission request that arrived live is an alert; one drawn from history is not; no choice is the default", () => {
    const ask = (seq: number): ThreadItem => ({ kind: "permission", key: "pr1", seq, requestId: "r1", summary: "Run doan check", options: [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }], status: "pending", answer: null });
    const live = html([ask(5)], { liveAfter: 4 }), history = html([ask(5)], { liveAfter: 5 });
    expect(live).toContain('<div class="doan-notice thread-notice" role="alert">');
    expect(history).toContain('<div class="doan-notice thread-notice">');
    expect(live).toContain("<b>Claude Code needs your answer</b><span>Run doan check</span>");
    expect(live).toContain('data-ui-variant="prominent" data-request="r1">Allow once</button>');
    expect(live).not.toContain("autofocus");
    expect(live).toMatch(/<button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*lucide-circle-stop[^>]*>.*<\/svg>Stop<\/button>/);
  });

  test("answered and expired requests shrink to one line", () => {
    const base = { kind: "permission" as const, key: "pr1", seq: 5, requestId: "r1", summary: "Run doan check", options: [] };
    expect(html([{ ...base, status: "answered", answer: { id: "a", label: "Allow once", kind: "allow" } }])).toContain('<div class="activity-head ask-answered"><span>Allowed once · Run doan check</span></div>');
    expect(html([{ ...base, status: "expired", answer: null }])).toContain("<span>Expired without an answer · Run doan check</span>");
  });

  test("turn ends: Edit and resend only on the last turn's end; sign-in expiry adds Sign in again…", () => {
    const failed: ThreadItem = { kind: "end", key: "e5", seq: 5, end: { kind: "failed", code: "not_logged_in" } };
    const out = html([failed]);
    expect(out).toContain('<div class="doan-notice error thread-notice">');
    expect(out).toContain("<b>Claude Code’s sign-in expired</b><span>Sign in again, then resend your request.</span>");
    expect(out).toContain(">Sign in again…</button>");
    expect(out).toContain(">Edit and resend</button>");
    const later = html([failed, { kind: "user", key: "u6", seq: 6, preset: null, parts: [{ text: "Again" }], attachments: [] }]);
    expect(later).not.toContain("Edit and resend");
    expect(endView({ kind: "interrupted", reason: "user" }, "codex")).toEqual({ title: "Stopped", body: "You stopped the agent.", tone: null, signIn: false });
    expect(endView({ kind: "interrupted", reason: "crashed" }, "codex").body).toBe("The agent stopped before it finished.");
    for (const code of ["session_unavailable", "session_in_use"] as const) expect(endView({ kind: "failed", code }, "codex")).toMatchObject({ title: "Codex couldn’t continue", body: "Edit your request and send it again." });
    expect(endView({ kind: "failed", code: "rate_limited" }, "codex")).toMatchObject({ title: "Codex is rate limited", body: "Try again later." });
    expect(endView({ kind: "failed", code: "process_exited" }, "codex")).toMatchObject({ title: "Codex stopped unexpectedly", body: "It may have changed files before it stopped." });
  });

  test("a crash-folded turn's end offers Edit and resend like any other end", () => {
    const out = html([{ kind: "user", key: "u1", seq: 1, preset: null, parts: [{ text: "Draw it" }], attachments: [] }, { kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } }]);
    expect(out).toContain("<b>Stopped</b><span>The agent stopped before it finished.</span>");
    expect(out).toContain(">Edit and resend</button>");
  });

  test("markers: promotion with Open, turned off once the canvas is gone; archive and restore", () => {
    const bound: ThreadItem = { kind: "marker", key: "k5", seq: 5, marker: "bound", canvas: { path: ".doan/canvases/buzz-settings.html", id: "s" } };
    expect(html([bound])).toMatch(/Moved to buzz-settings.html<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="trigger">Open<\/button>/);
    expect(html([bound], { canvasListed: () => false })).toMatch(/Moved to buzz-settings.html · No longer in doan-design<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="trigger" disabled="">Open<\/button>/);
    expect(html([{ kind: "marker", key: "k6", seq: 6, marker: "archived", canvas: null }])).toContain("Archived when another conversation became current on this canvas. Send a message to make it current again.");
    expect(html([{ kind: "marker", key: "k7", seq: 7, marker: "restored", canvas: null }])).toContain("Made current again");
  });

  test("two messages with footnotes never share an id", () => {
    const out = html([agent("One[^1]\n\n[^1]: note"), { kind: "agent", key: "m2", messageId: "m2", text: "Two[^1]\n\n[^1]: note", streaming: false }]);
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map(m => m[1]!);
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => id.endsWith("footnote-label"))).toHaveLength(2);
  });

  test("no reply, the phase status and stable item keys", () => {
    const out = html([{ kind: "noReply", key: "n4" }, { kind: "activity", key: "a5", running: true, head: "Reading x", steps: [] }]);
    expect(out).toContain('<div class="msg-agent"><p class="muted">No reply.</p></div>');
    expect(out).toContain('data-item="n4"');
    expect(out).toContain('<div class="sr-only" role="status">Claude Code is working</div>');
  });
});

describe("loading and read errors", () => {
  test("nothing shows before 300ms of loading", () => {
    expect(html(null)).toBe('<div class="conversation-thread"></div>');
  });
  test("a read error replaces the thread with a notice and Retry", () => {
    const out = html("error");
    expect(out).toContain('<div class="doan-notice error thread-notice" role="alert">');
    expect(out).toContain("<b>Doan couldn’t read this conversation</b><span>Try again. If it keeps failing, start a new conversation.</span>");
    expect(out).toContain(">Retry</button>");
  });
});

// Tailwind's preflight and styles.css's own `ol { list-style: none; }` would hide the markers; static markup cannot
// show that, so the rules are pinned here (their look is compared when buzz-project places the thread).
test("agent reply lists keep their bullets and numbers", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const rules = [".conversation-thread .md ul { list-style: disc; }", ".conversation-thread .md ol { list-style: decimal; }", ".conversation-thread .md ul ul { list-style: circle; }"];
  for (const rule of rules) expect(css).toContain(rule);
  // After the global ol reset, so the thread's rule is the later one.
  expect(css.indexOf(rules[1]!)).toBeGreaterThan(css.indexOf("ol { list-style: none; }"));
});
