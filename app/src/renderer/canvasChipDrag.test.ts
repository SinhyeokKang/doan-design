import { afterEach, describe, expect, it, vi } from "vitest";
import type { Anchor } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasChipTarget, type CanvasChipComposer } from "./canvasChip";
import {
  beginCanvasDrag, CANVAS_DRAG_TYPE, canvasDragging, canvasDragOf, canvasDropDecision, chipComposer, endCanvasDrag, onCanvasChips, registerChipComposer,
  type CanvasDrag, type ChipComposer,
} from "./canvasChipDrag";

// A DataTransfer as Chromium shows it during dragover: the types only, getData empty.
function transfer(types: string[] = []) {
  const data = new Map<string, string>(types.map(type => [type, ""]));
  return {
    get types() { return [...data.keys()]; },
    setData: vi.fn((type: string, value: string) => { data.set(type, value); }),
    getData: (type: string) => data.get(type) ?? "",
    setDragImage: vi.fn(),
    effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
    dropEffect: "none" as DataTransfer["dropEffect"],
    values: data,
  };
}
const asTransfer = (value: ReturnType<typeof transfer>) => value as unknown as DataTransfer;

const WEB = "/code/doan-web", SHOP = "/code/checkout-app";
const checkout: CanvasRow = { path: ".doan/canvases/checkout-flow.html", url: "u", id: "checkout" };
const entries: FolderEntry[] = [
  { path: WEB, kind: "list", servedRev: 0, canvases: [checkout] },
  { path: SHOP, kind: "list", servedRev: 0, canvases: [] },
];
const drag = (root = WEB): CanvasDrag => ({ root, path: checkout.path, id: "checkout", judge: composer => canvasChipTarget({ root, canvas: checkout, entries }, "canvas", composer) });
const composer = (root: string, reason: string | null = null): ChipComposer => ({ root, canTake: () => reason, insert: vi.fn(() => "inserted" as const) });

afterEach(() => endCanvasDrag());

describe("the sidebar drag", () => {
  it("puts only Doan's marker on the transfer, copy only: no root, path or plain text", () => {
    const data = transfer();
    beginCanvasDrag(drag(), asTransfer(data));
    expect(data.types).toEqual([CANVAS_DRAG_TYPE]);
    expect(data.getData(CANVAS_DRAG_TYPE)).toBe("");
    expect(data.effectAllowed).toBe("copy");
    expect(JSON.stringify([...data.values])).not.toContain(WEB);
    expect(JSON.stringify([...data.values])).not.toContain("checkout");
  });

  it("keeps the drag in memory until it ends, and reads it back from the marker", () => {
    const started = drag();
    beginCanvasDrag(started, asTransfer(transfer()));
    expect(canvasDragging()).toBe(true);
    expect(canvasDragOf(asTransfer(transfer([CANVAS_DRAG_TYPE])))).toBe(started);
    endCanvasDrag();
    expect(canvasDragging()).toBe(false);
  });

  it("calls a marker without a drag in memory foreign, and any other drag none of its business", () => {
    expect(canvasDragOf(asTransfer(transfer([CANVAS_DRAG_TYPE])))).toBe("foreign");
    beginCanvasDrag(drag(), asTransfer(transfer()));
    expect(canvasDragOf(asTransfer(transfer(["Files"])))).toBeNull();
    expect(canvasDragOf(asTransfer(transfer(["text/plain"])))).toBeNull();
    expect(canvasDragOf(null)).toBeNull();
  });

  // A source row drawn again mid-drag may never get its dragend; a stale drag would leave the board shielded.
  it("ends on the window's dragend or drop, and at the next press or move when neither came", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    try {
      for (const type of ["dragend", "drop", "pointerdown", "pointermove", "mousemove"]) {
        beginCanvasDrag(drag(), asTransfer(transfer()));
        target.dispatchEvent(new Event(type));
        expect(canvasDragging(), type).toBe(false);
      }
    } finally { vi.unstubAllGlobals(); }
  });

  // Chromium sends no pointer or mouse moves while a drag runs, so the first one comes after it.
  it("ends on the first move after a drag whose source row was removed and whose drop missed every target", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    try {
      beginCanvasDrag(drag(), asTransfer(transfer()));
      expect(canvasDragging()).toBe(true);
      target.dispatchEvent(new Event("pointermove"));
      expect(canvasDragging()).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it("tells listeners when a drag starts and ends", () => {
    const listener = vi.fn();
    const stop = onCanvasChips(listener);
    beginCanvasDrag(drag(), asTransfer(transfer()));
    endCanvasDrag();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    beginCanvasDrag(drag(), asTransfer(transfer()));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("the drop decision", () => {
  const anchor: Anchor = { canvas: { path: checkout.path, id: "checkout" } };

  it("gives the chip for a drag the composer takes", () => {
    beginCanvasDrag(drag(), asTransfer(transfer()));
    expect(canvasDropDecision(asTransfer(transfer([CANVAS_DRAG_TYPE])), composer(WEB))).toEqual({ anchor });
  });

  it("gives the menu's reason for a drag the composer refuses: another root, or the composer's own", () => {
    beginCanvasDrag(drag(), asTransfer(transfer()));
    expect(canvasDropDecision(asTransfer(transfer([CANVAS_DRAG_TYPE])), composer(SHOP))).toEqual({ refused: "Only canvases in checkout-app can go in this message." });
    expect(canvasDropDecision(asTransfer(transfer([CANVAS_DRAG_TYPE])), composer(WEB, "Finish typing first."))).toEqual({ refused: "Finish typing first." });
  });

  it("refuses a marker with no drag in memory, without a reason to show", () => {
    expect(canvasDropDecision(asTransfer(transfer([CANVAS_DRAG_TYPE])), composer(WEB))).toEqual({ refused: null });
  });

  it("leaves files and other drags alone", () => {
    beginCanvasDrag(drag(), asTransfer(transfer()));
    expect(canvasDropDecision(asTransfer(transfer(["Files"])), composer(WEB))).toBeNull();
  });
});

describe("composer registration", () => {
  it("keeps the latest composer of each place, and the earlier one again when the latest leaves", () => {
    const first = composer(WEB), second = composer(SHOP), overview = composer(WEB);
    const stopFirst = registerChipComposer("canvas", first);
    const stopSecond = registerChipComposer("canvas", second);
    const stopOverview = registerChipComposer("overview", overview);
    expect(chipComposer("canvas")).toBe(second);
    expect(chipComposer("overview")).toBe(overview);
    expect(chipComposer("home")).toBeNull();
    stopSecond();
    expect(chipComposer("canvas")).toBe(first);
    stopFirst(); stopOverview();
    expect(chipComposer("canvas")).toBeNull();
  });

  it("tells listeners when a composer comes or goes", () => {
    const listener = vi.fn();
    const stop = onCanvasChips(listener);
    const leave = registerChipComposer("home", composer(WEB));
    leave();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("judges a drag against the composer it is asked for", () => {
    const into: CanvasChipComposer = { root: SHOP, canTake: () => null };
    expect(drag().judge(into)).toBe("Only canvases in checkout-app can go in this message.");
  });
});
