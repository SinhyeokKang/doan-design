import { expect, test } from "vitest";
import { mergeCanvasMemory, mergeConversationMemory, savedUiState, wizardCloseFocus } from "./App";
import { removalConfirm, restoreRequest, type LastRequest } from "./homeConversations";
import { textSegments } from "./anchorField";
import { parseUiState } from "../restore/uiState";

// App's own helpers; the send, move, binding, toast and removal wiring is in homeRun.test.ts.

const base = { screen: "home" as const, loadedRoot: null, open: null, expanded: {}, shellProjects: {}, view: { scale: 1, x: 0, y: 0 }, memory: {} };

test("every main-window save carries Home's memory, and none is sent before that memory was read", () => {
  const home = { lastRoot: "/code/doan", lastProvider: "claude" as const, models: { claude: { model: "opus", effort: "high" } } };
  expect(savedUiState({ ...base, home })).toEqual({ screen: "home", expanded: {}, shellProjects: {}, lastByRoot: {}, home });
  const row = { path: ".doan/canvases/a.html", id: "a", url: "u" };
  const workspace = savedUiState({ ...base, home, screen: "workspace", loadedRoot: "/code/doan", open: { folder: "/code/doan", canvas: row.path, row } as never });
  expect(workspace).toMatchObject({ screen: "workspace", root: "/code/doan", canvas: row.path, canvasId: "a", home });
  expect(savedUiState({ ...base, home: {} })?.home).toEqual({});
  expect(savedUiState({ ...base, home: null })).toBeNull();
});

// The conversation last shown in each root's Overview is saved top-level with every save.
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

test("removing a project asks first; with a running Home conversation the confirmation names the conversation to stop", () => {
  expect(removalConfirm([{ conversationId: "c1", waiting: false }], "doan", 1)).toMatchObject({ conversations: ["c1"], cancel: "Cancel", confirm: "Stop and remove" });
  expect(removalConfirm([], "doan", 1)).toMatchObject({ conversations: [], cancel: "Cancel", confirm: "Remove from Doan" });
});

test("Edit on Home asks before replacing a different draft", () => {
  const last: LastRequest = { root: "/code/doan", segments: textSegments("Polish it."), preset: null, attachments: [], provider: "claude", model: null, effort: null };
  expect(restoreRequest({ segments: textSegments("Another idea"), preset: null, attachments: [] }, last, "doan").confirm?.title).toBe("Replace your draft?");
});

// The startup ui-state read merges under what the run wrote, deletions included.
test("a late ui-state read never brings back memory cleared by New or a removed root", () => {
  const saved = { "/a": "aaaaaaaa-0000-4000-8000-000000000001", "/b": "aaaaaaaa-0000-4000-8000-000000000002", "/c": "aaaaaaaa-0000-4000-8000-000000000003" };
  const now = { "/c": "aaaaaaaa-0000-4000-8000-000000000004" };
  // /a: New before the read; /b: removed before the read; /c: shown before the read.
  expect(mergeConversationMemory(saved, now, new Set(["/a", "/b", "/c"]))).toEqual(now);
  expect(mergeConversationMemory(saved, {}, new Set())).toEqual(saved);
  expect(mergeConversationMemory(undefined, now, new Set(["/c"]))).toEqual(now);
});

// Like the Overview's memory, the canvas one (ui-state conversationByCanvas) is saved top-level.
test("every save carries the canvas conversation memory, and an empty one is left out", () => {
  const conversationByCanvas = { "/code/doan": { checkout: "aaaaaaaa-0000-4000-8000-000000000001" } };
  expect(savedUiState({ ...base, home: {}, conversationByCanvas })).toMatchObject({ conversationByCanvas });
  expect(savedUiState({ ...base, home: {}, conversationByCanvas: {} })).not.toHaveProperty("conversationByCanvas");
});

// POSTMORTEM 2026-11-01: the startup read merges under what was seen before it, per canvas; a root removed before it goes.
test("a late ui-state read keeps the canvas memory seen before it, per canvas, and never brings back a removed root", () => {
  const id = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
  const saved = { "/a": { x: id(1), y: id(2) }, "/b": { x: id(3) } };
  const now = { "/a": { x: id(4) } };
  expect(mergeCanvasMemory(saved, now, new Set(["/b"]))).toEqual({ "/a": { x: id(4), y: id(2) } });
  expect(mergeCanvasMemory(undefined, now, new Set())).toEqual(now);
  expect(mergeCanvasMemory(saved, {}, new Set())).toEqual(saved);
});

// App sends no save before the initial ui-state read (App.conversationPanel.test.tsx),
// so the saved panel state is the read one or the person's.
test("every save carries the conversation panel's state", () => {
  const home = {};
  expect(savedUiState({ ...base, home, rightPanel: { open: false, width: 400 } })).toMatchObject({ rightPanel: { open: false, width: 400 } });
  expect(savedUiState({ ...base, home, rightPanel: { open: true } })?.rightPanel).toEqual({ open: true });
  expect(savedUiState({ ...base, home, sidebar: { width: 260 } })?.sidebar).toEqual({ width: 260 });
  expect(savedUiState({ ...base, home })).not.toHaveProperty("sidebar");
});

// The inspector's open flag and width are one per device for every canvas; unsaved means closed.
test("the inspector's state survives a save and a read", () => {
  for (const inspector of [{ open: true, width: 320 }, { open: false, width: 300 }, { open: true }]) {
    const saved = savedUiState({ ...base, home: {}, inspector });
    expect(saved?.inspector).toEqual(inspector);
    expect(parseUiState(JSON.stringify(saved), [])?.inspector).toEqual(inspector);
  }
  const none = savedUiState({ ...base, home: {} });
  expect(none).not.toHaveProperty("inspector");
  expect(parseUiState(JSON.stringify(none), [])?.inspector?.open ?? false).toBe(false);
});
