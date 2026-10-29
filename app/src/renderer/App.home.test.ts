import { expect, test } from "vitest";
import { savedUiState, wizardCloseFocus } from "./App";
import { removalConfirm, restoreRequest, type HomeConversation, type LastRequest } from "./homeConversations";

// buzz-home tasks U5: App's own helpers; the send, move, binding, toast and removal wiring is in homeRun.test.ts.

const base = { screen: "home" as const, loadedRoot: null, open: null, expanded: {}, shellProjects: {}, view: { scale: 1, x: 0, y: 0 }, memory: {} };

test("every main-window save carries Home's memory, and none is sent before that memory was read", () => {
  const home = { lastRoot: "/code/doan", lastProvider: "claude" as const, models: { claude: { model: "opus", effort: "high" } } };
  expect(savedUiState({ ...base, home })).toEqual({ screen: "home", expanded: {}, shellProjects: {}, lastByRoot: {}, home });
  // Home → workspace: the workspace save keeps the same memory, so a restart still has it.
  const row = { path: ".doan/canvases/a.html", id: "a", url: "u", open: 0, resolved: 0 };
  const workspace = savedUiState({ ...base, home, screen: "workspace", loadedRoot: "/code/doan", open: { folder: "/code/doan", canvas: row.path, row } as never });
  expect(workspace).toMatchObject({ screen: "workspace", root: "/code/doan", canvas: row.path, canvasId: "a", home });
  expect(savedUiState({ ...base, home: {} })?.home).toEqual({});
  expect(savedUiState({ ...base, home: null })).toBeNull();
});

test("first run's project handoff focuses the composer ahead of the focus held before the wizard", () => {
  expect(wizardCloseFocus("/code/doan")).toBe("composer");
  expect(wizardCloseFocus(null)).toBe("previous");
});

test("removing a project with a running Home conversation asks first; cancel keeps both, confirm names the conversation to stop", () => {
  const running: HomeConversation = { conversationId: "c1", root: "/code/doan", provider: "claude", phase: "working" };
  expect(removalConfirm([running], ["/code/doan"], "doan")).toMatchObject({ conversations: ["c1"], cancel: "Cancel", confirm: "Stop and Remove" });
  expect(removalConfirm([{ ...running, phase: "done" }], ["/code/doan"], "doan")).toBeNull();
});

test("Edit on Home asks before replacing a different draft", () => {
  const last: LastRequest = { root: "/code/doan", text: "Polish it.", preset: null, attachments: [], provider: "claude", model: null, effort: null };
  expect(restoreRequest({ text: "Another idea", preset: null, attachments: [] }, last, "doan").confirm?.title).toBe("Replace your draft?");
});
