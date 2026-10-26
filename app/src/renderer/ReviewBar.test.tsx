import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewBar, ReviewDone, ReviewNotice, type ReviewBarView } from "./ReviewBar";

const noop = () => {};
const bar = (over: Partial<ReviewBarView> = {}): ReviewBarView => ({
  step: 1, total: 3, target: "Element · button cta-primary · in Pricing", targetTitle: "button cta-primary", body: "Make the primary button full width on mobile.",
  resolution: { text: "Resolved by codex · 3 minutes ago", at: "2026-10-25T14:02:10.000Z" }, mark: "resolved", notFound: false, writesDisabled: false,
  onPrevious: noop, onNext: noop, onDone: noop, onReopen: noop, onEditReopen: noop, onClose: noop, ...over,
});
// An icon-only button is listed by its accessible name.
const buttons = (html: string) => Array.from(html.matchAll(/<button([^>]*)>([^<]*|<svg[\s\S]*?<\/svg>)<\/button>/g), match => match[2]!.startsWith("<svg") ? /aria-label="([^"]*)"/.exec(match[1]!)![1] : match[2]);

describe("ReviewNotice", () => {
  test("a canvas seen before says since your last review; a first-seen one gives the count only", () => {
    const seen = renderToStaticMarkup(<ReviewNotice count={3} firstSeen={false} blocked={false} onStart={noop} />);
    expect(seen).toContain("<b>3 resolved</b> since your last review");
    expect(seen).toContain('title="3 resolved since your last review"');
    expect(buttons(seen)).toEqual(["Review"]);
    expect(seen).not.toContain("primary");
    const first = renderToStaticMarkup(<ReviewNotice count={1284} firstSeen blocked={false} onStart={noop} />);
    expect(first).toContain("<b>1,284 resolved</b></span>");
    expect(first).not.toContain("since your last review");
  });

  test("a draft disables Review and links the reason to the button", () => {
    const html = renderToStaticMarkup(<ReviewNotice count={3} firstSeen={false} blocked onStart={noop} />);
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review<\/button>/);
    expect(html).toContain(`id="${describedBy}">Finish or cancel your comment to start Review.</p>`);
  });
});

describe("ReviewBar", () => {
  test("a region named Review with the step as status, target, excerpt, resolution and the step actions", () => {
    const html = renderToStaticMarkup(<ReviewBar {...bar()} />);
    expect(html).toContain('role="region" aria-label="Review"');
    expect(html).toContain('<output role="status">Review 1 of 3</output>');
    expect(html).toContain('aria-label="Close Review"');
    expect(html).toContain('title="button cta-primary">Element · button cta-primary · in Pricing</span>');
    expect(html).toContain('class="review-excerpt">Make the primary button full width on mobile.</p>');
    expect(html).toContain('<time dateTime="2026-10-25T14:02:10.000Z" title="2026-10-25T14:02:10.000Z">Resolved by codex · 3 minutes ago</time>');
    expect(buttons(html)).toEqual(["Close Review", "Reopen", "Edit and reopen…", "Previous", "Next"]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(html).toMatch(/class="comments-btn primary review-next doan-button" data-ui-variant="prominent" data-ui-size="sm"[^>]*>Next/);
  });

  test("the last step's Next is Done, and a single step has no Previous", () => {
    expect(buttons(renderToStaticMarkup(<ReviewBar {...bar({ step: 3 })} />)).slice(-2)).toEqual(["Previous", "Done"]);
    expect(buttons(renderToStaticMarkup(<ReviewBar {...bar({ step: 1, total: 1 })} />))).toEqual(["Close Review", "Reopen", "Edit and reopen…", "Done"]);
  });

  test("after the person's Reopen the step says Reopened and keeps Previous and Next only", () => {
    const html = renderToStaticMarkup(<ReviewBar {...bar({ step: 2, mark: "reopened" })} />);
    expect(html).toContain('class="review-flag">Reopened</p>');
    expect(html).toContain("Resolved by codex");
    expect(buttons(html)).toEqual(["Close Review", "Previous", "Next"]);
  });

  test("a step reopened elsewhere or deleted shows that and only Next", () => {
    const elsewhere = renderToStaticMarkup(<ReviewBar {...bar({ step: 2, mark: "reopenedElsewhere", reopenedBy: "codex" })} />);
    expect(elsewhere).toContain('class="review-flag">Reopened by codex</p>');
    expect(elsewhere).not.toContain("Resolved by");
    expect(buttons(elsewhere)).toEqual(["Close Review", "Next"]);
    const deleted = renderToStaticMarkup(<ReviewBar {...bar({ step: 3, mark: "deleted" })} />);
    expect(deleted).toContain('class="review-flag">Deleted</p>');
    expect(buttons(deleted)).toEqual(["Close Review", "Done"]);
  });

  test("a target not found says so and keeps the step's actions", () => {
    const html = renderToStaticMarkup(<ReviewBar {...bar({ notFound: true })} />);
    expect(html).toContain('class="review-flag warn">Not found in the current canvas</p>');
    expect(buttons(html)).toEqual(["Close Review", "Reopen", "Edit and reopen…", "Previous", "Next"]);
  });

  test("writes are disabled while another change or a draft holds them; moving is not", () => {
    const html = renderToStaticMarkup(<ReviewBar {...bar({ step: 2, writesDisabled: true })} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reopen<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Edit and reopen…<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(Previous|Next)<\/button>/);
  });
});

describe("ReviewDone", () => {
  test("the summary with a close button; Hand off… only when a dialog can open", () => {
    const html = renderToStaticMarkup(<ReviewDone text="Reviewed 3 · Reopened 1" onClose={noop} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('title="Reviewed 3 · Reopened 1">Reviewed 3 · Reopened 1</span>');
    expect(buttons(html)).toEqual(["Close summary"]);
    expect(html).toContain('aria-label="Close summary"');
    expect(buttons(renderToStaticMarkup(<ReviewDone text="Reviewed 3 · Reopened 1" onClose={noop} onHandOff={vi.fn()} />))).toEqual(["Hand off…", "Close summary"]);
  });
});
