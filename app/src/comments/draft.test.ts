import { describe, expect, it } from "vitest";
import { beginDraft, CONTINUE_REASONS, continueEnabled, DOCUMENT_RELOADED, guardsSelectionChange, transitionDraft, type ContinueContext, type DraftOrigin, type DraftState } from "./draft";

const origin = { kind: "create", root: "/repo", canvas: "home", path: "design/home.html", generation: 1, canvasHash: `sha256:${"a".repeat(64)}`, target: { frame: "first" } } as const;
const edit = { kind: "edit", root: "/repo", canvas: "home", comment: "comment", expected: { body: "old", status: "open", updatedAt: "2026-01-01T00:00:00.000Z" } } as const;

describe("draft transitions", () => {
  it("freezes the original create snapshot independently of later selection and filters", () => {
    const mutable = { ...origin, target: { frame: "first" } };
    const state = beginDraft("draft1", mutable, "new");
    mutable.target.frame = "second";
    const changed = transitionDraft(state, { type: "body", body: "edited" });
    expect(changed.state.draft?.origin).toEqual(origin);
    expect(changed.state.draft?.body).toBe("edited");
  });
  it.each([origin, edit])("holds movement and supports continue/discard for $kind", source => {
    const state = beginDraft("draft1", source, "input");
    const held = transitionDraft(state, { type: "move", destination: "next" });
    expect(held.effect).toEqual({ type: "confirm" });
    expect(held.state.draft?.body).toBe("input");
    const cancel = transitionDraft(held.state, { type: "answer", choice: "continue" });
    expect(cancel.effect).toEqual({ type: "focus-editor" });
    expect(cancel.state.transition).toBeNull();
    expect(cancel.state.draft?.origin).toEqual(source);
    const discard = transitionDraft(held.state, { type: "answer", choice: "discard" });
    expect(discard.effect).toEqual({ type: "move", destination: "next" });
    expect(discard.state.draft).toBeNull();
  });
  it.each([origin, edit])("saves the original $kind before moving and preserves failed input", source => {
    const held = transitionDraft(beginDraft("draft1", source, "input"), { type: "move", destination: "next" });
    const saving = transitionDraft(held.state, { type: "save", request: "request1" });
    expect(saving.effect).toMatchObject({ type: "save", request: "request1", draft: { id: "draft1", origin: source, body: "input" } });
    const failed = transitionDraft(saving.state, { type: "saved", draft: "draft1", request: "request1", outcome: "failed", error: "Conflict" });
    expect(failed.state.draft?.body).toBe("input");
    expect(failed.effect).toEqual({ type: "none" });
    const retry = transitionDraft(failed.state, { type: "save", request: "request2" });
    const done = transitionDraft(retry.state, { type: "saved", draft: "draft1", request: "request2", outcome: "saved" });
    expect(done.effect).toEqual({ type: "move", destination: "next" });
    expect(done.state.draft).toBeNull();
  });
  it("rejects delayed replies and prevents editing/discard/new requests while save status is unknown", () => {
    const start = beginDraft("draft2", origin, "input");
    const saving = transitionDraft(start, { type: "save", request: "request2" });
    for (const action of [
      { type: "saved", draft: "draft1", request: "request2", outcome: "saved" },
      { type: "saved", draft: "draft2", request: "request1", outcome: "saved" },
      { type: "body", body: "replacement" },
      { type: "move", destination: "other" },
      { type: "answer", choice: "discard" },
      { type: "save", request: "request3" },
    ] as const) expect(transitionDraft(saving.state, action).state).toEqual(saving.state);
    const unknown = transitionDraft(saving.state, { type: "saved", draft: "draft2", request: "request2", outcome: "unknown", error: "Check saved status" });
    expect(unknown.state.request).toBe("request2");
    expect(transitionDraft(unknown.state, { type: "save", request: "new" }).effect).toEqual({ type: "none" });
    const checked = transitionDraft(unknown.state, { type: "saved", draft: "draft2", request: "request2", outcome: "saved" });
    expect(checked.state.draft).toBeNull();
  });
  it("keeps externally invalidated create input and prevents a late save from navigating", () => {
    const held = transitionDraft(beginDraft("draft1", origin, "input"), { type: "move", destination: "next" });
    const saving = transitionDraft(held.state, { type: "save", request: "r" });
    const invalid = transitionDraft(saving.state, { type: "invalidate", reason: "Document changed" });
    expect(invalid.state.draft?.body).toBe("input");
    expect(invalid.state.transition).toBeNull();
    const done = transitionDraft(invalid.state, { type: "saved", draft: "draft1", request: "r", outcome: "saved" });
    expect(done.effect).toEqual({ type: "none" });
    const blocked = transitionDraft(beginDraft("draft1", origin, "input"), { type: "invalidate", reason: "Document changed" });
    expect(transitionDraft(blocked.state, { type: "save", request: "r" }).effect).toEqual({ type: "none" });
    expect(transitionDraft(blocked.state, { type: "move", destination: "next" }).effect).toEqual({ type: "confirm" });
  });
  it("edits survive DOM loss, while a closed project explicitly invalidates them", () => {
    const state = beginDraft("edit1", edit, "input");
    const lost = transitionDraft(state, { type: "document-lost" });
    expect(transitionDraft(lost.state, { type: "save", request: "r" }).effect.type).toBe("save");
    const closed = transitionDraft(state, { type: "invalidate", reason: "Project closed" });
    expect(transitionDraft(closed.state, { type: "save", request: "r" }).effect.type).toBe("none");
    expect(transitionDraft(beginDraft("create1", origin, "input"), { type: "document-lost" }).state.draft?.blocked).toBeTruthy();
  });
});

const here = { root: "/repo", canvas: "home" };
const lostWith = (action: Partial<{ identity: { root: string; canvas: string } | null; loading: boolean }>, source: DraftOrigin = origin, body = "input") =>
  transitionDraft(beginDraft("create1", source, body), { type: "document-lost", ...action }).state;

describe("document-lost reason", () => {
  it("is reloaded when the session still shows the origin's root and canvas id", () => {
    const state = lostWith({ identity: here });
    expect(state.draft?.lost).toBe("reloaded");
    expect(state.draft?.blocked).toBe(DOCUMENT_RELOADED);
    expect(state.draft?.body).toBe("input");
  });
  it.each([
    ["another canvas id", { root: "/repo", canvas: "other" }],
    ["another root", { root: "/other", canvas: "home" }],
    ["no identity", null],
  ])("is unavailable with %s, keeping the shipped copy", (_name, identity) => {
    const state = lostWith({ identity });
    expect(state.draft?.lost).toBe("unavailable");
    expect(state.draft?.blocked).toBe("Original document or target is unavailable.");
  });
  it("is unavailable when the caller passes no identity", () => {
    expect(lostWith({}).draft?.lost).toBe("unavailable");
  });
  it("is reloaded while the canvas is loading and its identity is unknown or the same", () => {
    expect(lostWith({ identity: null, loading: true }).draft?.lost).toBe("reloaded");
    expect(lostWith({ loading: true }).draft?.lost).toBe("reloaded");
    expect(lostWith({ identity: here, loading: true }).draft?.lost).toBe("reloaded");
  });
  it.each([
    ["a same-path canvas id change", { root: "/repo", canvas: "other" }],
    ["another root", { root: "/other", canvas: "home" }],
  ])("is unavailable while loading after %s", (_name, identity) => {
    expect(lostWith({ identity, loading: true }).draft?.lost).toBe("unavailable");
  });
  it("is decided again by the latest loss", () => {
    const unavailable = lostWith({ identity: null });
    const reloaded = transitionDraft(unavailable, { type: "document-lost", identity: here }).state;
    expect(reloaded.draft?.lost).toBe("reloaded");
    expect(transitionDraft(reloaded, { type: "document-lost", identity: null }).state.draft?.lost).toBe("unavailable");
  });
  it("is cleared by an invalidation, which cannot be continued", () => {
    const invalid = transitionDraft(lostWith({ identity: here }), { type: "invalidate", reason: "Project closed" }).state;
    expect(invalid.draft?.lost).toBeNull();
    expect(invalid.draft?.blocked).toBe("Project closed");
  });
  it("leaves an edit draft unblocked", () => {
    const state = transitionDraft(beginDraft("edit1", edit, "input"), { type: "document-lost", identity: here }).state;
    expect(state.draft?.lost).toBeNull();
    expect(state.draft?.blocked).toBeNull();
  });
});

describe("continue on the current version", () => {
  const next = { ...origin, generation: 2, path: "design/home.html", canvasHash: `sha256:${"b".repeat(64)}`, target: { frame: "second" } };
  it("replaces the blocked draft and keeps the body as edited at success", () => {
    const edited = transitionDraft(lostWith({ identity: here }), { type: "body", body: "line one\nline two" }).state;
    const result = transitionDraft(edited, { type: "continue", id: "create2", origin: next });
    expect(result.effect).toEqual({ type: "focus-editor" });
    expect(result.state.draft).toEqual({ id: "create2", origin: next, body: "line one\nline two", blocked: null, lost: null });
    expect(result.state.error).toBeNull();
  });
  it("keeps its own copy of the new origin", () => {
    const mutable = { ...next, target: { frame: "second" } };
    const result = transitionDraft(lostWith({ identity: here }), { type: "continue", id: "create2", origin: mutable });
    mutable.target.frame = "third";
    expect(result.state.draft?.origin).toEqual(next);
  });
  it("is ignored while a request is pending", () => {
    const saving = transitionDraft(beginDraft("create1", origin, "input"), { type: "save", request: "r" }).state;
    const lost = transitionDraft(saving, { type: "document-lost", identity: here }).state;
    expect(lost.draft?.lost).toBe("reloaded");
    const result = transitionDraft(lost, { type: "continue", id: "create2", origin: next });
    expect(result.state).toBe(lost);
    expect(result.effect).toEqual({ type: "none" });
  });
  it.each<[string, DraftState]>([
    ["no draft", { draft: null, transition: null, request: null, error: null }],
    ["an unblocked draft", beginDraft("create1", origin, "input")],
    ["an unavailable draft", lostWith({ identity: null })],
    ["an invalidated draft", transitionDraft(beginDraft("create1", origin, "input"), { type: "invalidate", reason: "x" }).state],
    ["an edit draft", beginDraft("edit1", edit, "input")],
  ])("is ignored for %s", (_name, state) => {
    expect(transitionDraft(state, { type: "continue", id: "create2", origin: next }).state).toBe(state);
  });
});

const ready: ContinueContext = { canvas: { status: null, unlisted: false, hasFrame: true }, reanchoring: false, author: "ready", selection: true };
const canvasOrigin = { ...origin, target: {} };
const reloadedSelection = lostWith({ identity: here });
const reloadedCanvas = lostWith({ identity: here }, canvasOrigin);

describe("continueEnabled", () => {
  it("is enabled on the original scope when the new document is ready", () => {
    expect(continueEnabled(reloadedSelection, ready)).toEqual({ kind: "enabled", scope: "selection" });
    expect(continueEnabled(reloadedCanvas, { ...ready, selection: false })).toEqual({ kind: "enabled", scope: "canvas" });
    const element = lostWith({ identity: here }, { ...origin, target: { element: { selector: "#a", html: "<a></a>" } } });
    expect(continueEnabled(element, ready)).toEqual({ kind: "enabled", scope: "selection" });
  });
  it.each<[string, DraftState]>([
    ["no draft", { draft: null, transition: null, request: null, error: null }],
    ["an unblocked draft", beginDraft("create1", origin, "input")],
    ["an unavailable draft", lostWith({ identity: null })],
    ["an invalidated draft", transitionDraft(beginDraft("create1", origin, "input"), { type: "invalidate", reason: "x" }).state],
    ["an edit draft", beginDraft("edit1", edit, "input")],
    ["a pending request", transitionDraft(transitionDraft(beginDraft("create1", origin, "input"), { type: "save", request: "r" }).state, { type: "document-lost", identity: here }).state],
  ])("is hidden for %s", (_name, state) => {
    expect(continueEnabled(state, ready)).toEqual({ kind: "hidden" });
  });
  it.each<[string, Partial<ContinueContext>, string]>([
    ["loading", { canvas: { status: "loading", unlisted: false, hasFrame: true } }, "Waiting for the canvas to finish loading."],
    ["no frame yet", { canvas: { status: null, unlisted: false, hasFrame: false } }, "Waiting for the canvas to finish loading."],
    ["no width", { canvas: { status: "noWidth", unlisted: false, hasFrame: true } }, "The current version has no readable width. Run doan check in a terminal."],
    ["a failed load", { canvas: { status: "failed", unlisted: false, hasFrame: true } }, "The current version couldn\u2019t load. Reload the canvas to try again."],
    ["an unlisted document", { canvas: { status: null, unlisted: true, hasFrame: true } }, "The page shown is not a listed canvas. Return to the canvas to continue."],
    ["finding the selection", { reanchoring: true, selection: false }, "Finding your selection in the current version\u2026"],
  ])("is disabled while %s, with the draft copy as the reason", (_name, context, reason) => {
    expect(continueEnabled(reloadedSelection, { ...ready, ...context })).toEqual({ kind: "disabled", reason, canvas: false });
    expect(Object.values(CONTINUE_REASONS)).toContain(reason);
  });
  it("puts the document reason before finding the selection", () => {
    expect(continueEnabled(reloadedSelection, { ...ready, canvas: { status: "loading", unlisted: false, hasFrame: true }, reanchoring: true })).toEqual({ kind: "disabled", reason: CONTINUE_REASONS.loading, canvas: false });
  });
  it.each(["loading", "missing", "failed"] as const)("is disabled without a reason while the author is %s; the editor already says why", (author) => {
    expect(continueEnabled(reloadedSelection, { ...ready, author })).toEqual({ kind: "disabled", reason: null, canvas: false });
    expect(continueEnabled(reloadedSelection, { ...ready, author, selection: false })).toEqual({ kind: "disabled", reason: null, canvas: false });
  });
  it("offers Continue on canvas when a selection draft has no selection", () => {
    expect(continueEnabled(reloadedSelection, { ...ready, selection: false })).toEqual({ kind: "disabled", reason: CONTINUE_REASONS.selectionGone, canvas: true });
    expect(CONTINUE_REASONS.selectionGone).toBe("Your selection is no longer in the canvas. Select an element or frame, or continue on the whole canvas.");
  });
});

describe("guardsSelectionChange", () => {
  it("lets a same-canvas selection change through while a create draft is blocked as reloaded", () => {
    expect(guardsSelectionChange(reloadedSelection, "selection")).toBe(false);
    expect(guardsSelectionChange(reloadedCanvas, "selection")).toBe(false);
  });
  it("still guards navigation away from a reloaded draft", () => {
    expect(guardsSelectionChange(reloadedSelection, "navigation")).toBe(true);
  });
  it.each<[string, DraftState]>([
    ["an unblocked draft", beginDraft("create1", origin, "input")],
    ["an unavailable draft", lostWith({ identity: null })],
    ["an invalidated draft", transitionDraft(beginDraft("create1", origin, "input"), { type: "invalidate", reason: "x" }).state],
    ["an edit draft", beginDraft("edit1", edit, "input")],
    ["a pending request", transitionDraft(transitionDraft(beginDraft("create1", origin, "input"), { type: "save", request: "r" }).state, { type: "document-lost", identity: here }).state],
  ])("guards a selection change for %s", (_name, state) => {
    expect(guardsSelectionChange(state, "selection")).toBe(true);
    expect(guardsSelectionChange(state, "navigation")).toBe(true);
  });
  it("guards nothing without a draft", () => {
    const none: DraftState = { draft: null, transition: null, request: null, error: null };
    expect(guardsSelectionChange(none, "selection")).toBe(false);
    expect(guardsSelectionChange(none, "navigation")).toBe(false);
  });
});
