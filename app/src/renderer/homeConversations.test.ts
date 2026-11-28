import { expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { textSegments, type FieldSegment } from "./anchorField";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";
import {
  permissionToastKey, rememberRequest, removalConfirm, removalQuestionLabel, restoreRequest,
  type LastRequest,
} from "./homeConversations";

test("removing a project with a running conversation asks first and names the conversations to stop", () => {
  const running = [{ conversationId: "c1", waiting: false }, { conversationId: "c2", waiting: true }];
  expect(removalConfirm(running, "doan-design", 1)).toEqual({
    conversations: ["c1", "c2"],
    title: "Stop 2 conversations and remove doan-design?",
    body: "Doan will stop both conversations, then remove doan-design from your project list. Files and Git worktrees stay on disk.",
    cancel: "Cancel", confirm: "Stop and remove",
  });
  expect(removalConfirm([{ conversationId: "c2", waiting: true }], "doan-design", 1).body)
    .toBe("A conversation in doan-design needs your answer. Doan stops it, then removes the project from the list. Files and Git worktrees stay on disk.");
});

test("removing a project without a running conversation asks first, naming one worktree or how many", () => {
  expect(removalConfirm([], "doan-design", 1)).toEqual({
    conversations: [],
    title: "Remove doan-design from Doan?",
    body: "This removes it from Doan’s project list only. Files and Git worktrees stay on disk.",
    cancel: "Cancel", confirm: "Remove from Doan",
  });
  expect(removalConfirm([], "doan-design", 3).body).toBe("This removes its 3 worktrees from Doan’s project list only. Files and Git worktrees stay on disk.");
});

const git = (path: string, extra: { branch?: string; detached?: string } = {}): FolderEntry =>
  ({ path, kind: "list", canvases: [], servedRev: 0, git: { common: "/code/app/.git", main: "/code/app", worktrees: [], ...extra } });
const card = (rows: FolderEntry[]) => ({ key: "/code/app/.git", name: "app", rows });

test("the removal question names the card, and one worktree of several by its branch", () => {
  const main = git("/code/app", { branch: "main" }), fix = git("/code/app-fix", { branch: "fix" });
  const detached = git("/code/app-old", { detached: "0123456789abcdef0123456789abcdef01234567" });
  const gone: FolderEntry = { path: "/code/app-gone", kind: "notFound" };
  const cards = [card([main, fix, detached, gone])];
  // The whole group (sidebar, Project Settings): the card's name.
  expect(removalQuestionLabel(cards, ["/code/app", "/code/app-fix", "/code/app-old", "/code/app-gone"], new Map())).toBe("app");
  // One worktree of several (the status line): its branch, a detached HEAD's short hash, or the name alone.
  expect(removalQuestionLabel(cards, ["/code/app-fix"], new Map())).toBe("app (fix)");
  expect(removalQuestionLabel(cards, ["/code/app-old"], new Map())).toBe("app (detached 0123456)");
  expect(removalQuestionLabel(cards, ["/code/app-gone"], new Map())).toBe("app");
  expect(removalQuestionLabel([card([main])], ["/code/app"], new Map())).toBe("app");
  expect(removalQuestionLabel([], ["/code/plain"], new Map([["/code/plain", "plain"]]))).toBe("plain");
});

const CRITIQUE: PresetSummary = { id: "critique", title: "Critique the design", description: "d", scope: "s", group: "review" };
const file = (name: string): AttachmentDraft => ({ key: name, id: `id-${name}`, name, kind: "file", pasted: false, status: "ready", size: 10, path: `/Users/ada/${name}` });
const LAST: LastRequest = { root: "/r/doan", segments: textSegments("Critique the onboarding."), preset: CRITIQUE, attachments: [file("a.png")], provider: "claude", model: "opus", effort: "high" };

test("the last request is kept per root, and a newer send replaces it", () => {
  const first = rememberRequest(new Map(), LAST);
  const other = rememberRequest(first, { ...LAST, root: "/r/malmoi", segments: textSegments("Other.") });
  const newer = rememberRequest(other, { ...LAST, segments: textSegments("Newer.") });
  expect([...newer.keys()]).toEqual(["/r/doan", "/r/malmoi"]);
  expect(newer.get("/r/doan")?.segments).toEqual(textSegments("Newer."));
  expect(first.get("/r/malmoi")).toBeUndefined();
});

// main re-checks every attachment when the start is accepted, so the renderer needs no check-by-path call.
test("Edit on Home fills an empty composer without asking; main checks the attachments again on send", () => {
  const result = restoreRequest({ segments: textSegments("  "), preset: null, attachments: [] }, LAST, "doan-design");
  expect(result.confirm).toBeNull();
  expect(result.request).toEqual(LAST);
});

test("a different draft asks before it is replaced; the same request does not", () => {
  const dialog = { title: "Replace your draft?", body: "Your draft will be replaced by the last request you sent to doan-design.", cancel: "Keep draft", confirm: "Replace" };
  expect(restoreRequest({ segments: textSegments("Draw an empty state for the billing page."), preset: null, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ segments: [], preset: CRITIQUE, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ segments: [], preset: null, attachments: [file("b.pdf")] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ segments: LAST.segments, preset: CRITIQUE, attachments: [file("a.png")] }, LAST, "doan-design").confirm).toBeNull();
});

const CHECKOUT = { canvas: { path: ".doan/canvases/checkout-flow.html", id: "checkout" } };
const withChip = (anchor = CHECKOUT): FieldSegment[] => [{ kind: "text", text: "Follow " }, { kind: "chip", anchor }, { kind: "text", text: " for the layout." }];

test("a draft that holds only a canvas chip is not empty, and chips count in the comparison", () => {
  const dialog = { title: "Replace your draft?", body: "Your draft will be replaced by the last request you sent to doan-design.", cancel: "Keep draft", confirm: "Replace" };
  const last: LastRequest = { ...LAST, segments: withChip() };
  expect(restoreRequest({ segments: [{ kind: "chip", anchor: CHECKOUT }], preset: null, attachments: [] }, LAST, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ segments: withChip(), preset: CRITIQUE, attachments: [file("a.png")] }, last, "doan-design").confirm).toBeNull();
  // The same words around another canvas are another draft.
  expect(restoreRequest({ segments: withChip({ canvas: { path: ".doan/canvases/cart.html", id: "cart" } }), preset: CRITIQUE, attachments: [file("a.png")] }, last, "doan-design").confirm).toEqual(dialog);
  // A chip's name in plain text is not the chip.
  expect(restoreRequest({ segments: textSegments("Follow checkout-flow for the layout."), preset: CRITIQUE, attachments: [file("a.png")] }, last, "doan-design").confirm).toEqual(dialog);
  expect(restoreRequest({ segments: [], preset: null, attachments: [] }, last, "doan-design").request.segments).toEqual(withChip());
});

// App wiring rules stay pure so App's event handlers stay thin.
test("a permission request toasts once, and only when its project is not on screen", () => {
  const ask = { kind: "permission" as const, requestId: "r1", summary: "Edit x", options: [] };
  expect(permissionToastKey(ask, { kind: "working", activity: null }, false)).toBe("r1");
  expect(permissionToastKey(ask, ask, false)).toBeNull();
  expect(permissionToastKey(ask, { kind: "working", activity: null }, true)).toBeNull();
  expect(permissionToastKey({ kind: "working", activity: null }, ask, false)).toBeNull();
});
test("a waiting question toasts like a permission request, once per request and only away from its project", () => {
  const question = { kind: "question" as const, requestId: "q1", question: "Which layout?" };
  expect(permissionToastKey(question, { kind: "working", activity: null }, false)).toBe("q1");
  expect(permissionToastKey(question, question, false)).toBeNull();
  expect(permissionToastKey(question, { kind: "working", activity: null }, true)).toBeNull();
  expect(permissionToastKey({ ...question, requestId: "q2" }, question, false)).toBe("q2");
});
