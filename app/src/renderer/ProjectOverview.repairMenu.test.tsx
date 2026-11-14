import { Children, isValidElement, type ReactNode } from "react";
import { Info, RotateCw } from "lucide-react";
import { expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type OverviewRunHost } from "./overviewRun";

// The branch chip's menu with a problem worktree picked shows its repair actions; Retry and Details carry the icons
// the sidebar's project menu draws (draft .doan/canvases/fixes-0-1-2.html, frame cli-error-elsewhere). The component
// is called as a function with React's state hooks replaced, so the menu's items are read without opening it.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = value;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
  },
}));
const { ProjectOverview } = await import("./ProjectOverview");

type Props = { children?: ReactNode; onSelect?: (event: { preventDefault(): void }) => void; [key: string]: unknown };
function elements(node: ReactNode): { type: unknown; props: Props }[] {
  return Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [{ type: child.type, props: child.props }, ...elements(child.props.children)] : []);
}
const textOf = (node: ReactNode): string => Children.toArray(node).map(child => typeof child === "string" ? child : isValidElement<Props>(child) ? textOf(child.props.children) : "").join("");

const ROOT = "/code/doan";
const entry = (path: string): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases: [] as CanvasRow[], git: { branch: "main", common: "/code/doan/.git" } } as FolderEntry);

test.each([
  ["CLI error", { kind: "cliError", path: "/code/doan-cli", reason: "The doan command exited with code 2 without a message." }],
  ["Config error", { kind: "error", path: "/code/doan-cli", message: "unexpected end of JSON input", config: "/code/doan-cli/.doan/config.json" }],
] as [string, FolderEntry][])("%s: the repair menu's Retry and Details show RotateCw and Info", (_name, problem) => {
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), listConversationSkills: vi.fn(() => new Promise(() => {})) } });
  hooks.states = [];
  const host: OverviewRunHost = {
    list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host, window.doan);
  run.show(ROOT);
  const onAction = vi.fn();
  const props = {
    run, support: new DockedSupport(() => {}, window.doan), root: ROOT, project: "doan", entry: entry(ROOT), worktrees: [entry(ROOT), problem], homeDirectory: "/code",
    notice: null, unavailable: null, list: [], seen: new Set<string>(), holder: null, prefs: {}, defaults: null, now: 0,
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction, onProjectSettings: () => {},
  } as unknown as Parameters<typeof ProjectOverview>[0];
  const draw = () => { hooks.cursor = 0; return elements(ProjectOverview(props)); };
  const items = (tree: ReturnType<typeof draw>) => tree.filter(item => typeof item.props.onSelect === "function");
  // Picking the problem worktree turns the menu to its repair actions.
  const worktree = items(draw()).find(item => textOf(item.props.children).includes("doan-cli"))!;
  const event = { preventDefault: vi.fn() };
  worktree.props.onSelect!(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  const tree = draw();
  for (const [label, icon] of [["Retry", RotateCw], ["Details", Info]] as const) {
    const item = items(tree).find(entry => textOf(entry.props.children) === label);
    expect(item, label).toBeDefined();
    const glyph = Children.toArray(item!.props.children).find(child => isValidElement(child) && child.type === icon);
    expect(glyph, label).toBeDefined();
    expect(isValidElement<{ "aria-hidden"?: string }>(glyph) && glyph.props["aria-hidden"], label).toBe("true");
    item!.props.onSelect!({ preventDefault: vi.fn() });
    expect(onAction).toHaveBeenLastCalledWith(label === "Retry" ? "retry" : "details", "/code/doan-cli");
  }
  vi.unstubAllGlobals();
});
