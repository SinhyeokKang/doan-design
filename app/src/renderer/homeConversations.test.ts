import { expect, test } from "vitest";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";
import {
  conversationPhase, rememberRequest, removalConfirm, restoreRequest, runningInRoot, slotKey, slotState,
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

test("failed and stopped conversations leave no slot; their strip says what happened", () => {
  expect(slotState([conv({ phase: "failed", finishedAt: 1 }), conv({ conversationId: "c2", phase: "interrupted", finishedAt: 1 })], visits())).toEqual(new Map());
});

test("the phase change stamps the finish time once, when the turn first ends", () => {
  const working = conv();
  const done = conversationPhase(working, "done", 7);
  expect(done).toEqual({ ...working, phase: "done", finishedAt: 7 });
  expect(conversationPhase(done, "done", 9)).toBe(done);
  expect(conversationPhase(working, "permission", 7)).toEqual({ ...working, phase: "permission" });
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
    body: "A conversation from Home is still running in doan-design. Doan stops it, then removes the project from the list. Files stay on disk.",
    cancel: "Cancel", confirm: "Stop and Remove",
  });
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

test("Edit on Home fills an empty composer without asking and checks the attachments again", () => {
  const result = restoreRequest({ text: "  ", preset: null, attachments: [] }, LAST, "doan-design");
  expect(result.confirm).toBeNull();
  expect(result.request).toEqual({ ...LAST, attachments: [{ ...file("a.png"), status: "checking" }] });
});

test("a different draft asks before it is replaced; the same request does not", () => {
  const dialog = { title: "Replace your draft?", body: "Your draft will be replaced by the last request you sent to doan-design.", cancel: "Keep Draft", confirm: "Replace" };
  expect(restoreRequest({ text: "Draw an empty state for the billing page.", preset: null, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: "", preset: CRITIQUE, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: "", preset: null, attachments: [file("b.pdf")] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ text: LAST.text, preset: CRITIQUE, attachments: [file("a.png")] }, LAST, "doan-design").confirm).toBeNull();
});
