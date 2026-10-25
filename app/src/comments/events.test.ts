import { describe, expect, it } from "vitest";
import { parseLines } from "../formats/fold";
import { foldText } from "../formats/foldText";
import type { CommentEvent } from "../formats/types";
import { validateCommentEvent } from "../formats/validate";
import { nextEventTime, prepareEditReopen, prepareEvent } from "./events";

const eid = (n: number) => `evt_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cid = "cmt_00000000-0000-4000-8000-000000000001";
const hash = `sha256:${"a".repeat(64)}`;
const by = { kind: "human", name: "Kim" } as const;
const created: CommentEvent = { v: 1, id: eid(1), comment: cid, at: "2026-01-01T00:00:00.000Z", type: "create", by, body: "original", target: {}, canvasHash: hash };
const textOf = (...events: CommentEvent[]) => events.map(e => JSON.stringify(e)).join("\n");
const context = { id: eid(2), comment: cid, by, now: Date.parse(created.at), create: { target: {}, canvasHash: hash, documentValid: true } };
const expected = { body: "original", status: "open", updatedAt: created.at } as const;

describe("monotonic event time", () => {
  it("truncates now, handles empty input, and chooses the later clock", () => {
    expect(nextEventTime([], 1234.9)).toBe("1970-01-01T00:00:01.234Z");
    expect(nextEventTime(parseLines(textOf(created)).events, context.now + 100.9)).toBe("2026-01-01T00:00:00.100Z");
    expect(nextEventTime(parseLines(textOf(created)).events, 0)).toBe("2026-01-01T00:00:00.001Z");
  });
  it.each(["delete", "edit", "resolve", "reopen"] as const)("counts accepted %s events even when folding ignores them", type => {
    const event = { ...created, id: eid(3), at: "2030-01-01T00:00:00.000Z", type };
    const accepted: CommentEvent = type === "edit" ? { v: 1, id: event.id, at: event.at, comment: cid, by, type, body: "ignored" } : { v: 1, id: event.id, at: event.at, comment: cid, by, type };
    const deleted: CommentEvent = { v: 1, id: eid(2), at: "2027-01-01T00:00:00.000Z", comment: cid, by, type: "delete" };
    const text = textOf(created, deleted, accepted);
    expect(foldText(text).comments).toEqual([]);
    expect(nextEventTime(parseLines(text).events, 0)).toBe("2030-01-01T00:00:00.001Z");
  });
  it("includes conflicting duplicates, disallowed agent events, and orphan events", () => {
    const future = { ...created, id: eid(4), at: "2031-01-01T00:00:00.000Z" };
    const text = textOf(created, future, { ...future, body: "conflict" }, { ...created, id: eid(5), at: "2032-01-01T00:00:00.000Z", by: { kind: "agent", name: "agent" } });
    expect(nextEventTime(parseLines(textOf(future, { ...future, body: "conflict" })).events, 0)).toBe("2031-01-01T00:00:00.001Z");
    expect(nextEventTime(parseLines(text).events, 0)).toBe("2032-01-01T00:00:00.001Z");
    const orphan: CommentEvent = { v: 1, id: eid(6), at: "2033-01-01T00:00:00.000Z", comment: cid, type: "resolve", by };
    expect(nextEventTime(parseLines(textOf(orphan)).events, 0)).toBe("2033-01-01T00:00:00.001Z");
  });
  it.each(["2026-02-30T00:00:00.000Z", "2026-01-01T24:00:00.000Z", "2026-01-01T00:00:60.000Z", "9999-12-31T23:59:59.999Z"])("rejects impossible maximal calendar time or overflow %s", at => {
    const events = parseLines(textOf({ ...created, at })).events;
    expect(events).toHaveLength(1);
    expect(() => nextEventTime(events, 0)).toThrow();
  });
  it("accepts leap days and rejects an invalid now or year outside the v1 range", () => {
    expect(nextEventTime(parseLines(textOf({ ...created, at: "2024-02-29T23:59:59.999Z" })).events, 0)).toBe("2024-03-01T00:00:00.000Z");
    for (const now of [NaN, Infinity, Date.parse("+010000-01-01T00:00:00.000Z")]) expect(() => nextEventTime([], now)).toThrow();
  });
});

describe("event preparation", () => {
  it("creates v1 with trusted authority and preserves long Unicode body exactly", () => {
    const body = `  ${"한😀".repeat(5000)}\n `;
    const event = prepareEvent("", { type: "create", body }, context);
    expect(event).toEqual({ ...created, id: eid(2), body });
    expect(validateCommentEvent(event)).toBe(true);
  });
  it.each(["", " \t\n", "\u00a0\u3000"])("rejects blank new bodies %j", body => {
    expect(() => prepareEvent("", { type: "create", body }, context)).toThrow();
    expect(() => prepareEvent(textOf(created), { type: "edit", comment: cid, body, expected }, context)).toThrow();
  });
  it("edits with no DOM or hash evidence and leaves the create target/hash intact", () => {
    const event = prepareEvent(textOf(created), { type: "edit", comment: cid, body: " new \n", expected }, { id: eid(2), comment: cid, by, now: 0 });
    expect(event).toEqual({ v: 1, id: eid(2), at: "2026-01-01T00:00:00.001Z", by, comment: cid, type: "edit", body: " new \n" });
    expect(foldText(textOf(created, event)).comments[0]).toMatchObject({ canvasHash: hash, target: {}, body: " new \n" });
  });
  it("prepares delete/resolve/reopen only against the exact current state", () => {
    for (const type of ["delete", "resolve"] as const) expect(prepareEvent(textOf(created), { type, comment: cid, expected }, context).type).toBe(type);
    const resolve = prepareEvent(textOf(created), { type: "resolve", comment: cid, expected }, context);
    const reopened = prepareEvent(textOf(created, resolve), { type: "reopen", comment: cid, expected: { ...expected, status: "resolved", resolvedAt: resolve.at } }, { ...context, id: eid(3) });
    expect(foldText(textOf(created, resolve, reopened)).comments[0]?.status).toBe("open");
    expect(() => prepareEvent(textOf(created), { type: "reopen", comment: cid, expected }, context)).toThrow();
  });
  it("rejects deleted comments, conflicting state, reused IDs and stale creates", () => {
    const deleted = prepareEvent(textOf(created), { type: "delete", comment: cid, expected }, context);
    expect(() => prepareEvent(textOf(created, deleted), { type: "edit", comment: cid, body: "new", expected }, { ...context, id: eid(3) })).toThrow();
    expect(() => prepareEvent(textOf(created), { type: "edit", comment: cid, body: "new", expected: { ...expected, body: "other" } }, context)).toThrow();
    expect(() => prepareEvent(textOf(created), { type: "create", body: "new" }, context)).toThrow();
    expect(() => prepareEvent(textOf(created), { type: "resolve", comment: cid, expected }, { ...context, id: eid(1) })).toThrow();
    expect(() => prepareEvent("", { type: "create", body: "new" }, { ...context, create: { ...context.create, documentValid: false } })).toThrow();
  });
  it("does not let renderer fields claim authority or target and requires human identity", () => {
    for (const field of ["by", "at", "id", "canvasHash", "target", "path"]) expect(() => prepareEvent("", { type: "create", body: "new", [field]: "forged" }, context)).toThrow();
    expect(() => prepareEvent("", { type: "create", body: "new" }, { ...context, by: { kind: "human", name: " " } })).toThrow();
    expect(() => prepareEvent("", { type: "create", body: "new" }, { ...context, by: { kind: "agent", name: "agent" } })).toThrow();
  });
});

describe("edit and reopen preparation", () => {
  const resolved: CommentEvent = { v: 1, id: eid(2), comment: cid, at: "2026-01-01T00:00:01.000Z", type: "resolve", by: { kind: "agent", name: "codex" } };
  const resolvedExpected = { body: "original", status: "resolved", updatedAt: created.at, resolvedAt: resolved.at } as const;
  const intent = { type: "edit-reopen", comment: cid, body: "revised", expected: resolvedExpected } as const;
  const authority = { id: eid(3), comment: cid, by, now: 0 };

  it("prepares the edit, then the reopen 1 ms later against the text with the edit appended", () => {
    const [edit, reopen] = prepareEditReopen(textOf(created, resolved), intent, authority, eid(4));
    expect(edit).toEqual({ v: 1, id: eid(3), at: "2026-01-01T00:00:01.001Z", by, comment: cid, type: "edit", body: "revised" });
    expect(reopen).toEqual({ v: 1, id: eid(4), at: "2026-01-01T00:00:01.002Z", by, comment: cid, type: "reopen" });
    expect(validateCommentEvent(edit) && validateCommentEvent(reopen)).toBe(true);
    expect(foldText(textOf(created, resolved, edit, reopen)).comments[0]).toMatchObject({ status: "open", body: "revised", updatedAt: edit.at });
  });
  it("keeps the 1 ms step from a later clock and from a text without a trailing newline", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    const [edit, reopen] = prepareEditReopen(textOf(created, resolved) + "\n", intent, { ...authority, now }, eid(4));
    expect([edit.at, reopen.at]).toEqual(["2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.001Z"]);
  });
  it("rejects an open comment, a stale expected state, a blank body and a reused reopen id", () => {
    expect(() => prepareEditReopen(textOf(created), { ...intent, expected }, authority, eid(4))).toThrow("Comment status changed.");
    expect(() => prepareEditReopen(textOf(created, resolved), { ...intent, expected: { ...resolvedExpected, body: "other" } }, authority, eid(4))).toThrow("Comment changed");
    expect(() => prepareEditReopen(textOf(created, resolved), { ...intent, body: " \n" }, authority, eid(4))).toThrow();
    expect(() => prepareEditReopen(textOf(created, resolved), intent, authority, eid(3))).toThrow("Event id already exists");
    expect(() => prepareEditReopen(textOf(created, resolved), intent, authority, eid(1))).toThrow("Event id already exists");
  });
  it("rejects other intent shapes, and the single-event path rejects edit-reopen", () => {
    for (const bad of [{ ...intent, type: "edit" }, { ...intent, extra: 1 }, { type: "edit-reopen", comment: cid, expected: resolvedExpected }]) {
      expect(() => prepareEditReopen(textOf(created, resolved), bad, authority, eid(4))).toThrow();
    }
    expect(() => prepareEvent(textOf(created, resolved), intent, authority)).toThrow("Invalid comment mutation.");
  });
});
