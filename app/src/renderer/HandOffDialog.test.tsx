import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Comment } from "../formats/types";
import type { FolderEntry } from "../main/view";
import { copyText } from "../comments/projection";
import { handoffRows } from "../comments/handoff";
import { COPY_FAILED } from "./onboardingView";
import type { HandoffCopy, HandoffDialog } from "./CommentsSession";
import { HandOffDialog, handoffContext, staleText, type HandOffDialogProps } from "./HandOffDialog";
import { AlertIcon } from "./AlertIcon";

// The icon that leads every error and warning, as the components render it.
const icon = renderToStaticMarkup(<AlertIcon />), icon20 = renderToStaticMarkup(<AlertIcon size={20} />);

const comment = (id: string, body: string, target: Comment["target"] = {}): Comment => ({
  comment: id, body, status: "open", target, canvasHash: "h", createdBy: { kind: "human", name: "A" }, createdAt: `2026-10-25T0${id.slice(1)}:00:00.000Z`, updatedAt: "2026-10-25T00:00:00.000Z",
});
const comments = [
  comment("c1", "Make the address field full width on mobile.", { element: { doanId: "address", selector: "#shipping > label", html: "<label/>" }, frame: "shipping" }),
  comment("c2", "\n  Move the order summary above the card form.\nAlso check the tax line.", { frame: "payment" }),
  comment("c3", "Use the brand blue for every primary button."),
];
const frames = [{ id: "shipping", title: "Shipping" }, { id: "payment", title: "Payment" }];
const lookup = { root: "/repo", canvas: "checkout", generation: 1, nodes: new Map<string, string>() };
function dialog(over: Partial<HandoffDialog> = {}): HandoffDialog {
  return { id: "d1", root: "/repo", canvas: "checkout", rows: handoffRows(comments, frames), checked: ["c1", "c2", "c3"], frames, selection: null, copy: { status: "idle" }, ...over };
}
const noop = () => {};
function props(over: Partial<HandOffDialogProps> = {}, d: Partial<HandoffDialog> = {}): HandOffDialogProps {
  return { dialog: dialog(d), context: "acme-web › ⎇ main › Checkout", notice: null, onToggle: noop, onQuick: noop, onCopy: noop, onClose: noop, ...over };
}
const html = (p: HandOffDialogProps) => renderToStaticMarkup(<HandOffDialog {...p} />);
type Props = { children?: ReactNode; disabled?: boolean; title?: string; type?: string; checked?: boolean; onClick?: () => void; onChange?: () => void; className?: string };
function all(node: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue;
    out.push(child); all(child.props.children, out);
  }
  return out;
}
const button = (tree: ReactNode, label: string) => {
  const found = all(tree).find(el => el.type === "button" && Children.toArray(el.props.children).join("") === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found.props;
};
const boxes = (tree: ReactNode) => all(tree).filter(el => el.type === "input").map(el => el.props);
const element = (p: HandOffDialogProps) => HandOffDialog(p) as ReactElement<{ onKeyDown: (event: unknown) => void; onCancel: (event: unknown) => void; ref: (node: unknown) => void }>;
const key = (k: string, over: { isComposing?: boolean; keyCode?: number; tagName?: string } = {}) => ({
  key: k, target: { tagName: over.tagName ?? "INPUT" }, nativeEvent: { isComposing: over.isComposing ?? false, keyCode: over.keyCode ?? 13 }, preventDefault: vi.fn(), stopPropagation: vi.fn(),
});

describe("the Hand off dialog", () => {
  test("shows the context, the fixed rows, quick select, the instruction and Copy N", () => {
    const out = html(props());
    expect(out).toContain(`<h3 class="doan-dialog-title">Hand off to your agent</h3><p class="handoff-context">acme-web › ⎇ main › Checkout</p>`);
    expect(out).toContain(`<div class="handoff-quick" role="group" aria-label="Quick select"><button type="button" class="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm">All</button><button type="button" class="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm">None</button><button type="button" class="comments-btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled="" title="Select an element or frame on the canvas first.">Selection</button></div>`);
    // The first non-blank line, whole: the line cut is CSS; the full body is the title.
    expect(out).toContain(`<span class="handoff-target" title="[data-doan-frame=&quot;payment&quot;]">Frame · Payment</span><span class="handoff-body" title="\n  Move the order summary above the card form.\nAlso check the tax line.">Move the order summary above the card form.</span>`);
    expect(out).toContain(`<details class="handoff-instruction"><summary>Show instruction</summary><div class="handoff-preview">${renderToStaticMarkup(<>{copyText("/repo", "checkout", comments, ["c1", "c2", "c3"])}</>)}</div></details>`);
    expect(out).toMatch(/<div class="handoff-actions doan-dialog-actions"><span class="spacer"><\/span><button type="button" class="comments-btn doan-button" data-ui-variant="subtle">Cancel<\/button><button type="button" class="comments-btn primary doan-button" data-ui-variant="prominent">Copy 3<\/button><\/div><\/dialog>$/);
    expect(out).not.toContain("handoff-notice");
    expect(out).not.toContain("handoff-status");
  });
  test("tab stops follow quick select → rows → Show instruction → Cancel → Copy; the worktree notice is not one", () => {
    const out = html(props({ notice: "Comments are per worktree. Your agent should work in feat-checkout (~/code/acme-web-checkout)." }));
    const stops = [...out.matchAll(/<(button|input|summary)[^>]*>([^<]*)/g)].map(([, tag, text]) => tag === "input" ? "row" : text);
    expect(stops).toEqual(["All", "None", "Selection", "row", "row", "row", "Show instruction", "Cancel", "Copy 3"]);
    expect(out).toContain(`</details><p class="handoff-notice doan-notice warning">${icon}<span>Comments are per worktree. Your agent should work in feat-checkout (~/code/acme-web-checkout).</span></p><div class="handoff-actions doan-dialog-actions">`);
    expect(out).not.toMatch(/tabindex="0"/);
  });
  test("the preview is the checked ids' instruction; nothing checked disables Copy 0 and draws no preview", () => {
    expect(html(props({}, { checked: ["c3"] }))).toContain(renderToStaticMarkup(<>{copyText("/repo", "checkout", comments, ["c3"])}</>));
    const out = html(props({}, { checked: [] }));
    expect(out).not.toContain("Show instruction");
    expect(out).toContain(`<div class="handoff-actions doan-dialog-actions"><span class="comments-helper">Choose at least one comment.</span><button type="button" class="comments-btn doan-button" data-ui-variant="subtle">Cancel</button><button type="button" class="comments-btn primary doan-button" data-ui-variant="prominent" disabled="">Copy 0</button></div>`);
  });
  test("Selection is offered with the reason it is unavailable", () => {
    const selection = (node: string | null) => ({ node, label: "Element · button pay-button · in Payment", context: lookup, lookup });
    expect(button(HandOffDialog(props({}, { selection: selection("n1") })), "Selection")).toMatchObject({ disabled: true, title: "No open comments on Element · button pay-button · in Payment." });
    const onQuick = vi.fn();
    const ready = button(HandOffDialog(props({ onQuick }, { selection: { ...selection("n1"), lookup: { ...lookup, nodes: new Map([["c2", "n1"]]) } } })), "Selection");
    expect(ready.disabled).toBe(false); expect(ready.title).toBeUndefined();
    ready.onClick?.(); button(HandOffDialog(props({ onQuick })), "All").onClick?.(); button(HandOffDialog(props({ onQuick })), "None").onClick?.();
    expect(onQuick.mock.calls).toEqual([["selection"], ["all"], ["none"]]);
  });
  test("Space on a row's checkbox toggles that comment", () => {
    const onToggle = vi.fn();
    boxes(HandOffDialog(props({ onToggle }, { checked: ["c2"] })))[1]!.onChange?.();
    expect(onToggle).toHaveBeenCalledWith("c2");
    expect(boxes(HandOffDialog(props({}, { checked: ["c2"] }))).map(box => box.checked)).toEqual([false, true, false]);
  });
});

describe("copy states", () => {
  const at = (copy: HandoffCopy) => props({}, { copy });
  test("Copying… disables the checkboxes, quick select and both buttons", () => {
    const tree = HandOffDialog(at({ status: "copying" }));
    expect(boxes(tree).every(box => box.disabled)).toBe(true);
    for (const label of ["All", "None", "Selection", "Cancel", "Copying…"]) expect(button(tree, label).disabled).toBe(true);
    expect(html(at({ status: "copying" }))).toContain(`aria-busy="true"`);
  });
  test("a failure shows the copy failure in an alert and offers Retry copy with the checks kept", () => {
    const onCopy = vi.fn(), tree = HandOffDialog(props({ onCopy }, { copy: { status: "failed" } }));
    expect(html(at({ status: "failed" }))).toContain(`<p class="handoff-status doan-notice error" role="alert">${icon}<span>${COPY_FAILED.replace("’", "’")}</span></p><div class="handoff-actions doan-dialog-actions">`);
    expect(boxes(tree).every(box => !box.disabled && box.checked)).toBe(true);
    expect(button(tree, "Cancel").disabled).toBe(false);
    button(tree, "Retry copy").onClick?.(); expect(onCopy).toHaveBeenCalledOnce();
  });
  test("success leaves only Done, with the list and quick select shown but disabled", () => {
    const onClose = vi.fn(), tree = HandOffDialog(props({ onClose }, { copy: { status: "copied", count: 3 } }));
    const out = html(at({ status: "copied", count: 3 }));
    expect(out).toContain(`<p class="handoff-status doan-notice ok" role="status">Copied an instruction for 3 comments. Paste it into your Claude Code or Codex session.</p><div class="handoff-actions doan-dialog-actions"><span class="spacer"></span><button type="button" class="comments-btn primary doan-button" data-ui-variant="prominent" autofocus="">Done</button></div>`);
    expect(html(at({ status: "copied", count: 1 }))).toContain("Copied an instruction for 1 comment. Paste it");
    expect(out).not.toContain("Cancel");
    expect(boxes(tree).every(box => box.disabled)).toBe(true);
    for (const label of ["All", "None", "Selection"]) expect(button(tree, label).disabled).toBe(true);
    button(tree, "Done").onClick?.(); expect(onClose).toHaveBeenCalledOnce();
  });
  test("a refusal names how many comments left the list", () => {
    expect(html(at({ status: "stale", count: 2 }))).toContain(`<p class="handoff-status doan-notice warning" role="alert">${icon}<span>2 comments are no longer open and were removed from the list. Review and copy again.</span></p>`);
    expect(staleText(1)).toBe("1 comment is no longer open and was removed from the list. Review and copy again.");
    const tree = HandOffDialog(at({ status: "stale", count: 2 }));
    expect(button(tree, "Copy 3").disabled).toBe(false); expect(button(tree, "All").disabled).toBe(false);
  });
});

describe("keyboard and focus", () => {
  test("opening shows the modal, scrolls to the first checked row and focuses Copy N", () => {
    const row = { scrollIntoView: vi.fn() }, copy = { focus: vi.fn() };
    const node = { open: false, showModal: vi.fn(() => { node.open = true; }), querySelector: vi.fn((selector: string) => selector.includes("checked") ? { closest: () => row } : copy) };
    const ref = element(props()).props.ref;
    ref(node); ref(node);
    expect(node.showModal).toHaveBeenCalledOnce();
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(copy.focus).toHaveBeenCalledOnce();
  });
  test("Return copies unless a button or the summary has its own Return; ignored while composing or with nothing to copy", () => {
    const onCopy = vi.fn(), tree = element(props({ onCopy }));
    tree.props.onKeyDown(key("Enter")); expect(onCopy).toHaveBeenCalledOnce();
    for (const tagName of ["BUTTON", "SUMMARY"]) tree.props.onKeyDown(key("Enter", { tagName }));
    tree.props.onKeyDown(key("Enter", { isComposing: true })); tree.props.onKeyDown(key("Enter", { keyCode: 229 }));
    element(props({ onCopy }, { checked: [] })).props.onKeyDown(key("Enter"));
    element(props({ onCopy }, { copy: { status: "copying" } })).props.onKeyDown(key("Enter"));
    expect(onCopy).toHaveBeenCalledOnce();
    const onClose = vi.fn();
    element(props({ onClose }, { copy: { status: "copied", count: 3 } })).props.onKeyDown(key("Enter"));
    expect(onClose).toHaveBeenCalledOnce();
  });
  test("Copy keeps focus inside the dialog when its button disables", () => {
    const onCopy = vi.fn(), tree = element(props({ onCopy }));
    const node = { open: true, focus: vi.fn(), close: vi.fn() };
    tree.props.ref(node);
    button(tree, "Copy 3").onClick?.();
    expect(node.focus).toHaveBeenCalledOnce(); expect(onCopy).toHaveBeenCalledOnce();
  });
  test("Escape is Cancel, also while copying; ignored during IME composition", () => {
    for (const copy of [{ status: "idle" }, { status: "copying" }] as const) {
      const onClose = vi.fn(), tree = element(props({ onClose }, { copy }));
      const node = { open: true, close: vi.fn() };
      tree.props.ref(node);
      for (const over of [{ isComposing: true, keyCode: 27 }, { keyCode: 229 }]) tree.props.onKeyDown(key("Escape", over));
      expect(onClose).not.toHaveBeenCalled();
      const escape = key("Escape", { keyCode: 27 });
      tree.props.onKeyDown(escape);
      expect(escape.preventDefault).toHaveBeenCalled(); expect(escape.stopPropagation).toHaveBeenCalled();
      expect(node.close).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalledOnce();
      const cancel = { preventDefault: vi.fn() };
      tree.props.onCancel(cancel); expect(cancel.preventDefault).toHaveBeenCalled(); expect(onClose).toHaveBeenCalledTimes(2);
    }
  });
});

describe("the context line", () => {
  const list = (path: string, git: Partial<NonNullable<Extract<FolderEntry, { kind: "list" }>["git"]>> | undefined): FolderEntry =>
    ({ kind: "list", path, canvases: [], servedRev: 0, ...(git ? { git: { common: "/code/acme-web/.git", worktrees: [path], ...git } } : {}) }) as FolderEntry;
  test("project › ⎇ branch › canvas, or the folder name without a branch", () => {
    expect(handoffContext([list("/code/acme-web", { branch: "main" })], "/code/acme-web", "Checkout")).toBe("acme-web › ⎇ main › Checkout");
    expect(handoffContext([list("/code/acme-web-review", undefined)], "/code/acme-web-review", "Checkout")).toBe("acme-web-review › acme-web-review › Checkout");
    // Detached: no branch to name, unlike the top bar's "⎇ detached abc1234" (conductor decision, draft dialog-states).
    const detached = [list("/code/acme-web", { main: "/code/acme-web", branch: "main" }), list("/code/acme-web-review", { main: "/code/acme-web", detached: "abc1234def" })];
    expect(handoffContext(detached, "/code/acme-web-review", "Checkout")).toBe("acme-web › acme-web-review › Checkout");
  });
});
