import { describe, expect, it } from "vitest";
import { PROMPT_SUGGESTION_LIMIT, promptSuggestionText } from "./promptSuggestion";
const frame = (suggestion: unknown) => ({ type: "prompt_suggestion", suggestion, uuid: "u", session_id: "s" });
const text = (suggestion: string) => promptSuggestionText(frame(suggestion));
describe("promptSuggestionText", () => {
  it("takes only a prompt_suggestion frame whose suggestion is a string", () => {
    expect(text("Run the tests")).toBe("Run the tests");
    for (const raw of [null, undefined, "Run the tests", 1, [], { type: "prompt_suggestion" }, { type: "prompt_suggestion", suggestion: 1 }, { type: "prompt_suggestion", suggestion: null },
      { type: "result", suggestion: "Run the tests" }, { suggestion: "Run the tests" }, { type: "PROMPT_SUGGESTION", suggestion: "Run the tests" }]) expect(promptSuggestionText(raw)).toBeNull();
  });
  it("is null for an empty or blank suggestion", () => {
    for (const blank of ["", " ", "\n\t\r", "\u00a0\u2028\u2029\u0085", "\u0000\u202a\u2066"]) expect(text(blank)).toBeNull();
  });
  it("folds line breaks and runs of space into one space and trims the ends", () => {
    expect(text("  Run\nthe\r\n\r\ntests \t now  ")).toBe("Run the tests now");
    expect(text("a\u000bb\u000cc")).toBe("a b c");
  });
  // prompt-suggestion design, pure function 1: both ends of every character range, and the character just outside it.
  it.each([
    ["U+0009", "\u0009", " "], ["U+000D", "\u000d", " "], ["U+0085", "\u0085", " "], ["U+00A0", "\u00a0", " "], ["U+2028", "\u2028", " "], ["U+2029", "\u2029", " "], ["U+0020", " ", " "],
  ])("folds %s into a space", (_name, char, shown) => {
    expect(text(`a${char}b`)).toBe(`a${shown}b`);
    expect(text(`a ${char} ${char}b`)).toBe("a b");
  });
  it.each([
    ["U+0000", "\u0000"], ["U+0008", "\u0008"], ["U+000E", "\u000e"], ["U+001F", "\u001f"], ["U+007F", "\u007f"], ["U+0084", "\u0084"], ["U+0086", "\u0086"], ["U+009F", "\u009f"],
    ["U+202A", "\u202a"], ["U+202E", "\u202e"], ["U+2066", "\u2066"], ["U+2069", "\u2069"],
  ])("removes %s", (_name, char) => {
    expect(text(`a${char}b`)).toBe("ab");
    // Removed before folding, so it leaves no double space between the words it separated.
    expect(text(`a ${char} b`)).toBe("a b");
  });
  it.each([["U+0021", "!"], ["U+00A1", "\u00a1"], ["U+2027", "\u2027"], ["U+202F", "\u202f"], ["U+2065", "\u2065"], ["U+206A", "\u206a"], ["U+200B", "\u200b"]])("keeps %s", (_name, char) => {
    expect(text(`a${char}b`)).toBe(`a${char}b`);
  });
  it("keeps a suggestion of exactly the limit in code units after cleanup, and drops one over it instead of cutting it", () => {
    expect(PROMPT_SUGGESTION_LIMIT).toBe(1000);
    const exact = "x".repeat(1000);
    expect(text(exact)).toBe(exact);
    expect(text(`${"x".repeat(1001)}`)).toBeNull();
    // Counted after folding and removing: these come down to 1000 code units.
    expect(text(`  ${"x".repeat(499)}\n\n\n${"x".repeat(500)}\u0000  `)).toBe(`${"x".repeat(499)} ${"x".repeat(500)}`);
    // Code units, not characters: 500 astral characters are 1000 units; one more is over.
    expect(text("\u{1f600}".repeat(500))).toBe("\u{1f600}".repeat(500));
    expect(text(`${"\u{1f600}".repeat(500)}x`)).toBeNull();
  });
});
