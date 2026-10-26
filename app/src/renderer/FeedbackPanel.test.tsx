import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Comment, Target } from "../formats/types";
import type { ProjectComments } from "../main/projectComments";
import type { CanvasRow, OrphanFile } from "../main/view";
import { OrphanSession, orphanKey } from "./CommentsSession";
import { FeedbackPanel, type FeedbackPanelProps } from "./FeedbackPanel";
import type { ProjectRead } from "./homeCards";

// project-feedback spec 'Feedback 패널' and '갈 곳 잃은 댓글'; draft frames
// `feedback-panel`, `feedback-states` and `orphan-cards` (their English copy).
const kim = { kind: "human", name: "Kim Doe", email: "kim@acme.dev" } as const;
let seq = 0;
function comment(target: Target, extra: Partial<Comment> = {}): Comment {
  seq += 1;
  return { comment: `cmt_${seq}`, status: "open", body: `Body ${seq}`, target, canvasHash: "h", createdBy: kim, createdAt: "2026-10-24T09:12:00.000Z", updatedAt: "2026-10-24T09:12:00.000Z", ...extra };
}
const row = (path: string, id: string | undefined, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, ...(id ? { id } : {}), open: 0, resolved: 0, url: path, frames: [], ...extra });
const orphan = (id: string, open: number, resolved: number, extra: Partial<OrphanFile> = {}): OrphanFile => ({ id, file: `.doan/comments/${id}.jsonl`, comments: { open, resolved }, uncertain: false, ...extra });
const list = (canvases: Extract<ProjectComments, { kind: "list" }>["canvases"], orphans: OrphanFile[] = [], orphanComments: Extract<ProjectComments, { kind: "list" }>["orphanComments"] = []): ProjectRead => ({ root: "/code/acme", revision: 1, kind: "list", project: 4, canvases, orphans, orphanComments });
const session = () => new OrphanSession({ orphanCommentsMutate: vi.fn(), orphanCommentsStatus: vi.fn() }, () => {});
function render(props: Partial<FeedbackPanelProps>) {
  return renderToStaticMarkup(<FeedbackPanel root="/code/acme" rows={[]} read={undefined} orphans={session()} onRetry={() => {}} onOrphan={() => {}} onRetryGit={() => {}} onOpenComment={() => {}} onOpenCanvas={() => {}} onReview={() => {}} {...props} />);
}

describe("FeedbackPanel states (draft feedback-states)", () => {
  test("reading: the segment has no counts and the message is a status", () => {
    const html = render({ read: undefined });
    expect(html).toContain('<section class="feedback native-scroll" role="region" aria-label="Feedback"><h2 class="phead" tabindex="-1">Feedback</h2>');
    expect(html).toContain('<div class="fb-filter"><div class="comments-segment" role="group" aria-label="Comment status"><button type="button" aria-pressed="true">Open</button><button type="button" aria-pressed="false">Resolved</button></div></div>');
    expect(html).toContain('<div class="comments-message" role="status"><b>Reading comments…</b></div>');
    expect(html).not.toContain('role="tree"');
  });

  test("a failed read: one alert block with Retry, no counts, no tree", () => {
    const html = render({ read: { kind: "failed" } });
    expect(html).toContain('<button type="button" aria-pressed="true">Open</button>');
    expect(html).toContain('<div class="comments-message error" role="alert"><b>Couldn’t read comments</b><div class="comments-tools"><button type="button" class="comments-btn">Retry</button></div></div>');
    expect(html).not.toContain('role="tree"');
  });

  test("empty Open and Resolved", () => {
    expect(render({ read: list([]) })).toContain('<button type="button" aria-pressed="true">Open 0</button><button type="button" aria-pressed="false">Resolved 0</button></div></div><div class="comments-message"><b>No open comments in this project</b></div>');
  });

  test("one canvas whose file failed shows the block inside its group, with no count", () => {
    const rows = [row("design/a.html", "a", { title: "Cart" }), row("design/b.html", "b", { title: "Checkout" })];
    const html = render({ rows, read: list([{ id: "a", open: 1, resolved: 0, toReview: 0, comments: [comment({})] }, { id: "b", error: "Cannot read .doan/comments/b.jsonl: permission denied" }]) });
    expect(html).toContain("Open 1</button>");
    const head = html.indexOf('aria-label="Checkout"');
    expect(head).toBeGreaterThan(-1);
    expect(html.slice(head)).toMatch(/^aria-label="Checkout"[^>]*>(?:(?!<\/div>).)*<span class="g">Checkout<\/span><span><\/span>/);
    expect(html).toContain('<div class="comments-message error" role="alert"><b>Couldn’t read comments</b><div class="comments-tools"><button type="button" class="comments-btn">Retry</button><button type="button" class="comments-btn" aria-label="Details" aria-expanded="false">Details ▸</button></div></div>');
  });

  test("only comments without a canvas: that group alone", () => {
    const old = comment({ frame: "line-items" });
    const html = render({ rows: [], read: list([], [orphan("invoice", 1, 0)], [{ id: "invoice", comments: [old] }]) });
    expect(html).toContain('<div class="row fb-orphans" role="treeitem" aria-level="1" aria-expanded="true" tabindex="0"');
    expect(html).toContain('<span class="g">Comments without a canvas</span><span class="cnt hot">1</span>');
    expect(html).not.toContain("No open comments in this project");
  });
});

describe("FeedbackPanel tree (draft feedback-panel)", () => {
  const frames = [{ id: "hero", title: "Hero" }, { id: "shipping", title: "Shipping" }];
  const wide = comment({}, { body: "Tighten the rhythm.\nSecond line." });
  const cta = comment({ element: { doanId: "hero-cta", selector: '[data-doan-id="hero-cta"]', html: "<button>" }, frame: "hero" });
  const rows = [row("design/2026-10-checkout-revamp.html", "revamp", { title: "Checkout", frames }), row("design/checkout/checkout.html", "checkout", { title: "Checkout" }), row("design/settings/billing.html", "billing", { title: "Billing & plans" })];
  const read = list([
    { id: "revamp", open: 2, resolved: 0, toReview: 1, comments: [wide, cta] },
    { id: "checkout", open: 1, resolved: 0, toReview: 0, comments: [comment({})] },
    { id: "billing", open: 0, resolved: 1, toReview: 2, comments: [comment({}, { status: "resolved", resolvedAt: "2026-10-25T00:00:00.000Z", resolvedBy: kim })] },
  ]);

  test("canvas heads: title, count, file name when another canvas shares the title, review entry", () => {
    const html = render({ rows, read });
    expect(html).toContain('<div class="fb-tree" role="tree" aria-label="Feedback">');
    expect(html).toContain('<div class="fb-canvas" role="treeitem" aria-level="1" aria-expanded="true" aria-label="Checkout 2026-10-checkout-revamp.html" tabindex="0"');
    expect(html).toContain('<span class="glyph" aria-hidden="true">◧</span><span class="g">Checkout</span><span class="cnt hot">2</span><span class="d">2026-10-checkout-revamp.html</span><button type="button" class="fb-review">1 resolved to review</button>');
    // No file name for a title no other canvas has; Open shows a head whose only news is resolutions.
    expect(html).toContain('aria-label="Billing &amp; plans" tabindex="-1"');
    expect(html).toContain('<span class="g">Billing &amp; plans</span><span class="cnt">0</span><button type="button" class="fb-review">2 resolved to review</button>');
  });

  test("frame groups and comment rows: target label without the frame, first body line", () => {
    const html = render({ rows, read });
    expect(html).toContain('<span class="g">Whole canvas</span><span class="cnt hot">1</span>');
    expect(html).toContain('<div class="fb-item" role="treeitem" aria-level="3" tabindex="-1"');
    expect(html).toContain('<span class="t" title="Canvas">Canvas</span><span class="b">Tighten the rhythm.</span>');
    expect(html).toContain('<span class="g">Hero</span><span class="cnt hot">1</span>');
    expect(html).toContain('<span class="t" title="[data-doan-id=&quot;hero-cta&quot;]">Element · button hero-cta</span>');
  });

  test("a canvas without a valid unique id: counts only", () => {
    const html = render({ rows: [row("design/bad.html", undefined, { title: "Bad", open: 3, resolved: 1 })], read: list([]) });
    expect(html).toContain('<div class="fb-canvas" role="treeitem" aria-level="1" aria-label="Bad" tabindex="0"');
    expect(html).toContain('<p class="fb-count"><b>3 open · 1 resolved.</b> This canvas needs a unique, valid ID — run doan check</p>');
  });
});

describe("FeedbackPanel orphan cards (draft orphan-cards)", () => {
  const open = comment({ element: { doanId: "address", selector: '[data-doan-id="address"]', html: "<label>" }, frame: "shipping" }, { body: "Accept two address lines.\nSay so in the placeholder." });
  const done = comment({}, { status: "resolved", resolvedAt: "2026-10-25T07:02:00.000Z", resolvedBy: { kind: "agent", name: "codex" } });

  test("notice, then the shared card with Resolve and Delete, no Edit, no locate", () => {
    const html = render({ read: list([], [orphan("checkout-v1", 1, 1)], [{ id: "checkout-v1", comments: [open, done] }]) });
    expect(html).toContain('<p class="fb-note">No canvas uses the ID checkout-v1. Give a canvas this ID again to bring these comments back, or ask your agent.</p>');
    expect(html).toContain('<article class="comments-card" tabindex="-1" data-comment="' + open.comment + '" aria-label="Comment by Kim Doe">');
    expect(html).toContain('<span class="comments-target static" title="[data-doan-id=&quot;address&quot;]">Element · label address · in shipping</span>');
    expect(html).toContain('<p class="comments-body">Accept two address lines.\nSay so in the placeholder.</p><div class="comments-tools"><button type="button" class="comments-btn">Resolve</button><button type="button" class="comments-btn">Delete</button></div>');
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Hand off");
  });

  test("Resolved: the resolution line and Reopen", () => {
    const html = render({ read: list([], [orphan("checkout-v1", 1, 1)], [{ id: "checkout-v1", comments: [open, done] }]), initialStatus: "resolved" });
    expect(html).toContain('<p class="comments-resolution"><time dateTime="2026-10-25T07:02:00.000Z" title="2026-10-25T07:02:00.000Z">Resolved by <b>codex</b>');
    expect(html).toContain('<button type="button" class="comments-btn">Reopen</button><button type="button" class="comments-btn">Delete</button>');
  });

  test("read-only while some canvas could not be read: warning notice, no buttons", () => {
    const html = render({ read: list([], [orphan("checkout-v1", 1, 0, { uncertain: true })], [{ id: "checkout-v1", comments: [open] }]) });
    expect(html).toContain('<p class="fb-note warning">Some canvases couldn’t be read; these comments may belong to one of them.</p>');
    expect(html).not.toContain(">Resolve<");
    expect(html).not.toContain(">Delete<");
  });

  test("a file name that is not a canvas id: counts only", () => {
    const html = render({ read: list([], [orphan("Checkout_Old", 3, 1)]) });
    expect(html).toContain('<div class="row fb-l2" role="treeitem" aria-level="2" tabindex="-1"');
    expect(html).toContain('<span class="g">Checkout_Old</span><span class="cnt hot">3</span>');
    expect(html).toContain('<p class="fb-count"><b>3 open · 1 resolved.</b> Not a canvas ID — doan can&#x27;t show or change these comments.</p>');
  });

  test("an unreadable orphan file: the read failure with Details, no count", () => {
    const html = render({ read: list([], [{ id: "promo-banner", file: ".doan/comments/promo-banner.jsonl", error: { code: "unreadable_comments", message: "Cannot read .doan/comments/promo-banner.jsonl: permission denied" }, uncertain: false }]) });
    expect(html).toMatch(/<span class="g">promo-banner<\/span><\/div>/);
    expect(html).toContain('<b>Couldn’t read comments</b><div class="comments-tools"><button type="button" class="comments-btn">Retry</button><button type="button" class="comments-btn" aria-label="Details" aria-expanded="false">Details ▸</button></div>');
  });

  test("a missing Git name: the Git name block opens the group and the buttons are disabled", async () => {
    const orphans = new OrphanSession({ orphanCommentsMutate: vi.fn(async r => ({ ok: false as const, identity: { root: r.root, canvas: r.canvas, requestID: r.requestID }, error: "Configure a Git user name before saving comments." })), orphanCommentsStatus: vi.fn() }, () => {});
    await orphans.mutate("resolve", { root: "/code/acme", canvas: "promo-banner", project: 4 }, open);
    const html = render({ orphans, read: list([], [orphan("promo-banner", 1, 0)], [{ id: "promo-banner", comments: [open] }]) });
    expect(html).toContain('<span class="cnt hot">1</span></div><div class="comments-message warning inset" role="status"><b>Set your Git name</b>Set git user.name for this repository in your terminal, then choose Retry. Your email is optional.<p>Adding, editing, resolving, reopening and deleting stay unavailable until a name is configured. Hand off remains available.</p><div class="comments-tools"><button type="button" class="comments-btn">Retry</button></div></div>');
    expect(html).toContain('<button type="button" class="comments-btn" disabled="">Resolve</button><button type="button" class="comments-btn" disabled="">Delete</button>');
  });

  test("save states as Comments cards", async () => {
    const orphans = new OrphanSession({ orphanCommentsMutate: vi.fn(async r => ({ ok: false as const, identity: { root: r.root, canvas: r.canvas, requestID: r.requestID }, error: "The comment file no longer exists." })), orphanCommentsStatus: vi.fn() }, () => {});
    await orphans.mutate("resolve", { root: "/code/acme", canvas: "checkout-v1", project: 4 }, open);
    expect(orphans.mutations.get(orphanKey("/code/acme", "checkout-v1", open.comment))?.status).toBe("failed");
    const html = render({ orphans, read: list([], [orphan("checkout-v1", 1, 0)], [{ id: "checkout-v1", comments: [open] }]) });
    expect(html).toContain('<div class="comments-message error" role="status"><b>Couldn’t save comment</b>The comment file no longer exists.<div class="comments-tools"><button type="button" class="comments-btn">Retry</button></div></div>');
  });

  test("no project epoch in the read: no write is possible", () => {
    const read: ProjectRead = { root: "/code/acme", revision: 1, kind: "list", canvases: [], orphans: [orphan("checkout-v1", 1, 0)], orphanComments: [{ id: "checkout-v1", comments: [open] }] };
    expect(render({ read })).toContain('<button type="button" class="comments-btn" disabled="">Resolve</button>');
  });

  // R-V1 🟡3: the line stays when its file group leaves the chosen status.
  test("the status line stays when the resolved comment was its file's last open one", async () => {
    const orphans = new OrphanSession({ orphanCommentsMutate: vi.fn(async r => ({ ok: true as const, identity: { root: r.root, canvas: r.canvas, requestID: r.requestID }, value: { state: "saved" as const } })), orphanCommentsStatus: vi.fn() }, () => {});
    await orphans.mutate("resolve", { root: "/code/acme", canvas: "promo-banner", project: 4 }, open);
    const resolvedNow = { ...open, status: "resolved" as const, resolvedAt: "2026-10-26T00:00:00.000Z", resolvedBy: kim };
    const other = comment({});
    const html = render({ orphans, read: list([], [orphan("promo-banner", 0, 1), orphan("checkout-v1", 1, 0)], [{ id: "promo-banner", comments: [resolvedNow] }, { id: "checkout-v1", comments: [other] }]) });
    expect(html).toContain('<span class="g">Comments without a canvas</span><span class="cnt hot">1</span></div><p class="comments-status" role="status">Resolved — moved to Resolved.</p>');
    const none = render({ orphans, read: list([], [orphan("promo-banner", 0, 1)], [{ id: "promo-banner", comments: [resolvedNow] }]) });
    expect(none).toContain('</div></div><p class="comments-status" role="status">Resolved — moved to Resolved.</p><div class="comments-message"><b>No open comments in this project</b>');
  });
});
