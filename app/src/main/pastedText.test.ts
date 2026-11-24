import { expect, it } from "vitest";
import { cleanupTargets, MAX_IMAGE_BYTES, pastedTextAttachments, pastedTextName, pasteTextRequest } from "./attachments";
import type { AttachmentRecord } from "./conversation/types";

it("names pasted text with the same ISO convention as images", () => {
  expect(pastedTextName(new Date("2026-11-24T01:02:03.456Z"))).toBe("pasted-text-2026-11-24T01-02-03-456Z.txt");
});
it("validates pasted text and normalizes newlines using the UTF-8 byte cap", () => {
  expect(pasteTextRequest({ text: "a\r\nb\rc", lines: 3, excerpt: "a" })).toEqual({ text: "a\nb\nc", lines: 3, excerpt: "a" });
  const boundary = "한".repeat(Math.floor(MAX_IMAGE_BYTES / 3)) + "a".repeat(MAX_IMAGE_BYTES % 3);
  expect(pasteTextRequest({ text: boundary, lines: 1, excerpt: "한" })?.text).toBe(boundary);
  expect(pasteTextRequest({ text: boundary + "a", lines: 1, excerpt: "한" })).toBeNull();
});
it("rejects malformed paste text requests and metadata", () => {
  const good = { text: "a", lines: 1, excerpt: "a" };
  for (const value of [null, [], "text", {}, { ...good, text: 1 }, { ...good, text: "" }, { ...good, lines: 0 },
    { ...good, lines: 1.1 }, { ...good, lines: Infinity }, { ...good, excerpt: null }, { ...good, excerpt: "😀".repeat(81) },
    { ...good, excerpt: "a\nb" }, { ...good, extra: 1 }]) expect(pasteTextRequest(value)).toBeNull();
  expect(pasteTextRequest({ ...good, excerpt: "😀".repeat(80) })).not.toBeNull();
});
it("selects only pasted text files inside the store, never an outside lookalike or a sibling", () => {
  const record = (path: string, name = "pasted-text-x.txt"): AttachmentRecord => ({ name, path, kind: "file", size: 1 });
  const kept = record("/store/attachments/id/pasted-text-x.txt");
  expect(pastedTextAttachments([kept, record("/outside/pasted-text-x.txt"), record("/store/attachments-other/pasted-text-x.txt"),
    record("/store/attachments/../secret/pasted-text-x.txt"), record("/store/attachments/id/notes.txt", "notes.txt"),
    { name: kept.name, path: kept.path, size: 1, kind: "image" }, { name: kept.name, path: kept.path, kind: "directory" }], "/store/attachments")).toEqual([kept]);
});
it("keeps draft and queue directories and sent directories during cleanup", () => {
  const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444"];
  expect(cleanupTargets(ids.map((name, i) => ({ name, directory: true, sent: i === 2 })), new Set(ids.slice(0, 2)))).toEqual([ids[3]]);
});
