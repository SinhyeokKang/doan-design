import { describe, expect, test } from "vitest";
import { classifyPick, type PickFacts } from "./addFlow";
import type { FolderState } from "./folderState";

const list = (root: string): FolderState => ({ kind: "list", root, scope: [], canvases: [] });
const facts = (over: Partial<PickFacts>): PickFacts => ({
  path: "/code/picked", isDir: true, ls: { kind: "uninitialized" }, asRepo: null, hasGit: false, children: [], saved: [], ...over,
});

describe("classifyPick", () => {
  test("drops anything that is not a directory", () => {
    expect(classifyPick(facts({ isDir: false, ls: list("/x") }))).toEqual({ kind: "drop" });
  });

  test("stores the root the CLI found for a subfolder", () => {
    expect(classifyPick(facts({ path: "/repo/doan", ls: list("/repo") }))).toEqual({ kind: "store", path: "/repo" });
  });

  test("reports a root that is already stored", () => {
    expect(classifyPick(facts({ ls: list("/repo"), saved: ["/a", "/repo"] }))).toEqual({ kind: "duplicate", path: "/repo" });
  });

  test("a folder with its own .git is stored as Not set up", () => {
    expect(classifyPick(facts({ hasGit: true }))).toEqual({ kind: "store", path: "/code/picked" });
    expect(classifyPick(facts({ hasGit: true, saved: ["/code/picked"] }))).toEqual({ kind: "duplicate", path: "/code/picked" });
  });

  test("a .git beats child repos: the picked folder is the repo", () => {
    expect(classifyPick(facts({ hasGit: true, children: ["/code/picked/sub"] }))).toEqual({ kind: "store", path: "/code/picked" });
  });

  test("an already stored Not set up folder is a duplicate, with or without child repos", () => {
    const saved = ["/code/picked"];
    expect(classifyPick(facts({ saved }))).toEqual({ kind: "duplicate", path: "/code/picked" });
    expect(classifyPick(facts({ saved, children: ["/code/picked/sub"] }))).toEqual({ kind: "duplicate", path: "/code/picked" });
  });

  test("a folder holding repos is refused instead of storing the parent", () => {
    expect(classifyPick(facts({ children: ["/code/picked/a"] }))).toEqual({ kind: "refuse", message: "Choose one of the repositories inside this folder." });
  });

  test("anything else asks for confirmation, never stores", () => {
    expect(classifyPick(facts({}))).toEqual({ kind: "confirm" });
  });

  test("a failing CLI follows the existing open rules", () => {
    const broken: FolderState = { kind: "error", message: "bad config" };
    expect(classifyPick(facts({ ls: broken, asRepo: broken }))).toEqual({ kind: "store", path: "/code/picked" });
    expect(classifyPick(facts({ ls: broken, asRepo: { kind: "uninitialized" } }))).toEqual({ kind: "refuse", message: "bad config" });
    expect(classifyPick(facts({ ls: { kind: "cliError", reason: "" } }))).toEqual({ kind: "refuse", message: "doan CLI error" });
    expect(classifyPick(facts({ ls: broken, asRepo: broken, saved: ["/code/picked"] }))).toEqual({ kind: "duplicate", path: "/code/picked" });
  });
});
