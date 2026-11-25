import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CanvasTrashDialog, trashDialogView } from "./CanvasTrashDialog";

// PRODUCT §5 item 1 'Canvas row menu'.
const PATH = ".doan/canvases/checkout.html";
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...[node.props.children].flat().flatMap(child => all(child as ReactNode))];
}
const buttons = (tree: ReactNode) => all(tree).filter(element => element.type === "button");

test("names the canvas and its path, with the same body before and after main's plan", () => {
  const pending = trashDialogView("checkout", PATH, null, false);
  expect(pending.title).toBe("Move “checkout” to Trash?");
  expect(pending.body).toBe("This removes .doan/canvases/checkout.html from the repository. You can restore it from the Trash. Doan doesn’t commit this change.");
  expect(trashDialogView("checkout", PATH, { kind: "ready" }, false).body).toBe(pending.body);
  expect(trashDialogView("checkout", PATH, { kind: "refused", reason: "busy" }, false).body).toBe(pending.body);
});

test("Move to Trash waits for main's plan and holds while an agent works, with the reason under the body", () => {
  expect(trashDialogView("checkout", PATH, null, false)).toMatchObject({ confirmable: false, reason: null });
  expect(trashDialogView("checkout", PATH, { kind: "ready" }, false)).toMatchObject({ confirmable: true, reason: null });
  const working = "An agent started working on this canvas. Try again when it finishes.";
  expect(trashDialogView("checkout", PATH, { kind: "ready" }, true)).toMatchObject({ confirmable: false, reason: working });
  // Main's own busy plan reads the same way.
  expect(trashDialogView("checkout", PATH, { kind: "refused", reason: "busy" }, false)).toMatchObject({ confirmable: false, reason: working });
});

test("the compact alert dialog starts on Cancel; Escape and Cancel only cancel", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const tree = CanvasTrashDialog({ view: trashDialogView("checkout", PATH, { kind: "ready" }, false), cancel, confirm });
  expect(tree.props).toMatchObject({ className: "doan-dialog doan-scroll", "data-ui-size": "compact", role: "alertdialog", "aria-labelledby": "canvas-trash-title", "aria-describedby": "canvas-trash-body" });
  const [cancelButton, trashButton] = buttons(tree);
  expect(cancelButton!.props).toMatchObject({ children: "Cancel", autoFocus: true, "data-ui-variant": "subtle" });
  expect(trashButton!.props).toMatchObject({ children: "Move to Trash", "data-ui-variant": "prominent" });
  // DESIGN 'Dialogs': default-size actions.
  expect(cancelButton!.props["data-ui-size"]).toBeUndefined();
  const escape = { preventDefault: vi.fn() };
  (tree.props.onCancel as (event: unknown) => void)(escape);
  expect(escape.preventDefault).toHaveBeenCalledOnce();
  (cancelButton!.props.onClick as () => void)();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(confirm).not.toHaveBeenCalled();
  (trashButton!.props.onClick as () => void)();
  expect(confirm).toHaveBeenCalledOnce();
});

test("an unavailable Move to Trash is aria-disabled, reads its reason and does nothing", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const tree = CanvasTrashDialog({ view: trashDialogView("checkout", PATH, { kind: "ready" }, true), cancel, confirm });
  const trash = buttons(tree)[1]!;
  expect(trash.props).toMatchObject({ "aria-disabled": true, "data-disabled": "", "aria-describedby": "canvas-trash-reason" });
  expect(trash.props.disabled).toBeUndefined();
  (trash.props.onClick as () => void)();
  expect(confirm).not.toHaveBeenCalled();
  const reason = all(tree).find(element => element.props.id === "canvas-trash-reason")!;
  expect(reason.props.className).toBe("doan-notice");
  // Still waiting for main: unavailable without a reason line.
  const pending = buttons(CanvasTrashDialog({ view: trashDialogView("checkout", PATH, null, false), cancel, confirm }))[1]!;
  expect(pending.props).toMatchObject({ "aria-disabled": true });
  expect(pending.props["aria-describedby"]).toBeUndefined();
});

test("static markup: title, body, the working line and the actions in order", () => {
  const html = renderToStaticMarkup(<CanvasTrashDialog view={trashDialogView("checkout", PATH, { kind: "ready" }, true)} cancel={() => {}} confirm={() => {}} />);
  expect(html).toContain('<dialog class="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="canvas-trash-title" aria-describedby="canvas-trash-body">');
  expect(html).toContain('<h3 class="doan-dialog-title" id="canvas-trash-title">Move “checkout” to Trash?</h3>');
  expect(html).toContain('<p class="doan-notice" id="canvas-trash-reason"><svg');
  expect(html).toContain("<span class=\"selectable\">An agent started working on this canvas. Try again when it finishes.</span>");
  expect(html.indexOf(">Cancel<")).toBeLessThan(html.indexOf(">Move to Trash<"));
  expect(html.indexOf('id="canvas-trash-body"')).toBeLessThan(html.indexOf('id="canvas-trash-reason"'));
});

// Read-only text is selectable (the `selectable` class); the title and buttons are not.
test("selectable: the description and the reason text, but not the title or the buttons", () => {
  const html = renderToStaticMarkup(<CanvasTrashDialog view={trashDialogView("checkout", PATH, { kind: "ready" }, true)} cancel={() => {}} confirm={() => {}} />);
  expect(html).toContain('<p class="doan-dialog-description selectable" id="canvas-trash-body">');
  expect(html).toContain('<span class="selectable">An agent started working on this canvas. Try again when it finishes.</span>');
  expect(html).not.toMatch(/<h3[^>]*selectable/);
  expect(html).not.toMatch(/<button[^>]*selectable/);
});

// DESIGN 'Busy action': while main's plan is out the confirm is busy, not unavailable without a reason.
test("while main's plan is out, Move to Trash keeps its fill with the spinner, aria-busy and aria-disabled; Cancel stays available", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const view = trashDialogView("checkout", PATH, null, false);
  expect(view).toMatchObject({ confirmable: false, busy: true, cancellable: true, reason: null, error: null });
  const tree = CanvasTrashDialog({ view, cancel, confirm });
  const [cancelButton, trash] = buttons(tree);
  expect(trash!.props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  expect(trash!.props["data-disabled"]).toBeUndefined();
  expect(renderToStaticMarkup(trash!)).toMatch(/<span class="doan-spinner" aria-hidden="true"><\/span>Move to Trash<\/button>$/);
  (trash!.props.onClick as () => void)();
  expect(confirm).not.toHaveBeenCalled();
  expect(cancelButton!.props["aria-disabled"]).toBeUndefined();
  (cancelButton!.props.onClick as () => void)();
  expect(cancel).toHaveBeenCalledOnce();
});

test("a plan read that failed keeps the dialog with a reason line; Move to Trash is unavailable and reads it", () => {
  const view = trashDialogView("checkout", PATH, { kind: "refused", reason: "failed" }, false);
  expect(view).toMatchObject({ confirmable: false, busy: false, cancellable: true, error: null,
    reason: "Doan couldn’t get this canvas ready to move. Close and try again, or move the file to the Trash in Finder." });
  const trash = buttons(CanvasTrashDialog({ view, cancel: vi.fn(), confirm: vi.fn() }))[1]!;
  expect(trash.props).toMatchObject({ "aria-disabled": true, "data-disabled": "", "aria-describedby": "canvas-trash-reason" });
  expect(trash.props["aria-busy"]).toBeUndefined();
});

// DESIGN 'Busy action': a confirmation that can fail stays open, busy, until main answers; Cancel and Escape are refused meanwhile.
test("while the move is out the confirm is busy and Cancel and Escape are refused", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const view = trashDialogView("checkout", PATH, { kind: "ready" }, false, { pending: true, failed: null });
  expect(view).toMatchObject({ confirmable: false, busy: true, cancellable: false, error: null });
  const tree = CanvasTrashDialog({ view, cancel, confirm });
  const [cancelButton, trash] = buttons(tree);
  expect(cancelButton!.props).toMatchObject({ "aria-disabled": true, "data-disabled": "" });
  expect(trash!.props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  (cancelButton!.props.onClick as () => void)();
  const escape = { preventDefault: vi.fn() };
  (tree.props.onCancel as (event: unknown) => void)(escape);
  expect(escape.preventDefault).toHaveBeenCalledOnce();
  (trash!.props.onClick as () => void)();
  expect(cancel).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

// Chromium closes a modal dialog on a repeated Escape even when its cancel is prevented: the keydown itself is handled,
// so a busy alert stays open.
test("Escape's keydown is taken by the alert: refused while the move is out, a cancel otherwise, and left alone while composing", () => {
  const key = (view: ReturnType<typeof trashDialogView>, isComposing = false) => {
    const cancel = vi.fn(), event = { key: "Escape", nativeEvent: { isComposing }, preventDefault: vi.fn() };
    const onKeyDown = CanvasTrashDialog({ view, cancel, confirm: vi.fn() }).props.onKeyDown as ((event: unknown) => void) | undefined;
    onKeyDown?.(event);
    return { cancelled: cancel.mock.calls.length, prevented: event.preventDefault.mock.calls.length };
  };
  const ready = trashDialogView("checkout", PATH, { kind: "ready" }, false);
  const moving = trashDialogView("checkout", PATH, { kind: "ready" }, false, { pending: true, failed: null });
  expect(key(moving)).toEqual({ cancelled: 0, prevented: 1 });
  expect(key(ready)).toEqual({ cancelled: 1, prevented: 1 });
  expect(key(ready, true)).toEqual({ cancelled: 0, prevented: 0 });
});

test("a refused move shows the refusal's sentence as an error notice inside the dialog, and Move to Trash retries", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const view = trashDialogView("checkout", PATH, { kind: "ready" }, false, { pending: false, failed: { kind: "refused", reason: "failed" } });
  expect(view).toMatchObject({ confirmable: true, busy: false, cancellable: true, reason: null, error: "Couldn’t move “checkout” to Trash. Try again, or move the file in Finder." });
  const tree = CanvasTrashDialog({ view, cancel, confirm });
  const html = renderToStaticMarkup(tree);
  expect(html).toMatch(/<p class="doan-notice error" role="alert" id="canvas-trash-error"><svg[^>]*>.*?<\/svg><span class="selectable">Couldn’t move “checkout” to Trash\. Try again, or move the file in Finder\.<\/span><\/p><div class="doan-dialog-actions">/);
  const trash = buttons(tree)[1]!;
  expect(trash.props["aria-describedby"]).toBe("canvas-trash-error");
  (trash.props.onClick as () => void)();
  expect(confirm).toHaveBeenCalledOnce();
});
