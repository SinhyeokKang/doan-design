import { expect, it } from "vitest";
import { pasteAsAttachment, pastedTextMeta, pastedTextLabel, readyAttachment, recordedAttachment } from "./homeComposer";

const state = { acceptsAttachments: true, commandFirst: false, attached: 0, limit: 10 };
it("uses code points and logical lines at the paste thresholds", () => {
  for (const unit of ["a", "한", "😀"]) {
    expect(pasteAsAttachment(unit.repeat(999), state)).toBe("field");
    expect(pasteAsAttachment(unit.repeat(1000), state)).toBe("attach");
  }
  for (const newline of ["\n", "\r\n", "\r"]) {
    const nine = Array(9).fill("line").join(newline);
    expect(pasteAsAttachment(nine, state)).toBe("field");
    expect(pasteAsAttachment(nine + newline, state)).toBe("field");
    expect(pasteAsAttachment(nine + newline + "ten", state)).toBe("attach");
  }
});
it("keeps whitespace, commands and unavailable attachments in the field before checking the cap", () => {
  expect(pasteAsAttachment(" \n".repeat(1000), state)).toBe("field");
  expect(pasteAsAttachment("x".repeat(1000), { ...state, acceptsAttachments: false, attached: 10 })).toBe("field");
  expect(pasteAsAttachment("x".repeat(1000), { ...state, commandFirst: true })).toBe("field");
  expect(pasteAsAttachment("short", { ...state, attached: 10 })).toBe("field");
  // attached includes ready and checking chips: neither can reserve another slot.
  expect(pasteAsAttachment("x".repeat(1000), { ...state, attached: 10 })).toBe("limit");
  expect(pasteAsAttachment("x".repeat(1000), { ...state, attached: 9 })).toBe("attach");
});
it("counts lines without one terminal newline and takes eighty first-line code points", () => {
  expect(pastedTextMeta("first\r\nsecond\rthird\n")).toEqual({ lines: 3, excerpt: "first" });
  expect(pastedTextMeta("😀".repeat(81) + "\nsecond")).toEqual({ lines: 2, excerpt: "😀".repeat(80) });
  expect(pastedTextMeta("")).toEqual({ lines: 1, excerpt: "" });
  expect(pastedTextMeta("a\n\n")).toEqual({ lines: 2, excerpt: "a" });
  expect(pastedTextLabel(1)).toBe("1 line");
  expect(pastedTextLabel(10)).toBe("10 lines");
});

it("keeps pasted text metadata in ready and missing attachment drafts", () => {
  const record = { name: "pasted-text-x.txt", kind: "file" as const, size: 5, path: "/paste.txt", lines: 2, excerpt: "first" };
  expect(readyAttachment("k", { ...record, id: "id", pasted: true })).toMatchObject({ lines: 2, excerpt: "first" });
  expect(recordedAttachment("k", record)).toMatchObject({ lines: 2, excerpt: "first" });
});
