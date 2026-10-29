import { expect, test } from "vitest";
import { savedUiState, wizardCloseFocus } from "./App";
import { arrivalOutcome, boundCanvasAction, removalConfirm, restoreRequest, slotState, type HomeConversation, type LastRequest } from "./homeConversations";

// buzz-home tasks U5: App's Home wiring, through the rules App calls.

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

test("a refused start keeps Home: no arrival is pending, so nothing follows or toasts", () => {
  expect(arrivalOutcome(null, { kind: "arrived", intent: 1 })).toEqual({ pending: null, follow: false, toast: false });
});

test("the person's own navigation during the move wins and the send is toasted as Started in", () => {
  const pending = { conversationId: "c1", root: "/code/doan", intent: 3, sawModal: false };
  const moved = arrivalOutcome(pending, { kind: "navigated" });
  expect(moved).toEqual({ pending: null, follow: false, toast: true });
  // The arrival of that superseded move no longer moves the window.
  expect(arrivalOutcome(moved.pending, { kind: "arrived", intent: 3 }).follow).toBe(false);
});

test("a bound canvas does not open by itself after the person opened another canvas", () => {
  expect(boundCanvasAction({ viewing: true, openedOther: true })).toBe("toast");
});

test("a permission slot stays until answered, whatever happened to its toast", () => {
  const asking: HomeConversation = { conversationId: "c1", root: "/code/doan", provider: "codex", phase: "permission" };
  expect(slotState([asking], new Map()).get("/code/doan")?.kind).toBe("permission");
  expect(slotState([{ ...asking, phase: "working" }], new Map()).get("/code/doan")?.kind).toBe("working");
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
