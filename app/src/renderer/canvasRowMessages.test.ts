import { expect, test } from "vitest";
import { canvasStem, exportProgress, exportToast, trashToast } from "./canvasRowMessages";

// canvas-row-menu design '문구': the toasts are fixed there, word for word.
test("a canvas's name is its file stem, from any subdirectory", () => {
  expect(canvasStem(".doan/canvases/checkout.html")).toBe("checkout");
  expect(canvasStem(".doan/ds/flows/checkout.html")).toBe("checkout");
});

test("Move to Trash says one toast per reply: success, comments left behind, or main's refusal", () => {
  for (const comments of ["trashed", "none", "kept"] as const) expect(trashToast("checkout", { kind: "trashed", comments })).toBe("Moved “checkout” to Trash.");
  expect(trashToast("checkout", { kind: "trashed", comments: "failed", file: ".doan/comments/checkout.jsonl" }))
    .toBe("Moved “checkout” to Trash, but its comments couldn’t be moved. They stay at .doan/comments/checkout.jsonl.");
  expect(trashToast("checkout", { kind: "refused", reason: "busy" })).toBe("Couldn’t move “checkout” to Trash. An agent started working on it.");
  expect(trashToast("checkout", { kind: "refused", reason: "notListed" })).toBe("Couldn’t move “checkout” to Trash. It’s no longer in this project.");
  expect(trashToast("checkout", { kind: "refused", reason: "notFile" })).toBe("Couldn’t move “checkout” to Trash. It isn’t a regular file.");
  expect(trashToast("checkout", { kind: "refused", reason: "failed" })).toBe("Couldn’t move “checkout” to Trash. Try again, or move the file in Finder.");
});

test("Export says its progress, its result with Show in Finder, and why it failed", () => {
  expect(exportProgress("checkout")).toBe("Exporting “checkout”");
  expect(exportToast("checkout", { kind: "cancelled" })).toBeNull();
  expect(exportToast("checkout", { kind: "exported", external: 0, reveal: "r1" })).toEqual({ text: "Exported “checkout”.", reveal: "r1" });
  expect(exportToast("checkout", { kind: "exported", external: 2, reveal: "r2" })).toEqual({ text: "Exported “checkout”. Parts of it load from the internet.", reveal: "r2" });
  const text = (reply: Parameters<typeof exportToast>[1]) => exportToast("checkout", reply)?.text;
  expect(text({ kind: "failed", reason: "refused", count: 1, first: "../logo.png" })).toBe("Couldn’t export “checkout”. It uses a file Doan can’t include: ../logo.png. Ask your agent to fix it.");
  expect(text({ kind: "failed", reason: "refused", count: 3, first: "../../brand/logo.svg" })).toBe("Couldn’t export “checkout”. It uses 3 files Doan can’t include, starting with ../../brand/logo.svg. Ask your agent to fix them.");
  expect(text({ kind: "failed", reason: "unreadable" })).toBe("Couldn’t export “checkout”. Doan can’t read this canvas. Ask your agent to run doan check.");
  expect(text({ kind: "failed", reason: "tooLarge", largest: ".doan/assets/hero-video.mp4" })).toBe("Couldn’t export “checkout”. The file would be over 50 MB. The largest file it uses is .doan/assets/hero-video.mp4.");
  // The CLI named no asset: the sentence about it is left out.
  expect(text({ kind: "failed", reason: "tooLarge", largest: null })).toBe("Couldn’t export “checkout”. The file would be over 50 MB.");
  expect(text({ kind: "failed", reason: "insideDoan" })).toBe("Couldn’t export “checkout”. Choose a folder outside .doan.");
  expect(text({ kind: "failed", reason: "failed" })).toBe("Couldn’t export “checkout”. Try again.");
  // Main's own refusals have no sentence of their own (C2 brief): any other failure.
  for (const reason of ["exporting", "notListed"] as const) expect(exportToast("checkout", { kind: "refused", reason })).toEqual({ text: "Couldn’t export “checkout”. Try again." });
  for (const reply of [{ kind: "failed", reason: "unreadable" }, { kind: "refused", reason: "notListed" }] as const) expect(exportToast("checkout", reply)?.reveal).toBeUndefined();
});
