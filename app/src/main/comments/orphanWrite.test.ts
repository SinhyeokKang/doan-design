import { describe, expect, test } from "vitest";
import type { FolderView } from "../cli";
import type { OrphanFile } from "../view";
import { orphanWriteAllowed } from "./orphanWrite";

const orphan = (extra: Partial<OrphanFile> = {}): OrphanFile => ({ id: "checkout-v1", file: ".doan/comments/checkout-v1.jsonl", comments: { open: 2, resolved: 1 }, uncertain: false, ...extra });
const listing = (orphans?: OrphanFile[], canvases: unknown[] = []): FolderView => ({ kind: "list", root: "/repo", scope: ["doan"], canvases, ...(orphans ? { orphans } : {}) });
const expected = { status: "open", updatedAt: "2026-10-25T10:00:00.000Z" };
const request = (type: string, canvas = "checkout-v1", root = "/repo") => ({ root, canvas, requestID: "req-1", project: 1, intent: { type, comment: "cmt_1", expected } });

// project-feedback design §4: the fresh ls `orphans` decides; create and edit
// never reach a file no canvas uses.
describe("orphanWriteAllowed", () => {
  test.each(["resolve", "reopen", "delete"])("allows %s on a listed, certain, readable orphan", (type) => {
    expect(orphanWriteAllowed(listing([orphan()]), request(type))).toBe(true);
  });

  test.each(["create", "edit", "edit-reopen", "", "RESOLVE"])("rejects %s", (type) => {
    expect(orphanWriteAllowed(listing([orphan()]), request(type))).toBe(false);
  });

  test("rejects an id that is not in orphans, including one a canvas row uses", () => {
    expect(orphanWriteAllowed(listing([orphan()]), request("resolve", "checkout"))).toBe(false);
    expect(orphanWriteAllowed(listing([], [{ path: "doan/checkout.html", id: "checkout-v1" }]), request("resolve"))).toBe(false);
    expect(orphanWriteAllowed(listing(), request("resolve"))).toBe(false);
  });

  // TS does not look at canvas rows: ls leaves invalid and duplicate ids off
  // them, so only Go knows the file is matched (design §4).
  test("trusts orphans over canvas rows", () => {
    expect(orphanWriteAllowed(listing([orphan()], [{ path: "doan/x.html" }]), request("resolve"))).toBe(true);
  });

  test("rejects an uncertain orphan and one ls could not read", () => {
    expect(orphanWriteAllowed(listing([orphan({ uncertain: true })]), request("resolve"))).toBe(false);
    const unreadable = orphan({ error: { code: "unreadable_comments", message: ".doan/comments/checkout-v1.jsonl: permission denied" } });
    delete unreadable.comments;
    expect(orphanWriteAllowed(listing([unreadable]), request("resolve"))).toBe(false);
  });

  test("rejects an id that is not kebab case even when listed", () => {
    for (const id of ["Foo", "foo_bar", "-foo", "foo--bar", "foo-", "", "../x"]) {
      expect(orphanWriteAllowed(listing([orphan({ id, file: `.doan/comments/${id}.jsonl` })]), request("delete", id)), id).toBe(false);
    }
  });

  test("rejects a listing that is not a list or is for another root", () => {
    expect(orphanWriteAllowed({ kind: "error", message: "bad" }, request("resolve"))).toBe(false);
    expect(orphanWriteAllowed({ kind: "notFound" }, request("resolve"))).toBe(false);
    expect(orphanWriteAllowed(listing([orphan()]), request("resolve", "checkout-v1", "/other"))).toBe(false);
  });

  test("rejects a malformed intent", () => {
    for (const intent of [null, "resolve", {}, { type: 1 }]) {
      expect(orphanWriteAllowed(listing([orphan()]), { ...request("resolve"), intent })).toBe(false);
    }
  });
});
