import type { ReactElement, ReactNode } from "react";
import { expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";

// No DOM in these tests: QuickOpen runs once as a function with its hooks stubbed, and the input's key handler is
// called directly, as React would on Enter.
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "qo",
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [typeof initial === "function" ? (initial as () => unknown)() : initial, () => {}],
  useMemo: <T,>(factory: () => T) => factory(),
  useEffect: () => {},
}));
const { QuickOpen } = await import("./QuickOpenDialog");
// The opener check reads HTMLElement; with no DOM there is no opener to refocus.
vi.stubGlobal("HTMLElement", class {});

const row = (path: string): CanvasRow => ({ path, id: "a", url: "u" });
const entries: FolderEntry[] = [{ kind: "list", path: "/repo", servedRev: 0, canvases: [row(".doan/canvases/a.html")] }];

function find(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child as ReactNode, match); if (found) return found; } return undefined; }
  if (!("props" in node)) return undefined;
  const element = node as ReactElement<Record<string, unknown>>;
  if (match(element)) return element;
  return find(element.props.children as ReactNode, match);
}
const enter = (pick: () => boolean | void, close: () => void) => {
  const tree = QuickOpen({ entries, currentRoot: "/repo", pick, close }) as ReactElement;
  const input = find(tree, element => element.props.role === "combobox")!;
  (input.props.onKeyDown as (event: unknown) => void)({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {} });
};

test("a pick that could not be opened closes Quick Open the way Escape does, so focus is recovered when the opener is gone", () => {
  const close = vi.fn();
  enter(() => false, close);
  expect(close).toHaveBeenCalledTimes(1);
});

test("a pick that opened leaves the close path to the move it started", () => {
  const close = vi.fn();
  enter(() => true, close);
  enter(() => undefined, close);
  expect(close).not.toHaveBeenCalled();
});
