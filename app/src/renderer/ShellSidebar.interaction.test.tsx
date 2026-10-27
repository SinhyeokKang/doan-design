import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useLayoutEffect: () => {},
  useRef: (value: unknown) => { const ref = { current: value }; hooks.refs.push(ref); return ref; },
  useState: (value: unknown) => [value, vi.fn()],
}));
beforeEach(() => { hooks.refs = []; });
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
function fixture(loaded: string | null = "/a") {
  const row = { path: "design/a.html", url: "u", open: 0, resolved: 0 };
  const entries: FolderEntry[] = ["/a", "/b"].map(path => ({ path, kind: "list", servedRev: 0, canvases: [row] }));
  const props = { cards: [{ key: "common", name: "demo", rows: entries }], projects: { common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: true } }, loaded, canvas: row.path, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(async () => {}) };
  const rendered = elements(ShellSidebar(props));
  const project = rendered.find(item => item["data-key"] === "common")!;
  const menuItems = rendered.filter(item => typeof item.onSelect === "function");
  return { props, project, menuItems, rendered };
}
function key(props: Record<string, unknown>, value: string, nested = false) {
  const target = {}, event = { key: value, target, currentTarget: nested ? {} : target, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, altKey: false };
  if (typeof props.onKeyDown !== "function") throw new Error("Missing keyboard handler");
  props.onKeyDown(event);
  return event;
}
it("keeps current project expanded on ArrowLeft and ignores keys from its menu trigger", () => {
  const { props, project } = fixture();
  key(project, "ArrowLeft");
  key(project, "Enter", true);
  expect(props.toggle).not.toHaveBeenCalled();
});
it("collapses another project and opens a canvas only on activation, not arrow movement", () => {
  const { props, project, rendered } = fixture(null);
  key(project, "ArrowLeft");
  expect(props.toggle).toHaveBeenCalledWith("common");
  const canvas = rendered.find(item => item["data-key"] === "/a\ndesign/a.html")!;
  key(canvas, "ArrowDown");
  expect(props.open).not.toHaveBeenCalled();
  key(canvas, "Enter");
  expect(props.open).toHaveBeenCalledWith("/a", expect.objectContaining({ path: "design/a.html" }));
});
it("routes explicit worktree selection and removes every currently registered project root", () => {
  const { props, menuItems } = fixture();
  const worktree = menuItems[1]!, remove = menuItems.at(-1)!;
  if (typeof worktree.onSelect === "function") worktree.onSelect();
  if (typeof remove.onSelect === "function") remove.onSelect();
  expect(props.worktree).toHaveBeenCalledWith("/b");
  expect(props.remove).toHaveBeenCalledWith(["/a", "/b"]);
});
it("rejects menu actions after the project disappears", () => {
  const { props, menuItems } = fixture();
  const live = hooks.refs.find(ref => ref.current === props);
  if (!live) throw new Error("Missing live target owner");
  live.current = { ...props, cards: [] };
  for (const item of menuItems) if (typeof item.onSelect === "function") item.onSelect();
  expect(props.worktree).not.toHaveBeenCalled();
  expect(props.remove).not.toHaveBeenCalled();
  expect(props.overview).not.toHaveBeenCalled();
  expect(props.action).not.toHaveBeenCalled();
});
