import { expect, test } from "vitest";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";
import {
  conversationPhase, newCanvasCandidates, permissionToastKey, rememberRequest, removalConfirm, restoreRequest, runningInRoot, slotKey, slotState,
  type HomeConversation, type LastRequest,
} from "./homeConversations";

const conv = (over: Partial<HomeConversation> = {}): HomeConversation => ({ conversationId: "c1", root: "/r/doan", provider: "claude", phase: "working", ...over });
const visits = (...pairs: [string, number][]) => new Map(pairs);

test("a fresh run has no slots: nothing is restored after a restart", () => {
  expect(slotState([], visits())).toEqual(new Map());
});

test("an unbound conversation marks its project row; once bound it marks the canvas row instead", () => {
  expect(slotState([conv({ phase: "permission" })], visits())).toEqual(new Map([[slotKey("/r/doan"), { kind: "permission", label: "Claude Code needs your answer" }]]));
  expect(slotState([conv({ canvas: ".doan/canvases/a.html" })], visits())).toEqual(new Map([[slotKey("/r/doan", ".doan/canvases/a.html"), { kind: "working", label: "Claude Code is working" }]]));
  expect(slotState([conv({ phase: "starting" })], visits()).get(slotKey("/r/doan"))).toEqual({ kind: "working", label: "Claude Code is working" });
});

test("on one row a permission request outranks work in progress, which outranks unseen changes", () => {
  const row = (list: HomeConversation[]) => slotState(list, visits()).get(slotKey("/r/doan"))?.kind;
  const done = conv({ conversationId: "c0", phase: "done", finishedAt: 5 });
  const working = conv({ conversationId: "c1", phase: "working" });
  const asking = conv({ conversationId: "c2", phase: "permission", provider: "codex" });
  expect(row([done])).toBe("unseen");
  expect(row([done, working])).toBe("working");
  expect(row([working, asking, done])).toBe("permission");
  expect(slotState([working, asking], visits()).get(slotKey("/r/doan"))?.label).toBe("Codex needs your answer");
});

test("finished work stays unseen until its row is visited after it finished", () => {
  const done = conv({ phase: "done", finishedAt: 5 });
  expect(slotState([done], visits()).get(slotKey("/r/doan"))).toEqual({ kind: "unseen", label: "New changes from Claude Code" });
  expect(slotState([done], visits([slotKey("/r/doan"), 4])).size).toBe(1);
  expect(slotState([done], visits([slotKey("/r/doan"), 6])).size).toBe(0);
  // A bound conversation is seen only by opening its canvas, not the project's Overview.
  const bound = conv({ phase: "done", finishedAt: 5, canvas: ".doan/canvases/a.html" });
  expect(slotState([bound], visits([slotKey("/r/doan"), 6])).size).toBe(1);
  expect(slotState([bound], visits([slotKey("/r/doan", ".doan/canvases/a.html"), 6])).size).toBe(0);
});

test("failed and stopped turns are unseen too, until their row is visited (2026-10-29 user)", () => {
  for (const phase of ["failed", "interrupted"] as const) {
    expect(slotState([conv({ phase, finishedAt: 1 })], visits())).toEqual(new Map([[slotKey("/r/doan"), { kind: "unseen", label: "New changes from Claude Code" }]]));
    expect(slotState([conv({ phase, finishedAt: 1 })], visits([slotKey("/r/doan"), 2])).size).toBe(0);
  }
});

test("the phase change stamps the finish time once, when the turn first ends", () => {
  const working = conv();
  const done = conversationPhase(working, "done", 7);
  expect(done).toEqual({ ...working, phase: "done", finishedAt: 7 });
  expect(conversationPhase(done, "done", 9)).toBe(done);
  expect(conversationPhase(working, "permission", 7)).toEqual({ ...working, phase: "permission" });
  expect(conversationPhase(working, "failed", 7)).toEqual({ ...working, phase: "failed", finishedAt: 7 });
  expect(conversationPhase(working, "interrupted", 7)).toEqual({ ...working, phase: "interrupted", finishedAt: 7 });
  expect(conversationPhase(conv({ phase: "failed", finishedAt: 3 }), "working", 8)).toEqual(conv({ phase: "working" }));
});

test("one running Home conversation per root: starting, working and asking count, finished ones do not", () => {
  const list = [conv({ conversationId: "old", phase: "done", finishedAt: 1 }), conv({ conversationId: "other", root: "/r/malmoi", phase: "permission" })];
  expect(runningInRoot(list, "/r/doan")).toBeNull();
  expect(runningInRoot(list, "/r/malmoi")).toBe("other");
  for (const phase of ["starting", "working", "permission"] as const) expect(runningInRoot([conv({ phase })], "/r/doan")).toBe("c1");
  for (const phase of ["done", "failed", "interrupted"] as const) expect(runningInRoot([conv({ phase })], "/r/doan")).toBeNull();
});

test("removing a project with a running Home conversation asks first and names the conversations to stop", () => {
  const list = [conv({ root: "/r/doan" }), conv({ conversationId: "c2", root: "/r/wt/buzz-home", phase: "permission" }), conv({ conversationId: "c3", root: "/r/malmoi" })];
  expect(removalConfirm(list, ["/r/doan", "/r/wt/buzz-home"], "doan-design")).toEqual({
    conversations: ["c1", "c2"],
    title: "Stop the conversation and remove doan-design?",
    body: "Another conversation is still running in doan-design. Doan stops it, then removes the project from the list. Files stay on disk.",
    cancel: "Cancel", confirm: "Stop and Remove",
  });
  // Every one waiting for an answer: the confirmation says so (spec decision 18).
  expect(removalConfirm([conv({ conversationId: "c2", root: "/r/doan", phase: "permission" })], ["/r/doan"], "doan-design")?.body)
    .toBe("Another conversation in doan-design needs your answer. Doan stops it, then removes the project from the list. Files stay on disk.");
  expect(removalConfirm([conv({ phase: "done", finishedAt: 1 })], ["/r/doan"], "doan-design")).toBeNull();
  expect(removalConfirm(list, ["/r/other"], "other")).toBeNull();
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

test("a permission request toasts once, and only when its project is not on screen; the slot does not depend on the toast", () => {
  const ask = { kind: "permission" as const, requestId: "r1", summary: "Edit x", options: [] };
  expect(permissionToastKey(ask, { kind: "working", activity: null }, false)).toBe("r1");
  expect(permissionToastKey(ask, ask, false)).toBeNull();
  expect(permissionToastKey(ask, { kind: "working", activity: null }, true)).toBeNull();
  expect(permissionToastKey({ kind: "working", activity: null }, ask, false)).toBeNull();
  const conversation = { conversationId: "c1", root: "/r/doan", provider: "claude" as const, phase: "permission" as const };
  expect(slotState([conversation], new Map([["/r/doan", 99]])).get("/r/doan")).toEqual({ kind: "permission", label: "Claude Code needs your answer" });
});
