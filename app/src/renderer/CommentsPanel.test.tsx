import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Comment } from "../formats/types";
import { CommentsPanel, CommentCard, CommentEditor, UnsavedCommentDialog, type CommentsPanelProps, type CommentEditorProps } from "./CommentsPanel";

const comment: Comment = { comment: "c1", status: "open", body: '<script>alert("x")</script>\n  Keep spaces ', target: { element: { doanId: "submit", selector: "button", html: "<button/>" } }, canvasHash: "h", createdBy: { kind: "human", name: "Alex Morgan", email: "alex@example.com" }, createdAt: "2026-10-23T01:42:00Z", updatedAt: "2026-10-23T01:42:00Z" };
const noop = () => {};
function panel(overrides: Partial<CommentsPanelProps> = {}): CommentsPanelProps {
  return { filter: { scope: "canvas", status: "open" }, selectionAvailable: true, counts: { open: 1, resolved: 0 }, canvasOpenCount: 1, read: { status: "ready", comments: [comment], warnings: [] }, freshness: new Map(), missingLocations: new Set(), author: { status: "ready" }, writeBlocked: null, createBlocked: null, widthInvalid: false, busy: false, copies: new Map(), allCopy: { status: "idle" }, editor: null, onFilter: noop, onCreate: noop, onComment: noop, onCopy: noop, onRead: noop, onRetryAuthor: noop, ...overrides };
}
function editor(overrides: Partial<CommentEditorProps> = {}): CommentEditorProps {
  return { mode: "create", target: comment.target, body: "Original body", state: { status: "idle" }, blocked: null, onBody: noop, onSave: noop, onCancel: noop, onKeepDraft: noop, onCheck: noop, onRetryOriginal: noop, onReadLatest: noop, ...overrides };
}
interface ElementProps { children?: ReactNode; disabled?: boolean; readOnly?: boolean; onClick?: () => void; onKeyDown?: (event: { key: string; nativeEvent: { isComposing: boolean; keyCode: number }; preventDefault: () => void; stopPropagation: () => void }) => void }
function find(node: ReactNode, label: string): ElementProps {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.type === "button" && Children.toArray(child.props.children).join("") === label) return child.props;
    try { return find(child.props.children, label); } catch { /* Search the next sibling. */ }
  }
  throw new Error(`Missing button ${label}`);
}
const html = (props: CommentsPanelProps) => renderToStaticMarkup(<CommentsPanel {...props} />);

describe("Comments presentation", () => {
  test("renders plain text, author identity, targets and independent location/freshness badges", () => {
    const out = html(panel({ freshness: new Map([["c1", "outdated"]]), missingLocations: new Set(["c1"]) }));
    for (const text of ["Alex Morgan", "alex@example.com", ">AM<", "Element · submit", "Outdated", "Location unavailable", "&lt;script&gt;", "\n  Keep spaces "]) expect(out).toContain(text);
    expect(out).not.toContain("<script>");
    expect(html(panel({ freshness: new Map([["c1", "unknown"]]) }))).toContain("Freshness unknown");
  });
  test("renders all three target kinds without inferring from the list filter", () => {
    for (const [target, label] of [[{}, "Canvas"], [{ frame: "hero" }, "Frame · hero"], [comment.target, "Element · submit"]] as const) {
      expect(renderToStaticMarkup(<CommentEditor {...editor({ target })} />)).toContain(`To: ${label}`);
    }
    const onFilter = vi.fn();
    const props = panel({ editor: editor(), onFilter });
    find(CommentsPanel(props), "Selection").onClick?.();
    expect(onFilter).toHaveBeenCalledWith({ scope: "selection", node: null, status: "open" });
    expect(html({ ...props, filter: { scope: "selection", node: "n1", status: "resolved" } })).toContain("To: Element · submit");
  });
  test("distinguishes loading, failed reads, empty results and fold warnings", () => {
    expect(html(panel({ read: { status: "loading" } }))).toContain("Loading comments…");
    const failed = html(panel({ read: { status: "failed", message: "Permission denied" } }));
    expect(failed).toContain("Couldn’t read comments");
    expect(failed).not.toContain("No open comments");
    expect(html(panel({ read: { status: "ready", comments: [], warnings: [{ code: "unknown_version", line: 3 }] } }))).toContain("unknown_version · line 3");
    expect(html(panel({ read: { status: "ready", comments: [], warnings: [] } }))).toContain("No open comments here");
  });
  test("width invalidity blocks only creation, retaining editing and copying", () => {
    const out = html(panel({ widthInvalid: true }));
    expect(out).toContain("Fix doan:width");
    expect(find(CommentsPanel(panel({ widthInvalid: true })), "New canvas comment").disabled).toBe(true);
    expect(out).toMatch(/<button[^>]*(?<!disabled="")>Edit<\/button>/);
    expect(find(CommentsPanel(panel({ widthInvalid: true })), "Copy all open").disabled).toBe(false);
  });
  test("all-open copy stays available on an empty resolved selection and sends the all intent", () => {
    const onCopy = vi.fn();
    const props = panel({ filter: { scope: "selection", node: "n1", status: "resolved" }, counts: { open: 0, resolved: 0 }, read: { status: "ready", comments: [], warnings: [] }, onCopy });
    const button = find(CommentsPanel(props), "Copy all open");
    expect(button.disabled).toBe(false);
    button.onClick?.();
    expect(onCopy).toHaveBeenCalledWith({ kind: "all" });
  });
  test("resolved card disables single copy and explains reopening", () => {
    const out = html(panel({ read: { status: "ready", comments: [{ ...comment, status: "resolved" }], warnings: [] } }));
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Copy<\/button>/);
    expect(out).toContain("Reopen this comment before copying.");
    expect(out).toContain("Reopen</button>");
  });
  test("missing author blocks all mutations but keeps copy and retry available", () => {
    const out = html(panel({ author: { status: "missing" } }));
    expect(out).toContain("Set your Git name");
    expect(out).toContain("git user.name");
    for (const label of ["Edit", "Resolve", "Delete"]) expect(out).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
    expect(out).toMatch(/<button[^>]*>Copy<\/button>/);
  });
  test("card intents include the original id; copy feedback is visible", () => {
    const onComment = vi.fn(), onCopy = vi.fn();
    const card = CommentCard({ comment, freshness: "same", locationMissing: true, disabled: false, busy: false, copy: { status: "copied" }, onComment, onCopy });
    find(card, "Edit").onClick?.();
    find(card, "Copied").onClick?.();
    expect(onComment).toHaveBeenCalledWith("edit", "c1");
    expect(onCopy).toHaveBeenCalledWith({ kind: "one", comment: "c1" });
    expect(html(panel({ allCopy: { status: "failed", message: "Clipboard unavailable" } }))).toContain("Clipboard unavailable");
  });
});

describe("Draft recovery presentation", () => {
  test.each(["unknown", "checking", "check-failed", "retry-original"] as const)("%s keeps the original body read-only and prevents a fresh save", status => {
    const state = status === "check-failed" ? { status, message: "Read failed" } : { status };
    const props = editor({ state });
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).toMatch(/<textarea[^>]*readOnly=""/);
    expect(out).toContain("Original body");
    if (status !== "retry-original") expect(find(CommentEditor(props), "Save comment").disabled).toBe(true);
    else expect(find(CommentEditor(props), "Retry original save").disabled).toBe(false);
    expect(out).toContain("Keep draft");
  });
  test("recovery blocking preserves immutable input and offers neither check nor save retry", () => {
    const props = editor({ state: { status: "recovery-blocked", message: "Wait until the pending writer has exited." } });
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).toContain("Wait until the pending writer has exited.");
    expect(out).toMatch(/<textarea[^>]*readOnly=""/);
    expect(find(CommentEditor(props), "Save comment").disabled).toBe(true);
    expect(out).not.toContain("Check saved status</button>");
    expect(out).not.toContain("Retry original save</button>");
    expect(out).toContain("Keep draft");
  });
  test("conflict preserves input and requires latest-state review before saving", () => {
    const props = editor({ mode: "edit", state: { status: "conflict" } });
    expect(find(CommentEditor(props), "Save changes").disabled).toBe(true);
    expect(renderToStaticMarkup(<CommentEditor {...props} />)).toContain("Original body");
    const reviewed = editor({ mode: "edit", state: { status: "reviewed", latest: comment } });
    expect(find(CommentEditor(reviewed), "Save reviewed changes").disabled).toBe(false);
    expect(renderToStaticMarkup(<CommentEditor {...reviewed} />)).toContain("Latest saved comment · Open");
  });
  test("empty body, blocked target and saving disable submission; failed save keeps text", () => {
    for (const props of [editor({ body: " \n " }), editor({ blocked: "Original target unavailable" }), editor({ state: { status: "saving" } })]) {
      const out = renderToStaticMarkup(<CommentEditor {...props} />);
      expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(Save comment|Saving…)<\/button>/);
    }
    expect(renderToStaticMarkup(<CommentEditor {...editor({ state: { status: "failed", message: "Write failed" } })} />)).toContain("Original body");
  });
  test("unsaved dialog Escape continues and restores editor focus, except during IME", () => {
    const onContinue = vi.fn(), restoreEditorFocus = vi.fn();
    const dialog = UnsavedCommentDialog({ target: comment.target, context: "website / sign-in", canSave: true, busy: false, onContinue, onDiscard: noop, onSave: noop, restoreEditorFocus });
    const key = { key: "Escape", nativeEvent: { isComposing: true, keyCode: 229 }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    dialog.props.onKeyDown(key);
    expect(onContinue).not.toHaveBeenCalled();
    dialog.props.onKeyDown({ ...key, nativeEvent: { isComposing: false, keyCode: 27 } });
    expect(onContinue).toHaveBeenCalledOnce();
    expect(restoreEditorFocus).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(dialog)).toContain("Save and continue");
  });
});
