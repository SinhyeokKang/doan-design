import { expect, test } from "vitest";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";
import {
  newCanvasCandidates, permissionToastKey, rememberRequest, removalConfirm, restoreRequest, runningInRoot,
  type HomeConversation, type LastRequest,
} from "./homeConversations";

const conv = (over: Partial<HomeConversation> = {}): HomeConversation => ({ conversationId: "c1", root: "/r/doan", provider: "claude", phase: "working", ...over });
test("one running Home conversation per root: starting, working and asking count, finished ones do not", () => {
  const list = [conv({ conversationId: "old", phase: "done" }), conv({ conversationId: "other", root: "/r/malmoi", phase: "permission" })];
  expect(runningInRoot(list, "/r/doan")).toBeNull();
  expect(runningInRoot(list, "/r/malmoi")).toBe("other");
  for (const phase of ["starting", "working", "permission"] as const) expect(runningInRoot([conv({ phase })], "/r/doan")).toBe("c1");
  for (const phase of ["done", "failed", "interrupted"] as const) expect(runningInRoot([conv({ phase })], "/r/doan")).toBeNull();
});

test("removing a project with a running conversation asks first and names the conversations to stop", () => {
  const running = [{ conversationId: "c1", waiting: false }, { conversationId: "c2", waiting: true }];
  expect(removalConfirm(running, "doan-design")).toEqual({
    conversations: ["c1", "c2"],
    title: "Stop the conversation and remove doan-design?",
    body: "A conversation is still running in doan-design. Doan stops it, then removes the project from the list. Files stay on disk.",
    cancel: "Cancel", confirm: "Stop and Remove",
  });
  // Every one waiting for an answer: the confirmation says so (spec decision 18).
  expect(removalConfirm([{ conversationId: "c2", waiting: true }], "doan-design")?.body)
    .toBe("A conversation in doan-design needs your answer. Doan stops it, then removes the project from the list. Files stay on disk.");
  expect(removalConfirm([], "doan-design")).toBeNull();
});

const CRITIQUE: PresetSummary = { id: "critique", title: "Critique the design", description: "d", scope: "s", group: "review" };
const file = (name: string): AttachmentDraft => ({ key: name, id: `id-${name}`, name, kind: "file", pasted: false, status: "ready", size: 10, path: `/Users/ada/${name}` });
const LAST: LastRequest = { root: "/r/doan", text: "Critique the onboarding.", preset: CRITIQUE, attachments: [file("a.png")], provider: "claude", model: "opus", effort: "high" };

test("the last request is kept per root, and a newer send replaces it", () => {
  const first = rememberRequest(new Map(), LAST);
  const other = rememberRequest(first, { ...LAST, root: "/r/malmoi", text: "Other." });
  const newer = rememberRequest(other, { ...LAST, text: "Newer." });
  expect([...newer.keys()]).toEqual(["/r/doan", "/r/malmoi"]);
  expect(newer.get("/r/doan")?.text).toBe("Newer.");
  expect(first.get("/r/malmoi")).toBeUndefined();
});

// The renderer has no check-by-path call; main checks every attachment again when the start is accepted and refuses
// a moved one with attachment_missing (design §4.8), so the chips come back as they were sent.
test("Edit on Home fills an empty composer without asking; main checks the attachments again on send", () => {
  const result = restoreRequest({ text: "  ", preset: null, attachments: [] }, LAST, "doan-design");
  expect(result.confirm).toBeNull();
  expect(result.request).toEqual(LAST);
});

test("a different draft asks before it is replaced; the same request does not", () => {
  const dialog = { title: "Replace your draft?", body: "Your draft will be replaced by the last request you sent to doan-design.", cancel: "Keep Draft", confirm: "Replace" };
  expect(restoreRequest({ text: "Draw an empty state for the billing page.", preset: null, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: "", preset: CRITIQUE, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: "", preset: null, attachments: [file("b.pdf")] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: LAST.text, preset: CRITIQUE, attachments: [file("a.png")] }, LAST, "doan-design").confirm).toBeNull();
});

// App wiring rules (buzz-home design §4.5, §4.9, §7, §7.3), pure so App's event handlers stay thin.
test("new canvas candidates are the rows absent when the request was sent and not checked yet", () => {
  const rows = [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }, { path: ".doan/canvases/c.html" }];
  expect(newCanvasCandidates(rows, [".doan/canvases/a.html"], [".doan/canvases/c.html"]).map(r => r.path)).toEqual([".doan/canvases/b.html"]);
});

test("a permission request toasts once, and only when its project is not on screen", () => {
  const ask = { kind: "permission" as const, requestId: "r1", summary: "Edit x", options: [] };
  expect(permissionToastKey(ask, { kind: "working", activity: null }, false)).toBe("r1");
  expect(permissionToastKey(ask, ask, false)).toBeNull();
  expect(permissionToastKey(ask, { kind: "working", activity: null }, true)).toBeNull();
  expect(permissionToastKey({ kind: "working", activity: null }, ask, false)).toBeNull();
});
