import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueueRows, SEND_NOW_REFUSED_TEXT, type QueueRowsProps } from "./DockedComposer";

// QueueRows's handlers called without a DOM, hooks as plain state (as DockedComposer.interaction). Real Chromium focus
// (aria-disabled keeping focus, the unmount fixup) is left to queue-send-now's /runtime-test.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, layout: [] as (() => unknown)[], cleanups: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useEffect: () => {},
  useLayoutEffect: (effect: () => unknown) => { hooks.layout.push(effect); },
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[index]) : next; }]; },
}));
vi.mock("./components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => <span data-tip="">{children}</span>,
}));

const page = { body: { name: "body" }, activeElement: null as unknown };
beforeEach(() => { hooks.states = []; hooks.refs = []; page.activeElement = null; vi.stubGlobal("document", page); });
afterEach(() => vi.unstubAllGlobals());

type Node = Record<string, unknown> & { type?: unknown };
// Every element drawn, function components (the button lifetimes, the mocked tooltip) called in place.
function elements(node: ReactNode): Node[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: unknown; [key: string]: unknown }>(child)) return [];
    if (typeof child.type === "function") return elements((child.type as (p: unknown) => ReactNode)(child.props));
    const children = typeof child.props.children === "function" ? [] : elements(child.props.children as ReactNode);
    return [...((child.type as unknown) === Fragment ? [] : [{ ...child.props, type: child.type }]), ...children];
  });
}
// A fake button that knows whether it holds focus; refs hand it to the rows like React would.
function button(name: string, focused: { at: string | null }) { const node = { name, focus: () => { focused.at = name; page.activeElement = node; } }; return node; }

function setup(patch: Partial<QueueRowsProps> = {}) {
  const focused = { at: null as string | null };
  const props: QueueRowsProps = {
    items: [{ id: "q1", text: "First" }, { id: "q2", text: "Second" }, { id: "q3", text: "Third" }], sendNow: true,
    onSendNow: vi.fn(async () => {}), onRemove: vi.fn(async () => true), focusInput: () => { focused.at = "input"; page.activeElement = { name: "input" }; },
    ...patch,
  };
  // Draws, hands each button its fake node and runs the layout effects, as a commit would.
  const draw = () => {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.layout = [];
    const tree = elements(QueueRows(props));
    for (const props of tree) if (props.type === "button") (props.ref as (node: unknown) => void)(button(`${props["aria-label"] === "Remove queued message" ? "remove" : "sendNow"}:${String(props["aria-describedby"])}`, focused));
    for (const effect of hooks.layout) effect();
    return tree;
  };
  const rows = (tree: Node[], label: string) => tree.filter(item => item["aria-label"] === label);
  return { props, focused, draw, rows };
}

test("Send now and Remove hand the row's id to the host; a row in flight ignores another press", async () => {
  const { props, draw, rows } = setup({ items: [{ id: "q1", text: "First" }, { id: "q2", text: "Second", sending: true }] });
  const tree = draw();
  const sendNow = rows(tree, "Send queued message now");
  expect(sendNow.map(item => item.children)).toEqual(["Send now", "Sending…"]);
  expect(sendNow.map(item => item["aria-disabled"])).toEqual([undefined, true]);
  expect(sendNow.every(item => item.disabled === undefined)).toBe(true);
  expect(tree.some(item => item.type === "span" && item.children === "Add to the current turn without stopping it")).toBe(true);
  (sendNow[1]!.onClick as () => void)();
  expect(props.onSendNow).not.toHaveBeenCalled();
  (sendNow[0]!.onClick as () => void)();
  expect(props.onSendNow).toHaveBeenCalledWith("q1");
  (rows(tree, "Remove queued message")[1]!.onClick as () => void)();
  expect(props.onRemove).toHaveBeenCalledWith("q2");
});

test("after Send now is read, focus goes to the next row's Send now once the row has left", async () => {
  const { props, focused, draw, rows } = setup();
  (rows(draw(), "Send queued message now")[0]!.onClick as () => void)();
  await vi.waitFor(() => expect(props.onSendNow).toHaveBeenCalled());
  await Promise.resolve(); await Promise.resolve();
  // The row is still drawn: focus waits for it to leave.
  draw();
  expect(focused.at).toBeNull();
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBe("sendNow:id-0");
});

test("after Remove, focus goes to the next row's Remove when Send now is not offered, and to the field after the last row", async () => {
  const { props, focused, draw, rows } = setup({ sendNow: false });
  (rows(draw(), "Remove queued message")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBe("remove:id-0");

  page.activeElement = null;
  const last = setup();
  (rows(last.draw(), "Remove queued message")[2]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  last.props.items = last.props.items.slice(0, 2);
  last.draw();
  expect(last.focused.at).toBe("input");
});

test("a Remove main refused leaves the row and focus where they are", async () => {
  const { props, focused, draw, rows } = setup({ onRemove: vi.fn(async () => false) });
  (rows(draw(), "Remove queued message")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBeNull();
});

test("a refusal while the turn still runs shows the status line under the row; one after the turn ended does not", async () => {
  const running = setup({ onSendNow: vi.fn(async () => ({ error: "not_running" })) });
  (running.rows(running.draw(), "Send queued message now")[1]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const tree = running.draw();
  const status = tree.filter(item => item.role === "status");
  expect(status).toHaveLength(1);
  expect(elements(status[0]!.children as ReactNode).some(item => item.children === SEND_NOW_REFUSED_TEXT)).toBe(true);
  // Under the refused row: after its listitem, before the next.
  const order = tree.filter(item => item.role === "listitem" || item.role === "status").map(item => item.role);
  expect(order).toEqual(["listitem", "listitem", "status", "listitem"]);
  expect(running.focused.at).toBeNull();

  const ended = setup({ onSendNow: vi.fn(async () => ({ error: "not_running" })) });
  (ended.rows(ended.draw(), "Send queued message now")[1]!.onClick as () => void)();
  ended.props.sendNow = false;
  ended.draw();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(ended.draw().filter(item => item.role === "status")).toHaveLength(0);
});

test("focus the person moved elsewhere while the agent had not read the message yet stays there", async () => {
  const read = (() => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; })();
  const { props, focused, draw, rows } = setup({ onSendNow: vi.fn(() => read.promise) });
  (rows(draw(), "Send queued message now")[0]!.onClick as () => void)();
  page.activeElement = { name: "input" };
  read.resolve();
  await Promise.resolve(); await Promise.resolve();
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBeNull();
});

