import { describe, expect, it } from "vitest";
import { beginDraft, transitionDraft } from "./draft";

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
