import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "radix-ui";
import { Trash2 } from "lucide-react";
import { expect, test, vi } from "vitest";
import { TooltipContent } from "./components/ui/tooltip";
import { ConversationDeleteDialog, ConversationDeleteItem, unsentDraft } from "./ConversationDeleteDialog";
import { EMPTY_DRAFT } from "./dockedRules";

// conversation-delete design §3.3 (row Delete) and §3.4 (confirmation), draft frames row-button, row-unavailable,
// delete-dialog.
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const item = (props: Parameters<typeof ConversationDeleteItem>[0]) => all(ConversationDeleteItem(props));
const menuItem = (tree: ReactElement<Record<string, unknown>>[]) => tree.find(element => element.props["className"] === "doan-icon-button conv-delete")!;
const tooltip = (tree: ReactElement<Record<string, unknown>>[]) => tree.find(element => element.type === TooltipContent)!;

test("the row Delete's name quotes the title as the alert does", () => {
  expect(menuItem(item({ conversationId: "c1", title: "", deletable: { available: true }, onDelete: vi.fn(), onEscape: vi.fn() })).props["aria-label"]).toBe("Delete this conversation");
  expect(menuItem(item({ conversationId: "c1", title: "Fix\nthe totals", deletable: { available: true }, onDelete: vi.fn(), onEscape: vi.fn() })).props["aria-label"]).toBe("Delete “Fix the totals”");
});

test("an available row Delete is named for its conversation, has no typeahead text and says Delete conversation", () => {
  const onDelete = vi.fn(), onEscape = vi.fn();
  const tree = item({ conversationId: "c1", title: "Tighten the spacing", deletable: { available: true }, onDelete, onEscape });
  const button = menuItem(tree);
  expect(button.props).toMatchObject({ "aria-label": "Delete “Tighten the spacing”", textValue: "" });
  expect(button.props["aria-disabled"]).toBeUndefined();
  expect(button.props["aria-describedby"]).toBeUndefined();
  expect(tooltip(tree).props["children"]).toBe("Delete conversation");
  const event = { preventDefault: vi.fn() };
  (button.props["onSelect"] as (event: unknown) => void)(event);
  expect(onDelete).toHaveBeenCalledOnce();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test("an unavailable row Delete stays reachable, reads its reason and does nothing when pressed", () => {
  const onDelete = vi.fn();
  const reason = "The agent is working on this conversation.";
  const tree = item({ conversationId: "c1", title: "t", deletable: { available: false, reason }, onDelete, onEscape: vi.fn() });
  const button = menuItem(tree);
  expect(button.props["aria-disabled"]).toBe(true);
  // Not Radix's `disabled`: that would take it out of the arrow order.
  expect(button.props["disabled"]).toBeUndefined();
  const described = tree.find(element => element.props["id"] === button.props["aria-describedby"]);
  expect(described?.props).toMatchObject({ className: "sr-only", children: reason });
  expect(tooltip(tree).props["children"]).toBe(reason);
  const event = { preventDefault: vi.fn() };
  (button.props["onSelect"] as (event: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(onDelete).not.toHaveBeenCalled();
});

// Runtime probe (T4 step 0): the highlighted Delete's tooltip is the top dismissable layer, so its Escape must close
// the title menu as well, or the first Escape only hides the tooltip.
test("Escape on the row Delete's tooltip closes the title menu", () => {
  const onEscape = vi.fn();
  (tooltip(item({ conversationId: "c1", title: "t", deletable: { available: true }, onDelete: vi.fn(), onEscape })).props["onEscapeKeyDown"] as () => void)();
  expect(onEscape).toHaveBeenCalledOnce();
});

test("the row Delete is a menu item holding the Trash2 icon, not a button nested in the row", () => {
  const tree = item({ conversationId: "c1", title: "t", deletable: { available: true }, onDelete: vi.fn(), onEscape: vi.fn() });
  const button = menuItem(tree);
  expect(button.type).toBe(DropdownMenu.Item);
  expect(all(button).some(element => element.type === Trash2)).toBe(true);
  expect(tree.some(element => element.type === "button")).toBe(false);
});

const dialog = (props: Partial<Parameters<typeof ConversationDeleteDialog>[0]> = {}) => {
  const cancel = vi.fn(), confirm = vi.fn();
  const tree = ConversationDeleteDialog({ view: { title: "Delete “t”?", body: "Body." }, reason: null, pending: false, cancel, confirm, ...props });
  const buttons = all(tree).filter(element => element.type === "button");
  return { tree, cancel: props.cancel ?? cancel, confirm: props.confirm ?? confirm, cancelButton: buttons[0]!, deleteButton: buttons[1]! };
};

test("the confirmation is Move to Trash's compact alert dialog: Cancel first with focus, then a prominent Delete", () => {
  const { tree, cancel, confirm, cancelButton, deleteButton } = dialog();
  expect(tree.props).toMatchObject({ className: "doan-dialog", "data-ui-size": "compact", role: "alertdialog", "aria-labelledby": "conversation-delete-title", "aria-describedby": "conversation-delete-body" });
  const text = all(tree);
  expect(text.find(element => element.props["id"] === "conversation-delete-title")?.props["children"]).toBe("Delete “t”?");
  expect(text.find(element => element.props["id"] === "conversation-delete-body")?.props["children"]).toBe("Body.");
  expect(cancelButton.props).toMatchObject({ children: "Cancel", autoFocus: true, "data-ui-variant": "subtle" });
  expect(deleteButton.props).toMatchObject({ children: "Delete", "data-ui-variant": "prominent" });
  expect(deleteButton.props["aria-disabled"]).toBeUndefined();
  (deleteButton.props["onClick"] as () => void)();
  expect(confirm).toHaveBeenCalledOnce();
  (cancelButton.props["onClick"] as () => void)();
  expect(cancel).toHaveBeenCalledOnce();
  // Escape (the dialog's cancel event) cancels, as Cancel does, and a deep link's dismissal sends the same event.
  const event = { preventDefault: vi.fn() };
  (tree.props["onCancel"] as (event: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(all(tree).some(element => element.props["className"] === "doan-notice")).toBe(false);
});

test("Delete is unavailable while its request is out, and when the conversation started working, with the reason", () => {
  const pending = dialog({ pending: true });
  expect(pending.deleteButton.props["aria-disabled"]).toBe(true);
  (pending.deleteButton.props["onClick"] as () => void)();
  expect(pending.confirm).not.toHaveBeenCalled();
  const reason = "The agent is working on this conversation.";
  const working = dialog({ reason });
  expect(working.deleteButton.props).toMatchObject({ "aria-disabled": true, "aria-describedby": "conversation-delete-reason" });
  const notice = all(working.tree).find(element => element.props["id"] === "conversation-delete-reason");
  expect(notice?.props["className"]).toBe("doan-notice");
  expect(renderToStaticMarkup(working.tree)).toContain(reason);
  (working.deleteButton.props["onClick"] as () => void)();
  expect(working.confirm).not.toHaveBeenCalled();
  // Cancel stays usable while only the reason holds Delete.
  (working.cancelButton.props["onClick"] as () => void)();
  expect(working.cancel).toHaveBeenCalledOnce();
});

test("while the request is out Cancel and Escape (a link's dismissal too) are refused", () => {
  const pending = dialog({ pending: true });
  (pending.cancelButton.props["onClick"] as () => void)();
  const event = { preventDefault: vi.fn() };
  (pending.tree.props["onCancel"] as (event: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(pending.cancel).not.toHaveBeenCalled();
  expect(pending.cancelButton.props["aria-disabled"]).toBe(true);
});

test("an unsent draft is text or chips, a preset or an attachment", () => {
  expect(unsentDraft(undefined)).toBe(false);
  expect(unsentDraft(EMPTY_DRAFT)).toBe(false);
  expect(unsentDraft({ ...EMPTY_DRAFT, segments: [{ kind: "text", text: "x" }] } as never)).toBe(true);
  expect(unsentDraft({ ...EMPTY_DRAFT, preset: { id: "p" } } as never)).toBe(true);
  expect(unsentDraft({ ...EMPTY_DRAFT, attachments: [{ key: "k" }] } as never)).toBe(true);
});

// design §3.3 'Hidden', 'Row highlight', 'Hairline' and the draft's CSS; POSTMORTEM 2026-11-03 (display: none dropped
// Radix's focus return).
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
test("the hidden row Delete is clipped to 1px, never display: none", () => {
  expect(css).toContain(".conv-row:not(:hover, :has([data-highlighted])) > .conv-delete { width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }");
  expect(css).not.toMatch(/\.conv-delete[^{]*\{[^}]*display:\s*none/);
});
test("the row keeps its fill while its Delete is highlighted, and the hairline sits between row wrappers", () => {
  expect(css).toContain(".conv-row:has(> .conv-delete[data-highlighted]) > .conv-item:not(.current) { background: var(--affordance-floating-hover); }");
  expect(css).toContain('.conv-list .conv-row + .conv-row > .conv-item::before { content: ""; position: absolute; top: 0; left: var(--space-3); right: var(--space-3); height: 1px; background: var(--border-standard); }');
  expect(css).not.toContain(".conv-list .conv-item + .conv-item::before");
});
// design-sync: the draft's keyboard ring sits 2px outside the button, the shared icon button ring; an own offset broke it.
test("the row Delete is 24px in subtle ink and keeps the shared icon button focus ring", () => {
  expect(css).toContain(".conv-delete.doan-icon-button { position: absolute; top: calc(var(--space-2) + (var(--type-body-sm-line-height) - var(--size-control-xs)) / 2); right: var(--space-2); width: var(--size-control-xs); height: var(--size-control-xs); color: var(--text-subtle); }");
  expect(css).not.toMatch(/\.conv-delete[^{]*\{[^}]*outline/);
});
test("while the row Delete shows, the time's visible text is clipped and its spoken label stays", () => {
  expect(css).toContain('.conv-row:is(:hover, :has([data-highlighted])) .cv-when > [aria-hidden="true"] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }');
  expect(css).toContain('.conv-delete.doan-icon-button[aria-disabled="true"] { color: var(--text-disabled); cursor: default; }');
});

// Review notes: an unavailable button paints no pressed fill either, and a row without a time (an unreadable
// conversation) keeps a spot for the Delete so it never covers the title or the status mark.
test("unavailable header and row buttons paint no hover or pressed fill", () => {
  expect(css).toContain(':is(.ov-head .ov-new-conv, .doan-conv-head .doan-conv-new).doan-icon-button[aria-disabled="true"]:is(:hover, :active) { background: transparent; }');
  expect(css).toContain('.conv-list .conv-row > .conv-delete.doan-icon-button[aria-disabled="true"]:is(:hover, :active) { background: transparent; }');
});
test("a row without a time keeps the Delete's spot while it shows", () => {
  expect(css).toContain('.conv-row:is(:hover, :has([data-highlighted])) .cv-head:not(:has(.cv-when))::after { content: ""; flex: none; width: var(--size-control-xs); }');
});
