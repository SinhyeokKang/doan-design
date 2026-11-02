import { expect, test } from "vitest";
import { mergeConversationMemory, savedUiState, wizardCloseFocus } from "./App";
import { removalConfirm, restoreRequest, type LastRequest } from "./homeConversations";

// buzz-home tasks U5: App's own helpers; the send, move, binding, toast and removal wiring is in homeRun.test.ts.

const base = { screen: "home" as const, loadedRoot: null, open: null, expanded: {}, shellProjects: {}, view: { scale: 1, x: 0, y: 0 }, memory: {} };

test("every main-window save carries Home's memory, and none is sent before that memory was read", () => {
  const home = { lastRoot: "/code/doan", lastProvider: "claude" as const, models: { claude: { model: "opus", effort: "high" } } };
  expect(savedUiState({ ...base, home })).toEqual({ screen: "home", expanded: {}, shellProjects: {}, lastByRoot: {}, home });
  // Home → workspace: the workspace save keeps the same memory, so a restart still has it.
  const row = { path: ".doan/canvases/a.html", id: "a", url: "u" };
  const workspace = savedUiState({ ...base, home, screen: "workspace", loadedRoot: "/code/doan", open: { folder: "/code/doan", canvas: row.path, row } as never });
  expect(workspace).toMatchObject({ screen: "workspace", root: "/code/doan", canvas: row.path, canvasId: "a", home });
  expect(savedUiState({ ...base, home: {} })?.home).toEqual({});
  expect(savedUiState({ ...base, home: null })).toBeNull();
});

// buzz-project tasks T1: the conversation last shown in each root's Overview is saved top-level with every save.
test("every save carries the Overview conversation memory by root, and an empty one is left out", () => {
  const home = {};
  const conversationByRoot = { "/code/doan": "aaaaaaaa-0000-4000-8000-000000000001" };
  expect(savedUiState({ ...base, home, conversationByRoot })).toMatchObject({ conversationByRoot });
  expect(savedUiState({ ...base, home, conversationByRoot: {} })).not.toHaveProperty("conversationByRoot");
});

test("first run's project handoff focuses the composer ahead of the focus held before the wizard", () => {
  expect(wizardCloseFocus("/code/doan")).toBe("composer");
  expect(wizardCloseFocus(null)).toBe("previous");
});

test("removing a project with a running Home conversation asks first; cancel keeps both, confirm names the conversation to stop", () => {
  expect(removalConfirm([{ conversationId: "c1", waiting: false }], "doan")).toMatchObject({ conversations: ["c1"], cancel: "Cancel", confirm: "Stop and Remove" });
  expect(removalConfirm([], "doan")).toBeNull();
});

test("Edit on Home asks before replacing a different draft", () => {
  const last: LastRequest = { root: "/code/doan", text: "Polish it.", preset: null, attachments: [], provider: "claude", model: null, effort: null };
  expect(restoreRequest({ text: "Another idea", preset: null, attachments: [] }, last, "doan").confirm?.title).toBe("Replace your draft?");
});

// Review RM r1 🟡9: the start's ui-state read merges under what the run wrote, deletions included.
test("a late ui-state read never brings back memory cleared by New or a removed root", () => {
  const saved = { "/a": "aaaaaaaa-0000-4000-8000-000000000001", "/b": "aaaaaaaa-0000-4000-8000-000000000002", "/c": "aaaaaaaa-0000-4000-8000-000000000003" };
  const now = { "/c": "aaaaaaaa-0000-4000-8000-000000000004" };
  // /a: New before the read; /b: removed before the read; /c: shown before the read.
  expect(mergeConversationMemory(saved, now, new Set(["/a", "/b", "/c"]))).toEqual(now);
  expect(mergeConversationMemory(saved, {}, new Set())).toEqual(saved);
  expect(mergeConversationMemory(undefined, now, new Set(["/c"]))).toEqual(now);
});

// buzz-canvas design §2 '기억': the canvas page's conversation panel is saved with every save. App sends no save before
// the initial ui-state read (App.conversationPanel.test.tsx), so the value saved is the read one or the person's.
test("every save carries the conversation panel's state", () => {
  const home = {};
  expect(savedUiState({ ...base, home, rightPanel: { open: false, width: 400 } })).toMatchObject({ rightPanel: { open: false, width: 400 } });
  expect(savedUiState({ ...base, home, rightPanel: { open: true } })?.rightPanel).toEqual({ open: true });
  expect(savedUiState({ ...base, home, sidebar: { width: 260 } })?.sidebar).toEqual({ width: 260 });
  expect(savedUiState({ ...base, home })).not.toHaveProperty("sidebar");
});
