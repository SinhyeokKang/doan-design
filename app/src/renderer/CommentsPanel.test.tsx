import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Comment } from "../formats/types";
import { foldText } from "../formats/foldText";
import { READ_FAILED_EDITOR } from "../comments/panelText";
import { CommentsPanel, DeleteCommentDialog, CommentCard, CommentEditor, UnsavedCommentDialog, UncertainCommentDialog, revealComposer, type CommentsPanelProps, type CommentEditorProps, type CommentCardProps } from "./CommentsPanel";

// Tests call the editor as a plain function to read its element tree, outside
// a React render; its reason id still comes from useId in the app.
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useId: () => "«r1»" }));

const comment: Comment = { comment: "c1", status: "open", body: '<script>alert("x")</script>\n  Keep spaces ', target: { element: { doanId: "submit", selector: "button", html: "<button/>" } }, canvasHash: "h", createdBy: { kind: "human", name: "Alex Morgan", email: "alex@example.com" }, createdAt: "2026-10-23T01:42:00Z", updatedAt: "2026-10-23T01:42:00Z" };
const noop = () => {};
function panel(overrides: Partial<CommentsPanelProps> = {}): CommentsPanelProps {
  return { filter: { scope: "canvas", status: "open" }, selectionAvailable: true, counts: { open: 1, resolved: 0 }, canvasOpenCount: 1, read: { status: "ready", comments: [comment], warnings: [] }, freshness: new Map(), missingLocations: new Set(), author: { status: "ready" }, identityCause: null, canvasId: "checkout", frames: [], writeBlocked: null, createBlocked: null, widthInvalid: false, busy: false, editor: null, onFilter: noop, onCreate: noop, onComment: noop, onHandOff: noop, onRead: noop, onRetryAuthor: noop, ...overrides };
}
function editor(overrides: Partial<CommentEditorProps> = {}): CommentEditorProps {
  return { mode: "create", target: comment.target, frames: [], body: "Original body", state: { status: "idle" }, blocked: null, onBody: noop, onSave: noop, onCancel: noop, onKeepDraft: noop, onCheck: noop, onRetryOriginal: noop, onReadLatest: noop, ...overrides };
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
    for (const text of ["Alex Morgan", "alex@example.com", ">AM<", "Element · button submit", "Canvas changed", "Location unavailable", "&lt;script&gt;", "\n  Keep spaces "]) expect(out).toContain(text);
    const unknown = html(panel({ missingLocations: null }));
    expect(unknown).not.toContain("Location unavailable");
    expect(html(panel())).toContain(`<button type="button" class="comments-target locatable" title="Show on canvas\nbutton">Element · button submit</button>`);
    expect(out).not.toContain("<script>");
    expect(html(panel({ freshness: new Map([["c1", "unknown"]]) }))).toContain("Freshness unknown");
  });
  test("shows the target line as text with no locate action when no document is rendered", () => {
    // Draft no-document frame: --text-2 text, no Show on canvas action, title = selector.
    const unknown = html(panel({ missingLocations: null }));
    expect(unknown).toContain(`<span class="comments-target" title="button">Element · button submit</span>`);
    expect(unknown).not.toMatch(/<button[^>]*comments-target/);
    const frame = renderToStaticMarkup(<CommentCard comment={{ ...comment, target: { frame: "hero" } }} frames={[]} freshness="same" locationMissing={null} disabled={false} busy={false} onComment={noop} onHandOff={noop} />);
    expect(frame).toContain(`<span class="comments-target" title="[data-doan-frame=&quot;hero&quot;]">Frame · hero</span>`);
  });
  test("an unlocatable target is a full-opacity span with the reason beside its badge, never a disabled button", () => {
    // POSTMORTEM 2026-10-22 app-ui: the old disabled button took the global button:disabled opacity.
    const missing = html(panel({ missingLocations: new Set(["c1"]) }));
    expect(missing).toContain(`<span class="comments-target" title="button">Element · button submit</span>`);
    expect(missing).not.toMatch(/<button[^>]*comments-target/);
    expect(missing).toContain(`<span class="comments-badge warning">Location unavailable</span><span class="comments-badge-note">Not found in the current canvas.</span></div>`);
    expect(html(panel())).not.toContain("Not found in the current canvas.");
    const canvas = html(panel({ read: { status: "ready", comments: [{ ...comment, target: {} }], warnings: [] } }));
    expect(canvas).toContain(`<span class="comments-target" title="Canvas">Canvas</span>`);
  });
  test("frame names come from the given frames, titles first", () => {
    const framed = { ...comment, target: { frame: "hero", element: { selector: "[data-doan-frame=\"hero\"] > p", html: "<p class=x>Big  \n title</p>", text: "Big  \n title" } } };
    const out = html(panel({ frames: [{ id: "hero", title: "Hero banner" }], read: { status: "ready", comments: [framed], warnings: [] } }));
    expect(out).toContain(`title="Show on canvas\n[data-doan-frame=&quot;hero&quot;] &gt; p">Element · p “Big title” · in Hero banner</button>`);
  });
  test("renders all three target kinds without inferring from the list filter", () => {
    for (const [target, label] of [[{}, "Canvas"], [{ frame: "hero" }, "Frame · Hero"], [comment.target, "Element · button submit"]] as const) {
      expect(renderToStaticMarkup(<CommentEditor {...editor({ target, frames: [{ id: "hero", title: "Hero" }] })} />)).toContain(`To: ${label}`);
    }
    expect(renderToStaticMarkup(<CommentEditor {...editor()} />)).toContain(`<span class="comments-target" title="button">To: Element · button submit</span>`);
    const onFilter = vi.fn();
    const props = panel({ editor: editor(), onFilter });
    find(CommentsPanel(props), "Selection").onClick?.();
    expect(onFilter).toHaveBeenCalledWith({ scope: "selection", node: null, status: "open" });
    expect(html({ ...props, filter: { scope: "selection", node: "n1", status: "resolved" } })).toContain("To: Element · button submit");
  });
  test("distinguishes loading, failed reads, empty results and fold warnings", () => {
    expect(html(panel({ read: { status: "loading" } }))).toContain("Loading comments…");
    const failed = html(panel({ read: { status: "failed", message: "Permission denied" } }));
    expect(failed).toContain("Couldn’t read comments");
    // project-feedback draft `tree-errors`: the raw message waits behind Details.
    expect(failed).toContain('<div class="comments-tools"><button type="button" class="comments-btn">Retry</button><button type="button" class="comments-btn" aria-label="Details" aria-expanded="false">Details ▸</button></div>');
    expect(failed).not.toContain("Permission denied");
    expect(failed).not.toContain("No open comments");
    expect(failed).not.toContain("Comments are read-only");
    expect(html(panel({ read: { status: "ready", comments: [], warnings: [{ code: "unknown_version", line: 3 }] } }))).toContain("<li>This record was written by a newer version of Doan.<span class=\"lines\">Line 3</span></li>");
    expect(html(panel({ read: { status: "ready", comments: [], warnings: [] } }))).toContain("<b>No open comments</b>Choose Comment on canvas, or select an element or frame.");
  });
  test("groups warnings by code with their lines and closes the block with one file line", () => {
    const warnings = [{ code: "invalid_event", line: 9 }, { code: "agent_not_allowed", line: 12 }, { code: "invalid_event", line: 5 }] as const;
    const out = html(panel({ read: { status: "ready", comments: [comment], warnings } }));
    const block = /<div class="comments-message warning comments-warnings">.*?<\/div>/s.exec(out)?.[0] ?? "";
    expect(block).toBe(`<div class="comments-message warning comments-warnings"><b>Some comment changes were ignored</b><ul>`
      + `<li>A line could not be read and was skipped.<span class="lines">Lines 5, 9</span></li>`
      + `<li>An agent tried to add or edit a comment. Agents can only resolve, so it was ignored.<span class="lines">Line 12</span></li></ul>`
      + `<p class="file">In .doan/comments/checkout.jsonl. Ask your agent to run doan comments and fix the file.</p></div>`);
    expect(out.split("Some comment changes were ignored")).toHaveLength(2);
    expect(out.split(".doan/comments/")).toHaveLength(2);
  });
  test.each([
    ["selection", "open", 0, "No open comments on this selection", "Comment on selection to add one."],
    ["selection", "open", 1, "No open comments on this selection", "There is 1 open comment elsewhere on this canvas; Hand off… includes it."],
    ["selection", "open", 4, "No open comments on this selection", "There are 4 open comments elsewhere on this canvas; Hand off… includes them."],
    ["canvas", "open", 0, "No open comments", "Choose Comment on canvas, or select an element or frame."],
    ["selection", "resolved", 0, "No resolved comments on this selection", "Resolved comments appear here."],
    ["canvas", "resolved", 0, "No resolved comments", "Comments you or your agent resolve appear here."],
  ] as const)("an empty %s %s list (%i elsewhere) reads its own title and body", (scope, status, elsewhere, title, body) => {
    const filter = scope === "selection" ? { scope, node: "n1", status } : { scope, status };
    const out = html(panel({ filter, counts: { open: 0, resolved: 0 }, canvasOpenCount: elsewhere, read: { status: "ready", comments: [], warnings: [] } }));
    expect(out).toContain(`<div class="comments-message"><b>${title}</b>${body}</div>`);
  });
  test("width invalidity blocks only creation, retaining editing and Hand off", () => {
    const out = html(panel({ widthInvalid: true }));
    expect(out).toContain("Could not read a valid board width.");
    expect(out).toContain("Run doan check in a terminal");
    expect(find(CommentsPanel(panel({ widthInvalid: true })), "Comment on canvas").disabled).toBe(true);
    expect(find(CommentCard({ comment, frames: [], freshness: "same", locationMissing: true, disabled: false, busy: false, onComment: noop, onHandOff: noop }), "Edit").disabled).toBe(false);
    expect(find(CommentsPanel(panel({ widthInvalid: true })), "Hand off…").disabled).toBe(false);
  });
  test("the head's Hand off… stays available on an empty resolved selection and opens with every open comment", () => {
    const onHandOff = vi.fn();
    const props = panel({ filter: { scope: "selection", node: "n1", status: "resolved" }, counts: { open: 0, resolved: 0 }, read: { status: "ready", comments: [], warnings: [] }, onHandOff });
    const button = find(CommentsPanel(props), "Hand off…");
    expect(button.disabled).toBe(false);
    button.onClick?.();
    expect(onHandOff).toHaveBeenCalledWith(null);
    expect(find(CommentsPanel(panel({ canvasOpenCount: 0 })), "Hand off…").disabled).toBe(true);
    expect(find(CommentsPanel(panel({ read: { status: "loading" } })), "Hand off…").disabled).toBe(true);
  });
  test("Handed off sits beside the head's Hand off…; no per-card or all-open Copied", () => {
    const out = html(panel({ handedOff: "Handed off 3 · 14:02:10" }));
    expect(out).toContain(`<div class="comments-tools"><button type="button" class="comments-btn">Hand off…</button><span class="handoff-summary">Handed off 3 · 14:02:10</span><button type="button" class="comments-btn">Comment on canvas</button></div>`);
    expect(html(panel())).not.toContain("handoff-summary");
    for (const text of ["Copied", "Copy all open", ">Copy<"]) expect(out).not.toContain(text);
  });
  test("a resolved card has no Hand off… and no reopen hint", () => {
    const out = html(panel({ read: { status: "ready", comments: [{ ...comment, status: "resolved" }], warnings: [] } }));
    expect(out.match(/Hand off…/g)).toHaveLength(1);
    expect(out).not.toContain("Reopen this comment before copying.");
    expect(out).toContain("Reopen</button>");
  });
  test("missing author blocks all mutations but keeps Hand off and retry available", () => {
    const out = html(panel({ author: { status: "missing" } }));
    expect(out).toContain("Set your Git name");
    expect(out).toContain("git user.name");
    expect(out).toContain("<p>Adding, editing, resolving, reopening and deleting stay unavailable until a name is configured. Hand off remains available.</p>");
    for (const label of ["Edit", "Resolve", "Delete"]) expect(out).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
    expect(out.match(/<button type="button" class="comments-btn">Hand off…<\/button>/g)).toHaveLength(2);
  });
  test("card intents include the original id; the card's Hand off… opens with that comment", () => {
    const onComment = vi.fn(), onHandOff = vi.fn();
    const card = CommentCard({ comment, frames: [], freshness: "same", locationMissing: true, disabled: true, busy: true, onComment, onHandOff });
    expect(find(card, "Hand off…").disabled).toBeFalsy();
    find(card, "Hand off…").onClick?.();
    expect(onHandOff).toHaveBeenCalledWith("c1");
    find(CommentCard({ comment, frames: [], freshness: "same", locationMissing: true, disabled: false, busy: false, onComment, onHandOff }), "Edit").onClick?.();
    expect(onComment).toHaveBeenCalledWith("edit", "c1");
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
  // CommentsSession.guardSelection lets a blocked draft's same-canvas selection
  // change through without touching a pending transition; that holds because
  // the dialog is modal, so no canvas click, pin or blank click reaches the page.
  test("unsaved dialog opens modal", () => {
    const dialog = UnsavedCommentDialog({ target: comment.target, frames: [], context: "website / sign-in", canSave: false, busy: false, onContinue: noop, onDiscard: noop, onSave: noop, restoreEditorFocus: noop });
    const node = { open: false, showModal: vi.fn(), show: vi.fn() };
    (dialog.props.ref as (node: unknown) => void)(node);
    expect(node.showModal).toHaveBeenCalledOnce();
    expect(node.show).not.toHaveBeenCalled();
  });
  test("unsaved dialog Escape continues and restores editor focus, except during IME", () => {
    const onContinue = vi.fn(), restoreEditorFocus = vi.fn();
    const dialog = UnsavedCommentDialog({ target: comment.target, frames: [], context: "website / sign-in", canSave: true, busy: false, onContinue, onDiscard: noop, onSave: noop, restoreEditorFocus });
    const key = { key: "Escape", nativeEvent: { isComposing: true, keyCode: 229 }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    dialog.props.onKeyDown(key);
    expect(onContinue).not.toHaveBeenCalled();
    dialog.props.onKeyDown({ ...key, nativeEvent: { isComposing: false, keyCode: 27 } });
    expect(onContinue).toHaveBeenCalledOnce();
    expect(restoreEditorFocus).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(dialog)).toContain("Save and continue");
  });
  test("unsaved dialog shows the target on its own To: line, not inside the sentence", () => {
    const out = renderToStaticMarkup(<UnsavedCommentDialog target={comment.target} frames={[]} context="website / sign-in" canSave busy={false} onContinue={noop} onDiscard={noop} onSave={noop} restoreEditorFocus={noop} />);
    expect(out).toContain(`<p>Your unsaved comment belongs to website / sign-in. Save it before moving, discard it, or keep writing here.</p><p class="comments-target">To: Element · button submit</p>`);
  });
});

// Reproduction source: independent R-U2 ReviewDate.test.tsx.
test("calendar-invalid v1 timestamps remain readable after folding", () => {
  const event = { v: 1, type: "create", id: "evt_00000000-0000-4000-8000-000000000001", comment: "cmt_00000000-0000-4000-8000-000000000001", at: "2026-10-23T00:00:60.000Z", by: { kind: "human", name: "A" }, body: "Visible note", target: {}, canvasHash: "sha256:" + "a".repeat(64) };
  const folded = foldText(JSON.stringify(event)); expect(folded.comments).toHaveLength(1);
  const accepted = folded.comments[0]; if (!accepted) throw new Error("Missing folded comment");
  const out = renderToStaticMarkup(<CommentCard comment={accepted} frames={[]} freshness="unknown" locationMissing={false} disabled={false} busy={false} onComment={noop} onHandOff={noop} />);
  expect(out).toContain("Visible note"); expect(out).toContain(event.at);
});

test("newer-version warning explains the record and preserves valid comments", () => {
  const out = html(panel({ read: { status: "ready", comments: [comment], warnings: [{ code: "unknown_version", line: 3 }] } }));
  expect(out).toContain("written by a newer version of Doan");
  expect(out).toContain("Line 3");
  expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\n  Keep spaces ");
});


test("uncertain quit explicitly warns about memory loss and cancellation restores focus", () => {
  const onStay = vi.fn(), onQuit = vi.fn(), restoreEditorFocus = vi.fn();
  const dialog = UncertainCommentDialog({ kind: "quit", context: "repo / a", onStay, onQuit, restoreEditorFocus });
  const out = renderToStaticMarkup(dialog);
  expect(out).toContain("Save status could not be confirmed");
  expect(out).toContain("<p>If you quit, this draft is lost. Quitting does not tell Doan whether the save finished, and restarting does not confirm it either. Check the comment after you reopen Doan.</p>");
  expect(find(dialog, "Stay").disabled).not.toBe(true);
  find(dialog, "Quit anyway").onClick?.(); expect(onQuit).toHaveBeenCalledOnce();
  const key = { key: "Escape", nativeEvent: { isComposing: true, keyCode: 229 }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  dialog.props.onKeyDown(key); expect(onStay).not.toHaveBeenCalled();
  dialog.props.onKeyDown({ ...key, nativeEvent: { isComposing: false, keyCode: 27 } });
  expect(onStay).toHaveBeenCalledOnce(); expect(restoreEditorFocus).toHaveBeenCalledOnce();
});
test("blocked movement explains uncertainty without offering discard or quit", () => {
  const out = renderToStaticMarkup(<UncertainCommentDialog kind="blocked" context="repo / a" onStay={noop} onQuit={noop} restoreEditorFocus={noop} />);
  expect(out).toContain("Save status could not be confirmed");
  expect(out).toContain("cannot leave this draft"); expect(out).toContain("repo / a");
  expect(out).not.toContain("Quit anyway"); expect(out).not.toContain("Discard"); expect(out).toContain("Keep draft");
});

test("begin error stays beside creation without disabling existing actions", () => {
  const props = panel({ createError: "Cannot start comment" });
  const out = html(props);
  expect(out).toContain("Cannot start comment");
  expect(out).not.toContain("Comments are read-only");
  expect(out).not.toContain("Couldn’t read comments");
  expect(find(CommentsPanel(props), "Comment on canvas").disabled).toBe(false);
  expect(find(CommentsPanel(props), "Hand off…").disabled).toBe(false);
});
test("delete Escape is consumed without cancelling during IME", () => {
  const onCancel = vi.fn(), onConfirm = vi.fn();
  const dialog = DeleteCommentDialog({ comment, onCancel, onConfirm });
  for (const nativeEvent of [{ isComposing: true, keyCode: 27 }, { isComposing: false, keyCode: 229 }, { isComposing: false, keyCode: 27 }]) {
    const event = { key: "Escape", nativeEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    dialog.props.onKeyDown?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledTimes(nativeEvent.isComposing || nativeEvent.keyCode === 229 ? 0 : 1);
  }
  expect(onConfirm).not.toHaveBeenCalled();
});

// Review R-G G-1: Esc closes an edit editor before Review and the selection.
describe("Esc in the card editor", () => {
  const press = (props: CommentEditorProps, nativeEvent = { isComposing: false, keyCode: 27 }) => {
    const composer = (CommentEditor(props).props.children as ReactNode[])[0] as { props: ElementProps };
    const event = { key: "Escape", nativeEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    composer.props.onKeyDown?.(event);
    return event;
  };
  test("closes an edit editor like Cancel and consumes the key", () => {
    const onCancel = vi.fn(), onKeepDraft = vi.fn();
    const event = press(editor({ mode: "edit", onCancel, onKeepDraft }));
    expect(onCancel).toHaveBeenCalledOnce(); expect(onKeepDraft).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
  test("is consumed without closing during IME composition", () => {
    for (const nativeEvent of [{ isComposing: true, keyCode: 27 }, { isComposing: false, keyCode: 229 }]) {
      const onCancel = vi.fn();
      const event = press(editor({ mode: "edit", onCancel }), nativeEvent);
      expect(onCancel).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    }
  });
  test.each(["saving", "saved", "unknown", "checking"] as const)("does nothing while Cancel is unavailable (%s)", status => {
    const onCancel = vi.fn(), onKeepDraft = vi.fn();
    const event = press(editor({ mode: "edit", state: { status }, onCancel, onKeepDraft }));
    expect(onCancel).not.toHaveBeenCalled(); expect(onKeepDraft).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
  test("the new-comment composer keeps no Esc handling", () => {
    const onCancel = vi.fn();
    const event = press(editor({ mode: "create", onCancel }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("continue a blocked new comment", () => {
  const notice = "The canvas reloaded while you were writing. Your text is kept — continue on the current version to save it.";
  const pay = { element: { doanId: "pay", selector: "button", html: "<button/>" } };
  function blocked(over: Partial<NonNullable<CommentEditorProps["continue"]>> = {}, props: Partial<CommentEditorProps> = {}): CommentEditorProps {
    return editor({ blocked: notice, ...props, continue: { enabled: true, reason: null, preview: pay, canvas: null, starting: null, error: null, onContinue: noop, onCanvas: noop, ...over } });
  }
  const keyed = (node: ReactNode, label: string): string | null => {
    for (const child of Children.toArray(node)) {
      if (!isValidElement<ElementProps>(child)) continue;
      if (child.type === "button" && Children.toArray(child.props.children).join("") === label) return child.key;
      const found = keyed(child.props.children, label);
      if (found !== null) return found;
    }
    return null;
  };

  test("puts Continue on current version in the primary slot with the notice and preview under the tools", () => {
    const onContinue = vi.fn();
    const props = blocked({ onContinue });
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).not.toContain("Save comment");
    expect(out).toMatch(/Cancel<\/button><button[^>]*class="comments-btn primary"[^>]*>Continue on current version<\/button><\/div><p class="comments-helper" role="status">The canvas reloaded/);
    expect(out).toContain(`<p class="comments-helper">Continues on Element · button pay.</p>`);
    expect(out).not.toContain("aria-describedby");
    find(CommentEditor(props), "Continue on current version").onClick?.();
    expect(onContinue).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(<CommentEditor {...blocked({ preview: {} })} />)).toContain("Continues on Canvas.");
  });
  test("renders the continue button as its own element, never the Save node", () => {
    const saveKey = keyed(CommentEditor(editor()), "Save comment");
    const continueKey = keyed(CommentEditor(blocked()), "Continue on current version");
    expect(continueKey).not.toBeNull(); expect(continueKey).not.toBe(saveKey);
  });
  test("shows Starting… disabled while the body stays editable", () => {
    const props = blocked({ enabled: false, starting: "current" });
    expect(find(CommentEditor(props), "Starting…").disabled).toBe(true);
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).not.toContain("readOnly"); expect(out).not.toContain("readonly");
    expect(find(CommentEditor(props), "Cancel").disabled).toBe(false);
  });
  test("a failure is an alert under the preview, and the button can retry", () => {
    const props = blocked({ error: "doan CLI error." });
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).toContain(`Continues on Element · button pay.</p><p class="comments-helper" role="alert">Couldn’t continue on the current version: doan CLI error. Your text is kept.</p>`);
    expect(find(CommentEditor(props), "Continue on current version").disabled).toBe(false);
  });
  test("a disabled reason replaces the preview and describes the button", () => {
    const out = renderToStaticMarkup(<CommentEditor {...blocked({ enabled: false, reason: "Waiting for the canvas to finish loading." })} />);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="«r1»"|<button[^>]*aria-describedby="«r1»"[^>]*disabled=""/);
    expect(out).toContain(`<p class="comments-helper" id="«r1»">Waiting for the canvas to finish loading.</p>`);
    expect(out).not.toContain("Continues on");
  });
  test("selection gone offers Continue on canvas between Cancel and the primary", () => {
    const onCanvas = vi.fn();
    const gone = "Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.";
    const props = blocked({ enabled: false, reason: gone, canvas: { enabled: true }, onCanvas });
    const out = renderToStaticMarkup(<CommentEditor {...props} />);
    expect(out).toMatch(/>Cancel<\/button><button type="button" class="comments-btn">Continue on canvas<\/button><button[^>]*primary[^>]*>Continue on current version</);
    find(CommentEditor(props), "Continue on canvas").onClick?.();
    expect(onCanvas).toHaveBeenCalledOnce();
    expect(find(CommentEditor(blocked({ enabled: false, canvas: { enabled: false }, starting: "canvas" })), "Starting…").disabled).toBe(true);
  });
  test("the panel keeps the reload notice in the editor over panel-level reasons", () => {
    const out = html(panel({ widthInvalid: true, editor: blocked() }));
    expect(out).toContain(`<p class="comments-helper" role="status">${notice.replace("—", "—")}</p>`);
  });
  test("an unavailable draft keeps the shipped editor with a disabled Save", () => {
    const props = editor({ blocked: "Original document or target is unavailable." });
    expect(find(CommentEditor(props), "Save comment").disabled).toBe(true);
    expect(renderToStaticMarkup(<CommentEditor {...props} />)).not.toContain("Continue");
  });
});

describe("identity, read failure and head controls", () => {
  test.each([
    ["missing", "This canvas has no ID", "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details."],
    ["invalid", "This canvas ID isn't valid", "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details."],
    ["duplicate", "Another canvas uses the ID checkout", "Ask your agent to give one of them a different ID. Run doan check in a terminal to see details."],
  ] as const)("the %s canvas ID cause shows only its block: no loading, Git name, filters or tools", (cause, title, body) => {
    const out = html(panel({ identityCause: cause, read: { status: "loading" }, author: { status: "missing" }, writeBlocked: "A valid, unique canvas ID is required." }));
    expect(out).toContain(`<div class="comments-message error" role="alert"><b>${title.replace("'", "&#x27;")}</b>${body}</div>`);
    for (const text of ["Loading comments…", "Set your Git name", "Comment scope", "Comment status", "Hand off…", "Comment on canvas", "Comments are read-only"]) expect(out).not.toContain(text);
    expect(out.match(/comments-message/g)).toHaveLength(1);
  });
  test("an identity block keeps an open editor blocked", () => {
    const props = panel({ identityCause: "missing", writeBlocked: "A valid, unique canvas ID is required.", editor: editor({ mode: "edit" }) });
    expect(html(props)).toMatch(/<button[^>]*disabled=""[^>]*>Save changes<\/button>/);
    expect(html(props)).toContain("This canvas has no ID");
  });
  test("a read failure is one block and keeps an editing draft from saving", () => {
    const props = panel({ read: { status: "failed", message: "Permission denied." }, editor: editor({ mode: "edit" }) });
    const out = html(props);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Save changes<\/button>/);
    expect(out).toContain(`<p class="comments-helper" role="status">${READ_FAILED_EDITOR}</p>`);
    expect(out).not.toContain("Comments are read-only");
    expect(out.match(/Couldn’t read comments/g)).toHaveLength(1);
  });
  test("names the create button by scope and explains a disabled Selection scope", () => {
    expect(find(CommentsPanel(panel({ filter: { scope: "selection", node: "n1", status: "open" } })), "Comment on selection").disabled).toBe(false);
    expect(html(panel({ selectionAvailable: false }))).toContain(`<button type="button" aria-pressed="false" disabled="" title="Select an element or frame in the canvas">Selection</button>`);
    expect(html(panel())).not.toContain("Select an element or frame in the canvas");
  });
});

describe("panel layout (comments-readability §3, composer-small)", () => {
  const order = (out: string, ...parts: string[]) => {
    const at = parts.map(part => out.indexOf(part));
    for (const index of at) expect(index).toBeGreaterThanOrEqual(0);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  };
  test("the sticky title is the panel's first child, outside the head", () => {
    expect(html(panel())).toMatch(/^<section class="comments-panel native-scroll" aria-label="Comments"><h3 class="comments-title" tabindex="-1">Comments<\/h3><div class="comments-head"><div class="comments-segment"/);
    expect(html(panel({ identityCause: "missing" }))).toMatch(/^<section[^>]*><h3 class="comments-title alone" tabindex="-1">Comments<\/h3><div class="comments-message error"/);
  });
  test("the composer and a card editor open right under the head, above messages, warnings and the list", () => {
    const warnings = { status: "ready" as const, comments: [comment], warnings: [{ code: "invalid_event" as const, line: 3 }] };
    for (const mode of ["create", "edit"] as const) {
      const out = html(panel({ read: warnings, widthInvalid: true, createBlocked: "The original canvas document is unavailable.", author: { status: "missing" }, editor: editor({ mode }) }));
      order(out, 'class="comments-head"', 'class="comments-composer"', "Could not read a valid board width.", "The original canvas document is unavailable.", "Set your Git name", "Some comment changes were ignored", 'class="comments-card"');
    }
    order(html(panel({ read: { status: "failed", message: "Permission denied." }, editor: editor({ mode: "edit" }) })), 'class="comments-composer"', "Couldn’t read comments");
    order(html(panel({ read: { status: "loading" }, editor: editor() })), 'class="comments-composer"', "Loading comments…");
    order(html(panel({ identityCause: "duplicate", editor: editor({ mode: "edit" }) })), 'class="comments-title alone"', 'class="comments-composer"', "Another canvas uses the ID checkout");
  });
  test("cards take programmatic focus and name their comment", () => {
    expect(html(panel())).toContain(`<article class="comments-card" tabindex="-1" data-comment="c1" aria-label="Comment by Alex Morgan"`);
  });
});

describe("revealComposer", () => {
  // Offsets from the panel's top edge at scroll 0, as measured in the draft at 960 × 600.
  function layout({ composerTop, composerHeight, clientHeight, scrollTop = 0 }: { composerTop: number; composerHeight: number; clientHeight: number; scrollTop?: number }) {
    const panel = { scrollTop, clientHeight, getBoundingClientRect: () => ({ top: 100 }), querySelector: () => ({ offsetHeight: 37 }) };
    const composer = { offsetHeight: composerHeight, getBoundingClientRect: () => ({ top: 100 + composerTop - panel.scrollTop }) };
    const field = { closest: (selector: string) => selector === ".comments-panel" ? panel : selector === ".comments-composer" ? composer : null };
    return { panel, field: field as unknown as HTMLElement };
  }
  test("scrolls a composer that does not fit to just under the sticky title", () => {
    const { panel, field } = layout({ composerTop: 152, composerHeight: 168, clientHeight: 282 });
    revealComposer(field);
    expect(panel.scrollTop).toBe(152 - 37);
  });
  test("leaves a composer that fits where it is, and brings back one scrolled above the title", () => {
    const fits = layout({ composerTop: 152, composerHeight: 168, clientHeight: 462 });
    revealComposer(fits.field);
    expect(fits.panel.scrollTop).toBe(0);
    const above = layout({ composerTop: 152, composerHeight: 168, clientHeight: 462, scrollTop: 400 });
    revealComposer(above.field);
    expect(above.panel.scrollTop).toBe(152 - 37);
  });
});

test("a resolved card's target line locates like an open card's (revision-recheck task 5)", () => {
  const onComment = vi.fn();
  const card = CommentCard({ comment: { ...comment, status: "resolved" }, frames: [], freshness: "same", locationMissing: false, disabled: false, busy: false, onComment, onHandOff: noop });
  find(card, "Element · button submit").onClick?.();
  expect(onComment).toHaveBeenCalledExactlyOnceWith("locate", "c1");
});

describe("resolution meta, Canvas changed and status lines (revision-recheck task 6)", () => {
  const codex = { kind: "agent" as const, name: "codex" }, kim = { kind: "human" as const, name: "Kim Doe" };
  const resolved: Comment = { ...comment, status: "resolved", resolvedBy: codex, resolvedAt: "2026-10-25T14:02:10.000Z" };
  const reopened: Comment = { ...comment, lastResolution: { by: codex, at: "2026-10-25T14:02:10.000Z", reopenedBy: kim, reopenedAt: "2026-10-25T14:04:30.000Z" } };
  const card = (c: Comment, freshness: CommentCardProps["freshness"] = "same") => renderToStaticMarkup(<CommentCard comment={c} frames={[]} freshness={freshness} locationMissing={false} disabled={false} busy={false} onComment={noop} onHandOff={noop} />);
  test("a resolved card names its resolver under the badges, with the absolute time in title", () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-25T14:05:10.000Z") });
    try {
      const out = card(resolved);
      expect(out).toContain(`<p class="comments-resolution"><time dateTime="2026-10-25T14:02:10.000Z" title="2026-10-25T14:02:10.000Z">Resolved by <b>codex</b> · 3 minutes ago</time></p>`);
      expect(out.indexOf('class="comments-badges"')).toBeLessThan(out.indexOf('class="comments-resolution"'));
      expect(out.indexOf('class="comments-resolution"')).toBeLessThan(out.indexOf('class="comments-body"'));
    } finally { vi.useRealTimers(); }
  });
  test("a reopened open card says who reopened it and who had resolved it", () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-25T14:05:30.000Z") });
    try {
      const out = card(reopened);
      expect(out).toContain(`<p class="comments-resolution"><time dateTime="2026-10-25T14:04:30.000Z" title="2026-10-25T14:04:30.000Z">Reopened by <b>Kim Doe</b> · 1 minute ago</time></p><p class="comments-resolution">Previously resolved by <b>codex</b></p>`);
      expect(card(comment)).not.toContain("comments-resolution");
    } finally { vi.useRealTimers(); }
  });
  test("an open card shows Canvas changed and Freshness unknown as neutral badges", () => {
    expect(card(comment, "outdated")).toContain(`<span class="comments-badge" title="The canvas changed after this comment was written.">Canvas changed</span>`);
    expect(card(comment, "unknown")).toContain(`<span class="comments-badge">Freshness unknown</span>`);
    for (const freshness of ["outdated", "unknown"] as const) expect(card(comment, freshness)).not.toContain("comments-badge warning");
    expect(card(comment, "same")).not.toMatch(/Canvas changed|Freshness unknown/);
  });
  test("a resolved card shows neither Canvas changed nor Freshness unknown", () => {
    for (const freshness of ["outdated", "unknown"] as const) expect(card(resolved, freshness)).not.toMatch(/Canvas changed|Freshness unknown|Outdated/);
  });
  describe("the status line in a card's place", () => {
    const list = (...ids: string[]) => ({ status: "ready" as const, comments: ids.map(id => ({ ...comment, comment: id })), warnings: [] });
    const line = `<p class="comments-status" role="status">Resolved — moved to Resolved.</p>`;
    const at = (out: string, part: string) => out.indexOf(part);
    test("stands before the card that followed the one that left", () => {
      const out = html(panel({ read: list("c2", "c3"), statusLine: { comment: "c1", text: "Resolved — moved to Resolved.", before: "c3" } }));
      expect(out).toContain(line);
      expect(at(out, 'data-comment="c2"')).toBeLessThan(at(out, line));
      expect(at(out, line)).toBeLessThan(at(out, 'data-comment="c3"'));
    });
    test("ends the list when the card was last or its follower is gone too", () => {
      for (const before of [null, "c9"]) {
        const out = html(panel({ read: list("c2"), statusLine: { comment: "c1", text: "Resolved — moved to Resolved.", before } }));
        expect(at(out, 'data-comment="c2"')).toBeLessThan(at(out, line));
      }
    });
    test("stands in an emptied list above its empty message", () => {
      const out = html(panel({ read: list(), statusLine: { comment: "c1", text: "Resolved — moved to Resolved.", before: null } }));
      expect(at(out, line)).toBeGreaterThan(-1);
      expect(at(out, line)).toBeLessThan(at(out, "No open comments"));
    });
    test("is not shown in a list that shows the card itself", () => {
      expect(html(panel({ read: list("c1"), statusLine: { comment: "c1", text: "Resolved — moved to Resolved.", before: null } }))).not.toContain("comments-status");
    });
  });
});

describe("editing a resolved comment and replacing a missing target (revision-recheck task 9)", () => {
  const buttons = (out: string) => [...out.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
  test("a resolved comment's editor puts Save and reopen last as primary, Save only before it, and says why", () => {
    const out = renderToStaticMarkup(<CommentEditor {...editor({ mode: "edit", saveOnly: noop })} />);
    expect(buttons(out)).toEqual(["Cancel", "Save only", "Save and reopen"]);
    expect(out).toContain(`<button type="button" class="comments-btn primary">Save and reopen</button>`);
    expect(out).toContain(`<p class="comments-helper">Agents read open comments only.</p>`);
    const onSave = vi.fn(), saveOnly = vi.fn(), tree = CommentEditor(editor({ mode: "edit", onSave, saveOnly }));
    find(tree, "Save and reopen").onClick?.(); find(tree, "Save only").onClick?.();
    expect(onSave).toHaveBeenCalledOnce(); expect(saveOnly).toHaveBeenCalledOnce();
  });
  test("an open comment's editor keeps the single Save changes", () => {
    const out = renderToStaticMarkup(<CommentEditor {...editor({ mode: "edit" })} />);
    expect(buttons(out)).toEqual(["Cancel", "Save changes"]);
    expect(out).not.toContain("Agents read open comments only.");
  });
  test("both saves lock while saving", () => {
    const tree = CommentEditor(editor({ mode: "edit", saveOnly: noop, state: { status: "saving" } }));
    expect(find(tree, "Save only").disabled).toBe(true); expect(find(tree, "Saving…").disabled).toBe(true);
  });
  test("a retry of the original save offers only that retry", () => {
    const out = renderToStaticMarkup(<CommentEditor {...editor({ mode: "edit", saveOnly: noop, state: { status: "retry-original" } })} />);
    expect(buttons(out)).toEqual(["Keep draft", "Retry original save"]);
  });
  test("the line after Save and reopen offers Show", () => {
    const onShowStatus = vi.fn();
    const props = panel({ filter: { scope: "canvas", status: "resolved" }, read: { status: "ready", comments: [], warnings: [] }, statusLine: { comment: "c1", text: "Reopened — moved to Open.", before: null, show: true }, onShowStatus });
    expect(html(props)).toContain(`<p class="comments-status" role="status">Reopened — moved to Open.<button type="button">Show</button></p>`);
    find(CommentsPanel(props), "Show").onClick?.();
    expect(onShowStatus).toHaveBeenCalledExactlyOnceWith("c1");
    expect(html({ ...props, statusLine: { comment: "c1", text: "Reopened — moved to Open.", before: null } })).not.toContain("Show</button>");
  });

  const missing = (over: Partial<CommentsPanelProps> = {}) => html(panel({ missingLocations: new Set(["c1"]), ...over }));
  test("an open comment whose location is unavailable offers Comment on selection instead", () => {
    const onComment = vi.fn(), props = panel({ missingLocations: new Set(["c1"]), onComment });
    expect(html(props)).toContain(`<button type="button" class="comments-btn">Comment on selection instead</button>`);
    const card = CommentCard({ comment, frames: [], freshness: "same", locationMissing: true, disabled: false, busy: false, instead: "ready", onComment, onHandOff: noop });
    find(card, "Comment on selection instead").onClick?.();
    expect(onComment).toHaveBeenCalledExactlyOnceWith("comment-instead", "c1");
  });
  test("without a selection it is disabled, with the reason linked to it", () => {
    const out = missing({ selectionAvailable: false });
    expect(out).toContain(`<button type="button" class="comments-btn" disabled="" aria-describedby="«r1»">Comment on selection instead</button>`);
    expect(out).toContain(`<p class="comments-helper" id="«r1»">Select an element or frame first.</p>`);
    expect(missing()).not.toContain("Select an element or frame first.");
  });
  test("it locks with the card's other writes", () => {
    expect(missing({ busy: true })).toContain(`disabled="">Comment on selection instead`);
    expect(missing({ widthInvalid: true })).toContain(`disabled="">Comment on selection instead`);
  });
  test("a resolved comment, a found location or no rendered document has no such button", () => {
    expect(missing({ read: { status: "ready", comments: [{ ...comment, status: "resolved" }], warnings: [] } })).not.toContain("Comment on selection instead");
    expect(html(panel())).not.toContain("Comment on selection instead");
    expect(html(panel({ missingLocations: null }))).not.toContain("Comment on selection instead");
  });
  test("after the new comment saves, the Delete dialog asks about the original, Keep both first", () => {
    const onCancel = vi.fn(), onConfirm = vi.fn();
    const dialog = DeleteCommentDialog({ comment, replacedOn: "Element · p promo-text · in Home", onCancel, onConfirm });
    const out = renderToStaticMarkup(dialog);
    expect(out).toContain(`aria-label="Delete the original comment?"`);
    expect(out).toContain("<h3>Delete the original comment?</h3><p>Your text was saved as a new comment on Element · p promo-text · in Home.</p>");
    expect(out).toContain(`<button type="button" class="comments-btn" autofocus="">Keep both</button><button type="button" class="comments-btn danger">Delete original</button>`);
    find(dialog, "Keep both").onClick?.(); expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
    find(dialog, "Delete original").onClick?.(); expect(onConfirm).toHaveBeenCalledOnce();
  });
});

// project-feedback design §5, draft `id-change-notice`: the first banner under
// the head, above the review notice, and above the canvas-ID block.
describe("id change notice", () => {
  const notice = { text: "3 comments still use the old ID checkout-v1 and no longer show here.", onShow: noop };
  const banner = '<div class="comments-message warning notice" role="status">3 comments still use the old ID checkout-v1 and no longer show here.<button type="button" class="comments-btn">Show</button></div>';

  test("sits right under the head, before the review notice", () => {
    const html = renderToStaticMarkup(<CommentsPanel {...panel({ idNotice: notice, reviewNotice: { count: 3, firstSeen: false, blocked: false, onStart: noop } })} />);
    expect(html).toContain(`Comment on canvas</button></div></div>${banner}`);
    expect(html.indexOf(banner)).toBeLessThan(html.indexOf("since your last review"));
  });

  test("stays first above the canvas-ID block", () => {
    const html = renderToStaticMarkup(<CommentsPanel {...panel({ idNotice: notice, identityCause: "duplicate" })} />);
    expect(html).toContain(`<h3 class="comments-title alone" tabindex="-1">Comments</h3>${banner}<div class="comments-message error" role="alert">`);
  });

  test("Show calls back", () => {
    const onShow = vi.fn();
    const element = CommentsPanel(panel({ idNotice: { ...notice, onShow } })) as { props: { children: ReactNode } };
    const find = (node: ReactNode): (() => void) | undefined => {
      for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
        if (child.props.children === "Show" && child.props.onClick) return child.props.onClick;
        const found = find(child.props.children);
        if (found) return found;
      }
      return undefined;
    };
    find(element.props.children)?.();
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  test("absent without a notice", () => {
    expect(renderToStaticMarkup(<CommentsPanel {...panel()} />)).not.toContain("old ID");
  });
});
