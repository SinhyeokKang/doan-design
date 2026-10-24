import { describe, expect, test } from "vitest";
import { classifyPick, scanCandidates, type PickFacts, type ScanResult } from "./addFlow";
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
    expect(classifyPick(facts({ path: "/repo/design", ls: list("/repo") }))).toEqual({ kind: "store", path: "/repo" });
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

  test("a folder holding repos is scanned", () => {
    expect(classifyPick(facts({ children: ["/code/picked/a"] }))).toEqual({ kind: "scan" });
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

describe("scanCandidates", () => {
  const git = (root: string, worktrees: string[]): ScanResult => ({ ...list(root), git: { common: `${root}/.git`, worktrees } });

  test("sorts the four states and checks only ready repos", () => {
    const results = new Map<string, ScanResult>([
      ["/c/ready", list("/c/ready")],
      ["/c/bare", { kind: "uninitialized" }],
      ["/c/have", list("/c/have")],
      ["/c/slow", { kind: "cliError", reason: "timed out after 10 s" }],
    ]);
    const candidates = scanCandidates(["/c/ready", "/c/bare", "/c/have", "/c/slow"], results, ["/c/have"]);
    expect(candidates.map(({ name, status, checked, disabled }) => ({ name, status, checked, disabled }))).toEqual([
      { name: "ready", status: "ready", checked: true, disabled: false },
      { name: "bare", status: "notSetUp", checked: false, disabled: false },
      { name: "have", status: "added", checked: false, disabled: true },
      { name: "slow", status: "unreadable", checked: false, disabled: true },
    ]);
  });

  test("a saved Not set up folder is already added", () => {
    const [candidate] = scanCandidates(["/c/bare"], new Map([["/c/bare", { kind: "uninitialized" }]]), ["/c/bare"]);
    expect(candidate?.status).toBe("added");
  });

  test("a rejected config and a missing result are unreadable", () => {
    const candidates = scanCandidates(["/c/a", "/c/b"], new Map<string, ScanResult>([["/c/a", { kind: "error", message: "bad" }]]), []);
    expect(candidates.map((candidate) => candidate.status)).toEqual(["unreadable", "unreadable"]);
  });

  test("offers unsaved worktrees as unchecked sub-items of a ready repo", () => {
    const results = new Map([["/c/app", git("/c/app", ["/c/app", "/w/app-feat", "/w/app-old"])]]);
    const [candidate] = scanCandidates(["/c/app"], results, ["/w/app-old"]);
    expect(candidate?.worktrees).toEqual([{ path: "/w/app-feat", name: "app-feat" }]);
  });

  test("a worktree that is its own candidate is not repeated as a sub-item", () => {
    const results = new Map([
      ["/c/app", git("/c/app", ["/c/app", "/c/app-feat"])],
      ["/c/app-feat", git("/c/app-feat", ["/c/app", "/c/app-feat"])],
    ]);
    const candidates = scanCandidates(["/c/app", "/c/app-feat"], results, []);
    expect(candidates.map((candidate) => candidate.worktrees)).toEqual([[], []]);
  });

  test("an already added repo gets no sub-items", () => {
    const [candidate] = scanCandidates(["/c/app"], new Map([["/c/app", git("/c/app", ["/c/app", "/w/feat"])]]), ["/c/app"]);
    expect(candidate?.worktrees).toEqual([]);
  });
});
