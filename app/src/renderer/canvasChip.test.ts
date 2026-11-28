import { describe, expect, it, vi } from "vitest";
import type { Anchor } from "../main/conversation/types";
import type { CanvasRow, FolderEntry, GitInfo } from "../main/view";
import type { FieldSegment } from "./anchorField";
import { ADD_TO_MESSAGE_CAPTURING, ANCHOR_LIMIT_TEXT } from "./canvasPicker";
import { canvasUnlistedText } from "./canvasConversation";
import {
  CANVAS_CHIP_COMPOSING, CANVAS_CHIP_NO_COMPOSER, CANVAS_CHIP_NO_ID, CANVAS_CHIP_PICKING, CANVAS_CHIP_SHARED_ID, CANVAS_CHIP_UNREADABLE,
  canvasChipTarget, canvasRowIdReason, chipFieldTakes, homeRootChange, refreshCanvasSegments, type CanvasChipComposer, type CanvasChipScreen,
} from "./canvasChip";

const row = (path: string, id?: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, url: `u-${path}`, ...(id === undefined ? {} : { id }), ...extra });
const git = (common: string, extra: Partial<GitInfo>): GitInfo => ({ common, main: "/code/doan-web", worktrees: [], ...extra });
const list = (path: string, canvases: CanvasRow[], info?: GitInfo): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases, ...(info ? { git: info } : {}) });

const WEB = "/code/doan-web", FEAT = "/code/doan-web-feat", DETACHED = "/code/doan-web-wt2", SHOP = "/code/checkout-app";
const checkout = row(".doan/canvases/checkout-flow.html", "checkout");
const buttons = row(".doan/ds/buttons.html", "buttons");
const noId = row(".doan/canvases/no-id.html");
const emptyId = row(".doan/canvases/empty-id.html", "");
const twinA = row(".doan/canvases/twin-a.html", "twin"), twinB = row(".doan/canvases/sub/twin-b.html", "twin");
const broken = row(".doan/canvases/broken.html", "broken", { error: { code: "meta_invalid", message: "bad" } });
const webCanvases = [checkout, buttons, noId, emptyId, twinA, twinB, broken];
const common = "/code/doan-web/.git";
const entries: FolderEntry[] = [
  list(WEB, webCanvases, git(common, { branch: "develop" })),
  list(FEAT, [row(".doan/canvases/checkout-flow.html", "checkout")], git(common, { branch: "feat/orders" })),
  list(DETACHED, [checkout], git(common, { detached: "abcdef1234" })),
  list(SHOP, [row(".doan/canvases/cart.html", "cart")], { common: "/code/checkout-app/.git", main: SHOP, branch: "main", worktrees: [] }),
  { path: "/code/pricing", kind: "loading" },
  { path: "/code/broken-project", kind: "error", message: "bad config", config: "/code/broken-project/.doan/config.json" },
];
const composer = (root: string, reason: string | null = null): CanvasChipComposer & { canTake: ReturnType<typeof vi.fn> } => ({ root, canTake: vi.fn(() => reason) });
const target = (root: string, canvas: CanvasRow, screen: CanvasChipScreen, into: CanvasChipComposer | null) => canvasChipTarget({ root, canvas, entries }, screen, into);

describe("canvasChipTarget", () => {
  it("takes a canvas of the composer's root on the canvas panel, the Overview and Home, asking the composer last", () => {
    for (const screen of ["canvas", "overview", "home"] as const) {
      const into = composer(WEB);
      expect(target(WEB, checkout, screen, into)).toBeNull();
      expect(into.canTake).toHaveBeenCalledWith({ canvas: { path: ".doan/canvases/checkout-flow.html", id: "checkout" } });
    }
  });

  it("takes a design-system canvas", () => {
    const into = composer(WEB);
    expect(target(WEB, buttons, "canvas", into)).toBeNull();
    expect(into.canTake).toHaveBeenCalledWith({ canvas: { path: ".doan/ds/buttons.html", id: "buttons" } });
  });

  it("refuses another project's canvas, naming the composer's project", () => {
    expect(target(SHOP, row(".doan/canvases/cart.html", "cart"), "canvas", composer(WEB))).toBe("Only canvases in doan-web can go in this message.");
    expect(target(WEB, checkout, "home", composer(SHOP))).toBe("Only canvases in checkout-app can go in this message.");
  });

  it("refuses another worktree of the same project, naming the composer's branch, else its folder", () => {
    expect(target(FEAT, row(".doan/canvases/checkout-flow.html", "checkout"), "home", composer(WEB))).toBe("Only canvases on develop can go in this message.");
    expect(target(WEB, checkout, "canvas", composer(FEAT))).toBe("Only canvases on feat/orders can go in this message.");
    expect(target(WEB, checkout, "overview", composer(DETACHED))).toBe("Only canvases on doan-web-wt2 can go in this message.");
  });

  it("refuses a row that cannot be read", () => {
    expect(target(WEB, broken, "canvas", composer(WEB))).toBe(CANVAS_CHIP_UNREADABLE);
    expect(CANVAS_CHIP_UNREADABLE).toBe("Can’t read this canvas.");
  });

  it("refuses a row without an id, with an empty id, or with an id another row shares", () => {
    expect(target(WEB, noId, "canvas", composer(WEB))).toBe(CANVAS_CHIP_NO_ID);
    expect(target(WEB, emptyId, "canvas", composer(WEB))).toBe(CANVAS_CHIP_NO_ID);
    expect(target(WEB, twinA, "canvas", composer(WEB))).toBe(CANVAS_CHIP_SHARED_ID);
    expect(target(WEB, twinB, "home", composer(WEB))).toBe(CANVAS_CHIP_SHARED_ID);
  });

  it("refuses while the root's list is being read or has a problem, naming the project", () => {
    expect(target("/code/pricing", checkout, "home", composer("/code/pricing"))).toBe("pricing is still being read.");
    expect(target("/code/broken-project", checkout, "home", composer("/code/broken-project"))).toBe("broken-project isn’t available. Fix it from its menu in the sidebar.");
    expect(target("/code/unknown", checkout, "home", composer("/code/unknown"))).toBe("unknown isn’t available. Fix it from its menu in the sidebar.");
  });

  it("passes the composer's own reason on: read-only, composing, picking, the place limit", () => {
    for (const reason of [canvasUnlistedText("doan-web"), CANVAS_CHIP_COMPOSING, CANVAS_CHIP_PICKING, ADD_TO_MESSAGE_CAPTURING, ANCHOR_LIMIT_TEXT])
      expect(target(WEB, checkout, "canvas", composer(WEB, reason))).toBe(reason);
  });

  it("refuses on a screen without a composer and in the prototype window", () => {
    expect(target(WEB, checkout, "noComposer", composer(WEB))).toBe(CANVAS_CHIP_NO_COMPOSER);
    expect(target(WEB, checkout, "prototype", composer(WEB))).toBe(CANVAS_CHIP_NO_COMPOSER);
    expect(target(WEB, checkout, "home", null)).toBe(CANVAS_CHIP_NO_COMPOSER);
    expect(CANVAS_CHIP_NO_COMPOSER).toBe("Open Home, the Overview or a canvas to add this to a message.");
  });

  it("names the root first, and asks the composer only for a row that could go in", () => {
    const into = composer(SHOP);
    expect(target(WEB, broken, "canvas", into)).toBe("Only canvases in checkout-app can go in this message.");
    expect(target(WEB, noId, "canvas", into)).toBe("Only canvases in checkout-app can go in this message.");
    const same = composer(WEB);
    for (const refused of [broken, noId, emptyId, twinA]) target(WEB, refused, "canvas", same);
    expect(same.canTake).not.toHaveBeenCalled();
  });
});

describe("canvasRowIdReason", () => {
  it("is null for an id only this row has", () => {
    expect(canvasRowIdReason(checkout, webCanvases)).toBeNull();
  });
  it("names a missing or empty id and a shared one", () => {
    expect(canvasRowIdReason(noId, webCanvases)).toBe(CANVAS_CHIP_NO_ID);
    expect(canvasRowIdReason(emptyId, webCanvases)).toBe(CANVAS_CHIP_NO_ID);
    expect(canvasRowIdReason(twinA, webCanvases)).toBe(CANVAS_CHIP_SHARED_ID);
    expect(CANVAS_CHIP_NO_ID).toBe("This canvas has no ID, so it can’t go in a message. Run doan check in a terminal to see why.");
    expect(CANVAS_CHIP_SHARED_ID).toBe("Another canvas has the same ID, so this one can’t go in a message. Run doan check in a terminal to find it.");
  });
  it("does not count two rows that both lack an id as sharing one", () => {
    expect(canvasRowIdReason(checkout, [checkout, noId, row("x.html"), row("y.html", ""), row("z.html", "")])).toBeNull();
  });
});

const chip = (anchor: Anchor): FieldSegment => ({ kind: "chip", anchor });
const text = (t: string): FieldSegment => ({ kind: "text", text: t });
const ref = (id: string, path = `.doan/canvases/${id}.html`): Anchor => ({ canvas: { path, id } });
const places = (n: number) => Array.from({ length: n }, (_, i) => chip({ frame: { id: `f${i}` } }));
const idle = { blocked: null, capturing: false, picking: false, composing: false, segments: [] as FieldSegment[] };

describe("chipFieldTakes", () => {
  it("takes a canvas chip into a field that takes input", () => {
    expect(chipFieldTakes(idle, ref("checkout"))).toBeNull();
  });
  it("gives the composer's own sentence while it takes no input", () => {
    expect(chipFieldTakes({ ...idle, blocked: canvasUnlistedText("doan-web") }, ref("checkout"))).toBe(canvasUnlistedText("doan-web"));
  });
  it("refuses during a capture, a pick and an IME composition", () => {
    expect(chipFieldTakes({ ...idle, capturing: true }, ref("checkout"))).toBe(ADD_TO_MESSAGE_CAPTURING);
    expect(chipFieldTakes({ ...idle, picking: true }, ref("checkout"))).toBe(CANVAS_CHIP_PICKING);
    expect(chipFieldTakes({ ...idle, composing: true }, ref("checkout"))).toBe(CANVAS_CHIP_COMPOSING);
  });
  it("counts the new canvas against 32 places, the prototype window's reserved chip included", () => {
    expect(chipFieldTakes({ ...idle, segments: places(31) }, ref("checkout"))).toBeNull();
    expect(chipFieldTakes({ ...idle, segments: places(32) }, ref("checkout"))).toBe(ANCHOR_LIMIT_TEXT);
    expect(chipFieldTakes({ ...idle, segments: places(31), reserved: [chip({ frame: { id: "playing" } })] }, ref("checkout"))).toBe(ANCHOR_LIMIT_TEXT);
  });
  it("lets a canvas already in a full field in again, whatever path its chip carries", () => {
    const full = [...places(31), chip(ref("checkout", ".doan/canvases/old-name.html"))];
    expect(chipFieldTakes({ ...idle, segments: full }, ref("checkout"))).toBeNull();
  });
});

describe("homeRootChange", () => {
  const segments = [text("Design an order history page. Follow "), chip(ref("checkout", ".doan/canvases/checkout-flow.html")), text(" for the layout and "), chip(ref("buttons", ".doan/ds/buttons.html")), text(" for actions.")];

  it("leaves the draft as it is when the root did not change", () => {
    const out = homeRootChange(segments, WEB, WEB, entries);
    expect(out.segments).toBe(segments);
    expect(out.notice).toBeNull();
  });

  it("turns another project's canvas chips into their names and says so once", () => {
    expect(homeRootChange(segments, WEB, SHOP, entries)).toEqual({
      segments: [text("Design an order history page. Follow checkout-flow for the layout and buttons for actions.")],
      notice: "2 canvas chips became plain text. Their canvases are in another project.",
    });
  });

  it("says it for one chip and for a worktree switch", () => {
    expect(homeRootChange([chip(ref("checkout"))], WEB, SHOP, entries).notice).toBe("1 canvas chip became plain text. Its canvas is in another project.");
    expect(homeRootChange([chip(ref("checkout")), chip(ref("a"))], WEB, FEAT, entries).notice).toBe("2 canvas chips became plain text. Their canvases are on another worktree.");
    expect(homeRootChange([chip(ref("checkout"))], FEAT, WEB, entries).notice).toBe("1 canvas chip became plain text. Its canvas is on another worktree.");
  });

  it("says nothing when the draft has no canvas chips, and keeps other chips and text", () => {
    const other = [text("Move "), chip({ frame: { id: "hero" } })];
    expect(homeRootChange(other, WEB, SHOP, entries)).toEqual({ segments: other, notice: null });
  });

  it("does not bring chips back when the root switches back", () => {
    const away = homeRootChange(segments, WEB, SHOP, entries);
    const back = homeRootChange(away.segments, SHOP, WEB, entries);
    expect(back.segments).toEqual(away.segments);
    expect(back.notice).toBeNull();
  });
});

describe("refreshCanvasSegments", () => {
  const rows = [row(".doan/canvases/flows/checkout-flow.html", "checkout"), twinA, twinB];

  it("takes each canvas chip's path from the list by its id", () => {
    const segments = [text("Follow "), chip(ref("checkout", ".doan/canvases/checkout-flow.html"))];
    expect(refreshCanvasSegments(segments, rows)).toEqual([text("Follow "), chip(ref("checkout", ".doan/canvases/flows/checkout-flow.html"))]);
  });

  it("returns the same segments when no path changed, and leaves missing and shared ids to send and press", () => {
    const segments = [chip(ref("checkout", ".doan/canvases/flows/checkout-flow.html")), chip(ref("gone")), chip(ref("twin", ".doan/canvases/twin-a.html")), chip({ frame: { id: "hero" } }), text("x")];
    expect(refreshCanvasSegments(segments, rows)).toBe(segments);
  });
});
