import { expect, test } from "vitest";
import { canvasStem, exportProgress, exportToast, trashToast } from "./canvasRowMessages";

test("a canvas's name is its file stem, from any subdirectory", () => {
  expect(canvasStem(".doan/canvases/checkout.html")).toBe("checkout");
  expect(canvasStem(".doan/ds/flows/checkout.html")).toBe("checkout");
});

// The sidebar's label (canvasLabel) strips the extension in any case and keeps a bare `.html`; every name follows it.
test("a canvas's name is the sidebar's label for any extension case", () => {
  expect(canvasStem(".doan/canvases/Checkout.HTML")).toBe("Checkout");
  expect(canvasStem(".doan/canvases/.html")).toBe(".html");
});

test("Move to Trash says one toast per reply: success or main's refusal", () => {
  expect(trashToast("checkout", { kind: "trashed" })).toBe("Moved “checkout” to Trash.");
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
  // Main's own refusals read as any other failure.
  for (const reason of ["exporting", "notListed"] as const) expect(exportToast("checkout", { kind: "refused", reason })).toEqual({ text: "Couldn’t export “checkout”. Try again." });
  for (const reply of [{ kind: "failed", reason: "unreadable" }, { kind: "refused", reason: "notListed" }] as const) expect(exportToast("checkout", reply)?.reveal).toBeUndefined();
});

// The prototype window's Export: the name is the frame's title (or ID), and the file holds the whole canvas.
test("a prototype export says the file also holds the rest of the canvas", () => {
  expect(exportToast("Checkout", { kind: "exported", external: 0, reveal: "r1" }, true)).toEqual({ text: "Exported “Checkout”. The file also contains the rest of the canvas.", reveal: "r1" });
  expect(exportToast("Checkout", { kind: "exported", external: 1, reveal: "r2" }, true)).toEqual({ text: "Exported “Checkout”. The file also contains the rest of the canvas. Parts of it load from the internet.", reveal: "r2" });
});

// The file holds the start frame's link group; the toast counts the frames besides it.
test("a prototype export with linked frames says how many came with it", () => {
  expect(exportToast("Checkout", { kind: "exported", external: 0, reveal: "r1", linkedFrames: 2 }, true)).toEqual({ text: "Exported “Checkout” and 2 linked frames. The file also contains the rest of the canvas.", reveal: "r1" });
  expect(exportToast("Checkout", { kind: "exported", external: 0, reveal: "r1", linkedFrames: 1 }, true)?.text).toBe("Exported “Checkout” and 1 linked frame. The file also contains the rest of the canvas.");
  expect(exportToast("Checkout", { kind: "exported", external: 3, reveal: "r1", linkedFrames: 1000 }, true)?.text).toBe("Exported “Checkout” and 1000 linked frames. The file also contains the rest of the canvas. Parts of it load from the internet.");
  expect(exportToast("Checkout", { kind: "exported", external: 0, reveal: "r1", linkedFrames: 0 }, true)?.text).toBe("Exported “Checkout”. The file also contains the rest of the canvas.");
  // The canvas row's Export has no group.
  expect(exportToast("checkout", { kind: "exported", external: 0, reveal: "r1", linkedFrames: 2 })?.text).toBe("Exported “checkout”.");
});

test("a prototype export names the frame the file cannot hold or play", () => {
  expect(exportToast("Checkout", { kind: "failed", reason: "notFound" }, true)?.text).toBe("Couldn’t export “Checkout”. Doan can export only a frame written in the canvas file, not one a script adds. Ask your agent to write it into the canvas file.");
  expect(exportToast("Checkout", { kind: "failed", reason: "notMarked" }, true)?.text).toBe("Couldn’t export “Checkout”. It isn’t marked for prototyping in the canvas file. Ask your agent to mark it.");
});

// Export again would export what plays now, so the toast does not say Try again.
test("a click on a frame that stopped playing names it and how to export it", () => {
  expect(exportToast("Checkout", { kind: "refused", reason: "changed" }, true)).toEqual({ text: "Couldn’t export “Checkout”. Another frame started playing first. Play “Checkout” again, then export it." });
});

test("a prototype export's other failures read as the canvas row's", () => {
  for (const reply of [{ kind: "failed", reason: "unreadable" }, { kind: "failed", reason: "insideDoan" }, { kind: "failed", reason: "failed" }, { kind: "refused", reason: "exporting" },
    { kind: "failed", reason: "tooLarge", largest: null }, { kind: "failed", reason: "refused", count: 2, first: "../a.png" }] as const) {
    expect(exportToast("Checkout", reply, true), JSON.stringify(reply)).toEqual(exportToast("Checkout", reply));
  }
  expect(exportToast("Checkout", { kind: "cancelled" }, true)).toBeNull();
});
