import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueueRows, SEND_NOW_REFUSED_TEXT, type QueueRowsProps } from "./DockedComposer";

// QueueRows's handlers called without a DOM, hooks as plain state; real Chromium focus (aria-disabled keeping focus, the
// unmount fixup) is left to /runtime-test.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, layout: [] as (() => unknown)[], cleanups: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useImperativeHandle: () => {},
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

const page = { body: { name: "body" }, activeElement: null as unknown, hasFocus: () => true };
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
    onSendNow: vi.fn(async () => {}), onRemove: vi.fn(async () => true), focusInput: () => { focused.at = "input"; page.activeElement = { name: "input" }; }, announce: vi.fn(),
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
  // The buttons with this accessible name: aria-label, else the visible text (a tooltip's words are not a button).
  const rows = (tree: Node[], label: string) => tree.filter(item => item.type === "button" && (item["aria-label"] ?? item.children) === label);
  return { props, focused, draw, rows };
}

test("Send now and Remove hand the row's id to the host; Send now is the subtle capsule", async () => {
  const { props, draw, rows } = setup({ items: [{ id: "q1", text: "First" }, { id: "q2", text: "Second" }] });
  const tree = draw();
  const sendNow = rows(tree, "Send now");
  expect(sendNow.map(item => item.children)).toEqual(["Send now", "Send now"]);
  expect(sendNow.map(item => [item["data-ui-variant"], item["data-ui-size"], item["aria-disabled"], item.disabled])).toEqual([["subtle", "xs", undefined, undefined], ["subtle", "xs", undefined, undefined]]);
  expect(tree.some(item => item.type === "span" && item.children === "Add to the current turn without stopping it")).toBe(true);
  (sendNow[0]!.onClick as () => void)();
  expect(props.onSendNow).toHaveBeenCalledWith("q1");
  (rows(tree, "Remove queued message")[1]!.onClick as () => void)();
  expect(props.onRemove).toHaveBeenCalledWith("q2");
});

// the row leaves at the press, so focus moves then, before the agent reads it.
test("Send now moves focus to the next row's Send now once the row has left, without waiting for main's answer", async () => {
  const answer = (() => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; })();
  const { props, focused, draw, rows } = setup({ onSendNow: vi.fn(() => answer.promise) });
  const pressed = rows(draw(), "Send now")[0]!;
  (pressed.onClick as () => void)();
  expect(props.onSendNow).toHaveBeenCalledWith("q1");
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBe("sendNow:id-0");
});

test("focus the person moved elsewhere before the row left stays there", async () => {
  const { props, focused, draw, rows } = setup({ onSendNow: vi.fn(() => new Promise<void>(() => {})) });
  const tree = draw();
  page.activeElement = { name: "input" };
  (rows(tree, "Send now")[0]!.onClick as () => void)();
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBeNull();
});

test("a refused row coming back does not take focus, and focus waits for no row that never left", async () => {
  const { props, focused, draw, rows } = setup({ onSendNow: vi.fn(async () => ({ error: "stale" })) });
  (rows(draw(), "Send now")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  draw();
  // Removed later by Remove from elsewhere: Send now's focus target was dropped with its refusal.
  props.items = props.items.filter(item => item.id !== "q1");
  draw();
  expect(focused.at).toBeNull();
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
  const running = setup({ onSendNow: vi.fn(async () => ({ error: "not_running", turnRuns: true })) });
  (running.rows(running.draw(), "Send now")[1]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const tree = running.draw();
  // Each row's listitem holds a status region from its first draw (a live region added with its text may go unread);
  // only the refused row's says something, under that row.
  const order = tree.filter(item => item.role === "listitem" || item.role === "status").map(item => item.role);
  expect(order).toEqual(["listitem", "status", "listitem", "status", "listitem", "status"]);
  const said = tree.filter(item => item.role === "status").map(item => elements(item.children as ReactNode).some(child => child.children === SEND_NOW_REFUSED_TEXT));
  expect(said).toEqual([false, true, false]);
  expect(running.focused.at).toBeNull();
  // The status line is drawn again with the row, so the composer's lasting live region says it too.
  expect(running.props.announce).toHaveBeenCalledWith(SEND_NOW_REFUSED_TEXT);

  // turn.done reached the store but the rows were not drawn again before main's refusal, so the last draw
  // still offers Send now. The answer's own reading of the turn decides: no line, no announcement.
  const ended = setup({ onSendNow: vi.fn(async () => ({ error: "not_running", turnRuns: false })) });
  (ended.rows(ended.draw(), "Send now")[1]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(ended.props.sendNow).toBe(true);
  expect(ended.draw().filter(item => item.role === "status").every(item => elements(item.children as ReactNode).length === 0)).toBe(true);
  expect(ended.props.announce).not.toHaveBeenCalled();
});

// two presses before the row is drawn out of the queue ask main once and say nothing about the second.
test("a second Send now on a row already in flight is ignored", async () => {
  const answer = (() => { let resolve!: (value: { error: string; turnRuns: boolean }) => void; const promise = new Promise<{ error: string; turnRuns: boolean }>(r => { resolve = r; }); return { promise, resolve }; })();
  const { props, draw, rows } = setup({ onSendNow: vi.fn(() => answer.promise) });
  const pressed = rows(draw(), "Send now")[0]!;
  (pressed.onClick as () => void)();
  (pressed.onClick as () => void)();
  expect(props.onSendNow).toHaveBeenCalledTimes(1);
  answer.resolve({ error: "not_running", turnRuns: true });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(props.announce).toHaveBeenCalledTimes(1);
  // Back in the queue, it can be pressed again.
  (rows(draw(), "Send now")[0]!.onClick as () => void)();
  expect(props.onSendNow).toHaveBeenCalledTimes(2);
});

// A scheduled conversation's rows have no Send now; removing its only row leaves the queue empty and focus in the field.
test("removing the only scheduled row puts focus in the composer field", async () => {
  const { props, focused, draw, rows } = setup({ items: [{ id: "s1", text: "Tighten it" }], sendNow: false });
  (rows(draw(), "Remove queued message")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  expect(props.onRemove).toHaveBeenCalledWith("s1");
  props.items = [];
  draw();
  expect(focused.at).toBe("input");
});

// Messages other conversations' agents sent (the summary's agentQueue): after the person's rows, the sender's logo, the line
// hidden from screen readers in favour of a name with the source, × only, dimmed while held.
const AGENT = { itemId: "a1", provider: "codex" as const, source: { conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } }, line: "Use the declined-card message", held: false };

test("an agent row: the sender's logo, its line, the source only in its accessible name, × and no Send now", async () => {
  const { props, draw, rows } = setup({ items: [{ id: "q1", text: "First" }], agents: [AGENT] });
  const tree = draw();
  expect(tree.filter(item => item.role === "listitem")).toHaveLength(2);
  const logo = tree.find(item => item.type === "img")!;
  expect(logo).toMatchObject({ className: "logo", src: "provider-logos/codex.png", alt: "" });
  expect(tree.find(item => item.className === "queue-text" && item.children === AGENT.line)).toMatchObject({ "aria-hidden": true });
  const name = tree.find(item => item.className === "sr-only" && item.children === "Message from drafts.html: Use the declined-card message")!;
  expect(rows(tree, "Send now")).toHaveLength(1);
  const remove = rows(tree, "Remove queued message");
  expect(remove).toHaveLength(2);
  expect(remove[1]!["aria-describedby"]).toBe(name.id);
  // The source file is never on screen.
  expect(tree.some(item => typeof item.children === "string" && item.children.includes("drafts.html") && item.className !== "sr-only")).toBe(false);
  expect(tree.some(item => item.className === "queue-item held")).toBe(false);
  (remove[1]!.onClick as () => void)();
  expect(props.onRemove).toHaveBeenCalledWith("a1");
});

test("a held agent row is dimmed, says why in its tooltip and accessible name, and keeps ×", () => {
  const { draw, rows } = setup({ items: [], agents: [{ ...AGENT, held: true }] });
  const tree = draw();
  expect(tree.some(item => item.className === "queue-item held")).toBe(true);
  expect(tree.some(item => item["data-tip"] === "" && item.children === "Sends after your next message here ends")).toBe(true);
  expect(tree.some(item => item.className === "sr-only" && item.children === "Message from drafts.html: Use the declined-card message. Sends after your next message here ends.")).toBe(true);
  expect(rows(tree, "Remove queued message")).toHaveLength(1);
});

test("an agent row from a project conversation names the Overview; one without a provider keeps the queued icon", () => {
  const { draw } = setup({ items: [], agents: [{ itemId: "a2", source: { conversationId: "c0" }, line: "Hi", held: false }] });
  const tree = draw();
  expect(tree.some(item => item.className === "sr-only" && item.children === "Message from Overview: Hi")).toBe(true);
  expect(tree.some(item => item.type === "img")).toBe(false);
});

test("removing the person's last row moves focus to the agent row's ×; removing the agent row after it to the field", async () => {
  const { props, focused, draw, rows } = setup({ sendNow: false, items: [{ id: "q1", text: "First" }], agents: [AGENT] });
  (rows(draw(), "Remove queued message")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  props.items = [];
  draw();
  expect(focused.at).toMatch(/^remove:/);
  page.activeElement = null;
  const after = setup({ items: [], agents: [AGENT] });
  (rows(after.draw(), "Remove queued message")[0]!.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve();
  after.props.agents = [];
  after.draw();
  expect(after.focused.at).toBe("input");
});
