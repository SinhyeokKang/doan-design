import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CanvasTrashDialog, trashDialogView } from "./CanvasTrashDialog";

// canvas-row-menu design 'Alert Dialog' and '문구'.
const PATH = ".doan/canvases/checkout.html";
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...[node.props.children].flat().flatMap(child => all(child as ReactNode))];
}
const buttons = (tree: ReactNode) => all(tree).filter(element => element.type === "button");

test("names the canvas and its path; the comments only once main said they go too", () => {
  const pending = trashDialogView("checkout", PATH, null, false);
  expect(pending.title).toBe("Move “checkout” to Trash?");
  expect(pending.body).toBe("This removes .doan/canvases/checkout.html from the repository. You can restore it from the Trash. Doan doesn’t commit this change.");
  expect(trashDialogView("checkout", PATH, { kind: "ready", comments: false }, false).body).toBe(pending.body);
  expect(trashDialogView("checkout", PATH, { kind: "ready", comments: false }, false).body).not.toContain("comments");
  expect(trashDialogView("checkout", PATH, { kind: "ready", comments: true }, false).body)
    .toBe("This removes .doan/canvases/checkout.html and its comments from the repository. You can restore them from the Trash. Doan doesn’t commit this change.");
});

test("Move to Trash waits for main's plan and holds while an agent works, with the reason under the body", () => {
  expect(trashDialogView("checkout", PATH, null, false)).toMatchObject({ confirmable: false, reason: null });
  expect(trashDialogView("checkout", PATH, { kind: "ready", comments: true }, false)).toMatchObject({ confirmable: true, reason: null });
  const working = "An agent started working on this canvas. Try again when it finishes.";
  expect(trashDialogView("checkout", PATH, { kind: "ready", comments: true }, true)).toMatchObject({ confirmable: false, reason: working });
  // Main's own busy plan reads the same way (conductor decision for C2).
  expect(trashDialogView("checkout", PATH, { kind: "refused", reason: "busy" }, false)).toMatchObject({ confirmable: false, reason: working });
});

test("the compact alert dialog starts on Cancel; Escape and Cancel only cancel", () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const tree = CanvasTrashDialog({ view: trashDialogView("checkout", PATH, { kind: "ready", comments: false }, false), cancel, confirm });
  expect(tree.props).toMatchObject({ className: "doan-dialog", "data-ui-size": "compact", role: "alertdialog", "aria-labelledby": "canvas-trash-title", "aria-describedby": "canvas-trash-body" });
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
  const tree = CanvasTrashDialog({ view: trashDialogView("checkout", PATH, { kind: "ready", comments: true }, true), cancel, confirm });
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
  const html = renderToStaticMarkup(<CanvasTrashDialog view={trashDialogView("checkout", PATH, { kind: "ready", comments: true }, true)} cancel={() => {}} confirm={() => {}} />);
  expect(html).toContain('<dialog class="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="canvas-trash-title" aria-describedby="canvas-trash-body">');
  expect(html).toContain('<h3 class="doan-dialog-title" id="canvas-trash-title">Move “checkout” to Trash?</h3>');
  expect(html).toContain('<p class="doan-notice" id="canvas-trash-reason"><svg');
  expect(html).toContain("<span>An agent started working on this canvas. Try again when it finishes.</span>");
  expect(html.indexOf(">Cancel<")).toBeLessThan(html.indexOf(">Move to Trash<"));
  expect(html.indexOf('id="canvas-trash-body"')).toBeLessThan(html.indexOf('id="canvas-trash-reason"'));
});
