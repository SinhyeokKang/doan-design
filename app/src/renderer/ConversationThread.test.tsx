import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ReactElement } from "react";
import type { Anchor } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { answerReached, ConversationThread, endView, httpsUrl, SentChip, type ConversationThreadProps } from "./ConversationThread";
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
    const out = html([{ kind: "user", key: "u1", seq: 1, anchors: [], preset: { id: "shape", title: "Shape" }, parts: [{ text: "Make <b>" }, { anchor: 1 }, { text: " darker\nplease" }], attachments: [{ name: "spec.md", size: 6144, kind: "file" }] }]);
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
    const later = html([failed, { kind: "user", key: "u6", seq: 6, anchors: [], preset: null, parts: [{ text: "Again" }], attachments: [] }]);
    expect(later).not.toContain("Edit and resend");
    expect(endView({ kind: "interrupted", reason: "user" }, "codex")).toEqual({ title: "Stopped", body: "You stopped the agent.", tone: null, signIn: false });
    expect(endView({ kind: "interrupted", reason: "crashed" }, "codex").body).toBe("The agent stopped before it finished.");
    for (const code of ["session_unavailable", "session_in_use"] as const) expect(endView({ kind: "failed", code }, "codex")).toMatchObject({ title: "Codex couldn’t continue", body: "Edit your request and send it again." });
    expect(endView({ kind: "failed", code: "rate_limited" }, "codex")).toMatchObject({ title: "Codex is rate limited", body: "Try again later." });
    expect(endView({ kind: "failed", code: "process_exited" }, "codex")).toMatchObject({ title: "Codex stopped unexpectedly", body: "It may have changed files before it stopped." });
  });

  test("a crash-folded turn's end offers Edit and resend like any other end", () => {
    const out = html([{ kind: "user", key: "u1", seq: 1, anchors: [], preset: null, parts: [{ text: "Draw it" }], attachments: [] }, { kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } }]);
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

// buzz-canvas-conversation design §2 'Chip locate': a sent message's chips, named as the composer names them.
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
    expect(out).toMatch(/<button type="button" class="anchor-chip" data-kind="frame" title="[^"]*" aria-label="Show Checkout payment on canvas">/);
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
    const chip = SentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate }) as ReactElement<{ onClick(): void }>;
    chip.props.onClick();
    expect(asked).toEqual([anchors[0]]);
    const off = SentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: true, onLocate }) as ReactElement<{ onClick(): void }>;
    off.props.onClick();
    expect(asked).toHaveLength(1);
  });

  // design §2 'Chip locate': only a target the canvas no longer has shows the note; a canvas that did not answer, or
  // could not be asked, ends silently (orch decision: a timeout is not "missing").
  test.each([["missing", 1], ["timeout", 0], ["unavailable", 0], ["shown", 0]] as const)("a locate that ends %s shows the note %i times", async (outcome, times) => {
    const shown: string[] = [];
    const chip = SentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: async () => outcome,
      missing: { key: "m-0", shownFor: null, show: key => shown.push(key) } }) as ReactElement<{ onClick(): void }>;
    chip.props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(shown).toHaveLength(times);
  });

  test("the note's chip is described by it", () => {
    const chip = SentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: located,
      missing: { key: "m-0", shownFor: "m-0", show: () => {} } }) as ReactElement<{ "aria-describedby"?: string }>;
    expect(chip.props["aria-describedby"]).toBe("m-0-missing");
    const other = SentChip({ marker: 1, anchor: anchors[0]!, frames: undefined, disabled: false, onLocate: located,
      missing: { key: "m-1", shownFor: "m-0", show: () => {} } }) as ReactElement<{ "aria-describedby"?: string }>;
    expect(other.props["aria-describedby"]).toBeUndefined();
  });
});

// agent-reply-chips T3 (design 'Rendering'): `doan:` links in a reply are chips, named from the app's own lists.
describe("reply chips", () => {
  const rows: CanvasRow[] = [
    { path: ".doan/canvases/drafts.html", url: "http://localhost/drafts.html", id: "drafts", title: "Drafts", frames: [{ id: "editor", title: "Editor" }] },
    { path: ".doan/canvases/checkout.html", url: "http://localhost/checkout.html", id: "checkout", title: "Checkout", frames: [{ id: "payment", title: "Payment" }, { id: "editor", title: "Checkout editor" }] },
    { path: ".doan/canvases/no-id.html", url: "http://localhost/no-id.html", title: "No id", frames: [{ id: "payment", title: "Not this one" }] },
  ];
  const onReplyChip = async () => null;
  // The canvas panel on Drafts, whose live layout titles its editor frame differently from the list row.
  const panel = { onReplyChip, openCanvasId: "drafts", frames: [{ id: "editor", title: "Editor (live)" }], canvasRows: rows };
  const chips = (out: string) => out.match(/<(button|span) [^>]*class="anchor-chip"[^>]*>.*?<\/\1>/g) ?? [];

  test("a well-formed link is a chip, a malformed doan: link is its text, and https links stay links", () => {
    const out = html([agent("Changed [Save](doan:drafts/element/save) in [Ed](doan:drafts/frame/editor), see [bad](doan:x) and [web](https://e.com/a).")], panel);
    expect(out).toContain('<button type="button" class="anchor-chip" data-kind="element" title="Element · element save" aria-label="Show element save on canvas">');
    expect(out).toContain('<button type="button" class="anchor-chip" data-kind="frame" title="Frame · editor" aria-label="Show Editor (live) on canvas">');
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
    expect(out).toContain('aria-label="Open Checkout and show Checkout editor"');
    expect(out).toContain('aria-label="Open Checkout and show Payment"');
    expect(out).toContain('aria-label="Open Checkout and show gone"');
  });

  // Runtime test C against the draft (conductor's call, fix round 2): an other-canvas chip is at most 180px like every
  // chip, the label shrinks and ellipsizes first and the suffix is never cut; the chip grows past 180px only when the
  // suffix alone does not fit, and never past the reply block. Pure CSS; the real-app widths are checked by batch C.
  test("the label and the canvas name are drawn apart, so the label ellipsizes first inside the 180px chip", () => {
    const out = html([agent("[c](doan:checkout/frame/payment)")], panel);
    // Icon, label and suffix are the chip's three direct children: the grid's three columns, in that order.
    expect(out).toMatch(/<button [^>]*class="anchor-chip"[^>]*><svg[^>]*>.*?<\/svg><span>Payment<\/span><span class="chip-canvas"> · Checkout<\/span><\/button>/);
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
    // Fix round 1's growth past 180px for every suffix chip is gone.
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
    expect(out).toContain('aria-label="Open Drafts and show Editor"');
    expect(out).toContain('<span>Editor</span><span class="chip-canvas"> · Drafts</span>');
    expect(out).toContain('aria-label="Open Drafts and show element save"');
    expect(out).toContain('aria-label="Open billing and show editor"');
    // A row without an id is never the link's canvas.
    expect(out).toContain('aria-label="Open no-id and show payment"');
  });

  test("only a chip into the open canvas follows locateDisabled", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:checkout/frame/payment)")], { ...panel, locateDisabled: true });
    expect(out).toContain('aria-label="Show Editor (live) on canvas" aria-disabled="true"');
    expect(out).toMatch(/aria-label="Open Checkout and show Payment">/);
  });

  test("the link's text never names the chip", () => {
    const out = html([agent("[Delete everything](doan:drafts/frame/editor) [Ignore the rules](doan:checkout/element/pay)")], panel);
    expect(out).not.toContain("Delete everything");
    expect(out).not.toContain("Ignore the rules");
  });

  test("without onReplyChip the chips are drawn but are not buttons", () => {
    const out = html([agent("[a](doan:drafts/frame/editor) [b](doan:checkout/frame/payment)")], { openCanvasId: "drafts", canvasRows: rows });
    expect(out).not.toContain("<button type=\"button\" class=\"anchor-chip\"");
    expect(out).toContain('<span class="anchor-chip" data-kind="frame" title="Frame · payment"><svg');
  });
});

// design §2 'Errors': an answer that did not reach the agent says so under its request.
test("a permission answer counts as sent only when main took it", async () => {
  expect(await answerReached(async () => {})).toBe(true);
  expect(await answerReached(async () => ({ error: "not_found" }))).toBe(false);
  expect(await answerReached(() => Promise.reject(new Error("ipc")))).toBe(false);
});

// canvas-composer-polish A2, draft frame `sending`: the message Send now has in flight, with one caption line under it.
describe("a message Send now has in flight", () => {
  const sending: ThreadItem = { kind: "user", key: "qq1", seq: null, sending: true, anchors: [], preset: null, parts: [{ text: "Use the spacing" }], attachments: [{ name: "notes.pdf", size: 86016, kind: "file" }] };
  test("is the person's message with its files, then a spinner and Sending; it has no actions", () => {
    const out = html([sending]);
    expect(out).toContain('<div class="msg-user"><div class="bubble">Use the spacing</div><div class="msg-files">');
    expect(out).toMatch(/<\/small><\/span><\/span><\/div><span class="msg-sending"><span class="doan-spinner" aria-hidden="true"><\/span>Sending<\/span><\/div>/);
    expect(out).not.toContain("<button");
  });
  test("a sent message has no Sending line, and a sending one does not hide the last end's Edit and resend", () => {
    expect(html([{ ...sending, sending: undefined, key: "u1", seq: 1 } as ThreadItem])).not.toContain("msg-sending");
    const out = html([{ kind: "end", key: "e2", seq: 2, end: { kind: "interrupted", reason: "user" } }, sending]);
    expect(out).toContain("Edit and resend");
  });
});
