import { describe, expect, test } from "vitest";
import { MAX_SUBJECT_LENGTH, promptSentence } from "./promptSentence";

describe("promptSentence", () => {
  test("builds the sentence around the repo and the subject", () => {
    expect(promptSentence("/code/acme", "a sign-in screen with SSO")).toBe("Use the doan skill to make a design canvas in /code/acme for a sign-in screen with SSO.");
  });
  test("trims the subject", () => {
    expect(promptSentence("/code/acme", "  a pricing page \t")).toBe("Use the doan skill to make a design canvas in /code/acme for a pricing page.");
  });
  test("an empty or blank subject is an error", () => {
    expect(promptSentence("/code/acme", "")).toEqual({ error: "empty" });
    expect(promptSentence("/code/acme", " \t ")).toEqual({ error: "empty" });
    expect(promptSentence("/code/acme", "\n")).toEqual({ error: "empty" });
  });
  test("a trailing period leaves exactly one", () => {
    expect(promptSentence("/code/acme", "a pricing page.")).toBe("Use the doan skill to make a design canvas in /code/acme for a pricing page.");
    expect(promptSentence("/code/acme", "a pricing page. ")).toBe("Use the doan skill to make a design canvas in /code/acme for a pricing page.");
   });
  test("a run of trailing periods collapses to one", () => {
    expect(promptSentence("/code/acme", "a pricing page...")).toBe("Use the doan skill to make a design canvas in /code/acme for a pricing page.");
    expect(promptSentence("/code/acme", "a pricing page.. \n")).toBe("Use the doan skill to make a design canvas in /code/acme for a pricing page.");
  });
  test("line breaks and control characters are rejected", () => {
    for (const subject of ["a\nb", "a\r\nb", "a\rb", "a\tb", "a\u0000b", "a\u001bb", "a\u007fb", "a\u0085b", "a\u2028b", "a\u2029b"]) {
      expect(promptSentence("/code/acme", subject), JSON.stringify(subject)).toEqual({ error: "control" });
    }
  });
  test("500 characters pass and 501 do not, counted after trimming", () => {
    expect(MAX_SUBJECT_LENGTH).toBe(500);
    expect(typeof promptSentence("/code/acme", "x".repeat(500))).toBe("string");
    expect(promptSentence("/code/acme", "x".repeat(501))).toEqual({ error: "too-long" });
    expect(typeof promptSentence("/code/acme", ` ${"x".repeat(500)} `)).toBe("string");
  });
  test("characters outside the BMP count once", () => {
    expect(typeof promptSentence("/code/acme", "😀".repeat(500))).toBe("string");
    expect(promptSentence("/code/acme", "😀".repeat(501))).toEqual({ error: "too-long" });
  });
});
