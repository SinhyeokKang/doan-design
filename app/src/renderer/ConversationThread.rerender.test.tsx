import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { CanvasRow } from "../main/view";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// Review RA2: the data that names and enables reply chips must reach replies the thread memoizes, so it travels in a
// context whose value changes with it, apart from the stable Actions ref. There is no DOM in these tests (no jsdom),
// so this is not a real mounted re-render: the thread body runs twice with its hooks kept by call order, as React keeps
// them, and the chip is drawn from the provider values each run produced (conductor decision for fix round 1).
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  contexts: new Map<unknown, unknown>(),
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): { index: number; fresh: boolean } => {
    const index = hooks.cursor++;
    const fresh = !(index in hooks.slots);
    if (fresh) hooks.slots[index] = init();
    return { index, fresh };
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const { index } = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value })).index],
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const { index, fresh } = slot(() => ({ value: factory(), deps }));
      const kept = hooks.slots[index] as { value: unknown; deps: unknown[] };
      if (!fresh && (kept.deps.length !== deps.length || kept.deps.some((dep, i) => !Object.is(dep, deps[i])))) hooks.slots[index] = { value: factory(), deps };
      return (hooks.slots[index] as { value: unknown }).value;
    },
    useEffect: () => {}, useLayoutEffect: () => {}, useImperativeHandle: () => {},
    useId: () => "k",
    useContext: (context: unknown) => hooks.contexts.has(context) ? hooks.contexts.get(context) : (context as { _currentValue: unknown })._currentValue,
  };
});
const { ConversationThread, ReplyChip } = await import("./ConversationThread");

const rows = (checkoutStem: string): CanvasRow[] => [
  { path: ".doan/canvases/drafts.html", id: "drafts", url: "u-d", frames: [{ id: "editor", title: "Editor" }] },
  { path: `.doan/canvases/${checkoutStem}.html`, id: "checkout", url: "u-c", frames: [{ id: "payment", title: "Payment" }] },
];
const items: ThreadItem[] = [{ kind: "agent", key: "m1", messageId: "m1", text: "[a](doan:drafts/frame/editor) [b](doan:checkout/frame/payment)", streaming: false }];
const base: ConversationThreadProps = {
  conversationId: "c1", items, provider: "claude", project: "acme", liveAfter: 0, canvasListed: () => true,
  onAnswer: () => {}, onStop: () => {}, onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {}, onOpenCanvas: () => {}, onOpenLink: () => {},
  onCopy: async () => true, onReplyChip: async () => null, openCanvasId: "drafts",
};

// Runs the thread body once and returns the values of the providers it renders, in order (Actions, then the chip data).
function run(props: ConversationThreadProps): unknown[] {
  hooks.cursor = 0;
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(props, null);
  const body = (outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props);
  const values: unknown[] = [];
  hooks.contexts.clear();
  const walk = (node: ReactNode) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode }>(node)) return;
    const type = node.type as { _context?: unknown; $$typeof?: symbol };
    // React 19 renders a context as its own provider; older Provider objects point at their context.
    const context = type._context ?? (typeof type === "object" && "value" in node.props ? type : undefined);
    if (context !== undefined) { values.push(node.props.value); hooks.contexts.set(context, node.props.value); walk(node.props.children); }
  };
  walk(body);
  return values;
}
const chip = (canvas: string, id: string) => ReplyChip({ link: { canvas, kind: "frame", id } }) as ReactElement<{ "aria-disabled"?: boolean; "aria-label": string; children: ReactNode }>;

beforeEach(() => { hooks.slots = []; hooks.contexts.clear(); });

test("a change of locateDisabled, the open canvas's frame titles or a row's file stem reaches the chips; the Actions value stays", () => {
  const firstRows = rows("checkout");
  const [actions, chips] = run({ ...base, locateDisabled: false, frames: [{ id: "editor", title: "Editor (live)" }], canvasRows: firstRows });
  expect(chips).toBeDefined();
  expect(chip("drafts", "editor").props["aria-disabled"]).toBeUndefined();
  expect(chip("drafts", "editor").props["aria-label"]).toBe("Show Editor (live) on canvas");
  expect(chip("checkout", "payment").props["aria-label"]).toBe("Open checkout and show Payment");

  // The same inputs keep the same value, so memoized replies are not drawn again for nothing.
  const [, same] = run({ ...base, locateDisabled: false, frames: (chips as { frames: unknown }).frames as never, canvasRows: firstRows });
  expect(same).toBe(chips);

  const [actionsAfter, chipsAfter] = run({ ...base, locateDisabled: true, frames: [{ id: "editor", title: "Editor renamed" }], canvasRows: rows("checkout-v2") });
  expect(actionsAfter).toBe(actions);
  expect(chipsAfter).not.toBe(chips);
  expect(chip("drafts", "editor").props["aria-disabled"]).toBe(true);
  expect(chip("drafts", "editor").props["aria-label"]).toBe("Show Editor renamed on canvas");
  const other = chip("checkout", "payment");
  expect(other.props["aria-label"]).toBe("Open checkout-v2 and show Payment");
  expect(other.props["aria-disabled"]).toBeUndefined();
});
