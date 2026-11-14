import { describe, expect, test, vi } from "vitest";
import type { RemoveRequest } from "../formats/types";
import { validateRemoveResponse } from "../formats/validate";
import { answerCliRemove, cliRemoveDecision, type CliRemoveHost, type CliRemoveInput } from "./cliRemove";
import type { LiveTurn } from "./conversationWork";
import { openBlockedMessage } from "./deepLinks";
import type { FolderEntry, GitInfo } from "./view";

// `doan remove` (app-socket v7), main's judgment once schema, token and the registered root passed: readiness, first
// run, the main window's dialog and locked pages, then any running conversation in the group. Nothing is asked of the
// renderer, so a refusal can never land after the removal.

const COMMON = "/w/app/.git";
const git = (branch: string, worktrees: string[] = ["/w/app", "/w/app-fix", "/w/.wt/app-auto"]): GitInfo => ({ common: COMMON, main: "/w/app", branch, worktrees });
const listed = (path: string, extra: Partial<Extract<FolderEntry, { kind: "list" }>> = {}): FolderEntry => ({ path, kind: "list", canvases: [], servedRev: 0, ...extra });
const MAIN = listed("/w/app", { git: git("main") });
const FIX = listed("/w/app-fix", { git: git("fix") });
const AUTO: FolderEntry = { ...listed("/w/.wt/app-auto", { git: git("auto") }), autoRegistered: true };
const OTHER = listed("/w/other", { git: { common: "/w/other/.git", main: "/w/other", branch: "main", worktrees: ["/w/other"] } });
const ENTRIES = [MAIN, OTHER, FIX, AUTO];
const turn = (root: string, running = true): LiveTurn => ({ root, turnId: `t-${root}`, running });

const input = (patch: Partial<CliRemoveInput> = {}): CliRemoveInput => ({
  root: "/w/app-fix", entries: ENTRIES, ready: true, firstRun: false, menu: { screen: "home", modal: false }, liveTurns: new Map(), ...patch,
});
const refusal = (patch: Partial<CliRemoveInput>) => {
  const decision = cliRemoveDecision(input(patch));
  if (decision.kind !== "refuse" || decision.response.ok) throw new Error(`removed: ${JSON.stringify(decision)}`);
  expect(validateRemoveResponse(decision.response)).toBe(true);
  return decision.response;
};

describe("the group a root belongs to", () => {
  test("every registered worktree sharing the Git common directory goes, from any of them, under the main worktree's name", () => {
    for (const root of ["/w/app", "/w/app-fix", "/w/.wt/app-auto"]) {
      expect(cliRemoveDecision(input({ root }))).toEqual({ kind: "remove", roots: ["/w/app", "/w/app-fix", "/w/.wt/app-auto"], project: "app" });
    }
    expect(cliRemoveDecision(input({ root: "/w/other" }))).toEqual({ kind: "remove", roots: ["/w/other"], project: "other" });
  });

  test("a root alone is its own group", () => {
    const alone: FolderEntry = listed("/w/notes");
    expect(cliRemoveDecision(input({ root: "/w/notes", entries: [MAIN, alone] }))).toEqual({ kind: "remove", roots: ["/w/notes"], project: "notes" });
  });

  test("a Missing worktree and a hidden auto-registered one join by their last common directory and go too", () => {
    const missing: FolderEntry = { path: "/w/app-gone", kind: "notFound", lastCommon: COMMON };
    const hidden: FolderEntry = { path: "/w/.wt/app-hidden", kind: "uninitialized", autoRegistered: true, lastCommon: COMMON };
    expect(cliRemoveDecision(input({ entries: [MAIN, missing, OTHER, FIX, hidden] }))).toEqual({ kind: "remove", roots: ["/w/app", "/w/app-gone", "/w/app-fix", "/w/.wt/app-hidden"], project: "app" });
  });

  test("the name is the main worktree's folder even when the main worktree is not registered", () => {
    expect(cliRemoveDecision(input({ entries: [FIX, AUTO] }))).toEqual({ kind: "remove", roots: ["/w/app-fix", "/w/.wt/app-auto"], project: "app" });
  });
});

describe("refusals change nothing", () => {
  test("an unregistered root, and an unregistered worktree of a registered group, are not open", () => {
    expect(refusal({ root: "/w/nowhere" })).toEqual({ v: 7, ok: false, error: { code: "project_not_open", message: "The project is not open in Doan." } });
    // /w/app-new is a worktree of the app group that Doan never listed; it is not registered here.
    expect(refusal({ root: "/w/app-new" }).error.code).toBe("project_not_open");
    // A root is compared as a string; a trailing slash is another root.
    expect(refusal({ root: "/w/app-fix/" }).error.code).toBe("project_not_open");
  });

  test("before the app is ready, or while a root of the group is still read, Doan is busy loading", () => {
    const loading = { code: "busy", message: "Doan is still loading this project. Try again shortly." };
    expect(refusal({ ready: false }).error).toEqual(loading);
    const reading: FolderEntry = { path: "/w/app-fix", kind: "loading", lastCommon: COMMON };
    expect(refusal({ entries: [MAIN, OTHER, reading, AUTO] }).error).toEqual(loading);
    expect(refusal({ root: "/w/app", entries: [MAIN, OTHER, reading, AUTO] }).error).toEqual(loading);
  });

  test("first run and the buddy screen", () => {
    expect(refusal({ firstRun: true }).error).toEqual({ code: "busy", message: "Finish Doan's first run, then try again." });
  });

  test("a dialog open in the main window", () => {
    for (const screen of ["home", "workspace", "canvas", "addProjects", "settings"] as const) {
      expect(refusal({ menu: { screen, modal: true } }).error).toEqual({ code: "busy", message: "A dialog is open in Doan. Close it, then try again." });
    }
  });

  test("a locked page names that page with doan open's sentence", () => {
    expect(refusal({ menu: { screen: "addProjects", modal: false, locked: true } }).error).toEqual({ code: "busy", message: openBlockedMessage("add_projects") });
    expect(refusal({ menu: { screen: "settings", modal: false, locked: true } }).error).toEqual({ code: "busy", message: openBlockedMessage("settings") });
    expect(refusal({ menu: { screen: "settings", modal: false, locked: true, projectSettings: true } }).error).toEqual({ code: "busy", message: openBlockedMessage("project_settings") });
    expect(openBlockedMessage("add_projects")).toBe("The Add Projects page in Doan is in the middle of a task. Finish or cancel it, then try again.");
    // An unlocked page does not block.
    expect(cliRemoveDecision(input({ menu: { screen: "addProjects", modal: false } })).kind).toBe("remove");
    expect(cliRemoveDecision(input({ menu: { screen: "settings", modal: false, projectSettings: true } })).kind).toBe("remove");
  });

  test("any running turn in any root of the group refuses, a finished turn does not", () => {
    const running = { code: "conversation_running", message: "A conversation is running in this project in Doan." };
    // A canvas conversation in the main worktree while the request names the hand-added one.
    expect(refusal({ liveTurns: new Map([["canvas-c", turn("/w/app")]]) }).error).toEqual(running);
    // A turn waiting on a permission request or a question is running (ConversationService.liveTurns).
    expect(refusal({ root: "/w/.wt/app-auto", liveTurns: new Map([["asking", turn("/w/app-fix")]]) }).error).toEqual(running);
    // A prototype window's conversation is a canvas conversation of its root.
    expect(refusal({ liveTurns: new Map([["prototype", turn("/w/.wt/app-auto")]]) }).error).toEqual(running);
    expect(cliRemoveDecision(input({ liveTurns: new Map([["done", turn("/w/app", false)], ["elsewhere", turn("/w/other")]]) })).kind).toBe("remove");
  });

  // What the person must finish comes before loading: the renderer reports ready only after first run and the buddy
  // screen, and a locked Add Projects page is itself reading the root it sets up (found by the runtime probe).
  test("the checks run in order: registration, first run, dialog, locked page, loading, conversations", () => {
    const all: Partial<CliRemoveInput> = { ready: false, firstRun: true, menu: { screen: "settings", modal: true, locked: true }, liveTurns: new Map([["c", turn("/w/app")]]) };
    expect(refusal({ ...all, root: "/w/nowhere" }).error.code).toBe("project_not_open");
    expect(refusal(all).error.message).toBe("Finish Doan's first run, then try again.");
    expect(refusal({ ...all, firstRun: false }).error.message).toBe("A dialog is open in Doan. Close it, then try again.");
    expect(refusal({ ...all, firstRun: false, menu: { screen: "settings", modal: false, locked: true } }).error.message).toBe(openBlockedMessage("settings"));
    expect(refusal({ ...all, firstRun: false, menu: { screen: "home", modal: false } }).error.message).toBe("Doan is still loading this project. Try again shortly.");
    expect(refusal({ ...all, ready: true, firstRun: false, menu: { screen: "home", modal: false } }).error.code).toBe("conversation_running");
  });
});

describe("answering a v7 request", () => {
  const request: RemoveRequest = { v: 7, token: "t", root: "/w/app-fix" };
  const host = (patch: Partial<CliRemoveHost> = {}): CliRemoveHost => ({
    ready: () => true, firstRun: () => false, entries: () => ENTRIES, menu: () => ({ screen: "workspace", modal: false }), liveTurns: () => new Map(),
    removeRoots: vi.fn(async (roots: readonly string[]) => ({ kind: "removed" as const, paths: [...roots] })), ...patch,
  });

  test("a removal answers the group's name and the roots that left the list", async () => {
    const h = host();
    const response = await answerCliRemove(request, h);
    expect(validateRemoveResponse(response)).toBe(true);
    expect(response).toEqual({ v: 7, ok: true, removed: true, project: "app", roots: ["/w/app", "/w/app-fix", "/w/.wt/app-auto"] });
    expect(h.removeRoots).toHaveBeenCalledExactlyOnceWith(["/w/app", "/w/app-fix", "/w/.wt/app-auto"]);
  });

  test("the roots in the answer are the ones removeRoots removed, in its order", async () => {
    const response = await answerCliRemove(request, host({ removeRoots: async () => ({ kind: "removed", paths: ["/w/app-fix", "/w/app"] }) }));
    expect(response).toEqual({ v: 7, ok: true, removed: true, project: "app", roots: ["/w/app-fix", "/w/app"] });
  });

  test("removeRoots finding nothing to remove answers project_not_open", async () => {
    const response = await answerCliRemove(request, host({ removeRoots: async () => ({ kind: "unavailable" }) }));
    expect(response).toEqual({ v: 7, ok: false, error: { code: "project_not_open", message: "The project is not open in Doan." } });
    expect(validateRemoveResponse(response)).toBe(true);
  });

  test("a refusal never calls removeRoots", async () => {
    const h = host({ liveTurns: () => new Map([["c", turn("/w/app")]]) });
    expect(await answerCliRemove(request, h)).toMatchObject({ v: 7, ok: false, error: { code: "conversation_running" } });
    expect(h.removeRoots).not.toHaveBeenCalled();
  });
});
